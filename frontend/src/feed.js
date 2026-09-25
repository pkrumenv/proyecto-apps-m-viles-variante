import { saveFeedSnapshot, getFeedSnapshot, clearOtherUsers } from './offline-feed.js';

export async function cargarFeed(userId) {
  const feedContainer = document.getElementById('feed-container');

  // Si estamos online, intentar obtener desde el servidor
  if (typeof window === 'undefined' || navigator.onLine !== false) {
    try {
      const response = await fetch('/api/v1/feed');

      if (response.status === 401) {
        // Sesión vencida en servidor
        window.dispatchEvent(new CustomEvent('session-expired'));
        return;
      }

      if (!response.ok) throw new Error('Error al consultar el feed');

      const data = await response.json(); // { items: [...], next_cursor: ... }
      
      // Guardar snapshot local asignado al usuario actual
      await saveFeedSnapshot(userId, data.items, data.next_cursor);
      
      // Limpiar datos que pertenezcan a otros usuarios almacenados anteriormente
      await clearOtherUsers(userId);

      renderizarFeed(data.items, false);
      return;
    } catch (err) {
      console.warn('Fallo la red al cargar el feed. Intentando copia offline...', err);
    }
  }

  // Si estamos offline o falló la petición de red, cargar copia local
  const snapshot = await getFeedSnapshot(userId);
  if (snapshot && snapshot.items) {
    renderizarFeed(snapshot.items, true, snapshot.updatedAt);
  } else {
    feedContainer.innerHTML = '<p class="info-msg">Necesitas conexión a internet para cargar el feed por primera vez.</p>';
  }
}

function renderizarFeed(items, esOffline, updatedAt = null) {
  const container = document.getElementById('feed-container');
  let html = '';

  if (esOffline) {
    const fecha = updatedAt ? new Date(updatedAt).toLocaleString() : 'desconocida';
    html += `<div class="offline-badge">⚠️ Contenido desactualizado (Copia local del ${fecha})</div>`;
  }

  if (!items || items.length === 0) {
    html += '<p>No hay reseñas disponibles en el feed.</p>';
  } else {
    items.forEach(item => {
      // El backend retorna items con objeto review: { author, restaurant, photo_url, text, dish_name, id }
      const rev = item.review || item;
      html += `
        <article class="feed-card" data-review-id="${rev.id}">
          <header class="feed-card-header">
            <strong>${rev.author?.name || 'Usuario'}</strong> en <em>${rev.restaurant?.name || 'Restaurante'}</em>
          </header>
          <h4>${rev.dish_name || 'Plato sin nombre'}</h4>
          <p>${rev.text || ''}</p>
          ${rev.photo_url ? `<img src="${rev.photo_url}" alt="Foto del plato" class="feed-img" />` : ''}
        </article>
      `;
    });
  }

  container.innerHTML = html;
}