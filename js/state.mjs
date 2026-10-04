// Shared app state. The current exam's data is copied onto `app` by useExam() in exams.mjs;
// views read from it and main.mjs registers render() in `hooks` so views can re-render.
export const app = {
  registry: [],
  exam: null, bank: [], byId: new Map(), syllabus: null, labs: null,
  practice: { stats: {}, history: [], active: null },
  learned: {}, labsDone: {},
  view: 'home', mode: 'quick', domain: 0, result: null, reviewFilter: 'all',
  storageFailed: false, notice: '', navPushed: false,
  study: { kind: 'service', query: '', status: 'all', priority: 'all', open: new Set() },
};
export const hooks = { render: () => {} };
