import 'server-only'

import { redirect } from 'next/navigation'
import { crearClienteAuth } from './auth-server'

export function esAdministrador(user) {
  const adminId = process.env.ADMIN_USER_ID?.trim()
  // Una configuración ausente o inválida nunca concede permisos.
  if (!adminId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(adminId)) return false
  return Boolean(user?.id && user.id.toLowerCase() === adminId.toLowerCase())
}

export async function requerirAdministrador() {
  const supabase = await crearClienteAuth()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/admin/login')
  if (!esAdministrador(user)) redirect('/')
  return supabase
}
