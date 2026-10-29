-- Solo edición con sesión autenticada. No habilita DELETE.
GRANT UPDATE ON TABLE public.experiencias TO authenticated;

CREATE POLICY "Edicion de experiencias para usuarios autenticados"
ON public.experiencias
FOR UPDATE
TO authenticated
USING ((select auth.uid()) IS NOT NULL)
WITH CHECK ((select auth.uid()) IS NOT NULL);
