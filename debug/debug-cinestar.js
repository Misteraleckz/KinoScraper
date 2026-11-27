import { fetchHtml } from './lib/http.js';
import { parseCinestar } from './lib/parsers/cinestar.js';

const cinemaId = 45;
const apiUrl = `https://www.cinestar.de/api/cinema/${cinemaId}/show/?appVersion=1.6.0`;

console.log(`Fetching ${apiUrl}`);
const raw = await fetchHtml(apiUrl, { timeout: 30000 });
console.log(`Got ${raw.length} bytes`);

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error('JSON.parse failed:', e.message);
  console.log('First 200 chars:', raw.slice(0, 200));
  process.exit(1);
}
console.log(`Parsed as JSON: ${Array.isArray(data) ? `array of ${data.length}` : typeof data}`);

if (Array.isArray(data) && data.length) {
  const sample = data[0];
  console.log('\nFirst entry keys:', Object.keys(sample));
  console.log('  _type:', sample._type);
  console.log('  title:', sample.title);
  console.log('  showtimes count:', Array.isArray(sample.showtimes) ? sample.showtimes.length : 'not an array');
  if (sample.showtimes?.[0]) {
    console.log('  showtimes[0]:', sample.showtimes[0]);
  }
}

console.log('\nCalling parseCinestar…');
try {
  const films = await parseCinestar(null, 'https://www.cinestar.de/kino-saarbruecken', {
    cinemaId: 45,
    includeEvents: false,
  });
  console.log(`parseCinestar returned ${films.length} films`);
  for (const f of films.slice(0, 5)) {
    console.log(`  • ${f.title} — ${f.showings.length} showings`);
  }
} catch (e) {
  console.error('parseCinestar threw:', e.message);
  console.error(e.stack);
}