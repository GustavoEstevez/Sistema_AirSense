/* ============================================================
   AIRSENSE — Lógica del Dashboard
   - Consulta GET /dashboard/data/ cada 2s
   - Actualiza métricas, estado y recomendaciones
   - Renderiza gráficos de tendencia con Chart.js
   ============================================================ */

(() => {
  // -------- Configuración --------
  const API_URL = '/dashboard/data/';  // ← URL corregida para Django
  const POLL_INTERVAL_MS = 2000;
  const HISTORY_LENGTH = 20;

  const RANGES = {
    temp:  { okMin: 18, okMax: 26, warnMin: 15, warnMax: 30 },
    hum:   { okMin: 40, okMax: 60, warnMin: 30, warnMax: 70 },
    noise: { okMax: 50, warnMax: 70 },
  };

  // -------- Referencias al DOM --------
  const el = {
    conn:       document.getElementById('connStatus'),
    tempValue:  document.getElementById('tempValue'),
    humValue:   document.getElementById('humValue'),
    noiseValue: document.getElementById('noiseValue'),
    tempStatus: document.getElementById('tempStatus'),
    humStatus:  document.getElementById('humStatus'),
    noiseStatus:document.getElementById('noiseStatus'),
    envCard:    document.getElementById('envCard'),
    envTitle:   document.getElementById('envTitle'),
    envDesc:    document.getElementById('envDesc'),
    envBadge:   document.getElementById('envBadge'),
    envIcon:    document.getElementById('envIcon'),
    recsList:   document.getElementById('recsList'),
    year:       document.getElementById('year'),
  };

  if (el.year) el.year.textContent = new Date().getFullYear();

  // -------- Clasificación de estados --------
  function classifyTemp(t) {
    if (t == null || isNaN(t)) return { state: 'normal', label: '—' };
    if (t < RANGES.temp.warnMin || t > RANGES.temp.warnMax) return { state: 'danger',  label: t > RANGES.temp.warnMax ? 'Muy Caliente' : 'Muy Frío' };
    if (t < RANGES.temp.okMin   || t > RANGES.temp.okMax)   return { state: 'warning', label: t > RANGES.temp.okMax   ? 'Cálido'       : 'Fresco' };
    return { state: 'normal', label: 'Normal' };
  }
  function classifyHum(h) {
    if (h == null || isNaN(h)) return { state: 'normal', label: '—' };
    if (h < RANGES.hum.warnMin || h > RANGES.hum.warnMax) return { state: 'danger',  label: h > RANGES.hum.warnMax ? 'Muy Húmedo' : 'Muy Seco' };
    if (h < RANGES.hum.okMin   || h > RANGES.hum.okMax)   return { state: 'warning', label: h > RANGES.hum.okMax   ? 'Húmedo'     : 'Seco' };
    return { state: 'normal', label: 'Óptima' };
  }
  function classifyNoise(n) {
    if (n == null || isNaN(n)) return { state: 'normal', label: '—' };
    if (n > RANGES.noise.warnMax) return { state: 'danger',  label: 'Muy Ruidoso' };
    if (n > RANGES.noise.okMax)   return { state: 'warning', label: 'Elevado' };
    return { state: 'normal', label: 'Ruido Bajo' };
  }

  // -------- Recomendaciones --------
  function buildRecommendations(t, h, n) {
    const recs = [];
    if (t != null) {
      if (t > RANGES.temp.warnMax)      recs.push({ level: 'danger', text: 'La temperatura es muy alta. Ventilá el ambiente o activá el sistema de refrigeración.' });
      else if (t > RANGES.temp.okMax)   recs.push({ level: 'warn',   text: 'La temperatura es alta. Considerá mejorar la ventilación.' });
      else if (t < RANGES.temp.warnMin) recs.push({ level: 'danger', text: 'La temperatura es muy baja. Proporcioná calefacción adicional.' });
      else if (t < RANGES.temp.okMin)   recs.push({ level: 'warn',   text: 'La temperatura es baja. Considerá calentar el ambiente.' });
    }
    if (h != null) {
      if (h > RANGES.hum.warnMax)      recs.push({ level: 'danger', text: 'La humedad es muy alta. Riesgo de moho — usá un deshumidificador.' });
      else if (h > RANGES.hum.okMax)   recs.push({ level: 'warn',   text: 'La humedad está elevada. Mejorá la circulación del aire.' });
      else if (h < RANGES.hum.warnMin) recs.push({ level: 'danger', text: 'La humedad es muy baja. Usá un humidificador para evitar molestias.' });
      else if (h < RANGES.hum.okMin)   recs.push({ level: 'warn',   text: 'La humedad es baja. Considerá aumentar los niveles de humedad.' });
    }
    if (n != null) {
      if (n > RANGES.noise.warnMax)    recs.push({ level: 'danger', text: 'El nivel de ruido es muy alto. La exposición prolongada puede dañar la audición.' });
      else if (n > RANGES.noise.okMax) recs.push({ level: 'warn',   text: 'El nivel de ruido está elevado. Considerá aislamiento acústico.' });
    }
    if (!recs.length) recs.push({ level: 'ok', text: 'Todas las lecturas están dentro de los rangos saludables. El ambiente es confortable.' });
    return recs;
  }

  function renderRecommendations(recs) {
    el.recsList.innerHTML = '';
    for (const r of recs) {
      const li = document.createElement('li');
      li.className = 'rec ' + (r.level === 'danger' ? 'rec-danger' : r.level === 'warn' ? 'rec-warn' : 'rec-ok');
      li.textContent = r.text;
      el.recsList.appendChild(li);
    }
  }

  // -------- Estado ambiental general --------
  const ENV_ICONS = {
    healthy:   '<path d="M20 6 9 17l-5-5"/>',
    warning:   '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
    unhealthy: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  };

  function updateEnvStatus(apiState, tState, hState, nState) {
    const worst = [tState, hState, nState].includes('danger') ? 'danger'
                : [tState, hState, nState].includes('warning') ? 'warning'
                : 'normal';

    let state, title, desc, badge;
    const normalized = (apiState || '').toLowerCase();

    if (worst === 'danger' || normalized.includes('mala') || normalized.includes('unhealthy') || normalized.includes('insalubre')) {
      state = 'danger'; title = 'Ambiente No Saludable';
      desc  = 'Una o más lecturas están fuera de los rangos seguros. Tomá medidas ahora.';
      badge = 'No Saludable';
    } else if (worst === 'warning' || normalized.includes('regular') || normalized.includes('warning') || normalized.includes('precaución')) {
      state = 'warning'; title = 'Advertencia Ambiental';
      desc  = 'Las condiciones son aceptables pero se alejan del rango óptimo.';
      badge = 'Advertencia';
    } else {
      state = 'healthy'; title = 'Ambiente Saludable';
      desc  = 'Todas las lecturas están dentro de los rangos óptimos.';
      badge = 'Saludable';
    }

    el.envCard.dataset.state = state === 'healthy' ? 'healthy' : state;
    el.envTitle.textContent = title;
    el.envDesc.textContent  = desc;
    el.envBadge.textContent = badge;
    el.envIcon.innerHTML    = ENV_ICONS[state === 'danger' ? 'unhealthy' : state === 'warning' ? 'warning' : 'healthy'];
  }

  // -------- Actualización de métricas --------
  function setMetric(valueEl, statusEl, value, classifier) {
    const num = (value == null || isNaN(value)) ? null : Number(value);
    valueEl.textContent = num == null ? '--' : num;
    const c = classifier(num);
    statusEl.textContent = c.label;
    statusEl.dataset.state = c.state;
    return c.state;
  }

  // -------- Estado de conexión --------
  function setConnection(state) {
    if (!el.conn) return;
    el.conn.classList.remove('online', 'offline');
    if (state === 'online') {
      el.conn.classList.add('online');
      el.conn.querySelector('.conn-label').textContent = 'En vivo';
    } else if (state === 'offline') {
      el.conn.classList.add('offline');
      el.conn.querySelector('.conn-label').textContent = 'Sin conexión';
    } else {
      el.conn.querySelector('.conn-label').textContent = 'Conectando…';
    }
  }

  // -------- Gráficos --------
  const charts = {};
  function createCharts() {
    if (typeof Chart === 'undefined') return;

    const baseOpts = (color) => ({
      type: 'line',
      data: {
        labels: Array(HISTORY_LENGTH).fill(''),
        datasets: [{
          data: Array(HISTORY_LENGTH).fill(null),
          borderColor: color,
          backgroundColor: color + '22',
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { display: false, grid: { display: false } },
          y: { grid: { color: 'rgba(15,33,71,0.06)' }, ticks: { color: '#6b7693', font: { size: 11 } } },
        },
        animation: { duration: 400 },
      },
    });

    const tempCtx  = document.getElementById('tempChart');
    const humCtx   = document.getElementById('humChart');
    const noiseCtx = document.getElementById('noiseChart');
    if (tempCtx)  charts.temp  = new Chart(tempCtx,  baseOpts('#f43f5e'));
    if (humCtx)   charts.hum   = new Chart(humCtx,   baseOpts('#06b6d4'));
    if (noiseCtx) charts.noise = new Chart(noiseCtx, baseOpts('#7c3aed'));

    seedMockHistory();
  }

  function seedMockHistory() {
    const seed = { temp: 23, hum: 55, noise: 40 };
    for (let i = 0; i < HISTORY_LENGTH; i++) {
      pushPoint('temp',  seed.temp  + (Math.random() * 2 - 1));
      pushPoint('hum',   seed.hum   + (Math.random() * 4 - 2));
      pushPoint('noise', seed.noise + (Math.random() * 6 - 3));
    }
  }

  function pushPoint(key, value) {
    const c = charts[key];
    if (!c || value == null || isNaN(value)) return;
    const ds = c.data.datasets[0].data;
    ds.push(Number(value.toFixed(1)));
    if (ds.length > HISTORY_LENGTH) ds.shift();
    c.data.labels = ds.map(() => '');
    c.update('none');
  }

  // -------- Obtención de datos --------
  async function fetchData() {
    try {
      const res = await fetch(API_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      handleData(data);
      setConnection('online');
    } catch (err) {
      console.warn('[AIRSENSE] Error al consultar /dashboard/data/:', err.message);
      setConnection('offline');
    }
  }

  function handleData(data) {
    const t = Number(data?.temperatura);
    const h = Number(data?.humedad);
    const n = Number(data?.ruido);
    const apiState = data?.estado || '';

    const tState = setMetric(el.tempValue,  el.tempStatus,  t, classifyTemp);
    const hState = setMetric(el.humValue,   el.humStatus,   h, classifyHum);
    const nState = setMetric(el.noiseValue, el.noiseStatus, n, classifyNoise);

    updateEnvStatus(apiState, tState, hState, nState);
    renderRecommendations(buildRecommendations(
      isNaN(t) ? null : t,
      isNaN(h) ? null : h,
      isNaN(n) ? null : n
    ));

    if (!isNaN(t)) pushPoint('temp',  t);
    if (!isNaN(h)) pushPoint('hum',   h);
    if (!isNaN(n)) pushPoint('noise', n);
  }

  // -------- Inicio --------
  function start() {
    createCharts();
    fetchData();
    setInterval(fetchData, POLL_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();