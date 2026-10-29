// Arranque de la app: idioma, navegación entre paneles, atajos de teclado,
// ajustes y copia de seguridad, y modo sin internet (service worker).

import * as combat from './combat.js';
import * as combatState from './combat-state.js';
import * as compendium from './compendium.js';
import * as campaign from './campaign.js';
import { initClock } from './clock-ui.js';
import * as ambience from './ambience.js';
import { renderAiSettings } from './ai-ui.js';
import { loadAiSettings } from './ai.js';
import { exportAll, importAll, validateBackup, kvGet, kvSet } from './db.js';
import { toast, openDialog, closeDialog, wireDialog, confirmDialog, isTyping, esc } from './ui.js';
import { t, setLang, getLang, applyStatic, LANGS, DEFAULT_LANG } from './i18n.js';

const PANELS = ['combate', 'compendio', 'campana', 'ambientacion'];
const $ = (sel) => document.querySelector(sel);

// ---------- Idioma ----------

async function loadSettings() {
  try {
    return (await kvGet('settings')) || {};
  } catch {
    return {};
  }
}

function translatePage() {
  applyStatic();
  for (const el of document.querySelectorAll('[data-coming]')) {
    el.innerHTML = `${t('coming.phase', { n: el.dataset.phase })} ${esc(t(`coming.${el.dataset.coming}`))}`;
  }
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = `${t('tab.combat')} · ${t('tab.compendium')} · ${t('tab.campaign')} · ${t('tab.ambience')}`;
}

function renderLangPicker() {
  const box = $('#lang-picker');
  box.innerHTML = LANGS.map(([code, name]) => `
    <label class="seg"><input type="radio" name="lang" value="${code}"${code === getLang() ? ' checked' : ''}><span lang="${code}">${name}</span></label>`).join('');
  box.addEventListener('change', async (e) => {
    const code = e.target.value;
    const settings = await loadSettings();
    await kvSet('settings', { ...settings, lang: code });
    location.reload(); // la forma más segura de traducir todo de una vez
  });
}

// ---------- Paneles ----------

function showPanel(name) {
  if (!PANELS.includes(name)) name = 'combate';
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.dataset.panel !== name;
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.panel === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (location.hash.slice(1) !== name) history.replaceState(null, '', `#${name}`);
  if (name === 'combate') combat.onShow();
  if (name === 'compendio') compendium.onShow();
  if (name === 'campana') campaign.onShow();
  if (name === 'ambientacion') ambience.onShow();
}

const currentPanel = () => document.querySelector('.panel:not([hidden])')?.dataset.panel;

// ---------- Atajos de teclado ----------

function wireShortcuts() {
  document.addEventListener('keydown', (e) => {
    document.body.classList.add('has-keyboard'); // muestra las pistas de teclas en las pestañas
    if (e.key === 'Escape') return; // las ventanas se cierran solas con Esc

    if (isTyping(e.target)) return;                       // nunca mientras se escribe
    if (document.querySelector('dialog[open]')) return;   // ni con una ventana abierta

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      combat.undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.code === 'Space' && currentPanel() === 'combate') {
      e.preventDefault();
      // Evita que la barra espaciadora también "pulse" el botón que tenga el foco.
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      if (e.repeat) return;
      if (e.shiftKey) combat.prev();
      else combat.next();
      return;
    }
    const n = ['1', '2', '3', '4'].indexOf(e.key);
    if (n !== -1 && !e.shiftKey) {
      e.preventDefault();
      showPanel(PANELS[n]);
    }
  });
  // Al tocar la pantalla se ocultan otra vez las pistas de teclas.
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') document.body.classList.remove('has-keyboard');
  });
}

// ---------- Ajustes y copia de seguridad ----------

function wireSettings() {
  const dlg = $('#dlg-settings');
  wireDialog(dlg);
  renderLangPicker();
  $('#btn-settings').addEventListener('click', async () => {
    openDialog(dlg);
    renderAiSettings($('#ai-settings-body'));
    $('#storage-info').textContent = await storageInfo();
  });

  $('#btn-export').addEventListener('click', async () => {
    try {
      await campaign.flush(); // incluye lo que se acaba de escribir
      const data = await exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `dm-companion_${stamp}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast(t('backup.downloaded'), { duration: 5000 });
    } catch (err) {
      toast(t('backup.exportError', { msg: t(err.message) }), { kind: 'error', duration: 0 });
    }
  });

  const file = $('#file-import');
  $('#btn-import').addEventListener('click', () => { file.value = ''; file.click(); });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      validateBackup(data);
      const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString(getLang()) : t('backup.unknownDate');
      const ok = await confirmDialog(t('backup.importConfirm', { when }), { yes: t('backup.importYes'), title: t('backup.importTitle') });
      if (!ok) return;
      await importAll(data);
      location.reload(); // vuelve a cargar todo, incluido el idioma de la copia
    } catch (err) {
      const msg = err instanceof SyntaxError ? t('backup.badJson') : t(err.message);
      toast(t('backup.importError', { msg }), { kind: 'error', duration: 0 });
    }
  });
}

async function storageInfo() {
  if (!navigator.storage?.estimate) return '';
  try {
    const [{ usage }, persisted] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted?.()]);
    const kb = Math.max(1, Math.round((usage || 0) / 1024)).toLocaleString(getLang());
    return `${t('storage.used', { kb })} ${t(persisted ? 'storage.persisted' : 'storage.notPersisted')}`;
  } catch {
    return '';
  }
}

// ---------- Instalar y modo sin internet ----------

function wireInstall() {
  let deferred = null;
  const btn = $('#btn-install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    btn.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    btn.hidden = true;
    toast(t('app.installed'), { duration: 5000 });
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    const offerUpdate = (worker) => {
      toast(t('app.newVersion'), {
        duration: 0,
        action: { label: t('app.update'), run: () => worker.postMessage('skipWaiting') },
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
      });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  } catch (err) {
    console.warn('Service worker not registered:', err);
  }
}

// ---------- Inicio ----------

async function start() {
  const settings = await loadSettings();
  setLang(settings.lang || DEFAULT_LANG);
  translatePage();

  combat.initCombat();
  compendium.initCompendium();
  campaign.initCampaign();
  ambience.initAmbience();
  loadAiSettings().catch(() => {});
  // El reloj de juego (barra superior); "Línea de tiempo" abre Campaña → Tiempo.
  initClock({ onTimeline: () => { campaign.setView('time'); showPanel('campana'); } }).catch(() => {});
  wireShortcuts();
  wireSettings();
  wireInstall();
  window.addEventListener('hashchange', () => showPanel(location.hash.slice(1)));
  showPanel(location.hash.slice(1));

  try {
    await combatState.load();
  } catch (err) {
    toast(t('app.loadError', { msg: t(err.message) }), { kind: 'error', duration: 0 });
  }
  navigator.storage?.persist?.().catch(() => {});
  registerServiceWorker();
}

start();
