#!/usr/bin/env python3
"""Sube la versión y anota el cambio.

Uso: python3 version.py <patch|minor|major|X.Y.Z> "Nota del cambio en español."
- sw.js:     const VERSION = 'X.Y.Z'
- CHANGELOG.md: agrega "- **X.Y.Z** — nota" arriba de todo (lo más reciente primero)
- README.md: cambia "versión X.Y.Z." en la línea **Estado**
"""
import re
import subprocess
import sys

if len(sys.argv) != 3 or not sys.argv[2].strip():
    sys.exit(__doc__)
kind, note = sys.argv[1], sys.argv[2].strip()
root = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip()


def read(name):
    with open(f'{root}/{name}', encoding='utf-8') as f:
        return f.read()


def write(name, text):
    with open(f'{root}/{name}', 'w', encoding='utf-8') as f:
        f.write(text)


sw = read('sw.js')
m = re.search(r"const VERSION = '(\d+)\.(\d+)\.(\d+)';", sw)
if not m:
    sys.exit("No encontré const VERSION = 'X.Y.Z' en sw.js")
major, minor, patch = map(int, m.groups())
if kind == 'patch':
    new = f'{major}.{minor}.{patch + 1}'
elif kind == 'minor':
    new = f'{major}.{minor + 1}.0'
elif kind == 'major':
    new = f'{major + 1}.0.0'
elif re.fullmatch(r'\d+\.\d+\.\d+', kind):
    new = kind
else:
    sys.exit(f'Tipo de versión desconocido: {kind}\n{__doc__}')
old = '.'.join(m.groups())
write('sw.js', sw.replace(m.group(0), f"const VERSION = '{new}';", 1))

# CHANGELOG.md: la entrada nueva va arriba, antes de la primera versión.
log = read('CHANGELOG.md').split('\n')
first = next((i for i, line in enumerate(log) if line.startswith('- **')), None)
if first is None:
    sys.exit('No encontré ninguna versión ("- **X.Y.Z** — …") en CHANGELOG.md')
log.insert(first, f'- **{new}** — {note}')
write('CHANGELOG.md', '\n'.join(log))

readme = read('README.md')
readme, n = re.subn(r'(\*\*Estado:\*\*.*?versión )\d+(?:\.\d+){0,2}\.', lambda r: f'{r.group(1)}{new}.', readme, count=1)
if not n:
    print('Aviso: no encontré "versión X.Y.Z." en la línea **Estado** de README.md (no se cambió).')
write('README.md', readme)

print(f'Versión {old} → {new}. CHANGELOG.md y README.md actualizados.')
