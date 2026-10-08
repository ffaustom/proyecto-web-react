import Image from 'next/image'
import Link from 'next/link'
import Arrow from '../../components/Arrow'

export const metadata = { title: 'Sobre el proyecto' }

export default function AboutPage() {
  return (
    <main id="contenido" className="container about-page">
      <section className="page-intro"><p className="eyebrow">SOBRE AFUERA</p><div><h1>Volver a mirar<br /><span>lo que nos rodea.</span></h1><p>Un proyecto que nace de una idea simple: conocer un lugar es mucho más que llegar.</p></div></section>
      <div className="about-grid">
        <div className="about-image"><Image src="/images/jujuy.jpg" alt="Viajeros recorren un camino al pie de los cerros de Purmamarca" fill sizes="(max-width: 700px) 100vw, 50vw" preload /></div>
        <div className="about-copy"><p className="eyebrow">ARGENTINA, DE CERCA</p><h2>Experiencias que<br />empiezan con curiosidad.</h2><p>Afuera es un marketplace de experiencias turísticas en Argentina, creado como proyecto final de Programación Web. Propone descubrir el país a través de su naturaleza, su gastronomía y su cultura.</p><p>Esta primera versión permite explorar seis propuestas, filtrarlas y conocer sus detalles. El catálogo y sus precios son simulados; las reservas todavía no están habilitadas.</p><Link className="text-link" href="/experiencias">Conocé las experiencias <Arrow /></Link></div>
      </div>
    </main>
  )
}
