// Traducciones. La app empieza en inglés; el idioma se cambia en Ajustes.
// Los textos de index.html se marcan con data-i18n="clave" (y data-i18n-html, -aria, -placeholder, -title).

import en from './i18n/en.js';
import es from './i18n/es.js';
import de from './i18n/de.js';

const DICTS = { en, es, de };
export const LANGS = [['en', 'English'], ['es', 'Español'], ['de', 'Deutsch']];
export const DEFAULT_LANG = 'en';

let lang = DEFAULT_LANG;

export function setLang(code) {
  lang = DICTS[code] ? code : DEFAULT_LANG;
  document.documentElement.lang = lang;
}

export const getLang = () => lang;

// t('msg.turn', { name: 'Goblin' }) → "Goblin's turn"
export function t(key, params = {}) {
  const text = DICTS[lang][key] ?? DICTS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
}

// Singular/plural: tn('round', 2) → "2 rounds"
export function tn(key, n, params = {}) {
  return t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...params });
}

// Las etiquetas de deshacer y los avisos se guardan como { key, params } y se traducen al mostrarse.
export function tm(msg) {
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  const params = { ...msg.params };
  if (params.cond) params.cond = t(`cond.${params.cond}`);
  return t(msg.key, params);
}

export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}
