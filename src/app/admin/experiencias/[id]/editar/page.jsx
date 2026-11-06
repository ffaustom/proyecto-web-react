import { notFound } from 'next/navigation'
import { requerirAdministrador } from '../../../../../lib/supabase/admin-server'
import ExperienceForm from '../../../nueva/ExperienceForm'
import { actualizarExperiencia } from './actions'
import { camposEditorialesParaFormulario } from '../../../../../lib/contenido-editorial'

export const metadata = { title: 'Editar experiencia', robots: { index: false, follow: false } }

export default async function EditarExperienciaPage({ params }) {
  const supabase = await requerirAdministrador()

  const { id } = await params
  const { data: experiencia, error } = await supabase
    .from('experiencias')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error('No pudimos cargar la experiencia para editar. Intentá nuevamente.')
  if (!experiencia) notFound()

  const initialValues = {
    ...experiencia,
    ...camposEditorialesParaFormulario(experiencia),
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
