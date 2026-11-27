import { normalizeTitle } from './util.js';

function sortShowings(a, b) {
  if (a.start && b.start) return a.start.localeCompare(b.start);
  if (a.start) return -1;
  if (b.start) return 1;
  return (a.raw || '').localeCompare(b.raw || '');
}

/**
 * Two showings are the same if they're on the same date at the same time.
 * Raw text ("20:00" vs "Samstag 20:00 Uhr") doesn't matter — start does.
 */
function sameShowing(a, b) {
  if (a.start && b.start) {
    if (a.start !== b.start) return false;
    // Same time: only the same if their language class matches.
    const aLang = a.omu ? 'omu' : a.ov ? 'ov' : 'df';
    const bLang = b.omu ? 'omu' : b.ov ? 'ov' : 'df';
    return aLang === bLang;
  }

  // One has a start, the other doesn't — fall back to time-only comparison.
  const aTime = a.time || extractTime(a.raw);
  const bTime = b.time || extractTime(b.raw);
  return !!aTime && aTime === bTime;
}

/**
 * Choose which of two duplicate showings to keep.
 * Prefers the one with the shorter, cleaner raw label ("20:00" beats
 * "Samstag 20:00 Uhr"), then prefers the one with a start, then with a
 * ticket URL, then with a screen.
 */
function prefer(a, b) {
  // Shorter raw string usually means "cleaner".
  const aLen = String(a.raw || '').length;
  const bLen = String(b.raw || '').length;
  if (aLen !== bLen) return aLen < bLen;

  // Has a start?
  if (!!a.start !== !!b.start) return !!a.start;

  // Has a ticket URL?
  if (!!a.ticketUrl !== !!b.ticketUrl) return !!a.ticketUrl;

  // Has a screen?
  if (!!a.screen !== !!b.screen) return !!a.screen;

  return false; // equivalent — keep existing
}

function normalizeRaw(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/\b(mo|di|mi|do|fr|sa|so|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b\.?/g, '')
    .replace(/\buhr\b/g, '')
    .replace(/[^\d:]/g, '')
    .trim();
}

function extractTime(raw) {
  const m = /(\d{1,2})[:.](\d{2})/.exec(String(raw || ''));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

export function aggregate(results) {
  const byKey = new Map();

  for (const cinema of results) {
    for (const film of cinema.films) {
      const key = normalizeTitle(film.title);
      if (!key) continue;

      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          key,
          title: film.title,
          poster: film.poster || null,
          url: film.url || null,
          cinemas: new Map(),
        };
        byKey.set(key, entry);
      }

      entry.poster ||= film.poster || null;
      entry.url ||= film.url || null;

      let c = entry.cinemas.get(cinema.id);
      if (!c) {
        c = { id: cinema.id, name: cinema.name, url: cinema.url, showings: [] };
        entry.cinemas.set(cinema.id, c);
      }

      for (const s of film.showings) {
        const idx = c.showings.findIndex((x) => sameShowing(x, s));
        if (idx === -1) {
            c.showings.push(s);
        } else if (prefer(s, c.showings[idx])) {
            c.showings[idx] = s;   // replace the verbose one with the cleaner one
        }
      }
    }
  }

  return [...byKey.values()]
    .map((f) => ({
      key: f.key,
      title: f.title,
      poster: f.poster,
      url: f.url,
      cinemas: [...f.cinemas.values()]
        .map((c) => ({ ...c, showings: c.showings.slice().sort(sortShowings) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((f) => f.cinemas.some((c) => c.showings.length))
    .sort((a, b) => a.title.localeCompare(b.title));
}