/* ============================================================
   AIRSENSE — Lógica del Dashboard
   - Consulta GET /dashboard/data/ cada 2s
   - Actualiza métricas, estado y recomendaciones
   - Renderiza gráficos de tendencia con Chart.js
   - Manejo de errores
   ============================================================ */

(() => {
  const API_URL = '/dashboard/data/';
  const POLL_INTERVAL_MS = 2000;
  const HISTORY_LENGTH = 20;

  const RANGES = {
    temp:  { okMin: 18, okMax: 26, warnMin: 15, warnMax: 30 },
    hum:   { okMin: 40, okMax: 60, warnMin: 30, warnMax: 70 },
    noise: { okMax: 50, warnMax: 70 },
    co2:   { okMax: 800, warnMax: 1200 },
  };

  const el = {
    conn:       document.getElementById('connStatus'),
    tempValue:  document.getElementById('tempValue'),
    humValue:   document.getElementById('humValue'),
    noiseValue: document.getElementById('noiseValue'),
    co2Value:   document.getElementById('co2Value'),
    tempStatus: document.getElementById('tempStatus'),
    humStatus:  document.getElementById('humStatus'),
    noiseStatus:document.getElementById('noiseStatus'),
    co2Status:  document.getElementById('co2Status'),
    envCard:    document.getElementById('envCard'),
    envTitle:   document.getElementById('envTitle'),
    envDesc:    document.getElementById('envDesc'),
    envBadge:   document.getElementById('envBadge'),
    envIcon:    document.getElementById('envIcon'),
    recsList:   document.getElementById('recsList'),
    year:       document.getElementById('year'),
  };

  if (el.year) el.year.textContent = new Date().getFullYear();

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

  function classifyCO2(c) {
    if (c == null || isNaN(c)) return { state: 'normal', label: '—' };
    if (c > RANGES.co2.warnMax) return { state: 'danger',  label: 'Aire Viciado' };
    if (c > RANGES.co2.okMax)   return { state: 'warning', label: 'Ventilación Necesaria' };
    return { state: 'normal', label: 'Aire Fresco' };
  }

  function buildRecommendations(t, h, n, c) {
    const recs = [];

    if (t != null) {
      if (t > RANGES.temp.warnMax)
        recs.push({ level: 'danger', text: 'La temperatura es muy alta. Ventilá el ambiente o activá el sistema de refrigeración de inmediato.' });
      else if (t > RANGES.temp.okMax)
        recs.push({ level: 'warn', text: 'La temperatura es alta. Considerá mejorar la ventilación o reducir fuentes de calor.' });
      else if (t < RANGES.temp.warnMin)
        recs.push({ level: 'danger', text: 'La temperatura es muy baja. Proporcioná calefacción adicional para evitar riesgos de salud.' });
      else if (t < RANGES.temp.okMin)
        recs.push({ level: 'warn', text: 'La temperatura es baja. Considerá calentar el ambiente para mayor confort.' });
    }

    if (h != null) {
      if (h > RANGES.hum.warnMax)
        recs.push({ level: 'danger', text: 'La humedad es muy alta. Existe riesgo de moho y problemas respiratorios — usá un deshumidificador.' });
      else if (h > RANGES.hum.okMax)
        recs.push({ level: 'warn', text: 'La humedad está elevada. Mejorá la circulación del aire abriendo ventanas o usando ventiladores.' });
      else if (h < RANGES.hum.warnMin)
        recs.push({ level: 'danger', text: 'La humedad es muy baja. Puede causar irritación en piel y vías respiratorias — usá un humidificador.' });
      else if (h < RANGES.hum.okMin)
        recs.push({ level: 'warn', text: 'La humedad es baja. Considerá aumentar los niveles de humedad para mayor confort.' });
    }

    if (n != null) {
      if (n > RANGES.noise.warnMax)
        recs.push({ level: 'danger', text: 'El nivel de ruido es muy alto. La exposición prolongada puede dañar permanentemente la audición.' });
      else if (n > RANGES.noise.okMax)
        recs.push({ level: 'warn', text: 'El nivel de ruido está elevado. Puede afectar la concentración y el rendimiento académico. Considerá aislamiento acústico.' });
    }

    if (c != null) {
      if (c > RANGES.co2.warnMax)
        recs.push({ level: 'danger', text: 'El nivel de CO₂ es muy alto. El aire está viciado — abrí ventanas o puertas de inmediato para ventilar el ambiente.' });
      else if (c > RANGES.co2.okMax)
        recs.push({ level: 'warn', text: 'El nivel de CO₂ está elevado. Esto puede causar fatiga y falta de concentración. Mejorá la ventilación del aula.' });
    }

    if (t != null && h != null && t > RANGES.temp.okMax && h > RANGES.hum.okMax)
      recs.push({ level: 'warn', text: 'La combinación de temperatura y humedad elevadas genera sensación térmica mayor a la real. Se recomienda ventilación urgente.' });

    if (c != null && n != null && c > RANGES.co2.okMax && n > RANGES.noise.okMax)
      recs.push({ level: 'warn', text: 'Ambiente con CO₂ elevado y ruido alto simultáneamente. Estas condiciones afectan significativamente el rendimiento académico.' });

    if (!recs.length)
      recs.push({ level: 'ok', text: 'Todas las lecturas están dentro de los rangos saludables. El ambiente es confortable y apto para el aprendizaje.' });

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

  const ENV_ICONS = {
    healthy:   '<path d="M20 6 9 17l-5-5"/>',
    warning:   '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
    unhealthy: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  };

  function updateEnvStatus(apiState, tState, hState, nState, cState) {
    const worst = [tState, hState, nState, cState].includes('danger') ? 'danger'
                : [tState, hState, nState, cState].includes('warning') ? 'warning'
                : 'normal';

    let state, title, desc, badge;
    const normalized = (apiState || '').toLowerCase();

    if (worst === 'danger' || normalized.includes('mala') || normalized.includes('unhealthy')) {
      state = 'danger';
      title = 'Ambiente No Saludable';
      desc  = 'Una o más lecturas están fuera de los rangos seguros. Tomá medidas ahora.';
      badge = 'No Saludable';
    } else if (worst === 'warning' || normalized.includes('regular') || normalized.includes('precaución')) {
      state = 'warning';
      title = 'Advertencia Ambiental';
      desc  = 'Las condiciones son aceptables pero se alejan del rango óptimo.';
      badge = 'Advertencia';
    } else {
      state = 'healthy';
      title = 'Ambiente Saludable';
      desc  = 'Todas las lecturas están dentro de los rangos óptimos.';
      badge = 'Saludable';
    }

    el.envCard.dataset.state = state === 'healthy' ? 'healthy' : state;
    el.envTitle.textContent = title;
    el.envDesc.textContent  = desc;
    el.envBadge.textContent = badge;
    el.envIcon.innerHTML    = ENV_ICONS[state === 'danger' ? 'unhealthy' : state === 'warning' ? 'warning' : 'healthy'];
  }

  function setMetric(valueEl, statusEl, value, classifier) {
    const num = (value == null || isNaN(value)) ? null : Number(value);
    if (valueEl) valueEl.textContent = num == null ? '--' : num;
    const c = classifier(num);
    if (statusEl) {
      statusEl.textContent = c.label;
      statusEl.dataset.state = c.state;
    }
    return c.state;
  }

  function setConnection(state) {
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
    const co2Ctx   = document.getElementById('co2Chart');

    if (tempCtx)  charts.temp  = new Chart(tempCtx,  baseOpts('#f43f5e'));
    if (humCtx)   charts.hum   = new Chart(humCtx,   baseOpts('#06b6d4'));
    if (noiseCtx) charts.noise = new Chart(noiseCtx, baseOpts('#7c3aed'));
    if (co2Ctx)   charts.co2   = new Chart(co2Ctx,   baseOpts('#10b981'));

    seedMockHistory();
  }

  function seedMockHistory() {
    const seed = { temp: 23, hum: 55, noise: 40, co2: 600 };
    for (let i = 0; i < HISTORY_LENGTH; i++) {
      pushPoint('temp',  seed.temp  + (Math.random() * 2 - 1));
      pushPoint('hum',   seed.hum   + (Math.random() * 4 - 2));
      pushPoint('noise', seed.noise + (Math.random() * 6 - 3));
      pushPoint('co2',   seed.co2   + (Math.random() * 40 - 20));
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

  async function fetchData() {
    try {
      const res = await fetch(API_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      handleData(data);
      setConnection('online');
    } catch (err) {
      console.warn('[AIRSENSE] Error al consultar /data:', err.message);
      setConnection('offline');
    }
  }

  function handleData(data) {
    const t = Number(data?.temperatura);
    const h = Number(data?.humedad);
    const n = Number(data?.ruido);
    const c = Number(data?.co2);
    const apiState = data?.estado || '';

    const tState = setMetric(el.tempValue,  el.tempStatus,  t, classifyTemp);
    const hState = setMetric(el.humValue,   el.humStatus,   h, classifyHum);
    const nState = setMetric(el.noiseValue, el.noiseStatus, n, classifyNoise);
    const cState = setMetric(el.co2Value,   el.co2Status,   c, classifyCO2);

    updateEnvStatus(apiState, tState, hState, nState, cState);
    renderRecommendations(buildRecommendations(
      isNaN(t) ? null : t,
      isNaN(h) ? null : h,
      isNaN(n) ? null : n,
      isNaN(c) ? null : c
    ));

    if (!isNaN(t)) pushPoint('temp',  t);
    if (!isNaN(h)) pushPoint('hum',   h);
    if (!isNaN(n)) pushPoint('noise', n);
    if (!isNaN(c)) pushPoint('co2',   c);
  }

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
 