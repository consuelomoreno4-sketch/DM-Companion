// Panel de Ambientación: descripciones de escena generadas con Claude (necesita internet y una clave de API).
// Las descripciones guardadas quedan en el dispositivo (almacén 'scenes') y se pueden leer sin internet.

import * as AI from './ai.js';
import { storeAll, storePut, storeDelete } from './db.js';
import * as C from './campaign-data.js';
import { esc, icon, toast, confirmDialog } from './ui.js';
import { t, getLang } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const MOODS = ['eerie', 'peaceful', 'tense', 'epic', 'melancholic', 'festive', 'mysterious', 'dangerous'];
const SENSES = ['sight', 'sound', 'smell', 'touch', 'taste'];
const LENGTHS = { short: 70, medium: 130, long: 230 };
const LANG_NAMES = { en: 'English', es: 'Spanish', de: 'German' };
const PROVIDER_KEYS_URL = 'https://platform.claude.com/settings/keys';

// Lo que hay en el formulario (se conserva al cambiar de panel).
const form = { scene: '', codex: '', moods: [], senses: ['sight', 'sound', 'smell'], style: 'read', length: 'medium', language: null };
let result = null;      // { text, title, cost, saved, params }
let saved = [];
let controller = null;  // para detener una generación en curso
let els;

export function initAmbience() {
  els = { panel: $('#panel-ambientacion'), root: $('#amb-root') };
  els.root.addEventListener('click', onClick);
  els.root.addEventListener('input', onInput);
  els.root.addEventListener('change', onInput);
  window.addEventListener('online', renderGenerate);
  window.addEventListener('offline', renderGenerate);
}

export async function onShow() {
  if (!els) return;
  await AI.loadAiSettings();
  form.language ??= getLang();
  try { saved = (await storeAll('scenes')).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); } catch { saved = []; }
  await C.loadCampaign().catch(() => {});
  render();
}

// ---------- Dibujo ----------

function render() {
  const cfg = AI.hasKey();
  els.root.innerHTML = `
    <div class="amb">
      <div class="amb-side">
        <details class="amb-setup"${cfg ? '' : ' open'}>
          <summary>${icon('gear')}<span>${esc(t('ai.connection'))}</span>
            <span class="badge ${cfg ? 'badge-ok' : 'badge-hb'}">${esc(t(cfg ? 'ai.connected' : 'ai.notConnected'))}</span></summary>
          <div class="stack amb-setup-body" data-setup></div>
        </details>
        <label class="field"><span>${esc(t('amb.scene'))}</span>
          <textarea data-f="scene" rows="3" placeholder="${esc(t('amb.scenePlaceholder'))}">${esc(form.scene)}</textarea></label>
        <label class="field"><span>${esc(t('amb.fromCodex'))}</span>
          <select data-f="codex">${codexOptions()}</select></label>
        <div class="field"><span>${esc(t('amb.mood'))}</span>
          <div class="chip-toggles">${MOODS.map((m) => `<button type="button" class="btn chip-toggle" data-mood="${m}" aria-pressed="${form.moods.includes(m)}">${esc(t(`amb.moods.${m}`))}</button>`).join('')}</div></div>
        <div class="field"><span>${esc(t('amb.senses'))}</span>
          <div class="chip-toggles">${SENSES.map((m) => `<button type="button" class="btn chip-toggle" data-sense="${m}" aria-pressed="${form.senses.includes(m)}">${esc(t(`amb.sensesList.${m}`))}</button>`).join('')}</div></div>
        <div class="field"><span>${esc(t('amb.style'))}</span>
          <div class="segmented seg-2" role="radiogroup">${['read', 'notes'].map((s) => `<label class="seg"><input type="radio" name="amb-style" value="${s}"${form.style === s ? ' checked' : ''}><span>${esc(t(`amb.styles.${s}`))}</span></label>`).join('')}</div></div>
        <div class="field-row">
          <div class="field"><span>${esc(t('amb.length'))}</span>
            <div class="segmented" role="radiogroup">${Object.keys(LENGTHS).map((l) => `<label class="seg"><input type="radio" name="amb-length" value="${l}"${form.length === l ? ' checked' : ''}><span>${esc(t(`amb.lengths.${l}`))}</span></label>`).join('')}</div></div>
        </div>
        <label class="field"><span>${esc(t('amb.language'))}</span>
          <select data-f="language">${Object.keys(LANG_NAMES).map((l) => `<option value="${l}"${form.language === l ? ' selected' : ''}>${esc(t(`amb.langs.${l}`))}</option>`).join('')}</select></label>
        <div data-generate></div>
      </div>
      <div class="amb-main">
        <section class="amb-result" data-result aria-live="polite"></section>
        <h3>${icon('save')} ${esc(t('amb.saved'))}</h3>
        <div class="amb-saved" data-saved></div>
      </div>
    </div>`;
  renderSetup();
  renderGenerate();
  renderResult();
  renderSaved();
}

function codexOptions() {
  const entries = C.list('codex').filter((c) => c.name?.trim());
  const order = ['place', 'faction', 'character', 'item'];
  const groups = order.map((k) => {
    const items = entries.filter((c) => c.kind === k).sort((a, b) => a.name.localeCompare(b.name));
    return items.length ? `<optgroup label="${esc(t(`camp.kinds.${k}`))}">${items.map((c) => `<option value="${esc(c.id)}"${form.codex === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  return `<option value="">${esc(t('amb.noCodex'))}</option>${groups}`;
}

function renderSetup() {
  const box = els.root.querySelector('[data-setup]');
  const cfg = AI.hasKey();
  const model = AI.modelInfo((AI.loadAiSettings && settingsSync().model) || AI.DEFAULT_MODEL);
  box.innerHTML = `
    <p class="hint">${esc(t('ai.intro'))} <a href="${PROVIDER_KEYS_URL}" target="_blank" rel="noopener">platform.claude.com</a></p>
    <label class="field"><span>${esc(t('ai.key'))}</span>
      <input type="password" data-key autocomplete="off" spellcheck="false" placeholder="${esc(cfg ? t('ai.keySaved') : 'sk-ant-…')}"></label>
    <label class="field"><span>${esc(t('ai.model'))}</span>
      <select data-model>${AI.MODELS.map((m) => `<option value="${m.id}"${m.id === model.id ? ' selected' : ''}>${esc(m.name)} · $${m.input} / $${m.output} ${esc(t('ai.perMillion'))}</option>`).join('')}</select></label>
    <p class="hint">${esc(t('ai.modelHint'))}</p>
    <div class="map-actions">
      <button class="btn btn-primary" type="button" data-save-key>${icon('save')}<span>${esc(t('ai.saveKey'))}</span></button>
      <button class="btn" type="button" data-test${cfg ? '' : ' disabled'}>${icon('check')}<span>${esc(t('ai.test'))}</span></button>
      ${cfg ? `<button class="btn btn-danger" type="button" data-forget>${icon('trash')}<span>${esc(t('ai.forget'))}</span></button>` : ''}
    </div>
    <p class="hint">${esc(t('ai.privacy'))}</p>`;
}

// Copia síncrona de los ajustes ya cargados (loadAiSettings se llamó en onShow).
let cachedSettings = null;
function settingsSync() { return cachedSettings || {}; }

function renderGenerate() {
  const box = els?.root.querySelector('[data-generate]');
  if (!box) return;
  const reason = !AI.hasKey() ? t('ai.err.no-key') : !navigator.onLine ? t('ai.err.offline') : '';
  box.innerHTML = controller
    ? `<button class="btn btn-lg btn-danger amb-go" type="button" data-stop>${icon('close')}<span>${esc(t('amb.stop'))}</span></button>`
    : `<button class="btn btn-lg btn-primary amb-go" type="button" data-generate-btn${reason ? ' disabled' : ''}>${icon('sparkles')}<span>${esc(t('amb.generate'))}</span></button>
       ${reason ? `<p class="hint">${esc(reason)}</p>` : ''}`;
}

function renderResult(streaming = false) {
  const box = els.root.querySelector('[data-result]');
  if (!box) return;
  if (!result) {
    box.innerHTML = `<div class="comp-placeholder">${icon('sparkles', 'icon-xl')}<p>${esc(t('amb.empty'))}</p></div>`;
    return;
  }
  box.innerHTML = `
    <header class="amb-result-head">
      <h3>${esc(result.title)}</h3>
      <span class="hint" data-status>${esc(streaming ? t('amb.writing') : result.cost != null ? t('amb.cost', { cost: result.cost < 0.01 ? '<0.01' : result.cost.toFixed(2) }) : '')}</span>
    </header>
    <div class="amb-text${result.style === 'notes' ? ' amb-notes' : ''}" data-text>${esc(result.text) || `<span class="hint">${esc(t('amb.thinking'))}</span>`}</div>
    ${streaming ? '' : `<div class="map-actions">
      ${result.saved ? `<span class="badge badge-ok">${icon('check')} ${esc(t('amb.savedBadge'))}</span>` : `<button class="btn btn-primary" type="button" data-save-scene>${icon('save')}<span>${esc(t('amb.save'))}</span></button>`}
      <button class="btn" type="button" data-copy>${icon('scroll')}<span>${esc(t('amb.copy'))}</span></button>
      ${result.params ? `<button class="btn" type="button" data-again${AI.hasKey() && navigator.onLine ? '' : ' disabled'}>${icon('refresh')}<span>${esc(t('amb.again'))}</span></button>` : ''}
    </div>`}`;
}

function renderSaved() {
  const box = els.root.querySelector('[data-saved]');
  if (!box) return;
  box.innerHTML = saved.length ? saved.map((s) => `
    <article class="amb-card">
      <button type="button" class="amb-card-open" data-open-scene="${esc(s.id)}">
        <span class="comp-name">${esc(s.title)}</span>
        <span class="comp-meta">${esc(new Date(s.createdAt).toLocaleDateString(getLang()))} · ${esc(s.text.slice(0, 120))}${s.text.length > 120 ? '…' : ''}</span>
      </button>
      <button class="btn btn-icon btn-ghost" type="button" data-delete-scene="${esc(s.id)}" aria-label="${esc(t('comp.delete'))}">${icon('trash')}</button>
    </article>`).join('') : `<p class="hint">${esc(t('amb.noSaved'))}</p>`;
}

// ---------- Acciones ----------

export function aiErrorText(err) {
  const base = t(`ai.err.${err.code || 'network'}`);
  return err.detail && !['no-key', 'offline', 'refusal', 'truncated'].includes(err.code) ? `${base} (${err.detail})` : base;
}

function buildParams() {
  const entry = form.codex ? C.get('codex', form.codex) : null;
  const context = entry ? [entry.name, entry.subtitle, entry.description].filter((x) => x?.trim()).join(' — ') : '';
  const sceneText = form.scene.trim() || entry?.name || '';
  return {
    scene: sceneText,
    context,
    moods: form.moods.map((m) => m),
    senses: form.senses.map((s) => s),
    style: form.style === 'notes' ? 'notes' : 'read',
    words: LENGTHS[form.length] || LENGTHS.medium,
    language: LANG_NAMES[form.language] || 'English',
  };
}

async function generate(params) {
  if (!params.scene) { toast(t('amb.needScene'), { duration: 3000 }); els.root.querySelector('[data-f="scene"]')?.focus(); return; }
  controller = new AbortController();
  result = { title: params.scene.slice(0, 80), text: '', style: params.style, params, saved: false, cost: null };
  renderGenerate();
  renderResult(true);
  const textEl = () => els.root.querySelector('[data-text]');
  try {
    const r = await AI.streamMessage({
      system: AI.SCENE_SYSTEM,
      user: AI.sceneUserPrompt(params),
      maxTokens: 16000,
      effort: 'medium',
      signal: controller.signal,
      onText: (text) => {
        result.text = text;
        const el = textEl();
        if (el) el.textContent = text;
      },
    });
    result.text = r.text.trim();
    result.cost = AI.estimateCost(r.usage, r.model);
  } catch (err) {
    if (err.name === 'AbortError') {
      result.text = result.text.trim();
      if (!result.text) result = null;
    } else {
      result = null;
      toast(aiErrorText(err), { kind: 'error', duration: 0, group: 'ai-error' });
    }
  } finally {
    controller = null;
    renderGenerate();
    renderResult(false);
  }
}

async function onClick(e) {
  const target = e.target;
  const mood = target.closest('[data-mood]');
  if (mood) { toggle(form.moods, mood.dataset.mood); mood.setAttribute('aria-pressed', String(form.moods.includes(mood.dataset.mood))); return; }
  const sense = target.closest('[data-sense]');
  if (sense) { toggle(form.senses, sense.dataset.sense); sense.setAttribute('aria-pressed', String(form.senses.includes(sense.dataset.sense))); return; }
  if (target.closest('[data-generate-btn]')) { generate(buildParams()); return; }
  if (target.closest('[data-again]') && result?.params) { generate(result.params); return; }
  if (target.closest('[data-stop]')) { controller?.abort(); return; }
  if (target.closest('[data-save-key]')) {
    const key = els.root.querySelector('[data-key]').value.trim();
    const model = els.root.querySelector('[data-model]').value;
    if (key && !key.startsWith('sk-ant-')) { toast(t('ai.keyFormat'), { kind: 'warn', duration: 5000 }); return; }
    cachedSettings = await AI.saveAiSettings(key ? { apiKey: key, model } : { model });
    toast(t(key ? 'ai.keyStored' : 'ai.modelStored'), { duration: 3000 });
    render();
    return;
  }
  if (target.closest('[data-test]')) {
    const btn = target.closest('[data-test]');
    btn.disabled = true;
    try {
      const r = await AI.testConnection();
      toast(t('ai.testOk', { model: AI.modelInfo(r.model).name }), { duration: 5000, group: 'ai-test' });
    } catch (err) {
      toast(aiErrorText(err), { kind: 'error', duration: 0, group: 'ai-error' });
    } finally {
      btn.disabled = false;
    }
    return;
  }
  if (target.closest('[data-forget]')) {
    const ok = await confirmDialog(t('ai.forgetConfirm'), { yes: t('ai.forget') });
    if (!ok) return;
    cachedSettings = await AI.saveAiSettings({ apiKey: '' });
    render();
    return;
  }
  if (target.closest('[data-save-scene]') && result) {
    const scene = { id: `sc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: result.title, text: result.text, style: result.style, params: result.params, createdAt: new Date().toISOString() };
    await storePut('scenes', scene);
    saved.unshift(scene);
    result.saved = true;
    renderResult();
    renderSaved();
    toast(t('amb.savedToast'), { duration: 2500 });
    return;
  }
  if (target.closest('[data-copy]') && result) {
    try {
      await navigator.clipboard.writeText(result.text);
      toast(t('amb.copied'), { duration: 2000 });
    } catch {
      toast(t('amb.copyFailed'), { kind: 'warn', duration: 4000 });
    }
    return;
  }
  const open = target.closest('[data-open-scene]');
  if (open) {
    const s = saved.find((x) => x.id === open.dataset.openScene);
    if (s) { result = { title: s.title, text: s.text, style: s.style, params: s.params, saved: true, cost: null }; renderResult(); }
    els.root.querySelector('[data-result]')?.scrollIntoView({ block: 'start' });
    return;
  }
  const del = target.closest('[data-delete-scene]');
  if (del) {
    const s = saved.find((x) => x.id === del.dataset.deleteScene);
    const ok = await confirmDialog(t('comp.deleteConfirm', { name: s?.title || '' }), { yes: t('comp.delete') });
    if (!ok) return;
    await storeDelete('scenes', del.dataset.deleteScene);
    saved = saved.filter((x) => x.id !== del.dataset.deleteScene);
    renderSaved();
  }
}

function onInput(e) {
  const f = e.target.dataset.f;
  if (f) form[f] = e.target.value;
  if (e.target.name === 'amb-style') form.style = e.target.value;
  if (e.target.name === 'amb-length') form.length = e.target.value;
}

function toggle(list, value) {
  const i = list.indexOf(value);
  if (i === -1) list.push(value); else list.splice(i, 1);
}
