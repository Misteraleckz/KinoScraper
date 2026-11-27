import { readFile } from 'node:fs/promises';
import { scrapeCinema } from './lib/scrape.js';
import { buildSuffixes } from './lib/scrape.js';   // exported below
import { cleanTitle } from './lib/titleclean.js';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node debug-titleclean.js <cinema-url>');
  process.exit(1);
}

const raw = await readFile('cinemas.json', 'utf8');
const list = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : JSON.parse(raw).cinemas || [];
const cinema = list.find((c) => c.url === url);
if (!cinema) {
  console.error('No cinemas.json entry matches that URL.');
  console.error('Available URLs:');
  for (const c of list) console.error(`  ${c.url}`);
  process.exit(1);
}

console.log(`Cinema: ${cinema.id}`);
console.log(`  name: ${cinema.name}`);
console.log(`  stripTitleSuffixes: ${JSON.stringify(cinema.stripTitleSuffixes)}`);

const suffixes = buildSuffixes(cinema);
console.log(`\nDerived suffixes (${suffixes.length}):`);
for (const s of suffixes) console.log(`  • ${JSON.stringify(s)}`);

const result = await scrapeCinema(cinema);
console.log(`\nFilms returned: ${result.films.length}`);
if (result.error) console.log(`Error: ${result.error}`);

console.log('\nFirst 20 titles, and what cleanTitle would do with them right now:');
for (const f of result.films.slice(0, 20)) {
  const re = cleanTitle(f.title, suffixes);
  const marker = re === f.title ? '' : `  →  ${JSON.stringify(re)}`;
  console.log(`  ${JSON.stringify(f.title)}${marker}`);
}