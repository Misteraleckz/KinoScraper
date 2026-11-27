import { writeFile } from 'node:fs/promises';
import { fetchHtml } from './lib/http.js';

const args = process.argv.slice(2);
const useBrowser = args.includes('--browser');
const url = args.find((a) => a.startsWith('http'));

if (!url) {
  console.error('Usage: node debug-dump.js <url> [--browser]');
  process.exit(1);
}

console.log(`Fetching ${url}${useBrowser ? ' (browser mode)' : ''}…`);
const html = await fetchHtml(url, { useBrowser, timeout: 30000 });

await writeFile('debug.html', html);
console.log(`Wrote debug.html (${html.length} bytes)`);

// Cheap signal: does the HTML contain the kinds of things showtime pages have?
const hasTime = /\b\d{1,2}(?::\d{2})?\s*[ap]\.?\s*m\b/i.test(html);
const hasTime24 = /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(html);
const hasJsonLd = /application\/ld\+json/.test(html);
const hasScreenings = /screeningevent/i.test(html);

console.log(`
Signals:
  AM/PM times in HTML:   ${hasTime}
  24h times in HTML:     ${hasTime24}
  JSON-LD present:       ${hasJsonLd}
  Schema ScreeningEvent: ${hasScreenings}
`);