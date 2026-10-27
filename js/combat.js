// Pantalla del panel de Combate: barra de botones, grilla con tokens y lista de turnos.

import * as S from './combat-state.js';
import { CONDITIONS, CONDITION_NAMES, EXHAUSTION } from './conditions.js';
import { esc, icon, toast, openDialog, closeDialog, wireDialog, confirmDialog, reducedMotion } from './ui.js';

const $ = (sel) => document.querySelector(sel);

let els;                     // elementos fijos de la página
const cards = new Map();     // id → { el, html }
const tokens = new Map();    // id → { el, face, html }
let cell = 48;               // tamaño de casilla en px
let drag = null;             // token que se está arrastrando
let hpId = null;             // combatiente en la ventana de daño
let detailId = null;         // combatiente en la ventana de detalle
let duration = null;         // duración elegida para nuevas condiciones (null = sin límite)

export function initCombat() {
  els = {
    round: $('#round-num'),
    next: $('#btn-next'),
    prev: $('#btn-prev'),
    undo: $('#btn-undo'),
    add: $('#btn-add'),
    menu: $('#btn-combat-menu'),
    list: $('#turn-list'),
    wrap: $('#board-wrap'),
    board: $('#board'),
    dlgAdd: $('#dlg-add'),
    formAdd: $('#form-add'),
    dlgHp: $('#dlg-hp'),
    hpAmount: $('#hp-amount'),
    dlgDetail: $('#dlg-detail'),
    detailBody: $('#detail-body'),
    dlgMenu: $('#dlg-combat-menu'),
    formGrid: $('#form-grid'),
    live: document.createElement('div'),
  };
  els.live.className = 'sr-only';
  els.live.setAttribute('aria-live', 'polite');
  document.body.append(els.live);

  [els.dlgAdd, els.dlgHp, els.dlgDetail, els.dlgMenu].forEach(wireDialog);

  els.next.addEventListener('click', next);
  els.prev.addEventListener('click', prev);
  els.undo.addEventListener('click', undo);
  els.add.addEventListener('click', openAdd);
  els.menu.addEventListener('click', openMenu);

  wireList();
  wireBoard();
  wireAdd();
  wireHp();
  wireDetail();
  wireMenu();

  S.subscribe(render);
  S.onEffect(handleEffect);
  new ResizeObserver(fitBoard).observe(els.wrap);
}

// ---------- Acciones públicas (también para los atajos de teclado) ----------

export function next() { S.nextTurn(); }
export function prev() { S.prevTurn(); }
export function undo() {
  const label = S.undo();
  if (label) toast(`Deshecho: ${label}`, { duration: 2500 });
}

// ---------- Dibujar ----------

function render(s) {
  els.round.textContent = s.started ? s.round : '—';
  els.undo.disabled = !S.canUndo();
  els.undo.title = S.canUndo() ? `Deshacer: ${S.undoLabel()}` : 'Nada que deshacer';
  els.prev.disabled = !s.started;
  els.next.disabled = !s.combatants.length;
  els.next.querySelector('span').textContent = s.started ? 'Siguiente turno' : 'Empezar combate';
  renderList(s);
  fitBoard();
  if (els.dlgDetail.open) renderDetailState();
  if (els.dlgHp.open) renderHp();
}

function hpText(c) {
  return `${c.hp} de ${c.hpMax} HP${c.temp ? `, ${c.temp} temporales` : ''}`;
}

function cardHtml(c) {
  const chips = [];
  if (c.concentration) chips.push(`<span class="chip chip-conc">${icon('focus')}Concentración</span>`);
  if (c.exhaustion) chips.push(`<span class="chip chip-warn">Agotamiento <span class="num">${c.exhaustion}</span></span>`);
  for (const cd of c.conditions) {
    const r = cd.rounds == null ? '' : ` · <span class="num">${cd.rounds}</span> ${cd.rounds === 1 ? 'ronda' : 'rondas'}`;
    chips.push(`<span class="chip">${esc(CONDITION_NAMES[cd.key])}${r}</span>`);
  }
  return `
    <div class="card-init num" title="Iniciativa">${c.init}</div>
    <button class="card-name" type="button" data-act="detail"><span>${esc(c.name)}</span></button>
    <div class="card-tools">
      <button class="btn btn-icon" type="button" data-act="conc" aria-pressed="${c.concentration}" aria-label="Concentración">${icon('focus')}</button>
      <button class="btn btn-icon" type="button" data-act="detail" aria-label="Condiciones y edición">${icon('more')}</button>
    </div>
    <div class="card-stats">
      <button class="hp-btn" type="button" data-act="hp" aria-label="${esc(hpText(c))}. Aplicar daño o curación">
        <span class="hp-label">HP</span><span class="hp-cur">${c.hp}</span><span class="hp-max">/ ${c.hpMax}</span>${c.temp ? `<span class="hp-temp">+${c.temp}</span>` : ''}
      </button>
      <span class="ac">${icon('shield')}CA <b>${c.ac}</b></span>
    </div>
    <div class="chips">${chips.join('')}</div>
    <span class="card-skull" aria-label="Caído">${icon('skull')}</span>`;
}

function renderList(s) {
  const list = S.order(s);
  if (!list.length) {
    cards.clear();
    els.list.innerHTML = `<div class="list-empty"><p>No hay nadie en el combate.</p>
      <p>Pulsa <strong>Añadir</strong> para sumar jugadores y monstruos.</p></div>`;
    return;
  }
  els.list.querySelector('.list-empty')?.remove();
  const seen = new Set();
  list.forEach((c, idx) => {
    let entry = cards.get(c.id);
    if (!entry) {
      entry = { el: document.createElement('article'), html: '' };
      entry.el.dataset.id = c.id;
      cards.set(c.id, entry);
    }
    const { el } = entry;
    el.className = `card faction-${c.faction}${c.id === s.activeId ? ' active' : ''}${S.isDead(c) ? ' dead' : ''}`;
    el.setAttribute('aria-current', c.id === s.activeId ? 'step' : 'false');
    const html = cardHtml(c);
    if (html !== entry.html) {
      const floats = [...el.querySelectorAll(':scope > .float')];
      el.innerHTML = html;
      el.append(...floats);
      entry.html = html;
    }
    if (els.list.children[idx] !== el) els.list.insertBefore(el, els.list.children[idx] || null);
    seen.add(c.id);
  });
  for (const [id, entry] of cards) {
    if (!seen.has(id)) { entry.el.remove(); cards.delete(id); }
  }
}

// "Goblin 3" → "G3", "Aria la pícara" → "AL", "Ogro" → "Og"
function tokenLabel(name) {
  const m = name.match(/^(.*?)\s*(\d+)$/);
  const base = (m ? m[1] : name).trim() || name;
  const words = base.split(/\s+/).filter(Boolean);
  if (m) return base.charAt(0).toUpperCase() + m[2];
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return base.charAt(0).toUpperCase() + base.slice(1, 2).toLowerCase();
}

function fitBoard() {
  if (!els) return;
  const s = S.getState();
  const { cols, rows } = s.grid;
  const box = els.wrap.getBoundingClientRect();
  if (!box.width) return; // panel oculto
  const avail = Math.min((box.width - 34) / cols, (box.height - 34) / rows);
  cell = Math.max(44, Math.floor(avail));
  els.board.style.setProperty('--cell', `${cell}px`);
  els.board.style.width = `${cols * cell + 2}px`;
  els.board.style.height = `${rows * cell + 2}px`;
  renderBoard(s);
}

function renderBoard(s) {
  let empty = els.board.querySelector('.board-empty');
  if (!s.combatants.length) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'board-empty';
      empty.innerHTML = '<p>Los tokens aparecerán aquí.<br>Arrástralos con el dedo; tócalos para aplicar daño o curación.</p>';
      els.board.append(empty);
    }
  } else {
    empty?.remove();
  }

  const seen = new Set();
  for (const c of s.combatants) {
    let t = tokens.get(c.id);
    if (!t) {
      const el = document.createElement('div');
      el.dataset.id = c.id;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.innerHTML = `<div class="token-face"></div><span class="token-skull">${icon('skull')}</span>`;
      els.board.append(el);
      t = { el, face: el.firstElementChild, html: '' };
      tokens.set(c.id, t);
    }
    t.el.className = `token faction-${c.faction}${c.id === s.activeId ? ' active' : ''}${S.isDead(c) ? ' dead' : ''}${drag?.id === c.id && drag.moved ? ' dragging' : ''}`;
    t.el.setAttribute('aria-label', `${c.name}, ${hpText(c)}. Tocar para daño o curación`);
    if (!(drag?.id === c.id && drag.moved)) {
      t.el.style.left = `${c.x * cell}px`;
      t.el.style.top = `${c.y * cell}px`;
    }
    const pct = Math.round((c.hp / c.hpMax) * 100);
    const level = pct <= 25 ? 'crit' : pct <= 50 ? 'low' : '';
    const html = `<span>${esc(tokenLabel(c.name))}</span><span class="token-hp"><i class="${level}" style="width:${pct}%"></i></span>`;
    if (html !== t.html) { t.face.innerHTML = html; t.html = html; }
    seen.add(c.id);
  }
  for (const [id, t] of tokens) {
    if (!seen.has(id)) { t.el.remove(); tokens.delete(id); }
  }
}

// ---------- Efectos (animaciones y avisos) ----------

function floatText(host, text, cls) {
  if (!host) return;
  const span = document.createElement('span');
  span.className = `float ${cls}`;
  span.textContent = text;
  span.setAttribute('aria-hidden', 'true');
  host.append(span);
  const remove = () => span.remove();
  span.addEventListener('animationend', remove);
  setTimeout(remove, 1800);
}

function shake(el) {
  if (!el || reducedMotion.matches) return;
  el.classList.remove('shake');
  void el.offsetWidth; // reinicia la animación
  el.classList.add('shake');
  el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
}

function handleEffect(e) {
  const tok = tokens.get(e.id);
  const card = cards.get(e.id)?.el;
  switch (e.type) {
    case 'damage':
      floatText(tok?.el, `−${e.amount}`, 'dmg');
      floatText(card, `−${e.amount}`, 'dmg');
      shake(tok?.face);
      break;
    case 'heal':
      floatText(tok?.el, `+${e.amount}`, 'heal');
      floatText(card, `+${e.amount}`, 'heal');
      break;
    case 'temp':
      floatText(tok?.el, `+${e.amount} temp`, 'temp');
      floatText(card, `+${e.amount} temp`, 'temp');
      break;
    case 'turn':
      els.live.textContent = e.message;
      card?.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      break;
    case 'round':
      toast(`Empieza la ronda ${e.round}`, { duration: 2500 });
      break;
    case 'condition-end':
      toast(e.message, { kind: 'warn', duration: 10000 });
      break;
    case 'warn':
      toast(e.message, { kind: 'warn', duration: 8000 });
      break;
    case 'error':
      toast(e.message, { kind: 'error', duration: 0 });
      break;
    default:
      if (e.message) toast(e.message);
  }
}

// ---------- Lista de turnos ----------

function wireList() {
  els.list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    const card = e.target.closest('.card');
    if (!btn || !card) return;
    const id = card.dataset.id;
    if (btn.dataset.act === 'hp') openHp(id);
    else if (btn.dataset.act === 'detail') openDetail(id);
    else if (btn.dataset.act === 'conc') S.toggleConcentration(id);
  });
}

// ---------- Grilla: arrastrar tokens ----------

function wireBoard() {
  const b = els.board;
  b.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.token');
    if (!el || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    drag = {
      id: el.dataset.id, el, pid: e.pointerId,
      sx: e.clientX, sy: e.clientY,
      ox: parseFloat(el.style.left) || 0, oy: parseFloat(el.style.top) || 0,
      moved: false,
    };
  });
  b.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 8) return; // pequeño margen para distinguir toque de arrastre
    drag.moved = true;
    drag.el.classList.add('dragging');
    const { cols, rows } = S.getState().grid;
    drag.el.style.left = `${Math.min((cols - 1) * cell, Math.max(0, drag.ox + dx))}px`;
    drag.el.style.top = `${Math.min((rows - 1) * cell, Math.max(0, drag.oy + dy))}px`;
  });
  const end = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    d.el.classList.remove('dragging');
    if (d.moved && !cancelled) {
      const x = Math.round(parseFloat(d.el.style.left) / cell);
      const y = Math.round(parseFloat(d.el.style.top) / cell);
      if (!S.moveToken(d.id, x, y)) renderBoard(S.getState());
    } else if (d.moved) {
      renderBoard(S.getState());
    } else if (!cancelled) {
      openHp(d.id);
    }
  };
  b.addEventListener('pointerup', (e) => end(e, false));
  b.addEventListener('pointercancel', (e) => end(e, true));
  b.addEventListener('keydown', (e) => {
    const el = e.target.closest('.token');
    if (el && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation();
      openHp(el.dataset.id);
    }
  });
}

// ---------- Ventana: añadir ----------

function openAdd() {
  const f = els.formAdd;
  const faction = f.elements.faction.value;
  f.reset();
  f.elements.faction.value = faction || 'enemy';
  openDialog(els.dlgAdd);
  f.elements.name.focus();
}

function wireAdd() {
  els.formAdd.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = els.formAdd;
    const data = Object.fromEntries(new FormData(f));
    S.addCombatants({ ...data, count: data.count || 1 });
    if (e.submitter?.value === 'more') {
      toast(`Añadido: ${data.name}`, { duration: 2000 });
      const faction = f.elements.faction.value;
      f.reset();
      f.elements.faction.value = faction;
      f.elements.name.focus();
    } else {
      closeDialog(els.dlgAdd);
    }
  });
}

// ---------- Ventana: daño / curación ----------

function openHp(id) {
  if (!S.find(id)) return;
  hpId = id;
  els.hpAmount.value = '';
  renderHp();
  openDialog(els.dlgHp);
  els.hpAmount.focus();
}

function renderHp() {
  const c = S.find(hpId);
  if (!c) { closeDialog(els.dlgHp); return; }
  $('#dlg-hp-title').textContent = c.name;
  $('#hp-status').textContent = `HP ${c.hp} / ${c.hpMax}${c.temp ? ` (+${c.temp} temp.)` : ''} · CA ${c.ac}`;
  const recent = S.getState().recent;
  $('#hp-quick').innerHTML = `
    <div class="quick-row"><span class="hint">Daño rápido</span>
      ${recent.map((a) => `<button type="button" class="btn quick-dmg num" data-quick="damage" data-amount="${a}" aria-label="Daño ${a}">−${a}</button>`).join('')}
    </div>
    <div class="quick-row"><span class="hint">Curación rápida</span>
      ${recent.map((a) => `<button type="button" class="btn quick-heal num" data-quick="heal" data-amount="${a}" aria-label="Curar ${a}">+${a}</button>`).join('')}
    </div>`;
}

function applyFromDialog(kind, amount) {
  const n = parseInt(amount, 10);
  if (!n) {
    toast('Escribe una cantidad primero.', { duration: 2500 });
    els.hpAmount.focus();
    return;
  }
  const id = hpId;
  closeDialog(els.dlgHp);
  S.applyHp(id, n, kind);
}

function wireHp() {
  const input = els.hpAmount;
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyFromDialog(e.shiftKey ? 'heal' : 'damage', input.value); }
  });
  $('#hp-keypad').addEventListener('click', (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (!k) return;
    if (k === 'C') input.value = '';
    else if (k === 'back') input.value = input.value.slice(0, -1);
    else if (input.value.length < 4) input.value = (input.value + k).replace(/^0+(?=\d)/, '');
  });
  $('#hp-quick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-quick]');
    if (b) applyFromDialog(b.dataset.quick, b.dataset.amount);
  });
  els.dlgHp.querySelector('.hp-actions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-hp]');
    if (b) applyFromDialog(b.dataset.hp, input.value);
  });
}

// ---------- Ventana: detalle (condiciones y edición) ----------

function openDetail(id) {
  const c = S.find(id);
  if (!c) return;
  detailId = id;
  const factions = [['ally', 'Aliado'], ['enemy', 'Enemigo'], ['neutral', 'Neutral']];
  els.detailBody.innerHTML = `
    <header class="dialog-head">
      <h2 id="dlg-detail-title">${esc(c.name)}</h2>
      <button class="btn btn-icon" type="button" data-close aria-label="Cerrar">${icon('close')}</button>
    </header>
    <div class="detail-grid">
      <section class="detail-section" id="detail-state" aria-label="Condiciones"></section>
      <section class="detail-section">
        <h3>Datos</h3>
        <form class="stack" id="form-edit" autocomplete="off">
          <label class="field"><span>Nombre</span><input name="name" required maxlength="40" value="${esc(c.name)}"></label>
          <fieldset class="field"><legend>Facción</legend>
            <div class="segmented" role="radiogroup">
              ${factions.map(([v, l]) => `<label class="seg seg-${v}"><input type="radio" name="faction" value="${v}"${c.faction === v ? ' checked' : ''}><span>${l}</span></label>`).join('')}
            </div>
          </fieldset>
          <div class="field-row">
            <label class="field"><span>Iniciativa</span><input name="init" type="number" required min="-10" max="50" value="${c.init}"></label>
            <label class="field"><span>CA</span><input name="ac" type="number" inputmode="numeric" required min="0" max="40" value="${c.ac}"></label>
          </div>
          <div class="field-row">
            <label class="field"><span>HP actual</span><input name="hp" type="number" inputmode="numeric" required min="0" max="9999" value="${c.hp}"></label>
            <label class="field"><span>HP máx</span><input name="hpMax" type="number" inputmode="numeric" required min="1" max="9999" value="${c.hpMax}"></label>
            <label class="field"><span>HP temp.</span><input name="temp" type="number" inputmode="numeric" min="0" max="9999" value="${c.temp}"></label>
          </div>
          <button class="btn btn-primary" type="submit">${icon('edit')}<span>Guardar cambios</span></button>
        </form>
        <button class="btn btn-danger" type="button" id="btn-remove">${icon('trash')}<span>Quitar del combate</span></button>
        <h3>Qué hace cada condición</h3>
        <div class="cond-help">
          ${[...CONDITIONS, EXHAUSTION].map((d) => `<details><summary>${d.name}</summary><p>${esc(d.desc)}</p></details>`).join('')}
        </div>
        <p class="hint">Resúmenes basados en el System Reference Document 5.2 de Wizards of the Coast LLC (licencia CC-BY-4.0).</p>
      </section>
    </div>`;
  renderDetailState();
  openDialog(els.dlgDetail);
}

function renderDetailState() {
  const c = S.find(detailId);
  const box = els.detailBody.querySelector('#detail-state');
  if (!c || !box) { closeDialog(els.dlgDetail); return; }
  const opts = [null, 1, 2, 3, 10];
  const custom = duration != null && !opts.includes(duration) ? duration : '';
  box.innerHTML = `
    <h3>Condiciones</h3>
    <div class="stack">
      <span class="hint">Duración al aplicar (en rondas):</span>
      <div class="duration">
        ${opts.map((o) => `<button type="button" class="btn" data-dur="${o ?? ''}" aria-pressed="${duration === o}">${o == null ? 'Sin límite' : o}</button>`).join('')}
        <input type="number" inputmode="numeric" min="1" max="999" placeholder="Otra" aria-label="Otra duración en rondas" id="dur-custom" value="${custom}">
      </div>
      <span class="hint">Cuenta desde el turno actual y avisa al terminar.</span>
    </div>
    <div class="cond-grid">
      ${CONDITIONS.map((d) => {
        const cd = c.conditions.find((x) => x.key === d.key);
        const extra = cd ? `<small>${cd.rounds == null ? '∞' : `${cd.rounds} r`}</small>` : '';
        return `<button type="button" class="cond" data-cond="${d.key}" aria-pressed="${!!cd}">${d.name}${extra}</button>`;
      }).join('')}
    </div>
    <div class="stack">
      <span class="hint">${EXHAUSTION.name} (niveles 0–6)</span>
      <div class="stepper">
        <button type="button" class="btn btn-icon" data-exh="-1" aria-label="Bajar agotamiento"${c.exhaustion <= 0 ? ' disabled' : ''}>${icon('minus')}</button>
        <output class="num" aria-live="polite">${c.exhaustion}</output>
        <button type="button" class="btn btn-icon" data-exh="1" aria-label="Subir agotamiento"${c.exhaustion >= 6 ? ' disabled' : ''}>${icon('plus')}</button>
        ${c.exhaustion ? `<span class="hint">−${c.exhaustion * 2} a Pruebas d20 · −${c.exhaustion * 5} pies</span>` : ''}
      </div>
    </div>
    <button type="button" class="btn" data-conc aria-pressed="${c.concentration}">${icon('focus')}<span>${c.concentration ? 'Concentrándose (tocar para quitar)' : 'Marcar concentración'}</span></button>`;
}

function wireDetail() {
  const body = els.detailBody;
  body.addEventListener('click', (e) => {
    const t = e.target;
    const dur = t.closest('[data-dur]');
    if (dur) {
      duration = dur.dataset.dur === '' ? null : Number(dur.dataset.dur);
      renderDetailState();
      return;
    }
    const cond = t.closest('[data-cond]');
    if (cond) { S.toggleCondition(detailId, cond.dataset.cond, duration); return; }
    const exh = t.closest('[data-exh]');
    if (exh) { S.setExhaustion(detailId, S.find(detailId).exhaustion + Number(exh.dataset.exh)); return; }
    if (t.closest('[data-conc]')) { S.toggleConcentration(detailId); return; }
    if (t.closest('#btn-remove')) {
      const c = S.find(detailId);
      confirmDialog(`¿Quitar a ${c.name} del combate? Puedes deshacerlo.`, { yes: 'Quitar' }).then((ok) => {
        if (ok) { S.removeCombatant(c.id); closeDialog(els.dlgDetail); }
      });
    }
  });
  body.addEventListener('change', (e) => {
    if (e.target.id === 'dur-custom') {
      const n = parseInt(e.target.value, 10);
      duration = n > 0 ? Math.min(999, n) : null;
      renderDetailState();
    }
  });
  body.addEventListener('submit', (e) => {
    if (e.target.id !== 'form-edit') return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    S.updateCombatant(detailId, data);
    body.querySelector('#dlg-detail-title').textContent = S.find(detailId).name;
    toast('Cambios guardados.', { duration: 2000 });
  });
}

// ---------- Ventana: opciones del combate ----------

function openMenu() {
  const { cols, rows } = S.getState().grid;
  els.formGrid.elements.cols.value = cols;
  els.formGrid.elements.rows.value = rows;
  openDialog(els.dlgMenu);
}

function wireMenu() {
  els.formGrid.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = els.formGrid.elements;
    S.setGrid(f.cols.value, f.rows.value);
    closeDialog(els.dlgMenu);
  });
  $('#btn-new-keep').addEventListener('click', () => {
    S.newCombat(true);
    closeDialog(els.dlgMenu);
    toast('Nuevo combate: se conservaron los aliados.', { duration: 3000 });
  });
  $('#btn-new-all').addEventListener('click', () => {
    S.newCombat(false);
    closeDialog(els.dlgMenu);
    toast('Combate vaciado. Puedes deshacerlo.', { duration: 3000 });
  });
}

// Se llama al volver al panel (la grilla necesita medir su espacio).
export function onShow() { fitBoard(); }
