---
name: probar-app
description: Prueba DM Companion en un navegador real (Chromium con Playwright) como en la tablet — horizontal, con toque, sin internet — y saca capturas. Úsala solo cuando un cambio afecta algo visible o el comportamiento de la app (paneles, ventanas, combate, campaña, idiomas, sw.js); no para cambios solo de texto en .md ni de configuración.
---

# Probar la app en el navegador

Desde la raíz del repo. Plantillas en `.claude/skills/probar-app/plantillas/`; capturas siempre en
el **scratchpad** (`--salida=<scratchpad>/…`), nunca en el repo. Detalles: [reference.md](reference.md).

1. **Servir**: `bash .claude/skills/probar-app/scripts/servidor.sh` (puerto 8765; no hace nada si ya
   está sirviendo).
2. **Elegir la prueba**:
   - Cambio de aspecto o de textos → `node …/plantillas/recorrido.mjs --salida=<dir> --idiomas=en,es,de`
     (prueba a 1232 y 1848 px de ancho; puedes limitar con `--paneles=campana` o `--anchos=1232`).
   - Cambio de comportamiento → copia `flujo.mjs` al scratchpad, cambia su `import` a la ruta
     **absoluta** de `plantillas/base.mjs` y escribe los pasos del cambio. Ejecútala con `node`.
   - Cambió `sw.js` o se agregó un archivo que la app carga → `node …/plantillas/sin-internet.mjs --salida=<dir>`.
3. **Mira solo las capturas** de la parte que cambió y las que los chequeos marcaron con problemas
   (con Read), no todas: que se vea bien, en el idioma correcto y en ambos anchos.
4. **Resultado**: cada script termina con `RESULTADO: sin errores` o la lista de errores. Si hay
   errores de JS o archivos que no cargan, corrígelos y repite. Las listas de «posibles claves sin
   traducir» y «botones de menos de 44 px» son avisos: revísalos, no siempre son fallos.
5. Al terminar: `bash .claude/skills/probar-app/scripts/servidor.sh parar`.

**No** instales Playwright ni navegadores (ya están) ni uses npm. Las pruebas empiezan con datos
vacíos y bloquean internet: nunca uses una clave de API real.
