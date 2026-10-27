// Vista "Mapa" de la Campaña: las fichas de la bitácora como nodos y los "hilos" entre ellas.
// Un hilo aparece cuando un punto de las notas de sesión nombra a dos fichas (un sub-punto hereda las de su
// punto padre), cuando una ficha enlaza a otra, o cuando una línea de historia las involucra.
//
// - Vista general: todas las fichas, colocadas automáticamente (las más conectadas quedan cerca).
// - Vista centrada: una ficha en el medio y sus conexiones alrededor (las más importantes primero).
// - Panel lateral: el registro de la ficha o, al elegir un hilo, los puntos exactos que lo forman.
// Se mueve arrastrando con el dedo y se acerca con dos dedos, la rueda del ratón o los botones + / −.

import * as C from './campaign-data.js';
import { kindLabel, notesHtml, KIND_ICON } from './campaign-ui.js';
import { esc, icon } from './ui.js';
import { t, tn } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const MAX_NEIGHBORS = 18;
const positions = new Map(); // posiciones de la vista general (se conservan entre visitas)

// Lo que se está mirando; se conserva al cambiar de vista y volver.
const view = { focus: null, other: null, trail: [] };

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

// ---------- Vista ----------

export function mountMap(root, ctx, focusId = null) {
  if (focusId) { view.focus = focusId; view.other = null; view.trail = [focusId]; }
  if (view.focus && !C.get('codex', view.focus)) { view.focus = null; view.other = null; view.trail = []; }

  root.innerHTML = `
    <div class="map-layout">
      <div class="map-stage">
        <div class="map-bar">
          <nav class="map-trail" data-trail aria-label="${esc(t('camp.mapTrail'))}"></nav>
          <div class="map-zoom">
            <button class="btn btn-icon" type="button" data-zoom="out" aria-label="${esc(t('camp.zoomOut'))}">${icon('minus')}</button>
            <button class="btn btn-icon" type="button" data-zoom="in" aria-label="${esc(t('camp.zoomIn'))}">${icon('plus')}</button>
            <button class="btn btn-icon" type="button" data-zoom="fit" aria-label="${esc(t('camp.zoomFit'))}">${icon('grid')}</button>
          </div>
        </div>
        <svg class="map-svg" data-svg role="img" aria-label="${esc(t('camp.map'))}"></svg>
      </div>
      <aside class="map-panel" data-panel></aside>
    </div>`;
  const svg = root.querySelector('[data-svg]');
  const panel = root.querySelector('[data-panel]');
  const trail = root.querySelector('[data-trail]');
  let g = null;      // grafo actual
  let P = null;      // posiciones actuales
  let vb = { x: -500, y: -400, w: 1000, h: 800 };

  // ---------- Dibujo ----------

  function render({ fit = true } = {}) {
    g = C.graph();
    let ids;
    let edges;
    if (view.focus) {
      const list = C.neighbors(view.focus, g).slice(0, MAX_NEIGHBORS);
      ids = [view.focus, ...list.map((n) => n.id)];
      const shown = new Set(ids);
      edges = [...g.edges.values()].filter((e) => shown.has(e.a) && shown.has(e.b));
      P = egoLayout(view.focus, list);
    } else {
      ids = [...g.nodes.keys()];
      edges = [...g.edges.values()];
      P = forceLayout(ids, edges);
    }
    drawSvg(ids, edges);
    renderTrail();
    renderPanel();
    if (fit) fitView();
    else applyViewBox();
  }

  function drawSvg(ids, edges) {
    const maxMentions = Math.max(1, ...ids.map((id) => g.nodes.get(id)?.mentions || 0));
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
      const cls = ['node', `kind-${n.entry.kind}`, id === view.focus ? 'center' : '', id === view.other ? 'selected' : ''].join(' ');
      return `<g class="${cls}" data-node="${esc(id)}" transform="translate(${p.x} ${p.y})">
        <circle r="${r}"></circle>
        <use href="#i-${KIND_ICON[n.entry.kind] || 'user'}" x="${-r * 0.5}" y="${-r * 0.5}" width="${r}" height="${r}"></use>
        <text class="node-label" y="${r + 8}" dy="1em">${esc(n.entry.name || t('camp.unnamed'))}</text>
      </g>`;
    }).join('');
    svg.innerHTML = `<g class="edges">${edgeHtml}</g><g class="nodes">${nodeHtml}</g>`;
  }

  function renderTrail() {
    const crumbs = [`<button type="button" class="btn ${view.focus ? '' : 'btn-primary'}" data-overview>${icon('map')}<span>${esc(t('camp.overview'))}</span></button>`];
    for (const id of view.trail) {
      const c = C.get('codex', id);
      if (!c) continue;
      crumbs.push(`<span class="trail-sep" aria-hidden="true">›</span><button type="button" class="btn ${id === view.focus ? 'btn-primary' : ''}" data-focus="${esc(id)}">${esc(c.name || t('camp.unnamed'))}</button>`);
    }
    trail.innerHTML = crumbs.join('');
    trail.scrollLeft = trail.scrollWidth;
  }

  // ---------- Panel lateral ----------

  function entryHeader(id) {
    const c = C.get('codex', id);
    return `<header class="map-head">
      <span class="map-dot kind-${esc(c.kind)}">${icon(KIND_ICON[c.kind] || 'user')}</span>
      <div><h3>${esc(c.name || t('camp.unnamed'))}</h3><span class="hint">${esc([kindLabel(c.kind), c.subtitle].filter(Boolean).join(' · '))}</span></div>
    </header>`;
  }

  function renderPanel() {
    if (!view.focus) {
      const ranked = [...g.nodes.values()]
        .map((n) => ({ n, w: C.neighbors(n.id, g).reduce((sum, x) => sum + x.edge.weight, 0) }))
        .filter((x) => x.w > 0 || x.n.mentions > 0)
        .sort((a, b) => b.w - a.w || b.n.mentions - a.n.mentions)
        .slice(0, 12);
      panel.innerHTML = `
        <h3>${icon('map')} ${esc(t('camp.map'))}</h3>
        <p class="hint">${esc(t('camp.mapIntro'))}</p>
        ${g.nodes.size ? '' : `<button class="btn btn-primary" type="button" data-to-codex>${icon('plus')}<span>${esc(t('camp.mapEmpty'))}</span></button>`}
        ${ranked.length ? `<h4>${esc(t('camp.mostConnected'))}</h4><div class="map-list">${ranked.map(({ n, w }) => `
          <button type="button" class="comp-item" data-focus="${esc(n.id)}">
            <span class="comp-name">${icon(KIND_ICON[n.entry.kind] || 'user')} ${esc(n.entry.name || t('camp.unnamed'))}</span>
            <span class="comp-meta">${esc(tn('camp.threads', C.neighbors(n.id, g).length))} · ${esc(tn('camp.mentions', n.mentions))}</span>
          </button>`).join('')}</div>` : ''}`;
      return;
    }
    const list = C.neighbors(view.focus, g);
    if (view.other) {
      const e = g.edges.get([view.focus, view.other].sort().join('|'));
      const other = C.get('codex', view.other);
      const seen = new Set();
      const notes = (e?.notes || []).filter((it) => !seen.has(it.note.id) && seen.add(it.note.id));
      panel.innerHTML = `
        <div class="map-thread">${entryHeader(view.focus)}<span class="thread-link" aria-hidden="true">⟷</span>${entryHeader(view.other)}</div>
        <div class="map-actions">
          <button class="btn btn-primary" type="button" data-focus="${esc(view.other)}">${icon('map')}<span>${esc(t('camp.centerOn', { name: other?.name || '' }))}</span></button>
          <button class="btn" type="button" data-thread-close>${icon('close')}<span>${esc(t('camp.backTo', { name: C.get('codex', view.focus)?.name || '' }))}</span></button>
        </div>
        ${e?.linked ? `<p class="hint">${icon('link')} ${esc(t('camp.linkedInCodex'))}</p>` : ''}
        ${e?.stories.length ? `<div class="link-chips">${e.stories.map((st) => `<span class="link-chip"><button type="button" class="link-go" data-go-story="${esc(st.id)}">${icon('book')}<span>${esc(st.title || t('camp.untitled'))}</span></button></span>`).join('')}</div>` : ''}
        <h4>${esc(tn('camp.threadNotes', notes.length))}</h4>
        ${notes.length ? notesHtml(notes) : `<p class="hint">${esc(t('camp.noThreadNotes'))}</p>`}`;
      return;
    }
    const log = C.entryLog(view.focus);
    panel.innerHTML = `
      ${entryHeader(view.focus)}
      <div class="map-actions">
        <button class="btn" type="button" data-open-entry="${esc(view.focus)}">${icon('edit')}<span>${esc(t('camp.openEntry'))}</span></button>
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

  // ---------- Navegación dentro del mapa ----------

  function focusOn(id) {
    if (!C.get('codex', id)) return;
    const i = view.trail.indexOf(id);
    view.trail = i === -1 ? [...view.trail, id].slice(-6) : view.trail.slice(0, i + 1);
    view.focus = id;
    view.other = null;
    render();
  }

  function selectThread(id) {
    view.other = id === view.other ? null : id;
    render({ fit: false });
    panel.scrollTop = 0;
  }

  function onTap(target) {
    const node = target.closest?.('[data-node]');
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

  // ---------- Zoom y desplazamiento ----------

  function applyViewBox() {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const k = vb.w / Math.max(1, svg.clientWidth);
    svg.style.setProperty('--k', k); // textos siempre a 18 px en pantalla
  }

  function fitView() {
    const pts = [...(P?.values() || [])];
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const minX = Math.min(...pts.map((p) => p.x), -100) - 120;
    const maxX = Math.max(...pts.map((p) => p.x), 100) + 120;
    const minY = Math.min(...pts.map((p) => p.y), -100) - 100;
    const maxY = Math.max(...pts.map((p) => p.y), 100) + 140;
    let w = maxX - minX;
    let h = maxY - minY;
    const aspect = rect.width / rect.height;
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    vb = { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h };
    applyViewBox();
  }

  function zoom(factor, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) {
    const w = Math.min(20000, Math.max(200, vb.w * factor));
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

  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { downTarget = e.target; moved = false; }
    if (pointers.size === 2) {
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
      const r = svg.getBoundingClientRect();
      vb.x -= (dx / r.width) * vb.w;
      vb.y -= (dy / r.height) * vb.h;
      applyViewBox();
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
    if (pointers.size === 0 && !moved && downTarget && e.type === 'pointerup') onTap(downTarget);
    if (pointers.size < 2) pinchDist = 0;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = toWorld(e.clientX, e.clientY);
    zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  }, { passive: false });

  root.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zoom]');
    if (z) { if (z.dataset.zoom === 'fit') fitView(); else zoom(z.dataset.zoom === 'in' ? 0.8 : 1.25); return; }
    if (e.target.closest('[data-overview]')) { view.focus = null; view.other = null; view.trail = []; render(); return; }
    const f = e.target.closest('[data-focus]');
    if (f) { focusOn(f.dataset.focus); return; }
    const th = e.target.closest('[data-thread]');
    if (th) { selectThread(th.dataset.thread); return; }
    if (e.target.closest('[data-thread-close]')) { view.other = null; render({ fit: false }); return; }
    const mention = e.target.closest('[data-go-codex]');
    if (mention) { focusOn(mention.dataset.goCodex); return; }
    const open = e.target.closest('[data-open-entry]');
    if (open) { ctx.navigate('codex', open.dataset.openEntry); return; }
    const session = e.target.closest('[data-go-session]');
    if (session) { ctx.navigate('sessions', session.dataset.goSession); return; }
    const story = e.target.closest('[data-go-story]');
    if (story) { ctx.navigate('storylines', story.dataset.goStory); return; }
    if (e.target.closest('[data-to-codex]')) ctx.navigate('codex');
  });

  new ResizeObserver(() => fitView()).observe(svg);
  render();

  return {
    update(what) { if (what === 'codex' || what === 'sessions' || what === 'storylines') render({ fit: false }); },
    show(id) { if (id) focusOn(id); },
  };
}
