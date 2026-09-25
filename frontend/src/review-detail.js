export async function cargarVistaResenaEspecifica(reviewId) {
  const container = document.getElementById('review-detail-container');
  if (!container) return;

  try {
    const res = await fetch(`/api/v1/reviews/${reviewId}`);
    if (!res.ok) throw new Error('No se pudo cargar la reseña.');

    const review = await res.json();
    container.innerHTML = `
      <div class="review-detail-card">
        <button onclick="window.history.back()">← Volver al feed</button>
        <h2>${review.dish_name}</h2>
        <p><strong>Restaurante:</strong> ${review.restaurant?.name || ''}</p>
        <p><strong>Por:</strong> ${review.author?.name || ''}</p>
        <p>${review.text}</p>
        ${review.photo_url ? `<img src="${review.photo_url}" alt="Foto" />` : ''}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p class="error">No se pudo cargar la reseña solicitada.</p>`;
  }
}