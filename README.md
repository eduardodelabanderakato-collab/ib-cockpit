# IB Cockpit

A single-player game about getting 45 in the IB, for the May 2028 session.

**Live:** https://eduardodelabanderakato-collab.github.io/ib-cockpit/

No dependencies, no build step, no server. Open `index.html` and it runs. Everything
you enter stays in your browser's `localStorage` and never leaves the machine.

---

## The idea

Forty-five points exist. You either hold them or you don't. Everything on screen
answers one of two questions about them:

- **Held** — what your logged marks say you would score today. Only a real mark
  moves it.
- **Backed** — the score your syllabus coverage actually supports. Studying moves
  this one.

The gap between them is the game.

- Marks ahead of coverage → **exposed**. You are scoring above the ground you
  hold, and that lasts exactly until a paper asks about a topic you skipped.
- Coverage ahead of marks → **unconverted**. You know it; the marks haven't
  caught up. Go sit a paper.

There is no XP. There was, and it was deleted: it went up whatever you did, so it
measured activity and called it progress while competing with the only number
that matters. A streak survives, because turning up is a true thing to know.

## The loop

1. **Fly a sortie** (`x`) — a timed run over what you are actually forgetting.
   The app deals a hand from your rescue queue, spread across subjects, worst
   first. Each target shows a real syllabus node and a real IB command term
   ("**Derive** it — AO2"); you produce the answer cold, then grade yourself.
   Run out of time and it scores as a miss. **This is the only thing in the app
   that can go against you.**
2. **Take ground on the map** (`m`) — every node is a tile. Click it to capture
   it, and watch the captures-to-next-grade counter fall by one.
3. **Watch the road** (`w`) — rank is tied to the projected diploma score, so it
   only moves when the thing you care about moves.

Nothing here invents IB content. The prompts are your syllabus and the official
command-term glossary; the judgement is yours. That is retrieval practice — the
clock and the score are what make it a run instead of a checklist.

## Getting around

- **⌘K** searches everything: 32 controls, 310 syllabus topics, every note.
  Any unbound letter opens it pre-seeded.
- **?** shows the full keymap.
- **1–6** jump to a subject. **Esc** closes.

## What is true, and what isn't

Provenance is recorded per subject and shown on screen:

| Tier | Meaning | Subjects |
|---|---|---|
| **Verified** | Transcribed from the official IB guide | Economics HL |
| **Corroborated** | Cross-checked against an official IB document | Physics HL |
| **Unverified** | Assembled from public sources | the rest |

Two things are deliberately *not* faked:

- **Grade boundaries.** The official PDFs use embedded font subsets and cannot be
  extracted. Rather than invent numbers, there is an editable per-subject table.
  It ships with the generic 1–7 table, which is not any real subject's boundaries
  — 66% is a 5 there and a 7 under Math AA HL's historical grades. Set your own.
- **Backing thresholds.** How much coverage a grade "needs" is a stated
  heuristic, not a forecast, and the screens say so. Predicting your grade is
  what `predict()` does, from real marks.

## Running it

```bash
python3 -m http.server 4321
```

```bash
npm test
```

342 tests, `node --test`, no framework. `tests/parse.test.mjs` parses every module
under the real ES module grammar — `node --check` parses as CommonJS and exits 0
on things that are fatal in a module, which is how a duplicate binding once
reached the browser as a blank cockpit.

After adding or removing any file:

```bash
node tools/sync-precache.mjs
```

## Layout

```
js/models/    pure logic, all tested — mastery decay, recall curve fitting,
              grades, the road to 45, the sortie, the daily brief
js/ui/        cockpit hardware — the jet, HUD, MCDU, sky, command palette
js/views/     screens rendered into the MCDU
js/board.js   the board, assembled once from live state and shared by every
              screen that shows a score
data/         subjects, syllabus trees, resources, command terms
tools/        syllabus builder, precache sync
```

`js/models/` never touches the DOM. That is why it can be tested at all, and the
line is worth keeping.

## Offline

A service worker precaches everything and is **network-first for code and data**,
deliberately: cache-first would hand you a stale ES module graph after a deploy.
It fetches with `cache: 'no-store'`, because a plain `fetch()` inside a service
worker still goes through the HTTP cache and GitHub Pages serves `index.html`
with `max-age=600`.

Verified by stopping the server and reloading: the full cockpit renders.

## Privacy

Everything is local. The passcode gate is stored as a SHA-256 hash and is
**cosmetic** — it stops someone idly opening the tab, nothing more. Anyone with
devtools can read the data, and the app says so on the settings screen. Back up
from Settings; there is no cloud.

Subject guides under `docs/guides/` and any `*.pdf` are gitignored. They are
copyrighted and must never be committed.
