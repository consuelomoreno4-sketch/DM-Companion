// Guía de la app: recorridos cortos por módulo (Combate, Compendio, Sesiones…). Cada paso ilumina una parte real de
// la pantalla con una burbuja breve. Se puede salir en cualquier momento: el paso queda guardado (kv 'tours') y
// "Continuar" lo retoma. Botón "Guía" en la barra superior.

import { kvGet, kvSet } from './db.js';
import { esc, icon, toast, openDialog, closeDialog, wireDialog } from './ui.js';
import { t } from './i18n.js';

// Pasos: panel y vista donde está lo que se muestra, y el elemento a iluminar (si no está a la vista, la burbuja va
// al centro). El texto de cada paso es t(`tour.<id>.<n>`).
const TOURS = [
  { id: 'combat', icon: 'swords', steps: [
    { panel: 'combate', sel: '#btn-add' },
    { panel: 'combate', sel: '#turn-list' },
    { panel: 'combate', sel: '#btn-next' },
    { panel: 'combate', sel: '#btn-undo' },
    { panel: 'combate', sel: '#board-wrap' },
    { panel: 'combate', sel: '#btn-combat-menu' },
  ] },
  { id: 'compendium', icon: 'book', steps: [
    { panel: 'compendio', sel: '#comp-kinds' },
    { panel: 'compendio', sel: '#comp-search' },
    { panel: 'compendio', sel: '#comp-list' },
    { panel: 'compendio', sel: '#comp-new' },
  ] },
  { id: 'sessions', icon: 'scroll', steps: [
    { panel: 'campana', view: 'sessions', sel: '#camp-views' },
    { panel: 'campana', view: 'sessions', sel: '[data-new]' },
    { panel: 'campana', view: 'sessions', sel: '[data-editor]' },
    { panel: 'campana', view: 'sessions', sel: '[data-import]' },
    { panel: 'campana', view: 'sessions', sel: '#camp-search' },
  ] },
  { id: 'codex', icon: 'user', steps: [
    { panel: 'campana', view: 'codex', sel: '[data-new]' },
    { panel: 'campana', view: 'codex', sel: '[data-editor]' },
    { panel: 'campana', view: 'codex', sel: '[data-filters]' },
    { panel: 'campana', view: 'codex', sel: '[data-detect]' },
    { panel: 'campana', view: 'codex', sel: '[data-pack]' },
  ] },
  { id: 'storylines', icon: 'book', steps: [
    { panel: 'campana', view: 'storylines', sel: '[data-board]' },
    { panel: 'campana', view: 'storylines', sel: '[data-add]' },
    { panel: 'campana', view: 'storylines', sel: '.story-card' },
  ] },
  { id: 'map', icon: 'map', steps: [
    { panel: 'campana', view: 'map', sel: '.map-modes' },
    { panel: 'campana', view: 'map', mode: 'places', sel: '[data-svg]' },
    { panel: 'campana', view: 'map', mode: 'places', sel: '[data-edit]' },
    { panel: 'campana', view: 'map', mode: 'places', sel: '[data-map-select]' },
    { panel: 'campana', view: 'map', mode: 'people', sel: '.map-panel' },
  ] },
  { id: 'time', icon: 'clock', steps: [
    { panel: 'campana', sel: '#btn-clock' },
    { panel: 'campana', view: 'time', sel: '[data-main]' },
    { panel: 'campana', view: 'time', sel: '[data-rebuild]' },
  ] },
  { id: 'settings', icon: 'gear', steps: [
    { sel: '#btn-settings' },
    { sel: '#btn-help' },
  ] },
];

let progress = null; // { [id]: { step, seen } }: step = paso en curso (null si no hay uno a medias); seen = ya se terminó alguna vez
let active = null;   // { tour, step }
let layer = null;
let helpWired = false;

async function loadProgress() {
  if (!progress) progress = (await kvGet('tours').catch(() => null)) || {};
  return progress;
}
const saveProgress = () => kvSet('tours', progress).catch(() => {});

// ---------- Llevar la pantalla al paso ----------

const visible = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && el.offsetParent !== null;
};

function waitFor(test, ms = 1500) {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const v = test();
      if (v || performance.now() - start > ms) resolve(v);
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

async function prepare(step) {
  if (step.panel && location.hash.slice(1) !== step.panel) {
    location.hash = `#${step.panel}`;
    await waitFor(() => !document.querySelector(`#panel-${step.panel}`)?.hidden);
  }
  if (step.view) {
    const input = document.querySelector(`#camp-views input[value="${step.view}"]`);
    await waitFor(() => document.querySelector('#camp-body')?.children.length); // la Campaña termina de cargar
    if (input && !input.checked) input.click();
  }
  if (step.mode) {
    const input = await waitFor(() => document.querySelector(`.map-modes input[value="${step.mode}"]`));
    if (input && !input.checked) input.click();
  }
  return waitFor(() => { const el = document.querySelector(step.sel); return visible(el) ? el : null; }, 1200);
}

// ---------- Capa del recorrido ----------

function ensureLayer() {
  if (layer) return layer;
  layer = document.createElement('div');
  layer.className = 'tour';
  layer.innerHTML = `
    <div class="tour-hole" aria-hidden="true"></div>
    <div class="tour-bubble" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
      <div class="tour-head">
        <p class="hint num" data-tour-count></p>
        <button class="btn btn-icon btn-ghost" type="button" data-tour="exit" aria-label="${esc(t('tour.exit'))}">${icon('close')}</button>
      </div>
      <h2 id="tour-title"></h2>
      <p id="tour-text"></p>
      <div class="tour-foot">
        <button class="btn" type="button" data-tour="back">${icon('left')}<span>${esc(t('tour.back'))}</span></button>
        <button class="btn btn-primary" type="button" data-tour="next"><span></span>${icon('right')}</button>
      </div>
    </div>`;
  // Tocar fuera de la burbuja pausa el recorrido (se retoma desde la Guía).
  layer.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tour]');
    if (b) { go(b.dataset.tour); return; }
    if (!e.target.closest('.tour-bubble')) stop(true);
  });
  document.body.append(layer);
  return layer;
}

function place(target) {
  const hole = layer.querySelector('.tour-hole');
  const bubble = layer.querySelector('.tour-bubble');
  const W = window.innerWidth;
  const H = window.innerHeight;
  const m = 16;
  bubble.style.left = '';
  bubble.style.top = '';
  const bw = bubble.offsetWidth;
  const bh = bubble.offsetHeight;
  if (!target) {
    hole.hidden = true;
    bubble.style.left = `${Math.round((W - bw) / 2)}px`;
    bubble.style.top = `${Math.round((H - bh) / 2)}px`;
    return;
  }
  const r = target.getBoundingClientRect();
  const pad = 8;
  const box = { left: Math.max(4, r.left - pad), top: Math.max(4, r.top - pad), right: Math.min(W - 4, r.right + pad), bottom: Math.min(H - 4, r.bottom + pad) };
  hole.hidden = false;
  Object.assign(hole.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` });
  // Debajo, arriba, a la derecha o a la izquierda del elemento: donde quepa.
  const clampX = (x) => Math.min(W - bw - m, Math.max(m, x));
  const clampY = (y) => Math.min(H - bh - m, Math.max(m, y));
  let x;
  let y;
  if (box.bottom + m + bh <= H) { x = clampX(box.left); y = box.bottom + m; }
  else if (box.top - m - bh >= 0) { x = clampX(box.left); y = box.top - m - bh; }
  else if (box.right + m + bw <= W) { x = box.right + m; y = clampY(box.top); }
  else if (box.left - m - bw >= 0) { x = box.left - m - bw; y = clampY(box.top); }
  else { x = clampX((W - bw) / 2); y = clampY(H - bh - m); } // elemento muy grande: abajo, encima de él
  bubble.style.left = `${Math.round(x)}px`;
  bubble.style.top = `${Math.round(y)}px`;
}

let target = null;
let showing = 0;

async function show() {
  const { tour, step } = active;
  const id = ++showing;
  const st = tour.steps[step];
  ensureLayer();
  layer.classList.add('busy');
  target = await prepare(st);
  if (id !== showing || !active) return; // ya se pasó a otro paso o se salió
  target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  layer.querySelector('[data-tour-count]').textContent = t('tour.stepOf', { n: step + 1, m: tour.steps.length });
  layer.querySelector('#tour-title').textContent = t(`tour.${tour.id}.title`);
  layer.querySelector('#tour-text').textContent = t(`tour.${tour.id}.${step + 1}`);
  layer.querySelector('[data-tour="back"]').disabled = step === 0;
  layer.querySelector('[data-tour="next"] span').textContent = t(step === tour.steps.length - 1 ? 'tour.finish' : 'tour.next');
  layer.classList.remove('busy');
  place(target);
  layer.querySelector('[data-tour="next"]').focus({ preventScroll: true });
  progress[tour.id] = { ...(progress[tour.id] || {}), step };
  saveProgress();
}

const inProgress = (p) => p?.step != null && p.step > 0;

function go(action) {
  if (!active) return;
  if (action === 'exit') { stop(true); return; }
  if (action === 'back' && active.step > 0) { active.step -= 1; show(); return; }
  if (action === 'next') {
    if (active.step < active.tour.steps.length - 1) { active.step += 1; show(); return; }
    progress[active.tour.id] = { step: null, seen: true };
    saveProgress();
    stop(false);
  }
}

function onKey(e) {
  if (!active) return;
  // Mientras la guía está abierta, las teclas son suyas (no avanzan turnos ni cambian de panel).
  if (e.key === 'Escape') { e.preventDefault(); stop(true); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); go('next'); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); go('back'); }
  else if (e.key === 'Tab') {
    // El foco no sale de la burbuja.
    const btns = [...layer.querySelectorAll('.tour-bubble button:not(:disabled)')];
    const i = btns.indexOf(document.activeElement);
    e.preventDefault();
    btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length]?.focus();
  } else if (e.key !== 'Enter' && e.key !== ' ') return;
  e.stopPropagation();
}

const reflow = () => { if (active && !layer.classList.contains('busy')) place(visible(target) ? target : null); };

/** Empieza (o retoma) un recorrido. */
export async function startTour(id, { restart = false } = {}) {
  await loadProgress();
  const tour = TOURS.find((x) => x.id === id);
  if (!tour) return;
  const saved = progress[id];
  const step = !restart && inProgress(saved) ? Math.min(saved.step, tour.steps.length - 1) : 0;
  active = { tour, step };
  document.body.classList.add('touring');
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', reflow);
  ensureLayer().hidden = false;
  show();
}

function stop(paused) {
  if (!active) return;
  const { tour } = active;
  active = null;
  showing += 1;
  layer.hidden = true;
  document.body.classList.remove('touring');
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('resize', reflow);
  if (paused) toast(t('tour.paused', { name: t(`tour.${tour.id}.title`) }), { duration: 5000, group: 'tour' });
  document.getElementById('btn-help')?.focus({ preventScroll: true });
}

export const tourActive = () => !!active;

// ---------- Ventana "Guía" ----------

export async function openHelp() {
  await loadProgress();
  const dlg = document.getElementById('dlg-help');
  const body = document.getElementById('help-body');
  if (!helpWired) {
    wireDialog(dlg);
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-start]');
      if (!b) return;
      closeDialog(dlg);
      startTour(b.dataset.start, { restart: b.hasAttribute('data-restart') });
    });
    helpWired = true;
  }
  body.innerHTML = `
    <header class="dialog-head">
      <h2 id="dlg-help-title">${icon('help')} ${esc(t('tour.title'))}</h2>
      <button class="btn btn-icon" type="button" data-close aria-label="${esc(t('common.close'))}">${icon('close')}</button>
    </header>
    <p class="hint">${esc(t('tour.intro'))}</p>
    <ul class="help-list">${TOURS.map((tour) => {
      const p = progress[tour.id] || {};
      const started = inProgress(p);
      const status = started ? `<span class="badge num">${esc(t('tour.stepOf', { n: p.step + 1, m: tour.steps.length }))}</span>`
        : p.seen ? `<span class="badge badge-ok">${icon('check')} ${esc(t('tour.seen'))}</span>` : '';
      return `<li class="help-item">
        <span class="help-icon">${icon(tour.icon)}</span>
        <div class="help-text"><strong>${esc(t(`tour.${tour.id}.title`))}</strong> ${status}<span class="hint">${esc(t(`tour.${tour.id}.desc`))}</span></div>
        <div class="help-actions">
          ${started ? `<button class="btn" type="button" data-start="${tour.id}" data-restart>${esc(t('tour.restart'))}</button>` : ''}
          <button class="btn btn-primary" type="button" data-start="${tour.id}"${started ? '' : ' data-restart'}>${esc(t(started ? 'tour.continue' : p.seen ? 'tour.repeat' : 'tour.start'))}</button>
        </div>
      </li>`;
    }).join('')}</ul>`;
  openDialog(dlg);
}

/** La primera vez que se abre la app, un aviso breve ofrece la guía (no vuelve a salir). */
export async function firstRunHint() {
  if (await kvGet('tourHint').catch(() => true)) return;
  await kvSet('tourHint', true).catch(() => {});
  toast(t('tour.firstHint'), { duration: 12000, group: 'tour', action: { label: t('tour.open'), run: openHelp } });
}
