// Mapas propios para el modo Lugares: imágenes que el usuario sube desde su tablet (por ejemplo, el mapa de su
// aventura). Se guardan solo en el dispositivo (kv 'maps') y van en la copia de seguridad; nunca en GitHub.
// Cada lugar tiene una posición por mapa: `pos` en el mapa dibujado y `mapPos[idDelMapa]` en los propios.
// El grupo de aventureros tiene su propia ficha en el mapa (kv 'party': { [idDelMapa]: { x, y } }).

import { kvGet, kvSet } from './db.js';

export const DRAWN = 'drawn';      // el mapa dibujado de la Costa de la Espada
const MAX_SIDE = 4096;             // lado máximo de la imagen guardada (las fotos grandes se reducen)

let maps = null;
let party = null;
const urls = new Map();

export async function loadMaps() {
  if (!maps) maps = (await kvGet('maps').catch(() => null)) || [];
  if (!party) party = (await kvGet('party').catch(() => null)) || {};
  return maps;
}

export const listMaps = () => maps || [];
export const getMap = (id) => listMaps().find((m) => m.id === id) || null;

export function imageUrl(m) {
  if (!urls.has(m.id)) urls.set(m.id, URL.createObjectURL(m.blob));
  return urls.get(m.id);
}

// Tamaño del "mundo" (coordenadas de las fichas): 1000 de ancho; el alto sigue la proporción de la imagen.
export function worldSize(mapId) {
  const m = getMap(mapId);
  return m ? { w: 1000, h: Math.round((1000 * m.h) / m.w) } : { w: 1000, h: 700 };
}

// Reduce fotos muy grandes para no ocupar demasiado espacio en la tablet.
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 6e6) return { blob: file, w: bmp.width, h: bmp.height };
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  return { blob, w: canvas.width, h: canvas.height };
}

export async function addMap(file, name) {
  await loadMaps();
  const img = await shrink(file);
  const m = { id: `map-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name, ...img, createdAt: new Date().toISOString() };
  maps.push(m);
  await kvSet('maps', maps);
  return m;
}

export async function replaceImage(id, file) {
  const m = getMap(id);
  Object.assign(m, await shrink(file));
  URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
  await kvSet('maps', maps);
  return m;
}

export async function renameMap(id, name) {
  getMap(id).name = name;
  await kvSet('maps', maps);
}

export async function deleteMap(id) {
  maps = maps.filter((m) => m.id !== id);
  URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
  delete party[id];
  await Promise.all([kvSet('maps', maps), kvSet('party', party)]);
}

// ---------- Posiciones ----------

export const posOn = (entry, mapId) => (mapId === DRAWN ? entry.pos : entry.mapPos?.[mapId]) || null;

// Cambio para C.update(): pos = null quita el lugar de ese mapa.
export function posPatch(entry, mapId, pos) {
  if (mapId === DRAWN) return { pos: pos || null };
  const mapPos = { ...(entry.mapPos || {}) };
  if (pos) mapPos[mapId] = pos; else delete mapPos[mapId];
  return { mapPos };
}

// Último mapa usado en el modo Lugares (para volver a él).
export const lastMap = () => kvGet('lastMap').catch(() => null);
export const setLastMap = (id) => kvSet('lastMap', id).catch(() => {});

export const partyOn = (mapId) => party?.[mapId] || null;
export async function setParty(mapId, pos) {
  if (pos) party[mapId] = pos; else delete party[mapId];
  await kvSet('party', party);
}

// ---------- Aspecto de las fichas de lugar ----------

export const TOKEN_ICONS = ['pin', 'town', 'castle', 'tower', 'cave', 'mine', 'ruins', 'camp', 'tree', 'temple', 'inn', 'farm', 'anchor', 'mountain'];
export const TOKEN_COLORS = { amber: '#f0b44c', red: '#e5534b', blue: '#5b9cff', green: '#57c27a', purple: '#b07ce8', teal: '#3fb8b0', gray: '#9aa5b5', white: '#eef1f6' };

// Icono por defecto según el nombre ("Stonehill Inn" → posada, "Icespire Hold" → castillo).
const ICON_WORDS = [
  ['inn', /\b(inn|posada|taberna|tavern|gasthaus)\b/i],
  ['tower', /\b(torre|tower|turm|faro|lighthouse)\b/i],
  ['castle', /\b(castillo|castle|hold|keep|fortaleza|fortress|fuerte|fort|burg|axeholm)\b/i],
  ['mine', /\b(mina|mine|excavaci[oó]n|excavation)\b/i],
  ['tree', /\b(bosque|wood|woods|forest|wald|orchard|huerto)\b/i],
  ['temple', /\b(templo|temple|santuario|shrine|tempel|schrein|capilla|chapel)\b/i],
  ['camp', /\b(campamento|camp|lager|lodge|pabell[oó]n)\b/i],
  ['ruins', /\b(ruinas|ruins|manse|mansi[oó]n|ruine)\b/i],
  ['farm', /\b(granja|farm|rancho|ranch|hof)\b/i],
  ['cave', /\b(cueva|cave|barrow|t[uú]mulo|h[oö]hle|cripta|crypt)\b/i],
  ['anchor', /\b(puerto|port|harbor|hafen|muelle|dock)\b/i],
  ['mountain', /\b(monta[ñn]a|mountain|pico|peak|colina|hill|berg|circle|c[ií]rculo)\b/i],
  ['town', /\b(ciudad|city|pueblo|town|aldea|village|stadt|dorf)\b/i],
];
export function tokenOf(entry, links = 0) {
  const tk = entry.token || {};
  const guess = ICON_WORDS.find(([, re]) => re.test(entry.name || ''))?.[0] || (links >= 4 ? 'town' : 'pin');
  return { icon: tk.icon || guess, color: tk.color || 'green', size: tk.size || 'm' };
}
