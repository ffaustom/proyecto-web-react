import { validarFechaVisita, hoyArgentina } from '../../../lib/fechas.js'

export function validarReserva(formData, hoy = hoyArgentina(), { permitirFechaAusente = false, permitirFechaPasada = false } = {}) {
  const texto = (campo) => {
    const valor = formData.get(campo)
    return typeof valor === 'string' ? valor.trim() : ''
  }
  const values = {
    nombre_comprador: texto('nombre_comprador'),
    email: texto('email'),
    cantidad_personas: texto('cantidad_personas'),
    fecha_visita: texto('fecha_visita'),
  }
  const errors = {}
  // Solo la ausencia del campo identifica una solicitud del formulario anterior.
  // Un campo enviado vacío, malformado o como archivo nunca usa esta excepción.
  const fechaAntigua = permitirFechaAusente && !formData.has('fecha_visita')
  // La excepción de fecha pasada es solo para recuperar un checkout existente.
  // La RPC exige hoy/futuro antes de crear una reserva o reclamar un nuevo POST.
  const errorFecha = fechaAntigua ? '' : validarFechaVisita(values.fecha_visita, permitirFechaPasada ? '0001-01-01' : hoy)
  if (errorFecha) errors.fecha_visita = errorFecha
  if (!values.nombre_comprador || values.nombre_comprador.length > 200) {
    errors.nombre_comprador = 'Ingresá tu nombre (hasta 200 caracteres).'
  }
  if (values.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Ingresá un email válido.'
  }
  const cantidad = Number(values.cantidad_personas)
  if (!/^\d+$/.test(values.cantidad_personas) || !Number.isSafeInteger(cantidad) || cantidad <= 0 || cantidad > 2147483647) {
    errors.cantidad_personas = 'Ingresá una cantidad entera mayor que cero y hasta 2147483647.'
  }
  return { values, errors, cantidad }
}
