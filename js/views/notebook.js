import * as nb from '../models/notebook.js';
import { el, panel, esc, toast, subjectColor } from '../ui/dom.js';

/**
 * The library: everything you have written, in one place, searchable.
 * Notes bound to a syllabus topic and free notes live side by side.
 */
export function notebookView(mount, ctx) {
  const { index, state } = ctx;

  let query = '';
  let subject = null;
  let openId = null;

  const wrap = el('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '14px';
  mount.append(wrap);

  const all = () => nb.collect({
    notes: state.get('notes'),
    notebook: state.get('notebook') ?? [],
    index,
  });

  function draw() {
    wrap.innerHTML = '';
    const entries = all();
    const shown = nb.search(nb.bySubject(entries, subject), query);
    const s = nb.stats(entries);

    // ── header: search, filter, new ─────────────────────────
    const head = panel('Notebook', `${s.total} note${s.total === 1 ? '' : 's'}`);
    head.insertAdjacentHTML('beforeend', `<div class="stat">
      <span><b>${s.total}</b><i>notes</i></span>
      <span><b>${s.words.toLocaleString()}</b><i>words</i></span>
      <span><b>${s.node}</b><i>on topics</i></span>
      <span><b>${s.linked}</b><i>goodnotes linked</i></span>
    </div>`);

    const bar = el('div', 'row');
    const find = el('input', 'chip field row-grow');
    find.type = 'search';
    find.placeholder = 'Search everything you have written…';
    find.value = query;
    find.oninput = () => { query = find.value; redrawList(); };

    const pick = el('select', 'chip field');
    const none = el('option', null, 'All subjects'); none.value = '';
    pick.append(none);
    for (const sub of index.subjects) {
      const o = el('option', null, sub.short);
      o.value = sub.id;
      if (subject === sub.id) o.selected = true;
      pick.append(o);
    }
    pick.onchange = () => { subject = pick.value || null; redrawList(); };

    const add = el('button', 'chip chip-primary', 'New note');
    add.onclick = () => {
      const note = nb.newNote({ title: 'Untitled', subjectId: subject });
      state.update('notebook', list => { (list ?? []).unshift(note); return list ?? [note]; });
      openId = note.id;
      draw();
    };

    bar.append(find, pick, add);
    head.append(bar);
    wrap.append(head);

    // ── the list ────────────────────────────────────────────
    const listBox = panel('All notes', shown.length === entries.length
      ? `${shown.length}` : `${shown.length} of ${entries.length}`);
    wrap.append(listBox);

    function redrawList() {
      const list = nb.search(nb.bySubject(all(), subject), query);
      const body = listBox.querySelector('[data-list]') ?? el('div');
      body.dataset.list = '1';
      body.innerHTML = '';
      listBox.querySelector('.panel-h').lastChild.textContent = `${list.length}`;

      if (!list.length) {
        body.append(el('p', 'empty', entries.length
          ? 'Nothing matches that search.'
          : 'Nothing written yet. Press New note, or write against a topic with the NOTE key.'));
      }

      for (const e of list) {
        const sub = e.subjectId ? index.subjects.find(v => v.id === e.subjectId) : null;
        const row = el('div');

        const head2 = el('button', 'node');
        head2.style.setProperty('--c', sub ? subjectColor(sub) : 'var(--accent)');
        head2.dataset.state = e.pinned ? 'fresh' : e.md.trim() ? 'dimming' : 'untouched';
        head2.innerHTML = `
          <span class="node-pip"></span>
          <span class="node-code">${esc(sub?.short ?? '—')}</span>
          <span class="node-title">${e.pinned ? '📌 ' : ''}<b>${esc(e.title)}</b>
            <span style="display:block;color:var(--panel-dim);font-size:11.5px;margin-top:2px">
              ${esc(nb.excerpt(e.md)) || '<i>empty</i>'}</span></span>
          <span class="node-lvl">${e.kind === 'node' ? 'topic' : 'note'}${
            e.goodnotes ? ' · ✎' : ''}</span>`;
        head2.onclick = () => { openId = openId === e.id ? null : e.id; redrawList(); };
        row.append(head2);

        if (openId === e.id) row.append(editor(e));
        body.append(row);
      }
      listBox.append(body);
    }

    redrawList();
  }

  /** Inline editor for one entry, whichever store it lives in. */
  function editor(e) {
    const box = el('div', 'notes');

    const titleRow = el('div', 'row');
    if (e.kind === 'free') {
      const t = el('input', 'chip field row-grow');
      t.type = 'text';
      t.value = e.title;
      t.placeholder = 'Title';
      t.oninput = () => save({ title: t.value });
      const pick = el('select', 'chip field');
      const none = el('option', null, 'No subject'); none.value = '';
      pick.append(none);
      for (const sub of index.subjects) {
        const o = el('option', null, sub.short);
        o.value = sub.id;
        if (e.subjectId === sub.id) o.selected = true;
        pick.append(o);
      }
      pick.onchange = () => save({ subjectId: pick.value || null });
      titleRow.append(t, pick);
    } else {
      titleRow.append(el('span', 'mono', `Bound to ${e.title}`));
    }

    const ta = el('textarea');
    ta.value = e.md;
    ta.placeholder = 'Write anything — formulas, mistakes, plans, quotes…';

    const gn = el('input', 'chip field row-grow');
    gn.type = 'url';
    gn.placeholder = 'GoodNotes share link (optional)';
    gn.value = e.goodnotes;

    const actions = el('div', 'row');
    const saveBtn = el('button', 'chip chip-primary', 'Save');
    const pin = el('button', 'chip', e.pinned ? 'Unpin' : 'Pin');
    const del = el('button', 'chip', 'Delete');
    del.style.borderColor = 'var(--bad)';
    del.style.color = 'var(--bad)';

    saveBtn.onclick = () => {
      save({ md: ta.value, goodnotes: gn.value.trim() });
      toast('Saved');
      draw();
    };
    pin.onclick = () => { save({ pinned: !e.pinned }); draw(); };

    let armed = false;
    del.onclick = () => {
      if (!armed) {
        armed = true;
        del.textContent = 'Click again to delete';
        setTimeout(() => { armed = false; del.textContent = 'Delete'; }, 4000);
        return;
      }
      if (e.kind === 'free') {
        state.update('notebook', list => (list ?? []).filter(n => n.id !== e.id));
      } else {
        state.update('notes', n => { delete n[e.nodeId]; });
      }
      openId = null;
      toast('Deleted');
      draw();
    };

    actions.append(saveBtn, pin, del);
    box.append(titleRow, ta, gn, actions);

    /** Writes back into whichever store this entry came from. */
    function save(patch) {
      const stamp = new Date().toISOString();
      if (e.kind === 'free') {
        state.update('notebook', list => {
          const hit = (list ?? []).find(n => n.id === e.id);
          if (hit) Object.assign(hit, patch, { updatedAt: stamp });
          return list ?? [];
        });
      } else {
        state.update('notes', n => {
          n[e.nodeId] = { ...(n[e.nodeId] ?? {}), ...patch, updatedAt: stamp };
        });
      }
      Object.assign(e, patch);
    }

    return box;
  }

  draw();
}
