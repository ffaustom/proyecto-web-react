import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import {
  validarCamposEditoriales, normalizarGaleria, normalizarContenidoEditorial,
  camposEditorialesParaFormulario, esRutaFotoLocal,
} from '../src/lib/contenido-editorial.js'

const root = fileURLToPath(new URL('../', import.meta.url))

// Cargar el validador real con sus dependencias de filesystem. Únicamente se
// sustituye server-only, cuyo guard está destinado al compilador de Next.js.
async function cargarValidadorServidor() {
  const context = createContext({ process: { cwd: () => root } })
  const modules = new Map()
  async function load(filename) {
    if (modules.has(filename)) return modules.get(filename)
    const module = new SourceTextModule(await readFile(filename, 'utf8'), { context, identifier: filename })
    modules.set(filename, module)
    await module.link(async (specifier, parent) => {
      if (specifier === 'server-only' || specifier.startsWith('node:')) {
        const values = specifier === 'server-only' ? {} : await import(specifier)
        return new SyntheticModule(Object.keys(values), function () {
          for (const [name, value] of Object.entries(values)) this.setExport(name, value)
        }, { context })
      }
      return load(resolve(dirname(parent.identifier), `${specifier}.js`))
    })
    return module
  }
  const module = await load(resolve(root, 'src/app/admin/nueva/validacion-server.js'))
  await module.evaluate()
  return module.namespace.validarExperiencia
}

const validarServidor = await cargarValidadorServidor()

function datosEditoriales(values = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return form
}

function experienciaValida(values = {}) {
  return datosEditoriales({
    id: 'experiencia-de-prueba', titulo: 'Prueba', provincia: 'Prueba', ubicacion: 'Prueba',
    region: 'Prueba', categoria: 'Prueba', duracion: '1 hora', precio: '100',
    imagen: '/images/patagonia.jpg', alt: 'Paisaje de montaña', descripcion: 'Descripción existente.',
    incluye: 'Contenido confirmado', recomendacion: 'Recomendación existente.', activo: 'on',
    ...values,
  })
}

test('los campos opcionales ausentes o vacíos no agregan contenido', async () => {
  for (const form of [experienciaValida(), experienciaValida({ galeria: '', titulo_editorial: '', relato_editorial: '' })]) {
    const result = await validarServidor(form)
    assert.equal(Object.keys(result.errors).length, 0)
    assert.equal(result.experiencia.galeria, null)
    assert.equal(result.experiencia.contenido_editorial, null)
    assert.equal(result.experiencia.precio, 100)
    assert.equal(result.experiencia.incluye[0], 'Contenido confirmado')
  }
})

test('se guardan fotos reales y párrafos; los campos del formulario no se envían como columnas', async () => {
  const result = await validarServidor(experienciaValida({
    galeria: '/images/mendoza.jpg | Hileras de viñedos | Pie de prueba\n/images/jujuy.jpg | Paisaje de la quebrada',
    titulo_editorial: '  Un título propio  ',
    relato_editorial: 'Primer párrafo.\r\n\r\nSegundo párrafo.',
  }))
  assert.equal(Object.keys(result.errors).length, 0)
  assert.equal(result.experiencia.galeria.length, 2)
  assert.equal(result.experiencia.galeria[0].pie, 'Pie de prueba')
  assert.equal(result.experiencia.contenido_editorial.titulo, 'Un título propio')
  assert.equal(result.experiencia.contenido_editorial.parrafos.length, 2)
  assert.equal(Object.hasOwn(result.experiencia, 'titulo_editorial'), false)
  assert.equal(Object.hasOwn(result.experiencia, 'relato_editorial'), false)
})

for (const path of [
  'https://example.com/image.jpg', '//example.com/image.jpg', '/images/../secret.jpg',
  '/images/%2e%2e/secret.jpg', '/images/test.svg', '/images/test.jpg?x=1', 'images/test.jpg',
]) {
  test(`se rechaza ruta no admitida: ${path}`, () => {
    assert.equal(esRutaFotoLocal(path), false)
    const result = validarCamposEditoriales(datosEditoriales({ galeria: `${path} | Descripción` }), '/images/patagonia.jpg')
    assert.ok(result.errors.galeria)
  })
}

for (const [label, galeria] of [
  ['portada repetida', '/images/patagonia.jpg | Repetida'],
  ['duplicadas', '/images/mendoza.jpg | Uno\n/images/mendoza.jpg | Dos'],
  ['sin descripción', '/images/mendoza.jpg | '],
  ['separadores extra', '/images/mendoza.jpg | Uno | Dos | Tres'],
  ['alt demasiado largo', `/images/mendoza.jpg | ${'a'.repeat(251)}`],
  ['pie demasiado largo', `/images/mendoza.jpg | Descripción | ${'a'.repeat(301)}`],
  ['más de cinco fotos', Array.from({ length: 6 }, (_, i) => `/images/test-${i}.jpg | Prueba`).join('\n')],
]) {
  test(`la galería rechaza ${label}`, () => {
    const result = validarCamposEditoriales(datosEditoriales({ galeria }), '/images/patagonia.jpg')
    assert.ok(result.errors.galeria)
  })
}

test('el servidor rechaza archivos inexistentes aunque la ruta tenga formato válido', async () => {
  const result = await validarServidor(experienciaValida({ galeria: '/images/no-existe-audit.jpg | Paisaje' }))
  assert.match(result.errors.galeria, /deben existir/)
})

for (const [field, value] of [
  ['titulo_editorial', 'a'.repeat(121)],
  ['relato_editorial', 'a'.repeat(2001)],
  ['relato_editorial', Array.from({ length: 9 }, () => 'Párrafo').join('\n\n')],
  ['relato_editorial', Array.from({ length: 5 }, () => 'a'.repeat(1800)).join('\n\n')],
]) {
  test(`se rechaza ${field} por exceder los límites`, () => {
    const result = validarCamposEditoriales(datosEditoriales({ [field]: value }))
    assert.ok(result.errors[field])
  })
}

test('no se aceptan archivos en los campos de texto', () => {
  const form = datosEditoriales()
  form.set('galeria', new Blob(['test']), 'test.txt')
  const result = validarCamposEditoriales(form)
  assert.ok(result.errors.galeria)
})

test('la lectura tolera registros antiguos y descarta fotos duplicadas o datos inválidos', () => {
  assert.deepEqual(normalizarGaleria(null, '/images/patagonia.jpg'), [])
  assert.deepEqual(normalizarContenidoEditorial(null), { titulo: '', introduccion: '', parrafos: [], secciones: [] })
  assert.deepEqual(camposEditorialesParaFormulario({ imagen: '/images/patagonia.jpg' }), {
    galeria: '', titulo_editorial: '', relato_editorial: '', introduccion_editorial: '',
    seccion_1_titulo: '', seccion_1_texto: '', seccion_2_titulo: '', seccion_2_texto: '',
  })
  const fotos = normalizarGaleria([
    { src: '/images/patagonia.jpg', alt: 'Portada repetida' },
    { src: '/images/mendoza.jpg', alt: 'Viñedos' },
    { src: '/images/mendoza.jpg', alt: 'Duplicada' },
    null, { src: 'https://example.com/photo.jpg', alt: 'Remota' },
  ], '/images/patagonia.jpg')
  assert.equal(fotos.length, 1)
  assert.equal(fotos[0].src, '/images/mendoza.jpg')
})

test('el contenido se puede editar, volver a guardar y quitar sin perder su orden', () => {
  const original = {
    imagen: '/images/patagonia.jpg',
    galeria: [{ src: '/images/mendoza.jpg', alt: 'Viñedos', pie: 'Pie' }],
    contenido_editorial: { titulo: 'Título', parrafos: ['Primero', 'Segundo'] },
  }
  const values = camposEditorialesParaFormulario(original)
  const parsed = validarCamposEditoriales(datosEditoriales(values), original.imagen)
  assert.deepEqual(parsed.errors, {})
  assert.deepEqual(parsed.galeria, original.galeria)
  assert.deepEqual(parsed.contenido_editorial, original.contenido_editorial)
  const cleared = validarCamposEditoriales(datosEditoriales({ galeria: '', titulo_editorial: '', relato_editorial: '' }))
  assert.equal(cleared.galeria, null)
  assert.equal(cleared.contenido_editorial, null)
})

for (const values of [
  { introduccion_editorial: 'a'.repeat(2001) },
  { seccion_1_titulo: 'Subtítulo sin cuerpo' },
  { seccion_2_texto: 'Cuerpo sin subtítulo' },
  { seccion_1_titulo: 'a'.repeat(121), seccion_1_texto: 'Cuerpo' },
  { seccion_1_titulo: 'Subtítulo', seccion_1_texto: 'a'.repeat(2001) },
  { introduccion_editorial: 'a'.repeat(2000), seccion_1_titulo: 'Uno',
    seccion_1_texto: Array.from({ length: 4 }, () => 'a'.repeat(1800)).join('\n\n') },
]) {
  test('el servidor rechaza secciones incompletas o excesivas: ' + Object.keys(values).join(', '), async () => {
    const result = await validarServidor(experienciaValida(values))
    assert.ok(Object.keys(result.errors).length)
  })
}
