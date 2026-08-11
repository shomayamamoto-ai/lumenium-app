// Shared helpers for the ai-news routine.

export function env(key, fallback) {
  const v = process.env[key];
  if (v == null || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env: ${key}`);
  }
  return v;
}

export function todayJstISO() {
  // YYYY-MM-DD in JST (UTC+9). GitHub Actions runs in UTC.
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export function nowJstLabel() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' JST';
}

export function daysAgoISO(n) {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}
