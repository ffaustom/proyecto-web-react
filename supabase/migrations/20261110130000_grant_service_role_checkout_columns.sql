-- Acceso operativo del backend de Checkout Pro. No habilita acceso público.
-- service_role ya tiene USAGE sobre public y BYPASSRLS en el remoto auditado;
-- BYPASSRLS no reemplaza los permisos SQL sobre tablas/columnas.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- Lectura para preferencias y para verificar referencia, importe y estado del pago.
-- No se permite leer nombre_comprador ni email, ni modificar el total contratado.
GRANT SELECT (
    id,
    experiencia_id,
    cantidad_personas,
    total,
    estado,
    fecha_visita,
    mercado_pago_preference_id,
    mercado_pago_payment_id,
    mercado_pago_status
)
ON TABLE public.reservas TO service_role;

-- Asociar la preferencia y, en el futuro, registrar el pago verificado por API.
-- La autenticidad, idempotencia y transiciones se resolverán en el flujo de pagos.
GRANT UPDATE (
    estado,
    mercado_pago_preference_id,
    mercado_pago_payment_id,
    mercado_pago_status
)
ON TABLE public.reservas TO service_role;

-- Son exactamente los campos consultados por el módulo de preferencias.
GRANT SELECT (id, titulo, activo)
ON TABLE public.experiencias TO service_role;

-- Sin cambios en RLS, roles públicos, datos existentes o exigencia de fecha.
COMMIT;
