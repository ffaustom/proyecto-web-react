import { realpath, stat, mkdtemp, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { ErrorCargaEditorial, cargarContenidoEditorial, prepararCargaEditorial } from '../src/lib/carga-editorial.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)

function jwtRole(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role } catch { return null }
}

async function main() {
  if (args.length > 1 || args.some((arg) => !['--dry-run', '--check-remote', '--apply'].includes(arg))) throw new ErrorCargaEditorial('Usá --dry-run (predeterminado), --check-remote o --apply.')
  const plan = prepararCargaEditorial()
  const publicDir = await realpath(resolve(root, 'public'))
  for (const item of plan) {
    for (const foto of item.cambios.galeria) {
      const archivo = await realpath(resolve(publicDir, foto.src.slice(1)))
      const path = relative(publicDir, archivo)
      if (path.startsWith('..') || isAbsolute(path) || !(await stat(archivo)).isFile()) throw new ErrorCargaEditorial('Una fotografía no existe dentro de public.')
    }
  }
  if (!args.length || args[0] === '--dry-run') {
    console.table(plan.map(({ id, cambios }) => ({ id, fotosAdicionales: cambios.galeria.length, secciones: cambios.contenido_editorial.secciones.length })))
    console.log('Validación local correcta. Sin conexión ni escrituras en Supabase.')
    return
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const token = process.env.AFUERA_ADMIN_ACCESS_TOKEN
  if (!url || !key || !token || !process.env.ADMIN_USER_ID) throw new ErrorCargaEditorial('Falta la configuración del servidor o el token temporal del administrador. No se muestran sus valores.')
  if (!(key.startsWith('sb_publishable_') || jwtRole(key) === 'anon') || jwtRole(token) !== 'authenticated') throw new ErrorCargaEditorial('Solo se permite la clave pública y un token de usuario authenticated; nunca claves privadas ni service_role.')
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const resumen = await cargarContenidoEditorial(supabase, {
    adminUserId: process.env.ADMIN_USER_ID.trim(), accessToken: token, aplicar: args[0] === '--apply',
    antesDeEscribir: async (filas) => {
      const backupDir = await mkdtemp(join(tmpdir(), 'afuera-contenido-'))
      const path = join(backupDir, 'antes.json')
      await writeFile(path, JSON.stringify(filas, null, 2), { mode: 0o600, flag: 'wx' })
      console.log(`Respaldo local antes de escribir: ${path}`)
    },
    alGuardar: (id) => console.log(`Actualizado: ${id}`),
  })
  console.table(resumen)
  if (args[0] === '--check-remote') console.log('Comprobación remota de solo lectura. No se guardaron datos.')
}

main().catch((error) => {
  // Evitar volcar respuestas del proveedor o valores de configuración sensibles.
  if (error instanceof ErrorCargaEditorial) console.error(error.message)
  console.error('Carga detenida. Revisá sesión, columnas, contenido existente y coincidencia de los datos aprobados. Si hubo actualizaciones previas, repetí --check-remote; no se revierte contenido automáticamente.')
  process.exitCode = 1
})
