-- Preparada localmente: requiere revisión y aplicación autorizada antes de habilitar checkout.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Coordinación durable entre instancias de Vercel. Sin duplicar datos del comprador.
CREATE TABLE public.checkout_intentos (
    reserva_id uuid PRIMARY KEY REFERENCES public.reservas(id) ON DELETE RESTRICT,
    estado text NOT NULL CHECK (estado IN ('reservada', 'creando', 'lista')),
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checkout_intentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.checkout_intentos FROM PUBLIC, anon, authenticated, service_role;

-- Solo el backend puede invocarla. El UUID proviene de un intento firmado por el servidor.
-- La transacción crea la reserva y reclama el único permiso para enviar el POST a MP.
CREATE FUNCTION public.operar_checkout(
    p_operacion text,
    p_id uuid,
    p_experiencia_id text DEFAULT NULL,
    p_nombre text DEFAULT NULL,
    p_email text DEFAULT NULL,
    p_cantidad integer DEFAULT NULL,
    p_fecha date DEFAULT NULL,
    p_preferencia text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    reserva public.reservas%ROWTYPE;
    intento public.checkout_intentos%ROWTYPE;
    experiencia public.experiencias%ROWTYPE;
    importe numeric;
    crear boolean := false;
BEGIN
    IF p_id IS NULL OR p_operacion NOT IN ('preparar', 'guardar', 'liberar') OR p_operacion IS NULL THEN
        RAISE EXCEPTION 'CHECKOUT_OPERACION_INVALIDA';
    END IF;
    -- Bloquea también cuando todavía no existe la fila. La colisión del hash solo serializa.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 0));
    SELECT * INTO intento FROM public.checkout_intentos WHERE reserva_id = p_id FOR UPDATE;
    SELECT * INTO reserva FROM public.reservas WHERE id = p_id FOR UPDATE;

    IF p_operacion = 'preparar' THEN
        IF p_nombre IS NULL OR length(btrim(p_nombre)) NOT BETWEEN 1 AND 200
            OR p_email IS NULL OR length(p_email) > 254
            OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
            OR p_cantidad IS NULL OR p_cantidad <= 0
            OR p_fecha IS NULL
            OR p_fecha < DATE '0001-01-01'
            OR p_fecha > DATE '9999-12-31' THEN
            RAISE EXCEPTION 'CHECKOUT_DATOS_INVALIDOS';
        END IF;
        IF reserva.id IS NULL THEN
            IF p_fecha < (statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN
                RAISE EXCEPTION 'CHECKOUT_FECHA_PASADA';
            END IF;
            SELECT * INTO experiencia FROM public.experiencias
                WHERE id = p_experiencia_id AND activo = true FOR SHARE;
            IF experiencia.id IS NULL THEN RAISE EXCEPTION 'CHECKOUT_EXPERIENCIA_INACTIVA'; END IF;
            -- Importe calculado exclusivamente con el precio confiable de la base.
            importe := experiencia.precio * p_cantidad;
            IF importe <= 0 OR importe > 9999999999.99 THEN
                RAISE EXCEPTION 'CHECKOUT_IMPORTE_INVALIDO';
            END IF;
            INSERT INTO public.reservas (id, experiencia_id, nombre_comprador, email,
                cantidad_personas, fecha_visita, total, estado)
            VALUES (p_id, experiencia.id, btrim(p_nombre), p_email, p_cantidad, p_fecha, importe, 'pendiente')
            RETURNING * INTO reserva;
            INSERT INTO public.checkout_intentos (reserva_id, estado) VALUES (p_id, 'reservada')
            RETURNING * INTO intento;
        ELSE
            -- No adoptar reservas históricas ni modificar una reserva en un reintento.
            IF intento.reserva_id IS NULL THEN RAISE EXCEPTION 'CHECKOUT_INTENTO_INVALIDO'; END IF;
            IF reserva.experiencia_id IS DISTINCT FROM p_experiencia_id
                OR reserva.nombre_comprador IS DISTINCT FROM btrim(p_nombre)
                OR reserva.email IS DISTINCT FROM p_email
                OR reserva.cantidad_personas IS DISTINCT FROM p_cantidad
                OR reserva.fecha_visita IS DISTINCT FROM p_fecha THEN
                RAISE EXCEPTION 'CHECKOUT_DATOS_DISTINTOS';
            END IF;
        END IF;
        IF reserva.estado <> 'pendiente' THEN RAISE EXCEPTION 'CHECKOUT_RESERVA_NO_PENDIENTE'; END IF;
        IF intento.estado = 'reservada' AND reserva.mercado_pago_preference_id IS NULL THEN
            -- Recuperar una preferencia previa no es iniciar un pago nuevo.
            -- Un intento liberado sí enviaría otro POST y debe exigir fecha vigente.
            IF reserva.fecha_visita < (statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN
                RAISE EXCEPTION 'CHECKOUT_FECHA_PASADA';
            END IF;
            UPDATE public.checkout_intentos SET estado = 'creando' WHERE reserva_id = p_id;
            crear := true;
        END IF;
    ELSE
        IF reserva.id IS NULL OR intento.reserva_id IS NULL OR reserva.estado <> 'pendiente' THEN
            RAISE EXCEPTION 'CHECKOUT_INTENTO_INVALIDO';
        END IF;
        IF p_operacion = 'guardar' THEN
            IF p_preferencia IS NULL OR length(p_preferencia) NOT BETWEEN 1 AND 200
                OR intento.estado NOT IN ('creando', 'lista') THEN
                RAISE EXCEPTION 'CHECKOUT_PREFERENCIA_INVALIDA';
            END IF;
            IF reserva.mercado_pago_preference_id IS NOT NULL
                AND reserva.mercado_pago_preference_id <> p_preferencia THEN
                RAISE EXCEPTION 'CHECKOUT_PREFERENCIA_DISTINTA';
            END IF;
            UPDATE public.reservas SET mercado_pago_preference_id = p_preferencia
                WHERE id = p_id RETURNING * INTO reserva;
            UPDATE public.checkout_intentos SET estado = 'lista' WHERE reserva_id = p_id;
        ELSIF intento.estado = 'creando' AND reserva.mercado_pago_preference_id IS NULL THEN
            -- Solo ante un rechazo HTTP inequívoco; nunca ante timeout/5xx/desconexión.
            UPDATE public.checkout_intentos SET estado = 'reservada' WHERE reserva_id = p_id;
        END IF;
    END IF;
    RETURN jsonb_build_object('id', reserva.id, 'crear', crear,
        'preferencia_id', reserva.mercado_pago_preference_id);
END;
$$;
REVOKE ALL ON FUNCTION public.operar_checkout(text, uuid, text, text, text, integer, date, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operar_checkout(text, uuid, text, text, text, integer, date, text)
    TO service_role;
COMMIT;
