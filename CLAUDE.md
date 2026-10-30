# DM Companion — guía para Claude

App web para dirigir partidas de D&D (reglas 2024) en una tablet Android grande, en horizontal,
con dedo, S Pen y teclado opcional. Especificación completa y registro de cambios: `SPEC.md`.
Guía para la usuaria: `README.md`.

## Con quién trabajas

- La dueña del proyecto **no programa**: respóndele en **español**, en términos simples, y explica
  qué cambió y qué tiene que hacer ella en la tablet (p. ej. aceptar el aviso de actualización).
- Dirige *Dragon of Icespire Peak*. Sus notas vienen de Samsung Notes, Google Docs o Infomaniak
  (.docx), a veces en párrafos que empiezan con la fecha (`01.03.2026. …`).
- El repositorio es **público**: no escribas datos personales en archivos, commits ni PRs.

## Restricciones fijas

- **Sin paso de compilación**: HTML, CSS y módulos ES nativos. Nada de npm, bundlers ni frameworks.
- **100 % sin internet** una vez instalada (PWA): fuentes, iconos, datos y bibliotecas van en el
  repo. Solo las funciones con IA usan internet, y siempre de forma opcional.
- **Datos solo en el dispositivo** (IndexedDB `dm-companion`). La clave de API (`kv 'ai'`) nunca va
  al repo ni a la copia de seguridad.
- **Copyright**: nada de mapas, textos ni imágenes oficiales de la aventura. Contenido SRD 5.2 con
  atribución CC-BY; el resto, redactado por nosotros.
- **Sin identificadores de modelo** en commits, PRs ni código publicado.
- Se publica con GitHub Pages desde `main`. Para publicar: `/publicar`.

## Mapa de módulos (`js/`)

| Área | Archivos |
|---|---|
| Arranque, ajustes, copia de seguridad | `app.js`, `db.js`, `ui.js` |
| Idiomas | `i18n.js` + `i18n/{en,es,de}.js` |
| Combate | `combat.js`, `combat-state.js`, `conditions.js` |
| Compendio (SRD) | `compendium.js`, `compendium-data.js`, `monsters.js`, `markdown.js` |
| Campaña: datos y vistas | `campaign.js`, `campaign-data.js`, `campaign-ui.js` |
| Campaña: sesiones, códice, historias | `campaign-sessions.js`, `campaign-codex.js`, `campaign-stories.js` |
| Campaña: mapa | `campaign-map.js` (mapa dibujado + vistas), `maps.js` (mapas propios y fichas) |
| Campaña: importar y detectar | `campaign-import.js`, `campaign-detect.js`, `data/packs/*.json` |
| Reloj de juego | `clock.js`, `clock-ui.js`, `campaign-time.js` |
| IA (opcional, con clave) | `ai.js`, `ai-ui.js`, `ambience.js`, `campaign-ai.js` |

Otros: `index.html` (paneles, ventanas, sprite de iconos `#i-…`), `css/app.css` (todo el estilo,
variables en `:root`), `sw.js` (caché sin internet), `data/` (SRD), `tools/build_srd.py`.

## Convenciones

- Escribe como el código que ya existe: comentarios en español, breves; nombres en inglés.
- **Textos de la interfaz**: nunca escritos directo en el código. Usa `t('clave')` / `tn('clave', n)`
  (plurales con `.one` / `.other`) y agrega la clave en **los tres** diccionarios
  (skill `agregar-traducciones`). El idioma por defecto es inglés.
- **Archivo nuevo** que la app carga → agrégalo a `FILES` en `sw.js`, o no funcionará sin internet.
- Cambios de datos en IndexedDB: subir la versión en `db.js` con migración que conserve lo existente.
- Diseño: tema oscuro azul grisáceo con ámbar; contraste WCAG AA; Cinzel (títulos) e Inter (texto);
  números con `tabular-nums`; botones ≥ 44 px; espacios en múltiplos de 8 px; radio 6 px;
  nada que dependa de pasar el mouse por encima; respetar `prefers-reduced-motion`.
- Atajos de teclado: nunca activos mientras se escribe ni con una ventana abierta.
- Antes de dar algo por terminado: `node --check` de cada JS tocado y prueba en el navegador a
  ancho de tablet (skill `probar-app`).
- Commits y pushes solo cuando la dueña lo pide o con `/publicar`.
