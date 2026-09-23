const CACHE_NAME = 'foodie-shell-v1';
// Lista de recursos estáticos indispensables que conforman el App Shell
const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// 1. Instalación: Pre-cachear el App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS);
    }).then(() => self.skipWaiting()) // Forzar activación de la nueva versión
  );
});

// 2. Activación: Limpieza de cachés de versiones anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Tomar control inmediato de las pestañas
  );
});

// 3. Estrategia de Fetch: Manejar peticiones para modo Offline
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // IMPORTANTE: Las respuestas /api/* NO deben guardarse en Cache Storage (se manejan con IndexedDB)
  if (url.pathname.startsWith('/api/')) {
    return; // Permite que el navegador haga la petición normal a la red
  }

  // Para el App Shell y estáticos: Estrategia Stale-While-Revalidate o Cache First
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Devuelve de caché y actualiza en segundo plano
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Ignorar errores de red en segundo plano */});

        return cachedResponse;
      }

      // Si no está en caché, va a la red
      return fetch(event.request);
    })
  );
});

// 4. Evento Push (Base para cuando implementen el Backend de notificaciones)
self.addEventListener('push', (event) => {
  let data = { title: 'Nueva reseña', body: '¡Alguien publicó una nueva reseña de un plato!', url: '/' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: { url: data.url || '/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 5. Evento Click en la Notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si ya hay una ventana abierta de la app, enfocarla y navegar
      for (let client of windowClients) {
        if ('focus' in client) {
          client.focus();
          return client.navigate(targetUrl);
        }
      }
      // Si no hay ventanas abiertas, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});