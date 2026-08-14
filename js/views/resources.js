import { el, panel, esc, toast, subjectColor } from '../ui/dom.js';

/** Quick-launch dock: the built-in links plus whatever you add yourself. */
export async function resourcesView(mount, ctx) {
  const { index, state } = ctx;

  let data = { groups: [] };
  try {
    data = await (await fetch('data/resources.json')).json();
  } catch {
    mount.append(el('p', 'empty', 'Could not load data/resources.json.'));
  }

  const wrap = el('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '16px';
  mount.append(wrap);

  function draw() {
    wrap.innerHTML = '';

    // ── your own links ──────────────────────────────────────
    const mine = state.get('settings').links ?? [];
    const own = panel('Your links', `${mine.length}`);

    const row = el('div', 'row');
    const label = el('input', 'chip field');
    label.type = 'text'; label.placeholder = 'Anki deck'; label.style.maxWidth = '190px';
    const url = el('input', 'chip field row-grow');
    url.type = 'url'; url.placeholder = 'https://…';
    const pick = el('select', 'chip field');
    const none = el('option', null, 'No subject'); none.value = '';
    pick.append(none);
    for (const s of index.subjects) {
      const o = el('option', null, s.short); o.value = s.id; pick.append(o);
    }
    const add = el('button', 'chip chip-primary', 'Add');
    add.onclick = () => {
      const u = url.value.trim();
      if (!/^https?:\/\//i.test(u)) { url.focus(); toast('Needs a full https:// address'); return; }
      state.update('settings', s => {
        s.links = [...(s.links ?? []),
          { id: String(Date.now()), label: label.value.trim() || u, url: u,
            subjectId: pick.value || null }];
      });
      label.value = ''; url.value = '';
      draw();
    };
    row.append(label, url, pick, add);
    own.append(row);

    if (!mine.length) {
      own.append(el('p', 'empty',
        'Add your GoodNotes share links, Drive folders, Anki decks, school portal — anything you open daily.'));
    }
    for (const l of mine) {
      const s = l.subjectId ? index.subjects.find(v => v.id === l.subjectId) : null;
      const a = el('div', 'node');
      a.style.setProperty('--c', s ? subjectColor(s) : 'var(--accent)');
      a.dataset.state = 'fresh';
      a.style.cursor = 'default';
      a.innerHTML = `<span class="node-pip"></span>
        <span class="node-code">${esc(s?.short ?? 'ALL')}</span>
        <span class="node-title"><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"
          style="color:inherit">${esc(l.label)}</a></span>`;
      const del = el('button', 'node-lvl', '×');
      del.style.cursor = 'pointer';
      del.onclick = () => {
        state.update('settings', s2 => { s2.links = (s2.links ?? []).filter(z => z.id !== l.id); });
        draw();
      };
      a.append(del);
      own.append(a);
    }
    wrap.append(own);

    // ── built-in groups ─────────────────────────────────────
    for (const g of data.groups) {
      const p = panel(g.name, `${g.links.length}`);
      if (g.note) p.insertAdjacentHTML('beforeend', `<p class="mfd-sub">${esc(g.note)}</p>`);
      for (const l of g.links) {
        const s = l.subjectId ? index.subjects.find(v => v.id === l.subjectId) : null;
        const a = el('a', 'node');
        a.href = l.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.textDecoration = 'none';
        a.style.setProperty('--c', s ? subjectColor(s) : 'var(--accent)');
        a.dataset.state = 'dimming';
        a.innerHTML = `<span class="node-pip"></span>
          <span class="node-code">${esc(s?.short ?? '—')}</span>
          <span class="node-title">${esc(l.label)}</span>
          <span class="node-lvl">open ↗</span>`;
        p.append(a);
      }
      wrap.append(p);
    }
  }

  draw();
}
