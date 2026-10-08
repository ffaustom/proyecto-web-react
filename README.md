# Afuera

Primera versión de un marketplace de experiencias turísticas en Argentina.
Proyecto académico construido con Next.js App Router, React, JavaScript y JSX.

## Desarrollo

```sh
npm install
npm run dev
```

Abrir http://localhost:3000. Para verificar producción:

```sh
npm run build
npm start
```

## Páginas

- `/`: presentación y experiencias destacadas.
- `/experiencias`: catálogo con filtros combinables por región y categoría.
- `/experiencias/[id]`: detalle de cada experiencia. Los identificadores desconocidos muestran un 404.
- `/sobre-el-proyecto`: contexto del proyecto académico.

## Organización

- `src/data/experiencias.js`: seis propuestas ficticias. Precios numéricos en pesos argentinos por persona, imágenes locales y textos alternativos.
- `src/lib/experiencias.js`: acceso asíncrono a los datos. Es el punto previsto para reemplazar los datos simulados por consultas a Supabase; todavía no hay integración ni variables de entorno necesarias.
- `src/lib/formato.js`: formato de precios con `Intl.NumberFormat`.
- `src/components`: encabezado, pie, tarjetas, catálogo filtrable, flecha y botón de reserva.
- `src/app`: páginas, layout compartido, metadatos y estilos responsive.
- `public/images`: fotografías locales, optimizadas al servirlas mediante `next/image`. Créditos en `CREDITOS.md`.

Las páginas son componentes de servidor por defecto. `Header` usa `usePathname` para marcar la navegación activa. `ExperienceCatalog` recibe la lista mediante props y usa dos estados (`region` y `categoria`); los resultados se calculan a partir de esos estados. `ExperienceCard` recibe `experiencia`, `editorial` y `numero`. `ReservationButton` recibe `titulo` y usa `useState` para mostrar un aviso accesible.

## Alcance de esta versión

Las experiencias, los servicios incluidos y los precios son simulados. “Reservar” solo muestra un aviso: no registra reservas, no guarda datos y no inicia pagos. No se incorporaron dependencias adicionales a Next.js, React y React DOM.

El diseño incluye puntos de adaptación para móvil, tablet y escritorio, controles con etiquetas, foco visible, un enlace para saltar al contenido y respeto por la preferencia de movimiento reducido. Los filtros tienen un estado sin resultados y una acción para restablecerlos.
