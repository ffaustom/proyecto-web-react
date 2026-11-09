import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import { transformSync } from 'next/dist/build/swc/index.js'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { esFechaReal, hoyArgentina, validarFechaVisita } from '../src/lib/fechas.js'
import { recomendarFecha } from '../src/lib/temporadas.js'
import { temporadas } from '../src/data/temporadas.js'
import { validarReserva } from '../src/app/experiencias/[id]/validacion.js'

function formulario(fecha = '2099-01-15') {
  const data = new FormData()
  for (const [key, value] of Object.entries({ nombre_comprador: 'Ana Test', email: 'ana@example.com', cantidad_personas: '2', fecha_visita: fecha })) data.set(key, value)
  return data
}

// Ejecuta la Server Action real con su validación real y una base simulada.
async function cargarAccion({ precio = 95000, activa = true, errorConsulta = null, errorInsert = null, desconexion = false, fase = 'expansion' } = {}) {
  const writes = []
  let consultas = 0
  const cliente = { from(tabla) {
    if (tabla === 'experiencias') {
      consultas++
      const query = { select() { return this }, eq() { return this }, async maybeSingle() {
        if (desconexion) throw new Error('Sin conexión')
        return { data: activa ? { id: 'senderos-del-fitz-roy', precio } : null, error: errorConsulta }
      } }
      return query
    }
    assert.equal(tabla, 'reservas')
    return { async insert(value) {
      // Contrato RLS simulado, no ejecución de SQL: la validación PostgreSQL
      // real de ambas fases se comprueba por separado antes de producción.
      const fecha = value.fecha_visita
      const denegada = fecha === null || fecha === undefined
        ? fase === 'exigencia'
        : !!validarFechaVisita(fecha)
      if (denegada) return { error: { code: '42501' } }
      writes.push(value)
      return { error: errorInsert }
    } }
  } }
  const source = await readFile(new URL('../src/app/experiencias/[id]/actions.js', import.meta.url), 'utf8')
  const module = new SourceTextModule(source)
  await module.link(async (specifier) => {
    const values = specifier.endsWith('/validacion') ? { validarReserva } : { crearClienteSupabase: () => cliente }
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value)
    })
  })
  await module.evaluate()
  return { crear: module.namespace.crearReserva, writes, consultas: () => consultas }
}

test('fechas reales: días de cada mes, bisiestos y entradas malformadas', () => {
  for (const valid of ['2028-02-29', '2000-02-29', '2026-04-30', '0001-01-01', '9999-12-31']) assert.ok(esFechaReal(valid), valid)
  for (const invalid of ['', null, undefined, 20261108, '0000-01-01', '2026-2-01', '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-11-08T00:00:00Z', 'infinity', '10000-01-01']) assert.equal(esFechaReal(invalid), false, String(invalid))
})

test('hoy usa Argentina aunque UTC esté en el día o año siguiente', () => {
  assert.equal(hoyArgentina(new Date('2026-11-09T02:59:59Z')), '2026-11-08')
  assert.equal(hoyArgentina(new Date('2026-11-09T03:00:00Z')), '2026-11-09')
  assert.equal(hoyArgentina(new Date('2027-01-01T01:00:00Z')), '2026-12-31')
  assert.equal(validarFechaVisita('2026-11-08', '2026-11-08'), '')
  assert.equal(validarFechaVisita('2026-11-09', '2026-11-08'), '')
  assert.match(validarFechaVisita('2026-11-07', '2026-11-08'), /posterior/)
})

const esperados = {
  'senderos-del-fitz-roy': [1, 2, 3, 10, 11, 12],
  'vinedos-de-mendoza': [3, 4, 9, 10, 11],
  'colores-de-purmamarca': [4, 5, 6, 7, 8, 9, 10, 11],
  'quebrada-de-las-conchas': [4, 5, 6, 7, 8, 9, 10, 11],
  'historias-de-buenos-aires': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'ballenas-en-puerto-madryn': [6, 7, 8, 9, 10, 11, 12],
}
for (const [id, meses] of Object.entries(esperados)) {
  test(`${id}: límites mensuales, explicación y fuentes oficiales`, () => {
    for (let mes = 1; mes <= 12; mes++) {
      const ultimo = new Date(Date.UTC(2028, mes, 0)).getUTCDate()
      for (const dia of [1, ultimo]) {
        const consejo = recomendarFecha(id, `2028-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`)
        assert.equal(consejo.recomendable, meses.includes(mes), `${mes}/${dia}`)
        assert.ok(consejo.motivo.length > 40)
        assert.ok(consejo.fuentes.length > 0)
        for (const fuente of consejo.fuentes) assert.ok(['www.argentina.travel', 'www.argentina.gob.ar', 'larutanatural.gob.ar', 'turismo.buenosaires.gob.ar', 'www.puertopiramides.gov.ar'].includes(new URL(fuente.url).hostname))
      }
    }
  })
}

test('consejos específicos: vendimia, cuatro estaciones y ballenas fuera de temporada', () => {
  assert.match(recomendarFecha('vinedos-de-mendoza', '2028-03-01').motivo, /vendimia/)
  const consejos = [1, 4, 7, 10].map(mes => recomendarFecha('historias-de-buenos-aires', `2028-${String(mes).padStart(2, '0')}-01`).motivo)
  assert.equal(new Set(consejos).size, 4)
  const ballenas = recomendarFecha('ballenas-en-puerto-madryn', '2028-01-01')
  assert.match(ballenas.motivo, /no se espera avistaje de ballenas/)
  assert.match(ballenas.motivo, /no se garantiza la operación/)
  assert.equal(recomendarFecha('nuevo-destino', '2028-01-01').recomendable, null)
  assert.equal(recomendarFecha('senderos-del-fitz-roy', '2028-02-30'), null)
})

test('validación de reserva exige fecha sin alterar las validaciones anteriores', () => {
  for (const fecha of ['', '2026-02-29', '2026-11-07']) assert.ok(validarReserva(formulario(fecha), '2026-11-08').errors.fecha_visita)
  const antiguo = formulario()
  antiguo.delete('fecha_visita')
  assert.ok(validarReserva(antiguo, '2026-11-08').errors.fecha_visita)
  const data = formulario('2026-11-08')
  assert.deepEqual(validarReserva(data, '2026-11-08').errors, {})
  data.set('nombre_comprador', '')
  data.set('email', 'incorrecto')
  data.set('cantidad_personas', '0')
  const { errors } = validarReserva(data, '2026-11-08')
  assert.ok(errors.nombre_comprador && errors.email && errors.cantidad_personas)
  assert.equal(errors.fecha_visita, undefined)
})

test('Server Action rechaza el campo vacío, fechas pasadas o inexistentes antes de consultar', async () => {
  const action = await cargarAccion()
  for (const fecha of ['', '2000-01-01', '2099-02-30']) {
    const result = await action.crear('senderos-del-fitz-roy', null, formulario(fecha))
    assert.ok(result.errors.fecha_visita)
  }
  assert.equal(action.consultas(), 0)
  assert.equal(action.writes.length, 0)
})

test('transición: solo la ausencia del campo permite omitir fecha; no acepta vacío, espacios ni archivos', () => {
  const data = formulario()
  data.delete('fecha_visita')
  const opciones = { permitirFechaAusente: true }
  assert.deepEqual(validarReserva(data, '2026-11-08', opciones).errors, {})
  for (const fecha of ['', '   ', '2026-02-30', '2026-11-07']) {
    data.set('fecha_visita', fecha)
    assert.ok(validarReserva(data, '2026-11-08', opciones).errors.fecha_visita)
  }
  data.set('fecha_visita', new Blob(['2026-11-08']), 'fecha.txt')
  assert.ok(validarReserva(data, '2026-11-08', opciones).errors.fecha_visita)
})

test('fase 1 simulada: formulario anterior sin fecha se guarda con NULL, sin inventar fecha ni alterar pagos', async () => {
  const action = await cargarAccion({ fase: 'expansion' })
  const data = formulario()
  data.delete('fecha_visita')
  const result = await action.crear('senderos-del-fitz-roy', null, data)
  assert.equal(result.success, true)
  assert.deepEqual(JSON.parse(JSON.stringify(action.writes[0])), {
    experiencia_id: 'senderos-del-fitz-roy', nombre_comprador: 'Ana Test', email: 'ana@example.com', cantidad_personas: 2,
    fecha_visita: null, total: '190000.00', estado: 'pendiente',
  })
})

test('fase 2 simulada: RLS rechaza el formulario anterior sin fecha; no se reintenta inventando una', async () => {
  const action = await cargarAccion({ fase: 'exigencia' })
  const data = formulario()
  data.delete('fecha_visita')
  const result = await action.crear('senderos-del-fitz-roy', null, data)
  assert.equal(result.success, undefined)
  assert.ok(result.error)
  assert.equal(action.writes.length, 0)
  assert.equal(action.consultas(), 1)
})

test('ambas fases simuladas conservan validaciones de comprador y cantidad en solicitudes antiguas', async () => {
  for (const fase of ['expansion', 'exigencia']) {
    const action = await cargarAccion({ fase })
    const data = formulario()
    data.delete('fecha_visita')
    data.set('email', 'incorrecto')
    data.set('cantidad_personas', '0')
    const result = await action.crear('senderos-del-fitz-roy', null, data)
    assert.ok(result.errors.email && result.errors.cantidad_personas)
    assert.equal(action.consultas(), 0)
    assert.equal(action.writes.length, 0)
  }
})

test('Server Action guarda el día exacto dentro y fuera de temporada, manteniendo total y estado', async () => {
  for (const [fase, fecha] of ['expansion', 'exigencia'].flatMap(fase => ['2099-01-15', '2099-07-15'].map(fecha => [fase, fecha]))) {
    const action = await cargarAccion({ fase })
    const data = formulario(fecha)
    data.set('total', '1')
    data.set('estado', 'confirmada')
    data.set('mercado_pago_payment_id', 'manipulado')
    const result = await action.crear('senderos-del-fitz-roy', null, data)
    assert.equal(result.success, true)
    assert.equal(action.writes.length, 1)
    assert.deepEqual(JSON.parse(JSON.stringify(action.writes[0])), {
      experiencia_id: 'senderos-del-fitz-roy', nombre_comprador: 'Ana Test', email: 'ana@example.com', cantidad_personas: 2,
      fecha_visita: fecha, total: '190000.00', estado: 'pendiente',
    })
  }
})

test('fallos de consulta, experiencia inactiva, importe excesivo y conexión no generan reservas', async () => {
  for (const options of [{ errorConsulta: { code: 'test' } }, { activa: false }, { precio: 9999999999.99 }, { desconexion: true }]) {
    const action = await cargarAccion(options)
    const result = await action.crear('senderos-del-fitz-roy', null, formulario())
    assert.ok(result.error)
    assert.equal(action.writes.length, 0)
  }
})

test('un error de inserción conserva fecha, comprador y cantidad para reintentar', async () => {
  const action = await cargarAccion({ errorInsert: { code: '42703' } })
  const result = await action.crear('senderos-del-fitz-roy', null, formulario())
  assert.equal(result.success, undefined)
  assert.equal(result.values.fecha_visita, '2099-01-15')
  assert.equal(result.values.nombre_comprador, 'Ana Test')
  assert.equal(result.values.cantidad_personas, '2')
  assert.ok(!result.error.includes('disponibilidad'))
})

async function cargarComponente(path, mocks = {}) {
  const source = await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
  const { code } = transformSync(source, { filename: path,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } })
  const module = new SourceTextModule(code)
  await module.link(async (specifier) => {
    const values = mocks[specifier] ?? (specifier.endsWith('/temporadas.js') ? { recomendarFecha } : await import(specifier))
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value)
    })
  })
  await module.evaluate()
  return module.namespace.default
}
const Recommendation = await cargarComponente('components/SeasonalRecommendation.jsx')

test('aviso accesible anuncia ambos resultados y enlaza las fuentes sin prometer servicios', () => {
  for (const fecha of ['2099-01-15', '2099-07-15']) {
    const html = renderToStaticMarkup(React.createElement(Recommendation, { experienciaId: 'senderos-del-fitz-roy', fecha }))
    assert.ok(html.includes('role="status"') && html.includes('aria-live="polite"') && html.includes('aria-atomic="true"'))
    assert.ok(html.includes(fecha.includes('-01-') ? 'Época recomendable' : 'Época poco recomendable'))
    assert.ok(html.includes('Podés reservar aunque'))
    assert.ok(html.includes('no garantiza clima, fauna ni servicios'))
    assert.ok(html.includes(temporadas['senderos-del-fitz-roy'].fuentes[0].url))
  }
  const html = renderToStaticMarkup(React.createElement(Recommendation, { experienciaId: 'senderos-del-fitz-roy', fecha: '' }))
  assert.ok(!html.includes('Época recomendable'))
})

// Interacción del formulario real: hooks simulados para controlar el día y
// los cambios de estado, sin instalar un navegador ni enviar datos a Supabase.
const estados = []
let indice = 0
let respuesta = { values: {}, errors: {}, error: '' }
let pending = false
const Form = await cargarComponente('app/experiencias/[id]/ReservationForm.jsx', {
  react: {
    useState(initial) { const key = indice++; if (!(key in estados)) estados[key] = initial; return [estados[key], value => { estados[key] = value }] },
    useEffect() {},
    useActionState() { return [respuesta, '/reserva-simulada', pending] },
  },
  './actions': { crearReserva() {} },
  '../../../lib/fechas.js': { hoyArgentina: () => '2099-01-15', validarFechaVisita },
  '../../../components/SeasonalRecommendation': { default: Recommendation },
})
function renderForm() { indice = 0; return Form({ experienciaId: 'senderos-del-fitz-roy', precio: 95000, hoyInicial: '2099-01-15' }) }
function buscar(node, predicate) {
  if (!node || typeof node !== 'object') return undefined
  if (predicate(node)) return node
  return React.Children.toArray(node.props?.children).map(child => buscar(child, predicate)).find(Boolean)
}

test('formulario actualiza consejo al cambiar fecha, preserva valores y nunca deshabilita por temporada', () => {
  let tree = renderForm()
  const date = () => buscar(tree, node => node.props?.name === 'fecha_visita')
  assert.equal(date().props.type, 'date')
  assert.equal(date().props.min, '2099-01-15')
  assert.equal(date().props.required, true)
  for (const fecha of ['2099-01-15', '2099-07-15']) {
    date().props.onChange({ target: { value: fecha } })
    tree = renderForm()
    const consejo = buscar(tree, node => node.type === Recommendation)
    assert.equal(consejo.props.fecha, fecha)
    assert.equal(buscar(tree, node => node.type === 'button').props.disabled, false)
    assert.ok(renderToStaticMarkup(tree).includes(fecha.includes('-01-') ? 'Época recomendable' : 'Época poco recomendable'))
  }
  respuesta = { values: { fecha_visita: '2099-07-15' }, errors: {}, error: 'No se pudo guardar' }
  tree = renderForm()
  assert.equal(date().props.value, '2099-07-15')
  pending = true
  tree = renderForm()
  assert.equal(buscar(tree, node => node.type === 'button').props.disabled, true)
  pending = false
  respuesta = { values: {}, errors: {}, error: '' }
})

test('formulario comprueba fecha al enviar y bloquea solo fecha vencida o inválida', () => {
  let tree = renderForm()
  for (const [fecha, esperado] of [['', true], ['2099-01-14', true], ['2099-02-30', true], ['2099-07-15', false]]) {
    buscar(tree, node => node.props?.name === 'fecha_visita').props.onChange({ target: { value: fecha } })
    tree = renderForm()
    let prevented = false
    let focused = false
    tree.props.onSubmit({ preventDefault() { prevented = true }, currentTarget: { elements: { fecha_visita: { focus() { focused = true } } } } })
    assert.equal(prevented, esperado)
    assert.equal(focused, esperado)
    tree = renderForm()
  }
})
