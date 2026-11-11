import 'server-only'

import { createClient } from '@supabase/supabase-js'

// Exclusivo del backend. No reutilizar el cliente de Auth ni exponer esta clave.
export function crearClienteSupabasePrivado() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Falta configurar el acceso privado a Supabase.')

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
}
