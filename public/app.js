const $ = (sel) => document.querySelector(sel);

const state = {
  data: null,
  search: '',
  cinemas: new Set(),
  range: 'all',
  language: 'all', 
  loading: false,
};

// Active date per (film key + cinema id). Cleared when the film disappears
// from a render — no point remembering what isn't shown.
const activeDateByFilm = new Map();

const currentFilmsByKey = new Map();

const datePageByFilm = new Map();   // key → number (0, 1, 2, …)
const PAGE_SIZE = 4;

function dateKey(filmKey, cinemaId) {
  return `${filmKey}|${cinemaId}`;
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- data ---------------- */

async function load(refresh = false) {
  if (state.loading) return;
  state.loading = true;
  setStatus(refresh ? 'Re-fetching all sites…' : 'Loading…');
  $('#refresh').disabled = true;

  try {
    const res = await fetch('/api/showtimes' + (refresh ? '?refresh=1' : ''));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.data = data;

    const known = new Set(data.cinemas.map((c) => c.id));
    if (state.cinemas.size === 0) {
      data.cinemas.forEach((c) => state.cinemas.add(c.id));
    } else {
      for (const id of [...state.cinemas]) if (!known.has(id)) state.cinemas.delete(id);
      data.cinemas.forEach((c) => { if (!state.cinemas.has(c.id)) state.cinemas.add(c.id); });
    }

    render();
  } catch (err) {
    setStatus('Failed: ' + err.message);
  } finally {
    state.loading = false;
    $('#refresh').disabled = false;
  }
}

/* ---------------- helpers ---------------- */

function parseLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '');
  if (!m) return null;
  return {
    date: `${m[1]}-${m[2]}-${m[3]}`,
    time: `${m[4]}:${m[5]}`,
    dt: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]),
  };
}

function formatDateLabel(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((dt - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDateTime(startStr) {
  const p = parseLocal(startStr);
  if (!p) return '';
  return `${formatDateLabel(p.date)} · ${p.dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function setStatus(text) { $('#status').textContent = text; }

/* ---------------- date range helper ---------------- */

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * Returns true if a showing with the given start (YYYY-MM-DDTHH:MM or null)
 * falls within the current range.
 */
function inRange(start, range) {
  if (range === 'all') return true;
  if (!start) return false; // undated showings only show under "All"

  const dateStr = start.slice(0, 10); // YYYY-MM-DD
  const today = todayIso();

  if (range === 'today') return dateStr === today;
  if (range === 'tomorrow') return dateStr === addDaysIso(today, 1);

  if (range === 'week') {
    // Inclusive 7-day window: today through today+6.
    const end = addDaysIso(today, 6);
    return dateStr >= today && dateStr <= end;
  }

  return true;
}

/**
 * Returns 'omu' | 'ov' | 'dub' for a showing.
 *   'omu' — original language with subtitles
 *   'ov'  — original language (no subtitles, or subtitles unknown)
 *   'dub' — dubbed / language-unknown
 */
function showingLanguage(s) {
  // Authoritative: the parser's own booleans.
  if (s.omu === true) return 'omu';
  if (s.ov === true) return 'ov';

  // Fall back to string signals for parsers that don't set the booleans.
  const attrs = Array.isArray(s.attributes) ? s.attributes : [];
  const rawText = String(s.raw || '');
  const fmtText = String(s.format || '');

  if (
    attrs.includes('OmU') ||
    attrs.includes('OmeU') ||
    /\b(Ome?U)\b/.test(rawText) ||
    /\b(Ome?U)\b/i.test(fmtText)
  ) return 'omu';

  if (
    attrs.includes('OV') ||
    attrs.includes('AUDIO_OV') ||
    attrs.includes('LANG_EN') ||
    attrs.includes('LANG_KO') ||
    attrs.includes('LANG_JA') ||
    attrs.includes('LANG_IT') ||
    attrs.includes('LANG_FR') ||
    /\bOV\b/.test(rawText) ||
    /\bOV\b/i.test(fmtText)
  ) return 'ov';

  return 'dub';
}

function matchesLanguage(s, filter) {
  if (filter === 'all') return true;
  const lang = showingLanguage(s);
  if (filter === 'ov') return lang === 'ov' || lang === 'omu';   // OV pill includes OmU
  if (filter === 'omu') return lang === 'omu';
  return true;
}

/* ---------------- rendering ---------------- */

function render() {
  renderFilters();
  renderFilms();

  if (state.data) {
    const t = new Date(state.data.fetchedAt);
    const n = state.data.films.length;
    setStatus(`${n} film${n === 1 ? '' : 's'} · updated ${t.toLocaleTimeString()}` +
      (state.data.cached ? ' (cached)' : ''));
  }
}

function renderFilters() {
  const el = $('#filters');
  const cinemas = state.data?.cinemas || [];
  const broken = cinemas.filter((c) => c.error);

  el.innerHTML = `
    <section>
      <h2>Cinemas</h2>
      ${cinemas.map((c) => `
        <label class="check ${c.error ? 'errored' : ''}">
          <input type="checkbox" data-cinema="${esc(c.id)}" ${state.cinemas.has(c.id) ? 'checked' : ''}>
          <span>${esc(c.name)}</span>
          <small>${c.error ? '⚠ failed' : `${c.filmCount} film${c.filmCount === 1 ? '' : 's'}`}</small>
        </label>`).join('')}
    </section>

    <section>
      <h2>Dates</h2>
      <div class="pills">
        ${[
          ['all', 'All'],
          ['today', 'Today'],
          ['tomorrow', 'Tomorrow'],
          ['week', 'This week'],
        ].map(([key, label]) => `
          <button class="pill ${state.range === key ? 'on' : ''}" data-range="${key}">${label}</button>
        `).join('')}
      </div>
    </section>

    <section>
      <h2>Language</h2>
      <div class="pills">
        ${[
          ['all', 'All'],
          ['ov', 'OV'],
          ['omu', 'OmU'],
        ].map(([key, label]) => `
          <button class="pill ${state.language === key ? 'on' : ''}" data-language="${key}" title="${
            key === 'ov' ? 'Original version (includes OmU)' :
            key === 'omu' ? 'Original with subtitles' :
            'All showings'
          }">${label}</button>
        `).join('')}
      </div>
    </section>

    ${broken.length ? `
      <section class="errors">
        <h2>Problems</h2>
        ${broken.map((c) => `<p><strong>${esc(c.name)}</strong><code>${esc(c.error)}</code></p>`).join('')}
      </section>` : ''}
  `;
}

function timeRow(s) {
  const label = s.raw || parseLocal(s.start)?.time || '?';
  const title = s.start ? formatDateTime(s.start) : '';

  const extras = [];
  if (s.threeD) extras.push('3D');
  if (s.ov) extras.push('OV');
  if (s.format && !['2D'].includes(s.format) && !extras.includes(s.format)) {
    extras.push(s.format);
  }
  const badges = extras.map((b) => `<span class="badge-inline">${esc(b)}</span>`).join('');
  const screen = s.screen ? `<span class="row-screen">${esc(s.screen)}</span>` : '';

  const inner = `
    <span class="row-time">${esc(label)}</span>
    <span class="row-extras">${badges}${screen}</span>
  `;

  if (s.ticketUrl) {
    return `<a class="time-row" href="${esc(s.ticketUrl)}" target="_blank" rel="noopener" title="${esc(title)}">${inner}</a>`;
  }
  return `<span class="time-row" title="${esc(title)}">${inner}</span>`;
}

function timeChip(s) {
  const label = s.raw || parseLocal(s.start)?.time || '?';
  const title = s.start ? formatDateTime(s.start) : '';

  const extras = [];
  if (s.format && !['2D'].includes(s.format)) extras.push(s.format);  // skip 2D, it's the default
  if (s.threeD && !extras.includes('3D')) extras.push('3D');
  if (s.ov && !extras.includes('OV') && !extras.includes('OmU')) extras.push('OV');
  const badges = extras.map((b) => `<small class="badge-inline">${esc(b)}</small>`).join('');

  const inner = `<span>${esc(label)}</span>${badges}` +
    (s.screen ? `<small>${esc(s.screen)}</small>` : '');

  if (s.ticketUrl) {
    return `<a class="chip" href="${esc(s.ticketUrl)}" target="_blank" rel="noopener" title="${esc(title)}">${inner}</a>`;
  }
  return `<span class="chip" title="${esc(title)}">${inner}</span>`;
}

function timesHtml(filmKey, cinemaId, showings) {
  // Group showings by date.
  const groups = new Map();
  for (const s of showings) {
    const key = s.start ? s.start.slice(0, 10) : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  const dates = [...groups.keys()];
  if (!dates.length) return '';

  const stateKey = dateKey(filmKey, cinemaId);

  // Page offset: which date is currently at the left edge.
  const maxStart = Math.max(0, dates.length - PAGE_SIZE);
  let page = datePageByFilm.get(stateKey) ?? 0;
  if (page > maxStart) page = maxStart;
  if (page < 0) page = 0;
  datePageByFilm.set(stateKey, page);

  const visibleDates = dates.slice(page, page + PAGE_SIZE);
  const canPrev = page > 0;
  const canNext = page < maxStart;
  const cols = Math.min(PAGE_SIZE, dates.length); 
  const hasOverflow = dates.length > PAGE_SIZE;
  
  const prevArrow = !hasOverflow
    ? ''
    : `
      <button type="button" class="date-col-arrow date-col-arrow-prev ${canPrev ? '' : 'is-disabled'}"
        data-film="${esc(filmKey)}" data-cinema="${esc(cinemaId)}" data-dir="-1"
        ${canPrev ? '' : 'disabled'} aria-label="Earlier dates">‹</button>
    `;
  
  const nextArrow = !hasOverflow
    ? ''
    : `
      <button type="button" class="date-col-arrow date-col-arrow-next ${canNext ? '' : 'is-disabled'}"
        data-film="${esc(filmKey)}" data-cinema="${esc(cinemaId)}" data-dir="1"
        ${canNext ? '' : 'disabled'} aria-label="Later dates">›</button>
    `;

  const columns = visibleDates.map((d) => {
    const label = d ? esc(formatDateLabel(d)) : 'Date unknown';
    const chips = groups.get(d).map(compactChip).join('');
    return `
      <div class="date-col">
        <div class="date-col-header">${label}</div>
        <div class="date-col-times">${chips}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="date-columns" style="--cols: ${cols}">
      ${prevArrow}
      <div class="date-columns-grid">${columns}</div>
      ${nextArrow}
    </div>
  `;
}

/**
 * A single compact showing pill — time on one line, badges beneath if any.
 * The pill itself is a column item, not a full-width row.
 */
function compactChip(s) {
  const label = s.raw || parseLocal(s.start)?.time || '?';
  const title = s.start ? formatDateTime(s.start) : '';

  const extras = [];

  // Three-dimensional — boolean only.
  if (s.threeD) extras.push('3D');

  // Language — one badge maximum, in this priority order:
  //   1. explicit booleans on the showing
  //   2. string signals (`format`, `attributes`) for parsers that only have those
  // `OmU` is a stronger signal than `OV` (subtitled > unsubtitled original),
  // so we prefer it when both apply.
  const hasOmU =
    s.omu === true ||
    s.format === 'OmU' ||
    (Array.isArray(s.attributes) && (s.attributes.includes('OmU') || s.attributes.includes('OmeU')));

  const hasOV =
    s.ov === true ||
    s.format === 'OV' ||
    (Array.isArray(s.attributes) && s.attributes.includes('OV'));

  if (hasOmU) extras.push('OmU');
  else if (hasOV) extras.push('OV');

  // Format tags (2D skipped as noise; OV/OmU already handled above).
  // Split compound strings like "2D|OV" defensively.
  if (s.format) {
    const tokens = String(s.format).split(/[|,/\s]+/).map((t) => t.trim()).filter(Boolean);
    for (const t of tokens) {
      if (/^(2D)$/i.test(t)) continue;
      if (/^(OV|OmU|OmeU)$/i.test(t)) continue;
      if (extras.includes(t)) continue;
      extras.push(t);
    }
  }

  // Screen (room) — only if the parser supplied one.
  if (s.screen) extras.push(s.screen);

  const badges = extras.length
    ? `<span class="chip-extras">${extras.map((x) => `<span class="badge-inline">${esc(x)}</span>`).join('')}</span>`
    : '';

  const inner = `<span class="chip-time">${esc(label)}</span>${badges}`;

  if (s.ticketUrl) {
    return `<a class="compact-chip" href="${esc(s.ticketUrl)}" target="_blank" rel="noopener" title="${esc(title)}">${inner}</a>`;
  }
  return `<span class="compact-chip" title="${esc(title)}">${inner}</span>`;
}

function filmCard(f) {
  const n = f.cinemas.length;
  return `
    <article class="film" data-film-key="${esc(f.key)}">
      <div class="film-head">
        <h2>${esc(f.title)}</h2>
        <span class="badge">${n} cinema${n === 1 ? '' : 's'}</span>
      </div>
      ${f.cinemas.map((c) => `
        <div class="venue">
          <div class="venue-name">
            <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>
          </div>
          <div>${timesHtml(f.key, c.id, c.showings)}</div>
        </div>
      `).join('')}
    </article>
  `;
}

function renderFilms() {
  const el = $('#films');
  if (!state.data) return;

  const q = state.search.trim().toLowerCase();

  const films = state.data.films
    .map((f) => ({
      ...f,
      cinemas: f.cinemas
        .filter((c) => state.cinemas.has(c.id))
        .map((c) => ({
          ...c,
          showings: c.showings.filter((s) => inRange(s.start, state.range)).filter((s) => matchesLanguage(s, state.language)),
        }))
        .filter((c) => c.showings.length),
    }))
    .filter((f) => f.cinemas.length && (!q || f.title.toLowerCase().includes(q)));

  currentFilmsByKey.clear();
  for (const f of films) currentFilmsByKey.set(f.key, f);

  const liveKeys = new Set();
  for (const f of films) {
    for (const c of f.cinemas) liveKeys.add(dateKey(f.key, c.id));
  }
  for (const k of activeDateByFilm.keys()) {
    if (!liveKeys.has(k)) activeDateByFilm.delete(k);
  }

  if (!films.length) {
    el.innerHTML = `<p class="empty">No films match your filters.</p>`;
    return;
  }

  el.innerHTML = films.map(filmCard).join('');
}

function reRenderFilm(filmKey, film) {
  const article = document.querySelector(`.film[data-film-key="${CSS.escape(filmKey)}"]`);
  if (article) article.outerHTML = filmCard(film);
}

function uniqueDates(showings) {
  const set = new Set();
  for (const s of showings) {
    set.add(s.start ? s.start.slice(0, 10) : '');
  }
  return [...set];
}

/* ---------------- events ---------------- */

$('#search').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderFilms();
});

$('#refresh').addEventListener('click', () => load(true));

$('#filters').addEventListener('change', (e) => {
  const id = e.target.dataset.cinema;
  if (!id) return;
  if (e.target.checked) state.cinemas.add(id);
  else state.cinemas.delete(id);
  renderFilms();
});

$('#filters').addEventListener('click', (e) => {
  const range = e.target.dataset?.range;
  if (range) {
    state.range = range;
    renderFilters();
    renderFilms();
    return;
  }

  const language = e.target.dataset?.language;
  if (language) {
    state.language = language;
    renderFilters();
    renderFilms();
    return;
  }
});

$('#films').addEventListener('click', (e) => {
  const arrow = e.target.closest('.date-col-arrow');
  if (!arrow) return;
  e.preventDefault();
  if (arrow.disabled) return;

  const { film: filmKey, cinema, dir } = arrow.dataset;
  const film = currentFilmsByKey.get(filmKey);
  if (!film) return;

  const c = film.cinemas.find((x) => x.id === cinema);
  if (!c) return;

  const dates = uniqueDates(c.showings);
  const maxStart = Math.max(0, dates.length - PAGE_SIZE);
  const key = dateKey(filmKey, cinema);
  const current = datePageByFilm.get(key) ?? 0;
  const step = Number(dir) * PAGE_SIZE;
  const next = Math.max(0, Math.min(maxStart, current + step));
  datePageByFilm.set(key, next);

  reRenderFilm(filmKey, film);
});

load();