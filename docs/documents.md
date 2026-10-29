# Espacio de documentos

El login dirige `admin: false` a `components/document-workspace.tsx`. El sidebar consulta todas las páginas de tipos activos, ordenados por nombre, y usa sus IDs reales. Los administradores conservan su panel actual.

Cada sección consulta `GET /api/v1/documents` filtrando siempre por `created_by: user.id` y `document_type_id`, ambos IDs numéricos positivos. Permite búsqueda con debounce de 350 ms, área, año de correlativo, orden y tamaño de página. Cambiar filtros reinicia la página; se cancelan consultas anteriores para evitar respuestas desactualizadas. La tabla muestra nombre, descripción, tipo, área, el `document_number` visible, fecha y enlace HTTP/HTTPS seguro al archivo. Nunca construye el número con `correlative_number` ni usa `document_sequence_id` para mostrarlo.

Las áreas asignadas se toman de `user.departments` del login, excluyendo áreas o pertenencias inactivas. Si el login no incluye este campo, se busca el ID exacto del usuario en el listado paginado de usuarios para recuperar sus pertenencias. Si no se pueden consultar o no tiene áreas activas, se informa y se deshabilita la creación.

El formulario crea con `POST /api/v1/documents`: tipo seleccionado, área asignada, ID de usuario del login, nombre, descripción opcional y enlace HTTP/HTTPS. No sube archivos. El backend genera los correlativos. Al guardar, actualiza el listado y limpia filtros. Muestra errores del backend y evita envíos simultáneos.

El proxy usa `API_BASE_URL` (por defecto `http://localhost:8080`), permite los parámetros documentados y solo reenvía los campos de creación. No envía `document_number` ni `correlative_number`. Los filtros personales no reemplazan permisos del backend; se conserva el contrato sin tokens proporcionado.
