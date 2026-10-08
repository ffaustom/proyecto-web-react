'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Inicio' },
  { href: '/experiencias', label: 'Experiencias' },
  { href: '/sobre-el-proyecto', label: 'Sobre el proyecto' },
]

export default function Header() {
  const pathname = usePathname()

  return (
    <header className="site-header container">
      <Link href="/" className="wordmark" aria-label="Afuera, inicio">afuera<span>.</span></Link>
      <nav aria-label="Navegación principal">
        {links.map(({ href, label }) => {
          const activo = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return <Link key={href} href={href} aria-current={activo ? 'page' : undefined}>{label}</Link>
        })}
      </nav>
      <span className="header-note">Argentina, de cerca.</span>
    </header>
  )
}
