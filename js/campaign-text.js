// Fichas e historias escritas como texto junto a las notas de sesión, por una persona o por una IA con las
// instrucciones de la app ("Copiar instrucciones para IA"):
//   ## Fichas
//   - Harbin Wester (personaje): Alcalde de Phandalin. Otros nombres: Harbin. Enlaces: Phandalin.
//   - Torre vieja (lugar, al norte de Phandalin): Ruina en la colina.
//   ## Historias
//   - El tesoro perdido (activa): Alguien busca el mapa. Implicados: Harbin Wester, Torre vieja.
//   ## Dudas          ← no se importa
// Todo se une por nombre (o por otro nombre) con lo que ya existe: importar dos veces no duplica nada.

import * as C from './campaign-data.js';
import { normalize } from './monsters.js';
import { autoPlace } from './campaign-detect.js';

const plain = (s) => normalize(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Títulos de sección (sin tildes ni mayúsculas) y subtítulos que dan el tipo de las fichas que siguen.
const SECTIONS = {
  entries: ['fichas', 'bitacora', 'entradas', 'codex', 'codice', 'entries', 'eintrage', 'verzeichnis'],
  stories: ['historias', 'lineas de historia', 'storylines', 'stories', 'handlungsstrange'],
  skip: ['dudas', 'preguntas', 'questions', 'doubts', 'open questions', 'fragen', 'offene fragen'],
};
const KIND_GROUPS = {
  character: ['personajes', 'pnj', 'pnjs', 'npcs', 'characters', 'figuren', 'personen'],
  place: ['lugares', 'places', 'locations', 'orte'],
  item: ['objetos', 'items', 'gegenstande'],
  faction: ['facciones', 'factions', 'organizaciones', 'fraktionen'],
};
const KIND_WORDS = {
  character: ['personaje', 'pnj', 'npc', 'character', 'figur', 'person', 'criatura', 'creature', 'kreatur', 'animal', 'tier', 'dios', 'diosa', 'god', 'gott'],
  place: ['lugar', 'place', 'location', 'ort', 'ciudad', 'pueblo', 'city', 'town', 'stadt', 'dorf', 'mazmorra', 'dungeon'],
  item: ['objeto', 'item', 'gegenstand', 'object', 'arma', 'weapon', 'waffe', 'artefacto', 'artifact', 'artefakt'],
  faction: ['faccion', 'faction', 'fraktion', 'organizacion', 'organization', 'organisation', 'gremio', 'guild', 'banda', 'gang', 'culto', 'cult'],
};
const PARTY = ['grupo', 'party', 'gruppe', 'pj', 'pc', 'jugador', 'jugadora', 'player', 'spieler', 'spielerin'];
const STATUS = {
  active: ['activa', 'activo', 'active', 'aktiv', 'en curso', 'abierta', 'open', 'offen'],
  idea: ['idea', 'idee', 'gancho', 'hook', 'pendiente', 'possible', 'posible'],
  resolved: ['resuelta', 'resuelto', 'cerrada', 'terminada', 'resolved', 'closed', 'done', 'abgeschlossen', 'erledigt'],
};
// Etiquetas dentro de una línea ("Otros nombres: …", "Enlaces: …", "Implicados: …").
const LABELS = [
  ['aliases', /(?:otros nombres|alias(?:es)?|tambi[eé]n llamad[oa]s?|also known as|other names|aka|andere namen|auch genannt)/],
  ['links', /(?:enlaces|relaciones|conexiones|links|connections|related|verbindungen|beziehungen)/],
  ['links', /(?:implicados|involucrados|involved|beteiligte)/],
];
const LABEL_RE = new RegExp(`(?:^|[.;]\\s*|\\s+)(${LABELS.map(([, re]) => re.source).join('|')})\\s*:`, 'gi');

const kindOf = (word) => Object.keys(KIND_WORDS).find((k) => KIND_WORDS[k].includes(word)) || null;

/** ¿La línea es el título de una sección? Devuelve 'entries' | 'stories' | 'skip' | { kind } (subtítulo) | null. */
export function sectionOf(line) {
  const raw = line.trim();
  const marked = /^#{1,6}\s/.test(raw) || /:$/.test(raw);
  const key = plain(raw.replace(/^#{1,6}\s*/, '').replace(/:$/, ''));
  if (!key || key.split(' ').length > 3) return null;
  for (const [name, list] of Object.entries(SECTIONS)) if (list.includes(key)) return name;
  if (!marked) return null;
  const kind = Object.keys(KIND_GROUPS).find((k) => KIND_GROUPS[k].includes(key));
  return kind ? { kind } : null;
}

const splitList = (s) => s.split(/\s*[,;]\s*|\s+(?:y|e|and|und)\s+/i).map((x) => x.trim().replace(/[.\s]+$/, '')).filter(Boolean);

// "Nombre (tipo, grupo, al norte de X): descripción. Otros nombres: a, b. Enlaces: c."
function splitLine(text) {
  const m = text.match(/^([^():]+?)\s*\(([^)]*)\)\s*[:—–-]?\s*(.*)$/) || text.match(/^([^:]+?)\s*:\s*(.*)$/);
  if (!m) return { name: text.replace(/[.\s]+$/, '').trim(), tokens: [], rest: '' };
  return m.length === 4 ? { name: m[1].trim(), tokens: m[2].split(',').map((x) => x.trim()).filter(Boolean), rest: m[3] }
    : { name: m[1].trim(), tokens: [], rest: m[2] };
}

function labelled(rest) {
  const out = { text: rest, aliases: [], links: [] };
  const hits = [...rest.matchAll(LABEL_RE)];
  if (!hits.length) return out;
  out.text = rest.slice(0, hits[0].index);
  hits.forEach((h, i) => {
    const key = LABELS.find(([, re]) => new RegExp(`^${re.source}$`, 'i').test(h[1]))?.[0];
    const value = rest.slice(h.index + h[0].length, hits[i + 1]?.index ?? rest.length);
    if (key) out[key].push(...splitList(value));
  });
  return out;
}

/** Una línea de la sección Fichas → { name, kind, party, where, text, aliases, links } (o null). */
export function parseEntryLine(text, defaultKind = null) {
  const { name, tokens, rest } = splitLine(text.trim());
  if (!name || name.length > 80) return null;
  let kind = null;
  let party = false;
  const where = [];
  for (const tk of tokens) {
    const k = plain(tk);
    if (PARTY.includes(k)) { party = true; if (k === 'pj' || k === 'pc') kind ??= 'character'; continue; }
    const asKind = kindOf(k);
    if (asKind && !kind) kind = asKind;
    else where.push(tk); // "al norte de Phandalin", "en Neverwinter", "cerca del río"
  }
  const l = labelled(rest);
  return { name, kind: kind || defaultKind, party, where: where.join(', '), text: l.text.trim().replace(/[\s.]+$/, ''), aliases: l.aliases, links: l.links };
}

/** Una línea de la sección Historias → { title, status, text, links } (o null). */
export function parseStoryLine(text) {
  const { name, tokens, rest } = splitLine(text.trim());
  if (!name) return null;
  const status = tokens.map(plain).map((k) => Object.keys(STATUS).find((s) => STATUS[s].includes(k))).find(Boolean) || 'idea';
  const l = labelled(rest);
  return { title: name, status, text: l.text.trim(), links: [...l.links, ...l.aliases] };
}

// ---------- Unir con lo que ya existe ----------

// Ficha por nombre o por otro nombre (en los dos sentidos), sin mayúsculas ni tildes.
export function findEntry(name, entries = C.list('codex')) {
  const k = plain(name);
  if (!k) return null;
  return entries.find((e) => plain(e.name || '') === k) || entries.find((e) => (e.aliases || []).some((a) => plain(a) === k)) || null;
}
const findStory = (title) => C.list('storylines').find((s) => plain(s.title || '') === plain(title)) || null;

// Descripción corta (para la lista) y larga (si el texto tiene más de una frase larga).
function texts(text) {
  if (text.length <= 140) return { subtitle: text, description: '' };
  const first = text.match(/^.{20,140}?[.!?](?=\s)/)?.[0] || `${text.slice(0, 137)}…`;
  return { subtitle: first, description: text };
}

/** Cuántas fichas e historias son nuevas y cuántas ya existen (para la vista previa). */
export function previewCampaign({ entries, stories }) {
  const known = (e) => findEntry(e.name) || e.aliases.map((a) => findEntry(a)).find(Boolean);
  return {
    entries: entries.length,
    newEntries: entries.filter((e) => !known(e)).length,
    stories: stories.length,
    newStories: stories.filter((s) => !findStory(s.title)).length,
  };
}

/**
 * Crea o completa las fichas y las historias. Nunca borra ni cambia lo que ya está escrito: solo agrega otros
 * nombres, etiquetas, enlaces y lo que esté vacío. Los lugares nuevos se ubican en el mapa con sus pistas.
 */
export function applyCampaign({ entries, stories }) {
  const r = { created: 0, completed: 0, stories: 0, placed: 0, missing: new Set() };
  const done = [];
  for (const e of entries) {
    const found = findEntry(e.name) || e.aliases.map((a) => findEntry(a)).find(Boolean);
    const { subtitle, description } = texts(e.text);
    const tags = e.party ? ['grupo'] : [];
    let entry;
    if (found) {
      const aliases = [...new Set([...(found.aliases || []), ...e.aliases, e.name])].filter((a) => plain(a) !== plain(found.name));
      entry = C.update('codex', found.id, {
        aliases, tags: [...new Set([...(found.tags || []), ...tags])],
        subtitle: found.subtitle || subtitle, description: found.description || description,
      }, { debounce: false });
      r.completed += 1;
    } else {
      entry = C.create('codex', { kind: e.kind || 'character', name: e.name, aliases: e.aliases, subtitle, description, tags, links: [] });
      r.created += 1;
    }
    done.push({ entry: C.get('codex', entry.id) || entry, line: e });
  }
  // Enlaces, cuando ya existen todas las fichas.
  for (const { entry, line } of done) {
    const ids = line.links.map((n) => { const x = findEntry(n); if (!x) r.missing.add(n); return x?.id; }).filter((id) => id && id !== entry.id);
    const cur = C.get('codex', entry.id);
    if (ids.length) C.update('codex', cur.id, { links: [...new Set([...(cur.links || []), ...ids])] }, { debounce: false });
  }
  // Lugares sin posición: "al norte de X", "en X" o junto a un lugar enlazado que ya está en el mapa.
  for (const { entry, line } of done) {
    const cur = C.get('codex', entry.id);
    if (cur.kind !== 'place' || cur.pos) continue;
    const hints = [line.where, line.text, line.links.join(', ')].filter(Boolean);
    if (hints.length && autoPlace(cur, hints)) r.placed += 1;
  }
  for (const s of stories) {
    const links = s.links.map((n) => { const x = findEntry(n); if (!x) r.missing.add(n); return x?.id; }).filter(Boolean);
    const found = findStory(s.title);
    if (found) {
      C.update('storylines', found.id, { status: s.status, description: found.description || s.text, links: [...new Set([...(found.links || []), ...links])] }, { debounce: false });
    } else {
      C.create('storylines', { title: s.title, status: s.status, description: s.text, links: [...new Set(links)] });
    }
    r.stories += 1;
  }
  return { ...r, missing: [...r.missing] };
}
