# DM Companion

Herramienta para Dungeon Masters de D&D (reglas 2024), pensada para una tablet en horizontal
(Samsung Galaxy Tab S8 Ultra). Funciona sin internet una vez instalada y guarda todo en el dispositivo.

**Estado:** Fases 1, 2 y 3 listas (Combate, Compendio y Campaña), versión 3.2. Ver [`SPEC.md`](SPEC.md) para el plan completo.

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

## Qué hace el panel de Compendio

- **Monstruos, Hechizos y Reglas** del SRD 5.2.1 (en inglés), con buscador.
- **Filtros** (botón "Filters / Filtros"): por fuente, tipo y CR de monstruos; nivel, escuela, clase,
  tiempo de lanzamiento, concentración y ritual de hechizos; categoría de reglas.
- **Añadir al combate** desde cualquier monstruo.
- **Nueva**: crea tus propios monstruos, hechizos o reglas. **Duplicar como propia** copia una entrada oficial
  para modificarla. Tus monstruos también aparecen en las sugerencias del Combate.

## Qué hace el panel de Campaña

- **Sesiones**: número, fecha, título, resumen y **notas en punteo**. Enter crea un punto nuevo; los botones de
  arriba de las notas cambian la sangría, mueven o borran el punto donde está el cursor.
  **Seleccionar → Fusionar** une varios puntos en uno (con Deshacer). Debajo aparecen los **nombres sin ficha**
  para crearlas con un toque.
- **Bitácora**: fichas de personajes, lugares, objetos y facciones, con etiquetas y **enlaces** entre fichas.
  "Aparece en" muestra dónde se menciona cada ficha (otras fichas, historias y notas de sesión).
- **Líneas de historia**: tablero Idea / Activa / Resuelta; ◀ ▶ mueven cada tarjeta.
- **Mapa** con tres modos:
  - **Lugares**: mapa dibujado de la Costa de la Espada; toca un lugar para ver quién y qué está conectado con él.
    "Ubicar lugares" permite moverlos arrastrando.
  - **Personajes**: elige un personaje y ve con quién está conectado y por qué (los puntos exactos de las notas).
  - **Red**: todas las fichas y sus hilos.
  Los **hilos** salen de las notas de sesión (dos fichas nombradas en un mismo punto o en un punto y su sub-punto),
  de los enlaces de la bitácora y de las líneas de historia. Agrega "otros nombres" a cada ficha (p. ej. "Dagult")
  para que se reconozcan.
- **Cargar Dragon of Icespire Peak** (Bitácora o Mapa): personajes, lugares y facciones de la aventura con sus enlaces.
- **Importar notas** (Sesiones): pega tus notas de sesiones anteriores o elige archivos .txt, .md o Word (.docx).
  Desde Samsung Notes: ⋮ → «Guardar como archivo» → Microsoft Word, y luego «Elegir archivos» en la app.
- **Buscar en toda la campaña** desde la barra de arriba. Todo se guarda solo.

### Atajos con teclado

| Tecla | Acción |
|---|---|
| Espacio | Siguiente turno |
| Shift + Espacio | Turno anterior |
| 1 · 2 · 3 · 4 | Cambiar de panel |
| Esc | Cerrar ventana |
| Ctrl + Z | Deshacer |
| Enter (en la ventana de HP) | Aplicar daño (Shift + Enter: curar) |
| Tab / Shift + Tab (en notas) | Sangría / quitar sangría |
| Alt + ↑ / ↓ (en notas) | Mover el punto |

Los atajos no se activan mientras escribes en un campo.

## Publicar una versión nueva

1. Sube los cambios a la rama `main`.
2. En `sw.js`, aumenta el número de `VERSION` (por ejemplo, de `3.0.0` a `3.0.1`).
   Así las tablets saben que hay algo nuevo y muestran "Hay una versión nueva → Actualizar".
3. Si añades archivos nuevos (CSS, JS, imágenes), agrégalos también a la lista `FILES` de `sw.js`.

## Probar en una computadora

Los módulos de JavaScript no funcionan abriendo `index.html` con doble clic; hace falta un servidor.
Con Python instalado: `python3 -m http.server` dentro de esta carpeta y abre `http://localhost:8000`.

## Créditos y licencias

- Fuentes **Cinzel** e **Inter**: SIL Open Font License 1.1 (ver `fonts/`).
- Textos del SRD preparados por el proyecto [downfallx/dnd-5e-srd-markdown](https://github.com/downfallx/dnd-5e-srd-markdown) (CC-BY-4.0)
  y datos de hechizos de [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (licencia MIT).
- This work includes material from the **System Reference Document 5.2.1** ("SRD 5.2.1") by Wizards of the Coast LLC,
  available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the
  [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/legalcode).
