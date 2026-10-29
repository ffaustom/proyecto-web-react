export const imagenes = ['patagonia.jpg', 'mendoza.jpg', 'jujuy.jpg', 'salta.jpg', 'buenos-aires.jpg', 'madryn.jpg'].map((archivo) => `/images/${archivo}`)

export const camposTexto = [
  ['id', 'Identificador para la URL'],
  ['titulo', 'Título'],
  ['provincia', 'Provincia'],
  ['ubicacion', 'Ubicación'],
  ['region', 'Región'],
  ['categoria', 'Categoría'],
  ['duracion', 'Duración'],
  ['alt', 'Descripción de la imagen'],
  ['descripcion', 'Descripción'],
  ['incluye', 'Qué incluye'],
  ['recomendacion', 'Recomendaciones'],
]

export function validarExperiencia(formData) {
  const values = {}
  const errors = {}
  for (const [name, label] of [...camposTexto, ['precio', 'Precio'], ['imagen', 'Imagen']]) {
    const value = formData.get(name)
    values[name] = typeof value === 'string' ? value.trim() : ''
    if (!values[name]) errors[name] = `Completá el campo ${label.toLowerCase()}.`
  }
  values.activo = formData.get('activo') === 'on'
  values.destacada = formData.get('destacada') === 'on'

  if (values.id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.id)) {
    errors.id = 'Usá letras minúsculas sin acentos, números y guiones entre palabras.'
  }
  const precio = values.precio.replace(',', '.')
  if (values.precio && (!/^\d+(?:\.\d{1,2})?$/.test(precio) || !Number.isFinite(Number(precio)) || Number(precio) > 9999999999.99)) {
    errors.precio = 'Ingresá un precio entre 0 y 9999999999,99, con hasta dos decimales y sin separadores de miles.'
  }
  if (values.imagen && !imagenes.includes(values.imagen)) errors.imagen = 'Elegí una de las imágenes disponibles.'

  return {
    values,
    errors,
    experiencia: {
      ...values,
      precio: Number(precio),
      incluye: [...new Set(values.incluye.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))],
    },
  }
}
