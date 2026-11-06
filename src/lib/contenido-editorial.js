export const MAX_FOTOS_ADICIONALES = 5
export const MAX_TITULO_EDITORIAL = 120
export const MAX_RELATO_EDITORIAL = 8000

export function esRutaFotoLocal(src) {
  return typeof src === 'string'
    && /^\/(?:[a-z0-9_-]+\/)*[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp|avif)$/i.test(src)
    && !src.includes('..')
}

// También normaliza lecturas antiguas o incompletas, sin inventar fotografías.
export function normalizarGaleria(galeria, portada) {
  if (!Array.isArray(galeria)) return []
  const vistas = new Set([portada])
  return galeria.filter((foto) => {
    if (!foto || !esRutaFotoLocal(foto.src) || typeof foto.alt !== 'string' || !foto.alt.trim() || vistas.has(foto.src)) return false
    vistas.add(foto.src)
    return true
  }).slice(0, MAX_FOTOS_ADICIONALES).map(({ src, alt, pie }) => ({
    src, alt: alt.trim(), pie: typeof pie === 'string' ? pie.trim() : '',
  }))
}

export function normalizarContenidoEditorial(contenido) {
  return {
    titulo: typeof contenido?.titulo === 'string' ? contenido.titulo.trim() : '',
    introduccion: typeof contenido?.introduccion === 'string' ? contenido.introduccion.trim() : '',
    parrafos: Array.isArray(contenido?.parrafos)
      ? contenido.parrafos.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim())
      : [],
    secciones: Array.isArray(contenido?.secciones) ? contenido.secciones
      .filter((s) => s && typeof s.titulo === 'string' && s.titulo.trim() && Array.isArray(s.parrafos))
      .map((s) => ({ titulo: s.titulo.trim(), parrafos: s.parrafos.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim()) }))
      .filter((s) => s.parrafos.length) : [],
  }
}

export function camposEditorialesParaFormulario(experiencia) {
  const contenido = normalizarContenidoEditorial(experiencia.contenido_editorial)
  return {
    galeria: normalizarGaleria(experiencia.galeria, experiencia.imagen)
      .map(({ src, alt, pie }) => [src, alt, pie].filter(Boolean).join(' | ')).join('\n'),
    titulo_editorial: contenido.titulo,
    relato_editorial: contenido.parrafos.join('\n\n'),
    introduccion_editorial: contenido.introduccion,
    ...Object.fromEntries([0, 1].flatMap((i) => [
      [`seccion_${i + 1}_titulo`, contenido.secciones[i]?.titulo ?? ''],
      [`seccion_${i + 1}_texto`, contenido.secciones[i]?.parrafos.join('\n\n') ?? ''],
    ])),
  }
}

export function validarCamposEditoriales(formData, portada) {
  const values = {}
  const errors = {}
  for (const campo of ['galeria', 'titulo_editorial', 'relato_editorial', 'introduccion_editorial',
    'seccion_1_titulo', 'seccion_1_texto', 'seccion_2_titulo', 'seccion_2_texto']) {
    const valor = formData.get(campo)
    values[campo] = typeof valor === 'string' ? valor.trim() : ''
    if (valor !== null && typeof valor !== 'string') errors[campo] = 'Ingresá únicamente texto.'
  }

  const fotos = []
  const vistas = new Set([portada])
  const lineas = values.galeria.split(/\r?\n/).filter((linea) => linea.trim())
  if (values.galeria.length > 5000 || lineas.length > MAX_FOTOS_ADICIONALES) {
    errors.galeria = 'Agregá como máximo cinco fotografías adicionales (hasta 5000 caracteres).'
  } else {
    for (const [indice, linea] of lineas.entries()) {
      const partes = linea.split('|').map((parte) => parte.trim())
      const [src, alt, pie = ''] = partes
      if (partes.length < 2 || partes.length > 3 || !esRutaFotoLocal(src) || src.length > 250
        || !alt || alt.length > 250 || pie.length > 300 || vistas.has(src)) {
        errors.galeria = `Revisá la foto ${indice + 1}: ruta local única, descripción de hasta 250 caracteres y pie opcional de hasta 300. No repitas la portada.`
        break
      }
      vistas.add(src)
      fotos.push({ src, alt, pie })
    }
  }

  if (values.titulo_editorial.length > MAX_TITULO_EDITORIAL) {
    errors.titulo_editorial = 'Usá un título de hasta 120 caracteres.'
  }
  const parrafos = values.relato_editorial.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean)
  if (values.relato_editorial.length > MAX_RELATO_EDITORIAL || parrafos.length > 8 || parrafos.some((p) => p.length > 2000)) {
    errors.relato_editorial = 'Usá hasta ocho párrafos, de hasta 2000 caracteres cada uno y 8000 en total.'
  }

  if (values.introduccion_editorial.length > 2000) errors.introduccion_editorial = 'Usá una introducción de hasta 2000 caracteres.'
  const secciones = []
  for (const i of [1, 2]) {
    const titulo = values[`seccion_${i}_titulo`]
    const texto = values[`seccion_${i}_texto`]
    const bloques = texto.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean)
    if ((texto && !titulo) || titulo.length > MAX_TITULO_EDITORIAL) errors[`seccion_${i}_titulo`] = 'Completá el subtítulo (hasta 120 caracteres).'
    if ((titulo && !texto) || bloques.length > 8 || bloques.some((p) => p.length > 2000)) errors[`seccion_${i}_texto`] = 'Completá la sección con párrafos de hasta 2000 caracteres.'
    if (titulo && texto) secciones.push({ titulo, parrafos: bloques })
  }
  const todosLosParrafos = [values.introduccion_editorial, ...parrafos, ...secciones.flatMap((s) => s.parrafos)].filter(Boolean)
  const largoTotal = todosLosParrafos.join('').length + secciones.map((s) => s.titulo).join('').length
  if (todosLosParrafos.length > 8 || largoTotal > MAX_RELATO_EDITORIAL) errors.relato_editorial = 'El relato completo admite hasta ocho párrafos y 8000 caracteres.'

  const estructurado = values.introduccion_editorial || secciones.length
  const contenido = estructurado
    ? { titulo: values.titulo_editorial, introduccion: values.introduccion_editorial, secciones, ...(parrafos.length ? { parrafos } : {}) }
    : { titulo: values.titulo_editorial, parrafos }

  return {
    values,
    errors,
    galeria: fotos.length ? fotos : null,
    contenido_editorial: estructurado || values.titulo_editorial || parrafos.length ? contenido : null,
  }
}
