#!/usr/bin/env python3
"""Comprueba que todo lo que la app carga esté en FILES de sw.js (si no, no funciona sin internet).

Busca lo que la app carga en: index.html (src/href), manifest.webmanifest (iconos), css (url(...)),
js (import, import() y rutas a data/, fonts/, icons/, css/). Además revisa que cada archivo de
js/, css/, data/, fonts/ e icons/ esté en FILES y que nada de FILES falte en el disco.
Sale con código 1 si hay problemas. No cambia nada.
"""
import json
import os
import posixpath
import re
import subprocess
import sys

root = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip()
os.chdir(root)


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def local(ref):
    return ref and not re.match(r'^(#|https?:|//|data:|mailto:|blob:)', ref)


sw = read('sw.js')
files = set(re.findall(r"'\./([^']*)'", sw.split('const FILES = [')[1].split('];')[0])) - {''}

loaded = {}  # ruta → dónde se carga


def add(path, where):
    path = posixpath.normpath(path.split('?')[0].split('#')[0])
    loaded.setdefault(path, where)


html = read('index.html')
for ref in re.findall(r'(?:src|href)="([^"]+)"', html):
    if local(ref):
        add(ref, 'index.html')
add('manifest.webmanifest', 'index.html')
for icon in json.loads(read('manifest.webmanifest')).get('icons', []):
    add(icon['src'], 'manifest.webmanifest')

for dirpath, _, names in os.walk('css'):
    for name in names:
        if name.endswith('.css'):
            path = posixpath.join(dirpath, name)
            for ref in re.findall(r'url\(\s*["\']?([^"\')]+)', read(path)):
                if local(ref):
                    add(posixpath.join(dirpath, ref), path)

for dirpath, _, names in os.walk('js'):
    for name in names:
        if not name.endswith('.js'):
            continue
        path = posixpath.join(dirpath, name)
        src = read(path)
        for ref in re.findall(r"""(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}/[^'"]+)['"]""", src):
            add(posixpath.join(dirpath, ref), path)
        # fetch('data/...'), file: 'data/packs/...': rutas relativas a la página.
        for ref in re.findall(r"""['"`](?:\./)?((?:data|fonts|icons|css)/[^'"`$]+\.\w+)['"`]""", src):
            add(ref, path)

problems = []
for path, where in sorted(loaded.items()):
    if not os.path.exists(path):
        problems.append(f'No existe: {path} (lo carga {where})')
    elif path not in files:
        problems.append(f'Falta en FILES: ./{path} (lo carga {where})')

on_disk = set()
for folder in ('js', 'css', 'data', 'fonts', 'icons'):
    for dirpath, _, names in os.walk(folder):
        for name in names:
            if not name.endswith(('.txt', '.md')):  # licencias y notas
                on_disk.add(posixpath.join(dirpath, name))
for path in sorted(on_disk - files - set(loaded)):
    problems.append(f'Falta en FILES (está en el disco): ./{path}')
for path in sorted(p for p in files if not os.path.exists(p)):
    problems.append(f'En FILES pero no existe: ./{path}')

for p in problems:
    print(p)
if problems:
    sys.exit(1)
print(f'ok ({len(loaded)} archivos que carga la app, todos en FILES)')
