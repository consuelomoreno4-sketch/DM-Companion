// Importar a la Campaña:
// - Paquetes de aventura (data/packs/*.json): fichas de personajes, lugares y facciones con sus enlaces.
// - Notas de sesión escritas en otro lado: pegadas, o desde archivos .txt / .md / .docx (por ejemplo,
//   exportados desde Samsung Notes con "Guardar como archivo").

import * as C from './campaign-data.js';
import { normalize } from './monsters.js';
import { esc, icon, toast, openDialog, closeDialog, wireDialog } from './ui.js';
import { t, tn, getLang } from './i18n.js';

export const PACKS = [{ id: 'icespire', name: 'Dragon of Icespire Peak', file: 'data/packs/icespire.json' }];

// ---------- Paquetes de aventura ----------

/**
 * Crea las fichas del paquete. Si ya existe una ficha con el mismo nombre, no la duplica:
 * solo le añade los otros nombres, la posición en el mapa y los enlaces que falten.
 */
export async function importPack(id) {
  const meta = PACKS.find((p) => p.id === id);
  const res = await fetch(meta.file);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const pack = await res.json();
  await C.loadCampaign();
  const lang = getLang();
  const byName = new Map(C.list('codex').map((c) => [normalize(c.name || ''), c]));
  const ids = new Map();
  let created = 0;
  let merged = 0;
  for (const e of pack.entries) {
    const subtitle = e.subtitle?.[lang] || e.subtitle?.en || '';
    const pos = e.pos ? { x: e.pos[0], y: e.pos[1] } : null;
    const existing = byName.get(normalize(e.name));
    if (existing) {
      const patch = { aliases: [...new Set([...(existing.aliases || []), ...(e.aliases || [])])] };
      if (!existing.subtitle) patch.subtitle = subtitle;
      if (!existing.pos && pos) patch.pos = pos;
      C.update('codex', existing.id, patch, { debounce: false });
      ids.set(e.key, existing.id);
      merged += 1;
    } else {
      const c = C.create('codex', {
        kind: e.kind, name: e.name, aliases: e.aliases || [], subtitle, tags: [pack.tag],
        description: '', links: [], ...(pos ? { pos } : {}),
      });
      ids.set(e.key, c.id);
      created += 1;
    }
  }
  for (const e of pack.entries) {
    const id2 = ids.get(e.key);
    const c = C.get('codex', id2);
    const add = (e.links || []).map((k) => ids.get(k)).filter((x) => x && x !== id2);
    const links = [...new Set([...(c.links || []), ...add])];
    if (links.length !== (c.links || []).length) C.update('codex', id2, { links }, { debounce: false });
  }
  return { created, merged, name: pack.name };
}

export async function confirmAndImportPack(id, confirmDialog) {
  const meta = PACKS.find((p) => p.id === id);
  const ok = await confirmDialog(t('imp.packConfirm', { name: meta.name }), { yes: t('imp.packYes'), title: meta.name });
  if (!ok) return null;
  try {
    const r = await importPack(id);
    toast(t('imp.packDone', { name: r.name, created: r.created, merged: r.merged }), { duration: 6000, group: 'import' });
    return r;
  } catch (err) {
    toast(t('imp.packError', { msg: err.message }), { kind: 'error', duration: 0 });
    return null;
  }
}

// ---------- Notas de sesión escritas en otro lado ----------

const HEADING = /^(?:#{1,6}\s+)(.+)$/;
const SESSION_WORD = /^(?:sesi[oó]n|session|sitzung)\b/i;
// Viñetas: guiones, puntos, casillas de verificación (☐ ☑ de Samsung Notes) y listas numeradas.
const GLYPH_DEPTH = { '○': 1, '◦': 1, '■': 2, '▪': 2 };
const BULLET = /^([ \t]*)(?:(?:[-*+]|\d+[.)])\s+|[•·▪◦‣○●■□☐☑☒✓✔]\s*)(.*)$/;

// Meses en español, inglés y alemán (completos y abreviados) → número de mes.
const MONTH_NAMES = {
  enero: 1, ene: 1, january: 1, jan: 1, januar: 1, janner: 1, jaen: 1,
  febrero: 2, feb: 2, february: 2, februar: 2,
  marzo: 3, mar: 3, march: 3, marz: 3, maerz: 3,
  abril: 4, abr: 4, april: 4, apr: 4,
  mayo: 5, may: 5, mai: 5,
  junio: 6, jun: 6, june: 6, juni: 6,
  julio: 7, jul: 7, july: 7, juli: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, set: 9, september: 9,
  octubre: 10, oct: 10, october: 10, oktober: 10, okt: 10,
  noviembre: 11, nov: 11, november: 11,
  diciembre: 12, dic: 12, december: 12, dec: 12, dezember: 12, dez: 12,
};
const MONTH_RE = Object.keys(MONTH_NAMES).sort((a, b) => b.length - a.length).join('|');
const WEEKDAYS = /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|lun|mar|mi[eé]|jue|vie|s[aá]b|dom|mon|tue|wed|thu|fri|sat|sun)\b\.?,?/gi;
const WEEKDAYS_FULL = /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b,?/gi;
const pad = (n) => String(n).padStart(2, '0');
const fullYear = (y) => (y == null ? null : y < 100 ? 2000 + y : y);
const validDate = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31;

/**
 * Busca una fecha en el texto. Entiende: 2025-05-03, 2025/5/3, 3/5/2025, 3.5.25, 3 / 5 / 2025, 3/5 (sin año),
 * "3 de mayo de 2025", "3 mayo", "3. Mai 2025", "May 3, 2025", "sábado 3 de mayo"…
 * defaultYear se usa cuando la fecha no trae año. Devuelve { date: 'AAAA-MM-DD' | '', raw }.
 */
export function parseDate(text, defaultYear = null) {
  const plain = text.normalize('NFD').replace(/[̀-ͯ]/g, ''); // misma longitud que text en la práctica
  const found = (y, m, d, raw) => {
    const year = fullYear(y) ?? defaultYear;
    if (!year || !validDate(year, m, d)) return null;
    return { date: `${year}-${pad(m)}-${pad(d)}`, raw };
  };
  let r;
  // Año primero: 2025-05-03, 2025/5/3, 2025.05.03
  if ((r = plain.match(/\b(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b/))) {
    const f = found(Number(r[1]), Number(r[2]), Number(r[3]), r[0]);
    if (f) return f;
  }
  // Día y nombre de mes: "3 de mayo de 2025", "3 mayo 2025", "3. Mai", "3rd of May 2025"
  const dm = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|°|º)?\\.?\\s*(?:de\\s+|of\\s+)?(${MONTH_RE})\\b\\.?(?:,?\\s*(?:de(?:l)?\\s+)?(\\d{4}|'\\d{2}))?`, 'i');
  if ((r = plain.match(dm))) {
    const f = found(r[3] ? Number(r[3].replace("'", '')) : null, MONTH_NAMES[r[2].toLowerCase()], Number(r[1]), r[0]);
    if (f) return f;
  }
  // Mes y día: "May 3, 2025", "mayo 3 2025"
  const md = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, 'i');
  if ((r = plain.match(md))) {
    const f = found(r[3] ? Number(r[3]) : null, MONTH_NAMES[r[1].toLowerCase()], Number(r[2]), r[0]);
    if (f) return f;
  }
  // Números: 3/5/2025, 3.5.25, 3 - 5 - 2025 (día primero; si el segundo número pasa de 12, es mes/día).
  // Sin año solo con "/" o "." y sin espacios (3/5), para no confundir "Sesión 12 - 5" con una fecha.
  if ((r = plain.match(/\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})\b/)) || (defaultYear && (r = plain.match(/\b(\d{1,2})[/.](\d{1,2})\b(?![/.]\d)/)))) {
    let d = Number(r[1]);
    let m = Number(r[2]);
    if (m > 12 && d <= 12) [d, m] = [m, d];
    const f = found(r[3] ? Number(r[3]) : null, m, d, r[0]);
    if (f) return f;
  }
  return { date: '', raw: '' };
}

// ¿La línea es solo una fecha (con o sin día de la semana)? Entonces marca el comienzo de una sesión.
function dateOnly(line, defaultYear) {
  const { date, raw } = parseDate(line, defaultYear);
  if (!date) return null;
  const plain = line.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const rest = plain.replace(raw, ' ').replace(WEEKDAYS, ' ').replace(/\b(fecha|date|datum)\b/gi, ' ').replace(/[\s\-–—:|·,.()#*_]+/g, '');
  return rest ? null : date;
}

// "Sesión 12 — 03/05/2025: La emboscada" → { number: 12, date: '2025-05-03', title: 'La emboscada' }
function parseHeading(text, defaultYear) {
  // Primero el número de sesión (así "Sesión 12 - 5 de mayo" no se lee como la fecha 12/5).
  let rest = text;
  let number = null;
  const m = rest.match(/(?:sesi[oó]n|session|sitzung)\s*(?:n[º°o]?\.?\s*)?#?\s*(\d+)/i) || rest.match(/^\s*#?(\d+)\b(?!\s*[/.-]\s*\d)(?!\s*(?:de\s+)?[a-zA-Z]{3})/);
  if (m) {
    number = Number(m[1]);
    rest = rest.replace(m[0], ' ');
  }
  const { date, raw } = parseDate(rest, defaultYear);
  if (raw) rest = removeLoose(rest, raw).replace(WEEKDAYS_FULL, ' ');
  rest = rest.replace(SESSION_WORD, ' ');
  const title = rest.replace(/^[\s\-–—:|·,.()]+|[\s\-–—:|·,()]+$/g, '').replace(/\s{2,}/g, ' ');
  return { number, date, title };
}

// Quita del texto original el trozo que coincidió en la versión sin tildes (misma posición).
function removeLoose(text, raw) {
  const plain = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const i = plain.indexOf(raw);
  return i === -1 ? text : `${text.slice(0, i)} ${text.slice(i + raw.length)}`;
}

export function parseNotes(text) {
  const lines = String(text || '').replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
  const indents = lines.map((l) => l.match(BULLET)?.[1].length).filter((n) => n > 0);
  const unit = indents.length ? Math.min(...indents) : 2;
  const sessions = [];
  let current = null;
  let lastYear = null; // para fechas sin año ("3 de mayo")
  const ensure = () => {
    if (!current) {
      current = { number: null, date: '', title: '', notes: [] };
      sessions.push(current);
    }
    return current;
  };
  const start = (fields) => {
    current = { number: null, date: '', title: '', ...fields, notes: [] };
    if (current.date) lastYear = Number(current.date.slice(0, 4));
    sessions.push(current);
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;
    const h = trimmed.match(HEADING);
    if (h || SESSION_WORD.test(trimmed)) {
      start(parseHeading(h ? h[1] : trimmed, lastYear));
      continue;
    }
    const b = line.match(BULLET);
    if (!b) {
      // Una línea que es solo una fecha: fecha de la sesión recién empezada, o comienzo de una nueva.
      const onlyDate = dateOnly(trimmed, lastYear);
      if (onlyDate) {
        if (current && !current.date && !current.notes.length) { current.date = onlyDate; lastYear = Number(onlyDate.slice(0, 4)); }
        else start({ date: onlyDate });
        continue;
      }
    }
    const s = ensure();
    const indent = b ? b[1].length : line.match(/^\s*/)[0].length;
    const prev = s.notes.at(-1);
    // Al copiar y pegar desde Google Docs no hay sangría: el nivel lo da el símbolo (● → ○ → ■).
    const glyph = indent === 0 && b ? GLYPH_DEPTH[trimmed[0]] ?? 0 : 0;
    const depth = Math.min(C.MAX_DEPTH, Math.max(Math.round(indent / unit), glyph), prev ? prev.depth + 1 : 0);
    s.notes.push({ text: (b ? b[2] : line).trim(), depth });
  }
  return sessions.filter((x) => x.notes.length || x.title);
}

/**
 * Crea las sesiones. Con replaceSameNumber, una sesión importada con el mismo número que una existente
 * la actualiza (fecha, título y notas) en vez de duplicarla: sirve para volver a importar tras corregir.
 */
export function importSessions(parsed, { replaceSameNumber = false } = {}) {
  let next = Math.max(0, ...C.list('sessions').map((s) => Number(s.number) || 0));
  const created = [];
  for (const p of parsed) {
    const number = p.number ?? next + 1;
    next = Math.max(next, number);
    const notes = (p.notes.length ? p.notes : [{ text: '', depth: 0 }]).map((n) => ({ id: C.newId('n'), text: n.text, depth: n.depth }));
    const existing = replaceSameNumber && p.number != null ? C.list('sessions').find((s) => Number(s.number) === number) : null;
    if (existing) {
      created.push(C.update('sessions', existing.id, { date: p.date || existing.date || '', title: p.title || existing.title || '', notes }, { debounce: false }));
    } else {
      created.push(C.create('sessions', { number, date: p.date || '', title: p.title || '', summary: '', notes }));
    }
  }
  return created;
}

// ---------- Archivos: .txt / .md / .docx ----------

// Lee un archivo de un .zip (un .docx es un .zip) usando solo lo que trae el navegador.
async function unzipEntry(buffer, wanted) {
  const dv = new DataView(buffer);
  const dec = new TextDecoder();
  let end = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error(t('imp.notDocx'));
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  for (let k = 0; k < count && dv.getUint32(p, true) === 0x02014b50; k++) {
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    if (dec.decode(new Uint8Array(buffer, p + 46, nameLen)) === wanted) {
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = new Uint8Array(buffer, start, size);
      if (method === 0) return dec.decode(data);
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).text();
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(t('imp.notDocx'));
}

// Word → texto con el formato que entiende parseNotes: títulos con "#", listas con "-" y sangría por nivel.
export function docxXmlToText(xml) {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const val = (el) => el?.getAttributeNS(W, 'val') ?? el?.getAttribute('w:val') ?? null;
  const lines = [];
  for (const p of doc.getElementsByTagNameNS(W, 'p')) {
    const text = [...p.getElementsByTagNameNS(W, 't')].map((x) => x.textContent).join('').trim();
    if (!text) continue;
    const style = val(p.getElementsByTagNameNS(W, 'pStyle')[0]) || '';
    const numbered = p.getElementsByTagNameNS(W, 'numPr').length > 0;
    const level = Number(val(p.getElementsByTagNameNS(W, 'ilvl')[0]) || 0);
    const ind = p.getElementsByTagNameNS(W, 'ind')[0];
    const left = Number(ind?.getAttributeNS(W, 'left') || ind?.getAttributeNS(W, 'start') || 0);
    // Google Docs: "Heading1"/"Title"; Infomaniak (OnlyOffice) en español puede guardar "Ttulo1".
    if (/heading|t[ií]?tulo|title|berschrift/i.test(style)) lines.push(`# ${text}`);
    else if (numbered) lines.push(`${'  '.repeat(level)}- ${text}`);
    else if (left >= 360) lines.push(`${'  '.repeat(Math.round(left / 720))}- ${text}`);
    else lines.push(text);
  }
  return lines.join('\n');
}

async function fileToText(file) {
  if (/\.docx$/i.test(file.name)) return docxXmlToText(await unzipEntry(await file.arrayBuffer(), 'word/document.xml'));
  return file.text();
}

// Varios archivos (por ejemplo, una nota por sesión): si uno no tiene un título de sesión,
// su nombre de archivo pasa a ser el título (y su fecha, si el nombre la lleva).
export async function filesToText(files) {
  const parts = [];
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
    const text = (await fileToText(file)).trim();
    const hasHeading = text.split('\n').some((l) => HEADING.test(l.trim()) || SESSION_WORD.test(l.trim()));
    parts.push(hasHeading ? text : `# ${file.name.replace(/\.[^.]+$/, '')}\n${text}`);
  }
  return parts.join('\n\n');
}

// ---------- Ventana "Importar notas" ----------

let wired = false;

export function openImportDialog(onDone) {
  const dlg = document.getElementById('dlg-import');
  const body = document.getElementById('import-body');
  if (!wired) { wireDialog(dlg); wired = true; }
  body.innerHTML = `
    <header class="dialog-head">
      <h2 id="dlg-import-title">${esc(t('imp.title'))}</h2>
      <button class="btn btn-icon" type="button" data-close aria-label="${esc(t('common.close'))}">${icon('close')}</button>
    </header>
    <p class="hint">${esc(t('imp.help'))}</p>
    <pre class="imp-example">${esc(t('imp.example'))}</pre>
    <details class="comp-filter-box imp-samsung">
      <summary>${icon('book')}<span>${esc(t('imp.docsTitle'))}</span></summary>
      <ol class="imp-steps">${t('imp.docsSteps').split('\n').map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    </details>
    <details class="comp-filter-box imp-samsung">
      <summary>${icon('book')}<span>${esc(t('imp.samsungTitle'))}</span></summary>
      <ol class="imp-steps">${t('imp.samsungSteps').split('\n').map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    </details>
    <label class="field"><span>${esc(t('imp.paste'))}</span><textarea data-imp-text rows="12" spellcheck="false"></textarea></label>
    <div class="map-actions">
      <label class="btn">${icon('upload')}<span>${esc(t('imp.file'))}</span><input type="file" multiple accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-imp-file hidden></label>
    </div>
    <p class="imp-preview" data-imp-preview aria-live="polite"></p>
    <ol class="imp-sessions" data-imp-list></ol>
    <label class="check"><input type="checkbox" data-imp-replace checked><span>${esc(t('imp.replace'))}</span></label>
    <footer class="dialog-foot">
      <button class="btn" type="button" data-close>${esc(t('common.cancel'))}</button>
      <button class="btn btn-primary" type="button" data-imp-go disabled>${icon('download')}<span>${esc(t('imp.go'))}</span></button>
    </footer>`;
  const area = body.querySelector('[data-imp-text]');
  const preview = body.querySelector('[data-imp-preview]');
  const go = body.querySelector('[data-imp-go]');
  let parsed = [];
  const list = body.querySelector('[data-imp-list]');
  const update = () => {
    parsed = parseNotes(area.value);
    const points = parsed.reduce((n, s) => n + s.notes.length, 0);
    const noDate = parsed.filter((s) => !s.date).length;
    preview.textContent = parsed.length
      ? `${tn('imp.sessionsFound', parsed.length)} · ${tn('imp.pointsFound', points)}${noDate ? ` · ${tn('imp.noDateCount', noDate)}` : ''}`
      : '';
    // Detalle de cada sesión para revisar fechas y títulos antes de importar.
    list.innerHTML = parsed.map((s) => `
      <li class="${s.date ? '' : 'imp-nodate'}">
        <span class="num">${s.number != null ? `#${s.number}` : '#?'}</span>
        <span class="num">${s.date ? esc(new Date(`${s.date}T12:00`).toLocaleDateString(getLang(), { day: 'numeric', month: 'short', year: 'numeric' })) : `⚠ ${esc(t('imp.noDate'))}`}</span>
        <span>${esc(s.title || '—')}</span>
        <span class="hint num">${esc(tn('imp.pointsFound', s.notes.length))}</span>
      </li>`).join('');
    go.disabled = !parsed.length;
  };
  area.addEventListener('input', update);
  body.querySelector('[data-imp-file]').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    try {
      area.value = await filesToText(files);
    } catch (err) {
      toast(t('imp.fileError', { msg: err.message }), { kind: 'error', duration: 0 });
      return;
    }
    update();
  });
  go.addEventListener('click', () => {
    const created = importSessions(parsed, { replaceSameNumber: body.querySelector('[data-imp-replace]').checked });
    closeDialog(dlg);
    toast(t('imp.done', { n: created.length }), { duration: 5000, group: 'import' });
    onDone?.(created);
  });
  openDialog(dlg);
  area.focus();
}
