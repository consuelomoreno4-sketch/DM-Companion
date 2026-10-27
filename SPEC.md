# DM Companion — Especificación

App web para dirigir partidas de D&D (reglas 2024) como Dungeon Master.
Este documento es la referencia para todas las fases. Si algo cambia, se actualiza aquí.

## Dispositivo objetivo

- Samsung Galaxy Tab S8 Ultra (14,6"), en horizontal.
- Táctil + S Pen; teclado físico opcional.
- Debe funcionar bien con el dedo: nada depende del "hover" (pasar el ratón por encima).

## Requisitos técnicos

- Archivos estáticos (HTML, CSS, JavaScript) **sin paso de compilación**.
  Se publican tal cual con **GitHub Pages desde la rama `main`** (carpeta raíz).
- JavaScript con módulos nativos del navegador (`<script type="module">`), sin librerías externas.
- **PWA instalable** que funciona **100 % sin internet**:
  - `manifest.webmanifest` + `sw.js` (service worker) que guarda en caché todos los archivos.
  - Fuentes (Cinzel, Inter) e iconos guardados dentro del repositorio; nada se carga desde CDNs.
  - Las rutas son relativas (`./`) porque GitHub Pages sirve la app en `/DM-Companion/`.
  - Al publicar una versión nueva hay que subir el número `VERSION` en `sw.js`
    (la app avisa "Hay una versión nueva" y se actualiza con un toque).
- **Datos en el dispositivo** con IndexedDB (base `dm-companion`).
  - Botones para **exportar** e **importar** una copia de seguridad (archivo `.json`).
  - Se pide al navegador almacenamiento persistente para que no borre los datos.
- **Interfaz en español.**

## Diseño

- Tema oscuro gris azulado (no negro puro). Acentos ámbar/dorado y azul profundo.
- Contraste mínimo **WCAG AA** (4,5:1 en texto).
- Tipografías: títulos en **Cinzel**, texto en **Inter**, números con `tabular-nums`.
- Tamaños: HP del turno activo 32 px, resto 24 px; **ningún texto por debajo de 18 px**.
- Facción por **color y forma de borde** (para no depender solo del color):
  - Aliados: borde **sólido azul**.
  - Enemigos: borde **doble rojo**.
  - Neutrales: borde **punteado gris**.
- Turno activo: brillo ámbar que pulsa lento (ciclo de 2 s). Transiciones de 250 ms.
- Daño: el token tiembla y flota "−12" en rojo. Curación: "+8" en verde.
  Muerte (0 HP): opacidad 30 % + icono de calavera.
- Respetar `prefers-reduced-motion` (sin temblores, pulsos ni desplazamientos).
- Botones de al menos 44 px. Bordes de 6 px de radio. Espaciado en múltiplos de 8 px.
- Atajos de teclado (solo si hay teclado y **nunca mientras se escribe en un campo**):
  - `Espacio` = siguiente turno · `Shift+Espacio` = turno anterior
  - `1`–`4` = cambiar de panel · `Esc` = cerrar ventana · `Ctrl+Z` = deshacer

## Alcance total (4 paneles)

### 1. Combate — FASE 1 ✅
- Añadir jugadores y monstruos a mano: nombre, iniciativa, HP máx, CA, facción
  (y cantidad, para añadir varios iguales: "Goblin 1", "Goblin 2"…).
- Lista de turnos ordenada por iniciativa, contador de rondas,
  botones grandes "Siguiente turno" y "Anterior".
- Por combatiente: HP actual/máx, HP temporales, condiciones (las 15 de 2024;
  Agotamiento por niveles 1–6), marca de concentración.
- Condiciones con duración opcional en rondas; avisan al terminar.
- Aplicar daño o curación en máximo 2 toques.
- Grilla simple con tokens que se arrastran con el dedo.
- Deshacer la última acción (hasta 50 pasos, en memoria mientras la app está abierta).

### 2. Compendio — FASE 2
- Reglas, monstruos y hechizos del **SRD 5.2** (licencia **CC-BY-4.0**), con atribución visible:
  "Este trabajo incluye material del System Reference Document 5.2 ("SRD 5.2") de
  Wizards of the Coast LLC, disponible en https://dnd.wizards.com/resources/systems-reference-document.
  El SRD 5.2 está licenciado bajo Creative Commons Attribution 4.0 International License."
- Búsqueda; filtros de hechizos (nivel, escuela, clase, tiempo de lanzamiento, concentración, ritual).
- Cada entrada muestra su **fuente** (SRD 5.2 o "Propia").
- Agregar, editar y borrar **entradas propias** (guardadas en IndexedDB e incluidas en la copia de seguridad).
- Desde un monstruo, botón para añadirlo directamente al combate.
- Los datos del SRD se guardan como archivos JSON dentro del repositorio (funcionan sin internet).

### 3. Campaña — FASE 3
- **Notas de sesión** en punteo (viñetas, con sangría para sub-puntos).
- **Historial de sesiones** (fecha, título, resumen, notas).
- **Bitácora**: fichas de personajes, lugares, objetos y facciones (nombre, tipo, descripción, etiquetas, enlaces entre fichas).
- **Líneas de historia** con estado: idea / activa / resuelta.
- Búsqueda global en la campaña.

### 4. Ambientación — FASE 4
- Generar descripciones de escena con la **API de Anthropic** (requiere internet).
- La clave de API se guarda **solo en el dispositivo** (IndexedDB); nunca en el repositorio
  ni en la copia de seguridad exportada (salvo que el usuario lo elija explícitamente).
- Entradas: lugar, ambiente, sentidos (vista, sonido, olor), tono, longitud.
- Guardar las descripciones favoritas para usarlas sin internet.
- Modelo por defecto: el más reciente y capaz de Claude disponible.
- Si no hay internet, el panel lo explica y muestra las descripciones guardadas.

## Estructura de archivos

```
index.html              Página principal (cabecera, paneles, ventanas)
manifest.webmanifest    Datos para instalar la app
sw.js                   Service worker (modo sin internet)
.nojekyll               Le dice a GitHub Pages que publique los archivos tal cual
css/app.css             Todos los estilos y colores
js/app.js               Arranque, navegación entre paneles, atajos, copia de seguridad
js/db.js                Acceso a IndexedDB + exportar/importar
js/ui.js                Utilidades: iconos, avisos (toasts), ventanas
js/conditions.js        Las 15 condiciones de 2024 (resumen en español)
js/combat-state.js      Datos y reglas del combate + deshacer
js/combat.js            Pantalla del panel de Combate
fonts/                  Cinzel e Inter (licencia SIL OFL 1.1)
icons/                  Iconos de la app
```

## Modelo de datos (IndexedDB)

Base `dm-companion`, versión 1, almacén `kv` (clave → valor).

- `combat`:
  ```
  { version, started, round, activeId, seq,
    grid: { cols, rows },
    recent: [números usados recientemente],
    combatants: [{ id, seq, name, faction: 'ally'|'enemy'|'neutral',
                   init, hpMax, hp, temp, ac, x, y,
                   concentration: bool, exhaustion: 0–6,
                   conditions: [{ key, rounds|null, anchorId|null }] }] }
  ```

Fases futuras añadirán almacenes (`compendium`, `notes`, `sessions`, `codex`, `storylines`, `scenes`)
subiendo la versión de la base de datos en `js/db.js`.

Copia de seguridad (`.json`):
```
{ app: 'dm-companion', format: 1, exportedAt, stores: { kv: [{ key, value }], … } }
```
Importar **reemplaza** todos los datos actuales (se pide confirmación).

## Reglas de combate implementadas

- Orden: iniciativa de mayor a menor; empate = orden en que se añadieron.
- Los enemigos y neutrales a 0 HP se saltan en el turno; los aliados no
  (en 2024 hacen tiradas de salvación contra la muerte).
- Daño: primero se gastan los HP temporales; HP nunca baja de 0. Curación no supera el máximo.
- HP temporales: el valor nuevo reemplaza al anterior (no se suman).
- Concentración: al recibir daño avisa de la salvación de Constitución
  (CD = mayor entre 10 y la mitad del daño, máximo 30). A 0 HP la concentración se pierde.
- Duración de condiciones: se cuenta en rondas desde el turno en que se aplicó;
  termina al **empezar ese mismo turno** X rondas después y aparece un aviso.
  Si el combate no ha empezado, se cuenta al inicio de cada ronda.
- "Anterior" solo mueve el turno hacia atrás; para revertir efectos se usa "Deshacer".
