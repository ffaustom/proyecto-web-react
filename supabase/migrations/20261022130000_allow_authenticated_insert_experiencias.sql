-- Solo creación con sesión autenticada. No habilita UPDATE ni DELETE.
GRANT INSERT ON TABLE public.experiencias TO authenticated;

CREATE POLICY "Creacion de experiencias para usuarios autenticados"
ON public.experiencias
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) IS NOT NULL);
