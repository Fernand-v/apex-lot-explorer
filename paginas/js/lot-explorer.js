/* Explorador de lotes (pagina 59, publica) — MapLibre GL.
   Vistas: satelite, plano tecnico (cotas) y 3D (lotes en volumen + casa ilustrativa).
   Datos: LOT000.AJAX_PUBLICO -> INFO. Poligonos: MAP_AREA (Croquis y areas).
   Links: ?lote=<id> (el servidor arma la vista previa de WhatsApp; #lote= sigue andando)   #comparar=<id>,<id>,<id>
   (lot-publico.js es la version anterior con Leaflet, solo 2D) */
(function () {
  'use strict';
  var root = document.getElementById('lot');
  document.body.classList.add('lt-body');
  if (root.closest('form')) { document.body.appendChild(root); document.body.classList.add('lot-fuera'); }

  var D = null, MAPA = null, VISTA = 'sat', SEL = null, HOVER = null, CASA = null, ORBITA = null;
  var F = { estado: 'DISPONIBLE', precioMax: null, m2Min: null, esquina: false, plaza: false, manzana: '', favs: false };
  var EST = { DISPONIBLE: 'Disponible', RESERVADO: 'Reservado', VENDIDO: 'Vendido' };
  var COLOR = { DISPONIBLE: '#2bd27a', RESERVADO: '#ffb020', VENDIDO: '#c3c9cf' };
  var CMP = [], FAV = leerFavs(), MARCAS = [];
  // medidas pensadas para el lote tipico de 10 m de frente (7 m utiles con 1,5 m de retiro a cada lado)
  var MODELOS = [
    { id: 'm1', nombre: 'Casa 1 dormitorio', ancho: 6, fondo: 8, plantas: 1, m2: 48 },
    { id: 'm2', nombre: 'Casa 2 dormitorios', ancho: 7, fondo: 11, plantas: 1, m2: 77 },
    { id: 'm3', nombre: 'Dúplex 2 plantas', ancho: 6.5, fondo: 8, plantas: 2, m2: 104 }
  ];
  var POI = {
    ESCUELA: { n: 'Escuelas', c: '#3b6fd8', i: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>' },
    SALUD: { n: 'Salud', c: '#d8433b', i: '<path d="M12 5v14M5 12h14"/>' },
    SUPER: { n: 'Supermercados', c: '#e08a1e', i: '<path d="M3 4h2l2.5 11h11L21 7H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>' },
    COMBUSTIBLE: { n: 'Combustible', c: '#6b5bd2', i: '<path d="M4 20V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15M3 20h12M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>' },
    BANCO: { n: 'Bancos', c: '#178a6b', i: '<path d="M3 10l9-5 9 5M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>' },
    RUTA: { n: 'Rutas', c: '#57606a', i: '<path d="M8 3 5 21M16 3l3 18M12 5v2M12 11v2M12 17v2"/>' },
    OTRO: { n: 'Otros', c: '#8a6d3b', i: '<circle cx="12" cy="12" r="4"/>' }
  };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function gs(n) { return n == null ? '' : 'Gs. ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function gsCorto(n) { return n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace('.', ',') + ' M' : gs(n); }
  function m2(n) { return Math.round(n).toLocaleString('es-PY') + ' m²'; }
  function num(n, d) { return (+n).toFixed(d == null ? 1 : d).replace('.', ',').replace(/,0$/, ''); }
  function dist(m) { return m < 1000 ? Math.round(m / 10) * 10 + ' m' : num(m / 1000) + ' km'; }
  function minutos(m) { return Math.max(1, Math.round(m * 1.35 / 1000 / 30 * 60)) + ' min en auto'; } // 30 km/h y 35% extra por el trazado
  var SVG = function (p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var IC = {
    back: SVG('<path d="m15 18-6-6 6-6"/>'), pin: SVG('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
    share: SVG('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
    ruler: SVG('<path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/><path d="m7.5 10.5 2-2M10.5 13.5l2-2M13.5 16.5l2-2"/>'),
    corner: SVG('<path d="M4 20V8a4 4 0 0 1 4-4h12"/>'), x: SVG('<path d="M18 6 6 18M6 6l12 12"/>'),
    heart: SVG('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
    compass: SVG('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
    sun: SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    home: SVG('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
    cmp: SVG('<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>'),
    orbit: SVG('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>'),
    wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-1 1.2-.4.2-.6.1a8.2 8.2 0 0 1-2.4-1.5 9 9 0 0 1-1.7-2.1c-.2-.3 0-.5.1-.6l.4-.5.3-.5a.6.6 0 0 0 0-.5L9 6.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c.6.3 1.1.4 1.5.6a3.6 3.6 0 0 0 1.6.1 2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3zM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zm0-21.6A11.8 11.8 0 0 0 1.8 17.9L.2 23.8l6-1.6A11.8 11.8 0 1 0 12 .2z"/></svg>'
  };

  /* ================================================================ geometria local (metros) */
  var G0 = null, MLAT = 111320, MLON = 111320;
  function anillo(geo) { var g = geo.geometry || geo; var c = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]; return c.slice(0, c.length - 1); }
  function aL(p) { return [(p[0] - G0[0]) * MLON, (p[1] - G0[1]) * MLAT]; }
  function aG(p) { return [G0[0] + p[0] / MLON, G0[1] + p[1] / MLAT]; }
  function centro(pts) { var x = 0, y = 0; pts.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / pts.length, y / pts.length]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k]; }
  function largo(a) { return Math.hypot(a[0], a[1]); }
  function unit(a) { var l = largo(a) || 1; return [a[0] / l, a[1] / l]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function dentro(p, poly) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (((poly[i][1] > p[1]) !== (poly[j][1] > p[1])) && (p[0] < (poly[j][0] - poly[i][0]) * (p[1] - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0])) c = !c;
    }
    return c;
  }
  function distSeg(p, a, b) { var ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1))); return largo(sub(p, add(a, mul(ab, t)))); }
  function distPoly(p, poly) { if (dentro(p, poly)) return 0; var m = 1e9; for (var i = 0; i < poly.length; i++) m = Math.min(m, distSeg(p, poly[i], poly[(i + 1) % poly.length])); return m; }
  var RUMBOS = ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste'];
  function rumbo(v) { var b = (Math.atan2(v[0], v[1]) * 180 / Math.PI + 360) % 360; return { grados: b, nombre: RUMBOS[Math.round(b / 45) % 8] }; }

  // Para cada lote: frente (lado que da a la calle), orientacion, medidas, vecinos y si da a la plaza.
  function analizar() {
    var todos = [];
    D.lotes.forEach(function (l) { anillo(l.geo).forEach(function (p) { todos.push(p); }); });
    G0 = centro(todos.length ? todos : [[-57.5, -25.3]]);
    MLON = 111320 * Math.cos(G0[1] * Math.PI / 180);
    var calles = [], plazas = [];
    D.entorno.forEach(function (a) {
      var cat = (a.categoria || '').toLowerCase(); if (!a.geo) return;
      if (/calle|aven/.test(cat)) calles.push(anillo(a.geo).map(aL));
      if (/plaza|verde/.test(cat)) plazas.push(anillo(a.geo).map(aL));
    });
    D.lotes.forEach(function (l) {
      var P = anillo(l.geo).map(aL), c = centro(P), lados = [];
      for (var i = 0; i < P.length; i++) {
        var a = P[i], b = P[(i + 1) % P.length], mid = mul(add(a, b), .5), t = unit(sub(b, a)), n = [t[1], -t[0]];
        if (dot(n, sub(mid, c)) < 0) n = mul(n, -1);                     // normal hacia afuera
        var afuera = add(mid, mul(n, 4));
        lados.push({ a: a, b: b, largo: largo(sub(b, a)), normal: n,
          calle: calles.some(function (q) { return dentro(afuera, q); }),
          plaza: plazas.some(function (q) { return distPoly(afuera, q) < 9; }) });
      }
      var aCalle = lados.filter(function (s) { return s.calle; });
      var fr = (aCalle.length ? aCalle : lados).slice().sort(function (x, y) { return x.largo - y.largo; })[0];
      // el frente siempre se recorre de izquierda a derecha mirando desde la calle
      l._P = P; l._c = c; l._lados = lados; l._frente = fr;
      l._rumbo = rumbo(fr.normal);
      l._plaza = lados.some(function (s) { return s.plaza; });
      l._prof = Math.max.apply(null, P.map(function (p) { return dot(sub(p, fr.a), mul(fr.normal, -1)); }));
      l._ancho = fr.largo;
    });
    // vecinos: lotes que comparten un lado (dos vertices a menos de 0,8 m)
    D.lotes.forEach(function (l) {
      l._vec = D.lotes.filter(function (o) {
        if (o === l || largo(sub(o._c, l._c)) > 60) return false;
        var n = 0; l._P.forEach(function (p) { if (o._P.some(function (q) { return largo(sub(p, q)) < .8; })) n++; });
        return n >= 2;
      }).map(function (o) { return o.id; });
    });
  }

  /* ================================================================ precios */
  function planes() { return (D.planes || []).slice().sort(function (a, b) { return a.cuotas - b.cuotas; }); }
  function totalPlan(l, p) {
    var esp = l.especiales && l.especiales[String(p.cuotas)];
    return esp ? { total: esp, especial: true } : { total: Math.round(l.precio * (1 + p.recargo / 100) / 1000) * 1000, especial: false };
  }
  function cuotaDe(total, entrega, cuotas) { return cuotas ? Math.ceil((total - entrega) / cuotas / 1000) * 1000 : 0; }
  function cuotaDesde(l) {
    if (!l.precio || l.estado === 'VENDIDO') return null;
    var mejor = null;
    planes().forEach(function (p) {
      if (!p.cuotas) return;
      var t = totalPlan(l, p).total, c = cuotaDe(t, Math.round(t * p.entrega / 100 / 1000) * 1000, p.cuotas);
      if (mejor == null || c < mejor.cuota) mejor = { cuota: c, cuotas: p.cuotas };
    });
    return mejor;
  }
  function lote(id) { return D.lotes.filter(function (l) { return l.id === id; })[0]; }

  /* ================================================================ favoritos (por navegador) */
  function leerFavs() { try { return JSON.parse(localStorage.getItem('lt-favs') || '[]'); } catch (e) { return []; } }
  function guardarFavs() { try { localStorage.setItem('lt-favs', JSON.stringify(FAV)); } catch (e) { /* modo privado */ } }
  function esFav(id) { return FAV.indexOf(id) >= 0; }
  function toggleFav(id) { if (esFav(id)) FAV.splice(FAV.indexOf(id), 1); else FAV.push(id); guardarFavs(); }

  /* ================================================================ arranque */
  apex.server.process('AJAX', { x01: 'INFO' }, {
    dataType: 'json',
    success: function (r) {
      if (!r || !r.ok) return fallo((r && r.msg) || 'No se pudo cargar el loteamiento.');
      D = r; D.lotes = D.lotes || []; D.entorno = D.entorno || []; D.loteo = D.loteo || {}; D.pois = D.pois || [];
      D.loteo.retiros = D.loteo.retiros || { frente: 3, lateral: 1.5, fondo: 3 };
      FAV = FAV.filter(function (id) { return lote(id); });
      analizar();
      document.title = (D.loteo.nombre || 'Loteamiento') + ' · Lotes en venta';
      layout();
      cargarMapLibre(mapa);
    },
    error: function () { fallo('Sin conexión. Revisá tu internet e intentá de nuevo.'); }
  });
  function fallo(m) { root.innerHTML = '<div class="lt-fallo"><h1>No pudimos mostrar el plano</h1><p>' + esc(m) + '</p></div>'; }

  // APEX trae RequireJS: MapLibre (UMD) se registraria como modulo AMD y no como window.maplibregl
  function cargarMapLibre(cb) {
    if (window.maplibregl) return cb();
    var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'; document.head.appendChild(css);
    var amd = typeof window.define === 'function' && window.define.amd;
    if (amd) window.define.amd = false;
    var js = document.createElement('script'); js.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
    js.onload = function () { if (amd) window.define.amd = amd; cb(); };
    js.onerror = function () { if (amd) window.define.amd = amd; fallo('No se pudo cargar el visor de mapas.'); };
    document.head.appendChild(js);
  }

  /* ================================================================ layout */
  function layout() {
    var L_ = D.loteo, ls = D.lotes, disp = ls.filter(function (l) { return l.estado === 'DISPONIBLE'; });
    var desde = disp.reduce(function (a, l) { return l.precio && (a == null || l.precio < a) ? l.precio : a; }, null);
    var cuotaMin = disp.map(cuotaDesde).filter(Boolean).reduce(function (a, c) { return a == null || c.cuota < a.cuota ? c : a; }, null);
    var mzs = Array.from(new Set(ls.map(function (l) { return l.manzana; }))).sort();
    root.innerHTML = '<div class="lt">'
      + '<div class="lt-map"><div id="ltMapa"></div>'
      + '<div class="lt-vistas" role="group" aria-label="Vista del mapa">'
      + '<button type="button" data-v="sat" class="is-on">Satélite</button><button type="button" data-v="tec">Plano técnico</button><button type="button" data-v="3d">3D</button></div>'
      + '<button type="button" class="lt-orbita" id="ltOrbita" hidden>' + IC.orbit + '<span>Recorrer</span></button>'
      + '<div class="lt-ley" id="ltLey"></div><div class="lt-casa-info" id="ltCasaInfo" hidden></div></div>'
      + '<aside class="lt-panel" id="ltPanel">'
      + '<div class="lt-vista" id="ltLista">'
      + '<header class="lt-head"><div class="lt-kick">' + IC.pin + esc(L_.ubicacion || 'Loteamiento') + '</div><h1>' + esc(L_.nombre) + '</h1>'
      + (L_.lema ? '<p class="lt-lema">' + esc(L_.lema) + '</p>' : '') + '</header>'
      + '<div class="lt-stats"><div><b>' + disp.length + '</b><span>lotes disponibles</span></div>'
      + (desde ? '<div><b>' + gsCorto(desde) + '</b><span>desde, contado</span></div>' : '')
      + (cuotaMin ? '<div><b>' + gsCorto(cuotaMin.cuota) + '</b><span>cuota desde (' + cuotaMin.cuotas + ' meses)</span></div>' : '') + '</div>'
      + '<div class="lt-ptabs" role="tablist"><button type="button" data-t="lotes" class="is-on">Lotes</button><button type="button" data-t="cmp">Comparar <em id="ltNcmp" hidden></em></button>'
      + '<button type="button" data-t="ent">Entorno</button></div>'
      + '<div id="ltTabLotes">'
      + (L_.descripcion ? '<p class="lt-desc">' + esc(L_.descripcion) + '</p>' : '')
      + '<div class="lt-filtros"><div class="lt-seg" id="ltEst"><button type="button" data-e="DISPONIBLE" class="is-on">Disponibles</button><button type="button" data-e="">Todos</button></div>'
      + '<div class="lt-row"><label><span>Precio máximo</span><select id="ltPre"><option value="">Cualquiera</option>' + precioOpts(ls) + '</select></label>'
      + '<label><span>Superficie mínima</span><select id="ltM2"><option value="">Cualquiera</option>' + m2Opts(ls) + '</select></label></div>'
      + '<div class="lt-row"><label><span>Manzana</span><select id="ltMz"><option value="">Todas</option>' + mzs.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select></label></div>'
      + '<div class="lt-chips"><label class="lt-chk"><input type="checkbox" id="ltEsq"><i></i><span>Esquina</span></label>'
      + '<label class="lt-chk"><input type="checkbox" id="ltPla"><i></i><span>Frente a plaza</span></label>'
      + '<label class="lt-chk"><input type="checkbox" id="ltFav"><i></i><span>Mis favoritos</span></label></div></div>'
      + '<div class="lt-cuenta" id="ltCuenta"></div><div class="lt-lista" id="ltItems"></div></div>'
      + '<div id="ltTabCmp" hidden></div><div id="ltTabEnt" hidden></div>'
      + '<footer class="lt-foot">Plano ilustrativo. Medidas y precios sujetos a confirmación.</footer></div>'
      + '<div class="lt-vista" id="ltFicha" hidden></div></aside></div>';

    var $ = function (s) { return root.querySelector(s); };
    $('#ltEst').addEventListener('click', function (e) {
      var b = e.target.closest('[data-e]'); if (!b) return;
      F.estado = b.dataset.e; this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x === b); }); filtrar();
    });
    $('#ltPre').addEventListener('change', function () { F.precioMax = this.value ? +this.value : null; filtrar(); });
    $('#ltM2').addEventListener('change', function () { F.m2Min = this.value ? +this.value : null; filtrar(); });
    $('#ltMz').addEventListener('change', function () { F.manzana = this.value; filtrar(); if (this.value) encuadrar(visibles()); });
    $('#ltEsq').addEventListener('change', function () { F.esquina = this.checked; filtrar(); });
    $('#ltPla').addEventListener('change', function () { F.plaza = this.checked; filtrar(); });
    $('#ltFav').addEventListener('change', function () { F.favs = this.checked; filtrar(); });
    $('.lt-ptabs').addEventListener('click', function (e) { var b = e.target.closest('[data-t]'); if (b) tab(b.dataset.t); });
    $('#ltItems').addEventListener('click', function (e) {
      var h = e.target.closest('[data-fav]'); if (h) { e.stopPropagation(); toggleFav(+h.dataset.fav); filtrar(); return; }
      var c = e.target.closest('[data-id]'); if (c) abrir(+c.dataset.id, true);
    });
    $('#ltItems').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var c = e.target.closest('[data-id]'); if (c) abrir(+c.dataset.id, true); } });
    $('#ltItems').addEventListener('mouseover', function (e) { var c = e.target.closest('[data-id]'); hover(c ? +c.dataset.id : null); });
    $('#ltItems').addEventListener('mouseleave', function () { hover(null); });
    $('.lt-vistas').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (b && MAPA) vista(b.dataset.v); });
    $('#ltOrbita').addEventListener('click', orbitar);
  }
  function precioOpts(ls) {
    var ps = ls.filter(function (l) { return l.precio; }).map(function (l) { return l.precio; });
    if (!ps.length) return '';
    var min = Math.min.apply(null, ps), max = Math.max.apply(null, ps), paso = 5e6, out = '';
    for (var v = Math.ceil(min / paso) * paso; v <= max + paso; v += paso) out += '<option value="' + v + '">Hasta ' + gsCorto(v) + '</option>';
    return out;
  }
  function m2Opts(ls) {
    var min = Math.min.apply(null, ls.map(function (l) { return l.m2 || 0; })), max = Math.max.apply(null, ls.map(function (l) { return l.m2 || 0; }).concat([0])), out = '';
    [250, 300, 360, 400, 450, 500, 600, 800, 1000].forEach(function (v) { if (v <= max && v > min - 1) out += '<option value="' + v + '">' + v + ' m² o más</option>'; });
    return out;
  }

  /* ================================================================ mapa */
  var ALTO_3D = ['case', ['boolean', ['feature-state', 'sel'], false], .2, ['!', ['boolean', ['feature-state', 'vis'], true]], .15, ['get', 'alto']];
  function fc(feats) { return { type: 'FeatureCollection', features: feats }; }
  function featLotes() {
    return fc(D.lotes.map(function (l) {
      var r = anillo(l.geo);
      return { type: 'Feature', id: l.id, properties: { id: l.id, estado: l.estado, color: COLOR[l.estado],
        alto: l.estado === 'DISPONIBLE' ? 1.6 : l.estado === 'RESERVADO' ? .9 : .2 }, geometry: { type: 'Polygon', coordinates: [r.concat([r[0]])] } };
    }));
  }
  function featEntorno() {
    return fc(D.entorno.filter(function (a) { return a.geo; }).map(function (a) {
      var cat = (a.categoria || '').toLowerCase();
      var tipo = /perim/.test(cat) ? 'perimetro' : /calle|aven/.test(cat) ? 'calle' : /plaza|verde/.test(cat) ? 'verde' : 'otro';
      return { type: 'Feature', properties: { nombre: a.nombre || '', tipo: tipo, color: a.color || '#ffffff' }, geometry: (a.geo.geometry || a.geo) };
    }));
  }
  function featEtiquetas() {
    var porMz = {}, feats = [];
    D.lotes.forEach(function (l) { (porMz[l.manzana] = porMz[l.manzana] || []).push(l._c); });
    Object.keys(porMz).forEach(function (m) { feats.push({ type: 'Feature', properties: { t: 'Mz ' + m, k: 'mz' }, geometry: { type: 'Point', coordinates: aG(centro(porMz[m])) } }); });
    D.entorno.forEach(function (a) {
      if (a.geo && /plaza|verde/i.test(a.categoria || '')) feats.push({ type: 'Feature', properties: { t: a.nombre, k: 'plaza' }, geometry: { type: 'Point', coordinates: aG(centro(anillo(a.geo).map(aL))) } });
    });
    D.lotes.forEach(function (l) { feats.push({ type: 'Feature', properties: { t: l.numero, k: 'num' }, geometry: { type: 'Point', coordinates: aG(l._c) } }); });
    return fc(feats);
  }
  // cotas del plano tecnico: un segmento por lado (corrido hacia adentro) con su largo, y la superficie
  function featCotas() {
    var feats = [];
    D.lotes.forEach(function (l) {
      l._lados.forEach(function (s) {
        var ins = mul(s.normal, -.9);
        feats.push({ type: 'Feature', properties: { t: num(s.largo) + ' m' }, geometry: { type: 'LineString', coordinates: [aG(add(s.a, ins)), aG(add(s.b, ins))] } });
      });
      feats.push({ type: 'Feature', properties: { t: m2(l.m2) }, geometry: { type: 'Point', coordinates: aG(add(l._c, mul(l._frente.normal, -3.4))) } });
    });
    return fc(feats);
  }

  function mapa() {
    var lotesFC = featLotes(), b = new maplibregl.LngLatBounds();
    lotesFC.features.forEach(function (f) { f.geometry.coordinates[0].forEach(function (p) { b.extend(p); }); });
    var hay = lotesFC.features.length;
    MAPA = new maplibregl.Map({
      container: 'ltMapa', attributionControl: false, maxPitch: 75, maxZoom: 21,
      bounds: hay ? b : undefined, center: hay ? undefined : [-57.5, -25.3], zoom: 14, fitBoundsOptions: { padding: 40 },
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sky: { 'sky-color': '#bcd6ea', 'horizon-color': '#f1ece2', 'fog-color': '#f1ece2', 'sky-horizon-blend': .6, 'horizon-fog-blend': .7, 'fog-ground-blend': .85 },
        sources: {
          // la imagen satelital no tiene zoom 18 en toda la zona: maxzoom 17 y se estira
          sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 17, attribution: 'Imágenes © Esri, Maxar' },
          lotes: { type: 'geojson', data: lotesFC },
          entorno: { type: 'geojson', data: featEntorno() },
          etiquetas: { type: 'geojson', data: featEtiquetas() },
          cotas: { type: 'geojson', data: featCotas() },
          casa: { type: 'geojson', data: fc([]) }
        },
        layers: [
          { id: 'fondo', type: 'background', paint: { 'background-color': '#efeadf' } },
          { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': -.1 } },
          { id: 'calles', type: 'fill', source: 'entorno', filter: ['==', ['get', 'tipo'], 'calle'], paint: { 'fill-color': '#e2dccd', 'fill-opacity': .55 } },
          { id: 'verdes', type: 'fill', source: 'entorno', filter: ['==', ['get', 'tipo'], 'verde'], paint: { 'fill-color': '#3f9e5a', 'fill-opacity': .6 } },
          { id: 'otros', type: 'fill', source: 'entorno', filter: ['==', ['get', 'tipo'], 'otro'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': .3 } },
          { id: 'lotes', type: 'fill', source: 'lotes', paint: {
            'fill-color': ['case', ['boolean', ['feature-state', 'cmp'], false], '#4f7cff', ['get', 'color']],
            'fill-opacity': ['case', ['!', ['boolean', ['feature-state', 'vis'], true]], .14,
              ['any', ['boolean', ['feature-state', 'sel'], false], ['boolean', ['feature-state', 'hover'], false]], .92,
              ['==', ['get', 'estado'], 'DISPONIBLE'], .62, .8] } },
          { id: 'lotes-borde', type: 'line', source: 'lotes', paint: {
            'line-color': ['case', ['boolean', ['feature-state', 'sel'], false], '#ffffff', 'rgba(255,255,255,.8)'],
            'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 4, ['boolean', ['feature-state', 'hover'], false], 2.6, 1.1] } },
          { id: 'lotes-3d', type: 'fill-extrusion', source: 'lotes', layout: { visibility: 'none' }, paint: {
            'fill-extrusion-color': ['case', ['boolean', ['feature-state', 'sel'], false], '#ffffff', ['boolean', ['feature-state', 'cmp'], false], '#4f7cff', ['get', 'color']],
            'fill-extrusion-height': ALTO_3D,
            'fill-extrusion-opacity': .88 } },
          { id: 'perimetro', type: 'line', source: 'entorno', filter: ['==', ['get', 'tipo'], 'perimetro'], paint: { 'line-color': '#f5a524', 'line-width': 2.5, 'line-dasharray': [3, 2] } },
          { id: 'casa-patio', type: 'fill', source: 'casa', filter: ['==', ['get', 'k'], 'patio'], paint: { 'fill-color': '#6fcf7c', 'fill-opacity': .85 } },
          { id: 'casa-cochera', type: 'fill', source: 'casa', filter: ['==', ['get', 'k'], 'cochera'], paint: { 'fill-color': '#b9b3a6', 'fill-opacity': .95 } },
          { id: 'casa-retiro', type: 'line', source: 'casa', filter: ['==', ['get', 'k'], 'retiro'], paint: { 'line-color': '#ffffff', 'line-width': 1.6, 'line-dasharray': [2, 2] } },
          { id: 'casa-3d', type: 'fill-extrusion', source: 'casa', filter: ['==', ['get', 'k'], 'casa'], paint: { 'fill-extrusion-color': '#f4efe6', 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 1 } },
          { id: 'casa-techo', type: 'fill-extrusion', source: 'casa', filter: ['==', ['get', 'k'], 'techo'], paint: { 'fill-extrusion-color': '#9a4a32', 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 1 } },
          { id: 'cotas', type: 'symbol', source: 'cotas', minzoom: 18.2, layout: { visibility: 'none', 'symbol-placement': 'line-center', 'text-field': ['get', 't'],
            'text-font': ['Open Sans Semibold'], 'text-size': 10.5, 'text-keep-upright': true }, filter: ['==', ['geometry-type'], 'LineString'],
            paint: { 'text-color': '#2b3a33', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 } },
          { id: 'cotas-m2', type: 'symbol', source: 'cotas', minzoom: 18.2, layout: { visibility: 'none', 'text-field': ['get', 't'], 'text-font': ['Open Sans Semibold'], 'text-size': 10 },
            filter: ['==', ['geometry-type'], 'Point'], paint: { 'text-color': '#6f7a73', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 } },
          // dos capas: MapLibre no admite allow-overlap por elemento ni zoom anidado dentro de un case
          { id: 'numeros', type: 'symbol', source: 'etiquetas', filter: ['==', ['get', 'k'], 'num'], minzoom: 17.2,
            layout: { 'text-field': ['get', 't'], 'text-font': ['Open Sans Semibold'], 'text-size': 11, 'text-allow-overlap': true, 'text-ignore-placement': true },
            paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,.6)', 'text-halo-width': 1.4, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 17.2, 0, 17.6, 1] } },
          { id: 'etiquetas', type: 'symbol', source: 'etiquetas', filter: ['!=', ['get', 'k'], 'num'],
            layout: { 'text-field': ['get', 't'], 'text-font': ['Open Sans Semibold'], 'text-size': ['match', ['get', 'k'], 'plaza', 14, 16] },
            paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,.6)', 'text-halo-width': 1.4 } }
        ]
      }
    });
    window.__ltMapa = MAPA;   // para diagnostico y tests E2E
    MAPA.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    MAPA.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    MAPA.on('load', function () {
      // ids para feature-state (geojson sin promoteId: los features ya traen id numerico)
      filtrar(); leyenda(); poiMarcas();
      ['lotes', 'lotes-3d'].forEach(function (ly) {
        MAPA.on('click', ly, function (e) { if (e.features[0]) abrir(e.features[0].id, false); });
        MAPA.on('mousemove', ly, function (e) { MAPA.getCanvas().style.cursor = 'pointer'; if (e.features[0]) hover(e.features[0].id); });
        MAPA.on('mouseleave', ly, function () { MAPA.getCanvas().style.cursor = ''; hover(null); });
      });
      MAPA.on('dragstart', parar);
      rutaHash();
      root.classList.add('is-listo');
    });
  }
  function estado(id, k, v) { if (MAPA && MAPA.isStyleLoaded() !== undefined && MAPA.getSource('lotes')) { var o = {}; o[k] = v; MAPA.setFeatureState({ source: 'lotes', id: id }, o); } }
  function hover(id) {
    if (HOVER != null) estado(HOVER, 'hover', false);
    HOVER = id; if (id != null) estado(id, 'hover', true);
    root.querySelectorAll('.lt-card').forEach(function (c) { c.classList.toggle('is-hover', +c.dataset.id === id); });
  }
  function leyenda() {
    var n = { DISPONIBLE: 0, RESERVADO: 0, VENDIDO: 0 };
    D.lotes.forEach(function (l) { n[l.estado]++; });
    document.getElementById('ltLey').innerHTML = Object.keys(n).filter(function (k) { return n[k]; }).map(function (k) {
      return '<span><i style="background:' + COLOR[k] + '"></i>' + EST[k] + ' <b>' + n[k] + '</b></span>'; }).join('')
      + (CMP.length ? '<span><i style="background:#4f7cff"></i>Comparando <b>' + CMP.length + '</b></span>' : '');
  }
  function encuadrar(ls, extra) {
    if (!ls.length || !MAPA) return;
    var b = new maplibregl.LngLatBounds();
    ls.forEach(function (l) { anillo(l.geo).forEach(function (p) { b.extend(p); }); });
    // fitBounds con el mapa inclinado y relieve calcula mal la camara (queda mirando al horizonte):
    // se calcula el encuadre en planta y se mantiene la inclinacion/rotacion actuales
    var o = Object.assign({ padding: 60, duration: 800, maxZoom: 19 }, extra || {});
    var cam = MAPA.cameraForBounds(b, { padding: o.padding, bearing: MAPA.getBearing() });
    if (!cam) return;
    var z = Math.min(cam.zoom, o.maxZoom) - (MAPA.getPitch() > 10 ? .35 : 0);
    MAPA.easeTo({ center: cam.center, zoom: z, bearing: MAPA.getBearing(), pitch: MAPA.getPitch(), duration: o.duration });
  }

  /* ---------------- vistas */
  function vista(v) {
    VISTA = v; parar();
    root.querySelectorAll('.lt-vistas button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.v === v); });
    var vis = function (id, on) { MAPA.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    vis('sat', v !== 'tec'); vis('cotas', v === 'tec'); vis('cotas-m2', v === 'tec');
    vis('lotes-3d', v === '3d'); vis('lotes', v !== '3d');
    MAPA.setPaintProperty('calles', 'fill-color', v === 'tec' ? '#ffffff' : '#e2dccd');
    MAPA.setPaintProperty('calles', 'fill-opacity', v === 'tec' ? 1 : .55);
    ['etiquetas', 'numeros'].forEach(function (ly) {
      MAPA.setPaintProperty(ly, 'text-color', v === 'tec' ? '#1b2420' : '#ffffff');
      MAPA.setPaintProperty(ly, 'text-halo-color', v === 'tec' ? '#ffffff' : 'rgba(0,0,0,.6)');
    });
    MAPA.setPaintProperty('lotes-borde', 'line-color', v === 'tec'
      ? ['case', ['boolean', ['feature-state', 'sel'], false], '#1b2420', '#5b6a62']
      : ['case', ['boolean', ['feature-state', 'sel'], false], '#ffffff', 'rgba(255,255,255,.8)']);
    root.querySelector('.lt-map').classList.toggle('is-tec', v === 'tec');
    document.getElementById('ltOrbita').hidden = v !== '3d';
    // Sin relieve (raster-dem): a escala de lote la camara quedaba pegada al suelo y la vista se rompia,
    // y la zona es casi plana. Para un loteamiento en zona de cerros, evaluar un DEM de mejor resolucion.
    if (v === '3d') {
      MAPA.easeTo({ pitch: 62, bearing: MAPA.getBearing() || -28, zoom: Math.min(MAPA.getZoom(), 17.6), duration: 1200 });
    } else {
      quitarCasa();
      MAPA.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    }
  }
  function orbitar() {
    if (ORBITA) return parar();
    var b = document.getElementById('ltOrbita'); b.classList.add('is-on'); b.querySelector('span').textContent = 'Detener';
    var paso = function () { if (!ORBITA) return; MAPA.rotateTo(MAPA.getBearing() + 40, { duration: 4000, easing: function (t) { return t; } }); ORBITA = setTimeout(paso, 4000); };
    ORBITA = true; paso();
  }
  function parar() {
    if (!ORBITA) return;
    clearTimeout(ORBITA); ORBITA = null; MAPA.stop();
    var b = document.getElementById('ltOrbita'); b.classList.remove('is-on'); b.querySelector('span').textContent = 'Recorrer';
  }

  /* ================================================================ filtros y lista */
  function pasa(l) {
    if (F.estado && l.estado !== F.estado) return false;
    if (F.precioMax && (!l.precio || l.precio > F.precioMax)) return false;
    if (F.m2Min && l.m2 < F.m2Min) return false;
    if (F.manzana && l.manzana !== F.manzana) return false;
    if (F.esquina && !l.esquina) return false;
    if (F.plaza && !l._plaza) return false;
    if (F.favs && !esFav(l.id)) return false;
    return true;
  }
  function visibles() { return D.lotes.filter(pasa); }
  function filtrar() {
    var vs = visibles();
    D.lotes.forEach(function (l) { estado(l.id, 'vis', pasa(l)); });
    document.getElementById('ltCuenta').textContent = vs.length ? vs.length + ' lote' + (vs.length > 1 ? 's' : '') : 'Ningún lote con esos filtros';
    document.getElementById('ltItems').innerHTML = vs.map(tarjeta).join('');
  }
  function tarjeta(l) {
    var c = cuotaDesde(l);
    return '<div role="button" tabindex="0" class="lt-card lt-card--' + l.estado.toLowerCase() + '" data-id="' + l.id + '"><span class="lt-card__mz"><small>Mz</small>' + esc(l.manzana) + '<small>Lote</small>' + esc(l.numero) + '</span>'
      + '<span class="lt-card__b"><span class="lt-card__t">' + m2(l.m2) + (l.frente ? ' · ' + num(l.frente) + ' × ' + num(l.fondo) + ' m' : '') + (l.esquina ? ' · esquina' : '') + (l._plaza ? ' · plaza' : '') + '</span>'
      + '<span class="lt-card__p">' + (l.estado === 'VENDIDO' ? 'Vendido' : gs(l.precio)) + '</span>'
      + (c ? '<span class="lt-card__c">o ' + c.cuotas + ' cuotas de ' + gs(c.cuota) + '</span>' : '') + '</span>'
      + '<span class="lt-card__r"><button type="button" class="lt-fav' + (esFav(l.id) ? ' is-on' : '') + '" data-fav="' + l.id + '" aria-label="Favorito">' + IC.heart + '</button>'
      + '<span class="lt-est lt-est--' + l.estado.toLowerCase() + '">' + EST[l.estado] + '</span></span></div>';
  }
  function tab(t) {
    root.querySelectorAll('.lt-ptabs button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.t === t); });
    document.getElementById('ltTabLotes').hidden = t !== 'lotes';
    document.getElementById('ltTabCmp').hidden = t !== 'cmp';
    document.getElementById('ltTabEnt').hidden = t !== 'ent';
    if (t === 'cmp') pintarCmp();
    if (t === 'ent') pintarEnt();
  }

  /* ================================================================ ficha */
  // URL de un lote: ?lote=<id> (lo ve el servidor -> Open Graph). Se conserva session= si viene (vendedor).
  function urlDe(id) {
    var q = new URLSearchParams(location.search), out = new URLSearchParams();
    if (q.get('session')) out.set('session', q.get('session'));
    if (id != null) out.set('lote', id);
    var t = out.toString();
    return location.pathname + (t ? '?' + t : '');
  }
  function urlPublica(id) { return location.origin + location.pathname + '?lote=' + id; }
  function rutaHash() {
    var qs = new URLSearchParams(location.search).get('lote');
    var m = /lote=(\d+)/.exec(location.hash) || (qs && /^\d+$/.test(qs) ? [0, qs] : null), c = /comparar=([\d,]+)/.exec(location.hash);
    if (c) { CMP = c[1].split(',').map(Number).filter(lote).slice(0, 3); marcarCmp(); tab('cmp'); encuadrar(CMP.map(lote)); }
    else if (m) abrir(+m[1], true);
  }
  window.addEventListener('hashchange', function () { if (!/lote=|comparar=/.test(location.hash)) cerrar(); else rutaHash(); });

  function abrir(id, volar) {
    var l = lote(id); if (!l) return;
    if (SEL != null) estado(SEL, 'sel', false);
    SEL = id; estado(id, 'sel', true);
    history.replaceState(null, '', urlDe(id));
    quitarCasa();
    if (volar && MAPA) encuadrar([l], { maxZoom: 19.2, padding: 120 });
    var ps = planes(), plan = ps.filter(function (p) { return p.cuotas; }).slice(-1)[0] || ps[0];
    var f = document.getElementById('ltFicha');
    var urlLote = urlPublica(id);
    var wa = D.loteo.whatsapp ? 'https://wa.me/' + D.loteo.whatsapp + '?text=' + encodeURIComponent('Hola! Me interesa el lote ' + l.numero + ' de la manzana ' + l.manzana + ' de ' + D.loteo.nombre + '. ' + urlLote) : null;
    // hemisferio sur: el sol del mediodia viene del norte
    var sol = /^No|^Norte/.test(l._rumbo.nombre) ? 'El frente mira al norte: recibe sol todo el año' : /^Su|^Sur/.test(l._rumbo.nombre) ? 'El fondo mira al norte: patio con sol todo el día' : (l._rumbo.nombre === 'Este' ? 'Sol de mañana en el frente' : 'Sol de tarde en el frente');
    var vecinos = l._vec.map(lote).filter(Boolean).sort(function (a, b) { return (a.manzana + a.numero).localeCompare(b.manzana + b.numero, 'es', { numeric: true }); });
    f.innerHTML = '<button type="button" class="lt-back" data-cerrar>' + IC.back + 'Todos los lotes</button>'
      + '<div class="lt-fic"><div class="lt-fic__top"><div class="lt-kick">' + esc(D.loteo.nombre) + '</div>'
      + '<button type="button" class="lt-fav lt-fav--big' + (esFav(id) ? ' is-on' : '') + '" data-favf aria-label="Favorito">' + IC.heart + '</button></div>'
      + '<h2>Manzana ' + esc(l.manzana) + ' · Lote ' + esc(l.numero) + '</h2>'
      + '<span class="lt-est lt-est--' + l.estado.toLowerCase() + '">' + EST[l.estado] + '</span>'
      + '<div class="lt-feat"><div>' + IC.ruler + '<b>' + m2(l.m2) + '</b><span>superficie</span></div>'
      + '<div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="3" width="14" height="18" rx="1"/></svg><b>' + num(l.frente || l._ancho) + ' × ' + num(l.fondo || l._prof) + ' m</b><span>frente × fondo</span></div>'
      + '<div>' + IC.compass + '<b>Al ' + l._rumbo.nombre.toLowerCase() + '</b><span>orientación del frente</span></div>'
      + (l.esquina ? '<div>' + IC.corner + '<b>Esquina</b><span>doble frente</span></div>' : '')
      + (l._plaza ? '<div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22v-6M7 16h10l-5-12z"/></svg><b>Frente a plaza</b><span>vista abierta</span></div>' : '') + '</div>'
      + '<p class="lt-det">' + IC.sun + '<span>' + sol + (l.detalle ? '. ' + esc(l.detalle) : '') + '.</span></p>'
      + (vecinos.length ? '<div class="lt-vec"><span>Lotes vecinos</span>' + vecinos.map(function (v) {
          return '<button type="button" data-vec="' + v.id + '" class="lt-vec__b lt-vec__b--' + v.estado.toLowerCase() + '" title="' + EST[v.estado] + '">' + esc(v.numero) + '</button>'; }).join('') + '</div>' : '')
      + (l.estado === 'VENDIDO' ? '<div class="lt-vendido">Este lote ya fue vendido. Mirá los disponibles en el plano.</div>'
        : '<div class="lt-precio"><span>Precio contado</span><b>' + gs(l.precio) + '</b></div>'
          + '<section class="lt-sim"><h3>Simulá tu plan</h3><div class="lt-planes" id="ltPlanes">' + ps.map(function (p) {
            return '<button type="button" data-c="' + p.cuotas + '" class="' + (p === plan ? 'is-on' : '') + '">' + (p.cuotas ? p.cuotas + '<small>cuotas</small>' : 'Contado') + '</button>'; }).join('') + '</div>'
          + '<div id="ltSimOut"></div></section>'
          + (l.estado === 'RESERVADO' ? '<p class="lt-nota">Este lote está reservado. Consultá si se libera o elegí uno parecido.</p>' : ''))
      + '<section class="lt-cons"><h3>' + IC.home + '¿Qué puedo construir?</h3><p class="lt-help">Simulación ilustrativa en 3D con retiros de ' + num(D.loteo.retiros.frente) + ' m al frente, '
      + num(D.loteo.retiros.lateral) + ' m a los lados y ' + num(D.loteo.retiros.fondo) + ' m al fondo.</p><div class="lt-modelos">'
      + MODELOS.map(function (m) { return '<button type="button" data-mod="' + m.id + '"><b>' + m.nombre + '</b><small>' + num(m.ancho) + ' × ' + num(m.fondo) + ' m · ' + m.m2 + ' m²</small></button>'; }).join('') + '</div>'
      + '<div id="ltConsOut"></div></section>'
      + '<div class="lt-acts">' + (wa && l.estado !== 'VENDIDO' ? '<a class="lt-btn lt-btn--wa" href="' + wa + '" target="_blank" rel="noopener">' + IC.wa + 'Me interesa este lote</a>' : '')
      + '<div class="lt-acts__row"><button type="button" class="lt-btn" data-cmpf>' + IC.cmp + '<span>' + (CMP.indexOf(id) >= 0 ? 'Quitar de comparar' : 'Comparar') + '</span></button>'
      + '<button type="button" class="lt-btn" data-compartir>' + IC.share + 'Compartir</button></div>'
      + (D.loteo.maps ? '<a class="lt-btn" href="' + esc(D.loteo.maps) + '" target="_blank" rel="noopener">' + IC.pin + 'Cómo llegar</a>' : '') + '</div></div>';
    document.getElementById('ltLista').hidden = true; f.hidden = false;
    root.querySelector('.lt-panel').classList.add('is-ficha');
    root.querySelector('.lt-panel').scrollTop = 0;
    f.onclick = function (e) {
      if (e.target.closest('[data-cerrar]')) { history.replaceState(null, '', urlDe(null)); cerrar(); return; }
      var b = e.target.closest('[data-c]');
      if (b) { plan = ps.filter(function (p) { return p.cuotas === +b.dataset.c; })[0]; f.querySelectorAll('#ltPlanes button').forEach(function (x) { x.classList.toggle('is-on', x === b); }); sim(l, plan); }
      var v = e.target.closest('[data-vec]'); if (v) abrir(+v.dataset.vec, true);
      var md = e.target.closest('[data-mod]');
      if (md) { f.querySelectorAll('[data-mod]').forEach(function (x) { x.classList.toggle('is-on', x === md); }); construir(l, MODELOS.filter(function (m) { return m.id === md.dataset.mod; })[0]); }
      var fv = e.target.closest('[data-favf]'); if (fv) { toggleFav(id); fv.classList.toggle('is-on', esFav(id)); filtrar(); }
      var cp = e.target.closest('[data-cmpf]'); if (cp) { toggleCmp(id); cp.querySelector('span').textContent = CMP.indexOf(id) >= 0 ? 'Quitar de comparar' : 'Comparar'; }
      if (e.target.closest('[data-compartir]')) compartir(urlLote, 'Mz ' + l.manzana + ' · Lote ' + l.numero + ' — ' + D.loteo.nombre);
    };
    if (l.estado !== 'VENDIDO') sim(l, plan);
  }
  function sim(l, p) {
    var out = document.getElementById('ltSimOut');
    var t = totalPlan(l, p), total = t.total;
    if (!p.cuotas) { out.innerHTML = '<div class="lt-res"><div class="lt-res__big"><span>Pagás una sola vez</span><b>' + gs(total) + '</b></div></div>'; return; }
    var min = Math.round(total * p.entrega / 100 / 1000) * 1000, max = Math.max(min, Math.round(total * .6 / 1000) * 1000);
    var paso = Math.max(1000, Math.round((max - min) / 40 / 100000) * 100000 || 100000);
    out.innerHTML = '<label class="lt-entrega"><span>Entrega inicial <b id="ltEnt">' + gs(min) + '</b></span>'
      + '<input type="range" id="ltRng" min="' + min + '" max="' + max + '" step="' + paso + '" value="' + min + '" aria-label="Entrega inicial">'
      + '<span class="lt-entrega__mm"><span>mín. ' + num(p.entrega) + '%</span><span>' + gsCorto(max) + '</span></span></label>'
      + '<div class="lt-res"><div class="lt-res__big"><span>Cuota mensual</span><b id="ltCuota"></b><small id="ltCuotaN"></small></div>'
      + '<dl><div><dt>Precio del plan</dt><dd>' + gs(total) + (t.especial ? ' <em>precio especial</em>' : '') + '</dd></div>'
      + '<div><dt>Entrega</dt><dd id="ltEnt2"></dd></div><div><dt>Saldo en cuotas</dt><dd id="ltSaldo"></dd></div></dl></div>';
    var rng = out.querySelector('#ltRng');
    function calc() {
      var e = +rng.value, c = cuotaDe(total, e, p.cuotas);
      out.querySelector('#ltEnt').textContent = gs(e); out.querySelector('#ltEnt2').textContent = gs(e);
      out.querySelector('#ltSaldo').textContent = gs(total - e); out.querySelector('#ltCuota').textContent = gs(c);
      out.querySelector('#ltCuotaN').textContent = p.cuotas + ' cuotas · ' + (p.cuotas >= 12 ? num(p.cuotas / 12) + ' año' + (p.cuotas > 12 ? 's' : '') : p.cuotas + ' meses');
      rng.style.setProperty('--p', ((e - min) / Math.max(1, max - min) * 100) + '%');
    }
    rng.addEventListener('input', calc); calc();
  }
  function cerrar() {
    if (SEL != null) estado(SEL, 'sel', false);
    SEL = null; quitarCasa();
    document.getElementById('ltFicha').hidden = true;
    document.getElementById('ltLista').hidden = false;
    root.querySelector('.lt-panel').classList.remove('is-ficha');
  }

  /* ================================================================ ¿que puedo construir? */
  // Ejes del lote: u a lo largo del frente, v desde el frente hacia el fondo (metros locales).
  function construir(l, m) {
    var R = D.loteo.retiros, fr = l._frente, u = unit(sub(fr.b, fr.a)), v = mul(fr.normal, -1);
    var W = fr.largo, P = l._prof, anchoUtil = W - 2 * R.lateral, fondoUtil = P - R.frente - R.fondo;
    var info = document.getElementById('ltConsOut'), cartel = document.getElementById('ltCasaInfo');
    if (m.ancho > anchoUtil + .01 || m.fondo > fondoUtil + .01) {
      quitarCasa();
      info.innerHTML = '<div class="lt-nota">No entra con estos retiros: el área construible es de ' + num(anchoUtil) + ' × ' + num(fondoUtil) + ' m. Probá un modelo más chico o un lote más ancho.</div>';
      return;
    }
    var pt = function (x, y) { return aG(add(fr.a, add(mul(u, x), mul(v, y)))); };
    var rect = function (x, y, w, d) { var r = [pt(x, y), pt(x + w, y), pt(x + w, y + d), pt(x, y + d)]; return [r.concat([r[0]])]; };
    var F_ = function (k, coords, extra) { return { type: 'Feature', properties: Object.assign({ k: k }, extra || {}), geometry: { type: 'Polygon', coordinates: coords } }; };
    var cochera = anchoUtil - m.ancho >= 3.3, x0 = cochera ? R.lateral : R.lateral + (anchoUtil - m.ancho) / 2, alto = 3 * m.plantas;
    var feats = [F_('retiro', rect(R.lateral, R.frente, anchoUtil, fondoUtil))];
    var patioY = R.frente + m.fondo, patioD = P - patioY - .3;
    if (patioD > .5) feats.push(F_('patio', rect(.3, patioY, W - .6, patioD)));
    feats.push(cochera ? F_('cochera', rect(x0 + m.ancho + .3, .3, 3, R.frente + 5)) : F_('cochera', rect(x0, .3, Math.min(3, m.ancho), Math.max(.5, R.frente - .3))));
    feats.push(F_('casa', rect(x0, R.frente, m.ancho, m.fondo), { h: alto, b: 0 }));
    feats.push(F_('techo', rect(x0 - .3, R.frente - .3, m.ancho + .6, m.fondo + .6), { h: alto + .45, b: alto }));
    if (m.plantas > 1) feats.push(F_('techo', rect(x0 - .2, R.frente - .5, m.ancho + .4, .7), { h: 3.25, b: 3 }));   // alero de la planta baja
    MAPA.getSource('casa').setData(fc(feats));
    // los lotes en volumen tapan la casa: mientras se muestra, quedan casi planos
    MAPA.setPaintProperty('lotes-3d', 'fill-extrusion-height', .05);
    MAPA.setPaintProperty('lotes-3d', 'fill-extrusion-opacity', .55);
    CASA = l.id;
    var libre = Math.max(0, l.m2 - m.ancho * m.fondo - (cochera ? 15 : 0));
    info.innerHTML = '<div class="lt-cons__ok"><b>Entra ✓</b><span>' + m.nombre + ' de ' + m.m2 + ' m² en ' + m.plantas + ' planta' + (m.plantas > 1 ? 's' : '') + '.</span>'
      + '<span>Estacionamiento ' + (cochera ? 'al costado de la casa' : 'en el retiro del frente') + ' · patio libre aprox. ' + Math.round(libre) + ' m².</span></div>';
    cartel.innerHTML = '<b>' + esc(m.nombre) + '</b> en Mz ' + esc(l.manzana) + ' · Lote ' + esc(l.numero) + '<span>Simulación ilustrativa. No reemplaza la aprobación municipal.</span>';
    cartel.hidden = false;
    if (VISTA !== '3d') vista('3d');
    // camara parada en la calle, mirando el frente del lote
    // en el celular la ficha tapa el mapa: mientras se ve la casa, el panel baja hasta el borde del mapa
    var movil = window.matchMedia('(max-width: 900px)').matches;
    if (movil) root.querySelector('.lt-panel').classList.add('is-casa');
    MAPA.easeTo({ center: aG(add(l._c, mul(fr.normal, 6))), zoom: movil ? 19.3 : 19.7, pitch: 62, bearing: (l._rumbo.grados + 180) % 360,
      duration: 1800 });   // en el celular el mapa ya es solo la mitad de arriba: no hace falta correr el centro
  }
  function quitarCasa() {
    if (CASA == null || !MAPA) return;
    CASA = null; MAPA.getSource('casa').setData(fc([]));
    MAPA.setPaintProperty('lotes-3d', 'fill-extrusion-height', ALTO_3D);
    MAPA.setPaintProperty('lotes-3d', 'fill-extrusion-opacity', .88);
    var c = document.getElementById('ltCasaInfo'); if (c) c.hidden = true;
    var pn = root.querySelector('.lt-panel'); if (pn) pn.classList.remove('is-casa');
  }

  /* ================================================================ comparador */
  function toggleCmp(id) {
    var i = CMP.indexOf(id);
    if (i >= 0) CMP.splice(i, 1);
    else { if (CMP.length >= 3) { aviso('Podés comparar hasta 3 lotes'); return; } CMP.push(id); aviso('Agregado a la comparación (' + CMP.length + ' de 3)'); }
    marcarCmp();
  }
  function marcarCmp() {
    D.lotes.forEach(function (l) { estado(l.id, 'cmp', CMP.indexOf(l.id) >= 0); });
    leyenda();
    var n = document.getElementById('ltNcmp'); n.textContent = CMP.length || ''; n.hidden = !CMP.length;
  }
  function pintarCmp() {
    var cont = document.getElementById('ltTabCmp'), ls = CMP.map(lote).filter(Boolean);
    if (!ls.length) {
      cont.innerHTML = '<div class="lt-vacio"><b>Elegí 2 o 3 lotes para comparar</b>Abrí un lote y tocá “Comparar”. Quedan marcados en azul en el plano.'
        + (FAV.length > 1 ? '<br><br><button type="button" class="lt-btn" data-favcmp>' + IC.heart + 'Comparar mis favoritos</button>' : '') + '</div>';
      cont.onclick = function (e) { if (e.target.closest('[data-favcmp]')) { CMP = FAV.slice(0, 3); marcarCmp(); pintarCmp(); encuadrar(CMP.map(lote)); } };
      return;
    }
    var mejor = function (fn, mayor) { var vs = ls.map(fn).filter(function (x) { return x != null; }); return vs.length > 1 ? (mayor ? Math.max : Math.min).apply(null, vs) : null; };
    var bM2 = mejor(function (l) { return l.m2; }, true), bPre = mejor(function (l) { return l.estado !== 'VENDIDO' ? l.precio : null; });
    var bCuota = mejor(function (l) { var c = cuotaDesde(l); return c && c.cuota; });
    var fila = function (t, fn, best) { return '<tr><th>' + t + '</th>' + ls.map(function (l) { var r = fn(l); return '<td' + (best != null && r[1] === best ? ' class="is-best"' : '') + '>' + r[0] + '</td>'; }).join('') + '</tr>'; };
    var url = location.origin + location.pathname + '#comparar=' + CMP.join(',');
    cont.innerHTML = '<div class="lt-cmp"><table><thead><tr><th></th>' + ls.map(function (l) {
        return '<th>Mz ' + esc(l.manzana) + ' · ' + esc(l.numero) + '<button type="button" data-qcmp="' + l.id + '" aria-label="Quitar de la comparación">' + IC.x + '</button></th>'; }).join('') + '</tr></thead><tbody>'
      + fila('Estado', function (l) { return ['<span class="lt-est lt-est--' + l.estado.toLowerCase() + '">' + EST[l.estado] + '</span>']; })
      + fila('Superficie', function (l) { return [m2(l.m2), l.m2]; }, bM2)
      + fila('Frente', function (l) { return [num(l.frente || l._ancho) + ' m']; })
      + fila('Fondo', function (l) { return [num(l.fondo || l._prof) + ' m']; })
      + fila('Orientación', function (l) { return [l._rumbo.nombre]; })
      + fila('Ubicación', function (l) { return [[l.esquina ? 'Esquina' : 'Interior', l._plaza ? 'frente a plaza' : ''].filter(Boolean).join(', ')]; })
      + fila('Contado', function (l) { return l.estado === 'VENDIDO' ? ['—'] : [gs(l.precio), l.precio]; }, bPre)
      + fila('Cuota desde', function (l) { var c = cuotaDesde(l); return c ? [gs(c.cuota) + '<small>' + c.cuotas + ' meses</small>', c.cuota] : ['—']; }, bCuota)
      + '</tbody></table></div><p class="lt-help">En verde, el mejor valor de cada fila. Los lotes comparados se ven en azul en el plano.</p>'
      + '<div class="lt-acts">' + (D.loteo.whatsapp ? '<a class="lt-btn lt-btn--wa" target="_blank" rel="noopener" href="https://wa.me/' + D.loteo.whatsapp + '?text='
        + encodeURIComponent('Hola! Estoy comparando estos lotes de ' + D.loteo.nombre + ': ' + ls.map(function (l) { return 'Mz ' + l.manzana + ' lote ' + l.numero; }).join(', ') + '. ' + url) + '">' + IC.wa + 'Consultar por estos lotes</a>' : '')
      + '<div class="lt-acts__row"><button type="button" class="lt-btn" data-compcmp>' + IC.share + 'Compartir</button>'
      + '<button type="button" class="lt-btn" data-vercmp>' + IC.pin + 'Ver en el plano</button></div></div>';
    cont.onclick = function (e) {
      var q = e.target.closest('[data-qcmp]'); if (q) { toggleCmp(+q.dataset.qcmp); pintarCmp(); return; }
      if (e.target.closest('[data-compcmp]')) compartir(url, 'Comparación de lotes — ' + D.loteo.nombre);
      if (e.target.closest('[data-vercmp]')) encuadrar(ls);
    };
  }

  /* ================================================================ entorno */
  function poiMarcas() {
    D.pois.forEach(function (p) {
      var c = POI[p.categoria] || POI.OTRO, el = document.createElement('div');
      el.className = 'lt-poi'; el.style.setProperty('--c', c.c); el.innerHTML = SVG(c.i); el.title = p.nombre;
      MARCAS.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat])
        .setPopup(new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML('<b>' + esc(p.nombre) + '</b><br>' + c.n + ' · ' + dist(p.dist))).addTo(MAPA));
    });
  }
  function pintarEnt() {
    var cont = document.getElementById('ltTabEnt');
    if (!D.pois.length) { cont.innerHTML = '<div class="lt-vacio"><b>Todavía no hay datos del entorno</b>El vendedor los carga desde la gestión.</div>'; return; }
    var porCat = {};
    D.pois.forEach(function (p, i) { p._i = i; (porCat[p.categoria] = porCat[p.categoria] || []).push(p); });
    cont.innerHTML = '<p class="lt-help">Distancias en línea recta desde el loteamiento. Datos de OpenStreetMap.</p>'
      + Object.keys(POI).filter(function (k) { return porCat[k]; }).map(function (k) {
        var ps = porCat[k].sort(function (a, b) { return a.dist - b.dist; }), c = POI[k];
        return '<section class="lt-ent"><h3><i style="--c:' + c.c + '">' + SVG(c.i) + '</i>' + c.n + '<span>la más cercana a ' + dist(ps[0].dist) + '</span></h3>'
          + ps.slice(0, 4).map(function (p) {
            return '<button type="button" class="lt-ent__p" data-poi="' + p._i + '"><b>' + esc(p.nombre) + '</b><span>' + dist(p.dist) + ' · ' + minutos(p.dist) + '</span></button>'; }).join('') + '</section>';
      }).join('');
    cont.onclick = function (e) {
      var b = e.target.closest('[data-poi]'); if (!b) return;
      var p = D.pois[+b.dataset.poi], m = MARCAS[+b.dataset.poi];
      var bb = new maplibregl.LngLatBounds([p.lng, p.lat], [p.lng, p.lat]);
      D.lotes.forEach(function (l) { anillo(l.geo).forEach(function (q) { bb.extend(q); }); });
      MAPA.fitBounds(bb, { padding: 70, duration: 900, maxZoom: 17 });
      MARCAS.forEach(function (x) { if (x.getPopup().isOpen()) x.togglePopup(); });
      setTimeout(function () { if (!m.getPopup().isOpen()) m.togglePopup(); }, 950);
    };
  }

  /* ================================================================ util */
  function compartir(url, titulo) {
    if (navigator.share) { navigator.share({ title: titulo, url: url }).catch(function () {}); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { aviso('Link copiado'); }, function () { aviso(url); });
  }
  function aviso(m) {
    var t = document.createElement('div'); t.className = 'lt-toast'; t.textContent = m; document.body.appendChild(t);
    setTimeout(function () { t.classList.add('is-out'); setTimeout(function () { t.remove(); }, 300); }, 2200);
  }
})();
