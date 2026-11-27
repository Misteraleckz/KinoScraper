export function cleanText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function resolveUrl(href, base) {
  if (!href) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

export function normalizeTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/\(\s*(19|20)\d{2}\s*\)/g, '')   // (2024)
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/\b(4k|3d|imax|subtitled|dubbed|dolby)\b/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}