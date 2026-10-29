'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { crearClienteAuth } from '../../../lib/supabase/auth-server'
import { validarExperiencia } from './validacion'

export async function crearExperiencia(_previousState, formData) {
  const supabase = await crearClienteAuth()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/admin/login')

  const { values, errors, experiencia } = validarExperiencia(formData)
  if (Object.keys(errors).length) {
    return { values, errors, error: 'Revisá los campos indicados antes de guardar.' }
  }

  try {
    const { error } = await supabase.from('experiencias').insert(experiencia)
    if (error) {
      if (error.code === '23505') {
        return { values, errors: { id: 'Este identificador ya existe. Elegí otro.' }, error: 'No se guardó la experiencia: el identificador está en uso.' }
      }
      if (error.code === '42501') {
        return { values, errors: {}, error: 'Tu sesión no tiene permiso para crear experiencias. Verificá que esté aplicada la política de INSERT en Supabase.' }
      }
      return { values, errors: {}, error: 'No pudimos guardar la experiencia. Intentá nuevamente más tarde.' }
    }
  } catch {
    return { values, errors: {}, error: 'No pudimos confirmar el guardado por un problema de conexión. Revisá el listado antes de volver a intentar.' }
  }

  revalidatePath('/admin')
  redirect('/admin')
}
