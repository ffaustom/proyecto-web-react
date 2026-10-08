import Link from 'next/link'

export default function NotFound() {
  return (
    <main id="contenido" className="container not-found">
      <p className="eyebrow">404 · FUERA DEL RECORRIDO</p>
      <h1>Por acá todavía<br />no hay un camino.</h1>
      <p>La página que buscás no existe o ya no está disponible.</p>
      <Link href="/experiencias" className="button">Volver a las experiencias</Link>
    </main>
  )
}
