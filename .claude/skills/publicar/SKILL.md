---
name: publicar
description: Publica una versión nueva de DM Companion en GitHub Pages (sube VERSION en sw.js, anota el cambio en SPEC.md y README.md, verifica, hace commit y push a main y comprueba el deploy). Solo cuando la dueña escribe /publicar.
disable-model-invocation: true
---

# Publicar una versión

Argumento opcional: `patch` (por defecto), `minor`, `major` o un número `X.Y.Z`.
Todos los scripts se corren desde la raíz del repo. Detalles y problemas comunes: [reference.md](reference.md).

1. **Verificar** — si falla, arregla y repite; no publiques con errores:
   `bash .claude/skills/publicar/scripts/verificar.sh`
2. **Versión y notas** — una frase en español, para la usuaria, de lo que cambió:
   `python3 .claude/skills/publicar/scripts/version.py <patch|minor|major|X.Y.Z> "Qué cambió."`
3. **Commit y push a `main`** — escribe el mensaje (formato en reference.md) en un archivo del
   scratchpad y pásalo; la identidad va por variables de entorno, nunca escrita en archivos:
   `PUBLICAR_NOMBRE=… PUBLICAR_EMAIL=… bash .claude/skills/publicar/scripts/subir.sh <archivo-mensaje>`
4. **Comprobar el deploy** (espera a GitHub Pages y compara la versión publicada):
   `bash .claude/skills/publicar/scripts/comprobar_deploy.sh`
5. **Avisar a la dueña**, en español simple: qué cambió, la versión, y que en la tablet acepte el
   aviso de actualización (y si hace falta, recargar el pack o reimportar notas).
