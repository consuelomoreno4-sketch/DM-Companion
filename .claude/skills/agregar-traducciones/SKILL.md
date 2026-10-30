---
name: agregar-traducciones
description: Úsala siempre que agregues, cambies o borres un texto visible de la interfaz de DM Companion (botones, títulos, avisos, ayudas, placeholders, aria-label, mensajes de error) en js/ o index.html. Los textos nunca van escritos en el código; van como claves t()/tn() o data-i18n en los tres diccionarios js/i18n/en.js, es.js y de.js, que deben tener siempre las mismas claves.
---

# Agregar o cambiar textos de la interfaz

1. **Nombra la clave** con el prefijo del área (`camp.`, `combat.`, `comp.`, `map.`, `ai.`, `amb.`,
   `clock.`, `imp.`, `det.`…) y úsala en el código: `t('clave', {param})`, `tn('clave', n)` para
   plurales, o `data-i18n="clave"` (también `-aria`, `-placeholder`, `-title`, `-html`) en el HTML.
2. **Escribe los tres textos** usando los términos de [glosario.md](glosario.md). Inglés es el idioma
   por defecto. Mismos `{parámetros}` en los tres.
3. **Insértalos** con un JSON en el scratchpad (formato en [reference.md](reference.md)):
   `python3 .claude/skills/agregar-traducciones/scripts/agregar_claves.py <archivo.json>`
   Para cambiar textos que ya existen, agrega `--reemplazar`.
4. **Verifica**: `python3 .claude/skills/agregar-traducciones/scripts/verificar_claves.py`
