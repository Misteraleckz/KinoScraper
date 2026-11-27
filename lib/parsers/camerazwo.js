import { cleanText } from '../util.js';
import { mergeByTitle } from './jsonld.js';

/**
 * Camera Zwo (camerazwo.de) parser.
 *
 * The listing page inlines a `var programm = { filme: {...} }` object with
 * every film and every showing for the whole week — more reliable than the
 * partial ld+json block, which only lists films in the current view.
 *
 * cfg = {
 *   baseUrl: "https://www.camerazwo.de"  // optional
 * }
 */
export function parseCamerazwo(html, listingUrl, cfg = {}) {
  const base = cfg.baseUrl || new URL(listingUrl).origin;

  const data = extractProgrammObject(html);
  if (!data || !data.filme) return [];

  const films = [];

  for (const key of Object.keys(data.filme)) {
    const entry = data.filme[key];
    const fakten = entry.filmfakten || {};
    const title = cleanText(fakten.titel);
    if (!title) continue;

    const idf = fakten.idf || key.replace(/^film_/, '');
    const marker = String(fakten.Versionsmarker || '');
    const isOmU = marker.includes('OmU') || marker.includes('OmeU') || fakten.OmitU === '1';
    const isOV = marker.includes('OV') || fakten.OrigVersion === '1';
    const isThreeD = marker.includes('3D');

    const termine = entry.vorstellungen?.termine || {};
    const showings = [];

    for (const dateKey of Object.keys(termine)) {
      const list = termine[dateKey];
      const arr = Array.isArray(list) ? list : [list];
      for (const v of arr) {
        if (!v.datum || !v.zeit) continue;
        const date = v.datum;
        const time = String(v.zeit).padStart(5, '0'); // "18:00" stays, "9:15" becomes "09:15"
        const start = `${date}T${time}`;
        const href = v.link_desktop || v.link_mobile || v.link_fixticket || null;
        const screen = null;   // camera zwo's room names aren't useful in the UI

        showings.push({
          raw: time,
          start,
          date,
          time,
          ticketUrl: href || null,
          screen: screen || null,
          ov: isOV,
          omu: isOmU,
          threeD: isThreeD,
        });
      }
    }

    if (!showings.length) continue;

    films.push({
      title,
      poster: fakten.plakat_ids?.id
        ? `${base}/images/Breite_400px_RGB/${fakten.plakat_ids.id}`
        : null,
      url: `${base}/detail/${idf}`,
      showings,
    });
  }

  // Do NOT merge by title — same title can legitimately be two films (DF vs OV).
  return films;
}

/**
 * Pull the `var programm = {...};` literal out of the page HTML and eval it.
 * It's a plain JS object literal — no functions, no comments — so JSON.parse
 * on the extracted body is safe once we strip the JS-specific syntax.
 */
function extractProgrammObject(html) {
  // Match `var programm = { ... };` non-greedily up to `; var` (the next
  // statement on the page) or end-of-script. The object is huge — one line.
  const m = html.match(/var\s+programm\s*=\s*(\{[\s\S]*?\});\s*(?:var\s+|<\/script>)/);
  if (!m) return null;

  let body = m[1].trim();
  if (!body.startsWith('{')) return null;

  // The source escapes nothing problematic for JSON — no unquoted keys, no
  // single quotes, no trailing commas. It's a plain literal.
  try {
    return JSON.parse(body);
  } catch (e) {
    return null;
  }
}