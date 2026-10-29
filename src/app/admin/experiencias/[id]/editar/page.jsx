import { notFound, redirect } from 'next/navigation'
import { crearClienteAuth } from '../../../../../lib/supabase/auth-server'
import ExperienceForm from '../../../nueva/ExperienceForm'
import { actualizarExperiencia } from './actions'

export const metadata = { title: 'Editar experiencia', robots: { index: false, follow: false } }

export default async function EditarExperienciaPage({ params }) {
  const supabase = await crearClienteAuth()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/admin/login')

  const { id } = await params
  const { data: experiencia, error } = await supabase
    .from('experiencias')
    .select('id,titulo,provincia,ubicacion,region,categoria,duracion,precio,imagen,alt,descripcion,incluye,recomendacion,destacada,activo')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error('No pudimos cargar la experiencia para editar. Intentá nuevamente.')
  if (!experiencia) notFound()

  const initialValues = {
    ...experiencia,
    incluye: experiencia.incluye.join('\n'),
  }

  return (
    <main id="contenido" className="container admin-page">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN · AFUERA</p>
          <h1>Editar experiencia</h1>
          <p className="admin-intro">Actualizá los datos de {experiencia.titulo}.</p>
        </div>
      </header>
      <ExperienceForm key={id} action={actualizarExperiencia.bind(null, id)} initialValues={initialValues} editing />
    </main>
  )
}
