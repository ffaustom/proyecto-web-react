import { experiencias } from '../data/experiencias'

// Las páginas consultan esta capa: aquí se incorporará el acceso a Supabase.
export async function obtenerExperiencias() {
  return experiencias
}

export async function obtenerExperiencia(id) {
  return experiencias.find((experiencia) => experiencia.id === id) ?? null
}

export async function obtenerDestacadas() {
  return experiencias.filter((experiencia) => experiencia.destacada)
}
