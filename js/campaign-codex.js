// Vista "Bitácora" de la Campaña: fichas de personajes, lugares, objetos y facciones,
// con etiquetas, enlaces entre fichas y "Aparece en" (quién la enlaza o la nombra).

import { openCampaignAnalysis } from './campaign-ai.js';
import * as C from './campaign-data.js';
import { autosize, kindIcon, kindLabel, linkChips, linkPicker, notesHtml } from './campaign-ui.js';
import { normalize } from './monsters.js';
import { esc, icon, confirmDialog, toast } from './ui.js';
import { t } from './i18n.js';
import { PACKS, confirmAndImportPack } from './campaign-import.js';
import { openDetectDialog } from './campaign-detect.js';

export function mountCodex(root, ctx) {
  let filter = ctx.state.codexFilter || '';
  root.innerHTML = `
    <div class="camp-split">
      <div class="camp-side">
        <div class="kind-filter" role="radiogroup" aria-label="${esc(t('camp.kindFilter'))}" data-filters></div>
        <div class="comp-bar">
          <input type="search" data-q autocomplete="off" placeholder="${esc(t('camp.filterCodex'))}" aria-label="${esc(t('camp.filterCodex'))}">
          <button class="btn btn-primary" type="button" data-new>${icon('plus')}<span>${esc(t('comp.new'))}</span></button>
        </div>
        <ul class="camp-list" data-list></ul>
        <button class="btn" type="button" data-detect>${icon('search')}<span>${esc(t('det.button'))}</span></button>
        <button class="btn" type="button" data-ai-analyze>${icon('sparkles')}<span>${esc(t('ai.analyzeButton'))}</span></button>
        ${PACKS.map((p) => `<button class="btn" type="button" data-pack="${p.id}">${icon('download')}<span>${esc(t('imp.loadPack', { name: p.name }))}</span></button>`).join('')}
      </div>
      <div class="camp-main" data-editor></div>
    </div>`;
  const listEl = root.querySelector('[data-list]');
  const editor = root.querySelector('[data-editor]');
  const qEl = root.querySelector('[data-q]');

  const current = () => C.get('codex', ctx.selected('codex'));

  function renderFilters() {
    root.querySelector('[data-filters]').innerHTML = ['', ...C.CODEX_KINDS].map((k) => `
      <button type="button" class="btn kind-btn" data-filter="${k}" aria-pressed="${filter === k}" ${k ? `aria-label="${esc(t(`camp.kinds.${k}`))}"` : ''}>
        ${k ? kindIcon(k) : `<span>${esc(t('comp.src.all'))}</span>`}</button>`).join('');
  }

  function renderList() {
    const q = normalize(qEl.value.trim());
    const cur = current();
    const items = C.list('codex')
      .filter((c) => (!filter || c.kind === filter) && (!q || normalize(`${c.name} ${c.subtitle || ''} ${(c.tags || []).join(' ')}`).includes(q)))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    listEl.innerHTML = items.length ? items.map((c) => `
      <li><button type="button" class="comp-item" data-pick="${esc(c.id)}" aria-current="${c.id === cur?.id}">
        <span class="comp-name">${kindIcon(c.kind)} ${esc(c.name || t('camp.unnamed'))}</span>
        <span class="comp-meta">${esc([c.subtitle, ...(c.tags || []).map((x) => `#${x}`)].filter(Boolean).join(' · ') || kindLabel(c.kind))}</span>
      </button></li>`).join('') : `<li class="comp-msg">${esc(t(C.list('codex').length ? 'comp.empty' : 'camp.noCodex'))}</li>`;
  }

  function renderLinks() {
    const c = current();
    const box = editor.querySelector('[data-links]');
    if (c && box) box.innerHTML = linkChips(c.links, { removable: true }) || `<span class="hint">${esc(t('camp.noLinks'))}</span>`;
  }

  function renderBacklinks() {
    const c = current();
    const box = editor.querySelector('[data-backlinks]');
    if (!c || !box) return;
    const b = C.backlinks(c.id);
    const parts = [];
    if (b.codex.length) parts.push(linkChips(b.codex.map((x) => x.id)));
    for (const st of b.storylines) {
      parts.push(`<span class="link-chip"><button type="button" class="link-go" data-go-story="${esc(st.id)}">${icon('book')}<span>${esc(st.title || t('camp.untitled'))}</span></button></span>`);
    }
    box.innerHTML = parts.join('') || `<span class="hint">${esc(t('camp.noBacklinks'))}</span>`;
    const log = editor.querySelector('[data-log]');
    const items = C.entryLog(c.id);
    log.innerHTML = items.length ? notesHtml(items) : `<span class="hint">${esc(t('camp.noLog'))}</span>`;
  }

  function renderEditor() {
    const c = current();
    if (!c) {
      editor.innerHTML = `<div class="comp-placeholder">${icon('user', 'icon-xl')}<p>${esc(t('camp.codexHint'))}</p></div>`;
      return;
    }
    editor.innerHTML = `
      <div class="codex-head">
        <label class="field"><span>${esc(t('entry.name'))}</span><input data-field="name" maxlength="100" value="${esc(c.name || '')}" placeholder="${esc(t('camp.namePlaceholder'))}"></label>
        <button class="btn" type="button" data-map>${icon('map')}<span>${esc(t('camp.showOnMap'))}</span></button>
        <button class="btn btn-icon btn-danger" type="button" data-delete aria-label="${esc(t('comp.delete'))}">${icon('trash')}</button>
      </div>
      <label class="field"><span>${esc(t('camp.aliases'))}</span><input data-field="aliases" value="${esc((c.aliases || []).join(', '))}" placeholder="${esc(t('camp.aliasesPlaceholder'))}"></label>
      <div class="segmented seg-4" role="radiogroup" aria-label="${esc(t('entry.type'))}">
        ${C.CODEX_KINDS.map((k) => `<label class="seg"><input type="radio" name="codex-kind" value="${k}"${c.kind === k ? ' checked' : ''}><span>${kindIcon(k)} ${esc(kindLabel(k))}</span></label>`).join('')}
      </div>
      <div class="field-row">
        <label class="field"><span>${esc(t('camp.subtitle'))}</span><input data-field="subtitle" maxlength="120" value="${esc(c.subtitle || '')}" placeholder="${esc(t(`camp.subtitlePh.${c.kind}`))}"></label>
        <label class="field"><span>${esc(t('camp.tags'))}</span><input data-field="tags" value="${esc((c.tags || []).join(', '))}" placeholder="${esc(t('camp.tagsPlaceholder'))}"></label>
      </div>
      <label class="field"><span>${esc(t('entry.spellText'))}</span><textarea data-field="description" rows="6">${esc(c.description || '')}</textarea></label>
      <div class="stack">
        <h3>${icon('link')} ${esc(t('camp.links'))}</h3>
        <div class="link-chips" data-links></div>
        <div data-picker></div>
      </div>
      <div class="stack">
        <h3>${esc(t('camp.mentionedIn'))}</h3>
        <div class="link-chips" data-backlinks></div>
      </div>
      <div class="stack">
        <h3>${icon('scroll')} ${esc(t('camp.log'))}</h3>
        <p class="hint">${esc(t('camp.logHint'))}</p>
        <div data-log></div>
      </div>`;
    editor.querySelector('[data-picker]').append(linkPicker({
      exclude: () => [c.id, ...(current()?.links || [])],
      onPick: (id) => {
        const cur = current();
        C.update('codex', cur.id, { links: [...(cur.links || []), id] }, { debounce: false });
        renderLinks();
        renderList();
      },
    }));
    editor.querySelectorAll('textarea').forEach(autosize);
    renderLinks();
    renderBacklinks();
  }

  function select(id) {
    ctx.select('codex', id);
    renderList();
    renderEditor();
  }

  // ---------- Eventos ----------

  root.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; ctx.state.codexFilter = filter; renderFilters(); renderList(); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick) { select(pick.dataset.pick); return; }
    if (e.target.closest('[data-ai-analyze]')) { openCampaignAnalysis(() => { renderList(); renderEditor(); }); return; }
    if (e.target.closest('[data-detect]')) { openDetectDialog(() => { renderList(); renderEditor(); }); return; }
    const pack = e.target.closest('[data-pack]');
    if (pack) { if (await confirmAndImportPack(pack.dataset.pack, confirmDialog)) renderList(); return; }
    const go = e.target.closest('[data-go-codex]');
    if (go) { select(go.dataset.goCodex); return; }
    const goStory = e.target.closest('[data-go-story]');
    if (goStory) { ctx.navigate('storylines', goStory.dataset.goStory); return; }
    const goSession = e.target.closest('[data-go-session]');
    if (goSession) { ctx.navigate('sessions', goSession.dataset.goSession); return; }
    if (e.target.closest('[data-map]')) { ctx.navigate('map', current().id); return; }
    const unlink = e.target.closest('[data-unlink]');
    if (unlink) {
      const c = current();
      C.update('codex', c.id, { links: c.links.filter((l) => l !== unlink.dataset.unlink) }, { debounce: false });
      renderLinks();
      return;
    }
    if (e.target.closest('[data-new]')) {
      const c = C.create('codex', { kind: filter || 'character', name: '', aliases: [], subtitle: '', tags: [], description: '', links: [] });
      select(c.id);
      editor.querySelector('[data-field="name"]').focus();
      return;
    }
    if (e.target.closest('[data-delete]')) {
      const c = current();
      const ok = await confirmDialog(t('comp.deleteConfirm', { name: c.name || t('camp.unnamed') }), { yes: t('comp.delete') });
      if (!ok) return;
      await C.remove('codex', c.id);
      ctx.select('codex', null);
      renderList();
      renderEditor();
      toast(t('camp.deleted'), { duration: 2500 });
    }
  });

  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el === qEl) { renderList(); return; }
    const c = current();
    const field = el.dataset.field;
    if (!c || !field) return;
    const value = field === 'tags' || field === 'aliases' ? el.value.split(',').map((x) => x.trim()).filter(Boolean) : el.value;
    C.update('codex', c.id, { [field]: value });
    if (el.tagName === 'TEXTAREA') autosize(el);
  });

  root.addEventListener('change', (e) => {
    if (e.target.name !== 'codex-kind') return;
    const c = current();
    C.update('codex', c.id, { kind: e.target.value }, { debounce: false });
    renderEditor();
  });

  renderFilters();
  renderList();
  renderEditor();

  return {
    update(what) {
      if (what === 'codex') renderList();
      if (what === 'codex' || what === 'storylines' || what === 'sessions') renderBacklinks();
    },
    show(id) { select(id); },
  };
}
