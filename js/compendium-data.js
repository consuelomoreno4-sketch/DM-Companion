// Datos del Compendio: SRD 5.2.1 (archivos de data/) + entradas propias (IndexedDB, almacén 'homebrew').
// Todo se presenta con la misma forma para listas y filtros; el texto del SRD está en inglés.

import { homebrewAll, homebrewPut, homebrewDelete } from './db.js';
import { loadMonsters, allMonsters, setHomebrewMonsters, crText } from './monsters.js';
import { mdToHtml } from './markdown.js';
import { esc } from './ui.js';

export const KINDS = ['monster', 'spell', 'rule'];
export const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
export const CLASSES = ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'];
export const CR_VALUES = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, k) => k + 1)];
export const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
export const MONSTER_TYPES = ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'];
export const HOUSE_RULES = 'House Rules';

const XP = { 0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000 };
const profBonus = (cr) => (cr < 5 ? 2 : Math.min(9, 2 + Math.ceil((cr - 4) / 4)));

// ---------- Carga ----------

const cache = {};
function fetchJson(path) {
  cache[path] ??= fetch(path).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).catch((err) => {
    delete cache[path];
    throw err;
  });
  return cache[path];
}

let spells = null;
let rules = null;
let homebrew = [];
const listeners = new Set();

export function onHomebrewChange(fn) { listeners.add(fn); }
function emit() { for (const fn of listeners) fn(); }

export async function loadHomebrew() {
  homebrew = await homebrewAll();
  syncMonsters();
  emit();
}

export async function loadKind(kind) {
  if (kind === 'monster') await loadMonsters();
  if (kind === 'spell' && !spells) spells = (await fetchJson('data/spells.json')).map((s) => ({ ...s, src: 'srd' }));
  if (kind === 'rule' && !rules) rules = (await fetchJson('data/rules.json')).map((r) => ({ ...r, src: 'srd' }));
}

// ---------- Listas unificadas ----------

const hbOf = (kind) => homebrew.filter((e) => e.kind === kind);

function monsterIndex(e) {
  return {
    i: e.id, n: e.name, s: [e.size, e.type].filter(Boolean).join(' '), t: e.type || '',
    cr: Number(e.cr) || 0, hp: Number(e.hp) || 1, ac: Number(e.ac) || 10,
    init: e.init === '' || e.init == null ? abilityMod(e.dex) : Number(e.init),
  };
}

function syncMonsters() {
  setHomebrewMonsters(hbOf('monster').map(monsterIndex));
}

const castingKind = (ct) => (/^bonus action/i.test(ct) ? 'bonus' : /^reaction/i.test(ct) ? 'reaction' : /^action/i.test(ct) ? 'action' : 'long');

function spellIndex(e) {
  return {
    i: e.id, n: e.name, lvl: Number(e.level) || 0, school: e.school || '', classes: e.classes || [],
    ct: e.castingTime || '', ctk: castingKind(e.castingTime || ''), ritual: !!e.ritual, conc: !!e.concentration,
    range: e.range || '—', comp: e.components || '—',
    dur: e.concentration ? `Concentration, ${e.duration || 'up to 1 minute'}` : e.duration || 'Instantaneous', src: 'hb',
  };
}

const ruleIndex = (e) => ({ i: e.id, n: e.name, tag: null, cat: e.category || HOUSE_RULES, src: 'hb' });

export function list(kind) {
  if (kind === 'monster') return allMonsters();
  if (kind === 'spell') return [...(spells || []), ...hbOf('spell').map(spellIndex)];
  return [...(rules || []), ...hbOf('rule').map(ruleIndex)];
}

export const getHomebrew = (id) => homebrew.find((e) => e.id === id) ?? null;

// ---------- Presentación (HTML del detalle) ----------

export async function detailHtml(kind, item) {
  if (kind === 'monster') {
    if (item.src === 'srd') return (await fetchJson('data/monsters-full.json'))[item.i] || '';
    return monsterHtml(getHomebrew(item.i));
  }
  if (kind === 'spell') {
    const body = item.src === 'srd' ? item.html : spellBodyHtml(getHomebrew(item.i));
    return spellHeaderHtml(item) + body;
  }
  return item.src === 'srd' ? item.html : mdToHtml(getHomebrew(item.i)?.text);
}

export function spellLevelText(s) {
  return s.lvl === 0 ? `${s.school} Cantrip` : `Level ${s.lvl} ${s.school}`;
}

function spellHeaderHtml(s) {
  const classes = s.classes.length ? ` (${s.classes.join(', ')})` : '';
  return `<p class="sb-sub"><em>${esc(spellLevelText(s))}${esc(classes)}</em></p>
    <p><strong>Casting Time:</strong> ${esc(s.ct)}${s.ritual ? ' or Ritual' : ''}<br>
    <strong>Range:</strong> ${esc(s.range)}<br>
    <strong>Components:</strong> ${esc(s.comp)}<br>
    <strong>Duration:</strong> ${esc(s.dur)}</p>`;
}

function spellBodyHtml(e) {
  if (!e) return '';
  let html = mdToHtml(e.text);
  if (e.higher?.trim()) {
    const label = Number(e.level) === 0 ? 'Cantrip Upgrade.' : 'Using a Higher-Level Spell Slot.';
    html += `<p><em>${label}</em> ${mdToHtml(e.higher).replace(/^<p>|<\/p>$/g, '')}</p>`;
  }
  return html;
}

export function abilityMod(score) {
  const n = Number(score);
  return Number.isFinite(n) && score !== '' && score != null ? Math.floor((n - 10) / 2) : 0;
}
const signed = (n) => (n >= 0 ? `+${n}` : `−${-n}`);

// Bloque de estadísticas de un monstruo propio, con el mismo aspecto que los del SRD.
function monsterHtml(e) {
  if (!e) return '';
  const abil = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  // "Dex +4, Wis +2" → salvaciones distintas del modificador
  const saves = {};
  for (const [, ab, val] of String(e.saves || '').matchAll(/\b(str|dex|con|int|wis|cha)\w*\s*([+−-]\s*\d+)/gi)) {
    saves[ab.toLowerCase()] = Number(val.replace('−', '-').replace(/\s/g, ''));
  }
  const cell = (ab) => {
    const score = e[ab] === '' || e[ab] == null ? 10 : Number(e[ab]);
    const mod = abilityMod(score);
    return `<td>${ab.toUpperCase()}</td><td>${score}</td><td>${signed(mod)}</td><td>${signed(saves[ab] ?? mod)}</td>`;
  };
  const head = '<th></th><th></th><th>MOD</th><th>SAVE</th>'.repeat(3);
  const table = `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>
    <tr>${abil.slice(0, 3).map(cell).join('')}</tr><tr>${abil.slice(3).map(cell).join('')}</tr></tbody></table></div>`;
  const idx = monsterIndex(e);
  const cr = idx.cr;
  const lines = [
    ['Skills', e.skills], ['Resistances', e.resist], ['Immunities', e.immune],
    ['Senses', e.senses], ['Languages', e.languages],
  ].filter(([, v]) => v && String(v).trim()).map(([k, v]) => `<strong>${k}</strong> ${esc(v)}`);
  lines.push(`<strong>CR</strong> ${crText(cr)} (XP ${XP[cr]?.toLocaleString('en') ?? '—'}; PB ${signed(profBonus(cr))})`);
  const subtitle = [[e.size, e.type].filter(Boolean).join(' '), e.alignment].filter(Boolean).join(', ');
  return `<p class="sb-sub"><em>${esc(subtitle)}</em></p>
    <p><strong>AC</strong> ${idx.ac} <strong>Initiative</strong> ${signed(idx.init)} (${10 + idx.init})<br>
    <strong>HP</strong> ${idx.hp}${e.hpFormula ? ` (${esc(e.hpFormula)})` : ''}<br>
    <strong>Speed</strong> ${esc(e.speed || '30 ft.')}</p>
    ${table}
    <p>${lines.join('<br>')}</p>
    ${mdToHtml(e.text)}`;
}

// ---------- Guardar / borrar entradas propias ----------

export async function saveHomebrew(entry) {
  const e = { ...entry, updatedAt: new Date().toISOString() };
  e.id ||= `hb-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await homebrewPut(e);
  const i = homebrew.findIndex((x) => x.id === e.id);
  if (i === -1) homebrew.push(e); else homebrew[i] = e;
  syncMonsters();
  emit();
  return e;
}

export async function deleteHomebrew(id) {
  await homebrewDelete(id);
  homebrew = homebrew.filter((e) => e.id !== id);
  syncMonsters();
  emit();
}

// Bloque de estadísticas para la ventana del Combate (ref = id del SRD o de una entrada propia).
export async function statblockFor(ref) {
  await loadMonsters();
  const m = allMonsters().find((x) => x.i === ref);
  if (!m) return null;
  return { name: m.n, html: await detailHtml('monster', m) };
}
