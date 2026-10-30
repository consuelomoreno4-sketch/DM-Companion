// Ayudas comunes para probar DM Companion con Playwright, como en la tablet:
// horizontal, con toque, sin internet (solo localhost) y con el idioma elegido.
// Las plantillas la importan; una prueba nueva en el scratchpad la importa con su ruta absoluta.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright'); // ya instalado en el entorno; no instalar otro

export const URL_APP = process.env.URL_APP || 'http://localhost:8765/';
export const PANELES = ['combate', 'compendio', 'campana', 'ambientacion'];
export const IDIOMAS = ['en', 'es', 'de'];

// Anchos de tablet en horizontal (CSS px); el alto sale de la proporción 16:10.
export const ANCHOS = [1232, 1848];
const altoDe = (ancho) => Math.round((ancho * 10) / 16);

// Lee `--clave=valor` de la línea de comandos.
export function argumento(nombre, porDefecto) {
  const a = process.argv.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3) : porDefecto;
}

// Abre el navegador y una página nueva (datos vacíos) con el idioma pedido.
// Devuelve { browser, page, errores, foto, cerrar }.
export async function abrir({ idioma = 'en', salida = argumento('salida', 'capturas'), ancho = ANCHOS[0], alto = altoDe(ancho) } = {}) {
  mkdirSync(salida, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: ancho, height: alto },
    hasTouch: true,
    reducedMotion: 'reduce', // la app deja las transiciones en 1 ms: capturas sin estados a medias
    serviceWorkers: process.env.CON_SW ? 'allow' : 'block', // sin caché vieja salvo que se pida
  });
  // Nada sale a internet: ni la IA ni recursos externos (la app debe funcionar sin ellos).
  await context.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), (r) => r.abort());

  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => {
    const u = new URL(r.url());
    if (['localhost', '127.0.0.1'].includes(u.hostname)) errores.push(`requestfailed: ${u.pathname}`);
  });

  await page.goto(URL_APP);
  await listo(page);
  if (idioma !== 'en') await cambiarIdioma(page, idioma);

  let n = 0;
  const foto = async (nombre, opciones = {}) => {
    const ruta = join(salida, `${String(++n).padStart(2, '0')}-${nombre}.png`);
    await page.screenshot({ path: ruta, ...opciones });
    console.log(`foto: ${ruta}`);
    return ruta;
  };
  const cerrar = () => browser.close();
  return { browser, context, page, errores, foto, cerrar };
}

// Espera a que la app haya arrancado (pestañas traducidas y un panel visible).
export async function listo(page) {
  await page.waitForSelector('.tab[aria-current="page"]');
  await page.waitForLoadState('networkidle');
}

// Guarda el idioma como lo hace Ajustes (kv 'settings') y recarga.
export async function cambiarIdioma(page, idioma) {
  await page.evaluate((lang) => new Promise((ok, mal) => {
    const req = indexedDB.open('dm-companion');
    req.onerror = () => mal(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readwrite');
      const kv = tx.objectStore('kv');
      const get = kv.get('settings');
      get.onsuccess = () => kv.put({ ...(get.result || {}), lang }, 'settings');
      tx.oncomplete = () => { req.result.close(); ok(); };
      tx.onerror = () => mal(tx.error);
    };
  }), idioma);
  await page.reload();
  await listo(page);
}

// Va a un panel tocando su pestaña (como el dedo en la tablet).
export async function irA(page, panel) {
  await page.tap(`.tab[data-panel="${panel}"]`);
  await page.waitForSelector(`#panel-${panel}:not([hidden])`);
}

// Textos que parecen claves sin traducir (p. ej. "camp.codex") en lo visible.
export async function clavesSinTraducir(page) {
  return page.evaluate(() => {
    const raros = new Set();
    const re = /^[a-z]+(\.[a-zA-Z0-9]+)+$/;
    const visto = (el) => el && el.offsetParent !== null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const s = walker.currentNode.textContent.trim();
      if (re.test(s) && visto(walker.currentNode.parentElement)) raros.add(s);
    }
    for (const el of document.querySelectorAll('[aria-label],[placeholder],[title]')) {
      for (const a of ['aria-label', 'placeholder', 'title']) {
        const v = el.getAttribute(a)?.trim();
        if (v && re.test(v) && visto(el)) raros.add(v);
      }
    }
    return [...raros];
  });
}

// Botones visibles más pequeños que 44 px (regla de diseño).
export async function botonesPequenos(page) {
  return page.evaluate(() => [...document.querySelectorAll('button, .btn, .tab, .seg')]
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
    .map(({ el, r }) => `${el.id ? `#${el.id}` : el.className} (${Math.round(r.width)}×${Math.round(r.height)})`));
}

// Resumen final: imprime errores y devuelve el código de salida (0 = bien).
export function informe(errores, extra = {}) {
  let malo = errores.length > 0;
  for (const [titulo, lista] of Object.entries(extra)) {
    if (!lista.length) continue;
    console.log(`\n${titulo}:`); for (const x of lista) console.log(`  - ${x}`);
  }
  if (errores.length) { console.log('\nERRORES:'); for (const e of errores) console.log(`  - ${e}`); }
  console.log(malo ? '\nRESULTADO: con errores' : '\nRESULTADO: sin errores');
  return malo ? 1 : 0;
}
