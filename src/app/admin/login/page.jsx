import { redirect } from 'next/navigation'
import { crearClienteAuth } from '../../../lib/supabase/auth-server'
import LoginForm from './LoginForm'

export const metadata = { title: 'Ingresar a administración', robots: { index: false, follow: false } }

export default async function LoginPage() {
  const supabase = await crearClienteAuth()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/admin')

  return (
    <main id="contenido" className="container admin-page">
      <section className="admin-card" aria-labelledby="login-title">
        <p className="eyebrow">ADMINISTRACIÓN · AFUERA</p>
        <h1 id="login-title">Volvé a ingresar.</h1>
        <p className="admin-intro">Accedé con tu cuenta de administración.</p>
        <LoginForm />
      </section>
    </main>
  )
}
