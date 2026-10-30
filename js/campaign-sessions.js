// Vista "Sesiones" de la Campaña: historial de sesiones y notas en punteo.
//
// Notas: cada punto es un cuadro de texto. Enter crea un punto nuevo (también con el teclado de la tablet:
// se detecta el salto de línea al escribir). Tab / Shift+Tab o los botones cambian la sangría.
// "Seleccionar" permite marcar varios puntos y fusionarlos en uno (con opción de deshacer).
// Debajo de las notas se sugieren los nombres escritos que todavía no tienen ficha en la bitácora.

import * as C from './campaign-data.js';
import { kvGet, kvSet } from './db.js';
import { autosize, dateText, kindIcon } from './campaign-ui.js';
import { esc, icon, confirmDialog, toast, openDialog, closeDialog } from './ui.js';
import { t, tn } from './i18n.js';
import { openImportDialog, PACKS, confirmAndImportPack } from './campaign-import.js';
import { openDetectDialog } from './campaign-detect.js';
import { showPlacesOverview } from './campaign-map.js';
import { openSessionReview } from './campaign-ai.js';

// Une varios textos en uno: cada parte termina en punto (si no tenía signo final) y se separan con un espacio.
export function joinTexts(texts) {
  const parts = texts.map((x) => x.trim()).filter(Boolean);
  return parts.map((p, i) => (i < parts.length - 1 && !/[.!?…:;]$/.test(p) ? `${p}.` : p)).join(' ');
}

export function mountSessions(root, ctx) {
  root.innerHTML = `
    <div class="camp-split">
      <div class="camp-side">
        <button class="btn btn-primary" type="button" data-new>${icon('plus')}<span>${esc(t('camp.newSession'))}</span></button>
        <button class="btn" type="button" data-import>${icon('upload')}<span>${esc(t('imp.button'))}</span></button>
        <div data-order></div>
        <ul class="camp-list" data-list></ul>
      </div>
      <div class="camp-main" data-editor></div>
    </div>`;
  const listEl = root.querySelector('[data-list]');
  const editor = root.querySelector('[data-editor]');
  let focusedNote = null;
  let selecting = false;       // modo "Seleccionar" para fusionar
  const picked = new Set();    // puntos marcados

  const current = () => C.get('sessions', ctx.selected('sessions')) ?? C.sessionsSorted()[0] ?? null;

  // Aviso cuando los números no siguen las fechas, con un botón para ordenarlas.
  // "Dejar así" (o un orden puesto a mano) guarda cómo están los números: el aviso no vuelve hasta que algo cambie.
  let orderAck = null;
  kvGet('sessionOrderAck').then((v) => { orderAck = v || null; renderOrder(); }).catch(() => {});
  const orderSig = () => C.sessionsSorted().map((s) => `${s.id}:${s.number}:${s.date}`).join('|');
  function renderOrder() {
    const box = root.querySelector('[data-order]');
    const n = C.sessionsOutOfOrder();
    box.innerHTML = n && orderAck !== orderSig() ? `<div class="order-warn"><p>${icon('clock')} ${esc(tn('camp.outOfOrder', n))}</p>
      <div class="map-actions">
        <button class="btn" type="button" data-renumber>${icon('refresh')}<span>${esc(t('camp.renumber'))}</span></button>
        <button class="btn" type="button" data-order-ok>${icon('check')}<span>${esc(t('camp.keepOrder'))}</span></button>
      </div>
      <p class="hint">${esc(t('camp.dragHint'))}</p></div>` : '';
  }
  function ackOrder() {
    orderAck = orderSig();
    kvSet('sessionOrderAck', orderAck).catch(() => {});
    renderOrder();
  }

  // Nuevo orden de la lista (de arriba abajo = de la última a la primera sesión): números N … 1.
  function applyOrder(ids) {
    const before = new Map(C.list('sessions').map((s) => [s.id, s.number]));
    const total = ids.length;
    let changed = 0;
    ids.forEach((id, i) => {
      const s = C.get('sessions', id);
      if (s && s.number !== total - i) { C.update('sessions', id, { number: total - i }, { debounce: false }); changed += 1; }
    });
    if (!changed) return;
    ackOrder();
    renderList();
    renderEditor();
    toast(t('camp.reordered'), {
      duration: 8000,
      group: 'renumber',
      action: { label: t('combat.undo'), run: () => { C.restoreNumbers(before); renderList(); renderEditor(); } },
    });
  }

  // Arrastrar con el dedo, el lápiz o el mouse desde el asa ⠿ de cada sesión.
  let drag = null;
  listEl.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('[data-drag]');
    if (!grip || e.button > 0) return;
    e.preventDefault();
    const li = grip.closest('[data-sess]');
    // Se escucha en la ventana: al mover el elemento en la lista el navegador suelta la captura del puntero.
    drag = { li, grip, startY: e.clientY, moved: false, scroll: listEl };
    li.classList.add('dragging');
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  });
  function onDragMove(e) {
    if (!drag) return;
    if (Math.abs(e.clientY - drag.startY) > 4) drag.moved = true;
    // El elemento va cambiando de lugar cuando el dedo pasa la mitad de su vecino.
    const prev = drag.li.previousElementSibling;
    const next = drag.li.nextElementSibling;
    if (prev && e.clientY < prev.getBoundingClientRect().top + prev.offsetHeight / 2) listEl.insertBefore(drag.li, prev);
    else if (next && e.clientY > next.getBoundingClientRect().top + next.offsetHeight / 2) listEl.insertBefore(next, drag.li);
    // Cerca de los bordes, la lista se desplaza sola.
    const box = drag.scroll.getBoundingClientRect();
    if (e.clientY < box.top + 40) drag.scroll.scrollTop -= 12;
    else if (e.clientY > box.bottom - 40) drag.scroll.scrollTop += 12;
  }
  function endDrag() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    if (!drag) return;
    drag.li.classList.remove('dragging');
    const moved = drag.moved;
    drag = null;
    if (moved) applyOrder([...listEl.querySelectorAll('[data-sess]')].map((li) => li.dataset.sess));
  }
  // Con teclado: flechas sobre el asa mueven la sesión un lugar.
  listEl.addEventListener('keydown', (e) => {
    const grip = e.target.closest('[data-drag]');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const ids = [...listEl.querySelectorAll('[data-sess]')].map((li) => li.dataset.sess);
    const i = ids.indexOf(grip.dataset.drag);
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    applyOrder(ids);
    listEl.querySelector(`[data-drag="${CSS.escape(ids[j])}"]`)?.focus();
  });

  function renderList() {
    renderOrder();
    const cur = current();
    const items = C.sessionsSorted();
    listEl.innerHTML = items.length ? items.map((s) => `
      <li class="sess-item" data-sess="${esc(s.id)}"><button type="button" class="comp-item" data-pick="${esc(s.id)}" aria-current="${s.id === cur?.id}">
        <span class="comp-name"><span class="num">#${esc(s.number ?? '')}</span> ${esc(s.title || t('camp.untitled'))}</span>
        <span class="comp-meta">${esc(dateText(s.date))}${s.summary ? ` · ${esc(s.summary.slice(0, 60))}` : ''}</span>
      </button>
      ${items.length > 1 ? `<button type="button" class="btn btn-icon btn-ghost sess-grip" data-drag="${esc(s.id)}" aria-label="${esc(t('camp.dragSession', { n: s.number ?? '' }))}">${icon('grip')}</button>` : ''}</li>`).join('') : `<li class="comp-msg">${esc(t('camp.noSessions'))}</li>`;
  }

  function renderEditor() {
    const s = current();
    focusedNote = null;
    selecting = false;
    picked.clear();
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
        <button class="btn" type="button" data-ai-review>${icon('sparkles')}<span>${esc(t('ai.reviewButton'))}</span></button>
        <button class="btn btn-icon btn-danger" type="button" data-delete aria-label="${esc(t('camp.deleteSession'))}">${icon('trash')}</button>
      </div>
      <label class="field"><span>${esc(t('camp.summary'))}</span><textarea data-field="summary" rows="2" placeholder="${esc(t('camp.summaryPlaceholder'))}">${esc(s.summary || '')}</textarea></label>
      <div class="notes-head">
        <h3>${esc(t('camp.notes'))}</h3>
        <div class="bullet-tools" role="toolbar" aria-label="${esc(t('camp.notes'))}" data-tools></div>
      </div>
      <ul class="bullets" data-bullets></ul>
      <p class="hint" data-notes-hint>${esc(t('camp.notesHint'))}</p>
      <div class="stack" data-mentions></div>
      <div class="stack" data-candidates></div>`;
    renderTools();
    renderBullets();
    renderCandidates();
    editor.querySelectorAll('textarea[data-field]').forEach(autosize);
  }

  function renderTools() {
    const box = editor.querySelector('[data-tools]');
    if (!box) return;
    if (selecting) {
      box.innerHTML = `
        <span class="hint num">${esc(tn('camp.selected', picked.size))}</span>
        <button class="btn" type="button" data-bullet="cancel-select">${icon('close')}<span>${esc(t('common.cancel'))}</span></button>
        <button class="btn btn-primary" type="button" data-bullet="merge"${picked.size < 2 ? ' disabled' : ''}>${icon('merge')}<span>${esc(t('camp.merge'))}</span></button>`;
      return;
    }
    box.innerHTML = `
      <button class="btn btn-icon" type="button" data-bullet="outdent" aria-label="${esc(t('camp.outdent'))}">${icon('outdent')}</button>
      <button class="btn btn-icon" type="button" data-bullet="indent" aria-label="${esc(t('camp.indent'))}">${icon('indent')}</button>
      <button class="btn btn-icon" type="button" data-bullet="up" aria-label="${esc(t('camp.moveUp'))}">${icon('up')}</button>
      <button class="btn btn-icon" type="button" data-bullet="down" aria-label="${esc(t('camp.moveDown'))}">${icon('down')}</button>
      <button class="btn btn-icon" type="button" data-bullet="delete" aria-label="${esc(t('camp.deletePoint'))}">${icon('trash')}</button>
      <button class="btn" type="button" data-bullet="select">${icon('check')}<span>${esc(t('camp.select'))}</span></button>
      <button class="btn" type="button" data-bullet="add">${icon('plus')}<span>${esc(t('camp.addPoint'))}</span></button>`;
  }

  function renderBullets(focusId = null, caret = null) {
    const s = current();
    const ul = editor.querySelector('[data-bullets]');
    if (!s || !ul) return;
    ul.classList.toggle('selecting', selecting);
    ul.innerHTML = s.notes.map((n) => `
      <li class="bullet" data-note="${esc(n.id)}" data-depth="${n.depth}" style="--depth:${n.depth}">
        ${selecting ? `<label class="bullet-pick"><input type="checkbox" data-pick-note="${esc(n.id)}"${picked.has(n.id) ? ' checked' : ''} aria-label="${esc(t('camp.selectPoint'))}"></label>` : ''}
        <textarea class="bullet-text" rows="1" aria-label="${esc(t('camp.point'))}" placeholder="${esc(t('camp.pointPlaceholder'))}"${selecting ? ' readonly' : ''}>${esc(n.text)}</textarea>
      </li>`).join('');
    ul.querySelectorAll('textarea').forEach(autosize);
    if (focusId) {
      const ta = ul.querySelector(`[data-note="${CSS.escape(focusId)}"] textarea`);
      if (ta) {
        ta.focus();
        const pos = typeof caret === 'number' ? caret : caret === 'start' ? 0 : ta.value.length;
        ta.setSelectionRange(pos, pos);
        focusedNote = focusId;
      }
    }
  }

  // "En esta sesión": las fichas que nombran las notas, para ver si la sesión quedó unida a la bitácora y al mapa.
  function renderMentions() {
    const s = current();
    const box = editor.querySelector('[data-mentions]');
    if (!s || !box) return;
    const count = new Map();
    for (const it of C.noteIndex()) {
      if (it.session.id === s.id) for (const id of it.own) count.set(id, (count.get(id) || 0) + 1);
    }
    const order = C.CODEX_KINDS;
    const entries = [...count.keys()].map((id) => C.get('codex', id)).filter(Boolean)
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || count.get(b.id) - count.get(a.id) || a.name.localeCompare(b.name));
    const hasNotes = s.notes.some((n) => n.text.trim());
    box.innerHTML = `
      <h3>${icon('map')} ${esc(t('sess.inSession'))}${entries.length ? ` <span class="badge num">${entries.length}</span>` : ''}</h3>
      ${entries.length ? `<p class="hint">${esc(t('sess.inSessionHint'))}</p>
      <div class="link-chips">${entries.map((c) => `<span class="link-chip">
        <button type="button" class="link-go" data-go-entry="${esc(c.id)}">${kindIcon(c.kind)}<span>${esc(c.name || t('camp.unnamed'))}</span><span class="hint num">${count.get(c.id)}</span></button>
        <button type="button" class="link-x" data-go-map="${esc(c.id)}" aria-label="${esc(t('sess.showOnMap', { name: c.name }))}">${icon('pin')}</button>
      </span>`).join('')}</div>` : hasNotes ? `<p class="hint">${esc(t('sess.inSessionNone'))}</p>` : ''}
      ${hasNotes ? `<div class="map-actions"><button class="btn" type="button" data-detect-here>${icon('search')}<span>${esc(t('det.button'))}</span></button></div>` : ''}`;
  }

  function renderCandidates() {
    renderMentions();
    const s = current();
    const box = editor.querySelector('[data-candidates]');
    if (!s || !box) return;
    const names = C.nameCandidates(s);
    box.innerHTML = names.length ? `
      <h3>${icon('user')} ${esc(t('camp.candidates'))}</h3>
      <p class="hint">${esc(t('camp.candidatesHint'))}</p>
      <div class="link-chips">${names.map((n) => `<span class="link-chip">
        <button type="button" class="link-go" data-candidate="${esc(n)}">${icon('plus')}<span>${esc(n)}</span></button>
        <button type="button" class="link-x" data-ignore="${esc(n)}" aria-label="${esc(t('camp.ignoreName', { name: n }))}">${icon('close')}</button>
      </span>`).join('')}</div>` : '';
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
    if (action === 'select') { selecting = true; picked.clear(); renderTools(); renderBullets(); return; }
    if (action === 'cancel-select') { selecting = false; picked.clear(); renderTools(); renderBullets(); return; }
    if (action === 'merge') { mergePicked(); return; }
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

  // Fusiona los puntos marcados en el lugar del primero, con opción de deshacer.
  function mergePicked() {
    const s = current();
    const before = s.notes.map((n) => ({ ...n }));
    const chosen = before.filter((n) => picked.has(n.id));
    if (chosen.length < 2) return;
    const merged = { ...chosen[0], text: joinTexts(chosen.map((n) => n.text)), depth: Math.min(...chosen.map((n) => n.depth)) };
    const notes = [];
    for (const n of before) {
      if (n.id === chosen[0].id) notes.push(merged);
      else if (!picked.has(n.id)) notes.push(n);
    }
    selecting = false;
    picked.clear();
    renderTools();
    C.update('sessions', s.id, { notes }, { debounce: false });
    renderBullets(merged.id, 'end');
    toast(t('camp.merged', { n: chosen.length }), {
      duration: 8000,
      group: 'merge',
      action: {
        label: t('combat.undo'),
        run: () => {
          if (current()?.id !== s.id) return;
          C.update('sessions', s.id, { notes: before }, { debounce: false });
          renderBullets();
        },
      },
    });
  }

  // Retroceso al principio de un punto con texto: lo une al punto anterior.
  function mergeIntoPrevious(ta) {
    const s = current();
    const notes = s.notes.map((n) => ({ ...n }));
    const i = notes.findIndex((n) => n.id === ta.closest('[data-note]').dataset.note);
    if (i <= 0) return false;
    const prev = notes[i - 1];
    const left = prev.text.replace(/\s+$/, '');
    const right = notes[i].text.replace(/^\s+/, '');
    const caret = left.length + (left && right ? 1 : 0);
    prev.text = left && right ? `${left} ${right}` : left || right;
    notes.splice(i, 1);
    setNotes(notes, prev.id, caret);
    return true;
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
    if (e.target.closest('[data-order-ok]')) { ackOrder(); return; }
    if (e.target.closest('[data-renumber]')) {
      const ok = await confirmDialog(t('camp.renumberConfirm'), { yes: t('camp.renumber') });
      if (!ok) return;
      const before = C.renumberByDate();
      ackOrder();
      renderList();
      renderEditor();
      toast(t('camp.renumbered'), {
        duration: 10000,
        group: 'renumber',
        action: { label: t('combat.undo'), run: () => { C.restoreNumbers(before); renderList(); renderEditor(); } },
      });
      return;
    }
    if (e.target.closest('[data-ai-review]')) {
      const s = current();
      if (s) openSessionReview(s.id, () => { renderList(); renderEditor(); });
      return;
    }
    if (e.target.closest('[data-import]')) {
      openImportDialog((created) => {
        if (created.length) ctx.select('sessions', created.at(-1).id);
        renderList();
        renderEditor();
        if (created.length) openNextSteps(created.length);
      });
      return;
    }
    const b = e.target.closest('[data-bullet]');
    if (b) { bulletAction(b.dataset.bullet); return; }
    // En modo selección, tocar el texto de un punto también lo marca.
    if (selecting) {
      const li = e.target.closest('[data-note]');
      if (li && !e.target.closest('input')) {
        const id = li.dataset.note;
        if (picked.has(id)) picked.delete(id); else picked.add(id);
        renderTools();
        renderBullets();
        return;
      }
    }
    const goEntry = e.target.closest('[data-go-entry]');
    if (goEntry) { ctx.navigate('codex', goEntry.dataset.goEntry); return; }
    const goMap = e.target.closest('[data-go-map]');
    if (goMap) { ctx.navigate('map', goMap.dataset.goMap); return; }
    if (e.target.closest('[data-detect-here]')) { openDetectDialog(() => renderEditor()); return; }
    const cand = e.target.closest('[data-candidate]');
    if (cand) {
      const entry = C.create('codex', { kind: 'character', name: cand.dataset.candidate, aliases: [], subtitle: '', tags: [], description: '', links: [] });
      renderCandidates();
      toast(t('camp.entryCreated', { name: entry.name }), {
        duration: 4000,
        group: 'entry-created',
        action: { label: t('camp.openEntry'), run: () => ctx.navigate('codex', entry.id) },
      });
      return;
    }
    const ign = e.target.closest('[data-ignore]');
    if (ign) {
      const s = current();
      C.update('sessions', s.id, { ignoredNames: [...(s.ignoredNames || []), ign.dataset.ignore] }, { debounce: false });
      renderCandidates();
      return;
    }
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

  root.addEventListener('change', (e) => {
    const box = e.target.closest('[data-pick-note]');
    if (!box) return;
    if (box.checked) picked.add(box.dataset.pickNote); else picked.delete(box.dataset.pickNote);
    renderTools();
  });

  root.addEventListener('focusin', (e) => {
    const li = e.target.closest('[data-note]');
    if (li) focusedNote = li.dataset.note;
  });
  // Al salir de las notas se actualizan las sugerencias de nombres.
  root.addEventListener('focusout', (e) => {
    if (e.target.classList?.contains('bullet-text')) setTimeout(renderCandidates, 0);
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
    if (!ta || selecting) return;
    if (e.key === 'Tab') { e.preventDefault(); bulletAction(e.shiftKey ? 'outdent' : 'indent'); }
    else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); bulletAction('up'); }
    else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); bulletAction('down'); }
    else if (e.key === 'Backspace' && ta.value === '' && current().notes.length > 1) { e.preventDefault(); bulletAction('delete'); }
    else if (e.key === 'Backspace' && ta.selectionStart === 0 && ta.selectionEnd === 0 && mergeIntoPrevious(ta)) e.preventDefault();
  });

  // Después de importar: los pasos para que las sesiones se unan a la bitácora y al mapa
  // (cargar la aventura, detectar nombres, ubicar los lugares nuevos). Usa la ventana de importar.
  function openNextSteps(n, done = {}) {
    const dlg = document.getElementById('dlg-import');
    const body = document.getElementById('import-body');
    const pack = PACKS[0];
    const packLoaded = C.list('codex').some((c) => (c.tags || []).includes(pack.id));
    const steps = [...(!packLoaded || done.pack ? ['pack'] : []), 'detect', 'map'];
    const next = steps.find((k) => !done[k]);
    body.innerHTML = `
      <header class="dialog-head">
        <h2 id="dlg-import-title">${esc(t('steps.title'))}</h2>
        <button class="btn btn-icon" type="button" data-close aria-label="${esc(t('common.close'))}">${icon('close')}</button>
      </header>
      <p>${esc(tn('steps.intro', n))}</p>
      <ol class="next-steps">${steps.map((k) => `
        <li>
          <button class="btn${k === next ? ' btn-primary' : ''}" type="button" data-step="${k}">${icon(done[k] ? 'check' : { pack: 'download', detect: 'search', map: 'pin' }[k])}<span>${esc(t(`steps.${k}`, { name: pack.name }))}</span></button>
          <p class="hint">${esc(t(`steps.${k}Hint`))}</p>
        </li>`).join('')}</ol>
      <footer class="dialog-foot"><button class="btn" type="button" data-close>${esc(t('common.close'))}</button></footer>`;
    body.onclick = async (e) => {
      const b = e.target.closest('[data-step]');
      if (!b) return;
      const step = b.dataset.step;
      if (step === 'pack') {
        if (await confirmAndImportPack(pack.id, confirmDialog)) { renderEditor(); openNextSteps(n, { ...done, pack: true }); }
      } else if (step === 'detect') {
        closeDialog(dlg);
        openDetectDialog(() => { renderList(); renderEditor(); openNextSteps(n, { ...done, detect: true }); });
      } else {
        closeDialog(dlg);
        showPlacesOverview();
        ctx.navigate('map');
      }
    };
    openDialog(dlg);
  }

  renderList();
  renderEditor();

  return {
    update(what) { if (what === 'sessions') renderList(); },
    show(id) { ctx.select('sessions', id); renderList(); renderEditor(); },
  };
}
