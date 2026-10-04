import { app } from '../state.mjs';
import { MODES, STUDY_KINDS, QUESTION_TYPES, modeInfo, needsReview, studyProgress, labProgress } from '../engine.mjs';
import { escape, pct } from '../ui.mjs';
import { answered } from '../session.mjs';

export const domainName = id => app.exam.domains.find(d => d.id === id)?.short || 'All exam domains';
export const reviewIds = () => app.bank.filter(q => needsReview(app.practice.stats[q.id])).map(q => q.id);

export function examSwitcherHTML() {
  if (app.registry.length < 2) return '';
  return `<div class="exam-switcher" role="group" aria-label="Exam">${app.registry.map(e => `<button data-action="exam" data-exam="${escape(e.id)}" class="${e.id === app.exam.id ? 'selected' : ''}" aria-pressed="${e.id === app.exam.id}"><strong>${escape(e.name)}</strong><span>${escape(e.code)}</span></button>`).join('')}</div>`;
}
function typesNote() {
  const labels = app.exam.types.map(t => QUESTION_TYPES[t].label.toLowerCase());
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}` : labels[0];
  return `${list[0].toUpperCase()}${list.slice(1)} questions, as on the real exam.`;
}
export function homeHTML() {
  const { exam, bank, practice } = app, stats = Object.entries(practice.stats), active = practice.active;
  const accuracy = stats.length ? `${pct(stats.filter(([, s]) => s.firstCorrect).length, stats.length)}%` : '—';
  const reviewCount = reviewIds().length;
  return `${examSwitcherHTML()}<div class="page-heading"><div><p class="eyebrow">YOUR STUDY SPACE</p><h1>One session at a time.</h1><p class="muted">Choose a pace. Build your confidence.</p></div><span class="bank-pill">${bank.length} practice questions</span></div>
  ${active ? `<div class="resume"><div><strong>You have a session in progress</strong><p>${escape(modeInfo(exam, active.mode).title)} · ${answered(active)} of ${active.ids.length} answered${active.deadline ? ' · timer continues while away' : ''}</p></div><button class="secondary" data-action="resume">Resume session →</button></div>` : ''}
  <div class="home-grid"><section class="panel setup" aria-label="Session setup"><div class="section-label"><span class="step-number">01</span><h2>Choose your session</h2></div>
  <div class="mode-grid">${Object.keys(MODES).filter(key => key !== 'review').map(key => { const m = modeInfo(exam, key); return `<button class="mode-card ${app.mode === key ? 'selected' : ''}" data-action="mode" data-mode="${key}" aria-pressed="${app.mode === key}"><span class="mode-symbol" aria-hidden="true">${m.symbol}</span><strong>${m.title}</strong><span>${m.count} questions · ${m.time}</span><small>${m.description}</small></button>`; }).join('')}</div>
  <div class="setup-bottom"><label class="field" for="domain">Focus area<select id="domain" ${app.mode === 'mock' ? 'disabled' : ''}><option value="0">All exam domains</option>${exam.domains.map(d => `<option value="${d.id}" ${app.domain === d.id && app.mode !== 'mock' ? 'selected' : ''}>${escape(d.short)}</option>`).join('')}</select></label><button class="primary" data-action="start">${app.mode === 'mock' ? 'Start timed mock' : 'Start practice'} <span aria-hidden="true">→</span></button></div>
  <p class="info-note">${app.mode === 'mock' ? `${exam.mock.minutes} minutes. Answers stay hidden until you submit. Unanswered questions count as incorrect.` : 'See why each answer works. New questions are prioritised in every session.'}</p>
  </section><aside class="panel progress-panel" aria-label="Your progress"><p class="eyebrow">YOUR PROGRESS</p><div class="stat-large">${accuracy}<span>first-attempt accuracy</span></div><div class="mini-stats"><div><strong>${stats.length}<span> / ${bank.length}</span></strong><span>questions tried</span></div><div><strong>${reviewCount}</strong><span>to revisit</span></div></div>
  <button class="secondary full-width" data-action="review" ${!reviewCount ? 'disabled' : ''}>Review mistakes <span aria-hidden="true">↺</span></button><div class="progress-note">Progress is saved on this browser.<br>Finishing a session updates your stats.</div></aside></div>
  ${app.syllabus ? studyCardHTML() : ''}${app.labs ? labsCardHTML() : ''}
  <div class="section-row"><h2>Every exam domain, covered</h2><span>Weighted to the ${escape(exam.code)} guide</span></div><div class="domain-list" style="--domains:${exam.domains.length}" data-count="${exam.domains.length}">${exam.domains.map(d => {
    const items = bank.filter(q => q.domain === d.id), attempted = items.filter(q => practice.stats[q.id]);
    return `<div class="domain-item"><div class="domain-top"><span>0${d.id}</span><span>${d.weight}% of exam</span></div><h3>${escape(d.short)}</h3><div class="track" aria-label="${attempted.length} of ${items.length} questions tried"><span style="width:${pct(attempted.length, items.length)}%"></span></div><p class="domain-count">${attempted.length} / ${items.length} questions tried</p></div>`;
  }).join('')}</div>
  ${practice.history.length ? `<div class="section-row"><h2>Recent sessions</h2><span>Latest ${Math.min(5, practice.history.length)}</span></div><section class="panel history">${practice.history.slice(0, 5).map(r => `<div class="history-row"><div><strong>${escape(modeInfo(exam, r.mode).title)}</strong><span>${new Date(r.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${r.total} questions · ${escape(domainName(r.domain))}</span></div><button data-action="history" data-id="${escape(r.id)}" aria-label="Review ${escape(modeInfo(exam, r.mode).title)} result, ${r.percent} percent">${r.percent}%<span>Review →</span></button></div>`).join('')}</section>` : ''}
  <p class="bottom-note">${typesNote()} Mocks draw from this same bank; repeat questions are identified at the start.</p>`;
}
function studyCardHTML() {
  const p = studyProgress(app.syllabus.sections, app.learned);
  const kinds = Object.entries(STUDY_KINDS).filter(([kind]) => p.kinds[kind]);
  return `<div class="section-row"><h2>Study checklist</h2><span>${p.done} of ${p.total} learned</span></div><section class="panel study-card" aria-label="Study checklist"><div><p>Every in-scope AWS service and exam concept, plus exam strategy and commonly confused services. Each item has a one-liner, an example and an exam tip. Tick items off as you learn them.</p><div class="study-card-stats" style="--kinds:${kinds.length}">${kinds.map(([kind, label]) => {
    const k = p.kinds[kind];
    return `<div><strong>${k.done}<span> / ${k.total}</span></strong><span>${label}</span><div class="track"><span style="width:${pct(k.done, k.total)}%"></span></div></div>`;
  }).join('')}</div></div><button class="primary" data-action="study">Open checklist <span aria-hidden="true">→</span></button></section>`;
}
function labsCardHTML() {
  const p = labProgress(app.labs, app.labsDone);
  return `<div class="section-row"><h2>Hands-on labs</h2><span>${p.done} of ${p.total} done</span></div><section class="panel study-card labs-card" aria-label="Hands-on labs"><div><p>Try what you study in your own AWS account, using free credits. Each lab has step-by-step console instructions, what you should see, and a clean-up list. Start with account security and a budget alert.</p><div class="track labs-card-track"><span style="width:${pct(p.done, p.total)}%"></span></div></div><button class="primary" data-action="labs">Open labs <span aria-hidden="true">→</span></button></section>`;
}
