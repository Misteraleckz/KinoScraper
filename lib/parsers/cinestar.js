import { fetchJson } from '../http.js';
import { mergeByTitle } from './jsonld.js';

const pad = (n) => String(n).padStart(2, '0');

export async function parseCinestar(html, listingUrl, cfg = {}, opts = {}) {
  const cinemaId = cfg.cinemaId;
  if (!cinemaId) throw new Error('parseCinestar: cfg.cinemaId is required');

  const base = cfg.baseUrl || 'https://www.cinestar.de';
  const apiUrl = `${base}/api/cinema/${cinemaId}/show/?appVersion=1.6.0`;

  const data = await fetchJson(apiUrl, { timeout: 30000 });
  if (!Array.isArray(data)) {
    throw new Error(`CineStar API returned ${typeof data}, expected an array`);
  }

  // Event handling:
  //   "includeEvents": true                 → include every event
  //   "includeEvents": false                → include no events
  //   "includeEvents": "sondervorstellung"  → include only events whose
  //                                           subtitle is "Sondervorstellung"
  const eventMode = cfg.includeEvents === 'sondervorstellung'
    ? 'sondervorstellung'
    : cfg.includeEvents
      ? 'all'
      : 'none';

  const films = [];

  for (const entry of data) {
    if (entry._type === 'event') {
      if (eventMode === 'none') continue;
      if (eventMode === 'sondervorstellung') {
        const sub = String(entry.subtitle || '').toLowerCase();
        if (sub !== 'sondervorstellung') continue;
      }
    }

    const showtimes = Array.isArray(entry.showtimes) ? entry.showtimes : [];
    if (!showtimes.length) continue;

    const showings = showtimes
      .map((s) => normalizeShowing(s, base, cinemaId))
      .filter(Boolean);
    if (!showings.length) continue;

    films.push({
      title: entry.title,
      poster: entry.poster || entry.poster_preload || null,
      url: entry.detailLink
        ? new URL(entry.detailLink, base).href
        : null,
      showings,
    });
  }

  return cfg.includeFormats ? films : mergeByTitle(films);
}

function normalizeShowing(s, base, cinemaId) {
  const parsed = parseCinestarDatetime(s.datetime);
  if (!parsed) return null;

  const { date, time, iso } = parsed;

  // `s.show` is the showtime-group id the overlay URL expects.
  const ticketUrl = s.show
    ? `${base}/overlay/ticket-buy/${cinemaId}?showIds=${s.show}`
    : null;

  const attrs = Array.isArray(s.attributes) ? s.attributes : [];

  const omu = attrs.includes('OmU') || attrs.includes('OmeU') || attrs.includes('OMU');
  const ov  = omu || attrs.includes('OV') || attrs.includes('AUDIO_OV');

  return {
    raw: time,
    start: iso,
    date,
    time,
    ticketUrl,
    screen: null,
    attributes: attrs,
    ov,
    omu,
    threeD: attrs.includes('3D'),
  };
}

function parseCinestarDatetime(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = `${y}-${mo}-${d}`;
  const time = `${pad(h)}:${mi}`;
  return { date, time, iso: `${date}T${time}` };
}