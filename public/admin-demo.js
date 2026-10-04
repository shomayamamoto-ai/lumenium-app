/* Demo mode for the admin: /admin-members.html?demo=1
   For showing the admin to a prospective client in a meeting without
   exposing anything real. Every /api/ request is answered here from
   made-up sample data and never leaves the browser; every save is refused
   with a message that says why. Loaded first in <body>, so the fetch wrapper
   is in place before any panel script runs.

   Off unless ?demo=1 is in the URL or this tab is already in demo — in that
   case this file does nothing at all. */
(function () {
  'use strict';

  var FLAG = 'lum_demo';
  var KEY = 'lum_admin_key';
  var DEMO_KEY = 'demo-mode';
  var MSG = 'デモ版のため保存・送信はされません。';
  var HOME = '/admin-members.html';

  function ss(name, value) {
    try {
      if (value === undefined) return sessionStorage.getItem(name);
      if (value === null) sessionStorage.removeItem(name);
      else sessionStorage.setItem(name, value);
    } catch (_) {}
    return null;
  }

  var asked = false;
  try { asked = new URLSearchParams(location.search).get('demo') === '1'; } catch (_) {}
  if (!asked && ss(FLAG) !== '1') return;

  /* Entering from a real session in the same tab: the real key is replaced
     before any panel can read it, so it can never be sent from this tab. The
     advisor's chat is kept per tab as well, and a real conversation must not
     show up on the screen being presented. */
  if (ss(FLAG) !== '1' || ss(KEY) !== DEMO_KEY) ss('lum_advisor_chat', null);
  ss(FLAG, '1');
  ss(KEY, DEMO_KEY);

  var on = true;

  function leave() {
    on = false;
    ss(FLAG, null);
    ss(KEY, null);
    ss('lum_advisor_chat', null);
  }

  /* ---- title ----
     showTab() rewrites document.title on every switch; the prefix has to
     survive that, so the setter adds it rather than setting it once. */
  var PREFIX = '【デモ】';
  var titleDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
  if (titleDesc && titleDesc.set) {
    try {
      Object.defineProperty(document, 'title', {
        configurable: true,
        get: function () { return titleDesc.get.call(document); },
        set: function (v) {
          v = String(v);
          titleDesc.set.call(document, on && v.indexOf(PREFIX) !== 0 ? PREFIX + v : v);
        }
      });
    } catch (_) {}
  }
  document.title = document.title;

  /* ---- banner and notices ----
     A block at the top of the page rather than a fixed bar: it then cannot
     cover the admin's own header or the sticky tab row at any width. No
     transitions anywhere, so there is nothing to reduce for reduced motion. */
  var css = document.createElement('style');
  css.textContent =
    '#lum-demo-bar{max-width:1220px;margin:0 auto 14px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;' +
      'background:#fff;color:#1b2a4a;border:1px solid #c9cfdc;border-radius:10px;padding:9px 12px;' +
      'font-size:12.5px;line-height:1.7;font-weight:600}' +
    '#lum-demo-bar .t{flex:1 1 220px;min-width:0;overflow-wrap:anywhere}' +
    '#lum-demo-bar .t b{display:inline-block;margin-right:6px;padding:0 7px;border:1px solid #1b2a4a;border-radius:5px;' +
      'font-size:11px;letter-spacing:.08em;line-height:1.6}' +
    '#lum-demo-bar button{flex:none;font:inherit;font-size:12px;font-weight:700;color:#1b2a4a;background:#fff;' +
      'border:1px solid #1b2a4a;border-radius:8px;padding:5px 12px;cursor:pointer;transition:none;box-shadow:none;width:auto}' +
    '#lum-demo-bar button:hover,#lum-demo-bar button:focus-visible{background:#eef1f7}' +
    '#lum-demo-toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99;' +
      'max-width:calc(100vw - 32px);background:#1b2a4a;color:#fff;border-radius:10px;padding:10px 14px;' +
      'font-size:12.5px;line-height:1.7;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.18)}';
  (document.head || document.documentElement).appendChild(css);

  var bar = document.createElement('div');
  bar.id = 'lum-demo-bar';
  bar.setAttribute('role', 'note');
  bar.innerHTML = '<span class="t"><b>DEMO</b>デモ表示中：表示されている数字・名前はすべて架空のサンプルです。保存や送信は行われません。</span>' +
    '<button type="button" id="lum-demo-exit">デモを終了</button>';
  if (document.body) document.body.insertBefore(bar, document.body.firstChild);
  else document.addEventListener('DOMContentLoaded', function () { document.body.insertBefore(bar, document.body.firstChild); });
  bar.querySelector('#lum-demo-exit').addEventListener('click', function () {
    leave();
    location.href = HOME;
  });

  var toastTimer = 0;
  function notice(text) {
    var t = document.getElementById('lum-demo-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'lum-demo-toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = text || MSG;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.display = 'none'; }, 4000);
  }

  /* ---- navigations that would reach the server ----
     The member-list view/xlsx and the Google consent screen are reached by
     link or window.open, not fetch, so the fetch wrapper does not see them. */
  function isApi(url) {
    try { return /^\/api\//.test(new URL(String(url), location.href).pathname); } catch (_) { return false; }
  }

  var realOpen = window.open;
  window.open = function (url) {
    if (on && (isApi(url) || !url || url === 'about:blank')) {
      // A blank tab is only ever opened here to be pointed at /api/members-*
      // after a request; in demo that request is refused, so do not flash one.
      if (url) notice(MSG);
      return null;
    }
    return realOpen.apply(window, arguments);
  };

  document.addEventListener('click', function (e) {
    if (!on) return;
    var t = e.target;
    var a = t && t.closest ? t.closest('a[href]') : null;
    if (a && isApi(a.getAttribute('href'))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      notice(MSG);
      return;
    }
    // 「この端末を数から外す」 writes a real per-device preference that the
    // live site reads; a demo click must not change it.
    if (t && t.closest && t.closest('#stats-self-btn')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      notice(MSG);
    }
  }, true);

  /* Signing out ends the demo too, and reloads to a clean page: panels that
     already drew sample data must not stay mounted under a real login. */
  document.addEventListener('DOMContentLoaded', function () {
    var adm = window.lumAdmin;
    if (!adm || typeof adm.signOut !== 'function' || adm.signOut.__demo) return;
    var orig = adm.signOut;
    adm.signOut = function () {
      try { orig.apply(adm, arguments); } catch (_) {}
      leave();
      location.replace(HOME);
    };
    adm.signOut.__demo = true;
  });

  /* ---- deterministic sample data ----
     Seeded, so a reload shows the same numbers; daily values are seeded by
     their date, so the 7-, 30- and 90-day views agree with each other. */
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var DAY = 86400000, JST = 9 * 3600000;
  function jstDate(back) { return new Date(Date.now() + JST - (back || 0) * DAY).toISOString().slice(0, 10); }
  function lastDays(n) { var out = []; for (var i = n - 1; i >= 0; i--) out.push(jstDate(i)); return out; }
  function dow(date) { return new Date(date + 'T00:00:00Z').getUTCDay(); }
  function ago(ms) { return new Date(Date.now() - ms).toISOString(); }
  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  /** Integers that add up to `total`, in proportion to `weights`. */
  function alloc(total, weights) {
    var sum = 0, i;
    for (i = 0; i < weights.length; i++) sum += weights[i];
    var raw = weights.map(function (w) { return sum ? total * w / sum : 0; });
    var out = raw.map(Math.floor);
    var left = total - out.reduce(function (a, b) { return a + b; }, 0);
    var order = raw.map(function (r, j) { return [r - Math.floor(r), j]; }).sort(function (a, b) { return b[0] - a[0]; });
    for (i = 0; i < left && i < order.length; i++) out[order[i][1]]++;
    return out;
  }

  /* ---- analytics (shape: api/analytics.js → api/_analytics-report.js) ---- */
  var MAIN = [['service_view', 'サービスを見た', 0.38], ['contact_view', '問い合わせ画面', 0.09],
    ['contact_start', '入力を始めた', 0.045], ['contact_submit', '送信した', 0.018], ['booking_confirm', '商談を予約した', 0.009]];
  var SIDE = [['booking_view', '日程候補を見た', 0.03]];
  var ENGAGE = [['read_half', '半分まで読んだ', 0.55], ['read_end', '終わりまで読んだ', 0.24]];
  var STEPS = MAIN.concat(SIDE, ENGAGE);

  var dayCache = {};
  function dayStats(date) {
    if (dayCache[date]) return dayCache[date];
    var r = prng(hash('day:' + date));
    var back = Math.round((Date.parse(jstDate(0)) - Date.parse(date)) / DAY);
    var base = [24, 47, 52, 50, 48, 43, 22][dow(date)];
    var growth = 1 + 0.35 * (1 - Math.min(back, 120) / 120);
    var views = Math.round(base * growth * (0.8 + 0.4 * r()));
    if (back === 0) {
      // Today is not over: scale by how much of the JST day has gone.
      var now = new Date(Date.now() + JST);
      var frac = (now.getUTCHours() + now.getUTCMinutes() / 60) / 24;
      views = Math.round(views * Math.max(0.06, Math.min(1, frac * 1.1)));
    }
    var visitors = Math.round(views * (0.58 + 0.1 * r()));
    var visits = Math.round(visitors * (1.05 + 0.1 * r()));
    var engaged = Math.round(visits * (0.38 + 0.14 * r()));
    var timeN = Math.round(views * 0.86);
    var timeSum = Math.round(timeN * (38000 + 30000 * r()));
    var ev = {};
    STEPS.forEach(function (s) {
      var people = Math.floor(visitors * s[2] * (0.6 + 0.8 * r()) + r());
      ev[s[0]] = { people: people, count: people + Math.floor(people * 0.3 * r() + r() * 0.6) };
    });
    return (dayCache[date] = {
      date: date, views: views, visitors: visitors, visits: visits, engaged: engaged,
      timeSum: timeSum, timeN: timeN, submits: ev.contact_submit.count, bookings: ev.booking_confirm.count, ev: ev
    });
  }

  var PATHS = [['/', 30], ['/services/web.html', 12], ['/services/ai.html', 9], ['/pricing.html', 8], ['/works.html', 7],
    ['/about.html', 5], ['/services/video.html', 5], ['/faq.html', 4], ['/contact.html', 4], ['/blog/index.html', 3],
    ['/blog/post-3.html', 3], ['/services/sns.html', 3], ['/blog/post-7.html', 2], ['/news.html', 1.5]];
  var REFS = [['direct', 34, 'direct'], ['google.com', 26, 'search'], ['yahoo.co.jp', 7, 'search'], ['src:instagram', 5, 'social'],
    ['bing.com', 3, 'search'], ['instagram.com', 3, 'social'], ['chatgpt.com', 2.5, 'ai'], ['src:gbp', 2, 'search'],
    ['x.com', 2, 'social'], ['src:card', 2, 'direct'], ['note.com', 1.5, 'social'], ['line.me', 1.5, 'social'],
    ['perplexity.ai', 1, 'ai'], ['directory.example.com', 1, 'referral'], ['gemini.google.com', 0.6, 'ai']];
  // AIアシスタントの呼び名（api/_referrers.js の AI_HOSTS と同じ）と、AIから来た訪問の入口。
  var AI_NAMES = { 'chatgpt.com': 'ChatGPT', 'perplexity.ai': 'Perplexity', 'gemini.google.com': 'Gemini' };
  var AI_LAND = [['/services/web.html', 0.45], ['/pricing.html', 0.25], ['/', 0.2], ['/faq.html', 0.1]];
  var REF_KINDS = [
    { key: 'ai', label: 'AIアシスタントから', note: 'ChatGPT・Perplexity・Gemini・Copilot・Claude などの回答に載って、そこから来た人。AIO対策が効いているかは、ここが動くかで分かります。' },
    { key: 'search', label: '検索エンジンから', note: 'Google・Yahoo・Bing の検索結果から。GoogleのAIによる概要から来た人も、Googleが区別を教えないためここに入ります。' },
    { key: 'social', label: 'SNS・LINEから', note: 'X・Instagram・LINE・YouTube などの投稿やプロフィール欄のリンクから。' },
    { key: 'referral', label: '他のサイトから', note: '掲載先・紹介記事・ディレクトリなど。増えると外部掲載が効いている証拠です。' },
    { key: 'direct', label: '直接・不明', note: 'URLを直接入力、ブックマーク、QRコード、メールやアプリ内のリンクなど。紹介元が送られてこない経路はすべてここです。' }
  ];
  var HOURS = [2, 1, 1, 0.5, 0.5, 1, 2, 4, 6, 8, 9, 8, 10, 9, 8, 8, 7, 7, 8, 9, 11, 12, 9, 5];
  // Which sources the sample enquiries came from, by weight.
  var CONV = [['google.com', 5], ['src:instagram', 3], ['direct', 2], ['src:gbp', 2], ['yahoo.co.jp', 1], ['chatgpt.com', 1]];
  var CAMPAIGNS = [['instagram/-/-', 5], ['gbp/-/-', 2], ['card/-/-', 2], ['instagram/social/autumn-sale', 1.5], ['mail/email/newsletter-10', 1]];

  function pairs(names, counts) {
    return names.map(function (n, i) { return { name: n, count: counts[i] }; })
      .filter(function (x) { return x.count > 0; })
      .sort(function (a, b) { return b.count - a.count; });
  }
  function sumOf(list, k) { return list.reduce(function (a, x) { return a + (k ? x[k] : x); }, 0); }
  function datesEnding(n, end) { var out = []; for (var i = n - 1; i >= 0; i--) out.push(jstDate(end + i)); return out; }

  // Same arithmetic as summarize() in api/_analytics-report.js.
  function summarize(rows) {
    var visits = sumOf(rows, 'visits'), engaged = Math.min(visits, sumOf(rows, 'engaged'));
    var timeSum = sumOf(rows, 'timeSum'), timeN = sumOf(rows, 'timeN');
    return {
      views: sumOf(rows, 'views'), visitorDays: sumOf(rows, 'visitors'), visits: visits, engaged: engaged,
      bounces: visits - engaged, bounceRate: visits ? (visits - engaged) / visits : null,
      timeSum: timeSum, timeN: timeN, avgTimeMs: timeN ? Math.round(timeSum / timeN) : null,
      submits: sumOf(rows, 'submits'), bookings: sumOf(rows, 'bookings')
    };
  }

  function analytics(daysIn) {
    var days = Math.min(Math.max(parseInt(daysIn || '30', 10) || 30, 1), 365);
    var dates = lastDays(days);
    var prevDates = datesEnding(days, days);
    var rows = dates.map(dayStats);
    var r = prng(hash('range:' + days + ':' + jstDate(0)));
    var cur = summarize(rows);
    var prev = summarize(prevDates.map(dayStats));
    var rangeViews = cur.views;
    var arrivals = cur.visitorDays;
    var people = {}, counts = {};
    STEPS.forEach(function (s) {
      people[s[0]] = rows.reduce(function (a, d) { return a + d.ev[s[0]].people; }, 0);
      counts[s[0]] = rows.reduce(function (a, d) { return a + d.ev[s[0]].count; }, 0);
    });
    var step = function (s) {
      return { key: s[0], label: s[1], count: counts[s[0]], people: people[s[0]], rate: arrivals ? people[s[0]] / arrivals : 0 };
    };
    var main = MAIN.map(step);
    main.forEach(function (s, n) {
      var before = n === 0 ? arrivals : main[n - 1].people;
      s.drop = before > 0 && s.people <= before ? 1 - s.people / before : null;
      s.direct = before > 0 && s.people > before;
    });

    var pathCounts = alloc(rangeViews, PATHS.map(function (p) { return p[1] * (0.85 + 0.3 * r()); }));
    var topPaths = pairs(PATHS.map(function (p) { return p[0]; }), pathCounts);
    // Referrers are counted once per visit, so they add up to the visits.
    var refCounts = alloc(cur.visits, REFS.map(function (x) { return x[1] * (0.85 + 0.3 * r()); }));
    var byKind = {}, kindOfRef = {};
    REFS.forEach(function (x, i) { byKind[x[2]] = (byKind[x[2]] || 0) + refCounts[i]; kindOfRef[x[0]] = x[2]; });
    var refTotal = sumOf(refCounts);
    var visitsBySrc = {};
    REFS.forEach(function (x, i) { visitsBySrc[x[0]] = refCounts[i]; });
    var hourCounts = alloc(rangeViews, HOURS.map(function (w) { return w * (0.8 + 0.4 * r()); }));
    var devCounts = alloc(rangeViews, [61, 34, 5]);

    var readByPath = topPaths.map(function (p) {
      var ended = Math.round(p.count * (0.12 + 0.43 * r()));
      return { name: p.name, opened: p.count, ended: ended, rate: p.count ? ended / p.count : 0 };
    }).slice(0, 12);
    var exits = topPaths.map(function (p) {
      var n = Math.round(p.count * (p.name === '/contact.html' ? 0.18 : 0.25 + 0.45 * r()));
      return { name: p.name, exits: n, opened: p.count, rate: p.count ? n / p.count : 0 };
    }).sort(function (a, b) { return b.exits - a.exits; }).slice(0, 10);
    var linkNames = ['line', 'tel', 'instagram.com', 'mail', 'maps.google.com', 'other'];
    var links = pairs(linkNames, [0.021, 0.012, 0.01, 0.008, 0.006, 0.003].map(function (k) {
      return Math.round(arrivals * k * (0.8 + 0.4 * r()));
    }));
    var notFound = pairs(['/service/web.html', '/blog/post-0.html', '/recruit.html'], [
      Math.max(1, Math.round(3 * days / 30)), days >= 30 ? Math.round(2 * days / 30) : 0, days >= 30 ? 1 : 0
    ]);

    // Landing pages: most visits start at the top or on a service page.
    var LAND = [['/', 46], ['/services/web.html', 14], ['/services/ai.html', 10], ['/blog/post-3.html', 8], ['/pricing.html', 6],
      ['/blog/post-7.html', 5], ['/works.html', 4], ['/about.html', 3], ['/(404)', 1]];
    var landCounts = alloc(cur.visits, LAND.map(function (x) { return x[1] * (0.85 + 0.3 * r()); }));
    var landings = LAND.map(function (x, i) {
      var v = landCounts[i];
      var eng = Math.min(v, Math.round(v * (x[0] === '/' ? 0.52 : /blog/.test(x[0]) ? 0.24 : x[0] === '/(404)' ? 0.2 : 0.4 + 0.15 * r())));
      return { name: x[0], visits: v, engaged: eng, bounceRate: v ? (v - eng) / v : null };
    }).filter(function (x) { return x.visits > 0; }).sort(function (a, b) { return b.visits - a.visits; });

    var pageTimes = topPaths.map(function (p) {
      var samples = Math.round(p.count * 0.86);
      var avg = /blog/.test(p.name) ? 70000 + 50000 * r() : /services/.test(p.name) ? 45000 + 30000 * r() : 20000 + 30000 * r();
      return { name: p.name, samples: samples, avgMs: samples ? Math.round(avg) : null };
    }).filter(function (x) { return x.samples > 0; }).slice(0, 12);

    var convSub = alloc(cur.submits, CONV.map(function (x) { return x[1]; }));
    var convCalls = alloc(counts.contact_view ? Math.round(arrivals * 0.04) : 0, CONV.map(function (x) { return x[1] * (0.7 + 0.6 * r()); }));
    var convBook = alloc(cur.bookings, CONV.map(function (x) { return x[1]; }));
    var convSources = CONV.map(function (x, i) {
      return { name: x[0], kind: kindOfRef[x[0]] || 'referral', visits: visitsBySrc[x[0]] || 0,
        submits: convSub[i], bookings: convBook[i], contacts: convCalls[i] };
    }).filter(function (x) { return x.submits || x.contacts; })
      .sort(function (a, b) { return (b.submits - a.submits) || (b.contacts - a.contacts); });

    var campVisits = alloc(Math.round(cur.visits * 0.09), CAMPAIGNS.map(function (x) { return x[1]; }));
    var campSub = alloc(Math.round(cur.submits * 0.3), CAMPAIGNS.map(function (x) { return x[1]; }));
    var campaigns = CAMPAIGNS.map(function (x, i) { return { name: x[0], visits: campVisits[i], submits: campSub[i] }; })
      .filter(function (x) { return x.visits || x.submits; });

    var win = function (n) { return sumOf(lastDays(n).map(dayStats), 'views'); };
    var today = dayStats(jstDate(0));
    var allTime = 5200 + win(120);

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      keepDays: 400,
      storeFrom: 'env',
      range: { days: days, from: dates[0], to: dates[dates.length - 1] },
      previous: { from: prevDates[0], to: prevDates[prevDates.length - 1], partial: days * 2 > 400 },
      sessionsFrom: dates[0],
      summary: { cur: cur, prev: prev },
      funnel: {
        arrivals: arrivals,
        unit: 'visitor-days',
        main: main,
        side: SIDE.map(step),
        engagement: ENGAGE.map(step)
      },
      totals: {
        allTime: allTime,
        today: today.views,
        todayVisitors: today.visitors,
        todayVisits: today.visits,
        last7: win(7),
        last30: win(30),
        rangeViews: rangeViews,
        rangeVisitorDays: arrivals
      },
      series: rows.map(function (d) {
        return { date: d.date, views: d.views, visitors: d.visitors, visits: d.visits, engaged: Math.min(d.engaged, d.visits),
          bounceRate: d.visits ? (d.visits - Math.min(d.engaged, d.visits)) / d.visits : null,
          avgTimeMs: d.timeN ? Math.round(d.timeSum / d.timeN) : null, submits: d.submits };
      }),
      topPaths: topPaths.slice(0, 20),
      topReferrers: pairs(REFS.map(function (x) { return x[0]; }), refCounts).slice(0, 12),
      referrerKinds: REF_KINDS.map(function (k) {
        return { key: k.key, label: k.label, note: k.note, count: byKind[k.key] || 0, share: refTotal ? (byKind[k.key] || 0) / refTotal : 0 };
      }),
      // Same shape as aiSources / aiLandings in api/_analytics-report.js.
      aiSources: REFS.filter(function (x) { return x[2] === 'ai'; }).map(function (x) {
        return { name: AI_NAMES[x[0]] || x[0], hosts: [x[0]], count: visitsBySrc[x[0]] || 0 };
      }).filter(function (x) { return x.count > 0; }).sort(function (a, b) { return b.count - a.count; }),
      aiLandings: (function () {
        var out = [];
        REFS.forEach(function (x) {
          if (x[2] !== 'ai') return;
          var c = alloc(visitsBySrc[x[0]] || 0, AI_LAND.map(function (l) { return l[1]; }));
          AI_LAND.forEach(function (l, i) { if (c[i]) out.push({ source: AI_NAMES[x[0]] || x[0], path: l[0], count: c[i] }); });
        });
        return out.sort(function (a, b) { return b.count - a.count; }).slice(0, 15);
      })(),
      devices: pairs(['mobile', 'desktop', 'tablet'], devCounts),
      hours: hourCounts.map(function (c, h) { return { hour: h, count: c }; }),
      readByPath: readByPath,
      links: links,
      exits: exits,
      notFound: notFound,
      landings: landings.slice(0, 12),
      pageTimes: pageTimes,
      convSources: convSources.slice(0, 12),
      campaigns: campaigns
    };
  }

  /* ---- weekly mail (shape: api/weekly-report.js GET) ---- */
  function weeklyReport() {
    return {
      ok: true,
      configured: { resend: true, store: true, cron: true },
      enabled: true,
      to: 'owner@example.com',
      schedule: '毎週月曜 9:00（日本時間）',
      last: { at: ago(((new Date(Date.now() + JST).getUTCDay() + 6) % 7) * DAY + 3600000), ok: true, test: false, to: 'owner@example.com', message: '送信しました。' }
    };
  }

  /* ---- members (shape: api/members-list.js) ---- */
  var PEOPLE = [
    ['山田 花子', 'サンプル株式会社'], ['佐藤 健', '架空商事株式会社'], ['鈴木 一郎', 'テスト工業株式会社'],
    ['高橋 美咲', '例示デザイン合同会社'], ['田中 翔太', 'サンプル食品株式会社'], ['伊藤 さくら', ''],
    ['渡辺 大輔', 'みほん不動産株式会社'], ['中村 由美', 'サンプル歯科クリニック'], ['小林 拓也', '架空システムズ株式会社'],
    ['加藤 真理', 'テスト企画合同会社'], ['吉田 直樹', 'サンプル建設株式会社'], ['山本 彩', ''],
    ['松本 圭', '例示コンサルティング株式会社'], ['井上 千尋', 'サンプル美容室'], ['木村 蓮', '架空物流株式会社'],
    ['林 舞', 'みほん学習塾'], ['清水 陽介', 'サンプル株式会社'], ['山崎 葵', 'テスト製薬株式会社'],
    ['森 和也', '架空ホテル株式会社'], ['池田 紗希', ''], ['橋本 亮', 'サンプル税理士事務所'],
    ['阿部 結衣', '例示アパレル株式会社'], ['石川 誠', 'みほん自動車株式会社'], ['前田 遥', 'サンプル保育園']
  ];
  var ROMA = ['hanako.yamada', 'ken.sato', 'ichiro.suzuki', 'misaki.takahashi', 'shota.tanaka', 'sakura.ito',
    'daisuke.watanabe', 'yumi.nakamura', 'takuya.kobayashi', 'mari.kato', 'naoki.yoshida', 'aya.yamamoto',
    'kei.matsumoto', 'chihiro.inoue', 'ren.kimura', 'mai.hayashi', 'yosuke.shimizu', 'aoi.yamazaki',
    'kazuya.mori', 'saki.ikeda', 'ryo.hashimoto', 'yui.abe', 'makoto.ishikawa', 'haruka.maeda'];
  var DOMAINS = ['example.com', 'example.net', 'example.org'];

  function members() {
    var r = prng(hash('members'));
    var back = 0;
    var list = PEOPLE.map(function (p, i) {
      back += 1 + Math.floor(r() * 9);
      var t = Date.now() - back * DAY - Math.floor(r() * 10) * 3600000;
      return {
        id: 'demo-' + (i + 1),
        name: p[0],
        company: p[1],
        email: ROMA[i] + '@' + DOMAINS[i % 3],
        created: new Date(t).toISOString(),
        unsubscribed: i === 7 || i === 18
      };
    });
    return { ok: true, count: list.length, members: list };
  }

  /* ---- health (shape: api/health.js; ids are what the portal's `needs` read) ---- */
  function health() {
    var c = function (id, label, env, note) { return { id: id, label: label, env: env, state: 'ok', note: note }; };
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      today: jstDate(0),
      worst: 'ok',
      checks: [
        c('admin', '管理キー', 'ADMIN_KEY', 'この画面が開けているので設定済みです。'),
        c('resend', '問い合わせメール送信', 'RESEND_API_KEY', '問い合わせフォームと会員登録が動作します。'),
        c('contactTo', '問い合わせの宛先', 'CONTACT_TO_EMAIL', '指定のアドレスに届きます。'),
        c('store', 'アクセス解析・AIOの保存先', 'KV_REST_API_URL, KV_REST_API_TOKEN', 'ページビュー・導線・AIO計測が記録され、失効できる共有リンクも発行できます。'),
        c('ai', 'AI（SEO/AIO分析・アドバイザー）', 'ANTHROPIC_API_KEY', 'AIO計測とアドバイザーが使えます。'),
        c('github', 'お知らせ投稿・文章編集の保存', 'GITHUB_TOKEN', '保存すると自動デプロイが走ります。'),
        c('memberCode', '会員登録コード', 'MEMBER_CODE', '独自のコードが設定されています。'),
        c('sessionSecret', 'ログインセッションの署名鍵', 'SESSION_SECRET', '独自の鍵が設定されています。'),
        c('cron', '週次メールの合言葉（おすすめ）', 'CRON_SECRET', '毎週月曜の朝9時に、先週のアクセスのまとめがメールで届きます（「アクセス解析」の画面で止められます）。'),
        c('social', 'SNS 投稿', 'X_ACCESS_TOKEN ほか', 'X・Facebook・Instagram・Threads・LINE公式アカウント に管理ポータルから直接投稿できます。残り（LinkedIn）は資格情報が未入力です。'),
        c('contactBlocked', '迷惑送信のブロック', '', '直近30日で 3 件を回数制限で遮断しました。受信箱とメール送信枠を守っています。'),
        c('share', '会員リストの共有リンク', '', '2本が有効です（会員リストのみ・この管理画面は開けません）。すべて期限付きで、期日が来れば自動的に使えなくなります。')
      ],
      contact: { days: 30, ok: 14, fail: 0, blocked: 3, last7ok: 4, lastError: null },
      deploy: {
        commit: 'demo000', message: 'デモ表示（サンプルデータ）', branch: 'main', env: 'production',
        storeEnvSeen: ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
        using: { url: 'KV_REST_API_URL', token: 'KV_REST_API_TOKEN' }
      }
    };
  }

  /* ---- news (shape: api/news-post.js GET) ----
     /news.json is answered with the same list: the panel compares the saved
     list with the published one, and two different lists would show a
     「反映待ち」 that means nothing in a demo. */
  function newsItems() {
    var mk = function (back, id, title, body, link) {
      return { id: id, date: jstDate(back), title: title, body: body, link: link };
    };
    return [
      mk(3, 'demo-n4', '年末年始の営業についてのお知らせ（サンプル）', 'これはデモ用のサンプル記事です。実際のお知らせではありません。', ''),
      mk(12, 'demo-n3', '実績を追加しました（サンプル）', '飲食店のホームページ制作の事例を追加しました（架空の事例です）。', '/works.html'),
      mk(26, 'demo-n2', 'ブログを更新しました（サンプル）', '「AIを社内で使い始めるときの3つの決まりごと」を公開しました（デモ表示）。', '/blog/index.html'),
      mk(41, 'demo-n1', '新しいサービスを始めました（サンプル）', '「SNS運用サポート」の提供を始めました（デモ表示）。', '/#services')
    ];
  }
  function commit(back, msg) { return { sha: 'demo000', at: ago(back * DAY + 5 * 3600000), message: msg }; }

  /* ---- share links (shape: api/share-links.js GET) ---- */
  function shares() {
    return {
      ok: true, ready: true, max: 20,
      links: [
        { id: 'demo-s2', scope: 'members', label: '佐藤さん（営業資料用・サンプル）', createdAt: ago(4 * DAY),
          expiresAt: new Date(Date.now() + 26 * DAY).toISOString(), uses: 3, lastUsedAt: ago(DAY + 7200000) },
        { id: 'demo-s1', scope: 'members', label: '経理チーム（サンプル）', createdAt: ago(20 * DAY),
          expiresAt: new Date(Date.now() + 5 * DAY).toISOString(), uses: 0, lastUsedAt: null }
      ]
    };
  }

  /* ---- search console (shape: api/search-console.js summarise / GET) ---- */
  function searchConsole() {
    var q = function (query, branded, clicks, impressions, position) {
      return { query: query, branded: branded, clicks: clicks, impressions: impressions, position: position };
    };
    var open = [q('ホームページ制作 東京 中小企業', false, 6, 214, 14.2), q('生成AI 研修 社員向け', false, 4, 167, 11.8),
      q('採用動画 制作 費用', false, 2, 121, 18.6), q('LINE公式アカウント 構築 代行', false, 3, 98, 9.4),
      q('ホームページ リニューアル 相談', false, 1, 76, 21.3), q('SNS運用代行 相場', false, 0, 54, 27.9),
      q('会社紹介動画 費用', false, 1, 41, 16.0)];
    var branded = [q('lumenium', true, 18, 46, 1.2), q('ルメニウム', true, 7, 19, 1.4)];
    var part = function (list) {
      var imp = sumOf(list, 'impressions'), cl = sumOf(list, 'clicks');
      return {
        queries: list.length, impressions: imp, clicks: cl,
        ctr: imp ? Math.round(cl / imp * 1000) / 10 : 0,
        position: imp ? Math.round(list.reduce(function (n, x) { return n + x.position * x.impressions; }, 0) / imp * 10) / 10 : 0
      };
    };
    var change = function (cur, prev) {
      return {
        clicks: cur.clicks - prev.clicks, impressions: cur.impressions - prev.impressions,
        ctr: Math.round((cur.ctr - prev.ctr) * 10) / 10, position: Math.round((cur.position - prev.position) * 10) / 10
      };
    };
    var day = function (back) { return new Date(Date.now() - back * DAY).toISOString().slice(0, 10); };
    var bOpen = part(open), bBrand = part(branded);
    // Google's own total is larger than the sum of the rows: the rest is
    // queries it withholds. The demo keeps that gap so the note shows.
    var total = { impressions: bOpen.impressions + bBrand.impressions + 184, clicks: bOpen.clicks + bBrand.clicks + 3 };
    total.ctr = Math.round(total.clicks / total.impressions * 1000) / 10;
    total.position = 12.4;
    var prev = { impressions: 702, clicks: 38, ctr: 5.4, position: 13.6 };
    var openPrev = { impressions: 541, clicks: 9, ctr: 1.7, position: 17.2 };
    var pagesFor = {
      'ホームページ制作 東京 中小企業': [['/services/web.html', 180, 13.9], ['/', 34, 16.0]],
      '生成AI 研修 社員向け': [['/services/ai.html', 167, 11.8]],
      '採用動画 制作 費用': [['/services/video.html', 121, 18.6]],
      'LINE公式アカウント 構築 代行': [['/services/sns.html', 98, 9.4]],
      'ホームページ リニューアル 相談': [['/services/web.html', 76, 21.3]],
      'SNS運用代行 相場': [['/services/sns.html', 54, 27.9]],
      '会社紹介動画 費用': [['/services/video.html', 41, 16.0]],
      'lumenium': [['/', 46, 1.2]], 'ルメニウム': [['/', 19, 1.4]]
    };
    var withPages = function (x) {
      var o = {}; for (var k in x) o[k] = x[k];
      o.pages = (pagesFor[x.query] || []).map(function (p) { return { page: p[0], clicks: 0, impressions: p[1], position: p[2] }; });
      return o;
    };
    var byImpr = function (a, b) { return b.impressions - a.impressions; };
    var all = open.concat(branded).sort(byImpr);
    return {
      ok: true, connected: true, authorised: true, registered: true,
      siteUrl: 'sc-domain:example.com', days: 28,
      near: { from: 8, to: 20, minImpressions: 10 },
      range: { startDate: day(29), endDate: day(2) },
      prevRange: { startDate: day(57), endDate: day(30) },
      fetchedAt: ago(2 * 3600000), cached: true,
      total: total, prev: prev, change: change(total, prev),
      branded: bBrand, open: bOpen, openPrev: openPrev, openChange: change(bOpen, openPrev),
      hidden: { impressions: 184, clicks: 3 }, splitExact: true,
      topOpen: open, topBranded: branded,
      queryPages: all.map(withPages),
      opportunities: open.filter(function (x) { return x.position >= 8 && x.position <= 20 && x.impressions >= 10; })
        .sort(byImpr).map(function (x) { var o = withPages(x); o.page = o.pages[0] ? o.pages[0].page : null; delete o.pages; return o; }),
      devices: [
        { key: 'mobile', label: 'スマホ', clicks: 30, impressions: 612, ctr: 4.9, position: 11.8 },
        { key: 'desktop', label: 'パソコン', clicks: 14, impressions: 389, ctr: 3.6, position: 13.4 },
        { key: 'tablet', label: 'タブレット', clicks: 1, impressions: 35, ctr: 2.9, position: 12.9 }
      ],
      topPages: [
        { page: '/', clicks: 22, impressions: 260, position: 8.1 },
        { page: '/services/web.html', clicks: 7, impressions: 231, position: 13.5 },
        { page: '/services/ai.html', clicks: 4, impressions: 170, position: 11.9 },
        { page: '/pricing.html', clicks: 3, impressions: 88, position: 15.2 },
        { page: '/blog/post-3.html', clicks: 1, impressions: 52, position: 19.7 }
      ]
    };
  }

  /* ---- crawler visits (shape: api/crawlers.js → readCrawls in api/_crawlers.js) ----
     Names and groups as the real list has them; the counts are made up. */
  function crawlers() {
    var G = {
      'ai-search': ['AI検索のための読み取り', 'ChatGPT・Claude・Perplexity などが「検索して答える」ときの材料を集めに来ています。ここに来ていないAIの回答には、このサイトは出てきません。',
        'robots.txt でこの名前を断っていないか確認してください。断っていなければ、外部サイトからのリンクやサイトマップの送信で見つけてもらうのが先です。'],
      'ai-user': ['ユーザーの依頼で読みに来たAI', '誰かがAIに「このページを読んで」「この会社について調べて」と頼み、その場で開きに来たものです。その先には、このサイトに関心のある人がいます。',
        '来ていなくても異常ではありません。AIとの会話でこのサイトが話題に出たときにだけ来ます。'],
      'ai-train': ['AIの学習用', 'AIの学習データを集めるためのものです。来ても、すぐに回答に出るわけではありません。',
        '急ぐものではありません。学習に使われたくない場合は、robots.txt で断ることもできます。'],
      'search': ['検索エンジン', 'Google・Bing などの検索結果のための読み取りです。GoogleのAIによる概要や Copilot の材料も、ここを経由します。',
        'Search Console・Bing Webmaster Tools にサイトマップを送ってください。何日経っても来ない場合は robots.txt とサイトの公開設定を確認します。'],
      'social': ['SNSのリンク展開', 'SNSやチャットにこのサイトのURLが貼られ、プレビューを作るために読みに来たものです。', '']
    };
    var a = function (id, group, owner, hits, agoMs, note, paths) {
      return { id: id, hits: hits, group: group, groupLabel: G[group][0], owner: owner, note: note,
        lastAt: ago(agoMs), lastPath: paths[0][0],
        topPaths: paths.map(function (p) { return { path: p[0], hits: p[1] }; }) };
    };
    var H = 3600000;
    var agents = [
      a('Googlebot', 'search', 'Google', 412, 2 * H, 'Google 検索。AIによる概要の材料もここ経由です',
        [['/', 61], ['/services/web.html', 38], ['/sitemap.xml', 30], ['/robots.txt', 29], ['/pricing.html', 22]]),
      a('Bingbot', 'search', 'Microsoft', 188, 5 * H, 'Bing 検索。Copilot の材料でもあります',
        [['/', 31], ['/robots.txt', 30], ['/services/ai.html', 17], ['/faq.html', 12], ['/sitemap.xml', 9]]),
      a('GPTBot', 'ai-train', 'OpenAI', 96, 9 * H, 'OpenAI の学習用',
        [['/robots.txt', 28], ['/', 14], ['/services/web.html', 9], ['/about.html', 7], ['/blog/post-3.html', 5]]),
      a('OAI-SearchBot', 'ai-search', 'OpenAI', 64, 14 * H, 'ChatGPT の検索用。ここが来ていないと ChatGPT の検索回答には出ません',
        [['/robots.txt', 22], ['/', 11], ['/pricing.html', 8], ['/llms.txt', 6], ['/services/web.html', 5]]),
      a('ClaudeBot', 'ai-train', 'Anthropic', 41, 26 * H, 'Anthropic（Claude）の学習用',
        [['/robots.txt', 15], ['/llms.txt', 7], ['/', 6], ['/services/ai.html', 4], ['/faq.html', 3]]),
      a('PerplexityBot', 'ai-search', 'Perplexity', 23, 40 * H, 'Perplexity の検索用',
        [['/robots.txt', 9], ['/', 5], ['/faq.html', 3], ['/llms.txt', 2], ['/services/web.html', 2]]),
      a('ChatGPT-User', 'ai-user', 'OpenAI', 7, 3 * 24 * H, 'ChatGPT の利用者に頼まれて開いた',
        [['/pricing.html', 3], ['/services/web.html', 2], ['/', 2]]),
      a('Twitterbot', 'social', 'X', 5, 6 * 24 * H, 'X（Twitter）でリンクが展開された', [['/', 4], ['/news.html', 1]])
    ];
    var sum = function (g) { return agents.filter(function (x) { return x.group === g; }).reduce(function (n, x) { return n + x.hits; }, 0); };
    var count = function (g) { return agents.filter(function (x) { return x.group === g; }).length; };
    var groups = ['ai-search', 'ai-user', 'ai-train', 'search', 'social'].map(function (k) {
      return { key: k, label: G[k][0], note: G[k][1], ifMissing: G[k][2], hits: sum(k), agents: count(k) };
    });
    var total = agents.reduce(function (n, x) { return n + x.hits; }, 0);
    return {
      ok: true, store: true,
      crawlers: {
        days: 30, verified: false, total: total,
        ai: sum('ai-search') + sum('ai-train'), search: sum('search'), visit: sum('ai-user'),
        groups: groups, agents: agents,
        perDay: lastDays(30).map(function (d, i) { return { date: d, hits: Math.round(total / 30 * (0.6 + (i % 5) * 0.2)) }; }),
        paths: [{ path: '/', hits: 133 }, { path: '/robots.txt', hits: 133 }, { path: '/services/web.html', hits: 56 }],
        missing: [
          { id: 'Claude-SearchBot', owner: 'Anthropic', group: 'ai-search', groupLabel: G['ai-search'][0], note: 'Claude の検索用' },
          { id: 'Claude-User', owner: 'Anthropic', group: 'ai-user', groupLabel: G['ai-user'][0], note: 'Claude の利用者に頼まれて開いた' },
          { id: 'Perplexity-User', owner: 'Perplexity', group: 'ai-user', groupLabel: G['ai-user'][0], note: 'Perplexity の利用者に頼まれて開いた' }
        ],
        tokens: [
          { id: 'Google-Extended', note: 'Gemini などの学習・回答に使ってよいか（読み取り自体は Googlebot が行います）' },
          { id: 'Applebot-Extended', note: 'Apple Intelligence の学習に使ってよいか（読み取り自体は Applebot が行います）' }
        ]
      }
    };
  }

  /* ---- AIO (shape: api/aio.js summarise / GET) ----
     Three answers per question from two engines (Claude and ChatGPT), the way
     a real run with the default settings comes back. The answers vary from one
     sample to the next on purpose: that variation is why every rate on the
     panel comes with a range, and a demo where every answer agreed would
     show ranges with nothing to explain them. */
  var RIVALS = ['サンプル制作株式会社', '例示デザイン合同会社', '架空メディア株式会社', 'テスト映像社', 'みほんWeb工房'];
  var SAMPLE_QS = [
    { id: 'web-make', cat: 'Web制作・システム開発', q: '企業のホームページ制作を依頼できる会社を東京で探しています。',
      verdict: 'recommended', cited: true, companies: ['Lumenium', RIVALS[0], RIVALS[1]],
      answer: '（サンプル回答）東京で中小企業向けのホームページ制作を相談できる候補として、Lumenium、サンプル制作株式会社、例示デザイン合同会社などが挙げられます。料金の目安は30万〜80万円程度です。',
      sources: ['lumenium.net', 'directory.example.com'], sourceUrls: ['https://directory.example.com/web/tokyo', 'https://lumenium.net/services/web.html'], ownPages: ['/services/web.html'] },
    { id: 'ai-train', cat: 'AI導入・研修', q: '社員向けの生成AI研修をやってくれる会社を教えてください。',
      verdict: 'mentioned', cited: true, companies: [RIVALS[2], 'Lumenium'],
      answer: '（サンプル回答）生成AI研修は、架空メディア株式会社などが提供しています。Lumenium も中小企業向けの研修を案内しています。',
      sources: ['lumenium.net', 'media.example.net'], sourceUrls: ['https://media.example.net/ai-training-list', 'https://lumenium.net/services/ai.html'], ownPages: ['/services/ai.html'] },
    { id: 'video-hire', cat: '動画制作', q: '東京で採用動画の制作を依頼できる会社を教えてください。',
      verdict: 'absent', cited: false, companies: [RIVALS[3], '（株）サンプル制作'], missing: '制作実績の本数と料金の幅',
      answer: '（サンプル回答）採用動画の制作では、テスト映像社や（株）サンプル制作などが候補になります。',
      sources: ['directory.example.com', 'media.example.net'], sourceUrls: ['https://directory.example.com/video/tokyo', 'https://media.example.net/ai-training-list'], ownPages: [] },
    { id: 'sns-line', cat: 'SNS・LINE', q: '企業のLINE公式アカウントの構築を代行してくれる会社はありますか？',
      verdict: 'recommended', cited: true, companies: ['Lumenium', RIVALS[4]],
      answer: '（サンプル回答）LINE公式アカウントの構築代行は、Lumenium やみほんWeb工房が対応しています。初期構築は10万円前後からが目安です。',
      sources: ['lumenium.net', 'directory.example.com'], sourceUrls: ['https://lumenium.net/services/sns.html', 'https://directory.example.com/web/tokyo'], ownPages: ['/services/sns.html'] },
    { id: 'cre-logo', cat: 'クリエイティブ', q: '会社のロゴやバナーのデザインを依頼できる制作会社を教えてください。',
      verdict: 'absent', cited: false, companies: [RIVALS[1], RIVALS[4]], missing: 'デザインの料金表',
      answer: '（サンプル回答）ロゴやバナーは、例示デザイン合同会社やみほんWeb工房などに相談できます。',
      sources: ['media.example.net'], sourceUrls: ['https://media.example.net/design-studios'], ownPages: [] },
    { id: 'cross-onestop', cat: '横断・比較', q: '動画もWebもAI研修もまとめて頼める制作会社はありますか？',
      verdict: 'mentioned', cited: true, companies: ['Lumenium', RIVALS[2]],
      answer: '（サンプル回答）動画・Web・AI研修をまとめて相談できる会社として、Lumenium や架空メディア株式会社があります。',
      sources: ['lumenium.net'], sourceUrls: ['https://lumenium.net/'], ownPages: ['/'] },
    { id: 'trust-newco', cat: '評判・信頼性', q: '設立して間もない制作会社に発注するのは不安です。信頼できるかどうか、何で見分ければよいですか？',
      verdict: 'absent', cited: false, companies: [], missing: '第三者サイトでの事業者情報',
      answer: '（サンプル回答）公式サイト以外の情報源で、所在地や代表者が確認できるかを見るのが確実です。',
      sources: ['directory.example.com'], sourceUrls: ['https://directory.example.com/web/tokyo'], ownPages: [] },
    { id: 'brand-what', cat: 'ブランド指名', branded: true, q: 'ルメニウム（Lumenium）とはどんな会社ですか？',
      verdict: 'recommended', cited: true, companies: ['Lumenium'],
      answer: '（サンプル回答）Lumenium は、Web制作・動画制作・AI導入支援などをまとめて提供する制作会社です。',
      sources: ['lumenium.net'], sourceUrls: ['https://lumenium.net/about.html'], ownPages: ['/about.html'] }
  ];
  var DEMO_ENGINES = ['claude', 'openai'];
  var ENGINE_LABEL = { claude: 'Claude', openai: 'ChatGPT（OpenAI）', perplexity: 'Perplexity', gemini: 'Gemini' };
  var DEMO_SAMPLES = 3;
  var JUDGE_BATCH = 4;

  /* How one sample of one question came back. A hit can slip to a miss on
     another sample, and the other engine finds us a little less often. */
  var SLIP = { recommended: 'mentioned', mentioned: 'absent', absent: 'absent', denied: 'denied' };
  function demoVerdict(s, sample, engine) {
    var v = s.verdict;
    if (engine === 'openai' && sample === 1) v = SLIP[v] || v;
    if (engine === 'claude' && sample === 2 && v === 'mentioned') v = 'recommended';
    if (engine === 'openai' && sample === 2 && s.id === 'video-hire') v = 'mentioned';
    return v;
  }
  function isHitV(v) { return v === 'recommended' || v === 'mentioned'; }

  function aioResult(s, sample, engine) {
    sample = sample || 0;
    engine = engine || 'claude';
    var v = demoVerdict(s, sample, engine);
    var hit = isHitV(v);
    var companies = hit ? s.companies.slice() : s.companies.filter(function (c) { return c !== 'Lumenium'; });
    if (hit && companies.indexOf('Lumenium') < 0) companies.push('Lumenium');
    var cited = hit && s.cited && !(engine === 'openai' && sample === 1);
    var own = s.sourceUrls.filter(function (u) { return u.indexOf('lumenium.net') >= 0; });
    return {
      key: s.id + '#' + engine + '#' + sample, id: s.id, cat: s.cat, q: s.q, branded: !!s.branded,
      engine: engine, model: engine === 'claude' ? 'demo-claude' : 'demo-gpt', sample: sample,
      answer: s.answer, named: hit, verdict: v,
      cited: cited, citedRank: cited ? 1 : null,
      citedUrls: cited ? own.map(function (u) { return { url: u, title: '', host: 'lumenium.net' }; }) : [],
      // Searched but not cited: the weaker signal, kept apart.
      searched: own.length > 0, searchCount: 6,
      sources: s.sources, sourceUrls: s.sourceUrls, companies: companies,
      position: hit ? Math.max(1, companies.indexOf('Lumenium') + 1) : null,
      sentiment: hit ? (s.id === 'ai-train' && sample === 1 ? 'neutral' : 'positive') : null,
      missing: s.missing || '', ownPages: s.ownPages, truncated: false, ms: 14000
    };
  }

  // Wilson score interval, as api/_aio-stats.js.
  function rateOf(k, n) {
    if (!n) return { k: 0, n: 0, p: 0, lo: 0, hi: 1 };
    var z = 1.96, p = k / n, z2 = z * z, d = 1 + z2 / n;
    var c = (p + z2 / (2 * n)) / d;
    var h = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / d;
    return { k: k, n: n, p: p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
  }
  function count(list, f) { return list.filter(f).length; }
  function ratesOf(done) {
    var open = done.filter(function (x) { return !x.branded; });
    return {
      recommend: rateOf(count(open, function (x) { return x.verdict === 'recommended'; }), open.length),
      openMention: rateOf(count(open, function (x) { return isHitV(x.verdict); }), open.length),
      mention: rateOf(count(done, function (x) { return isHitV(x.verdict); }), done.length),
      cite: rateOf(count(done, function (x) { return x.cited; }), done.length),
      searched: rateOf(count(done, function (x) { return x.searched; }), done.length)
    };
  }

  /* Three runs a fortnight apart. The latest against the one before is a
     rise that is still inside the range (誤差の範囲); the one before that
     used a different question set, so it is not compared at all. */
  var RUNS = [
    { back: 2, drop: 0, hash: 'demo0001' },
    { back: 16, drop: 2, hash: 'demo0001' },
    { back: 30, drop: 4, hash: 'demo0000' }
  ];
  function runId(i) { return jstDate(RUNS[i].back) + '-demo' + i; }

  function demoResults(drop) {
    var out = [];
    for (var s = 0; s < DEMO_SAMPLES; s++) {
      DEMO_ENGINES.forEach(function (e) {
        SAMPLE_QS.forEach(function (q, qi) {
          var r = aioResult(q, s, e);
          // Older runs: a few of the hits had not happened yet.
          if (drop && isHitV(r.verdict) && !q.branded && (qi + s) % 5 < drop) {
            r.verdict = 'absent'; r.named = false; r.cited = false; r.citedRank = null; r.citedUrls = [];
            r.position = null; r.sentiment = null;
            r.companies = r.companies.filter(function (c) { return c !== 'Lumenium'; });
          }
          out.push(r);
        });
      });
    }
    return out;
  }

  function demoSummary(results) {
    var done = results.filter(function (x) { return x.verdict; });
    var open = done.filter(function (x) { return !x.branded; });
    var stats = ratesOf(done);
    var verdicts = { recommended: 0, mentioned: 0, denied: 0, other_company: 0, absent: 0 };
    done.forEach(function (x) { verdicts[x.verdict]++; });
    var byQ = {}, order = [];
    results.forEach(function (x) {
      if (!byQ[x.id]) { byQ[x.id] = { id: x.id, cat: x.cat, q: x.q, branded: x.branded, n: 0, hits: 0, recs: 0, cites: 0, searched: 0, total: 0, perEngine: {} }; order.push(x.id); }
      var row = byQ[x.id];
      row.total++; row.n++;
      if (!row.perEngine[x.engine]) row.perEngine[x.engine] = { n: 0, hits: 0, recs: 0, cites: 0 };
      var pe = row.perEngine[x.engine];
      pe.n++;
      if (isHitV(x.verdict)) { row.hits++; pe.hits++; }
      if (x.verdict === 'recommended') { row.recs++; pe.recs++; }
      if (x.cited) { row.cites++; pe.cites++; }
      if (x.searched) row.searched++;
    });
    var cats = [];
    results.forEach(function (x) { if (cats.indexOf(x.cat) < 0) cats.push(x.cat); });
    var tally = {};
    open.forEach(function (x) {
      x.companies.forEach(function (c) {
        if (c === 'Lumenium') return;
        // （株）サンプル制作 and サンプル制作株式会社 are one company.
        var k = c.replace(/株式会社|合同会社|（株）/g, '');
        if (!tally[k]) tally[k] = { name: c, count: 0, qs: {} };
        tally[k].count++; tally[k].qs[x.id] = 1;
      });
    });
    var ours = count(open, function (x) { return isHitV(x.verdict); });
    var others = 0;
    var competitors = Object.keys(tally).map(function (k) {
      others += tally[k].count;
      return { name: tally[k].name, count: tally[k].count, questions: Object.keys(tally[k].qs).length, share: tally[k].count / open.length, us: false };
    });
    competitors.push({ name: 'Lumenium', count: ours, questions: 0, share: ours / open.length, us: true });
    competitors.sort(function (a, b) { return b.count - a.count; });
    var placed = open.filter(function (x) { return isHitV(x.verdict) && x.position; });
    var sentiment = { positive: 0, neutral: 0, negative: 0 };
    done.forEach(function (x) { if (isHitV(x.verdict) && sentiment[x.sentiment] !== undefined) sentiment[x.sentiment]++; });
    return {
      missingEvidence: ['制作実績の本数と料金の幅', 'デザインの料金表', '第三者サイトでの事業者情報'],
      asked: done.length, total: results.length, questions: order.length, samples: DEMO_SAMPLES, engineIds: DEMO_ENGINES,
      coverage: 1, errors: [], unjudged: 0, truncated: 0, failed: 0, fallback: false,
      stats: stats,
      mentionRate: stats.mention.p, openMentionRate: stats.openMention.p, recommendRate: stats.recommend.p,
      citeRate: stats.cite.p, searchRate: stats.searched.p,
      verdicts: verdicts,
      engines: DEMO_ENGINES.map(function (e) {
        var list = done.filter(function (x) { return x.engine === e; });
        return { id: e, label: ENGINE_LABEL[e], model: 'demo', total: list.length, asked: list.length, failed: 0, truncated: 0, stats: ratesOf(list) };
      }),
      byQuestion: order.map(function (id) { return byQ[id]; }),
      byCategory: cats.map(function (cat) {
        var list = done.filter(function (x) { return x.cat === cat; });
        var k = count(list, function (x) { return isHitV(x.verdict); });
        return { cat: cat, asked: list.length, planned: list.length, questions: 1, plannedQuestions: 1, branded: cat === 'ブランド指名',
          mentions: k, cites: count(list, function (x) { return x.cited; }), thin: true, rate: null, ci: null };
      }),
      competitors: competitors,
      shareOfVoice: { ours: ours, others: others, value: ours + others ? ours / (ours + others) : 0 },
      position: placed.length ? { avg: placed.reduce(function (s, x) { return s + x.position; }, 0) / placed.length, n: placed.length,
        first: count(placed, function (x) { return x.position === 1; }) } : null,
      sentiment: sentiment,
      citedPages: [
        { url: 'https://directory.example.com/web/tokyo', host: 'directory.example.com', count: 3 },
        { url: 'https://media.example.net/ai-training-list', host: 'media.example.net', count: 2 }
      ],
      ownPages: [{ path: '/services/web.html', count: 1 }, { path: '/services/ai.html', count: 1 }, { path: '/services/sns.html', count: 1 }, { path: '/', count: 1 }],
      topSources: [{ name: 'lumenium.net', count: 5 }, { name: 'directory.example.com', count: 4 }, { name: 'media.example.net', count: 3 }],
      topCited: [{ name: 'lumenium.net', count: 4 }]
    };
  }

  var runCache = {};
  function aioRun(i) {
    if (runCache[i]) return runCache[i];
    var R = RUNS[i];
    var results = demoResults(R.drop);
    var summary = demoSummary(results);
    runCache[i] = {
      id: runId(i), startedAt: ago(R.back * DAY + 3 * 3600000 + 240000), finishedAt: ago(R.back * DAY + 3 * 3600000),
      settings: { samples: DEMO_SAMPLES, engines: DEMO_ENGINES, questionsHash: R.hash, questionCount: SAMPLE_QS.length,
        models: { claude: 'demo', openai: 'demo' }, judgeModel: 'demo' },
      results: results, summary: summary,
      actions: [
        { rank: 2, kind: 'category', title: '他社だけが挙がったカテゴリ 2 件',
          why: 'そのカテゴリの質問には答えが出ていて、そこに自社が入っていないということです。',
          how: '挙がった会社のページと自社の該当ページを並べ、料金の幅・対応範囲・実績数を足す（サンプルの提案です）。',
          evidence: ['クリエイティブ：' + RIVALS[1] + '、' + RIVALS[4], '評判・信頼性：（回答に会社名なし）'] },
        { rank: 3, kind: 'sources', title: '複数の質問で読まれていた情報源 2 件',
          why: '答えを組み立てる材料にされている面です。',
          how: '掲載条件を確認して、載せられるものから載せる（サンプルの提案です）。',
          evidence: ['directory.example.com（4問で参照）', 'media.example.net（3問で参照）'] },
        { rank: 4, kind: 'cited', title: '自社サイトが答えの出典になった質問 5 / 8 件',
          why: '検索では読まれたのに出典にされなかった回答があります。読まれても、答えに使える一文が無かったということです。',
          how: '計測している質問文を、そのままページの見出しにする（サンプルの提案です）。',
          evidence: [SAMPLE_QS[0].q, SAMPLE_QS[3].q] }
      ],
      social: socialActivity()
    };
    return runCache[i];
  }

  function socialActivity() {
    return { posts: 9, attempts: 9, sent: 14, failed: 1, last7: 2, lastAt: ago(2 * DAY + 4 * 3600000), byNet: { x: 6, threads: 4, facebook: 3, line: 1 } };
  }

  // Two-proportion z-test at 95%, as api/_aio-stats.js.
  function demoCompare(a, b) {
    var z = function (x, y) {
      if (!x || !y || !x.n || !y.n) return { change: 'na', diff: 0, z: 0 };
      var pool = (x.k + y.k) / (x.n + y.n);
      var se = Math.sqrt(pool * (1 - pool) * (1 / x.n + 1 / y.n));
      var d = y.p - x.p, zz = se ? d / se : 0;
      return { change: Math.abs(zz) > 1.96 ? (d > 0 ? 'up' : 'down') : 'same', diff: d, z: zz };
    };
    var out = {};
    ['recommend', 'openMention', 'cite'].forEach(function (k) {
      var r = z(a.stats[k], b.stats[k]);
      r.before = a.stats[k]; r.after = b.stats[k];
      out[k] = r;
    });
    return out;
  }

  var ENGINE_META = [
    { id: 'claude', label: 'Claude', model: 'demo', ready: true, estUsd: 0.059 },
    { id: 'openai', label: 'ChatGPT（OpenAI）', model: 'demo', ready: true, estUsd: 0.02 },
    { id: 'perplexity', label: 'Perplexity', model: 'demo', ready: false, estUsd: 0.008 },
    { id: 'gemini', label: 'Gemini', model: 'demo', ready: false, estUsd: 0.04 }
  ];

  function aioGet(want) {
    var idx = 0;
    for (var i = 0; i < RUNS.length; i++) if (runId(i) === want) idx = i;
    var latest = aioRun(idx);
    var all = RUNS.map(function (_, j) { return aioRun(j); });
    var before = idx + 1 < RUNS.length ? aioRun(idx + 1) : null;
    var prev = null;
    if (before && RUNS[idx].hash === RUNS[idx + 1].hash) {
      prev = {
        comparable: true, id: before.id, finishedAt: before.finishedAt, asked: before.summary.asked, total: before.summary.total,
        openMentionRate: before.summary.openMentionRate, recommendRate: before.summary.recommendRate, citeRate: before.summary.citeRate,
        settings: before.settings, compare: demoCompare(before.summary, latest.summary),
        newCompetitors: idx === 0 ? [RIVALS[4]] : [], goneCompetitors: [], newSources: idx === 0 ? ['media.example.net'] : []
      };
    } else if (before) {
      prev = { comparable: false, id: before.id, finishedAt: before.finishedAt, reason: '質問の組が違います' };
    }
    var brief = function (r) {
      return { id: r.id, finishedAt: r.finishedAt, mentionRate: r.summary.mentionRate, openMentionRate: r.summary.openMentionRate,
        recommendRate: r.summary.recommendRate, citeRate: r.summary.citeRate, asked: r.summary.asked,
        stats: { openMention: r.summary.stats.openMention, recommend: r.summary.stats.recommend, cite: r.summary.stats.cite },
        settings: { samples: r.settings.samples, engines: r.settings.engines, questionsHash: r.settings.questionsHash } };
    };
    var qs = SAMPLE_QS.map(function (s) { return { id: s.id, cat: s.cat, q: s.q, branded: !!s.branded }; });
    return {
      ok: true,
      meta: {
        questions: qs.length,
        questionSet: { custom: false, hash: 'demo0001', list: qs, defaults: qs.length },
        categories: [], engines: ENGINE_META,
        samples: { options: [1, 3, 5], default: 3 },
        judgeBatch: JUDGE_BATCH, judgeEstUsd: 0.0136,
        estimateUsd: qs.length * 3 * 0.059 + Math.ceil(qs.length * 3 / JUDGE_BATCH) * 0.0136,
        limits: { questions: 60, q: 200, cat: 30, id: 40, callsPerDay: 1600 },
        aiReady: true, stored: true, brand: 'lumenium.net', brandName: 'Lumenium'
      },
      social: socialActivity(),
      latest: latest,
      prev: prev,
      runs: all.map(brief),
      history: all.map(brief)
    };
  }

  /* A measurement can be "run" in demo: a handful of the sample questions,
     answered at once, and the same report at the end. stored:true keeps the
     panel from copying the run into this browser's real AIO history. */
  var DEMO_RUN_QS = 4;
  function aioPost(body) {
    var a = body && body.action;
    if (a === 'start') {
      var samples = [1, 3, 5].indexOf(Number(body.samples)) >= 0 ? Number(body.samples) : 3;
      var engines = (body.engines || ['claude']).filter(function (e) { return e === 'claude' || e === 'openai'; });
      if (!engines.length) engines = ['claude'];
      var n = DEMO_RUN_QS * samples * engines.length;
      return { ok: true, runId: jstDate(0) + '-demo', startedAt: new Date().toISOString(), stored: true, storeWarning: null,
        samples: samples, engines: engines,
        settings: { samples: samples, engines: engines, questionsHash: 'demo0001', questionCount: DEMO_RUN_QS },
        plan: { answers: n, judgeCalls: Math.ceil(n / JUDGE_BATCH), calls: n + Math.ceil(n / JUDGE_BATCH), usd: 0 },
        paceMs: 0, maxContinuations: 2, judgeBatch: JUDGE_BATCH,
        questions: SAMPLE_QS.slice(0, DEMO_RUN_QS).map(function (s) { return { id: s.id, cat: s.cat, q: s.q, branded: !!s.branded }; }) };
    }
    if (a === 'ask') {
      var i = Math.max(0, Math.min(SAMPLE_QS.length - 1, Number(body.index) || 0));
      var r = aioResult(SAMPLE_QS[i], Number(body.sample) || 0, body.engine === 'openai' ? 'openai' : 'claude');
      // The verdict comes from the judge, as in a real run.
      var bare = {};
      for (var k in r) bare[k] = r[k];
      bare.verdict = null; bare.companies = []; bare.position = null; bare.sentiment = null; bare.missing = '';
      return { ok: true, index: i, sample: bare.sample, engine: bare.engine, result: bare, storeWarning: null };
    }
    if (a === 'judge') {
      var verdicts = {};
      (body.items || []).forEach(function (it) {
        var parts = String(it.key || '').split('#');
        var s = SAMPLE_QS.filter(function (x) { return x.id === parts[0]; })[0];
        if (!s) return;
        var full = aioResult(s, Number(parts[2]) || 0, parts[1]);
        verdicts[it.key] = { verdict: full.verdict, companies: full.companies, missing: full.missing, position: full.position, sentiment: full.sentiment };
      });
      return { ok: true, verdicts: verdicts };
    }
    if (a === 'finalize') return { ok: true, run: aioRun(0), stored: true };
    if (a === 'probe') {
      var s0 = SAMPLE_QS[0];
      return { ok: true, probe: { ok: true, q: s0.q, engine: 'claude', ms: 16800, named: true, cited: true, searched: true, searchCount: 6,
        citedCount: 1, truncated: false, paused: false, sources: s0.sources, preview: s0.answer } };
    }
    return blocked();
  }

  /* ---- site audit (shape: api/site-audit.js) ---- */
  function siteAudit() {
    return {
      ok: true, checkedAt: new Date().toISOString(),
      coverage: [
        { cat: 'Web制作・システム開発', asked: 3, pages: ['/services/web.html'], exists: true, ready: true, missing: [], fit: 86, weakest: null },
        { cat: '動画制作', asked: 3, pages: ['/services/video.html'], exists: true, ready: false, missing: ['金額'], fit: 64, weakest: null },
        { cat: 'AI導入・研修', asked: 3, pages: ['/services/ai.html'], exists: true, ready: true, missing: [], fit: 81, weakest: null },
        { cat: 'SNS・LINE', asked: 3, pages: ['/services/sns.html'], exists: true, ready: false, missing: ['FAQ'], fit: 72, weakest: null },
        { cat: 'クリエイティブ', asked: 3, pages: ['/services/creative.html'], exists: true, ready: false, missing: ['金額', 'FAQ'], fit: 48, weakest: null }
      ],
      questions: [
        { cat: 'クリエイティブ', q: '会社のロゴやバナーのデザインを依頼できる制作会社を教えてください。', head: 38, page: '/services/creative.html', leadMissing: ['金額'] },
        { cat: '動画制作', q: '会社紹介動画の制作費用はいくらくらいかかりますか？', head: 57, page: '/services/video.html', leadMissing: ['金額'] },
        { cat: 'SNS・LINE', q: 'SNS運用代行を依頼できる会社を教えてください。', head: 71, page: '/services/sns.html', leadMissing: [] }
      ],
      site: {
        duplicateTitles: [], duplicateDescs: [], nearDuplicates: [], noProfiles: false,
        orphans: ['/blog/post-9.html'],
        thinLead: [{ url: '/services/creative.html', missing: ['金額'] }],
        slow: [], medianMs: 182
      },
      crawlers: {
        total: 214, ai: 86, search: 128,
        agents: [
          { id: 'Googlebot', kind: 'search', hits: 96, lastAt: ago(3 * 3600000) },
          { id: 'GPTBot', kind: 'ai', hits: 41, lastAt: ago(9 * 3600000) },
          { id: 'ClaudeBot', kind: 'ai', hits: 27, lastAt: ago(DAY + 2 * 3600000) },
          { id: 'bingbot', kind: 'search', hits: 32, lastAt: ago(5 * 3600000) },
          { id: 'OAI-SearchBot', kind: 'ai', hits: 18, lastAt: ago(2 * DAY) }
        ],
        missing: ['PerplexityBot']
      },
      crawlStore: true,
      pages: [
        { url: '/services/creative.html', missing: ['金額', 'FAQ'], chars: 1480 },
        { url: '/services/video.html', missing: ['金額'], chars: 2210 },
        { url: '/services/sns.html', missing: ['FAQ'], chars: 1890 },
        { url: '/blog/post-9.html', missing: ['更新日'], chars: 2650 }
      ],
      total: 34, clean: 30,
      issues: [{ name: '金額', count: 2, share: 2 / 34 }, { name: 'FAQ', count: 2, share: 2 / 34 }, { name: '更新日', count: 1, share: 1 / 34 }],
      // 点検結果。文は api/_audit-rules.js の CHECKS と同じものです。
      findings: [
        auditRow('must', 'links', '/services/movie.html', 'HTTP 404（リンク元: /blog/post-3.html ほか1ページ）',
          'リンク切れ（リンク先のページが無い）', 'リンクを正しいURLに直すか、外します。'),
        auditRow('must', 'faq-visible', '/services/creative.html', '1問: 「修正は何回までできますか？」',
          'FAQの構造化データにある質問・答えが、ページに表示されていない', 'ページに表示している質問と答えだけを構造化データに入れます（Googleのルールです）。'),
        auditRow('should', 'heading-order', '/', 'h1 の次に h3',
          '見出しの階層が飛んでいる', '見出しは h1 → h2 → h3 の順に、1段ずつ下げて使います。文字の大きさは見た目の設定で変えます。'),
        auditRow('should', '金額', '/services/creative.html', '',
          '本文に金額（〇〇円）が書かれていない', '「〇万円〜」のように、幅でよいので本文に書きます（全ページ共通の部分は数えていません）。'),
        auditRow('should', '金額', '/services/video.html', '',
          '本文に金額（〇〇円）が書かれていない', '「〇万円〜」のように、幅でよいので本文に書きます（全ページ共通の部分は数えていません）。'),
        auditRow('should', 'thin-lead', '/services/creative.html', '最初の500字に 金額・期間 が無い',
          'ページの冒頭で、料金や地域などの答えを書いていない', '見出しのすぐ下の2〜3行に、料金の目安・対応地域・期間・連絡方法を書きます。'),
        auditRow('should', 'orphan', '/blog/post-9.html', '',
          'サイト内のどこからもリンクされていないページ', '関係の近いページから1本リンクを張ります。サイトマップにしか無いページは、リンクをたどるAIに見つかりません。'),
        auditRow('should', 'img-alt', '/works.html', '2枚（/works/cafe.jpg、/works/school.jpg）',
          '画像に説明（alt）が無い', '画像が何を表すかを alt に一言で書きます。飾りだけの画像は alt="" にします。')
      ],
      passed: [
        'サイトマップが読める', 'サイトマップのページがすべて開ける', 'サイトマップに「検索に載せない」ページが無い',
        'すべてのページに正規URL（canonical）がある', '正規URL（canonical）がすべてそのページ自身を指している',
        '正規URL（canonical）とサイトマップのURLが一致している', '構造化データ（JSON-LD）がすべて読める',
        '構造化データの必須項目がそろっている', 'タイトルがすべてのページで違う', '本文がほとんど同じページは無い'
      ].map(function (label) { return { check: '', label: label }; }),
      counts: { must: 2, should: 6, ok: 10 },
      linksChecked: 41,
      notes: []
    };
  }
  function auditRow(level, check, page, detail, problem, fix) {
    return { level: level, check: check, page: page, detail: detail, problem: problem, fix: fix };
  }

  function listingCheck(body) {
    var urls = (body && body.urls) || [];
    var states = ['absent', 'listed', 'unreadable'];
    var results = urls.map(function (u, i) {
      var st = states[i % states.length];
      return { url: u, state: st, hasLink: st === 'listed', note: st === 'unreadable' ? '一覧が後から描かれるページ' : '' };
    });
    var n = function (s) { return results.filter(function (r) { return r.state === s; }).length; };
    return { ok: true, checkedAt: new Date().toISOString(), results: results, listed: n('listed'), absent: n('absent'), unreadable: n('unreadable') };
  }

  /* ---- settings (shape: api/settings.js GET + _settings.js settingStatus) ---- */
  var GROUPS = [
    { id: 'site', label: 'サイトの機能', note: '問い合わせ・AI・保存まわり。ここが埋まると管理ポータルの7つが動きます。' },
    { id: 'search', label: '検索エンジンへの登録', note: 'Search Console と Bing Webmaster Tools の所有権確認。' },
    { id: 'booking', label: '商談の自動予約（Googleカレンダー）', note: 'フォーム送信の直後に空き日時を出し、1クリックで Google Meet 付きの予定を入れるための設定。' },
    { id: 'social', label: 'SNS 投稿', note: '管理ポータルから直接投稿するための資格情報。使う SNS の分だけ入れれば足ります。' }
  ];
  // [name, label, kind, group, device, net, sample hint (text kinds) or null = unset]
  var SETTINGS = [
    ['UPSTASH_REDIS_REST_URL', '保存先のURL（Upstash Redis）', 'text', 'site', true, '', 'https://sample-demo.upstash.io', 'KV_REST_API_URL'],
    ['UPSTASH_REDIS_REST_TOKEN', '保存先のトークン（Upstash Redis）', 'secret', 'site', true, '', '', 'KV_REST_API_TOKEN'],
    ['RESEND_API_KEY', '問い合わせ・会員登録メール', 'secret', 'site', false, '', ''],
    ['CONTACT_TO_EMAIL', '問い合わせの宛先', 'text', 'site', false, '', 'info@example.com'],
    ['ANTHROPIC_API_KEY', 'AI（SEO/AIO分析・アドバイザー）', 'secret', 'site', true, '', ''],
    ['GITHUB_TOKEN', 'お知らせ・文章編集の保存', 'secret', 'site', true, '', ''],
    ['MEMBER_CODE', '会員登録コード', 'secret', 'site', false, '', ''],
    ['SESSION_SECRET', 'ログインセッションの署名鍵', 'secret', 'site', false, '', ''],
    ['GOOGLE_SITE_VERIFICATION', 'Google Search Console の確認', 'text', 'search', false, '', 'google-sample-demo.html'],
    ['BING_SITE_VERIFICATION', 'Bing Webmaster Tools の確認', 'text', 'search', false, '', 'DEMO-SAMPLE-0000'],
    ['GOOGLE_CLIENT_ID', 'Google クライアントID', 'text', 'booking', false, '', 'sample-demo.apps.googleusercontent.com'],
    ['GOOGLE_CLIENT_SECRET', 'Google クライアントシークレット', 'secret', 'booking', false, '', ''],
    ['GOOGLE_REFRESH_TOKEN', 'Google 接続トークン', 'secret', 'booking', false, '', ''],
    ['GOOGLE_CALENDAR_ICS_URL', 'カレンダーの非公開URL（簡易接続）', 'secret', 'booking', false, '', null],
    ['GOOGLE_CALENDAR_ID', '使うカレンダー', 'text', 'booking', false, '', 'primary'],
    ['X_API_KEY', 'X ① API Key', 'secret', 'social', true, 'x', ''],
    ['X_API_SECRET', 'X ② API Key Secret', 'secret', 'social', true, 'x', ''],
    ['X_ACCESS_TOKEN', 'X ③ Access Token', 'secret', 'social', true, 'x', ''],
    ['X_ACCESS_SECRET', 'X ④ Access Token Secret', 'secret', 'social', true, 'x', ''],
    ['FB_PAGE_ID', 'Facebook ページID', 'text', 'social', true, 'facebook', '000000000000000'],
    ['FB_PAGE_TOKEN', 'Facebook ページアクセストークン', 'secret', 'social', true, 'facebook', ''],
    ['IG_USER_ID', 'Instagram ビジネスアカウントID', 'text', 'social', true, 'instagram', '17840000000000000'],
    ['IG_TOKEN', 'Instagram アクセストークン', 'secret', 'social', true, 'instagram', ''],
    ['THREADS_USER_ID', 'Threads ユーザーID', 'text', 'social', true, 'threads', '0000000000'],
    ['THREADS_TOKEN', 'Threads アクセストークン', 'secret', 'social', true, 'threads', ''],
    ['LI_AUTHOR_URN', 'LinkedIn 投稿者URN', 'text', 'social', true, 'linkedin', null],
    ['LI_TOKEN', 'LinkedIn アクセストークン', 'secret', 'social', true, 'linkedin', null],
    ['LINE_CHANNEL_TOKEN', 'LINE チャネルアクセストークン（長期）', 'secret', 'social', true, 'line', ''],
    ['BLOB_READ_WRITE_TOKEN', '画像の置き場所（Vercel Blob）', 'secret', 'social', true, '', '', 'BLOB_READ_WRITE_TOKEN']
  ];
  function settings() {
    return {
      ok: true, ready: true, device: true, groups: GROUPS, message: '',
      settings: SETTINGS.map(function (s) {
        var set = s[6] !== null;
        var env = set && !s[4];
        return {
          name: s[0], label: s[1], kind: s[2], group: s[3], net: s[5], device: s[4],
          where: 'Vercel の環境変数、またはこの画面から入力（デモ表示）',
          why: s[1] + ' に使います（デモ表示のため、値はすべてサンプルです）。',
          set: set, from: !set ? null : env || s[7] ? 'env' : 'saved',
          inStore: set && !env && !s[7], onDevice: false, inEnv: set && (env || !!s[7]),
          envName: s[7] || (env ? s[0] : null),
          hint: !set ? '' : s[2] === 'text' ? s[6] : '••••demo'
        };
      })
    };
  }

  /* ---- booking (shape: api/booking.js ?recent=1, records from _booking.js) ---- */
  function bookingRecent() {
    var out = [];
    var people = [[PEOPLE[0], 0], [PEOPLE[4], 4], [PEOPLE[9], 9], [PEOPLE[13], 13]];
    var d = new Date(Date.now() + JST), added = 0, k = 0;
    var hours = [14, 11, 16, 10];
    while (out.length < people.length && k < 30) {
      k++;
      d = new Date(d.getTime() + DAY);
      var w = d.getUTCDay();
      if (w === 0 || w === 6) continue;
      if (added++ % 2) continue;      // every other weekday, so the list reads like real traffic
      var p = people[out.length];
      var h = hours[out.length];
      var startJst = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, 0);
      var start = startJst - JST;
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      var when = (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日(' + WD[w] + ') ' + pad(h) + ':00〜' + pad(h + 1) + ':00';
      out.push({
        id: 'demo-b' + out.length, key: new Date(start).toISOString(), when: when,
        name: p[0][0], email: ROMA[p[1]] + '@' + DOMAINS[p[1] % 3], company: p[0][1],
        topics: ['ホームページ制作'], note: '（サンプルの予約です）', page: '/contact.html',
        mode: out.length < 2 ? 'google' : 'local', meet: '', eventId: '', addUrl: '',
        at: ago((out.length + 1) * 9 * 3600000)
      });
    }
    return { ok: true, connected: true, ics: false, stored: true, storedHere: true, calendarId: 'primary', bookings: out };
  }

  /* ---- social (shape: api/social.js GET; networks from _social.js) ---- */
  // [id, label, limit, image, maxImages, note, needs, ready, scheduled]
  var NETS = [
    ['x', 'X', 280, 'optional', 4, 'Xでは日本語は1文字=2として数えます。画像は、この画面からアップロードしたものを4枚まで付けられます。', ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'], true],
    ['facebook', 'Facebook', 5000, 'optional', 1, 'ページへの投稿です。個人のタイムラインへはAPIから投稿できません。画像は1枚目だけ送ります。', ['FB_PAGE_ID', 'FB_PAGE_TOKEN'], true],
    ['instagram', 'Instagram', 2200, 'required', 1, '画像が必須です（JPEG・縦横比 4:5〜1.91:1・8MB以下）。本文のリンクは押せません。1日100件まで。', ['IG_USER_ID', 'IG_TOKEN'], true],
    ['threads', 'Threads', 500, 'optional', 1, '500文字まで。作成と公開の2段階で送ります。鍵は60日で切れるので「トークンを延長」で延ばします。', ['THREADS_USER_ID', 'THREADS_TOKEN'], true],
    ['linkedin', 'LinkedIn', 3000, 'none', 0, '本文とリンクだけ送ります（画像はアセット登録が別に要るため送りません）。本文が必要です。', ['LI_AUTHOR_URN', 'LI_TOKEN'], false],
    ['line', 'LINE公式アカウント', 5000, 'optional', 1, '友だち全員に一斉送信します。届いた人数ぶん「通数」を使います（無料プランは月200通）。', ['LINE_CHANNEL_TOKEN'], true],
    ['gbp', 'Googleビジネスプロフィール', 1500, 'optional', 1, 'Google検索・マップのお店の情報に「最新情報」として出ます。1500文字まで。リンクはボタン（詳細・予約など）として付きます。画像は1枚目だけ送ります。',
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GBP_REFRESH_TOKEN', 'GBP_LOCATION'], false, ['GBP_LOCATION']],
    ['bluesky', 'Bluesky', 300, 'optional', 4, '300文字まで（見た目の文字数で数えます）。リンクとハッシュタグは押せる形で送ります。画像は、この画面からアップロードしたものを4枚まで（1枚1MBまで）。', ['BSKY_HANDLE', 'BSKY_APP_PASSWORD'], true]
  ];
  var DEMO_HOST = 'example.com';
  function socialRecent() {
    var res = function (net, label, ok, metrics, unknown) {
      return { net: net, label: label, ok: ok, unknown: !!unknown, id: ok ? 'demo-' + net : '', url: '',
        message: ok ? '' : unknown ? 'デモ表示：結果が分からなかった例です。' : 'デモ表示：サンプルの失敗例です。', metrics: metrics || undefined };
    };
    return [
      { id: 'demo-p1', at: ago(2 * DAY + 4 * 3600000), text: '（サンプル投稿）飲食店さまのホームページを公開しました。予約ボタンをいちばん上に置いています。', link: 'https://' + DEMO_HOST + '/works', campaign: 'works-autumn', images: [],
        results: [
          res('x', 'X', true, { ok: true, likes: 12, comments: 2, shares: 3, impressions: 840, at: ago(DAY) }),
          res('threads', 'Threads', true, { ok: true, likes: 9, comments: 1, shares: 0, impressions: 310, at: ago(DAY) }),
          res('facebook', 'Facebook', true),
          res('line', 'LINE公式アカウント', true, { ok: true, reach: 186, impressions: 121, clicks: 34, at: ago(DAY) })
        ] },
      { id: 'demo-p2', at: ago(6 * DAY + 2 * 3600000), scheduledFor: jstDate(6), text: '（サンプル投稿）社内向け生成AI研修、今月は2社で実施しました。', link: 'https://' + DEMO_HOST + '/works', campaign: 'works-autumn', images: [],
        results: [res('x', 'X', true), res('threads', 'Threads', true), res('instagram', 'Instagram', false, null, true)] },
      { id: 'demo-p3', at: ago(17 * DAY), text: '（サンプル投稿）ブログを更新しました。「ホームページの直し方、どこから？」', link: 'https://' + DEMO_HOST + '/blog', images: [],
        results: [res('x', 'X', true), res('facebook', 'Facebook', false)] }
    ];
  }
  function socialQueue() {
    return [
      { id: 'demo-q1', date: jstDate(-2), createdAt: ago(3600000), text: '（サンプルの予約）今週末は臨時休業です。ご不便をおかけします。', targets: ['x', 'line'], images: 0, link: '' },
      { id: 'demo-q2', date: jstDate(-6), createdAt: ago(7200000), text: '（サンプルの予約）秋の限定メニュー、はじめます。', targets: ['instagram', 'threads', 'facebook'], images: 1, link: 'https://' + DEMO_HOST + '/menu' }
    ];
  }
  function social() {
    return {
      ok: true, stored: true,
      brand: { name: (window.lumSite && window.lumSite.name) || 'Sample', host: DEMO_HOST, url: 'https://' + DEMO_HOST },
      networks: NETS.map(function (n) {
        return { id: n[0], label: n[1], mark: '', limit: n[2], image: n[3], maxImages: n[4], weighted: n[0] === 'x',
          needText: n[0] === 'x' || n[0] === 'linkedin' || n[0] === 'gbp', note: n[5], needs: n[6],
          setup: { what: n[1] + ' の資格情報が要ります（デモ表示）。', where: '各SNSの開発者画面で取得します。', url: '', effort: '' },
          ready: n[7], scheduled: n[7], missing: n[7] ? [] : (n[8] || n[6]) };
      }),
      recent: socialRecent(),
      activity: socialActivity(),
      schedule: { ready: true, message: '', code: '', jstHour: 9, items: socialQueue() },
      upload: { ready: true },
      threadsToken: { from: 'saved', canRefresh: true, expiresAt: ago(-41 * DAY), estimated: true, daysLeft: 41 },
      style: socialStyle(),
      prefs: { xAutoMetrics: false },
      templates: [
        { id: 'demo-tpl-1', title: '定休日のお知らせ', text: '（定型文の例）〇月〇日（〇）は定休日です。ご不便をおかけしますが、よろしくお願いいたします。', nets: ['x', 'line', 'gbp'], campaign: '', link: '' },
        { id: 'demo-tpl-2', title: '新メニューのお知らせ', text: '（定型文の例）新メニュー「〇〇」を始めました。〇月〇日までの期間限定です。', nets: ['instagram', 'threads', 'facebook'], campaign: 'new-menu', link: 'https://' + DEMO_HOST + '/menu' }
      ]
    };
  }
  /* このサイトの決まり（shape: _social-text.js validateStyle）。 */
  function socialStyle() {
    return {
      ng: [{ word: '激安', alt: 'お求めやすい', why: '安っぽく見えるため' }, { word: '業界最安', alt: '', why: '' }],
      notation: [
        { from: 'お客様', to: 'お客さま', except: ['お客様各位'] },
        { from: 'ホームページ', to: 'ウェブサイト', except: ['ホームページ制作'] }
      ]
    };
  }

  /* 投稿ごとの成果（shape: _social-insights.js socialInsights）。 */
  function socialInsights() {
    var g = function (visits, inq, open, shared) {
      return { field: '', from: '', to: '', open: !!open, visits: visits, contact: inq, booking: 0, inquiries: inq, shared: shared || [] };
    };
    var p1 = { id: 'demo-p1', at: ago(2 * DAY + 4 * 3600000) };
    var p2 = { id: 'demo-p2', at: ago(6 * DAY + 2 * 3600000) };
    return {
      ok: true, window: 7, today: jstDate(0), stored: true,
      results: {
        'demo-p1': { x: g(14, 1, true, [p2]), threads: g(5, 0, true, [p2]), facebook: g(3, 0, true), line: g(22, 2, true) },
        'demo-p2': { x: g(17, 1, true, [p1]), threads: g(6, 0, true, [p1]) },
        'demo-p3': { x: g(6, 0, false) }
      },
      summary: {
        d30: { x: { posts: 3, tagged: 3, visits: 21, contact: 1, booking: 0, inquiries: 1 }, threads: { posts: 2, tagged: 2, visits: 7, contact: 0, booking: 0, inquiries: 0 },
          facebook: { posts: 1, tagged: 1, visits: 3, contact: 0, booking: 0, inquiries: 0 }, line: { posts: 1, tagged: 1, visits: 22, contact: 1, booking: 1, inquiries: 2 } },
        d90: { x: { posts: 9, tagged: 7, visits: 58, contact: 2, booking: 1, inquiries: 3 }, threads: { posts: 5, tagged: 4, visits: 19, contact: 0, booking: 0, inquiries: 0 },
          facebook: { posts: 4, tagged: 3, visits: 11, contact: 1, booking: 0, inquiries: 1 }, instagram: { posts: 6, tagged: 0, visits: 0, contact: 0, booking: 0, inquiries: 0 },
          line: { posts: 3, tagged: 3, visits: 61, contact: 2, booking: 2, inquiries: 4 } }
      },
      recommend: socialRecommend()
    };
  }
  /* いつ出すと良いか（shape: _social-insights.js recommend）。 */
  function socialRecommend() {
    var gen = function (hours, wds, text, posts, visits) {
      return { basis: 'general', n: 0, hours: hours, weekdays: wds, text: text,
        missing: ['反応を取得した投稿が ' + posts + ' 件です（10 件で、反応から出せます）', '計測リンクから来た訪問が直近90日で ' + visits + ' 件です（30 件で、サイトの数字から出せます）'] };
    };
    return {
      x: { basis: 'posts', n: 14, hours: [[18, 21]], weekdays: [2, 4], text: '火・木曜の 18〜21時に出した投稿の反応がいちばん大きい（この画面から出した 14 件の いいね・コメント・共有 の平均）', missing: [] },
      line: { basis: 'site', n: 61, hours: [[12, 15]], weekdays: [5], text: 'line の計測リンクから来る人は 金曜の 12〜15時に多い（直近90日の訪問 61 件）。少し前に出すと見てもらいやすくなります', missing: ['反応を取得した投稿が 3 件です（10 件で、反応から出せます）'] },
      facebook: gen([[9, 12]], [1, 2, 3, 4, 5], '平日の午前中（9〜12時）', 2, 11),
      instagram: gen([[12, 13], [19, 22]], [5, 6, 0], 'お昼（12時台）と夜（19〜22時）、金〜日', 0, 0),
      threads: gen([[20, 23]], [1, 2, 3, 4, 5], '夜（20〜23時）', 4, 19),
      linkedin: gen([[8, 10]], [2, 3, 4], '平日の朝（8〜10時）、火〜木', 0, 0),
      gbp: gen([[9, 12]], [3, 4], '週末やイベントの2〜3日前（水・木）', 0, 8),
      bluesky: gen([[20, 23]], [1, 2, 3, 4, 5], '夜（20〜23時）', 0, 0)
    };
  }

  function socialQuotas() {
    return { ok: true, quotas: {
      line: { ok: true, unlimited: false, limit: 200, used: 14, remaining: 186, followers: 192, reach: 186, date: jstDate(1), note: '' },
      instagram: { ok: true, used: 1, total: 100, remaining: 99 },
      threads: { ok: true, used: 2, total: 250, remaining: 248 }
    } };
  }
  /* Read-like actions answer as the real thing would; anything that changes
     an account (posting, booking, cancelling, extending a token) is refused. */
  function socialPost(body) {
    var a = (body && body.action) || 'post';
    if (a === 'test') {
      return { ok: true, net: body.net, state: 'ok', message: 'つながりました（デモ表示：実際には確認していません）。' };
    }
    if (a === 'gbp-locations') {
      return { ok: true, locations: [
        { name: 'accounts/100/locations/200', title: 'サンプル珈琲 本店', address: '東京都 渋谷区 神南1-2-3', account: 'サンプル' },
        { name: 'accounts/100/locations/201', title: 'サンプル珈琲 駅前店', address: '東京都 渋谷区 道玄坂4-5-6', account: 'サンプル' }
      ] };
    }
    if (a === 'metrics') {

      return { ok: true, metrics: { x: { ok: true, likes: 12, comments: 2, shares: 3, impressions: 840 } }, recent: socialRecent() };
    }
    notice(MSG);
    if (a === 'cancel') return blocked({ items: socialQueue() });
    if (a === 'schedule') return blocked({ items: socialQueue() });
    return blocked({ results: [], recent: socialRecent(), posted: 0, total: 0 });
  }
  /* ---- AI draft (shape: api/social-write.js) ---- */
  function socialWrite(body) {
    var nets = (body && body.nets) || [];
    var T = window.lumSocialText;
    var base = {
      x: '（デモ用の下書き）秋の限定メニューを始めました。栗のモンブランをご用意しています。\n\n#秋限定 #モンブラン',
      facebook: '（デモ用の下書き）いつもありがとうございます。今月から秋の限定メニューを始めました。\n栗をたっぷり使ったモンブランです。数に限りがありますので、気になる方はお早めにどうぞ。',
      instagram: '（デモ用の下書き）\n秋の限定メニュー、はじまりました。\n栗の香りいっぱいのモンブランです。\n\n詳しくはプロフィールのリンクから\n\n#秋限定 #モンブラン #カフェ',
      threads: '（デモ用の下書き）秋のモンブラン、今年もはじめました。栗、好きな人いますか？\n\n#秋限定',
      linkedin: '（デモ用の下書き）秋の限定メニューの提供を開始しました。地元の農家さんの栗を使っています。',
      line: '（デモ用の下書き）こんにちは！\n秋の限定メニュー「栗のモンブラン」がはじまりました🌰\nご来店をお待ちしています。',
      gbp: '（デモ用の下書き）秋の限定メニュー「栗のモンブラン」の提供を始めました。地元の農家さんの栗を使っています。10月31日までの期間限定です。',
      bluesky: '（デモ用の下書き）秋のモンブラン、今年もはじめました🌰 #秋限定'
    };
    var drafts = {};
    nets.forEach(function (n) {
      if (!base[n]) return;
      var t = base[n];
      var sent = body.link ? t + '\nhttps://' + DEMO_HOST + '/' : t;
      var c = T ? T.lengthFor(n, sent) : sent.length;
      var lim = T && T.RULES[n] ? T.RULES[n].limit : 5000;
      drafts[n] = { text: t, count: c, limit: lim, over: c > lim };
    });
    return { ok: true, drafts: drafts, noLink: body && body.link && drafts.instagram ? ['instagram'] : [],
      message: '下書きを作りました（デモ表示：AIは呼んでいません）。各SNSのタブで読んで、直してから送ってください。' };
  }

  /* ---- rewrite (shape: api/rewrite.js) ---- */
  var WAYS = {
    short: ['短く', 'ホームページ制作から公開後の運用まで、1社でまとめてお受けします。'],
    plain: ['やさしく', 'ホームページを作るところから、作ったあとの手入れまで、まとめてお手伝いします。'],
    concrete: ['具体的に', 'ホームページ制作（30万円〜・約6週間）から公開後の更新まで、1社でお受けします。'],
    polish: ['整える', 'ホームページの制作から公開後の運用まで、一貫してお任せいただけます。']
  };
  function rewrite(body) {
    var w = WAYS[body && body.way] ? body.way : 'polish';
    return { ok: true, text: WAYS[w][1] + '（デモ用の書き直し例）', way: w, label: WAYS[w][0] };
  }

  /* ---- advisor: the same SSE framing as api/advisor.js —
     `data: {"t": "..."}` blocks separated by a blank line, and a closing
     NEXT:: line the panel turns into buttons. ---- */
  var ADVICE = [
    [/今週|順番|3つ/, '（デモ用の回答例です）\n\n今週やることを、効く順に3つ挙げます。\n\n1. 料金の幅をサービスページの冒頭に書く\n「動画制作」と「クリエイティブ」のページに金額がなく、AIの回答で他社だけが挙がっています。幅でよいので、最初の3行に入れてください。\n\n2. 第三者の事業者ディレクトリに1件載せる\n「実在が確認できない」と答えられた質問があります。社名・所在地・URLを同じ表記で載せるのが最短です。\n\n3. 問い合わせ画面の離脱を見る\n問い合わせ画面まで来た人のうち、入力を始めたのは約半分です。項目を減らす余地があります。'],
    [/お知らせ|文案|SNS|メール|一段落/, '（デモ用の回答例です）\n\nそのまま使える文案です。\n\n「ホームページの制作から、公開後の更新・SNS運用まで、1社でまとめてお受けしています。まずは30分の無料相談で、いまのサイトの困りごとをお聞かせください。」\n\n短くしたい場合は、2文目だけでも使えます。'],
    [/./, '（デモ用の回答例です）\n\nいちばんの問題は、問い合わせ画面まで来た人の半分が入力を始めずに離れていることです。\n\nアクセス解析では、サービスを見た人の約4人に1人が問い合わせ画面に進んでいます。ここまでは順調です。ただ、入力を始めた人はその半分ほどです。\n\nまず、必須項目を「お名前・メール・ご相談内容」の3つに絞ってみてください。次に、送信ボタンの近くに「返信は1営業日以内」と書くと、送る前の不安が減ります。']
  ];
  var NEXT = '\nNEXT::今週やることを3つ、順番に||お金をかけずにできることは？||どのページから直すべき？';

  function advisor(body, signal) {
    var msgs = (body && body.messages) || [];
    var last = msgs.length ? String(msgs[msgs.length - 1].content || '') : '';
    var text = ADVICE[ADVICE.length - 1][1];
    for (var i = 0; i < ADVICE.length; i++) if (ADVICE[i][0].test(last)) { text = ADVICE[i][1]; break; }
    text += NEXT;
    var enc = new TextEncoder();
    var pos = 0, timer = 0;
    var stream = new ReadableStream({
      start: function (ctl) {
        var stop = function () { clearTimeout(timer); try { ctl.error(new DOMException('Aborted', 'AbortError')); } catch (_) {} };
        if (signal) {
          if (signal.aborted) { stop(); return; }
          signal.addEventListener('abort', stop);
        }
        (function tick() {
          if (pos >= text.length) { ctl.close(); return; }
          var piece = text.slice(pos, pos + 8);
          pos += 8;
          ctl.enqueue(enc.encode('data: ' + JSON.stringify({ t: piece }) + '\n\n'));
          timer = setTimeout(tick, 28);
        })();
      }
    });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
  }


  /* ---- SNS（動画） (shape: api/video.js, api/video-publish.js) ----
     架空のパン屋の、架空の数字です。実在の店・アカウント・投稿とは関係
     ありません。保存・AI・投稿はすべて「デモ版のため…」で止まります。
     出荷前チェックと無音カットは、選んだファイルをこのブラウザの中だけで
     調べるので、デモでもそのまま動きます。 */
  var VIDEO_RULES = null;
  function videoReady() {
    return { ai: true, blob: true, instagram: true, youtubeClient: true, youtube: true, tiktokClient: true, tiktok: false, schedule: { ok: true } };
  }
  var VIDEO_PROJECT = {
    id: 'demo-video', name: 'ことり製パン（架空）', description: '町のパン屋のリール運用（デモ用の架空データ）',
    brand: {
      persona: '店主。パンを焼いて15年', tone: 'やわらかく、言い切りすぎない',
      banned_words: ['日本一', '絶対においしい'], notation: { '焼立て': '焼きたて', 'ばけっと': 'バゲット' },
      notation_exceptions: ['焼立て窯'], style: 'warm natural light, 35mm photo, shallow depth of field'
    },
    research: [{ keyword: 'パン屋 朝', platform: 'instagram', at: '' }], created_at: ago(30 * DAY),
    reinvest: { budget: '材料費を2,000円ふやして、2種類のバゲットで対決', time: '撮影を30分長くして、手元の寄りを多めに', format: 'スタッフ対決をお客様投票つきで', note: '問いかけの冒頭は3秒維持率が高かった。次は対決の型で山場を2つ作る。' }
  };
  function videoPosts() {
    var raw = [
      ['朝4時の仕込み、全部見せます', 18, 42000, 2100, 60, 140, 1.2],
      ['このパン、なんで穴があくの？', 24, 28000, 1900, 85, 210, 2.5],
      ['売り切れる理由を3つ', 31, 15000, 620, 30, 44, 4],
      ['新人が初めて焼いたバゲット', 45, 9800, 510, 41, 12, 6],
      ['閉店後のまかないパン', 22, 7600, 300, 12, 9, 9],
      ['粉の違いで味はこう変わる', 58, 5200, 260, 22, 31, 11],
      ['パン屋の1日を60秒で', 60, 4100, 120, 8, 6, 14],
      ['いちばん人気はこれでした', 15, 3900, 240, 15, 20, 20],
      ['先輩と後輩でクロワッサン早作り対決', 42, 36000, 2600, 190, 260, 3],
      ['姉妹店とあんパン対決、勝ったのは？', 38, 21000, 1500, 120, 150, 8],
      ['焦げたパンが30秒でこうなる', 20, 12000, 700, 30, 60, 10],
      ['人気パンTOP3を発表', 34, 8800, 420, 26, 30, 12],
      ['10分だけでサンドイッチを何個作れる？', 27, 15500, 900, 70, 85, 5],
      ['次の新作、コメントで投票してください', 19, 6100, 380, 140, 12, 16]
    ];
    var hooks = ['statement', 'question', 'number', 'story', 'statement', 'other', 'story', 'statement', 'callout', 'question', 'result', 'number', 'question', 'callout'];
    var formats = ['behind', 'test', 'ranking', 'behind', 'behind', 'test', 'behind', 'ranking', 'contest', 'contest', 'before_after', 'ranking', 'challenge', 'vote'];
    return raw.map(function (r, i) {
      var p = { id: 'demo-post-' + i, platform: 'instagram', url: '', title: r[0], caption: r[0] + '\n#パン屋 #朝ごはん', author: '架空のパン屋' + (i % 3 + 1),
        published_at: ago(r[6] * DAY), duration_sec: r[1], views: r[2], likes: r[3], comments: r[4], shares: r[5], source: 'demo', analysis: null,
        format: formats[i], format_source: i % 3 === 0 ? 'manual' : 'ai' };
      if (i < 4) p.analysis = {
        hook_text: r[0], hook_type: hooks[i],
        beats: [{ label: 'hook', start: 0, end: 3, purpose: '手を止めさせる（何が見られるかを一言で）' }, { label: 'context', start: 3, end: 7, purpose: '誰向けかを示す' },
          { label: 'body', start: 7, end: r[1] - 3, purpose: '工程を順に見せる' }, { label: 'cta', start: r[1] - 3, end: r[1], purpose: '保存をうながす' }],
        caption: { line_count: 1, avg_chars: r[0].length, max_chars: r[0].length, chars_per_sec: Math.round(r[0].length / r[1] * 100) / 100 },
        hashtags: ['パン屋', '朝ごはん'], takeaways: ['冒頭で結論を見せる', '工程を短く区切る'], onscreen_note: '画面内テロップは動画ファイルが無いので未測定'
      };
      return p;
    });
  }
  function videoScript() {
    // ショート。冒頭3秒に約束の「カンパーニュ」が無い・長いカットがある、を見せる例です。
    var lines = [
      [0, 3, 'この穴、どうやってできると思います？', 'この穴、どうやってできる？', 'Close-up of a sliced country loaf showing open crumb', ''],
      [3, 8, '答えは、生地に入れる水の量なんです。', '答えは「水の量」', 'Baker pouring water into a large mixing bowl', 'switch_question'],
      [8, 14, 'うちでは粉の重さの8割の水を入れます。', '粉の8割が水', 'Hands folding a wet, glossy dough on a wooden table', 'switch_visual'],
      [14, 18, '扱いにくい生地ですが、そのぶん軽く焼けます。', 'だから軽い', 'Loaf coming out of a stone oven, steam rising', 'peak_reveal'],
      [18, 21, '気になったら保存して、朝に見返してね。', '保存して朝に見返してね', 'Warm bakery counter at sunrise with bread on display', ''],
      [21, 24, 'で、この穴の答えは…', 'この穴の答えは…', 'Close-up of the crumb again, slow push-in', '']
    ].map(function (l) { return { start: l[0], end: l[1], narration: l[2], telop: l[3], visual: l[4], mark: l[5] }; });
    var sc = {
      id: 'demo-script', title: 'カンパーニュの穴のひみつ', platform: 'instagram', length_mode: 'short', target_duration_sec: 24, hook: lines[0].narration, body: '水の量で食感が変わる', cta: '保存して朝に見返してね',
      thumb_text: '穴のひみつは水', promise: 'カンパーニュの大きな穴ができる理由が分かる', promise_keywords: [], wow: '15年使っている石窯から出す瞬間と、粉の8割の水',
      format: 'behind', loop: true, end_screen: '',
      hook_type: 'question', lines: lines, hashtags: ['パン屋', 'カンパーニュ', '朝ごはん'], style: VIDEO_PROJECT.brand.style,
      rationale: '競合の上位は「問いかけ→答え→工程」の順で、24秒前後に集まっています。答えを早めに出し、工程を2つに絞りました。最後の行は1行目の問いに戻るループにしています。',
      originality: { clean: true, attempts: 1, findings: [] }, created_at: ago(2 * DAY)
    };
    sc.shots = window.lumVideoCore ? window.lumVideoCore.shotsFromLines(lines, sc.style) : [];
    return sc;
  }
  function videoLongScript() {
    // 長尺（YouTube 6分）。山場を約3分ごとに置き、0〜1／1〜3／3〜6分の構成を見せる例です。
    var L = [
      [0, 8, '店長と新人、クロワッサンを先に10個焼けるのはどっち？', '店長vs新人 クロワッサン対決', 'Two bakers facing each other across a flour-dusted table', '', ''],
      [8, 45, 'ルールは1つ。生地は同じ、時間は30分。負けたほうが明日の朝の掃除です。', 'ルール: 同じ生地・30分', 'Wide shot of the bakery kitchen, two work stations', 'switch_visual', ''],
      [45, 60, '最後に、お客様10人の食べ比べで勝ち負けを発表します。', '最後に食べ比べで発表', 'Customers waiting at the counter with tasting plates', 'switch_question', ''],
      [60, 150, 'まずは生地を伸ばすところから。店長の手元を見てください。', '店長の手元', 'Overhead shot of hands rolling butter dough', 'switch_visual', ''],
      [150, 170, 'ここでルール変更。残り10分で、形をハートにしてもらいます。', 'ルール変更: ハート形', 'Surprised faces of both bakers', 'peak_rule', ''],
      [170, 300, '新人が焦り始めました。オーブンの温度が上がりません。', 'トラブル発生', 'Oven thermometer close-up, baker checking the dial', 'peak_trouble', ''],
      [300, 340, '焼き上がり。見た目はどちらもきれいです。', '焼き上がり', 'Golden croissants cooling on two racks', 'switch_visual', ''],
      [340, 360, '食べ比べの結果、勝ったのは…新人でした。次の動画はリベンジ戦。チャンネル登録して待っていてください。', '勝者は新人！', 'Customers raising cards with votes', 'peak_reveal', '']
    ].map(function (l) { return { start: l[0], end: l[1], narration: l[2], telop: l[3], visual: l[4], mark: l[5] }; });
    var sc = {
      id: 'demo-script-long', title: '店長vs新人 クロワッサン10個対決', platform: 'youtube', length_mode: 'long', target_duration_sec: 360, hook: L[0].narration, body: '', cta: '次の動画でリベンジ戦',
      thumb_text: '店長vs新人', promise: '店長と新人のクロワッサン対決で、どちらが勝つかが分かる', promise_keywords: ['店長', '新人', 'クロワッサン'], wow: '朝4時の仕込み場で、本物の生地を使った対決',
      format: 'contest', loop: false, end_screen: '次に見てほしい「リベンジ戦」の動画とチャンネル登録',
      hook_type: 'question', lines: L, hashtags: ['パン屋', 'クロワッサン'], style: VIDEO_PROJECT.brand.style,
      rationale: '0〜10秒で対決を見せ、60秒までに「最後に食べ比べで発表」と言っています。約3分ごとにルール変更とトラブルを置きました。',
      originality: { clean: true, attempts: 1, findings: [] }, created_at: ago(1 * DAY)
    };
    sc.shots = window.lumVideoCore ? window.lumVideoCore.shotsFromLines(L, sc.style) : [];
    return sc;
  }
  function videoPubs() {
    var specs = [
      ['instagram', 'published', 'question', 24, 9, 9, 18200, 1240, 380, 9.8, 0.52],
      ['instagram', 'published', 'statement', 18, 7, 7, 11000, 610, 150, 7.1, 0.46],
      ['instagram', 'published', 'question', 22, 5, 7, 15400, 990, 300, 8.9, 0.55],
      ['youtube', 'published', 'story', 40, 4, 12, 3200, 140, null, null, null],
      ['instagram', 'processing', 'number', 30, 0, 0, null],
      ['tiktok', 'inbox', 'statement', 20, 1, 0, null]
    ];
    return specs.map(function (x, i) {
      var u = { id: 'demo-pub-' + i, platform: x[0], status: x[1], script_id: i === 0 ? 'demo-script' : '', title: ['カンパーニュの穴のひみつ', '朝4時の仕込み', '粉で味はどう変わる？', 'パン屋の1日', '人気ランキング', '新作の試作'][i],
        caption: '架空のデモ投稿です。', hashtags: ['パン屋'], hook_type: x[2], duration_sec: x[3], published_at: x[4] ? new Date(Date.now() - x[4] * DAY + (x[5] - new Date().getHours()) * 3600000).toISOString() : '',
        external_id: x[6] != null ? 'demo' + i : '', external_url: '', error: '', snapshots: [] };
      if (x[6] != null) u.snapshots.push({ captured_at: ago(DAY / 2), views: x[6], likes: x[7], comments: Math.round(x[7] / 30), shares: Math.round(x[7] / 20), saves: x[8], avg_watch_sec: x[9], retention_rate: x[10], reach: Math.round(x[6] * 0.8), source: 'demo' });
      // 1本目（台本つき）は、分析画面から手で入れた3秒維持率と維持率の曲線がある例。
      if (i === 0) {
        u.snapshots[0].hold_3s = 0.71;
        u.snapshots[0].retention_curve = [[0, 100], [1, 88], [2, 78], [3, 71], [4, 69], [5, 68], [6, 67], [7, 66], [8, 65], [9, 58], [10, 53], [12, 51], [14, 49], [16, 47], [18, 45], [20, 44], [22, 43], [24, 42]]
          .map(function (p) { return { t: p[0], r: p[1] / 100 }; });
      }
      if (i === 2) u.snapshots[0].hold_3s = 0.79;
      return u;
    });
  }
  function videoList() {
    return { ok: true, stored: true, projects: [VIDEO_PROJECT], accounts: [], ready: videoReady(), rules: window.lumVideoCore ? window.lumVideoCore.RULES : VIDEO_RULES };
  }
  function videoProject() {
    var C = window.lumVideoCore;
    var posts = videoPosts();
    var scored = C ? C.scorePosts(posts) : posts;
    return {
      ok: true, stored: true, project: VIDEO_PROJECT, ready: videoReady(), rules: C ? C.RULES : null, caps: { posts: 300, scripts: 100, pubs: 300, pdca: 50 },
      posts: scored, band: C ? C.durationBand(scored) : { ok: false, message: '' },
      scripts: [videoScript(), videoLongScript()], pubs: videoPubs(),
      pdca: [{ id: 'demo-pdca', title: '冒頭を問いかけにする', stage: 'check', hypothesis: '問いかけで始めると、最後まで見る人が増えるはず', target: { metric: 'retention_rate', target: 0.05, baseline: 0.46 },
        publication_ids: ['demo-pub-0', 'demo-pub-2'], learnings: '', next_actions: ['問いかけの投稿をあと2本出して比べる'], created_at: ago(10 * DAY) }]
    };
  }
  function videoPublishInfo() {
    return { ok: true, ready: videoReady(), queue: [], caps: { instagram: { ok: true, cap: 25, used: 1 }, tiktok: { ok: true, cap: 25, used: 1 } }, cron: { at: ago(DAY / 3), started: 1, published: 1, failed: 0, waiting: 0 }, jstHour: 9 };
  }

  /* ---- router ---- */
  function reply(body, status) {
    return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  }
  function blocked(extra) {
    var b = { ok: false, demo: true, message: MSG };
    if (extra) for (var k in extra) b[k] = extra[k];
    return b;
  }
  function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  var realFetch = window.fetch ? window.fetch.bind(window) : null;

  function route(u, method, body, signal) {
    var p = u.pathname.replace(/\/+$/, '');
    var q = u.searchParams;
    var read = method === 'GET' || method === 'HEAD';

    if (p === '/api/advisor') return method === 'POST' ? advisor(body, signal) : reply(blocked());

    // Read-like POSTs: they change nothing on the server, and an answer makes
    // the demo look like the real thing.
    if (method === 'POST') {
      if (p === '/api/aio') return reply(aioPost(body));
      if (p === '/api/listing-check') return reply(listingCheck(body));
      if (p === '/api/rewrite') return reply(rewrite(body));
      // The SNS panel redraws its history from the reply; without `recent`
      // a refused post would blank the sample log.
      if (p === '/api/social') return reply(socialPost(body));
      if (p === '/api/social-write') return reply(socialWrite(body));
    }
    if (!read) {
      notice(MSG);
      return reply(blocked());
    }

    switch (p) {
      case '/api/members-list': return reply(members());
      case '/api/health': return reply(health());
      case '/api/news-post': return reply({ ok: true, items: newsItems(), commit: commit(3, 'お知らせを更新') });
      case '/api/share-links': return reply(shares());
      case '/api/content-save':
        // The published copy as the saved copy, so the panel reads 「反映済み」.
        // content.json is a public static file; nothing private is in it.
        return (realFetch ? realFetch('/content.json', { cache: 'no-store' }) : Promise.reject())
          .then(function (r) { return r.ok ? r.json() : {}; })
          .catch(function () { return {}; })
          .then(function (o) {
            if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
            return reply({ ok: true, overrides: o, commit: commit(6, '文章を更新') });
          });
      case '/api/analytics': return reply(analytics(q.get('days')));
      case '/api/weekly-report': return reply(weeklyReport());
      case '/api/search-console': return reply(searchConsole());
      case '/api/crawlers': return reply(crawlers());
      case '/api/aio': return reply(aioGet(q.get('run')));
      case '/api/site-audit': return reply(siteAudit());
      case '/api/indexnow':
        return reply({ ok: true, last: { at: ago(5 * DAY + 3 * 3600000), status: 200, count: 42, ok: true }, keyUrl: 'https://example.com/demo-key.txt' });
      case '/api/booking': return reply(q.get('recent') ? bookingRecent() : { ok: true, enabled: false, mode: 'off', slots: [] });
      case '/api/settings': return reply(settings());
      case '/api/social': return reply(q.get('quota') ? socialQuotas() : q.get('insights') ? socialInsights() : social());

      case '/api/google-oauth':
      case '/api/video-oauth':
        notice(MSG);
        return reply(blocked());
      case '/api/video': return reply(q.get('project') ? videoProject() : videoList());
      case '/api/video-publish': return reply(videoPublishInfo());
    }
    return reply(blocked());
  }

  function parseBody(init) {
    var b = init && init.body;
    if (typeof b !== 'string') return null;
    try { return JSON.parse(b); } catch (_) { return null; }
  }

  window.fetch = function (input, init) {
    if (!on || !realFetch) return realFetch(input, init);
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var u;
    try { u = new URL(url, location.href); } catch (_) { return realFetch(input, init); }
    // Any origin: a /api/ path is the server's, wherever it is addressed.
    if (/^\/api\//.test(u.pathname)) {
      var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var body = parseBody(init);
      var signal = init && init.signal;
      // A short pause, so loading states show as they would against the server.
      return wait(120).then(function () { return route(u, method, body, signal); });
    }
    if (u.origin === location.origin && u.pathname === '/news.json') {
      return wait(60).then(function () { return reply(newsItems()); });
    }
    return realFetch(input, init);
  };
})();
