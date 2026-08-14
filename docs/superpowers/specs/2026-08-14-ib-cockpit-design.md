# IB Cockpit — Design Specification

**Date:** 2026-08-14
**Owner:** Eduardo Kato
**Session:** May 2028 (DP1 begins Aug 2026 · ~625 days to first exam)
**Status:** approved for implementation

---

## 1. Purpose

A private, offline-first mission control for the IB Diploma Programme. Six subjects plus core,
decomposed into official syllabus nodes that are *captured* by studying them. Mastery decays when
neglected. XP, levels and daily quests convert two years of revision into a game loop that runs
whether or not motivation shows up. A recommendation engine decides what to study; a coach voice
reports the truth about it.

The stated goal is 45 points, reached by making the work compulsive rather than disciplined.

## 2. Non-goals

- Not a public portfolio. Nobody else is an audience.
- Not multi-user. No accounts, no sharing, no collaboration.
- Not a notes app replacement. Handwriting stays in GoodNotes.
- Not an embedded AI chat. See §11.
- No backend, no database, no build step.

## 3. Subjects

| Callsign | Subject | Level | Group |
|---|---|---|---|
| AXIS | Mathematics: Analysis & Approaches | HL | 5 |
| THRUST | Physics | HL | 4 |
| YIELD | Economics | HL | 3 |
| CATALYST | Chemistry | SL | 4 |
| LÉXICO | Português A: Language & Literature | SL | 1 |
| RHETOR | English A: Language & Literature | SL | 1 |
| PRISM | Theory of Knowledge | — | core |
| DEPTH | Extended Essay | — | core |

Two Group 1 languages ⇒ **bilingual diploma**. Three HL, three SL.

## 4. Decisions

| Decision | Choice |
|---|---|
| Audience | Private study cockpit |
| Storage | `localStorage` behind an abstraction layer, JSON export/import |
| Syllabus depth | Topic → subtopic |
| Home screen | Command Center |
| Game layer | Conquest map + XP progression + daily quests, layered |
| Mastery | 5 levels with memory decay |
| Logging | Focus timer **and** manual entry |
| Two-year arc | DP1/DP2 phased syllabus |
| Planner | Daily recommendation engine |
| Core (TOK/EE/CAS) | Full module |
| Grades | Full engine with 45-point projection |
| Notes | Rich markdown + per-topic GoodNotes links |
| Agents | Callsigns; context-brief generator → Claude Projects |
| Coach tone | Brutally honest |
| Tech | Vanilla HTML/CSS/JS, ES modules, no build step |
| Hosting | Public repo + client-side passcode gate, GitHub Pages |
| Theme | Five selectable; default **Glass Cockpit** |

## 5. The aircraft metaphor

The interface should read as the flight deck of a new aircraft — bright cabin, luminous instrument
screens. This is carried by mapping real cockpit instruments onto real study metrics, not by
decoration:

| Instrument | Maps to |
|---|---|
| **Primary Flight Display** (header band) | Artificial horizon tilts with pace — level when on schedule, banked when behind. |
| **Airspeed** | Study velocity, hours/week trailing average. |
| **Altitude** | Total syllabus captured, all subjects. |
| **Heading** | Next deadline and its bearing in days. |
| **Engine gauges** | Six subject cards — per-subject level, capture %, decay pressure. |
| **Moving map** | Territory view: the syllabus as terrain, captured / fading / locked. |
| **Flight plan** | Deadlines as sequenced waypoints with ETAs. |
| **Master caution** | Coach alerts — fading topics, neglected subjects, projection shortfalls. |
| **Systems check** | A brief boot sequence on the first load of each day. |
| **Crew** | The eight subject agents. |

Imagery is optional and deferred; the metaphor must work in pure CSS/SVG first so the site stays
sub-second.

## 6. Architecture

Vanilla ES modules. No npm, no bundler, no framework. Two vendored files committed directly: a
minimal markdown renderer and KaTeX for formula rendering.

```
index.html                 shell, passcode gate, theme boot
assets/css/
  tokens.css               all five themes as CSS variable sets
  base.css  components.css  views.css
js/
  main.js                  router + boot
  store.js                 storage abstraction — corruption-guarded, schema-versioned
  state.js                 in-memory state + pub/sub
  models/
    mastery.js             decay math, capture, rescue
    xp.js                  XP, levels, streaks
    quests.js              daily/weekly generation
    recommend.js           what to study now
    grades.js              predicted grades, 45-point projection
    crew.js                agent registry + context-brief builder
  views/
    command.js subject.js territory.js log.js
    deadlines.js core.js grades.js resources.js settings.js
  ui/
    timer.js modal.js markdown.js charts.js pfd.js
data/
  syllabus/*.json          one per subject, plus core.json
  resources.json
  crew.json
```

Charts are hand-rolled SVG. No Chart.js.

## 7. Data model

All keys namespaced `ibc:`. Split across keys so a write never rewrites the whole store.

```
ibc:meta      { schema, createdAt, session:"2028-05", dpStart:"2026-08", targetPoints }
ibc:subjects  [ { id, name, short, level, group, color, callsign, projectUrl } ]
ibc:mastery   { [nodeId]: { level:0-4, lastTouched:ISO, touches:int, phase:"DP1"|"DP2" } }
ibc:sessions  [ { id, ts, subjectId, nodeIds[], minutes, note, source:"timer"|"manual" } ]
ibc:notes     { [nodeId]: { md, goodnotes:url, updatedAt } }
ibc:deadlines [ { id, title, subjectId|"core", type, due:ISO, status, progress } ]
ibc:grades    [ { id, ts, subjectId, label, paper, raw, max, pct, grade } ]
ibc:quests    { date, seed, daily[], weekly[] }
ibc:xp        { total, bySubject{}, streak:{ current, longest, lastDay } }
ibc:settings  { theme, passHash, colorOverrides{}, coachTone, backupLastAt }
```

Node IDs are `subjectId:code`, e.g. `math-aa-hl:5.7`, `physics-hl:B.2`.

## 8. Mastery and decay

Five levels: `0 Untouched · 1 Seen · 2 Practiced · 3 Solid · 4 Mastered`.

Half-lives in days by level: `[—, 5, 12, 30, 75]`.

```
freshness f = 2 ^ ( -daysSinceTouched / halfLife[level] )
```

| f | State | Behaviour |
|---|---|---|
| ≥ 0.70 | fresh | rendered solid |
| 0.40 – 0.70 | dimming | rendered dimmed |
| 0.20 – 0.40 | **fading** | amber ring, enters the rescue queue, feeds quests |
| < 0.20 | lapsed | demotes one level, `lastTouched` reset to prevent cascade |

Effective mastery is continuous: `level - 1 + f`, so subject progress is
`Σ effectiveMastery / (4 × nodeCount)` rather than a crude checkbox count.

This is spaced repetition presented as territory that erodes. It is the highest-value mechanic in
the build.

## 9. Progression

**XP awards** — study 1/minute · capture `50 × newLevel` · rescue a fading node 75 · log a graded
assessment 100 · first note on a node 25 · quest completion as stated.

**Streak multiplier** — `1 + min(streak, 30) / 60`, capped at 1.5×.

**Level curve** — `xpToNext(n) = 500 + 250 × (n - 1)`. Two years of genuine use lands around
level 24. Subjects level independently from the account level.

**Quests** — three daily plus one weekly, generated at local midnight from a date-seeded PRNG so
they never reroll on refresh. Types are weighted by the recommender's output, so the game and the
grades pull in the same direction rather than competing. Mocks and school tests log as boss fights.

## 10. Recommendation engine

Every node scored:

```
score = 1.4 · decayUrgency
      + 1.2 · deadlineProximity
      + 1.0 · subjectWeakness
      + 0.8 · neglect
      + 0.6 · pacingDeficit
      − 0.5 · studiedInLast24h
```

Top three surfaced on the Command Center, each with its dominant term rendered as the reason
("fading fastest", "Paper 2 in 9 days", "weakest HL"). Weights live in one exported constant so
they can be tuned once real data exists.

## 11. Crew

Eight agents, one per subject plus TOK and EE. Each is a first-class object: callsign, expertise
list, subject color, and a Claude Project URL.

There is deliberately **no embedded chat**. A static site cannot hold an API key safely, and a
Claude Project beats an embedded chat regardless — larger context, uploaded past papers and
GoodNotes exports, memory across sessions.

Instead each agent exposes **Brief me**, which assembles:

- subject, topic path, and exact syllabus code
- current mastery level and freshness
- notes from the last three sessions on that node
- most recent grade and weakest paper in that subject
- the specific question or blockage

…into a markdown prompt, copies it to the clipboard, and opens that subject's Claude Project. If no
project URL is configured, the clipboard copy still works standalone.

Eight tailored system prompts are delivered as part of the build, each carrying that subject's real
syllabus structure, assessment format, command terms and common examiner traps.

## 12. Syllabus data

One JSON file per subject at topic → subtopic depth, each node tagged `DP1` or `DP2` (editable, as
teacher sequencing varies). Every tree is verified against the official IB guide for the **May 2028**
session before any UI consumes it:

| Subject | Guide edition | Structure |
|---|---|---|
| Physics HL | 2023 guide, first exams 2025 | Themes A–E + HL extensions |
| Chemistry SL | 2023 guide, first exams 2025 | Structure 1–3 · Reactivity 1–3 |
| Math AA HL | current guide | Topics 1–5 |
| Economics HL | **to verify** | 4 units + 9 key concepts |
| Português A L&L SL | 2019 guide | 3 areas of exploration + 7 concepts |
| English A L&L SL | 2019 guide | 3 areas of exploration + 7 concepts |
| TOK | 2020 guide | exhibition + essay |

A wrong syllabus makes the entire tracker worthless, so the trees are reviewed before the UI is
built on top of them.

## 13. Grades

Every test and mock logged with paper, raw, max. Predicted grade per subject from an exponentially
weighted moving average (α = 0.4) against configurable 1–7 boundaries. Total = six subject grades +
the TOK/EE bonus matrix (0–3) out of 45, tracked against a user-set target with an explicit
weakest-link callout.

## 14. Storage, safety, deployment

Corruption-guarded reads: any malformed value is dropped and replaced with a fallback rather than
throwing, so a bad entry can never white-screen the app. Schema version with forward migrations.
One-click JSON export/import, plus a banner when the last backup is over seven days old.

Deployed from a **standalone repo** at `/Users/eduardokato/IB Portfolio` to GitHub Pages. Note: the
home directory is itself a git repo with a GitHub remote — IB Cockpit deliberately does not live
inside it.

The passcode gate is client-side and therefore cosmetic. This is acceptable and stated plainly:
all study data lives in the browser, so a public repo exposes an empty shell.

## 15. Build phases

| Phase | Delivers |
|---|---|
| 0 | Repo, spec, verified syllabus JSON (review gate) |
| 1 | Shell, five themes, storage layer, router, passcode |
| 2 | Command Center + Primary Flight Display header |
| 3 | Subject view, syllabus tree, mastery + decay engine |
| 4 | Focus timer, manual logging, heatmap, streaks |
| 5 | XP, levels, quests |
| 6 | Territory map |
| 7 | Deadlines + TOK/EE/CAS core |
| 8 | Grades + 45-point projection |
| 9 | Recommender + coach voice |
| 10 | Crew, context briefs, resources hub, GoodNotes links |
| 11 | Settings, export/import, polish, deploy |

Usable from phase 4; every phase after that compounds.

## 16. Risks

- **Economics guide edition for May 2028 is unconfirmed.** Verify with the teacher in week one; the
  JSON is swappable without touching code.
- Decay half-lives are first estimates and will need tuning against real behaviour. They live in one
  constant.
- `localStorage` caps near 5MB. Text-only notes stay far below this; image attachments would require
  IndexedDB and are explicitly out of scope.
- DP1/DP2 tagging depends on the school's sequencing and is user-editable by design.
