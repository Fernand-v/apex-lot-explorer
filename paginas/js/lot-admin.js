/* Gestion de lotes (pagina 60, con login). Los poligonos se dibujan en "Croquis y areas" (pagina 55)
   con categoria "Lote" y nombre "Mz A - Lote 5"; aca se completan precio, estado y medidas. */
(function () {
  'use strict';
  var root = document.getElementById('lotAdm');
  var D = null, TAB = 'lotes', MSG = null;
  var EST = { DISPONIBLE: 'Disponible', RESERVADO: 'Reservado', VENDIDO: 'Vendido' };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function gs(n) { return n == null || n === '' ? '—' : 'Gs. ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function fmt(n) { return n == null || n === '' ? '' : Number(n).toLocaleString('es-PY'); }
  function leer(v) { return String(v || '').replace(/\D/g, '') ? +String(v).replace(/\D/g, '') : null; }
  function ajax(a, d) {
    return new Promise(function (ok, ko) {
      apex.server.process('AJAX', { x01: a, x02: JSON.stringify(d || {}) }, { dataType: 'json',
        success: function (r) { r && r.ok ? ok(r) : ko(new Error((r && r.msg) || 'Error')); },
        error: function (x) { ko(new Error('Error de conexión (' + ((x && x.status) || 0) + ')')); } });
    });
  }
  // link para compartir con clientes (sin sesion)
  function linkPublico() {
    var p = location.pathname;
    // URL amigable (/ords/r/<workspace>/<app>/<pagina>) -> misma app, pagina "loteamiento"
    if (/\/r\/[^\/]+\/[^\/]+\//.test(p)) return location.origin + p.replace(/(\/r\/[^\/]+\/[^\/]+)\/.*$/, '$1/loteamiento');
    // entrada por f?p=...: la URL amigable la arma el servidor (RESUMEN.publico)
    if (D && D.publico) return D.publico;
    // ultimo recurso: f?p=<app>:LOTEAMIENTO (el alias de la pagina 59)
    return location.origin + p.replace(/\/[^\/]*$/, '') + '/f?p=' + apex.env.APP_ID + ':LOTEAMIENTO';
  }
  // agrega un parametro con ? o & segun corresponda
  function conParam(u, q) { return u + (u.indexOf('?') < 0 ? '?' : '&') + q; }
  // para que el vendedor lo mire: con SU sesion. El plano vive en la misma app 100; abrirlo sin
  // session= en el mismo navegador crea una sesion nueva y cierra la del panel.
  function linkVer() { var s = apex.env && apex.env.APP_SESSION; return s ? conParam(linkPublico(), 'session=' + s) : linkPublico(); }

  function cargar() {
    return ajax('RESUMEN').then(function (r) { D = r; D.lotes = D.lotes || []; D.planes = D.planes || []; D.pois = D.pois || []; pintar(); }).catch(function (e) { root.innerHTML = '<div class="lt-msg lt-msg--bad">' + esc(e.message) + '</div>'; });
  }
  // un solo temporizador: si llega otro aviso antes de que se borre el anterior, el viejo no debe borrar al nuevo
  var tAviso = null;
  function aviso(txt, mal) {
    clearTimeout(tAviso);
    MSG = { t: txt, mal: mal }; pintar();
    tAviso = setTimeout(function () { MSG = null; var m = root.querySelector('.lt-msg'); if (m) m.remove(); }, 3500);
  }

  function pintar() {
    var n = { DISPONIBLE: 0, RESERVADO: 0, VENDIDO: 0 }, vDisp = 0, vVen = 0;
    D.lotes.forEach(function (l) { n[l.estado]++; if (l.estado === 'DISPONIBLE') vDisp += l.precio || 0; if (l.estado === 'VENDIDO') vVen += l.precio || 0; });
    root.innerHTML = '<div class="lt-adm">'
      + '<div class="lt-adm__top"><div><h2>' + esc(D.loteo.nombre) + '</h2><div class="lt-help" style="margin:4px 0 0">' + D.lotes.length + ' lotes · los polígonos se dibujan en <a href="' + esc(urlPagina(55)) + '">Croquis y áreas</a> con categoría <b>Lote</b></div></div>'
      + '<div class="lt-adm__link"><code title="' + esc(linkPublico()) + '">' + esc(linkPublico()) + '</code>'
      + '<button type="button" class="lt-ab" data-copiar>Copiar link</button><a class="lt-ab lt-ab--acc" href="' + esc(linkVer()) + '" target="_blank" rel="noopener">Ver plano público</a></div></div>'
      + (MSG ? '<div class="lt-msg ' + (MSG.mal ? 'lt-msg--bad' : 'lt-msg--ok') + '">' + esc(MSG.t) + '</div>' : '')
      + '<div class="lt-kpis"><div><span>Disponibles</span><b>' + n.DISPONIBLE + '</b></div><div><span>Reservados</span><b>' + n.RESERVADO + '</b></div>'
      + '<div><span>Vendidos</span><b>' + n.VENDIDO + '</b></div><div><span>Valor disponible (contado)</span><b>' + gs(vDisp) + '</b></div></div>'
      + '<div class="lt-tabs">' + [['lotes', 'Lotes'], ['planes', 'Planes de pago'], ['entorno', 'Entorno'], ['loteo', 'Loteamiento']].map(function (t) {
        return '<button type="button" data-tab="' + t[0] + '" class="' + (TAB === t[0] ? 'is-on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>'
      + '<div id="ltTab">' + ({ lotes: tabLotes, planes: tabPlanes, entorno: tabEntorno, loteo: tabLoteo })[TAB]() + '</div></div>';
  }
  function urlPagina(p) {
    var s = (apex.env && apex.env.APP_SESSION) || '';
    return 'f?p=' + apex.env.APP_ID + ':' + p + ':' + s;
  }

  function tabLotes() {
    if (!D.lotes.length) return '<div class="lt-help">Todavía no hay lotes. Dibujá los polígonos en Croquis y áreas con categoría “Lote” y nombre “Mz A - Lote 1”.</div>';
    return '<div class="lt-tbl"><table><thead><tr><th>Mz</th><th>Lote</th><th class="n">m²</th><th>Medidas</th><th class="n">Precio contado</th><th>Estado</th><th>Público</th><th>Modificado</th></tr></thead><tbody>'
      + D.lotes.map(function (l) {
        return '<tr data-id="' + l.id + '"><td><b>' + esc(l.manzana) + '</b></td><td>' + esc(l.numero) + (l.esquina ? ' <span title="Esquina">◢</span>' : '') + '</td>'
          + '<td class="n">' + fmt(l.m2) + '</td><td>' + (l.frente ? fmt(l.frente) + ' × ' + fmt(l.fondo) : '—') + '</td><td class="n">' + gs(l.precio) + (l.especiales ? ' ★' : '') + '</td>'
          + '<td><select data-estado="' + l.id + '" aria-label="Estado">' + Object.keys(EST).map(function (k) { return '<option value="' + k + '"' + (k === l.estado ? ' selected' : '') + '>' + EST[k] + '</option>'; }).join('') + '</select></td>'
          + '<td>' + (l.publico ? 'Sí' : '<b style="color:#b42318">No</b>') + '</td><td style="color:var(--lt-mut);font-size:12px">' + esc(l.modificado || '') + ' ' + esc(l.por || '') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="lt-help">Tocá una fila para editar precio, medidas y precios especiales. ★ = tiene precio especial en algún plan.</p>';
  }
  function tabPlanes() {
    return '<p class="lt-help">El precio de cada plan es el precio contado del lote + el recargo. La cuota = (precio del plan − entrega) ÷ cuotas. Cuotas 0 = contado.</p>'
      + '<div class="lt-planes-ed" id="ltPl"><div style="font-size:12px;font-weight:700;color:var(--lt-mut)"><span>Cuotas</span><span>Recargo %</span><span>Entrega mín. %</span><span>Activo</span><span></span></div>'
      + D.planes.map(filaPlan).join('') + '</div>'
      + '<div style="display:flex;gap:8px;margin-top:12px"><button type="button" class="lt-ab" data-addplan>+ Agregar plan</button><button type="button" class="lt-ab lt-ab--acc" data-guardar-planes>Guardar planes</button></div>'
      + ejemploPlanes();
  }
  function filaPlan(p) {
    return '<div data-plan><input type="number" min="0" max="240" value="' + p.cuotas + '" data-k="cuotas" aria-label="Cuotas"><input type="number" min="0" max="500" step="0.5" value="' + p.recargo + '" data-k="recargo" aria-label="Recargo">'
      + '<input type="number" min="0" max="100" step="0.5" value="' + p.entrega + '" data-k="entrega" aria-label="Entrega mínima"><label class="lt-chk"><input type="checkbox" data-k="activo"' + (p.activo !== false ? ' checked' : '') + '><i></i></label>'
      + '<button type="button" class="lt-ab" data-delplan aria-label="Quitar">✕</button></div>';
  }
  function ejemploPlanes() {
    var base = 50000000;
    return '<div class="lt-tbl" style="margin-top:16px;max-width:640px"><table><thead><tr><th>Ejemplo: lote de ' + gs(base) + '</th><th class="n">Precio del plan</th><th class="n">Entrega mín.</th><th class="n">Cuota</th></tr></thead><tbody>'
      + D.planes.filter(function (p) { return p.activo !== false; }).map(function (p) {
        var t = Math.round(base * (1 + p.recargo / 100) / 1000) * 1000, e = Math.round(t * p.entrega / 100 / 1000) * 1000;
        return '<tr><td>' + (p.cuotas ? p.cuotas + ' cuotas' : 'Contado') + '</td><td class="n">' + gs(t) + '</td><td class="n">' + gs(p.cuotas ? e : t) + '</td><td class="n">' + (p.cuotas ? gs(Math.ceil((t - e) / p.cuotas / 1000) * 1000) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  /* ---------- entorno: se busca en OpenStreetMap (Overpass) desde el navegador y se guarda en la base,
     asi la pagina publica no depende de Overpass ni lo consulta en cada visita */
  var CAT = { ESCUELA: 'Escuela', SALUD: 'Salud', SUPER: 'Supermercado', COMBUSTIBLE: 'Combustible', BANCO: 'Banco', RUTA: 'Ruta', OTRO: 'Otro' };
  var CANDIDATOS = null;
  function tabEntorno() {
    var ps = D.pois || [], L = D.loteo;
    return '<p class="lt-help">Escuelas, salud, supermercados, combustible, bancos y rutas cercanas, tomados de OpenStreetMap. Se muestran en la pestaña “Entorno” del plano público.'
      + (L.poiFecha ? ' Última actualización: ' + esc(L.poiFecha) + '.' : '') + '</p>'
      + '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px"><label class="lt-f" style="width:160px"><span>Radio de búsqueda</span><select id="ltRadio">'
      + [1000, 2000, 3000, 5000, 8000].map(function (r) { return '<option value="' + r + '"' + (r === L.poiRadio ? ' selected' : '') + '>' + r / 1000 + ' km</option>'; }).join('') + '</select></label>'
      + '<button type="button" class="lt-ab lt-ab--acc" data-buscar-osm' + (D.centro && D.centro.lat ? '' : ' disabled') + '>Buscar en OpenStreetMap</button></div>'
      + (CANDIDATOS ? candidatosHtml() : '')
      + (ps.length ? '<div class="lt-tbl"><table><thead><tr><th>Mostrar</th><th>Categoría</th><th>Nombre</th><th class="n">Distancia</th></tr></thead><tbody>'
        + ps.map(function (p) { return '<tr><td><label class="lt-chk"><input type="checkbox" data-poi="' + p.id + '"' + (p.activo ? ' checked' : '') + '><i></i></label></td><td>' + CAT[p.categoria] + '</td><td>' + esc(p.nombre) + '</td><td class="n">' + fmt(p.dist) + ' m</td></tr>'; }).join('')
        + '</tbody></table></div>' : (CANDIDATOS ? '' : '<div class="lt-help">Todavía no hay puntos cargados.</div>'));
  }
  function candidatosHtml() {
    return '<div class="lt-msg lt-msg--ok">Encontrados ' + CANDIDATOS.length + ' lugares. Destildá los que no quieras mostrar y guardá.</div>'
      + '<div class="lt-tbl" style="margin-bottom:10px"><table><thead><tr><th></th><th>Categoría</th><th>Nombre</th><th class="n">Distancia</th></tr></thead><tbody>'
      + CANDIDATOS.map(function (c, i) { return '<tr><td><label class="lt-chk"><input type="checkbox" data-cand="' + i + '"' + (c.ok ? ' checked' : '') + '><i></i></label></td><td>' + CAT[c.categoria] + '</td><td>' + esc(c.nombre) + '</td><td class="n">' + fmt(c.dist) + ' m</td></tr>'; }).join('')
      + '</tbody></table></div><div style="display:flex;gap:8px;margin-bottom:18px"><button type="button" class="lt-ab lt-ab--acc" data-guardar-osm>Guardar estos puntos</button><button type="button" class="lt-ab" data-cancelar-osm>Cancelar</button></div>';
  }
  function metros(a, b, c, d) {   // haversine
    var R = 6371000, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
    return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
  }
  function categoria(t) {
    if (/^(school|kindergarten|college|university)$/.test(t.amenity)) return 'ESCUELA';
    if (/^(hospital|clinic|doctors|pharmacy)$/.test(t.amenity)) return 'SALUD';
    if (/^(supermarket|convenience)$/.test(t.shop)) return 'SUPER';
    if (t.amenity === 'fuel') return 'COMBUSTIBLE';
    if (/^(bank|atm)$/.test(t.amenity)) return 'BANCO';
    if (/^(trunk|primary)$/.test(t.highway)) return 'RUTA';
    return null;
  }
  function buscarOsm(btn) {
    var c = D.centro, r = +root.querySelector('#ltRadio').value;
    var q = '[out:json][timeout:30];(nwr(around:' + r + ',' + c.lat + ',' + c.lng + ')["amenity"~"^(school|kindergarten|college|university|hospital|clinic|doctors|pharmacy|fuel|bank|atm)$"];'
      + 'nwr(around:' + r + ',' + c.lat + ',' + c.lng + ')["shop"~"^(supermarket|convenience)$"];way(around:' + r + ',' + c.lat + ',' + c.lng + ')["highway"~"^(trunk|primary)$"]["name"];);out geom 400;';
    btn.disabled = true; btn.textContent = 'Buscando…';
    fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      .then(function (r) { if (!r.ok) throw new Error('OpenStreetMap respondió ' + r.status + '. Probá de nuevo en un minuto.'); return r.json(); })
      .then(function (j) {
        var vistos = {}, porCat = {};
        (j.elements || []).forEach(function (e) {
          var t = e.tags || {}, cat = categoria(t), nombre = t.name || t['name:es'];
          if (!cat || !nombre) return;
          var pts = e.geometry ? e.geometry.map(function (g) { return [g.lat, g.lon]; }) : e.center ? [[e.center.lat, e.center.lon]] : [[e.lat, e.lon]];
          var mejor = pts.reduce(function (m, p) { var d = metros(c.lat, c.lng, p[0], p[1]); return d < m.d ? { d: d, p: p } : m; }, { d: 1e12 });
          var clave = cat + '|' + nombre.toLowerCase();
          if (vistos[clave] && vistos[clave].dist <= mejor.d) return;         // una ruta viene en muchos tramos: el mas cercano
          vistos[clave] = { categoria: cat, nombre: nombre, lat: mejor.p[0], lng: mejor.p[1], dist: Math.round(mejor.d), osm: e.type + '/' + e.id };
        });
        Object.keys(vistos).forEach(function (k) { var v = vistos[k]; (porCat[v.categoria] = porCat[v.categoria] || []).push(v); });
        CANDIDATOS = [];
        Object.keys(porCat).forEach(function (k) {
          porCat[k].sort(function (a, b) { return a.dist - b.dist; }).slice(0, k === 'RUTA' ? 3 : 6).forEach(function (v) { v.ok = true; CANDIDATOS.push(v); });
        });
        CANDIDATOS.sort(function (a, b) { return a.categoria.localeCompare(b.categoria) || a.dist - b.dist; });
        if (!CANDIDATOS.length) { CANDIDATOS = null; aviso('No se encontraron lugares con nombre en ese radio.', true); return; }
        pintar();
      })
      .catch(function (e) { btn.disabled = false; btn.textContent = 'Buscar en OpenStreetMap'; aviso(e.message || 'No se pudo consultar OpenStreetMap.', true); });
  }

  function tabLoteo() {
    var L = D.loteo;
    return '<div class="lt-form" id="ltFL"><label class="full"><span>Nombre del loteamiento</span><input type="text" name="nombre" maxlength="150" value="' + esc(L.nombre) + '"></label>'
      + '<label class="full"><span>Frase de portada</span><input type="text" name="lema" maxlength="250" value="' + esc(L.lema) + '"></label>'
      + '<label class="full"><span>Descripción</span><textarea name="descripcion" maxlength="2000">' + esc(L.descripcion) + '</textarea></label>'
      + '<label><span>Ubicación (texto)</span><input type="text" name="ubicacion" maxlength="250" value="' + esc(L.ubicacion) + '" placeholder="Luque, Central"></label>'
      + '<label><span>WhatsApp de ventas</span><input type="tel" name="whatsapp" value="' + esc(L.whatsapp ? '0' + String(L.whatsapp).replace(/^595/, '') : '') + '" placeholder="0981 123 456"></label>'
      + '<label class="full"><span>Link de Google Maps de la entrada</span><input type="url" name="maps" maxlength="500" value="' + esc(L.maps) + '"></label>'
      + '<div class="full lt-f"><span>Retiros para “¿Qué puedo construir?” (metros, simulación ilustrativa)</span></div>'
      + '<label><span>Frente</span><input type="number" step="0.5" min="0" max="30" name="retiroFrente" value="' + L.retiroFrente + '"></label>'
      + '<label><span>Laterales</span><input type="number" step="0.5" min="0" max="30" name="retiroLateral" value="' + L.retiroLateral + '"></label>'
      + '<label><span>Fondo</span><input type="number" step="0.5" min="0" max="30" name="retiroFondo" value="' + L.retiroFondo + '"></label><div></div>'
      + '<label class="lt-chk full"><input type="checkbox" name="mostrarVendidos"' + (L.mostrarVendidos ? ' checked' : '') + '><i></i><span>Mostrar lotes vendidos en el plano (en gris)</span></label>'
      + '<div class="full"><button type="button" class="lt-ab lt-ab--acc" data-guardar-loteo>Guardar</button></div></div>'
      + '<div class="lt-og"><h3>Vista previa al compartir</h3><p class="lt-help">Cuando alguien pega el link en WhatsApp o Facebook se ve una foto del lote con su precio. '
      + 'Generá las imágenes después de cambiar precios o estados. Tarda unos segundos por lote.</p>'
      + '<div class="lt-og__fila"><img id="ltOgImg" alt="Vista previa del loteamiento" src="' + esc(ogUrl(0)) + '" onerror="this.hidden=true">'
      + '<div><button type="button" class="lt-ab lt-ab--acc" data-og>Generar vistas previas (' + (D.lotes.length + 1) + ' imágenes)</button><div class="lt-help" id="ltOgProg"></div></div></div></div>';
  }

  function editar(l) {
    var activos = D.planes.filter(function (p) { return p.cuotas > 0; });
    var d = document.createElement('div'); d.className = 'lt-dlg';
    d.innerHTML = '<div role="dialog" aria-modal="true"><h3>Manzana ' + esc(l.manzana) + ' · Lote ' + esc(l.numero) + '</h3><div class="lt-form">'
      + '<label><span>Manzana</span><input type="text" name="manzana" maxlength="10" value="' + esc(l.manzana) + '"></label>'
      + '<label><span>Número</span><input type="text" name="numero" maxlength="10" value="' + esc(l.numero) + '"></label>'
      + '<label><span>Precio contado (Gs.)</span><input type="text" inputmode="numeric" name="precio" value="' + fmt(l.precio) + '"></label>'
      + '<label><span>Estado</span><select name="estado">' + Object.keys(EST).map(function (k) { return '<option value="' + k + '"' + (k === l.estado ? ' selected' : '') + '>' + EST[k] + '</option>'; }).join('') + '</select></label>'
      + '<label><span>Frente (m)</span><input type="number" step="0.01" min="0" name="frente" value="' + (l.frente || '') + '"></label>'
      + '<label><span>Fondo (m)</span><input type="number" step="0.01" min="0" name="fondo" value="' + (l.fondo || '') + '"></label>'
      + '<label class="lt-chk"><input type="checkbox" name="esquina"' + (l.esquina ? ' checked' : '') + '><i></i><span>Esquina</span></label>'
      + '<label class="lt-chk"><input type="checkbox" name="publico"' + (l.publico ? ' checked' : '') + '><i></i><span>Visible en el plano público</span></label>'
      + '<label class="full"><span>Detalle para el cliente</span><input type="text" name="detalle" maxlength="500" value="' + esc(l.detalle) + '" placeholder="Ej: frente a la plaza"></label>'
      + '<label class="full"><span>Nota interna (no se publica)</span><textarea name="nota" maxlength="1000">' + esc(l.nota) + '</textarea></label>'
      + '<div class="full"><span class="lt-f"><span>Precio especial por plan (opcional, reemplaza el recargo)</span></span><div class="lt-form" style="grid-template-columns:repeat(3,1fr)">'
      + activos.map(function (p) { var v = l.especiales && l.especiales[String(p.cuotas)]; return '<label><span>' + p.cuotas + ' cuotas</span><input type="text" inputmode="numeric" data-esp="' + p.cuotas + '" value="' + fmt(v) + '" placeholder="automático"></label>'; }).join('')
      + '</div></div></div><div class="lt-msg lt-msg--bad" hidden></div><footer><button type="button" class="lt-ab" data-x>Cancelar</button><button type="button" class="lt-ab lt-ab--acc" data-ok>Guardar</button></footer></div>';
    document.body.appendChild(d);
    d.querySelectorAll('input[inputmode=numeric]').forEach(function (i) { i.addEventListener('input', function () { var v = leer(i.value); i.value = v ? fmt(v) : ''; }); });
    function q(n) { return d.querySelector('[name=' + n + ']'); }
    d.addEventListener('click', function (e) {
      if (e.target === d || e.target.closest('[data-x]')) return d.remove();
      if (!e.target.closest('[data-ok]')) return;
      var esp = {};
      d.querySelectorAll('[data-esp]').forEach(function (i) { esp[i.dataset.esp] = leer(i.value); });
      ajax('GUARDAR_LOTE', { id: l.id, manzana: q('manzana').value, numero: q('numero').value, precio: leer(q('precio').value), estado: q('estado').value,
        frente: q('frente').value || null, fondo: q('fondo').value || null, esquina: q('esquina').checked, publico: q('publico').checked,
        detalle: q('detalle').value, nota: q('nota').value, especiales: esp })
        .then(function (r) { d.remove(); return cargar().then(function () { aviso(r.msg); }); })
        .catch(function (x) { var m = d.querySelector('.lt-msg'); m.textContent = x.message; m.hidden = false; });
    });
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab]');
    if (t) { TAB = t.dataset.tab; pintar(); return; }
    if (e.target.closest('[data-copiar]')) { (navigator.clipboard ? navigator.clipboard.writeText(linkPublico()) : Promise.reject()).then(function () { aviso('Link copiado'); }, function () { aviso(linkPublico()); }); return; }
    if (e.target.closest('select')) return;
    var tr = e.target.closest('tr[data-id]');
    if (tr) { editar(D.lotes.filter(function (l) { return l.id === +tr.dataset.id; })[0]); return; }
    if (e.target.closest('[data-addplan]')) { D.planes.push({ cuotas: 24, recargo: 15, entrega: 10, activo: true }); leerPlanesDom(true); pintar(); return; }
    var dp = e.target.closest('[data-delplan]');
    if (dp) { var i = Array.prototype.indexOf.call(root.querySelectorAll('[data-plan]'), dp.closest('[data-plan]')); leerPlanesDom(); D.planes.splice(i, 1); pintar(); return; }
    if (e.target.closest('[data-guardar-planes]')) {
      leerPlanesDom();
      ajax('GUARDAR_PLANES', { planes: D.planes }).then(function (r) { return cargar().then(function () { aviso(r.msg); }); }).catch(function (x) { aviso(x.message, true); });
      return;
    }
    var bo = e.target.closest('[data-buscar-osm]'); if (bo) { buscarOsm(bo); return; }
    var bg = e.target.closest('[data-og]'); if (bg) { generarOg(bg); return; }
    if (e.target.closest('[data-cancelar-osm]')) { CANDIDATOS = null; pintar(); return; }
    if (e.target.closest('[data-guardar-osm]')) {
      var elegidos = CANDIDATOS.filter(function (c) { return c.ok; });
      ajax('GUARDAR_POIS', { radio: +root.querySelector('#ltRadio').value, pois: elegidos }).then(function (r) { CANDIDATOS = null; return cargar().then(function () { aviso(r.msg); }); }).catch(function (x) { aviso(x.message, true); });
      return;
    }
    if (e.target.closest('[data-guardar-loteo]')) {
      var f = root.querySelector('#ltFL'), g = function (n) { return f.querySelector('[name=' + n + ']'); };
      ajax('GUARDAR_LOTEO', { nombre: g('nombre').value, lema: g('lema').value, descripcion: g('descripcion').value, ubicacion: g('ubicacion').value,
        whatsapp: g('whatsapp').value, maps: g('maps').value, mostrarVendidos: g('mostrarVendidos').checked,
        retiroFrente: +g('retiroFrente').value, retiroLateral: +g('retiroLateral').value, retiroFondo: +g('retiroFondo').value })
        .then(function (r) { return cargar().then(function () { aviso(r.msg); }); }).catch(function (x) { aviso(x.message, true); });
    }
  });
  /* ---------- vistas previas Open Graph: mapa satelital fuera de pantalla -> canvas con la ficha -> base ---------- */
  // con la sesion del vendedor: la pagina 61 es publica y sin session= abriria una sesion nueva y cerraria la del panel
  function ogUrl(clave) {
    var ses = apex.env && apex.env.APP_SESSION;
    var u = linkPublico().replace(/\/loteamiento$/, '/lot-og').replace(/:LOTEAMIENTO$/, ':LOT-OG');
    return conParam(u, 'p61_id=' + clave + '&p61_v=' + Date.now() + (ses ? '&session=' + ses : ''));
  }
  function cargarMapLibre() {
    return new Promise(function (ok, ko) {
      if (window.maplibregl) return ok();
      var amd = typeof window.define === 'function' && window.define.amd;   // RequireJS de APEX
      if (amd) window.define.amd = false;
      var js = document.createElement('script'); js.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      js.onload = function () { if (amd) window.define.amd = amd; ok(); };
      js.onerror = function () { if (amd) window.define.amd = amd; ko(new Error('No se pudo cargar el mapa')); };
      document.head.appendChild(js);
    });
  }
  function ogTexto(L, l, planes) {
    var cuota = null;
    if (l && l.precio && l.estado !== 'VENDIDO') planes.filter(function (p) { return p.cuotas > 0; }).forEach(function (p) {
      var esp = l.especiales && l.especiales[String(p.cuotas)], t = esp || Math.round(l.precio * (1 + p.recargo / 100) / 1000) * 1000;
      var e = Math.round(t * p.entrega / 100 / 1000) * 1000, c = Math.ceil((t - e) / p.cuotas / 1000) * 1000;
      if (!cuota || c < cuota.c) cuota = { c: c, n: p.cuotas };
    });
    return cuota;
  }
  function componer(mapCanvas, L, l, planes, info) {
    var c = document.createElement('canvas'); c.width = 1200; c.height = 630;
    var g = c.getContext('2d');
    g.drawImage(mapCanvas, 0, 0, 1200, 630);
    var gr = g.createLinearGradient(0, 300, 0, 630); gr.addColorStop(0, 'rgba(15,20,18,0)'); gr.addColorStop(1, 'rgba(15,20,18,.88)');
    g.fillStyle = gr; g.fillRect(0, 300, 1200, 330);
    // marca del loteamiento
    g.font = '600 26px Inter, Arial, sans-serif'; var w = g.measureText(L.nombre).width;
    g.fillStyle = 'rgba(31,92,67,.95)'; redondo(g, 40, 36, w + 44, 52, 26); g.fill();
    g.fillStyle = '#fff'; g.fillText(L.nombre, 62, 71);
    g.fillStyle = '#fff';
    if (l) {
      var col = { DISPONIBLE: '#18a35c', RESERVADO: '#d9860b', VENDIDO: '#8a939c' }[l.estado];
      g.font = '600 64px Fraunces, Georgia, serif'; g.fillText('Lote ' + l.numero + ' · Manzana ' + l.manzana, 48, 505);
      g.font = '500 30px Inter, Arial, sans-serif'; g.fillStyle = 'rgba(255,255,255,.9)';
      var dato = Math.round(l.m2) + ' m²' + (l.frente ? '  ·  ' + l.frente + ' × ' + l.fondo + ' m' : '') + (l.esquina ? '  ·  esquina' : '');
      g.fillText(dato, 48, 552);
      var cu = ogTexto(L, l, planes);
      g.font = '700 34px Inter, Arial, sans-serif'; g.fillStyle = '#fff';
      g.fillText(l.estado === 'VENDIDO' ? 'Vendido' : gs(l.precio) + (cu ? '   o ' + cu.n + ' cuotas de ' + gs(cu.c) : ''), 48, 598);
      var est = { DISPONIBLE: 'Disponible', RESERVADO: 'Reservado', VENDIDO: 'Vendido' }[l.estado];
      g.font = '700 24px Inter, Arial, sans-serif'; var we = g.measureText(est).width;
      g.fillStyle = col; redondo(g, 1200 - we - 84, 36, we + 44, 50, 25); g.fill(); g.fillStyle = '#fff'; g.fillText(est, 1200 - we - 62, 70);
    } else {
      g.font = '600 66px Fraunces, Georgia, serif'; g.fillText(L.nombre, 48, 520);
      g.font = '500 32px Inter, Arial, sans-serif'; g.fillStyle = 'rgba(255,255,255,.92)';
      g.fillText(info, 48, 580);
    }
    return c;
  }
  function redondo(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function subirOg(canvas, clave) {
    return new Promise(function (ok) { canvas.toBlob(ok, 'image/jpeg', .84); }).then(function (blob) {
      return new Promise(function (ok) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1]); }; r.readAsDataURL(blob); });
    }).then(function (b64) {
      var f01 = []; for (var i = 0; i < b64.length; i += 30000) f01.push(b64.substr(i, 30000));
      return new Promise(function (ok, ko) {
        apex.server.process('AJAX', { x01: 'OG_GUARDAR', x02: JSON.stringify({ clave: clave }), f01: f01 }, { dataType: 'json',
          success: function (r) { r && r.ok ? ok() : ko(new Error((r && r.msg) || 'Error')); }, error: function () { ko(new Error('Error de conexión')); } });
      });
    });
  }
  function generarOg(btn) {
    var prog = root.querySelector('#ltOgProg');
    btn.disabled = true;
    var host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-3000px;top:0;width:1200px;height:630px';
    document.body.appendChild(host);
    var info, mapa;
    Promise.all([cargarMapLibre(), ajax('INFO'), document.fonts ? document.fonts.ready : Promise.resolve()]).then(function (res) {
      info = res[1];
      var feats = (info.lotes || []).map(function (l) { var g = l.geo.geometry || l.geo; return { type: 'Feature', id: l.id, properties: { estado: l.estado }, geometry: g }; });
      var ent = (info.entorno || []).filter(function (a) { return a.geo; }).map(function (a) { return { type: 'Feature', properties: { cat: (a.categoria || '').toLowerCase() }, geometry: a.geo.geometry || a.geo }; });
      mapa = new maplibregl.Map({ container: host, interactive: false, attributionControl: false, preserveDrawingBuffer: true, pixelRatio: 1, fadeDuration: 0,
        style: { version: 8, sources: {
          sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 17 },
          lotes: { type: 'geojson', data: { type: 'FeatureCollection', features: feats } },
          ent: { type: 'geojson', data: { type: 'FeatureCollection', features: ent } } },
          layers: [{ id: 'sat', type: 'raster', source: 'sat' },
            { id: 'calles', type: 'fill', source: 'ent', filter: ['in', 'calle', ['get', 'cat']], paint: { 'fill-color': '#e2dccd', 'fill-opacity': .55 } },
            { id: 'verde', type: 'fill', source: 'ent', filter: ['in', 'plaza', ['get', 'cat']], paint: { 'fill-color': '#3f9e5a', 'fill-opacity': .6 } },
            { id: 'lotes', type: 'fill', source: 'lotes', paint: { 'fill-color': ['match', ['get', 'estado'], 'DISPONIBLE', '#2bd27a', 'RESERVADO', '#ffb020', '#c3c9cf'],
              'fill-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], .95, .62] } },
            { id: 'borde', type: 'line', source: 'lotes', paint: { 'line-color': '#ffffff', 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 6, 1] } }] } });
      return new Promise(function (ok) { mapa.once('load', ok); });
    }).then(function () {
      var bTodo = new maplibregl.LngLatBounds();
      info.lotes.forEach(function (l) { (l.geo.geometry || l.geo).coordinates[0].forEach(function (p) { bTodo.extend(p); }); });
      var disp = info.lotes.filter(function (l) { return l.estado === 'DISPONIBLE'; });
      var desde = Math.min.apply(null, disp.map(function (l) { return l.precio || 1e15; }));
      var trabajos = [{ clave: 0, lote: null, bounds: bTodo, pad: 60 }].concat(info.lotes.map(function (l) {
        var b = new maplibregl.LngLatBounds(); (l.geo.geometry || l.geo).coordinates[0].forEach(function (p) { b.extend(p); });
        return { clave: l.id, lote: l, bounds: b, pad: 230 };
      }));
      var i = 0, previo = null;
      function siguiente() {
        if (i >= trabajos.length) return Promise.resolve();
        var t = trabajos[i];
        if (previo != null) mapa.setFeatureState({ source: 'lotes', id: previo }, { sel: false });
        if (t.lote) mapa.setFeatureState({ source: 'lotes', id: t.clave }, { sel: true });
        previo = t.lote ? t.clave : null;
        mapa.fitBounds(t.bounds, { padding: { top: 90, bottom: t.lote ? 250 : 170, left: t.pad, right: t.pad }, animate: false, maxZoom: 18.6 });
        prog.textContent = 'Generando ' + (i + 1) + ' de ' + trabajos.length + '…';
        return new Promise(function (ok) { mapa.once('idle', ok); }).then(function () {
          var txt = disp.length + ' lotes disponibles' + (isFinite(desde) && desde < 1e15 ? ' desde ' + gs(desde) : '');
          return subirOg(componer(mapa.getCanvas(), info.loteo, t.lote, info.planes || [], txt), t.clave);
        }).then(function () { i++; return siguiente(); });
      }
      return siguiente();
    }).then(function () {
      prog.textContent = '✓ ' + (info.lotes.length + 1) + ' vistas previas listas.';
      var img = root.querySelector('#ltOgImg'); img.hidden = false; img.src = ogUrl(0);
    }).catch(function (e) { prog.textContent = 'Error: ' + e.message; })
      .then(function () { btn.disabled = false; if (mapa) mapa.remove(); host.remove(); });
  }

  function leerPlanesDom(soloSiHay) {
    var filas = root.querySelectorAll('[data-plan]');
    if (!filas.length && soloSiHay) return;
    var arr = Array.prototype.map.call(filas, function (r) {
      var v = function (k) { return r.querySelector('[data-k=' + k + ']'); };
      return { cuotas: +v('cuotas').value, recargo: +v('recargo').value, entrega: +v('entrega').value, activo: v('activo').checked };
    });
    if (soloSiHay) arr.push(D.planes[D.planes.length - 1]);
    D.planes = arr;
  }
  root.addEventListener('change', function (e) {
    var cd = e.target.closest('[data-cand]'); if (cd) { CANDIDATOS[+cd.dataset.cand].ok = cd.checked; return; }
    var pi = e.target.closest('[data-poi]');
    if (pi) { ajax('ACTIVAR_POI', { id: +pi.dataset.poi, activo: pi.checked }).then(function () { D.pois.forEach(function (p) { if (p.id === +pi.dataset.poi) p.activo = pi.checked; }); }).catch(function (x) { aviso(x.message, true); }); return; }
    var s = e.target.closest('[data-estado]');
    if (!s) return;
    ajax('ESTADO_LOTE', { id: +s.dataset.estado, estado: s.value }).then(function (r) { return cargar().then(function () { aviso(r.msg); }); }).catch(function (x) { aviso(x.message, true); });
  });

  cargar();
})();
