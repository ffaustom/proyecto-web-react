import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'

// Comprobaciones estáticas del contrato de despliegue. No ejecutan migraciones
// ni reemplazan las pruebas RLS reales indicadas en README para el entorno destino.
const leer = async path => (await readFile(new URL(`../supabase/${path}`, import.meta.url), 'utf8'))
  .replace(/--[^\n]*/g, '').trim()
const expansion = await leer('migrations/20261108120000_add_reservas_fecha_visita.sql')
const exigencia = await leer('deferred/20261108130000_require_reservas_fecha_visita.sql')

test('solo expansión queda en la cola automática de migraciones', async () => {
  const archivos = await readdir(new URL('../supabase/migrations/', import.meta.url))
  assert.ok(archivos.includes('20261108120000_add_reservas_fecha_visita.sql'))
  assert.ok(!archivos.includes('20261108130000_require_reservas_fecha_visita.sql'))
})

test('fase 1 agrega DATE nullable sin default, backfill ni cambios en reservas existentes', () => {
  assert.match(expansion, /ALTER TABLE public\.reservas ADD COLUMN fecha_visita date;/)
  assert.doesNotMatch(expansion, /\b(?:DEFAULT|UPDATE|DELETE|TRUNCATE|DROP|NOT NULL)\b/i)
  assert.match(expansion, /GRANT INSERT \(fecha_visita\) ON TABLE public\.reservas TO anon;/)
  assert.match(expansion, /ON public\.reservas AS RESTRICTIVE\s+FOR INSERT TO anon/)
  assert.match(expansion, /WITH CHECK \(\s*fecha_visita IS NULL\s+OR \(\s*fecha_visita >= \(statement_timestamp\(\) AT TIME ZONE 'America\/Argentina\/Buenos_Aires'\)::date\s+AND fecha_visita <= DATE '9999-12-31'\s*\)\s*\);/)
})

test('fase 2 exige presencia por INSERT restrictivo sin tocar el historial ni la política de fechas', () => {
  assert.match(exigencia, /ON public\.reservas AS RESTRICTIVE\s+FOR INSERT TO anon\s+WITH CHECK \(fecha_visita IS NOT NULL\);/)
  assert.doesNotMatch(exigencia, /\b(?:ALTER TABLE|UPDATE|DELETE|TRUNCATE|DROP|GRANT|REVOKE)\b/i)
})

test('ambas fases son transaccionales, acotan espera de bloqueo y no amplían pagos ni autorización', () => {
  for (const sql of [expansion, exigencia]) {
    assert.match(sql, /^BEGIN;/)
    assert.match(sql, /COMMIT;$/)
    assert.match(sql, /SET LOCAL lock_timeout = '5s';/)
    assert.doesNotMatch(sql, /\b(?:experiencias|authenticated|mercado_pago|SECURITY DEFINER|FOR UPDATE|FOR ALL|FOR SELECT|FOR DELETE)\b/i)
  }
})
