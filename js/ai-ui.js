// Conexión con Claude en Ajustes: clave de API (solo en este dispositivo), modelo y prueba de conexión.
// Lo usan la Ambientación y el análisis de notas de la Campaña.

import * as AI from './ai.js';
import { esc, icon, toast, confirmDialog } from './ui.js';
import { t } from './i18n.js';

const KEYS_URL = 'https://platform.claude.com/settings/keys';
const listeners = new Set();

/** Avisa cuando se guarda o se borra la clave (para habilitar botones en otros paneles). */
export function onAiChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function aiErrorText(err) {
  const base = t(`ai.err.${err.code || 'network'}`);
  return err.detail && !['no-key', 'offline', 'refusal', 'truncated', 'bad-json'].includes(err.code) ? `${base} (${err.detail})` : base;
}

// Abre Ajustes y lleva a la sección de IA.
export function openAiSettings() {
  document.getElementById('btn-settings')?.click();
  setTimeout(() => document.getElementById('ai-settings')?.scrollIntoView({ block: 'start' }), 50);
}

export async function renderAiSettings(box) {
  const cfg = await AI.loadAiSettings();
  const connected = AI.hasKey();
  box.innerHTML = `
    <p class="hint">${esc(t('ai.intro'))} <a href="${KEYS_URL}" target="_blank" rel="noopener">platform.claude.com</a></p>
    <p><span class="badge ${connected ? 'badge-ok' : 'badge-hb'}">${esc(t(connected ? 'ai.connected' : 'ai.notConnected'))}</span></p>
    <label class="field"><span>${esc(t('ai.key'))}</span>
      <input type="password" data-ai-key autocomplete="off" spellcheck="false" placeholder="${esc(connected ? t('ai.keySaved') : 'sk-ant-…')}"></label>
    <label class="field"><span>${esc(t('ai.model'))}</span>
      <select data-ai-model>${AI.MODELS.map((m) => `<option value="${m.id}"${m.id === cfg.model ? ' selected' : ''}>${esc(m.name)} · $${m.input} / $${m.output} ${esc(t('ai.perMillion'))}</option>`).join('')}</select></label>
    <p class="hint">${esc(t('ai.modelHint'))}</p>
    <div class="map-actions">
      <button class="btn btn-primary" type="button" data-ai-save>${icon('save')}<span>${esc(t('ai.saveKey'))}</span></button>
      <button class="btn" type="button" data-ai-test${connected ? '' : ' disabled'}>${icon('check')}<span>${esc(t('ai.test'))}</span></button>
      ${connected ? `<button class="btn btn-danger" type="button" data-ai-forget>${icon('trash')}<span>${esc(t('ai.forget'))}</span></button>` : ''}
    </div>
    <p class="hint">${esc(t('ai.privacy'))}</p>`;

  box.onclick = async (e) => {
    if (e.target.closest('[data-ai-save]')) {
      const key = box.querySelector('[data-ai-key]').value.trim();
      const model = box.querySelector('[data-ai-model]').value;
      if (key && !key.startsWith('sk-ant-')) { toast(t('ai.keyFormat'), { kind: 'warn', duration: 5000 }); return; }
      await AI.saveAiSettings(key ? { apiKey: key, model } : { model });
      toast(t(key ? 'ai.keyStored' : 'ai.modelStored'), { duration: 3000 });
      listeners.forEach((fn) => fn());
      renderAiSettings(box);
      return;
    }
    const test = e.target.closest('[data-ai-test]');
    if (test) {
      test.disabled = true;
      try {
        const r = await AI.testConnection();
        toast(t('ai.testOk', { model: AI.modelInfo(r.model).name }), { duration: 5000, group: 'ai-test' });
      } catch (err) {
        toast(aiErrorText(err), { kind: 'error', duration: 0, group: 'ai-error' });
      } finally {
        test.disabled = false;
      }
      return;
    }
    if (e.target.closest('[data-ai-forget]')) {
      const ok = await confirmDialog(t('ai.forgetConfirm'), { yes: t('ai.forget') });
      if (!ok) return;
      await AI.saveAiSettings({ apiKey: '' });
      listeners.forEach((fn) => fn());
      renderAiSettings(box);
    }
  };
}
