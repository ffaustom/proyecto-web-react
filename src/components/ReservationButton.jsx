'use client'

import { useState } from 'react'
import Arrow from './Arrow'

export default function ReservationButton({ titulo }) {
  const [mostrarAviso, setMostrarAviso] = useState(false)

  return (
    <div className="reservation-action">
      <button className="button" onClick={() => setMostrarAviso(true)} aria-expanded={mostrarAviso} aria-controls="reservation-notice">Reservar <Arrow /></button>
      <div id="reservation-notice" role="status" aria-live="polite">
        {mostrarAviso && <p className="reservation-notice">Las reservas para “{titulo}” todavía no están habilitadas. Esta es una experiencia de ejemplo: no se generó ninguna reserva ni se realizó un cobro.</p>}
      </div>
    </div>
  )
}
