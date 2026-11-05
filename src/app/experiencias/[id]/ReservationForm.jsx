'use client'

import { useActionState, useState } from 'react'
import { crearReserva } from './actions'

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export default function ReservationForm({ experienciaId, precio }) {
  const [cantidad, setCantidad] = useState('1')
  const [state, formAction, pending] = useActionState(crearReserva.bind(null, experienciaId), {
    values: {}, errors: {}, error: '',
  })
  const unidades = Number(cantidad)
  const totalCentavos = Math.round(Number(precio) * 100) * unidades
  const totalValido = Number.isInteger(unidades) && unidades > 0 && unidades <= 2147483647
    && Number.isSafeInteger(totalCentavos) && totalCentavos >= 0 && totalCentavos <= 999999999999

  if (state.success) {
    return <p className="reservation-notice" role="status">Recibimos tu reserva. Quedó pendiente de confirmación. No se realizó ningún cobro.</p>
  }

  return (
    <form action={formAction} className="reservation-form" aria-busy={pending}>
      {[
        ['nombre_comprador', 'Nombre completo', 'text', 'name', 200],
        ['email', 'Email', 'email', 'email', 254],
      ].map(([name, label, type, autoComplete, maxLength]) => (
        <div className="admin-field" key={name}>
          <label htmlFor={`reserva-${name}`}>{label}</label>
          <input id={`reserva-${name}`} name={name} type={type} autoComplete={autoComplete} maxLength={maxLength} required defaultValue={state.values[name] ?? ''} aria-invalid={!!state.errors[name]} aria-describedby={state.errors[name] ? `reserva-${name}-error` : undefined} />
          {state.errors[name] && <p id={`reserva-${name}-error`} className="admin-error">{state.errors[name]}</p>}
        </div>
      ))}
      <div className="admin-field">
        <label htmlFor="reserva-cantidad">Cantidad de personas</label>
        <input id="reserva-cantidad" name="cantidad_personas" type="number" min="1" max="2147483647" step="1" required value={cantidad} onChange={(event) => setCantidad(event.target.value)} aria-invalid={!!state.errors.cantidad_personas} aria-describedby={state.errors.cantidad_personas ? 'reserva-cantidad-error' : undefined} />
        {state.errors.cantidad_personas && <p id="reserva-cantidad-error" className="admin-error">{state.errors.cantidad_personas}</p>}
      </div>
      <p aria-live="polite">Total: <strong>{totalValido ? pesos.format(totalCentavos / 100) : 'Revisá la cantidad'}</strong></p>
      <p className="reservation-hint">El total se verifica con el precio vigente al reservar. Sin pago online por ahora.</p>
      {state.error && <p className="admin-error" role="alert">{state.error}</p>}
      <button className="button" type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Crear reserva'}</button>
    </form>
  )
}
