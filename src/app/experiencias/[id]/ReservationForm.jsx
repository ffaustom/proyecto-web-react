'use client'

import { useActionState, useEffect, useState } from 'react'
import { crearReserva } from './actions'
import { iniciarCheckout, empezarOtraReserva, establecerIntentoCheckout } from './checkout-actions'
import { hoyArgentina, validarFechaVisita } from '../../../lib/fechas.js'
import SeasonalRecommendation from '../../../components/SeasonalRecommendation'

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export default function ReservationForm({ experienciaId, precio, hoyInicial, checkoutToken = null, checkoutInicial = null, checkoutReanudado = false }) {
  const [cantidad, setCantidad] = useState('1')
  const [fecha, setFecha] = useState('')
  const [hoy, setHoy] = useState(hoyInicial)
  const [errorFechaCliente, setErrorFechaCliente] = useState('')
  const accion = checkoutToken ? iniciarCheckout.bind(null, experienciaId, checkoutToken) : crearReserva.bind(null, experienciaId)
  const [state, formAction, pending] = useActionState(accion, {
    values: {}, errors: {}, error: '',
  })
  const [sesion, prepararSesion, preparandoSesion] = useActionState(establecerIntentoCheckout.bind(null, experienciaId, checkoutInicial), { error: '' })
  const unidades = Number(cantidad)
  const totalCentavos = Math.round(Number(precio) * 100) * unidades
  const totalValido = Number.isInteger(unidades) && unidades > 0 && unidades <= 2147483647
    && Number.isSafeInteger(totalCentavos) && totalCentavos >= 0 && totalCentavos <= 999999999999
  const fechaMinima = checkoutToken ? '0001-01-01' : hoy
  const errorFecha = errorFechaCliente || (fecha ? validarFechaVisita(fecha, fechaMinima) : '')
    || (fecha === state.values.fecha_visita ? state.errors.fecha_visita : '')

  useEffect(() => {
    const actualizar = () => setHoy(hoyArgentina())
    actualizar()
    const intervalo = window.setInterval(actualizar, 30000)
    window.addEventListener('focus', actualizar)
    return () => {
      window.clearInterval(intervalo)
      window.removeEventListener('focus', actualizar)
    }
  }, [])

  function validarEnvio(event) {
    const hoyActual = hoyArgentina()
    setHoy(hoyActual)
    const error = validarFechaVisita(fecha, checkoutToken ? '0001-01-01' : hoyActual)
    setErrorFechaCliente(error)
    if (error) {
      event.preventDefault()
      event.currentTarget.elements.fecha_visita.focus()
    }
  }

  if (checkoutInicial && !checkoutToken) {
    return <form action={prepararSesion} className="reservation-form" aria-busy={preparandoSesion}>
      <p>Prepará tu intento antes de completar la reserva. Así podrás reanudarlo sin crear otra reserva si se interrumpe la conexión.</p>
      {sesion.error && <p className="admin-error" role="alert">{sesion.error}</p>}
      <button className="button" type="submit" disabled={preparandoSesion}>{preparandoSesion ? 'Preparando sesión…' : 'Comenzar reserva de prueba'}</button>
    </form>
  }

  if (state.success) {
    return <p className="reservation-notice" role="status">Recibimos tu reserva. Quedó pendiente de confirmación. No se realizó ningún cobro.</p>
  }

  return (
    <>
    <form action={formAction} onSubmit={validarEnvio} className="reservation-form" aria-busy={pending}>
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
        <label htmlFor="reserva-fecha">Fecha de visita</label>
        <input id="reserva-fecha" name="fecha_visita" type="date" required min={fechaMinima} max="9999-12-31"
          value={fecha} onChange={(event) => { setFecha(event.target.value); setErrorFechaCliente('') }}
          aria-invalid={!!errorFecha} aria-describedby={`reserva-temporada${errorFecha ? ' reserva-fecha-error' : ''}`} />
        {errorFecha && <p id="reserva-fecha-error" className="admin-error" role="alert">{errorFecha}</p>}
        {checkoutToken && <p className="reservation-hint">Para una reserva nueva, elegí hoy o una fecha posterior. Para reanudar, ingresá la fecha original.</p>}
      </div>
      <SeasonalRecommendation experienciaId={experienciaId} fecha={fecha} />
      <div className="admin-field">
        <label htmlFor="reserva-cantidad">Cantidad de personas</label>
        <input id="reserva-cantidad" name="cantidad_personas" type="number" min="1" max="2147483647" step="1" required value={cantidad} onChange={(event) => setCantidad(event.target.value)} aria-invalid={!!state.errors.cantidad_personas} aria-describedby={state.errors.cantidad_personas ? 'reserva-cantidad-error' : undefined} />
        {state.errors.cantidad_personas && <p id="reserva-cantidad-error" className="admin-error">{state.errors.cantidad_personas}</p>}
      </div>
      <p aria-live="polite">Total: <strong>{totalValido ? pesos.format(totalCentavos / 100) : 'Revisá la cantidad'}</strong></p>
      <p className="reservation-hint">{checkoutToken
        ? 'Checkout de prueba: usá solamente la cuenta y las tarjetas de prueba de Mercado Pago. El importe se verifica al reservar.'
        : 'El total se verifica con el precio vigente al reservar. Sin pago online por ahora.'}</p>
      {checkoutToken && (checkoutReanudado || state.reservaCreada) && <p className="reservation-hint">Reanudá tu intento con los mismos datos para conservar la reserva.</p>}
      {state.error && <p className="admin-error" role="alert">{state.error}</p>}
      <button className="button" type="submit" disabled={pending}>{pending ? (checkoutToken ? 'Preparando checkout…' : 'Guardando…')
        : checkoutToken ? 'Continuar al checkout de prueba' : 'Crear reserva'}</button>
    </form>
    {checkoutToken && !state.requiereRevision && (checkoutReanudado || state.reservaCreada) && <form action={empezarOtraReserva.bind(null, experienciaId, checkoutToken)}>
      <p>Solo para una compra distinta: la reserva anterior se conservará.</p>
      <button className="text-link" type="submit" disabled={pending}>Empezar otra reserva</button>
    </form>}
    </>
  )
}
