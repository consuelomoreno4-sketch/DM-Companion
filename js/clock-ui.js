// Reloj de juego en pantalla: el botón de la barra superior (fecha, hora y clima) y su ventana para
// avanzar el tiempo (descansos, viajes…) y anotar el clima del día.

import * as K from './clock.js';
import * as C from './campaign-data.js';
import { esc, icon, toast, openDialog, closeDialog, wireDialog } from './ui.js';
import { t, tn } from './i18n.js';

let chip;
let dlg;
let body;
let openTimeline = () => {};

// ---------- Textos de fecha y hora ----------

export function dateLabel(c, dayIndex, { year = true } = {}) {
  if (c.calendar === 'days') return t('clock.dayN', { n: dayIndex + 1 });
  const d = K.dateOf(c, dayIndex);
  const yearText = year ? ` ${d.year} DR` : '';
  return d.festival ? `${d.festival}${yearText}` : `${d.day} ${K.MONTHS[d.month]}${yearText}`;
}

export function elapsedLabel(minutes) {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [];
  if (days) parts.push(tn('clock.days', days));
  if (hours) parts.push(tn('clock.hours', hours));
  if (mins && !days) parts.push(tn('clock.minutes', mins));
  return parts.join(' ') || tn('clock.minutes', 0);
}

export const weatherIcon = (kind) => icon(K.WEATHER_ICON[kind] || 'cloud');
export const isDaytime = (minute) => ['dawn', 'morning', 'noon', 'afternoon'].includes(K.timeOfDay(minute));

export function eventLabel(ev) {
  if (ev.kind === 'travel') return tn('clock.ev.travel', ev.amount || Math.round(ev.minutes / 1440));
  if (ev.kind === 'time') return t('clock.ev.time', { time: elapsedLabel(ev.minutes) });
  return ev.label || t(`clock.ev.${ev.kind}`);
}

// ---------- Botón de la barra superior ----------

function renderChip() {
  const c = K.getClock();
  if (!c || !chip) return;
  const now = K.nowMinutes(c);
  const day = K.dayIndexOf(now);
  const w = c.weather[day];
  chip.innerHTML = `${icon(isDaytime(now) ? 'sun' : 'moon')}<span class="num">${esc(dateLabel(c, day, { year: false }))} · ${K.hhmm(now)}</span>${w ? weatherIcon(w.kind) : ''}`;
  chip.setAttribute('aria-label', `${t('clock.title')}: ${dateLabel(c, day)}, ${K.hhmm(now)}${w ? `, ${t(`clock.weather.${w.kind}`)}` : ''}`);
}

// ---------- Ventana ----------

const currentSessionId = () => C.sessionsSorted()[0]?.id ?? null;

function renderDialog() {
  const c = K.getClock();
  const now = K.nowMinutes(c);
  const day = K.dayIndexOf(now);
  const w = c.weather[day];
  const last = c.events.at(-1);
  const btn = (kind, label, iconName, amount = '') => `<button class="btn clock-btn" type="button" data-adv="${kind}" data-amount="${amount}">${icon(iconName)}<span>${esc(label)}</span></button>`;
  body.innerHTML = `
    <header class="dialog-head">
      <div class="clock-now">
        <span class="clock-big-icon">${icon(isDaytime(now) ? 'sun' : 'moon', 'icon-xl')}</span>
        <div>
          <h2 id="dlg-clock-title">${esc(dateLabel(c, day))}</h2>
          <p class="clock-time num">${K.hhmm(now)} · ${esc(t(`clock.tod.${K.timeOfDay(now)}`))}</p>
          <p class="hint">${esc(t('clock.summary', { n: day + 1, elapsed: elapsedLabel(K.elapsed(c)) }))}</p>
        </div>
      </div>
      <button class="btn btn-icon" type="button" data-close aria-label="${esc(t('common.close'))}">${icon('close')}</button>
    </header>
    <h3>${icon('clock')} ${esc(t('clock.advance'))}</h3>
    <div class="clock-grid">
      ${btn('time', '+10 min', 'plus', 10)}
      ${btn('time', '+1 h', 'plus', 60)}
      ${btn('time', '+4 h', 'plus', 240)}
      ${btn('short', t('clock.ev.short'), 'clock')}
      ${btn('long', t('clock.ev.long'), 'moon')}
      ${btn('next-day', t('clock.ev.next-day'), 'sun')}
      ${btn('travel', tn('clock.ev.travel', 1), 'map', 1)}
    </div>
    <div class="clock-custom">
      <label class="field"><span>${esc(t('clock.daysLabel'))}</span><input type="number" inputmode="numeric" min="0" max="365" data-c="d" value="0"></label>
      <label class="field"><span>${esc(t('clock.hoursLabel'))}</span><input type="number" inputmode="numeric" min="0" max="23" data-c="h" value="0"></label>
      <label class="field"><span>${esc(t('clock.minutesLabel'))}</span><input type="number" inputmode="numeric" min="0" max="59" data-c="m" value="0"></label>
      <div class="field field-end"><button class="btn btn-primary" type="button" data-custom>${icon('plus')}<span>${esc(t('clock.advanceBtn'))}</span></button></div>
    </div>
    ${last ? `<button class="btn" type="button" data-undo-time>${icon('undo')}<span>${esc(t('clock.undo', { what: eventLabel(last) }))}</span></button>` : ''}
    <h3>${weatherIcon(w?.kind || 'cloudy')} ${esc(t('clock.todayWeather'))}</h3>
    <div class="clock-weather" role="radiogroup" aria-label="${esc(t('clock.todayWeather'))}">
      ${K.WEATHER.map((k) => `<button type="button" class="btn weather-btn" data-weather="${k}" aria-pressed="${w?.kind === k}">${weatherIcon(k)}<span>${esc(t(`clock.weather.${k}`))}</span></button>`).join('')}
    </div>
    <footer class="dialog-foot">
      <button class="btn" type="button" data-timeline>${icon('scroll')}<span>${esc(t('clock.timeline'))}</span></button>
      <button class="btn btn-primary" type="button" data-close>${esc(t('common.close'))}</button>
    </footer>`;
}

async function onClick(e) {
  const adv = e.target.closest('[data-adv]');
  if (adv) {
    await C.loadCampaign().catch(() => {});
    const ev = await K.advance(adv.dataset.adv, { amount: Number(adv.dataset.amount) || 0, sessionId: currentSessionId() });
    if (ev) toast(t('clock.advanced', { what: eventLabel(ev) }), { duration: 2500, group: 'clock' });
    return;
  }
  if (e.target.closest('[data-custom]')) {
    const v = (k) => Math.max(0, Number(body.querySelector(`[data-c="${k}"]`).value) || 0);
    const minutes = v('d') * 1440 + v('h') * 60 + v('m');
    if (!minutes) return;
    await C.loadCampaign().catch(() => {});
    const ev = await K.advance('time', { amount: minutes, sessionId: currentSessionId() });
    if (ev) toast(t('clock.advanced', { what: eventLabel(ev) }), { duration: 2500, group: 'clock' });
    return;
  }
  if (e.target.closest('[data-undo-time]')) { await K.undoLast(); return; }
  const w = e.target.closest('[data-weather]');
  if (w) {
    const c = K.getClock();
    const day = K.dayIndexOf(K.nowMinutes(c));
    await K.setWeather(day, c.weather[day]?.kind === w.dataset.weather ? null : w.dataset.weather, currentSessionId());
    return;
  }
  if (e.target.closest('[data-timeline]')) { closeDialog(dlg); openTimeline(); }
}

export function openClock() {
  renderDialog();
  openDialog(dlg);
}

export async function initClock({ onTimeline } = {}) {
  chip = document.getElementById('btn-clock');
  dlg = document.getElementById('dlg-clock');
  body = document.getElementById('clock-body');
  openTimeline = onTimeline || openTimeline;
  wireDialog(dlg);
  body.addEventListener('click', onClick);
  chip.addEventListener('click', openClock);
  K.onClockChange(() => {
    renderChip();
    if (dlg.open) renderDialog();
  });
  await K.loadClock();
}
