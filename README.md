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

## Galería y relato editorial

El detalle usa `ExperienceGallery` y `ExperienceStory`, compartidos por todas las
experiencias. La portada sigue en `imagen`/`alt`; la introducción editorial se
muestra cuando existe, con la descripción como respaldo. Incluidos y
recomendaciones conservan su contenido actual.

La migración `supabase/migrations/20261105200000_add_experiencias_editorial.sql`
agrega dos columnas opcionales a `experiencias`, sin actualizar filas ni cambiar
RLS, permisos, reservas o precios:

- `galeria`: JSONB nullable, arreglo ordenado de hasta cinco objetos
  `{ "src": "/images/archivo.jpg", "alt": "Descripción", "pie": "Crédito o pie opcional" }`.
  Son fotografías adicionales a la portada; no se exige un mínimo ni se repiten
  imágenes para completar una galería. Con fotos disponibles, el objetivo es
  publicar entre cuatro y seis en total.
- `contenido_editorial`: JSONB nullable con `titulo`, `introduccion` y
  `secciones: [{titulo, parrafos: ["Texto"]}]`. El título se muestra como h2 y
  cada subtítulo como h3. Se mantiene el formato anterior `{titulo, parrafos}`.
  Todo se muestra como texto plano, sin HTML ni un editor enriquecido.

**Este procedimiento no aplica migraciones.** Antes de guardar desde el nuevo
administrador, debe confirmarse que las dos columnas existan en el entorno destino.
Si faltan las columnas, el formulario informa la causa y conserva lo ingresado.
Las lecturas del detalle y de edición toleran también un esquema anterior: leen
la fila y usan los campos opcionales solo cuando están presentes. El listado y
la API mantienen su selección y contrato originales. Después de migrar, las
experiencias sin contenido nuevo siguen mostrando su portada y descripción;
con una sola fotografía no aparecen miniaturas ni navegación.

### Edición y fotografías locales

En el administrador, la galería se escribe con una foto por línea:
`ruta | texto alternativo | pie opcional`. El orden de las líneas es el orden de
las fotos adicionales. El título y el relato tienen campos separados; los
párrafos del relato se separan con una línea en blanco. Vaciar los campos elimina
únicamente los datos opcionales correspondientes.

Los archivos deben agregarse previamente a `public` y estar incluidos en el
despliegue. Se admiten JPG/JPEG, PNG, WebP y AVIF, con rutas absolutas del sitio
como `/images/nombre.jpg`. No hay subida de archivos ni se admiten URLs externas,
SVG, parámetros de URL, rutas relativas o recorridos con `..`. El servidor
comprueba existencia, tipo de archivo y que la ruta real (incluidos enlaces
simbólicos) siga dentro de `public`. Una nueva foto requiere desplegar el archivo;
cambiar el texto o el orden en Supabase no requiere reconstruir la aplicación.
Seleccionar imágenes pertinentes y con derechos de uso; registrar sus créditos.

El servidor rechaza portadas repetidas, rutas duplicadas, fotos sin texto
alternativo, más de cinco adicionales o más de 5000 caracteres en el campo.
Cada ruta y texto alternativo admite hasta 250 caracteres, y el pie hasta 300.
El título admite 120 caracteres; el relato hasta ocho párrafos de 2000 caracteres
cada uno, con un máximo total de 8000. La validación se repite dentro de las
Server Actions, después de la autorización existente y antes de escribir.

La galería permite navegación con botones y miniaturas, también mediante teclado
(Tab y Enter/Espacio), con un contador anunciado por lectores de pantalla. En
celular las miniaturas se desplazan horizontalmente. No hay reproducción
automática ni animaciones. Solo se prioriza la portada; las miniaturas usan
`next/image` con tamaños pequeños y las imágenes grandes adicionales se cargan
al seleccionarlas. El relato y el formulario de reserva siguen siendo componentes
independientes.

### Verificación

- Ejecutar `node --experimental-vm-modules --test tests/*.test.mjs`, `npm run build`
  y `git diff --check`.
- Verificar una experiencia sin los nuevos datos: portada, descripción,
  incluidos, recomendaciones y reserva deben conservarse.
- Después de aplicar la migración en un entorno de prueba, editar una experiencia
  con fotografías locales pertinentes y un relato aprobado; guardar, reabrir el
  formulario y comprobar el orden, pies y párrafos. Vaciar los opcionales y guardar
  para verificar el regreso a la presentación original.
- Recorrer miniaturas y controles con teclado, probar celular y confirmar que la
  API, el catálogo y el flujo de reservas siguen funcionando.

Las fechas y temporadas se gestionan por separado del relato editorial, como se
describe a continuación. No hay cupos ni controles de disponibilidad.

## Fecha de visita y orientación estacional

La fase 1 fue aplicada en Supabase remoto y se confirmó manualmente que el
formulario anterior sigue recibiendo reservas en Production. La fase 2 continúa
pendiente. No ejecutar ambas juntas al desplegar en otro entorno: eso bloquearía
el formulario anterior.

### Fase 1: expansión, antes de publicar el código nuevo

Aplicar únicamente
`supabase/migrations/20261108120000_add_reservas_fecha_visita.sql`, después de las
migraciones previas de reservas, en los entornos donde aún falte. En el remoto
actual ya está aplicada: no repetirla. Si otro entorno aplicó una versión distinta
del mismo archivo, detenerse y preparar una migración de corrección para ese
entorno; no alterar su historial de migraciones.

- Agrega `reservas.fecha_visita DATE`, nullable, sin default ni backfill. Las
  reservas anteriores y las solicitudes antiguas de transición conservan `NULL`.
  Presentarlas como «Sin fecha registrada» si se agrega un listado.
- Agrega únicamente `INSERT (fecha_visita)` para `anon`, sin conceder lectura,
  actualización, borrado ni escritura de datos de pago.
- Conserva la política que verifica comprador, experiencia activa, importe y
  estado pendiente. La política nueva es INSERT **restrictiva**: acepta `NULL` y,
  cuando hay fecha, exige hoy o posterior en `America/Argentina/Buenos_Aires`,
  hasta `9999-12-31`. PostgreSQL rechaza días inexistentes y las comparaciones
  rechazan infinitos. No usa un CHECK relativo a hoy sobre filas históricas.
- No consulta temporada ni cambia precios, estados, permisos administrativos,
  pagos o cupos. La Server Action usa `anon`, sin sesión, incluso si el navegador
  tiene una sesión de administrador.

Ambas fases usan `BEGIN/COMMIT` y `SET LOCAL lock_timeout = '5s'`: si no consiguen
el bloqueo necesario, fallan sin cambios parciales y deben reintentarse tras
revisar las transacciones activas. El DDL puede bloquear brevemente operaciones;
no elimina datos ni provoca el rechazo permanente del formulario anterior.

Antes del despliegue, comprobar con la versión vieja todavía publicada que una
reserva sin campo de fecha sigue creándose con `NULL`, total correcto y estado
pendiente. Comprobar también los permisos y casos de la tabla inferior en un
entorno de prueba autorizado.

### Publicar y probar la versión de transición

Publicar esta versión **después de la fase 1**. Sin la columna, el formulario nuevo
no podrá guardar reservas. La Server Action habilita temporalmente
`permitirFechaAusente: true`: solo acepta ausencia del campo `fecha_visita`, como
lo enviaba el formulario anterior, y guarda `NULL`. No acepta el campo vacío,
con espacios, como archivo, con fecha pasada o inexistente. Nunca inventa una
fecha. Esta tolerancia es de compatibilidad, no una forma de identificar con
seguridad al cliente: durante la transición una llamada directa también puede
omitir el campo. La base cierra esa excepción en fase 2.

El formulario nuevo mantiene `required`, validación nativa y comprobación antes
del envío; no permite enviar sin fecha aunque el servidor esté en transición.
Probar con la versión publicada: fecha válida dentro/fuera de temporada, cambio
inmediato de consejo, fuentes, teclado, móvil, total e importe persistidos, ausencia
de cobros y conservación de campos si falla el guardado. Probar también una
solicitud del formulario anterior contra el servidor nuevo y verificar `NULL`.

### Fase 2: exigir fecha, solo después de verificar el despliegue

El archivo preparado es
`supabase/deferred/20261108130000_require_reservas_fecha_visita.sql`. Está fuera de
`supabase/migrations` para que una ejecución rutinaria no active la exigencia por
accidente. No ejecutarlo ni moverlo durante el despliegue de expansión.

Aplicarlo solo cuando:

1. La nueva versión está publicada y pasó las comprobaciones anteriores.
2. No quedan instancias antiguas sirviendo el formulario; se gestionó la recarga
   de pestañas antiguas y se verificó en el tráfico del servidor que no siguen
   llegando solicitudes de reserva sin fecha durante el período de transición
   acordado. Si no se puede comprobar esto, mantener fase 1; no hay un plazo fijo
   que garantice por sí solo que desaparecieron las pestañas antiguas.
3. Se verificó en un entorno de prueba que ambas políticas restrictivas se
   combinan con la política permisiva existente y que no hay políticas o grants
   adicionales inesperados en el destino.

Entonces mover el archivo de `supabase/deferred` a `supabase/migrations`, conservando
su nombre, actualizar la prueba de ubicación de migraciones para esa etapa y
aplicar esa segunda migración mediante el flujo habitual autorizado. Revisar la
lista de pendientes antes de ejecutar el flujo: no incluir cambios ajenos.

La segunda fase agrega otra política INSERT restrictiva: `fecha_visita IS NOT NULL`.
Conserva la validación de fase 1, las reservas anteriores con `NULL` y la posibilidad
de actualizar estados/pagos mediante un servidor autorizado aunque la visita ya
haya pasado. No agrega un `NOT NULL` a la columna ni permisos de UPDATE públicos.

Después de aplicar fase 2, verificar la tabla de casos y publicar la retirada de
`{ permitirFechaAusente: true }` de `crearReserva`, llamando a `validarReserva(formData)`
para recuperar el error explícito de fecha requerida en servidor. Retirar también
la opción de compatibilidad del validador y adaptar sus pruebas. Mientras esa
limpieza no se despliegue, la base ya rechaza toda nueva reserva pública sin fecha;
la Server Action conserva lo ingresado y muestra un error de guardado.

Una pestaña antigua que siga enviando sin fecha después de fase 2 será rechazada.
La transición evita el corte al desplegar, pero no puede aceptar indefinidamente
solicitudes sin fecha y exigirla simultáneamente en todos los INSERT públicos.
No volver a desplegar el formulario antiguo tras activar fase 2.

`src/lib/fechas.js` valida días reales (incluidos años bisiestos) y calcula el día
argentino de forma explícita, sin interpretar la visita como un instante UTC.
El cliente usa el día enviado por el servidor para hidratar sin diferencias, lo
actualiza cada 30 segundos y al recuperar foco, y lo vuelve a comprobar al enviar.
El servidor repite la validación; RLS usa su propio reloj al insertar. Si la página
queda abierta al cambiar de día, una fecha vencida debe corregirse antes de guardar.

`src/data/temporadas.js` es la configuración editorial única, por ID. La función
`src/lib/temporadas.js` calcula el consejo de inmediato en el cliente, sin red.
El aviso usa `role="status"`, `aria-live="polite"` y texto explícito, con enlaces
oficiales. Fuera de temporada siempre se permite reservar una fecha válida.
Una experiencia nueva sin regla muestra «Sin recomendación estacional», sin
inventar un consejo ni impedir la reserva.

| Experiencia | Meses sugeridos por Afuera | Fuente oficial de contexto |
| --- | --- | --- |
| Fitz Roy | Octubre–marzo | [Visit Argentina](https://www.argentina.travel/actividades/el-chalten) |
| Viñedos de Mendoza | Marzo–abril y septiembre–noviembre | [Visit Argentina](https://www.argentina.travel/destinos/mendoza), [Turismo Argentina: vendimia](https://www.argentina.gob.ar/jefatura/turismo/viaja-por-argentina/celebrar-la-vendimia-en-mendoza) |
| Purmamarca | Abril–noviembre | [La Ruta Natural](https://larutanatural.gob.ar/es/rutas/10/valles-quebradas-y-yungas) |
| Quebrada de las Conchas | Abril–noviembre | [La Ruta Natural](https://larutanatural.gob.ar/es/rutas/10/valles-quebradas-y-yungas) |
| Buenos Aires a pie | Todo el año; consejos por estación | [Turismo de Buenos Aires](https://turismo.buenosaires.gob.ar/es/article/clima?page=1) |
| Puerto Pirámides | Junio–diciembre | [Municipalidad de Puerto Pirámides](https://www.puertopiramides.gov.ar/avistaje/) |

Los intervalos mensuales son decisiones editoriales de Afuera basadas en el
contexto de las fuentes; no se presentan como fechas exactas de operación.
La Ruta Natural destaca junio–septiembre como época más agradable en las quebradas;
Afuera adopta abril–noviembre para orientar fuera del verano lluvioso. Buenos Aires
usa estaciones meteorológicas por mes (dic–feb, mar–may, jun–ago, sep–nov).
La vendimia no implica entradas a eventos ni actividades de cosecha incluidas.
Fuera de junio–diciembre se advierte expresamente que **no se espera avistaje de
ballenas y no se garantiza la operación de la excursión**. Incluso en temporada,
los avistajes embarcados suelen empezar a mediados de junio y varían según el año.
Ningún consejo garantiza clima, fauna ni servicios.

### Compatibilidad con pagos futuros

La fecha no cambia el cálculo en centavos, `total`, `estado = 'pendiente'` ni los
campos existentes de Mercado Pago. La integración futura deberá asociar el pago
al UUID de la reserva; elegir una fecha no inicia cobros ni confirma un servicio.
No se guardan consejos derivados ni se bloquean fechas por temporada.

### Checkout Pro de prueba (conexión preparada, habilitación pendiente)

`src/lib/mercado-pago/server.js` exporta `crearPreferenciaParaReserva(reservaId)`.
Es un helper `server-only`, no una Server Action ni una API pública. Recibe solo
el UUID y consulta Supabase mediante un cliente privado separado. La Server Action
`checkout-actions.js` autoriza ese UUID mediante un intento firmado por el servidor;
conocer un UUID no habilita su checkout ni la lectura de datos personales.

El importe proviene de `reservas.total`, calculado y validado al crear la reserva:
es el precio contratado persistido, no un precio enviado por el navegador ni el
precio actual del catálogo. El módulo convierte ese decimal a centavos y crea un
ítem en ARS por el total, con `external_reference = reservas.id`. Solo permite
reservas pendientes, con importe positivo, fecha vigente y experiencia activa;
una fecha fuera de temporada sigue siendo válida. No modifica reservas históricas
sin fecha: únicamente impide iniciar su checkout. Rechaza reservas que ya tengan
una preferencia asociada para evitar crear otra de forma inadvertida.

La petición usa `fetch` nativo hacia
`https://api.mercadopago.com/checkout/preferences`, sin nuevas dependencias, sin
caché, sin seguir redirecciones y con un timeout de 10 segundos. No se envían
nombre ni email del turista. No se registran ni propagan cuerpos de errores del
proveedor, credenciales o respuestas completas. No hay reintentos automáticos:
ante una desconexión o respuesta incierta, la preferencia puede haberse creado.
Antes de reintentar habrá que reconciliar por UUID con Mercado Pago.

Configurar únicamente en desarrollo/Preview:

- `MP_ACCESS_TOKEN`: credencial de prueba del vendedor indicado por Mercado Pago.
  No imprimirla, versionarla ni usar el prefijo `NEXT_PUBLIC_`. El prefijo del
  token no identifica de forma fiable su entorno: los vendedores de prueba
  también pueden tener tokens `APP_USR`. Confirmar su procedencia en el panel.
- `MP_TEST_MODE=true`: habilitación explícita. Es una protección de configuración,
  no una verificación del tipo de credencial ante Mercado Pago. El módulo también
  bloquea `VERCEL_ENV=production`.
- `APP_URL`: origen HTTPS del Preview, sin ruta, query ni credenciales. Produce
  las tres `back_urls` hacia `/pago/resultado?resultado=success|pending|failure`.
- `MP_NOTIFICATION_URL` (opcional): URL HTTPS del webhook. Por defecto usa
  `${APP_URL}/api/mercado-pago/webhook`.
- `SUPABASE_SERVICE_ROLE_KEY`: clave privada exclusiva del backend, junto con
  `NEXT_PUBLIC_SUPABASE_URL`, para consultar reservas. No usa sesiones de Auth.
  La clave omite RLS pero no reemplaza los permisos SQL: verificar `SELECT` para
  `service_role` en `reservas` y `experiencias` antes de probar con el remoto.
  La migración `20261110130000_grant_service_role_checkout_columns.sql` concede
  los permisos mínimos por columna: lectura operativa de reservas y de
  `experiencias(id, titulo, activo)`, y UPDATE solo de estado y los tres campos de
  Mercado Pago. No concede INSERT, acceso a nombre/email ni cambios de importe,
  cantidad o fecha. Fue aplicada y sus permisos se verificaron en el remoto; no cambia políticas
  RLS ni permisos públicos. Su alcance cubre este helper y las futuras lecturas
  y actualizaciones de la reserva desde el webhook; no implementa autenticación,
  idempotencia ni permisos para futuras tablas o funciones de pagos.
- `CHECKOUT_SIGNING_SECRET`: secreto aleatorio independiente de al menos 32 bytes,
  solo del servidor, estable entre despliegues para reanudar el intento. No usar
  claves de Supabase o Mercado Pago como secreto de firma.
- `MP_CHECKOUT_ENABLED=false`: mantener deshabilitado hasta aplicar y verificar
  la nueva migración de coordinación. Luego usar `true` solo en desarrollo/Preview.

Devuelve solo `{ id, init_point, external_reference }`. La URL `init_point` de
Mercado Pago se conserva para el circuito del vendedor de prueba. No determina
el entorno únicamente por la URL del checkout.

Con la habilitación apagada se conserva `crearReserva`, incluido el tratamiento
de formularios antiguos sin fecha. Con checkout habilitado, el mismo formulario
usa `iniciarCheckout` y `validarReserva` sin la excepción de fecha ausente.
Antes de mostrar el formulario, «Comenzar reserva de prueba» establece una cookie
en una petición independiente que no crea reservas ni preferencias. El servidor
exige recibir esa cookie en la siguiente petición antes de crear la reserva.
El candidato firmado de la página es el mismo en un doble clic; no se genera
otro UUID al enviar o reintentar la reserva. El intento tiene UUID, experiencia y
vencimiento de 24 horas, sin datos personales. La cookie HttpOnly, SameSite=Lax y
Secure en despliegues HTTPS permite reusar el intento después de una recarga,
incluso si se pierde la respuesta de la creación. No se guardan campos personales en
cookies o localStorage. La firma es una autorización portadora: no debe publicarse
ni registrarse. Al reanudar se deben ingresar los mismos datos; empezar otra
reserva es una acción explícita y conserva la anterior. Una sesión nueva o vencida
puede iniciar otra compra: no hay deduplicación global de personas.

La migración **aplicada y verificada en el remoto del proyecto**
`20261110140000_prepare_checkout_idempotent.sql` crea `checkout_intentos` y la RPC
`operar_checkout`, ejecutable solo por `service_role`. Su función SECURITY DEFINER
tiene search_path vacío, valida los campos y calcula el importe con el precio de
Supabase bajo bloqueo. En una transacción, crea reserva e intento y reclama el
único POST a Mercado Pago usando un bloqueo transaccional por UUID. No concede
INSERT directo a los roles de aplicación ni modifica las políticas existentes.
Las migraciones de permisos y coordinación fueron aplicadas por el responsable y
verificadas mediante consultas de solo lectura. El checkout permanece deshabilitado
por defecto hasta configurar y habilitar explícitamente las pruebas en Preview.
Si falta configuración obligatoria o la firma es insuficiente, no se habilita.

El coordinador `lib/mercado-pago/checkout.js` guarda la preferencia mediante la RPC
antes de devolver la redirección. Los envíos simultáneos usan el mismo UUID y solo
uno puede crear la preferencia. Los reintentos recuperan la preferencia guardada
por ID o buscan por `external_reference` y verifican su detalle, moneda e importe.
Solo un rechazo HTTP inequívoco libera el permiso de creación. Tras timeout,
desconexión o 5xx, la ausencia de resultados de búsqueda **no** autoriza otro POST:
puede haber una petición todavía en curso o una búsqueda aún desactualizada.
El caso de proceso interrumpido antes de enviar el POST queda conservadoramente
bloqueado hasta revisión operativa; no hay liberación automática por tiempo.
No se intenta prometer una transacción distribuida entre Supabase y Mercado Pago.
La interfaz muestra la referencia y requiere revisión cuando no puede determinarse
el resultado. El [procedimiento de recuperación](docs/checkout-recuperacion.md)
indica qué comprobar y cuándo NO liberar un intento.

Después de medianoche se permite recuperar una preferencia previa con la fecha
original. La RPC sigue rechazando fechas pasadas antes de crear una reserva o
reclamar un POST nuevo; el helper de recuperación verifica que la preferencia
no esté vencida. No se cambian fechas guardadas ni recomendaciones por temporada.

La ruta `/pago/resultado` es informativa: ignora parámetros de pago y no consulta
ni modifica reservas. No implementa el webhook ni confirma pagos. El parámetro
`resultado=success` nunca se interpreta como prueba de aprobación. Las preferencias
incluyen la URL futura del webhook, que todavía devolverá 404; no habilitar cobros
reales. La demo integral queda pendiente de webhook y validación autorizada.

`tests/mercado-pago.test.mjs` ejecuta el módulo real con Supabase y la API simulados:
importe persistido, UUID, URLs, fechas, modo de prueba, errores HTTP/red/JSON y
ausencia de escrituras o filtraciones de credenciales. No carga `.env.local` ni
realiza peticiones reales a Mercado Pago. `tests/checkout-flow.test.mjs` cubre
firmas, autorización, fecha estricta, concurrencia simulada, fallos parciales,
recuperación y retorno sin confirmación. Estas pruebas no ejecutan SQL.
`PG_BIN_DIR=/ruta/postgresql/bin npm run test:postgres` ejecuta además las migraciones
relevantes y pruebas reales en un cluster privado temporal creado por la suite,
sin TCP ni conexión a bases existentes. Comprueba compilación, roles, transacciones,
rollback, concurrencia y recuperación con fecha pasada. No reemplaza la prueba
posterior de PostgREST/Vercel. Ejecutar también `npm test` y `npm run build`.

Referencias: [Preferences API](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-preferences/overview)
y [cuentas de prueba de Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/test-accounts).

### Verificación de fechas

`npm test` ejecuta las pruebas aisladas sin credenciales ni red; incluye límites
mensuales de las seis experiencias, años bisiestos, cambio de día argentino,
validación, render accesible y creación de reservas con Supabase simulado.
Ejecutar también `npm run build` y `git diff --check`.

Las pruebas incluyen contratos estáticos de ambos archivos SQL y simulación de las
dos fases en la Server Action. **No ejecutan PostgreSQL ni prueban RLS real**;
las comprobaciones siguientes quedan pendientes para un entorno autorizado.
El agente no ejecutó migraciones ni escribió reservas remotas. La aplicación de
fase 1 y la prueba manual del formulario anterior en Production fueron confirmadas
por el responsable del proyecto; los demás casos siguen pendientes de verificar
en el entorno destino.

| Prueba con rol `anon` | Tras expansión | Tras exigencia |
| --- | --- | --- |
| INSERT sin fecha o con NULL | Aceptar con NULL | Rechazar |
| INSERT con hoy/futuro, dentro o fuera de temporada | Aceptar día exacto | Aceptar día exacto |
| INSERT con fecha pasada, imposible, infinita o fuera de rango | Rechazar | Rechazar |
| INSERT con precio manipulado, estado confirmado o datos de pago | Rechazar | Rechazar |
| INSERT sobre experiencia inactiva | Rechazar | Rechazar |
| SELECT, UPDATE o DELETE de reservas por visitante | Denegar | Denegar |

En ambas fases, confirmar desde una sesión autorizada que el historial y las
reservas de transición conservan `NULL`, importes, estados y campos de pago sin
cambios; verificar que el panel sigue reservado al administrador. Al probar INSERT
públicos no solicitar retorno de filas con `.select()`: no hay permiso SELECT.
La segunda fase no vuelve a comprobar fechas históricas para UPDATE de pagos;
la integración de webhooks debe usar acceso exclusivo del servidor autorizado.

## Organización del código

### Fotografías verificadas y créditos públicos

`/creditos`, enlazado desde el pie del sitio, permite previsualizar las seis
portadas y las 15 fotografías adicionales verificadas de Wikimedia Commons.
Funciona sin consultar Supabase. Las imágenes de contexto no identifican
operadores, visitas, encuentros ni establecimientos incluidos en una reserva.

Los archivos nuevos están en `public/images/experiencias`, agrupados por destino,
en WebP y con un máximo de 1600 px en el lado mayor, sin ampliar las fuentes de
menor resolución. Se usó `sharp`, ya disponible con Next.js, sin agregar
dependencias. Las seis portadas JPG originales se conservaron sin cambios.
Cada archivo nuevo conserva en XMP autoría, fuente, licencia y modificaciones.
`CREDITOS.md` documenta también la selección, exclusiones y posiciones pendientes.

`src/data/fotografias.json` es el inventario de fuentes, licencias, dimensiones,
textos alternativos y notas. `src/data/galerias.js` exporta `galeriasPreparadas`:
cada entrada tiene `experienciaId`, `galeria` (objetos `src`, `alt`, `pie`) y
`textoFormulario`, listo para revisar y pegar en el campo de galería del
administrador. No se importa en el catálogo ni se carga automáticamente en la
base: la asociación queda preparada localmente, sin reemplazar datos existentes.
Los seis relatos aprobados están en `src/data/contenido-editorial-aprobado.json`.
El procedimiento único de validación y carga está documentado en
[docs/carga-editorial.md](docs/carga-editorial.md). Su modo predeterminado es local
y no escribe en Supabase; la carga remota queda pendiente de autorización.

Para revisar: ejecutar `npm run dev` y abrir `http://localhost:3000/creditos`.
La navegación por miniaturas permite comparar las fotografías; los enlaces
«Ver fotografía completa» muestran cada WebP sin el recorte de las miniaturas.
No guardar desde el administrador hasta revisar la selección y confirmar que la
migración editorial se haya aplicado por separado.

- `src/data/experiencias.js`: datos originales conservados como referencia; el catálogo no los usa como respaldo; el procedimiento de carga los usa para detectar cambios respecto de los datos aprobados.
- `src/lib/supabase/server.js`: cliente exclusivo del servidor, con clave pública y sin sesiones de Auth.
- `src/lib/experiencias.js`: consultas a Supabase para catálogo, destacados y detalle; solo registros activos. Orden por creación e ID para obtener resultados estables.
- `src/lib/formato.js`: formato de precios con `Intl.NumberFormat`.
- `src/components`: encabezado, pie, tarjetas, catálogo filtrable, flecha y botón de reserva.
- `src/app`: páginas, layout compartido, metadatos y estilos responsive.
- `public/images`: fotografías locales, optimizadas al servirlas mediante `next/image`. Créditos en `CREDITOS.md`.

Las páginas son componentes de servidor por defecto. `Header` usa `usePathname` para marcar la navegación activa. `ExperienceCatalog` recibe la lista mediante props y usa dos estados (`region` y `categoria`); los resultados se calculan a partir de esos estados. `ExperienceCard` recibe `experiencia`, `editorial` y `numero`. `ReservationForm` usa una Server Action para guardar la reserva y muestra orientación estacional accesible al elegir la fecha. `ReservationButton` es un componente antiguo sin uso en las páginas actuales.

## Alcance de esta versión

El contenido y los precios siguen siendo de ejemplo, pero la única fuente del catálogo en ejecución es Supabase. El formulario registra reservas pendientes con fecha de visita, nombre, email, cantidad y total verificado. El checkout de prueba está preparado detrás de una habilitación explícita y una migración pendiente. No confirma pagos ni la operación de una excursión.

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
