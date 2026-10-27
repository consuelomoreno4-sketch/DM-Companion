// Datos de la Campaña: sesiones (con notas en punteo), bitácora (personajes, lugares, objetos, facciones)
// y líneas de historia. Se guardan en IndexedDB; los cambios de texto se guardan solos tras una pausa corta.

import { storeAll, storePut, storeDelete } from './db.js';
import { normalize } from './monsters.js';

export const CODEX_KINDS = ['character', 'place', 'item', 'faction'];
export const STATUSES = ['idea', 'active', 'resolved'];
export const MAX_DEPTH = 4; // niveles de sangría en las notas (0–4)

const data = { sessions: [], codex: [], storylines: [] };
let loading = null;
const listeners = new Set();

// what: 'sessions' | 'codex' | 'storylines' | 'saved' | { error }
export function onChange(fn) { listeners.add(fn); }
function emit(what) { for (const fn of listeners) fn(what); }

export function loadCampaign() {
  loading ??= Promise.all(Object.keys(data).map(async (name) => { data[name] = await storeAll(name); }))
    .catch((err) => { loading = null; throw err; });
  return loading;
}

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

// Dónde se menciona una ficha: fichas e historias que la enlazan, y sesiones que nombran su nombre.
export function backlinks(id) {
  const entry = get('codex', id);
  const name = normalize(entry?.name || '').trim();
  const sessions = name.length >= 3
    ? sessionsSorted().filter((s) => normalize([s.title, s.summary, ...(s.notes || []).map((n) => n.text)].join(' ')).includes(name))
    : [];
  return {
    codex: data.codex.filter((c) => c.id !== id && c.links?.includes(id)),
    storylines: data.storylines.filter((s) => s.links?.includes(id)),
    sessions,
  };
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
