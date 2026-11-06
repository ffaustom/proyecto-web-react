BEGIN;

-- Campos opcionales: las filas existentes mantienen sus datos y reciben NULL.
-- La portada, descripción e incluidos actuales siguen siendo la base del detalle.
ALTER TABLE public.experiencias
    ADD COLUMN galeria jsonb,
    ADD COLUMN contenido_editorial jsonb,
    ADD CONSTRAINT experiencias_galeria_formato CHECK (
        galeria IS NULL OR CASE WHEN jsonb_typeof(galeria) = 'array'
            THEN jsonb_array_length(galeria) <= 5 ELSE false END
    ),
    ADD CONSTRAINT experiencias_contenido_editorial_formato CHECK (
        contenido_editorial IS NULL OR jsonb_typeof(contenido_editorial) = 'object'
    );

COMMENT ON COLUMN public.experiencias.galeria IS
    'Hasta cinco fotos adicionales, ordenadas: [{src, alt, pie}]. La portada sigue en imagen/alt.';
COMMENT ON COLUMN public.experiencias.contenido_editorial IS
    'Contenido opcional en texto plano: {titulo, parrafos: [texto]}. No reemplaza descripcion ni incluye.';

COMMIT;
