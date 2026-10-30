#!/usr/bin/env bash
# ¿Cambió algo en data/packs/? (decide si la dueña debe volver a cargar el pack de aventura)
# Uso: cambio_pack.sh <desde> [hasta]   — sin "hasta", compara con los archivos actuales (sin commit).
cd "$(git rev-parse --show-toplevel)"
desde="$1"; hasta="${2:-}"
if [ -n "$hasta" ]; then cambios="$(git diff --name-only "$desde" "$hasta" -- data/packs/)"
else cambios="$( (git diff --name-only "$desde" -- data/packs/; git ls-files --others --exclude-standard data/packs/) | sort -u)"; fi
if [ -n "$cambios" ]; then echo "PACK CAMBIADO: sí ($(echo $cambios | tr '\n' ' '))"; else echo "PACK CAMBIADO: no"; fi
