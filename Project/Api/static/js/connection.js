/* ============================================================
   AIRSENSE — Estado de conexión del botón "Ver en vivo"
   - Consulta /dashboard/data/ periódicamente
   - Muestra "Ver en vivo" si el dispositivo responde,
     "Sin conexión" en caso contrario
   ============================================================ */
(() => {
  const API_URL = '/dashboard/data/';
  const POLL_INTERVAL_MS = 5000;

  function applyStatus(online) {
    const btns = document.querySelectorAll('.btn-live');
    for (let i = 0; i < btns.length; i++) {
      const label = btns[i].querySelector('.btn-live-label');
      if (!label) continue;
      label.textContent = online ? 'Ver en vivo' : 'Sin conexión';
      btns[i].classList.toggle('btn-live--offline', !online);
      btns[i].classList.toggle('btn-live--online', !!online);
    }
  }

  async function check() {
    try {
      const res = await fetch(API_URL, { cache: 'no-store' });
      applyStatus(res.ok);
    } catch (err) {
      applyStatus(false);
    }
  }

  check();
  setInterval(check, POLL_INTERVAL_MS);
})();
