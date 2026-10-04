// Practice session lifecycle: start, answer, finish, and the mock timer.
import { app, hooks } from './state.mjs';
import { modeInfo, makeSession, scoreSession, applyResult, isComplete, validSelection } from './engine.mjs';
import { savePractice } from './storage.mjs';
import { announce, confirmAction } from './ui.mjs';

export const currentQuestion = () => app.byId.get(app.practice.active.ids[app.practice.active.index]);
export const answered = s => s.ids.filter(id => isComplete(app.byId.get(id), s.answers[id] || [])).length;

export function start(mode, domain = 0, ids = null) {
  app.notice = ''; app.result = null; app.reviewFilter = 'all';
  let session;
  if (ids) {
    session = makeSession(app.exam, app.bank.filter(q => ids.includes(q.id)), 'learn', 0, app.practice.stats);
    session.mode = 'review';
  } else session = makeSession(app.exam, app.bank, mode, domain, app.practice.stats);
  app.practice.active = session; app.view = 'quiz'; savePractice(); hooks.render(true);
  announce(`${modeInfo(app.exam, session.mode).title} started. ${session.ids.length} questions.`);
}
export function requestStart(mode, domain = 0, ids = null) {
  if (app.practice.active) confirmAction('Start a new session?', 'Your current unfinished session will be replaced. Its answers have not been added to your progress.', 'Start new session', () => start(mode, domain, ids));
  else start(mode, domain, ids);
}
export function finish(timedOut = false) {
  const s = app.practice.active;
  if (!s) return;
  const scored = scoreSession(s, app.bank);
  const completedAt = timedOut ? s.deadline : Date.now();
  app.result = { ...scored, id: s.id, mode: s.mode, domain: s.domain, startedAt: s.startedAt, completedAt, previouslySeen: s.previouslySeen, orders: s.orders };
  if (!app.practice.history.some(r => r.id === s.id)) {
    app.practice.stats = applyResult(app.practice.stats, scored, completedAt);
    app.practice.history = [app.result, ...app.practice.history].slice(0, 20);
  }
  app.practice.active = null; app.view = 'result'; app.reviewFilter = 'all';
  document.querySelector('dialog')?.close();
  app.notice = timedOut ? 'Time is up. Your saved answers have been submitted.' : '';
  savePractice(); hooks.render(true); announce(`Session complete. ${scored.correct} of ${scored.total} correct.`);
}
export function requestFinish() {
  const s = app.practice.active, remaining = s.ids.length - answered(s), flags = s.ids.filter(id => s.flagged[id]).length;
  confirmAction('Submit this session?', `${remaining ? `${remaining} question${remaining === 1 ? '' : 's'} still need${remaining === 1 ? 's' : ''} an answer. ` : 'All questions have an answer. '}${flags ? `${flags} flagged for review. ` : ''}Unanswered questions count as incorrect.`, 'Submit & see results', () => finish());
}
export const expired = () => !!app.practice.active?.deadline && Date.now() >= app.practice.active.deadline;
export function updateTimer() {
  const s = app.practice.active;
  if (!s?.deadline) return;
  const seconds = Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000));
  if (!seconds) { finish(true); return; }
  const el = document.querySelector('#clock');
  if (el) { el.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; el.classList.toggle('urgent', seconds <= 300); el.setAttribute('aria-label', `${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`); }
}
export function setAnswers(selected) {
  const s = app.practice.active;
  if (!s) throw new Error('Start a session first.');
  if (expired()) { finish(true); throw new Error('The mock time has expired.'); }
  const q = currentQuestion();
  if (s.checked[q.id] && s.mode !== 'mock') throw new Error('This answer has already been checked.');
  if (!validSelection(q, selected)) throw new Error(q.type === 'matching' ? `Choose one option for each of the ${q.prompts.length} items.` : q.type === 'ordering' ? `Place each of the ${q.options.length} items once.` : `Select up to ${q.answers.length} valid answer${q.answers.length === 1 ? '' : 's'}.`);
  s.answers[q.id] = [...selected]; savePractice();
  const button = document.querySelector('#check-answer');
  if (button) button.disabled = !isComplete(q, selected);
}
