// Browser storage, namespaced per exam by the keys in each exam.json.
import { app } from './state.mjs';
import { MODES, validSession, validSelection } from './engine.mjs';
import { announce } from './ui.mjs';

const EXAM_KEY = 'aws-practice-exam';
const load = key => JSON.parse(localStorage.getItem(key) || 'null');
function store(key, value, message) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { app.storageFailed = true; announce(message); }
}
const timestamps = (saved, ids) => Object.fromEntries(Object.entries(saved || {}).filter(([id, at]) => ids.has(id) && Number.isFinite(at)));

export function readPractice() {
  app.practice = { stats: {}, history: [], active: null };
  try {
    const saved = load(app.exam.storage.practice);
    if (!saved || typeof saved !== 'object') return;
    const { byId, bank, exam } = app;
    const stats = Object.fromEntries(Object.entries(saved.stats || {}).filter(([id, s]) => byId.has(id) && s && Number.isFinite(s.attempts) && s.attempts > 0 && typeof s.firstCorrect === 'boolean' && typeof s.lastCorrect === 'boolean'));
    const history = Array.isArray(saved.history) ? saved.history.filter(r => r && MODES[r.mode] && Array.isArray(r.rows) && r.rows.length && r.rows.every(x => byId.has(x.id) && validSelection(byId.get(x.id), x.selected)) && Number.isFinite(r.completedAt)).slice(0, 20) : [];
    app.practice = { stats, history, active: validSession(saved.active, bank, exam) ? saved.active : null };
  } catch { app.storageFailed = true; }
}
export function savePractice() { store(app.exam.storage.practice, app.practice, 'Browser storage is unavailable. Keep this page open to preserve this session.'); }

export function readStudy() {
  app.learned = {};
  if (!app.syllabus) return;
  try {
    const ids = new Set(app.syllabus.sections.flatMap(s => s.items.map(i => i.id)));
    app.learned = timestamps(load(app.exam.storage.study)?.learned, ids);
  } catch { app.storageFailed = true; }
}
export function saveStudy() { store(app.exam.storage.study, { learned: app.learned }, 'Browser storage is unavailable. Checklist progress will not be saved.'); }

export function readLabs() {
  app.labsDone = {};
  if (!app.labs) return;
  try {
    const ids = new Set(app.labs.labs.map(lab => lab.id));
    app.labsDone = timestamps(load(app.exam.storage.labs)?.done, ids);
  } catch { app.storageFailed = true; }
}
export function saveLabs() { store(app.exam.storage.labs, { done: app.labsDone }, 'Browser storage is unavailable. Lab progress will not be saved.'); }

export function readExamChoice() { try { return localStorage.getItem(EXAM_KEY); } catch { return null; } }
export function saveExamChoice(id) { try { localStorage.setItem(EXAM_KEY, id); } catch { /* the choice is a convenience only */ } }
