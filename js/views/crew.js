import * as crew from '../models/crew.js';
import { nodesFor } from '../syllabus.js';
import { el, panel, esc, toast, subjectColor } from '../ui/dom.js';

/**
 * The crew room.
 *
 * Each agent hands you two things: the system prompt to paste into its own
 * Claude Project once, and a Brief button that assembles your live state into a
 * ready-to-paste prompt and opens that Project.
 */
export function crewView(mount, ctx) {
  const { index, state } = ctx;

  const intro = panel('Crew', 'eight specialists');
  intro.insertAdjacentHTML('beforeend', `
    <p class="mfd-sub">Set each one up once: copy its system prompt, make a new Claude Project
    with it, then paste the Project URL back here. After that, <b>Brief</b> assembles your mastery,
    what is fading, your last sessions and your scores into a prompt and drops you straight into
    that Project. There is no chat box here on purpose — a Project can hold your guides and past
    papers and remember across sessions, which an embedded box cannot.</p>`);
  mount.append(intro);

  const wrap = el('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '16px';
  mount.append(wrap);

  const roster = [
    ...index.examined.map(s => ({ s, key: s.id })),
    { s: index.subjects.find(v => v.id === 'core'), key: 'core' },
    { s: { id: 'ee', name: 'Extended Essay', short: 'EE', level: 'CORE',
           callsign: 'DEPTH', colorKey: 'accent' }, key: 'ee' },
  ].filter(r => r.s);

  function draw() {
    wrap.innerHTML = '';
    const links = state.get('crew');

    for (const { s, key } of roster) {
      const agent = crew.agentFor(key);
      if (!agent) continue;

      const p = panel(`${agent.callsign} · ${agent.station}`, s.level === 'CORE' ? 'CORE' : s.level);
      p.style.setProperty('--c', subjectColor(s));

      p.insertAdjacentHTML('beforeend', `
        <div style="font-size:14px;font-weight:600;margin-bottom:6px">${esc(s.name)}</div>
        <p class="mfd-sub">${agent.expertise.map(e => esc(e)).join(' · ')}</p>`);

      const row = el('div', 'row');
      row.style.marginTop = '12px';

      const url = el('input', 'chip field row-grow');
      url.type = 'url';
      url.placeholder = 'Paste this agent’s Claude Project URL';
      url.value = links[key] ?? '';
      url.onchange = () => {
        state.update('crew', c => { c[key] = url.value.trim(); });
        toast(`${agent.callsign} linked`);
        draw();
      };

      const copyPrompt = el('button', 'chip', 'Copy system prompt');
      copyPrompt.onclick = async () => {
        await copy(agent.prompt);
        toast(`${agent.callsign} system prompt copied`);
      };

      const brief = el('button', 'chip chip-primary', 'Brief');
      brief.title = 'Assemble your current state and open this agent';
      brief.onclick = async () => {
        const nodes = key === 'ee' ? [] : nodesFor(index, s.id);
        const text = crew.buildBrief({
          subject: s,
          nodes,
          records: state.get('mastery'),
          sessions: state.get('sessions'),
          grades: state.get('grades'),
        });
        await copy(text);
        const target = state.get('crew')[key];
        if (target) {
          toast('Brief copied — opening the Project');
          window.open(target, '_blank', 'noopener');
        } else {
          toast('Brief copied to clipboard — paste it into any Claude chat');
        }
      };

      row.append(url, copyPrompt, brief);
      p.append(row);
      wrap.append(p);
    }
  }

  draw();
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API needs a secure context; fall back to a selectable textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
