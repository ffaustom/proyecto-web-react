-- Lectura del listado administrativo, incluyendo experiencias inactivas.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON TABLE public.experiencias TO authenticated;

CREATE POLICY "Lectura de experiencias para usuarios autenticados"
ON public.experiencias
FOR SELECT
TO authenticated
USING (true);
