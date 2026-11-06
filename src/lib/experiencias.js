import 'server-only'

import { cache } from 'react'
import { crearClienteSupabase } from './supabase/server'

const columnas = 'id,titulo,provincia,ubicacion,region,categoria,duracion,precio,imagen,alt,descripcion,incluye,recomendacion,destacada'

function consultarExperiencias() {
  return crearClienteSupabase().from('experiencias').select(columnas).eq('activo', true)
}

function verificarError(error) {
  if (error) {
    console.error('Error al consultar experiencias en Supabase:', error.code, error.message)
    throw new Error('No pudimos cargar las experiencias. Intentá nuevamente más tarde.')
  }
}

export async function obtenerExperiencias() {
  const { data, error } = await consultarExperiencias().order('created_at').order('id')
  verificarError(error)
  return data ?? []
}

// Metadata y página comparten la consulta durante el mismo render del servidor.
export const obtenerExperiencia = cache(async (id) => {
  // Solo el detalle necesita los campos editoriales. El listado y la API
  // conservan su selección explícita y su contrato actual.
  const { data, error } = await crearClienteSupabase().from('experiencias')
    .select('*').eq('activo', true).eq('id', id).maybeSingle()
  verificarError(error)
  return data
})

export async function obtenerDestacadas() {
  const { data, error } = await consultarExperiencias()
    .eq('destacada', true).order('created_at').order('id')
  verificarError(error)
  return data ?? []
}
