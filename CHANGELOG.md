# Registro de cambios

Lo más reciente arriba. Cada versión publicada agrega una línea (lo hace `/publicar`).

- **4.0.2** — Importar notas: «Sesión 26.04.2026» y «Sesión del 06.09.26» se leen con su fecha (sin número ni título falsos) y las líneas divisorias ya no entran como puntos. Detectar en las notas: no propone monstruos («Ankhegs», «9 Twig Blights»), no une nombres cortos distintos (Corin y Corwin), reconoce nombres al inicio de frase con verbo («Excelsior compra…»), sugiere variantes de una letra como otro nombre de una ficha (Gorthoc → Gorthok) y busca las pistas solo dentro de la misma frase.
- **4.0.1** — Orden de las sesiones: aviso cuando los números no siguen las fechas, con «Numerar por fecha» (con deshacer) o «Dejar así»; arrastrar cada sesión por su asa ⠿ (dedo, lápiz o mouse; flechas con teclado) la renumera en el nuevo orden. Al importar notas sin número de sesión, se numeran por fecha.
- **4.0.0** — Fase 4. Conexión con Claude en Ajustes (clave solo en el dispositivo, modelo Opus/Sonnet/Haiku, prueba de conexión; `fallbacks: "default"` en Opus y Sonnet). Panel de Ambientación (descripciones de escena con streaming, guardadas sin internet). "Analizar campaña con IA" (Códice): lee las sesiones (3 a la vez) con salida JSON estructurada y propone fichas nuevas con datos por sesión, datos y otros nombres para fichas existentes, conexiones (enlaces) y ubicaciones relativas (los lugares nuevos se ponen en el mapa dibujado); costo estimado antes y real al final; marca `aiAnalyzedAt` en las sesiones. "Revisar con IA" (sesión): lo mismo más correcciones de ortografía y redacción, punto por punto.
- **3.6.0** — "Detectar en las notas" más preciso en español: palabras de criaturas y de notas ("hombres rata", "Enganches", "Lore") ya no salen como nombres; "el templo de X" / "la posada X" → lugar; "Caza", "banda", "secta" → facción; sinónimos con una letra distinta (Valanter = Valenter); los nombres que ya son parte de una ficha ("posada Stonehill") no se proponen; descripción breve sacada de la frase ("Valanter, la intrépida líder…"). Los lugares nuevos se ubican solos en el mapa dibujado ("al sur de Conyberry" o junto a otro lugar de la misma frase). Pack: nombres en español/alemán para los lugares, Conyberry y Thundertree como fichas. Mapa: los nombres que se tapan se ocultan (los menos importantes) y reaparecen al acercar.
- **3.5.2** — Notas en párrafos: un párrafo que empieza con la fecha ("01.03.2026. Parten…") abre una sesión y cada frase pasa a ser un punto (sin cortar dentro de comillas). Al volver a importar, una sesión importada antes como un solo bloque se actualiza. Reloj: más formas de descanso largo ("deciden acampar", "arman campamento"…) y "a la mañana" justo después de acampar no suma otro día.
- **3.5.1** — Importar notas: más formatos de fecha (fechas sin año ni sesión anterior → la fecha pasada más reciente; "1ro de marzo"; línea que empieza con fecha + título; punto de primer nivel que es solo una fecha; "Jugamos el 15 de marzo…" al inicio de una sesión). Fecha editable en la vista previa. Al volver a importar notas sin número, la sesión se reconoce por su primer punto (no se duplica).
- **3.5.0** — Mapa dibujado nuevo: mapa topográfico esquemático propio (curvas de nivel de las Montañas de la Espada y el Monte Hotenow, Bosque de Neverwinter, Marisma de los Hombres Muertos, Camino Alto, Sendero de Triboar, Thundertree y Conyberry), con una "lupa" que agranda la zona de Phandalin. Posiciones del pack de Icespire Peak recolocadas según las distancias de la aventura; al volver a cargar el pack, las fichas que nunca se movieron pasan a su nuevo sitio (`prevPos`).
- **3.4.0** — Mapas propios (imagen del usuario, varios mapas), tokens de lugar editables y movibles, crear lugares
  tocando el mapa, token del grupo, iconos para el paquete Icespire Peak.
- **3.3.0** — Fechas en muchos formatos al importar (nombres de meses es/en/de, día de la semana, fecha sola en una
  línea, sin año), vista previa por sesión y actualizar sesiones con el mismo número; "Detectar en las notas"
  (personajes, lugares, facciones, objetos y sinónimos, con revisión); reloj de juego (Harptos o días) con descansos,
  viajes y clima, vista Tiempo y reconstrucción desde las notas.
- **3.2.2** — Google Docs (pegar: el nivel sale de ● ○ ■; o .docx/.txt) e Infomaniak (.docx, títulos "Ttulo1"); instrucciones.
- **3.2.1** — Importar notas desde Word (.docx) y varios archivos a la vez; instrucciones para Samsung Notes.
- **3.2.0** — Mapa por modos (Lugares con mapa dibujado de la Costa de la Espada, Personajes, Red); paquete
  Dragon of Icespire Peak; importar notas de sesión pegadas o desde archivo.
- **3.1.0** — Fusionar puntos de las notas; alias de fichas; registro en sesiones de cada ficha; sugerencias de
  nombres sin ficha; **Mapa** de la campaña con hilos entre fichas basados en las notas. Avisos agrupados.
- **3.0.0** — Fase 3: Campaña (sesiones con notas en punteo, bitácora con enlaces y "Aparece en",
  tablero de líneas de historia, búsqueda en toda la campaña, guardado automático). Base de datos v3.
- **2.0.0** — Fase 2: Compendio (monstruos, hechizos y reglas del SRD 5.2.1, filtros, entradas propias,
  duplicar como propia, añadir al combate, bloque de estadísticas desde el Combate). La iniciativa automática
  usa ahora el bonificador oficial de Iniciativa 2024 de cada monstruo.
- **1.1.1** — Para aliados, iniciativa, HP y CA son opcionales (solo el nombre es obligatorio).
- **1.1.0** — Interfaz en inglés por defecto con opción de español y alemán (Ajustes).
  Sugerencias de monstruos del SRD 5.2 al añadir combatientes, con carga automática de HP, AC e iniciativa.
- **1.0.1** — Guardado inmediato de cada cambio (antes podía perderse el último si la app se cerraba).
- **1.0.0** — Fase 1: base de la app y panel de Combate.
