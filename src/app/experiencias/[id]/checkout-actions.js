'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { validarReserva } from './validacion'
import { prepararCheckout, ErrorCheckout } from '../../../lib/mercado-pago/checkout'
import { verificarConfiguracionMercadoPago } from '../../../lib/mercado-pago/server'
import { checkoutHabilitado, verificarIntentoCheckout, nombreCookieCheckout } from '../../../lib/mercado-pago/intento'

// Esta primera petición SOLO establece la cookie. No crea reservas ni preferencias.
// El candidato ya está firmado en la página: un doble clic envía el mismo UUID.
export async function establecerIntentoCheckout(experienciaId, candidato, _previousState) {
  if (!checkoutHabilitado()) return { error: 'El checkout de prueba todavía no está habilitado.' }
  try {
    const jar = await cookies()
    let token = candidato
    const existente = jar.get(nombreCookieCheckout(experienciaId))?.value
    if (existente) {
      try { verificarIntentoCheckout(existente, experienciaId); token = existente } catch { /* No adoptar una cookie inválida. */ }
    }
    const intento = verificarIntentoCheckout(token, experienciaId)
    jar.set(nombreCookieCheckout(experienciaId), token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
      maxAge: Math.max(1, Math.floor((intento.vence - Date.now()) / 1000)),
    })
  } catch {
    return { error: 'No pudimos preparar tu sesión de reserva. Recargá esta página e intentá nuevamente.' }
  }
  // Solo después de recibir la cookie se mostrará el formulario de checkout.
  redirect(`/experiencias/${experienciaId}`)
}

export async function iniciarCheckout(experienciaId, token, _previousState, formData) {
  // La RPC decide si es una creación nueva (fecha vigente) o solo una recuperación.
  const { values, errors, cantidad } = validarReserva(formData, undefined, { permitirFechaPasada: true })
  if (Object.keys(errors).length) return { values, errors, error: 'Revisá los campos indicados.' }
  if (!checkoutHabilitado()) return { values, errors: {}, error: 'El checkout de prueba todavía no está habilitado.' }
  let destino
  try {
    const intento = verificarIntentoCheckout(token, experienciaId)
    verificarConfiguracionMercadoPago()
    const jar = await cookies()
    if (jar.get(nombreCookieCheckout(experienciaId))?.value !== token) {
      return { values, errors: {}, error: 'No encontramos el intento preparado en este navegador. Volvé a la experiencia antes de enviar la reserva; no se creó una reserva nueva.' }
    }
    destino = await prepararCheckout(intento.id, experienciaId, values, cantidad)
  } catch (error) {
    return { values, errors: {}, error: error instanceof ErrorCheckout ? error.message
      : 'No pudimos iniciar el checkout. Actualizá la página si tu sesión venció; si ya enviaste la reserva, reintentá con los mismos datos.',
    reservaCreada: error instanceof ErrorCheckout && error.reservaCreada,
    requiereRevision: error instanceof ErrorCheckout && error.requiereRevision }
  }
  redirect(destino)
}

export async function empezarOtraReserva(experienciaId, token) {
  verificarIntentoCheckout(token, experienciaId)
  const jar = await cookies()
  jar.delete(nombreCookieCheckout(experienciaId))
  redirect(`/experiencias/${experienciaId}`)
}
