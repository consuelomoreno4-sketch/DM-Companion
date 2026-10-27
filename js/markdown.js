// Formato sencillo para el texto de las entradas propias del Compendio:
//   **negrita**   _cursiva_ o *cursiva*   "### Título" inicia una sección   "- " hace una lista
//   Una línea en blanco separa párrafos; un salto de línea simple se respeta.

import { esc } from './ui.js';

function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g, '$1<em>$2</em>');
}

export function mdToHtml(text) {
  const out = [];
  for (const block of String(text || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    let para = [];
    let list = [];
    const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; };
    const flushList = () => { if (list.length) out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`); list = []; };
    for (const raw of lines) {
      const line = raw.trim();
      const h = line.match(/^#{1,6}\s+(.*)$/);
      const li = line.match(/^[-*]\s+(.*)$/);
      if (h) { flushPara(); flushList(); out.push(`<h3>${inline(h[1])}</h3>`); }
      else if (li) { flushPara(); list.push(li[1]); }
      else { flushList(); para.push(line); }
    }
    flushPara();
    flushList();
  }
  return out.join('\n');
}

// Lo contrario, aproximado: HTML del SRD → texto con el formato de arriba (para "Duplicar como propia").
export function htmlToMd(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const walkInline = (node) => [...node.childNodes].map((n) => {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent.replace(/\s+/g, ' ');
    const tag = n.nodeName.toLowerCase();
    const inner = walkInline(n);
    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return inner.trim() ? `**${inner.trim()}**` : '';
    if (tag === 'em' || tag === 'i') return inner.trim() ? `_${inner.trim()}_` : '';
    return inner;
  }).join('');
  const blocks = [];
  for (const el of doc.body.firstElementChild.children) {
    const tag = el.nodeName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) blocks.push(`### ${el.textContent.trim()}`);
    else if (tag === 'ul' || tag === 'ol') blocks.push([...el.querySelectorAll('li')].map((li) => `- ${walkInline(li).trim()}`).join('\n'));
    else if (tag === 'hr') continue;
    else if (el.querySelector('table') || tag === 'table') {
      blocks.push([...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim()).join(' | ')).join('\n'));
    } else {
      const text = walkInline(el).split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
      if (text) blocks.push(text.replace(/\*\*_(.+?)_\*\*/g, '**$1**'));
    }
  }
  return blocks.join('\n\n');
}
