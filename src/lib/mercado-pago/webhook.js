import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { crearClienteSupabasePrivado } from '../supabase/service-server'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const estados = new Set(['approved', 'pending', 'in_process', 'authorized', 'rejected', 'cancelled'])

function idNumerico(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null
  const texto = String(value)
  return /^[1-9]\d{0,19}$/.test(texto) ? texto : null
}

function centavos(value) {
  const texto = String(value)
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(texto)) return null
  const [entero, decimal = ''] = texto.split('.')
  const total = Number(entero) * 100 + Number(decimal.padEnd(2, '0'))
  return Number.isSafeInteger(total) && total > 0 && total <= 999999999999 ? total : null
}

// Payments usa IDs numéricos. No se toma el ID del body ni se normaliza el manifiesto.
// ts puede expresarse en segundos o milisegundos; el HMAC conserva el texto recibido.
export function verificarFirmaWebhook(request, secret, ahora = Date.now()) {
  const query = new URL(request.url).searchParams
  const id = query.get('data.id')
  const requestId = request.headers.get('x-request-id')
  const signature = request.headers.get('x-signature')
  if (query.getAll('data.id').length !== 1 || !idNumerico(id)
      || !requestId || !/^[\w-]{1,200}$/.test(requestId) || !signature || signature.length > 500) return null
  const partes = signature.split(',').map(parte => parte.trim().split('='))
  if (partes.length !== 2 || partes.some(parte => parte.length !== 2)
      || new Set(partes.map(([nombre]) => nombre)).size !== 2) return null
  const { ts, v1 } = Object.fromEntries(partes)
  if (!/^\d{10}(?:\d{3})?$/.test(ts ?? '') || !/^[a-fA-F0-9]{64}$/.test(v1 ?? '')) return null
  const instante = Number(ts) * (ts.length === 10 ? 1000 : 1)
  if (Math.abs(ahora - instante) > 300000) return null
  const esperado = createHmac('sha256', secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest()
  return timingSafeEqual(esperado, Buffer.from(v1, 'hex')) ? id : null
}

function respuesta(status) {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })
}

// Se registran solo códigos propios: nunca headers, cuerpo, token ni errores del proveedor.
function registrar(codigo) {
  console.warn('mercado_pago_webhook', codigo)
}

export async function recibirWebhook(request) {
  const secret = process.env.MP_WEBHOOK_SECRET
  const token = process.env.MP_ACCESS_TOKEN?.trim()
  const vendedor = idNumerico(process.env.MP_WEBHOOK_COLLECTOR_ID)
  if (!secret || secret === process.env.CHECKOUT_SIGNING_SECRET || !token || !vendedor
      || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.MP_TEST_MODE !== 'true' || process.env.VERCEL_ENV === 'production') {
    registrar('configuracion_incompleta')
    return respuesta(503)
  }
  const paymentId = verificarFirmaWebhook(request, secret)
  if (!paymentId) {
    registrar('firma_invalida')
    return respuesta(401)
  }
  const query = new URL(request.url).searchParams
  if (query.getAll('type').length !== 1 || query.get('type') !== 'payment') return respuesta(200)

  try {
    // Presupuesto compartido para responder antes de los 22 segundos de MP.
    const signal = AbortSignal.timeout(15000)
    async function consultar(ruta) {
      const response = await fetch(`https://api.mercadopago.com${ruta}`, {
        method: 'GET', headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store', redirect: 'error', signal,
      })
      if (!response.ok) throw new Error('API_NO_DISPONIBLE')
      return response.json()
    }
    const pago = await consultar(`/v1/payments/${paymentId}`)
    if (idNumerico(pago.id) !== paymentId || idNumerico(pago.collector_id) !== vendedor
        || typeof pago.external_reference !== 'string' || !uuid.test(pago.external_reference)
        || pago.currency_id !== 'ARS' || !centavos(pago.transaction_amount)
        || !Number.isFinite(Date.parse(pago.date_last_updated))
        || pago.order?.type !== 'mercadopago' || !idNumerico(pago.order?.id)) {
      registrar('pago_incompatible')
      return respuesta(200)
    }
    if (!estados.has(pago.status)) {
      // Reembolsos/contracargos requieren conciliación; nunca acreditan una reserva.
      registrar('estado_no_soportado')
      return respuesta(200)
    }
    // Un reembolso parcial puede conservar status=approved. No acredita el total.
    if (pago.status === 'approved' && !/^0(?:\.0{1,2})?$/.test(String(pago.transaction_amount_refunded))) {
      registrar('pago_con_reembolso_o_dato_ausente')
      return respuesta(200)
    }
    const cliente = crearClienteSupabasePrivado()
    const { data: reserva, error } = await cliente.from('reservas')
      .select('id,total,mercado_pago_preference_id').eq('id', pago.external_reference).abortSignal(signal).maybeSingle()
    if (error) throw new Error('BASE_NO_DISPONIBLE')
    if (!reserva) {
      registrar('reserva_inexistente')
      return respuesta(200)
    }
    if (reserva.id !== pago.external_reference || centavos(reserva.total) !== centavos(pago.transaction_amount)) {
      registrar('importe_o_referencia_incompatible')
      return respuesta(200)
    }
    // Una notificación puede adelantarse al guardado de la preferencia: pedir reintento.
    if (!reserva.mercado_pago_preference_id) throw new Error('PREFERENCIA_NO_DISPONIBLE')
    const orden = await consultar(`/merchant_orders/${idNumerico(pago.order.id)}`)
    if (idNumerico(orden.id) !== idNumerico(pago.order.id)
        || idNumerico(orden.collector?.id) !== vendedor
        || orden.external_reference !== reserva.id
        || orden.preference_id !== reserva.mercado_pago_preference_id) {
      registrar('orden_incompatible')
      return respuesta(200)
    }
    // La orden puede tardar en reflejar un pago recién creado. No perder ese aviso.
    if (!Array.isArray(orden.payments) || !orden.payments.some(item => idNumerico(item.id) === paymentId)) {
      throw new Error('PAGO_AUN_NO_ASOCIADO')
    }
    const resultado = await cliente.rpc('registrar_pago_verificado', {
      p_reserva_id: reserva.id, p_preferencia: orden.preference_id, p_payment_id: paymentId,
      p_estado: pago.status, p_importe: pago.transaction_amount, p_moneda: pago.currency_id,
      p_actualizado: pago.date_last_updated,
    }).abortSignal(signal)
    if (resultado.error || !['aplicado', 'duplicado', 'ignorado'].includes(resultado.data)) {
      throw new Error('ACTUALIZACION_NO_CONFIRMADA')
    }
    return respuesta(200)
  } catch {
    // No acusar recibo hasta persistir; MP puede volver a entregar la notificación.
    registrar('procesamiento_reintentable')
    return respuesta(503)
  }
}
