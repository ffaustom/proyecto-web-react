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

  function editorialField(name, label, multiline, maxLength) {
    const props = { id: name, name, maxLength, defaultValue: state.values[name] ?? '',
      'aria-invalid': !!state.errors[name], 'aria-describedby': state.errors[name] ? `${name}-error` : undefined }
    return (
      <div className="admin-field" key={name}>
        <label htmlFor={name}>{label}</label>
        {multiline ? <textarea {...props} rows={5} /> : <input {...props} type="text" />}
        {state.errors[name] && <p id={`${name}-error`} className="admin-error">{state.errors[name]}</p>}
      </div>
    )
  }

  return (
    <form action={formAction} className="admin-form admin-create-form" aria-busy={pending}>
      <p className="admin-field-hint">Los campos de la propuesta son obligatorios; la galería y el relato editorial son opcionales. El precio se expresa en ARS.</p>
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
      <fieldset className="editorial-fields">
        <legend>Galería y relato editorial · opcional</legend>
        <div className="admin-field">
          <label htmlFor="galeria">Fotografías adicionales</label>
          <textarea id="galeria" name="galeria" rows={5} maxLength={5000} defaultValue={state.values.galeria ?? ''}
            aria-invalid={!!state.errors.galeria} aria-describedby={state.errors.galeria ? 'galeria-help galeria-error' : 'galeria-help'} />
          <p id="galeria-help" className="admin-field-hint">Una foto por línea: ruta | texto alternativo | pie opcional. Usá hasta cinco archivos de public, por ejemplo /images/nombre.jpg. No repitas la portada. Para quitarlas, dejá el campo vacío.</p>
          {state.errors.galeria && <p id="galeria-error" className="admin-error">{state.errors.galeria}</p>}
        </div>
        <div className="admin-field">
          <label htmlFor="titulo_editorial">Título del relato</label>
          <input id="titulo_editorial" name="titulo_editorial" maxLength={120} defaultValue={state.values.titulo_editorial ?? ''}
            aria-invalid={!!state.errors.titulo_editorial} aria-describedby={state.errors.titulo_editorial ? 'titulo-editorial-help titulo-editorial-error' : 'titulo-editorial-help'} />
          <p id="titulo-editorial-help" className="admin-field-hint">Hasta 120 caracteres. Si lo dejás vacío, se conserva el encabezado habitual.</p>
          {state.errors.titulo_editorial && <p id="titulo-editorial-error" className="admin-error">{state.errors.titulo_editorial}</p>}
        </div>
        <div className="admin-field">
          <label htmlFor="introduccion_editorial">Introducción editorial</label>
          <textarea id="introduccion_editorial" name="introduccion_editorial" rows={5} maxLength={2000} defaultValue={state.values.introduccion_editorial ?? ''}
            aria-invalid={!!state.errors.introduccion_editorial} aria-describedby={state.errors.introduccion_editorial ? 'introduccion-editorial-help introduccion-editorial-error' : 'introduccion-editorial-help'} />
          <p id="introduccion-editorial-help" className="admin-field-hint">Se muestra en lugar de la descripción breve en el detalle. La descripción se conserva para el catálogo. Las recomendaciones se editan únicamente en su campo habitual.</p>
          {state.errors.introduccion_editorial && <p id="introduccion-editorial-error" className="admin-error">{state.errors.introduccion_editorial}</p>}
        </div>
        {[1, 2].map((numero) => (
          <div className="editorial-form-section" key={numero}>
            {editorialField(`seccion_${numero}_titulo`, `Subtítulo de la sección ${numero}`, false, 120)}
            {editorialField(`seccion_${numero}_texto`, `Párrafos de la sección ${numero}`, true, 8000)}
          </div>
        ))}
        <div className="admin-field">
          <label htmlFor="relato_editorial">Párrafos sin subtítulo (formato anterior)</label>
          <textarea id="relato_editorial" name="relato_editorial" rows={9} maxLength={8000} defaultValue={state.values.relato_editorial ?? ''}
            aria-invalid={!!state.errors.relato_editorial} aria-describedby={state.errors.relato_editorial ? 'relato-editorial-help relato-editorial-error' : 'relato-editorial-help'} />
          <p id="relato-editorial-help" className="admin-field-hint">Párrafos sin subtítulo para conservar el formato anterior. Para contenido nuevo, usá las dos secciones de arriba. Separá párrafos con una línea en blanco. El relato completo admite ocho párrafos de hasta 2000 caracteres y 8000 en total. No repitas aquí las recomendaciones.</p>
          {state.errors.relato_editorial && <p id="relato-editorial-error" className="admin-error">{state.errors.relato_editorial}</p>}
        </div>
      </fieldset>
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
