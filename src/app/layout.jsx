import './globals.css'
import Header from '../components/Header'
import Footer from '../components/Footer'

export const metadata = {
  title: {
    default: 'Afuera — Argentina, de cerca',
    template: '%s | Afuera',
  },
  description: 'Descubrí experiencias de naturaleza, aventura, gastronomía y cultura en Argentina. Un proyecto para volver a mirar lo que tenemos cerca.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <a href="#contenido" className="skip-link">Saltar al contenido</a>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  )
}
