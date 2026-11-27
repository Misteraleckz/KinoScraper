import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scrapeCinema } from './lib/scrape.js';
import { aggregate } from './lib/aggregate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const CACHE_TTL = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

let snapshot = null; // { at: number, payload }

async function loadCinemas() {
  const raw = await readFile(path.join(__dirname, 'cinemas.json'), 'utf8');
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : parsed.cinemas || [];
  return list
    .filter((c) => c && c.url)
    .map((c, i) => ({ ...c, id: c.id || `cinema-${i + 1}`, name: c.name || `Cinema ${i + 1}` }));
}

app.get('/api/cinemas', async (_req, res) => {
  try {
    res.json(await loadCinemas());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/showtimes', async (req, res) => {
  const refresh = req.query.refresh === '1';

  if (!refresh && snapshot && Date.now() - snapshot.at < CACHE_TTL) {
    return res.json({ ...snapshot.payload, cached: true });
  }

  try {
    const cinemas = await loadCinemas();
    const settled = await Promise.allSettled(cinemas.map((c) => scrapeCinema(c)));

    const results = settled.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : {
            id: cinemas[i].id,
            name: cinemas[i].name,
            url: cinemas[i].url,
            films: [],
            error: s.reason?.message || String(s.reason),
          }
    );

    const payload = {
      fetchedAt: new Date().toISOString(),
      cinemas: results.map((r) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        filmCount: r.films.length,
        error: r.error || null,
        ms: r.ms ?? null,
      })),
      films: aggregate(results),
    };

    snapshot = { at: Date.now(), payload };
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  🎬  Cinema aggregator running at http://localhost:${PORT}\n`);
});