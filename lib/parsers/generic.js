import { cleanText, resolveUrl } from '../util.js';
import { parseDate, parseTime, toLocalIso } from '../timeparse.js';
import { mergeByTitle } from './jsonld.js';

const TIME_SRC = String.raw`(?:\d{1,2}(?::\d{2})?\s*[ap]\.?\s*m\.?|(?:[01]?\d|2[0-3]):[0-5]\d)`;
const HAS_TIME = new RegExp(`\\b${TIME_SRC}\\b`, 'i');
const ALL_TIMES = new RegExp(`\\b${TIME_SRC}\\b`, 'gi');

const hasTime = (s) => HAS_TIME.test(String(s || ''));
const allTimes = (s) => [...String(s || '').matchAll(ALL_TIMES)].map((m) => m[0]);

function findDateNear($, $node) {
  const tryText = (t) => parseDate(cleanText(t));

  let d = tryText($node.text().slice(0, 400));
  if (d) return d;

  let cur = $node;
  for (let i = 0; i < 5 && cur.length; i++) {
    for (const p of cur.prevAll().slice(0, 3).toArray()) {
      const t = cleanText($(p).text());
      if (t.length <= 120) {
        const dd = tryText(t);
        if (dd) return dd;
      }
    }
    cur = cur.parent();
  }
  return null;
}

function extractShowings($, $container, baseUrl) {
  const out = [];

  const push = (raw, { date, href, screen } = {}) => {
    const time = parseTime(raw);
    if (!time) return;
    out.push({
      raw: cleanText(raw) || `${time.h}:${String(time.m).padStart(2, '0')}`,
      start: date ? toLocalIso(date, time) : null,
      ticketUrl: href || null,
      screen: screen || null,
    });
  };

  const candidates = $container
    .find('time, a, button, [class*="time"], [class*="Time"], [class*="session"], [class*="showtime"]')
    .toArray();

  for (const el of candidates) {
    const $el = $(el);
    const txt = cleanText($el.text());
    if (!txt || txt.length > 80 || !hasTime(txt)) continue;

    const dtAttr =
      $el.attr('datetime') ||
      $el.find('time').attr('datetime') ||
      $el.attr('data-time') ||
      $el.attr('data-start') ||
      $el.attr('data-showtime');

    const date = (dtAttr && parseDate(dtAttr)) || findDateNear($, $el);
    const href = resolveUrl($el.attr('href') || $el.find('a').attr('href'), baseUrl);

    push(txt, { date, href });
  }

  if (out.length) return dedupe(out);

  // Last resort: raw text scan of the container
  const date = findDateNear($, $container);
  for (const raw of allTimes($container.text())) push(raw, { date });
  return dedupe(out);
}

function dedupe(showings) {
  const seen = new Set();
  return showings.filter((s) => {
    const k = `${s.raw}|${s.start}|${s.ticketUrl}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function parseGeneric($, baseUrl) {
  const films = [];
  const claimed = new Set();

  const candidates = $('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="heading"]').toArray();

  for (const el of candidates) {
    const $el = $(el);
    const title = cleanText($el.text());

    if (!title || title.length < 2 || title.length > 120) continue;
    if (hasTime(title)) continue;                          // "Showings 7:30pm"
    if (!/\p{L}/u.test(title)) continue;
    if (claimed.has(title.toLowerCase())) continue;

    // Find the smallest ancestor that contains at least one showtime
    let $container = null;
    let cur = $el.parent();
    for (let depth = 0; depth < 6 && cur.length; depth++) {
      const text = cur.text();
      if (text.length > 5000) break;
      if (hasTime(text)) {
        const headingCount = cur.find('h1, h2, h3, h4, h5, h6').length;
        if (headingCount <= 1) { $container = cur; break; }
        if (!$container) $container = cur;                 // keep looking for something tighter
      }
      cur = cur.parent();
    }
    if (!$container) continue;

    const showings = extractShowings($, $container, baseUrl);
    if (!showings.length) continue;

    claimed.add(title.toLowerCase());
    films.push({
      title,
      url: resolveUrl($el.find('a').attr('href') || $el.attr('href'), baseUrl),
      poster: resolveUrl($container.find('img').attr('src'), baseUrl),
      showings,
    });
  }

  return mergeByTitle(films);
}