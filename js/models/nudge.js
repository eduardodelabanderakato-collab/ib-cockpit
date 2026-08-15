import { localDay } from './xp.js';

/**
 * Reaching out.
 *
 * The app is only useful if it gets opened. Two mechanisms, both quiet:
 * a backup offer that appears on a schedule rather than nagging every load,
 * and one daily reminder naming the single thing worth doing.
 */

const DAY = 86400000;

/** Offer a backup when it has been a week, or after a lot of unsaved work. */
export function backupDue({ backupLastAt, sessionCount = 0, now = Date.now() }) {
  if (!backupLastAt) return sessionCount >= 5;
  const days = (now - Date.parse(backupLastAt)) / DAY;
  return days >= 7 || sessionCount >= 40;
}

export function backupAge({ backupLastAt, now = Date.now() }) {
  if (!backupLastAt) return null;
  return Math.floor((now - Date.parse(backupLastAt)) / DAY);
}

/** At most one reminder a day, and never one you have already answered. */
export function shouldRemind({ lastRemindedDay, hour, remindAt = 18,
                               today = localDay(), enabled = true }) {
  if (!enabled) return false;
  if (lastRemindedDay === today) return false;
  return hour >= remindAt;
}

/**
 * The single most useful sentence right now, chosen by urgency rather than
 * listing everything. Returns null when there is genuinely nothing to say.
 */
export function message({ fading = 0, coldSubject = null, dueSoon = null,
                          openQuests = 0, streak = 0, loggedToday = false }) {
  if (dueSoon && dueSoon.days <= 2) {
    return { title: `${dueSoon.title} — ${dueSoon.days === 0 ? 'today' : `${dueSoon.days} days`}`,
             body: 'This is the closest thing on your flight plan.', tone: 'warning' };
  }
  if (fading >= 3) {
    return { title: `${fading} topics are fading`,
             body: 'A few minutes of recall checks now is worth an hour of rereading later.',
             tone: 'caution' };
  }
  if (coldSubject) {
    return { title: `${coldSubject.short} has gone cold`,
             body: `Untouched for ${Math.round(coldSubject.days)} days.`, tone: 'caution' };
  }
  if (!loggedToday && streak > 0) {
    return { title: `Keep the ${streak}-day streak`,
             body: 'Anything counts — even fifteen minutes.', tone: 'advisory' };
  }
  if (openQuests > 0 && !loggedToday) {
    return { title: `${openQuests} missions still open`,
             body: 'Today’s quests are worth XP until midnight.', tone: 'advisory' };
  }
  return null;
}
