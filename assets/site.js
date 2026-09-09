/* ECOFASA — render de todas las páginas desde window.ECOFASA_DATA.
   data/data.js lo genera `uv run ecofasa export` a partir del tracker (Google Sheets).
   Regla: ningún número escrito a mano en el HTML; si falta un dato, se muestra [dato pendiente]. */
(function () {
  'use strict';

  var EN = /^en/i.test(document.documentElement.lang || '');
  var LOCALE = EN ? 'en-US' : 'es-AR';
  var PEND = EN ? '[pending]' : '[dato pendiente]';
  var D = window.ECOFASA_DATA || null;
  var page = document.body.getAttribute('data-page') || '';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function txt(x) {
    if (x === undefined || x === null) return PEND;
    var s = String(x).trim();
    if (!s || /^\[(cargar|completar|pendiente)\]$/i.test(s)) return PEND;
    return s;
  }
  function num(x) {
    // Solo numeros reales o strings estrictamente numericos; cualquier texto ("[cargar]", "—", "TBD") es pendiente.
    if (typeof x === 'number') return isFinite(x) ? x : null;
    if (x === undefined || x === null) return null;
    var s = String(x).trim();
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
  }
  function usd(n) { return (n === null || n === undefined) ? PEND : 'USD ' + Math.round(n).toLocaleString(LOCALE); }
  function pct(x) { var n = num(x); return n === null ? PEND : Math.round(n <= 1 ? n * 100 : n) + (EN ? '%' : ' %'); }
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    for (var i = 2; i < arguments.length; i++) {
      var kids = Array.isArray(arguments[i]) ? arguments[i] : [arguments[i]];
      kids.forEach(function (c) { if (c === null || c === undefined) return; e.appendChild(c.nodeType ? c : document.createTextNode(String(c))); });
    }
    return e;
  }
  function rows(name) { return (D && D[name] && D[name].rows) || []; }
  function values(name) { return (D && D[name] && D[name].values) || {}; }
  function keyStarting(row, prefix) { for (var k in row) if (k.indexOf(prefix) === 0) return k; return null; }

  var resumen = values('presupuesto_resumen');
  var years = Object.keys(resumen).filter(function (k) { return /^total_\d{4}$/.test(k); }).map(function (k) { return k.slice(6); }).sort();
  var periodo = years.length ? years[0] + '–' + years[years.length - 1] : PEND;
  var acciones = rows('acciones');
  var costKey = acciones.length ? keyStarting(acciones[0], 'Costo') : null;

  // Taglines por área (texto editorial del plan visual v4; los nombres y conteos salen del tracker).
  var AREA_TAGLINES = {
    '1': 'Medir y reducir la huella; usar la voz del deporte',
    '2': 'Proteger glaciares y ambientes de montaña',
    '3': 'Reusar, reparar, reducir residuos',
    '4': 'Ética y protección en el deporte',
    '5': 'Más gente en la montaña, mejor',
    '6': 'Estructura, conocimiento y transparencia',
    '7': 'No reinventar la rueda: aliarse'
  };

  function areas() {
    var map = {}, order = [];
    acciones.forEach(function (r) {
      var a = txt(r['Área estratégica']);
      if (a === PEND) return;
      if (!map[a]) { map[a] = []; order.push(a); }
      map[a].push(r);
    });
    return order.map(function (name) {
      var m = name.match(/^(\d+)\.\s*(.*)$/);
      var n = m ? m[1] : '';
      return { name: name, num: n, title: m ? m[2] : name, tagline: AREA_TAGLINES[n] || '', rows: map[name] };
    }).sort(function (a, b) { return Number(a.num) - Number(b.num); });
  }

  var stats = {
    acciones: acciones.length,
    costo_cero: costKey ? acciones.filter(function (r) { return num(r[costKey]) === 0; }).length : null,
    nucleo: acciones.filter(function (r) { return txt(r['Núcleo viable']) === 'Sí'; }).length,
    areas: areas().length,
    kpis: rows('kpis').length,
    periodo: periodo,
    anio0: years[0] || PEND,
    partida2026: usd(num(resumen['total_' + years[0]])),
    subtotal_total: usd(num(resumen.subtotal_total)),
    contingencia_total: usd(num(resumen.contingencia_total)),
    total_plan: usd(num(resumen.total_plan)),
    contingencia_pct: pct(resumen.contingencia_pct)
  };

  function fillStats() {
    $$('[data-stat]').forEach(function (e) {
      var v = stats[e.getAttribute('data-stat')];
      e.textContent = (v === null || v === undefined) ? PEND : v;
    });
    $$('[data-generated]').forEach(function (e) {
      e.textContent = D && D.generated_at_utc ? String(D.generated_at_utc).slice(0, 10) : PEND;
    });
    // Links que no salen del tracker (plantilla, PDF, guias): vienen de la config via export; sin link queda el pendiente.
    var links = (D && D.links) || {};
    $$('[data-link]').forEach(function (e) {
      var url = links[e.getAttribute('data-link')];
      if (!url) return;
      var a = h('a', { href: url, target: '_blank', rel: 'noopener' }, e.getAttribute('data-link-text') || url);
      e.parentNode.replaceChild(a, e);
    });
  }

  function badge(text, kind) { return h('span', { class: 'badge ' + (kind || '') }, text); }
  function badgesFor(r) {
    var b = h('div', { class: 'badges' });
    if (txt(r['Núcleo viable']) === 'Sí') b.appendChild(badge('★ Núcleo viable', 'nucleo'));
    b.appendChild(badge(txt(r['Esfuerzo']), 'esfuerzo'));
    b.appendChild(badge(txt(r['Plazo (año)']), 'plazo'));
    b.appendChild(badge(txt(r['Estado']), 'estado'));
    return b;
  }

  function noData() {
    var m = $('main .wrap') || $('main');
    if (m) m.insertBefore(h('div', { class: 'notice', role: 'alert' }, EN
      ? 'Tracker data is missing: run `uv run ecofasa export` to generate data/data.js.'
      : 'Faltan los datos del tracker: corré `uv run ecofasa export` para generar data/data.js.'), m.firstChild);
  }

  // ---------- Inicio ----------
  function renderHome() {
    var porque = $('#porque');
    if (porque) rows('porque').forEach(function (r) {
      porque.appendChild(h('article', { class: 'card' },
        h('div', { class: 'big' }, txt(r['Valor'])),
        h('h3', null, txt(r['Dato'])),
        h('p', { class: 'meta' }, txt(r['Detalle'])),
        h('div', { class: 'src' }, 'Fuente: ' + txt(r['Fuente']))));
    });
    var al = $('#areas');
    if (al) areas().forEach(function (a) {
      var nucleo = a.rows.filter(function (r) { return txt(r['Núcleo viable']) === 'Sí'; }).length;
      al.appendChild(h('a', { class: 'card', href: 'plan.html#area-' + a.num },
        h('div', { class: 'id' }, 'Área ' + a.num),
        h('h3', null, a.title),
        h('p', { class: 'meta' }, a.tagline),
        h('div', { class: 'src' }, a.rows.length + ' acciones · ' + nucleo + ' del núcleo viable')));
    });
  }

  // ---------- Plan ----------
  function renderPlan() {
    var root = $('#plan');
    if (root) areas().forEach(function (a) {
      var ul = h('ul');
      a.rows.forEach(function (r) {
        ul.appendChild(h('li', null,
          h('span', { class: 'id' }, txt(r['ID'])),
          h('span', null, txt(r['Acción']), txt(r['Núcleo viable']) === 'Sí' ? h('span', { class: 'star', title: 'Núcleo viable' }, ' ★') : null),
          badge(txt(r['Esfuerzo'])), badge(txt(r['Plazo (año)']), 'plazo'), badge(txt(r['Estado']), 'estado')));
      });
      root.appendChild(h('section', { class: 'area', id: 'area-' + a.num },
        h('h2', null, h('span', { class: 'num' }, a.num + '.'), a.title),
        h('p', { class: 'tag' }, a.tagline + ' · ' + a.rows.length + ' acciones'),
        ul));
    });
    var ruta = $('#ruta');
    if (ruta) {
      var tb = h('tbody');
      rows('hoja_de_ruta').forEach(function (r) {
        tb.appendChild(h('tr', null, h('td', { class: 'num' }, txt(r['Año'])), h('td', null, txt(r['Hito principal'])),
          h('td', null, txt(r['Entregables clave'])), h('td', null, txt(r['Área(s)'])), h('td', null, txt(r['Estado']))));
      });
      ruta.appendChild(h('table', null, h('caption', null, 'Hoja de ruta ' + periodo),
        h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'num' }, 'Año'), h('th', { scope: 'col' }, 'Hito principal'),
          h('th', { scope: 'col' }, 'Entregables clave'), h('th', { scope: 'col' }, 'Áreas'), h('th', { scope: 'col' }, 'Estado'))), tb));
    }
  }

  // ---------- Acciones ----------
  function renderAcciones() {
    var list = $('#lista'); if (!list) return;
    function fill(sel, key) {
      var vals = {}; acciones.forEach(function (r) { var v = txt(r[key]); if (v !== PEND) vals[v] = 1; });
      Object.keys(vals).sort().forEach(function (v) { sel.appendChild(h('option', { value: v }, v)); });
    }
    var fArea = $('#fArea'), fEstado = $('#fEstado'), fResp = $('#fResp'), fBuscar = $('#fBuscar'), count = $('#fCount');
    fill(fArea, 'Área estratégica'); fill(fEstado, 'Estado'); fill(fResp, 'Responsable');
    function draw() {
      var q = (fBuscar.value || '').toLowerCase();
      list.innerHTML = '';
      var shown = acciones.filter(function (r) {
        return (!fArea.value || txt(r['Área estratégica']) === fArea.value) &&
               (!fEstado.value || txt(r['Estado']) === fEstado.value) &&
               (!fResp.value || txt(r['Responsable']) === fResp.value) &&
               (!q || (txt(r['ID']) + ' ' + txt(r['Acción']) + ' ' + txt(r['KPI vinculado'])).toLowerCase().indexOf(q) >= 0);
      });
      shown.forEach(function (r) {
        list.appendChild(h('article', { class: 'card' },
          h('div', { class: 'id' }, txt(r['ID']) + ' · ' + txt(r['Área estratégica'])),
          h('h3', null, txt(r['Acción'])),
          badgesFor(r),
          h('div', { class: 'meta' }, 'Responsable: ' + txt(r['Responsable'])),
          h('div', { class: 'meta' }, 'KPI: ' + txt(r['KPI vinculado'])),
          h('div', { class: 'meta' }, 'Recursos: ' + txt(r['Recursos necesarios'])),
          h('div', { class: 'src' }, 'Costo ' + periodo + ': ' + usd(costKey ? num(r[costKey]) : null))));
      });
      count.textContent = shown.length + ' de ' + acciones.length + ' acciones';
    }
    [fArea, fEstado, fResp].forEach(function (s) { s.addEventListener('change', draw); });
    fBuscar.addEventListener('input', draw);
    draw();
  }

  // ---------- Tablero ----------
  function countBy(list, key) {
    var m = {}, order = [];
    list.forEach(function (r) { var v = txt(r[key]); if (!m[v]) { m[v] = 0; order.push(v); } m[v]++; });
    return { labels: order, data: order.map(function (k) { return m[k]; }) };
  }
  function chart(id, type, labels, data, label) {
    var box = $('#' + id); if (!box) return;
    var canvas = $('canvas', box), ul = $('ul', box);
    labels.forEach(function (l, i) { ul.appendChild(h('li', null, l + ': ' + data[i])); });
    if (!window.Chart) { canvas.parentNode.removeChild(canvas); return; }
    var colors = ['#071a2b', '#7fd4e8', '#9fe3c8', '#f4a8c4', '#ffd27a', '#8aa3b5', '#e8ddc7', '#155e75'];
    new window.Chart(canvas, {
      type: type,
      data: { labels: labels, datasets: [{ label: label, data: data, backgroundColor: type === 'bar' ? '#071a2b' : colors, borderWidth: 0 }] },
      options: { responsive: true, plugins: { legend: { display: type !== 'bar', position: 'bottom' } },
        scales: type === 'bar' ? { y: { beginAtZero: true, ticks: { precision: 0 } } } : {} }
    });
  }
  function renderTablero() {
    var k = $('#kpis');
    if (k) {
      var cols = ['KPI', 'Definición', 'Unidad', 'Línea base (' + (years[0] || '') + ')', 'Meta ' + (years[0] || ''), 'Meta ' + (years[years.length - 1] || ''), 'Valor actual', 'Responsable', 'Frecuencia'];
      var tb = h('tbody');
      rows('kpis').forEach(function (r) {
        tb.appendChild(h('tr', null, cols.map(function (c, i) { return h(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row' } : null, txt(r[c])); })));
      });
      k.appendChild(h('table', null, h('caption', null, 'KPIs del plan'), h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { scope: 'col' }, c); }))), tb));
    }
    var e = countBy(acciones, 'Estado'); chart('chartEstado', 'doughnut', e.labels, e.data, 'Acciones por estado');
    var a = areas(); chart('chartArea', 'bar', a.map(function (x) { return x.num + '. ' + x.title; }), a.map(function (x) { return x.rows.length; }), 'Acciones por área');
    chart('chartAnio', 'bar', years, years.map(function (y) { return num(resumen['total_' + y]) || 0; }), 'Presupuesto total por año (USD)');
  }

  // ---------- Presupuesto ----------
  function moneyTd(v) { return h('td', { class: 'num' }, usd(num(v))); }
  function renderPresupuesto() {
    var anio = $('#porAnio');
    if (anio) {
      var tb = h('tbody');
      years.forEach(function (y) {
        tb.appendChild(h('tr', null, h('th', { scope: 'row', class: 'num' }, y), moneyTd(resumen['subtotal_' + y]), moneyTd(resumen['contingencia_' + y]), moneyTd(resumen['total_' + y])));
      });
      tb.appendChild(h('tr', { class: 'total' }, h('td', null, 'Total ' + periodo), moneyTd(resumen.subtotal_total), moneyTd(resumen.contingencia_total), moneyTd(resumen.total_plan)));
      anio.appendChild(h('table', null, h('caption', null, 'Presupuesto por año (USD)'),
        h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'num' }, 'Año'), h('th', { scope: 'col', class: 'num' }, 'Subtotal'),
          h('th', { scope: 'col', class: 'num' }, 'Contingencia (' + stats.contingencia_pct + ')'), h('th', { scope: 'col', class: 'num' }, 'Total'))), tb));
    }
    var cat = $('#porCategoria');
    if (cat) {
      var tb2 = h('tbody');
      rows('presupuesto_categorias').forEach(function (r) {
        tb2.appendChild(h('tr', null, h('th', { scope: 'row' }, txt(r['Categoría'])), h('td', null, txt(r['Acciones (IDs)'])),
          years.map(function (y) { return moneyTd(r[y]); }), moneyTd(r['Total (USD)'])));
      });
      cat.appendChild(h('table', null, h('caption', null, 'Presupuesto por categoría (USD, sin contingencia)'),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Categoría'), h('th', { scope: 'col' }, 'Acciones'),
          years.map(function (y) { return h('th', { scope: 'col', class: 'num' }, y); }), h('th', { scope: 'col', class: 'num' }, 'Total'))), tb2));
    }
    var fin = $('#financiamiento');
    if (fin) {
      var tb3 = h('tbody'), list = rows('financiamiento');
      list.forEach(function (r, i) {
        tb3.appendChild(h('tr', { class: i === list.length - 1 ? 'total' : '' }, h('th', { scope: 'row' }, txt(r['Categoría'])), h('td', null, txt(r['Qué financia / justificación'])), moneyTd(r['Total (USD)'])));
      });
      fin.appendChild(h('table', null, h('caption', null, 'Financiamiento previsto (fuentes a confirmar; reduce el aporte de FASA)'),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Fuente'), h('th', { scope: 'col' }, 'Destino / detalle'), h('th', { scope: 'col', class: 'num' }, 'Monto (USD)'))), tb3));
    }
    var det = $('#detalle');
    if (det) {
      var tb4 = h('tbody');
      rows('presupuesto').forEach(function (r) {
        tb4.appendChild(h('tr', null, h('th', { scope: 'row' }, txt(r['ID'])), h('td', null, txt(r['Acción (desde Plan de Acción)'])), h('td', null, txt(r['Categoría presupuestaria'])),
          years.map(function (y) { return moneyTd(r[y]); }), moneyTd(r['Total (USD)'])));
      });
      det.appendChild(h('table', null, h('caption', null, 'Detalle por acción (USD)'),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'ID'), h('th', { scope: 'col' }, 'Acción'), h('th', { scope: 'col' }, 'Categoría'),
          years.map(function (y) { return h('th', { scope: 'col', class: 'num' }, y); }), h('th', { scope: 'col', class: 'num' }, 'Total'))), tb4));
    }
  }

  // ---------- arranque ----------
  $$('.nav a').forEach(function (a) {
    var here = location.pathname.split('/').pop() || 'index.html';
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });
  if (!D) noData();
  fillStats();
  if (page === 'home') renderHome();
  if (page === 'plan') renderPlan();
  if (page === 'acciones') renderAcciones();
  if (page === 'tablero') renderTablero();
  if (page === 'presupuesto') renderPresupuesto();
})();
