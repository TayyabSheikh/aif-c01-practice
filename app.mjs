import { DOMAINS, MODES, STUDY_KINDS, makeSession, scoreSession, applyResult, isCorrect, needsReview, validateBank, validSession, validateSyllabus, studyProgress, filterStudy } from './engine.mjs';

const main = document.querySelector('main');
const STORAGE = 'ai-practitioner-practice-v1';
const STUDY_STORAGE = 'ai-practitioner-study-v1';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
let bank = [], byId = new Map(), state = { stats: {}, history: [], active: null };
let view = 'home', mode = 'quick', domain = 0, result = null, reviewFilter = 'all', storageFailed = false, notice = '';
let timer;
let syllabus = null, learned = {}, studyKind = 'service', studyQuery = '', studyStatus = 'all', studyPriority = 'all';
const openSections = new Set();
function announce(message) { document.querySelector('#status').textContent = message; }
function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify(state)); }
  catch { storageFailed = true; announce('Browser storage is unavailable. Keep this page open to preserve this session.'); }
}
function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (!saved || typeof saved !== 'object') return;
    const stats = Object.fromEntries(Object.entries(saved.stats || {}).filter(([id, s]) => byId.has(id) && s && Number.isFinite(s.attempts) && s.attempts > 0 && typeof s.firstCorrect === 'boolean' && typeof s.lastCorrect === 'boolean'));
    state = { stats, history: Array.isArray(saved.history) ? saved.history.filter(r => r && MODES[r.mode] && Array.isArray(r.rows) && r.rows.length && r.rows.every(x => byId.has(x.id) && Array.isArray(x.selected)) && Number.isFinite(r.completedAt)).slice(0, 20) : [], active: validSession(saved.active, bank) ? saved.active : null };
  } catch { storageFailed = true; }
}
function focusMain() { main.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
function domainName(id) { return DOMAINS.find(d => d.id === id)?.short || 'All exam domains'; }
function statEntries() { return Object.entries(state.stats); }
function reviewIds() { return bank.filter(q => needsReview(state.stats[q.id])).map(q => q.id); }
function answered(s) { return s.ids.filter(id => (s.answers[id] || []).length === byId.get(id).answers.length).length; }
function render(focus = false) {
  main.innerHTML = (storageFailed ? '<div class="notification">Progress cannot be saved in this browser. Keep this page open while you practise.</div>' : '') + (notice ? `<div class="notification">${escape(notice)}</div>` : '') + (view === 'quiz' ? quizHTML() : view === 'result' ? resultsHTML() : view === 'study' && syllabus ? studyHTML() : homeHTML());
  if (focus) focusMain();
  updateTimer();
}
function homeHTML() {
  const stats = statEntries(), accuracy = stats.length ? `${pct(stats.filter(([, s]) => s.firstCorrect).length, stats.length)}%` : '—';
  const reviewCount = reviewIds().length;
  const active = state.active;
  return `<div class="page-heading"><div><p class="eyebrow">YOUR STUDY SPACE</p><h1>One session at a time.</h1><p class="muted">Choose a pace. Build your confidence.</p></div><span class="bank-pill">${bank.length} practice questions</span></div>
  ${active ? `<div class="resume"><div><strong>You have a session in progress</strong><p>${escape(MODES[active.mode].title)} · ${answered(active)} of ${active.ids.length} answered${active.deadline ? ' · timer continues while away' : ''}</p></div><button class="secondary" data-action="resume">Resume session →</button></div>` : ''}
  <div class="home-grid"><section class="panel setup" aria-label="Session setup"><div class="section-label"><span class="step-number">01</span><h2>Choose your session</h2></div>
  <div class="mode-grid">${Object.entries(MODES).filter(([key]) => key !== 'review').map(([key, m]) => `<button class="mode-card ${mode === key ? 'selected' : ''}" data-action="mode" data-mode="${key}" aria-pressed="${mode === key}"><span class="mode-symbol" aria-hidden="true">${m.symbol}</span><strong>${m.title}</strong><span>${m.count} questions · ${m.time}</span><small>${m.description}</small></button>`).join('')}</div>
  <div class="setup-bottom"><label class="field" for="domain">Focus area<select id="domain" ${mode === 'mock' ? 'disabled' : ''}><option value="0">All exam domains</option>${DOMAINS.map(d => `<option value="${d.id}" ${domain === d.id && mode !== 'mock' ? 'selected' : ''}>${escape(d.short)}</option>`).join('')}</select></label><button class="primary" data-action="start">${mode === 'mock' ? 'Start timed mock' : 'Start practice'} <span aria-hidden="true">→</span></button></div>
  <p class="info-note">${mode === 'mock' ? '90 minutes. Answers stay hidden until you submit. Unanswered questions count as incorrect.' : 'See why each answer works. New questions are prioritised in every session.'}</p>
  </section><aside class="panel progress-panel" aria-label="Your progress"><p class="eyebrow">YOUR PROGRESS</p><div class="stat-large">${accuracy}<span>first-attempt accuracy</span></div><div class="mini-stats"><div><strong>${stats.length}<span> / ${bank.length}</span></strong><span>questions tried</span></div><div><strong>${reviewCount}</strong><span>to revisit</span></div></div>
  <button class="secondary full-width" data-action="review" ${!reviewCount ? 'disabled' : ''}>Review mistakes <span aria-hidden="true">↺</span></button><div class="progress-note">Progress is saved on this browser.<br>Finishing a session updates your stats.</div></aside></div>
  ${syllabus ? studyCardHTML() : ''}
  <div class="section-row"><h2>Every exam domain, covered</h2><span>Weighted to the AIF-C01 guide</span></div><div class="domain-list">${DOMAINS.map(d => {
    const items = bank.filter(q => q.domain === d.id), attempted = items.filter(q => state.stats[q.id]);
    return `<div class="domain-item"><div class="domain-top"><span>0${d.id}</span><span>${d.weight}% of exam</span></div><h3>${escape(d.short)}</h3><div class="track" aria-label="${attempted.length} of ${items.length} questions tried"><span style="width:${pct(attempted.length, items.length)}%"></span></div><p class="domain-count">${attempted.length} / ${items.length} questions tried</p></div>`;
  }).join('')}</div>
  ${state.history.length ? `<div class="section-row"><h2>Recent sessions</h2><span>Latest ${Math.min(5, state.history.length)}</span></div><section class="panel history">${state.history.slice(0, 5).map(r => `<div class="history-row"><div><strong>${escape(MODES[r.mode].title)}</strong><span>${new Date(r.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${r.total} questions · ${escape(domainName(r.domain))}</span></div><button data-action="history" data-id="${escape(r.id)}" aria-label="Review ${escape(MODES[r.mode].title)} result, ${r.percent} percent">${r.percent}%<span>Review →</span></button></div>`).join('')}</section>` : ''}
  <p class="bottom-note">Original single-choice and multi-select practice. The real exam can also include ordering and matching. Mocks draw from this same bank; repeat questions are identified at the start.</p>`;
}
function quizHTML() {
  const s = state.active, q = byId.get(s.ids[s.index]), selected = s.answers[q.id] || [], checked = !!s.checked[q.id] && s.mode !== 'mock';
  const completed = s.ids.filter(id => s.mode === 'mock' ? (s.answers[id] || []).length === byId.get(id).answers.length : s.checked[id]).length;
  return `<div class="subnav"><button class="text-button" data-action="home">← Save & exit</button><div class="session-badge"><span>${escape(MODES[s.mode].title)}</span>${s.deadline ? '<span id="clock" class="clock" role="timer" aria-label="Time remaining"></span>' : '<span class="clock">Untimed</span>'}</div></div>
  <div class="quiz-grid"><section class="panel question-panel" aria-label="Practice question"><div class="question-meta"><span class="tag">${escape(domainName(q.domain))}</span><span>${escape(q.difficulty)} · ${escape(q.id.toUpperCase())}</span></div>
  <h1 class="question-heading" id="question-heading">${escape(q.question)}</h1><p class="question-rule">${q.type === 'multiple' ? 'Select exactly two answers.' : 'Select one answer.'} <span class="muted">Question ${s.index + 1} of ${s.ids.length}</span></p>
  <fieldset class="options" aria-labelledby="question-heading"><legend class="sr-only">Answer options</legend>${s.orders[q.id].map((index, position) => `<label class="option ${checked && q.answers.includes(index) ? 'correct' : checked && selected.includes(index) ? 'incorrect' : ''}"><input type="${q.type === 'single' ? 'radio' : 'checkbox'}" name="answer" value="${index}" ${selected.includes(index) ? 'checked' : ''} ${checked ? 'disabled' : ''}><span class="letter" aria-hidden="true">${String.fromCharCode(65 + position)}</span><span class="option-text">${escape(q.options[index])}</span>${checked && q.answers.includes(index) ? '<span class="answer-mark" aria-label="Correct answer">✓</span>' : checked && selected.includes(index) ? '<span class="answer-mark" aria-label="Incorrect selection">×</span>' : ''}</label>`).join('')}</fieldset>
  ${checked ? explanationHTML(q, selected, s.orders[q.id]) : ''}
  <div class="question-actions"><label class="confidence"><input type="checkbox" id="guessed" ${s.guessed[q.id] ? 'checked' : ''} ${checked ? 'disabled' : ''}>I’m not sure / I guessed</label><div class="small-actions">${s.mode !== 'mock' && !checked ? `<button class="primary" id="check-answer" data-action="check" ${selected.length !== q.answers.length ? 'disabled' : ''}>Check answer</button>` : `<button class="primary" data-action="next">${s.index === s.ids.length - 1 ? (s.mode === 'mock' ? 'Review & submit' : 'Finish session') : 'Next question →'}</button>`}</div></div>
  <div class="question-bottom"><button class="text-button" data-action="previous" ${s.index === 0 ? 'disabled' : ''}>← Previous</button><button class="text-button" data-action="flag" aria-pressed="${!!s.flagged[q.id]}">${s.flagged[q.id] ? '★ Flagged for review' : '☆ Flag for review'}</button></div>
  </section><aside class="panel question-sidebar"><h2>Your session</h2><p class="muted">${completed} of ${s.ids.length} ${s.mode === 'mock' ? 'answered' : 'checked'}</p><div class="track" style="margin-top:14px"><span style="width:${pct(completed, s.ids.length)}%"></span></div><nav class="navigator" aria-label="Question navigation">${s.ids.map((id, i) => {
    const done = s.mode === 'mock' ? (s.answers[id] || []).length === byId.get(id).answers.length : !!s.checked[id];
    const wrong = done && s.mode !== 'mock' && !isCorrect(byId.get(id), s.answers[id]);
    return `<button class="nav-question ${i === s.index ? 'current' : ''} ${done ? 'answered' : ''} ${wrong ? 'wrong' : ''} ${s.flagged[id] ? 'flagged' : ''}" data-action="goto" data-index="${i}" ${i === s.index ? 'aria-current="step"' : ''} aria-label="Question ${i + 1}${done ? ', answered' : ', unanswered'}${s.flagged[id] ? ', flagged' : ''}">${i + 1}</button>`;
  }).join('')}</nav><div class="legend"><span><i class="swatch"></i>Answered</span><span><i class="swatch flag"></i>Flagged</span></div><div class="sidebar-bottom"><button class="secondary full-width" data-action="finish">${s.mode === 'mock' ? 'Submit mock' : 'Finish session'}</button><p>${s.mode === 'mock' ? 'The timer continues if you leave or refresh. Every question counts in this practice score.' : 'Use 1–5 to select options. Check each answer to read its explanation.'}</p><p>${s.previouslySeen} previously attempted · ${s.ids.length - s.previouslySeen} new</p></div></aside></div>`;
}
function explanationHTML(q, selected, order = q.options.map((_, i) => i)) {
  const correct = isCorrect(q, selected);
  return `<div class="feedback ${correct ? '' : 'wrong'}"><h3>${correct ? '✓ That’s right.' : selected.length ? 'Let’s unpack this one.' : 'No answer selected.'}</h3><p>${escape(q.takeaway)}</p><div class="rationale">${order.map((i, p) => `<p><strong>${String.fromCharCode(65 + p)}. ${q.answers.includes(i) ? 'Correct' : 'Incorrect'}:</strong> ${escape(q.explanations[i])}</p>`).join('')}</div><a class="source" href="${escape(q.source)}" target="_blank" rel="noopener noreferrer">Read the AWS reference ↗</a></div>`;
}
function resultsHTML() {
  const r = result;
  const filtered = r.rows.filter(row => reviewFilter === 'all' || (reviewFilter === 'incorrect' ? !row.correct : reviewFilter === 'guessed' ? row.guessed : row.flagged));
  const mins = Math.max(1, Math.round((r.completedAt - r.startedAt) / 60000));
  return `<div class="subnav"><button class="text-button" data-action="home">← Back to practice</button><span class="session-badge">${escape(MODES[r.mode].title)} complete</span></div><div class="page-heading"><div><p class="eyebrow">SESSION RESULTS</p><h1>Keep the knowledge.</h1></div><span class="bank-pill">${r.correct} of ${r.total} correct</span></div>
  <section class="panel score-grid"><div><div class="score-number">${r.percent}<small>%</small></div><p class="score-detail">${mins} min elapsed · ${r.unanswered} unanswered</p></div><div class="score-description"><h2>${r.percent >= 80 ? 'A strong session.' : r.percent >= 60 ? 'You’re building a foundation.' : 'You’ve found your next focus.'}</h2><p>${r.percent >= 80 ? 'Review any guesses, then try fresh questions to check what sticks.' : 'Take a moment with the explanations below, then revisit the questions that need another look.'}</p><div class="small-actions"><button class="primary" data-action="new">New practice session →</button><button class="secondary" data-action="retry-result" ${r.rows.every(x => x.correct && !x.guessed) ? 'disabled' : ''}>Review these mistakes</button></div></div></section>
  <div class="section-row"><h2>Accuracy by domain</h2><span>This session</span></div><section class="panel result-domains">${DOMAINS.map(d => {
    const rows = r.rows.filter(row => row.domain === d.id), correct = rows.filter(row => row.correct).length;
    return `<div class="result-domain"><span>${escape(d.short)}</span><div class="track"><span style="width:${pct(correct, rows.length)}%"></span></div><span>${rows.length ? `${correct}/${rows.length} · ${pct(correct, rows.length)}%` : '—'}</span></div>`;
  }).join('')}</section><p class="bottom-note">Practice accuracy is a raw percentage, not an AWS scaled score or a pass prediction. This mock uses the shared practice bank.${r.previouslySeen ? ` ${r.previouslySeen} questions had been attempted before.` : ''}</p>
  <div class="review-tools"><h2>Review your answers <span class="muted">(${filtered.length})</span></h2><label class="sr-only" for="review-filter">Filter answers</label><select id="review-filter">${[['all', 'All answers'], ['incorrect', 'Incorrect & unanswered'], ['guessed', 'Guessed answers'], ['flagged', 'Flagged answers']].map(([value, label]) => `<option value="${value}" ${reviewFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
  ${filtered.length ? filtered.map(row => {
    const q = byId.get(row.id), order = r.orders[q.id] || q.options.map((_, i) => i);
    return `<details class="review-item"><summary><span class="result-dot ${row.correct ? '' : 'wrong'}" aria-label="${row.correct ? 'Correct' : 'Incorrect'}">${row.correct ? '✓' : '×'}</span><span>${escape(q.question)}</span></summary><div class="review-body"><p class="review-answer"><strong>Your answer:</strong> ${row.selected.length ? row.selected.map(i => escape(q.options[i])).join(' • ') : 'Unanswered'}</p><p class="review-answer"><strong>Correct answer:</strong> ${q.answers.map(i => escape(q.options[i])).join(' • ')}</p><div class="rationale" style="margin-bottom:16px">${order.map((i, p) => `<p><strong>${String.fromCharCode(65 + p)}.</strong> ${escape(q.options[i])}</p>`).join('')}</div>${explanationHTML(q, row.selected, order)}</div></details>`;
  }).join('') : '<div class="panel empty">No answers in this category.</div>'}`;
}
function readStudy() {
  try {
    const saved = JSON.parse(localStorage.getItem(STUDY_STORAGE) || 'null');
    const ids = new Set(syllabus.sections.flatMap(s => s.items.map(i => i.id)));
    learned = Object.fromEntries(Object.entries(saved?.learned || {}).filter(([id, at]) => ids.has(id) && Number.isFinite(at)));
  } catch { storageFailed = true; }
}
function saveStudy() {
  try { localStorage.setItem(STUDY_STORAGE, JSON.stringify({ learned })); }
  catch { storageFailed = true; announce('Browser storage is unavailable. Checklist progress will not be saved.'); }
}
function studyCardHTML() {
  const p = studyProgress(syllabus.sections, learned);
  return `<div class="section-row"><h2>Study checklist</h2><span>${p.done} of ${p.total} learned</span></div><section class="panel study-card" aria-label="Study checklist"><div><p>Every in-scope AWS service and exam concept, each with a one-liner, an example and an exam tip. Tick items off as you learn them.</p><div class="study-card-stats">${Object.entries(STUDY_KINDS).map(([kind, label]) => {
    const k = p.kinds[kind] || { done: 0, total: 0 };
    return `<div><strong>${k.done}<span> / ${k.total}</span></strong><span>${label}</span><div class="track"><span style="width:${pct(k.done, k.total)}%"></span></div></div>`;
  }).join('')}</div></div><button class="primary" data-action="study">Open checklist <span aria-hidden="true">→</span></button></section>`;
}
function studyHTML() {
  const p = studyProgress(syllabus.sections, learned);
  return `<div class="subnav"><button class="text-button" data-action="home">← Back to practice</button><span class="session-badge">Study checklist</span></div>
  <div class="page-heading"><div><p class="eyebrow">STUDY CHECKLIST</p><h1>Know what to learn.</h1><p class="muted">Tick items off as you learn them. Tap an item for details, an example and an exam tip.</p></div><span class="bank-pill" data-progress="all">${p.done} of ${p.total} learned</span></div>
  <div class="study-tabs" role="group" aria-label="Checklist section">${Object.entries(STUDY_KINDS).map(([kind, label]) => `<button class="${kind === studyKind ? 'selected' : ''}" data-action="study-kind" data-kind="${kind}" aria-pressed="${kind === studyKind}">${label}<span data-progress="kind-${kind}">${p.kinds[kind]?.done || 0}/${p.kinds[kind]?.total || 0}</span></button>`).join('')}</div>
  <div class="study-toolbar"><label class="field study-search" for="study-search">Search<input id="study-search" type="search" value="${escape(studyQuery)}" placeholder="e.g. Macie, RAG, temperature" autocomplete="off" spellcheck="false"></label>
  <label class="field" for="study-status">Show<select id="study-status">${[['all', 'All items'], ['todo', 'Not learned yet'], ['learned', 'Learned']].map(([value, label]) => `<option value="${value}" ${studyStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
  ${studyKind === 'service' ? `<label class="field" for="study-priority">Priority<select id="study-priority">${[['all', 'All services'], ['core', 'Core only']].map(([value, label]) => `<option value="${value}" ${studyPriority === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}</div>
  <div id="study-list">${studyListHTML()}</div>
  <div class="study-footer"><button class="text-button" data-action="study-reset" ${p.done ? '' : 'disabled'}>Reset checklist</button><p>Checklist progress is saved on this browser, separately from practice scores.</p></div>`;
}
function studyListHTML() {
  const sections = filterStudy(syllabus.sections, { kind: studyKind, query: studyQuery, status: studyStatus, priority: studyKind === 'service' ? studyPriority : 'all' }, learned);
  if (!sections.length) return '<div class="panel empty">No items match. Try a different search or filter.</div>';
  const progress = studyProgress(syllabus.sections, learned).sections;
  let group = '';
  return sections.map(s => {
    const heading = s.group === group ? '' : `<div class="section-row study-group"><h2>${escape(group = s.group)}</h2></div>`;
    const p = progress[s.id], open = studyQuery || openSections.has(s.id);
    return `${heading}<details class="study-section" data-section="${escape(s.id)}" ${open ? 'open' : ''}><summary><span class="study-section-head"><strong>${escape(s.title)}</strong>${s.kind === 'service' ? `<span class="tag ${s.priority}">${s.priority === 'core' ? 'Core' : 'Supporting'}</span>` : ''}</span><span class="study-section-summary">${escape(s.summary)}</span><span class="study-section-progress"><span data-progress="section-${escape(s.id)}">${p.done}/${p.total}</span><span class="track"><span data-progress-bar="section-${escape(s.id)}" style="width:${pct(p.done, p.total)}%"></span></span></span></summary>
    <div class="study-items">${s.items.map(item => studyItemHTML(item, s)).join('')}</div>
    <div class="study-section-actions"><button class="text-button" data-action="study-mark" data-section="${escape(s.id)}" data-value="1">Mark all as learned</button><button class="text-button" data-action="study-mark" data-section="${escape(s.id)}" data-value="0">Clear</button></div></details>`;
  }).join('');
}
function studyItemHTML(item, section) {
  const done = !!learned[item.id];
  return `<div class="study-item ${done ? 'learned' : ''}"><label class="study-check"><input type="checkbox" name="learned" value="${escape(item.id)}" data-section="${escape(section.id)}" aria-label="Mark ${escape(item.name)} as learned" ${done ? 'checked' : ''}></label><details><summary><strong>${escape(item.name)}</strong><span>${escape(item.summary)}</span></summary><div class="study-detail"><p>${escape(item.details)}</p><p><strong>Example:</strong> ${escape(item.example)}</p>${item.tip ? `<p class="study-tip"><strong>Exam tip:</strong> ${escape(item.tip)}</p>` : ''}<a class="source" href="${escape(item.source || section.source)}" target="_blank" rel="noopener noreferrer">AWS reference ↗</a></div></details></div>`;
}
function renderStudyList() {
  const list = main.querySelector('#study-list');
  if (list) list.innerHTML = studyListHTML();
}
function updateStudyProgress() {
  const p = studyProgress(syllabus.sections, learned);
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
function setLearned(ids, value) {
  for (const id of ids) { if (value) learned[id] ||= Date.now(); else delete learned[id]; }
  saveStudy();
  const wanted = new Set(ids);
  main.querySelectorAll('input[name="learned"]').forEach(input => {
    if (!wanted.has(input.value)) return;
    input.checked = value;
    input.closest('.study-item')?.classList.toggle('learned', value);
  });
  return updateStudyProgress();
}
function openStudy() {
  if (!syllabus) return;
  if (location.hash !== '#study') { location.hash = 'study'; return; }
  view = 'study'; notice = ''; render(true);
}
function leaveStudy() {
  if (location.hash === '#study') history.replaceState(null, '', location.pathname + location.search);
}
function start(nextMode, nextDomain = 0, ids = null) {
  notice = ''; result = null; reviewFilter = 'all';
  let session;
  if (ids) {
    const subset = bank.filter(q => ids.includes(q.id));
    session = makeSession(subset, 'learn', 0, state.stats);
    session.mode = 'review';
  } else session = makeSession(bank, nextMode, nextDomain, state.stats);
  state.active = session; view = 'quiz'; save(); render(true); announce(`${MODES[session.mode].title} started. ${session.ids.length} questions.`);
}
function confirmAction(title, text, label, action, cancelLabel = 'Keep practising') {
  document.querySelector('dialog')?.remove();
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `<h2 id="dialog-title">${escape(title)}</h2><p>${escape(text)}</p><div class="small-actions"><button class="secondary" data-cancel autofocus>${escape(cancelLabel)}</button><button class="primary" data-confirm>${escape(label)}</button></div>`;
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  document.body.append(dialog);
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.querySelector('[data-confirm]').onclick = () => { dialog.close(); action(); };
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}
function requestStart(nextMode, nextDomain = 0, ids = null) {
  if (state.active) confirmAction('Start a new session?', 'Your current unfinished session will be replaced. Its answers have not been added to your progress.', 'Start new session', () => start(nextMode, nextDomain, ids));
  else start(nextMode, nextDomain, ids);
}
function finish(timedOut = false) {
  const s = state.active;
  if (!s) return;
  const scored = scoreSession(s, bank);
  const completedAt = timedOut ? s.deadline : Date.now();
  result = { ...scored, id: s.id, mode: s.mode, domain: s.domain, startedAt: s.startedAt, completedAt, previouslySeen: s.previouslySeen, orders: s.orders };
  if (!state.history.some(r => r.id === s.id)) {
    state.stats = applyResult(state.stats, scored, completedAt);
    state.history = [result, ...state.history].slice(0, 20);
  }
  state.active = null; view = 'result'; reviewFilter = 'all';
  document.querySelector('dialog')?.close();
  notice = timedOut ? 'Time is up. Your saved answers have been submitted.' : '';
  save(); render(true); announce(`Session complete. ${scored.correct} of ${scored.total} correct.`);
}
function requestFinish() {
  const s = state.active, remaining = s.ids.length - answered(s), flags = s.ids.filter(id => s.flagged[id]).length;
  confirmAction('Submit this session?', `${remaining ? `${remaining} question${remaining === 1 ? '' : 's'} still need${remaining === 1 ? 's' : ''} an answer. ` : 'All questions have an answer. '}${flags ? `${flags} flagged for review. ` : ''}Unanswered questions count as incorrect.`, 'Submit & see results', () => finish());
}
function updateTimer() {
  const s = state.active;
  if (!s?.deadline) return;
  const seconds = Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000));
  if (!seconds) { finish(true); return; }
  const el = document.querySelector('#clock');
  if (el) { el.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; el.classList.toggle('urgent', seconds <= 300); el.setAttribute('aria-label', `${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`); }
}
function setAnswers(selected) {
  const s = state.active;
  if (!s) throw new Error('Start a session first.');
  if (s.deadline && Date.now() >= s.deadline) { finish(true); throw new Error('The mock time has expired.'); }
  const q = byId.get(s.ids[s.index]);
  if (s.checked[q.id] && s.mode !== 'mock') throw new Error('This answer has already been checked.');
  if (!Array.isArray(selected) || selected.length > q.answers.length || new Set(selected).size !== selected.length || selected.some(i => !Number.isInteger(i) || i < 0 || i >= q.options.length)) throw new Error(`Select up to ${q.answers.length} valid answer${q.answers.length === 1 ? '' : 's'}.`);
  s.answers[q.id] = [...selected]; save();
  const button = document.querySelector('#check-answer');
  if (button) button.disabled = selected.length !== q.answers.length;
}
function checkAnswer() {
  const s = state.active, q = byId.get(s.ids[s.index]);
  if (s.mode === 'mock' || (s.answers[q.id] || []).length !== q.answers.length || s.checked[q.id]) return;
  s.checked[q.id] = true; save(); render();
  announce(isCorrect(q, s.answers[q.id]) ? 'Correct. Explanation is now shown.' : 'Incorrect. Explanation is now shown.');
  document.querySelector('[data-action="next"]')?.focus({ preventScroll: true });
}
main.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (state.active?.deadline && Date.now() >= state.active.deadline) { finish(true); return; }
  if (action === 'mode') { mode = button.dataset.mode; if (mode === 'mock') domain = 0; render(); document.querySelector(`[data-mode="${mode}"]`)?.focus(); }
  else if (action === 'start') requestStart(mode, domain);
  else if (action === 'review') requestStart('review');
  else if (action === 'resume') { view = 'quiz'; notice = ''; render(true); }
  else if (action === 'home' || action === 'new') { leaveStudy(); view = 'home'; notice = ''; render(true); }
  else if (action === 'study') openStudy();
  else if (action === 'study-kind') { studyKind = button.dataset.kind; render(); main.querySelector(`[data-action="study-kind"][data-kind="${studyKind}"]`)?.focus(); }
  else if (action === 'study-mark') {
    const section = syllabus.sections.find(s => s.id === button.dataset.section), value = button.dataset.value === '1';
    const p = setLearned(section.items.map(i => i.id), value);
    announce(`${value ? 'Marked' : 'Cleared'} all items in ${section.title}. ${p.done} of ${p.total} learned.`);
  }
  else if (action === 'study-reset') confirmAction('Reset the study checklist?', 'Every ticked item will be cleared. Practice scores are not affected.', 'Reset checklist', () => { learned = {}; saveStudy(); render(); announce('Study checklist reset.'); }, 'Keep my progress');
  else if (action === 'check') checkAnswer();
  else if (action === 'finish') requestFinish();
  else if (action === 'next') { if (state.active.index === state.active.ids.length - 1) requestFinish(); else { state.active.index++; save(); render(true); } }
  else if (action === 'previous' || action === 'goto') { state.active.index = action === 'previous' ? state.active.index - 1 : Number(button.dataset.index); save(); render(true); }
  else if (action === 'flag') { const id = state.active.ids[state.active.index]; state.active.flagged[id] = !state.active.flagged[id]; save(); render(); document.querySelector('[data-action="flag"]')?.focus(); }
  else if (action === 'history') { result = state.history.find(r => r.id === button.dataset.id); view = 'result'; reviewFilter = 'all'; render(true); }
  else if (action === 'retry-result') requestStart('review', 0, result.rows.filter(r => !r.correct || r.guessed).map(r => r.id));
});
main.addEventListener('change', event => {
  const input = event.target;
  if (input.id === 'domain') domain = Number(input.value);
  else if (input.name === 'learned') {
    const p = setLearned([input.value], input.checked), item = syllabus.sections.flatMap(s => s.items).find(i => i.id === input.value);
    announce(`${input.checked ? 'Marked' : 'Unmarked'} ${item?.name || 'item'}. ${p.done} of ${p.total} learned.`);
  }
  else if (input.id === 'study-status' || input.id === 'study-priority') { if (input.id === 'study-status') studyStatus = input.value; else studyPriority = input.value; renderStudyList(); }
  else if (input.id === 'review-filter') { reviewFilter = input.value; render(); document.querySelector('#review-filter')?.focus({ preventScroll: true }); }
  else if (input.id === 'guessed') { state.active.guessed[state.active.ids[state.active.index]] = input.checked; save(); }
  else if (input.name === 'answer') {
    const selected = [...main.querySelectorAll('input[name="answer"]:checked')].map(e => Number(e.value));
    try { setAnswers(selected); if (state.active.mode === 'mock') { const value = input.value; render(); main.querySelector(`input[name="answer"][value="${value}"]`)?.focus({ preventScroll: true }); } }
    catch (error) { input.checked = false; announce(error.message); }
  }
});
main.addEventListener('input', event => {
  if (event.target.id !== 'study-search') return;
  studyQuery = event.target.value; renderStudyList();
});
main.addEventListener('toggle', event => {
  const details = event.target;
  if (studyQuery || !details.matches?.('details.study-section')) return;
  if (details.open) openSections.add(details.dataset.section); else openSections.delete(details.dataset.section);
}, true);
window.addEventListener('hashchange', () => {
  if (location.hash === '#study' && syllabus) { view = 'study'; notice = ''; render(true); }
  else if (view === 'study') { view = 'home'; render(true); }
});
document.querySelector('.brand').addEventListener('click', event => { if (!bank.length) return; event.preventDefault(); leaveStudy(); view = 'home'; notice = ''; render(true); });
document.addEventListener('keydown', event => {
  if (view !== 'quiz' || document.querySelector('dialog[open]') || event.altKey || event.metaKey || event.ctrlKey || event.target.matches('select,textarea,input:not([type="radio"]):not([type="checkbox"])')) return;
  if (/^[1-5]$/.test(event.key)) { const input = main.querySelectorAll('input[name="answer"]')[Number(event.key) - 1]; if (input && !input.disabled) { event.preventDefault(); input.click(); input.focus({ preventScroll: true }); } }
});
function publicState() {
  const s = state.active;
  if (!s) return { view, questionCount: bank.length, attempted: statEntries().length, reviewCount: reviewIds().length };
  const q = byId.get(s.ids[s.index]);
  return { view, mode: s.mode, questionNumber: s.index + 1, total: s.ids.length, question: q.question, options: s.orders[q.id].map(i => ({ index: i, text: q.options[i] })), selections: s.answers[q.id] || [], selectCount: q.answers.length, checked: !!s.checked[q.id], deadline: s.deadline };
}
function registerTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const tools = [
    { name: 'get_practice_state', title: 'Read practice state', description: 'Read session progress and the current question with option indices. Does not reveal answer keys.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => publicState() },
    { name: 'start_practice_session', title: 'Start practice session', description: 'Start a quick, learning, or timed mock session. Fails if an unfinished session exists.', inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['quick', 'learn', 'mock'] }, domain: { type: 'integer', minimum: 0, maximum: 5 } }, required: ['mode'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => { if (!input || !['quick', 'learn', 'mock'].includes(input.mode) || !Number.isInteger(input.domain ?? 0) || (input.domain ?? 0) < 0 || (input.domain ?? 0) > 5) throw new Error('Invalid session settings.'); if (state.active) throw new Error('Finish the existing session in the app first.'); start(input.mode, input.domain ?? 0); return publicState(); } },
    { name: 'stage_practice_answer', title: 'Select practice answer', description: 'Select option indices for the current question. Saves the selection without checking the answer or submitting the session.', inputSchema: { type: 'object', properties: { indices: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 4 }, maxItems: 2, uniqueItems: true } }, required: ['indices'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => { setAnswers(input?.indices); view = 'quiz'; render(); return publicState(); } },
  ];
  for (const tool of tools) { try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} }
}
async function boot() {
  try {
    const [response, studyResponse] = await Promise.all([fetch('./questions.json'), fetch('./syllabus.json').catch(() => null)]);
    if (!response.ok) throw new Error('Question download failed.');
    bank = await response.json(); validateBank(bank); byId = new Map(bank.map(q => [q.id, q]));
    try {
      if (studyResponse?.ok) { const data = await studyResponse.json(); validateSyllabus(data); syllabus = data; }
    } catch (error) { syllabus = null; console.warn('Study checklist unavailable.', error); }
    read();
    if (syllabus) { readStudy(); if (location.hash === '#study') view = 'study'; }
    render(); timer = setInterval(updateTimer, 1000); registerTools();
    document.addEventListener('visibilitychange', updateTimer);
  } catch (error) {
    main.innerHTML = '<div class="panel empty"><h1>Practice couldn’t load.</h1><p style="margin:16px 0">Check your connection, then try again. Your saved progress is kept in this browser.</p><button class="primary" id="retry-load">Try again</button></div>';
    document.querySelector('#retry-load').onclick = () => location.reload();
    console.error(error);
  }
}
boot();
