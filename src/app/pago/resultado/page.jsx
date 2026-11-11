import Link from 'next/link'

export const metadata = { title: 'Regreso del checkout', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

// No se consultan parámetros ni se escribe en la base: volver no acredita un pago.
export default function ResultadoPago() {
  return (
    <main id="contenido" className="container">
      <h1>Volviste del checkout de prueba</h1>
      <p role="status">El regreso desde Mercado Pago no confirma el pago ni la reserva.</p>
      <p>La reserva se confirma únicamente cuando el servidor verifica el pago con Mercado Pago. Esta página no acredita el resultado y la verificación puede demorar.</p>
      <p>Si Mercado Pago informó un pago aprobado o generaste un comprobante pendiente de pago, no inicies otro pago para esa reserva.</p>
      <p>Solo si el pago fue rechazado y querés reintentarlo, regresá a la experiencia y reanudá el mismo intento con los mismos datos.</p>
      <Link className="button" href="/experiencias">Volver a las experiencias</Link>
    </main>
  )
}
