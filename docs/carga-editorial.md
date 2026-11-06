# Carga editorial de las seis experiencias

El único punto de entrada es `scripts/cargar-contenido-editorial.mjs`.
Sin argumentos o con `--dry-run` solo valida archivos locales: no conecta a
Supabase. No se ejecutó ninguna escritura remota al preparar este procedimiento.

## Datos y presentación

Los relatos aprobados están en `src/data/contenido-editorial-aprobado.json`:

```json
{
  "titulo": "Título editorial",
  "introduccion": "Introducción aprobada",
  "secciones": [
    { "titulo": "Primer subtítulo", "parrafos": ["Primer texto"] },
    { "titulo": "Segundo subtítulo", "parrafos": ["Segundo texto"] }
  ]
}
```

`ExperienceStory` muestra título en h2, subtítulos en h3 y cada párrafo en p.
La introducción editorial sustituye visualmente la descripción en el detalle;
no cambia `descripcion` en la base ni el catálogo. El formato anterior
`{titulo, parrafos}` sigue siendo compatible. El administrador permite editar la
introducción y las dos secciones por separado y conserva los párrafos antiguos.
La columna JSONB admite este objeto sin otra migración: su CHECK exige un objeto,
no una lista fija de claves. Antes de cargar deben existir ambas columnas de la
migración editorial; el script comprueba su presencia, sin aplicarla.

Las recomendaciones no se copian dentro del relato. Se conserva íntegramente
`recomendacion`, que el detalle ya muestra en «Antes de salir».
`src/data/galerias.js` asocia los IDs a las rutas, textos alternativos y pies
del inventario verificado. No cambia las portadas ni completa imágenes faltantes.
Totales con portada: Fitz Roy 4, Mendoza 3, Purmamarca 4, Cafayate 4,
Buenos Aires 4 y Puerto Pirámides 2. Los créditos públicos siguen en `/creditos`.

## Comprobación local (ejecutada)

Desde la raíz del proyecto:

```sh
node scripts/cargar-contenido-editorial.mjs --dry-run
node --experimental-vm-modules --test tests/*.test.mjs
npm run build
git diff --check
```

El plan valida las seis asociaciones, los límites del formulario y la existencia
de las fotos dentro de `public`. Las pruebas simulan la autorización, carga,
repetición, conflictos y renderizado; no prueban permisos del proyecto remoto.

## Comprobación remota futura, sin escribir

Se necesitan `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
y `ADMIN_USER_ID` en `.env.local`, además de un **access token de Supabase Auth
de una sesión vigente de tu administrador**, en la variable temporal
`AFUERA_ADMIN_ACCESS_TOKEN`. No es una clave de administración de Supabase.
Obtenelo localmente de la sesión iniciada del administrador en tu navegador;
el cliente de Supabase Auth puede leerlo mediante `auth.getSession()` donde ya
dispongas de ese cliente. No lo compartas en el chat, no lo pases como argumento,
no lo registres en Git ni lo confundas con el refresh token.

En zsh se puede ingresarlo oculto, sin guardarlo en el historial:

```sh
read -rs 'AFUERA_ADMIN_ACCESS_TOKEN?Access token del administrador: '
export AFUERA_ADMIN_ACCESS_TOKEN
node --env-file=.env.local scripts/cargar-contenido-editorial.mjs --check-remote
unset AFUERA_ADMIN_ACCESS_TOKEN
```

El script usa la clave pública con ese JWT, sin `service_role`, sin login nuevo
ni renovación automática. `auth.getUser(token)` verifica la sesión y compara el
usuario con `ADMIN_USER_ID`. Las consultas y UPDATE pasan igualmente por RLS:
la variable local no otorga permisos en PostgreSQL. Si el UUID configurado en
RLS es distinto, la carga no puede eludir esa política.

Antes de escribir se leen los seis registros y se comprueban sus IDs, columnas,
descripción, incluidos, duración, recomendación y portada contra las referencias
que acompañaron la aprobación. Si falta un registro o hay diferencias, se
detiene todo antes del primer UPDATE. Solo acepta los campos nuevos vacíos o
exactamente iguales al contenido aprobado. Una edición manual diferente exige
revisión; nunca se reemplaza silenciosamente. Los precios no forman parte del
payload y se comprueba que permanezcan iguales a la lectura inmediatamente previa.

## Carga futura, cuando se autorice

Primero publicar los componentes compatibles y las fotos locales: guardar las
rutas antes de que esos archivos estén disponibles produciría imágenes rotas.
Tras revisar `--check-remote`, con el mismo token temporal vigente:

```sh
node --env-file=.env.local scripts/cargar-contenido-editorial.mjs --apply
unset AFUERA_ADMIN_ACCESS_TOKEN
```

Este comando **sí escribe** y no se ejecutó en esta etapa. Primero repite todas
las comprobaciones y crea un respaldo de los seis registros en un directorio
temporal privado del sistema, con archivo de permisos 0600; informa su ubicación
y nunca incluye el token. Conservá ese respaldo fuera del repositorio si lo
necesitás después de la limpieza de temporales.

Después hace un UPDATE por ID que contiene exclusivamente `galeria` y
`contenido_editorial`. Incluye condiciones sobre los valores leídos para detectar
ediciones concurrentes y verifica la fila devuelta: todos los demás campos deben
seguir iguales. No toca reservas, precios, permisos ni autenticación.

Las seis peticiones **no forman una transacción conjunta**. Si expira la sesión,
falla RLS o cambia una fila durante la carga, se detiene; las filas ya confirmadas
permanecen guardadas. No hay reversión automática que pueda pisar trabajo nuevo.
Volver a ejecutar `--check-remote` distingue las pendientes de las ya cargadas;
repetir `--apply` omite las que ya coinciden. Para revertir contenido se debe
revisar el respaldo y el estado actual antes de autorizar una restauración.

Al terminar, abrir los seis detalles y comprobar introducción, dos subtítulos,
galería, créditos y la recomendación única; verificar que el formulario de
reserva y los incluidos comerciales sigan presentes. La simulación local no
reemplaza esta comprobación tras la carga efectiva.
