import fotografias from './fotografias.json' with { type: 'json' }

// Preparación local: importar este módulo no consulta ni escribe en Supabase.
export const galeriasPreparadas = fotografias.experiences.map((experiencia) => {
  const galeria = experiencia.photos.map((foto) => ({
    src: foto.src,
    alt: foto.alt,
    pie: `${foto.title}. Foto: ${foto.author}. ${foto.license}. ${foto.note}`,
  }))
  return {
    experienciaId: experiencia.id,
    titulo: experiencia.title,
    galeria,
    textoFormulario: galeria.map(({ src, alt, pie }) => `${src} | ${alt} | ${pie}`).join('\n'),
  }
})
