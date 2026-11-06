import relatos from '../data/contenido-editorial-aprobado.json' with { type: 'json' }
import { galeriasPreparadas } from '../data/galerias.js'
import { experiencias as referencias } from '../data/experiencias.js'
import { camposEditorialesParaFormulario, validarCamposEditoriales } from './contenido-editorial.js'

export class ErrorCargaEditorial extends Error {}

export function iguales(a, b) {
  function ordenar(value) {
    if (Array.isArray(value)) return value.map(ordenar)
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordenar(value[key])]))
    return value
  }
  return JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b))
}

export function prepararCargaEditorial() {
  if (Object.keys(relatos).length !== 6 || galeriasPreparadas.length !== 6) throw new ErrorCargaEditorial('Se esperan exactamente seis experiencias aprobadas.')
  return galeriasPreparadas.map(({ experienciaId, galeria }) => {
    const contenido = relatos[experienciaId]
    const referencia = referencias.find((item) => item.id === experienciaId)
    if (!referencia || !contenido || contenido.secciones?.length !== 2) throw new ErrorCargaEditorial(`Contenido incompleto: ${experienciaId}.`)
    const values = camposEditorialesParaFormulario({ imagen: referencia.imagen, galeria, contenido_editorial: contenido })
    const form = new FormData()
    for (const [key, value] of Object.entries(values)) form.set(key, value)
    const validado = validarCamposEditoriales(form, referencia.imagen)
    if (Object.keys(validado.errors).length || !iguales(contenido, validado.contenido_editorial) || !iguales(galeria, validado.galeria)) {
      throw new ErrorCargaEditorial(`Formato editorial inválido: ${experienciaId}.`)
    }
    return {
      id: experienciaId,
      // No se envían recomendaciones, descripción, portadas ni datos comerciales.
      cambios: { galeria, contenido_editorial: contenido },
      esperado: Object.fromEntries(['titulo', 'descripcion', 'incluye', 'recomendacion', 'duracion', 'imagen', 'alt']
        .map((key) => [key, referencia[key]])),
    }
  })
}

function vacio(value) {
  return value === null || (Array.isArray(value) && value.length === 0)
    || (value && typeof value === 'object' && Object.keys(value).length === 0)
}

export async function cargarContenidoEditorial(supabase, {
  adminUserId, accessToken, aplicar = false, antesDeEscribir = async () => {}, alGuardar = () => {},
} = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(adminUserId ?? '')) {
    throw new ErrorCargaEditorial('Falta configurar un ADMIN_USER_ID válido.')
  }
  const { data: auth, error: authError } = await supabase.auth.getUser(accessToken)
  if (authError || !auth?.user || auth.user.id.toLowerCase() !== adminUserId.toLowerCase()) throw new ErrorCargaEditorial('La sesión no corresponde al administrador autorizado.')

  const carga = prepararCargaEditorial()
  const { data: filas, error } = await supabase.from('experiencias').select('*').in('id', carga.map((item) => item.id))
  if (error || !filas || filas.length !== carga.length || new Set(filas.map((fila) => fila.id)).size !== carga.length) {
    throw new ErrorCargaEditorial('No se pudieron leer los seis registros. Revisá IDs, sesión y permisos RLS.')
  }

  // Preflight completo antes del primer UPDATE: no sobreescribir trabajo distinto.
  const plan = carga.map((item) => {
    const fila = filas.find((actual) => actual.id === item.id)
    if (!fila || !Object.hasOwn(fila, 'galeria') || !Object.hasOwn(fila, 'contenido_editorial')) throw new ErrorCargaEditorial('Faltan las columnas editoriales; revisá la migración antes de cargar.')
    for (const [key, value] of Object.entries(item.esperado)) {
      if (!iguales(fila[key], value)) throw new ErrorCargaEditorial(`Cambió ${key} en ${item.id}; revisá el contenido aprobado antes de continuar.`)
    }
    const listo = Object.entries(item.cambios).every(([key, value]) => iguales(fila[key], value))
    for (const [key, value] of Object.entries(item.cambios)) {
      if (!vacio(fila[key]) && !iguales(fila[key], value)) throw new ErrorCargaEditorial(`Ya existe ${key} diferente en ${item.id}; no se sobrescribió.`)
    }
    return { ...item, antes: fila, listo }
  })
  const resumen = plan.map(({ id, listo, cambios }) => ({ id, estado: listo ? 'sin cambios' : 'pendiente', fotosAdicionales: cambios.galeria.length }))
  if (!aplicar || plan.every((item) => item.listo)) return resumen
  await antesDeEscribir(structuredClone(filas))

  for (const item of plan) {
    if (item.listo) continue
    let query = supabase.from('experiencias').update(item.cambios).eq('id', item.id)
    // Comparar la fila leída evita pisar ediciones concurrentes. Los JSONB se
    // comparan como JSON; incluye es text[], con comparación de pertenencia doble.
    for (const [key, value] of Object.entries(item.antes)) {
      if (key === 'id') continue
      if (value === null) query = query.is(key, null)
      else if (key === 'incluye') query = query.contains(key, value).containedBy(key, value)
      else query = query.eq(key, typeof value === 'object' ? JSON.stringify(value) : value)
    }
    const { data: guardado, error: errorGuardado } = await query.select('*').maybeSingle()
    if (errorGuardado || !guardado) throw new ErrorCargaEditorial(`No se confirmó ${item.id}: posible edición concurrente, sesión expirada o rechazo RLS. Repetí la comprobación antes de continuar.`)
    for (const [key, value] of Object.entries(item.antes)) {
      if (!Object.hasOwn(item.cambios, key) && !iguales(value, guardado[key])) throw new ErrorCargaEditorial(`Se detectó un cambio concurrente en ${item.id}; carga detenida.`)
    }
    if (!Object.entries(item.cambios).every(([key, value]) => iguales(value, guardado[key]))) throw new ErrorCargaEditorial(`No coincide el resultado guardado de ${item.id}; carga detenida.`)
    resumen.find((row) => row.id === item.id).estado = 'actualizado'
    alGuardar(item.id)
  }
  return resumen
}
