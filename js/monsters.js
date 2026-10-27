// Lista de monstruos del SRD 5.2 (CC-BY-4.0) para las sugerencias al añadir.
// Archivo data/monsters.json: { i: id, n: nombre, s: tamaño, t: tipo, cr, hp, hd: dados de golpe, ac, dex }.

let list = null;
let loading = null;

export function loadMonsters() {
  if (list) return Promise.resolve(list);
  loading ??= fetch('data/monsters.json')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      list = data.map((m) => ({ ...m, key: normalize(m.n) }));
      return list;
    })
    .catch((err) => {
      loading = null; // se puede volver a intentar
      throw err;
    });
  return loading;
}

// Sin mayúsculas ni tildes, para que "dragon" encuentre "Dragón".
function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Primero los que empiezan por lo escrito, luego los que tienen una palabra que empieza así,
// luego los que lo contienen en cualquier parte.
export function searchMonsters(query, limit = 8) {
  if (!list) return [];
  const q = normalize(query.trim());
  if (!q) return [];
  const scored = [];
  for (const m of list) {
    const pos = m.key.indexOf(q);
    if (pos === -1) continue;
    const rank = pos === 0 ? 0 : m.key[pos - 1] === ' ' || m.key[pos - 1] === '-' ? 1 : 2;
    scored.push([rank, m]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].n.localeCompare(b[1].n));
  return scored.slice(0, limit).map(([, m]) => m);
}

export function findMonster(id) {
  return list?.find((m) => m.i === id) ?? null;
}

// 0.125 → "1/8"
export function crText(cr) {
  return { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' }[cr] ?? String(cr);
}

export function dexMod(m) {
  return Math.floor((m.dex - 10) / 2);
}

// Tirada de iniciativa: d20 + modificador de Destreza.
export function rollInitiative(m) {
  const d20 = 1 + Math.floor(Math.random() * 20);
  const mod = dexMod(m);
  return { d20, mod, total: d20 + mod };
}
