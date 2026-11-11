import 'server-only'

import { crearClienteSupabasePrivado } from '../supabase/service-server'
import { crearPreferenciaParaReserva, recuperarPreferenciaParaReserva } from './server'

export class ErrorCheckout extends Error {
  constructor(message, reservaCreada = false, requiereRevision = false) {
    super(message)
    this.reservaCreada = reservaCreada
    this.requiereRevision = requiereRevision
  }
}

export async function prepararCheckout(id, experienciaId, values, cantidad) {
  const cliente = crearClienteSupabasePrivado()
  async function operar(operacion, extra = {}) {
    const { data, error } = await cliente.rpc('operar_checkout', { p_operacion: operacion, p_id: id, ...extra })
    if (error?.message === 'CHECKOUT_FECHA_PASADA') throw new ErrorCheckout('Para iniciar un checkout nuevo elegí hoy o una fecha posterior. Solo se puede recuperar una preferencia que ya exista con la fecha anterior.', true)
    if (error) throw new ErrorCheckout(error.message === 'CHECKOUT_DATOS_DISTINTOS'
      ? 'Este intento ya tiene una reserva. Reintentá con los mismos datos o empezá otra reserva.'
      : 'No pudimos preparar el checkout. Reintentá desde esta misma página; no se iniciará un cobro.', true)
    if (!data || data.id !== id) throw new ErrorCheckout('No pudimos verificar la reserva. Reintentá con el mismo formulario.', true)
    return data
  }
  const reserva = await operar('preparar', {
    p_experiencia_id: experienciaId, p_nombre: values.nombre_comprador, p_email: values.email,
    p_cantidad: cantidad, p_fecha: values.fecha_visita,
  })
  let preferencia
  try {
    if (reserva.crear) {
      try {
        preferencia = await crearPreferenciaParaReserva(id)
      } catch (error) {
        if (error.rechazoDefinitivo === true) {
          try { await operar('liberar') } catch {
            throw new ErrorCheckout(`Mercado Pago rechazó el inicio del checkout y no pudimos habilitar el reintento. Tu reserva se conserva y requiere revisión del responsable del proyecto. Referencia: ${id}`, true, true)
          }
          throw new ErrorCheckout('Mercado Pago rechazó el inicio del checkout. Tu reserva se conserva; reintentá desde este mismo formulario. Si vuelve a fallar, avisá al responsable del proyecto.', true)
        }
        throw error
      }
    } else {
      preferencia = await recuperarPreferenciaParaReserva(id, reserva.preferencia_id)
      if (!preferencia) throw new ErrorCheckout(`Tu reserva se conserva, pero no podemos determinar si Mercado Pago recibió la solicitud. No crearemos otra preferencia automáticamente. Requiere revisión del responsable del proyecto si no se recupera al consultar de nuevo aquí. No inicies otra reserva para reintentar. Referencia: ${id}`, true, true)
    }
  } catch (error) {
    if (error instanceof ErrorCheckout) throw error
    throw new ErrorCheckout(`Tu reserva se conserva. No pudimos confirmar el checkout. Consultá de nuevo desde este formulario; si no se recupera, requiere revisión del responsable del proyecto. No inicies otra reserva para reintentar. Referencia: ${id}`, true, true)
  }
  // Si este guardado falla NO se redirige: el reintento recupera la preferencia.
  await operar('guardar', { p_preferencia: preferencia.id })
  return preferencia.init_point
}
