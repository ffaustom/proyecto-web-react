import { obtenerExperiencias } from '../../../lib/experiencias'

export const dynamic = 'force-dynamic'

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request) {
  const params = new URL(request.url).searchParams
  const filtros = {}

  for (const campo of params.keys()) {
    if (!['region', 'categoria'].includes(campo) || params.getAll(campo).length !== 1) {
      return json({ error: 'Usá únicamente un parámetro region y uno categoria.' }, 400)
    }
    const valor = params.get(campo).trim()
    if (!valor || valor.length > 100 || /[\u0000-\u001f\u007f]/u.test(valor)) {
      return json({ error: 'Los filtros deben tener entre 1 y 100 caracteres, sin caracteres de control.' }, 400)
    }
    filtros[campo] = valor
  }

  try {
    const experiencias = await obtenerExperiencias()
    const datos = experiencias
      .filter((experiencia) => (!filtros.region || experiencia.region === filtros.region)
        && (!filtros.categoria || experiencia.categoria === filtros.categoria))
      // Contrato público explícito: no devolver registros completos de Supabase.
      .map(({ id, titulo, provincia, region, categoria, duracion, precio, imagen, alt }) => ({
        id, titulo, provincia, region, categoria, duracion, precio, imagen, alt,
      }))
    return json({ experiencias: datos })
  } catch {
    return json({ error: 'No pudimos cargar las experiencias. Intentá nuevamente más tarde.' }, 500)
  }
}
