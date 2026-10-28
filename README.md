# Foodie — resumen del proyecto

Foodie es una aplicación web progresiva para descubrir restaurantes, registrar visitas y experiencias gastronómicas, y compartirlas con otras personas. Esta guía resume el recorrido de la aplicación, identifica los archivos principales y explica cómo colaboran el frontend, el backend, la base de datos, el service worker y Web Push.

## Recorrido de extremo a extremo

1. **Inicio de la aplicación.** El navegador carga el build de Vite servido por el gateway nginx. En desarrollo, el gateway dirige el frontend a Vite y las solicitudes de API a FastAPI. En producción, sirve los archivos estáticos de React y envía /api al backend.
2. **Reconstrucción de la sesión.** React consulta GET /api/v1/auth/session. La cookie HttpOnly la administra el navegador. Mientras se verifica la sesión, la aplicación muestra carga; con sesión válida abre el área protegida; con 401 muestra el acceso; si falla la red y hay datos persistidos, permite consultar el feed offline.
3. **Navegación protegida.** React Router presenta Feed, Explorar, Notificaciones, Perfil y las rutas de detalle. Entrar sin sesión conduce a login; el backend sigue siendo quien autoriza cada solicitud.
4. **Descubrimiento.** La búsqueda de restaurantes y personas se actualiza de manera incremental con una breve espera y cancela solicitudes anteriores. La ficha muestra fotos, reseñas, evaluaciones y visitas de personas seguidas. El mapa busca restaurantes al quedar quieto después de moverlo, en vez de hacer una solicitud por cada movimiento.
5. **Registro de actividad.** Desde la ficha se puede registrar un check-in, subir una o varias fotos, reseñar una foto de plato y evaluar el restaurante. El selector reutilizable explica la visibilidad. La reseña no puede ser más visible que la foto asociada.
6. **Interacción social.** Los perfiles permiten seguir o dejar de seguir usuarios; las fichas permiten seguir restaurantes. La actividad pública de cuentas o restaurantes seguidos llega al feed. Los comentarios de una foto admiten respuestas y paginación por cursor.
7. **Feed online y paginación.** El backend devuelve páginas cronológicas con next_cursor. El frontend conserva el cursor opaco, agrega la página siguiente y evita duplicados. El backend deduplica una actividad que coincide con más de un seguimiento. La pantalla distingue carga, contenido, vacío y error.
8. **Copia offline.** El feed consultado online se persiste en IndexedDB junto con su cursor y, cuando se descargan correctamente, las imágenes. La copia se asocia al id de usuario. Al cerrar sesión se borra, y al confirmar una cuenta distinta se limpian datos de cuentas anteriores.
9. **Notificaciones.** La persona activa Push mediante una acción explícita. El emisor del backend consulta suscripciones de los destinatarios ya resueltos y envía Web Push. Al tocar una notificación, el service worker comunica la ruta al cliente y React Router abre la vista.
10. **Despliegue.** GitHub Actions construye el frontend y los contenedores. El gateway sirve la aplicación bajo HTTPS y hace fallback a index.html para que se puedan abrir o recargar rutas de React. PostgreSQL de producción es externo al stack y se selecciona con DATABASE_URL.

## Enrutamiento y rutas protegidas

Las rutas se definen en frontend/src/app/App.jsx con React Router. /login y /register son públicas. El resto se encuentra dentro de RouteGate, que espera a que SessionProvider verifique la sesión. Si el estado es anónimo, la persona es redirigida a login y, tras autenticarse, vuelve a la ruta solicitada. Las rutas de actividad tienen URL propia, por ejemplo /photos/:id, /reviews/:id, /visits/:id y /evaluations/:id. Esto permite abrir enlaces directos, usar atrás/adelante y navegar desde notificaciones.

La protección del router mejora la experiencia, pero no sustituye la autorización: FastAPI valida cada recurso con la cookie HttpOnly.

## Estado de sesión y respuesta a 401

frontend/src/app/session-context.jsx crea SessionProvider, que mantiene un solo estado compartido para toda la aplicación y provee el cliente API. El arranque y el login consultan /auth/session para confirmar la sesión. El cliente de frontend/src/api.js notifica a SessionProvider cuando cualquier solicitud responde 401; el contexto limpia el estado autenticado y las rutas vuelven al acceso. Un error de red no se interpreta como 401.

Al cerrar sesión, el contexto intenta eliminar del backend la suscripción Push, la desuscribe del navegador, borra el contenido offline de esa cuenta y vuelve al estado anónimo.

## Cancelación de solicitudes

Los métodos del cliente API aceptan AbortController.signal. Las pantallas lo crean al cargar datos y abortan la solicitud en el cleanup de useEffect cuando se desmontan, cambia el identificador de ruta o cambia la consulta. La búsqueda incremental reinicia su temporizador y cancela la petición anterior para que una respuesta tardía no reemplace resultados de una consulta nueva. La carga de comentarios y respuestas también cancela solicitudes al salir de la vista.

## Feed, cursores y estados

GET /api/v1/feed entrega items y next_cursor. El cursor es opaco y se usa para pedir la página siguiente, no se calcula en el cliente. FeedPage mantiene la página actual, combina nuevas páginas por identidad de actividad y ofrece Cargar más mientras exista cursor.

La deduplicación se aplica en el backend para que una misma actividad no aparezca dos veces si el usuario sigue tanto al autor como al restaurante. El cliente también evita volver a anexar IDs ya mostrados en cargas sucesivas. La pantalla representa los estados de carga, contenido, feed vacío y error por separado. Un 401 invalida la sesión global. El snapshot persistido sirve como lectura offline cuando la red no está disponible.

## Copia offline por usuario

frontend/src/offline-feed.js usa IndexedDB foodie-offline-db. feedSnapshots usa userId como clave del snapshot y guarda items, nextCursor y updatedAt. feedPhotos guarda blobs de imágenes por photoId y userId. La interfaz solicita una copia offline del feed solo después de un error de conectividad.

SessionProvider llama clearOtherUsers tras confirmar una sesión para eliminar datos de cuentas anteriores. En logout llama clearUserData para borrar feed e imágenes del usuario que sale. El contenido offline es de solo lectura; las escrituras requieren conexión.

## Service worker sobre el build de Vite

frontend/scripts/generate-sw.js se ejecuta después de vite build. Recorre dist, calcula una versión a partir de los archivos construidos y sustituye en dist/sw.js los marcadores del nombre de caché y de APP_SHELL_ASSETS. Así la precarga incluye recursos con hash reales del build.

frontend/public/sw.js precarga el shell, activa inmediatamente la nueva versión y elimina las cachés foodie-shell-* antiguas en activate antes de reclamar clientes. Las peticiones API no se guardan en Cache Storage. En navegación, la caché permite abrir index.html sin red. La versión de caché cambia con los archivos de salida para evitar mezclar recursos de builds distintos.

## notificationclick y navegación del router

El service worker guarda la ruta en los datos de la notificación. En notificationclick valida el origen, busca una ventana de la aplicación y, si existe, le envía { type: "NAVIGATE", url } con postMessage y la enfoca. Si no hay ventana, abre la ruta del mismo origen.

frontend/src/main.jsx registra ServiceWorkerNavigation, que escucha el mensaje, vuelve a validar el origen y permite únicamente rutas de actividad admitidas. Después llama a navigate de React Router. Así las notificaciones usan rutas reales, como /reviews/:id, y ya no un hash del tipo /#review/id.

## Push y destinatarios

La solicitud de permiso no ocurre al cargar la página. PushPreferences ofrece una acción explícita que llama al controlador de frontend/src/push.js. El controlador solicita Notification.requestPermission, obtiene la llave pública VAPID, crea una suscripción en el navegador y registra endpoint y claves en /api/v1/push/subscriptions. Al cerrar sesión se borra la asociación en el backend y se desuscribe el endpoint del navegador.

backend/app/services/notifications.py resuelve los destinatarios de actividad pública: seguidores del autor y del restaurante, sin incluir al autor y sin repetir un usuario. La actividad privada produce una lista vacía. backend/app/main.py instala backend/app/services/push.py con set_notifier al inicializar la app.

El emisor recibe tipo, id y destinatarios ya resueltos; consulta push_subscriptions solo para esos usuarios y envía a cada endpoint mediante pywebpush. No recorre todas las suscripciones. Las reseñas no generan otro aviso: las fotos agrupadas y sus reseñas se presentan como una sola entrada de actividad. Si faltan claves VAPID, el emisor omite el envío.

## Visibilidad pública y privada

frontend/src/app/App.jsx define VisibilityField, el selector reutilizable empleado en los formularios de actividad. La explicación junto al selector indica que una actividad pública puede aparecer en perfil, feed, notificaciones y ficha del restaurante; una privada solo queda disponible en el perfil propio.

El backend aplica la regla de privacidad. Además, una reseña no puede ser más visible que su fotografía: una reseña pública sobre una foto privada es rechazada; una reseña privada sobre una foto pública se permite.

## Despliegue, secretos y rutas profundas

El stack de producción se define en docker-compose.deploy.yml y no incluye PostgreSQL: el backend usa la base asignada al grupo mediante DATABASE_URL. El workflow define ENVIRONMENT=production y COOKIE_SECURE=true. La cookie de sesión se marca Secure y HttpOnly para el sitio HTTPS.

Los secretos de backend (DATABASE_URL, JWT_SECRET y VAPID_PRIVATE_KEY) se entregan al contenedor desde Actions y no deben versionarse. Las variables VITE_* se sustituyen durante el build y quedan visibles para cualquier visitante que descargue el bundle. La clave de Google Maps no es secreta: debe restringirse por referente HTTP y limitarse a las API necesarias.

gateway/production.conf sirve los archivos de Vite y redirige las rutas que no corresponden a un archivo hacia index.html. Ese fallback es necesario para recargar directamente una ruta React. Las rutas /api/* se envían al backend.

## Mapa, geolocalización y theme

frontend/src/app/GoogleRestaurantMap.jsx escucha el evento idle de Google Maps, espera 450 ms y consulta los límites visibles. No solicita datos por cada movimiento. Evita repetir una consulta cuando los límites nuevos ya están cubiertos por los consultados antes. La búsqueda por cercanía usa la posición del navegador solo después de la acción Usar mi ubicación actual; si se deniega el permiso, se informa y siguen disponibles la búsqueda por nombre y la exploración manual del mapa si Maps está configurado.

El único theme de MUI está en frontend/src/app/theme.js y se aplica desde frontend/src/main.jsx. Define modo claro, paleta verde/azul, superficies claras, tipografía Inter para el cuerpo y Georgia para encabezados. Los componentes reciben estilos de MUI para mantener una presentación común.

## Ejecución y pruebas

Requisitos: Docker Desktop con Compose. Para probar directamente el frontend, Node.js 22.12 o posterior.

    docker compose up --build

La aplicación local queda en http://localhost:5173 y la API interactiva en http://localhost:5173/docs. Para detenerla sin borrar datos:

    Ctrl+C
    docker compose down

Las pruebas del backend se ejecutan desde la raíz:

    docker compose --profile test up --build --abort-on-container-exit --exit-code-from backend-tests backend-tests

Las pruebas del frontend y el build se ejecutan desde frontend:

    npm ci
    npm test
    npm run build

El build genera el bundle y su precarga del service worker. El detalle de configuración de producción, secretos y diagnósticos está en DEPLOY.md; el contrato de endpoints está en backend/docs/api.md.

## Tabla de archivos y responsabilidades

La tabla cubre los archivos fuente y configuración que participan directamente en el flujo desplegado. Los archivos de pruebas, fixtures, recursos gráficos, documentos de entregas y migraciones se indican en la sección de estructura inferior.

### Entrada, configuración y despliegue

| Archivo | Responsabilidad |
|---|---|
| README.md | Este resumen del flujo y el mapa de componentes. |
| DEPLOY.md | Variables, secretos, arquitectura y diagnóstico del despliegue. |
| docker-compose.yml | Stack local: PostgreSQL, FastAPI, Vite y gateway nginx. |
| docker-compose.deploy.yml | Stack de producción, sin PostgreSQL local; usa DATABASE_URL externo. |
| .env.local.example | Ejemplo de variables locales; nunca contiene valores reales de secretos. |
| .gitignore | Excluye secretos locales, dependencias, builds y archivos temporales de Git. |
| .dockerignore | Evita copiar al contexto de Docker archivos innecesarios o secretos locales. |
| .github/workflows/deploy.yml | Construye y actualiza el stack de producción al ejecutar el workflow. |
| scripts/ | Ayudantes de operación local y despliegue; cada script documenta su tarea en su nombre/uso. |
| certs/ | Certificados de desarrollo para HTTPS local en dispositivos; no se usan en producción. |
| gateway/Dockerfile | Imagen nginx para desarrollo. |
| gateway/Dockerfile.production | Imagen que sirve el build estático y el proxy de producción. |
| gateway/routes.conf | Reglas comunes de proxy por ruta. |
| gateway/http.conf | Configuración nginx para HTTP local. |
| gateway/https.conf | Configuración nginx para HTTPS local. |
| gateway/production.conf | Sirve el frontend, pasa /api al backend y aplica fallback a index.html. |
| gateway/start.sh | Inicia nginx con la configuración local seleccionada. |
| frontend/package.json | Dependencias y comandos de desarrollo, pruebas y build. |
| frontend/package-lock.json | Versiones exactas de dependencias npm para instalaciones reproducibles. |
| frontend/Dockerfile | Imagen de desarrollo para instalar dependencias y servir Vite. |
| frontend/.dockerignore | Excluye node_modules, builds y archivos no necesarios del contexto frontend. |
| frontend/vite.config.js | Configura Vite y proxy de API durante desarrollo. |
| frontend/index.html | Documento shell que contiene el punto de montaje de React. |
| frontend/scripts/generate-sw.js | Genera la lista hashada del precache y la versión del service worker desde dist. |
| frontend/public/manifest.webmanifest | Identidad, iconos, scope y opciones de instalación PWA. |
| frontend/public/sw.js | Caché del shell, fallback offline, recepción de Push y clic de notificaciones. |
| frontend/public/icons/icon-192x192.png | Icono de la PWA en tamaño 192 px. |
| frontend/public/icons/icon-512x512.png | Icono de la PWA en tamaño 512 px. |

### Frontend

| Archivo | Responsabilidad |
|---|---|
| frontend/src/main.jsx | Monta React, MUI, Router y SessionProvider; recibe mensajes NAVIGATE y registra el service worker. |
| frontend/src/app/App.jsx | Define rutas, navegación, protección y pantallas del feed, restaurantes, perfiles, formularios, actividad y comentarios. |
| frontend/src/app/session-context.jsx | Comparte sesión, cliente API, login/logout, invalidación por 401 y restauración offline. |
| frontend/src/api.js | Cliente HTTP relativo, errores, credentials, cancelación, carga con progreso y endpoints del backend. |
| frontend/src/app/theme.js | Único theme de MUI: paleta, tipografía, formas y componentes. |
| frontend/src/app/app.css | Ajustes de presentación comunes a las pantallas React. |
| frontend/src/app/CreateRestaurantPage.jsx | Formulario de alta, geocodificación y manejo de duplicados de restaurantes. |
| frontend/src/app/google-maps.js | Carga una sola vez la biblioteca de Google Maps y comunica fallos de configuración. |
| frontend/src/app/GoogleRestaurantMap.jsx | Renderiza mapa, marcadores, búsqueda debounced por área y errores/reintentos. |
| frontend/src/push.js | Controla estados de soporte, permiso, suscripción y baja de Web Push. |
| frontend/src/offline-feed.js | Guarda, obtiene y elimina snapshots de feed e imágenes por usuario en IndexedDB. |
| frontend/src/auth.js | Controlador de autenticación de la interfaz anterior sin React; se conserva como implementación legado. |
| frontend/src/restaurants.js | Controlador de lista de restaurantes de la interfaz anterior; se conserva como legado. |
| frontend/src/review-detail.js | Render de detalle de reseña de la interfaz anterior; la app React usa ActivityPage. |
| frontend/src/main.js | Entrada de la interfaz vanilla de la Entrega 2; no es el punto de montaje de la app React actual. |
| frontend/src/style.css | Estilos de la interfaz vanilla anterior; app.css contiene los ajustes de React. |

### Backend: aplicación, API y servicios

| Archivo | Responsabilidad |
|---|---|
| backend/app/main.py | Crea FastAPI, instala el emisor con set_notifier e incluye routers. |
| backend/Dockerfile | Construye la imagen de API con sus dependencias Python. |
| backend/entrypoint.sh | Prepara el esquema con migraciones y arranca el servidor ASGI. |
| backend/pyproject.toml | Declara dependencias, configuración de herramientas y metadatos Python. |
| backend/alembic.ini | Configuración de Alembic para localizar y ejecutar migraciones. |
| backend/test-entrypoint.sh | Punto de entrada para ejecutar las pruebas del backend en su contenedor. |
| backend/app/core/config.py | Lee y valida configuración, cookies seguras, CORS, base de datos, media y VAPID. |
| backend/app/core/security.py | Firma/verifica tokens de sesión y aplica utilidades de seguridad. |
| backend/app/core/countries.py | Catálogo de países usado en registro y perfiles. |
| backend/app/core/rating_criteria.py | Criterios de evaluación disponibles para restaurantes. |
| backend/app/db/engine.py | Crea el engine de SQLAlchemy. |
| backend/app/db/session.py | Provee conexión/dependencia de base de datos para operaciones API. |
| backend/app/db/schema.py | Declara tablas, columnas, restricciones e índices. |
| backend/app/db/seed.py | Inserta solo datos de demostración que faltan si SEED_DEMO_DATA está habilitado. |
| backend/app/db/fixtures.py | Contenido determinista que usa el seed local y de evaluación. |
| backend/app/db/retry.py | Reintenta transacciones ante errores transitorios compatibles. |
| backend/app/media/storage.py | Abstrae almacenamiento local o S3 de las fotos. |
| backend/app/api/dependencies.py | Dependencias compartidas de autenticación y sesión para routers. |
| backend/app/api/auth.py | Registro, login, sesión y logout. |
| backend/app/api/countries.py | Endpoint del catálogo de países. |
| backend/app/api/users.py | Búsqueda, perfiles, actividad y seguimiento de usuarios. |
| backend/app/api/restaurants.py | Búsqueda, creación, ficha, estilos, mapa y seguimiento de restaurantes. |
| backend/app/api/visits.py | Alta y consulta de check-ins. |
| backend/app/api/photos.py | Subida y consulta de fotografías. |
| backend/app/api/reviews.py | Creación y lectura de reseñas asociadas a fotos. |
| backend/app/api/evaluations.py | Criterios, evaluaciones y resumen por restaurante. |
| backend/app/api/feed.py | Endpoint del feed paginado. |
| backend/app/api/comments.py | Comentarios en fotografías y respuestas en threads. |
| backend/app/api/push.py | Registro y baja de suscripciones Web Push. |
| backend/app/services/auth.py | Lógica de cuentas, credenciales y sesiones. |
| backend/app/services/users.py | Búsqueda de usuario, perfil y relaciones sociales. |
| backend/app/services/restaurants.py | Búsqueda, creación, proximidad y ficha del restaurante. |
| backend/app/services/visits.py | Reglas y persistencia de visitas. |
| backend/app/services/photos.py | Validación y persistencia de fotos y grupos de carga. |
| backend/app/services/reviews.py | Reglas y persistencia de reseñas. |
| backend/app/services/evaluations.py | Reglas y persistencia de evaluaciones multicriterio. |
| backend/app/services/comments.py | Paginación de threads y respuestas, creación de comentarios. |
| backend/app/services/feed.py | Construcción del feed cronológico paginado y deduplicado. |
| backend/app/services/activity.py | Representación común y acceso a detalles de actividades. |
| backend/app/services/visibility.py | Reglas comunes de visibilidad pública/privada. |
| backend/app/services/cursors.py | Codifica y valida cursores opacos de paginación. |
| backend/app/services/notifications.py | Resuelve destinatarios de actividad y ofrece set_notifier. |
| backend/app/services/push.py | Busca suscripciones resueltas y entrega Web Push mediante pywebpush. |

### Contratos, esquemas, migraciones y pruebas

| Archivo o directorio | Responsabilidad |
|---|---|
| backend/app/schemas/*.py | Modelos de entrada y salida de la API por recurso: usuarios, restaurantes, actividad, fotos, reseñas, evaluaciones, comentarios y Push. |
| backend/migrations/env.py | Configuración de Alembic y conexión a la base. |
| backend/migrations/versions/*.py | Historial de cambios del esquema PostgreSQL; Alembic aplica solo las revisiones pendientes. |
| backend/tests/ | Pruebas de contrato, reglas de negocio, visibilidad, feed, paginación y Push. |
| frontend/tests/ | Pruebas del cliente API, autenticación y estados de interfaz. |
| docs/entrega1.md | Enunciado de diseño de la primera entrega. |
| docs/entrega2.md | Requisitos de PWA, caché offline y Web Push de la segunda entrega. |
| docs/entrega3.md | Alcance y evaluación del frontend React. |
| backend/docs/api.md | Contrato de endpoints organizado por épica. |
| backend/docs/https-local.md | Instrucciones para probar en teléfono con HTTPS local. |

Los archivos de código bajo frontend/src que no comienzan por app/ y se identifican como legado pertenecen al cliente vanilla de la Entrega 2. La aplicación React actual parte de main.jsx y app/App.jsx; se conservan módulos anteriores para referencia y compatibilidad durante la migración.
