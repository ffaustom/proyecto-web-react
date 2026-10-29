-- Borrado únicamente con sesión autenticada.
GRANT DELETE ON TABLE public.experiencias TO authenticated;

CREATE POLICY "Eliminacion de experiencias para usuarios autenticados"
ON public.experiencias
FOR DELETE
TO authenticated
USING ((select auth.uid()) IS NOT NULL);
