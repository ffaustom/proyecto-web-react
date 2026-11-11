-- Preparada, NO ejecutada. Requiere las migraciones previas de checkout.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Fecha del recurso consultado por API, no del evento recibido.
ALTER TABLE public.reservas ADD COLUMN mercado_pago_updated_at timestamptz;

CREATE FUNCTION public.registrar_pago_verificado(
    p_reserva_id uuid, p_preferencia text, p_payment_id text,
    p_estado text, p_importe numeric, p_moneda text, p_actualizado timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    reserva public.reservas%ROWTYPE;
BEGIN
    IF p_payment_id IS NULL OR p_payment_id !~ '^[1-9][0-9]{0,19}$'
        OR p_estado IS NULL OR p_estado NOT IN ('approved', 'pending', 'in_process', 'authorized', 'rejected', 'cancelled')
        OR p_actualizado IS NULL OR NOT isfinite(p_actualizado)
        OR p_moneda IS DISTINCT FROM 'ARS' OR p_importe IS NULL
        OR p_importe <= 0 OR p_importe > 9999999999.99
        OR p_importe <> round(p_importe, 2) THEN
        RAISE EXCEPTION 'PAGO_DATOS_INVALIDOS';
    END IF;
    -- Mismo orden de bloqueos que operar_checkout, para evitar interbloqueos.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_reserva_id::text, 0));
    PERFORM 1 FROM public.checkout_intentos WHERE reserva_id = p_reserva_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PAGO_INTENTO_INEXISTENTE'; END IF;
    SELECT * INTO reserva FROM public.reservas WHERE id = p_reserva_id FOR UPDATE;
    IF reserva.id IS NULL OR p_preferencia IS NULL
        OR reserva.mercado_pago_preference_id IS DISTINCT FROM p_preferencia
        OR reserva.total IS DISTINCT FROM p_importe THEN
        RAISE EXCEPTION 'PAGO_RESERVA_INCOMPATIBLE';
    END IF;
    -- El UNIQUE existente impide que un mismo pago quede asociado a dos reservas.
    -- Una aprobación es terminal aquí: eventos atrasados u otros intentos no la pisan.
    IF reserva.estado <> 'pendiente' THEN RETURN 'ignorado'; END IF;
    IF reserva.mercado_pago_payment_id = p_payment_id
        AND reserva.mercado_pago_updated_at >= p_actualizado THEN
        RETURN 'duplicado';
    END IF;
    -- Un intento fallido no bloquea un pago aprobado posterior de la misma preferencia.
    -- Entre intentos sin aprobación se conserva la observación más reciente.
    IF p_estado <> 'approved' AND reserva.mercado_pago_updated_at > p_actualizado THEN
        RETURN 'ignorado';
    END IF;
    UPDATE public.reservas SET
        mercado_pago_payment_id = p_payment_id,
        mercado_pago_status = p_estado,
        mercado_pago_updated_at = p_actualizado,
        estado = CASE WHEN p_estado = 'approved' THEN 'confirmada' ELSE 'pendiente' END
    WHERE id = p_reserva_id;
    RETURN 'aplicado';
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_pago_verificado(uuid, text, text, text, numeric, text, timestamptz)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_verificado(uuid, text, text, text, numeric, text, timestamptz)
    TO service_role;
-- Sin políticas nuevas ni acceso público a reservas. No se conceden permisos
-- directos sobre la columna nueva: solo la función privada puede escribirla.
COMMIT;
