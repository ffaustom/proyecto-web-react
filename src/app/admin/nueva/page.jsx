import { requerirAdministrador } from '../../../lib/supabase/admin-server'
import ExperienceForm from './ExperienceForm'

export const metadata = { title: 'Nueva experiencia', robots: { index: false, follow: false } }

export default async function NuevaExperienciaPage() {
  await requerirAdministrador()

  return (
    <main id="contenido" className="container admin-page">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN · AFUERA</p>
          <h1>Nueva experiencia</h1>
          <p className="admin-intro">Completá la propuesta para agregarla a Afuera.</p>
        </div>
      </header>
      <ExperienceForm />
    </main>
  )
}
