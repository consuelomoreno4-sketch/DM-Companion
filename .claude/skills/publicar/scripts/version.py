#!/usr/bin/env python3
"""Sube la versión y anota el cambio.

Uso: python3 version.py <patch|minor|major|X.Y.Z> "Nota del cambio en español."
- sw.js:     const VERSION = 'X.Y.Z'
- SPEC.md:   agrega "- **X.Y.Z** — nota" al final de "## Historial de cambios"
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

# SPEC.md: la entrada nueva va después de la última entrada (incluidas sus líneas de continuación).
spec = read('SPEC.md').split('\n')
try:
    start = spec.index('## Historial de cambios')
except ValueError:
    sys.exit('No encontré "## Historial de cambios" en SPEC.md')
end = start + 1
while end < len(spec) and not spec[end].startswith('## '):
    end += 1
last = max((i for i in range(start, end) if spec[i].startswith('- **') or spec[i].startswith('  ')), default=start)
spec.insert(last + 1, f'- **{new}** — {note}')
write('SPEC.md', '\n'.join(spec))

readme = read('README.md')
readme, n = re.subn(r'(\*\*Estado:\*\*.*?versión )\d+(?:\.\d+){0,2}\.', lambda r: f'{r.group(1)}{new}.', readme, count=1)
if not n:
    print('Aviso: no encontré "versión X.Y.Z." en la línea **Estado** de README.md (no se cambió).')
write('README.md', readme)

print(f'Versión {old} → {new}. SPEC.md y README.md actualizados.')
