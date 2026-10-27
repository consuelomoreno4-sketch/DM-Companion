# DM Companion

Herramienta para Dungeon Masters de D&D (reglas 2024), pensada para una tablet en horizontal
(Samsung Galaxy Tab S8 Ultra). Funciona sin internet una vez instalada y guarda todo en el dispositivo.

**Estado:** Fase 1 lista (base de la app + panel de Combate), versión 1.1. Ver [`SPEC.md`](SPEC.md) para el plan completo.

**Idiomas:** inglés (por defecto), español y alemán. Se cambia en **Settings / Ajustes** (⚙).

## Qué hace el panel de Combate

- **Añadir**: nombre, facción (aliado / enemigo / neutral), iniciativa, HP máx, CA y cantidad
  (con cantidad 3 crea "Goblin 1", "Goblin 2", "Goblin 3").
- **Sugerencias de monstruos**: al escribir el nombre aparecen monstruos del SRD 5.2 (en inglés).
  Toca uno y se cargan solos sus HP, su AC y una tirada de iniciativa (d20 + DES), que puedes cambiar.
- **Turnos**: "Empezar combate" / "Siguiente turno" y "Anterior". El contador de rondas sube solo.
  Los enemigos caídos se saltan; los aliados caídos no (hacen salvaciones contra la muerte).
- **Daño y curación** (2 toques): toca el HP de una tarjeta o un token → toca "−5", "+10"…
  o escribe otra cantidad con el teclado numérico y pulsa **Daño**, **Curar** o **HP temp.**
- **Condiciones**: botón "⋯" de la tarjeta. Elige primero la duración (sin límite, 1, 2, 3, 10 rondas u otra)
  y toca la condición. Al terminar aparece un aviso. Agotamiento va por niveles con − y +.
- **Concentración**: botón con el círculo ◎. Al recibir daño avisa de la tirada de Constitución.
- **Grilla**: arrastra los tokens con el dedo o el S Pen. Tamaño de la grilla en el botón "⋯" de la barra.
- **Deshacer**: botón "Deshacer" (o Ctrl+Z) revierte la última acción, hasta 50 pasos.
- **Ajustes** (⚙ arriba a la derecha): idioma, exportar o importar una copia de seguridad, y créditos.

### Atajos con teclado

| Tecla | Acción |
|---|---|
| Espacio | Siguiente turno |
| Shift + Espacio | Turno anterior |
| 1 · 2 · 3 · 4 | Cambiar de panel |
| Esc | Cerrar ventana |
| Ctrl + Z | Deshacer |
| Enter (en la ventana de HP) | Aplicar daño (Shift + Enter: curar) |

Los atajos no se activan mientras escribes en un campo.

## Publicar una versión nueva

1. Sube los cambios a la rama `main`.
2. En `sw.js`, aumenta el número de `VERSION` (por ejemplo, de `1.1.0` a `1.1.1`).
   Así las tablets saben que hay algo nuevo y muestran "Hay una versión nueva → Actualizar".
3. Si añades archivos nuevos (CSS, JS, imágenes), agrégalos también a la lista `FILES` de `sw.js`.

## Probar en una computadora

Los módulos de JavaScript no funcionan abriendo `index.html` con doble clic; hace falta un servidor.
Con Python instalado: `python3 -m http.server` dentro de esta carpeta y abre `http://localhost:8000`.

## Créditos y licencias

- Fuentes **Cinzel** e **Inter**: SIL Open Font License 1.1 (ver `fonts/`).
- Datos de monstruos preparados por el proyecto [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (licencia MIT).
- Stats de monstruos y resúmenes de condiciones basados en el **System Reference Document 5.2** de Wizards of the Coast LLC,
  disponible en https://dnd.wizards.com/resources/systems-reference-document,
  licenciado bajo [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
