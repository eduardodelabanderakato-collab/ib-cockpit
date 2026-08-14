import { loadIndex } from './syllabus.js';
import { createState } from './state.js';
import { createRouter } from './router.js';
import * as mastery from './models/mastery.js';
import { commandView, disposeCommand } from './views/command.js';
import { subjectListView, subjectDetailView } from './views/subject.js';
import { logView } from './views/log.js';
import { el } from './ui/dom.js';

const DAY = 86400000;

const state = createState();
const index = await loadIndex('.');

// Run decay once per boot so a long absence is reflected the moment you return.
state.set('mastery', mastery.decayAll(state.get('mastery')));

document.documentElement.dataset.theme = state.get('settings').theme ?? 'glass';

const days = Math.max(0, Math.ceil((Date.parse(index.examStart) - Date.now()) / DAY));
document.getElementById('countdown').innerHTML = `M28 · <b>${days} days</b>`;

const ctx = { index, state };

const router = createRouter({
  '/':            m => commandView(m, ctx),
  '/subjects':    m => { disposeCommand(); subjectListView(m, ctx); },
  '/subject/:id': (m, p) => { disposeCommand(); subjectDetailView(m, ctx, p); },
  '/log':         m => { disposeCommand(); logView(m, ctx); },
  '*':            m => { disposeCommand(); m.append(el('p', 'empty', 'No such instrument.')); },
}, document.getElementById('view'));

router.render();
