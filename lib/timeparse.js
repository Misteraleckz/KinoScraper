const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

const pad = (n) => String(n).padStart(2, '0');

export function parseTime(input) {
  if (input == null) return null;
  const s = String(input);

  let m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?\b/i);
  if (m) {
    let h = Number(m[1]);
    const mi = Number(m[2] || 0);
    if (m[3].toLowerCase() === 'p' && h < 12) h += 12;
    if (m[3].toLowerCase() === 'a' && h === 12) h = 0;
    if (h <= 23 && mi <= 59) return { h, m: mi };
    return null;
  }

  m = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return { h: Number(m[1]), m: Number(m[2]) };

  return null;
}

export function toLocalIso(dateStr, time) {
  if (!dateStr || !time) return null;
  return `${dateStr}T${pad(time.h)}:${pad(time.m)}`;
}

function iso(y, mo, d) {
  y = Number(y); mo = Number(mo); d = Number(d);
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function isoFromDate(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function inferYear(day, month, now) {
  const y = now.getFullYear();
  const candidate = new Date(y, month - 1, day);
  if (candidate.getTime() < now.getTime() - 60 * 86400000) return y + 1;
  return y;
}

export function parseDate(input, now = new Date()) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;

  // ISO 2025-01-15 (also matches inside "2025-01-15T19:30:00Z")
  let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return iso(m[1], m[2], m[3]);

  if (/\btoday\b/i.test(s)) return isoFromDate(now);
  if (/\btomorrow\b/i.test(s)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return isoFromDate(d);
  }

  // 15 Jan 2025  /  15 January
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?\s*(\d{4})?/i);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) {
      const day = Number(m[1]);
      const y = m[3] ? Number(m[3]) : inferYear(day, mo, now);
      return iso(y, mo, day);
    }
  }

  // January 15, 2025
  m = s.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) {
      const day = Number(m[2]);
      const y = m[3] ? Number(m[3]) : inferYear(day, mo, now);
      return iso(y, mo, day);
    }
  }

  // 15/01/2025, 1-15-2025, 15.01.
  m = s.match(/\b(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\b/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let y = m[3] ? Number(m[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    let day = a, month = b;
    if (a <= 12 && b > 12) { day = b; month = a; }
    return iso(y, month, day);
  }

  return null;
}