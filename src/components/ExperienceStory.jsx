import { normalizarContenidoEditorial } from '../lib/contenido-editorial'

export default function ExperienceStory({ descripcion, contenido }) {
  const { titulo, introduccion, parrafos, secciones } = normalizarContenidoEditorial(contenido)

  return (
    <section className="experience-story">
      <p className="eyebrow">LA EXPERIENCIA</p>
      <h2>{titulo || 'Un lugar. Otra perspectiva.'}</h2>
      <p className="description">{introduccion || descripcion}</p>
      {parrafos.length > 0 && (
        <div className="editorial-paragraphs">
          {parrafos.map((parrafo, indice) => <p key={indice}>{parrafo}</p>)}
        </div>
      )}
      {secciones.map((seccion, indice) => (
        <section className="editorial-section" key={indice}>
          <h3>{seccion.titulo}</h3>
          <div className="editorial-paragraphs">
            {seccion.parrafos.map((parrafo, numero) => <p key={numero}>{parrafo}</p>)}
          </div>
        </section>
      ))}
    </section>
  )
}
