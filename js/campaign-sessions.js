// Vista "Sesiones" de la Campaña: historial de sesiones y notas en punteo.
//
// Notas: cada punto es un cuadro de texto. Enter crea un punto nuevo (también con el teclado de la tablet:
// se detecta el salto de línea al escribir). Tab / Shift+Tab o los botones cambian la sangría.

import * as C from './campaign-data.js';
import { autosize, dateText } from './campaign-ui.js';
import { esc, icon, confirmDialog, toast } from './ui.js';
import { t } from './i18n.js';

export function mountSessions(root, ctx) {
  root.innerHTML = `
    <div class="camp-split">
      <div class="camp-side">
        <button class="btn btn-primary" type="button" data-new>${icon('plus')}<span>${esc(t('camp.newSession'))}</span></button>
        <ul class="camp-list" data-list></ul>
      </div>
      <div class="camp-main" data-editor></div>
    </div>`;
  const listEl = root.querySelector('[data-list]');
  const editor = root.querySelector('[data-editor]');
  let focusedNote = null;

  const current = () => C.get('sessions', ctx.selected('sessions')) ?? C.sessionsSorted()[0] ?? null;

  function renderList() {
    const cur = current();
    const items = C.sessionsSorted();
    listEl.innerHTML = items.length ? items.map((s) => `
      <li><button type="button" class="comp-item" data-pick="${esc(s.id)}" aria-current="${s.id === cur?.id}">
        <span class="comp-name"><span class="num">#${esc(s.number ?? '')}</span> ${esc(s.title || t('camp.untitled'))}</span>
        <span class="comp-meta">${esc(dateText(s.date))}${s.summary ? ` · ${esc(s.summary.slice(0, 60))}` : ''}</span>
      </button></li>`).join('') : `<li class="comp-msg">${esc(t('camp.noSessions'))}</li>`;
  }

  function renderEditor() {
    const s = current();
    focusedNote = null;
    if (!s) {
      editor.innerHTML = `<div class="comp-placeholder">${icon('scroll', 'icon-xl')}<p>${esc(t('camp.noSessionsHint'))}</p>
        <button class="btn btn-primary btn-lg" type="button" data-new>${icon('plus')}<span>${esc(t('camp.newSession'))}</span></button></div>`;
      return;
    }
    editor.innerHTML = `
      <div class="sess-head">
        <label class="field sess-num"><span>${esc(t('camp.number'))}</span><input type="number" inputmode="numeric" min="0" max="9999" data-field="number" value="${esc(s.number ?? '')}"></label>
        <label class="field sess-date"><span>${esc(t('camp.date'))}</span><input type="date" data-field="date" value="${esc(s.date || '')}"></label>
        <label class="field sess-title"><span>${esc(t('camp.title'))}</span><input data-field="title" maxlength="120" value="${esc(s.title || '')}" placeholder="${esc(t('camp.titlePlaceholder'))}"></label>
        <button class="btn btn-icon btn-danger" type="button" data-delete aria-label="${esc(t('camp.deleteSession'))}">${icon('trash')}</button>
      </div>
      <label class="field"><span>${esc(t('camp.summary'))}</span><textarea data-field="summary" rows="2" placeholder="${esc(t('camp.summaryPlaceholder'))}">${esc(s.summary || '')}</textarea></label>
      <div class="notes-head">
        <h3>${esc(t('camp.notes'))}</h3>
        <div class="bullet-tools" role="toolbar" aria-label="${esc(t('camp.notes'))}">
          <button class="btn btn-icon" type="button" data-bullet="outdent" aria-label="${esc(t('camp.outdent'))}">${icon('outdent')}</button>
          <button class="btn btn-icon" type="button" data-bullet="indent" aria-label="${esc(t('camp.indent'))}">${icon('indent')}</button>
          <button class="btn btn-icon" type="button" data-bullet="up" aria-label="${esc(t('camp.moveUp'))}">${icon('up')}</button>
          <button class="btn btn-icon" type="button" data-bullet="down" aria-label="${esc(t('camp.moveDown'))}">${icon('down')}</button>
          <button class="btn btn-icon" type="button" data-bullet="delete" aria-label="${esc(t('camp.deletePoint'))}">${icon('trash')}</button>
          <button class="btn" type="button" data-bullet="add">${icon('plus')}<span>${esc(t('camp.addPoint'))}</span></button>
        </div>
      </div>
      <ul class="bullets" data-bullets></ul>
      <p class="hint">${esc(t('camp.notesHint'))}</p>`;
    renderBullets();
    editor.querySelectorAll('textarea[data-field]').forEach(autosize);
  }

  function renderBullets(focusId = null, caret = null) {
    const s = current();
    const ul = editor.querySelector('[data-bullets]');
    if (!s || !ul) return;
    ul.innerHTML = s.notes.map((n) => `
      <li class="bullet" data-note="${esc(n.id)}" data-depth="${n.depth}" style="--depth:${n.depth}">
        <textarea class="bullet-text" rows="1" aria-label="${esc(t('camp.point'))}" placeholder="${esc(t('camp.pointPlaceholder'))}">${esc(n.text)}</textarea>
      </li>`).join('');
    ul.querySelectorAll('textarea').forEach(autosize);
    if (focusId) {
      const ta = ul.querySelector(`[data-note="${CSS.escape(focusId)}"] textarea`);
      if (ta) {
        ta.focus();
        const pos = caret === 'start' ? 0 : ta.value.length;
        ta.setSelectionRange(pos, pos);
        focusedNote = focusId;
      }
    }
  }

  // ---------- Cambios en las notas ----------

  function setNotes(notes, focusId, caret) {
    const s = current();
    C.update('sessions', s.id, { notes }, { debounce: true });
    renderBullets(focusId, caret);
  }

  function bulletAction(action) {
    const s = current();
    if (!s) return;
    const notes = s.notes.map((n) => ({ ...n }));
    let i = notes.findIndex((n) => n.id === focusedNote);
    if (action === 'add') {
      const depth = i === -1 ? 0 : notes[i].depth;
      const note = { id: C.newId('n'), text: '', depth };
      if (i === -1) notes.push(note); else notes.splice(i + 1, 0, note);
      setNotes(notes, note.id, 'end');
      return;
    }
    if (i === -1) i = notes.length - 1; // sin foco: el último punto
    const n = notes[i];
    if (!n) return;
    if (action === 'indent') {
      const max = i === 0 ? 0 : Math.min(C.MAX_DEPTH, notes[i - 1].depth + 1);
      n.depth = Math.min(max, n.depth + 1);
    } else if (action === 'outdent') {
      n.depth = Math.max(0, n.depth - 1);
    } else if (action === 'up' && i > 0) {
      [notes[i - 1], notes[i]] = [notes[i], notes[i - 1]];
    } else if (action === 'down' && i < notes.length - 1) {
      [notes[i + 1], notes[i]] = [notes[i], notes[i + 1]];
    } else if (action === 'delete') {
      notes.splice(i, 1);
      if (!notes.length) notes.push({ id: C.newId('n'), text: '', depth: 0 });
      setNotes(notes, notes[Math.max(0, i - 1)].id, 'end');
      return;
    }
    setNotes(notes, n.id, 'end');
  }

  function onBulletInput(ta) {
    const s = current();
    const id = ta.closest('[data-note]').dataset.note;
    const notes = s.notes.map((n) => ({ ...n }));
    const i = notes.findIndex((n) => n.id === id);
    if (ta.value.includes('\n')) {
      // Enter (o pegar varias líneas): cada línea pasa a ser un punto.
      const [first, ...rest] = ta.value.split('\n');
      notes[i].text = first;
      const added = rest.map((text) => ({ id: C.newId('n'), text, depth: notes[i].depth }));
      notes.splice(i + 1, 0, ...added);
      setNotes(notes, added.at(-1).id, added.length === 1 ? 'start' : 'end');
      return;
    }
    notes[i].text = ta.value;
    C.update('sessions', s.id, { notes });
    autosize(ta);
  }

  // ---------- Eventos ----------

  root.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) { ctx.select('sessions', pick.dataset.pick); renderList(); renderEditor(); return; }
    if (e.target.closest('[data-new]')) {
      const s = C.newSession();
      ctx.select('sessions', s.id);
      renderList();
      renderEditor();
      editor.querySelector('[data-field="title"]')?.focus();
      return;
    }
    const b = e.target.closest('[data-bullet]');
    if (b) { bulletAction(b.dataset.bullet); return; }
    if (e.target.closest('[data-delete]')) {
      const s = current();
      const ok = await confirmDialog(t('camp.deleteSessionConfirm', { n: s.number ?? '', title: s.title || t('camp.untitled') }), { yes: t('comp.delete') });
      if (!ok) return;
      await C.remove('sessions', s.id);
      ctx.select('sessions', null);
      renderList();
      renderEditor();
      toast(t('camp.deleted'), { duration: 2500 });
    }
  });
  // Los botones de la barra de notas no quitan el foco del punto que se está editando.
  root.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-bullet]')) e.preventDefault(); });

  root.addEventListener('focusin', (e) => {
    const li = e.target.closest('[data-note]');
    if (li) focusedNote = li.dataset.note;
  });

  root.addEventListener('input', (e) => {
    const s = current();
    if (!s) return;
    const el = e.target;
    if (el.classList.contains('bullet-text')) { onBulletInput(el); return; }
    const field = el.dataset.field;
    if (!field) return;
    const value = field === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
    C.update('sessions', s.id, { [field]: value }); // avisa a la vista y la lista se actualiza sola
    if (el.tagName === 'TEXTAREA') autosize(el);
  });

  root.addEventListener('keydown', (e) => {
    const ta = e.target.closest('.bullet-text');
    if (!ta) return;
    if (e.key === 'Tab') { e.preventDefault(); bulletAction(e.shiftKey ? 'outdent' : 'indent'); }
    else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); bulletAction('up'); }
    else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); bulletAction('down'); }
    else if (e.key === 'Backspace' && ta.value === '' && current().notes.length > 1) { e.preventDefault(); bulletAction('delete'); }
  });

  renderList();
  renderEditor();

  return {
    update(what) { if (what === 'sessions') renderList(); },
    show(id) { ctx.select('sessions', id); renderList(); renderEditor(); },
  };
}
