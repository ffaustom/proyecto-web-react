import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import { transformSync } from 'next/dist/build/swc/index.js'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as normalizadores from '../src/lib/contenido-editorial.js'
import { prepararCargaEditorial } from '../src/lib/carga-editorial.js'

// Compilar los componentes reales con el compilador ya incluido en Next.js.
async function componente(nombre) {
  const source = await readFile(new URL(`../src/components/${nombre}.jsx`, import.meta.url), 'utf8')
  const { code } = transformSync(source, { filename: `${nombre}.jsx`,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } })
  const module = new SourceTextModule(code)
  await module.link(async (specifier) => {
    const values = specifier.includes('contenido-editorial') ? normalizadores
      : specifier === 'next/image' ? { default: ({ src, alt }) => React.createElement('img', { src, alt }) }
        : await import(specifier)
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value)
    })
  })
  await module.evaluate()
  return module.namespace.default
}

const Story = await componente('ExperienceStory')
const Gallery = await componente('ExperienceGallery')

test('los seis relatos muestran títulos h2, subtítulos h3 y párrafos separados sin duplicar introducciones', () => {
  for (const { cambios } of prepararCargaEditorial()) {
    const html = renderToStaticMarkup(React.createElement(Story, { descripcion: 'Descripción anterior de respaldo', contenido: cambios.contenido_editorial }))
    assert.equal((html.match(/<h2>/g) ?? []).length, 1)
    assert.equal((html.match(/<h3>/g) ?? []).length, 2)
    assert.equal((html.match(/<p /g) ?? []).length + (html.match(/<p>/g) ?? []).length, 4)
    assert.ok(!html.includes('Descripción anterior de respaldo'))
    assert.ok(!html.includes('<br'))
    assert.ok(!html.includes('Antes de salir'))
  }
})

test('la descripción y el formato anterior siguen funcionando y el texto se escapa', () => {
  assert.ok(renderToStaticMarkup(React.createElement(Story, { descripcion: 'Descripción original' })).includes('Descripción original'))
  const html = renderToStaticMarkup(React.createElement(Story, { descripcion: 'Introducción', contenido: { titulo: 'Anterior', parrafos: ['<script>Texto</script>'] } }))
  assert.ok(html.includes('&lt;script&gt;Texto&lt;/script&gt;'))
  assert.ok(!html.includes('<h3>'))
})

for (const adicionales of [0, 1, 2, 3, 5]) {
  test(`la galería funciona con ${adicionales + 1} fotos sin completar artificialmente`, () => {
    const galeria = Array.from({ length: adicionales }, (_, i) => ({ src: `/images/foto-${i}.webp`, alt: `Detalle ${i}` }))
    const html = renderToStaticMarkup(React.createElement(Gallery, { imagen: '/images/portada.jpg', alt: 'Portada original', titulo: 'Destino', galeria }))
    assert.equal((html.match(/aria-pressed=/g) ?? []).length, adicionales ? adicionales + 1 : 0)
    assert.equal(html.includes('Ver fotografía siguiente'), adicionales > 0)
    assert.ok(html.includes('src="/images/portada.jpg"'))
    if (adicionales) assert.ok(html.includes(`Fotografía 1 de ${adicionales + 1}`))
  })
}
