CREATE TABLE public.experiencias (
    id text PRIMARY KEY,
    titulo text NOT NULL,
    provincia text NOT NULL,
    ubicacion text NOT NULL,
    region text NOT NULL,
    categoria text NOT NULL,
    duracion text NOT NULL,
    precio numeric(12,2) NOT NULL CHECK (precio >= 0),
    imagen text NOT NULL,
    alt text NOT NULL,
    descripcion text NOT NULL,
    incluye text[] NOT NULL,
    recomendacion text NOT NULL,
    destacada boolean NOT NULL DEFAULT false,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);