#!/usr/bin/env bash
# Sirve la app en http://localhost:8765 (en segundo plano). Si ya está sirviendo, no hace nada.
# Uso: bash servidor.sh [parar]
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
PUERTO="${PUERTO:-8765}"
pidfile="${TMPDIR:-/tmp}/dm-companion-servidor.pid"

if [ "${1:-}" = "parar" ]; then
  [ -f "$pidfile" ] && kill "$(cat "$pidfile")" 2>/dev/null; rm -f "$pidfile"
  echo "Servidor detenido."; exit 0
fi
if curl -fsS -o /dev/null "http://localhost:$PUERTO/index.html" 2>/dev/null; then
  echo "Ya sirviendo en http://localhost:$PUERTO/"; exit 0
fi
nohup python3 -m http.server "$PUERTO" --bind 127.0.0.1 >/dev/null 2>&1 &
echo $! > "$pidfile"
for _ in $(seq 1 20); do
  curl -fsS -o /dev/null "http://localhost:$PUERTO/index.html" 2>/dev/null && { echo "Sirviendo en http://localhost:$PUERTO/"; exit 0; }
  sleep 0.25
done
echo "ERROR: el servidor no arrancó en el puerto $PUERTO."; exit 1
