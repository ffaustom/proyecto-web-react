import 'server-only'

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

function clave() {
  const value = process.env.CHECKOUT_SIGNING_SECRET
  if (!value || Buffer.byteLength(value) < 32) throw new Error('Falta configurar la firma privada de checkout.')
  return value
}

export function checkoutHabilitado() {
  if (process.env.MP_CHECKOUT_ENABLED !== 'true' || process.env.MP_TEST_MODE !== 'true'
      || process.env.VERCEL_ENV === 'production') return false
  const obligatorias = ['MP_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'APP_URL']
  if (!obligatorias.every(nombre => process.env[nombre]?.trim())) return false
  try {
    clave()
    const url = new URL(process.env.APP_URL)
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
  } catch {
    return false
  }
}

export function nombreCookieCheckout(experienciaId) {
  if (!/^[a-z0-9-]{1,100}$/.test(experienciaId)) throw new Error('Experiencia inválida.')
  return `afuera_checkout_${experienciaId}`
}

export function crearIntentoCheckout(experienciaId) {
  nombreCookieCheckout(experienciaId)
  const payload = Buffer.from(JSON.stringify({ id: randomUUID(), experienciaId, vence: Date.now() + 86400000 })).toString('base64url')
  return `${payload}.${createHmac('sha256', clave()).update(payload).digest('base64url')}`
}

export function verificarIntentoCheckout(token, experienciaId) {
  if (typeof token !== 'string' || token.length > 1000) throw new Error('Intento inválido.')
  const partes = token.split('.')
  if (partes.length !== 2 || !/^[\w-]+$/.test(partes[1])) throw new Error('Intento inválido.')
  const esperado = createHmac('sha256', clave()).update(partes[0]).digest()
  const firma = Buffer.from(partes[1], 'base64url')
  if (firma.length !== esperado.length || !timingSafeEqual(esperado, firma)) throw new Error('Intento inválido.')
  const payload = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'))
  if (payload.experienciaId !== experienciaId || !/^[0-9a-f-]{36}$/.test(payload.id)
      || !Number.isSafeInteger(payload.vence) || payload.vence <= Date.now()) throw new Error('Intento vencido o inválido.')
  return payload
}
