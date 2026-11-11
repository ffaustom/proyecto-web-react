import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReservationForm from './ReservationForm'
import { obtenerExperiencia } from '../../../lib/experiencias'
import { formatearPrecio } from '../../../lib/formato'
import ExperienceGallery from '../../../components/ExperienceGallery'
import ExperienceStory from '../../../components/ExperienceStory'
import { hoyArgentina } from '../../../lib/fechas.js'
import { cookies } from 'next/headers'
import { checkoutHabilitado, crearIntentoCheckout, verificarIntentoCheckout, nombreCookieCheckout } from '../../../lib/mercado-pago/intento'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }) {
  const { id } = await params
  const experiencia = await obtenerExperiencia(id)
  return { title: experiencia?.titulo ?? 'Experiencia no encontrada', description: experiencia?.descripcion }
}

export default async function ExperiencePage({ params }) {
  const { id } = await params
  const experiencia = await obtenerExperiencia(id)
  if (!experiencia) notFound()
  let checkoutToken = null
  let checkoutInicial = null
  let checkoutReanudado = false
  if (checkoutHabilitado()) {
    const anterior = (await cookies()).get(nombreCookieCheckout(experiencia.id))?.value
    if (anterior) {
      try {
        verificarIntentoCheckout(anterior, experiencia.id)
        checkoutToken = anterior
        checkoutReanudado = true
      } catch { /* Una firma inválida o vencida no autoriza un intento anterior. */ }
    }
    if (!checkoutToken) checkoutInicial = crearIntentoCheckout(experiencia.id)
  }

  return (
    <main id="contenido" className="container detail-page">
      <nav className="breadcrumbs" aria-label="Ruta de navegación"><Link href="/experiencias">← Todas las experiencias</Link><span>{experiencia.region}</span></nav>
      <header className="detail-heading">
        <p className="eyebrow">{experiencia.categoria} · {experiencia.provincia}</p>
        <h1>{experiencia.titulo}</h1><p>{experiencia.ubicacion}</p>
      </header>
      <ExperienceGallery key={experiencia.id} imagen={experiencia.imagen} alt={experiencia.alt}
        galeria={experiencia.galeria} titulo={experiencia.titulo} />
      <div className="detail-grid">
        <div className="detail-copy">
          <ExperienceStory descripcion={experiencia.descripcion} contenido={experiencia.contenido_editorial} />
          <section className="included-section"><h2>Qué incluye la propuesta</h2><ul>{experiencia.incluye.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section className="before-you-go"><h2>Antes de salir</h2><p>{experiencia.recomendacion}</p></section>
        </div>
        <aside className="reservation-panel" aria-label="Información y reserva">
          <p className="eyebrow">HACÉ LUGAR PARA SALIR</p>
          <p className="detail-price">{formatearPrecio(experiencia.precio)} <span>ARS</span></p>
          <p className="per-person">por persona</p>
          <dl><div><dt>Duración</dt><dd>{experiencia.duracion}</dd></div><div><dt>Categoría</dt><dd>{experiencia.categoria}</dd></div><div><dt>Región</dt><dd>{experiencia.region}</dd></div></dl>
          <ReservationForm experienciaId={experiencia.id} precio={experiencia.precio} hoyInicial={hoyArgentina()}
            checkoutToken={checkoutToken} checkoutInicial={checkoutInicial} checkoutReanudado={checkoutReanudado} />
        </aside>
      </div>
      <div className="detail-bottom"><p>Hay más Argentina por descubrir.</p><Link className="text-link" href="/experiencias">Seguir explorando ↗</Link></div>
    </main>
  )
}
