// Utilidades de interfaz compartidas por todos los paneles.

import { t } from './i18n.js';

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Evita que un nombre como "<b>" se interprete como código.
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

// ---------- Avisos (toasts) ----------

const toastBox = () => document.getElementById('toasts');

/**
 * Muestra un aviso abajo en el centro.
 * kind: 'info' | 'warn' | 'error'. duration en ms (0 = hasta que se cierre).
 * action: { label, run } añade un botón.
 */
export function toast(message, { kind = 'info', duration = 4000, action = null } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', kind === 'info' ? 'status' : 'alert');
  el.innerHTML = `<p>${esc(message)}</p>`;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { action.run(); dismiss(); });
    el.append(btn);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn-icon btn-ghost';
  close.setAttribute('aria-label', t('toast.close'));
  close.innerHTML = icon('close');
  close.addEventListener('click', () => dismiss());
  el.append(close);

  const box = toastBox();
  box.append(el);
  while (box.children.length > 4) box.firstElementChild.remove();

  let timer = duration ? setTimeout(() => dismiss(), duration) : null;
  function dismiss() {
    clearTimeout(timer);
    if (!el.isConnected) return;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 260);
  }
  return dismiss;
}

// ---------- Ventanas ----------

export function openDialog(dlg) {
  if (!dlg.open) dlg.showModal();
}

export function closeDialog(dlg) {
  if (dlg.open) dlg.close();
}

// Cierra con el botón [data-close] o tocando fuera de la ventana.
export function wireDialog(dlg) {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeDialog(dlg);
    if (e.target.closest('[data-close]')) closeDialog(dlg);
  });
}

export function confirmDialog(text, { yes = t('common.yes'), title = t('common.sure') } = {}) {
  const dlg = document.getElementById('dlg-confirm');
  dlg.querySelector('#dlg-confirm-title').textContent = title;
  dlg.querySelector('#dlg-confirm-text').textContent = text;
  dlg.querySelector('#dlg-confirm-yes').textContent = yes;
  dlg.returnValue = '';
  openDialog(dlg);
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'yes'), { once: true });
  });
}

// ¿El usuario está escribiendo en un campo? (entonces no se usan atajos)
export function isTyping(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') {
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(el.type);
  }
  return false;
}
