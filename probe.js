import { readFile } from 'node:fs/promises';
import { scrapeCinema } from './lib/scrape.js';

const args = process.argv.slice(2);
const useBrowser = args.includes('--browser');
const url = args.find((a) => a.startsWith('http'));

if (!url) {
  console.error('Usage: npm run probe -- <cinema-url> [--browser]');
  process.exit(1);
}

// Load cinemas.json so parser + parserConfig are carried through.
let cinema = { id: 'probe', name: 'Probe', url, useBrowser };
let matched = false;

try {
  const raw = await readFile('cinemas.json', 'utf8');
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : parsed.cinemas || [];
  const match = list.find((c) => c.url === url);
  if (match) {
    matched = true;
    cinema = { ...match, useBrowser: useBrowser || match.useBrowser };
    console.log(`Matched cinemas.json entry: ${match.id} (parser: ${match.parser || 'generic'})`);
    if (match.parserConfig) {
      console.log(`  parserConfig: ${JSON.stringify(match.parserConfig)}`);
    }
  }
} catch (err) {
  console.log(`Could not read cinemas.json: ${err.message}`);
}

if (!matched) {
  console.log(`No cinemas.json entry matches ${url}`);
  console.log(`→ Falling through to the generic HTML parsers.`);
  console.log(`  To probe the CineStar JSON parser directly, add that URL to cinemas.json`);
  console.log(`  with "parser": "cinestar" and "parserConfig": { "cinemaId": 45 }.`);
}

console.log(`\nProbing ${url}${cinema.useBrowser ? ' (browser mode)' : ''}…\n`);

const result = await scrapeCinema(cinema);

if (result.error) {
  console.error('ERROR:', result.error);
  process.exit(1);
}

console.log(`${result.films.length} film(s) found in ${result.ms}ms\n`);
for (const f of result.films.slice(0, 10)) {
  const times = f.showings.map((s) => s.start || s.raw).slice(0, 6).join(', ');
  const more = f.showings.length > 6 ? ` …+${f.showings.length - 6}` : '';
  console.log(`• ${f.title}`);
  console.log(`  ${times}${more}`);
}
if (result.films.length > 10) {
  console.log(`\n…and ${result.films.length - 10} more`);
}