import 'server-only'

import { crearClienteSupabasePrivado } from '../supabase/service-server'
import { validarFechaVisita } from '../fechas.js'

const endpoint = 'https://api.mercadopago.com/checkout/preferences'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function urlHttps(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error()
    return url
  } catch {
    throw new Error('Las URLs de Mercado Pago deben ser HTTPS válidas, sin credenciales ni fragmentos.')
  }
}

function configuracion() {
  // Esta etapa no habilita checkout en Production, ni siquiera por accidente.
  if (process.env.MP_TEST_MODE !== 'true' || process.env.VERCEL_ENV === 'production') {
    throw new Error('La preparación de checkout solo está habilitada en modo de prueba fuera de Production.')
  }
  const token = process.env.MP_ACCESS_TOKEN?.trim()
  if (!token) throw new Error('Falta configurar MP_ACCESS_TOKEN en el servidor.')
  const base = urlHttps(process.env.APP_URL)
  if (base.pathname !== '/' || base.search) throw new Error('APP_URL debe contener únicamente el origen HTTPS del sitio.')
  const retorno = new URL('/pago/resultado', base)
  const back_urls = Object.fromEntries(['success', 'pending', 'failure'].map(estado => {
    const url = new URL(retorno)
    url.searchParams.set('resultado', estado)
    return [estado, url.href]
  }))
  const notification_url = urlHttps(process.env.MP_NOTIFICATION_URL || new URL('/api/mercado-pago/webhook', base).href).href
  return { token, back_urls, notification_url }
}

function totalEnCentavos(total) {
  // numeric(12,2) puede llegar desde PostgREST como número o texto decimal.
  const texto = String(total)
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(texto)) throw new Error('El importe persistido de la reserva no es válido.')
  const [entero, decimal = ''] = texto.split('.')
  const centavos = Number(entero) * 100 + Number(decimal.padEnd(2, '0'))
  if (!Number.isSafeInteger(centavos) || centavos <= 0 || centavos > 999999999999) {
    throw new Error('La reserva debe tener un importe positivo válido para iniciar un checkout.')
  }
  return centavos
}

function checkoutUrl(value) {
  const url = urlHttps(value)
  if (!['www.mercadopago.com.ar', 'www.mercadopago.com', 'mercadopago.com.ar', 'mercadopago.com'].includes(url.hostname) || url.port) {
    throw new Error('Mercado Pago devolvió una URL de checkout inválida.')
  }
  return url.href
}

export function verificarConfiguracionMercadoPago() {
  configuracion()
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Falta configurar el acceso privado a Supabase.')
  }
}

async function leerReserva(reservaId) {
  if (typeof reservaId !== 'string' || !uuid.test(reservaId)) throw new Error('El UUID de la reserva no es válido.')
  const supabase = crearClienteSupabasePrivado()
  try {
    const { data, error } = await supabase.from('reservas')
      .select('id,experiencia_id,cantidad_personas,total,estado,fecha_visita,mercado_pago_preference_id')
      .eq('id', reservaId).maybeSingle()
    if (error || !data || data.id !== reservaId) throw new Error()
    return data
  } catch {
    throw new Error('No se pudo consultar la reserva y su experiencia en Supabase.')
  }
}

// Helper interno de servidor, NO Server Action ni endpoint público.
// El llamador debe autorizar el UUID y reclamar durablemente el único POST.
// Solo lee Supabase y crea una preferencia: no cobra, no actualiza ni confirma reservas.
export async function crearPreferenciaParaReserva(reservaId) {
  if (typeof reservaId !== 'string' || !uuid.test(reservaId)) throw new Error('El UUID de la reserva no es válido.')
  const config = configuracion()
  const supabase = crearClienteSupabasePrivado()
  const reserva = await leerReserva(reservaId)
  let experiencia
  try {
    const catalogo = await supabase.from('experiencias').select('id,titulo,activo')
      .eq('id', reserva.experiencia_id).maybeSingle()
    if (catalogo.error || !catalogo.data) throw new Error()
    experiencia = catalogo.data
  } catch {
    // No propagar errores del proveedor que puedan incluir datos privados.
    throw new Error('No se pudo consultar la reserva y su experiencia en Supabase.')
  }
  if (reserva.id !== reservaId || reserva.estado !== 'pendiente') throw new Error('La reserva no está pendiente de pago.')
  if (reserva.mercado_pago_preference_id) throw new Error('La reserva ya tiene una preferencia asociada; no se creará otra.')
  if (validarFechaVisita(reserva.fecha_visita)) throw new Error('La reserva necesita una fecha de visita vigente para iniciar el checkout.')
  if (!Number.isInteger(reserva.cantidad_personas) || reserva.cantidad_personas <= 0 || reserva.cantidad_personas > 2147483647) {
    throw new Error('La cantidad persistida de personas no es válida.')
  }
  if (experiencia.activo !== true || typeof experiencia.titulo !== 'string' || !experiencia.titulo.trim()) {
    throw new Error('La experiencia no está disponible para iniciar el checkout.')
  }
  const centavos = totalEnCentavos(reserva.total)
  // Un ítem por el total contratado: evita dividir/redondear un precio histórico.
  const body = {
    items: [{ id: reserva.experiencia_id, title: experiencia.titulo, quantity: 1, currency_id: 'ARS', unit_price: centavos / 100 }],
    external_reference: reserva.id,
    back_urls: config.back_urls,
    notification_url: config.notification_url,
    auto_return: 'approved',
  }
  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    // No reintentar automáticamente un POST: puede haberse creado la preferencia.
    throw new Error('No se pudo confirmar la creación de la preferencia. Antes de reintentar, verificar si Mercado Pago la creó.')
  }
  if (!response.ok) {
    const error = new Error(`Mercado Pago rechazó la creación de la preferencia (HTTP ${response.status}).`)
    error.rechazoDefinitivo = [400, 401, 403, 422, 429].includes(response.status)
    throw error
  }
  let data
  try {
    data = await response.json()
  } catch {
    throw new Error('Mercado Pago devolvió una respuesta inválida. Verificar la preferencia antes de reintentar.')
  }
  if (!data || typeof data.id !== 'string' || !data.id.trim() || data.external_reference !== reserva.id) {
    throw new Error('Mercado Pago devolvió una preferencia inválida. Verificar antes de reintentar.')
  }
  return { id: data.id, init_point: checkoutUrl(data.init_point), external_reference: reserva.id }
}

// Recupera un POST incierto o una preferencia ya guardada; nunca crea otra.
export async function recuperarPreferenciaParaReserva(reservaId, preferenciaId = null) {
  const config = configuracion()
  const reserva = await leerReserva(reservaId)
  // Solo recupera una preferencia que ya existe; el cambio de día no crea otra.
  if (reserva.estado !== 'pendiente' || validarFechaVisita(reserva.fecha_visita, '0001-01-01')) throw new Error('La reserva no admite checkout.')
  if (reserva.mercado_pago_preference_id && preferenciaId !== reserva.mercado_pago_preference_id) {
    throw new Error('La preferencia no coincide con la reserva.')
  }
  async function consultar(url) {
    try {
      const response = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${config.token}` },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new Error()
      return await response.json()
    } catch {
      throw new Error('No se pudo verificar la preferencia existente en Mercado Pago.')
    }
  }
  if (!preferenciaId) {
    const url = new URL(`${endpoint}/search`)
    url.searchParams.set('external_reference', reserva.id)
    const search = await consultar(url.href)
    if (!Array.isArray(search?.elements) || !Number.isInteger(search.total)) throw new Error('Respuesta de búsqueda inválida.')
    if (search.total === 0 && search.elements.length === 0) return null
    if (search.total !== 1 || search.elements.length !== 1) throw new Error('La reserva requiere revisar sus preferencias.')
    preferenciaId = search.elements[0].id
  }
  if (typeof preferenciaId !== 'string' || !/^[\w-]{1,200}$/.test(preferenciaId)) throw new Error('Identificador de preferencia inválido.')
  const data = await consultar(`${endpoint}/${encodeURIComponent(preferenciaId)}`)
  if (data?.id !== preferenciaId || data.external_reference !== reserva.id || data.preference_expired === true
      || (data.expires === true && (!data.expiration_date_to || !Number.isFinite(Date.parse(data.expiration_date_to)) || Date.parse(data.expiration_date_to) <= Date.now()))
      || !Array.isArray(data.items) || data.items.length !== 1 || data.items[0].quantity !== 1
      || data.items[0].currency_id !== 'ARS' || totalEnCentavos(data.items[0].unit_price) !== totalEnCentavos(reserva.total)) {
    throw new Error('La preferencia existente no coincide con el importe y la reserva.')
  }
  return { id: data.id, init_point: checkoutUrl(data.init_point), external_reference: reserva.id }
}
