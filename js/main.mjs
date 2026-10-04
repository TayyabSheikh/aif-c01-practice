// Boot, routing and event wiring. Views render HTML from `app`; this module decides which one is shown.
import { app, hooks } from './state.mjs';
import { main, escape, announce, focusMain, confirmAction } from './ui.mjs';
import { loadRegistry, useExam, findExam } from './exams.mjs';
import { readExamChoice, savePractice, saveStudy } from './storage.mjs';
import { requestStart, requestFinish, finish, expired, updateTimer } from './session.mjs';
import { homeHTML } from './views/home.mjs';
import { quizHTML, checkAnswer, updateOrder, changeMatch, changeChoice } from './views/quiz.mjs';
import { resultsHTML } from './views/results.mjs';
import { studyHTML, renderStudyList, setLearned } from './views/study.mjs';
import { labsHTML, setLabDone } from './views/labs.mjs';
import { registerTools } from './tools.mjs';

const SECTIONS = ['study', 'labs'];
function updateChrome() {
  const { exam } = app;
  document.title = `${exam.name} · Practice`;
  document.querySelector('.exam-label').innerHTML = `AWS <span class="divider">/</span> ${escape(exam.code)}`;
  const footer = document.querySelector('footer');
  footer.querySelector('span').textContent = `Independent practice for ${exam.title}.`;
  footer.querySelector('a').href = exam.guide;
}
function render(focus = false) {
  const { view } = app;
  const body = view === 'quiz' && app.practice.active ? quizHTML() : view === 'result' && app.result ? resultsHTML() : view === 'study' && app.syllabus ? studyHTML() : view === 'labs' && app.labs ? labsHTML() : homeHTML();
  main.innerHTML = (app.storageFailed ? '<div class="notification">Progress cannot be saved in this browser. Keep this page open while you practise.</div>' : '') + (app.notice ? `<div class="notification">${escape(app.notice)}</div>` : '') + body;
  updateChrome();
  if (focus) focusMain();
  updateTimer();
}
hooks.render = render;

// ---------- routing: #<exam>, #<exam>/study, #<exam>/labs (legacy #study and #labs use the current exam) ----------
function parseHash() {
  const [first, second] = location.hash.slice(1).split('/');
  if (SECTIONS.includes(first)) return { id: null, section: first };
  return { id: findExam(first) ? first : null, section: SECTIONS.includes(second) ? second : null };
}
const hashFor = (id, section = null) => `#${id}${section ? `/${section}` : ''}`;
function showSection(section) {
  if (section === 'study' && app.syllabus) app.view = 'study';
  else if (section === 'labs' && app.labs) app.view = 'labs';
  else if (SECTIONS.includes(app.view)) app.view = 'home';
}
async function route() {
  const { id, section } = parseHash();
  if (id && id !== app.exam.id) { await useExam(id); app.view = 'home'; }
  showSection(section);
  if (!id && section) history.replaceState(null, '', hashFor(app.exam.id, section));
  render(true);
}
function openSection(section) { app.navPushed = true; location.hash = hashFor(app.exam.id, section); }
function goHome() {
  if (SECTIONS.includes(app.view) && app.navPushed) { app.navPushed = false; history.back(); return; }
  app.navPushed = false;
  history.replaceState(null, '', hashFor(app.exam.id));
  app.view = 'home'; app.notice = ''; render(true);
}
async function switchExam(id) {
  if (id === app.exam.id) return;
  const section = SECTIONS.includes(app.view) ? app.view : null;
  app.navPushed = false;
  history.replaceState(null, '', hashFor(id, section));
  const exam = await useExam(id);
  app.view = 'home'; showSection(section);
  render();
  main.querySelector(`[data-action="exam"][data-exam="${exam.id}"]`)?.focus({ preventScroll: true });
  announce(`Switched to ${exam.name}.`);
}
const loadFailed = error => { console.error(error); app.notice = 'That exam could not be loaded. Check your connection and try again.'; render(); };

// ---------- events ----------
const goto = index => { app.practice.active.index = index; savePractice(); render(true); };
const actions = {
  exam: b => switchExam(b.dataset.exam).catch(loadFailed),
  mode: b => { app.mode = b.dataset.mode; if (app.mode === 'mock') app.domain = 0; render(); main.querySelector(`[data-mode="${app.mode}"]`)?.focus(); },
  start: () => requestStart(app.mode, app.domain),
  review: () => requestStart('review'),
  resume: () => { app.view = 'quiz'; app.notice = ''; render(true); },
  home: goHome,
  new: goHome,
  study: () => openSection('study'),
  labs: () => openSection('labs'),
  'study-kind': b => { app.study.kind = b.dataset.kind; render(); main.querySelector(`[data-action="study-kind"][data-kind="${app.study.kind}"]`)?.focus(); },
  'study-mark': b => {
    const section = app.syllabus.sections.find(s => s.id === b.dataset.section), value = b.dataset.value === '1';
    const p = setLearned(section.items.map(i => i.id), value);
    announce(`${value ? 'Marked' : 'Cleared'} all items in ${section.title}. ${p.done} of ${p.total} learned.`);
  },
  'study-reset': () => confirmAction('Reset the study checklist?', 'Every ticked item will be cleared. Practice scores are not affected.', 'Reset checklist', () => { app.learned = {}; saveStudy(); render(); announce('Study checklist reset.'); }, 'Keep my progress'),
  check: checkAnswer,
  'order-add': b => updateOrder(selected => selected.push(Number(b.dataset.index))),
  'order-remove': b => updateOrder(selected => selected.splice(Number(b.dataset.position), 1)),
  'order-clear': () => updateOrder(selected => selected.splice(0)),
  finish: requestFinish,
  next: () => { const s = app.practice.active; if (s.index === s.ids.length - 1) requestFinish(); else goto(s.index + 1); },
  previous: () => goto(app.practice.active.index - 1),
  goto: b => goto(Number(b.dataset.index)),
  flag: () => { const s = app.practice.active, id = s.ids[s.index]; s.flagged[id] = !s.flagged[id]; savePractice(); render(); main.querySelector('[data-action="flag"]')?.focus(); },
  history: b => { app.result = app.practice.history.find(r => r.id === b.dataset.id); app.view = 'result'; app.reviewFilter = 'all'; render(true); },
  'retry-result': () => requestStart('review', 0, app.result.rows.filter(r => !r.correct || r.guessed).map(r => r.id)),
};
main.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  if (expired()) { finish(true); return; }
  actions[button.dataset.action]?.(button);
});
main.addEventListener('change', event => {
  const input = event.target;
  if (input.id === 'domain') app.domain = Number(input.value);
  else if (input.name === 'learned') {
    const p = setLearned([input.value], input.checked), item = app.syllabus.sections.flatMap(s => s.items).find(i => i.id === input.value);
    announce(`${input.checked ? 'Marked' : 'Unmarked'} ${item?.name || 'item'}. ${p.done} of ${p.total} learned.`);
  }
  else if (input.name === 'lab-done') {
    const p = setLabDone(input.value, input.checked), lab = app.labs.labs.find(l => l.id === input.value);
    announce(`${input.checked ? 'Marked' : 'Unmarked'} ${lab?.title || 'lab'} as done. ${p.done} of ${p.total} labs done.`);
  }
  else if (input.id === 'study-status') { app.study.status = input.value; renderStudyList(); }
  else if (input.id === 'study-priority') { app.study.priority = input.value; renderStudyList(); }
  else if (input.id === 'review-filter') { app.reviewFilter = input.value; render(); main.querySelector('#review-filter')?.focus({ preventScroll: true }); }
  else if (input.id === 'guessed') { const s = app.practice.active; s.guessed[s.ids[s.index]] = input.checked; savePractice(); }
  else if (input.name === 'match') changeMatch(input);
  else if (input.name === 'answer') changeChoice(input);
});
main.addEventListener('input', event => {
  if (event.target.id !== 'study-search') return;
  app.study.query = event.target.value; renderStudyList();
});
main.addEventListener('toggle', event => {
  const details = event.target;
  if (app.study.query || !details.matches?.('details.study-section')) return;
  if (details.open) app.study.open.add(details.dataset.section); else app.study.open.delete(details.dataset.section);
}, true);
document.addEventListener('keydown', event => {
  if (app.view !== 'quiz' || document.querySelector('dialog[open]') || event.altKey || event.metaKey || event.ctrlKey || event.target.matches('select,textarea,input:not([type="radio"]):not([type="checkbox"])')) return;
  if (/^[1-6]$/.test(event.key)) {
    const target = main.querySelectorAll('input[name="answer"], [data-action="order-add"]')[Number(event.key) - 1];
    if (target && !target.disabled) { event.preventDefault(); target.click(); if (target.matches('input')) target.focus({ preventScroll: true }); }
  }
});
document.querySelector('.brand').addEventListener('click', event => {
  if (!app.exam) return;
  event.preventDefault();
  app.navPushed = false;
  history.replaceState(null, '', hashFor(app.exam.id));
  app.view = 'home'; app.notice = ''; render(true);
});

async function boot() {
  try {
    await loadRegistry();
    const { id, section } = parseHash();
    await useExam(id || readExamChoice());
    showSection(section);
    if (!id && section) history.replaceState(null, '', hashFor(app.exam.id, section));
    render();
    setInterval(updateTimer, 1000);
    document.addEventListener('visibilitychange', updateTimer);
    window.addEventListener('hashchange', () => route().catch(loadFailed));
    registerTools();
  } catch (error) {
    main.innerHTML = '<div class="panel empty"><h1>Practice couldn’t load.</h1><p style="margin:16px 0">Check your connection, then try again. Your saved progress is kept in this browser.</p><button class="primary" id="retry-load">Try again</button></div>';
    document.querySelector('#retry-load').onclick = () => location.reload();
    console.error(error);
  }
}
boot();
