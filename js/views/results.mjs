import { app } from '../state.mjs';
import { modeInfo } from '../engine.mjs';
import { escape, pct } from '../ui.mjs';
import { answerText, explanationHTML } from './quiz.mjs';

export function resultsHTML() {
  const r = app.result, exam = app.exam;
  const filtered = r.rows.filter(row => app.reviewFilter === 'all' || (app.reviewFilter === 'incorrect' ? !row.correct : app.reviewFilter === 'guessed' ? row.guessed : row.flagged));
  const mins = Math.max(1, Math.round((r.completedAt - r.startedAt) / 60000));
  return `<div class="subnav"><button class="text-button" data-action="home">← Back to practice</button><span class="session-badge">${escape(modeInfo(exam, r.mode).title)} complete</span></div><div class="page-heading"><div><p class="eyebrow">SESSION RESULTS · ${escape(exam.code)}</p><h1>Keep the knowledge.</h1></div><span class="bank-pill">${r.correct} of ${r.total} correct</span></div>
  <section class="panel score-grid"><div><div class="score-number">${r.percent}<small>%</small></div><p class="score-detail">${mins} min elapsed · ${r.unanswered} unanswered</p></div><div class="score-description"><h2>${r.percent >= 80 ? 'A strong session.' : r.percent >= 60 ? 'You’re building a foundation.' : 'You’ve found your next focus.'}</h2><p>${r.percent >= 80 ? 'Review any guesses, then try fresh questions to check what sticks.' : 'Take a moment with the explanations below, then revisit the questions that need another look.'}</p><div class="small-actions"><button class="primary" data-action="new">New practice session →</button><button class="secondary" data-action="retry-result" ${r.rows.every(x => x.correct && !x.guessed) ? 'disabled' : ''}>Review these mistakes</button></div></div></section>
  <div class="section-row"><h2>Accuracy by domain</h2><span>This session</span></div><section class="panel result-domains">${exam.domains.map(d => {
    const rows = r.rows.filter(row => row.domain === d.id), correct = rows.filter(row => row.correct).length;
    return `<div class="result-domain"><span>${escape(d.short)}</span><div class="track"><span style="width:${pct(correct, rows.length)}%"></span></div><span>${rows.length ? `${correct}/${rows.length} · ${pct(correct, rows.length)}%` : '—'}</span></div>`;
  }).join('')}</section><p class="bottom-note">Practice accuracy is a raw percentage, not an AWS scaled score or a pass prediction.${r.mode === 'mock' ? ' This mock uses the shared practice bank.' : ''}${r.previouslySeen ? ` ${r.previouslySeen} questions had been attempted before.` : ''}</p>
  <div class="review-tools"><h2>Review your answers <span class="muted">(${filtered.length})</span></h2><label class="sr-only" for="review-filter">Filter answers</label><select id="review-filter">${[['all', 'All answers'], ['incorrect', 'Incorrect & unanswered'], ['guessed', 'Guessed answers'], ['flagged', 'Flagged answers']].map(([value, label]) => `<option value="${value}" ${app.reviewFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
  ${filtered.length ? filtered.map(row => {
    const q = app.byId.get(row.id), order = r.orders[q.id] || q.options.map((_, i) => i);
    return `<details class="review-item"><summary><span class="result-dot ${row.correct ? '' : 'wrong'}" aria-label="${row.correct ? 'Correct' : 'Incorrect'}">${row.correct ? '✓' : '×'}</span><span>${escape(q.question)}</span></summary><div class="review-body"><p class="review-answer"><strong>Your answer:</strong> ${answerText(q, row.selected)}</p><p class="review-answer"><strong>Correct answer:</strong> ${answerText(q, q.answers)}</p>${q.type === 'single' || q.type === 'multiple' ? `<div class="rationale" style="margin-bottom:16px">${order.map((i, p) => `<p><strong>${String.fromCharCode(65 + p)}.</strong> ${escape(q.options[i])}</p>`).join('')}</div>` : ''}${explanationHTML(q, row.selected, order)}</div></details>`;
  }).join('') : '<div class="panel empty">No answers in this category.</div>'}`;
}
