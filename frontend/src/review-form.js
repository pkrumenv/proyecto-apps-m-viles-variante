export function inicializarFormularioResena() {
  const form = document.getElementById('review-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Regla del enunciado: deshabilitar si no hay conexión
    if (typeof window !== 'undefined' && navigator.onLine === false) {
      alert('No hay conexión a Internet. El envío de reseñas requiere estar online.');
      return;
    }

    const formData = new FormData(form); 
    // formData debe incluir: restaurant_id, dish_name, text, photo (File)

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    try {
      const res = await fetch('/api/v1/reviews', {
        method: 'POST',
        body: formData // Multipart form data
      });

      if (!res.ok) {
        throw new Error('Error en el servidor al crear la reseña');
      }

      form.reset();
      alert('¡Reseña creada con éxito!');
      // Recargar el feed
      window.dispatchEvent(new CustomEvent('review-created'));

    } catch (err) {
      // Regla del enunciado: Informar que no se completó (sin reintentos)
      alert('No se pudo completar la operación. Comprueba tu conexión e intenta de nuevo.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Publicar Reseña';
    }
  });
}