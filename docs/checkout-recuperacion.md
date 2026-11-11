# Recuperación de Checkout Pro de prueba

Las migraciones de permisos y coordinación ya están aplicadas y verificadas en el
remoto del proyecto. El checkout permanece deshabilitado por defecto hasta configurar
y habilitar las pruebas en Preview. En otros destinos deben verificarse primero
sus migraciones. Este documento no autoriza ejecutar operaciones en Production.
No hay webhook implementado ni confirmación de pagos desde las URLs de retorno.

## Identificador antes de crear una reserva

1. La página genera un candidato firmado, sin datos personales.
2. «Comenzar reserva de prueba» llama a `establecerIntentoCheckout`. Esa petición
   solo establece una cookie HttpOnly y redirige a la misma experiencia. Un doble
   clic desde esa página envía el mismo candidato; una cookie válida existente se
   conserva. No se toca Supabase ni Mercado Pago.
3. Solo cuando la siguiente petición trae esa cookie se muestra el formulario de
   checkout. `iniciarCheckout` verifica firma y coincidencia exacta entre cookie y
   token antes de invocar la RPC. Nunca genera o sustituye un UUID al crear la reserva.

Si se pierde la respuesta del paso 2, todavía no hay reserva. Si se pierde la del
paso 3, la cookie ya estaba en el navegador y una recarga conserva el UUID. Borrar
cookies, vencer el plazo de 24 horas, otro navegador o elegir expresamente una
compra distinta puede originar otro intento. No se deduplica globalmente por persona.
Los formularios viejos o de otra pestaña cuyo token no coincida con la cookie no
pueden crear una reserva mediante esta acción.

## Intento `creando` sin preferencia recuperable

`creando` significa que el backend reclamó el permiso para intentar el POST; no
demuestra que Mercado Pago lo haya recibido. Puede haberse detenido antes del
envío, durante el envío, o después de la creación sin recibir la respuesta.

- Los reintentos consultan la API por UUID. Si aparece una única preferencia y su
  detalle coincide con reserva, moneda e importe, se guarda antes de redirigir.
- Ninguna búsqueda vacía, antigüedad, timeout o 5xx permite crear otra preferencia.
- Solo un rechazo HTTP inequívoco manejado por el servidor permite liberar el
  intento. Si esa liberación falla, también se conserva cerrado para revisión.
- La interfaz muestra la referencia y avisa que puede requerir revisión del
  responsable. Consultar de nuevo puede recuperar una preferencia que aún no
  estaba visible; no se promete que esperar resuelva un proceso caído antes del POST.

### Procedimiento manual, solo por un responsable autorizado

1. Mantener el UUID original. Pedir la referencia, nunca tokens, claves, tarjetas
   o datos personales del comprador. No indicar «empezar otra reserva» como reintento.
2. Comprobar con acceso administrativo el estado de ese UUID. Una consulta de
   diagnóstico no necesita nombre ni email:

   ```sql
   SELECT r.id, r.estado, r.total, r.fecha_visita,
          r.mercado_pago_preference_id, i.estado AS fase_checkout, i.created_at
   FROM public.reservas AS r
   JOIN public.checkout_intentos AS i ON i.reserva_id = r.id
   WHERE r.id = '<UUID_DEL_INTENTO>'::uuid;
   ```

3. Identificar el entorno y vendedor correctos, y asegurarse de que no haya una
   solicitud del mismo intento todavía ejecutándose. Consultar preferencias por
   `external_reference`, revisar todas las coincidencias y verificar el detalle
   oficial. La búsqueda vacía, por sí sola, NO demuestra que el POST no se procesó.
4. Si existe una única preferencia válida, usar la recuperación normal. Si es
   necesario un guardado manual autorizado, `operar_checkout('guardar', ...)`
   permite asociarla al mismo UUID. Antes debe verificarse referencia, importe y
   moneda en la API; SQL no realiza esa verificación externa. No cambiar `estado`
   a `confirmada` ni rellenar campos de pago para destrabar un checkout.
5. Solo con evidencia positiva de rechazo definitivo o de que la petición nunca
   se envió, y sin operaciones en vuelo, puede autorizarse `liberar` para ese UUID.
   El tiempo transcurrido y la ausencia de logs no son esa evidencia. Registrar la
   razón de la intervención, la referencia y los identificadores operativos, sin
   credenciales ni datos personales. No editar directamente la tabla de intentos.
6. Si no se puede establecer qué ocurrió, mantenerlo cerrado y escalar la revisión.
   No automatizar la liberación ni borrar la reserva. Una preferencia vencida o un
   intento ambiguo con varias preferencias tampoco se reemplaza automáticamente.

## Cambio de día argentino

Nombre, email, cantidad y fecha siguen siendo obligatorios y sintácticamente
válidos. La interfaz permite enviar la fecha original para recuperar un intento.
La RPC exige hoy/futuro, en `America/Argentina/Buenos_Aires`, antes de **crear una
reserva** o **reclamar un nuevo POST**. Un intento `creando` o `lista` puede buscar
y recuperar su preferencia previa aunque la fecha original ya sea ayer. Se
verifican su importe y referencia, y que no esté vencida según la respuesta oficial.
Esto no autoriza un checkout nuevo para una fecha pasada ni cambia la fecha guardada.

## Pruebas reales de PostgreSQL

```sh
PG_BIN_DIR=/ruta/a/postgresql/bin npm run test:postgres
```

Si libpq no se detecta, agregar `PG_LIBPQ=/ruta/a/libpq.dylib` (o `.so`). El script
usa Python estándar y libpq; no necesita paquetes Python/Node adicionales.
Requiere `initdb`, `pg_ctl`, `postgres` y su biblioteca libpq disponibles. En esta
sesión se usaron binarios descargados a `/tmp`, sin modificar dependencias del
proyecto ni instalar un servicio del sistema.

La suite crea su propio cluster privado y efímero en `/tmp`, con TCP deshabilitado,
y lo detiene/elimina al finalizar. No admite URLs de bases existentes, no carga
`.env.local` y no usa Supabase o Mercado Pago. Aplica allí los archivos reales de
las migraciones relevantes y comprueba permisos, compilación, preservación del
historial, rollback DDL/DML y concurrencia con conexiones independientes.

El caso de medianoche se reproduce con filas de prueba que representan un intento
iniciado ayer. No se modifica el reloj del sistema. Estas pruebas complementan
las simulaciones de la API: no sustituyen una prueba posterior de PostgREST,
Vercel y el checkout de prueba real, que requiere autorización y configuración.
