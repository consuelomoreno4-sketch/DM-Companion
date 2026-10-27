// Las 15 condiciones de D&D 2024 (resumen basado en el SRD 5.2, CC-BY-4.0).
// "Agotamiento" se maneja aparte porque va por niveles (1–6).

export const CONDITIONS = [
  { key: 'blinded', name: 'Cegado', desc: 'No puede ver y falla las pruebas que requieran vista. Sus tiradas de ataque tienen Desventaja; los ataques contra él tienen Ventaja.' },
  { key: 'charmed', name: 'Hechizado', desc: 'No puede atacar a quien lo hechizó ni elegirlo como objetivo de efectos dañinos. Quien lo hechizó tiene Ventaja en pruebas de interacción social con él.' },
  { key: 'deafened', name: 'Ensordecido', desc: 'No puede oír y falla las pruebas que requieran oído.' },
  { key: 'frightened', name: 'Asustado', desc: 'Desventaja en pruebas de característica y tiradas de ataque mientras vea la fuente de su miedo. No puede acercarse voluntariamente a ella.' },
  { key: 'grappled', name: 'Agarrado', desc: 'Velocidad 0. Desventaja en ataques contra cualquiera que no sea quien lo agarra. Quien lo agarra puede arrastrarlo (cuesta 1 pie extra por cada pie).' },
  { key: 'incapacitated', name: 'Incapacitado', desc: 'No puede realizar acciones, acciones adicionales ni reacciones. Pierde la Concentración. No puede hablar. Si lo está al tirar iniciativa, tira con Desventaja.' },
  { key: 'invisible', name: 'Invisible', desc: 'Ventaja en la iniciativa. No puede ser afectado por nada que requiera verlo. Sus ataques tienen Ventaja; los ataques contra él, Desventaja (si no se le puede ver).' },
  { key: 'paralyzed', name: 'Paralizado', desc: 'Incapacitado. Velocidad 0. Falla las salvaciones de Fuerza y Destreza. Los ataques contra él tienen Ventaja; un impacto a 5 pies o menos es un crítico.' },
  { key: 'petrified', name: 'Petrificado', desc: 'Convertido en piedra (peso ×10, no envejece). Incapacitado, velocidad 0. Ataques contra él con Ventaja. Falla salvaciones de Fuerza y Destreza. Resistencia a todo el daño e inmune a Envenenado.' },
  { key: 'poisoned', name: 'Envenenado', desc: 'Desventaja en tiradas de ataque y pruebas de característica.' },
  { key: 'prone', name: 'Derribado', desc: 'Solo puede arrastrarse o gastar la mitad de su velocidad para levantarse. Desventaja en sus ataques. Ataques contra él: Ventaja a 5 pies o menos, Desventaja más lejos.' },
  { key: 'restrained', name: 'Apresado', desc: 'Velocidad 0. Desventaja en sus ataques y en salvaciones de Destreza. Los ataques contra él tienen Ventaja.' },
  { key: 'stunned', name: 'Aturdido', desc: 'Incapacitado. Falla las salvaciones de Fuerza y Destreza. Los ataques contra él tienen Ventaja.' },
  { key: 'unconscious', name: 'Inconsciente', desc: 'Incapacitado y Derribado; suelta lo que sostiene. Velocidad 0. Falla salvaciones de Fuerza y Destreza. Ataques contra él con Ventaja; impactos a 5 pies o menos son críticos.' },
];

export const EXHAUSTION = {
  key: 'exhaustion',
  name: 'Agotamiento',
  desc: 'Niveles 1–6, acumulativos. Cada nivel resta 2 a todas las Pruebas d20 y 5 pies de velocidad (nivel 3 = −6 y −15 pies). En el nivel 6 la criatura muere. Un Descanso Largo quita 1 nivel.',
};

export const CONDITION_NAMES = Object.fromEntries(CONDITIONS.map((c) => [c.key, c.name]));
