#!/usr/bin/env bash
# Modo prueba de /publicar: hace todo menos commit, push y deploy, sin cambiar el proyecto.
# Uso: bash prueba.sh <patch|minor|X.Y.Z> "Nota del cambio."
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
dir="$(dirname "$(readlink -f "$0")")"
tipo="${1:-patch}"; nota="${2:-Prueba.}"

echo "### 1. Verificar"
bash "$dir/verificar.sh" || { echo "PRUEBA DETENIDA en el paso 1: la verificación encontró problemas."; exit 1; }

echo; echo "### 2. Versión y notas (en una copia temporal; el proyecto no cambia)"
copia="$(mktemp -d)"; trap 'rm -rf "$copia"' EXIT
cp -a . "$copia/repo"
( cd "$copia/repo" && python3 .claude/skills/publicar/scripts/version.py "$tipo" "$nota" && git --no-pager diff --stat -- sw.js CHANGELOG.md README.md ) \
  || { echo "PRUEBA DETENIDA en el paso 2."; exit 1; }

echo; echo "### 3. Commit y push (simulado: no se hace)"
rama="$(git branch --show-current)"
if [ "$rama" = "main" ]; then echo "Rama: main — la publicación real seguiría."
else echo "Rama: '$rama' — la publicación real se DETENDRÍA aquí (solo se publica desde main)."; fi
echo "Se subirían estos archivos:"; ( cd "$copia/repo" && git status --short ) | sed 's/^/  /'
echo "Desde lo último publicado (origin/main):"
bash "$dir/cambio_pack.sh" origin/main

echo; echo "### 4. Deploy (no aplica en prueba)"
echo; echo "PRUEBA TERMINADA: no se hizo commit, push ni cambios en el proyecto."
