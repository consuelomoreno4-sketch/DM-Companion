// Piezas de interfaz compartidas por las vistas de la Campaña.

import * as C from './campaign-data.js';
import { normalize } from './monsters.js';
import { esc, icon } from './ui.js';
import { t, getLang } from './i18n.js';

export const KIND_ICON = { character: 'user', place: 'pin', item: 'gem', faction: 'flag' };
export const kindIcon = (kind) => icon(KIND_ICON[kind] || 'user');
export const kindLabel = (kind) => t(`camp.kind.${kind}`);

// "2026-10-27" → "27 oct 2026" (según el idioma)
export function dateText(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString(getLang(), { day: 'numeric', month: 'short', year: 'numeric' });
}

// Los textos crecen solos al escribir (sin barra de desplazamiento interna).
export function autosize(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

// Fichas enlazadas: cada una lleva a su ficha; con removable, también una × para quitar el enlace.
export function linkChips(ids, { removable = false } = {}) {
  return (ids || []).map((id) => {
    const c = C.get('codex', id);
    if (!c) return '';
    return `<span class="link-chip">
      <button type="button" class="link-go" data-go-codex="${esc(id)}">${kindIcon(c.kind)}<span>${esc(c.name || t('camp.unnamed'))}</span></button>
      ${removable ? `<button type="button" class="link-x" data-unlink="${esc(id)}" aria-label="${esc(t('camp.unlink', { name: c.name }))}">${icon('close')}</button>` : ''}
    </span>`;
  }).join('');
}

/**
 * Buscador para enlazar fichas de la bitácora. Devuelve un elemento.
 * exclude(): ids que no se ofrecen; onPick(id): al elegir (o al crear una ficha nueva con ese nombre).
 */
export function linkPicker({ exclude = () => [], onPick }) {
  const box = document.createElement('div');
  box.className = 'picker';
  box.innerHTML = `
    <input type="search" autocomplete="off" spellcheck="false" placeholder="${esc(t('camp.linkPlaceholder'))}" aria-label="${esc(t('camp.linkPlaceholder'))}">
    <ul class="suggest" hidden></ul>`;
  const input = box.querySelector('input');
  const listEl = box.querySelector('ul');
  const close = () => { listEl.hidden = true; listEl.innerHTML = ''; };

  input.addEventListener('input', () => {
    const q = normalize(input.value.trim());
    if (!q) { close(); return; }
    const skip = new Set(exclude());
    const matches = C.list('codex')
      .filter((c) => !skip.has(c.id) && normalize(c.name || '').includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 6);
    const exact = C.list('codex').some((c) => normalize(c.name || '') === q);
    listEl.innerHTML = matches.map((c) => `
      <li role="option" data-pick="${esc(c.id)}"><span class="sg-name">${kindIcon(c.kind)} ${esc(c.name)}</span>
        <span class="sg-meta">${esc(kindLabel(c.kind))}${c.subtitle ? ` · ${esc(c.subtitle)}` : ''}</span></li>`).join('')
      + (exact ? '' : `<li role="option" data-create><span class="sg-name">${icon('plus')} ${esc(t('camp.createNamed', { name: input.value.trim() }))}</span>
        <span class="sg-meta">${esc(t('camp.createHint'))}</span></li>`);
    listEl.hidden = false;
  });
  listEl.addEventListener('pointerdown', (e) => e.preventDefault()); // no quitar el foco antes de elegir
  listEl.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    let id = li.dataset.pick;
    if (li.hasAttribute('data-create')) id = C.create('codex', { kind: 'character', name: input.value.trim(), subtitle: '', tags: [], description: '', links: [] }).id;
    input.value = '';
    close();
    onPick(id);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !listEl.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      listEl.querySelector('li')?.click();
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 200));
  return box;
}
