import 'server-only'

import { realpath, stat } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { validarExperiencia as validarCampos } from './validacion'

export async function validarExperiencia(formData) {
  const resultado = validarCampos(formData)
  if (Object.keys(resultado.errors).length) return resultado

  try {
    const publicDir = await realpath(resolve(process.cwd(), 'public'))
    for (const foto of resultado.experiencia.galeria ?? []) {
      const archivo = await realpath(resolve(publicDir, foto.src.slice(1)))
      const ruta = relative(publicDir, archivo)
      if (ruta.startsWith('..') || isAbsolute(ruta) || !(await stat(archivo)).isFile()) {
        throw new Error('Ruta fuera de public o archivo inválido')
      }
    }
  } catch {
    resultado.errors.galeria = 'Todas las fotos deben existir como archivos dentro de public. Revisá las rutas y agregá los archivos al proyecto antes de guardar.'
  }
  return resultado
}
