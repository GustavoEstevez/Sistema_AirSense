/* ============================================================
   AIRSENSE — Lógica del Dashboard
   - Consulta GET /dashboard/data/ cada 2s
   - Actualiza métricas, estado y recomendaciones
   - Renderiza gráficos de tendencia con Chart.js
   - Líneas de referencia (rangos OMS/ASHRAE) y flechas de tendencia
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

  // Referencias OMS/ASHRAE dibujadas dentro de cada gráfico
  const REFS = {
    temp:  [
      { value: 18, label: '18°', color: '#10b981' },
      { value: 26, label: '26°', color: '#10b981' },
    ],
    hum:   [
      { value: 40, label: '40%', color: '#10b981' },
      { value: 60, label: '60%', color: '#10b981' },
    ],
    noise: [
      { value: 50, label: '50 dB', color: '#10b981' },
    ],
    co2:   [
      { value: 800, label: '800', color: '#10b981' },
      { value: 1200, label: '1200', color: '#f59e0b' },
    ],
  };

  // -------- Registro del plugin de anotaciones --------
  (function registerAnnotation() {
    if (typeof Chart === 'undefined' || !Chart.register) return;
    const g = window.annotationPlugin || (window.Chart && window.Chart.Annotation);
    if (g) {
      try { Chart.register(g); } catch (e) { /* el plugin ya estaba registrado */ }
    }
  })();

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
    tempTrend:  document.getElementById('tempTrend'),
    humTrend:   document.getElementById('humTrend'),
    noiseTrend: document.getElementById('noiseTrend'),
    co2Trend:   document.getElementById('co2Trend'),
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

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function buildRecommendations(t, h, n, c) {
    const recs = [];

    if (t != null) {
      if (t > RANGES.temp.warnMax)
        recs.push({ level: 'danger', text: pick([
          'La temperatura es muy alta. Ventilá el ambiente o activá el sistema de refrigeración de inmediato.',
          'La temperatura superó el límite seguro. Abrí ventanas y reducí las fuentes de calor ya.',
          'Hace mucho calor en el ambiente. Refrescá el aula lo antes posible para evitar malestar.',
        ]) });
      else if (t > RANGES.temp.okMax)
        recs.push({ level: 'warn', text: pick([
          'La temperatura es alta. Considerá mejorar la ventilación o reducir fuentes de calor.',
          'La temperatura está por encima de lo ideal. Una corriente de aire ayudaría a bajarla.',
          'Hace un poco de calor. Abrí las ventanas para mejorar la circulación del aire.',
        ]) });
      else if (t < RANGES.temp.warnMin)
        recs.push({ level: 'danger', text: pick([
          'La temperatura es muy baja. Proporcioná calefacción adicional para evitar riesgos de salud.',
          'El ambiente está muy frío. Encendé la calefacción para evitar enfermedades.',
          'La temperatura cayó por debajo del rango seguro. Calefaccioná el aula de inmediato.',
        ]) });
      else if (t < RANGES.temp.okMin)
        recs.push({ level: 'warn', text: pick([
          'La temperatura es baja. Considerá calentar el ambiente para mayor confort.',
          'Hace un poco de frío. Cerrando ventanas o con calefacción baja alcanza.',
          'La temperatura está por debajo de lo ideal. Un poco de calefacción mejoraría el confort.',
        ]) });
    }

    if (h != null) {
      if (h > RANGES.hum.warnMax)
        recs.push({ level: 'danger', text: pick([
          'La humedad es muy alta. Existe riesgo de moho y problemas respiratorios — usá un deshumidificador.',
          'El ambiente está muy húmedo. Ventilá y usá un deshumidificador para prevenir hongos.',
          'La humedad superó el nivel seguro. Riesgo de moho: ventilar y deshumidificar.',
        ]) });
      else if (h > RANGES.hum.okMax)
        recs.push({ level: 'warn', text: pick([
          'La humedad está elevada. Mejorá la circulación del aire abriendo ventanas o usando ventiladores.',
          'La humedad subió de lo ideal. Una ventilación cruzada la va a equilibrar.',
          'El aire está algo húmedo. Corré las ventanas un rato para ventilar.',
        ]) });
      else if (h < RANGES.hum.warnMin)
        recs.push({ level: 'danger', text: pick([
          'La humedad es muy baja. Puede causar irritación en piel y vías respiratorias — usá un humidificador.',
          'El ambiente está muy seco. Usá un humidificador para cuidar las vías respiratorias.',
          'La humedad cayó a niveles muy bajos. Humidificá el espacio lo antes posible.',
        ]) });
      else if (h < RANGES.hum.okMin)
        recs.push({ level: 'warn', text: pick([
          'La humedad es baja. Considerá aumentar los niveles de humedad para mayor confort.',
          'El aire está seco. Un humidificador o plantas ayudan a subir la humedad.',
          'La humedad está por debajo de lo ideal. Subirla un poco mejora el bienestar.',
        ]) });
    }

    if (n != null) {
      if (n > RANGES.noise.warnMax)
        recs.push({ level: 'danger', text: pick([
          'El nivel de ruido es muy alto. La exposición prolongada puede dañar permanentemente la audición.',
          'El ruido superó el límite seguro. Reducí el nivel de ruido o usá protección auditiva.',
          'Demasiado ruido en el ambiente. Bajá el volumen o alejate de la fuente sonora.',
        ]) });
      else if (n > RANGES.noise.okMax)
        recs.push({ level: 'warn', text: pick([
          'El nivel de ruido está elevado. Puede afectar la concentración y el rendimiento académico. Considerá aislamiento acústico.',
          'El ruido es alto y puede afectar la atención. Tratá de reducir las fuentes de sonido.',
          'Hay bastante ruido en el aula. Aislar la fuente o bajar el volumen mejora la concentración.',
        ]) });
    }

    if (c != null) {
      if (c > RANGES.co2.warnMax)
        recs.push({ level: 'danger', text: pick([
          'El nivel de CO₂ es muy alto. El aire está viciado — abrí ventanas o puertas de inmediato para ventilar el ambiente.',
          'El CO₂ superó el nivel seguro. Ventilá el aula por completo lo antes posible.',
          'El aire está muy viciado. Abrí ventanas y puertas para renovar el aire ya.',
        ]) });
      else if (c > RANGES.co2.okMax)
        recs.push({ level: 'warn', text: pick([
          'El nivel de CO₂ está elevado. Esto puede causar fatiga y falta de concentración. Mejorá la ventilación del aula.',
          'El CO₂ está subiendo. Ventilá un poco para evitar somnolencia y falta de atención.',
          'El aire empieza a viciarse. Abrí las ventanas para renovarlo.',
        ]) });
    }

    if (t != null && h != null && t > RANGES.temp.okMax && h > RANGES.hum.okMax)
      recs.push({ level: 'warn', text: pick([
        'La combinación de temperatura y humedad elevadas genera sensación térmica mayor a la real. Se recomienda ventilación urgente.',
        'Calor y humedad juntos: la sensación térmica es peor de lo que marca el termómetro. Ventilá el ambiente.',
        'Temperatura y humedad altas a la vez. Ventilación inmediata para bajar la sensación térmica.',
      ]) });

    if (c != null && n != null && c > RANGES.co2.okMax && n > RANGES.noise.okMax)
      recs.push({ level: 'warn', text: pick([
        'Ambiente con CO₂ elevado y ruido alto simultáneamente. Estas condiciones afectan significativamente el rendimiento académico.',
        'Ruido alto y CO₂ elevado al mismo tiempo. Renová el aire y bajá el ruido para mantener la atención.',
        'CO₂ y ruido en niveles altos. Ventilá y reducí el sonido para cuidar la concentración.',
      ]) });

    if (!recs.length)
      recs.push({ level: 'ok', text: pick([
        'Todas las lecturas están dentro de los rangos saludables. El ambiente es confortable y apto para el aprendizaje.',
        'Todo en orden. Los niveles del ambiente son saludables.',
        'El ambiente está en condiciones óptimas. No se necesitan acciones.',
        'Condiciones ideales para estudiar y trabajar. Seguí así.',
      ]) });

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

  // -------- Última lectura para flechas de tendencia --------
  const last = { temp: null, hum: null, noise: null, co2: null };

  function setMetric(valueEl, statusEl, trendEl, value, classifier, key) {
    const num = (value == null || isNaN(value)) ? null : Number(value);
    if (valueEl) valueEl.textContent = num == null ? '--' : num;
    const c = classifier(num);
    if (statusEl) {
      statusEl.textContent = c.label;
      statusEl.dataset.state = c.state;
    }
    if (trendEl) {
      if (num == null || last[key] == null) {
        trendEl.textContent = '';
        trendEl.className = 'metric-trend';
      } else {
        const delta = num - last[key];
        const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
        trendEl.textContent = (delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '• ') + Math.abs(delta).toFixed(1);
        trendEl.className = 'metric-trend trend-' + dir;
      }
    }
    if (num != null) last[key] = num;
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

    const baseOpts = (color, refs) => ({
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
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false },
          annotation: {
            annotations: (refs || []).map((r, i) => ({
              type: 'line',
              scaleID: 'y',
              value: r.value,
              borderColor: r.color || '#10b981',
              borderWidth: 1.5,
              borderDash: [6, 4],
              label: {
                display: true,
                content: r.label || '',
                position: 'start',
                backgroundColor: 'transparent',
                color: r.color || '#10b981',
                font: { size: 9, weight: '600' },
                yAdjust: i % 2 === 0 ? -8 : 8,
              },
            })),
          },
        },
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

    if (tempCtx)  charts.temp  = new Chart(tempCtx,  baseOpts('#f43f5e', REFS.temp));
    if (humCtx)   charts.hum   = new Chart(humCtx,   baseOpts('#06b6d4', REFS.hum));
    if (noiseCtx) charts.noise = new Chart(noiseCtx, baseOpts('#7c3aed', REFS.noise));
    if (co2Ctx)   charts.co2   = new Chart(co2Ctx,   baseOpts('#10b981', REFS.co2));

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

    const tState = setMetric(el.tempValue,  el.tempStatus,  el.tempTrend,  t, classifyTemp,  'temp');
    const hState = setMetric(el.humValue,   el.humStatus,   el.humTrend,   h, classifyHum,   'hum');
    const nState = setMetric(el.noiseValue, el.noiseStatus, el.noiseTrend, n, classifyNoise, 'noise');
    const cState = setMetric(el.co2Value,   el.co2Status,   el.co2Trend,   c, classifyCO2,   'co2');

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
