// Criterios editoriales mensuales de Afuera; las fuentes sustentan el contexto
// turístico, no un pronóstico ni la operación de una excursión concreta.
const norte = {
  meses: [4, 5, 6, 7, 8, 9, 10, 11],
  periodo: 'abril a noviembre',
  favorable: 'Fuera del verano suele haber menos lluvias para recorrer la quebrada. En invierno puede hacer frío y hay amplitud térmica: llevá abrigo, agua y protección solar.',
  desfavorable: 'El verano concentra las lluvias de la región, que pueden afectar caminos y paseos al aire libre. Llevá agua y protección solar y consultá las condiciones locales antes de salir.',
  fuentes: [{ titulo: 'La Ruta Natural · Valles, Quebradas y Yungas', url: 'https://larutanatural.gob.ar/es/rutas/10/valles-quebradas-y-yungas' }],
}

export const temporadas = {
  'senderos-del-fitz-roy': {
    meses: [10, 11, 12, 1, 2, 3], periodo: 'octubre a marzo',
    favorable: 'Es la época sugerida para visitar El Chaltén y caminar sus senderos. El clima de montaña puede cambiar rápidamente: llevá abrigo y consultá el estado del sendero antes de salir.',
    desfavorable: 'Fuera de la época sugerida, el frío, la nieve o el hielo pueden dificultar la caminata. Consultá el estado de los senderos y las recomendaciones del parque antes de salir.',
    fuentes: [{ titulo: 'Visit Argentina · El Chaltén', url: 'https://www.argentina.travel/actividades/el-chalten' }],
  },
  'vinedos-de-mendoza': {
    meses: [3, 4, 9, 10, 11], periodo: 'marzo y abril; septiembre a noviembre',
    favorable: 'El otoño y la primavera suelen ofrecer temperaturas más agradables para recorrer viñedos. Marzo está asociado a la vendimia; la cosecha y las actividades varían según la bodega y el año, y no se incluyen eventos de vendimia por elegir esta fecha.',
    desfavorable: 'Para el recorrido al aire libre, el verano puede resultar caluroso y el invierno frío. Afuera prioriza marzo-abril y septiembre-noviembre; esto no implica que las bodegas cierren el resto del año. La vendimia se concentra hacia fines del verano, especialmente en marzo.',
    fuentes: [
      { titulo: 'Visit Argentina · Mendoza', url: 'https://www.argentina.travel/destinos/mendoza' },
      { titulo: 'Turismo Argentina · Celebrar la vendimia', url: 'https://www.argentina.gob.ar/jefatura/turismo/viaja-por-argentina/celebrar-la-vendimia-en-mendoza' },
    ],
  },
  'colores-de-purmamarca': { ...norte },
  'quebrada-de-las-conchas': { ...norte },
  'historias-de-buenos-aires': {
    meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], periodo: 'todo el año',
    consejos: {
      verano: 'En verano el calor suele ser húmedo: llevá agua, protección solar y ropa liviana para caminar.',
      otono: 'En otoño las mañanas y las noches pueden ser frescas y puede llover: llevá abrigo liviano e impermeable.',
      invierno: 'En invierno llevá abrigo, especialmente para las primeras y últimas horas del día.',
      primavera: 'En primavera suele haber temperaturas agradables, con mañanas frescas y posibles lluvias: llevá una capa liviana e impermeable.',
    },
    fuentes: [{ titulo: 'Turismo de Buenos Aires · Clima', url: 'https://turismo.buenosaires.gob.ar/es/article/clima?page=1' }],
  },
  'ballenas-en-puerto-madryn': {
    meses: [6, 7, 8, 9, 10, 11, 12], periodo: 'junio a diciembre',
    favorable: 'Es la temporada habitual de ballenas en Puerto Pirámides. Los avistajes embarcados suelen comenzar a mediados de junio; las fechas efectivas varían. La presencia de fauna y la operación de la excursión dependen de condiciones naturales y del prestador, y no están garantizadas.',
    desfavorable: 'Fuera de junio a diciembre no se espera avistaje de ballenas y no se garantiza la operación de la excursión. Elegir esta fecha permite registrar la reserva, pero no confirma que la salida pueda realizarse. Consultá al prestador antes de organizar el viaje.',
    fuentes: [{ titulo: 'Municipalidad de Puerto Pirámides · Avistaje', url: 'https://www.puertopiramides.gov.ar/avistaje/' }],
  },
}
