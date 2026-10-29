'use client'

import { useEffect, useState } from 'react'
import ExperienceCard from './ExperienceCard'

export default function ExperienceCatalog({ experiencias }) {
  const [region, setRegion] = useState('Todas')
  const [categoria, setCategoria] = useState('Todas')
  const [resultados, setResultados] = useState(experiencias)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)
  const regiones = [...new Set(experiencias.map((experiencia) => experiencia.region))]
  const categorias = [...new Set(experiencias.map((experiencia) => experiencia.categoria))]
  const hayFiltros = region !== 'Todas' || categoria !== 'Todas'

  useEffect(() => {
    const controller = new AbortController()

    async function cargar() {
      setLoading(true)
      setError('')
      const params = new URLSearchParams()
      if (region !== 'Todas') params.set('region', region)
      if (categoria !== 'Todas') params.set('categoria', categoria)

      try {
        const response = await fetch(`/api/experiencias?${params}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('Respuesta HTTP inválida')
        const data = await response.json()
        if (!Array.isArray(data.experiencias) || !data.experiencias.every((item) =>
          item && ['id', 'titulo', 'provincia', 'region', 'categoria', 'duracion', 'imagen', 'alt']
            .every((campo) => typeof item[campo] === 'string')
          && (typeof item.precio === 'number' || typeof item.precio === 'string')
          && String(item.precio).trim() !== '' && Number.isFinite(Number(item.precio)) && Number(item.precio) >= 0
        )) throw new Error('Respuesta JSON inválida')
        if (!controller.signal.aborted) setResultados(data.experiencias)
      } catch {
        if (!controller.signal.aborted) {
          setError('No pudimos cargar las experiencias. Revisá tu conexión y volvé a intentar.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    cargar()
    return () => controller.abort()
  }, [region, categoria, intento])

  function limpiarFiltros() {
    setRegion('Todas')
    setCategoria('Todas')
  }

  return (
    <section className="catalog-section" aria-label="Catálogo de experiencias">
      <div className="filter-bar">
        <div className="filter-controls">
          <label>
            Región
            <select value={region} onChange={(event) => setRegion(event.target.value)}>
              <option value="Todas">Todas las regiones</option>
              {regiones.map((opcion) => <option key={opcion}>{opcion}</option>)}
            </select>
          </label>
          <label>
            Categoría
            <select value={categoria} onChange={(event) => setCategoria(event.target.value)}>
              <option value="Todas">Todas las categorías</option>
              {categorias.map((opcion) => <option key={opcion}>{opcion}</option>)}
            </select>
          </label>
          {hayFiltros && (
            <button className="clear-filters" onClick={limpiarFiltros}>Limpiar filtros</button>
          )}
        </div>
        <p className="results-count" role="status" aria-live="polite">
          {loading ? 'Cargando experiencias…' : error ? 'No se pudieron cargar los resultados.' : `${resultados.length} ${resultados.length === 1 ? 'experiencia' : 'experiencias'}`}
        </p>
      </div>
      <div aria-busy={loading}>
      {error ? (
        <div className="empty-state">
          <p role="alert">{error}</p>
          <button className="button" onClick={() => setIntento((valor) => valor + 1)}>Reintentar</button>
        </div>
      ) : loading ? (
        <div className="empty-state"><p>Cargando experiencias…</p></div>
      ) : resultados.length > 0 ? (
        <div className="catalog-grid">
          {resultados.map((experiencia) => <ExperienceCard key={experiencia.id} experiencia={experiencia} />)}
        </div>
      ) : (
        <div className="empty-state">
          <span className="eyebrow">Un camino distinto</span>
          <h2>{experiencias.length === 0 ? 'Todavía no hay experiencias disponibles.' : 'No encontramos esa combinación.'}</h2>
          <p>{experiencias.length === 0 ? 'Volvé pronto para descubrir nuevas propuestas.' : 'Probá otra región o categoría para seguir explorando.'}</p>
          {hayFiltros && <button className="button" onClick={limpiarFiltros}>Ver todas las experiencias</button>}
        </div>
      )}
      </div>
    </section>
  )
}
