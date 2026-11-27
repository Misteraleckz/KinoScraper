import * as cheerio from 'cheerio';
import { cleanText, resolveUrl } from '../util.js';

/**
 * kino achteinhalb (kinoachteinhalb.de) parser.
 *
 * Listing page has one <div class="gh-events-item"> per showing. Same film
 * can appear in multiple items (different dates / versions). We group by
 * detail URL to produce one film object with all its showings.
 *
 * Each showing carries format tags in a `.gh-events-item-tags` column:
 *   - OmU / OmeU / tlw. OmU → subtitle marker → omu: true
 *   - OV                    → original version → ov: true
 *   - dtF                   → deutsche Fassung → neither flag
 *   - (no tag)              → treat as neither (German-language film or unknown)
 *
 * Non-language tags (Vortrag, Filmgespräch, Filmtage / Festival, Stummfilm…)
 * are ignored for the contract.
 */
export function parseAchteinhalb(html, listingUrl) {
  const $ = cheerio.load(html);

  // filmKey → accumulating film object
  const byFilm = new Map();

  $('.gh-events-item').each((_, el) => {
    const $el = $(el);

    // ---- title + detail URL ----
    const $titleLink = $el.find('.gh-events-item-text h2[itemprop="name"] a').first();
    if (!$titleLink.length) return;

    const title = cleanText($titleLink.text());
    const detailHref = $titleLink.attr('href');
    const detailUrl = resolveUrl(detailHref, listingUrl);
    if (!title || !detailUrl) return;

    // ---- date/time ----
    // <time datetime="2026-11-05 20:00" itemprop="date">05</time>
    const datetimeAttr = $el.find('.gh-events-item-date time[itemprop="date"]').attr('datetime')
      || $el.find('time[itemprop="date"]').first().attr('datetime');
    const parsed = parseAchteinhalbDatetime(datetimeAttr);
    if (!parsed) return;
    const { date, time, start } = parsed;

    // ---- format flags ----
    const tags = $el.find('.gh-events-item-tags .gh-tag')
      .map((__, t) => cleanText($(t).text()))
      .get();

    const omu = tags.some((t) => /^(OmU|OmeU|OmfrU|tlw\.\s*OmU)$/i.test(t));
    const ov = !omu && tags.some((t) => /^OV$/i.test(t));

    // ---- poster ----
    const poster = resolveUrl(
      $el.find('.gh-events-item-image img[data-src]').first().attr('data-src'),
      listingUrl
    );

    // ---- ticket URL: this site has no booking link, tickets are at the door ----
    const ticketUrl = null;

    // ---- accumulate ----
    // The `<a>` in the img column also points to the same detail URL — use it
    // as our grouping key. It's the same as detailUrl in practice, but tie
    // the two together so a future change doesn't mis-group.
    const key = detailUrl;

    if (!byFilm.has(key)) {
      byFilm.set(key, { title, poster: poster || null, url: detailUrl, showings: [] });
    }
    const film = byFilm.get(key);
    film.poster ||= poster || null;

    // Guard against re-processing the same showing (a site quirk we've seen
    // at other cinemas but not here — belt and braces).
    const dup = film.showings.some((s) => s.start === start);
    if (dup) return;

    film.showings.push({
      start,
      date,
      time,
      ov,
      omu,
      threeD: false,          // no 3D at achteinhalb
      ticketUrl,
    });
  });

  // Sort showings within each film by start so the UI doesn't have to.
  for (const f of byFilm.values()) {
    f.showings.sort((a, b) => a.start.localeCompare(b.start));
  }

  return [...byFilm.values()];
}

/**
 * Parse "2026-11-05 20:00" → { date: "2026-11-05", time: "20:00",
 *                              start: "2026-11-05T20:00" }
 */
function parseAchteinhalbDatetime(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = `${y}-${mo}-${d}`;
  const time = `${String(h).padStart(2, '0')}:${mi}`;
  return { date, time, start: `${date}T${time}` };
}