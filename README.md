# Afuera

Primera versión de un marketplace de experiencias turísticas en Argentina.
Proyecto académico construido con Next.js App Router, React, JavaScript y JSX.

## Desarrollo

Copiar `.env.example` a `.env.local` y completar `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` desde el panel Connect/API Keys de Supabase.
Usar la clave pública publishable, nunca una clave secret o `service_role`.
Reiniciar el servidor después de cambiar las variables.

La tabla debe permitir lectura al rol `anon`. La migración
`supabase/migrations/20261015180000_allow_public_read_experiencias.sql` habilita RLS
y permite SELECT de experiencias activas. Aplicarla mediante el flujo habitual de
migraciones o ejecutar ese SQL en el SQL Editor del proyecto. No vuelve a cargar
las seis experiencias. No otorga permisos de escritura. Revisar políticas previas
si ya existen, porque las políticas permisivas de PostgreSQL se combinan.

En Vercel configurar las mismas dos variables para Production y los entornos
Preview/Development que se utilicen, y generar un nuevo despliegue.

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

## Acceso de administración

`/admin/login` permite ingresar con email y contraseña de un usuario creado en
Supabase Authentication. No hay registro público. Al ingresar redirige a `/admin`,
un listado protegido de experiencias con opción de crear nuevas. Una sesión existente también
redirige desde el login a `/admin`.

Auth usa `@supabase/ssr` con las mismas variables públicas de `.env.example`.
La Server Action guarda la sesión en cookies; `src/proxy.js` renueva los tokens
en `/admin` y sus subrutas. Las páginas verifican al usuario con `getUser()` en
el servidor. `src/lib/supabase/auth-server.js` es el cliente SSR y
`src/lib/supabase/client.js` ofrece el cliente de navegador para futuros componentes.
El cliente sin sesión del catálogo se conserva separado.

Aplicar `supabase/migrations/20261022120000_allow_authenticated_read_experiencias.sql`
mediante el flujo de migraciones o el SQL Editor de Supabase. Habilita únicamente
SELECT para el rol existente `authenticated`, incluyendo registros inactivos;
la política pública de `anon` no cambia. Sin esta política el listado puede
aparecer vacío por RLS o fallar por falta de permisos.

`/admin` consulta los datos en un Server Component después de verificar la sesión.
Muestra título, provincia, categoría, precio en ARS y estado activo. Incluye
estados de error y listado vacío. Nueva experiencia lleva a `/admin/nueva`.
Editar abre el formulario precargado. Eliminar pide confirmación antes del borrado.

### Crear una experiencia

Aplicar manualmente `supabase/migrations/20261022130000_allow_authenticated_insert_experiencias.sql`
en Supabase. Esta migración no fue aplicada al remoto durante la implementación.
Otorga INSERT al rol existente `authenticated` y exige `auth.uid()` no nulo
mediante RLS. No habilita UPDATE ni DELETE, ni cambia la lectura pública.

El formulario incluye los campos de contenido de la tabla, `id`, `activo` y
`destacada`; `created_at` conserva el valor predeterminado de la base.
La imagen se elige entre los archivos locales existentes, sin subir archivos.
`incluye` se convierte de líneas de texto a un array sin líneas vacías ni duplicados.
El identificador debe ser único, en minúsculas, con números y guiones.
El precio debe estar entre 0 y 9999999999,99 y tener hasta dos decimales.
La Server Action vuelve a verificar la sesión y valida los campos antes del INSERT.
Los errores conservan los valores ingresados. Al guardar ejecuta
`revalidatePath('/admin')` y redirige al listado. El catálogo público conserva
su código y sus consultas dinámicas: las nuevas experiencias activas aparecen
al volver a cargarlo.

Por ahora cualquier usuario autenticado puede leer, crear, editar y eliminar experiencias.
No se usan claves secret ni `service_role`.

Después de aplicar la migración, probar crear una experiencia inactiva con un ID
único, comprobar su aparición en admin y su ausencia del catálogo público.
Probar también ID duplicado, campos vacíos, precio negativo y acceso sin sesión.

### Editar una experiencia

Aplicar manualmente `supabase/migrations/20261022140000_allow_authenticated_update_experiencias.sql`.
La migración no fue aplicada al remoto durante la implementación. Otorga UPDATE
al rol existente `authenticated`; la política exige `auth.uid()` no nulo tanto
para la fila original (`USING`) como para la actualizada (`WITH CHECK`). Necesita
también la política SELECT autenticada ya existente. No habilita DELETE.

`/admin/experiencias/[id]/editar` verifica la sesión y carga la fila en el servidor,
incluidas las experiencias inactivas; un ID inexistente responde 404. Reutiliza
el formulario y la validación de CREATE, precargando `incluye` como líneas de texto.
La Server Action verifica nuevamente la sesión, valida y ejecuta UPDATE filtrado
por el ID original, comprobando que se devuelva una fila actualizada. Conserva
`created_at`. Permite cambiar el ID y muestra un error si el nuevo ya existe.
Al guardar revalida `/admin`, `/experiencias`, `/`, el detalle público anterior
y el nuevo si cambió el ID, y la página de edición original. Luego redirige a `/admin`.

Después de aplicar la migración, probar cambios de título y precio, las casillas
activa/destacada y la lista de incluidos. Verificar la precarga de una experiencia
inactiva, precio inválido, ID duplicado, ID inexistente y acceso sin sesión.
Si cambia el ID, el detalle público anterior debe responder 404 y el nuevo debe
mostrar el contenido actualizado cuando la experiencia esté activa.

### Eliminar una experiencia

Aplicar manualmente `supabase/migrations/20261022150000_allow_authenticated_delete_experiencias.sql`.
La migración no fue aplicada al remoto durante la implementación. Otorga DELETE
al rol existente `authenticated` y agrega una política `FOR DELETE` con
`USING ((select auth.uid()) IS NOT NULL)`. Se mantiene la política SELECT autenticada.

El botón Eliminar abre una confirmación nativa del navegador con el título y
la advertencia de que el borrado es permanente. Cancelar no llama al servidor.
Confirmar ejecuta una Server Action que verifica la sesión y borra por ID,
comprobando que Supabase devuelva una fila eliminada. El botón se deshabilita
mientras se procesa y los errores se muestran junto a la acción.
Al eliminar revalida `/admin`, `/experiencias`, `/`, el detalle público y la
página de edición de esa experiencia. El listado se actualiza desde el servidor.

Después de aplicar la migración, verificar con una experiencia de prueba:
cancelar conserva la fila; confirmar la elimina del panel y del catálogo;
su detalle público y edición responden 404. Probar también sesión expirada y
ausencia de permisos de DELETE. No se ejecutaron borrados remotos como prueba.

Verificación manual: abrir `/admin` sin sesión (debe ir al login), enviar
credenciales incorrectas, ingresar con el usuario existente, recargar `/admin`
y reabrir `/admin/login` (debe redirigir a `/admin`). Comprobar también campos
vacíos, navegación por teclado y formulario en pantalla móvil.

## Organización del código

- `src/data/experiencias.js`: datos originales conservados como referencia; la aplicación no los importa ni los usa como respaldo.
- `src/lib/supabase/server.js`: cliente exclusivo del servidor, con clave pública y sin sesiones de Auth.
- `src/lib/experiencias.js`: consultas a Supabase para catálogo, destacados y detalle; solo registros activos. Orden por creación e ID para obtener resultados estables.
- `src/lib/formato.js`: formato de precios con `Intl.NumberFormat`.
- `src/components`: encabezado, pie, tarjetas, catálogo filtrable, flecha y botón de reserva.
- `src/app`: páginas, layout compartido, metadatos y estilos responsive.
- `public/images`: fotografías locales, optimizadas al servirlas mediante `next/image`. Créditos en `CREDITOS.md`.

Las páginas son componentes de servidor por defecto. `Header` usa `usePathname` para marcar la navegación activa. `ExperienceCatalog` recibe la lista mediante props y usa dos estados (`region` y `categoria`); los resultados se calculan a partir de esos estados. `ExperienceCard` recibe `experiencia`, `editorial` y `numero`. `ReservationButton` recibe `titulo` y usa `useState` para mostrar un aviso accesible.

## Alcance de esta versión

El contenido y los precios siguen siendo de ejemplo, pero la única fuente de datos en ejecución es Supabase. “Reservar” solo muestra un aviso: no registra reservas, no guarda datos y no inicia pagos.

Las tres páginas de experiencias consultan en cada solicitud del servidor, sin
precargar IDs durante el build. Los cambios en Supabase no requieren reconstruir
la aplicación. Los errores llegan al límite `src/app/error.jsx`, que permite
reintentar sin exponer detalles internos. Una consulta vacía muestra un estado
sin datos; un detalle inexistente o inactivo responde 404. La metadata y el detalle
comparten su consulta durante cada render del servidor.

Para verificar la conexión, iniciar el servidor con las variables reales y probar
`/`, los filtros de `/experiencias`, un detalle existente y un ID inexistente.
También verificar el estado vacío y la recuperación ante errores en un entorno de
prueba. Un build exitoso valida la compilación, pero no verifica el acceso remoto:
las consultas se ejecutan al recibir solicitudes.

El diseño incluye puntos de adaptación para móvil, tablet y escritorio, controles con etiquetas, foco visible, un enlace para saltar al contenido y respeto por la preferencia de movimiento reducido. Los filtros tienen un estado sin resultados y una acción para restablecerlos.
