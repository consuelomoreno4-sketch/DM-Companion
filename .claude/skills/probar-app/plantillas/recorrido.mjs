// Recorrido rápido: abre cada panel (y cada vista de Campaña) en los idiomas y anchos pedidos, saca
// fotos y avisa de errores de JS, archivos que no cargan, claves sin traducir y botones < 44 px.
// Uso: node recorrido.mjs --salida=<carpeta> [--idiomas=en,es,de] [--paneles=combate,campana] [--anchos=1232,1848]
import { abrir, irA, argumento, clavesSinTraducir, botonesPequenos, informe, PANELES, ANCHOS } from './base.mjs';

const idiomas = argumento('idiomas', 'en').split(',');
const paneles = argumento('paneles', PANELES.join(',')).split(',');
const anchos = argumento('anchos', ANCHOS.join(',')).split(',').map(Number);
const salida = argumento('salida', 'capturas');

const errores = [];
const sinTraducir = new Set();
const pequenos = new Set();

for (const idioma of idiomas) for (const ancho of anchos) {
  const app = await abrir({ idioma, ancho, salida: `${salida}/${idioma}-${ancho}` });
  for (const panel of paneles) {
    await irA(app.page, panel);
    await app.page.waitForLoadState('networkidle');
    await app.foto(panel);
    if (panel === 'campana') {
      // Cada vista de Campaña: Sesiones, Códice, Historias, Mapa, Tiempo.
      const vistas = await app.page.$$eval('#camp-views input', (xs) => xs.map((x) => x.value));
      for (const vista of vistas) {
        await app.page.tap(`#camp-views .seg:has(input[value="${vista}"])`);
        await app.page.waitForLoadState('networkidle');
        await app.foto(`campana-${vista}`);
        for (const c of await clavesSinTraducir(app.page)) sinTraducir.add(`${idioma}: ${c}`);
      }
    }
    for (const c of await clavesSinTraducir(app.page)) sinTraducir.add(`${idioma}: ${c}`);
    for (const b of await botonesPequenos(app.page)) pequenos.add(`${ancho} px, ${panel}: ${b}`);
  }
  errores.push(...app.errores.map((e) => `[${idioma}, ${ancho} px] ${e}`));
  await app.cerrar();
}

process.exitCode = informe(errores, {
  'Posibles claves sin traducir': [...sinTraducir],
  'Botones de menos de 44 px (revisar; no siempre es error)': [...pequenos],
});
