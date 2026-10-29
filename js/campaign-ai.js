// Análisis de las notas con IA (Claude): lee las sesiones y propone fichas del Códice (personajes, lugares,
// objetos y facciones) con datos clave, otros nombres, hilos entre ellas y dónde queda cada lugar en el mapa.
// En "Revisar con IA" (una sesión) además corrige ortografía y redacción de cada punto.
// Nada se guarda hasta que se revisa y se acepta.

import * as AI from './ai.js';
import * as C from './campaign-data.js';
import { DIRS, spotNear } from './campaign-detect.js';
import { aiErrorText, openAiSettings } from './ai-ui.js';
import { normalize } from './monsters.js';
import { kindIcon } from './campaign-ui.js';
import { esc, icon, toast, openDialog, closeDialog, wireDialog } from './ui.js';
import { t, tn } from './i18n.js';

const PARALLEL = 3; // sesiones a la vez en el análisis de toda la campaña
const DIR_VEC = {
  north: DIRS.north, northeast: DIRS.northeast, east: DIRS.east, southeast: DIRS.southeast,
  south: DIRS.south, southwest: DIRS.southwest, west: DIRS.west, northwest: DIRS.northwest, inside: null, near: null,
};

let wired = false;
let dlg;
let body;

function setup() {
  dlg = document.getElementById('dlg-ai');
  body = document.getElementById('ai-body');
  if (!wired) {
    wireDialog(dlg);
    // No se cierra por accidente mientras trabaja.
    dlg.addEventListener('cancel', (e) => { if (dlg.dataset.busy) e.preventDefault(); });
    wired = true;
  }
}

const money = (x) => (x < 0.01 ? '<0.01' : x.toFixed(2));
const head = (title) => `
  <header class="dialog-head">
    <h2 id="dlg-ai-title">${icon('sparkles')} ${esc(title)}</h2>
    <button class="btn btn-icon" type="button" data-close aria-label="${esc(t('common.close'))}">${icon('close')}</button>
  </header>`;

/** "Revisar con IA" de una sesión: correcciones + fichas. */
export function openSessionReview(sessionId, onDone) {
  setup();
  start({ sessions: [C.get('sessions', sessionId)], corrections: true, onDone, title: t('ai.reviewTitle') });
}

/** "Analizar la campaña con IA": todas las sesiones (o las que faltan), solo fichas. */
export function openCampaignAnalysis(onDone) {
  setup();
  start({ sessions: null, corrections: false, onDone, title: t('ai.analyzeTitle') });
}

// ---------- 1. Antes de empezar ----------

async function start(opts) {
  const cfg = await AI.loadAiSettings();
  await C.loadCampaign();
  const all = C.sessionsSorted().slice().reverse().filter((s) => (s.notes || []).some((n) => n.text?.trim()));
  let onlyNew = true;
  const pick = () => opts.sessions || (onlyNew ? all.filter((s) => !s.aiAnalyzedAt) : all);
  const render = () => {
    const sessions = pick();
    const model = AI.modelInfo(cfg.model);
    const cost = AI.estimateBefore(sessions, C.list('codex').length, model.id, opts);
    body.innerHTML = `
      ${head(opts.title)}
      <p>${esc(t(opts.corrections ? 'ai.reviewIntro' : 'ai.analyzeIntro'))}</p>
      ${opts.sessions ? '' : `
        <p><strong>${esc(tn('ai.sessionsToRead', sessions.length))}</strong></p>
        <label class="check"><input type="checkbox" data-only-new${onlyNew ? ' checked' : ''}><span>${esc(t('ai.onlyNew', { n: all.filter((s) => s.aiAnalyzedAt).length }))}</span></label>`}
      <p class="hint">${esc(t('ai.costEstimate', { model: model.name, cost: money(cost) }))}</p>
      <p class="hint">${esc(t('ai.sendsNotes'))}</p>
      <footer class="dialog-foot">
        <button class="btn" type="button" data-close>${esc(t('common.cancel'))}</button>
        ${AI.hasKey()
          ? `<button class="btn btn-primary" type="button" data-go${sessions.length && navigator.onLine ? '' : ' disabled'}>${icon('sparkles')}<span>${esc(t('ai.start'))}</span></button>`
          : `<button class="btn btn-primary" type="button" data-settings>${icon('gear')}<span>${esc(t('ai.openSettings'))}</span></button>`}
      </footer>
      ${navigator.onLine ? '' : `<p class="hint">${esc(t('ai.err.offline'))}</p>`}`;
  };
  render();
  body.onchange = (e) => { if (e.target.matches('[data-only-new]')) { onlyNew = e.target.checked; render(); } };
  body.onclick = (e) => {
    if (e.target.closest('[data-settings]')) { closeDialog(dlg); openAiSettings(); return; }
    if (e.target.closest('[data-go]')) run(pick(), opts);
  };
  openDialog(dlg);
}

// ---------- 2. Trabajando ----------

async function run(sessions, opts) {
  const controller = new AbortController();
  const results = []; // { session, data }
  const failed = [];
  let done = 0;
  let cost = 0;
  dlg.dataset.busy = '1';
  const progress = () => {
    body.innerHTML = `
      ${head(opts.title)}
      <p aria-live="polite"><strong>${esc(t('ai.progress', { done, total: sessions.length }))}</strong> · ${esc(t('ai.costSoFar', { cost: money(cost) }))}</p>
      <progress class="ai-progress" max="${sessions.length}" value="${done}"></progress>
      <p class="hint">${esc(t('ai.working'))}</p>
      <footer class="dialog-foot">
        <button class="btn btn-danger" type="button" data-stop>${icon('close')}<span>${esc(t('ai.stop'))}</span></button>
      </footer>`;
  };
  progress();
  body.onclick = (e) => { if (e.target.closest('[data-stop]')) controller.abort(); };
  body.onchange = null;

  // Cada sesión ve el Códice actual (no lo que otras sesiones proponen a la vez: eso se une al final por nombre).
  const codex = C.list('codex').filter((c) => c.name?.trim());
  const queue = [...sessions];
  let fatal = null;
  const worker = async () => {
    while (queue.length && !controller.signal.aborted && !fatal) {
      const session = queue.shift();
      try {
        const r = await AI.analyzeSession(session, codex, { corrections: opts.corrections, signal: controller.signal });
        results.push({ session, data: r.data });
        cost += AI.estimateCost(r.usage, r.model);
      } catch (err) {
        if (err.name === 'AbortError') return;
        // Sin clave, sin internet o clave inválida: no tiene sentido seguir con las demás.
        if (['no-key', 'offline', 'auth'].includes(err.code)) { fatal = err; return; }
        failed.push({ session, err });
      }
      done += 1;
      progress();
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, sessions.length) }, worker));
  delete dlg.dataset.busy;

  if (fatal) {
    toast(aiErrorText(fatal), { kind: 'error', duration: 0, group: 'ai-error' });
    closeDialog(dlg);
    return;
  }
  for (const f of failed) toast(`#${f.session.number ?? '?'}: ${aiErrorText(f.err)}`, { kind: 'error', duration: 8000, group: 'ai-error' });
  if (!results.length) { closeDialog(dlg); return; }
  showResults(merge(results), opts, cost);
}

// ---------- 3. Unir lo que llegó de cada sesión ----------

function merge(results) {
  const codex = C.list('codex');
  const byId = new Map(codex.map((c) => [c.id, c]));
  const nameIndex = new Map(); // nombre normalizado → clave
  for (const c of codex) for (const n of [c.name, ...(c.aliases || [])]) if (n) nameIndex.set(normalize(n), `id:${c.id}`);
  const ents = new Map();
  const keyOf = (name) => nameIndex.get(normalize(name || ''));
  const order = [...results].sort((a, b) => (a.session.number ?? 0) - (b.session.number ?? 0));
  const corrections = [];
  const relations = [];
  const locations = [];

  for (const { session, data } of order) {
    const noteById = new Map((session.notes || []).map((n) => [n.id, n]));
    for (const n of data.notes || []) {
      const old = noteById.get(n.id);
      if (old && n.text?.trim() && n.text.trim() !== old.text.trim()) corrections.push({ session, id: n.id, old: old.text, text: n.text.trim() });
    }
    for (const e of data.entities || []) {
      if (!e.name?.trim()) continue;
      const known = e.existing_id && byId.has(e.existing_id) ? `id:${e.existing_id}` : null;
      let key = known || keyOf(e.name) || (e.aliases || []).map(keyOf).find(Boolean);
      if (!key) {
        key = `new:${normalize(e.name)}`;
        ents.set(key, { key, name: e.name.trim(), kind: e.kind, subtitle: '', aliases: [], facts: [], existing: null });
      } else if (!ents.has(key)) {
        const entry = key.startsWith('id:') ? byId.get(key.slice(3)) : null;
        ents.set(key, { key, name: entry?.name || e.name.trim(), kind: entry?.kind || e.kind, subtitle: '', aliases: [], facts: [], existing: entry });
      }
      const it = ents.get(key);
      for (const n of [e.name, ...(e.aliases || [])]) if (n?.trim()) nameIndex.set(normalize(n), key);
      it.subtitle ||= e.subtitle?.trim() || '';
      for (const a of [e.name, ...(e.aliases || [])].map((x) => x?.trim()).filter(Boolean)) {
        if (normalize(a) !== normalize(it.name) && !it.aliases.some((x) => normalize(x) === normalize(a))) it.aliases.push(a);
      }
      for (const f of e.facts || []) if (f?.trim()) it.facts.push({ text: f.trim(), number: session.number });
    }
    relations.push(...(data.relations || []));
    locations.push(...(data.locations || []));
  }
  // Para fichas existentes: solo los otros nombres que todavía no tienen.
  for (const it of ents.values()) {
    if (it.existing) {
      const have = new Set([it.existing.name, ...(it.existing.aliases || [])].map(normalize));
      it.aliases = it.aliases.filter((a) => !have.has(normalize(a)));
    }
  }
  const resolve = (name) => keyOf(name);
  const rel = [];
  const seen = new Set();
  for (const r of relations) {
    const a = resolve(r.a);
    const b = resolve(r.b);
    if (!a || !b || a === b) continue;
    const k = [a, b].sort().join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    rel.push({ a, b, label: r.label });
  }
  const loc = [];
  for (const l of locations) {
    const place = resolve(l.place);
    const near = resolve(l.near);
    if (place && near && place !== near && !loc.some((x) => x.place === place)) loc.push({ place, near, direction: l.direction });
  }
  const list = [...ents.values()];
  return {
    corrections,
    fresh: list.filter((x) => !x.existing),
    updates: list.filter((x) => x.existing && (x.facts.length || x.aliases.length)),
    relations: rel,
    locations: loc,
    sessions: results.map((r) => r.session),
  };
}

// ---------- 4. Revisar y aplicar ----------

function factsText(facts) {
  return facts.map((f) => `- ${f.text}${f.number != null ? ` (#${f.number})` : ''}`).join('\n');
}

function showResults(res, opts, cost) {
  const row = (it, i) => `
    <li class="det-row" data-new-row="${i}">
      <label class="det-check"><input type="checkbox" data-use checked aria-label="${esc(t('det.use', { name: it.name }))}"></label>
      <div class="det-main">
        <div class="det-line">
          <input class="det-name" data-name value="${esc(it.name)}" aria-label="${esc(t('entry.name'))}">
          <select data-kind aria-label="${esc(t('entry.type'))}">${C.CODEX_KINDS.map((k) => `<option value="${k}"${it.kind === k ? ' selected' : ''}>${esc(t(`camp.kind.${k}`))}</option>`).join('')}</select>
        </div>
        <input class="det-aliases" data-subtitle value="${esc(it.subtitle)}" placeholder="${esc(t('camp.subtitle'))}" aria-label="${esc(t('camp.subtitle'))}">
        <input class="det-aliases" data-aliases value="${esc(it.aliases.join(', '))}" placeholder="${esc(t('camp.aliases'))}" aria-label="${esc(t('camp.aliases'))}">
        ${it.facts.length ? `<ul class="ai-facts">${it.facts.map((f) => `<li>${esc(f.text)}${f.number != null ? ` <span class="hint">#${esc(f.number)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      </div>
    </li>`;
  const upd = (it, i) => `
    <li class="det-row" data-upd-row="${i}">
      <label class="det-check"><input type="checkbox" data-use checked aria-label="${esc(t('det.use', { name: it.name }))}"></label>
      <div class="det-main">
        <div class="det-line">${kindIcon(it.existing.kind)} <strong>${esc(it.existing.name)}</strong>
          ${it.aliases.length ? `<span class="hint">+ ${esc(it.aliases.join(', '))}</span>` : ''}</div>
        ${it.facts.length ? `<ul class="ai-facts">${it.facts.map((f) => `<li>${esc(f.text)}${f.number != null ? ` <span class="hint">#${esc(f.number)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      </div>
    </li>`;
  const fix = (c, i) => `
    <li class="det-row" data-fix-row="${i}">
      <label class="det-check"><input type="checkbox" data-use checked aria-label="${esc(t('ai.acceptFix'))}"></label>
      <div class="det-main ai-fix">
        <del>${esc(c.old)}</del>
        <ins>${esc(c.text)}</ins>
      </div>
    </li>`;
  const placesToPlace = res.locations.filter((l) => {
    const it = l.place.startsWith('new:') ? res.fresh.find((x) => x.key === l.place) : null;
    const entry = l.place.startsWith('id:') ? C.get('codex', l.place.slice(3)) : null;
    return (it && it.kind === 'place') || (entry && entry.kind === 'place' && !entry.pos);
  });
  const nothing = !res.corrections.length && !res.fresh.length && !res.updates.length && !res.relations.length;

  body.innerHTML = `
    ${head(opts.title)}
    <p class="hint">${esc(tn('ai.doneIntro', res.sessions.length, { cost: money(cost) }))}</p>
    ${nothing ? `<p>${esc(t('ai.nothing'))}</p>` : ''}
    ${res.corrections.length ? `
      <h3>${icon('edit')} ${esc(tn('ai.fixes', res.corrections.length))}</h3>
      <div class="map-actions"><button class="btn" type="button" data-all="fix:1">${icon('check')}<span>${esc(t('det.checkAll'))}</span></button>
        <button class="btn" type="button" data-all="fix:0">${icon('close')}<span>${esc(t('det.checkNone'))}</span></button></div>
      <ul class="det-list">${res.corrections.map(fix).join('')}</ul>` : ''}
    ${res.fresh.length ? `
      <h3>${icon('plus')} ${esc(tn('ai.newEntries', res.fresh.length))}</h3>
      <div class="map-actions"><button class="btn" type="button" data-all="new:1">${icon('check')}<span>${esc(t('det.checkAll'))}</span></button>
        <button class="btn" type="button" data-all="new:0">${icon('close')}<span>${esc(t('det.checkNone'))}</span></button></div>
      <ul class="det-list">${res.fresh.map(row).join('')}</ul>` : ''}
    ${res.updates.length ? `
      <h3>${icon('book')} ${esc(tn('ai.updates', res.updates.length))}</h3>
      <p class="hint">${esc(t('ai.updatesHint'))}</p>
      <ul class="det-list">${res.updates.map(upd).join('')}</ul>` : ''}
    ${res.relations.length ? `<label class="check"><input type="checkbox" data-links checked><span>${esc(tn('ai.links', res.relations.length))}</span></label>` : ''}
    ${placesToPlace.length ? `<label class="check"><input type="checkbox" data-place checked><span>${esc(tn('ai.placeOnMap', placesToPlace.length))}</span></label>` : ''}
    <footer class="dialog-foot">
      <button class="btn" type="button" data-close>${esc(t('common.cancel'))}</button>
      <button class="btn btn-primary" type="button" data-apply${nothing ? ' disabled' : ''}>${icon('check')}<span>${esc(t('ai.apply'))}</span></button>
    </footer>`;

  body.onchange = null;
  body.onclick = async (e) => {
    const all = e.target.closest('[data-all]');
    if (all) {
      const [what, on] = all.dataset.all.split(':');
      body.querySelectorAll(`[data-${what}-row] [data-use]`).forEach((x) => { x.checked = on === '1'; });
      return;
    }
    if (!e.target.closest('[data-apply]')) return;
    if (dlg.dataset.applying) return;
    dlg.dataset.applying = '1';
    try { apply(res, opts); } finally { delete dlg.dataset.applying; }
  };
}

function apply(res, opts) {
  const keyToId = new Map();
  for (const it of res.updates) keyToId.set(it.key, it.existing.id);
  for (const r of [...res.relations, ...res.locations]) {
    for (const k of [r.a, r.b, r.place, r.near]) if (k?.startsWith('id:')) keyToId.set(k, k.slice(3));
  }
  let fixed = 0;
  let created = 0;
  let updated = 0;
  let linked = 0;
  let placed = 0;

  // Correcciones de los puntos.
  const bySession = new Map();
  body.querySelectorAll('[data-fix-row]').forEach((li) => {
    if (!li.querySelector('[data-use]').checked) return;
    const c = res.corrections[Number(li.dataset.fixRow)];
    if (!bySession.has(c.session.id)) bySession.set(c.session.id, new Map());
    bySession.get(c.session.id).set(c.id, c.text);
  });
  for (const [sid, changes] of bySession) {
    const s = C.get('sessions', sid);
    if (!s) continue;
    const notes = s.notes.map((n) => (changes.has(n.id) ? { ...n, text: changes.get(n.id) } : n));
    C.update('sessions', sid, { notes }, { debounce: false });
    fixed += changes.size;
  }

  // Fichas nuevas.
  body.querySelectorAll('[data-new-row]').forEach((li) => {
    const it = res.fresh[Number(li.dataset.newRow)];
    if (!li.querySelector('[data-use]').checked) return;
    const name = li.querySelector('[data-name]').value.trim();
    if (!name) return;
    const existing = C.list('codex').find((c) => normalize(c.name) === normalize(name));
    if (existing) { keyToId.set(it.key, existing.id); return; }
    const entry = C.create('codex', {
      kind: li.querySelector('[data-kind]').value, name,
      aliases: li.querySelector('[data-aliases]').value.split(',').map((x) => x.trim()).filter(Boolean),
      subtitle: li.querySelector('[data-subtitle]').value.trim(), tags: [], description: factsText(it.facts), links: [],
    });
    keyToId.set(it.key, entry.id);
    created += 1;
  });

  // Fichas existentes: datos nuevos al final de la descripción y otros nombres.
  body.querySelectorAll('[data-upd-row]').forEach((li) => {
    if (!li.querySelector('[data-use]').checked) return;
    const it = res.updates[Number(li.dataset.updRow)];
    const entry = C.get('codex', it.existing.id);
    if (!entry) return;
    const desc = entry.description || '';
    const facts = it.facts.filter((f) => !normalize(desc).includes(normalize(f.text)));
    const patch = { aliases: [...new Set([...(entry.aliases || []), ...it.aliases])] };
    if (facts.length) patch.description = [desc.trimEnd(), factsText(facts)].filter(Boolean).join('\n');
    if (!entry.subtitle && it.subtitle) patch.subtitle = it.subtitle;
    C.update('codex', entry.id, patch, { debounce: false });
    updated += 1;
  });

  // Hilos entre fichas (enlaces).
  if (body.querySelector('[data-links]')?.checked) {
    for (const r of res.relations) {
      const a = C.get('codex', keyToId.get(r.a));
      const b = keyToId.get(r.b);
      if (!a || !b || (a.links || []).includes(b) || (C.get('codex', b)?.links || []).includes(a.id)) continue;
      C.update('codex', a.id, { links: [...(a.links || []), b] }, { debounce: false });
      linked += 1;
    }
  }

  // Lugares nuevos en el mapa dibujado, junto al lugar que nombran las notas.
  if (body.querySelector('[data-place]')?.checked) {
    for (const l of res.locations) {
      const entry = C.get('codex', keyToId.get(l.place));
      const anchor = C.get('codex', keyToId.get(l.near));
      if (!entry || entry.kind !== 'place' || entry.pos || !anchor?.pos) continue;
      C.update('codex', entry.id, { pos: spotNear(anchor, DIR_VEC[l.direction] || null) }, { debounce: false });
      placed += 1;
    }
  }

  // Sesiones ya analizadas (el análisis de toda la campaña puede saltarlas la próxima vez).
  const now = new Date().toISOString();
  for (const s of res.sessions) C.update('sessions', s.id, { aiAnalyzedAt: now }, { debounce: false });

  closeDialog(dlg);
  toast(t('ai.applied', { fixed, created, updated, linked, placed }), { duration: 8000, group: 'ai' });
  opts.onDone?.();
}
