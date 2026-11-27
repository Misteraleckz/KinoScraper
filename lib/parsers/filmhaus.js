import * as cheerio from 'cheerio';

/**
 * Filmhaus Saarbrücken (filmhaus-sb.de) parser.
 *
 * The listing page embeds one big <script type="application/ld+json"> array
 * of ScreeningEvent objects. Each event carries everything we need:
 *
 *   {
 *     "@type": "ScreeningEvent",
 *     "name": "Vainilla",
 *     "startDate": "2026-11-05T19:00:00+01:00",
 *     "workPresented": { "@type": "Movie", "name": "Vainilla" },
 *     "offers": { "url": "https://filmhaus-sb.de/programm/film/vainilla" },
 *     "videoFormat": "OmU"    // or "2D"
 *   }
 *
 * Group events by workPresented.name to produce one film object per title.
 */
export function parseFilmhaus(html, listingUrl) {
  const $ = cheerio.load(html);

  const events = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text().trim();
    if (!txt) return;
    try {
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) events.push(...parsed);
      else if (parsed && typeof parsed === 'object') events.push(parsed);
    } catch {
      // ignore malformed blocks
    }
  });

  const byTitle = new Map();

  for (const ev of events) {
    if (!ev || ev['@type'] !== 'ScreeningEvent') continue;

    const title = String(ev.workPresented?.name || ev.name || '').trim();
    const start = normalizeStart(ev.startDate);
    if (!title || !start) continue;

    const format = String(ev.videoFormat || '').toUpperCase();
    const omu = format.includes('OMU') || format.includes('OMEU');
    const ov = omu || format === 'OV';

    const url = ev.offers?.url || null;
    const poster = typeof ev.workPresented?.image === 'string'
      ? ev.workPresented.image
      : null;

    const key = title;
    if (!byTitle.has(key)) {
      byTitle.set(key, { title, poster, url, showings: [] });
    }
    const film = byTitle.get(key);
    film.poster ||= poster || null;
    film.url ||= url || null;

    // De-dup same (title, start) — the block occasionally has duplicates for
    // the same date when a film has multiple sections.
    if (film.showings.some((s) => s.start === start)) continue;

    film.showings.push({
      start,
      date: start.slice(0, 10),
      time: start.slice(11, 16),
      ov,
      omu,
      threeD: false,
      ticketUrl: null,
    });
  }

  // Sort showings within each film.
  for (const f of byTitle.values()) {
    f.showings.sort((a, b) => a.start.localeCompare(b.start));
  }

  return [...byTitle.values()];
}

/**
 * Convert "2026-11-05T19:00:00+01:00" → "2026-11-05T19:00".
 * Naive local time — drop the offset deliberately (the cinema is in that zone
 * and the user wants to see the wall-clock time).
 */
function normalizeStart(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
}