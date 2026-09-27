export const DOMAINS = [
  { id: 1, name: 'Fundamentals of AI & ML', short: 'AI & ML fundamentals', weight: 20 },
  { id: 2, name: 'Fundamentals of GenAI', short: 'Generative AI', weight: 24 },
  { id: 3, name: 'Applications of Foundation Models', short: 'Foundation models', weight: 28 },
  { id: 4, name: 'Guidelines for Responsible AI', short: 'Responsible AI', weight: 14 },
  { id: 5, name: 'Security, Compliance & Governance', short: 'Security & governance', weight: 14 },
];
export const MODES = {
  quick: { title: 'Quick practice', count: 10, time: '~12 min', symbol: '↗', description: 'Feedback after each answer' },
  learn: { title: 'Learn & review', count: 20, time: 'untimed', symbol: '◎', description: 'More room to understand' },
  mock: { title: 'Timed mock', count: 65, time: '90 min', symbol: '◷', description: 'Results at the end' },
  review: { title: 'Mistake review', count: 20, time: 'untimed', symbol: '↺', description: 'Revisit mistakes and guesses' },
};
export function shuffle(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export const QUESTION_TYPES = {
  single: { label: 'Multiple choice', rule: 'Select one answer.' },
  multiple: { label: 'Multiple response', rule: 'Select exactly two answers.' },
  ordering: { label: 'Ordering', rule: 'Tap the items in the correct order.' },
  matching: { label: 'Matching', rule: 'Choose the correct option for each item. Each option is used at least once.' },
};
const inOrder = question => question.type === 'ordering' || question.type === 'matching';
export function isCorrect(question, selected = []) {
  if (inOrder(question)) return selected.length === question.answers.length && question.answers.every((answer, i) => selected[i] === answer);
  return selected.length === question.answers.length && new Set(selected).size === selected.length && selected.every(i => question.answers.includes(i));
}
export function isComplete(question, selected = []) {
  if (question.type === 'matching') return selected.length === question.prompts.length && selected.every(Number.isInteger);
  return selected.length === question.answers.length;
}
export function hasSelection(selected = []) { return selected.some(i => Number.isInteger(i)); }
export function validSelection(question, selected) {
  if (!Array.isArray(selected)) return false;
  const option = i => Number.isInteger(i) && i >= 0 && i < question.options.length;
  if (question.type === 'matching') return selected.length <= question.prompts.length && selected.every(i => i === null || option(i));
  return selected.length <= question.answers.length && new Set(selected).size === selected.length && selected.every(option);
}
function optionOrder(question, random = Math.random) {
  const order = shuffle(question.options.map((_, i) => i), random);
  // Never present ordering items already in the correct sequence.
  if (question.type === 'ordering' && order.every((v, i) => v === question.answers[i])) order.push(order.shift());
  return order;
}
export function quotas(count) {
  const rows = DOMAINS.map(d => ({ domain: d.id, count: Math.floor(count * d.weight / 100), fraction: count * d.weight / 100 % 1 }));
  let left = count - rows.reduce((sum, d) => sum + d.count, 0);
  [...rows].sort((a, b) => b.fraction - a.fraction || a.domain - b.domain).forEach(d => { if (left > 0) { d.count++; left--; } });
  return rows;
}
export function needsReview(stats) { return !!stats && (!stats.lastCorrect || stats.lastGuessed); }
export function chooseQuestions(bank, mode, domain = 0, stats = {}, random = Math.random) {
  if (!MODES[mode]) throw new Error('Choose a valid practice mode.');
  if (!Number.isInteger(domain) || domain < 0 || domain > 5) throw new Error('Choose a valid domain.');
  if (mode === 'mock') domain = 0;
  let pool = bank.filter(q => !domain || q.domain === domain);
  if (mode === 'review') pool = pool.filter(q => needsReview(stats[q.id]));
  const total = Math.min(MODES[mode].count, pool.length);
  if (!total) return [];
  const preferUnseen = list => shuffle(list, random).sort((a, b) => Number(!!stats[a.id]) - Number(!!stats[b.id]));
  if (domain || mode === 'review') return preferUnseen(pool).slice(0, total);
  const picked = quotas(total).flatMap(d => preferUnseen(pool.filter(q => q.domain === d.domain)).slice(0, d.count));
  if (picked.length < total) {
    const ids = new Set(picked.map(q => q.id));
    picked.push(...preferUnseen(pool.filter(q => !ids.has(q.id))).slice(0, total - picked.length));
  }
  return shuffle(picked, random);
}
export function makeSession(bank, mode, domain, stats = {}, now = Date.now()) {
  const questions = chooseQuestions(bank, mode, domain, stats);
  if (!questions.length) throw new Error('There are no questions to review yet.');
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 9)}`, mode, domain: mode === 'mock' ? 0 : domain,
    ids: questions.map(q => q.id), orders: Object.fromEntries(questions.map(q => [q.id, optionOrder(q)])),
    answers: {}, checked: {}, flagged: {}, guessed: {}, index: 0, startedAt: now,
    deadline: mode === 'mock' ? now + 90 * 60 * 1000 : null,
    previouslySeen: questions.filter(q => stats[q.id]).length,
  };
}
export function scoreSession(session, bank) {
  const byId = new Map(bank.map(q => [q.id, q]));
  const rows = session.ids.map(id => {
    const question = byId.get(id);
    if (!question) throw new Error('A question is missing from this session.');
    const selected = session.answers[id] || [];
    return { id, domain: question.domain, selected: [...selected], correct: isCorrect(question, selected), guessed: !!session.guessed[id], flagged: !!session.flagged[id] };
  });
  const correct = rows.filter(r => r.correct).length;
  return { correct, total: rows.length, percent: Math.round(correct / rows.length * 100), unanswered: rows.filter(r => !hasSelection(r.selected)).length, rows };
}
export function applyResult(previousStats, result, now = Date.now()) {
  const stats = { ...previousStats };
  for (const row of result.rows) {
    const previous = stats[row.id];
    stats[row.id] = { attempts: (previous?.attempts || 0) + 1, correct: (previous?.correct || 0) + Number(row.correct), firstCorrect: previous ? previous.firstCorrect : row.correct, lastCorrect: row.correct, lastGuessed: row.guessed, lastAt: now };
  }
  return stats;
}
export function validateBank(bank) {
  if (!Array.isArray(bank) || bank.length < 65) throw new Error('The question bank could not be loaded.');
  const ids = new Set(), stems = new Set();
  for (const q of bank) {
    if (!q.id || ids.has(q.id) || !q.question || stems.has(q.question.trim().toLowerCase())) throw new Error('Duplicate or missing question.');
    ids.add(q.id); stems.add(q.question.trim().toLowerCase());
    if (!DOMAINS.some(d => d.id === q.domain) || !QUESTION_TYPES[q.type]) throw new Error(`Invalid question ${q.id}.`);
    const unique = list => Array.isArray(list) && new Set(list).size === list.length && list.every(Boolean);
    const option = i => Number.isInteger(i) && i >= 0 && i < q.options.length;
    const optionCount = { single: [4, 4], multiple: [5, 5], ordering: [3, 6], matching: [2, 6] }[q.type];
    if (!unique(q.options) || q.options.length < optionCount[0] || q.options.length > optionCount[1]) throw new Error(`Invalid options ${q.id}.`);
    if (q.type === 'matching' && (!unique(q.prompts) || q.prompts.length < 3 || q.prompts.length > 7)) throw new Error(`Invalid prompts ${q.id}.`);
    const answerCount = { single: 1, multiple: 2, ordering: q.options.length, matching: q.prompts?.length }[q.type];
    const answersOk = Array.isArray(q.answers) && q.answers.length === answerCount && q.answers.every(option)
      && (q.type === 'matching' ? new Set(q.answers).size === q.options.length : new Set(q.answers).size === q.answers.length);
    if (!answersOk) throw new Error(`Invalid answers ${q.id}.`);
    const explained = q.type === 'matching' ? q.prompts.length : q.options.length;
    if (!Array.isArray(q.explanations) || q.explanations.length !== explained || q.explanations.some(s => !s) || !q.takeaway) throw new Error(`Missing explanation ${q.id}.`);
    if (!isAwsSource(q.source)) throw new Error(`Invalid source ${q.id}.`);
  }
  return true;
}
export function isAwsSource(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'aws.amazon.com' || url.hostname.endsWith('.aws.amazon.com'));
  } catch { return false; }
}
export const STUDY_KINDS = { service: 'AWS services', concept: 'Exam concepts', strategy: 'Exam strategy' };
export function validateSyllabus(syllabus) {
  const text = value => typeof value === 'string' && value.trim().length > 0;
  if (!syllabus || !Array.isArray(syllabus.sections) || !syllabus.sections.length) throw new Error('The study checklist could not be loaded.');
  const ids = new Set();
  for (const s of syllabus.sections) {
    if (!s || !text(s.id) || ids.has(s.id) || !STUDY_KINDS[s.kind] || !['core', 'supporting'].includes(s.priority) || !['group', 'title', 'summary'].every(k => text(s[k])) || !isAwsSource(s.source) || !Array.isArray(s.items) || !s.items.length) throw new Error(`Invalid study section ${s?.id}.`);
    ids.add(s.id);
    for (const item of s.items) {
      if (!item || !text(item.id) || ids.has(item.id) || !['name', 'summary', 'details', 'example'].every(k => text(item[k])) || (item.tip !== undefined && !text(item.tip)) || (item.source !== undefined && !isAwsSource(item.source))) throw new Error(`Invalid study item ${item?.id} in ${s.id}.`);
      ids.add(item.id);
    }
  }
  return true;
}
export function studyProgress(sections, learned = {}) {
  const progress = { done: 0, total: 0, kinds: {}, sections: {} };
  for (const s of sections) {
    const done = s.items.filter(item => learned[item.id]).length, kind = progress.kinds[s.kind] ||= { done: 0, total: 0 };
    progress.sections[s.id] = { done, total: s.items.length };
    kind.done += done; kind.total += s.items.length;
    progress.done += done; progress.total += s.items.length;
  }
  return progress;
}
export function filterStudy(sections, { kind = null, query = '', status = 'all', priority = 'all' } = {}, learned = {}) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return sections.flatMap(s => {
    if ((kind && s.kind !== kind) || (priority === 'core' && s.priority !== 'core')) return [];
    const sectionText = `${s.title} ${s.summary}`.toLowerCase();
    const items = s.items.filter(item => {
      if ((status === 'learned' && !learned[item.id]) || (status === 'todo' && learned[item.id])) return false;
      const itemText = `${sectionText} ${item.name} ${item.summary} ${item.details}`.toLowerCase();
      return terms.every(term => itemText.includes(term));
    });
    return items.length ? [{ ...s, items }] : [];
  });
}
export function validSession(s, bank) {
  if (!s || !MODES[s.mode] || !Array.isArray(s.ids) || !s.ids.length || new Set(s.ids).size !== s.ids.length || !Number.isInteger(s.index) || s.index < 0 || s.index >= s.ids.length || !Number.isFinite(s.startedAt)) return false;
  if (s.mode === 'mock' && !Number.isFinite(s.deadline)) return false;
  const byId = new Map(bank.map(q => [q.id, q]));
  if (!s.orders || !s.answers || !s.checked || !s.flagged || !s.guessed) return false;
  return s.ids.every(id => {
    const q = byId.get(id), order = s.orders[id], answers = s.answers[id] || [];
    return q && Array.isArray(order) && order.length === q.options.length && new Set(order).size === order.length && order.every(i => Number.isInteger(i) && i >= 0 && i < q.options.length) && validSelection(q, answers);
  });
}
