const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = await import('playwright');
    browserPromise = chromium.launch();
  }
  return browserPromise;
}

async function fetchWithBrowser(url, timeout) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ userAgent: UA, locale: 'en-GB' });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout });
    return await page.content();
  } finally {
    await ctx.close();
  }
}

const ALLOWED_TYPES = /text\/html|application\/xhtml|text\/plain|application\/json|application\/ld\+json|\+json/i;

export async function fetchHtml(url, { timeout = 20000, useBrowser = false } = {}) {
  if (useBrowser) return fetchWithBrowser(url, timeout);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const type = res.headers.get('content-type') || '';
    if (type && !ALLOWED_TYPES.test(type)) {
      throw new Error(`Unexpected content-type: ${type}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts = {}) {
  const text = await fetchHtml(url, opts);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 120)}… (${err.message})`);
  }
}