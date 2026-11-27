# Local Cinema Aggregator

Run `npm install && npm start` and open http://localhost:5173

Edit `cinemas.json` to list your cinemas, then hit ↻ Refresh.

## How to add a cinema

1. Add `{ "id": "...", "name": "...", "url": "..." }` to `cinemas.json`.
2. Run `npm run probe -- <that-url>` and check the output.

Three outcomes:

**A. It lists films and showtimes.** Done — you're covered by the JSON-LD or
heuristic parser.

**B. It finds nothing.** The page is probably rendered in JS. Install Playwright
(`npm i playwright && npx playwright install chromium`) and add
`"useBrowser": true` to that entry. Try again.

**C. It finds films but showtimes are missing or garbled.** Add CSS selectors
for that cinema. Use your browser's dev tools to find a repeating block per film:

```json
{
  "id": "rex",
  "name": "The Rex",
  "url": "https://therex.example.com/now-showing",
  "selectors": {
    "movie":  ".film-card",
    "title":  "h3.film-title",
    "times":  "a.showtime",
    "date":   ".showing-date",
    "screen": ".screen-name"
  }
}