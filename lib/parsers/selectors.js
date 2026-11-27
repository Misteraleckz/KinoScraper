import { cleanText, resolveUrl } from '../util.js';
import { parseDate, parseTime, toLocalIso } from '../timeparse.js';
import { mergeByTitle } from './jsonld.js';

/**
 * cfg = {
 *   movie:  ".film-card",           // repeated block per film
 *   title:  "h2",                   // title inside the block
 *   times:  ".showtime",            // each showtime (a, span, time…)
 *   date:   ".show-date",           // optional: date inside the block
 *   screen: ".screen"               // optional
 * }
 */
export function parseWithSelectors($, cfg, baseUrl) {
  const films = [];
  const movieSel = cfg.movie || 'article, .film, .movie';

  $(movieSel).each((_, el) => {
    const $el = $(el);

    const title =
      cleanText($el.find(cfg.title || 'h1, h2, h3, h4').first().text()) ||
      cleanText($el.find('a').first().text());
    if (!title) return;

    const blockDate = cfg.date
      ? parseDate(cleanText($el.find(cfg.date).first().text()))
      : null;

    const showings = [];
    $el.find(cfg.times || 'time, .time, .showtime, .session').each((_, t) => {
      const $t = $(t);
      const dtAttr = $t.attr('datetime') || $t.find('time').attr('datetime');
      const raw = cleanText($t.text()) || dtAttr || '';
      const time = parseTime(raw) || parseTime(dtAttr || '');
      if (!time) return;

      const date = (dtAttr && parseDate(dtAttr)) || blockDate || null;

      showings.push({
        raw: cleanText(raw) || `${time.h}:${String(time.m).padStart(2, '0')}`,
        start: date ? toLocalIso(date, time) : null,
        ticketUrl: resolveUrl($t.attr('href') || $t.find('a').attr('href'), baseUrl),
        screen: cfg.screen ? cleanText($el.find(cfg.screen).first().text()) || null : null,
      });
    });

    if (!showings.length) return;

    films.push({
      title,
      url: resolveUrl($el.find('a').first().attr('href'), baseUrl),
      poster: resolveUrl($el.find('img').attr('src'), baseUrl),
      showings,
    });
  });

  return mergeByTitle(films);
}