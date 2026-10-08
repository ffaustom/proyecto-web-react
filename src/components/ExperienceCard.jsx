import Image from 'next/image'
import Link from 'next/link'
import { formatearPrecio } from '../lib/formato'
import Arrow from './Arrow'

export default function ExperienceCard({ experiencia, editorial = false, numero }) {
  const Heading = editorial ? 'h3' : 'h2'

  return (
    <article className={`experience-card${editorial ? ' experience-card--editorial' : ''}`}>
      <Link href={`/experiencias/${experiencia.id}`} className="card-link">
        <div className="card-image">
          <Image
            src={experiencia.imagen}
            alt={experiencia.alt}
            fill
            sizes={editorial ? '(max-width: 700px) 100vw, 60vw' : '(max-width: 700px) 100vw, 50vw'}
          />
          <span className="image-tag">{experiencia.region}</span>
          <span className="card-arrow"><Arrow diagonal /></span>
        </div>
        <div className="card-meta">
          <span>{experiencia.provincia}</span>
          <span>{experiencia.categoria} · {experiencia.duracion}</span>
        </div>
        <div className="card-title-row">
          <Heading>{experiencia.titulo}</Heading>
          {numero && <span className="card-number">{numero}</span>}
        </div>
        <p className="card-price">{formatearPrecio(experiencia.precio)} <span>ARS / persona</span></p>
      </Link>
    </article>
  )
}
