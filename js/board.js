import * as R45 from './models/road.js';
import * as B from './models/boundaries.js';
import * as mastery from './models/mastery.js';
import { nodesFor } from './syllabus.js';
import { halfLivesFor } from './models/curve.js';

/**
 * The board, assembled from live state.
 *
 * Four screens need the same numbers — the cockpit's right MFD, the road view,
 * the map, and the capture itself, which has to know whether it moved anything.
 * Building it in four places meant four chances for them to disagree about your
 * own diploma score, so it is built here once.
 */
export function boardFor(ctx) {
  const { index, state } = ctx;
  const settings = state.get('settings');
  const records = state.get('mastery');
  const hl = halfLivesFor(state.get('checks'));

  const board = R45.road({
    subjects: index.examined,
    grades: state.get('grades'),
    tok: settings.tokGrade ?? null,
    ee: settings.eeGrade ?? null,
    boundaries: B.table(settings, index.examined),
    target: state.get('meta').targetPoints ?? 45,
  });

  return R45.ground(board, id => {
    const ids = nodesFor(index, id).map(n => n.id);
    return {
      coverage: mastery.subjectProgress(ids, records, Date.now(), hl),
      nodes: ids.length,
    };
  });
}
