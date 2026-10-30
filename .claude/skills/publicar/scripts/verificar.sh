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

echo "== Archivos que carga la app, en la caché sin internet (FILES de sw.js) =="
python3 .claude/skills/publicar/scripts/archivos_app.py || fallos=1

claves=".claude/skills/agregar-traducciones/scripts/verificar_claves.py"
if [ -f "$claves" ]; then
  echo "== Traducciones =="
  python3 "$claves" || fallos=1
fi

if [ "$fallos" = 0 ]; then echo "TODO BIEN: se puede publicar."; else echo "HAY PROBLEMAS: arréglalos antes de publicar."; fi
exit "$fallos"
