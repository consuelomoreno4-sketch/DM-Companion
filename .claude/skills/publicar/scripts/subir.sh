#!/usr/bin/env bash
# Commit de todos los cambios y push a main.
# Uso: PUBLICAR_NOMBRE="usuario-github" PUBLICAR_EMAIL="correo" bash subir.sh <archivo-con-el-mensaje>
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mensaje="${1:-}"
[ -n "$mensaje" ] && [ -s "$mensaje" ] || { echo "Falta el archivo con el mensaje del commit."; exit 1; }
[ -n "${PUBLICAR_NOMBRE:-}" ] && [ -n "${PUBLICAR_EMAIL:-}" ] || { echo "Faltan PUBLICAR_NOMBRE y PUBLICAR_EMAIL (identidad de la dueña)."; exit 1; }
rama="$(git branch --show-current)"
if [ "$rama" != "main" ]; then
  echo "DETENIDO: estás en la rama '$rama', no en 'main'."
  echo "La app publicada sale de 'main'; no se hizo commit ni push. Lleva primero los cambios a 'main'."
  exit 1
fi
base="$(git rev-parse origin/main 2>/dev/null || echo '')"  # lo último publicado, para comparar después

git add -A
if git diff --cached --quiet; then echo "No hay cambios para publicar."; exit 1; fi
git -c user.name="$PUBLICAR_NOMBRE" -c user.email="$PUBLICAR_EMAIL" commit -q -F "$mensaje"
echo "Commit: $(git log --oneline -1)"

espera=2
for intento in 1 2 3 4 5; do
  if git push -q -u origin main; then
    echo "Subido a main."
    bash "$(dirname "$0")/cambio_pack.sh" "${base:-HEAD~1}" HEAD
    exit 0
  fi
  [ "$intento" = 5 ] && break
  echo "El push falló; reintento en ${espera}s…"; sleep "$espera"; espera=$((espera * 2))
done
echo "No se pudo subir. Revisa los permisos de GitHub o la red (ver reference.md)."; exit 1
