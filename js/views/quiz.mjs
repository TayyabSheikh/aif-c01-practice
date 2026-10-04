import { app, hooks } from '../state.mjs';
import { QUESTION_TYPES, modeInfo, isCorrect, isComplete, hasSelection } from '../engine.mjs';
import { escape, pct, announce, main } from '../ui.mjs';
import { currentQuestion, setAnswers } from '../session.mjs';
import { savePractice } from '../storage.mjs';
import { domainName } from './home.mjs';

export function quizHTML() {
  const s = app.practice.active, q = currentQuestion(), selected = s.answers[q.id] || [], checked = !!s.checked[q.id] && s.mode !== 'mock';
  const completed = s.ids.filter(id => s.mode === 'mock' ? isComplete(app.byId.get(id), s.answers[id] || []) : s.checked[id]).length;
  return `<div class="subnav"><button class="text-button" data-action="home">← Save & exit</button><div class="session-badge"><span>${escape(modeInfo(app.exam, s.mode).title)}</span>${s.deadline ? '<span id="clock" class="clock" role="timer" aria-label="Time remaining"></span>' : '<span class="clock">Untimed</span>'}</div></div>
  <div class="quiz-grid"><section class="panel question-panel" aria-label="Practice question"><div class="question-meta"><span class="tag">${escape(domainName(q.domain))}</span><span>${q.type === 'single' ? '' : `${escape(QUESTION_TYPES[q.type].label)} · `}${escape(q.difficulty)} · ${escape(q.id.toUpperCase())}</span></div>
  <h1 class="question-heading" id="question-heading">${escape(q.question)}</h1><p class="question-rule">${escape(QUESTION_TYPES[q.type].rule)} <span class="muted">Question ${s.index + 1} of ${s.ids.length}</span></p>
  ${q.type === 'ordering' ? orderingHTML(q, s, selected, checked) : q.type === 'matching' ? matchingHTML(q, s, selected, checked) : choicesHTML(q, s, selected, checked)}
  ${checked ? explanationHTML(q, selected, s.orders[q.id]) : ''}
  <div class="question-actions"><label class="confidence"><input type="checkbox" id="guessed" ${s.guessed[q.id] ? 'checked' : ''} ${checked ? 'disabled' : ''}>I’m not sure / I guessed</label><div class="small-actions">${s.mode !== 'mock' && !checked ? `<button class="primary" id="check-answer" data-action="check" ${isComplete(q, selected) ? '' : 'disabled'}>Check answer</button>` : `<button class="primary" data-action="next">${s.index === s.ids.length - 1 ? (s.mode === 'mock' ? 'Review & submit' : 'Finish session') : 'Next question →'}</button>`}</div></div>
  <div class="question-bottom"><button class="text-button" data-action="previous" ${s.index === 0 ? 'disabled' : ''}>← Previous</button><button class="text-button" data-action="flag" aria-pressed="${!!s.flagged[q.id]}">${s.flagged[q.id] ? '★ Flagged for review' : '☆ Flag for review'}</button></div>
  </section><aside class="panel question-sidebar"><h2>Your session</h2><p class="muted">${completed} of ${s.ids.length} ${s.mode === 'mock' ? 'answered' : 'checked'}</p><div class="track" style="margin-top:14px"><span style="width:${pct(completed, s.ids.length)}%"></span></div><nav class="navigator" aria-label="Question navigation">${s.ids.map((id, i) => {
    const done = s.mode === 'mock' ? isComplete(app.byId.get(id), s.answers[id] || []) : !!s.checked[id];
    const wrong = done && s.mode !== 'mock' && !isCorrect(app.byId.get(id), s.answers[id]);
    return `<button class="nav-question ${i === s.index ? 'current' : ''} ${done ? 'answered' : ''} ${wrong ? 'wrong' : ''} ${s.flagged[id] ? 'flagged' : ''}" data-action="goto" data-index="${i}" ${i === s.index ? 'aria-current="step"' : ''} aria-label="Question ${i + 1}${done ? ', answered' : ', unanswered'}${s.flagged[id] ? ', flagged' : ''}">${i + 1}</button>`;
  }).join('')}</nav><div class="legend"><span><i class="swatch"></i>Answered</span><span><i class="swatch flag"></i>Flagged</span></div><div class="sidebar-bottom"><button class="secondary full-width" data-action="finish">${s.mode === 'mock' ? 'Submit mock' : 'Finish session'}</button><p>${s.mode === 'mock' ? 'The timer continues if you leave or refresh. Every question counts in this practice score.' : `${q.type === 'matching' ? 'Choose an option for each item.' : `Use 1–${q.options.length} to ${q.type === 'ordering' ? 'place items' : 'select options'}.`} Check each answer to read its explanation.`}</p><p>${s.previouslySeen} previously attempted · ${s.ids.length - s.previouslySeen} new</p></div></aside></div>`;
}
function choicesHTML(q, s, selected, checked) {
  return `<fieldset class="options" aria-labelledby="question-heading"><legend class="sr-only">Answer options</legend>${s.orders[q.id].map((index, position) => `<label class="option ${checked && q.answers.includes(index) ? 'correct' : checked && selected.includes(index) ? 'incorrect' : ''}"><input type="${q.type === 'single' ? 'radio' : 'checkbox'}" name="answer" value="${index}" ${selected.includes(index) ? 'checked' : ''} ${checked ? 'disabled' : ''}><span class="letter" aria-hidden="true">${String.fromCharCode(65 + position)}</span><span class="option-text">${escape(q.options[index])}</span>${checked && q.answers.includes(index) ? '<span class="answer-mark" aria-label="Correct answer">✓</span>' : checked && selected.includes(index) ? '<span class="answer-mark" aria-label="Incorrect selection">×</span>' : ''}</label>`).join('')}</fieldset>`;
}
function orderingHTML(q, s, selected, checked) {
  const remaining = s.orders[q.id].filter(i => !selected.includes(i));
  const slots = q.options.map((_, position) => {
    const i = selected[position];
    if (i === undefined) return `<li class="order-slot empty"><span class="order-number" aria-hidden="true">${position + 1}</span><span class="muted">${position === selected.length && !checked ? 'Tap the next item below' : 'Empty'}</span></li>`;
    const state = checked ? (q.answers[position] === i ? 'correct' : 'incorrect') : '';
    return `<li class="order-slot ${state}"><span class="order-number" aria-hidden="true">${position + 1}</span><span class="option-text">${escape(q.options[i])}</span>${checked ? `<span class="answer-mark" aria-label="${state === 'correct' ? 'Correct position' : 'Wrong position'}">${state === 'correct' ? '✓' : '×'}</span>` : `<button class="order-remove" data-action="order-remove" data-position="${position}" aria-label="Remove ${escape(q.options[i])} from position ${position + 1}">×</button>`}</li>`;
  }).join('');
  return `<div class="ordering"><p class="order-label" id="order-label">Your order</p><ol class="order-slots" aria-labelledby="order-label">${slots}</ol>${!checked && remaining.length ? `<p class="order-label">Items to place</p><div class="order-items">${remaining.map((i, n) => `<button class="option order-item" data-action="order-add" data-index="${i}" aria-label="Place ${escape(q.options[i])} in position ${selected.length + 1}"><span class="letter" aria-hidden="true">${n + 1}</span><span class="option-text">${escape(q.options[i])}</span><span class="order-plus" aria-hidden="true">+</span></button>`).join('')}</div>` : ''}${!checked && selected.length ? '<button class="text-button" data-action="order-clear">Start over</button>' : ''}</div>`;
}
function matchingHTML(q, s, selected, checked) {
  return `<div class="matching">${q.prompts.map((prompt, p) => {
    const value = selected[p], state = checked ? (value === q.answers[p] ? 'correct' : 'incorrect') : '';
    return `<div class="match-row ${state}"><label class="match-prompt" for="match-${p}">${escape(prompt)}</label><div class="match-choice"><select id="match-${p}" name="match" data-prompt="${p}" ${checked ? 'disabled' : ''}><option value="">Choose…</option>${s.orders[q.id].map(i => `<option value="${i}" ${value === i ? 'selected' : ''}>${escape(q.options[i])}</option>`).join('')}</select>${checked ? `<span class="answer-mark" aria-label="${state === 'correct' ? 'Correct' : 'Incorrect'}">${state === 'correct' ? '✓' : '×'}</span>` : ''}</div>${checked && state === 'incorrect' ? `<p class="match-correct">Correct: ${escape(q.options[q.answers[p]])}</p>` : ''}</div>`;
  }).join('')}</div>`;
}
export function answerText(q, selected) {
  if (!hasSelection(selected)) return 'Unanswered';
  if (q.type === 'ordering') return selected.map((i, n) => `${n + 1}. ${escape(q.options[i])}`).join(' → ');
  if (q.type === 'matching') return q.prompts.map((prompt, p) => `${escape(prompt)} → ${Number.isInteger(selected[p]) ? escape(q.options[selected[p]]) : '—'}`).join(' • ');
  return selected.map(i => escape(q.options[i])).join(' • ');
}
export function explanationHTML(q, selected, order = q.options.map((_, i) => i)) {
  const correct = isCorrect(q, selected);
  const rationale = q.type === 'ordering' ? `<p><strong>Correct order</strong></p>${q.answers.map((i, n) => `<p><strong>${n + 1}. ${escape(q.options[i])}:</strong> ${escape(q.explanations[i])}</p>`).join('')}`
    : q.type === 'matching' ? q.prompts.map((prompt, p) => `<p><strong>${escape(prompt)} → ${escape(q.options[q.answers[p]])}:</strong> ${escape(q.explanations[p])}</p>`).join('')
    : order.map((i, p) => `<p><strong>${String.fromCharCode(65 + p)}. ${q.answers.includes(i) ? 'Correct' : 'Incorrect'}:</strong> ${escape(q.explanations[i])}</p>`).join('');
  return `<div class="feedback ${correct ? '' : 'wrong'}"><h3>${correct ? '✓ That’s right.' : hasSelection(selected) ? 'Let’s unpack this one.' : 'No answer selected.'}</h3><p>${escape(q.takeaway)}</p><div class="rationale">${rationale}</div><a class="source" href="${escape(q.source)}" target="_blank" rel="noopener noreferrer">Read the AWS reference ↗</a></div>`;
}

// ---------- quiz interactions ----------
export function checkAnswer() {
  const s = app.practice.active, q = currentQuestion();
  if (s.mode === 'mock' || !isComplete(q, s.answers[q.id] || []) || s.checked[q.id]) return;
  s.checked[q.id] = true; savePractice(); hooks.render();
  announce(isCorrect(q, s.answers[q.id]) ? 'Correct. Explanation is now shown.' : 'Incorrect. Explanation is now shown.');
  document.querySelector('[data-action="next"]')?.focus({ preventScroll: true });
}
export function updateOrder(change) {
  const q = currentQuestion(), selected = [...(app.practice.active.answers[q.id] || [])];
  change(selected);
  try { setAnswers(selected); } catch (error) { announce(error.message); return; }
  hooks.render();
  const next = main.querySelector('[data-action="order-add"]') || main.querySelector('#check-answer:not(:disabled)') || main.querySelector('[data-action="order-remove"]');
  next?.focus({ preventScroll: true });
  announce(selected.length ? `${selected.length} of ${q.options.length} placed.` : 'Order cleared.');
}
export function changeMatch(input) {
  const q = currentQuestion(), saved = app.practice.active.answers[q.id] || [], selected = q.prompts.map((_, p) => saved[p] ?? null);
  selected[Number(input.dataset.prompt)] = input.value === '' ? null : Number(input.value);
  try { setAnswers(selected); if (app.practice.active.mode === 'mock') { const id = input.id; hooks.render(); main.querySelector(`#${id}`)?.focus({ preventScroll: true }); } }
  catch (error) { announce(error.message); hooks.render(); }
}
export function changeChoice(input) {
  const selected = [...main.querySelectorAll('input[name="answer"]:checked')].map(e => Number(e.value));
  try { setAnswers(selected); if (app.practice.active.mode === 'mock') { const value = input.value; hooks.render(); main.querySelector(`input[name="answer"][value="${value}"]`)?.focus({ preventScroll: true }); } }
  catch (error) { input.checked = false; announce(error.message); }
}
