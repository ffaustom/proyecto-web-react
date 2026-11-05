BEGIN;

ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

-- No se conceden permisos de lectura, actualización ni borrado.
-- Revocar INSERT a nivel tabla permite limitar las columnas escribibles.
REVOKE ALL PRIVILEGES ON TABLE public.reservas FROM anon;
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT (experiencia_id, nombre_comprador, email, cantidad_personas, total, estado)
    ON TABLE public.reservas TO anon;

CREATE POLICY "Creacion publica de reservas pendientes"
ON public.reservas
FOR INSERT
TO anon
WITH CHECK (
    estado = 'pendiente'
    AND cantidad_personas > 0
    AND length(btrim(nombre_comprador)) BETWEEN 1 AND 200
    AND length(email) <= 254
    AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    AND mercado_pago_preference_id IS NULL
    AND mercado_pago_payment_id IS NULL
    AND mercado_pago_status IS NULL
    AND EXISTS (
        SELECT 1
        FROM public.experiencias AS experiencia
        WHERE experiencia.id = reservas.experiencia_id
          AND experiencia.activo = true
          AND reservas.total = experiencia.precio * reservas.cantidad_personas
    )
);

COMMIT;
