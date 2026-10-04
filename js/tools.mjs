// Optional in-browser tools (document.modelContext) so an assistant can read state and stage answers.
import { app, hooks } from './state.mjs';
import { QUESTION_TYPES } from './engine.mjs';
import { start, setAnswers } from './session.mjs';
import { reviewIds } from './views/home.mjs';

function publicState() {
  const s = app.practice.active, exam = app.exam.id;
  if (!s) return { exam, view: app.view, questionCount: app.bank.length, attempted: Object.keys(app.practice.stats).length, reviewCount: reviewIds().length };
  const q = app.byId.get(s.ids[s.index]);
  return { exam, view: app.view, mode: s.mode, questionNumber: s.index + 1, total: s.ids.length, question: q.question, type: q.type, rule: QUESTION_TYPES[q.type].rule, ...(q.prompts ? { prompts: q.prompts } : {}), options: s.orders[q.id].map(i => ({ index: i, text: q.options[i] })), selections: s.answers[q.id] || [], selectCount: q.answers.length, checked: !!s.checked[q.id], deadline: s.deadline };
}
export function registerTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const validDomain = d => d === 0 || app.exam.domains.some(x => x.id === d);
  const tools = [
    { name: 'get_practice_state', title: 'Read practice state', description: 'Read the current exam, session progress, and the current question with option indices. Does not reveal answer keys.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => publicState() },
    { name: 'start_practice_session', title: 'Start practice session', description: 'Start a quick, learning, or timed mock session for the current exam. Fails if an unfinished session exists.', inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['quick', 'learn', 'mock'] }, domain: { type: 'integer', minimum: 0, maximum: 9 } }, required: ['mode'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => { if (!input || !['quick', 'learn', 'mock'].includes(input.mode) || !Number.isInteger(input.domain ?? 0) || !validDomain(input.domain ?? 0)) throw new Error('Invalid session settings.'); if (app.practice.active) throw new Error('Finish the existing session in the app first.'); start(input.mode, input.domain ?? 0); return publicState(); } },
    { name: 'stage_practice_answer', title: 'Select practice answer', description: 'Select option indices for the current question. For ordering questions, list indices in the chosen order. For matching questions, give one index per prompt (null leaves it unanswered). Saves the selection without checking the answer or submitting the session.', inputSchema: { type: 'object', properties: { indices: { type: 'array', items: { type: ['integer', 'null'], minimum: 0, maximum: 5 }, maxItems: 7 } }, required: ['indices'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => { setAnswers(input?.indices); app.view = 'quiz'; hooks.render(); return publicState(); } },
  ];
  for (const tool of tools) { try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} }
}
