import Link from 'next/link'
import { redirect } from 'next/navigation'
import { crearClienteAuth } from '../../lib/supabase/auth-server'
import { formatearPrecio } from '../../lib/formato'
import DeleteExperienceButton from './DeleteExperienceButton'

export const metadata = { title: 'Administración', robots: { index: false, follow: false } }

export default async function AdminPage() {
  const supabase = await crearClienteAuth()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/admin/login')

  const { data: experiencias, error: errorListado } = await supabase
    .from('experiencias')
    .select('id,titulo,provincia,categoria,precio,activo')
    .order('created_at')
    .order('id')

  return (
    <main id="contenido" className="container admin-page">
      <header className="admin-heading">
        <div>
        <p className="eyebrow">ADMINISTRACIÓN · AFUERA</p>
        <h1>Panel de administración</h1>
        <p className="admin-intro">Consultá las experiencias de Afuera y su estado actual.</p>
        </div>
        <Link href="/admin/nueva" className="button">Nueva experiencia</Link>
      </header>
      <section aria-labelledby="experiencias-title">
        <div className="admin-list-heading">
          <h2 id="experiencias-title">Experiencias</h2>
          {!errorListado && <p>{experiencias.length} {experiencias.length === 1 ? 'experiencia' : 'experiencias'}</p>}
        </div>
        <p className="admin-actions-note">Administrá las propuestas existentes o agregá una nueva experiencia.</p>
        {errorListado ? (
          <p className="admin-error" role="alert">No pudimos cargar las experiencias. Recargá la página para volver a intentar.</p>
        ) : experiencias.length === 0 ? (
          <p className="admin-empty">No hay experiencias disponibles para mostrar.</p>
        ) : (
          <div className="admin-table-scroll" role="region" aria-label="Listado de experiencias" tabIndex={0}>
            <table className="admin-table">
              <caption>Experiencias existentes, precios en pesos argentinos (ARS).</caption>
              <thead>
                <tr><th scope="col">Título</th><th scope="col">Provincia</th><th scope="col">Categoría</th><th scope="col">Precio</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr>
              </thead>
              <tbody>
                {experiencias.map((experiencia) => (
                  <tr key={experiencia.id}>
                    <th scope="row">{experiencia.titulo}</th>
                    <td>{experiencia.provincia}</td>
                    <td>{experiencia.categoria}</td>
                    <td className="admin-price">{formatearPrecio(experiencia.precio)}</td>
                    <td><span className={`admin-status${experiencia.activo ? ' admin-status-active' : ''}`}>{experiencia.activo ? 'Activa' : 'Inactiva'}</span></td>
                    <td><div className="admin-row-actions">
                      <Link href={`/admin/experiencias/${encodeURIComponent(experiencia.id)}/editar`} aria-label={`Editar ${experiencia.titulo}`}>Editar</Link>
                      <DeleteExperienceButton id={experiencia.id} titulo={experiencia.titulo} />
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Link href="/" className="text-link admin-back">Volver a Afuera</Link>
    </main>
  )
}
