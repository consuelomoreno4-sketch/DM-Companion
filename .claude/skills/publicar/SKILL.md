---
name: publicar
description: Publica una versión nueva de DM Companion en GitHub Pages (verifica, sube VERSION en sw.js, anota el cambio en CHANGELOG.md y la versión en README.md, hace commit y push a main y comprueba el deploy). Con "prueba" hace todo menos commit y push. Solo cuando la dueña escribe /publicar.
disable-model-invocation: true
---

# Publicar una versión

Argumentos: vacío = publicar · `prueba` = modo prueba. Scripts desde la raíz del repo, en
`.claude/skills/publicar/scripts/`. Detalles: [reference.md](reference.md).

**Regla de oro:** si cualquier script falla, **detente**: sin commit ni push. Explica en español
simple qué pasó y pregunta qué hacer. No intentes arreglarlo sin permiso.

**Versión** (decide tú, sin preguntar): `patch` si son arreglos, `minor` si hay funciones nuevas.
`major` **nunca** sin preguntar antes. **Nota**: escríbela tú, una o dos frases en español simple.

## Modo prueba (`/publicar prueba`)
`bash .claude/skills/publicar/scripts/prueba.sh <patch|minor> "Nota."` — verifica, simula la
versión en una copia temporal, muestra qué se subiría y si cambió el pack. No cambia nada.
Cuenta el resultado y termina.

## Publicar
1. `bash .claude/skills/publicar/scripts/verificar.sh`
2. `python3 .claude/skills/publicar/scripts/version.py <patch|minor> "Nota."`
3. Mensaje de commit (formato en reference.md) en un archivo del scratchpad, y:
   `PUBLICAR_NOMBRE=… PUBLICAR_EMAIL=… bash .claude/skills/publicar/scripts/subir.sh <archivo>`
   (identidad de la dueña por variables, nunca en archivos). Se detiene si no estás en `main`.
4. `bash .claude/skills/publicar/scripts/comprobar_deploy.sh`
5. Avísale en pocas líneas: qué cambió y la versión; **siempre** que acepte el aviso de
   actualización en la tablet; y **solo si** `subir.sh` dijo `PACK CAMBIADO: sí`, que vuelva a
   cargar el pack (Campaña → Códice → «Cargar …»).
