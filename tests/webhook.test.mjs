import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import * as crypto from 'node:crypto'

// Solo fixtures y dobles locales: no carga .env.local, no conecta APIs ni ejecuta SQL.
const secret = 'webhook-ficticio-independiente'
const reservaId = '11111111-1111-4111-8111-111111111111'
const otraReserva = '22222222-2222-4222-8222-222222222222'
const pagoBase = { id: 12345, collector_id: 67890, external_reference: reservaId,
  transaction_amount: 190000.50, transaction_amount_refunded: 0, currency_id: 'ARS', status: 'approved',
  order: { id: 34567, type: 'mercadopago' }, date_last_updated: '2026-11-11T12:00:00.000Z' }
const ordenBase = { id: 34567, preference_id: 'preferencia-test', external_reference: reservaId,
  collector: { id: 67890 }, payments: [{ id: 12345 }] }

function request({ id = '12345', ts = String(Math.floor(Date.now() / 1000)), requestId = 'request-test',
  key = secret, signature, query = '', body = { status: 'approved', data: { id: 'otro' } } } = {}) {
  const v1 = crypto.createHmac('sha256', key).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex')
  return new Request(`https://afuera.example/api/mercado-pago/webhook?data.id=${id}&type=payment${query}`, {
    method: 'POST', headers: { 'x-request-id': requestId, 'x-signature': signature ?? `ts=${ts},v1=${v1}` },
    body: JSON.stringify(body),
  })
}

async function cargar({ pago = {}, orden = {}, reserva = {}, sinReserva = false, apiError = false,
  jsonError = false, httpError = false, dbError = false, rpcError = false, rpcResultado = 'aplicado', env = {} } = {}) {
  const calls = { api: [], rpc: [], select: [], logs: [] }
  const client = {
    from(tabla) {
      assert.equal(tabla, 'reservas')
      return {
        select(columnas) { calls.select.push(columnas); return this },
        eq(columna, value) { assert.equal(columna, 'id'); calls.reference = value; return this },
        abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return this },
        async maybeSingle() { return { error: dbError, data: sinReserva ? null : {
          id: reservaId, total: '190000.50', mercado_pago_preference_id: 'preferencia-test', ...reserva,
        } } },
      }
    },
    rpc(nombre, args) {
      assert.equal(nombre, 'registrar_pago_verificado')
      calls.rpc.push(args)
      return { abortSignal(signal) {
        assert.ok(signal instanceof AbortSignal)
        return Promise.resolve({ error: rpcError, data: rpcResultado })
      } }
    },
  }
  const context = createContext({ Buffer, URL, Response, Date, AbortSignal,
    console: { warn: (...args) => calls.logs.push(args) },
    process: { env: { MP_WEBHOOK_SECRET: secret, CHECKOUT_SIGNING_SECRET: 'otra-clave-ficticia',
      MP_ACCESS_TOKEN: 'token-ficticio-no-registrar', MP_WEBHOOK_COLLECTOR_ID: '67890',
      MP_TEST_MODE: 'true', VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: 'https://db.example',
      SUPABASE_SERVICE_ROLE_KEY: 'clave-ficticia', ...env } },
    fetch: async (url, init) => {
      calls.api.push({ url, init })
      assert.equal(init.method, 'GET')
      assert.equal(init.cache, 'no-store')
      assert.equal(init.redirect, 'error')
      assert.ok(init.signal instanceof AbortSignal)
      if (apiError) throw new Error('token-ficticio-no-registrar')
      return { ok: !httpError, json: async () => {
        if (jsonError) throw new Error('respuesta-privada')
        if (url.endsWith('/v1/payments/12345')) return { ...pagoBase, ...pago }
        assert.equal(url, 'https://api.mercadopago.com/merchant_orders/34567')
        return { ...ordenBase, ...orden }
      } }
    },
  })
  const module = new SourceTextModule(await readFile(new URL('../src/lib/mercado-pago/webhook.js', import.meta.url), 'utf8'), { context })
  const mocks = { 'server-only': {}, 'node:crypto': crypto,
    '../supabase/service-server': { crearClienteSupabasePrivado: () => client } }
  await module.link(name => {
    assert.ok(Object.hasOwn(mocks, name))
    const exports = mocks[name]
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  return { ...module.namespace, calls }
}

test('firma HMAC válida en segundos y milisegundos, sin depender del body', async () => {
  const { verificarFirmaWebhook } = await cargar()
  for (const ts of [String(Math.floor(Date.now() / 1000)), String(Date.now())]) {
    assert.equal(verificarFirmaWebhook(request({ ts }), secret), '12345')
  }
})

test('vector de firma fijo independiente del reloj', async () => {
  const { verificarFirmaWebhook } = await cargar()
  // Vector calculado independientemente con Python hmac/hashlib y clave ficticia.
  const req = request({ signature: 'ts=1700000000,v1=c06fc16c3893a1a8571deb6803baa10612da83e218a4f0809a24d945bea15ec6' })
  assert.equal(verificarFirmaWebhook(req, secret, 1700000000000), '12345')
  assert.equal(verificarFirmaWebhook(req, secret, 1700000300001), null)
  assert.equal(verificarFirmaWebhook(req, secret, 1699999699999), null)
})

for (const [nombre, opciones] of [
  ['clave incorrecta', { key: 'otra' }], ['hash inválido', { signature: 'ts=1700000000,v1=xyz' }],
  ['firma duplicada', { signature: 'ts=1700000000,ts=1700000000' }],
  ['firma ausente', { signature: '' }], ['request-id ausente', { requestId: '' }],
  ['timestamp vencido', { ts: '1700000000' }], ['timestamp futuro', { ts: '9999999999' }],
  ['query ambigua', { query: '&data.id=999' }], ['ID no numérico', { id: '../users' }],
]) {
  test(`rechaza ${nombre} antes de consultar proveedores`, async () => {
    const { recibirWebhook, calls } = await cargar()
    assert.equal((await recibirWebhook(request(opciones))).status, 401)
    assert.equal(calls.api.length, 0)
    assert.equal(calls.rpc.length, 0)
  })
}

for (const estado of ['approved', 'pending', 'in_process', 'authorized', 'rejected', 'cancelled']) {
  test(`consulta pago y orden por API antes de persistir ${estado}`, async () => {
    const { recibirWebhook, calls } = await cargar({ pago: { status: estado } })
    const response = await recibirWebhook(request({ body: { status: 'approved', external_reference: otraReserva } }))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(calls.api.length, 2)
    assert.equal(calls.rpc.length, 1)
    assert.equal(calls.reference, reservaId)
    assert.equal(calls.rpc[0].p_reserva_id, reservaId)
    assert.equal(calls.rpc[0].p_estado, estado)
    assert.equal(calls.rpc[0].p_payment_id, '12345')
    assert.equal(calls.rpc[0].p_importe, 190000.50)
    assert.equal(calls.rpc[0].p_moneda, 'ARS')
    assert.equal(calls.rpc[0].p_preferencia, 'preferencia-test')
  })
}

for (const [nombre, opciones] of [
  ['pago distinto', { pago: { id: 54321 } }],
  ['vendedor ajeno', { pago: { collector_id: 111 } }],
  ['referencia inválida', { pago: { external_reference: 'otra' } }],
  ['referencia a otra reserva existente', { pago: { external_reference: otraReserva }, reserva: { id: otraReserva } }],
  ['reserva inexistente', { sinReserva: true }],
  ['importe distinto', { pago: { transaction_amount: 1 } }],
  ['importe con fracciones de centavo', { pago: { transaction_amount: 190000.501 } }],
  ['importe nulo', { pago: { transaction_amount: 0 } }],
  ['aprobado con reembolso parcial', { pago: { transaction_amount_refunded: 100 } }],
  ['aprobado sin dato de reembolso', { pago: { transaction_amount_refunded: undefined } }],
  ['moneda distinta', { pago: { currency_id: 'USD' } }],
  ['fecha de actualización inválida', { pago: { date_last_updated: 'ayer' } }],
  ['tipo de orden distinto', { pago: { order: { type: 'otra', id: 34567 } } }],
  ['preferencia ajena con igual referencia e importe', { orden: { preference_id: 'ajena' } }],
  ['referencia de orden distinta', { orden: { external_reference: otraReserva } }],
  ['orden de otro vendedor', { orden: { collector: { id: 111 } } }],
  ['ID de orden distinto', { orden: { id: 777 } }],
  ['pago reembolsado', { pago: { status: 'refunded' } }],
]) {
  test(`no actualiza reservas: ${nombre}`, async () => {
    const { recibirWebhook, calls } = await cargar(opciones)
    assert.equal((await recibirWebhook(request())).status, 200)
    assert.equal(calls.rpc.length, 0)
  })
}

for (const opciones of [{ apiError: true }, { jsonError: true }, { httpError: true }, { dbError: true }, { rpcError: true },
  { reserva: { mercado_pago_preference_id: null } }, { rpcResultado: null },
  { orden: { payments: [{ id: 54321 }] } }]) {
  test(`fallos reintentables no se reconocen como éxito: ${Object.keys(opciones)[0]}`, async () => {
    const { recibirWebhook, calls } = await cargar(opciones)
    const response = await recibirWebhook(request())
    assert.equal(response.status, 503)
    assert.equal(await response.text(), '')
    assert.doesNotMatch(JSON.stringify(calls.logs), /token-ficticio|clave-ficticia|respuesta-privada|webhook-ficticio/)
  })
}

test('entregas duplicadas y simultáneas usan la misma operación atómica, sin inserts', async () => {
  const { recibirWebhook, calls } = await cargar({ rpcResultado: 'duplicado' })
  const responses = await Promise.all([recibirWebhook(request()), recibirWebhook(request())])
  assert.ok(responses.every(response => response.status === 200))
  assert.deepEqual(calls.rpc[0], calls.rpc[1])
})

test('reintento tras perder respuesta SQL repite la misma identidad sin crear pagos', async () => {
  const fallo = await cargar({ rpcError: true })
  assert.equal((await fallo.recibirWebhook(request())).status, 503)
  const recuperado = await cargar({ rpcResultado: 'ignorado' })
  assert.equal((await recuperado.recibirWebhook(request())).status, 200)
  assert.deepEqual(JSON.parse(JSON.stringify(fallo.calls.rpc)), JSON.parse(JSON.stringify(recuperado.calls.rpc)))
})

for (const env of [{ MP_WEBHOOK_SECRET: '' }, { MP_WEBHOOK_SECRET: 'otra-clave-ficticia' },
  { MP_WEBHOOK_COLLECTOR_ID: '' }, { MP_TEST_MODE: 'false' }, { VERCEL_ENV: 'production' }]) {
  test(`configuración inválida bloquea procesamiento: ${Object.keys(env)[0]}`, async () => {
    const { recibirWebhook, calls } = await cargar({ env })
    assert.equal((await recibirWebhook(request())).status, 503)
    assert.equal(calls.api.length, 0)
  })
}

test('endpoint POST delega al módulo servidor y usa runtime Node', async () => {
  const module = new SourceTextModule(await readFile(new URL('../src/app/api/mercado-pago/webhook/route.js', import.meta.url), 'utf8'))
  const req = request()
  await module.link(name => {
    assert.equal(name, '../../../../lib/mercado-pago/webhook')
    return new SyntheticModule(['recibirWebhook'], function () {
      this.setExport('recibirWebhook', value => { assert.equal(value, req); return new Response(null, { status: 200 }) })
    })
  })
  await module.evaluate()
  assert.equal(module.namespace.runtime, 'nodejs')
  assert.equal((await module.namespace.POST(req)).status, 200)
})

test('contrato SQL: bloqueo, referencia/importe, aprobación terminal y permisos privados (sin ejecutar SQL)', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261111120000_registrar_pago_verificado.sql', import.meta.url), 'utf8')
  assert.match(sql, /BEGIN;/)
  assert.match(sql, /COMMIT;/)
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = ''/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /checkout_intentos WHERE reserva_id = p_reserva_id FOR UPDATE/)
  assert.match(sql, /reservas WHERE id = p_reserva_id FOR UPDATE/)
  assert.match(sql, /mercado_pago_preference_id IS DISTINCT FROM p_preferencia/)
  assert.match(sql, /reserva.total IS DISTINCT FROM p_importe/)
  assert.match(sql, /p_moneda IS DISTINCT FROM 'ARS'/)
  assert.match(sql, /IF reserva.estado <> 'pendiente' THEN RETURN 'ignorado'/)
  assert.match(sql, /mercado_pago_updated_at >= p_actualizado[\s\S]*RETURN 'duplicado'/)
  assert.match(sql, /CASE WHEN p_estado = 'approved' THEN 'confirmada' ELSE 'pendiente' END/)
  assert.match(sql, /FROM PUBLIC, anon, authenticated;/)
  assert.match(sql, /GRANT EXECUTE[\s\S]*TO service_role;/)
  assert.doesNotMatch(sql, /CREATE POLICY|DROP POLICY|ALTER POLICY|DISABLE ROW LEVEL|INSERT INTO|DELETE FROM/)
  const esquema = await readFile(new URL('../supabase/migrations/20261029120000_create_reservas.sql', import.meta.url), 'utf8')
  assert.match(esquema, /UNIQUE \(mercado_pago_payment_id\)/)
})
