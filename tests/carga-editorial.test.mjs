import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cargarContenidoEditorial, prepararCargaEditorial, iguales } from '../src/lib/carga-editorial.js'
import { camposEditorialesParaFormulario, validarCamposEditoriales } from '../src/lib/contenido-editorial.js'

const adminUserId = '11111111-1111-4111-8111-111111111111' // Identificador ficticio, solo para mocks.
const carga = prepararCargaEditorial()

function cliente({ usuario = adminUserId, editar, fallaEn } = {}) {
  const filas = carga.map(({ id, esperado }) => ({ id, ...structuredClone(esperado),
    precio: 123, activo: true, galeria: null, contenido_editorial: null }))
  editar?.(filas)
  const updates = []
  let lecturas = 0
  return {
    filas, updates, get lecturas() { return lecturas },
    auth: { getUser: async () => ({ data: { user: { id: usuario } } }) },
    from(table) {
      assert.equal(table, 'experiencias')
      return {
        select() { return { in: async () => { lecturas++; return { data: structuredClone(filas) } } } },
        update(payload) {
          assert.deepEqual(Object.keys(payload).sort(), ['contenido_editorial', 'galeria'])
          const condiciones = []
          const query = {
            eq(key, value) { condiciones.push([key, value]); return query },
            is(key, value) { return query.eq(key, value) },
            contains(key, value) { return query.eq(key, value) },
            containedBy() { return query },
            select() { return query },
            async maybeSingle() {
              const id = condiciones.find(([key]) => key === 'id')[1]
              updates.push(id)
              if (fallaEn === id) return { data: null, error: { message: 'Fallo simulado' } }
              const fila = filas.find((item) => item.id === id)
              const coincide = condiciones.every(([key, value]) => iguales(fila[key],
                typeof fila[key] === 'object' && fila[key] !== null && typeof value === 'string' ? JSON.parse(value) : value))
              if (!coincide) return { data: null }
              Object.assign(fila, structuredClone(payload))
              return { data: structuredClone(fila) }
            },
          }
          return query
        },
      }
    },
  }
}

const opciones = { adminUserId, accessToken: 'token-simulado' }

test('los seis relatos conservan títulos, introducción y dos secciones al pasar por el formulario', () => {
  assert.equal(carga.length, 6)
  assert.deepEqual(carga.map((item) => item.cambios.galeria.length), [3, 2, 3, 3, 3, 1])
  for (const { cambios } of carga) {
    assert.equal(cambios.contenido_editorial.secciones.length, 2)
    assert.equal(Object.hasOwn(cambios.contenido_editorial, 'recomendacion'), false)
    const form = new FormData()
    for (const [key, value] of Object.entries(camposEditorialesParaFormulario(cambios))) form.set(key, value)
    assert.deepEqual(validarCamposEditoriales(form).contenido_editorial, cambios.contenido_editorial)
  }
})

test('un usuario común es rechazado antes de consultar o escribir registros', async () => {
  const db = cliente({ usuario: '22222222-2222-4222-8222-222222222222' })
  await assert.rejects(cargarContenidoEditorial(db, { ...opciones, aplicar: true }), /administrador autorizado/)
  assert.equal(db.lecturas, 0)
  assert.equal(db.updates.length, 0)
})

test('el modo de comprobación no escribe ni crea respaldos', async () => {
  const db = cliente()
  const resultado = await cargarContenidoEditorial(db, { ...opciones, antesDeEscribir: () => assert.fail('No debe guardar') })
  assert.equal(resultado.filter((row) => row.estado === 'pendiente').length, 6)
  assert.equal(db.updates.length, 0)
})

for (const [nombre, editar, mensaje] of [
  ['columnas ausentes', (filas) => { delete filas[5].galeria }, /Faltan las columnas/],
  ['registro ausente', (filas) => { filas.pop() }, /seis registros/],
  ['recomendación distinta', (filas) => { filas[5].recomendacion = 'Cambio comercial' }, /Cambió recomendacion/],
  ['contenido existente diferente', (filas) => { filas[5].contenido_editorial = { titulo: 'Edición manual' } }, /no se sobrescribió/],
]) {
  test(`se revisan los seis registros antes de escribir: ${nombre}`, async () => {
    const db = cliente({ editar })
    await assert.rejects(cargarContenidoEditorial(db, { ...opciones, aplicar: true }), mensaje)
    assert.equal(db.updates.length, 0)
  })
}

test('solo se guardan las dos columnas editoriales, con respaldo previo y repetición sin cambios', async () => {
  const db = cliente()
  const antes = structuredClone(db.filas)
  let respaldos = 0
  const resultado = await cargarContenidoEditorial(db, { ...opciones, aplicar: true, antesDeEscribir: (filas) => {
    assert.equal(db.updates.length, 0)
    assert.deepEqual(filas, antes)
    respaldos++
  } })
  assert.equal(respaldos, 1)
  assert.equal(resultado.filter((row) => row.estado === 'actualizado').length, 6)
  for (const [indice, fila] of db.filas.entries()) {
    const { galeria, contenido_editorial, ...comercial } = fila
    const { galeria: previa, contenido_editorial: previo, ...comercialAntes } = antes[indice]
    assert.deepEqual(comercial, comercialAntes)
    assert.deepEqual({ galeria, contenido_editorial }, carga[indice].cambios)
  }
  const repeticion = await cargarContenidoEditorial(db, { ...opciones, aplicar: true, antesDeEscribir: () => assert.fail('No hay cambios') })
  assert.equal(db.updates.length, 6)
  assert.ok(repeticion.every((row) => row.estado === 'sin cambios'))
})

test('una edición concurrente detiene la carga antes de pisar la fila', async () => {
  const db = cliente()
  await assert.rejects(cargarContenidoEditorial(db, { ...opciones, aplicar: true,
    antesDeEscribir: () => { db.filas[0].precio = 999 },
  }), /posible edición concurrente/)
  assert.equal(db.filas[0].precio, 999)
  assert.equal(db.filas[0].galeria, null)
  assert.equal(db.updates.length, 1)
})

test('una interrupción parcial conserva lo confirmado y permite reanudar sin reescribirlo', async () => {
  const db = cliente({ fallaEn: carga[2].id })
  await assert.rejects(cargarContenidoEditorial(db, { ...opciones, aplicar: true }), /No se confirmó/)
  assert.deepEqual(db.filas[0].galeria, carga[0].cambios.galeria)
  assert.equal(db.filas[2].galeria, null)
  const estado = await cargarContenidoEditorial(db, opciones)
  assert.deepEqual(estado.map((row) => row.estado), ['sin cambios', 'sin cambios', 'pendiente', 'pendiente', 'pendiente', 'pendiente'])
})
