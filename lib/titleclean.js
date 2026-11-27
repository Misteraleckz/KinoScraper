export function cleanTitle(title, suffixes) {
  let t = String(title || '').replace(/\u00A0/g, ' ').trim();
  if (!t || !suffixes || !suffixes.length) return t;

  const ordered = [...suffixes].filter(Boolean).sort((a, b) => b.length - a.length);

  for (const suffix of ordered) {
    const s = String(suffix).replace(/\u00A0/g, ' ').trim();
    if (!s) continue;

    const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Suffix removal (as before)
    let before;
    const reSuffix = new RegExp(`(?:\\s*[-–—:|/]\\s*)?${esc}\\s*$`, 'i');
    do {
      before = t;
      t = t.replace(reSuffix, '').trim();
    } while (t !== before && t.length > 0);

    // Prefix removal — same structure, anchored to start
    const rePrefix = new RegExp(`^\\s*${esc}(?:\\s*[-–—:|/]\\s*)?`, 'i');
    do {
      before = t;
      t = t.replace(rePrefix, '').trim();
    } while (t !== before && t.length > 0);
  }

  return t.trim();
}