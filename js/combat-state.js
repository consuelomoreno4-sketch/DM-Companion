// Datos y reglas del combate. La pantalla (combat.js) solo llama a estas funciones.
// Cada cambio guarda una "foto" del estado anterior para poder deshacer.

import { kvGet, kvSet } from './db.js';
import { CONDITION_KEYS } from './conditions.js';

// Los textos (etiquetas de deshacer y avisos) se guardan como { key, params }
// y se traducen al mostrarse (ver i18n.js).
const m = (key, params = {}) => ({ key, params });

const KEY = 'combat';
const MAX_UNDO = 50;
const FACTIONS = ['ally', 'enemy', 'neutral'];

export function defaultCombat() {
  return {
    version: 1,
    started: false,
    round: 0,
    activeId: null,
    seq: 0,
    grid: { cols: 16, rows: 10 },
    recent: [5, 10],
    combatants: [],
  };
}

let state = defaultCombat();
const undoStack = [];
const listeners = new Set();
const effectListeners = new Set();

export const getState = () => state;
export const canUndo = () => undoStack.length > 0;
export const undoLabel = () => undoStack.at(-1)?.label ?? '';

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
// Efectos = cosas que pasan una vez (animación de daño, avisos), no forman parte del estado.
export function onEffect(fn) { effectListeners.add(fn); }

function emit() { for (const fn of listeners) fn(state); }
function emitEffects(effects) { for (const e of effects) for (const fn of effectListeners) fn(e); }

// ---------- Guardado ----------

// Se guarda en cuanto hay un cambio (sin esperar), para no perder nada si la app se cierra de golpe.
// Los guardados van en fila para que siempre quede el último.
let saving = Promise.resolve();
function persist() {
  const snapshot = state;
  saving = saving
    .then(() => kvSet(KEY, snapshot))
    .catch((err) => emitEffects([{ type: 'error', msg: m('msg.saveError', { msg: err.message }) }]));
}

export async function load() {
  const saved = await kvGet(KEY);
  state = normalize(saved);
  undoStack.length = 0;
  emit();
}

// Completa datos que falten (por ejemplo, copias de versiones anteriores).
function normalize(raw) {
  const base = defaultCombat();
  if (!raw || typeof raw !== 'object') return base;
  const s = { ...base, ...raw, grid: { ...base.grid, ...(raw.grid || {}) } };
  s.combatants = (Array.isArray(raw.combatants) ? raw.combatants : []).map((c) => ({
    temp: 0, exhaustion: 0, concentration: false, conditions: [], x: 0, y: 0, ac: 10,
    ...c,
    faction: FACTIONS.includes(c.faction) ? c.faction : 'enemy',
  }));
  if (!Array.isArray(s.recent)) s.recent = base.recent;
  return s;
}

/**
 * Aplica un cambio. fn(state, effects) modifica el estado;
 * si devuelve false (antes de modificar nada) no se registra nada.
 */
function commit(label, fn) {
  const snapshot = structuredClone(state);
  const effects = [];
  if (fn(state, effects) === false) return false;
  undoStack.push({ label, snapshot });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  persist();
  emit();
  emitEffects(effects);
  return true;
}

export function undo() {
  const last = undoStack.pop();
  if (!last) return null;
  state = last.snapshot;
  persist();
  emit();
  return last.label;
}

// ---------- Consultas ----------

export function find(id, s = state) { return s.combatants.find((c) => c.id === id); }

// Orden de turnos: iniciativa mayor primero; empate = el que se añadió antes.
export function order(s = state) {
  return [...s.combatants].sort((a, b) => b.init - a.init || a.seq - b.seq);
}

export const isDead = (c) => c.hp <= 0;
// Enemigos y neutrales a 0 HP se saltan; los aliados no (tiran salvaciones contra la muerte).
const takesTurn = (c) => !(isDead(c) && c.faction !== 'ally');

// ---------- Turnos ----------

// Resta una ronda a las condiciones "ancladas" al turno que empieza.
// anchorId = turno en que se aplicó. Sin ancla (o si ese combatiente ya no existe) se cuenta al empezar cada ronda.
function tickConditions(s, effects, { turnId = null, newRound = false }) {
  // Un ancla que ya no tiene turnos (quitada o enemigo caído) pasa a contar por rondas.
  const ids = new Set(s.combatants.filter(takesTurn).map((c) => c.id));
  for (const c of s.combatants) {
    c.conditions = c.conditions.filter((cd) => {
      if (cd.rounds == null) return true;
      const anchored = cd.anchorId && ids.has(cd.anchorId);
      const due = anchored ? cd.anchorId === turnId : newRound;
      if (!due) return true;
      cd.rounds -= 1;
      if (cd.rounds > 0) return true;
      effects.push({ type: 'condition-end', id: c.id, msg: m('msg.condEnd', { cond: cd.key, name: c.name }) });
      return false;
    });
  }
}

export function nextTurn() {
  return commit(m('undo.next'), (s, effects) => {
    const list = order(s);
    if (!list.some(takesTurn)) return false;
    let i = s.started ? list.findIndex((c) => c.id === s.activeId) : -1;
    if (!s.started) { s.started = true; s.round = 1; }
    let newRound = false;
    do {
      i += 1;
      if (i >= list.length) { i = 0; s.round += 1; newRound = true; }
    } while (!takesTurn(list[i]));
    const current = list[i];
    s.activeId = current.id;
    if (newRound) effects.push({ type: 'round', round: s.round });
    tickConditions(s, effects, { turnId: current.id, newRound });
    effects.push({ type: 'turn', id: current.id, msg: m('msg.turn', { name: current.name }) });
  });
}

export function prevTurn() {
  return commit(m('undo.prev'), (s, effects) => {
    if (!s.started) return false;
    const list = order(s);
    let i = list.findIndex((c) => c.id === s.activeId);
    if (i === -1) i = 0;
    let round = s.round;
    let steps = 0;
    do {
      i -= 1;
      if (i < 0) {
        if (round <= 1) return false; // ya estamos al principio del combate
        i = list.length - 1;
        round -= 1;
      }
      steps += 1;
    } while (!takesTurn(list[i]) && steps <= list.length);
    if (!takesTurn(list[i])) return false;
    s.round = round;
    s.activeId = list[i].id;
    effects.push({ type: 'turn', id: list[i].id, msg: m('msg.turn', { name: list[i].name }) });
  });
}

// ---------- Combatientes ----------

function newId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function freeCell(s, faction) {
  const { cols, rows } = s.grid;
  const taken = new Set(s.combatants.map((c) => `${c.x},${c.y}`));
  // Aliados a la izquierda, enemigos a la derecha, neutrales al centro.
  const colOrder = [];
  for (let k = 0; k < cols; k++) {
    if (faction === 'ally') colOrder.push(k);
    else if (faction === 'enemy') colOrder.push(cols - 1 - k);
    else colOrder.push((Math.floor(cols / 2) + (k % 2 ? -1 : 1) * Math.ceil(k / 2) + cols) % cols);
  }
  for (const x of colOrder) {
    for (let y = 0; y < rows; y++) {
      if (!taken.has(`${x},${y}`)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// ref = identificador del monstruo del SRD (si vino de las sugerencias), para la fase 2.
export function addCombatants({ name, faction, init, hpMax, ac, count = 1, ref = '' }) {
  const base = String(name).trim().slice(0, 40) || '?';
  const n = clampInt(count, 1, 20, 1);
  const label = n > 1 ? m('undo.addMany', { n, name: base }) : m('undo.add', { name: base });
  return commit(label, (s) => {
    // Si ya hay "Goblin 1" y "Goblin 2", los nuevos siguen con 3, 4…
    const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`);
    let start = 0;
    for (const c of s.combatants) {
      const m = c.name.match(re);
      if (m) start = Math.max(start, Number(m[1]));
    }
    const numbered = n > 1 || start > 0;
    const max = clampInt(hpMax, 1, 9999, 1);
    for (let k = 0; k < n; k++) {
      const f = FACTIONS.includes(faction) ? faction : 'enemy';
      const pos = freeCell(s, f);
      s.seq += 1;
      s.combatants.push({
        id: newId(),
        seq: s.seq,
        name: numbered ? `${base} ${start + k + 1}` : base,
        faction: f,
        init: clampInt(init, -10, 50, 0),
        hpMax: max,
        hp: max,
        temp: 0,
        ac: clampInt(ac, 0, 40, 10),
        conditions: [],
        exhaustion: 0,
        concentration: false,
        ref: ref || null,
        x: pos.x,
        y: pos.y,
      });
    }
  });
}

export function updateCombatant(id, patch) {
  const c = find(id);
  if (!c) return false;
  return commit(m('undo.edit', { name: c.name }), (s) => {
    const t = find(id, s);
    if (patch.name != null) t.name = String(patch.name).trim().slice(0, 40) || t.name;
    if (FACTIONS.includes(patch.faction)) t.faction = patch.faction;
    if (patch.init != null) t.init = clampInt(patch.init, -10, 50, t.init);
    if (patch.ac != null) t.ac = clampInt(patch.ac, 0, 40, t.ac);
    if (patch.hpMax != null) t.hpMax = clampInt(patch.hpMax, 1, 9999, t.hpMax);
    if (patch.hp != null) t.hp = clampInt(patch.hp, 0, t.hpMax, t.hp);
    if (patch.temp != null) t.temp = clampInt(patch.temp, 0, 9999, t.temp);
    t.hp = Math.min(t.hp, t.hpMax);
  });
}

export function removeCombatant(id) {
  const c = find(id);
  if (!c) return false;
  return commit(m('undo.remove', { name: c.name }), (s) => {
    if (s.activeId === id) {
      // El turno pasa al siguiente que pueda actuar (sin contar condiciones).
      const list = order(s).filter((x) => x.id === id || takesTurn(x));
      const i = list.findIndex((x) => x.id === id);
      const next = list.length > 1 ? list[(i + 1) % list.length] : null;
      s.activeId = next ? next.id : null;
    }
    s.combatants = s.combatants.filter((x) => x.id !== id);
    if (!s.combatants.length) { s.started = false; s.round = 0; s.activeId = null; }
  });
}

function rememberAmount(s, amount) {
  s.recent = [amount, ...s.recent.filter((a) => a !== amount)].slice(0, 5);
}

// kind: 'damage' | 'heal' | 'temp'
export function applyHp(id, rawAmount, kind) {
  const c = find(id);
  const amount = clampInt(rawAmount, 0, 9999, 0);
  if (!c || amount <= 0) return false;
  return commit(m(`undo.${kind}`, { name: c.name }), (s, effects) => {
    const t = find(id, s);
    rememberAmount(s, amount);
    if (kind === 'damage') {
      const wasUp = t.hp > 0;
      const absorbed = Math.min(t.temp, amount);
      t.temp -= absorbed;
      t.hp = Math.max(0, t.hp - (amount - absorbed));
      effects.push({ type: 'damage', id, amount });
      if (t.concentration) {
        if (t.hp === 0) {
          t.concentration = false;
          effects.push({ type: 'info', msg: m('msg.concLost', { name: t.name }) });
        } else {
          const dc = Math.min(30, Math.max(10, Math.floor(amount / 2)));
          effects.push({ type: 'warn', msg: m('msg.concSave', { name: t.name, dc }) });
        }
      }
      if (wasUp && t.hp === 0) {
        effects.push({ type: 'down', id, msg: m(t.faction === 'ally' ? 'msg.downAlly' : 'msg.downEnemy', { name: t.name }) });
      }
    } else if (kind === 'heal') {
      const before = t.hp;
      t.hp = Math.min(t.hpMax, t.hp + amount);
      effects.push({ type: 'heal', id, amount: t.hp - before });
    } else {
      t.temp = amount; // los HP temporales no se suman: el nuevo valor reemplaza al anterior
      effects.push({ type: 'temp', id, amount });
    }
  });
}

export function toggleConcentration(id) {
  const c = find(id);
  if (!c) return false;
  return commit(m(c.concentration ? 'undo.concOff' : 'undo.concOn', { name: c.name }), (s) => {
    const t = find(id, s);
    t.concentration = !t.concentration;
  });
}

// rounds: número de rondas o null (sin límite). Si ya la tiene, se quita.
export function toggleCondition(id, key, rounds = null) {
  const c = find(id);
  if (!c || !CONDITION_KEYS.includes(key)) return false;
  const has = c.conditions.some((cd) => cd.key === key);
  return commit(m(has ? 'undo.condOff' : 'undo.condOn', { cond: key, name: c.name }), (s) => {
    const t = find(id, s);
    if (has) {
      t.conditions = t.conditions.filter((cd) => cd.key !== key);
    } else {
      const r = rounds == null ? null : clampInt(rounds, 1, 999, 1);
      t.conditions.push({ key, rounds: r, anchorId: s.started ? s.activeId : null });
    }
  });
}

export function setExhaustion(id, level) {
  const c = find(id);
  const lvl = clampInt(level, 0, 6, 0);
  if (!c || lvl === c.exhaustion) return false;
  return commit(m('undo.exh', { n: lvl, name: c.name }), (s, effects) => {
    find(id, s).exhaustion = lvl;
    if (lvl === 6) effects.push({ type: 'warn', msg: m('msg.exh6', { name: c.name }) });
  });
}

// Llamado al soltar un token. Devuelve false si no cambió de casilla.
export function moveToken(id, x, y) {
  const c = find(id);
  if (!c) return false;
  const nx = clampInt(x, 0, state.grid.cols - 1, c.x);
  const ny = clampInt(y, 0, state.grid.rows - 1, c.y);
  if (nx === c.x && ny === c.y) return false;
  return commit(m('undo.move', { name: c.name }), (s) => {
    const t = find(id, s);
    t.x = nx;
    t.y = ny;
  });
}

export function setGrid(cols, rows) {
  const nc = clampInt(cols, 4, 60, state.grid.cols);
  const nr = clampInt(rows, 4, 40, state.grid.rows);
  return commit(m('undo.grid'), (s) => {
    s.grid = { cols: nc, rows: nr };
    for (const c of s.combatants) {
      c.x = Math.min(c.x, nc - 1);
      c.y = Math.min(c.y, nr - 1);
    }
  });
}

// keepAllies: conserva a los aliados (sin condiciones de combate) y quita al resto.
export function newCombat(keepAllies) {
  return commit(m(keepAllies ? 'undo.newCombat' : 'undo.clearAll'), (s) => {
    s.started = false;
    s.round = 0;
    s.activeId = null;
    s.combatants = keepAllies
      ? s.combatants.filter((c) => c.faction === 'ally').map((c) => ({ ...c, conditions: [], concentration: false }))
      : [];
  });
}
