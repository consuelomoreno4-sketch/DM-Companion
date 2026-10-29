// Datos de la Campaña: sesiones (con notas en punteo), bitácora (personajes, lugares, objetos, facciones)
// y líneas de historia. Se guardan en IndexedDB; los cambios de texto se guardan solos tras una pausa corta.

import { storeAll, storePut, storeDelete, kvGet, kvSet } from './db.js';
import { normalize } from './monsters.js';

export const CODEX_KINDS = ['character', 'place', 'item', 'faction'];
export const STATUSES = ['idea', 'active', 'resolved'];
export const MAX_DEPTH = 4; // niveles de sangría en las notas (0–4)

const data = { sessions: [], codex: [], storylines: [] };
let mentionCache = null;
let loading = null;
const listeners = new Set();

// what: 'sessions' | 'codex' | 'storylines' | 'saved' | { error }
export function onChange(fn) { listeners.add(fn); }
function emit(what) {
  if (what === 'sessions' || what === 'codex') mentionCache = null; // el índice de menciones se rehace
  for (const fn of listeners) fn(what);
}

// Nombres que el usuario pidió no volver a sugerir (en toda la campaña).
let ignoredNames = new Set();

export function loadCampaign() {
  loading ??= Promise.all([
    ...Object.keys(data).map(async (name) => { data[name] = await storeAll(name); }),
    kvGet('ignoredNames').then((list) => { ignoredNames = new Set(list || []); }).catch(() => {}),
  ]).catch((err) => { loading = null; throw err; });
  return loading;
}

export const isIgnoredName = (name) => ignoredNames.has(normalize(name));
export function ignoreNames(names) {
  for (const n of names) ignoredNames.add(normalize(n));
  return kvSet('ignoredNames', [...ignoredNames]);
}

// Fichas existentes que nombra un texto (por su nombre o sus otros nombres).
export const knownIn = (text) => mentionsIn(text, noteIndexMatchers());

export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const now = () => new Date().toISOString();

// Fecha de hoy en formato del campo de fecha (AAAA-MM-DD), en hora local.
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Guardado ----------

const pending = new Map(); // store:id → { timer, store, obj }

async function write(store, obj) {
  try {
    await storePut(store, obj);
    emit('saved');
  } catch (err) {
    emit({ error: err });
  }
}

function scheduleSave(store, obj) {
  const key = `${store}:${obj.id}`;
  clearTimeout(pending.get(key)?.timer);
  const timer = setTimeout(() => { pending.delete(key); write(store, obj); }, 400);
  pending.set(key, { timer, store, obj });
}

// Guarda ya todo lo pendiente (al salir de la app, antes de exportar una copia…).
export function flushSaves() {
  const jobs = [];
  for (const { timer, store, obj } of pending.values()) {
    clearTimeout(timer);
    jobs.push(write(store, obj));
  }
  pending.clear();
  return Promise.all(jobs);
}

// ---------- Leer y cambiar ----------

export const list = (store) => data[store];
export const get = (store, id) => data[store].find((x) => x.id === id) ?? null;

export function create(store, fields) {
  const obj = { ...fields, id: newId(store.slice(0, 3)), createdAt: now(), updatedAt: now() };
  data[store].push(obj);
  write(store, obj);
  emit(store);
  return obj;
}

// debounce: true para cambios de texto (se guardan tras una pausa); false para cambios puntuales.
export function update(store, id, patch, { debounce = true } = {}) {
  const obj = get(store, id);
  if (!obj) return null;
  Object.assign(obj, patch, { updatedAt: now() });
  if (debounce) scheduleSave(store, obj);
  else write(store, obj);
  emit(store);
  return obj;
}

export async function remove(store, id) {
  const key = `${store}:${id}`;
  clearTimeout(pending.get(key)?.timer);
  pending.delete(key);
  data[store] = data[store].filter((x) => x.id !== id);
  await storeDelete(store, id);
  // Una ficha borrada desaparece también de los enlaces de las demás.
  if (store === 'codex') {
    for (const other of ['codex', 'storylines']) {
      for (const obj of data[other]) {
        if (obj.links?.includes(id)) update(other, obj.id, { links: obj.links.filter((l) => l !== id) }, { debounce: false });
      }
    }
  }
  emit(store);
}

// ---------- Sesiones ----------

export function sessionsSorted() {
  return [...data.sessions].sort((a, b) => (b.number || 0) - (a.number || 0) || String(b.date).localeCompare(String(a.date)));
}

export function newSession() {
  const number = Math.max(0, ...data.sessions.map((s) => Number(s.number) || 0)) + 1;
  return create('sessions', { number, date: today(), title: '', summary: '', notes: [{ id: newId('n'), text: '', depth: 0 }] });
}

// ---------- Bitácora y líneas de historia ----------

export const codexName = (id) => get('codex', id)?.name || '?';

// Dónde se menciona una ficha: fichas e historias que la enlazan, y sesiones que la nombran en sus notas.
export function backlinks(id) {
  const sessions = new Map();
  for (const it of noteIndex()) if (it.own.has(id)) sessions.set(it.session.id, it.session);
  return {
    codex: data.codex.filter((c) => c.id !== id && c.links?.includes(id)),
    storylines: data.storylines.filter((s) => s.links?.includes(id)),
    sessions: [...sessions.values()],
  };
}

// ---------- Menciones: qué fichas aparecen en cada punto de las notas ----------
// Una ficha se reconoce por su nombre o por sus alias (sin mayúsculas ni tildes, palabras completas).

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function termsOf(entry) {
  return [entry.name, ...(entry.aliases || [])]
    .map((x) => normalize(x || '').trim())
    .filter((x) => x.length >= 2)
    .sort((a, b) => b.length - a.length);
}

function matchers() {
  return data.codex.map((c) => {
    const terms = termsOf(c);
    return {
      id: c.id,
      re: terms.length ? new RegExp(`(^|[^\\p{L}\\p{N}])(${terms.map(escapeRe).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'gu') : null,
    };
  }).filter((m) => m.re);
}

function mentionsIn(text, ms) {
  const n = normalize(text || '');
  const found = [];
  for (const m of ms) {
    m.re.lastIndex = 0;
    if (m.re.test(n)) found.push(m.id);
  }
  return found;
}

// Partes del texto donde se nombra alguna ficha: [{ text, id? }] (para resaltarlas).
export function highlightParts(text) {
  const n = normalize(text || '');
  const hits = [];
  for (const m of noteIndexMatchers()) {
    m.re.lastIndex = 0;
    for (const r of n.matchAll(m.re)) {
      const start = r.index + r[1].length;
      hits.push({ start, end: start + r[2].length, id: m.id });
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const parts = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start < pos) continue; // se solapa con otra mención
    if (h.start > pos) parts.push({ text: text.slice(pos, h.start) });
    parts.push({ text: text.slice(h.start, h.end), id: h.id });
    pos = h.end;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos) });
  return parts;
}

/**
 * Todos los puntos de todas las sesiones, en orden, con las fichas que nombran:
 * own = nombradas en el propio punto; all = también las de sus puntos "padre" (un sub-punto hereda el contexto).
 */
function buildIndex() {
  const ms = matchers();
  const notes = [];
  const sessions = [...sessionsSorted()].reverse(); // de la primera a la última
  for (const session of sessions) {
    const stack = [];
    for (const note of session.notes || []) {
      while (stack.length && stack.at(-1).depth >= note.depth) stack.pop();
      const own = new Set(mentionsIn(note.text, ms));
      const all = new Set(own);
      for (const parent of stack) for (const id of parent.own) all.add(id);
      notes.push({ session, note, own, all, context: stack.map((p) => p.text).filter((x) => x?.trim()) });
      stack.push({ depth: note.depth, own, text: note.text });
    }
  }
  return { notes, ms };
}

function cache() { return (mentionCache ??= buildIndex()); }
export const noteIndex = () => cache().notes;
const noteIndexMatchers = () => cache().ms;

// Puntos de las sesiones donde aparece una ficha (también por herencia de un punto padre).
export const entryLog = (id) => noteIndex().filter((it) => it.all.has(id) && it.note.text?.trim());

/**
 * Grafo de la campaña: nodos = fichas; hilos = pares de fichas que aparecen juntas en un punto
 * (al menos una nombrada en ese mismo punto), más los enlaces de la bitácora y las historias que las unen.
 */
export function graph() {
  const nodes = new Map(data.codex.map((c) => [c.id, { id: c.id, entry: c, mentions: 0 }]));
  const edges = new Map();
  const edge = (a, b) => {
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = `${x}|${y}`;
    if (!edges.has(key)) edges.set(key, { key, a: x, b: y, notes: [], linked: false, stories: [] });
    return edges.get(key);
  };
  for (const it of noteIndex()) {
    for (const id of it.own) if (nodes.has(id)) nodes.get(id).mentions += 1;
    const ids = [...it.all];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (it.own.has(ids[i]) || it.own.has(ids[j])) edge(ids[i], ids[j]).notes.push(it);
      }
    }
  }
  for (const c of data.codex) for (const l of c.links || []) if (nodes.has(l) && l !== c.id) edge(c.id, l).linked = true;
  for (const st of data.storylines) {
    const ids = (st.links || []).filter((l) => nodes.has(l));
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) edge(ids[i], ids[j]).stories.push(st);
  }
  for (const e of edges.values()) e.weight = e.notes.length + (e.linked ? 1 : 0) + e.stories.length;
  return { nodes, edges };
}

// Fichas conectadas con una, de la más a la menos conectada.
export function neighbors(id, g = graph()) {
  const out = [];
  for (const e of g.edges.values()) {
    if (e.a === id || e.b === id) out.push({ id: e.a === id ? e.b : e.a, edge: e });
  }
  return out.sort((x, y) => y.edge.weight - x.edge.weight);
}

// ---------- Nombres escritos en las notas que todavía no tienen ficha ----------

export const STOP = new Set(['the', 'a', 'an', 'el', 'la', 'los', 'las', 'un', 'una', 'der', 'die', 'das', 'ein', 'eine', 'y', 'and', 'und', 'de', 'del', 'of', 'en', 'in', 'con', 'with', 'mit', 'luego', 'then', 'dann', 'party', 'dm', 'gm', 'pj', 'pjs', 'pc', 'pcs', 'npc', 'pnj']);

export function nameCandidates(session) {
  const ms = noteIndexMatchers();
  const ignored = new Set((session.ignoredNames || []).map((x) => normalize(x)));
  const counts = new Map();
  const re = /\p{Lu}[\p{L}'’-]+(?:\s+(?:(?:de|del|of|von|van|the|la|el)\s+)?\p{Lu}[\p{L}'’-]+)*/gu;
  for (const note of session.notes || []) {
    const text = note.text || '';
    for (const m of text.matchAll(re)) {
      const name = m[0];
      const before = text.slice(0, m.index).trimEnd();
      const sentenceStart = !before || /[.!?:;—–-]$/.test(before);
      const words = name.split(/\s+/);
      if (sentenceStart && words.length === 1) continue; // "Luego…", "Hacen…": mayúscula por empezar la frase
      const key = normalize(name);
      if (key.length < 3 || STOP.has(key) || ignored.has(key) || ignoredNames.has(key)) continue;
      if (mentionsIn(name, ms).length) continue; // ya tiene ficha (o alias)
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([name]) => name);
}

// ---------- Búsqueda en toda la campaña ----------

function snippet(text, q) {
  const plain = String(text || '').replace(/\s+/g, ' ');
  const pos = normalize(plain).indexOf(q);
  if (pos === -1) return '';
  const start = Math.max(0, pos - 40);
  return `${start > 0 ? '…' : ''}${plain.slice(start, pos + q.length + 60)}${pos + q.length + 60 < plain.length ? '…' : ''}`;
}

function firstMatch(fields, q) {
  for (const f of fields) {
    if (normalize(f || '').includes(q)) return snippet(f, q);
  }
  return null;
}

export function search(query) {
  const q = normalize(query.trim());
  if (!q) return null;
  const results = { sessions: [], codex: [], storylines: [] };
  for (const s of sessionsSorted()) {
    const hit = firstMatch([s.title, s.summary, ...(s.notes || []).map((n) => n.text)], q);
    if (hit != null) results.sessions.push({ item: s, snippet: hit });
  }
  for (const c of data.codex) {
    const hit = firstMatch([c.name, c.subtitle, (c.tags || []).join(', '), c.description], q);
    if (hit != null) results.codex.push({ item: c, snippet: hit });
  }
  for (const st of data.storylines) {
    const hit = firstMatch([st.title, st.description], q);
    if (hit != null) results.storylines.push({ item: st, snippet: hit });
  }
  results.codex.sort((a, b) => a.item.name.localeCompare(b.item.name));
  return results;
}
