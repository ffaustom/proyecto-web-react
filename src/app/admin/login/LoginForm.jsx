'use client'

import { useActionState } from 'react'
import { iniciarSesion } from './actions'

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(iniciarSesion, { error: '' })

  return (
    <form action={formAction} className="admin-form" aria-busy={pending}>
      <div className="admin-field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required aria-describedby={state.error ? 'login-error' : undefined} />
      </div>
      <div className="admin-field">
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required aria-describedby={state.error ? 'login-error' : undefined} />
      </div>
      <div aria-live="polite" aria-atomic="true">
        {state.error && <p id="login-error" className="admin-error" role="alert">{state.error}</p>}
      </div>
      <button className="button" type="submit" disabled={pending}>{pending ? 'Ingresando…' : 'Iniciar sesión'}</button>
    </form>
  )
}
