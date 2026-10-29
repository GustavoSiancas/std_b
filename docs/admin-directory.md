# Directorio de administración

## Padres y organigrama

En la tabla de áreas se muestra el padre inmediato usando `department.parent`, independientemente de la página y de los filtros. `parent_id: null` identifica un área superior. Un padre inactivo conserva su nombre y código con la etiqueta «Inactiva».

En Áreas → Organigrama, `components/organization-chart.tsx` consulta `/api/v1/departments/organization-chart` mediante un proxy dedicado al backend. No envía filtros ni paginación: dibuja todas las `roots` y recorre `children` recursivamente, manteniendo el orden recibido. Cada rama se puede plegar y las áreas inactivas se muestran con borde discontinuo y etiqueta, sin moverlas ni ocultarlas. Se muestran `total` y `root_count`, distinguiendo una raíz de varias jerarquías independientes.

Incluye carga, estado vacío, actualización manual y reintento. Una respuesta 409 muestra el error del backend sobre ciclos o padres ausentes; no intenta reconstruir una jerarquía a partir del listado paginado.

## Crear registros

Los botones «Crear área» y «Crear usuario» abren formularios accesibles con confirmación de éxito y errores del backend. Los POST pasan por el mismo proxy a `localhost:8080` (o `API_BASE_URL`), con JSON y sin token. Solo se reenvían los campos documentados; no se admite `admin` al crear usuarios.

Crear área envía `{ name, code, parent_id }`; el código se convierte a mayúsculas y el área superior es opcional. Crear usuario envía `{ name, email, username, password, department_id }`, normalizando correo y usuario a minúsculas. Se validan los límites en bytes UTF-8, incluida la contraseña de 8 a 72 bytes. No se recorta ni almacena la contraseña.

Los selectores consultan áreas activas, permiten buscar y cargar páginas de 100. Al crear un registro se cierra el formulario, se reinician los filtros y se recarga su listado. Los errores 400, 409 y 500 se muestran desde `{ error }`. Si se pierde la conexión después de enviar, se indica revisar el listado antes de volver a guardar.

Al iniciar sesión con `user.admin === true`, `components/admin-directory.tsx` carga el listado de usuarios y la primera página del selector de áreas. El directorio tiene dos pestañas: Usuarios y Áreas.

El navegador consulta rutas relativas `/api/v1/users` y `/api/v1/departments`. `app/api/v1/[resource]/route.ts` reenvía únicamente los recursos y parámetros permitidos a `API_BASE_URL`, con valor predeterminado `http://localhost:8080`. No necesita CORS ni envía tokens.

La búsqueda tiene un debounce de 350 ms. Cambiar búsqueda, filtros o tamaño de página reinicia la página a 1; cada efecto cancela la petición anterior con `AbortController`. Se usan `data`, `total` y `total_pages` devueltos por el servidor, incluyendo `total_pages: 0` en listados vacíos. El usuario puede reintentar una consulta fallida.

En Usuarios se puede filtrar por `q`, `department_id`, `admin` e `is_active`; todas las pertenencias de `user.departments` aparecen incluso cuando se filtra por un área. El selector consulta áreas activas en páginas de 50, permite buscar por nombre o código y cargar más. Elegir «Todas las áreas» omite `department_id`.

En Áreas se usan `q` e `is_active`. Ambos listados permiten 10, 20, 50 o 100 filas por página.

El control `user.admin` decide qué interfaz mostrar. Los GET siguen siendo públicos según el contrato actual: la autorización del servidor debe incorporarse en el backend cuando se implemente la sesión.
