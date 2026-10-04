import { app } from '../state.mjs';
import { LAB_COSTS, labProgress } from '../engine.mjs';
import { escape, main } from '../ui.mjs';
import { saveLabs } from '../storage.mjs';
import { examSwitcherHTML } from './home.mjs';

// A step's first line is its instruction; any following lines are shown as code to copy (scripts, templates, data).
const step = text => { const [first, ...code] = text.split('\n'); return `${escape(first)}${code.length ? `<pre class="lab-code"><code>${escape(code.join('\n'))}</code></pre>` : ''}`; };
const list = (items, ordered = false) => `<${ordered ? 'ol' : 'ul'}>${items.map(item => `<li>${step(item)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
export function labsHTML() {
  const { labs, exam } = app, p = labProgress(labs, app.labsDone);
  const groups = [['Start here', labs.labs.filter(lab => lab.start)], ...exam.domains.map(d => [`Domain ${d.id} · ${d.short}`, labs.labs.filter(lab => !lab.start && lab.domains[0] === d.id)])].filter(([, items]) => items.length);
  return `<div class="subnav"><button class="text-button" data-action="home">← Back to practice</button><span class="session-badge">Hands-on labs · ${escape(exam.code)}</span></div>${examSwitcherHTML()}
  <div class="page-heading"><div><p class="eyebrow">HANDS-ON LABS</p><h1>Learn by doing.</h1><p class="muted">${escape(labs.intro)}</p></div><span class="bank-pill" data-lab-progress>${p.done} of ${p.total} done</span></div>
  <div class="lab-safety" role="note"><strong>Before you start</strong><p>These labs run in your own AWS account. Do the “Start here” lab first so a budget alert warns you before you spend money. Follow every clean-up list, and never paste passwords or access keys into chats, code, or websites.</p></div>
  ${groups.map(([title, items]) => `<div class="section-row study-group"><h2>${escape(title)}</h2></div>${items.map(labHTML).join('')}`).join('')}`;
}
function labHTML(lab) {
  const done = !!app.labsDone[lab.id];
  return `<div class="lab ${done ? 'done' : ''}"><label class="study-check"><input type="checkbox" name="lab-done" value="${escape(lab.id)}" aria-label="Mark ${escape(lab.title)} as done" ${done ? 'checked' : ''}></label><details>
  <summary><strong>${escape(lab.title)}</strong><span>${escape(lab.goal)}</span><span class="lab-meta"><span class="lab-badge">⏱ ${lab.minutes} min</span><span class="lab-badge cost-${lab.cost}">${escape(LAB_COSTS[lab.cost])}</span>${lab.level ? `<span class="lab-badge">${escape(lab.level)}</span>` : ''}</span></summary>
  <div class="lab-body">
    <p class="lab-services"><strong>Services:</strong> ${lab.services.map(escape).join(', ')}</p>
    <p class="study-tip"><strong>Why it matters for the exam:</strong> ${escape(lab.why)}</p>
    ${lab.costNote ? `<p class="lab-cost"><strong>Cost:</strong> ${escape(lab.costNote)}</p>` : ''}
    ${lab.prerequisites?.length ? `<h3>Before you start</h3>${list(lab.prerequisites)}` : ''}
    <h3>Steps</h3>${list(lab.steps, true)}
    <h3>What you should see</h3>${list(lab.check)}
    ${lab.cleanup ? `<div class="lab-cleanup"><h3>Clean up</h3>${list(lab.cleanup, true)}</div>` : ''}
    ${lab.tips?.length ? `<h3>Tips</h3>${list(lab.tips)}` : ''}
    <p class="lab-sources">${lab.sources.map((url, i) => `<a class="source" href="${escape(url)}" target="_blank" rel="noopener noreferrer">AWS docs${lab.sources.length > 1 ? ` ${i + 1}` : ''} ↗</a>`).join('')}</p>
  </div></details></div>`;
}
export function setLabDone(id, value) {
  if (value) app.labsDone[id] ||= Date.now(); else delete app.labsDone[id];
  saveLabs();
  main.querySelector(`input[name="lab-done"][value="${CSS.escape(id)}"]`)?.closest('.lab')?.classList.toggle('done', value);
  const p = labProgress(app.labs, app.labsDone), pill = main.querySelector('[data-lab-progress]');
  if (pill) pill.textContent = `${p.done} of ${p.total} done`;
  return p;
}
