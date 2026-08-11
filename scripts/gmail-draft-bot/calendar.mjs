// Google Calendar — find up to `limit` free slots of `durationMinutes` across
// the next `windowDays` business days using the freeBusy API.

const BASE = 'https://www.googleapis.com/calendar/v3';

export async function suggestTimes(accessToken, {
  attendees,
  durationMinutes = 60,
  windowDays = 14,
  startHour = 9,
  endHour = 18,
  excludeWeekends = true,
  limit = 3,
  timeZone = 'Asia/Tokyo',
} = {}) {
  const now = new Date();
  // Start from tomorrow to avoid suggesting today's remaining hours.
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() + 1);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + windowDays);

  const fbRes = await fetch(`${BASE}/freeBusy`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      timeZone,
      items: attendees.map(id => ({ id })),
    }),
  });
  if (!fbRes.ok) {
    throw new Error(`Calendar freeBusy ${fbRes.status}: ${await fbRes.text()}`);
  }
  const fb = await fbRes.json();

  // Collect busy intervals across all attendees. If an attendee can't be
  // queried (e.g. external, permission-denied), ignore their busy set rather
  // than failing the whole routine — we treat them as fully free.
  const busy = [];
  for (const cal of Object.values(fb.calendars ?? {})) {
    for (const b of cal.busy ?? []) {
      busy.push([new Date(b.start).getTime(), new Date(b.end).getTime()]);
    }
  }
  busy.sort((a, b) => a[0] - b[0]);

  // Walk each business-hour slot and return the first `limit` that don't
  // overlap any busy interval.
  const slots = [];
  const durationMs = durationMinutes * 60 * 1000;
  const cursor = new Date(windowStart);
  while (cursor < windowEnd && slots.length < limit) {
    const day = cursor.getDay();
    const weekend = day === 0 || day === 6;
    if (!(excludeWeekends && weekend)) {
      for (let h = startHour; h + durationMinutes / 60 <= endHour; h++) {
        const start = new Date(cursor);
        start.setHours(h, 0, 0, 0);
        const end = new Date(start.getTime() + durationMs);
        if (start <= now) continue;
        if (!overlapsAny(start.getTime(), end.getTime(), busy)) {
          slots.push({ start, end });
          if (slots.length >= limit) break;
          h += Math.ceil(durationMinutes / 60) - 1; // avoid adjacent overlap
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }
  return slots;
}

function overlapsAny(startMs, endMs, busy) {
  // Linear scan — `busy` is short (< a few hundred). Switch to binary search
  // if it ever becomes a hot path.
  for (const [bStart, bEnd] of busy) {
    if (bStart < endMs && bEnd > startMs) return true;
  }
  return false;
}

// Format slots for insertion into a Japanese-language draft body.
// ① 2026/04/21 (火) 10:00-11:00
export function formatSlotsJa(slots) {
  const dows = ['日', '月', '火', '水', '木', '金', '土'];
  const marks = ['①', '②', '③', '④', '⑤'];
  return slots.map((s, i) => {
    const d = s.start;
    const e = s.end;
    const ymd = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    const dow = dows[d.getDay()];
    const hm = t => `${pad(t.getHours())}:${pad(t.getMinutes())}`;
    return `${marks[i] ?? `${i + 1}.`} ${ymd} (${dow}) ${hm(d)}-${hm(e)}`;
  }).join('\n');
}

export function formatSlotsEn(slots) {
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return slots.map((s, i) => {
    const d = s.start;
    const e = s.end;
    const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dow = dows[d.getDay()];
    const hm = t => `${pad(t.getHours())}:${pad(t.getMinutes())}`;
    return `${i + 1}. ${ymd} (${dow}) ${hm(d)}-${hm(e)} JST`;
  }).join('\n');
}

function pad(n) { return String(n).padStart(2, '0'); }
