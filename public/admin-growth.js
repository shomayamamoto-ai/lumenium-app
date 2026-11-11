/* ---- ホーム: 成長の記録（伸びている・落ちている TOP3／週ごとの推移／今週の成長） ----
 *
 * 「どれくらい伸びたか」を一目で分かるようにする欄です。数字はホームがすでに読んでいるもの
 * だけを使います（admin-dash.js の D。新しく取りに行きません）:
 *   アクセス解析の日ごとの数（180日分）… 閲覧・訪問・本文まで読まれた割合・滞在・問い合わせ
 *   予約（日時）・受注（決まった日と金額）・会員（登録した日）
 *
 * 単位の違う数字（件・円・%・秒）を1つのグラフで比べるため、折れ線は「12週の中でいちばん
 * 多かった週を 100%」として描きます。実際の数は点に乗せると出ます。
 *
 * 伸びている／落ちている TOP3 は、直近4週とその前の4週の比較です。前の4週が少なすぎる数字
 * （件数なら5件未満、割合と滞在は訪問30回未満）は、たまたまの差になりやすいので並べません。
 *
 *   lumGrowth.html(D) → 欄の HTML（数が無いときは空）／ lumGrowth.bind(host, repaint)
 */
(function () {
  'use strict';
  if (window.lumGrowth) return;

  var DAY = 86400000, JST = 9 * 3600000, WEEKS = 12;
  function ymd(ms) { return new Date(ms + JST).toISOString().slice(0, 10); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { return Number(v || 0).toLocaleString('ja-JP'); }

  /* 数字の種類。kind: count（件・回）/ yen / rate（割合。num÷den）/ time（秒。重み付きの平均） */
  var METRICS = [
    { id: 'visits', label: '訪問', color: '#2563eb', kind: 'count', unit: '回' },
    { id: 'views', label: '閲覧', color: '#7c3aed', kind: 'count', unit: '回' },
    { id: 'engaged', label: '本文まで読まれた割合', color: '#0891b2', kind: 'rate' },
    { id: 'time', label: '平均滞在', color: '#0f766e', kind: 'time' },
    { id: 'submits', label: '問い合わせ', color: '#c23b42', kind: 'count', unit: '件' },
    { id: 'bookings', label: '予約', color: '#ea580c', kind: 'count', unit: '件' },
    { id: 'won', label: '受注額', color: '#ca8a04', kind: 'yen' },
    { id: 'members', label: '新しい会員', color: '#16a34a', kind: 'count', unit: '人' }
  ];
  var DEFAULT_ON = ['visits', 'submits', 'bookings'];
  var MIN_COUNT = 5, MIN_VISITS = 30;
  /* これより小さい差は「横ばい」（毎月そのくらいは揺れるので、伸びた・落ちたに数えません）。アクセス解析の図と同じ。 */
  var FLAT_PCT = 5, FLAT_PT = 2;
  var moved = function (c) { return c && Math.abs(c.d) >= (c.u === 'pt' ? FLAT_PT : FLAT_PCT); };

  /* 日ごとの数（{ 'YYYY-MM-DD': { n, d } }）を数字ごとに作ります。d は割合・滞在の分母。 */
  function daily(D) {
    var m = {};
    METRICS.forEach(function (x) { m[x.id] = {}; });
    var add = function (id, day, n, d) {
      var o = m[id][day] || (m[id][day] = { n: 0, d: 0 });
      o.n += Number(n) || 0; o.d += Number(d) || 0;
    };
    var series = (D.a180 && D.a180.series) || [];
    series.forEach(function (r) {
      if (!r || !r.date) return;
      var v = Number(r.visits) || 0;
      add('visits', r.date, v, 0);
      add('views', r.date, r.views, 0);
      add('submits', r.date, r.submits, 0);
      if (v) add('engaged', r.date, Number(r.engaged) || 0, v);
      if (v && r.avgTimeMs != null) add('time', r.date, (Number(r.avgTimeMs) || 0) * v, v);
    });
    var bk = D.src && D.src.booking && D.src.booking.state === 'ok' ? (D.src.booking.data.bookings || []) : [];
    bk.forEach(function (b) {
      if ((b.status || '') === 'cancelled') return;
      var t = Number(b.start) || Date.parse(b.key || '');
      if (t) add('bookings', ymd(t), 1, 0);
    });
    (D.quotes || []).forEach(function (q) {
      if ((q.kind || 'quote') !== 'quote' || q.status !== 'won') return;
      var t = Date.parse(q.decidedAt || q.date || '');
      if (t) add('won', ymd(t), Number(q.total) || 0, 0);
    });
    var mb = D.src && D.src.members && D.src.members.state === 'ok' ? (D.src.members.data.members || []) : [];
    mb.forEach(function (x) { var t = Date.parse(x.created || ''); if (t) add('members', ymd(t), 1, 0); });
    return m;
  }

  /* [from, to] の日（含む）を足し、数字の種類に合った1つの値にします。データが無ければ null。 */
  function sumRange(map, kind, from, to) {
    var n = 0, d = 0, seen = false;
    for (var k in map) { if (k >= from && k <= to) { n += map[k].n; d += map[k].d; seen = true; } }
    if (kind === 'rate' || kind === 'time') return d ? { v: kind === 'rate' ? n / d : n / d / 1000, base: d } : { v: null, base: 0 };
    return { v: seen || n ? n : 0, base: n, seen: seen };
  }
  /* その数字に、そもそも記録があるか（全期間） */
  function hasData(map) { for (var k in map) { if (map[k].n || map[k].d) return true; } return false; }

  function fmt(x, v) {
    if (v == null) return '—';
    if (x.kind === 'rate') return Math.round(v * 100) + '%';
    if (x.kind === 'time') return Math.round(v) + '秒';
    if (x.kind === 'yen') return '¥' + num(Math.round(v));
    return num(Math.round(v)) + (x.unit || '');
  }
  /* 前の期間との差。割合はポイント、ほかは %。前が 0・少なすぎるときは null。 */
  function change(x, cur, prev) {
    if (cur.v == null || prev.v == null) return null;
    if (x.kind === 'rate') return prev.base >= MIN_VISITS && cur.base >= MIN_VISITS ? { d: Math.round((cur.v - prev.v) * 100), u: 'pt' } : null;
    if (x.kind === 'time') return prev.base >= MIN_VISITS && cur.base >= MIN_VISITS && prev.v ? { d: Math.round((cur.v - prev.v) / prev.v * 100), u: '%' } : null;
    if (!prev.v) return null;
    if (x.kind !== 'yen' && prev.v < MIN_COUNT) return null;
    return { d: Math.round((cur.v - prev.v) / prev.v * 100), u: '%' };
  }
  /* 比べやすさのための強さ（ポイントは %の半分くらいの重みに） */
  var weight = function (c) { return c.u === 'pt' ? c.d * 2 : c.d; };

  function compute(D) {
    var dm = daily(D), now = Date.now(), today = ymd(now);
    var avail = METRICS.filter(function (x) { return hasData(dm[x.id]); });
    if (!avail.length || !(D.a180 && D.a180.series && D.a180.series.length)) return null;
    // 週（今日で終わる7日ずつ）
    var weeks = [];
    for (var i = WEEKS - 1; i >= 0; i--) {
      var to = ymd(now - i * 7 * DAY), from = ymd(now - (i * 7 + 6) * DAY);
      weeks.push({ from: from, to: to });
    }
    var rows = avail.map(function (x) {
      var vals = weeks.map(function (w) { return sumRange(dm[x.id], x.kind, w.from, w.to).v; });
      var max = Math.max.apply(null, vals.map(function (v) { return v || 0; }));
      var c7 = sumRange(dm[x.id], x.kind, ymd(now - 6 * DAY), today), p7 = sumRange(dm[x.id], x.kind, ymd(now - 13 * DAY), ymd(now - 7 * DAY));
      var c28 = sumRange(dm[x.id], x.kind, ymd(now - 27 * DAY), today), p28 = sumRange(dm[x.id], x.kind, ymd(now - 55 * DAY), ymd(now - 28 * DAY));
      return { x: x, vals: vals, max: max, week: change(x, c7, p7), w7: c7.v, month: change(x, c28, p28), m28: c28.v, p28: p28.v };
    });
    var ranked = rows.filter(function (r) { return moved(r.month); }).sort(function (a, b) { return weight(b.month) - weight(a.month); });
    return {
      weeks: weeks, rows: rows,
      up: ranked.filter(function (r) { return r.month.d > 0; }).slice(0, 3),
      down: ranked.filter(function (r) { return r.month.d < 0; }).reverse().slice(0, 3)
    };
  }

  /* ---- 描画 ---- */
  var ON_KEY = 'lum_growth_on';
  function onList(rows) {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(ON_KEY) || 'null'); } catch (_) {}
    var ids = rows.map(function (r) { return r.x.id; });
    var list = (Array.isArray(saved) ? saved : DEFAULT_ON).filter(function (id) { return ids.indexOf(id) !== -1; });
    return list.length ? list : ids.slice(0, 2);
  }
  function dshow(c) { return c == null ? '—' : (c.d > 0 ? '+' : '') + c.d + c.u; }

  function rankHtml(title, list, cls, empty) {
    return '<div class="gr-rank ' + cls + '"><h3>' + title + '</h3>' + (list.length ? '<ol>' + list.map(function (r, i) {
      // 棒は 100% で頭打ち（+800% のような大きな伸びに合わせると、ほかの棒が見えなくなるため）
      var w = Math.max(6, Math.min(100, Math.abs(weight(r.month))));
      return '<li><span class="gr-no">' + (i + 1) + '</span><span class="gr-nm">' + esc(r.x.label) + '<small>' + esc(fmt(r.x, r.m28)) + '（前の4週 ' + esc(fmt(r.x, r.p28)) + '）</small></span>' +
        '<b>' + dshow(r.month) + '</b><i class="gr-bar"><i style="width:' + w + '%"></i></i></li>';
    }).join('') + '</ol>' : '<p class="gr-none">' + empty + '</p>') + '</div>';
  }

  function chartSvg(g, on) {
    // スマホでは、狭い幅のまま描きます（640 の幅を縮めると、目盛りの文字が読めない大きさになるため）
    var narrow = window.innerWidth < 640;
    var W = narrow ? 340 : 640, H = narrow ? 210 : 230, L = 38, R = 10, T = 12, B = 30;
    var n = g.weeks.length, xs = function (i) { return L + (W - L - R) * (n === 1 ? 0.5 : i / (n - 1)); };
    var ys = function (p) { return T + (H - T - B) * (1 - p / 100); };
    var grid = [0, 25, 50, 75, 100].map(function (p) {
      return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ys(p) + '" y2="' + ys(p) + '" class="gr-grid"/><text x="' + (L - 6) + '" y="' + (ys(p) + 4) + '" text-anchor="end" class="gr-axis">' + p + '%</text>';
    }).join('');
    var xl = g.weeks.map(function (w, i) {
      if (i % (narrow ? 4 : 3) !== 0 && i !== n - 1) return '';
      var d = w.from.slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/');
      return '<text x="' + xs(i) + '" y="' + (H - 8) + '" text-anchor="middle" class="gr-axis">' + d + '</text>';
    }).join('');
    var lines = g.rows.filter(function (r) { return on.indexOf(r.x.id) !== -1; }).map(function (r) {
      var pts = r.vals.map(function (v, i) { return v == null ? null : [xs(i), ys(r.max ? v / r.max * 100 : 0), v, i]; });
      var path = '', open = false;
      pts.forEach(function (p) { if (!p) { open = false; return; } path += (open ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); open = true; });
      return '<path d="' + path + '" fill="none" stroke="' + r.x.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        pts.map(function (p) {
          if (!p) return '';
          var w = g.weeks[p[3]];
          return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5" fill="#fff" stroke="' + r.x.color + '" stroke-width="2"><title>' +
            esc(r.x.label + '　' + w.from.slice(5).replace('-', '/') + '〜' + w.to.slice(5).replace('-', '/') + '：' + fmt(r.x, p[2])) + '</title></circle>';
        }).join('');
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="gr-svg" role="img" aria-label="週ごとの推移（いちばん多かった週を100%として）">' + grid + xl + lines + '</svg>';
  }

  function html(D) {
    var g = compute(D);
    if (!g) return '';
    var on = onList(g.rows);
    var weekCards = g.rows.filter(function (r) { return r.week; }).sort(function (a, b) { return Math.abs(weight(b.week)) - Math.abs(weight(a.week)); }).slice(0, 4);
    return '<section class="dk-card gr" id="dk-growth" aria-labelledby="gr-h">' +
      '<div class="dk-card-h"><h2 id="gr-h">成長の記録</h2><small>直近12週・週ごと</small></div>' +
      '<div class="gr-ranks">' +
        rankHtml('伸びている TOP3', g.up, 'is-up', '前の4週より伸びた数字は、まだありません。') +
        rankHtml('落ちている TOP3', g.down, 'is-down', '前の4週より落ちた数字はありません（横ばいを含む）。') +
      '</div>' +
      '<p class="gr-note">直近4週と、その前の4週の比べです。差が小さいもの（5%未満・割合は2ポイント未満）は横ばいとし、前の4週が少なすぎる数字（件数は5件未満、割合と滞在は訪問30回未満）は、たまたまの差になりやすいので並べていません。棒は100%で頭打ちです。</p>' +
      '<div class="gr-main">' +
        '<div class="gr-chartbox">' +
          '<div class="gr-chips" role="group" aria-label="グラフに出す数字">' + g.rows.map(function (r) {
            var a = on.indexOf(r.x.id) !== -1;
            return '<button type="button" class="gr-chip" data-gr="' + r.x.id + '" aria-pressed="' + a + '" style="--c:' + r.x.color + '"><i></i>' + esc(r.x.label) + '</button>';
          }).join('') + '</div>' +
          chartSvg(g, on) +
          '<p class="gr-note">単位の違う数字を並べて比べるため、それぞれ「12週の中でいちばん多かった週」を100%として描いています。点に乗せると実際の数が出ます。</p>' +
        '</div>' +
        '<div class="gr-week"><h3>今週の成長</h3><small>直近7日と、その前の7日の比べ</small>' +
          (weekCards.length ? weekCards.map(function (r) {
            var c = r.week, cls = !moved(c) ? '' : c.d > 0 ? 'up' : 'down';
            return '<div class="gr-wk ' + cls + '"><span style="--c:' + r.x.color + '">' + esc(r.x.label) + '</span><b>' + dshow(c) + '</b><small>' + esc(fmt(r.x, r.w7)) + '</small></div>';
          }).join('') : '<p class="gr-none">比べられるほどの数が、まだありません。</p>') +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function bind(host, repaint) {
    var box = host.querySelector('#dk-growth');
    if (!box) return;
    box.querySelectorAll('[data-gr]').forEach(function (b) {
      b.addEventListener('click', function () {
        var ids = Array.prototype.map.call(box.querySelectorAll('[data-gr]'), function (x) { return x.getAttribute('data-gr'); });
        var on = ids.filter(function (id) { var x = box.querySelector('[data-gr="' + id + '"]'); return x.getAttribute('aria-pressed') === 'true'; });
        var id = b.getAttribute('data-gr');
        var i = on.indexOf(id);
        if (i === -1) on.push(id); else if (on.length > 1) on.splice(i, 1);
        try { localStorage.setItem(ON_KEY, JSON.stringify(on)); } catch (_) {}
        repaint();
        var again = document.querySelector('#dk-growth [data-gr="' + id + '"]');
        if (again) again.focus();
      });
    });
  }

  var CSS =
    '.gr-ranks{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:4px}' +
    '.gr-rank{border-radius:14px;padding:14px 16px}.gr-rank.is-up{background:#effaf3;border:1px solid #cdeedb}.gr-rank.is-down{background:#fdf1f1;border:1px solid #f6d3d4}' +
    '.gr-rank h3{font-size:14px;font-weight:800;margin:0 0 8px}.gr-rank.is-up h3{color:#15803d}.gr-rank.is-down h3{color:#b4232a}' +
    '.gr-rank ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}' +
    '.gr-rank li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;grid-template-rows:auto auto;column-gap:8px;row-gap:5px;align-items:center}' +
    '.gr-no{font-weight:800;color:#64748b;font-size:14px;grid-row:1/3}.gr-nm{font-weight:700;font-size:13.5px;min-width:0}.gr-nm small{display:block;font-weight:500;color:#5f5f69;font-size:12px}' +
    '.gr-rank b{font-size:15px;font-variant-numeric:tabular-nums}.gr-rank.is-up b{color:#15803d}.gr-rank.is-down b{color:#b4232a}' +
    '.gr-bar{grid-column:2/4;display:block;height:6px;border-radius:3px;background:rgba(15,23,42,.07);overflow:hidden}.gr-bar i{display:block;height:100%;border-radius:3px}' +
    '.gr-rank.is-up .gr-bar i{background:#22c55e}.gr-rank.is-down .gr-bar i{background:#ef4444}' +
    '.gr-none{font-size:13px;color:#5f5f69;margin:0}' +
    '.gr-note{font-size:12px;color:#5f5f69;line-height:1.7;margin:8px 0 0}' +
    '.gr-main{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:16px;margin-top:14px;align-items:start}' +
    '.gr-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}' +
    '.gr-chip{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:12.5px;font-weight:700;color:#5f5f69;cursor:pointer}' +
    '.gr-chip i{width:10px;height:10px;border-radius:50%;border:2px solid var(--c);background:transparent}' +
    '.gr-chip[aria-pressed="true"]{color:#1f2937;border-color:var(--c);background:color-mix(in srgb,var(--c) 8%,#fff)}.gr-chip[aria-pressed="true"] i{background:var(--c)}' +
    '.gr-svg{display:block;width:100%;height:auto}.gr-grid{stroke:#eef0f4;stroke-width:1}.gr-axis{fill:#5f5f69;font-size:11px;font-family:inherit}' +
    '.gr-week{border:1px solid var(--ui-border);border-radius:14px;padding:12px 14px;background:#fbfaf8}.gr-week h3{font-size:14px;font-weight:800;margin:0}.gr-week>small{display:block;font-size:12px;color:#5f5f69;margin:2px 0 8px}' +
    '.gr-wk{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:2px 8px;padding:8px 0;border-top:1px solid var(--ui-border)}' +
    '.gr-wk span{font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px;min-width:0}.gr-wk span::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}' +
    '.gr-wk b{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}.gr-wk.up b{color:#15803d}.gr-wk.down b{color:#b4232a}.gr-wk small{grid-column:1/3;font-size:12px;color:#5f5f69}' +
    '@media (max-width:900px){.gr-main{grid-template-columns:1fr}}' +
    '@media (max-width:640px){.gr-ranks{grid-template-columns:1fr}}';
  function css() {
    if (document.getElementById('gr-css')) return;
    var s = document.createElement('style');
    s.id = 'gr-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  window.lumGrowth = {
    html: function (D) { css(); try { return html(D); } catch (e) { if (window.console) console.error('成長の記録を描けませんでした', e); return ''; } },
    bind: bind,
    compute: compute
  };
})();
