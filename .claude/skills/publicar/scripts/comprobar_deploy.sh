#!/usr/bin/env bash
# Espera a que GitHub Pages publique el commit actual y compara la versión publicada con la local.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

url="$(git remote get-url origin)"
slug="$(echo "$url" | sed -E 's#^.*github\.com[/:]##; s#\.git$##')"    # dueña/repo
# El nombre real (con mayúsculas) viene de GitHub: la dirección de Pages distingue mayúsculas.
slug="$(gh api "repos/$slug" --jq .full_name 2>/dev/null || echo "$slug")"
owner="${slug%%/*}"; repo="${slug#*/}"
sitio="https://$(echo "$owner" | tr 'A-Z' 'a-z').github.io/$repo"
sha="$(git rev-parse --short=7 HEAD)"
local_v="$(sed -nE "s/^const VERSION = '([^']+)';/\1/p" sw.js)"

echo "Esperando el deploy de $sha…"
estado=""
for _ in $(seq 1 30); do
  estado="$(gh api "repos/$slug/actions/runs?per_page=5" --jq ".workflow_runs[] | select(.head_sha | startswith(\"$sha\")) | \"\(.status) \(.conclusion)\"" 2>/dev/null | head -1)"
  case "$estado" in completed*) break ;; esac
  sleep 10
done
echo "Workflow: ${estado:-sin datos}"

publicada="$(curl -s "$sitio/sw.js?nocache=$(date +%s)" | sed -nE "s/^const VERSION = '([^']+)';/\1/p")"
echo "Versión local: $local_v · publicada: ${publicada:-(no se pudo leer)} · $sitio/"
if [ "$publicada" = "$local_v" ] && [ "${estado#completed }" = "success" ]; then
  echo "PUBLICADO."
else
  echo "Todavía no coincide (puede tardar unos minutos más)."; exit 1
fi
