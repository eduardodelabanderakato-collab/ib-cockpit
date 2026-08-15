import { localDay } from './xp.js';

/**
 * The backup offer.
 *
 * Appears on a schedule rather than nagging every load. Browser reminders were
 * built here too and removed — they were not wanted, and unused code is a cost.
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
