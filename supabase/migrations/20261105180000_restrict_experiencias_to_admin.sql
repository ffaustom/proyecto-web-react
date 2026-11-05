BEGIN;

-- Configuración independiente de Next.js: reemplazar SOLO este marcador por
-- el mismo UUID de Supabase Auth que ADMIN_USER_ID antes de aplicar el archivo.
-- No aplicar sin revisar: PostgreSQL no puede leer el .env de Next.js.
CREATE SCHEMA IF NOT EXISTS private;

DO $migration$
DECLARE
    admin_user_id text := '976daed0-b21e-493b-a11a-e2c568b7764e';
BEGIN
    IF admin_user_id = 'REEMPLAZAR_' || 'CON_UUID_ADMIN' THEN
        RAISE EXCEPTION 'Configurá el UUID administrador en esta migración antes de aplicarla (mismo valor que ADMIN_USER_ID).';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = admin_user_id::uuid) THEN
        RAISE EXCEPTION 'El UUID administrador configurado no existe en auth.users.';
    END IF;

    -- Una constante sin SECURITY DEFINER ni acceso a tablas. El esquema private
    -- no debe agregarse a los esquemas expuestos por la Data API de Supabase.
    EXECUTE format(
        'CREATE OR REPLACE FUNCTION private.experiencias_admin_id()
         RETURNS uuid LANGUAGE sql IMMUTABLE SECURITY INVOKER
         SET search_path = ''''
         AS %L',
        format('SELECT %L::uuid', admin_user_id::uuid)
    );
END;
$migration$;

REVOKE ALL ON FUNCTION private.experiencias_admin_id() FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.experiencias_admin_id() TO authenticated;

ALTER TABLE public.experiencias ENABLE ROW LEVEL SECURITY;

-- Quitar también privilegios como TRUNCATE, que no se filtran mediante RLS.
REVOKE ALL PRIVILEGES ON TABLE public.experiencias FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON TABLE public.experiencias TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.experiencias TO authenticated;

-- Las políticas permisivas se combinan con OR: reemplazar las amplias,
-- incluyendo la lectura autenticada que exponía las experiencias inactivas.
DROP POLICY IF EXISTS "Lectura de experiencias para usuarios autenticados" ON public.experiencias;
DROP POLICY IF EXISTS "Creacion de experiencias para usuarios autenticados" ON public.experiencias;
DROP POLICY IF EXISTS "Edicion de experiencias para usuarios autenticados" ON public.experiencias;
DROP POLICY IF EXISTS "Eliminacion de experiencias para usuarios autenticados" ON public.experiencias;

-- Se conserva la política pública existente para anon (activo = true).
CREATE POLICY "Lectura de experiencias activas para usuarios autenticados"
ON public.experiencias FOR SELECT TO authenticated
USING (activo = true);

CREATE POLICY "Lectura completa de experiencias para administrador"
ON public.experiencias FOR SELECT TO authenticated
USING ((select auth.uid()) = (select private.experiencias_admin_id()));

CREATE POLICY "Creacion de experiencias para administrador"
ON public.experiencias FOR INSERT TO authenticated
WITH CHECK ((select auth.uid()) = (select private.experiencias_admin_id()));

CREATE POLICY "Edicion de experiencias para administrador"
ON public.experiencias FOR UPDATE TO authenticated
USING ((select auth.uid()) = (select private.experiencias_admin_id()))
WITH CHECK ((select auth.uid()) = (select private.experiencias_admin_id()));

CREATE POLICY "Eliminacion de experiencias para administrador"
ON public.experiencias FOR DELETE TO authenticated
USING ((select auth.uid()) = (select private.experiencias_admin_id()));

COMMIT;
