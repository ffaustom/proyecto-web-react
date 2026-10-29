BEGIN;

CREATE TABLE public.reservas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    experiencia_id text NOT NULL,
    nombre_comprador text NOT NULL,
    email text NOT NULL,
    cantidad_personas integer NOT NULL,
    total numeric(12,2) NOT NULL,
    estado text NOT NULL DEFAULT 'pendiente',
    mercado_pago_preference_id text,
    mercado_pago_payment_id text,
    mercado_pago_status text,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT reservas_experiencia_id_fkey
        FOREIGN KEY (experiencia_id)
        REFERENCES public.experiencias (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT reservas_nombre_comprador_no_vacio
        CHECK (length(btrim(nombre_comprador)) > 0),
    CONSTRAINT reservas_email_no_vacio
        CHECK (length(btrim(email)) > 0),
    CONSTRAINT reservas_cantidad_personas_positiva
        CHECK (cantidad_personas > 0),
    CONSTRAINT reservas_total_no_negativo
        CHECK (total >= 0 AND total <> 'NaN'::numeric),
    CONSTRAINT reservas_estado_valido
        CHECK (estado IN (
            'pendiente', 'confirmada', 'cancelada', 'expirada', 'reembolsada'
        )),
    CONSTRAINT reservas_mercado_pago_payment_id_key
        UNIQUE (mercado_pago_payment_id)
);

CREATE INDEX reservas_experiencia_id_idx
    ON public.reservas (experiencia_id);

-- El importe conserva el valor de la reserva aunque cambie el precio de la experiencia.
COMMENT ON COLUMN public.reservas.total IS
    'Importe total de la reserva al crearla; no se recalcula desde experiencias.precio.';

COMMENT ON COLUMN public.reservas.mercado_pago_status IS
    'Estado del pago informado por Mercado Pago, independiente del estado de la reserva.';

-- Sin políticas: los clientes sujetos a RLS no podrán acceder a las reservas.
-- Las futuras políticas y la integración de pagos se definirán por separado.
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

COMMIT;
