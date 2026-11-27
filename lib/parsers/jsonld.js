import { cleanText, resolveUrl } from '../util.js';

function walk(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
    return;
  }
  if (node['@graph']) walk(node['@graph'], out);
  if (node['@type']) out.push(node);
  for (const [k, v] of Object.entries(node)) {
    if (k === '@graph') continue;
    if (v && typeof v === 'object') walk(v, out);
  }
}

const typesOf = (n) => []
  .concat(n['@type'] || [])
  .map((t) => String(t).toLowerCase());

/** Convert a full ISO datetime (with offset) to a naive local "YYYY-MM-DDTHH:MM" */
function isoToLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function parseJsonLd($, baseUrl) {
  const nodes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text().trim();
    if (!txt) return;
    try {
      walk(JSON.parse(txt), nodes);
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  });

  const films = [];
  const seen = new Set();

  for (const node of nodes) {
    const types = typesOf(node);
    const isScreening =
      types.some((t) => t.includes('screeningevent')) ||
      (types.some((t) => t === 'event' || t.endsWith('/event')) &&
        node.startDate &&
        (node.workPresented || node.about));

    if (!isScreening || !node.startDate) continue;

    const work = node.workPresented || node.about || {};
    const title = cleanText(work.name || node.name);
    const start = isoToLocal(node.startDate);
    if (!title || !start) continue;

    const key = `${title.toLowerCase()}|${start}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;

    films.push({
      title,
      poster: typeof work.image === 'string' ? work.image : work.image?.url || null,
      url: resolveUrl(work.url || node.url, baseUrl),
      showings: [
        {
          raw: start.slice(11),
          start,
          ticketUrl: resolveUrl(offers?.url || node.url, baseUrl),
          screen: node.location?.name && node.location.name !== node.superEvent?.name
            ? cleanText(node.location.name)
            : null,
        },
      ],
    });
  }

  return mergeByTitle(films);
}

export function mergeByTitle(films) {
  const map = new Map();
  for (const f of films) {
    // Determine this film's language class from its showings.
    const isAllOV = f.showings.length > 0 && f.showings.every((s) => s.ov);
    const isAllOmU = f.showings.length > 0 && f.showings.every((s) => s.omu);

    // Include a language discriminator in the key so OV and DF variants
    // stay separate, but films with mixed-language showings merge normally.
    const langSuffix = (isAllOV && !isAllOmU) ? '|ov' :
                       (isAllOmU) ? '|omu' : '';

    const k = normalizeFilmKey(f.title) + langSuffix;
    if (!k) continue;

    if (!map.has(k)) {
      const displayTitle = isAllOmU ? `${pickDisplayTitle(f.title)} · OmU` :
                          isAllOV ? `${pickDisplayTitle(f.title)} · OV` :
                          pickDisplayTitle(f.title);
      map.set(k, { title: displayTitle, poster: null, url: null, showings: [] });
    }
    const e = map.get(k);
    e.poster ||= f.poster || null;
    e.url ||= f.url || null;
    for (const s of f.showings) {
      const dup = e.showings.some((x) =>
        x.raw === s.raw && x.start === s.start && x.format === s.format && x.ov === s.ov
      );
      if (!dup) e.showings.push(s);
    }
  }
  return [...map.values()].filter((f) => f.showings.length);
}

/**
 * Strip format tags and other trailing noise so "Alte Liebe 2D" and
 * "Alte Liebe" collapse into the same key. Also normalise whitespace and case.
 */
function normalizeFilmKey(title) {
  return stripFormatTags(String(title || ''))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove the format/version tags that cinemas append to titles.
 * Leaves the title otherwise untouched.
 */
function stripFormatTags(title) {
  const TAGS = String.raw`2D|3D|4DX|IMAX|OV|OmU|OmeU|DF|Original(?:fassung|version)?|Deutsche?\s+Fassung|Dubbed|Subtitled`;

  return String(title || '')
    // Parenthesised or bracketed tags: "(2D)", "[3D]", "(OV)"
    .replace(new RegExp(`\\s*[\\(\\[]\\s*(?:${TAGS})\\s*[\\)\\]]`, 'gi'), '')

    // A run of one-or-more tags at the end, possibly joined by | , / or spaces.
    // Handles "2D|OmU", "2D, OV", "2D / OV", "2D 3D", "2D|OV|IMAX".
    .replace(new RegExp(`(?:\\s*[|,/]?\\s*(?:${TAGS}))+\\s*$`, 'i'), '')

    // Leading tags before a separator: "3D: Alte Liebe", "IMAX - Alte Liebe"
    .replace(new RegExp(`^\\s*(?:${TAGS})(?:\\s*[|,/]\\s*(?:${TAGS}))*\\s*[:\\-–]\\s*`, 'i'), '')

    // Dashed suffix: "Alte Liebe - OV", "Alte Liebe – OmU"
    .replace(new RegExp(`\\s*[-–]\\s*(?:${TAGS})\\s*$`, 'i'), '')

    .replace(/\s+/g, ' ')
    .trim();
}

/** Length used for the "prefer shortest title" tiebreak. */
function titleLength(t) {
  return String(t || '').length;
}

/**
 * Pick the title we show in the UI. Since we're merging variants, prefer
 * whichever is cleanest — the one with no format tags, or the shortest if
 * they all have tags.
 */
function pickDisplayTitle(raw) {
  const stripped = stripFormatTags(String(raw || ''));
  return stripped || String(raw || '');
}

function extractFormatTag(title) {
  const t = String(title || '');
  if (/\b(OmeU|OmU)\b/i.test(t)) return 'OmU';
  if (/\bOV\b|Original(?:fassung|version)/i.test(t)) return 'OV';
  if (/\b4DX\b/i.test(t)) return '4DX';
  if (/\bIMAX\b/i.test(t)) return 'IMAX';
  if (/\b3D\b/i.test(t)) return '3D';
  if (/\b2D\b/i.test(t)) return '2D';
  return null;
}