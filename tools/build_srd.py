#!/usr/bin/env python3
"""Genera los archivos de data/ a partir del SRD 5.2.1 (CC-BY-4.0).

No hace falta para usar la app: solo sirve para regenerar los datos si cambian las fuentes.

Fuentes (descárgalas antes):
  - Markdown del SRD 5.2.1: https://github.com/downfallx/dnd-5e-srd-markdown (CC-BY-4.0)
  - Datos estructurados:     https://github.com/5e-bits/5e-database (MIT), carpeta src/2024/en

Uso:
  python3 tools/build_srd.py --md RUTA/dnd-5e-srd-markdown --db RUTA/5e-database/src/2024/en

Salida:
  data/monsters.json       índice para sugerencias y listas (id, nombre, tipo, CR, HP, AC, iniciativa)
  data/monsters-full.json  bloque de estadísticas de cada monstruo en HTML
  data/spells.json         hechizos con campos para filtrar + texto en HTML
  data/rules.json          reglas (glosario, capítulos de juego, lanzamiento de hechizos, herramientas)
"""

import argparse
import html
import json
import re
from pathlib import Path

# ---------------------------------------------------------------- Markdown → HTML

ALLOWED_TABLE_TAGS = {'table', 'thead', 'tbody', 'tr', 'td', 'th'}


def inline(text):
    """Escapa el texto y convierte **negrita**, _cursiva_ y *cursiva*. Respeta <br> y &emsp;."""
    text = html.escape(text, quote=False)
    text = re.sub(r'&lt;br\s*/?&gt;', '<br>', text)
    text = text.replace('&amp;emsp;', '&emsp;').replace('&amp;nbsp;', '&nbsp;')
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])', r'<em>\1</em>', text)
    text = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', text)
    return text


def clean_table(block):
    """Deja solo etiquetas de tabla (sin atributos salvo colspan/rowspan) y convierte el texto de las celdas."""
    out = []
    for part in re.split(r'(<[^>]+>)', block):
        if not part:
            continue
        m = re.match(r'<\s*(/?)\s*([a-zA-Z]+)([^>]*)>', part)
        if m:
            closing, tag, attrs = m.group(1), m.group(2).lower(), m.group(3)
            if tag not in ALLOWED_TABLE_TAGS:
                continue
            keep = ''.join(f' {k}="{v}"' for k, v in re.findall(r'(colspan|rowspan)="(\d+)"', attrs))
            out.append(f'<{closing}{tag}{keep if not closing else ""}>')
        else:
            text = part.strip()
            if text:
                out.append(inline(text))
    return ''.join(out)


def md_to_html(md, base_level=1):
    """Convierte el Markdown del SRD. base_level: el nivel de título que pasa a ser <h3>."""
    lines = md.split('\n')
    out = []
    para = []
    i = 0

    def flush():
        if para:
            out.append(f'<p>{inline(" ".join(p.strip() for p in para))}</p>')
            para.clear()

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            flush()
            i += 1
            continue
        m = re.match(r'^(#{1,6})\s+(.*)$', stripped)
        if m:
            flush()
            level = min(6, max(3, len(m.group(1)) - base_level + 3))
            out.append(f'<h{level}>{inline(m.group(2))}</h{level}>')
            i += 1
            continue
        if stripped.startswith('<table'):
            flush()
            block = []
            while i < len(lines):
                block.append(lines[i])
                if '</table>' in lines[i]:
                    break
                i += 1
            out.append(f'<div class="table-wrap">{clean_table(chr(10).join(block))}</div>')
            i += 1
            continue
        if re.match(r'^<hr\s*/?>$', stripped):
            flush()
            out.append('<hr>')
            i += 1
            continue
        if stripped.startswith('>'):
            flush()
            quote = []
            while i < len(lines) and lines[i].strip().startswith('>'):
                quote.append(lines[i].strip()[1:].strip())
                i += 1
            out.append(f'<aside>{md_to_html(chr(10).join(quote), base_level)}</aside>')
            continue
        if re.match(r'^[-*]\s+', stripped):
            flush()
            items = []
            while i < len(lines) and re.match(r'^\s*[-*]\s+', lines[i]):
                items.append(re.sub(r'^\s*[-*]\s+', '', lines[i]))
                i += 1
            out.append('<ul>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ul>')
            continue
        para.append(line)
        i += 1
    flush()
    return '\n'.join(out)


def slug(name):
    s = name.lower().replace('’', '').replace("'", '')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def headings(md):
    """Lista de (posición, nivel, texto) de los títulos Markdown."""
    return [(m.start(), len(m.group(1)), m.group(2).strip()) for m in re.finditer(r'^(#{1,6})\s+(.+)$', md, re.M)]


def sections(md, level):
    """Divide en secciones por títulos de un nivel: [(título, texto sin el título)]."""
    hs = [h for h in headings(md) if h[1] <= level]
    result = []
    for k, (pos, lvl, title) in enumerate(hs):
        if lvl != level:
            continue
        end = hs[k + 1][0] if k + 1 < len(hs) else len(md)
        body = md[pos:end].split('\n', 1)[1] if '\n' in md[pos:end] else ''
        result.append((title, body))
    return result

# ---------------------------------------------------------------- Monstruos


def cr_value(text):
    text = text.strip()
    if '/' in text:
        a, b = text.split('/')
        return int(a) / int(b)
    return int(text)


SIZES = {'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'or'}


def base_type(kind):
    """"Small Fey (Goblinoid)" → "Fey"; "Large Swarm of Tiny Beasts" → "Beast"."""
    words = [w for w in kind.split('(')[0].split() if w not in SIZES]
    if words[:1] == ['Swarm'] and 'of' in words:
        words = words[-1:]
    t = words[0] if words else ''
    return {'Beasts': 'Beast', 'Monstrosities': 'Monstrosity'}.get(t, t)


def build_monsters(md_dir):
    index, full = [], {}
    for fname in ('monsters-A-Z.md', 'animals.md'):
        md = (md_dir / fname).read_text(encoding='utf-8')
        hs = headings(md)
        for m in re.finditer(r'^\*\*AC\*\*', md, re.M):
            # El título del monstruo es el último antes de la línea de AC.
            k = max(j for j, h in enumerate(hs) if h[0] < m.start())
            pos, level, name = hs[k]
            end = next((h[0] for h in hs[k + 1:] if h[1] <= level), len(md))
            block = md[pos:end].split('\n', 1)[1]
            sub = re.search(r'^_(.+)_\s*$', block, re.M)
            subtitle = sub.group(1) if sub else ''
            kind = subtitle.rsplit(',', 1)[0].strip()
            ac = int(re.search(r'\*\*AC\*\*\s*(\d+)', block).group(1))
            hp = int(re.search(r'\*\*HP\*\*\s*(\d+)', block).group(1))
            cr = re.search(r'\*\*CR\*\*\s*([\d/]+)', block)
            init = re.search(r'\*\*Initiative\*\*\s*([+−-]\s*\d+)', block)
            if init:
                init_bonus = int(init.group(1).replace('−', '-').replace(' ', ''))
            else:
                # Sin iniciativa en el texto: se usa el modificador de Destreza de la tabla.
                dex = re.search(r'<td>\s*Dex\s*</td>\s*<td>\s*\d+\s*</td>\s*<td>\s*([+−-]\d+)', block, re.I)
                init_bonus = int(dex.group(1).replace('−', '-')) if dex else 0
            mid = slug(name)
            if mid in full:  # nombre repetido (no debería pasar)
                continue
            body = md_to_html(block, base_level=level + 1)
            full[mid] = f'<p class="sb-sub"><em>{html.escape(subtitle)}</em></p>\n{body.split(chr(10), 1)[1] if body.startswith("<p><em>") else body}'
            index.append({
                'i': mid, 'n': name, 's': kind, 't': base_type(kind),
                'cr': cr_value(cr.group(1)) if cr else 0,
                'hp': hp, 'ac': ac, 'init': init_bonus,
            })
    index.sort(key=lambda x: x['n'])
    return index, full

# ---------------------------------------------------------------- Hechizos


def casting_kind(ct):
    if ct.startswith('Bonus Action'):
        return 'bonus'
    if ct.startswith('Reaction'):
        return 'reaction'
    if ct.startswith('Action'):
        return 'action'
    return 'long'


def build_spells(md_dir, db_dir):
    md = (md_dir / 'spells.md').read_text(encoding='utf-8')
    data = json.loads((db_dir / '5e-SRD-Spells.json').read_text(encoding='utf-8'))
    names = {s['name'] for s in data}
    hs = headings(md)
    bodies = {}
    for k, (pos, level, title) in enumerate(hs):
        if title not in names or level != 4:
            continue
        end = next((h[0] for h in hs[k + 1:] if h[2] in names and h[1] == 4), len(md))
        block = md[pos:end].split('\n', 1)[1]
        # El texto empieza después de la línea **Duration:**
        dur = re.search(r'^\*\*Duration:\*\*.*$', block, re.M)
        text = block[dur.end():] if dur else block
        bodies[title] = md_to_html(text, base_level=4)
    out = []
    for s in data:
        comps = ', '.join(s.get('components', []))
        if s.get('material'):
            comps += f' ({s["material"]})'
        duration = s.get('duration', '')
        if s.get('concentration'):
            duration = f'Concentration, {duration}'
        html_body = bodies.get(s['name'])
        if not html_body:
            paras = [p.strip() for p in s.get('description', '').split('\n') if p.strip()]
            html_body = ''.join(f'<p>{html.escape(p)}</p>' for p in paras)
            if s.get('higher_level'):
                html_body += f'<p><em>Using a Higher-Level Spell Slot.</em> {html.escape(s["higher_level"])}</p>'
        out.append({
            'i': s['index'], 'n': s['name'], 'lvl': s['level'],
            'school': s['school']['name'],
            'classes': [c['name'] for c in s.get('classes', [])],
            'ct': s['casting_time'], 'ctk': casting_kind(s['casting_time']),
            'ritual': bool(s.get('ritual')), 'conc': bool(s.get('concentration')),
            'range': s.get('range', ''), 'comp': comps, 'dur': duration,
            'html': html_body,
        })
    out.sort(key=lambda x: x['n'])
    return out

# ---------------------------------------------------------------- Reglas


def build_rules(md_dir):
    rules = []

    def add(title, body, cat, level):
        tag = None
        m = re.match(r'^(.*?)\s*\[(.+)\]$', title)
        if m:
            title, tag = m.group(1), m.group(2)
        rules.append({'i': f'{slug(cat)}--{slug(title)}', 'n': title, 'tag': tag, 'cat': cat,
                      'html': md_to_html(body.strip(), base_level=level + 1)})

    glossary = (md_dir / 'rules-glossary.md').read_text(encoding='utf-8')
    for title, body in sections(glossary, 2):
        if title == 'Glossary Conventions':
            add(title, body, 'Rules Glossary', 2)
    defs = glossary[glossary.index('## Rules Definitions'):]
    for title, body in sections(defs, 4):
        add(title, body, 'Rules Glossary', 4)

    for fname, cat in (('playing-the-game.md', 'Playing the Game'), ('gameplay-toolbox.md', 'Gameplay Toolbox'),
                       ('monsters.md', 'Monsters')):
        md = (md_dir / fname).read_text(encoding='utf-8')
        for title, body in sections(md, 2):
            add(title, body, cat, 2)

    spells = (md_dir / 'spells.md').read_text(encoding='utf-8')
    intro = spells[:spells.index('## Spell Descriptions')]
    for title, body in sections(intro, 2):
        add(title, body, 'Spellcasting', 2)
    return rules

# ---------------------------------------------------------------- Principal


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--md', required=True, type=Path)
    ap.add_argument('--db', required=True, type=Path)
    ap.add_argument('--out', default=Path(__file__).resolve().parent.parent / 'data', type=Path)
    args = ap.parse_args()
    args.out.mkdir(exist_ok=True)

    def write(name, obj):
        path = args.out / name
        path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(f'{name}: {path.stat().st_size // 1024} KB')

    index, full = build_monsters(args.md)
    write('monsters.json', index)
    write('monsters-full.json', full)
    spells = build_spells(args.md, args.db)
    write('spells.json', spells)
    rules = build_rules(args.md)
    write('rules.json', rules)
    print(f'{len(index)} monstruos, {len(spells)} hechizos, {len(rules)} reglas')


if __name__ == '__main__':
    main()
