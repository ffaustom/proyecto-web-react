import Link from 'next/link'
import ExperienceGallery from '../../components/ExperienceGallery'
import fotografias from '../../data/fotografias.json'
import { galeriasPreparadas } from '../../data/galerias'

export const metadata = {
  title: 'Créditos fotográficos',
  description: 'Fotografías de Afuera: autoría, fuentes, licencias y contexto de las imágenes.',
}

export default function CreditosPage() {
  return (
    <main id="contenido" className="container credits-page">
      <header className="credits-heading">
        <p className="eyebrow">IMÁGENES Y AUTORÍA</p>
        <h1>Créditos fotográficos</h1>
        <p>Una mirada a los lugares, con reconocimiento a quienes los fotografiaron.</p>
        <p>Las imágenes ilustran los destinos. No identifican operadores ni garantizan visitas a los establecimientos, encuentros o actividades que muestran. Consultá los incluidos de cada propuesta.</p>
      </header>
      <nav className="credits-index" aria-label="Créditos por experiencia">
        {fotografias.experiences.map(({ id, title }) => <a key={id} href={`#${id}`}>{title}</a>)}
      </nav>
      {fotografias.experiences.map((experiencia, index) => (
        <section key={experiencia.id} id={experiencia.id} className="credits-experience" aria-labelledby={`${experiencia.id}-title`}>
          <div className="credits-section-heading">
            <p className="eyebrow">{String(index + 1).padStart(2, '0')} · FOTOGRAFÍAS</p>
            <h2 id={`${experiencia.id}-title`}>{experiencia.title}</h2>
          </div>
          <ExperienceGallery imagen={experiencia.cover.src} alt={experiencia.cover.alt}
            galeria={galeriasPreparadas[index].galeria} titulo={experiencia.title} priorizarPortada={index === 0} />
          <ol className="credits-list">
            {[experiencia.cover, ...experiencia.photos].map((foto) => (
              <li key={foto.src}>
                <article>
                  <h3>{foto.title}</h3>
                  <dl>
                    <div><dt>Autoría</dt><dd>{foto.author}</dd></div>
                    <div><dt>Fuente</dt><dd><a href={foto.source}>{foto.license === 'Unsplash License' ? 'Ficha original en Unsplash' : 'Ficha en Wikimedia Commons'}</a>
                      {foto.originalSource !== foto.source && <> · <a href={foto.originalSource}>Publicación original</a></>}</dd></div>
                    <div><dt>Licencia</dt><dd><a href={foto.licenseUrl}>{foto.license}</a></dd></div>
                    <div><dt>Modificaciones</dt><dd>{foto.modifications}</dd></div>
                  </dl>
                  <p className="credits-context">{foto.note}</p>
                  <a className="text-link" href={foto.src}>Ver fotografía completa ↗</a>
                </article>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <section className="credits-licenses" aria-labelledby="licencias-title">
        <h2 id="licencias-title">Sobre las licencias</h2>
        <p>Las fotografías conservan la licencia indicada en su ficha. Para reutilizar una imagen CC BY o CC BY-SA, citá a su autor, enlazá la fuente y la licencia e indicá los cambios. Las adaptaciones de fotografías CC BY-SA se comparten bajo la misma licencia o una compatible. La licencia de una fotografía no se extiende automáticamente al código del sitio.</p>
        <p>Los recortes de las miniaturas son solo de presentación; el enlace a la fotografía completa conserva el encuadre del archivo. Estos créditos no implican el respaldo de sus autores a Afuera.</p>
        <Link href="/experiencias" className="text-link">Volver a las experiencias ↗</Link>
      </section>
    </main>
  )
}
