import Image from 'next/image'
import Link from 'next/link'
import Arrow from '../components/Arrow'
import ExperienceCard from '../components/ExperienceCard'
import { obtenerDestacadas } from '../lib/experiencias'

export default async function HomePage() {
  const destacadas = await obtenerDestacadas()

  return (
    <main id="contenido">
      <section className="hero container" aria-labelledby="hero-title">
        <div className="hero-heading">
          <div>
            <p className="eyebrow"><span className="accent-dot" /> EXPERIENCIAS CON ACENTO ARGENTINO</p>
            <h1 id="hero-title">Lo mejor está<br /><span>afuera.</span></h1>
          </div>
          <div className="hero-intro">
            <p>Un sendero que no conocías.<br />Una mesa que se alarga.<br />Un lugar al que querés volver.</p>
            <Link href="/experiencias" className="text-link">Encontrá tu próxima historia <Arrow diagonal /></Link>
          </div>
        </div>
        <div className="hero-photo">
          <Image src="/images/patagonia.jpg" alt="El macizo del Fitz Roy entre nubes, nieve y bosque patagónico" fill sizes="(max-width: 1400px) 100vw, 1320px" preload />
          <div className="hero-photo-caption">
            <span>01 / UN PAÍS, MUCHAS FORMAS DE VIVIRLO</span>
            <Link href="/experiencias/senderos-del-fitz-roy">El Chaltén, Patagonia <Arrow diagonal /></Link>
          </div>
        </div>
        <div className="hero-footnote"><span>Menos rutina. Más territorio.</span><span>De norte a sur <span aria-hidden="true">↓</span></span></div>
      </section>

      <section className="featured-section container" aria-labelledby="featured-title">
        <div className="section-heading">
          <div><p className="eyebrow">PARA EMPEZAR A EXPLORAR</p><h2 id="featured-title">Dos buenas razones<br />para salir.</h2></div>
          <Link href="/experiencias" className="text-link">Ver todas las experiencias <Arrow /></Link>
        </div>
        <div className="featured-grid">
          {destacadas.map((experiencia, index) => <ExperienceCard key={experiencia.id} experiencia={experiencia} editorial numero={`0${index + 1}`} />)}
        </div>
      </section>

      <section className="manifesto-section" aria-labelledby="manifesto-title">
        <div className="container manifesto-grid">
          <div className="manifesto-copy">
            <p className="eyebrow">CERCA DEL LUGAR. CERCA DE SU GENTE.</p>
            <h2 id="manifesto-title">No hace falta ir lejos<br />para sentirte<br /><span>en otro lugar.</span></h2>
            <p>Argentina tiene muchas maneras de sorprenderte. Afuera reúne ideas para conocerla con tiempo: caminando, probando, escuchando.</p>
            <Link href="/sobre-el-proyecto" className="text-link">Conocé el proyecto <Arrow diagonal /></Link>
          </div>
          <div className="manifesto-invitation">
            <h3>Elegí menos por destino.<br />Más por lo que querés vivir.</h3>
            <p>Caminar · Probar · Navegar · Escuchar · Aprender · Descubrir</p>
          </div>
        </div>
      </section>
      <section className="closing-section container">
        <p className="eyebrow">TU PRÓXIMA ESCAPADA EMPIEZA ACÁ</p>
        <div><h2>Elegí dónde perder<br />la noción del tiempo.</h2><Link className="button" href="/experiencias">Explorar experiencias <Arrow /></Link></div>
      </section>
    </main>
  )
}
