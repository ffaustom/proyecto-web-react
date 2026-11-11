import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'

// Auditoría estática del alcance SQL. No ejecuta la migración ni accede al remoto.
const nombre = '20261110130000_grant_service_role_checkout_columns.sql'
const directorio = new URL('../supabase/migrations/', import.meta.url)
const leer = async nombre => readFile(new URL(nombre, directorio), 'utf8')
const sinComentarios = sql => sql.replace(/--[^\n]*/g, '').trim()
const sql = sinComentarios(await leer(nombre))
const sentencias = sql.split(';').map(value => value.trim()).filter(Boolean)
const concesiones = sentencias.slice(2, -1).map(sentencia => {
  const match = sentencia.match(/^GRANT (SELECT|UPDATE)\s*\(([^)]+)\)\s+ON TABLE public\.(reservas|experiencias) TO service_role$/)
  assert.ok(match, 'Solo se permiten GRANT por columna al rol service_role')
  return { permiso: match[1], tabla: match[3], columnas: match[2].split(',').map(value => value.trim()) }
})
const columnas = (tabla, permiso) => concesiones.find(item => item.tabla === tabla && item.permiso === permiso)?.columnas ?? []

test('migración transaccional, con espera acotada y sin DML, cambios RLS ni permisos públicos', () => {
  assert.equal(sentencias[0], 'BEGIN')
  assert.equal(sentencias[1], "SET LOCAL lock_timeout = '5s'")
  assert.equal(sentencias.at(-1), 'COMMIT')
  assert.equal(sentencias.length, 6)
  assert.equal(concesiones.length, 3)
  assert.doesNotMatch(sql, /\b(?:anon|authenticated|PUBLIC|POLICY|ALTER|INSERT|DELETE|TRUNCATE|DROP|REVOKE|FUNCTION|ALL)\b/)
})

test('permisos limitados a columnas operativas; sin lectura de identidad ni escritura de datos de reserva', () => {
  assert.deepEqual(columnas('reservas', 'SELECT'), [
    'id', 'experiencia_id', 'cantidad_personas', 'total', 'estado', 'fecha_visita',
    'mercado_pago_preference_id', 'mercado_pago_payment_id', 'mercado_pago_status',
  ])
  assert.deepEqual(columnas('reservas', 'UPDATE'), [
    'estado', 'mercado_pago_preference_id', 'mercado_pago_payment_id', 'mercado_pago_status',
  ])
  assert.deepEqual(columnas('experiencias', 'SELECT'), ['id', 'titulo', 'activo'])
  assert.deepEqual(columnas('experiencias', 'UPDATE'), [])
})

test('los SELECT del módulo real y los campos para registrar pagos están cubiertos', async () => {
  const modulo = await readFile(new URL('../src/lib/mercado-pago/server.js', import.meta.url), 'utf8')
  const consultas = [...modulo.matchAll(/\.from\('([^']+)'\)\s*\.select\('([^']+)'\)/g)]
  assert.equal(consultas.length, 2)
  for (const [, tabla, seleccion] of consultas) {
    for (const columna of seleccion.split(',')) {
      assert.ok(columnas(tabla, 'SELECT').includes(columna), `Falta SELECT sobre ${tabla}.${columna}`)
    }
  }
  // Un futuro webhook puede filtrar por UUID, validar el importe y actualizar
  // estado y metadatos sin acceso a identidad ni permisos sobre el importe.
  for (const columna of ['id', 'total', 'estado', 'mercado_pago_preference_id', 'mercado_pago_payment_id', 'mercado_pago_status']) {
    assert.ok(columnas('reservas', 'SELECT').includes(columna))
  }
  for (const columna of ['estado', 'mercado_pago_preference_id', 'mercado_pago_payment_id', 'mercado_pago_status']) {
    assert.ok(columnas('reservas', 'UPDATE').includes(columna))
  }
})

test('versión única posterior a dependencias; tablas y columnas existen antes; fase 2 sigue diferida', async () => {
  const archivos = (await readdir(directorio)).filter(value => value.endsWith('.sql')).sort()
  const versiones = archivos.map(value => value.split('_')[0])
  assert.equal(new Set(versiones).size, versiones.length)
  assert.ok(archivos.includes(nombre))
  assert.ok(!archivos.includes('20261108130000_require_reservas_fecha_visita.sql'))
  const previas = sinComentarios((await Promise.all(archivos.filter(value => value < nombre).map(leer))).join('\n'))
  for (const concesion of concesiones) {
    const definicion = previas.match(new RegExp(`CREATE TABLE public\\.${concesion.tabla} \\(([\\s\\S]*?)\\n\\);`))
    assert.ok(definicion, `La tabla ${concesion.tabla} debe existir previamente`)
    for (const columna of concesion.columnas) {
      const creada = new RegExp(`\\b${columna}\\s+(?:uuid|text|integer|numeric|date|boolean)\\b`).test(definicion[1])
      const agregada = new RegExp(`ALTER TABLE public\\.${concesion.tabla} ADD COLUMN ${columna}\\b`).test(previas)
      assert.ok(creada || agregada, `La columna ${concesion.tabla}.${columna} debe existir previamente`)
    }
  }
  assert.doesNotMatch(previas, /\b(?:GRANT|REVOKE)[^;]*\bservice_role\b/i)
})
