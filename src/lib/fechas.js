const formatoArgentina = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function hoyArgentina(instante = new Date()) {
  const partes = Object.fromEntries(formatoArgentina.formatToParts(instante).map(({ type, value }) => [type, value]))
  return `${partes.year}-${partes.month}-${partes.day}`
}

// Fechas de calendario, sin convertir la visita a un instante UTC.
export function esFechaReal(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false
  const [anio, mes, dia] = fecha.split('-').map(Number)
  if (anio < 1 || mes < 1 || mes > 12 || dia < 1) return false
  const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0)
  return dia <= [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1]
}

export function validarFechaVisita(fecha, hoy = hoyArgentina()) {
  if (!esFechaReal(fecha)) return 'Elegí una fecha de visita válida.'
  if (fecha < hoy) return 'Elegí hoy o una fecha posterior, según la hora de Argentina.'
  return ''
}
