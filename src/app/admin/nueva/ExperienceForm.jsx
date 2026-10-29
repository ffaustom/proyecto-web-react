'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { crearExperiencia } from './actions'
import { camposTexto, imagenes } from './validacion'

export default function ExperienceForm({ action = crearExperiencia, initialValues = {}, editing = false }) {
  const [state, formAction, pending] = useActionState(action, { values: initialValues, errors: {}, error: '' })

  function field(name, label, multiline = false) {
    const props = {
      id: name, name, required: true, defaultValue: state.values[name] ?? '',
      'aria-invalid': !!state.errors[name],
      'aria-describedby': [state.errors[name] && `${name}-error`, name === 'id' && 'id-help', name === 'incluye' && 'incluye-help'].filter(Boolean).join(' ') || undefined,
    }
    return (
      <div className="admin-field" key={name}>
        <label htmlFor={name}>{label}</label>
        {multiline ? <textarea {...props} rows={4} /> : <input {...props} type="text" pattern={name === 'id' ? '[a-z0-9]+(-[a-z0-9]+)*' : undefined} />}
        {name === 'id' && <p id="id-help" className="admin-field-hint">Único, en minúsculas y con guiones. Ejemplo: paseo-por-el-delta.</p>}
        {name === 'incluye' && <p id="incluye-help" className="admin-field-hint">Escribí un elemento por línea.</p>}
        {state.errors[name] && <p id={`${name}-error`} className="admin-error">{state.errors[name]}</p>}
      </div>
    )
  }

  return (
    <form action={formAction} className="admin-form admin-create-form" aria-busy={pending}>
      <p className="admin-field-hint">Todos los campos de contenido son obligatorios. El precio se expresa en ARS.</p>
      {camposTexto.map(([name, label]) => field(name, label, ['descripcion', 'incluye', 'recomendacion'].includes(name)))}
      <div className="admin-field">
        <label htmlFor="precio">Precio (ARS)</label>
        <input id="precio" name="precio" type="number" min="0" max="9999999999.99" step="0.01" required defaultValue={state.values.precio ?? ''} aria-invalid={!!state.errors.precio} aria-describedby={state.errors.precio ? 'precio-error' : undefined} />
        {state.errors.precio && <p id="precio-error" className="admin-error">{state.errors.precio}</p>}
      </div>
      <div className="admin-field">
        <label htmlFor="imagen">Imagen</label>
        <select id="imagen" name="imagen" required defaultValue={state.values.imagen ?? ''} aria-invalid={!!state.errors.imagen} aria-describedby="imagen-help imagen-error">
          <option value="">Elegí una imagen</option>
          {imagenes.map((imagen) => <option key={imagen} value={imagen}>{imagen.replace('/images/', '')}</option>)}
        </select>
        <p id="imagen-help" className="admin-field-hint">Imágenes locales disponibles en Afuera. La carga de archivos todavía no está habilitada.</p>
        <p id="imagen-error" className="admin-error">{state.errors.imagen}</p>
      </div>
      <label className="admin-checkbox"><input type="checkbox" name="activo" defaultChecked={state.values.activo ?? true} /> Activa (visible en el catálogo público)</label>
      <label className="admin-checkbox"><input type="checkbox" name="destacada" defaultChecked={state.values.destacada ?? false} /> Destacada</label>
      <div aria-live="polite" aria-atomic="true">{state.error && <p className="admin-error" role="alert">{state.error}</p>}</div>
      <div className="admin-form-actions">
        <button className="button" type="submit" disabled={pending}>{pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar experiencia'}</button>
        <Link className="text-link" href="/admin">Cancelar</Link>
      </div>
    </form>
  )
}
