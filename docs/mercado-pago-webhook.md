# Confirmación de pagos de prueba

Checkout y webhook están verificados en Preview con cuentas de prueba. Las 30
pruebas PostgreSQL reales pasaron; el responsable confirmó que la migración del
webhook y su correctiva de timestamps se aplicaron en Supabase remoto.

## Conectar el webhook en Preview

1. Revisar `supabase/migrations/20261111120000_registrar_pago_verificado.sql`.
   Ya está aplicada en el remoto del proyecto, según confirmación del responsable;
   no volver a ejecutarla allí. En otros destinos, verificar primero su historial.
   Depende de las migraciones de reservas,
   permisos de service_role y coordinación de checkout ya existentes. Agrega
   `reservas.mercado_pago_updated_at` y la RPC `registrar_pago_verificado`.
   Sin ella el endpoint devuelve 503 al intentar persistir y MP puede reintentar.
   La correctiva `20261111150000_allow_approved_payment_timestamp_tie.sql` también
   está aplicada: no repetirla. Solo reemplaza la función para admitir una
   aprobación del mismo pago con timestamp igual; no hace backfill ni cambia RLS.
2. En Mercado Pago Developers, seleccionar la aplicación correspondiente al
   vendedor de prueba y configurar Webhooks para pagos (`payment`, Payments API
   de Checkout Pro mediante preferencias; no Orders API ni IPN). Usar como URL
   pública HTTPS `https://<preview>/api/mercado-pago/webhook`, sin protección de
   inicio de sesión de Vercel. El modo del panel debe corresponder a las
   credenciales utilizadas por ese vendedor de prueba.
3. Configurar **solo en el servidor del Preview**, sin `NEXT_PUBLIC_`:
   - `MP_WEBHOOK_SECRET`: clave de firma entregada por esa configuración de
     Webhooks en Developers. No generarla con OpenSSL ni reutilizar
     `CHECKOUT_SIGNING_SECRET`, el access token o la clave de Supabase.
   - `MP_WEBHOOK_COLLECTOR_ID`: ID numérico del vendedor de prueba dueño del
     `MP_ACCESS_TOKEN`. Se compara con el pago y con la orden consultados por API.
   - Conservar `MP_ACCESS_TOKEN`, `MP_TEST_MODE=true`,
     `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
   El código bloquea `VERCEL_ENV=production`. La recepción no depende de
   `MP_CHECKOUT_ENABLED`: apagar nuevas compras no debe impedir procesar avisos
   de compras anteriores. El modo de prueba por sí solo no demuestra que una
   credencial sea de prueba; comprobar la identidad del vendedor en el panel.
4. La preferencia ya usa `MP_NOTIFICATION_URL` o, por defecto,
   `${APP_URL}/api/mercado-pago/webhook`. Alinear esa URL con el Preview elegido
   (sin query fija `type` ni `data.id`) y redesplegar después de configurar.
   Las preferencias existentes conservan la URL con que se crearon. No publicar
   ni registrar la clave de firma. Mantener la URL accesible para los reintentos.

La publicación del código no configura variables de Vercel ni realiza pagos.

## Flujo y garantías

- `route.js` delega al módulo `server-only` `lib/mercado-pago/webhook.js`.
- Verifica HMAC-SHA256 de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
  con comparación en tiempo constante. Exige ID numérico de pago en query,
  request-id, firma y timestamp, sin valores duplicados. Admite timestamps en
  segundos o milisegundos, con tolerancia de cinco minutos en ambos sentidos.
  Requiere reloj del servidor sincronizado. El cuerpo y los parámetros del
  navegador no se usan para identificar la reserva, decidir el estado o el importe.
- Consulta `GET /v1/payments/{id}` con el access token privado. Valida ID,
  vendedor, referencia UUID, importe exacto en centavos, ARS y fecha de actualización.
  Para acreditar un aprobado también exige importe reembolsado cero; un
  reembolso parcial puede conservar el estado `approved`.
- Consulta la reserva existente y `GET /merchant_orders/{payment.order.id}`.
  Exige referencia coincidente en pago y orden, vendedor esperado, preferencia
  igual a la persistida y pago incluido en la orden. Un pago de otra preferencia
  con la misma referencia e importe no acredita la reserva.
- La RPC vuelve a comprobar reserva, intento de checkout, preferencia, moneda
  e importe bajo bloqueo. Reutiliza los campos de pago y su restricción UNIQUE.
  No modifica comprador, precio, fecha de visita, cantidad, cupos ni temporadas.
  Solo service_role puede ejecutarla; no agrega políticas ni permisos públicos
  y no concede acceso directo a la columna nueva.
- `approved` pasa una reserva pendiente a `confirmada`. `pending`, `in_process`,
  `authorized`, `rejected` y `cancelled` registran el estado del pago pero mantienen
  la reserva pendiente: un rechazo no impide pagar después con otro intento de
  la misma preferencia. Reservas confirmadas, canceladas, expiradas o reembolsadas
  no se sobrescriben. Duplicados y observaciones atrasadas del mismo pago no
  producen cambios. Entre intentos distintos, una aprobación puede reemplazar
  un rechazo, pero nunca se reemplaza una aprobación ya aplicada.
  Para el mismo pago, un `approved` con timestamp igual puede confirmar una
  reserva pendiente. Eventos con fecha estrictamente anterior siguen descartados;
  los duplicados no aprobados con fecha igual no sobrescriben el estado.
- Reembolsos, contracargos y otros estados quedan registrados como
  `estado_no_soportado` en logs, sin confirmar ni revertir reservas; requieren
  conciliación manual. No se realizan devoluciones ni otras operaciones financieras.

Se procesa sin cola, antes de devolver 200: no se reconoce un aviso como
procesado antes de persistir. Las consultas comparten un timeout de 15 segundos,
por debajo del plazo documentado de 22 segundos. Una firma inválida devuelve 401;
errores de configuración, API, base, preferencia aún no guardada o pago aún no
visible en la orden devuelven 503. Los avisos incompatibles/ajenos se descartan
con 200 y un código seguro de diagnóstico. Los logs no incluyen firmas,
credenciales, cuerpos ni datos personales. Los reintentos vuelven a consultar el
recurso actual; no repiten cobros ni crean reservas o preferencias.

## Pruebas y límites de verificación

`npm test` incluye `tests/webhook.test.mjs`: firma válida/incorrecta, timestamp,
headers ausentes, query ambigua, approved/pending/rejected y otros estados,
duplicados simultáneos, fallos parciales, referencias ajenas, preferencia distinta,
moneda/importe incompatible, vendedor incorrecto y errores sin filtraciones.
Ejecuta los módulos reales con API y Supabase simulados, sin cargar `.env.local`.
`npm run test:postgres` ejecuta los archivos SQL reales en un clúster privado
temporal, sin TCP ni conexión a Supabase. Sus 30 pruebas incluyen compilación,
RLS, permisos, duplicados, concurrencia, rollback y protección de reservas
confirmadas y `pending/rejected → approved` con timestamp igual. Las 30 pasaron en
PostgreSQL 17.11. Esta suite ejecuta
migraciones exclusivamente en su clúster temporal; no repetirla cuando la tarea
prohíba ejecutar migraciones.

## Evidencia de pruebas en Preview

Pruebas del 11/11/2026 con vendedor y comprador de prueba; no acreditan una
habilitación para cobros reales. Las comprobaciones de Supabase y la consulta
de Rapipago a la API fueron de solo lectura, sin datos personales.

| Caso | ID de pago | Mercado Pago / Supabase | Evidencia HTTP |
| --- | --- | --- | --- |
| Aprobado | `187947758963` | `approved` / reserva `confirmada`, pago y preferencia registrados | Webhook HTTP 200 comprobado por el responsable |
| Rechazado, tarjeta de prueba OTHE | `187950338865` | `rejected` / reserva `pendiente`, ID y estado de pago registrados | No comprobada por separado |
| Rapipago sin abonar | `189024269348` | API: `pending`, `pending_waiting_payment`; Supabase: `pending`, reserva `pendiente`, un solo registro del intento | No comprobada por separado |
| Simulación duplicada del aprobado | `187947758963` | Mismos ID, preferencia, estados, timestamp, importe, cantidad y fecha; una sola reserva del intento/pago/preferencia | **Recepción HTTP no comprobada** |

El Rapipago mostró una actualización de API un segundo posterior a la registrada
en Supabase, con estado y referencia coincidentes. Los campos de pago persistidos
son evidencia consistente con procesamiento del webhook, no un registro de su
respuesta HTTP. La simulación duplicada demuestra ausencia de cambios observados;
sin evidencia de recepción no demuestra por sí sola que recorrió toda la RPC.
La idempotencia y concurrencia también están cubiertas en PostgreSQL real.

El check de GitHub Actions ejecutará `npm ci`, `npm test` y `npm run build` en
Pull Requests, sin secretos, SQL ni despliegues. Queda por comprobar su primera
ejecución en GitHub una vez publicado el archivo del workflow.

Referencias oficiales:

- [Firma y recepción de notificaciones](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro-preferences/additional-settings/optional-notifications).
- [SDK oficial: firmas, tolerancia y eventos fuera de orden](https://github.com/mercadopago/sdk-nodejs/blob/master/docs/webhooks.md).
- [Notificaciones de pagos de Checkout Pro](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro-preferences/payment-notifications).
- [Obtener orden comercial](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-preferences/merchant-orders/get-merchant-order/get).
