// Plantilla de flujo: copia este archivo al scratchpad, cambia el import a la ruta absoluta de
// base.mjs y reemplaza los pasos por los del cambio que pruebas. Este ejemplo agrega un
// combatiente, avanza un turno y comprueba que se guarda al recargar.
// Uso: node flujo.mjs --salida=<carpeta> [--idioma=es]
import { abrir, irA, listo, argumento, informe } from './base.mjs';

const app = await abrir({ idioma: argumento('idioma', 'en') });
const { page, foto } = app;
const fallos = [];
const comprobar = (ok, texto) => { if (!ok) fallos.push(texto); console.log(`${ok ? '✓' : '✗'} ${texto}`); };

await irA(page, 'combate');

// 1. Abrir la ventana «Agregar» y llenarla (con teclado de pantalla: fill sirve igual).
await page.tap('#btn-add');
await page.waitForSelector('#dlg-add[open]');
await page.fill('#add-name', 'Goblin prueba');
await page.fill('#form-add [name="init"]', '14');
await page.fill('#form-add [name="hpMax"]', '7');
await page.fill('#form-add [name="ac"]', '15');
await foto('agregar-lleno');
await page.tap('#form-add button[value="close"]');
await page.waitForSelector('#dlg-add[open]', { state: 'detached' });

// 2. Debe aparecer en la lista de iniciativa.
await page.waitForSelector('#turn-list :text("Goblin prueba")');
comprobar(await page.isVisible('#turn-list :text("Goblin prueba")'), 'aparece en la iniciativa');
await page.tap('#btn-next');
await foto('turno-siguiente');

// 3. Se conserva al recargar (IndexedDB).
await page.reload();
await listo(page);
comprobar(await page.isVisible('#turn-list :text("Goblin prueba")'), 'se conserva al recargar');
await foto('tras-recargar');

await app.cerrar();
process.exitCode = informe([...app.errores, ...fallos]);
