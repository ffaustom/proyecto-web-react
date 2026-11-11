import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import { validarFechaVisita } from '../src/lib/fechas.js'

const id = '11111111-1111-4111-8111-111111111111'
const token = 'credencial-ficticia-exclusiva-del-test'
const source = await readFile(new URL('../src/lib/mercado-pago/server.js', import.meta.url), 'utf8')

async function cargar({ env = {}, reserva = {}, experiencia = {}, dbError = false, missing = false,
  response = {}, networkError = false, invalidJson = false, apiResponses = [] } = {}) {
  const calls = { api: [], db: [], clients: 0 }
  const fila = { id, experiencia_id: 'senderos-del-fitz-roy', cantidad_personas: 2, total: '190000.00',
    estado: 'pendiente', fecha_visita: '2099-07-15', mercado_pago_preference_id: null, ...reserva }
  const catalogo = { id: fila.experiencia_id, titulo: 'Senderos del Fitz Roy', activo: true, precio: 1, ...experiencia }
  const cliente = { from(tabla) {
    const query = { tabla }
    calls.db.push(query)
    return {
      select(columnas) { query.columnas = columnas; return this },
      eq(columna, valor) { query.filtro = [columna, valor]; return this },
      async maybeSingle() { return { error: dbError ? { message: token } : null,
        data: missing ? null : tabla === 'reservas' ? fila : catalogo } },
    }
  } }
  const context = createContext({ URL, AbortSignal,
    process: { env: { MP_ACCESS_TOKEN: token, MP_TEST_MODE: 'true', APP_URL: 'https://afuera-preview.example', ...env } },
    fetch: async (url, options) => {
      calls.api.push({ url, ...options, body: options.body ? JSON.parse(options.body) : undefined })
      if (networkError) throw new Error(`No imprimir ${token}`)
      if (apiResponses.length) return { ok: true, status: 200, json: async () => apiResponses.shift() }
      return { ok: true, status: 201, json: async () => {
        if (invalidJson) throw new Error(token)
        return { id: 'preferencia-test', external_reference: id,
          init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=preferencia-test', ...response.data }
      }, ...Object.fromEntries(Object.entries(response).filter(([key]) => key !== 'data')) }
    },
  })
  const module = new SourceTextModule(source, { context })
  const mocks = {
    'server-only': {},
    '../supabase/service-server': { crearClienteSupabasePrivado: () => { calls.clients++; return cliente } },
    '../fechas.js': { validarFechaVisita },
  }
  await module.link(specifier => {
    assert.ok(Object.hasOwn(mocks, specifier), `Import inesperado: ${specifier}`)
    const values = mocks[specifier]
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  return { crear: module.namespace.crearPreferenciaParaReserva, recuperar: module.namespace.recuperarPreferenciaParaReserva, calls }
}

const preferenciaRecuperada = { id: 'preferencia-test', external_reference: id,
  init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=preferencia-test',
  items: [{ quantity: 1, currency_id: 'ARS', unit_price: 190000 }] }

test('recupera una preferencia incierta por UUID y verifica el detalle antes de devolver checkout', async () => {
  const { recuperar, calls } = await cargar({ apiResponses: [
    { total: 1, elements: [{ id: 'preferencia-test' }] }, preferenciaRecuperada,
  ] })
  const result = await recuperar(id)
  assert.equal(result.id, 'preferencia-test')
  assert.equal(calls.api[0].url, `https://api.mercadopago.com/checkout/preferences/search?external_reference=${id}`)
  assert.equal(calls.api[1].url, 'https://api.mercadopago.com/checkout/preferences/preferencia-test')
  assert.ok(calls.api.every(call => call.method === 'GET'))
})

test('reutiliza preferencia persistida sin POST ni búsqueda', async () => {
  const { recuperar, calls } = await cargar({ reserva: { mercado_pago_preference_id: 'preferencia-test' }, apiResponses: [preferenciaRecuperada] })
  assert.equal((await recuperar(id, 'preferencia-test')).id, 'preferencia-test')
  assert.equal(calls.api.length, 1)
  assert.equal(calls.api[0].method, 'GET')
})

test('después de medianoche recupera una preferencia existente con la fecha original pasada', async () => {
  const { recuperar, calls } = await cargar({ reserva: { fecha_visita: '2000-01-01' }, apiResponses: [preferenciaRecuperada] })
  assert.equal((await recuperar(id, 'preferencia-test')).id, 'preferencia-test')
  assert.ok(calls.api.every(call => call.method === 'GET'))
})

test('una preferencia vencida por expiration_date_to no se recupera ni se reemplaza', async () => {
  const { recuperar, calls } = await cargar({ apiResponses: [{ ...preferenciaRecuperada, expires: true, expiration_date_to: '2000-01-01T00:00:00Z' }] })
  await assert.rejects(recuperar(id, 'preferencia-test'))
  assert.ok(calls.api.every(call => call.method === 'GET'))
})

test('sin resultado todavía no crea otra preferencia', async () => {
  const { recuperar, calls } = await cargar({ apiResponses: [{ total: 0, elements: [] }] })
  assert.equal(await recuperar(id), null)
  assert.equal(calls.api.length, 1)
})

for (const [label, data] of [
  ['referencia ajena', { external_reference: 'otra' }],
  ['importe diferente', { items: [{ quantity: 1, currency_id: 'ARS', unit_price: 1 }] }],
  ['moneda diferente', { items: [{ quantity: 1, currency_id: 'USD', unit_price: 190000 }] }],
  ['cantidad diferente', { items: [{ quantity: 2, currency_id: 'ARS', unit_price: 95000 }] }],
  ['URL ajena', { init_point: 'https://malicioso.example' }],
  ['expirada', { preference_expired: true }],
]) {
  test(`rechaza preferencia recuperada: ${label}`, async () => {
    const { recuperar } = await cargar({ apiResponses: [{ ...preferenciaRecuperada, ...data }] })
    await assert.rejects(recuperar(id, 'preferencia-test'))
  })
}

test('búsqueda ambigua no selecciona una preferencia arbitrariamente', async () => {
  const { recuperar, calls } = await cargar({ apiResponses: [{ total: 2, elements: [{ id: 'a' }, { id: 'b' }] }] })
  await assert.rejects(recuperar(id))
  assert.equal(calls.api.length, 1)
})

test('preferencia: API oficial, UUID y total persistido; no usa importes del navegador ni el precio actual', async () => {
  const { crear, calls } = await cargar()
  const result = await crear(id, { total: 1, precio: 1, currency_id: 'USD' })
  assert.equal(result.id, 'preferencia-test')
  assert.equal(result.external_reference, id)
  assert.equal(calls.api.length, 1)
  const request = calls.api[0]
  assert.equal(request.url, 'https://api.mercadopago.com/checkout/preferences')
  assert.equal(request.method, 'POST')
  assert.equal(request.headers.Authorization, `Bearer ${token}`)
  assert.equal(request.cache, 'no-store')
  assert.equal(request.redirect, 'error')
  assert.ok(request.signal instanceof AbortSignal)
  assert.deepEqual(JSON.parse(JSON.stringify(request.body.items)), [{ id: 'senderos-del-fitz-roy', title: 'Senderos del Fitz Roy', quantity: 1, currency_id: 'ARS', unit_price: 190000 }])
  assert.equal(request.body.external_reference, id)
  assert.equal(request.body.notification_url, 'https://afuera-preview.example/api/mercado-pago/webhook')
  for (const estado of ['success', 'pending', 'failure']) {
    assert.equal(request.body.back_urls[estado], `https://afuera-preview.example/pago/resultado?resultado=${estado}`)
  }
  assert.equal(request.body.auto_return, 'approved')
  assert.equal(request.body.payer, undefined)
  assert.doesNotMatch(JSON.stringify(result), new RegExp(token))
  assert.equal(calls.db.length, 2)
  assert.deepEqual(calls.db[0].filtro, ['id', id])
  assert.doesNotMatch(calls.db[0].columnas, /email|nombre_comprador/)
  // El mock solo tiene lecturas: cualquier UPDATE/INSERT falla la prueba.
})

test('importe decimal exacto y URL de notificación configurable; fecha fuera de temporada aceptada', async () => {
  const { crear, calls } = await cargar({ reserva: { total: '123.45' }, env: { MP_NOTIFICATION_URL: 'https://hooks.example/mp' } })
  await crear(id)
  assert.equal(calls.api[0].body.items[0].unit_price, 123.45)
  assert.equal(calls.api[0].body.notification_url, 'https://hooks.example/mp')
})

for (const total of ['0.01', 123.4, '9999999999.99']) {
  test(`importe permitido: ${total}`, async () => {
    const { crear, calls } = await cargar({ reserva: { total } })
    await crear(id)
    assert.equal(calls.api[0].body.items[0].unit_price, Number(total))
  })
}

for (const [label, options] of [
  ['modo ausente', { env: { MP_TEST_MODE: '' } }],
  ['modo real', { env: { MP_TEST_MODE: 'false' } }],
  ['Production', { env: { VERCEL_ENV: 'production' } }],
  ['token ausente', { env: { MP_ACCESS_TOKEN: '' } }],
  ['origen ausente', { env: { APP_URL: '' } }],
  ['origen HTTP', { env: { APP_URL: 'http://localhost:3000' } }],
  ['origen con credenciales', { env: { APP_URL: 'https://user:password@example.com' } }],
  ['origen con ruta', { env: { APP_URL: 'https://example.com/otra' } }],
  ['origen con query', { env: { APP_URL: 'https://example.com?foo=bar' } }],
  ['notificación inválida', { env: { MP_NOTIFICATION_URL: 'http://hooks.example' } }],
]) {
  test(`configuración inválida bloquea antes de consultar servicios: ${label}`, async () => {
    const { crear, calls } = await cargar(options)
    await assert.rejects(crear(id))
    assert.equal(calls.api.length, 0)
    assert.equal(calls.clients, 0)
  })
}

test('UUID inválido se rechaza antes de acceder a Supabase o Mercado Pago', async () => {
  const { crear, calls } = await cargar()
  for (const value of ['', null, {}, 'no-es-un-uuid']) await assert.rejects(crear(value), /UUID/)
  assert.equal(calls.clients, 0)
  assert.equal(calls.api.length, 0)
})

for (const [label, options] of [
  ['error SQL o permisos', { dbError: true }], ['reserva inexistente', { missing: true }],
  ['reserva confirmada', { reserva: { estado: 'confirmada' } }],
  ['UUID inconsistente', { reserva: { id: '22222222-2222-4222-8222-222222222222' } }],
  ['preferencia existente', { reserva: { mercado_pago_preference_id: 'anterior' } }],
  ['fecha histórica nula', { reserva: { fecha_visita: null } }],
  ['fecha pasada', { reserva: { fecha_visita: '2000-01-01' } }],
  ['cantidad inválida', { reserva: { cantidad_personas: -1 } }],
  ['experiencia inactiva', { experiencia: { activo: false } }],
  ...['0', '-1', 'NaN', 'Infinity', '1.234', null, '10000000000.00'].map(total => [`importe inválido ${total}`, { reserva: { total } }]),
]) {
  test(`reserva no apta no crea preferencias: ${label}`, async () => {
    const { crear, calls } = await cargar(options)
    await assert.rejects(crear(id), error => !error.message.includes(token))
    assert.equal(calls.api.length, 0)
  })
}

for (const status of [400, 401, 403, 429, 500, 503]) {
  test(`error HTTP ${status}: mensaje seguro y sin reintento automático`, async () => {
    const { crear, calls } = await cargar({ response: { ok: false, status, json: async () => { throw new Error(token) } } })
    await assert.rejects(crear(id), new RegExp(`HTTP ${status}`))
    assert.equal(calls.api.length, 1)
  })
}

for (const [label, options] of [
  ['red o timeout', { networkError: true }], ['JSON inválido', { invalidJson: true }],
  ['sin ID', { response: { data: { id: null } } }],
  ['referencia ajena', { response: { data: { external_reference: 'otra' } } }],
  ['URL ajena', { response: { data: { init_point: 'https://malicioso.example/checkout' } } }],
  ['URL HTTP', { response: { data: { init_point: 'http://www.mercadopago.com.ar/checkout' } } }],
]) {
  test(`respuesta insegura o incierta: ${label}`, async () => {
    const { crear, calls } = await cargar(options)
    await assert.rejects(crear(id), error => !error.message.includes(token))
    assert.equal(calls.api.length, 1)
  })
}

test('cliente privado: clave solo en servidor, sin sesión ni caché', async () => {
  const source = await readFile(new URL('../src/lib/supabase/service-server.js', import.meta.url), 'utf8')
  let captured
  const context = createContext({ process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'privada-ficticia' } },
    fetch: async (input, init) => ({ input, init }) })
  const module = new SourceTextModule(source, { context })
  await module.link(specifier => {
    const values = specifier === 'server-only' ? {} : { createClient: (...args) => { captured = args; return 'cliente' } }
    return new SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value)
    }, { context })
  })
  await module.evaluate()
  assert.equal(module.namespace.crearClienteSupabasePrivado(), 'cliente')
  assert.equal(captured[1], 'privada-ficticia')
  assert.equal(captured[2].auth.persistSession, false)
  assert.equal(captured[2].auth.autoRefreshToken, false)
  const result = await captured[2].global.fetch('https://db.example', { cache: 'force-cache' })
  assert.equal(result.init.cache, 'no-store')
})
