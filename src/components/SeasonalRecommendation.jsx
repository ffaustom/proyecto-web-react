import { recomendarFecha } from '../lib/temporadas.js'

export default function SeasonalRecommendation({ experienciaId, fecha }) {
  const consejo = recomendarFecha(experienciaId, fecha)
  return (
    <div id="reserva-temporada" className="seasonal-recommendation" role="status" aria-live="polite" aria-atomic="true">
      {consejo && <>
        <p><strong>{consejo.recomendable === null ? 'Sin recomendación estacional' : consejo.recomendable ? 'Época recomendable' : 'Época poco recomendable'}</strong></p>
        <p>{consejo.motivo}</p>
        {consejo.periodo && <p>Época sugerida: {consejo.periodo}.</p>}
        <p>Orientación estacional: no garantiza clima, fauna ni servicios. Podés reservar aunque la época sea poco recomendable.</p>
        {consejo.fuentes.length > 0 && <ul aria-label="Fuentes turísticas oficiales">
          {consejo.fuentes.map(({ titulo, url }) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{titulo} ↗</a></li>)}
        </ul>}
      </>}
    </div>
  )
}
