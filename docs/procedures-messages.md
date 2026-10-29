# Trámites y mensajes

`components/correspondence.tsx` atiende las opciones del sidebar en ÁREA y PERSONAL. Trámites: «Crear trámite» y «Trámites». Mensajes: «Crear mensaje» y «Mensajes» (una sola vista; no se separan enviados y recibidos en el sidebar). Hoy «Mensajes» usa el listado por remitente; cuando exista el endpoint de recibidos se integrará en la misma vista.

El sidebar muestra ÁREA y PERSONAL con sus opciones a la vista (un clic a cualquier pantalla), cada sección se puede plegar, y Documentos lista los tipos con su total.

Todos los endpoints son públicos: no se envía JWT ni token, solo IDs numéricos JSON. El usuario sale del login (`user.id`) y las áreas de `user.departments` activas.

## Listados

- ÁREA: `GET /api/v1/{procedures|messages}/by-sender-department/{areaId}`, con selector de área remitente.
- PERSONAL: `GET /api/v1/{procedures|messages}/by-sender-user/{user.id}`.

Trámites filtran por `status` (OPEN/CLOSED) y `q`. Mensajes envían `message_type` (DEPARTMENT o PERSONAL), en ÁREA también `visibility=DEPARTMENT`, y opcionalmente `procedure_id` y `q`. La respuesta trae `total`, `page` y `page_size`; las páginas se calculan con `ceil(total / page_size)`. El proxy (`app/api/v1/_sender-list.ts`) solo reenvía esos parámetros y valida `page_size` entre 1 y 100.

## Creación

- Trámite: formulario en la misma página (no diálogo) con nombre y descripción. Envía `name`, `description`, `procedure_type` y `created_by`; en ÁREA además `sender_department_id`. El backend genera `procedure_number` (`TRAMITE/{siglas}/{n}` o `PERSONAL/{nn}/{código}`); el frontend nunca lo envía. Al crear, el aviso muestra el número recibido y resalta la fila nueva.
- Mensaje: diálogo con dos botones. «Guardar borrador» envía `status: "BORRADOR"` con `created_by`, `message_type`, `visibility`, `subject` y `body`, sin destinatarios ni adjuntos. «Enviar» envía `status: "HECHO"` y además `recipients` y `document_ids`. ÁREA usa `message_type: "DEPARTMENT"` con `sender_department_id`; PERSONAL usa `"PERSONAL"`. Cada destinatario es un usuario (`recipient_id`) o un área (`department_id`) con `type` `TO` (Para) o `CC`; para enviar hace falta al menos uno en `TO`. La vinculación con trámites (`procedure_id`) no se usa al crear mensajes hasta el próximo feature. Los adjuntos son documentos creados por el usuario (filtrados por área en ÁREA). Se confirma con 201. El listado marca los borradores.

El proxy de `POST /api/v1/procedures` y `/messages` exige `sender_department_id` solo en DEPARTMENT y lo descarta en PERSONAL. El proxy reenvía `status` y valida que sea BORRADOR o HECHO. Los errores 400 (campos inválidos, trámite cerrado) y 403 (sin rol para representar al área) se muestran con el mensaje del backend.

## Número de trámite

Se muestra `procedure_number` en el listado, en el filtro de trámites de mensajes y en el selector al vincular un mensaje. Las llamadas a la API siguen usando `id` (`procedure_id`). Si un registro aún no trae `procedure_number`, se muestra `#id`. La búsqueda `q` también encuentra por número.

## user_id

`lib/api.ts` agrega `user_id` (el `user.id` de `POST /login`) a todas las peticiones `/api/v1`; se guarda al iniciar sesión y se limpia al cerrarla. Los proxies lo reenvían al backend y rechazan valores no numéricos. Sin `user_id` el backend asume el usuario 0 y responde 403. En los listados por área el usuario además debe ser miembro activo del área (`department_members.is_active = true`). Un `data: null` en la respuesta se trata como lista vacía.
