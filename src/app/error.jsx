'use client'

export default function ErrorPage({ reset }) {
  return (
    <main id="contenido" className="container not-found">
      <p className="eyebrow">UNA PAUSA EN EL RECORRIDO</p>
      <h1>No pudimos cargar<br />las experiencias.</h1>
      <p>Intentá nuevamente en unos minutos.</p>
      <button className="button" onClick={() => reset()}>Volver a intentar</button>
    </main>
  )
}
