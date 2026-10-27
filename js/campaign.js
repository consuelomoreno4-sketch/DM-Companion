// Panel de la Campaña: cuatro vistas (Sesiones, Bitácora, Líneas de historia, Mapa) y búsqueda en toda la campaña.

import * as C from './campaign-data.js';
import { mountSessions } from './campaign-sessions.js';
import { mountCodex } from './campaign-codex.js';
import { mountStories } from './campaign-stories.js';
import { mountMap } from './campaign-map.js';
import { kindIcon, dateText } from './campaign-ui.js';
import { esc, icon, toast } from './ui.js';
import { t } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const MOUNT = { sessions: mountSessions, codex: mountCodex, storylines: mountStories, map: mountMap };

const state = {
  view: 'sessions',
  selected: { sessions: null, codex: null },
  codexFilter: '',
};

let els;
let view = null;        // vista montada: { update(what), show(id) }
let ready = false;
let savedTimer = null;

const ctx = {
  state,
  selected: (kind) => state.selected[kind],
  select: (kind, id) => { state.selected[kind] = id; },
  navigate: (to, id) => navigate(to, id),
};

export function initCampaign() {
  els = {
    views: $('#camp-views'),
    search: $('#camp-search'),
    saved: $('#camp-saved'),
    body: $('#camp-body'),
    results: $('#camp-results'),
  };
  els.views.addEventListener('change', (e) => navigate(e.target.value));
  els.search.addEventListener('input', renderSearch);
  els.results.addEventListener('click', (e) => {
    const b = e.target.closest('[data-result]');
    if (!b) return;
    els.search.value = '';
    renderSearch();
    navigate(b.dataset.view, b.dataset.result);
  });

  C.onChange((what) => {
    if (what === 'saved') { showSaved(); return; }
    if (what?.error) { toast(t('msg.saveError', { msg: what.error.message }), { kind: 'error', duration: 0 }); return; }
    if (ready) view?.update(what);
  });
  // Guarda lo pendiente si la app pasa a segundo plano o se cierra.
  document.addEventListener('visibilitychange', () => { if (document.hidden) C.flushSaves(); });
  window.addEventListener('pagehide', () => C.flushSaves());
}

function showSaved() {
  els.saved.textContent = t('camp.saved');
  els.saved.hidden = false;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { els.saved.hidden = true; }, 2000);
}

export async function onShow() {
  if (!els) return;
  if (!ready) {
    els.body.innerHTML = `<p class="comp-msg">${esc(t('comp.loading'))}</p>`;
    try {
      await C.loadCampaign();
    } catch (err) {
      els.body.innerHTML = `<p class="comp-msg">${esc(t('app.loadError', { msg: err.message }))}</p>`;
      return;
    }
    ready = true;
  }
  navigate(state.view);
}

function navigate(to, id = null) {
  state.view = to;
  for (const input of els.views.querySelectorAll('input')) input.checked = input.value === to;
  if (id && (to === 'sessions' || to === 'codex')) state.selected[to] = id;
  els.body.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'camp-view';
  els.body.append(root);
  view = MOUNT[to](root, ctx, to === 'map' ? id : null);
  if (id && to === 'storylines') view.show(id);
}

// ---------- Búsqueda en toda la campaña ----------

function renderSearch() {
  const results = ready ? C.search(els.search.value) : null;
  els.body.hidden = !!results;
  els.results.hidden = !results;
  if (!results) return;
  const section = (title, rows) => (rows.length ? `<h3>${esc(title)} <span class="badge num">${rows.length}</span></h3><ul class="camp-list">${rows.join('')}</ul>` : '');
  const row = (viewName, id, iconHtml, title, snippet) => `
    <li><button type="button" class="comp-item" data-view="${viewName}" data-result="${esc(id)}">
      <span class="comp-name">${iconHtml} ${esc(title)}</span>
      ${snippet ? `<span class="comp-meta">${esc(snippet)}</span>` : ''}
    </button></li>`;
  const html = [
    section(t('camp.sessions'), results.sessions.map(({ item, snippet }) => row('sessions', item.id, icon('scroll'), `#${item.number ?? ''} ${item.title || dateText(item.date)}`, snippet))),
    section(t('camp.codex'), results.codex.map(({ item, snippet }) => row('codex', item.id, kindIcon(item.kind), item.name || t('camp.unnamed'), snippet))),
    section(t('camp.storylines'), results.storylines.map(({ item, snippet }) => row('storylines', item.id, icon('book'), item.title || t('camp.untitled'), snippet))),
  ].join('');
  els.results.innerHTML = html || `<p class="comp-msg">${esc(t('comp.empty'))}</p>`;
}

export const flush = () => C.flushSaves();
