ALTER TABLE public.experiencias ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.experiencias TO anon;

CREATE POLICY "Lectura publica de experiencias activas"
ON public.experiencias
FOR SELECT
TO anon
USING (activo = true);
