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
import { normalize } from './monsters.js';
import { esc, icon, confirmDialog } from './ui.js';
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
  editing: false,            // "Ubicar lugares": arrastrar para mover
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

// ---------- Fondo: mapa dibujado de la Costa de la Espada (dibujo propio, aproximado) ----------

function geoBackground() {
  const trees = [];
  for (let i = 0; i < 60; i++) {
    const a = i * 2.39996;
    const r = 18 * Math.sqrt(i);
    const x = 500 + Math.cos(a) * r * 1.9;
    const y = 160 + Math.sin(a) * r * 0.85;
    if (x > 330 && x < 700) trees.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="11"></circle>`);
  }
  const peaks = [];
  const mountains = [[330, 300], [365, 345], [300, 360], [345, 400], [390, 420], [320, 440], [370, 480], [410, 510], [455, 470], [280, 410], [395, 260], [355, 225], [300, 300], [435, 390]];
  for (const [x, y] of mountains) peaks.push(`<path d="M${x - 22} ${y + 16} L${x} ${y - 22} L${x + 22} ${y + 16} Z"></path>`);
  const label = (x, y, key, cls = '', rotate = 0) => `<text class="geo-label ${cls}" x="${x}" y="${y}"${rotate ? ` transform="rotate(${rotate} ${x} ${y})"` : ''}>${esc(t(`map.geo.${key}`))}</text>`;
  return `
    <g class="geo">
      <rect class="geo-sea" x="-400" y="-300" width="1800" height="1300"></rect>
      <path class="geo-land" d="M265 -300 L262 0 L250 60 L226 100 L214 145 L230 190 L198 240 L170 282 L160 330 L182 382 L150 432 L130 500 L142 560 L118 622 L128 1000 L1400 1000 L1400 -300 Z"></path>
      <path class="geo-swamp" d="M128 520 C160 500 220 510 235 545 C250 590 205 625 160 620 C135 615 120 580 128 520 Z"></path>
      <g class="geo-forest">${trees.join('')}</g>
      <g class="geo-mountains">${peaks.join('')}</g>
      <path class="geo-road" d="M238 105 L216 170 L190 250 L176 330 L166 420 L150 520 L146 700"></path>
      <path class="geo-road" d="M238 105 L350 148 L460 212 L600 228 L760 208 L1000 190"></path>
      <path class="geo-road geo-path" d="M430 205 L470 290 L520 385 L565 525"></path>
      ${label(70, 430, 'sea', 'geo-sea-label', -90)}
      ${label(500, 70, 'wood')}
      ${label(250, 520, 'mountains')}
      ${label(185, 660, 'mere')}
      ${label(205, 470, 'highRoad', 'geo-road-label')}
      ${label(800, 180, 'triboar', 'geo-road-label')}
      ${label(820, 640, 'coast', 'geo-title')}
      <g class="geo-compass" transform="translate(950 560)"><path d="M0 -36 L10 0 L0 -8 L-10 0 Z"></path><text y="24">N</text></g>
    </g>`;
}

// ---------- Vista ----------

export function mountMap(root, ctx, focusId = null) {
  if (focusId) {
    const c = C.get('codex', focusId);
    if (c?.kind === 'place' && c.pos) { view.mode = 'places'; view.place = focusId; }
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
      </div>
      <aside class="map-panel" data-panel></aside>
    </div>`;
  const svg = root.querySelector('[data-svg]');
  const panel = root.querySelector('[data-panel]');
  const subbar = root.querySelector('[data-subbar]');
  let g = null;      // grafo actual
  let P = null;      // posiciones de lo dibujado
  let vb = { x: 0, y: 0, w: WORLD.w, h: WORLD.h };

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
    const placed = C.list('codex').filter((c) => c.kind === 'place' && c.pos);
    P = new Map(placed.map((c) => [c.id, { x: c.pos.x, y: c.pos.y }]));
    const edges = [...g.edges.values()].filter((e) => P.has(e.a) && P.has(e.b));
    const links = (id) => C.neighbors(id, g).length;
    const sel = view.place;
    const selectedNeighbors = sel ? new Set(C.neighbors(sel, g).map((n) => n.id)) : null;
    const edgeHtml = edges.map((e) => {
      const a = P.get(e.a);
      const b = P.get(e.b);
      const on = sel && (e.a === sel || e.b === sel);
      return `<line class="edge ${on ? 'selected' : 'edge-side'}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" style="stroke-width:${2 + Math.min(6, e.weight)}"></line>`;
    }).join('');
    const nodeHtml = placed.map((c) => {
      const p = P.get(c.id);
      const n = links(c.id);
      const r = 13 + Math.min(9, Math.round(Math.sqrt(n) * 3));
      const cls = ['node', 'kind-place', c.id === sel ? 'center' : '', selectedNeighbors?.has(c.id) ? 'selected' : '', view.editing ? 'movable' : ''].join(' ');
      return `<g class="${cls}" data-node="${esc(c.id)}" transform="translate(${p.x} ${p.y})">
        <circle r="${r}"></circle>
        <use href="#i-pin" x="${-r * 0.55}" y="${-r * 0.55}" width="${r * 1.1}" height="${r * 1.1}"></use>
        <text class="node-label" y="${r + 6}" dy="1em">${esc(c.name || t('camp.unnamed'))}</text>
      </g>`;
    }).join('');
    svg.innerHTML = `${geoBackground()}<g class="edges">${edgeHtml}</g><g class="nodes">${nodeHtml}</g>`;
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
      subbar.innerHTML = `
        <span class="hint">${esc(t(view.editing ? 'map.editingHint' : 'map.placesHint'))}</span>
        <button class="btn ${view.editing ? 'btn-primary' : ''}" type="button" data-edit aria-pressed="${view.editing}">${icon('pin')}<span>${esc(t(view.editing ? 'map.doneEditing' : 'map.editPlaces'))}</span></button>`;
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
        ${C.get('codex', view.focus)?.pos ? `<button class="btn" type="button" data-show-place="${esc(view.focus)}">${icon('pin')}<span>${esc(t('map.onMap'))}</span></button>` : ''}
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

  function renderPlacesPanel() {
    // Sin posición y sin enlace a un lugar ubicado (una posada enlazada a su pueblo no hace falta ubicarla).
    const placedIds = new Set(C.list('codex').filter((c) => c.kind === 'place' && c.pos).map((c) => c.id));
    const inside = (c) => (c.links || []).some((l) => placedIds.has(l))
      || C.list('codex').some((o) => placedIds.has(o.id) && (o.links || []).includes(c.id));
    const unplaced = C.list('codex').filter((c) => c.kind === 'place' && !c.pos && !inside(c))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const unplacedHtml = unplaced.length && (view.editing || !view.place) ? `
      <h4>${icon('pin')} ${esc(t('map.unplaced'))} <span class="badge num">${unplaced.length}</span></h4>
      <p class="hint">${esc(t('map.unplacedHint'))}</p>
      <div class="link-chips">${unplaced.map((c) => `<span class="link-chip"><button type="button" class="link-go" data-place-it="${esc(c.id)}">${icon('plus')}<span>${esc(c.name || t('camp.unnamed'))}</span></button></span>`).join('')}</div>` : '';
    if (!view.place) {
      const placed = C.list('codex').filter((c) => c.kind === 'place' && c.pos)
        .map((c) => ({ c, n: C.neighbors(c.id, g).length })).sort((a, b) => b.n - a.n).slice(0, 10);
      panel.innerHTML = `
        <h3>${icon('pin')} ${esc(t('map.mode.places'))}</h3>
        <p class="hint">${esc(t('map.placesIntro'))}</p>
        ${C.list('codex').length ? '' : `<div class="map-actions">${packButton()}</div>`}
        ${placed.length ? `<h4>${esc(t('map.busiest'))}</h4><div class="map-list">${placed.map(({ c, n }) => `
          <button type="button" class="comp-item" data-select-place="${esc(c.id)}">
            <span class="comp-name">${esc(c.name)} <span class="badge num">${n}</span></span>
            ${c.subtitle ? `<span class="comp-meta">${esc(c.subtitle)}</span>` : ''}
          </button>`).join('')}</div>` : ''}
        ${unplacedHtml}
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
      ${log.length ? notesHtml(log) : `<p class="hint">${esc(t('camp.noLog'))}</p>`}
      ${unplacedHtml}`;
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
    if (mode === 'places') view.editing = false;
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

  function onTap(target) {
    const node = target.closest?.('[data-node]');
    if (view.mode === 'places') {
      if (node && !view.editing) { view.place = node.dataset.node === view.place ? null : node.dataset.node; render({ fit: false }); panel.scrollTop = 0; }
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
  }

  function fitView() {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    let minX; let maxX; let minY; let maxY;
    if (view.mode === 'places') {
      [minX, minY, maxX, maxY] = [-10, 20, WORLD.w - 10, WORLD.h];
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
  let dragPlace = null; // { id, el, start } mientras se mueve un lugar

  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      downTarget = e.target;
      moved = false;
      const node = e.target.closest?.('[data-node]');
      if (view.mode === 'places' && view.editing && node) dragPlace = { id: node.dataset.node, el: node };
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
        dragPlace.pos = { x: Math.round(Math.max(0, Math.min(WORLD.w, p.x))), y: Math.round(Math.max(0, Math.min(WORLD.h, p.y))) };
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
      C.update('codex', dragPlace.id, { pos: dragPlace.pos }, { debounce: false }); // vuelve a dibujar el mapa
    } else if (pointers.size === 0 && !moved && downTarget && e.type === 'pointerup') {
      onTap(downTarget);
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

  root.addEventListener('change', (e) => {
    if (e.target.name === 'map-mode') setMode(e.target.value);
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
    if (e.target.closest('[data-edit]')) { view.editing = !view.editing; render({ fit: false }); return; }
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
      const cx = Math.round(Math.max(20, Math.min(WORLD.w - 20, vb.x + vb.w / 2)));
      const cy = Math.round(Math.max(20, Math.min(WORLD.h - 20, vb.y + vb.h / 2)));
      view.editing = true;
      view.place = placeIt.dataset.placeIt;
      C.update('codex', placeIt.dataset.placeIt, { pos: { x: cx, y: cy } }, { debounce: false });
      return;
    }
    const person = e.target.closest('[data-person]');
    if (person) {
      const c = C.get('codex', person.dataset.person);
      if (c?.kind === 'place' && c.pos) { view.place = c.id; render({ fit: false }); }
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
      if (view.mode === 'places' && c?.kind === 'place' && c.pos) { view.place = c.id; render({ fit: false }); }
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

  return {
    update(what) {
      if (what === 'codex' || what === 'sessions' || what === 'storylines') render({ fit: false });
    },
    show(id) { if (id) focusOn(id); },
  };
}
