// Reloj de juego: cuánto tiempo ha pasado dentro de la partida.
// Se guarda en IndexedDB (kv 'clock'): fecha de inicio, una lista de avances de tiempo (descansos, viajes…)
// y el clima de cada día. Calendario de los Reinos Olvidados (Harptos) o simplemente "Día N".

import { kvGet, kvSet } from './db.js';
import { normalize } from './monsters.js';

export const MONTHS = ['Hammer', 'Alturiak', 'Ches', 'Tarsakh', 'Mirtul', 'Kythorn', 'Flamerule', 'Eleasis', 'Eleint', 'Marpenoth', 'Uktar', 'Nightal'];
// Fiestas de Harptos: días sueltos entre meses. Shieldmeet va tras Midsummer en los años divisibles por 4.
const FESTIVAL_AFTER = { 0: 'Midwinter', 3: 'Greengrass', 6: 'Midsummer', 8: 'Highharvestide', 10: 'Feast of the Moon' };
export const WEATHER = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'wind', 'hot', 'cold'];
export const WEATHER_ICON = { clear: 'sun', cloudy: 'cloud', rain: 'rain', storm: 'storm', snow: 'snow', fog: 'fog', wind: 'wind', hot: 'hot', cold: 'cold' };
const DAY = 1440;
const MORNING = 8 * 60; // hora a la que se despierta tras un descanso largo

// ---------- Calendario ----------

const yearCache = new Map();
export function yearDays(year) {
  if (yearCache.has(year)) return yearCache.get(year);
  const days = [];
  MONTHS.forEach((_, m) => {
    for (let d = 1; d <= 30; d++) days.push({ month: m, day: d });
    if (FESTIVAL_AFTER[m]) {
      days.push({ festival: FESTIVAL_AFTER[m] });
      if (m === 6 && year % 4 === 0) days.push({ festival: 'Shieldmeet' });
    }
  });
  yearCache.set(year, days);
  return days;
}

// Posición (1…365/366) de un día del año: { month, day } o { festival }.
export function dayOfYear(year, spec) {
  const i = yearDays(year).findIndex((d) => (spec.festival ? d.festival === spec.festival : d.month === spec.month && d.day === spec.day));
  return i === -1 ? 1 : i + 1;
}

export function dateOf(clock, dayIndex) {
  let year = clock.start.year;
  let idx = clock.start.dayOfYear - 1 + dayIndex;
  while (idx >= yearDays(year).length) { idx -= yearDays(year).length; year += 1; }
  while (idx < 0) { year -= 1; idx += yearDays(year).length; }
  return { ...yearDays(year)[idx], year };
}

// ---------- Estado ----------

let clock = null;
const listeners = new Set();
export function onClockChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => { for (const fn of listeners) fn(clock); };

export function defaultClock() {
  return { version: 1, calendar: 'harptos', start: { year: 1491, dayOfYear: dayOfYear(1491, { month: 4, day: 1 }), minute: MORNING }, events: [], weather: {} };
}

export async function loadClock() {
  const saved = await kvGet('clock').catch(() => null);
  const base = defaultClock();
  clock = saved ? { ...base, ...saved, start: { ...base.start, ...(saved.start || {}) }, events: saved.events || [], weather: saved.weather || {} } : base;
  emit();
  return clock;
}

export const getClock = () => clock;
const save = () => kvSet('clock', clock);

// Minutos desde la medianoche del día de inicio.
export function nowMinutes(c = clock, upTo = c.events.length) {
  let total = c.start.minute;
  for (let i = 0; i < upTo; i++) total += c.events[i].minutes;
  return total;
}
export const dayIndexOf = (minutes) => Math.floor(minutes / DAY);
export const minuteOfDay = (minutes) => ((minutes % DAY) + DAY) % DAY;
export const elapsed = (c = clock) => nowMinutes(c) - c.start.minute;

// ---------- Avanzar el tiempo ----------

// Descanso largo: si se acuestan de tarde o de noche, se despiertan a las 8:00; siempre dura al menos 8 horas.
export function longRestMinutes(minute) {
  const m = minuteOfDay(minute);
  const untilMorning = m < 5 * 60 ? MORNING - m : DAY - m + MORNING;
  return m >= 16 * 60 || m < 5 * 60 ? Math.max(8 * 60, untilMorning) : 8 * 60;
}
export const nextMorningMinutes = (minute) => DAY - minuteOfDay(minute) + MORNING;
// Hasta la próxima mañana: si ya es de madrugada (antes de las 5:00), la mañana de ese mismo día.
const untilMorning = (minute) => (minuteOfDay(minute) < 5 * 60 ? MORNING - minuteOfDay(minute) : nextMorningMinutes(minute));
// Si un mismo día se menciona más de un clima, queda el más notable.
const SEVERITY = ['clear', 'cloudy', 'hot', 'cold', 'wind', 'fog', 'rain', 'snow', 'storm'];

function minutesFor(kind, amount, at) {
  if (kind === 'long') return longRestMinutes(at);
  if (kind === 'short') return 60;
  if (kind === 'next-day') return nextMorningMinutes(at);
  if (kind === 'travel') return Math.max(1, amount || 1) * DAY;
  return Math.max(0, Math.round(amount || 0));
}

export async function advance(kind, { amount = 0, sessionId = null, label = '' } = {}) {
  const minutes = minutesFor(kind, amount, nowMinutes());
  if (!minutes) return null;
  const ev = { id: `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, kind, minutes, amount, sessionId, label, createdAt: new Date().toISOString() };
  clock.events.push(ev);
  await save();
  emit();
  return ev;
}

export async function undoLast() {
  const ev = clock.events.pop();
  await save();
  emit();
  return ev;
}

export async function setWeather(dayIndex, kind, sessionId = null) {
  if (kind) clock.weather[dayIndex] = { kind, sessionId, auto: false };
  else delete clock.weather[dayIndex];
  await save();
  emit();
}

export async function setSettings(patch) {
  clock = { ...clock, ...patch, start: { ...clock.start, ...(patch.start || {}) } };
  await save();
  emit();
}

// ---------- Reconstruir desde las notas de sesión ----------

const NUMBER_WORDS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  ein: 1, einen: 1, eine: 1, zwei: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10 };
const NUM = '(\\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|a|one|two|three|four|five|six|seven|eight|nine|ten|ein|einen|eine|zwei|drei|vier|funf|sechs|sieben|acht|neun|zehn)';
const TRAVEL = [
  new RegExp(`\\b${NUM} dias? de (?:viaje|camino|marcha|travesia)`),
  new RegExp(`\\b(?:viajan|caminan|marchan|cabalgan|navegan)(?: durante)? ${NUM} dias?`),
  new RegExp(`\\b${NUM} days? of (?:travel|travelling|traveling|walking|marching|riding)`),
  new RegExp(`\\b(?:travel|travelled|traveled|walk|walked|ride|rode|march|marched|sail|sailed) for ${NUM} days?`),
  new RegExp(`\\b${NUM} tage? (?:reise|unterwegs|marsch)`),
];
const SHORT = /\b(descanso corto|descansan (?:una|1) hora|descansan un rato|short rest|rest for (?:an|one|1) hour|kurze rast)\b/;
const LONG = /\b(descanso largo|descansan|descansar|duermen|dormir|se van a dormir|se acuestan|pasan la noche|hacen noche|acampan|acampar|acampa|acampamos|acampando|arman (?:el )?campamento|montan (?:el )?campamento|pernoctan|pernoctar|long rest|sleep|slept|make camp|made camp|camp for the night|spend the night|spent the night|lange rast|schlafen|ubernachten|nachtlager)\b/;
const NEXT_DAY = /\b(al dia siguiente|a la manana siguiente|a la manana|al amanecer|al despertar|next day|next morning|the following day|at dawn|am nachsten (?:tag|morgen)|im morgengrauen)\b/;
const WEATHER_WORDS = {
  storm: /\b(tormenta|tormentas|truenos?|relampagos?|tempestad|storm|stormy|thunder|lightning|gewitter|unwetter)\b/,
  snow: /\b(nieve|nieva|nevada|nevando|ventisca|snow|snowing|blizzard|schnee|schneesturm)\b/,
  rain: /\b(llueve|lluvia|lluvioso|llovizna|lloviendo|chubasco|aguacero|rain|raining|rainy|drizzle|downpour|regen|regnet)\b/,
  fog: /\b(niebla|neblina|bruma|fog|foggy|mist|misty|nebel|neblig)\b/,
  wind: /\b(viento|ventoso|vendaval|ventarron|wind|windy|gale|sturmisch)\b/,
  cloudy: /\b(nublado|nubes|encapotado|cloudy|overcast|bewolkt|wolken)\b/,
  clear: /\b(despejado|soleado|cielo azul|dia de sol|sunny|clear skies?|sonnig|klarer himmel|sonnenschein)\b/,
  hot: /\b(calor|caluroso|sofocante|bochorno|hot|heat|heatwave|heiss|hitze)\b/,
  cold: /\b(frio|helado|helada|escarcha|gelido|cold|freezing|frost|kalt|eisig)\b/,
};

function numberFrom(token) {
  return /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token] || 1;
}

/**
 * Recorre las notas de todas las sesiones (de la primera a la última) y arma la línea de tiempo:
 * descansos largos (una noche), cortos (1 hora), "al día siguiente", días de viaje y el clima mencionado.
 * No cambia nada: devuelve { events, weather, stats } para revisarlo antes de aplicarlo.
 */
export function reconstruct(sessions, c = clock) {
  const events = [];
  const weather = {};
  let cur = c.start.minute;
  const stats = { long: 0, short: 0, nextDay: 0, travelDays: 0, weather: 0 };
  const push = (kind, minutes, session, note, amount = 0) => {
    events.push({ id: `t-${events.length.toString(36)}-${Math.random().toString(36).slice(2, 5)}`, kind, minutes, amount, sessionId: session.id, label: '', auto: true, source: note.text });
    cur += minutes;
  };
  let seen = 0;    // notas leídas
  let longAt = -9; // nota del último descanso largo
  const ordered = [...sessions].sort((a, b) => (a.number ?? 0) - (b.number ?? 0) || String(a.date).localeCompare(String(b.date)));
  for (const session of ordered) {
    for (const note of session.notes || []) {
      const text = normalize(note.text || '');
      if (!text.trim()) continue;
      seen += 1;
      // Primero el clima (describe el momento de la nota: "acampan; tormenta por la noche"), luego el tiempo.
      const kind = Object.keys(WEATHER_WORDS).find((k) => WEATHER_WORDS[k].test(text));
      if (kind) {
        const day = dayIndexOf(cur);
        const before = weather[day];
        if (!before || SEVERITY.indexOf(kind) >= SEVERITY.indexOf(before.kind)) {
          weather[day] = { kind, sessionId: session.id, auto: true, source: note.text };
        }
        stats.weather += 1;
      }
      const travel = TRAVEL.map((re) => text.match(re)).find(Boolean);
      if (travel) {
        const days = numberFrom(travel[1]);
        push('travel', days * DAY, session, note, days);
        stats.travelDays += days;
      } else if (SHORT.test(text)) {
        push('short', 60, session, note);
        stats.short += 1;
      } else if (LONG.test(text)) {
        // En las notas, un descanso largo es una noche: se despiertan a la mañana siguiente.
        push('long', untilMorning(cur), session, note);
        longAt = seen;
        stats.long += 1;
      } else if (NEXT_DAY.test(text) && !(events.at(-1)?.kind === 'long' && seen - longAt <= 2)) {
        // "Acampan. A la mañana siguen…": el descanso largo ya los llevó a la mañana.
        push('next-day', nextMorningMinutes(cur), session, note);
        stats.nextDay += 1;
      }
    }
  }
  stats.days = dayIndexOf(cur) + 1;
  return { events, weather, stats };
}

// Reemplaza la línea de tiempo por la reconstruida (conserva el clima puesto a mano).
export async function applyReconstruction(result) {
  const manualWeather = Object.fromEntries(Object.entries(clock.weather).filter(([, w]) => !w.auto));
  clock = { ...clock, events: result.events, weather: { ...result.weather, ...manualWeather } };
  await save();
  emit();
}

// ---------- Para mostrar ----------

export function timeOfDay(minute) {
  const h = Math.floor(minuteOfDay(minute) / 60);
  if (h < 5) return 'night';
  if (h < 7) return 'dawn';
  if (h < 12) return 'morning';
  if (h < 14) return 'noon';
  if (h < 19) return 'afternoon';
  if (h < 21) return 'dusk';
  return 'night';
}

export const hhmm = (minute) => {
  const m = minuteOfDay(minute);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// Línea de tiempo por días: [{ day, events: [{ ev, at }], weather, sessions: Set }]
export function timeline(c = clock) {
  const days = new Map();
  const dayOf = (i) => {
    if (!days.has(i)) days.set(i, { day: i, events: [], weather: c.weather[i] || null, sessions: new Set() });
    return days.get(i);
  };
  dayOf(0);
  let cur = c.start.minute;
  for (const ev of c.events) {
    const startDay = dayIndexOf(cur);
    cur += ev.minutes;
    const entry = dayOf(startDay);
    entry.events.push({ ev, from: cur - ev.minutes, at: cur });
    if (ev.sessionId) entry.sessions.add(ev.sessionId);
    dayOf(dayIndexOf(cur));
  }
  for (const k of Object.keys(c.weather)) dayOf(Number(k));
  return [...days.values()].sort((a, b) => a.day - b.day);
}
