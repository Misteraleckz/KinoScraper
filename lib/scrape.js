import * as cheerio from 'cheerio';
import { fetchHtml } from './http.js';

// Fallback parsers — only used by cinemas that don't have a dedicated parser yet.
import { parseJsonLd, mergeByTitle } from './parsers/jsonld.js';
import { parseGeneric } from './parsers/generic.js';
import { parseWithSelectors } from './parsers/selectors.js';

// Site-specific parsers, one per cinema.
import { parseCinestar }   from './parsers/cinestar.js';
import { parseCamerazwo }  from './parsers/camerazwo.js';
import { parseAchteinhalb } from './parsers/achteinhalb.js';
import { parseFilmhaus }   from './parsers/filmhaus.js';

import { cleanTitle } from './titleclean.js';

/**
 * Registry of site-specific parsers.
 *
 *   needsHtml    – parser reads the listing page's HTML (true)
 *                  or fetches its own data (false)
 *   suppresses   – parser output is authoritative; skip the generic chain
 *                  (jsonld / generic / selectors). Always true for a
 *                  dedicated parser — this is what prevents duplicates.
 *
 * Every parser receives (html, listingUrl, cinema) and returns an array of
 * films already in the standard contract:
 *
 *   { title, poster, url, showings: [{ start, date, time, ov, omu, threeD, ticketUrl }] }
 */
const PARSERS = {
  cinestar: {
    needsHtml: false,
    suppresses: true,
    run: (_, __, cinema) => parseCinestar(null, cinema.url, cinema.parserConfig || {}),
  },
  camerazwo: {
    needsHtml: true,
    suppresses: true,
    run: (html, url, cinema) => parseCamerazwo(html, url, cinema.parserConfig || {}),
  },
  achteinhalb: {
    needsHtml: true,
    suppresses: true,
    run: (html, url) => parseAchteinhalb(html, url),
  },
  filmhaus: {
    needsHtml: true,
    suppresses: true,
    run: (html, url) => parseFilmhaus(html, url),
  },
};

export async function scrapeCinema(cinema) {
  const started = Date.now();
  try {
    const films = await scrapeWithParser(cinema);
    const cleaned = applyTitleCleaner(films, cinema);
    return {
      id: cinema.id,
      name: cinema.name,
      url: cinema.url,
      films: cleaned,
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      id: cinema.id,
      name: cinema.name,
      url: cinema.url,
      films: [],
      error: err?.message || String(err),
      ms: Date.now() - started,
    };
  }
}

async function scrapeWithParser(cinema) {
  const spec = cinema.parser ? PARSERS[cinema.parser] : null;

  // Dedicated parser — dispatch and return. No chaining.
  if (spec) {
    if (!spec.needsHtml) {
      return await spec.run(null, cinema.url, cinema);
    }
    const html = await fetchHtml(cinema.url, { useBrowser: !!cinema.useBrowser });
    return await spec.run(html, cinema.url, cinema);
  }

  // Generic path: HTML-based chain with fallbacks. Only used for cinemas
  // without a dedicated parser. Produces duplicates on most real sites —
  // give every cinema a dedicated parser to get rid of them.
  const html = await fetchHtml(cinema.url, { useBrowser: !!cinema.useBrowser });
  const $ = cheerio.load(html);
  const parts = [];

  if (cinema.selectors) {
    parts.push(...parseWithSelectors($, cinema.selectors, cinema.url));
  }
  if (cinema.jsonld !== false) {
    parts.push(...parseJsonLd($, cinema.url));
  }
  if (!cinema.selectors && cinema.generic !== false) {
    parts.push(...parseGeneric($, cinema.url));
  }

  return mergeByTitle(parts);
}

/* ---------------- title cleaning ---------------- */

function applyTitleCleaner(films, cinema) {
  const suffixes = buildSuffixes(cinema);
  if (!suffixes.length) return films;

  return films.map((f) => {
    const cleaned = cleanTitle(f.title, suffixes);
    return cleaned && cleaned !== f.title ? { ...f, title: cleaned } : f;
  });
}

function buildSuffixes(cinema) {
  const out = new Set();
  const add = (s) => {
    const t = String(s || '').replace(/\u00A0/g, ' ').trim();
    if (t) out.add(t);
  };

  add(cinema.name);

  if (cinema.name) {
    const words = String(cinema.name).split(/\s+/);
    if (words.length >= 2) {
      add(words[0]);
      add(words[words.length - 1]);
    }
  }

  if (Array.isArray(cinema.stripTitleSuffixes)) {
    cinema.stripTitleSuffixes.forEach(add);
  } else if (typeof cinema.stripTitleSuffixes === 'string') {
    add(cinema.stripTitleSuffixes);
  }

  return [...out];
}