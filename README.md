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

Solo la cuenta de Supabase Auth configurada como administradora puede entrar al
panel, leer experiencias inactivas y crear, editar o eliminar experiencias.
Las páginas y todas las Server Actions administrativas verifican la identidad en
el servidor mediante `src/lib/supabase/admin-server.js`. El login rechaza otras
cuentas. Sin sesión se redirige a `/admin/login`; con sesión sin autorización,
a `/`. El proxy renueva cookies; la autorización se verifica en cada entrada.

### Configurar el mismo UUID en Next.js y PostgreSQL

1. En `.env.local`, agregar `ADMIN_USER_ID=tu-uuid-de-supabase-auth`, sin comillas
   adicionales ni prefijo `NEXT_PUBLIC_`. El archivo está ignorado por Git.
   Reiniciar Next.js después del cambio. En producción, configurar esa variable
   en el entorno del servidor del proveedor de hosting y volver a desplegar.
   Si falta o no tiene formato UUID, ningún usuario obtiene acceso al panel.
2. Revisar `supabase/migrations/20261105180000_restrict_experiencias_to_admin.sql`
   y reemplazar **solo el valor asignado a `admin_user_id`**
   (`REEMPLAZAR_CON_UUID_ADMIN`) por el mismo UUID. No reemplazar la comparación
   del marcador, que está separada en dos cadenas. PostgreSQL no lee las
   variables de entorno de Next.js. No hace falta compartir el UUID en un chat.
3. Aplicar esa nueva migración después de las anteriores, mediante el flujo
   habitual de migraciones. No se aplicó durante esta implementación. La
   transacción falla sin cambiar permisos si el marcador sigue sin completar,
   el UUID es inválido o el usuario no existe en `auth.users`.

La nueva migración reemplaza las cuatro políticas amplias de lectura y escritura
para `authenticated`; las migraciones anteriores se conservan como historial.
La lectura pública existente para `anon` no cambia. Los usuarios autenticados
comunes también pueden leer experiencias activas, pero no inactivas ni escribir.
Los permisos INSERT/UPDATE/DELETE del rol `authenticated` se filtran por UUID
mediante RLS, incluso en llamadas directas a la API de Supabase. Se revocan
privilegios innecesarios como TRUNCATE, que no está sujeto a RLS.

El UUID se guarda en una función constante `private.experiencias_admin_id()`,
sin `SECURITY DEFINER`, sin acceso a tablas y sin permiso de ejecución para
`PUBLIC` o `anon`. Mantener `private` fuera de los esquemas expuestos por la
Data API. No usa claves secret ni `service_role`. El UUID es un identificador,
no una credencial: la autorización exige un token válido de esa cuenta.

**Configurar únicamente Next.js no corrige los permisos remotos:** la protección
de la base queda activa al aplicar la migración. Si cambia el administrador,
actualizar ambas configuraciones; para PostgreSQL, crear una nueva migración que
reemplace la constante de la función, sin reeditar una migración ya aplicada.
No ejecutar de nuevo las políticas antiguas después de la corrección: las
políticas permisivas se combinan con OR y reabrirían el acceso.

### Verificar los permisos después de aplicar la migración

Usar una experiencia de prueba activa y otra inactiva, creadas por el administrador.
Para probar DELETE, usar una experiencia sin reservas relacionadas.

| Identidad | SELECT activas | SELECT inactivas | INSERT / UPDATE / DELETE | Panel |
| --- | --- | --- | --- | --- |
| Visitante sin sesión | Sí | No | No | Redirige al login |
| Usuario autenticado común | Sí | No | No | Redirige a `/` |
| Administrador configurado | Sí | Sí | Sí | Permitido |

Probar `/admin`, `/admin/nueva` y `/admin/experiencias/ID/editar` con cada identidad,
incluyendo acceso directo por URL. El login con una cuenta común debe mostrar
que no tiene permiso y cerrar esa sesión local. El administrador debe poder
crear una experiencia inactiva, editarla y eliminarla sin cambios de diseño.

También probar directamente con `@supabase/supabase-js`, la URL y clave pública
del proyecto: un cliente sin sesión para el visitante, y clientes independientes
con `auth.signInWithPassword()` para las otras dos cuentas. No usar el SQL Editor
como prueba de usuario final: su rol puede omitir RLS. Para cada cliente ejecutar
SELECT sin filtro por `activo`, INSERT con campos válidos y UPDATE/DELETE sobre
una fila de prueba conocida. Pedir `.select('id')` en UPDATE/DELETE: un rechazo
por RLS puede devolver cero filas sin error. Confirmar desde la sesión del
administrador que ningún intento no autorizado alteró las filas. Incluir UPDATE
y DELETE tanto de una experiencia activa como de una inactiva.

Verificar también que `ADMIN_USER_ID` vacío o inválido deniegue el acceso, y que
el catálogo público y la creación de reservas sigan funcionando. Una reserva
existente puede impedir DELETE por integridad referencial, independientemente
de los permisos administrativos.

Pruebas aisladas de autorización (sin credenciales ni acceso remoto):
`node --experimental-vm-modules --test tests/admin-authorization.test.mjs`.

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
