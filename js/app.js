// Arranque de la app: navegación entre paneles, atajos de teclado,
// copia de seguridad y modo sin internet (service worker).

import * as combat from './combat.js';
import * as combatState from './combat-state.js';
import { exportAll, importAll, validateBackup } from './db.js';
import { toast, openDialog, closeDialog, wireDialog, confirmDialog, isTyping } from './ui.js';

const PANELS = ['combate', 'compendio', 'campana', 'ambientacion'];
const $ = (sel) => document.querySelector(sel);

// ---------- Paneles ----------

function showPanel(name) {
  if (!PANELS.includes(name)) name = 'combate';
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.dataset.panel !== name;
  for (const t of document.querySelectorAll('.tab')) {
    if (t.dataset.panel === name) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
  if (location.hash.slice(1) !== name) history.replaceState(null, '', `#${name}`);
  if (name === 'combate') combat.onShow();
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

// ---------- Copia de seguridad ----------

function wireBackup() {
  const dlg = $('#dlg-backup');
  wireDialog(dlg);
  $('#btn-backup').addEventListener('click', async () => {
    openDialog(dlg);
    $('#storage-info').textContent = await storageInfo();
  });

  $('#btn-export').addEventListener('click', async () => {
    try {
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
      toast('Copia descargada. Búscala en la carpeta «Descargas».', { duration: 5000 });
    } catch (err) {
      toast(`No se pudo exportar: ${err.message}`, { kind: 'error', duration: 0 });
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
      const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('es') : 'fecha desconocida';
      const ok = await confirmDialog(
        `Se reemplazarán TODOS los datos actuales por los de la copia del ${when}. Esto no se puede deshacer.`,
        { yes: 'Reemplazar', title: '¿Importar copia?' },
      );
      if (!ok) return;
      await importAll(data);
      await combatState.load();
      closeDialog(dlg);
      toast('Copia de seguridad importada.', { duration: 4000 });
    } catch (err) {
      const msg = err instanceof SyntaxError ? 'El archivo está dañado o no es JSON.' : err.message;
      toast(`No se pudo importar: ${msg}`, { kind: 'error', duration: 0 });
    }
  });
}

async function storageInfo() {
  if (!navigator.storage?.estimate) return '';
  try {
    const [{ usage }, persisted] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted?.()]);
    const kb = Math.max(1, Math.round((usage || 0) / 1024));
    return `Espacio usado: ${kb.toLocaleString('es')} KB. ${persisted ? 'El navegador no borrará estos datos automáticamente.' : 'Instala la app para que el navegador conserve los datos.'}`;
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
    toast('App instalada. Ya funciona sin internet.', { duration: 5000 });
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    const offerUpdate = (worker) => {
      toast('Hay una versión nueva de la app.', {
        duration: 0,
        action: { label: 'Actualizar', run: () => worker.postMessage('skipWaiting') },
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
    console.warn('Service worker no registrado:', err);
  }
}

// ---------- Inicio ----------

async function start() {
  combat.initCombat();
  wireShortcuts();
  wireBackup();
  wireInstall();
  window.addEventListener('hashchange', () => showPanel(location.hash.slice(1)));
  showPanel(location.hash.slice(1));

  try {
    await combatState.load();
  } catch (err) {
    toast(`No se pudieron cargar los datos: ${err.message}`, { kind: 'error', duration: 0 });
  }
  navigator.storage?.persist?.().catch(() => {});
  registerServiceWorker();
}

start();
