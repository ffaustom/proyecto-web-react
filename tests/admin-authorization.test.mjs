import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'

const root = fileURLToPath(new URL('../', import.meta.url))
const adminId = '11111111-1111-4111-8111-111111111111'
const commonId = '22222222-2222-4222-8222-222222222222'

// Ejecutar los módulos reales con Auth/Next simulados, sin sesión ni red reales.
async function loadModule(path, { id = adminId, configuredId = adminId, authError = null } = {}) {
  const context = createContext({ process: { env: { ADMIN_USER_ID: configuredId } } })
  const calls = { writes: 0, signOut: 0, validation: 0 }
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: id ? { id } : null }, error: authError }),
      signInWithPassword: async () => ({ data: { user: { id } }, error: null }),
      signOut: async () => { calls.signOut++; return { error: null } },
    },
    from: () => { calls.writes++; throw new Error('Unexpected database access') },
  }
  const mocks = {
    'server-only': {},
    'next/navigation': { redirect: (url) => { throw new Error(`redirect:${url}`) } },
    'next/cache': { revalidatePath: () => {} },
    'auth-server': { crearClienteAuth: async () => supabase },
    'validacion': { validarExperiencia: () => { calls.validation++; throw new Error('Unexpected validation') } },
  }
  const modules = new Map()
  async function getModule(filename) {
    if (modules.has(filename)) return modules.get(filename)
    const module = new SourceTextModule(await readFile(filename, 'utf8'), { context, identifier: filename })
    modules.set(filename, module)
    await module.link(async (specifier, parent) => {
      const key = Object.hasOwn(mocks, specifier) ? specifier : specifier.split('/').at(-1)
      if (Object.hasOwn(mocks, key)) {
        const values = mocks[key]
        return new SyntheticModule(Object.keys(values), function () {
          for (const [name, value] of Object.entries(values)) this.setExport(name, value)
        }, { context })
      }
      return getModule(resolve(dirname(parent.identifier), `${specifier}.js`))
    })
    return module
  }
  const module = await getModule(resolve(root, path))
  await module.evaluate()
  return { exports: module.namespace, calls, supabase }
}

test('el helper acepta únicamente el administrador y devuelve el cliente con su sesión', async () => {
  const { exports, supabase } = await loadModule('src/lib/supabase/admin-server.js')
  assert.equal(exports.esAdministrador({ id: adminId }), true)
  assert.equal(exports.esAdministrador({ id: commonId }), false)
  assert.equal(exports.esAdministrador(null), false)
  assert.equal(await exports.requerirAdministrador(), supabase)
})

const deniedCases = [
  ['visitante', { id: null }, '/admin/login'],
  ['usuario común', { id: commonId }, '/'],
  ['sesión inválida aunque el UUID coincida', { authError: { message: 'Expired' } }, '/admin/login'],
  ['configuración ausente', { configuredId: '' }, '/'],
  ['configuración inválida', { configuredId: 'invalid' }, '/'],
]

for (const [label, options, destination] of deniedCases) {
  test(`el helper deniega ${label}`, async () => {
    const { exports } = await loadModule('src/lib/supabase/admin-server.js', options)
    await assert.rejects(exports.requerirAdministrador(), { message: `redirect:${destination}` })
  })
  for (const [path, action] of [
    ['src/app/admin/nueva/actions.js', 'crearExperiencia'],
    ['src/app/admin/experiencias/[id]/editar/actions.js', 'actualizarExperiencia'],
    ['src/app/admin/delete-actions.js', 'eliminarExperiencia'],
  ]) {
    test(`${action} bloquea ${label} antes de validar o acceder a la base`, async () => {
      const { exports, calls } = await loadModule(path, options)
      await assert.rejects(exports[action]('test-id', null, new FormData()), { message: `redirect:${destination}` })
      assert.equal(calls.writes, 0)
      assert.equal(calls.validation, 0)
    })
  }
}

for (const [label, options] of [
  ['usuario común', { id: commonId }],
  ['configuración ausente', { configuredId: '' }],
  ['configuración inválida', { configuredId: 'invalid' }],
]) {
  test(`el login rechaza ${label} y cierra la sesión local`, async () => {
    const { exports, calls } = await loadModule('src/app/admin/login/actions.js', options)
    const data = new FormData()
    data.set('email', 'test@example.com')
    data.set('password', 'test-only')
    const result = await exports.iniciarSesion(null, data)
    assert.match(result.error, /no tiene permiso/)
    assert.equal(calls.signOut, 1)
  })
}

test('el login del administrador redirige al panel', async () => {
  const { exports, calls } = await loadModule('src/app/admin/login/actions.js')
  const data = new FormData()
  data.set('email', 'test@example.com')
  data.set('password', 'test-only')
  await assert.rejects(exports.iniciarSesion(null, data), { message: 'redirect:/admin' })
  assert.equal(calls.signOut, 0)
})
