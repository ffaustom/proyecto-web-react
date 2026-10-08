import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="site-footer container">
      <div className="footer-top">
        <Link href="/" className="wordmark" aria-label="Afuera, inicio">afuera<span>.</span></Link>
        <p>Hay historias que empiezan saliendo.</p>
        <Link href="/experiencias" className="text-link">Encontrá tu próxima experiencia ↗</Link>
      </div>
      <div className="footer-bottom">
        <span>Hecho para descubrir Argentina.</span>
        <span>Proyecto académico · Experiencias y precios de ejemplo</span>
      </div>
    </footer>
  )
}
