import { loadIndex } from './syllabus.js';
import { createState } from './state.js';
import { createRouter } from './router.js';
import * as mastery from './models/mastery.js';
import { commandView, disposeCommand } from './views/command.js';
import { subjectListView, subjectDetailView } from './views/subject.js';
import { logView } from './views/log.js';
import { questsView, ensureQuests } from './views/quests.js';
import { territoryView } from './views/territory.js';
import { deadlinesView } from './views/deadlines.js';
import { gradesView } from './views/grades.js';
import { plannerView } from './views/planner.js';
import { crewView } from './views/crew.js';
import { resourcesView } from './views/resources.js';
import { settingsView } from './views/settings.js';
import { renderSwitchBank } from './ui/cockpit.js';
import { switchStatus } from './ui/nav.js';
import { el } from './ui/dom.js';
import { requireUnlock } from './gate.js';

const DAY = 86400000;

const state = createState();

// Gate first: nothing renders until the passcode is satisfied (or none is set).
await requireUnlock(state.get('settings').passHash);

const index = await loadIndex('.');

// Run decay once per boot so a long absence is reflected the moment you return.
state.set('mastery', mastery.decayAll(state.get('mastery')));

document.documentElement.dataset.theme = state.get('settings').theme ?? 'glass';

const days = Math.max(0, Math.ceil((Date.parse(index.examStart) - Date.now()) / DAY));
document.getElementById('countdown').innerHTML = `M28 · <b>${days} days</b>`;

const ctx = { index, state };
ensureQuests(ctx);

const view = document.getElementById('view');

/**
 * Inner pages carry the same switch bank as the flight deck, so every
 * destination stays one click away from wherever you are.
 */
function page(title, render) {
  return async (mount, params) => {
    disposeCommand();
    const bank = renderSwitchBank(switchStatus({ index, state }));
    bank.classList.add('bank-standalone');
    mount.append(bank);

    if (title) {
      const h = el('h1');
      h.textContent = typeof title === 'function' ? title(params) : title;
      h.style.marginTop = '4px';
      mount.append(h);
    }
    await render(mount, ctx, params);
  };
}

const router = createRouter({
  '/':            m => commandView(m, ctx),
  '/subjects':    page('Subjects', (m, c) => subjectListView(m, c)),
  '/subject/:id': page(null, (m, c, p) => subjectDetailView(m, c, p)),
  '/territory':   page('Territory', (m, c) => territoryView(m, c)),
  '/quests':      page('Mission board', (m, c) => questsView(m, c)),
  '/deadlines':   page('Flight plan', (m, c) => deadlinesView(m, c)),
  '/grades':      page('Engine performance', (m, c) => gradesView(m, c)),
  '/planner':     page('What to study now', (m, c) => plannerView(m, c)),
  '/log':         page('Flight log', (m, c) => logView(m, c)),
  '/crew':        page('Crew', (m, c) => crewView(m, c)),
  '/resources':   page('Resources', (m, c) => resourcesView(m, c)),
  '/settings':    page('Settings', (m, c) => settingsView(m, c)),
  '*':            page('Not found', m => m.append(el('p', 'empty', 'No such instrument.'))),
}, view);

router.render();
