// Comprueba que la app funciona sin internet: carga con el service worker, espera a que guarde la
// caché, corta la red por completo, recarga y abre cada panel. Úsala si cambió sw.js o si se
// agregó un archivo que la app carga.
// Uso: CON_SW=1 node sin-internet.mjs --salida=<carpeta>
import { abrir, irA, listo, informe, PANELES } from './base.mjs';

if (!process.env.CON_SW) process.env.CON_SW = '1';
const app = await abrir();
const { page, context, foto } = app;

// Espera a que el service worker esté activo y controle la página (la caché ya está llena).
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await listo(page);
const controlada = await page.evaluate(() => !!navigator.serviceWorker.controller);

await context.setOffline(true);
app.errores.length = 0; // solo cuentan los errores sin internet
await page.reload();
await listo(page);
for (const panel of PANELES) {
  await irA(page, panel);
  await foto(`sin-internet-${panel}`);
}
// Los datos del SRD también deben venir de la caché.
const srd = await page.evaluate(() => fetch('data/monsters.json').then((r) => r.ok).catch(() => false));

await app.cerrar();
const fallos = [];
if (!controlada) fallos.push('el service worker no tomó el control de la página');
if (!srd) fallos.push('data/monsters.json no está disponible sin internet');
process.exitCode = informe([...app.errores, ...fallos]);
