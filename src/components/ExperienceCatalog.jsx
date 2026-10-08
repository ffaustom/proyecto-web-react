'use client'

import { useState } from 'react'
import ExperienceCard from './ExperienceCard'

export default function ExperienceCatalog({ experiencias }) {
  const [region, setRegion] = useState('Todas')
  const [categoria, setCategoria] = useState('Todas')
  const regiones = [...new Set(experiencias.map((experiencia) => experiencia.region))]
  const categorias = [...new Set(experiencias.map((experiencia) => experiencia.categoria))]
  const resultados = experiencias.filter((experiencia) =>
    (region === 'Todas' || experiencia.region === region) &&
    (categoria === 'Todas' || experiencia.categoria === categoria)
  )
  const hayFiltros = region !== 'Todas' || categoria !== 'Todas'

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
          {resultados.length} {resultados.length === 1 ? 'experiencia' : 'experiencias'}
        </p>
      </div>
      {resultados.length > 0 ? (
        <div className="catalog-grid">
          {resultados.map((experiencia) => <ExperienceCard key={experiencia.id} experiencia={experiencia} />)}
        </div>
      ) : (
        <div className="empty-state">
          <span className="eyebrow">Un camino distinto</span>
          <h2>No encontramos esa combinación.</h2>
          <p>Probá otra región o categoría para seguir explorando.</p>
          <button className="button" onClick={limpiarFiltros}>Ver todas las experiencias</button>
        </div>
      )}
    </section>
  )
}
