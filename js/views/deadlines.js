import { el, panel, esc, toast, subjectColor } from '../ui/dom.js';

const DAY = 86400000;

const STATUSES = ['not started', 'drafting', 'submitted', 'done'];

/** The flight plan: every dated commitment as a waypoint with an ETA. */
export function deadlinesView(mount, ctx) {
  const { index, state } = ctx;

  const form = panel('Add waypoint');
  const title = el('input', 'chip field row-grow');
  title.type = 'text';
  title.placeholder = 'Physics IA first draft';
  const pick = el('select', 'chip field');
  const anyOpt = el('option', null, 'No subject');
  anyOpt.value = '';
  pick.append(anyOpt);
  for (const s of index.subjects) {
    const o = el('option', null, s.level === 'CORE' ? s.short : `${s.short} ${s.level}`);
    o.value = s.id;
    pick.append(o);
  }
  const due = el('input', 'chip field');
  due.type = 'date';
  due.value = new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10);
  const add = el('button', 'chip chip-primary', 'Add');

  const submit = () => {
    const t = title.value.trim();
    if (!t) { title.focus(); return; }
    state.update('deadlines', list => {
      list.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: t,
        subjectId: pick.value || null,
        type: 'milestone',
        due: new Date(due.value + 'T23:59:00').toISOString(),
        status: 'not started',
        progress: 0,
      });
    });
    title.value = '';
    toast('Waypoint added');
    draw();
  };
  add.onclick = submit;
  title.onkeydown = e => { if (e.key === 'Enter') submit(); };

  const row = el('div', 'row');
  row.append(title, pick, due, add);
  form.append(row);

  const list = el('div');
  list.style.display = 'grid';
  list.style.gap = '16px';
  mount.append(form, list);

  function draw() {
    const items = [...state.get('deadlines')]
      .sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
    list.innerHTML = '';

    const open = items.filter(d => d.status !== 'done');
    const closed = items.filter(d => d.status === 'done');

    list.append(section('Flight plan', open, true));
    if (closed.length) list.append(section('Completed', closed, false));
  }

  function section(heading, items, showEmpty) {
    const p = panel(heading, `${items.length}`);
    if (!items.length) {
      if (showEmpty) {
        p.append(el('p', 'empty',
          'No waypoints yet. Add your IA deadlines, TOK dates and mock weeks as your teachers set them.'));
      }
      return p;
    }

    for (const d of items) {
      const days = Math.ceil((Date.parse(d.due) - Date.now()) / DAY);
      const s = d.subjectId ? index.subjects.find(v => v.id === d.subjectId) : null;
      const urgent = d.status !== 'done' && days <= 3;
      const soon = d.status !== 'done' && days <= 14;

      const r = el('div', 'node');
      r.style.setProperty('--c', s ? subjectColor(s) : 'var(--accent)');
      r.dataset.state = d.status === 'done' ? 'fresh' : urgent ? 'lapsed' : soon ? 'fading' : 'dimming';
      r.style.cursor = 'default';

      const eta = d.status === 'done' ? 'done'
        : days < 0 ? `${Math.abs(days)}d late`
        : days === 0 ? 'today' : `${days}d`;

      r.innerHTML = `
        <span class="node-pip"></span>
        <span class="node-code">${esc(s?.short ?? 'CORE')}</span>
        <span class="node-title">${esc(d.title)}
          <span style="color:var(--panel-dim);font-size:11px"> · due ${
            new Date(d.due).toLocaleDateString()}</span></span>`;

      const sel = el('select', 'node-lvl');
      sel.style.cursor = 'pointer';
      for (const st of STATUSES) {
        const o = el('option', null, st);
        o.value = st;
        if (st === d.status) o.selected = true;
        sel.append(o);
      }
      sel.onchange = () => {
        state.update('deadlines', l => {
          const hit = l.find(z => z.id === d.id);
          if (hit) hit.status = sel.value;
        });
        draw();
      };

      const etaEl = el('span', 'node-lvl', eta);
      if (urgent) etaEl.style.color = 'var(--bad)';
      else if (soon) etaEl.style.color = 'var(--warn)';

      const del = el('button', 'node-lvl', '×');
      del.style.cursor = 'pointer';
      del.title = 'Remove this waypoint';
      del.onclick = () => {
        state.update('deadlines', l => l.filter(z => z.id !== d.id));
        draw();
      };

      r.append(sel, etaEl, del);
      p.append(r);
    }
    return p;
  }

  draw();
}
