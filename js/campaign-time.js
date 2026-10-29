// Vista "Tiempo" de la Campaña: línea de tiempo por días (descansos, viajes, clima y sesiones),
// ajustes del calendario y reconstrucción del tiempo transcurrido a partir de las notas de sesión.

import * as K from './clock.js';
import * as C from './campaign-data.js';
import { dateLabel, elapsedLabel, eventLabel, weatherIcon, openClock } from './clock-ui.js';
import { esc, icon, toast, confirmDialog } from './ui.js';
import { t, tn } from './i18n.js';

const FESTIVALS = ['Midwinter', 'Greengrass', 'Midsummer', 'Shieldmeet', 'Highharvestide', 'Feast of the Moon'];

export function mountTime(root, ctx) {
  root.innerHTML = `
    <div class="camp-split">
      <div class="camp-side time-side" data-side></div>
      <div class="camp-main" data-main></div>
    </div>`;
  const side = root.querySelector('[data-side]');
  const main = root.querySelector('[data-main]');
  let preview = null; // resultado de "Reconstruir" pendiente de aplicar

  function renderSide() {
    const c = K.getClock();
    const now = K.nowMinutes(c);
    const day = K.dayIndexOf(now);
    const start = K.dateOf({ ...c, calendar: 'harptos' }, 0);
    const startSpec = start.festival ? `f:${start.festival}` : `m:${start.month}`;
    side.innerHTML = `
      <section class="time-card">
        <h3>${icon('clock')} ${esc(t('clock.title'))}</h3>
        <p class="time-now">${esc(dateLabel(c, day))} · <span class="num">${K.hhmm(now)}</span></p>
        <p class="hint">${esc(t('clock.summary', { n: day + 1, elapsed: elapsedLabel(K.elapsed(c)) }))}</p>
        <button class="btn btn-primary" type="button" data-open-clock>${icon('clock')}<span>${esc(t('clock.open'))}</span></button>
      </section>
      <section class="time-card">
        <h3>${icon('scroll')} ${esc(t('clock.rebuild'))}</h3>
        <p class="hint">${esc(t('clock.rebuildHint'))}</p>
        ${preview ? `
          <ul class="time-stats">
            <li>${esc(tn('clock.st.long', preview.stats.long))}</li>
            <li>${esc(tn('clock.st.short', preview.stats.short))}</li>
            <li>${esc(tn('clock.st.nextDay', preview.stats.nextDay))}</li>
            <li>${esc(tn('clock.st.travel', preview.stats.travelDays))}</li>
            <li>${esc(tn('clock.st.weather', preview.stats.weather))}</li>
          </ul>
          <p><strong>${esc(tn('clock.st.days', preview.stats.days))}</strong></p>
          <div class="map-actions">
            <button class="btn btn-primary" type="button" data-apply>${icon('check')}<span>${esc(t('clock.apply'))}</span></button>
            <button class="btn" type="button" data-cancel-preview>${esc(t('common.cancel'))}</button>
          </div>` : `<button class="btn" type="button" data-rebuild>${icon('refresh')}<span>${esc(t('clock.rebuildBtn'))}</span></button>`}
      </section>
      <section class="time-card">
        <h3>${icon('gear')} ${esc(t('clock.settings'))}</h3>
        <div class="segmented seg-2" role="radiogroup" aria-label="${esc(t('clock.calendar'))}">
          ${['harptos', 'days'].map((k) => `<label class="seg"><input type="radio" name="clock-cal" value="${k}"${c.calendar === k ? ' checked' : ''}><span>${esc(t(`clock.cal.${k}`))}</span></label>`).join('')}
        </div>
        ${c.calendar === 'harptos' ? `
          <p class="hint">${esc(t('clock.startHint'))}</p>
          <div class="field-row">
            <label class="field"><span>${esc(t('clock.startMonth'))}</span><select data-start-month>
              ${K.MONTHS.map((m, i) => `<option value="m:${i}"${startSpec === `m:${i}` ? ' selected' : ''}>${esc(m)}</option>`).join('')}
              <optgroup label="${esc(t('clock.festivals'))}">${FESTIVALS.map((f) => `<option value="f:${f}"${startSpec === `f:${f}` ? ' selected' : ''}>${esc(f)}</option>`).join('')}</optgroup>
            </select></label>
            <label class="field"><span>${esc(t('clock.startDay'))}</span><input type="number" inputmode="numeric" min="1" max="30" data-start-day value="${start.day || 1}"${start.festival ? ' disabled' : ''}></label>
            <label class="field"><span>${esc(t('clock.startYear'))}</span><input type="number" inputmode="numeric" min="1" max="3000" data-start-year value="${c.start.year}"></label>
          </div>` : ''}
        <label class="field"><span>${esc(t('clock.startHour'))}</span><input type="time" data-start-hour value="${K.hhmm(c.start.minute)}"></label>
        <button class="btn" type="button" data-save-settings>${icon('save')}<span>${esc(t('entry.save'))}</span></button>
      </section>`;
  }

  function renderMain() {
    const c = K.getClock();
    const days = K.timeline(c);
    const sessions = new Map(C.list('sessions').map((s) => [s.id, s]));
    const today = K.dayIndexOf(K.nowMinutes(c));
    main.innerHTML = `
      <h3>${icon('scroll')} ${esc(t('clock.timeline'))}</h3>
      ${c.events.length || Object.keys(c.weather).length ? '' : `<p class="hint">${esc(t('clock.emptyTimeline'))}</p>`}
      <ol class="time-list">${days.map((d) => `
        <li class="time-day${d.day === today ? ' today' : ''}" data-day="${d.day}">
          <header class="time-day-head">
            <div>
              <strong>${esc(dateLabel(c, d.day))}</strong>
              <span class="hint">${esc(t('clock.dayN', { n: d.day + 1 }))}${d.day === today ? ` · ${esc(t('clock.today'))}` : ''}</span>
            </div>
            <label class="time-weather">${d.weather ? weatherIcon(d.weather.kind) : icon('cloud')}
              <select data-weather-day="${d.day}" aria-label="${esc(t('clock.weatherOf', { day: dateLabel(c, d.day) }))}">
                <option value="">${esc(t('clock.noWeather'))}</option>
                ${K.WEATHER.map((k) => `<option value="${k}"${d.weather?.kind === k ? ' selected' : ''}>${esc(t(`clock.weather.${k}`))}</option>`).join('')}
              </select>
            </label>
          </header>
          ${d.sessions.size ? `<div class="link-chips">${[...d.sessions].map((id) => sessions.get(id)).filter(Boolean).map((s) => `
            <span class="link-chip"><button type="button" class="link-go" data-go-session="${esc(s.id)}">${icon('scroll')}<span>#${esc(s.number ?? '')} ${esc(s.title || '')}</span></button></span>`).join('')}</div>` : ''}
          ${d.events.length ? `<ul class="time-events">${d.events.map(({ ev, from, at }) => `
            <li>${icon({ long: 'moon', short: 'clock', 'next-day': 'sun', travel: 'map' }[ev.kind] || 'plus')}
              <span><strong>${esc(eventLabel(ev))}</strong> <span class="num hint">${K.hhmm(from)} → ${K.hhmm(at)}${K.dayIndexOf(at) !== K.dayIndexOf(from) ? ` (${esc(t('clock.dayN', { n: K.dayIndexOf(at) + 1 }))})` : ''}</span>
              ${ev.source ? `<span class="log-context">${esc(ev.source.length > 120 ? `${ev.source.slice(0, 120)}…` : ev.source)}</span>` : ''}</span>
            </li>`).join('')}</ul>` : ''}
          ${d.weather?.source ? `<p class="log-context">${weatherIcon(d.weather.kind)} ${esc(d.weather.source.length > 120 ? `${d.weather.source.slice(0, 120)}…` : d.weather.source)}</p>` : ''}
        </li>`).join('')}</ol>`;
    main.querySelector('.time-day.today')?.scrollIntoView({ block: 'center' });
  }

  function render() { renderSide(); renderMain(); }

  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-open-clock]')) { openClock(); return; }
    if (e.target.closest('[data-rebuild]')) {
      await C.loadCampaign();
      preview = K.reconstruct(C.list('sessions'));
      renderSide();
      return;
    }
    if (e.target.closest('[data-cancel-preview]')) { preview = null; renderSide(); return; }
    if (e.target.closest('[data-apply]') && preview) {
      const ok = await confirmDialog(t('clock.applyConfirm'), { yes: t('clock.apply') });
      if (!ok) return;
      await K.applyReconstruction(preview);
      preview = null;
      toast(t('clock.applied'), { duration: 4000 });
      return;
    }
    if (e.target.closest('[data-save-settings]')) {
      const c = K.getClock();
      const patch = {};
      const cal = root.querySelector('input[name=clock-cal]:checked')?.value || c.calendar;
      patch.calendar = cal;
      const [h, m] = (root.querySelector('[data-start-hour]').value || '08:00').split(':').map(Number);
      patch.start = { minute: h * 60 + m };
      const monthSel = root.querySelector('[data-start-month]');
      if (monthSel) {
        const year = Number(root.querySelector('[data-start-year]').value) || c.start.year;
        const v = monthSel.value;
        const spec = v.startsWith('f:') ? { festival: v.slice(2) } : { month: Number(v.slice(2)), day: Math.min(30, Math.max(1, Number(root.querySelector('[data-start-day]').value) || 1)) };
        patch.start = { ...patch.start, year, dayOfYear: K.dayOfYear(year, spec) };
      }
      await K.setSettings(patch);
      toast(t('detail.saved'), { duration: 2000 });
      return;
    }
    const s = e.target.closest('[data-go-session]');
    if (s) ctx.navigate('sessions', s.dataset.goSession);
  });

  root.addEventListener('change', async (e) => {
    if (e.target.name === 'clock-cal') {
      await K.setSettings({ calendar: e.target.value });
      return;
    }
    if (e.target.matches('[data-start-month]')) {
      const day = root.querySelector('[data-start-day]');
      if (day) day.disabled = e.target.value.startsWith('f:');
      return;
    }
    const wd = e.target.closest('[data-weather-day]');
    if (wd) await K.setWeather(Number(wd.dataset.weatherDay), wd.value || null);
  });

  // Se redibuja cuando cambia el reloj; deja de escuchar cuando la vista ya no está en pantalla.
  const off = K.onClockChange(() => { if (!root.isConnected) { off(); return; } render(); });
  render();

  return {
    update(what) { if (what === 'sessions') renderMain(); },
    show() {},
  };
}
