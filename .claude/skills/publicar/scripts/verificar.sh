#!/usr/bin/env bash
# Revisa la app antes de publicar. No cambia nada. Sale con error si encuentra problemas.
set -u
cd "$(git rev-parse --show-toplevel)"
fallos=0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "== Sintaxis de JavaScript =="
for f in js/*.js js/i18n/*.js sw.js; do
  # Los módulos ES se revisan como .mjs para que Node acepte import/export.
  cp "$f" "$tmp/check.mjs"
  if ! salida="$(node --check "$tmp/check.mjs" 2>&1)"; then
    echo "ERROR en $f:"; echo "$salida" | head -5; fallos=1
  fi
done
[ "$fallos" = 0 ] && echo "ok"

echo "== Archivos en la caché sin internet (FILES de sw.js) =="
python3 - <<'PY' || fallos=1
import os, re, sys
src = open('sw.js', encoding='utf-8').read()
listed = set(re.findall(r"'\./([^']*)'", src.split('const FILES = [')[1].split('];')[0]))
listed.discard('')
on_disk = set()
for folder in ('js', 'css', 'data', 'fonts', 'icons'):
    for root, _, files in os.walk(folder):
        for name in files:
            if name.endswith(('.txt', '.md')):  # licencias y notas: no hacen falta sin internet
                continue
            on_disk.add(os.path.join(root, name).replace(os.sep, '/'))
on_disk |= {'index.html', 'manifest.webmanifest'}
missing = sorted(on_disk - listed)
gone = sorted(p for p in listed if not os.path.exists(p))
for p in missing: print(f"FALTA en FILES: ./{p}")
for p in gone: print(f"En FILES pero no existe: ./{p}")
if missing or gone: sys.exit(1)
print("ok")
PY

claves=".claude/skills/agregar-traducciones/scripts/verificar_claves.py"
if [ -f "$claves" ]; then
  echo "== Traducciones =="
  python3 "$claves" || fallos=1
fi

if [ "$fallos" = 0 ]; then echo "TODO BIEN: se puede publicar."; else echo "HAY PROBLEMAS: arréglalos antes de publicar."; fi
exit "$fallos"
