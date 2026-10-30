# Probar la app — detalles

## Archivos

| Archivo | Qué hace |
|---|---|
| `scripts/servidor.sh` | Sirve el repo en `http://localhost:8765/` con `python3 -m http.server`. `parar` lo detiene. `PUERTO=…` cambia el puerto (y entonces `URL_APP=…` en las pruebas) |
| `plantillas/base.mjs` | Ayudas comunes (abajo). No se ejecuta sola |
| `plantillas/recorrido.mjs` | Abre los 4 paneles y las 5 vistas de Campaña por idioma y ancho (1232 y 1848 px); captura cada uno; avisa de errores, claves sin traducir y botones < 44 px |
| `plantillas/flujo.mjs` | Ejemplo para copiar: agrega un combatiente, pasa turno y comprueba que se conserva al recargar |
| `plantillas/sin-internet.mjs` | Activa el service worker, corta la red, recarga y abre cada panel; comprueba que `data/` sale de la caché |

## Qué da `base.mjs`

- `abrir({ idioma, salida, ancho })` → `{ page, context, errores, foto(nombre), cerrar() }`. Tablet
  horizontal con toque (1232×770 por defecto; alto en 16:10); `prefers-reduced-motion: reduce`, así
  las transiciones no quedan a medias en las capturas; datos vacíos (contexto nuevo); internet bloqueado (solo
  `localhost`); service worker bloqueado salvo con `CON_SW=1`. `errores` junta errores de JS,
  `console.error` y archivos locales que no cargan.
- `foto(nombre)` → `<salida>/NN-nombre.png`.
- `irA(page, 'combate' | 'compendio' | 'campana' | 'ambientacion')` → toca la pestaña.
- `cambiarIdioma(page, 'es')` → guarda `kv 'settings'.lang` como Ajustes y recarga.
- `listo(page)`, `clavesSinTraducir(page)`, `botonesPequenos(page)`, `argumento(nombre, def)`,
  `informe(errores, extra)` → imprime y devuelve el código de salida.

## Consejos

- Usa `page.tap()` (dedo), no `click()`, salvo para probar el mouse.
- Botones segmentados (`.seg`): el `<input>` invisible tapa al `<span>`; toca la etiqueta:
  `page.tap('#camp-views .seg:has(input[value="codex"])')`.
- Ventanas: abiertas = `dialog[open]`. Para esperar que se cierren:
  `waitForSelector('#dlg-x[open]', { state: 'detached' })`.
- Atajos de teclado: `page.keyboard.press('2')` con el foco fuera de campos y sin ventana abierta.
- Otro tamaño: `abrir({ ancho: 1024, alto: 600 })`.
- Datos de ejemplo: créalos con la interfaz (como en `flujo.mjs`) o importando una copia de seguridad
  de prueba escrita en el scratchpad; nunca uses datos reales de la dueña.
- Selectores útiles: pestañas `.tab[data-panel=…]`, paneles `#panel-<nombre>`, combate `#btn-add`,
  `#btn-next`, `#turn-list`, `#board`; campaña `#camp-views`, `#camp-body`, `#camp-search`;
  ajustes `#btn-settings` → `#dlg-settings`; avisos `#toasts`.
