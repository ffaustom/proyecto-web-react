import './globals.css'

export const metadata = {
  title: 'Marketplace de Experiencias Turísticas',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
