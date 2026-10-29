'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { crearClienteAuth } from '../../lib/supabase/auth-server'

export async function eliminarExperiencia(id, _previousState) {
  let supabase
  let authResult
  try {
    supabase = await crearClienteAuth()
    authResult = await supabase.auth.getUser()
  } catch {
    return { error: 'No pudimos verificar tu sesión. Intentá nuevamente.' }
  }
  if (authResult.error || !authResult.data.user) redirect('/admin/login')

  if (typeof id !== 'string' || !id.trim()) {
    return { error: 'No pudimos identificar la experiencia. Recargá el listado e intentá nuevamente.' }
  }

  try {
    const { data, error } = await supabase
      .from('experiencias')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) {
      if (error.code === '42501') {
        return { error: 'Tu sesión no tiene permiso para eliminar experiencias. Verificá que esté aplicada la política de DELETE en Supabase.' }
      }
      if (error.code === '23503') {
        return { error: 'No se puede eliminar esta experiencia porque tiene datos relacionados.' }
      }
      return { error: 'No pudimos eliminar la experiencia. Intentá nuevamente más tarde.' }
    }
    if (!data) {
      return { error: 'No se eliminó ninguna experiencia. Puede que ya no exista, haya cambiado su identificador o falten permisos de DELETE. Recargá el listado para verificarlo.' }
    }
  } catch {
    return { error: 'No pudimos confirmar el borrado por un problema de conexión. Recargá el listado antes de volver a intentar.' }
  }

  revalidatePath('/admin')
  revalidatePath('/experiencias')
  revalidatePath('/')
  revalidatePath(`/experiencias/${encodeURIComponent(id)}`)
  revalidatePath(`/admin/experiencias/${encodeURIComponent(id)}/editar`)
  return { error: '' }
}
