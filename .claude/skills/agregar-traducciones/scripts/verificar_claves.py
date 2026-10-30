#!/usr/bin/env python3
"""Revisa los diccionarios de idiomas. No cambia nada; sale con 1 si hay problemas.

- en, es y de con exactamente las mismas claves, sin repetidas;
- los mismos {parámetros} en los tres idiomas;
- las claves usadas en el código con texto fijo existen.
"""
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from i18n_comun import LANGS, ROOT, entries, params, read_lines  # noqa: E402

problems = []
dicts = {}
for lang in LANGS:
    ents = entries(read_lines(lang))
    for key, n in Counter(k for _, k, _ in ents).items():
        if n > 1:
            problems.append(f'{lang}.js: "{key}" está repetida ({n} veces)')
    dicts[lang] = {k: v for _, k, v in ents}

base = dicts['en']
for lang in LANGS[1:]:
    for key in sorted(set(base) - set(dicts[lang])):
        problems.append(f'{lang}.js: falta "{key}"')
    for key in sorted(set(dicts[lang]) - set(base)):
        problems.append(f'en.js: falta "{key}" (está en {lang}.js)')

for key in sorted(base):
    ps = {l: params(dicts[l][key]) for l in LANGS if key in dicts[l]}
    if len({tuple(p) for p in ps.values()}) > 1:
        problems.append(f'"{key}": parámetros distintos {ps}')

# Claves usadas en el código (solo las de texto fijo).
used = {}
sources = [os.path.join(ROOT, 'index.html')]
for dirpath, _, names in os.walk(os.path.join(ROOT, 'js')):
    if os.path.basename(dirpath) == 'i18n':
        continue
    sources += [os.path.join(dirpath, n) for n in names if n.endswith('.js')]
for src in sources:
    # Sin las líneas de comentario (los ejemplos de documentación no son claves reales).
    text = re.sub(r'^\s*//.*$', '', open(src, encoding='utf-8').read(), flags=re.M)
    rel = os.path.relpath(src, ROOT)
    for kind, key in re.findall(r"""\b(t|tn)\(\s*['"]([\w.-]+)['"]""", text):
        used.setdefault((kind, key), rel)
    for key in re.findall(r'data-i18n(?:-[a-z]+)?="([\w.-]+)"', text):
        used.setdefault(('t', key), rel)
for (kind, key), where in sorted(used.items()):
    needed = [f'{key}.one', f'{key}.other'] if kind == 'tn' else [key]
    for k in needed:
        if k not in base:
            problems.append(f'Falta "{k}" (se usa en {where})')

for p in problems:
    print(p)
if problems:
    sys.exit(1)
print(f'ok ({len(base)} claves iguales en en, es y de; {len(used)} usadas en el código, todas existen)')
