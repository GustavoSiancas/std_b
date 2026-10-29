# Login

El formulario envía `username` y `password` a `/api/auth/login`. Esa ruta reenvía el POST a `http://localhost:8080/api/v1/login` con `Content-Type: application/json` y sin token.

Para otro servidor, define `API_BASE_URL` en `.env.local`, por ejemplo `API_BASE_URL=http://localhost:8080`. Reinicia el frontend al cambiar la configuración.

La respuesta esperada es `{ user: { id, username, admin, name, email, is_active } }`. `user.admin === true` muestra la vista provisional de súper admin; `false` muestra la vista de usuario. Las cuentas inactivas no entran. No hay usuarios simulados ni se deduce el rol del nombre.

La sesión vive únicamente en memoria y se pierde al recargar. La respuesta actual no entrega token ni cookie: este cambio de vista no protege endpoints del backend. Cuando el servidor incorpore sesión/autorización, deberá verificar el rol en cada operación administrativa.

En un despliegue remoto, `localhost` corresponde al servidor que ejecuta el frontend. Para conectar desde allí se necesita una URL del backend accesible desde ese servidor y configurar `API_BASE_URL`.

Los GET paginados y los formularios de creación compartidos quedan como contrato para implementar el directorio administrativo; esta entrega conecta el login.
