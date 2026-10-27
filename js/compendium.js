// Panel del Compendio: buscar y filtrar monstruos, hechizos y reglas; ver el detalle;
// crear, editar, duplicar y borrar entradas propias; añadir monstruos al combate.

import * as D from './compendium-data.js';
import { normalize, crText } from './monsters.js';
import { htmlToMd } from './markdown.js';
import { esc, icon, toast, openDialog, closeDialog, wireDialog, confirmDialog } from './ui.js';
import { t, tn, getLang } from './i18n.js';
import { openAddWithMonster } from './combat.js';

const $ = (sel) => document.querySelector(sel);
const RULE_CATS = ['Playing the Game', 'Rules Glossary', 'Spellcasting', 'Gameplay Toolbox', 'Monsters'];

const ui = {
  kind: 'monster',
  query: { monster: '', spell: '', rule: '' },
  filters: {
    monster: { src: '', type: '', crMin: '', crMax: '' },
    spell: { src: '', lvl: '', school: '', cls: '', ctk: '', conc: '', ritual: '' },
    rule: { src: '', cat: '' },
  },
  selected: { monster: null, spell: null, rule: null },
};

let els;
let ready = false;      // datos del tipo actual cargados
let renderToken = 0;    // evita pintar un detalle viejo si se elige otro mientras carga

export function initCompendium() {
  els = {
    kinds: $('#comp-kinds'),
    search: $('#comp-search'),
    filters: $('#comp-filters'),
    count: $('#comp-count'),
    list: $('#comp-list'),
    detail: $('#comp-detail'),
    dlgEntry: $('#dlg-entry'),
    entryBody: $('#entry-body'),
  };
  wireDialog(els.dlgEntry);

  els.kinds.addEventListener('change', (e) => {
    ui.kind = e.target.value;
    els.search.value = ui.query[ui.kind];
    onShow();
  });
  els.search.addEventListener('input', () => {
    ui.query[ui.kind] = els.search.value;
    renderList();
  });
  els.filters.addEventListener('change', (e) => {
    const f = e.target;
    if (!f.name) return;
    ui.filters[ui.kind][f.name] = f.value;
    updateFilterBadge();
    renderList();
  });
  els.filters.addEventListener('click', (e) => {
    if (!e.target.closest('#comp-clear')) return;
    for (const k of Object.keys(ui.filters[ui.kind])) ui.filters[ui.kind][k] = '';
    ui.query[ui.kind] = '';
    els.search.value = '';
    renderFilters();
    renderList();
  });
  $('#comp-new').addEventListener('click', () => openEntryForm(ui.kind, null));
  els.list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    ui.selected[ui.kind] = b.dataset.id;
    markSelected();
    renderDetail();
  });
  els.detail.addEventListener('click', onDetailAction);
  wireEntryForm();

  D.onHomebrewChange(() => {
    if (!isVisible()) return;
    renderFilters();
    renderList();
    renderDetail();
  });
  D.loadHomebrew().catch((err) => toast(t('comp.loadError', { msg: err.message }), { kind: 'error', duration: 0 }));
}

const isVisible = () => !$('#panel-compendio').hidden;

export async function onShow() {
  if (!els) return;
  for (const input of els.kinds.querySelectorAll('input')) input.checked = input.value === ui.kind;
  els.search.placeholder = t(`comp.search.${ui.kind}`);
  els.search.value = ui.query[ui.kind];
  ready = false;
  els.list.innerHTML = `<li class="comp-msg">${esc(t('comp.loading'))}</li>`;
  try {
    await D.loadKind(ui.kind);
  } catch (err) {
    els.list.innerHTML = `<li class="comp-msg">${esc(t('comp.loadError', { msg: err.message }))}</li>`;
    return;
  }
  ready = true;
  renderFilters();
  renderList();
  renderDetail();
}

// ---------- Filtros ----------

function select(name, label, options, value) {
  return `<label class="field"><span>${esc(label)}</span><select name="${name}">
    ${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}
  </select></label>`;
}

// Número de filtros activos junto a "Filtros" (el panel puede estar plegado).
function updateFilterBadge() {
  const active = Object.values(ui.filters[ui.kind]).filter((v) => v !== '').length;
  const badge = $('#comp-filter-count');
  badge.hidden = !active;
  badge.textContent = active;
}

function renderFilters() {
  const f = ui.filters[ui.kind];
  const any = ['', t('comp.any')];
  const parts = [select('src', t('comp.source'), [['', t('comp.src.all')], ['srd', 'SRD 5.2.1'], ['hb', t('comp.src.hb')]], f.src)];
  if (ui.kind === 'monster') {
    const crs = D.CR_VALUES.map((c) => [c, crText(c)]);
    parts.push(
      select('type', t('comp.type'), [any, ...D.MONSTER_TYPES.map((x) => [x, x])], f.type),
      select('crMin', t('comp.crMin'), [any, ...crs], f.crMin),
      select('crMax', t('comp.crMax'), [any, ...crs], f.crMax),
    );
  } else if (ui.kind === 'spell') {
    const yesNo = [any, ['yes', t('common.yes')], ['no', t('comp.no')]];
    parts.push(
      select('lvl', t('comp.level'), [any, ['0', t('comp.cantrip')], ...Array.from({ length: 9 }, (_, k) => [k + 1, String(k + 1)])], f.lvl),
      select('school', t('comp.school'), [any, ...D.SCHOOLS.map((x) => [x, x])], f.school),
      select('cls', t('comp.class'), [any, ...D.CLASSES.map((x) => [x, x])], f.cls),
      select('ctk', t('comp.castTime'), [any, ...['action', 'bonus', 'reaction', 'long'].map((k) => [k, t(`comp.ct.${k}`)])], f.ctk),
      select('conc', t('comp.conc'), yesNo, f.conc),
      select('ritual', t('comp.ritual'), yesNo, f.ritual),
    );
  } else {
    const cats = [...new Set([...RULE_CATS, ...D.list('rule').map((r) => r.cat)])];
    parts.push(select('cat', t('comp.category'), [any, ...cats.map((c) => [c, c])], f.cat));
  }
  updateFilterBadge();
  els.filters.innerHTML = `${parts.join('')}<div class="field field-end"><button class="btn" type="button" id="comp-clear">${icon('close')}<span>${esc(t('comp.clearFilters'))}</span></button></div>`;
}

// ---------- Lista ----------

function plainText(item) {
  // Texto completo de una regla para buscar dentro (se calcula una sola vez).
  if (item._text == null) {
    const html = item.src === 'srd' ? item.html : D.getHomebrew(item.i)?.text || '';
    item._text = normalize(html.replace(/<[^>]+>/g, ' '));
  }
  return item._text;
}

function filtered() {
  const kind = ui.kind;
  const f = ui.filters[kind];
  const q = normalize(ui.query[kind].trim());
  const out = [];
  for (const it of D.list(kind)) {
    if (f.src && it.src !== f.src) continue;
    if (kind === 'monster') {
      if (f.type && it.t !== f.type) continue;
      if (f.crMin !== '' && it.cr < Number(f.crMin)) continue;
      if (f.crMax !== '' && it.cr > Number(f.crMax)) continue;
    } else if (kind === 'spell') {
      if (f.lvl !== '' && it.lvl !== Number(f.lvl)) continue;
      if (f.school && it.school !== f.school) continue;
      if (f.cls && !it.classes.includes(f.cls)) continue;
      if (f.ctk && it.ctk !== f.ctk) continue;
      if (f.conc && it.conc !== (f.conc === 'yes')) continue;
      if (f.ritual && it.ritual !== (f.ritual === 'yes')) continue;
    } else if (f.cat && it.cat !== f.cat) continue;
    let rank = 0;
    if (q) {
      const name = normalize(it.n);
      const pos = name.indexOf(q);
      if (pos === 0) rank = 0;
      else if (pos > 0) rank = 1;
      else if (kind === 'rule' && plainText(it).includes(q)) rank = 2;
      else continue;
    }
    out.push([rank, it]);
  }
  const catOrder = (c) => { const i = RULE_CATS.indexOf(c); return i === -1 ? 99 : i; };
  out.sort((a, b) => a[0] - b[0]
    || (kind === 'rule' && !q ? catOrder(a[1].cat) - catOrder(b[1].cat) : 0)
    || a[1].n.localeCompare(b[1].n));
  return out.map(([, it]) => it);
}

function metaOf(it) {
  if (ui.kind === 'monster') return `${t('term.cr')} ${crText(it.cr)} · ${it.s} · ${t('term.hp')} ${it.hp} · ${t('term.ac')} ${it.ac}`;
  if (ui.kind === 'spell') {
    const flags = [it.conc ? t('comp.concShort') : '', it.ritual ? t('comp.ritualShort') : ''].filter(Boolean).join(' ');
    return `${D.spellLevelText(it)} · ${t(`comp.ct.${it.ctk}`)}${flags ? ` · ${flags}` : ''}`;
  }
  return it.tag ? `${it.cat} · ${it.tag}` : it.cat;
}

function renderList() {
  if (!ready) return;
  const items = filtered();
  els.count.textContent = tn('comp.results', items.length);
  if (!items.length) {
    els.list.innerHTML = `<li class="comp-msg">${esc(t('comp.empty'))}</li>`;
    return;
  }
  const sel = ui.selected[ui.kind];
  els.list.innerHTML = items.map((it) => `
    <li><button type="button" class="comp-item" data-id="${esc(it.i)}" aria-current="${it.i === sel}">
      <span class="comp-name">${esc(it.n)}${it.src === 'hb' ? ` <span class="badge badge-hb">${esc(t('comp.src.hb'))}</span>` : ''}</span>
      <span class="comp-meta num">${esc(metaOf(it))}</span>
    </button></li>`).join('');
}

function markSelected() {
  const sel = ui.selected[ui.kind];
  for (const b of els.list.querySelectorAll('[data-id]')) b.setAttribute('aria-current', String(b.dataset.id === sel));
}

// ---------- Detalle ----------

const currentItem = () => D.list(ui.kind).find((x) => x.i === ui.selected[ui.kind]) ?? null;

async function renderDetail() {
  if (!ready) return;
  const item = currentItem();
  const token = ++renderToken;
  if (!item) {
    els.detail.innerHTML = `<div class="comp-placeholder">${icon('book', 'icon-xl')}<p>${esc(t('comp.pick'))}</p></div>`;
    return;
  }
  let body;
  try {
    body = await D.detailHtml(ui.kind, item);
  } catch (err) {
    body = `<p>${esc(t('comp.loadError', { msg: err.message }))}</p>`;
  }
  if (token !== renderToken) return;
  const hb = item.src === 'hb';
  const entry = hb ? D.getHomebrew(item.i) : null;
  const actions = [];
  if (ui.kind === 'monster') actions.push(`<button class="btn btn-primary" type="button" data-do="combat">${icon('swords')}<span>${esc(t('comp.addToCombat'))}</span></button>`);
  if (hb) {
    actions.push(`<button class="btn" type="button" data-do="edit">${icon('edit')}<span>${esc(t('comp.edit'))}</span></button>`);
    actions.push(`<button class="btn btn-icon btn-danger" type="button" data-do="delete" aria-label="${esc(t('comp.delete'))}">${icon('trash')}</button>`);
  } else {
    actions.push(`<button class="btn" type="button" data-do="duplicate">${icon('plus')}<span>${esc(t('comp.duplicate'))}</span></button>`);
  }
  const date = entry?.updatedAt ? new Date(entry.updatedAt).toLocaleDateString(getLang()) : '';
  els.detail.innerHTML = `
    <header class="comp-head">
      <div>
        <h2>${esc(item.n)}</h2>
        <span class="badge ${hb ? 'badge-hb' : 'badge-srd'}">${esc(hb ? t('comp.src.hb') : 'SRD 5.2.1')}</span>
      </div>
      <div class="comp-actions">${actions.join('')}</div>
    </header>
    <div class="statblock" lang="en">${body}</div>
    <p class="hint comp-foot">${esc(hb ? t('comp.hbFooter', { date }) : t('comp.srdFooter'))}</p>`;
  els.detail.scrollTop = 0;
}

async function onDetailAction(e) {
  const b = e.target.closest('[data-do]');
  const item = currentItem();
  if (!b || !item) return;
  const action = b.dataset.do;
  if (action === 'combat') openAddWithMonster(item);
  else if (action === 'edit') openEntryForm(ui.kind, D.getHomebrew(item.i));
  else if (action === 'duplicate') openEntryForm(ui.kind, await prefillFromSrd(ui.kind, item));
  else if (action === 'delete') {
    const ok = await confirmDialog(t('comp.deleteConfirm', { name: item.n }), { yes: t('comp.delete') });
    if (!ok) return;
    await D.deleteHomebrew(item.i);
    ui.selected[ui.kind] = null;
    toast(t('comp.deleted'), { duration: 2500 });
  }
}

// ---------- Duplicar una entrada del SRD como propia ----------

async function prefillFromSrd(kind, item) {
  const copy = (name) => `${name} (${t('comp.copy')})`;
  if (kind === 'spell') {
    return {
      kind, name: copy(item.n), level: item.lvl, school: item.school, classes: [...item.classes],
      castingTime: item.ct, ritual: item.ritual, concentration: item.conc, range: item.range,
      components: item.comp, duration: item.dur.replace(/^Concentration,\s*/i, ''), text: htmlToMd(item.html), higher: '',
    };
  }
  if (kind === 'rule') return { kind, name: copy(item.n), category: item.cat, text: htmlToMd(item.html) };

  const html = await D.detailHtml('monster', item);
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const subtitle = doc.querySelector('.sb-sub')?.textContent.trim() || '';
  const [kindText, alignment = ''] = subtitle.includes(',') ? [subtitle.slice(0, subtitle.lastIndexOf(',')), subtitle.slice(subtitle.lastIndexOf(',') + 1).trim()] : [subtitle, ''];
  const words = kindText.split(' ');
  const size = D.SIZES.includes(words[0]) ? words[0] : '';
  const type = (size ? words.slice(1) : words).join(' ').replace(/^or \w+ /, '');
  const entry = {
    kind, name: copy(item.n), size, type, alignment, ac: item.ac, hp: item.hp, init: item.init, cr: item.cr,
    hpFormula: (html.match(/HP<\/strong>\s*\d+\s*\(([^)]+)\)/) || [])[1] || '',
    speed: (html.match(/Speed<\/strong>\s*([^<]+)/) || [])[1]?.trim() || '',
  };
  // Tabla de características: STR 8 −1 −1 …
  const cells = [...doc.querySelectorAll('td')].map((td) => td.textContent.trim());
  const saves = [];
  for (const ab of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    const k = cells.indexOf(ab);
    if (k === -1) continue;
    entry[ab.toLowerCase()] = Number(cells[k + 1]);
    if (cells[k + 3] !== cells[k + 2]) saves.push(`${ab[0]}${ab.slice(1).toLowerCase()} ${cells[k + 3]}`);
  }
  entry.saves = saves.join(', ');
  // Líneas "Skills …", "Senses …" del párrafo de datos
  const fields = { Skills: 'skills', Resistances: 'resist', Immunities: 'immune', Senses: 'senses', Languages: 'languages' };
  for (const p of doc.querySelectorAll('p')) {
    for (const part of p.innerHTML.split(/<br\s*\/?>/)) {
      const m = part.match(/<strong>([^<]+)<\/strong>\s*(.*)/s);
      if (m && fields[m[1].trim()]) entry[fields[m[1].trim()]] = m[2].replace(/<[^>]+>/g, '').trim();
    }
  }
  const firstSection = html.search(/<h3>/);
  entry.text = firstSection === -1 ? '' : htmlToMd(html.slice(firstSection));
  return entry;
}

// ---------- Formulario de entrada propia ----------

let editing = null; // { kind, id }

const input = (name, label, value, attrs = '') => `<label class="field"><span>${esc(label)}</span><input name="${name}" value="${esc(value ?? '')}" ${attrs}></label>`;
const num = (name, label, value, attrs = '') => input(name, label, value, `type="number" inputmode="numeric" ${attrs}`);
const area = (name, label, value, rows = 8, attrs = '') => `<label class="field field-wide"><span>${esc(label)}</span><textarea name="${name}" rows="${rows}" ${attrs}>${esc(value ?? '')}</textarea></label>`;
const check = (name, label, checked) => `<label class="check"><input type="checkbox" name="${name}"${checked ? ' checked' : ''}><span>${esc(label)}</span></label>`;
const opts = (list, value) => list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');

function entryFields(kind, e) {
  const req = 'required maxlength="80"';
  if (kind === 'monster') {
    return `
      ${input('name', t('entry.name'), e.name, req)}
      <div class="field-row">
        <label class="field"><span>${esc(t('entry.size'))}</span><select name="size">${opts([['', '—'], ...D.SIZES.map((s) => [s, s])], e.size)}</select></label>
        ${input('type', t('entry.type'), e.type, 'list="dl-types"')}
        ${input('alignment', t('entry.alignment'), e.alignment)}
      </div>
      <datalist id="dl-types">${D.MONSTER_TYPES.map((x) => `<option value="${x}">`).join('')}</datalist>
      <div class="field-row">
        ${num('ac', t('term.ac'), e.ac, 'required min="0" max="40"')}
        ${num('hp', t('field.hpMax'), e.hp, 'required min="1" max="9999"')}
        ${input('hpFormula', t('entry.hpFormula'), e.hpFormula, 'placeholder="3d6 + 3"')}
        ${num('init', t('entry.init'), e.init, `min="-10" max="30" placeholder="${esc(t('entry.initAuto'))}"`)}
        <label class="field"><span>${esc(t('term.cr'))}</span><select name="cr">${opts(D.CR_VALUES.map((c) => [c, crText(c)]), e.cr ?? 0)}</select></label>
      </div>
      ${input('speed', t('entry.speed'), e.speed, 'placeholder="30 ft., Fly 60 ft."')}
      <div class="field-row abilities">
        ${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((a) => num(a, a.toUpperCase(), e[a] ?? 10, 'min="1" max="30"')).join('')}
      </div>
      <div class="field-row">
        ${input('saves', t('entry.saves'), e.saves, 'placeholder="Dex +4, Wis +2"')}
        ${input('skills', t('entry.skills'), e.skills, 'placeholder="Perception +4, Stealth +6"')}
      </div>
      <div class="field-row">
        ${input('resist', t('entry.resist'), e.resist)}
        ${input('immune', t('entry.immune'), e.immune)}
      </div>
      <div class="field-row">
        ${input('senses', t('entry.senses'), e.senses, 'placeholder="Darkvision 60 ft.; Passive Perception 10"')}
        ${input('languages', t('entry.languages'), e.languages)}
      </div>
      ${area('text', t('entry.monsterText'), e.text, 12)}
      <p class="hint">${esc(t('entry.formatHint'))}</p>`;
  }
  if (kind === 'spell') {
    return `
      ${input('name', t('entry.name'), e.name, req)}
      <div class="field-row">
        <label class="field"><span>${esc(t('comp.level'))}</span><select name="level">${opts([['0', t('comp.cantrip')], ...Array.from({ length: 9 }, (_, k) => [k + 1, String(k + 1)])], e.level ?? 1)}</select></label>
        <label class="field"><span>${esc(t('comp.school'))}</span><select name="school">${opts(D.SCHOOLS.map((s) => [s, s]), e.school || 'Evocation')}</select></label>
        ${input('castingTime', t('comp.castTime'), e.castingTime ?? 'Action', 'list="dl-ct" required')}
      </div>
      <datalist id="dl-ct">${['Action', 'Bonus Action', 'Reaction', '1 minute', '10 minutes', '1 hour'].map((x) => `<option value="${x}">`).join('')}</datalist>
      <fieldset class="field field-wide"><legend>${esc(t('entry.classes'))}</legend>
        <div class="checks">${D.CLASSES.map((c) => check(`class:${c}`, c, (e.classes || []).includes(c))).join('')}</div>
      </fieldset>
      <div class="checks">${check('concentration', t('comp.conc'), e.concentration)}${check('ritual', t('comp.ritual'), e.ritual)}</div>
      <div class="field-row">
        ${input('range', t('entry.range'), e.range, 'placeholder="60 feet"')}
        ${input('components', t('entry.components'), e.components, 'placeholder="V, S, M (a feather)"')}
        ${input('duration', t('entry.duration'), e.duration, 'placeholder="up to 1 minute"')}
      </div>
      ${area('text', t('entry.spellText'), e.text, 10, 'required')}
      ${area('higher', t('entry.higher'), e.higher, 3)}
      <p class="hint">${esc(t('entry.formatHint'))}</p>`;
  }
  const cats = [...new Set([D.HOUSE_RULES, ...D.list('rule').map((r) => r.cat)])];
  return `
    ${input('name', t('entry.name'), e.name, req)}
    ${input('category', t('comp.category'), e.category ?? D.HOUSE_RULES, 'list="dl-cats"')}
    <datalist id="dl-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    ${area('text', t('entry.ruleText'), e.text, 14, 'required')}
    <p class="hint">${esc(t('entry.formatHint'))}</p>`;
}

function openEntryForm(kind, entry) {
  const e = entry || { kind };
  editing = { kind, id: entry?.id || null };
  const title = entry?.id ? t('entry.editTitle', { name: entry.name }) : t(`entry.new.${kind}`);
  els.entryBody.innerHTML = `
    <header class="dialog-head">
      <h2 id="dlg-entry-title">${esc(title)}</h2>
      <button class="btn btn-icon" type="button" data-close aria-label="${esc(t('common.close'))}">${icon('close')}</button>
    </header>
    ${entryFields(kind, e)}
    <footer class="dialog-foot">
      <button class="btn" type="button" data-close>${esc(t('common.cancel'))}</button>
      <button class="btn btn-primary" type="submit">${icon('save')}<span>${esc(t('entry.save'))}</span></button>
    </footer>`;
  openDialog(els.dlgEntry);
  els.entryBody.querySelector('[name=name]').focus();
}

function wireEntryForm() {
  els.entryBody.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = els.entryBody;
    const data = { kind: editing.kind, id: editing.id || undefined };
    const classes = [];
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.name.startsWith('class:')) { if (el.checked) classes.push(el.name.slice(6)); continue; }
      data[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    }
    if (editing.kind === 'spell') data.classes = classes;
    if (editing.kind === 'monster') data.cr = Number(data.cr);
    try {
      const saved = await D.saveHomebrew(data);
      closeDialog(els.dlgEntry);
      if (ui.kind !== editing.kind) {
        ui.kind = editing.kind;
        await onShow();
      }
      ui.selected[ui.kind] = saved.id;
      renderList();
      renderDetail();
      els.list.querySelector(`[data-id="${CSS.escape(saved.id)}"]`)?.scrollIntoView({ block: 'nearest' });
      toast(t('comp.saved'), { duration: 2500 });
    } catch (err) {
      toast(t('msg.saveError', { msg: err.message }), { kind: 'error', duration: 0 });
    }
  });
}
