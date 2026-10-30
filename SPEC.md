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
- **Idiomas:** la interfaz oficial está en **inglés** (idioma por defecto); también se puede elegir
  **español** o **alemán** en Ajustes. Los textos están en `js/i18n/en.js`, `es.js` y `de.js` (mismas claves).
  Los nombres de monstruos, hechizos y demás contenido del SRD se muestran en inglés en todos los idiomas.
  Términos por idioma: HP/AC/CR (en) · HP/CA/VD (es) · TP/RK/HG (de).

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
- **Aliados (v1.1.1):** solo el nombre es obligatorio; iniciativa, HP y CA son opcionales porque los lleva
  cada jugador. Sin iniciativa van al final del orden; sin HP muestran "—", nunca cuentan como caídos y al tocar
  su HP se abre la edición para ponerlos. Enemigos y neutrales siguen necesitando todos los campos.
- **Sugerencias de monstruos (v1.1):** al escribir el nombre se despliega una lista con los 341 monstruos
  del SRD 5.2 (nombre, CR, tamaño, tipo, HP, AC). Al elegir uno se cargan HP y AC y se tira la iniciativa
  (d20 + modificador de Destreza; se puede cambiar). El combatiente guarda `ref` = id del monstruo.
  Solo el SRD 5.2 se puede incluir legalmente; el resto del Monster Manual 2024 no. Los monstruos propios
  de la fase 2 aparecerán también en estas sugerencias.
- Lista de turnos ordenada por iniciativa, contador de rondas,
  botones grandes "Siguiente turno" y "Anterior".
- Por combatiente: HP actual/máx, HP temporales, condiciones (las 15 de 2024;
  Agotamiento por niveles 1–6), marca de concentración.
- Condiciones con duración opcional en rondas; avisan al terminar.
- Aplicar daño o curación en máximo 2 toques.
- Grilla simple con tokens que se arrastran con el dedo.
- Deshacer la última acción (hasta 50 pasos, en memoria mientras la app está abierta).

### 2. Compendio — FASE 2 ✅ (v2.0)
- Tres secciones: **Monstruos** (330), **Hechizos** (339) y **Reglas** (186 entradas: glosario de reglas,
  "Playing the Game", lanzamiento de hechizos, "Gameplay Toolbox" y guía de bloques de estadísticas).
- Contenido del **SRD 5.2.1** (CC-BY-4.0) en inglés; la interfaz se traduce. Atribución completa en Ajustes → Créditos
  y una línea de fuente al pie de cada entrada:
  "This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC,
  available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0
  International License (https://creativecommons.org/licenses/by/4.0/legalcode)."
- Búsqueda por nombre (en reglas, también dentro del texto). Filtros plegables con contador:
  - Todas: fuente (todas / SRD / propias).
  - Monstruos: tipo, CR desde / hasta.
  - Hechizos: nivel, escuela, clase, tiempo de lanzamiento (acción / adicional / reacción / 1 minuto o más),
    concentración, ritual.
  - Reglas: categoría.
- Cada entrada muestra su **fuente** (insignia "SRD 5.2.1" o "Propia").
- **Entradas propias** (monstruo, hechizo, regla): crear, editar, borrar y **duplicar una del SRD como propia**
  (copia los datos para modificarlos). Se guardan en IndexedDB (almacén `homebrew`) y van en la copia de seguridad.
  Texto con formato sencillo: **negrita**, _cursiva_, "### Sección", "- lista".
- Monstruos: botón **Añadir al combate** (abre "Añadir" con los stats y la iniciativa tirada).
  Los monstruos propios aparecen también en las sugerencias del Combate.
- En el Combate, los combatientes que vienen del Compendio tienen el botón **Bloque de estadísticas**.
- Datos en `data/`, generados con `tools/build_srd.py` a partir de:
  - https://github.com/downfallx/dnd-5e-srd-markdown (SRD 5.2.1 en Markdown, CC-BY-4.0): textos, bloques de
    estadísticas, iniciativa 2024 de cada monstruo, reglas.
  - https://github.com/5e-bits/5e-database (MIT), `src/2024/en`: campos de hechizos para los filtros.

### 3. Campaña — FASE 3 ✅ (v3.0)
- Tres vistas (Sesiones / Bitácora / Líneas de historia) y **búsqueda en toda la campaña** (resultados por
  tipo con un fragmento del texto; al tocar uno se abre).
- Todo se **guarda solo** (pausa de 0,4 s tras escribir; se fuerza al salir de la app y antes de exportar).
  Aviso "Guardado ✓".
- **Sesiones** (historial): n.º (automático), fecha (hoy por defecto), título, resumen y **notas en punteo**:
  - Enter crea un punto nuevo (se detecta el salto de línea, así funciona con el teclado de la tablet);
    Enter a mitad de texto lo divide; pegar varias líneas crea varios puntos.
  - Sangría 0–4 con botones o Tab / Shift+Tab; mover con botones o Alt+↑/↓; borrar con botón o Retroceso en un
    punto vacío. Los botones actúan sobre el punto donde está el cursor.
- **Bitácora**: fichas de personaje / lugar / objeto / facción con descripción corta, etiquetas, descripción y
  **enlaces** a otras fichas (buscador; si el nombre no existe, ofrece crear la ficha). "Aparece en": fichas e
  historias que la enlazan y sesiones cuyas notas contienen su nombre. Filtro por tipo y por nombre/etiqueta.
  Al borrar una ficha se quita de los enlaces de las demás.
- **Líneas de historia**: tablero de tres columnas **idea / activa / resuelta**; tarjetas con título, descripción
  y fichas involucradas; ◀ ▶ mueven de columna; tocar la tarjeta abre la edición. Una tarjeta nueva que se cierra
  vacía se descarta.
- **Fusionar puntos (v3.1)**: botón "Seleccionar" → marcar puntos → "Fusionar". Se unen en el lugar del primero
  (cada parte termina en punto), con la sangría menor; el aviso ofrece Deshacer. Con teclado: Retroceso al inicio de
  un punto lo une al anterior.
- **Menciones (v3.1)**: una ficha se reconoce en las notas por su nombre o sus **otros nombres** (alias), sin
  mayúsculas ni tildes y como palabra completa. Un sub-punto hereda las fichas de sus puntos padre.
  - Cada ficha muestra su **Registro en sesiones** (los puntos donde aparece, agrupados por sesión, con el
    contexto del punto padre y los nombres resaltados y tocables).
  - Bajo las notas de cada sesión: **nombres sin ficha** (palabras con mayúscula que no empiezan frase, o nombres
    de varias palabras) para crearlas con un toque; la × los oculta en esa sesión (`ignoredNames`).
- **Mapa por modos (v3.2)**: tres modos a elegir arriba del mapa.
  - **Lugares**: mapa dibujado (propio, aproximado) de la Costa de la Espada — mar, costa, Camino Alto, Sendero de
    Triboar, Bosque de Neverwinter, Montañas de la Espada, Marisma de los Hombres Muertos — con los lugares de la
    bitácora que tienen posición (`pos: {x, y}` en un mundo de 1000 × 700). Tocar un lugar muestra lo conectado
    agrupado por tipo y su registro. "Ubicar lugares" permite arrastrarlos; los lugares sin posición que no están
    dentro de otro lugar ubicado (por enlace) aparecen en "Lugares sin ubicar" para ponerlos en el mapa.
  - **Personajes**: lista con buscador ordenada por conexiones; de lejos, red solo de personajes. Al elegir uno,
    vista centrada con filtro por tipo de ficha.
  - **Red**: todas las fichas (filtro por tipo); de lejos solo se ven los nombres de las 12 más conectadas.
  - Al cambiar de modo, cada uno empieza en su vista general.
- **Paquetes de aventura (v3.2)**: `data/packs/*.json` con fichas (personajes, lugares, facciones), otros nombres,
  descripción corta en en/es/de, enlaces y posición en el mapa. "Cargar Dragon of Icespire Peak" (Bitácora o Mapa)
  no duplica fichas con el mismo nombre: solo completa otros nombres, posición y enlaces. Textos propios y breves;
  los datos de la aventura se escribieron de memoria y pueden tener errores (todo es editable).
- **Importar notas (v3.2)**: Sesiones → "Importar notas": pegar texto o elegir archivos .txt / .md / .docx (varios a la vez;
  Word se lee en el navegador con `DecompressionStream`, conservando títulos y niveles de lista). Pensado para Samsung
  Notes ("Guardar como archivo" → Microsoft Word o Archivo de texto; instrucciones en la ventana). Un archivo sin
  título de sesión usa su nombre de archivo (con número y fecha si los tiene). Viñetas reconocidas: - * + • ▪ ◦ ○ ● ☐ ☑ … Una línea con "Sesión" /
  "Session" / "Sitzung" o con # inicia una sesión (se reconocen número, fecha AAAA-MM-DD o DD/MM/AAAA y título);
  las demás líneas son puntos (viñetas -, *, •, +, 1. o sin viñeta) y la sangría (espacios o tabulador) da los
  sub-puntos. Vista previa con el conteo antes de importar.
- **Mapa (v3.1)**: grafo de la campaña.
  - Nodos = fichas (color e icono por tipo; tamaño según menciones). Hilos = dos fichas en un mismo punto (al menos
    una nombrada en el propio punto), enlaces de la bitácora (línea discontinua) y líneas de historia; grosor
    según la cantidad.
  - Vista general (colocación automática por fuerzas) y vista **centrada** en una ficha con sus conexiones en
    anillos (máx. 18, las más conectadas primero). Migas: Vista general › A › B.
  - Tocar una conexión muestra el **hilo**: los puntos exactos que unen las dos fichas; segundo toque o
    "Centrar en…" la pone en el centro. Panel con conexiones, registro y enlaces a sesiones, fichas e historias.
  - Arrastrar para mover, dos dedos / rueda / botones para el zoom; los textos se mantienen a 18 px.

### 4. Ambientación — FASE 4 (lista en 4.0.0)
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
js/app.js               Arranque, idioma, navegación entre paneles, atajos, ajustes y copia de seguridad
js/db.js                Acceso a IndexedDB + exportar/importar
js/ui.js                Utilidades: iconos, avisos (toasts), ventanas
js/i18n.js              Sistema de traducción (t, tn, tm)
js/i18n/en.js, es.js, de.js  Textos de la interfaz en cada idioma
js/conditions.js        Lista de las 15 condiciones de 2024 (los textos están en i18n)
js/monsters.js          Monstruos (SRD + propios) para sugerencias y Compendio
js/compendium-data.js   Datos del Compendio: carga, listas, presentación y entradas propias
js/compendium.js        Pantalla del Compendio
js/campaign-data.js     Datos de la Campaña: carga, guardado automático, enlaces y búsqueda
js/campaign.js          Pantalla de la Campaña (vistas y búsqueda)
js/campaign-sessions.js Vista Sesiones (notas en punteo)
js/campaign-codex.js    Vista Bitácora
js/campaign-stories.js  Vista Líneas de historia (tablero)
js/campaign-map.js      Vista Mapa (Lugares / Personajes / Red)
js/campaign-import.js   Paquetes de aventura e importación de notas
data/packs/icespire.json  Paquete Dragon of Icespire Peak
js/campaign-ui.js       Piezas compartidas (enlaces entre fichas, fechas)
js/ai.js               Conexión con la API de Anthropic (streaming, JSON estructurado, costo)
js/ai-ui.js            Sección "Claude (IA)" de Ajustes
js/ambience.js         Panel de Ambientación
js/campaign-ai.js      Analizar campaña / Revisar sesión con IA
js/markdown.js          Formato sencillo del texto de entradas propias
data/monsters.json      Índice de monstruos (id, nombre, tipo, CR, HP, AC, iniciativa)
data/monsters-full.json Bloque de estadísticas de cada monstruo (HTML)
data/spells.json        Hechizos: campos para filtros + texto (HTML)
data/rules.json         Reglas (HTML)
tools/build_srd.py      Genera data/ desde las fuentes del SRD
js/combat-state.js      Datos y reglas del combate + deshacer
js/combat.js            Pantalla del panel de Combate
fonts/                  Cinzel e Inter (licencia SIL OFL 1.1)
icons/                  Iconos de la app
```

## Modelo de datos (IndexedDB)

Base `dm-companion`, versión 3. Almacenes: `kv` (clave → valor), `homebrew` (entradas propias del Compendio)
y los de la Campaña: `sessions`, `codex`, `storylines`.

- `settings`: `{ lang: 'en' | 'es' | 'de' }`

- `combat`:
  ```
  { version, started, round, activeId, seq,
    grid: { cols, rows },
    recent: [números usados recientemente],
    combatants: [{ id, seq, name, faction: 'ally'|'enemy'|'neutral',
                   init, hpMax, hp, temp, ac, x, y,   (init/hpMax/hp/ac pueden ser null en aliados)
                   concentration: bool, exhaustion: 0–6, ref: id SRD | null,
                   conditions: [{ key, rounds|null, anchorId|null }] }] }
  ```

- `homebrew` (id → entrada): `{ id: 'hb-…', kind: 'monster' | 'spell' | 'rule', name, …campos, text, updatedAt }`
  - monster: size, type, alignment, ac, hp, hpFormula, init (vacío = mod. DES), speed, str…cha, saves, skills,
    resist, immune, senses, languages, cr
  - spell: level, school, classes[], castingTime, ritual, concentration, range, components, duration, higher
  - rule: category

- `sessions`: `{ id, number, date: 'AAAA-MM-DD', title, summary, notes: [{ id, text, depth: 0–4 }], ignoredNames: [], createdAt, updatedAt }`
- `codex`: `{ id, kind: 'character' | 'place' | 'item' | 'faction', name, aliases: [], subtitle, tags: [], description, links: [ids], pos?: { x, y }, … }`
- `storylines`: `{ id, title, status: 'idea' | 'active' | 'resolved', description, links: [ids de la bitácora], … }`

Fases futuras añadirán almacenes (`scenes`)
subiendo la versión de la base de datos en `js/db.js`.

Copia de seguridad (`.json`):
```
{ app: 'dm-companion', format: 1, exportedAt, stores: { kv: [{ key, value }], homebrew: [...], … } }
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

- **Detectar en las notas (v3.3)**: Bitácora → "Detectar en las notas". Busca nombres propios sin ficha en todas las
  sesiones; adivina el tipo por pistas (palabras del nombre como Posada/Torre/Gremio/Espada, títulos como Lord/Rey,
  verbos después como "dice/ofrece", preposiciones antes como "llegan a"); agrupa sinónimos (una parte del nombre o
  título + apellido) y sugiere otros nombres para fichas existentes. Ventana de revisión: marcar, corregir tipo y
  nombres, crear todo junto; opción de no volver a sugerir los descartados (kv `ignoredNames`).
  Las pistas se buscan solo dentro de la misma frase. No propone criaturas: monstruos del Compendio ("Ankhegs") ni
  plurales con cantidad ("9 Twig Blights"). Una palabra a inicio de frase cuenta como nombre si sigue un verbo de
  acción ("Excelsior compra…"). Dos nombres nuevos con una letra distinta se unen solo desde 6 letras (Corin ≠
  Corwin); con una letra distinta que el nombre de una ficha existente se sugiere como otro nombre (Gorthoc → Gorthok).
- **Reloj de juego (v3.3)**: kv `clock` = `{ calendar: 'harptos' | 'days', start: { year, dayOfYear, minute },
  events: [{ kind: 'time' | 'short' | 'long' | 'next-day' | 'travel', minutes, amount, sessionId, auto?, source? }],
  weather: { [día]: { kind, sessionId, auto?, source? } } }`. Botón en la barra superior (fecha, hora, clima) con
  ventana para avanzar (+10 min, +1 h, +4 h, descanso corto 1 h, descanso largo hasta las 8:00 si es de tarde/noche
  o 8 h, mañana siguiente, días de viaje, personalizado), deshacer y clima del día. Vista Campaña → Tiempo: línea de
  tiempo por días, clima editable, calendario Harptos (meses y festividades, Shieldmeet) y "Reconstruir desde las
  notas" (en las notas un descanso largo = una noche; el clima de una nota se anota antes de avanzar el tiempo).

- **Mapas propios y tokens de lugar (v3.4)**: en Lugares, un selector de mapa: el dibujado o imágenes propias (foto,
  escaneo o captura del mapa de la aventura) que se guardan solo en la tablet (kv `maps`: `{ id, name, blob, w, h }`,
  fotos > 4096 px se reducen) y van en la copia de seguridad como data URL. No se incluye ningún mapa oficial en el
  repositorio (derechos de autor). Cada lugar tiene posición por mapa (`pos` en el dibujado, `mapPos[id]` en los
  propios) y un token `{ icon, color, size }` (icono adivinado por el nombre si no se eligió). "Editar mapa": tocar un
  espacio vacío crea un lugar ahí; arrastrar mueve; tocar edita nombre, icono (14), color (8) y tamaño, o lo quita del
  mapa; gestión del mapa (nombre, cambiar imagen, borrar). Token del grupo por mapa (kv `party`), arrastrable siempre.
  Los tokens mantienen su tamaño en pantalla con el zoom. Se recuerda el último mapa (kv `lastMap`).

## Pendientes e ideas

Ajustes pedidos que aún no están hechos o ideas para más adelante. Se revisan al terminar cada fase.

- Más secciones del SRD en el Compendio: objetos mágicos, equipo, dotes, clases (ya están en la fuente).
- Ver el bloque de estadísticas al tocar el token de un monstruo en la grilla.
- **Revisión de sesión con IA (propuesta para la fase 4)**: tras la sesión, un botón envía las notas a la API de
  Anthropic para corregir ortografía, gramática y redacción (se muestran los cambios para aceptarlos o no) y
  detectar personajes, lugares, objetos y facciones nuevos para crear sus fichas y que entren al mapa.
