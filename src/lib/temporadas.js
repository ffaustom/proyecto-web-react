import { temporadas } from '../data/temporadas.js'
import { esFechaReal } from './fechas.js'

export function recomendarFecha(experienciaId, fecha) {
  if (!esFechaReal(fecha)) return null
  const regla = temporadas[experienciaId]
  if (!regla) return { recomendable: null, motivo: 'Todavía no hay una orientación estacional para esta experiencia.', fuentes: [] }
  const mes = Number(fecha.slice(5, 7))
  const recomendable = regla.meses.includes(mes)
  // Consejos por estaciones meteorológicas: no se usan límites astronómicos.
  const estacion = mes === 12 || mes <= 2 ? 'verano' : mes <= 5 ? 'otono' : mes <= 8 ? 'invierno' : 'primavera'
  return {
    recomendable,
    motivo: regla.consejos ? regla.consejos[estacion] : recomendable ? regla.favorable : regla.desfavorable,
    periodo: regla.periodo,
    fuentes: regla.fuentes,
  }
}
