'use client'

import Image from 'next/image'
import { useId, useState } from 'react'
import { normalizarGaleria } from '../lib/contenido-editorial'

export default function ExperienceGallery({ imagen, alt, galeria, titulo, priorizarPortada = true }) {
  const fotos = [{ src: imagen, alt }, ...normalizarGaleria(galeria, imagen)]
  const [seleccion, setSeleccion] = useState(0)
  const indice = Math.min(seleccion, fotos.length - 1)
  const foto = fotos[indice]
  const imagenId = useId()

  function mover(paso) {
    setSeleccion((indice + paso + fotos.length) % fotos.length)
  }

  return (
    <section className="experience-gallery" aria-label={`Fotografías de ${titulo}`}>
      <figure>
        <div className="detail-image" id={imagenId}>
          <Image key={foto.src} src={foto.src} alt={foto.alt} fill
            sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1432px) calc(100vw - 112px), 1320px"
            preload={indice === 0 && priorizarPortada} loading={indice === 0 ? undefined : 'eager'} />
        </div>
        {foto.pie && <figcaption className="gallery-caption">{foto.pie}</figcaption>}
      </figure>
      {fotos.length > 1 && (
        <>
          <div className="gallery-navigation">
            <button type="button" onClick={() => mover(-1)} aria-controls={imagenId} aria-label="Ver fotografía anterior">← Anterior</button>
            <p role="status" aria-live="polite" aria-atomic="true">Fotografía {indice + 1} de {fotos.length}</p>
            <button type="button" onClick={() => mover(1)} aria-controls={imagenId} aria-label="Ver fotografía siguiente">Siguiente →</button>
          </div>
          <div className="gallery-thumbnails" role="group" aria-label="Elegir una fotografía">
            {fotos.map((item, numero) => (
              <button key={item.src} type="button" className="gallery-thumbnail"
                aria-label={`Ver fotografía ${numero + 1}: ${item.alt}`} aria-pressed={numero === indice}
                aria-controls={imagenId} onClick={() => setSeleccion(numero)}>
                <Image src={item.src} alt="" fill sizes="88px" />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
