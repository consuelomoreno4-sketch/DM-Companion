#!/usr/bin/env python3
"""Inserta claves de traducción en js/i18n/en.js, es.js y de.js a la vez.

Uso: python3 agregar_claves.py <archivo.json> [--reemplazar]
Formato del JSON: ver reference.md. Si algo no está bien, no cambia ningún archivo.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from i18n_comun import LANGS, entries, escape, params, path, read_lines  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith('--')]
replace = '--reemplazar' in sys.argv
if len(args) != 1:
    sys.exit(__doc__)
with open(args[0], encoding='utf-8') as f:
    data = json.load(f)

# 1. Pasar a una lista plana: clave final → {idioma: texto}
flat = {}
errors = []
for key, val in data.items():
    if not isinstance(val, dict) or set(val) != set(LANGS):
        errors.append(f'{key}: debe tener exactamente en, es y de')
        continue
    plural = [isinstance(val[l], dict) for l in LANGS]
    if all(plural):
        for form in ('one', 'other'):
            if any(set(val[l]) != {'one', 'other'} for l in LANGS):
                errors.append(f'{key}: el plural necesita "one" y "other" en los tres idiomas')
                break
            flat[f'{key}.{form}'] = {l: val[l][form] for l in LANGS}
    elif any(plural):
        errors.append(f'{key}: mezcla plural (one/other) y texto simple entre idiomas')
    else:
        flat[key] = {l: val[l] for l in LANGS}

for key, texts in flat.items():
    if any(not str(t).strip() for t in texts.values()):
        errors.append(f'{key}: hay un texto vacío')
    ps = {l: params(str(texts[l])) for l in LANGS}
    if len({tuple(p) for p in ps.values()}) > 1:
        errors.append(f'{key}: parámetros distintos entre idiomas {ps}')

files = {l: read_lines(l) for l in LANGS}
existing = {l: {k for _, k, _ in entries(files[l])} for l in LANGS}
for key in flat:
    present = [l for l in LANGS if key in existing[l]]
    if present and not replace:
        errors.append(f'{key}: ya existe (usa --reemplazar para cambiar el texto)')
    elif replace and present and len(present) < 3:
        errors.append(f'{key}: existe solo en {present}; arregla eso primero')

if errors:
    print('NO SE CAMBIÓ NADA:')
    for e in errors:
        print('  -', e)
    sys.exit(1)

# 2. Escribir: reemplazar en su lugar, o insertar tras la última clave con el mismo prefijo.
added, changed = [], []
for lang in LANGS:
    lines = files[lang]
    for key, texts in flat.items():
        new_line = f"  '{key}': '{escape(str(texts[lang]))}',"
        ents = entries(lines)
        same = [i for i, k, _ in ents if k == key]
        if same:
            lines[same[0]] = new_line
            if lang == 'en':
                changed.append(key)
            continue
        prefix = key.split('.')[0] + '.'
        group = [i for i, k, _ in ents if k.startswith(prefix)]
        if group:
            at = group[-1] + 1
        else:  # sin grupo: al final, antes de "};"
            at = max(i for i, l in enumerate(lines) if l.strip() == '};')
        lines.insert(at, new_line)
        if lang == 'en':
            added.append(key)
    with open(path(lang), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

print(f'Agregadas: {len(added)} · cambiadas: {len(changed)} (en en, es y de)')
for k in added:
    print('  +', k)
for k in changed:
    print('  ~', k)
