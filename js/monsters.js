// Monstruos para las sugerencias al añadir combatientes y para el Compendio:
// los del SRD 5.2.1 (data/monsters.json) más los propios del usuario.
// Cada uno: { i: id, n: nombre, s: "Small Fey (Goblinoid)", t: tipo, cr, hp, ac, init: bonificador, src: 'srd' | 'hb' }

let srd = null;
let loading = null;
let homebrew = [];

export function loadMonsters() {
  if (srd) return Promise.resolve(srd);
  loading ??= fetch('data/monsters.json')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      srd = data.map((m) => ({ ...m, src: 'srd', key: normalize(m.n) }));
      return srd;
    })
    .catch((err) => {
      loading = null; // se puede volver a intentar
      throw err;
    });
  return loading;
}

// Lo llama el Compendio cada vez que cambian los monstruos propios.
export function setHomebrewMonsters(list) {
  homebrew = list.map((m) => ({ ...m, src: 'hb', key: normalize(m.n) }));
}

export function allMonsters() {
  return [...(srd || []), ...homebrew];
}

// Sin mayúsculas ni tildes, para que "dragon" encuentre "Dragón".
export function normalize(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Primero los que empiezan por lo escrito, luego los que tienen una palabra que empieza así,
// luego los que lo contienen en cualquier parte. Los propios van antes en caso de empate.
export function searchMonsters(query, limit = 8) {
  const q = normalize(query.trim());
  if (!q) return [];
  const scored = [];
  for (const m of allMonsters()) {
    const pos = m.key.indexOf(q);
    if (pos === -1) continue;
    const rank = pos === 0 ? 0 : m.key[pos - 1] === ' ' || m.key[pos - 1] === '-' ? 1 : 2;
    scored.push([rank, m]);
  }
  scored.sort((a, b) => a[0] - b[0] || (a[1].src === 'hb' ? -1 : 0) - (b[1].src === 'hb' ? -1 : 0) || a[1].n.localeCompare(b[1].n));
  return scored.slice(0, limit).map(([, m]) => m);
}

export function findMonster(id) {
  return allMonsters().find((m) => m.i === id) ?? null;
}

// 0.125 → "1/8"
export function crText(cr) {
  return { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' }[cr] ?? String(cr);
}

// Tirada de iniciativa: d20 + bonificador de Iniciativa del monstruo (2024).
export function rollInitiative(m) {
  const d20 = 1 + Math.floor(Math.random() * 20);
  const mod = Number(m.init) || 0;
  return { d20, mod, total: d20 + mod };
}
