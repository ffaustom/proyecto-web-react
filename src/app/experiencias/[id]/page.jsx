import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReservationButton from '../../../components/ReservationButton'
import { obtenerExperiencia, obtenerExperiencias } from '../../../lib/experiencias'
import { formatearPrecio } from '../../../lib/formato'

export async function generateStaticParams() {
  const experiencias = await obtenerExperiencias()
  return experiencias.map(({ id }) => ({ id }))
}

export async function generateMetadata({ params }) {
  const { id } = await params
  const experiencia = await obtenerExperiencia(id)
  return { title: experiencia?.titulo ?? 'Experiencia no encontrada', description: experiencia?.descripcion }
}

export default async function ExperiencePage({ params }) {
  const { id } = await params
  const experiencia = await obtenerExperiencia(id)
  if (!experiencia) notFound()

  return (
    <main id="contenido" className="container detail-page">
      <nav className="breadcrumbs" aria-label="Ruta de navegación"><Link href="/experiencias">← Todas las experiencias</Link><span>{experiencia.region}</span></nav>
      <header className="detail-heading">
        <p className="eyebrow">{experiencia.categoria} · {experiencia.provincia}</p>
        <h1>{experiencia.titulo}</h1><p>{experiencia.ubicacion}</p>
      </header>
      <div className="detail-image"><Image src={experiencia.imagen} alt={experiencia.alt} fill sizes="(max-width: 1400px) 100vw, 1320px" preload /></div>
      <div className="detail-grid">
        <div className="detail-copy">
          <section><p className="eyebrow">LA EXPERIENCIA</p><h2>Un lugar. Otra perspectiva.</h2><p className="description">{experiencia.descripcion}</p></section>
          <section className="included-section"><h2>Qué incluye la propuesta</h2><ul>{experiencia.incluye.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section className="before-you-go"><h2>Antes de salir</h2><p>{experiencia.recomendacion}</p></section>
        </div>
        <aside className="reservation-panel" aria-label="Información y reserva">
          <p className="eyebrow">HACÉ LUGAR PARA SALIR</p>
          <p className="detail-price">{formatearPrecio(experiencia.precio)} <span>ARS</span></p>
          <p className="per-person">por persona · precio de ejemplo</p>
          <dl><div><dt>Duración</dt><dd>{experiencia.duracion}</dd></div><div><dt>Categoría</dt><dd>{experiencia.categoria}</dd></div><div><dt>Región</dt><dd>{experiencia.region}</dd></div></dl>
          <ReservationButton titulo={experiencia.titulo} />
          <p className="reservation-hint">Versión de muestra. Reservas aún no disponibles.</p>
        </aside>
      </div>
      <div className="detail-bottom"><p>Hay más Argentina por descubrir.</p><Link className="text-link" href="/experiencias">Seguir explorando ↗</Link></div>
    </main>
  )
}
