// Loads the exam registry and each exam pack from dist/exams/<id>/.
import { app } from './state.mjs';
import { validateExam, validateBank, validateSyllabus, validateLabs } from './engine.mjs';
import { readPractice, readStudy, readLabs, saveExamChoice } from './storage.mjs';

const packs = new Map();
async function getJSON(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Couldn't load ${path}.`);
  return response.json();
}
async function optional(path, validate, label) {
  try { const data = await getJSON(path); validate(data); return data; }
  catch (error) { console.warn(`${label} unavailable.`, error); return null; }
}
export async function loadRegistry() {
  const index = await getJSON('./exams/index.json');
  app.registry = await Promise.all(index.exams.map(async id => {
    const exam = await getJSON(`./exams/${id}/exam.json`);
    validateExam(exam);
    if (exam.id !== id) throw new Error(`Exam folder ${id} contains ${exam.id}.`);
    return exam;
  }));
  if (!app.registry.length) throw new Error('No exams are configured.');
}
async function loadPack(exam) {
  const base = `./exams/${exam.id}/`, includes = exam.includes || [];
  const [bank, syllabus, labs] = await Promise.all([
    getJSON(`${base}questions.json`),
    includes.includes('syllabus') ? optional(`${base}syllabus.json`, validateSyllabus, 'Study checklist') : null,
    includes.includes('labs') ? optional(`${base}labs.json`, data => validateLabs(data, exam), 'Labs') : null,
  ]);
  validateBank(bank, exam);
  return { bank, byId: new Map(bank.map(q => [q.id, q])), syllabus, labs };
}
export const findExam = id => app.registry.find(e => e.id === id);
// Makes `id` the current exam (falling back to the first exam) and reads its saved progress.
export async function useExam(id) {
  const exam = findExam(id) || app.registry[0];
  if (!packs.has(exam.id)) packs.set(exam.id, await loadPack(exam));
  Object.assign(app, { exam, ...packs.get(exam.id), domain: 0, result: null, reviewFilter: 'all', notice: '' });
  app.study.open.clear();
  readPractice(); readStudy(); readLabs();
  saveExamChoice(exam.id);
  return exam;
}
