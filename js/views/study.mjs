import { app } from '../state.mjs';
import { STUDY_KINDS, studyProgress, filterStudy } from '../engine.mjs';
import { escape, pct, main } from '../ui.mjs';
import { saveStudy } from '../storage.mjs';
import { examSwitcherHTML } from './home.mjs';

const kinds = () => Object.entries(STUDY_KINDS).filter(([kind]) => app.syllabus.sections.some(s => s.kind === kind));
export function studyHTML() {
  const p = studyProgress(app.syllabus.sections, app.learned), st = app.study;
  if (!kinds().some(([kind]) => kind === st.kind)) st.kind = kinds()[0][0];
  return `<div class="subnav"><button class="text-button" data-action="home">← Back to practice</button><span class="session-badge">Study checklist · ${escape(app.exam.code)}</span></div>${examSwitcherHTML()}
  <div class="page-heading"><div><p class="eyebrow">STUDY CHECKLIST</p><h1>Know what to learn.</h1><p class="muted">Tick items off as you learn them. Tap an item for details, an example and an exam tip.</p></div><span class="bank-pill" data-progress="all">${p.done} of ${p.total} learned</span></div>
  <div class="study-tabs" role="group" aria-label="Checklist section" style="--kinds:${kinds().length}">${kinds().map(([kind, label]) => `<button class="${kind === st.kind ? 'selected' : ''}" data-action="study-kind" data-kind="${kind}" aria-pressed="${kind === st.kind}">${label}<span data-progress="kind-${kind}">${p.kinds[kind]?.done || 0}/${p.kinds[kind]?.total || 0}</span></button>`).join('')}</div>
  <div class="study-toolbar"><label class="field study-search" for="study-search">Search<input id="study-search" type="search" value="${escape(st.query)}" placeholder="e.g. Macie, RAG, temperature" autocomplete="off" spellcheck="false"></label>
  <label class="field" for="study-status">Show<select id="study-status">${[['all', 'All items'], ['todo', 'Not learned yet'], ['learned', 'Learned']].map(([value, label]) => `<option value="${value}" ${st.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
  ${st.kind === 'service' ? `<label class="field" for="study-priority">Priority<select id="study-priority">${[['all', 'All services'], ['core', 'Core only']].map(([value, label]) => `<option value="${value}" ${st.priority === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}</div>
  <div id="study-list">${studyListHTML()}</div>
  <div class="study-footer"><button class="text-button" data-action="study-reset" ${p.done ? '' : 'disabled'}>Reset checklist</button><p>Checklist progress is saved on this browser, separately from practice scores.</p></div>`;
}
function studyListHTML() {
  const st = app.study;
  const sections = filterStudy(app.syllabus.sections, { kind: st.kind, query: st.query, status: st.status, priority: st.kind === 'service' ? st.priority : 'all' }, app.learned);
  if (!sections.length) return '<div class="panel empty">No items match. Try a different search or filter.</div>';
  const progress = studyProgress(app.syllabus.sections, app.learned).sections;
  let group = '';
  return sections.map(s => {
    const heading = s.group === group ? '' : `<div class="section-row study-group"><h2>${escape(group = s.group)}</h2></div>`;
    const p = progress[s.id], open = st.query || st.open.has(s.id);
    return `${heading}<details class="study-section" data-section="${escape(s.id)}" ${open ? 'open' : ''}><summary><span class="study-section-head"><strong>${escape(s.title)}</strong>${s.kind === 'service' ? `<span class="tag ${s.priority}">${s.priority === 'core' ? 'Core' : 'Supporting'}</span>` : ''}</span><span class="study-section-summary">${escape(s.summary)}</span><span class="study-section-progress"><span data-progress="section-${escape(s.id)}">${p.done}/${p.total}</span><span class="track"><span data-progress-bar="section-${escape(s.id)}" style="width:${pct(p.done, p.total)}%"></span></span></span></summary>
    <div class="study-items">${s.items.map(item => studyItemHTML(item, s)).join('')}</div>
    <div class="study-section-actions"><button class="text-button" data-action="study-mark" data-section="${escape(s.id)}" data-value="1">Mark all as learned</button><button class="text-button" data-action="study-mark" data-section="${escape(s.id)}" data-value="0">Clear</button></div></details>`;
  }).join('');
}
function studyItemHTML(item, section) {
  const done = !!app.learned[item.id];
  return `<div class="study-item ${done ? 'learned' : ''}"><label class="study-check"><input type="checkbox" name="learned" value="${escape(item.id)}" data-section="${escape(section.id)}" aria-label="Mark ${escape(item.name)} as learned" ${done ? 'checked' : ''}></label><details><summary><strong>${escape(item.name)}</strong><span>${escape(item.summary)}</span></summary><div class="study-detail"><p>${escape(item.details)}</p><p><strong>Example:</strong> ${escape(item.example)}</p>${item.tip ? `<p class="study-tip"><strong>Exam tip:</strong> ${escape(item.tip)}</p>` : ''}<a class="source" href="${escape(item.source || section.source)}" target="_blank" rel="noopener noreferrer">AWS reference ↗</a></div></details></div>`;
}
export function renderStudyList() {
  const list = main.querySelector('#study-list');
  if (list) list.innerHTML = studyListHTML();
}
function updateStudyProgress() {
  const p = studyProgress(app.syllabus.sections, app.learned);
  main.querySelectorAll('[data-progress]').forEach(el => {
    const key = el.dataset.progress;
    if (key === 'all') el.textContent = `${p.done} of ${p.total} learned`;
    else if (key.startsWith('kind-')) { const k = p.kinds[key.slice(5)]; if (k) el.textContent = `${k.done}/${k.total}`; }
    else if (key.startsWith('section-')) { const s = p.sections[key.slice(8)]; if (s) el.textContent = `${s.done}/${s.total}`; }
  });
  main.querySelectorAll('[data-progress-bar]').forEach(el => { const s = p.sections[el.dataset.progressBar.slice(8)]; if (s) el.style.width = `${pct(s.done, s.total)}%`; });
  const reset = main.querySelector('[data-action="study-reset"]');
  if (reset) reset.disabled = !p.done;
  return p;
}
// Ticks or clears items in place, so open panels and scroll position are kept.
export function setLearned(ids, value) {
  for (const id of ids) { if (value) app.learned[id] ||= Date.now(); else delete app.learned[id]; }
  saveStudy();
  const wanted = new Set(ids);
  main.querySelectorAll('input[name="learned"]').forEach(input => {
    if (!wanted.has(input.value)) return;
    input.checked = value;
    input.closest('.study-item')?.classList.toggle('learned', value);
  });
  return updateStudyProgress();
}
