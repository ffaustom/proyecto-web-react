import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import * as crypto from 'node:crypto'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformSync } from 'next/dist/build/swc/index.js'
import { validarReserva } from '../src/app/experiencias/[id]/validacion.js'

const id = '11111111-1111-4111-8111-111111111111'
const experienciaId = 'senderos-del-fitz-roy'
const values = { nombre_comprador: 'Ana Test', email: 'ana@example.com', cantidad_personas: '2', fecha_visita: '2099-07-15' }
const checkoutUrl = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=preferencia-test'

async function modulo(path, mocks, globals = {}, jsx = false) {
  let source = await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
  if (jsx) source = transformSync(source, { filename: path, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } }).code
  const context = createContext({ Buffer, Date, ...globals })
  const module = new SourceTextModule(source, { context })
  await module.link(specifier => {
    assert.ok(Object.hasOwn(mocks, specifier), `Import inesperado: ${specifier}`)
    const exports = mocks[specifier]
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value)
    }, { context })
  })
  await module.evaluate()
  return module.namespace
}

// Simula la transacción de la RPC; no sustituye su futura validación PostgreSQL.
async function flujo({ falloGuardado = false, respuestaPerdida = false, rechazo = false, sinRecuperacion = false, rpcError = false } = {}) {
  const state = { reserva: null, estado: null, preferencia: null, remota: null, posts: 0, operaciones: [] }
  const client = { async rpc(_nombre, args) {
    state.operaciones.push(args.p_operacion)
    if (rpcError) return { error: { message: 'secreto que nunca debe salir' } }
    if (args.p_operacion === 'preparar') {
      const datos = [args.p_experiencia_id, args.p_nombre, args.p_email, args.p_cantidad, args.p_fecha]
      if (state.reserva && JSON.stringify(state.reserva.datos) !== JSON.stringify(datos)) return { error: { message: 'CHECKOUT_DATOS_DISTINTOS' } }
      if (!state.reserva) { state.reserva = { id: args.p_id, datos, total: 95000 * args.p_cantidad }; state.estado = 'reservada' }
      const crear = state.estado === 'reservada'
      if (crear) state.estado = 'creando'
      return { data: { id: args.p_id, crear, preferencia_id: state.preferencia } }
    }
    if (args.p_operacion === 'guardar') {
      if (falloGuardado) { falloGuardado = false; return { error: { message: 'error privado de Supabase' } } }
      state.preferencia = args.p_preferencia
      state.estado = 'lista'
    }
    if (args.p_operacion === 'liberar') state.estado = 'reservada'
    return { data: { id: args.p_id, preferencia_id: state.preferencia } }
  } }
  const preferencia = { id: 'preferencia-test', init_point: checkoutUrl, external_reference: id }
  const exports = await modulo('lib/mercado-pago/checkout.js', {
    'server-only': {},
    '../supabase/service-server': { crearClienteSupabasePrivado: () => client },
    './server': {
      crearPreferenciaParaReserva: async reservaId => {
        state.posts++
        assert.equal(reservaId, id)
        if (rechazo) { rechazo = false; const error = new Error('rechazo privado'); error.rechazoDefinitivo = true; throw error }
        state.remota = preferencia
        if (respuestaPerdida) { respuestaPerdida = false; throw new Error('timeout con contenido privado') }
        return preferencia
      },
      recuperarPreferenciaParaReserva: async () => sinRecuperacion ? null : state.remota,
    },
  })
  return { ...exports, state }
}

test('crea una reserva pendiente, guarda preferencia antes de devolver la redirección y reutiliza el importe', async () => {
  const { prepararCheckout, state } = await flujo()
  assert.equal(await prepararCheckout(id, experienciaId, values, 2), checkoutUrl)
  assert.equal(state.reserva.total, 190000)
  assert.equal(state.preferencia, 'preferencia-test')
  assert.deepEqual(state.operaciones, ['preparar', 'guardar'])
  assert.equal(state.estado, 'lista')
})

test('doble envío simultáneo conserva un UUID y un solo POST a Mercado Pago', async () => {
  const { prepararCheckout, state } = await flujo()
  const results = await Promise.all([prepararCheckout(id, experienciaId, values, 2), prepararCheckout(id, experienciaId, values, 2)])
  assert.deepEqual(results, [checkoutUrl, checkoutUrl])
  assert.equal(state.reserva.id, id)
  assert.equal(state.posts, 1)
})

test('reintentar una preferencia guardada no crea otra reserva ni otro POST', async () => {
  const { prepararCheckout, state } = await flujo()
  await prepararCheckout(id, experienciaId, values, 2)
  const original = state.reserva
  assert.equal(await prepararCheckout(id, experienciaId, values, 2), checkoutUrl)
  assert.equal(state.reserva, original)
  assert.equal(state.posts, 1)
})

for (const options of [{ falloGuardado: true }, { respuestaPerdida: true }]) {
  test(`recupera fallo parcial sin duplicar: ${Object.keys(options)[0]}`, async () => {
    const { prepararCheckout, state } = await flujo(options)
    await assert.rejects(prepararCheckout(id, experienciaId, values, 2), error => !/privado|secreto/.test(error.message))
    assert.equal(state.preferencia, null)
    assert.equal(await prepararCheckout(id, experienciaId, values, 2), checkoutUrl)
    assert.equal(state.posts, 1)
    assert.equal(state.preferencia, 'preferencia-test')
  })
}

test('un resultado incierto sin preferencia visible no autoriza otro POST', async () => {
  const { prepararCheckout, state } = await flujo({ respuestaPerdida: true, sinRecuperacion: true })
  await assert.rejects(prepararCheckout(id, experienciaId, values, 2))
  await assert.rejects(prepararCheckout(id, experienciaId, values, 2), error => error.requiereRevision && error.message.includes('No crearemos otra preferencia automáticamente') && error.message.includes(id))
  assert.equal(state.posts, 1)
})

test('rechazo inequívoco permite reintentar conservando la reserva', async () => {
  const { prepararCheckout, state } = await flujo({ rechazo: true })
  await assert.rejects(prepararCheckout(id, experienciaId, values, 2))
  const original = state.reserva
  assert.equal(state.estado, 'reservada')
  assert.equal(await prepararCheckout(id, experienciaId, values, 2), checkoutUrl)
  assert.equal(state.reserva, original)
})

test('cambiar datos en un reintento no modifica la reserva existente', async () => {
  const { prepararCheckout, state } = await flujo()
  await prepararCheckout(id, experienciaId, values, 2)
  await assert.rejects(prepararCheckout(id, experienciaId, { ...values, email: 'otro@example.com' }, 2), /mismos datos/)
  assert.equal(state.posts, 1)
})

test('RPC ausente o sin permisos muestra error seguro y no llama a Mercado Pago', async () => {
  const { prepararCheckout, state } = await flujo({ rpcError: true })
  await assert.rejects(prepararCheckout(id, experienciaId, values, 2), error => !error.message.includes('secreto'))
  assert.equal(state.posts, 0)
})

async function firma(env = {}) {
  return modulo('lib/mercado-pago/intento.js', { 'server-only': {}, 'node:crypto': crypto }, {
    URL,
    process: { env: { CHECKOUT_SIGNING_SECRET: 'secreto-ficticio-de-al-menos-32-bytes', MP_TEST_MODE: 'true', MP_CHECKOUT_ENABLED: 'true',
      MP_ACCESS_TOKEN: 'token-ficticio', SUPABASE_SERVICE_ROLE_KEY: 'clave-ficticia', NEXT_PUBLIC_SUPABASE_URL: 'https://db.example', APP_URL: 'https://afuera.example', ...env } },
  })
}

test('intento firmado no contiene datos personales y no admite UUID, experiencia o firma manipulados', async () => {
  const { crearIntentoCheckout, verificarIntentoCheckout } = await firma()
  const token = crearIntentoCheckout(experienciaId)
  const payload = verificarIntentoCheckout(token, experienciaId)
  assert.match(payload.id, /^[0-9a-f-]{36}$/)
  assert.equal(payload.experienciaId, experienciaId)
  assert.deepEqual(Object.keys(payload).sort(), ['experienciaId', 'id', 'vence'])
  assert.throws(() => verificarIntentoCheckout(token, 'otra-experiencia'))
  assert.throws(() => verificarIntentoCheckout(`${Buffer.from(JSON.stringify({ ...payload, id })).toString('base64url')}.${token.split('.')[1]}`, experienciaId))
  assert.throws(() => verificarIntentoCheckout(`${token}.otro`, experienciaId))
  const vencido = Buffer.from(JSON.stringify({ ...payload, vence: 1 })).toString('base64url')
  const firmado = `${vencido}.${crypto.createHmac('sha256', 'secreto-ficticio-de-al-menos-32-bytes').update(vencido).digest('base64url')}`
  assert.throws(() => verificarIntentoCheckout(firmado, experienciaId))
})

test('checkout requiere habilitación explícita y permanece bloqueado en Production', async () => {
  assert.equal((await firma({ MP_CHECKOUT_ENABLED: 'false' })).checkoutHabilitado(), false)
  assert.equal((await firma({ VERCEL_ENV: 'production' })).checkoutHabilitado(), false)
  const sinClave = await firma({ CHECKOUT_SIGNING_SECRET: '' })
  assert.throws(() => sinClave.crearIntentoCheckout(experienciaId))
})

test('checkout permanece deshabilitado con configuración incompleta o firma insuficiente', async () => {
  assert.equal((await firma()).checkoutHabilitado(), true)
  for (const variable of ['MP_CHECKOUT_ENABLED', 'MP_TEST_MODE', 'CHECKOUT_SIGNING_SECRET', 'MP_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'APP_URL']) {
    assert.equal((await firma({ [variable]: '' })).checkoutHabilitado(), false, variable)
  }
  assert.equal((await firma({ CHECKOUT_SIGNING_SECRET: 'corto' })).checkoutHabilitado(), false)
  assert.equal((await firma({ APP_URL: 'http://localhost:3000' })).checkoutHabilitado(), false)
})

async function accion({ enabled = true, invalidToken = false, configError = false, prepareError = null, cookie = 'token-firmado' } = {}) {
  const calls = { prepare: [], cookies: [], redirects: [] }
  const { ErrorCheckout } = await flujo()
  const exports = await modulo('app/experiencias/[id]/checkout-actions.js', {
    'next/headers': { cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined, set: (...args) => calls.cookies.push(args), delete() {} }) },
    'next/navigation': { redirect: url => { calls.redirects.push(url); throw new Error(`redirect:${url}`) } },
    './validacion': { validarReserva },
    '../../../lib/mercado-pago/checkout': { ErrorCheckout, prepararCheckout: async (...args) => {
      calls.prepare.push(args)
      if (prepareError) throw new ErrorCheckout(prepareError, true)
      return checkoutUrl
    } },
    '../../../lib/mercado-pago/server': { verificarConfiguracionMercadoPago: () => { if (configError) throw new Error('configuración privada') } },
    '../../../lib/mercado-pago/intento': { checkoutHabilitado: () => enabled,
      verificarIntentoCheckout: () => { if (invalidToken) throw new Error('firma inválida'); return { id, vence: Date.now() + 60000 } },
      nombreCookieCheckout: () => 'afuera_checkout_test' },
  }, { process: { env: { NODE_ENV: 'production' } } })
  return { ...exports, calls }
}

function form() {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

test('Server Action exige fecha incluso si el formulario viejo omite el campo', async () => {
  const { iniciarCheckout, calls } = await accion()
  for (const fecha of [null, '', '2099-02-30']) {
    const data = form()
    if (fecha === null) data.delete('fecha_visita'); else data.set('fecha_visita', fecha)
    assert.ok((await iniciarCheckout(experienciaId, 'token', null, data)).errors.fecha_visita)
  }
  assert.equal(calls.prepare.length, 0)
})

test('Server Action redirige fuera del catch solo con la cookie previamente establecida', async () => {
  const { iniciarCheckout, calls } = await accion()
  const data = form()
  data.set('total', '1')
  data.set('estado', 'confirmada')
  await assert.rejects(iniciarCheckout(experienciaId, 'token-firmado', null, data), { message: `redirect:${checkoutUrl}` })
  assert.equal(calls.prepare[0][0], id)
  assert.equal(calls.prepare[0][2].total, undefined)
  assert.equal(calls.prepare[0][2].estado, undefined)
  assert.equal(calls.prepare[0][2].fecha_visita, '2099-07-15')
  assert.equal(calls.cookies.length, 0)
})

test('bootstrap establece cookie HttpOnly antes de habilitar reservas y nunca llama al coordinador', async () => {
  const { establecerIntentoCheckout, calls } = await accion({ cookie: null })
  for (let click = 0; click < 2; click++) {
    await assert.rejects(establecerIntentoCheckout(experienciaId, 'mismo-candidato'), { message: `redirect:/experiencias/${experienciaId}` })
  }
  assert.equal(calls.prepare.length, 0)
  assert.equal(calls.cookies[0][1], calls.cookies[1][1])
  assert.equal(calls.cookies[0][2].httpOnly, true)
  assert.equal(calls.cookies[0][2].secure, true)
  assert.equal(calls.cookies[0][2].sameSite, 'lax')
})

test('bootstrap conserva una cookie ya existente en lugar de reemplazar su UUID', async () => {
  const { establecerIntentoCheckout, calls } = await accion()
  await assert.rejects(establecerIntentoCheckout(experienciaId, 'otro-candidato'), /redirect:/)
  assert.equal(calls.cookies[0][1], 'token-firmado')
  assert.equal(calls.prepare.length, 0)
})

for (const cookie of [null, 'otro-token']) {
  test(`sin cookie confirmada o con formulario viejo no crea reservas: ${cookie}`, async () => {
    const { iniciarCheckout, calls } = await accion({ cookie })
    const result = await iniciarCheckout(experienciaId, 'token-firmado', null, form())
    assert.match(result.error, /No encontramos el intento/)
    assert.equal(calls.prepare.length, 0)
    assert.equal(calls.cookies.length, 0)
  })
}

test('reintento después de medianoche conserva fecha original para que la RPC decida si solo recupera', async () => {
  const { iniciarCheckout, calls } = await accion()
  const data = form()
  data.set('fecha_visita', '2000-01-01')
  await assert.rejects(iniciarCheckout(experienciaId, 'token-firmado', null, data), /redirect:/)
  assert.equal(calls.prepare[0][2].fecha_visita, '2000-01-01')
})

for (const options of [{ enabled: false }, { invalidToken: true }, { configError: true }]) {
  test(`configuración o autorización inválida no crea reservas: ${Object.keys(options)[0]}`, async () => {
    const { iniciarCheckout, calls } = await accion(options)
    const result = await iniciarCheckout(experienciaId, 'token', null, form())
    assert.ok(result.error)
    assert.equal(calls.prepare.length, 0)
    assert.equal(calls.cookies.length, 0)
  })
}

test('retorno no confirma pagos ni expone parámetros manipulados', async () => {
  const jsx = await import('react/jsx-runtime')
  const { default: Resultado } = await modulo('app/pago/resultado/page.jsx', {
    'react/jsx-runtime': jsx, 'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  }, {}, true)
  const html = renderToStaticMarkup(React.createElement(Resultado, { searchParams: { status: 'approved', email: 'dato-privado@example.com' } }))
  assert.match(html, /no confirma el pago/)
  assert.doesNotMatch(html, /approved|dato-privado/)
})

test('RPC restringida al backend, con bloqueo durable, importe en base y sin cambios a RLS anterior', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261110140000_prepare_checkout_idempotent.sql', import.meta.url), 'utf8')
  assert.match(sql, /BEGIN;/)
  assert.match(sql, /COMMIT;/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /importe := experiencia\.precio \* p_cantidad/)
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = ''/)
  assert.match(sql, /FROM PUBLIC, anon, authenticated;/)
  assert.match(sql, /GRANT EXECUTE[\s\S]*TO service_role;/)
  assert.doesNotMatch(sql, /CREATE POLICY|DROP POLICY|ALTER POLICY|ALTER TABLE public\.reservas/)
  assert.match(sql, /reserva_id uuid PRIMARY KEY/)
})
