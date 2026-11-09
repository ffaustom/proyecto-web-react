-- FASE 2 (exigencia): NO incluir en el despliegue de expansión.
-- Mantener fuera de migrations hasta publicar y verificar la versión nueva,
-- retirar versiones antiguas y completar las comprobaciones del README.
-- Entonces mover a supabase/migrations y aplicar solo esta migración pendiente.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- La política de fase 1 sigue validando toda fecha presente. Esta nueva
-- política restrictiva exige además su presencia para INSERT del rol anon.
CREATE POLICY "Fecha obligatoria para nuevas reservas publicas"
ON public.reservas AS RESTRICTIVE
FOR INSERT TO anon
WITH CHECK (fecha_visita IS NOT NULL);

-- No agregar NOT NULL ni CHECK relativo a hoy: conservar las reservas sin fecha
-- del historial/transición y permitir futuras actualizaciones de pagos/estados.
COMMENT ON COLUMN public.reservas.fecha_visita IS
    'Día de visita elegido, sin hora. Obligatorio en INSERT públicos desde fase 2; las reservas históricas y de transición pueden conservar NULL.';

COMMIT;
