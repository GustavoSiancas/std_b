# Mensajes pendientes e historial

`components/pending-messages.tsx` es la bandeja «Pendientes», el primer elemento del sidebar. El sidebar muestra la cantidad sin leer y la consulta cada minuto mientras la bandeja está cerrada.

## Flujo

1. Lista: `GET /api/v1/message-recipients?page&page_size`. Solo trae registros con `status: "UNREAD"`, dirigidos al usuario (`recipient_id`) o a una de sus áreas (`department_id`), en `TO` o `CC`.
2. Al abrir uno: `GET /api/v1/messages/{message_id}` (contenido) y `GET /api/v1/messages/{message_id}/history` (hilo), en paralelo. Si el remitente es un área ajena se pide su nombre a `GET /api/v1/departments/{id}`.
3. Cuando el contenido cargó: `POST /api/v1/message-recipients/{id}/read`, que responde 204. Se usa el `id` del registro de destinatario, no el `message_id`. Si falla, el lector ofrece reintentar.

Los leídos durante la sesión quedan en la lista marcados como «Leído» y se descuentan del contador. Al actualizar, el backend ya no los devuelve.

## Historial

Se dibuja desde `message_relations`: los mensajes en orden de fecha y, en cada uno, sus enlaces salientes (`REPLY` «Responde a», `FORWARD` «Reenvía», `REFERENCE` «Hace referencia a»). El mensaje abierto se marca como «Este mensaje». Los demás muestran su contenido al desplegarlos.

## Formato de campos

`model.Message` y `model.MessageRelation` del backend no tienen etiquetas `json` en varios campos, así que llegan como `Subject`, `Body`, `MessageType`, `SourceMessageID`, `RelationType`, etc. `lib/messages.ts` acepta ese formato y el snake_case documentado. Esto también se aplica al listado de mensajes enviados.

## Proxies

`app/api/v1/_proxy.ts` reenvía `user_id`, acepta 204 sin cuerpo y, si el backend responde con texto plano (por ejemplo un 404 de una ruta que aún no existe), devuelve un error JSON legible con el mismo código.
