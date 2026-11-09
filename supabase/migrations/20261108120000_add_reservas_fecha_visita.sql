BEGIN;

SET LOCAL lock_timeout = '5s';

-- FASE 1 (expansión): aplicar antes del despliegue del formulario nuevo.
-- Sin default ni backfill: las reservas anteriores conservan NULL.
ALTER TABLE public.reservas ADD COLUMN fecha_visita date;
COMMENT ON COLUMN public.reservas.fecha_visita IS
    'Día de visita elegido, sin hora. NULL para reservas históricas y solicitudes antiguas durante la transición.';

-- Se conservan los permisos por columna; no habilitar lectura ni campos de pago.
GRANT INSERT (fecha_visita) ON TABLE public.reservas TO anon;

-- RESTRICTIVE se combina con AND con la política pública existente, que sigue
-- verificando experiencia activa, importe, comprador y estado pendiente.
-- No usar un CHECK con hoy: una reserva válida debe poder quedar en el pasado.
CREATE POLICY "Fecha valida cuando presente en reservas publicas"
ON public.reservas AS RESTRICTIVE
FOR INSERT TO anon
WITH CHECK (
    fecha_visita IS NULL
    OR (
        fecha_visita >= (statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        AND fecha_visita <= DATE '9999-12-31'
    )
);

-- No se filtra por temporada; no se modifican estados, importes ni pagos.
COMMIT;
