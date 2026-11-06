import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'
import fotografias from '../src/data/fotografias.json' with { type: 'json' }
import { galeriasPreparadas } from '../src/data/galerias.js'
import { validarCamposEditoriales } from '../src/lib/contenido-editorial.js'

const publicDir = fileURLToPath(new URL('../public', import.meta.url))

test('la segunda fotografía de Fitz Roy conserva una fuente de alta resolución', () => {
  // La portada ocupa la primera posición en /creditos.
  const photo = fotografias.experiences[0].photos[0]
  assert.equal(photo.src, '/images/experiencias/fitz-roy/sendero-fitz-roy.webp')
  assert.ok(photo.sourceWidth >= 3000 && photo.sourceHeight >= 2000)
  assert.equal(photo.width, 1600)
  assert.equal(photo.license, 'CC BY-SA 4.0')
})

test('las rutas y pies preparados son compatibles con el formulario del administrador', () => {
  assert.equal(galeriasPreparadas.length, 6)
  for (const [index, galeria] of galeriasPreparadas.entries()) {
    const form = new FormData()
    form.set('galeria', galeria.textoFormulario)
    const parsed = validarCamposEditoriales(form, fotografias.experiences[index].cover.src)
    assert.deepEqual(parsed.errors, {})
    assert.deepEqual(parsed.galeria, galeria.galeria)
  }
})

test('las fotos adicionales existen, tienen licencia embebida y no duplican las portadas', async () => {
  const hashes = new Set()
  const files = []
  for (const group of fotografias.experiences) {
    const cover = await readFile(`${publicDir}${group.cover.src}`)
    hashes.add(createHash('sha256').update(cover).digest('hex'))
    for (const photo of group.photos) {
      assert.match(photo.src, /^\/images\/experiencias\/[a-z-]+\/[a-z-]+\.webp$/)
      assert.ok(photo.alt && photo.alt.length <= 250)
      assert.ok(photo.author && photo.sourceTitle && photo.sourceSha1)
      assert.equal(new URL(photo.source).hostname, 'commons.wikimedia.org')
      assert.equal(new URL(photo.licenseUrl).hostname, 'creativecommons.org')
      assert.match(photo.license, /^CC BY(?:-SA)? /)
      assert.ok(photo.modifications.includes('sin ampliar ni recortar'))
      assert.ok(photo.note)
      const buffer = await readFile(`${publicDir}${photo.src}`)
      const hash = createHash('sha256').update(buffer).digest('hex')
      assert.equal(hashes.has(hash), false, `Foto duplicada: ${photo.src}`)
      hashes.add(hash)
      const metadata = await sharp(buffer).metadata()
      assert.equal(metadata.format, 'webp')
      assert.equal(metadata.width, photo.width)
      assert.equal(metadata.height, photo.height)
      assert.ok(Math.max(metadata.width, metadata.height) <= 1600)
      assert.equal(buffer.length, photo.bytes)
      assert.ok(buffer.length < 800 * 1024)
      const xmp = metadata.xmp.toString()
      assert.ok(xmp.includes(photo.licenseUrl))
      assert.ok(xmp.includes(photo.author))
      assert.ok(xmp.includes(photo.source.replaceAll('&', '&amp;')))
      files.push(photo.src.replace('/images/experiencias/', ''))
    }
  }
  const installed = (await readdir(`${publicDir}/images/experiencias`, { recursive: true }))
    .filter((name) => name.endsWith('.webp')).sort()
  assert.deepEqual(installed, files.sort())
  assert.equal(files.length, 15)
})

test('se documenta la fotografía omitida y las tres posiciones que faltan', () => {
  assert.equal(fotografias.omitted[0].title, 'Puerto Piramide.JPG')
  assert.ok(fotografias.omitted[0].reason)
  assert.equal(fotografias.pending.length, 3)
  assert.deepEqual(fotografias.experiences.map((group) => group.photos.length), [3, 2, 3, 3, 3, 1])
})
