// Vista "Mapa" de la Campaña, con tres modos:
// - Lugares: un mapa dibujado de la Costa de la Espada con los lugares de la bitácora en su sitio.
//   Al tocar un lugar se ve quién y qué está conectado con él. Los lugares se pueden mover ("Ubicar lugares").
// - Personajes: se elige un personaje y se ve con quién está conectado (y por qué).
// - Red: todas las fichas y los hilos entre ellas.
//
// Un hilo une dos fichas cuando un punto de las notas de sesión nombra a ambas (un sub-punto hereda las de su
// punto padre), cuando una ficha enlaza a la otra, o cuando una línea de historia las involucra.

import * as C from './campaign-data.js';
import { kindLabel, notesHtml, KIND_ICON } from './campaign-ui.js';
import { PACKS, confirmAndImportPack } from './campaign-import.js';
import * as M from './maps.js';
import { normalize } from './monsters.js';
import { esc, icon, confirmDialog, toast } from './ui.js';
import { t, tn } from './i18n.js';

const MAX_NEIGHBORS = 18;
const WORLD = { w: 1000, h: 700 }; // tamaño del mapa dibujado
const positions = new Map();       // posiciones de la vista de red (se conservan entre visitas)

// Lo que se está mirando; se conserva al cambiar de vista y volver.
const view = {
  mode: 'places',            // 'places' | 'people' | 'network'
  focus: null,               // ficha en el centro (personajes / red)
  other: null,               // ficha del otro extremo del hilo elegido
  trail: [],
  place: null,               // lugar elegido en el modo Lugares
  editing: false,            // "Editar mapa": arrastrar, crear y editar fichas de lugar
  mapId: M.DRAWN,            // mapa del modo Lugares: el dibujado o uno propio
  tokenSel: null,            // ficha de lugar que se está editando
  kinds: new Set(C.CODEX_KINDS),
  peopleQuery: '',
};

// ---------- Colocación automática ----------

// Fuerzas: las fichas se repelen entre sí y los hilos las atraen (algoritmo de Fruchterman–Reingold).
function forceLayout(ids, edges) {
  const P = new Map();
  ids.forEach((id, i) => {
    const old = positions.get(id);
    const a = i * 2.39996;
    const r = 70 * Math.sqrt(i + 1);
    P.set(id, old ? { ...old } : { x: Math.cos(a) * r, y: Math.sin(a) * r });
  });
  const E = edges.filter((e) => P.has(e.a) && P.has(e.b));
  const k = 190;
  const steps = 260;
  for (let step = 0; step < steps; step++) {
    const temp = 50 * (1 - step / steps) + 1;
    const disp = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < ids.length; i++) {
      const p = P.get(ids[i]);
      for (let j = i + 1; j < ids.length; j++) {
        const q = P.get(ids[j]);
        let dx = p.x - q.x;
        let dy = p.y - q.y;
        let d = Math.hypot(dx, dy);
        if (d < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = 1; }
        const f = (k * k) / d;
        const a = disp.get(ids[i]);
        const b = disp.get(ids[j]);
        a.x += (dx / d) * f; a.y += (dy / d) * f;
        b.x -= (dx / d) * f; b.y -= (dy / d) * f;
      }
    }
    for (const e of E) {
      const p = P.get(e.a);
      const q = P.get(e.b);
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = ((d * d) / k) * (1 + Math.min(4, e.weight) * 0.25);
      const a = disp.get(e.a);
      const b = disp.get(e.b);
      a.x -= (dx / d) * f; a.y -= (dy / d) * f;
      b.x += (dx / d) * f; b.y += (dy / d) * f;
    }
    for (const id of ids) {
      const p = P.get(id);
      const v = disp.get(id);
      v.x -= p.x * 0.04 * k / 10; // gravedad hacia el centro (mantiene juntas las fichas sueltas)
      v.y -= p.y * 0.04 * k / 10;
      const len = Math.max(1, Math.hypot(v.x, v.y));
      p.x += (v.x / len) * Math.min(len, temp);
      p.y += (v.y / len) * Math.min(len, temp);
    }
  }
  for (const [id, p] of P) positions.set(id, p);
  return P;
}

// Vista centrada: la ficha en el medio y sus conexiones en uno o dos anillos.
function egoLayout(focus, list) {
  const P = new Map([[focus, { x: 0, y: 0 }]]);
  const ring1 = list.slice(0, 8);
  const ring2 = list.slice(8, MAX_NEIGHBORS);
  ring1.forEach((n, i) => {
    const a = -Math.PI / 2 + (i / ring1.length) * Math.PI * 2;
    P.set(n.id, { x: Math.cos(a) * 260, y: Math.sin(a) * 260 });
  });
  ring2.forEach((n, i) => {
    const a = -Math.PI / 2 + ((i + 0.5) / ring2.length) * Math.PI * 2;
    P.set(n.id, { x: Math.cos(a) * 440, y: Math.sin(a) * 440 });
  });
  return P;
}

// ---------- Fondo: mapa topográfico esquemático de la región de Phandalin (dibujo propio, aproximado) ----------
// Las coordenadas de abajo están en "millas reales" (5 unidades = 1 milla) según lo que cuentan las guías de la
// aventura: Phandalin en las faldas de las Montañas de la Espada, el Pico Icespire a ~30 millas, el Bosque de
// Neverwinter al norte y el Sendero de Triboar a pocas millas al norte del pueblo. Después, una "lupa" agranda la
// zona de Phandalin (donde hay muchos lugares juntos) sin cambiar las direcciones: por eso el mapa no tiene escala.

const LENS = { x: 560, y: 420, gain: 1.2, reach: 400 };
function F([x, y]) {
  const dx = x - LENS.x;
  const dy = y - LENS.y;
  const d = Math.hypot(dx, dy);
  if (!d) return [x, y];
  const f = (1 + LENS.gain) / (1 + (LENS.gain * d) / LENS.reach);
  return [Math.round(LENS.x + dx * f), Math.round(LENS.y + dy * f)];
}
const FL = (pts) => pts.map(F);

const COAST = FL([[360, -300], [372, 0], [380, 60], [392, 105], [378, 180], [370, 260], [375, 330], [372, 420], [352, 500], [330, 560], [300, 640], [290, 720], [280, 1000]]);
const WOOD = FL([[420, 170], [470, 130], [560, 120], [650, 140], [700, 180], [690, 240], [640, 270], [560, 280], [480, 275], [430, 245]]);
const MERE = FL([[330, 560], [380, 560], [400, 610], [380, 680], [330, 690], [300, 640]]);
const RELIEF = [
  // Montañas de la Espada: tres curvas de nivel y la cumbre del Pico Icespire
  [1, [[380, 430], [430, 410], [500, 440], [560, 470], [640, 455], [700, 480], [720, 540], [680, 600], [600, 640], [500, 660], [420, 640], [380, 590], [370, 520]]],
  [2, [[400, 460], [450, 445], [520, 470], [590, 490], [650, 490], [680, 530], [650, 580], [580, 610], [500, 620], [430, 600], [400, 550]]],
  [3, [[420, 490], [460, 480], [520, 500], [560, 520], [600, 520], [620, 550], [590, 580], [520, 590], [460, 575], [430, 540]]],
  // Colinas de la mina Mountain's Toe
  [1, [[590, 345], [640, 340], [660, 370], [630, 395], [595, 385]]],
  // Monte Hotenow (volcán al noreste de Neverwinter)
  [1, [[405, 60], [440, 30], [480, 45], [485, 80], [450, 95], [415, 88]]],
  [2, [[425, 62], [442, 46], [465, 55], [465, 75], [445, 82], [428, 77]]],
].map(([lvl, pts]) => [lvl, FL(pts)]);

// Curva suave (Catmull-Rom) que pasa por los puntos dados.
function smooth(pts, closed = false) {
  const n = pts.length;
  const at = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return closed ? `${d} Z` : d;
}

function inside([x, y], poly) {
  let ok = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}

// Puntos repartidos dentro de un polígono (siempre los mismos, para que el dibujo no cambie).
function scatter(poly, step, margin) {
  const out = [];
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  for (let y = Math.min(...ys) + margin, row = 0; y < Math.max(...ys) - margin / 2; y += step, row++) {
    for (let x = Math.min(...xs) + margin + (row % 2) * step / 2; x < Math.max(...xs) - margin / 2; x += step) {
      const p = [x + Math.sin(x * 12.9 + y * 7.1) * step * 0.25, y + Math.cos(x * 3.7 + y * 9.3) * step * 0.25];
      const near = [[p[0] + margin, p[1]], [p[0] - margin, p[1]], [p[0], p[1] + margin], [p[0], p[1] - margin]];
      if (inside(p, poly) && near.every((q) => inside(q, poly))) out.push(p);
    }
  }
  return out;
}

function geoBackground() {
  const label = (pt, key, cls = '', rotate = 0) => {
    const [x, y] = F(pt);
    return `<text class="geo-label ${cls}" x="${x}" y="${y}"${rotate ? ` transform="rotate(${rotate} ${x} ${y})"` : ''}>${esc(t(`map.geo.${key}`))}</text>`;
  };
  const peak = (pt) => { const [x, y] = F(pt); return `<path class="geo-peak" d="M${x - 11} ${y + 9} L${x} ${y - 11} L${x + 11} ${y + 9} Z"></path>`; };
  const line = (pts, cls) => `<path class="${cls}" d="${smooth(FL(pts))}"></path>`;
  const shift = (dx) => COAST.map(([x, y]) => [x + dx, y]);
  const trees = scatter(WOOD, 20, 9).map(([x, y]) => `<path d="M${x.toFixed(0)} ${(y - 8).toFixed(0)} l6 11 h-12 Z"></path>`);
  const tufts = scatter(MERE, 18, 8).map(([x, y]) => `<path d="M${(x - 6).toFixed(0)} ${y.toFixed(0)} l3 -6 M${x.toFixed(0)} ${y.toFixed(0)} v-8 M${(x + 6).toFixed(0)} ${y.toFixed(0)} l-3 -6"></path>`);
  return `
    <g class="geo">
      <rect class="geo-sea" x="-400" y="-300" width="1800" height="1300"></rect>
      <path class="geo-depth" d="${smooth(shift(-22))}"></path>
      <path class="geo-depth" d="${smooth(shift(-55))}"></path>
      <path class="geo-land" d="${smooth(COAST)} L1400 1000 L1400 -300 Z"></path>
      ${RELIEF.map(([lvl, pts]) => `<path class="geo-contour l${lvl}" d="${smooth(pts, true)}"></path>`).join('')}
      <path class="geo-wood" d="${smooth(WOOD, true)}"></path>
      <g class="geo-trees">${trees.join('')}</g>
      <path class="geo-swamp" d="${smooth(MERE, true)}"></path>
      <g class="geo-tufts">${tufts.join('')}</g>
      ${line([[470, 90], [445, 100], [420, 104], [392, 110]], 'geo-river')}
      ${peak([454, 526])}${peak([445, 62])}
      ${line([[392, 114], [385, 180], [380, 260], [382, 330], [376, 420], [362, 500], [345, 560], [330, 640], [318, 720]], 'geo-road')}
      ${line([[380, 330], [450, 350], [520, 372], [575, 375], [640, 330], [700, 300], [780, 270], [1000, 240]], 'geo-road')}
      ${line([[560, 375], [560, 420]], 'geo-road geo-path')}
      ${label([300, 330], 'sea', 'geo-sea-label', -90)}
      ${label([590, 150], 'wood')}
      ${label([560, 655], 'mountains')}
      ${label([255, 640], 'mere', 'geo-small geo-sea-label', -72)}
      ${label([455, 20], 'hotenow', 'geo-small')}
      ${label([360, 250], 'highRoad', 'geo-road-label', -87)}
      ${label([900, 228], 'triboar', 'geo-road-label', -5)}
      <text class="geo-label geo-title" x="890" y="650">${esc(t('map.geo.coast'))}</text>
      <text class="geo-label geo-note" x="890" y="680">${esc(t('map.geo.scale'))}</text>
      <g class="geo-compass" transform="translate(950 560)"><path d="M0 -36 L10 0 L0 -8 L-10 0 Z"></path><text y="24">N</text></g>
    </g>`;
}

// ---------- Vista ----------

/** Vista general del modo Lugares, con la lista de lugares sin ubicar (paso siguiente tras importar). */
export function showPlacesOverview() {
  view.mode = 'places';
  view.place = null;
  view.editing = false;
}

export function mountMap(root, ctx, focusId = null) {
  if (focusId) {
    const c = C.get('codex', focusId);
    if (c?.kind === 'place' && (M.posOn(c, view.mapId) || c.pos)) {
      view.mode = 'places';
      view.place = focusId;
      if (!M.posOn(c, view.mapId)) view.mapId = M.DRAWN;
    }
    else if (c) { view.mode = c.kind === 'character' ? 'people' : 'network'; view.focus = focusId; view.other = null; view.trail = [focusId]; }
  }
  if (view.focus && !C.get('codex', view.focus)) { view.focus = null; view.other = null; view.trail = []; }
  if (view.place && !C.get('codex', view.place)) view.place = null;

  root.innerHTML = `
    <div class="map-layout">
      <div class="map-stage">
        <div class="map-bar">
          <div class="segmented seg-3 map-modes" role="radiogroup" aria-label="${esc(t('map.modes'))}">
            ${['places', 'people', 'network'].map((m) => `<label class="seg"><input type="radio" name="map-mode" value="${m}"${view.mode === m ? ' checked' : ''}><span>${icon({ places: 'pin', people: 'user', network: 'map' }[m])} ${esc(t(`map.mode.${m}`))}</span></label>`).join('')}
          </div>
          <div class="map-zoom">
            <button class="btn btn-icon" type="button" data-zoom="out" aria-label="${esc(t('camp.zoomOut'))}">${icon('minus')}</button>
            <button class="btn btn-icon" type="button" data-zoom="in" aria-label="${esc(t('camp.zoomIn'))}">${icon('plus')}</button>
            <button class="btn btn-icon" type="button" data-zoom="fit" aria-label="${esc(t('camp.zoomFit'))}">${icon('grid')}</button>
          </div>
        </div>
        <div class="map-subbar" data-subbar></div>
        <svg class="map-svg" data-svg role="img" aria-label="${esc(t('camp.map'))}"></svg>
        <input type="file" accept="image/*" data-map-file hidden>
      </div>
      <aside class="map-panel" data-panel></aside>
    </div>`;
  const svg = root.querySelector('[data-svg]');
  const panel = root.querySelector('[data-panel]');
  const subbar = root.querySelector('[data-subbar]');
  let g = null;      // grafo actual
  let P = null;      // posiciones de lo dibujado
  let vb = { x: 0, y: 0, w: WORLD.w, h: WORLD.h };
  let fileMode = 'new'; // el selector de imagen sirve para un mapa nuevo o para cambiar la imagen del actual
  const world = () => M.worldSize(view.mapId);
  const placedOnMap = () => C.list('codex').filter((c) => c.kind === 'place' && M.posOn(c, view.mapId));

  const entryName = (id) => C.get('codex', id)?.name || t('camp.unnamed');
  const shownKinds = (list) => list.filter((n) => view.kinds.has(C.get('codex', n.id)?.kind));

  // ---------- Dibujo ----------

  function render({ fit = true } = {}) {
    g = C.graph();
    if (view.mode === 'places') renderPlaces();
    else renderGraph();
    renderSubbar();
    renderPanel();
    if (fit) fitView(); else applyViewBox();
  }

  function renderPlaces() {
    const W = world();
    const placed = placedOnMap();
    P = new Map(placed.map((c) => [c.id, { ...M.posOn(c, view.mapId) }]));
    const edges = [...g.edges.values()].filter((e) => P.has(e.a) && P.has(e.b));
    const sel = view.place;
    const selectedNeighbors = sel ? new Set(C.neighbors(sel, g).map((n) => n.id)) : null;
    const edgeHtml = edges.map((e) => {
      const a = P.get(e.a);
      const b = P.get(e.b);
      const on = sel && (e.a === sel || e.b === sel);
      return `<line class="edge ${on ? 'selected' : 'edge-side'}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" style="stroke-width:${2 + Math.min(6, e.weight)}"></line>`;
    }).join('');
    // Fichas de lugar: icono, color y tamaño propios (o adivinados por el nombre).
    const nodeHtml = placed.map((c) => {
      const p = P.get(c.id);
      const tk = M.tokenOf(c, C.neighbors(c.id, g).length);
      const r = { s: 13, m: 18, l: 25 }[tk.size] || 18;
      const fill = M.TOKEN_COLORS[tk.color] || M.TOKEN_COLORS.green;
      const ink = ['white', 'amber'].includes(tk.color) ? '#1a2130' : '#ffffff';
      const cls = ['node', 'place-token', c.id === sel ? 'center' : '', selectedNeighbors?.has(c.id) ? 'selected' : '',
        view.editing ? 'movable' : '', c.id === view.tokenSel ? 'token-sel' : ''].join(' ');
      // tk-inner se escala con el zoom: el token se ve siempre del mismo tamaño en pantalla.
      // Prioridad del nombre cuando se tapan: el elegido, luego las fichas grandes y las más conectadas.
      const prio = (c.id === sel ? 1000 : 0) + (selectedNeighbors?.has(c.id) ? 500 : 0) + r * 10 + C.neighbors(c.id, g).length;
      return `<g class="${cls}" data-node="${esc(c.id)}" data-prio="${prio}" transform="translate(${p.x} ${p.y})"><g class="tk-inner">
        <circle r="${r}" style="fill:${fill}"></circle>
        <use href="#i-${tk.icon}" x="${-r * 0.6}" y="${-r * 0.6}" width="${r * 1.2}" height="${r * 1.2}" style="color:${ink}"></use>
        <text class="node-label" y="${r + 4}" dy="1em">${esc(c.name || t('camp.unnamed'))}</text>
      </g></g>`;
    }).join('');
    const pp = M.partyOn(view.mapId);
    const partyHtml = pp ? `<g class="party-token" data-party transform="translate(${pp.x} ${pp.y})"><g class="tk-inner">
        <circle r="22"></circle><use href="#i-party" x="-13" y="-13" width="26" height="26"></use>
        <text class="node-label" y="26" dy="1em">${esc(t('map.party'))}</text></g></g>` : '';
    const map = M.getMap(view.mapId);
    const bg = map
      ? `<rect class="geo-sea" x="-2000" y="-2000" width="${W.w + 4000}" height="${W.h + 4000}"></rect>
         <image class="map-image" href="${M.imageUrl(map)}" x="0" y="0" width="${W.w}" height="${W.h}" preserveAspectRatio="none"></image>
         <rect class="map-frame" x="0" y="0" width="${W.w}" height="${W.h}"></rect>`
      : geoBackground();
    svg.innerHTML = `${bg}<g class="edges">${edgeHtml}</g><g class="nodes">${nodeHtml}</g>${partyHtml}`;
  }

  function renderGraph() {
    let ids;
    let edges;
    if (view.focus) {
      const list = shownKinds(C.neighbors(view.focus, g)).slice(0, MAX_NEIGHBORS);
      ids = [view.focus, ...list.map((n) => n.id)];
      const shown = new Set(ids);
      edges = [...g.edges.values()].filter((e) => shown.has(e.a) && shown.has(e.b));
      P = egoLayout(view.focus, list);
    } else if (view.mode === 'people') {
      // Sin personaje elegido: solo personajes y los hilos entre ellos ("quién conoce a quién").
      ids = C.list('codex').filter((c) => c.kind === 'character').map((c) => c.id);
      const shown = new Set(ids);
      edges = [...g.edges.values()].filter((e) => shown.has(e.a) && shown.has(e.b));
      P = forceLayout(ids, edges);
    } else {
      ids = [...g.nodes.keys()].filter((id) => view.kinds.has(g.nodes.get(id).entry.kind));
      const shown = new Set(ids);
      edges = [...g.edges.values()].filter((e) => shown.has(e.a) && shown.has(e.b));
      P = forceLayout(ids, edges);
    }
    const maxMentions = Math.max(1, ...ids.map((id) => g.nodes.get(id)?.mentions || 0));
    // En las vistas generales, de lejos solo se ven los nombres de las fichas más conectadas (ver applyViewBox).
    const degree = new Map(ids.map((id) => [id, 0]));
    for (const e of edges) { degree.set(e.a, degree.get(e.a) + e.weight); degree.set(e.b, degree.get(e.b) + e.weight); }
    const major = new Set([...degree.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).filter(([, d]) => d > 0).map(([id]) => id));
    const selectedKey = view.focus && view.other ? [view.focus, view.other].sort().join('|') : null;
    const edgeHtml = edges.map((e) => {
      const a = P.get(e.a);
      const b = P.get(e.b);
      const central = view.focus && (e.a === view.focus || e.b === view.focus);
      const cls = ['edge', e.notes.length ? '' : 'edge-link', e.key === selectedKey ? 'selected' : '', view.focus && !central ? 'edge-side' : ''].join(' ');
      const width = 2 + Math.min(8, e.weight * 1.2);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return `<g data-edge="${esc(e.key)}">
        <line class="edge-hit" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>
        <line class="${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" style="stroke-width:${width}"></line>
        ${view.focus && central && e.weight ? `<g class="edge-count" transform="translate(${mid.x} ${mid.y})"><circle r="16"></circle><text dy="6">${e.weight}</text></g>` : ''}
      </g>`;
    }).join('');
    const nodeHtml = ids.map((id) => {
      const n = g.nodes.get(id);
      if (!n) return '';
      const p = P.get(id);
      const r = id === view.focus ? 46 : 24 + Math.round(14 * Math.sqrt((n.mentions || 0) / maxMentions));
      const cls = ['node', `kind-${n.entry.kind}`, id === view.focus ? 'center' : '', id === view.other ? 'selected' : '', !view.focus && !major.has(id) ? 'minor' : ''].join(' ');
      return `<g class="${cls}" data-node="${esc(id)}" transform="translate(${p.x} ${p.y})">
        <circle r="${r}"></circle>
        <use href="#i-${KIND_ICON[n.entry.kind] || 'user'}" x="${-r * 0.5}" y="${-r * 0.5}" width="${r}" height="${r}"></use>
        <text class="node-label" y="${r + 8}" dy="1em">${esc(n.entry.name || t('camp.unnamed'))}</text>
      </g>`;
    }).join('');
    svg.innerHTML = `<g class="edges">${edgeHtml}</g><g class="nodes">${nodeHtml}</g>`;
  }

  // Barra bajo los modos: migas (personajes / red), filtro por tipo, o "Ubicar lugares".
  function renderSubbar() {
    if (view.mode === 'places') {
      const party = !!M.partyOn(view.mapId);
      subbar.innerHTML = `
        <label class="map-select">${icon('map')}
          <select data-map-select aria-label="${esc(t('map.whichMap'))}">
            <option value="${M.DRAWN}"${view.mapId === M.DRAWN ? ' selected' : ''}>${esc(t('map.drawnMap'))}</option>
            ${M.listMaps().map((m) => `<option value="${esc(m.id)}"${view.mapId === m.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}
            <option value="__new">＋ ${esc(t('map.uploadMap'))}</option>
          </select>
        </label>
        <span class="spacer"></span>
        <button class="btn" type="button" data-party-toggle aria-pressed="${party}">${icon('party')}<span>${esc(t(party ? 'map.partyHide' : 'map.partyShow'))}</span></button>
        <button class="btn ${view.editing ? 'btn-primary' : ''}" type="button" data-edit aria-pressed="${view.editing}">${icon(view.editing ? 'check' : 'edit')}<span>${esc(t(view.editing ? 'map.doneEditing' : 'map.editMap'))}</span></button>`;
      return;
    }
    const crumbs = [`<button type="button" class="btn ${view.focus ? '' : 'btn-primary'}" data-overview>${icon(view.mode === 'people' ? 'user' : 'map')}<span>${esc(t(view.mode === 'people' ? 'map.allPeople' : 'camp.overview'))}</span></button>`];
    for (const id of view.trail) {
      if (!C.get('codex', id)) continue;
      crumbs.push(`<span class="trail-sep" aria-hidden="true">›</span><button type="button" class="btn ${id === view.focus ? 'btn-primary' : ''}" data-focus="${esc(id)}">${esc(entryName(id))}</button>`);
    }
    const filters = C.CODEX_KINDS.map((k) => `<button type="button" class="btn btn-icon kind-btn" data-kind="${k}" aria-pressed="${view.kinds.has(k)}" aria-label="${esc(t(`camp.kinds.${k}`))}" title="${esc(t(`camp.kinds.${k}`))}">${icon(KIND_ICON[k])}</button>`).join('');
    subbar.innerHTML = `<nav class="map-trail" aria-label="${esc(t('camp.mapTrail'))}">${crumbs.join('')}</nav>
      ${view.mode === 'network' || view.focus ? `<div class="map-kinds" role="group" aria-label="${esc(t('camp.kindFilter'))}">${filters}</div>` : ''}`;
    const trailEl = subbar.querySelector('.map-trail');
    trailEl.scrollLeft = trailEl.scrollWidth;
  }

  // ---------- Panel lateral ----------

  function entryHeader(id) {
    const c = C.get('codex', id);
    return `<header class="map-head">
      <span class="map-dot kind-${esc(c.kind)}">${icon(KIND_ICON[c.kind] || 'user')}</span>
      <div><h3>${esc(c.name || t('camp.unnamed'))}</h3><span class="hint">${esc([kindLabel(c.kind), c.subtitle].filter(Boolean).join(' · '))}</span></div>
    </header>`;
  }

  function packButton() {
    return PACKS.map((p) => `<button class="btn" type="button" data-pack="${p.id}">${icon('download')}<span>${esc(t('imp.loadPack', { name: p.name }))}</span></button>`).join('');
  }

  // Conexiones agrupadas por tipo (personajes, lugares, facciones, objetos).
  function groupedConnections(id, action) {
    const list = C.neighbors(id, g);
    if (!list.length) return `<p class="hint">${esc(t('camp.noConnections'))}</p>`;
    return ['character', 'place', 'faction', 'item'].map((kind) => {
      const items = list.filter((n) => C.get('codex', n.id)?.kind === kind);
      if (!items.length) return '';
      return `<h4>${icon(KIND_ICON[kind])} ${esc(t(`camp.kinds.${kind}`))} <span class="badge num">${items.length}</span></h4>
        <div class="map-list">${items.map((n) => {
          const c = C.get('codex', n.id);
          return `<button type="button" class="comp-item" ${action}="${esc(n.id)}">
            <span class="comp-name">${esc(c.name || t('camp.unnamed'))} <span class="badge num">${n.edge.weight}</span></span>
            ${c.subtitle ? `<span class="comp-meta">${esc(c.subtitle)}</span>` : ''}
          </button>`;
        }).join('')}</div>`;
    }).join('');
  }

  function renderPanel() {
    if (view.mode === 'places') { renderPlacesPanel(); return; }
    if (!view.focus) {
      if (view.mode === 'people') { renderPeopleList(); return; }
      renderNetworkIntro();
      return;
    }
    if (view.other) { renderThread(); return; }
    const log = C.entryLog(view.focus);
    const list = shownKinds(C.neighbors(view.focus, g));
    panel.innerHTML = `
      ${entryHeader(view.focus)}
      <div class="map-actions">
        <button class="btn" type="button" data-open-entry="${esc(view.focus)}">${icon('edit')}<span>${esc(t('camp.openEntry'))}</span></button>
        ${M.posOn(C.get('codex', view.focus) || {}, view.mapId) ? `<button class="btn" type="button" data-show-place="${esc(view.focus)}">${icon('pin')}<span>${esc(t('map.onMap'))}</span></button>` : ''}
      </div>
      <h4>${esc(t('camp.connections'))}</h4>
      ${list.length ? `<div class="map-list">${list.map((n) => {
        const c = C.get('codex', n.id);
        return `<button type="button" class="comp-item" data-thread="${esc(n.id)}">
          <span class="comp-name">${icon(KIND_ICON[c.kind] || 'user')} ${esc(c.name || t('camp.unnamed'))} <span class="badge num">${n.edge.weight}</span></span>
          <span class="comp-meta">${esc(kindLabel(c.kind))}${c.subtitle ? ` · ${esc(c.subtitle)}` : ''}</span>
        </button>`;
      }).join('')}</div>` : `<p class="hint">${esc(t('camp.noConnections'))}</p>`}
      <h4>${icon('scroll')} ${esc(t('camp.log'))}</h4>
      ${log.length ? notesHtml(log) : `<p class="hint">${esc(t('camp.noLog'))}</p>`}`;
  }

  function renderThread() {
    const e = g.edges.get([view.focus, view.other].sort().join('|'));
    const seen = new Set();
    const notes = (e?.notes || []).filter((it) => !seen.has(it.note.id) && seen.add(it.note.id));
    panel.innerHTML = `
      <div class="map-thread">${entryHeader(view.focus)}<span class="thread-link" aria-hidden="true">⟷</span>${entryHeader(view.other)}</div>
      <div class="map-actions">
        <button class="btn btn-primary" type="button" data-focus="${esc(view.other)}">${icon('map')}<span>${esc(t('camp.centerOn', { name: entryName(view.other) }))}</span></button>
        <button class="btn" type="button" data-thread-close>${icon('close')}<span>${esc(t('camp.backTo', { name: entryName(view.focus) }))}</span></button>
      </div>
      ${e?.linked ? `<p class="hint">${icon('link')} ${esc(t('camp.linkedInCodex'))}</p>` : ''}
      ${e?.stories.length ? `<div class="link-chips">${e.stories.map((st) => `<span class="link-chip"><button type="button" class="link-go" data-go-story="${esc(st.id)}">${icon('book')}<span>${esc(st.title || t('camp.untitled'))}</span></button></span>`).join('')}</div>` : ''}
      <h4>${esc(tn('camp.threadNotes', notes.length))}</h4>
      ${notes.length ? notesHtml(notes) : `<p class="hint">${esc(t('camp.noThreadNotes'))}</p>`}`;
  }

  function unplacedPlaces() {
    const onMap = new Set(placedOnMap().map((c) => c.id));
    // En el mapa dibujado, un lugar enlazado a otro ya ubicado (una posada en su pueblo) no hace falta ubicarlo.
    const inside = (c) => view.mapId === M.DRAWN && ((c.links || []).some((l) => onMap.has(l))
      || C.list('codex').some((o) => onMap.has(o.id) && (o.links || []).includes(c.id)));
    return C.list('codex').filter((c) => c.kind === 'place' && !onMap.has(c.id) && !inside(c))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  function unplacedHtml() {
    const unplaced = unplacedPlaces();
    return unplaced.length ? `
      <h4>${icon('pin')} ${esc(t('map.unplaced'))} <span class="badge num">${unplaced.length}</span></h4>
      <p class="hint">${esc(t('map.unplacedHint'))}</p>
      <div class="link-chips">${unplaced.map((c) => `<span class="link-chip"><button type="button" class="link-go" data-place-it="${esc(c.id)}">${icon('plus')}<span>${esc(c.name || t('camp.unnamed'))}</span></button></span>`).join('')}</div>` : '';
  }

  // Edición de una ficha de lugar: nombre, icono, color, tamaño, quitar del mapa.
  function tokenEditor(id) {
    const c = C.get('codex', id);
    const tk = M.tokenOf(c, C.neighbors(id, g).length);
    return `
      <h3>${icon('edit')} ${esc(t('map.editToken'))}</h3>
      <label class="field"><span>${esc(t('entry.name'))}</span><input data-tk-name value="${esc(c.name || '')}" maxlength="100"></label>
      <div class="field"><span>${esc(t('map.tokenIcon'))}</span>
        <div class="token-icons">${M.TOKEN_ICONS.map((i) => `<button type="button" class="btn btn-icon" data-tk-icon="${i}" aria-pressed="${tk.icon === i}" aria-label="${esc(t(`map.icons.${i}`))}" title="${esc(t(`map.icons.${i}`))}">${icon(i)}</button>`).join('')}</div>
      </div>
      <div class="field"><span>${esc(t('map.tokenColor'))}</span>
        <div class="token-colors">${Object.entries(M.TOKEN_COLORS).map(([k, v]) => `<button type="button" class="swatch" data-tk-color="${k}" aria-pressed="${tk.color === k}" aria-label="${esc(t(`map.colors.${k}`))}" title="${esc(t(`map.colors.${k}`))}" style="--swatch:${v}"></button>`).join('')}</div>
      </div>
      <div class="field"><span>${esc(t('map.tokenSize'))}</span>
        <div class="segmented" role="radiogroup">${['s', 'm', 'l'].map((z) => `<label class="seg"><input type="radio" name="tk-size" value="${z}"${tk.size === z ? ' checked' : ''}><span>${esc(t(`map.sizes.${z}`))}</span></label>`).join('')}</div>
      </div>
      <div class="map-actions">
        <button class="btn" type="button" data-open-entry="${esc(id)}">${icon('book')}<span>${esc(t('camp.openEntry'))}</span></button>
        <button class="btn btn-danger" type="button" data-tk-remove>${icon('trash')}<span>${esc(t('map.removeFromMap'))}</span></button>
        <button class="btn btn-primary" type="button" data-tk-done>${icon('check')}<span>${esc(t('map.doneEditing'))}</span></button>
      </div>`;
  }

  function mapManager() {
    const map = M.getMap(view.mapId);
    if (!map) return `<p class="hint">${esc(t('map.ownMapHint'))}</p>
      <button class="btn" type="button" data-upload-map>${icon('upload')}<span>${esc(t('map.uploadMap'))}</span></button>`;
    return `
      <h4>${icon('map')} ${esc(t('map.thisMap'))}</h4>
      <label class="field"><span>${esc(t('map.mapName'))}</span><input data-map-name value="${esc(map.name)}" maxlength="80"></label>
      <div class="map-actions">
        <button class="btn" type="button" data-replace-map>${icon('upload')}<span>${esc(t('map.replaceImage'))}</span></button>
        <button class="btn btn-danger" type="button" data-delete-map>${icon('trash')}<span>${esc(t('map.deleteMap'))}</span></button>
      </div>
      <p class="hint">${esc(t('map.ownMapHint'))}</p>`;
  }

  function renderPlacesPanel() {
    if (view.editing) {
      panel.innerHTML = view.tokenSel && C.get('codex', view.tokenSel)
        ? tokenEditor(view.tokenSel)
        : `<h3>${icon('edit')} ${esc(t('map.editMap'))}</h3>
           <p class="hint">${esc(t('map.editIntro'))}</p>
           ${unplacedHtml()}
           ${mapManager()}`;
      return;
    }
    if (!view.place) {
      const placed = placedOnMap().map((c) => ({ c, n: C.neighbors(c.id, g).length })).sort((a, b) => b.n - a.n).slice(0, 10);
      panel.innerHTML = `
        <h3>${icon('pin')} ${esc(t('map.mode.places'))}</h3>
        <p class="hint">${esc(t('map.placesIntro'))}</p>
        ${C.list('codex').length ? '' : `<div class="map-actions">${packButton()}</div>`}
        ${placed.length ? `<h4>${esc(t('map.busiest'))}</h4><div class="map-list">${placed.map(({ c, n }) => `
          <button type="button" class="comp-item" data-select-place="${esc(c.id)}">
            <span class="comp-name">${esc(c.name)} <span class="badge num">${n}</span></span>
            ${c.subtitle ? `<span class="comp-meta">${esc(c.subtitle)}</span>` : ''}
          </button>`).join('')}</div>` : ''}
        ${unplacedHtml()}
        ${M.getMap(view.mapId) ? '' : `<div class="map-actions"><button class="btn" type="button" data-upload-map>${icon('upload')}<span>${esc(t('map.uploadMap'))}</span></button></div>`}
        ${C.list('codex').length ? `<div class="map-actions">${packButton()}</div>` : ''}`;
      return;
    }
    const log = C.entryLog(view.place);
    panel.innerHTML = `
      ${entryHeader(view.place)}
      <div class="map-actions">
        <button class="btn" type="button" data-open-entry="${esc(view.place)}">${icon('edit')}<span>${esc(t('camp.openEntry'))}</span></button>
        <button class="btn" type="button" data-network="${esc(view.place)}">${icon('map')}<span>${esc(t('map.seeNetwork'))}</span></button>
        <button class="btn btn-icon" type="button" data-select-place="" aria-label="${esc(t('common.close'))}">${icon('close')}</button>
      </div>
      <h4>${esc(t('map.connectedHere'))}</h4>
      ${groupedConnections(view.place, 'data-person')}
      <h4>${icon('scroll')} ${esc(t('camp.log'))}</h4>
      ${log.length ? notesHtml(log) : `<p class="hint">${esc(t('camp.noLog'))}</p>`}`;
  }

  function renderPeopleList() {
    const q = normalize(view.peopleQuery.trim());
    const people = C.list('codex').filter((c) => c.kind === 'character')
      .map((c) => ({ c, list: C.neighbors(c.id, g) }))
      .filter(({ c }) => !q || normalize(`${c.name} ${(c.aliases || []).join(' ')} ${c.subtitle || ''}`).includes(q))
      .sort((a, b) => b.list.length - a.list.length || (a.c.name || '').localeCompare(b.c.name || ''));
    panel.innerHTML = `
      <h3>${icon('user')} ${esc(t('map.mode.people'))}</h3>
      <p class="hint">${esc(t('map.peopleIntro'))}</p>
      <input type="search" data-people-q autocomplete="off" value="${esc(view.peopleQuery)}" placeholder="${esc(t('map.findPerson'))}" aria-label="${esc(t('map.findPerson'))}">
      <div class="map-list" data-people-list>${people.length ? people.map(({ c, list }) => `
        <button type="button" class="comp-item" data-focus="${esc(c.id)}">
          <span class="comp-name">${esc(c.name || t('camp.unnamed'))} <span class="badge num">${list.length}</span></span>
          ${c.subtitle ? `<span class="comp-meta">${esc(c.subtitle)}</span>` : ''}
        </button>`).join('') : `<p class="hint">${esc(t(C.list('codex').length ? 'comp.empty' : 'map.noPeople'))}</p>`}</div>
      ${C.list('codex').length ? '' : `<div class="map-actions">${packButton()}</div>`}`;
  }

  function renderNetworkIntro() {
    const ranked = [...g.nodes.values()]
      .map((n) => ({ n, w: C.neighbors(n.id, g).reduce((sum, x) => sum + x.edge.weight, 0) }))
      .filter((x) => x.w > 0 || x.n.mentions > 0)
      .sort((a, b) => b.w - a.w || b.n.mentions - a.n.mentions)
      .slice(0, 12);
    panel.innerHTML = `
      <h3>${icon('map')} ${esc(t('camp.map'))}</h3>
      <p class="hint">${esc(t('camp.mapIntro'))}</p>
      ${g.nodes.size ? '' : `<div class="map-actions">${packButton()}</div>`}
      ${ranked.length ? `<h4>${esc(t('camp.mostConnected'))}</h4><div class="map-list">${ranked.map(({ n }) => `
        <button type="button" class="comp-item" data-focus="${esc(n.id)}">
          <span class="comp-name">${icon(KIND_ICON[n.entry.kind] || 'user')} ${esc(n.entry.name || t('camp.unnamed'))}</span>
          <span class="comp-meta">${esc(tn('camp.threads', C.neighbors(n.id, g).length))} · ${esc(tn('camp.mentions', n.mentions))}</span>
        </button>`).join('')}</div>` : ''}`;
  }

  // ---------- Navegación dentro del mapa ----------

  function setMode(mode) {
    view.mode = mode;
    view.focus = null; // cada modo empieza en su vista general
    view.other = null;
    view.trail = [];
    if (mode === 'places') { view.editing = false; view.tokenSel = null; }
    for (const input of root.querySelectorAll('input[name=map-mode]')) input.checked = input.value === mode;
    render();
  }

  function focusOn(id, mode = view.mode === 'places' ? 'network' : view.mode) {
    if (!C.get('codex', id)) return;
    if (mode !== view.mode) setModeSilently(mode);
    const i = view.trail.indexOf(id);
    view.trail = i === -1 ? [...view.trail, id].slice(-6) : view.trail.slice(0, i + 1);
    view.focus = id;
    view.other = null;
    render();
  }

  function setModeSilently(mode) {
    view.mode = mode;
    for (const input of root.querySelectorAll('input[name=map-mode]')) input.checked = input.value === mode;
  }

  function selectThread(id) {
    view.other = id === view.other ? null : id;
    render({ fit: false });
    panel.scrollTop = 0;
  }

  function onTap(target, point) {
    const node = target.closest?.('[data-node]');
    if (view.mode === 'places') {
      if (target.closest?.('[data-party]')) return;
      if (node && view.editing) { view.tokenSel = node.dataset.node; render({ fit: false }); panel.scrollTop = 0; return; }
      if (node) { view.place = node.dataset.node === view.place ? null : node.dataset.node; render({ fit: false }); panel.scrollTop = 0; return; }
      if (view.editing && point) {
        // Tocar un espacio vacío en modo edición: nuevo lugar ahí mismo.
        const W = world();
        const pos = { x: Math.round(Math.max(0, Math.min(W.w, point.x))), y: Math.round(Math.max(0, Math.min(W.h, point.y))) };
        const c = C.create('codex', { kind: 'place', name: t('map.newPlace'), aliases: [], subtitle: '', tags: [], description: '', links: [], ...M.posPatch({}, view.mapId, pos) });
        view.tokenSel = c.id;
        render({ fit: false });
        const name = panel.querySelector('[data-tk-name]');
        name?.focus();
        name?.select();
      }
      return;
    }
    if (node) {
      const id = node.dataset.node;
      if (!view.focus) focusOn(id);
      else if (id === view.focus) { view.other = null; render({ fit: false }); }
      else if (id === view.other) focusOn(id); // segundo toque: centrar en esa ficha
      else selectThread(id);
      return;
    }
    const edge = target.closest?.('[data-edge]');
    if (edge && view.focus) {
      const [a, b] = edge.dataset.edge.split('|');
      if (a === view.focus) selectThread(b);
      else if (b === view.focus) selectThread(a);
    }
  }

  // ---------- Zoom, desplazamiento y mover lugares ----------

  function applyViewBox() {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const k = vb.w / Math.max(1, svg.clientWidth);
    svg.style.setProperty('--k', k); // textos siempre a 18 px en pantalla
    svg.classList.toggle('zoomed-out', k > 1.15); // de lejos se ocultan los nombres menos importantes
    if (view.mode === 'places') declutterSoon();
  }

  // Modo Lugares: si dos nombres se tapan, se oculta el de menos prioridad (vuelve a verse al acercar o al tocar la ficha).
  let declutterFrame = 0;
  function declutterSoon() {
    cancelAnimationFrame(declutterFrame);
    declutterFrame = requestAnimationFrame(() => {
      const nodes = [...svg.querySelectorAll('.place-token')].sort((a, b) => b.dataset.prio - a.dataset.prio);
      const boxes = nodes.map((n) => n.querySelector('circle').getBoundingClientRect());
      const kept = [];
      nodes.forEach((n, idx) => {
        const label = n.querySelector('.node-label');
        label.classList.remove('lbl-hidden');
        const r = label.getBoundingClientRect();
        const hit = (b) => r.left < b.right - 2 && r.right > b.left + 2 && r.top < b.bottom - 2 && r.bottom > b.top + 2;
        const clash = kept.some(hit) || boxes.slice(0, idx).some(hit); // fichas más importantes que esta
        if (clash) label.classList.add('lbl-hidden');
        else kept.push(r);
      });
    });
  }

  function fitView() {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    let minX; let maxX; let minY; let maxY;
    if (view.mode === 'places') {
      const W = world();
      [minX, minY, maxX, maxY] = view.mapId === M.DRAWN ? [200, 0, W.w, W.h + 50] : [-20, -20, W.w + 20, W.h + 20];
    } else {
      const pts = [...(P?.values() || [])];
      minX = Math.min(...pts.map((p) => p.x), -100) - 120;
      maxX = Math.max(...pts.map((p) => p.x), 100) + 120;
      minY = Math.min(...pts.map((p) => p.y), -100) - 100;
      maxY = Math.max(...pts.map((p) => p.y), 100) + 140;
    }
    let w = maxX - minX;
    let h = maxY - minY;
    const aspect = rect.width / rect.height;
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    vb = { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h };
    applyViewBox();
  }

  function zoom(factor, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) {
    const w = Math.min(20000, Math.max(150, vb.w * factor));
    const f = w / vb.w;
    vb = { x: cx - (cx - vb.x) * f, y: cy - (cy - vb.y) * f, w, h: vb.h * f };
    applyViewBox();
  }

  const toWorld = (clientX, clientY) => {
    const r = svg.getBoundingClientRect();
    return { x: vb.x + ((clientX - r.left) / r.width) * vb.w, y: vb.y + ((clientY - r.top) / r.height) * vb.h };
  };

  const pointers = new Map();
  let downTarget = null;
  let moved = false;
  let pinchDist = 0;
  let dragPlace = null; // { id, el, pos } mientras se mueve un lugar (o el grupo: id = null)
  let lastPoint = null;

  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      downTarget = e.target;
      moved = false;
      lastPoint = toWorld(e.clientX, e.clientY);
      const node = e.target.closest?.('[data-node]');
      const partyEl = e.target.closest?.('[data-party]');
      if (view.mode === 'places' && partyEl) dragPlace = { id: null, el: partyEl }; // el grupo se mueve siempre
      else if (view.mode === 'places' && view.editing && node) dragPlace = { id: node.dataset.node, el: node };
    }
    if (pointers.size === 2) {
      dragPlace = null;
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      moved = true;
    }
  });
  svg.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pointers.size === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      if (dragPlace) {
        const p = toWorld(cur.x, cur.y);
        const W = world();
        dragPlace.pos = { x: Math.round(Math.max(0, Math.min(W.w, p.x))), y: Math.round(Math.max(0, Math.min(W.h, p.y))) };
        dragPlace.el.setAttribute('transform', `translate(${dragPlace.pos.x} ${dragPlace.pos.y})`);
      } else {
        const r = svg.getBoundingClientRect();
        vb.x -= (dx / r.width) * vb.w;
        vb.y -= (dy / r.height) * vb.h;
        applyViewBox();
      }
    } else if (pointers.size === 2) {
      pointers.set(e.pointerId, cur);
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (pinchDist) zoom(pinchDist / dist, mid.x, mid.y);
      pinchDist = dist;
      return;
    }
    pointers.set(e.pointerId, cur);
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (dragPlace?.pos && e.type === 'pointerup') {
      if (dragPlace.id) {
        const entry = C.get('codex', dragPlace.id);
        C.update('codex', dragPlace.id, M.posPatch(entry, view.mapId, dragPlace.pos), { debounce: false }); // vuelve a dibujar el mapa
      } else {
        M.setParty(view.mapId, dragPlace.pos).then(() => renderSubbar());
      }
    } else if (pointers.size === 0 && !moved && downTarget && e.type === 'pointerup') {
      onTap(downTarget, lastPoint);
    }
    if (pointers.size === 0) dragPlace = null;
    if (pointers.size < 2) pinchDist = 0;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = toWorld(e.clientX, e.clientY);
    zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  }, { passive: false });

  root.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.name === 'map-mode') { setMode(el.value); return; }
    if (el.matches('[data-map-select]')) {
      if (el.value === '__new') { el.value = view.mapId; fileMode = 'new'; root.querySelector('[data-map-file]').click(); return; }
      view.mapId = el.value;
      view.place = null;
      view.tokenSel = null;
      M.setLastMap(view.mapId);
      render();
      return;
    }
    if (el.matches('[data-map-file]')) {
      const file = el.files[0];
      el.value = '';
      if (!file) return;
      try {
        if (fileMode === 'replace') await M.replaceImage(view.mapId, file);
        else {
          const m = await M.addMap(file, file.name.replace(/\.[^.]+$/, ''));
          view.mapId = m.id;
          view.editing = true;
          view.tokenSel = null;
          M.setLastMap(m.id);
          toast(t('map.mapAdded'), { duration: 6000, group: 'map' });
        }
      } catch (err) {
        toast(t('imp.fileError', { msg: err.message }), { kind: 'error', duration: 0 });
      }
      render();
      return;
    }
    if (el.matches('[data-tk-name]') && view.tokenSel) {
      C.update('codex', view.tokenSel, { name: el.value.trim() || t('map.newPlace') }, { debounce: false });
      return;
    }
    if (el.name === 'tk-size' && view.tokenSel) {
      const c = C.get('codex', view.tokenSel);
      C.update('codex', c.id, { token: { ...(c.token || {}), size: el.value } }, { debounce: false });
      return;
    }
    if (el.matches('[data-map-name]')) { await M.renameMap(view.mapId, el.value.trim() || t('map.untitledMap')); renderSubbar(); }
  });
  root.addEventListener('input', (e) => {
    if (!e.target.matches('[data-people-q]')) return;
    view.peopleQuery = e.target.value;
    const pos = e.target.selectionStart;
    renderPeopleList();
    const input = panel.querySelector('[data-people-q]');
    input.focus();
    input.setSelectionRange(pos, pos);
  });

  root.addEventListener('click', async (e) => {
    const z = e.target.closest('[data-zoom]');
    if (z) { if (z.dataset.zoom === 'fit') fitView(); else zoom(z.dataset.zoom === 'in' ? 0.8 : 1.25); return; }
    if (e.target.closest('[data-edit]')) { view.editing = !view.editing; view.tokenSel = null; render({ fit: false }); return; }
    if (e.target.closest('[data-upload-map]')) { fileMode = 'new'; root.querySelector('[data-map-file]').click(); return; }
    if (e.target.closest('[data-replace-map]')) { fileMode = 'replace'; root.querySelector('[data-map-file]').click(); return; }
    if (e.target.closest('[data-delete-map]')) {
      const map = M.getMap(view.mapId);
      if (!map || !(await confirmDialog(t('map.deleteMapConfirm', { name: map.name }), { yes: t('map.deleteMap') }))) return;
      for (const c of C.list('codex')) if (c.mapPos?.[map.id]) C.update('codex', c.id, M.posPatch(c, map.id, null), { debounce: false });
      await M.deleteMap(map.id);
      view.mapId = M.DRAWN;
      M.setLastMap(M.DRAWN);
      render();
      return;
    }
    if (e.target.closest('[data-party-toggle]')) {
      if (M.partyOn(view.mapId)) await M.setParty(view.mapId, null);
      else {
        const W = world();
        await M.setParty(view.mapId, { x: Math.round(Math.max(20, Math.min(W.w - 20, vb.x + vb.w / 2))), y: Math.round(Math.max(20, Math.min(W.h - 20, vb.y + vb.h / 2))) });
      }
      render({ fit: false });
      return;
    }
    const tkIcon = e.target.closest('[data-tk-icon]');
    if (tkIcon && view.tokenSel) {
      const c = C.get('codex', view.tokenSel);
      C.update('codex', c.id, { token: { ...(c.token || {}), icon: tkIcon.dataset.tkIcon } }, { debounce: false });
      return;
    }
    const tkColor = e.target.closest('[data-tk-color]');
    if (tkColor && view.tokenSel) {
      const c = C.get('codex', view.tokenSel);
      C.update('codex', c.id, { token: { ...(c.token || {}), color: tkColor.dataset.tkColor } }, { debounce: false });
      return;
    }
    if (e.target.closest('[data-tk-remove]') && view.tokenSel) {
      const c = C.get('codex', view.tokenSel);
      view.tokenSel = null;
      C.update('codex', c.id, M.posPatch(c, view.mapId, null), { debounce: false });
      return;
    }
    if (e.target.closest('[data-tk-done]')) { view.tokenSel = null; render({ fit: false }); return; }
    if (e.target.closest('[data-overview]')) { view.focus = null; view.other = null; view.trail = []; render(); return; }
    const kind = e.target.closest('[data-kind]');
    if (kind) {
      const k = kind.dataset.kind;
      if (view.kinds.has(k) && view.kinds.size > 1) view.kinds.delete(k); else view.kinds.add(k);
      render({ fit: !view.focus });
      return;
    }
    const pack = e.target.closest('[data-pack]');
    if (pack) { if (await confirmAndImportPack(pack.dataset.pack, confirmDialog)) render(); return; }
    const sp = e.target.closest('[data-select-place]');
    if (sp) { view.place = sp.dataset.selectPlace || null; render({ fit: false }); panel.scrollTop = 0; return; }
    const show = e.target.closest('[data-show-place]');
    if (show) { view.place = show.dataset.showPlace; setMode('places'); return; }
    const placeIt = e.target.closest('[data-place-it]');
    if (placeIt) {
      // Lo pone en el centro de lo que se ve; luego se arrastra a su sitio.
      const W = world();
      const cx = Math.round(Math.max(20, Math.min(W.w - 20, vb.x + vb.w / 2)));
      const cy = Math.round(Math.max(20, Math.min(W.h - 20, vb.y + vb.h / 2)));
      view.editing = true;
      view.tokenSel = placeIt.dataset.placeIt;
      const entry = C.get('codex', placeIt.dataset.placeIt);
      C.update('codex', entry.id, M.posPatch(entry, view.mapId, { x: cx, y: cy }), { debounce: false });
      return;
    }
    const person = e.target.closest('[data-person]');
    if (person) {
      const c = C.get('codex', person.dataset.person);
      if (c?.kind === 'place' && M.posOn(c, view.mapId)) { view.place = c.id; render({ fit: false }); }
      else focusOn(person.dataset.person, c?.kind === 'character' ? 'people' : 'network');
      return;
    }
    const net = e.target.closest('[data-network]');
    if (net) { view.trail = []; focusOn(net.dataset.network, 'network'); return; }
    const f = e.target.closest('[data-focus]');
    if (f) { focusOn(f.dataset.focus); return; }
    const th = e.target.closest('[data-thread]');
    if (th) { selectThread(th.dataset.thread); return; }
    if (e.target.closest('[data-thread-close]')) { view.other = null; render({ fit: false }); return; }
    const mention = e.target.closest('[data-go-codex]');
    if (mention) {
      const c = C.get('codex', mention.dataset.goCodex);
      if (view.mode === 'places' && c?.kind === 'place' && M.posOn(c, view.mapId)) { view.place = c.id; render({ fit: false }); }
      else focusOn(mention.dataset.goCodex, c?.kind === 'character' ? 'people' : 'network');
      return;
    }
    const open = e.target.closest('[data-open-entry]');
    if (open) { ctx.navigate('codex', open.dataset.openEntry); return; }
    const session = e.target.closest('[data-go-session]');
    if (session) { ctx.navigate('sessions', session.dataset.goSession); return; }
    const story = e.target.closest('[data-go-story]');
    if (story) ctx.navigate('storylines', story.dataset.goStory);
  });

  new ResizeObserver(() => fitView()).observe(svg);
  render();
  // Mapas propios: se cargan de la tablet y se vuelve al último mapa usado.
  M.loadMaps().then(async () => {
    if (!focusId) view.mapId = (await M.lastMap()) || view.mapId;
    if (view.mapId !== M.DRAWN && !M.getMap(view.mapId)) view.mapId = M.DRAWN;
    if (root.isConnected) render();
  });

  return {
    update(what) {
      if (what === 'codex' || what === 'sessions' || what === 'storylines') render({ fit: false });
    },
    show(id) { if (id) focusOn(id); },
  };
}
