'use server'

import { redirect } from 'next/navigation'
import { crearClienteAuth } from '../../../lib/supabase/auth-server'
import { esAdministrador } from '../../../lib/supabase/admin-server'

export async function iniciarSesion(_previousState, formData) {
  const email = formData.get('email')
  const password = formData.get('password')

  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return { error: 'Completá tu email y contraseña.' }
  }

  try {
    const supabase = await crearClienteAuth()
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })

    if (error) {
      if (error.code === 'invalid_credentials') {
        return { error: 'El email o la contraseña son incorrectos. Intentá nuevamente.' }
      }
      if (error.code === 'email_not_confirmed') {
        return { error: 'El email de esta cuenta todavía no está confirmado.' }
      }
      if (error.status === 429) {
        return { error: 'Demasiados intentos. Esperá unos minutos antes de volver a intentar.' }
      }
      return { error: 'No pudimos iniciar sesión. Intentá nuevamente más tarde.' }
    }
    if (!esAdministrador(data.user)) {
      await supabase.auth.signOut({ scope: 'local' })
      return { error: 'Esta cuenta no tiene permiso para acceder a administración.' }
    }
  } catch {
    return { error: 'No pudimos conectar con el servicio de autenticación. Intentá nuevamente.' }
  }

  redirect('/admin')
}
