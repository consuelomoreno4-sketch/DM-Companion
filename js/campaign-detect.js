// "Detectar en las notas": lee todas las sesiones, encuentra nombres propios que todavía no tienen ficha,
// adivina si son personajes, lugares, facciones u objetos por las pistas del texto, agrupa sinónimos
// ("Dagult", "Lord Neverember" → "Dagult Neverember") y deja revisar todo antes de crear las fichas.
// Funciona sin internet; es una estimación, por eso siempre se revisa.

import * as C from './campaign-data.js';
import { normalize } from './monsters.js';
import { kindIcon } from './campaign-ui.js';
import { esc, icon, toast, openDialog, closeDialog, wireDialog } from './ui.js';
import { t, tn } from './i18n.js';

const NAME_RE = /\p{Lu}[\p{L}'’-]+(?:\s+(?:(?:de|del|of|von|van|the|la|el|da|do)\s+)?\p{Lu}[\p{L}'’-]+)*/gu;

// Palabras que suelen ir con mayúscula sin ser nombres propios (inicio de frase, días, abreviaturas…).
const COMMON = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'en', 'al', 'del', 'de', 'y', 'o', 'pero', 'luego', 'despues', 'cuando', 'mientras',
  'tras', 'durante', 'entonces', 'ademas', 'finalmente', 'todos', 'todo', 'nadie', 'ellos', 'ella', 'el', 'se', 'les', 'le', 'lo', 'su', 'sus', 'este', 'esta',
  'ese', 'esa', 'hay', 'sesion', 'session', 'sitzung', 'nota', 'notas', 'pj', 'pjs', 'pnj', 'pnjs', 'npc', 'npcs', 'dm', 'gm', 'hp', 'ca', 'ac', 'cd', 'dc',
  'the', 'a', 'an', 'they', 'he', 'she', 'it', 'we', 'then', 'after', 'when', 'while', 'later', 'finally', 'everyone',
  'der', 'die', 'das', 'ein', 'eine', 'sie', 'er', 'es', 'dann', 'danach', 'als', 'wahrend', 'spater',
  'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'party', 'grupo', 'gruppe', 'heroes', 'heroe', 'personajes', 'hombres', 'hombre', 'mujer', 'mujeres', 'rata', 'ratas', 'gigante', 'gigantes', 'orco', 'orcos',
  'ogro', 'ogros', 'goblin', 'goblins', 'trasgos', 'kobold', 'kobolds', 'lobo', 'lobos', 'esqueleto', 'esqueletos', 'zombi', 'zombis', 'lore', 'info', 'enganches',
  'enganche', 'gancho', 'ganchos', 'pendiente', 'pendientes', 'hooks', 'hook', 'todo', 'nada', 'algo', 'alguien', 'aqui', 'alli', 'ahi', 'ahora', 'hoy', 'ayer']);

const TITLES = ['lord', 'lady', 'sir', 'dame', 'rey', 'reina', 'king', 'queen', 'principe', 'princesa', 'prince', 'princess', 'hermana', 'hermano',
  'sister', 'brother', 'capitan', 'captain', 'sargento', 'sergeant', 'maestro', 'maestra', 'master', 'senor', 'senora', 'don', 'dona', 'padre', 'madre',
  'father', 'mother', 'duque', 'duquesa', 'duke', 'duchess', 'baron', 'baronesa', 'conde', 'condesa', 'count', 'countess', 'koenig', 'konig', 'konigin',
  'herr', 'frau', 'mago', 'maga', 'sacerdote', 'sacerdotisa', 'priest', 'priestess', 'general', 'comandante', 'commander', 'alcalde', 'alcaldesa', 'mayor'];
const PLACE_WORDS = ['inn', 'posada', 'taberna', 'tavern', 'castillo', 'castle', 'torre', 'tower', 'hold', 'keep', 'fortaleza', 'fortress', 'fuerte', 'fort',
  'mina', 'mine', 'rancho', 'ranch', 'granja', 'farm', 'manse', 'mansion', 'santuario', 'shrine', 'templo', 'temple', 'bosque', 'wood', 'woods', 'forest',
  'montana', 'montanas', 'mountain', 'mountains', 'pico', 'peak', 'colina', 'hill', 'rio', 'river', 'lago', 'lake', 'puerto', 'port', 'harbor', 'camp',
  'campamento', 'cueva', 'cave', 'ruinas', 'ruins', 'barrow', 'tumulo', 'isla', 'island', 'valle', 'valley', 'ciudad', 'city', 'pueblo', 'aldea', 'village',
  'town', 'burg', 'stadt', 'dorf', 'wald', 'berg', 'hohle', 'tempel', 'turm', 'camino', 'road', 'trail', 'sendero', 'puente', 'bridge', 'costa', 'coast',
  'mar', 'sea', 'pantano', 'marisma', 'swamp', 'mere', 'excavation', 'excavacion', 'lodge', 'pabellon', 'garde', 'holm', 'mercado', 'market', 'plaza',
  'square', 'barrio', 'district', 'calle', 'street', 'hall', 'salon', 'casa', 'house', 'guarida', 'lair', 'cripta', 'crypt', 'catacumbas', 'tower'];
const FACTION_WORDS = ['gremio', 'guild', 'orden', 'order', 'alianza', 'alliance', 'culto', 'cult', 'clan', 'hermandad', 'brotherhood', 'sisterhood',
  'red', 'network', 'bund', 'gilde', 'kult', 'enclave', 'compania', 'company', 'banda', 'gang', 'consejo', 'council', 'circulo', 'circle', 'casa real',
  'familia', 'family', 'tribu', 'tribe', 'caza', 'hunt', 'jagd', 'pandilla', 'secta', 'sect', 'mercenarios', 'mercenaries', 'legion', 'ejercito', 'army', 'guardia', 'guard', 'iglesia', 'church', 'anacoretas', 'anchorites', 'zhentarim', 'harpers', 'arpistas'];
const ITEM_WORDS = ['espada', 'sword', 'anillo', 'ring', 'amuleto', 'amulet', 'libro', 'book', 'tomo', 'tome', 'baculo', 'staff', 'vara', 'wand', 'varita',
  'armadura', 'armor', 'armour', 'escudo', 'shield', 'pocion', 'potion', 'gema', 'gem', 'piedra', 'stone', 'orbe', 'orb', 'corona', 'crown', 'daga', 'dagger',
  'hacha', 'axe', 'martillo', 'hammer', 'arco', 'bow', 'capa', 'cloak', 'botas', 'boots', 'yelmo', 'helm', 'llave', 'key', 'mapa', 'map', 'pergamino', 'scroll',
  'reliquia', 'relic', 'cristal', 'crystal', 'schwert', 'ring', 'buch'];
const PLACE_BEFORE_STRONG = ['llegan a', 'llega a', 'llegamos a', 'viajan a', 'viajan hacia', 'van a', 'van hacia', 'vuelven a', 'regresan a', 'parten hacia',
  'salen de', 'salen hacia', 'ciudad de', 'pueblo de', 'aldea de', 'camino a', 'rumbo a', 'hacia', 'arrive at', 'arrive in', 'arrived at', 'arrived in', 'travel to',
  'traveled to', 'head to', 'headed to', 'towards', 'city of', 'town of', 'village of', 'reach', 'reached', 'nach', 'reisen nach', 'kommen in', 'erreichen'];
const PLACE_BEFORE_WEAK = ['en', 'a', 'desde', 'cerca de', 'al norte de', 'al sur de', 'al este de', 'al oeste de', 'in', 'at', 'to', 'from', 'near', 'im', 'zum', 'zur', 'bei', 'aus', 'von'];
const CHAR_AFTER = ['dice', 'dijo', 'les', 'le', 'pide', 'pidio', 'ofrece', 'ofrecio', 'ataca', 'ataco', 'cuenta', 'conto', 'explica', 'quiere', 'queria',
  'responde', 'grita', 'huye', 'muere', 'murio', 'sonrie', 'miente', 'contrata', 'envia', 'envio', 'confiesa', 'revela', 'traiciona', 'saluda', 'habla', 'hablo',
  'says', 'said', 'asks', 'asked', 'offers', 'offered', 'tells', 'told', 'wants', 'attacks', 'attacked', 'reveals', 'hires', 'sends', 'sent', 'dies', 'died', 'lies',
  'sagt', 'fragt', 'bietet', 'will', 'greift', 'stirbt', 'erzahlt'];
const CHAR_BEFORE = ['con', 'hablan con', 'habla con', 'conocen a', 'conoce a', 'ayudan a', 'ayuda a', 'matan a', 'mata a', 'salvan a', 'rescatan a',
  'with', 'meet', 'met', 'help', 'helped', 'kill', 'killed', 'save', 'saved', 'rescue', 'rescued', 'talk to', 'talked to', 'mit', 'treffen'];

const words = (s) => normalize(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const endsWithAny = (text, list) => list.some((cue) => text === cue || text.endsWith(` ${cue}`));

/** Lee todas las notas y devuelve { candidates, aliasSuggestions }. */
export function detectNames() {
  const found = new Map(); // clave normalizada → candidato
  const sessions = [...C.sessionsSorted()].reverse();
  for (const session of sessions) {
    for (const note of session.notes || []) {
      const text = note.text || '';
      // Trozos que ya nombran una ficha ("la posada Stonehill" → Stonehill Inn): ahí no se buscan nombres nuevos.
      const covered = [];
      let at = 0;
      for (const part of C.highlightParts(text)) {
        if (part.id) covered.push([at, at + part.text.length]);
        at += part.text.length;
      }
      for (const m of text.matchAll(NAME_RE)) {
        if (covered.some(([a, b]) => m.index < b && m.index + m[0].length > a)) continue;
        let name = m[0];
        let start = m.index;
        let parts = name.split(/\s+/);
        const before = text.slice(0, start).trimEnd();
        const sentenceStart = !before || /[.!?:;—–(-]$/.test(before);
        // "Luego Halia…" → quita la primera palabra si es común ("Luego", "El", "La"…).
        while (parts.length > 1 && COMMON.has(normalize(parts[0]))) {
          start += parts[0].length + 1;
          parts = parts.slice(1);
        }
        name = parts.join(' ');
        const key = normalize(name);
        if (key.length < 3 || COMMON.has(key) || C.STOP.has(key) || C.isIgnoredName(name)) continue;
        if (C.knownIn(name).length) continue; // ya tiene ficha (o es otro nombre de una)
        // Una sola palabra al inicio de frase puede ser solo la mayúscula de la frase:
        // cuenta como nombre si en algún otro punto aparece en medio de una frase.
        const atStart = sentenceStart && parts.length === 1 && start === m.index;
        pending(found, key, name, session, note, text, start, atStart);
      }
    }
  }
  return groupSynonyms([...found.values()]);
}

function pending(found, key, name, session, note, text, index, atStart) {
  let c = found.get(key);
  if (!c) {
    c = { key, name, words: words(name), count: 0, midSentence: 0, score: { character: 0, place: 0, faction: 0, item: 0 }, examples: [], aliases: [] };
    found.set(key, c);
  }
  c.count += 1;
  if (!atStart) c.midSentence += 1;
  if (c.examples.length < 2) c.examples.push({ text, number: session.number });
  // Descripción breve: "Valanter, la intrépida líder de los hombres rata…" → "la intrépida líder de los hombres rata".
  if (!c.subtitle) {
    const ap = text.slice(index + name.length).match(/^\s*,\s*((?:el|la|los|las|un|una|the|a|an|der|die|das|ein|eine)\s[^,.;:()"“”]{4,80})/i);
    // No sirve si es una lista ("…, la Reina del Crepúsculo, los pactos") o si sigue otro nombre.
    const inList = /,\s*(?:(?:el|la|los|las|the|der|die|das)\s+)?$/i.test(text.slice(0, index));
    if (ap && !inList && !/^\S+\s+\p{Lu}/u.test(ap[1])) c.subtitle = ap[1].trim();
  }
  scoreOccurrence(c, text, index, name);
}

// Pistas alrededor de cada aparición: qué palabras van antes y después, y qué palabras lleva el nombre.
function scoreOccurrence(c, text, index, name) {
  const before = words(text.slice(Math.max(0, index - 40), index)).slice(-3).join(' ');
  const after = words(text.slice(index + name.length, index + name.length + 30))[0] || '';
  const inName = c.words;
  if (inName.some((w) => PLACE_WORDS.includes(w))) c.score.place += 3;
  if (inName.some((w) => FACTION_WORDS.includes(w))) c.score.faction += 3;
  if (inName.some((w) => ITEM_WORDS.includes(w))) c.score.item += 3;
  if (TITLES.includes(inName[0])) c.score.character += 3;
  const bw = before.split(' ');
  const nounBefore = bw.at(-1) === 'de' || bw.at(-1) === 'del' || bw.at(-1) === 'of' ? bw.at(-2) : bw.at(-1);
  if (PLACE_WORDS.includes(nounBefore)) c.score.place += 2.5; // "el templo de Zavras", "la posada Stonehill"
  if (endsWithAny(before, PLACE_BEFORE_STRONG)) c.score.place += 2;
  else if (endsWithAny(before, PLACE_BEFORE_WEAK)) c.score.place += 0.6;
  if (endsWithAny(before, CHAR_BEFORE)) c.score.character += 1.5;
  if (CHAR_AFTER.includes(after)) c.score.character += 1.5;
  if (['los', 'las', 'the', 'die'].some((w) => before.endsWith(w)) && /s$/.test(normalize(name))) c.score.faction += 1; // "los Zhentarim"
}

export function guessKind(c) {
  const s = c.score;
  const best = Object.entries(s).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 1 ? best[0] : 'character'; // sin pistas, lo más común en las notas son personajes
}

// Sinónimos: "Dagult" o "Lord Neverember" se agrupan con "Dagult Neverember";
// y un nombre que es parte del de una ficha existente ("Thornton" → Halia Thornton) se sugiere como otro nombre.
// Casi iguales (una letra de diferencia, como "Valanter" y "Valenter"): suele ser un error de tipeo.
function oneEdit(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) || a.slice(i) === b.slice(i + 1);
}

function mergeTypos(list) {
  const out = [];
  for (const c of [...list].sort((a, b) => b.midSentence - a.midSentence || b.count - a.count)) {
    const home = c.words.length === 1 && out.find((k) => k.words.length === 1 && oneEdit(k.key, c.key));
    if (home) {
      home.aliases.push(c.name);
      home.count += c.count;
      home.midSentence += c.midSentence;
      home.subtitle ||= c.subtitle;
      for (const [kind, v] of Object.entries(c.score)) home.score[kind] += v;
    } else out.push(c);
  }
  return out;
}

function groupSynonyms(raw) {
  const list = mergeTypos(raw);
  const byLength = [...list].sort((a, b) => b.words.length - a.words.length || b.count - a.count);
  const kept = [];
  for (const c of byLength) {
    const core = c.words.filter((w) => !TITLES.includes(w));
    const homes = kept.filter((k) => k.words.length > core.length && core.length && core.every((w) => k.words.includes(w)));
    if (homes.length === 1) {
      homes[0].aliases.push(c.name);
      homes[0].count += c.count;
      for (const [kind, v] of Object.entries(c.score)) homes[0].score[kind] += v;
      homes[0].aliases.push(...c.aliases);
      homes[0].midSentence += c.midSentence;
      homes[0].subtitle ||= c.subtitle;
    } else {
      kept.push(c);
    }
  }
  // Partes de nombres de fichas existentes.
  const aliasSuggestions = [];
  const entries = C.list('codex');
  for (const c of [...kept]) {
    if (c.words.length > 2) continue;
    const core = c.words.filter((w) => !TITLES.includes(w));
    if (!core.length) continue;
    const owners = entries.filter((e) => {
      const ew = words(e.name || '');
      return ew.length > core.length && core.every((w) => ew.includes(w));
    });
    if (owners.length === 1) {
      aliasSuggestions.push({ alias: c.name, entry: owners[0], count: c.count, example: c.examples[0], mid: c.midSentence > 0 });
      kept.splice(kept.indexOf(c), 1);
    }
  }
  // Una sola palabra que solo aparece al inicio de frase ("Luego…", "Hacen…") no es un nombre,
  // salvo que se haya unido arriba a un nombre más largo ("Sildar dice…" → Sildar Hallwinter).
  const candidates = kept.filter((c) => c.midSentence > 0 || c.words.length > 1);
  candidates.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  for (const c of candidates) c.kind = guessKind(c);
  return { candidates, aliasSuggestions: aliasSuggestions.filter((a) => a.mid || a.alias.split(/\s+/).length > 1) };
}

// ---------- Lugares nuevos en el mapa dibujado ----------

// "el templo de Zavras al sur de Conyberry" → la ficha nueva va un poco al sur de Conyberry.
// Sin dirección, junto a otro lugar ya ubicado que se nombre en la misma frase. Si no hay pistas, queda sin ubicar.
const DIRS = {
  norte: [0, -1], sur: [0, 1], este: [1, 0], oeste: [-1, 0], noreste: [0.7, -0.7], nordeste: [0.7, -0.7], noroeste: [-0.7, -0.7],
  sureste: [0.7, 0.7], sudeste: [0.7, 0.7], suroeste: [-0.7, 0.7], sudoeste: [-0.7, 0.7],
  north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0], northeast: [0.7, -0.7], northwest: [-0.7, -0.7], southeast: [0.7, 0.7], southwest: [-0.7, 0.7],
  nordlich: [0, -1], sudlich: [0, 1], ostlich: [1, 0], westlich: [-1, 0],
};
const DIR_RE = /\b(?:(?:al|hacia el)\s+(norte|sur|este|oeste|noreste|nordeste|noroeste|sureste|sudeste|suroeste|sudoeste)\s+de(?:l)?|(north|south|east|west|northeast|northwest|southeast|southwest)\s+of|(nordlich|sudlich|ostlich|westlich)\s+(?:von|vom)?)\s+(.{1,50})/;

function autoPlace(entry, texts) {
  const placedIn = (text) => C.knownIn(text).map((id) => C.get('codex', id)).filter((e) => e && e.id !== entry.id && e.kind === 'place' && e.pos);
  let pos = null;
  for (const text of texts) {
    const m = normalize(text).match(DIR_RE);
    const anchor = m && placedIn(m[4])[0];
    if (anchor) {
      const [dx, dy] = DIRS[m[1] || m[2] || m[3]];
      pos = { x: Math.round(anchor.pos.x + dx * 70), y: Math.round(anchor.pos.y + dy * 70) };
      break;
    }
  }
  if (!pos) {
    const anchor = texts.map(placedIn).find((list) => list.length)?.[0];
    if (!anchor) return false;
    // Alrededor del lugar vecino, sin taparse con otras fichas.
    const taken = C.list('codex').filter((e) => e.pos).map((e) => e.pos);
    for (let i = 0; i < 12 && !pos; i++) {
      const a = (i * Math.PI) / 6 + 0.4;
      const p = { x: Math.round(anchor.pos.x + Math.cos(a) * 70), y: Math.round(anchor.pos.y + Math.sin(a) * 70) };
      if (!taken.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 45)) pos = p;
    }
    pos ||= { x: anchor.pos.x + 40, y: anchor.pos.y + 40 };
  }
  C.update('codex', entry.id, { pos }, { debounce: false });
  return true;
}

// ---------- Ventana de revisión ----------

let wired = false;

export function openDetectDialog(onDone) {
  const dlg = document.getElementById('dlg-detect');
  const body = document.getElementById('detect-body');
  if (!wired) { wireDialog(dlg); wired = true; }
  const { candidates, aliasSuggestions } = detectNames();
  const sessions = C.list('sessions').length;
  const row = (c, i) => `
    <li class="det-row" data-row="${i}">
      <label class="det-check"><input type="checkbox" data-use checked aria-label="${esc(t('det.use', { name: c.name }))}"></label>
      <div class="det-main">
        <div class="det-line">
          <input class="det-name" data-name value="${esc(c.name)}" aria-label="${esc(t('entry.name'))}">
          <select data-kind aria-label="${esc(t('entry.type'))}">${C.CODEX_KINDS.map((k) => `<option value="${k}"${c.kind === k ? ' selected' : ''}>${esc(t(`camp.kind.${k}`))}</option>`).join('')}</select>
          <span class="badge num">${esc(tn('camp.mentions', c.count))}</span>
        </div>
        <input class="det-aliases" data-subtitle value="${esc(c.subtitle || '')}" placeholder="${esc(t('camp.subtitle'))}" aria-label="${esc(t('camp.subtitle'))}">
        <input class="det-aliases" data-aliases value="${esc(c.aliases.join(', '))}" placeholder="${esc(t('camp.aliases'))}" aria-label="${esc(t('camp.aliases'))}">
        <p class="hint det-example">${c.examples.map((x) => `<span>#${esc(x.number ?? '')} · ${esc(x.text.length > 140 ? `${x.text.slice(0, 140)}…` : x.text)}</span>`).join('')}</p>
      </div>
    </li>`;
  body.innerHTML = `
    <header class="dialog-head">
      <h2 id="dlg-detect-title">${esc(t('det.title'))}</h2>
      <button class="btn btn-icon" type="button" data-close aria-label="${esc(t('common.close'))}">${icon('close')}</button>
    </header>
    <p class="hint">${esc(t('det.intro', { sessions }))}</p>
    ${candidates.length ? `
      <div class="map-actions">
        <button class="btn" type="button" data-all="1">${icon('check')}<span>${esc(t('det.checkAll'))}</span></button>
        <button class="btn" type="button" data-all="0">${icon('close')}<span>${esc(t('det.checkNone'))}</span></button>
      </div>
      <ul class="det-list">${candidates.map(row).join('')}</ul>` : `<p>${esc(t('det.none'))}</p>`}
    ${aliasSuggestions.length ? `
      <h3>${icon('link')} ${esc(t('det.aliasTitle'))}</h3>
      <ul class="det-list">${aliasSuggestions.map((a, i) => `
        <li class="det-row" data-alias-row="${i}">
          <label class="det-check"><input type="checkbox" data-use checked aria-label="${esc(t('det.use', { name: a.alias }))}"></label>
          <div class="det-main"><div class="det-line"><strong>${esc(a.alias)}</strong> → ${kindIcon(a.entry.kind)} ${esc(a.entry.name)} <span class="badge num">${esc(tn('camp.mentions', a.count))}</span></div>
          ${a.example ? `<p class="hint det-example"><span>#${esc(a.example.number ?? '')} · ${esc(a.example.text.slice(0, 140))}</span></p>` : ''}</div>
        </li>`).join('')}</ul>` : ''}
    <label class="check det-ignore"><input type="checkbox" data-ignore-rest><span>${esc(t('det.ignoreRest'))}</span></label>
    <footer class="dialog-foot">
      <button class="btn" type="button" data-close>${esc(t('common.cancel'))}</button>
      <button class="btn btn-primary" type="button" data-create${candidates.length || aliasSuggestions.length ? '' : ' disabled'}>${icon('plus')}<span data-create-label></span></button>
    </footer>`;

  const countLabel = () => {
    const n = body.querySelectorAll('[data-row] [data-use]:checked').length;
    const a = body.querySelectorAll('[data-alias-row] [data-use]:checked').length;
    body.querySelector('[data-create-label]').textContent = t('det.create', { n, a });
  };
  countLabel();
  body.onchange = (e) => { if (e.target.matches('[data-use]')) countLabel(); };
  body.onclick = async (e) => {
    const all = e.target.closest('[data-all]');
    if (all) {
      body.querySelectorAll('[data-row] [data-use]').forEach((x) => { x.checked = all.dataset.all === '1'; });
      countLabel();
      return;
    }
    if (!e.target.closest('[data-create]')) return;
    let created = 0;
    let aliased = 0;
    const skipped = [];
    const newPlaces = [];
    body.querySelectorAll('[data-row]').forEach((li) => {
      const c = candidates[Number(li.dataset.row)];
      if (!li.querySelector('[data-use]').checked) { skipped.push(c.name, ...c.aliases); return; }
      const name = li.querySelector('[data-name]').value.trim();
      if (!name) return;
      const aliases = li.querySelector('[data-aliases]').value.split(',').map((x) => x.trim()).filter(Boolean);
      const kind = li.querySelector('[data-kind]').value;
      const entry = C.create('codex', { kind, name, aliases, subtitle: li.querySelector('[data-subtitle]').value.trim(), tags: [], description: '', links: [] });
      if (kind === 'place') newPlaces.push({ entry, texts: c.examples.map((x) => x.text) });
      created += 1;
    });
    body.querySelectorAll('[data-alias-row]').forEach((li) => {
      const a = aliasSuggestions[Number(li.dataset.aliasRow)];
      if (!li.querySelector('[data-use]').checked) { skipped.push(a.alias); return; }
      const entry = C.get('codex', a.entry.id);
      C.update('codex', entry.id, { aliases: [...new Set([...(entry.aliases || []), a.alias])] }, { debounce: false });
      aliased += 1;
    });
    const placed = newPlaces.filter(({ entry, texts }) => autoPlace(entry, texts)).length;
    if (body.querySelector('[data-ignore-rest]').checked && skipped.length) await C.ignoreNames(skipped);
    closeDialog(dlg);
    toast(`${t('det.done', { n: created, a: aliased })}${placed ? ` ${tn('det.placed', placed)}` : ''}`, { duration: 6000, group: 'detect' });
    onDone?.();
  };
  openDialog(dlg);
}
