'use client'

import { startTransition, useActionState, useId } from 'react'
import { eliminarExperiencia } from './delete-actions'

export default function DeleteExperienceButton({ id, titulo }) {
  const [state, deleteAction, pending] = useActionState(eliminarExperiencia.bind(null, id), { error: '' })
  const errorId = useId()

  function confirmarEliminacion() {
    if (!window.confirm(`¿Querés eliminar “${titulo}”? Esta acción es permanente y no se puede deshacer.`)) return
    startTransition(() => deleteAction())
  }

  return (
    <div className="admin-delete">
      <button type="button" className="admin-delete-button" disabled={pending} onClick={confirmarEliminacion} aria-label={`Eliminar ${titulo}`} aria-describedby={state.error ? errorId : undefined} aria-busy={pending}>
        {pending ? 'Eliminando…' : 'Eliminar'}
      </button>
      <div aria-live="polite" aria-atomic="true">
        {state.error && <p id={errorId} className="admin-error" role="alert">{state.error}</p>}
      </div>
    </div>
  )
}
