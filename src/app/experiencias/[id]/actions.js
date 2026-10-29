'use server'

import { crearClienteSupabase } from '../../../lib/supabase/server'
import { validarReserva } from './validacion'

export async function crearReserva(experienciaId, _previousState, formData) {
  const { values, errors, cantidad } = validarReserva(formData)
  if (Object.keys(errors).length) {
    return { values, errors, error: 'Revisá los campos indicados.' }
  }

  try {
    const supabase = crearClienteSupabase()
    const { data: experiencia, error: consultaError } = await supabase
      .from('experiencias').select('id,precio').eq('id', experienciaId).eq('activo', true).maybeSingle()
    if (consultaError) {
      return { values, errors: {}, error: 'No pudimos consultar el precio. Intentá nuevamente más tarde.' }
    }
    if (!experiencia) {
      return { values, errors: {}, error: 'Esta experiencia ya no está disponible para reservar.' }
    }

    // numeric(12,2): operar en centavos evita acumular errores de punto flotante.
    const precioCentavos = Math.round(Number(experiencia.precio) * 100)
    const totalCentavos = precioCentavos * cantidad
    if (!Number.isSafeInteger(totalCentavos) || totalCentavos < 0 || totalCentavos > 999999999999) {
      return { values, errors: { cantidad_personas: 'La cantidad supera el importe máximo permitido.' }, error: 'Revisá la cantidad de personas.' }
    }

    const { error } = await supabase.from('reservas').insert({
      experiencia_id: experiencia.id,
      nombre_comprador: values.nombre_comprador,
      email: values.email,
      cantidad_personas: cantidad,
      total: (totalCentavos / 100).toFixed(2),
      estado: 'pendiente',
    })
    if (error) {
      return { values, errors: {}, error: 'No pudimos guardar la reserva. El precio o la disponibilidad pueden haber cambiado. Actualizá la página e intentá nuevamente.' }
    }
    return { success: true, values: {}, errors: {}, error: '' }
  } catch {
    return { values, errors: {}, error: 'Se interrumpió la conexión y no pudimos confirmar la reserva. Puede haberse guardado; evitá reenviarla de inmediato.' }
  }
}
