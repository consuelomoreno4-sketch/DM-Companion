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
const BULLET = /^([ \t]*)(?:(?:[-*+]|\d+[.)])\s+|[•·▪◦‣○●■□☐☑☒✓✔]\s*)(.*)$/;

function parseDate(text) {
  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return { date: `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`, raw: iso[0] };
  const dmy = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return { date: `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`, raw: dmy[0] };
  }
  return { date: '', raw: '' };
}

// "Sesión 12 — 03/05/2025: La emboscada" → { number: 12, date: '2025-05-03', title: 'La emboscada' }
function parseHeading(text) {
  const { date, raw } = parseDate(text);
  let rest = raw ? text.replace(raw, ' ') : text;
  let number = null;
  const m = rest.match(/(?:sesi[oó]n|session|sitzung)\s*(?:n[º°o]?\.?\s*)?#?\s*(\d+)/i) || rest.match(/^\s*#?(\d+)\b/);
  if (m) {
    number = Number(m[1]);
    rest = rest.replace(m[0], ' ');
  }
  rest = rest.replace(SESSION_WORD, ' ');
  const title = rest.replace(/^[\s\-–—:|·,.()]+|[\s\-–—:|·,()]+$/g, '').replace(/\s{2,}/g, ' ');
  return { number, date, title };
}

export function parseNotes(text) {
  const lines = String(text || '').replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
  const indents = lines.map((l) => l.match(BULLET)?.[1].length).filter((n) => n > 0);
  const unit = indents.length ? Math.min(...indents) : 2;
  const sessions = [];
  let current = null;
  const ensure = () => {
    if (!current) {
      current = { number: null, date: '', title: '', notes: [] };
      sessions.push(current);
    }
    return current;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const h = line.trim().match(HEADING);
    if (h || SESSION_WORD.test(line.trim())) {
      current = { ...parseHeading(h ? h[1] : line.trim()), notes: [] };
      sessions.push(current);
      continue;
    }
    const b = line.match(BULLET);
    const s = ensure();
    const indent = b ? b[1].length : line.match(/^\s*/)[0].length;
    const prev = s.notes.at(-1);
    const depth = Math.min(C.MAX_DEPTH, Math.round(indent / unit), prev ? prev.depth + 1 : 0);
    s.notes.push({ text: (b ? b[2] : line).trim(), depth });
  }
  return sessions.filter((s) => s.notes.length || s.title);
}

export function importSessions(parsed) {
  let next = Math.max(0, ...C.list('sessions').map((s) => Number(s.number) || 0));
  const created = [];
  for (const p of parsed) {
    const number = p.number ?? next + 1;
    next = Math.max(next, number);
    created.push(C.create('sessions', {
      number,
      date: p.date || '',
      title: p.title || '',
      summary: '',
      notes: (p.notes.length ? p.notes : [{ text: '', depth: 0 }]).map((n) => ({ id: C.newId('n'), text: n.text, depth: n.depth })),
    }));
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
    if (/heading|t[ií]tulo|title|berschrift/i.test(style)) lines.push(`# ${text}`);
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
      <summary>${icon('book')}<span>${esc(t('imp.samsungTitle'))}</span></summary>
      <ol class="imp-steps">${t('imp.samsungSteps').split('\n').map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    </details>
    <label class="field"><span>${esc(t('imp.paste'))}</span><textarea data-imp-text rows="12" spellcheck="false"></textarea></label>
    <div class="map-actions">
      <label class="btn">${icon('upload')}<span>${esc(t('imp.file'))}</span><input type="file" multiple accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-imp-file hidden></label>
    </div>
    <p class="imp-preview" data-imp-preview aria-live="polite"></p>
    <footer class="dialog-foot">
      <button class="btn" type="button" data-close>${esc(t('common.cancel'))}</button>
      <button class="btn btn-primary" type="button" data-imp-go disabled>${icon('download')}<span>${esc(t('imp.go'))}</span></button>
    </footer>`;
  const area = body.querySelector('[data-imp-text]');
  const preview = body.querySelector('[data-imp-preview]');
  const go = body.querySelector('[data-imp-go]');
  let parsed = [];
  const update = () => {
    parsed = parseNotes(area.value);
    const points = parsed.reduce((n, s) => n + s.notes.length, 0);
    preview.textContent = parsed.length ? `${tn('imp.sessionsFound', parsed.length)} · ${tn('imp.pointsFound', points)}` : '';
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
    const created = importSessions(parsed);
    closeDialog(dlg);
    toast(t('imp.done', { n: created.length }), { duration: 5000, group: 'import' });
    onDone?.(created);
  });
  openDialog(dlg);
  area.focus();
}
