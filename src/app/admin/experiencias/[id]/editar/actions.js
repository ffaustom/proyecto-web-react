'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requerirAdministrador } from '../../../../../lib/supabase/admin-server'
import { validarExperiencia } from '../../../nueva/validacion-server'

export async function actualizarExperiencia(idOriginal, _previousState, formData) {
  const supabase = await requerirAdministrador()

  const { values, errors, experiencia } = await validarExperiencia(formData)
  if (Object.keys(errors).length) {
    return { values, errors, error: 'Revisá los campos indicados antes de guardar.' }
  }
  if (typeof idOriginal !== 'string' || !idOriginal) {
    return { values, errors: {}, error: 'No pudimos identificar la experiencia. Volvé al panel y abrí la edición nuevamente.' }
  }

  try {
    const { data, error } = await supabase
      .from('experiencias')
      .update(experiencia)
      .eq('id', idOriginal)
      .select('id')
      .maybeSingle()

    if (error) {
      if (['PGRST204', '42703'].includes(error.code) && /galeria|contenido_editorial/.test(error.message ?? '')) {
        return { values, errors: {}, error: 'Falta aplicar la migración de galería y contenido editorial en Supabase antes de guardar.' }
      }
      if (error.code === '23505') {
        return { values, errors: { id: 'Este identificador ya existe. Elegí otro.' }, error: 'No se guardaron los cambios: el identificador está en uso.' }
      }
      if (error.code === '42501') {
        return { values, errors: {}, error: 'Tu sesión no tiene permiso para editar experiencias. Verificá que esté aplicada la política de UPDATE en Supabase.' }
      }
      return { values, errors: {}, error: 'No pudimos actualizar la experiencia. Intentá nuevamente más tarde.' }
    }
    if (!data) {
      return { values, errors: {}, error: 'No se actualizó la experiencia. Puede que ya no exista, haya cambiado su identificador o falten permisos de UPDATE. Volvé al panel para verificarlo.' }
    }
  } catch {
    return { values, errors: {}, error: 'No pudimos confirmar el guardado por un problema de conexión. Revisá el listado antes de volver a intentar.' }
  }

  revalidatePath('/admin')
  revalidatePath('/experiencias')
  revalidatePath('/')
  revalidatePath(`/experiencias/${encodeURIComponent(idOriginal)}`)
  if (experiencia.id !== idOriginal) revalidatePath(`/experiencias/${experiencia.id}`)
  revalidatePath(`/admin/experiencias/${encodeURIComponent(idOriginal)}/editar`)
  redirect('/admin')
}
