// Vista "Líneas de historia" de la Campaña: tablero con tres columnas (idea / activa / resuelta).
// Cada tarjeta se mueve con ◀ ▶ y se edita en una ventana (título, estado, descripción, fichas enlazadas).

import * as C from './campaign-data.js';
import { autosize, linkChips, linkPicker } from './campaign-ui.js';
import { esc, icon, openDialog, closeDialog, wireDialog, confirmDialog, toast } from './ui.js';
import { t } from './i18n.js';

const STATUS_ICON = { idea: 'sparkles', active: 'flag', resolved: 'check' };

// La ventana de edición es una sola para toda la app: su estado vive aquí, fuera de cada vista.
let dlg;
let body;
let editingId = null;
let navigate = () => {};

function renderDialogLinks() {
  const st = C.get('storylines', editingId);
  const box = body.querySelector('[data-slinks]');
  if (st && box) box.innerHTML = linkChips(st.links, { removable: true }) || `<span class="hint">${esc(t('camp.noLinks'))}</span>`;
}

function renderDialog() {
  const st = C.get('storylines', editingId);
  if (!st) { closeDialog(dlg); return; }
  body.innerHTML = `
    <header class="dialog-head">
      <h2 id="dlg-story-title">${esc(t('camp.storyline'))}</h2>
      <button class="btn btn-icon" type="button" data-close aria-label="${esc(t('common.close'))}">${icon('close')}</button>
    </header>
    <label class="field"><span>${esc(t('camp.title'))}</span><input data-sfield="title" maxlength="120" value="${esc(st.title || '')}" placeholder="${esc(t('camp.storyPlaceholder'))}"></label>
    <div class="segmented" role="radiogroup" aria-label="${esc(t('camp.statusLabel'))}">
      ${C.STATUSES.map((s) => `<label class="seg"><input type="radio" name="story-status" value="${s}"${st.status === s ? ' checked' : ''}><span>${icon(STATUS_ICON[s])} ${esc(t(`camp.status.${s}`))}</span></label>`).join('')}
    </div>
    <label class="field"><span>${esc(t('entry.spellText'))}</span><textarea data-sfield="description" rows="6">${esc(st.description || '')}</textarea></label>
    <div class="stack">
      <h3>${icon('link')} ${esc(t('camp.involved'))}</h3>
      <div class="link-chips" data-slinks></div>
      <div data-spicker></div>
    </div>
    <footer class="dialog-foot">
      <button class="btn btn-danger" type="button" data-sdelete>${icon('trash')}<span>${esc(t('comp.delete'))}</span></button>
      <button class="btn btn-primary" type="button" data-close>${esc(t('common.close'))}</button>
    </footer>`;
  body.querySelector('[data-spicker]').append(linkPicker({
    exclude: () => C.get('storylines', editingId)?.links || [],
    onPick: (id) => {
      const cur = C.get('storylines', editingId);
      C.update('storylines', cur.id, { links: [...(cur.links || []), id] }, { debounce: false });
      renderDialogLinks();
    },
  }));
  body.querySelectorAll('textarea').forEach(autosize);
  renderDialogLinks();
}

function openStory(id, focusTitle = false) {
  editingId = id;
  renderDialog();
  openDialog(dlg);
  if (focusTitle) body.querySelector('[data-sfield="title"]').focus();
}

function wireDialogOnce() {
  if (dlg) return;
  dlg = document.getElementById('dlg-story');
  body = document.getElementById('story-body');
  wireDialog(dlg);
  body.addEventListener('input', (e) => {
    const field = e.target.dataset.sfield;
    if (!field || !editingId) return;
    C.update('storylines', editingId, { [field]: e.target.value });
    if (e.target.tagName === 'TEXTAREA') autosize(e.target);
  });
  body.addEventListener('change', (e) => {
    if (e.target.name === 'story-status') C.update('storylines', editingId, { status: e.target.value }, { debounce: false });
  });
  body.addEventListener('click', async (e) => {
    const unlink = e.target.closest('[data-unlink]');
    if (unlink) {
      const st = C.get('storylines', editingId);
      C.update('storylines', st.id, { links: st.links.filter((l) => l !== unlink.dataset.unlink) }, { debounce: false });
      renderDialogLinks();
      return;
    }
    const go = e.target.closest('[data-go-codex]');
    if (go) { closeDialog(dlg); navigate('codex', go.dataset.goCodex); return; }
    if (e.target.closest('[data-sdelete]')) {
      const st = C.get('storylines', editingId);
      const ok = await confirmDialog(t('comp.deleteConfirm', { name: st.title || t('camp.untitled') }), { yes: t('comp.delete') });
      if (!ok) return;
      closeDialog(dlg);
      await C.remove('storylines', st.id);
      toast(t('camp.deleted'), { duration: 2500 });
    }
  });
  // Una tarjeta creada y cerrada sin escribir nada se descarta.
  dlg.addEventListener('close', () => {
    const st = C.get('storylines', editingId);
    if (st && !st.title?.trim() && !st.description?.trim() && !st.links?.length) C.remove('storylines', st.id);
    editingId = null;
  });
}

export function mountStories(root, ctx) {
  wireDialogOnce();
  navigate = ctx.navigate;
  root.innerHTML = '<div class="story-board" data-board></div>';
  const board = root.querySelector('[data-board]');

  function card(st) {
    const i = C.STATUSES.indexOf(st.status);
    const prev = C.STATUSES[i - 1];
    const next = C.STATUSES[i + 1];
    return `
      <article class="story-card status-${esc(st.status)}" data-story="${esc(st.id)}">
        <button type="button" class="story-open" data-open="${esc(st.id)}">
          <span class="story-title">${esc(st.title || t('camp.untitled'))}</span>
          ${st.description ? `<span class="story-desc">${esc(st.description.slice(0, 140))}${st.description.length > 140 ? '…' : ''}</span>` : ''}
        </button>
        ${st.links?.length ? `<div class="link-chips">${linkChips(st.links)}</div>` : ''}
        <div class="story-move">
          <button class="btn btn-icon" type="button" data-move="-1" aria-label="${esc(prev ? t('camp.moveTo', { status: t(`camp.status.${prev}`) }) : '')}"${prev ? '' : ' disabled'}>${icon('left')}</button>
          <button class="btn btn-icon" type="button" data-move="1" aria-label="${esc(next ? t('camp.moveTo', { status: t(`camp.status.${next}`) }) : '')}"${next ? '' : ' disabled'}>${icon('right')}</button>
        </div>
      </article>`;
  }

  function renderBoard() {
    board.innerHTML = C.STATUSES.map((status) => {
      const items = C.list('storylines').filter((s) => s.status === status)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return `
        <section class="sboard-col col-${status}" aria-label="${esc(t(`camp.status.${status}`))}">
          <header class="sboard-head">
            <h3>${icon(STATUS_ICON[status])} ${esc(t(`camp.status.${status}`))} <span class="badge num">${items.length}</span></h3>
            <button class="btn btn-icon" type="button" data-add="${status}" aria-label="${esc(t('camp.newStoryIn', { status: t(`camp.status.${status}`) }))}">${icon('plus')}</button>
          </header>
          <div class="sboard-cards">${items.map(card).join('') || `<p class="hint sboard-empty">${esc(t(`camp.emptyCol.${status}`))}</p>`}</div>
        </section>`;
    }).join('');
  }

  root.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { openStory(open.dataset.open); return; }
    const add = e.target.closest('[data-add]');
    if (add) {
      const st = C.create('storylines', { title: '', status: add.dataset.add, description: '', links: [] });
      openStory(st.id, true);
      return;
    }
    const move = e.target.closest('[data-move]');
    if (move) {
      const st = C.get('storylines', move.closest('[data-story]').dataset.story);
      const next = C.STATUSES[C.STATUSES.indexOf(st.status) + Number(move.dataset.move)];
      if (next) C.update('storylines', st.id, { status: next }, { debounce: false });
      return;
    }
    const go = e.target.closest('[data-go-codex]');
    if (go) ctx.navigate('codex', go.dataset.goCodex);
  });

  renderBoard();

  return {
    update(what) { if (what === 'storylines' || what === 'codex') renderBoard(); },
    show(id) { if (id) openStory(id); },
  };
}
