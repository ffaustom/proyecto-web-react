import ExperienceCatalog from '../../components/ExperienceCatalog'
import { obtenerExperiencias } from '../../lib/experiencias'

export const metadata = { title: 'Experiencias' }

export default async function ExperiencesPage() {
  const experiencias = await obtenerExperiencias()

  return (
    <main id="contenido" className="container">
      <section className="page-intro">
        <p className="eyebrow">EL DESTINO ES SOLO EL PRINCIPIO</p>
        <div><h1>Encontrá tu<br /><span>manera de salir.</span></h1><p>De la montaña a la sobremesa.<br />Seis experiencias para conocer<br />Argentina un poco más de cerca.</p></div>
      </section>
      <ExperienceCatalog experiencias={experiencias} />
      <p className="catalog-note">Un primer recorrido por Argentina. Las experiencias y los precios son de ejemplo.</p>
    </main>
  )
}
