/* ---- 管理画面の上の帯と、ホームのダッシュボード ----
 *
 * 上の帯: 検索（どこでも検索を開く）・お知らせ（要対応の一覧）・ログイン中の人。
 * ホーム: おかえりなさい → いちばん先にやること → 数字のカード（5つ）→ 運営マップ
 *        → 訪問の推移（日次・週次・月次）と、どこから来たか → 人気のページ TOP5 と月別の受注額。
 *
 * 数字は、ホームが読む結果（admin-portal.js の lum:portal）と、アクセス解析・見積書の
 * 窓口から作ります。読めなかったものは「—」と書き、0 のふりはしません。
 * グラフは SVG で描き、点や棒にマウスを乗せる（指で触れる）と値が出ます。 */
(function () {
  'use strict';
  window.lumDash = true;
  var el = function (id) { return document.getElementById(id); };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  var DAY = 86400000, JST = 9 * 3600000;
  var ymd = function (ms) { return new Date(ms + JST).toISOString().slice(0, 10); };
  var md = function (s) { var m = /^\d{4}-(\d\d)-(\d\d)/.exec(s || ''); return m ? Number(m[1]) + '/' + Number(m[2]) : s; };
  var yen = function (n) { return '¥' + Math.round(Number(n) || 0).toLocaleString('ja-JP'); };
  var num = function (n) { return Math.round(Number(n) || 0).toLocaleString('ja-JP'); };
  async function api(url) {
    if (!window.lumAdmin) return null;
    // ログインしていない・画面を閉じた（デモを終えた）直後には、取りに行きません。
    var sh = el('shell');
    if (!sh || sh.style.display === 'none' || (window.lumAdmin.key && !window.lumAdmin.key())) return null;
    if (window.lumStaff && !window.lumStaff.canRead(url)) return null;
    try { var r = await window.lumAdmin.fetch(url); return r && r.data && r.data.ok !== false ? r.data : null; } catch (_) { return null; }
  }
  /* 決まった順の色（色覚の違いがあっても隣どうしが見分けられる並び）。 */
  var SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

  var ICON = {
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    bell: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    visit: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    yen: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 6 8 6-8M12 12v8M8 13h8M8 17h8"/></svg>',
    users: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="9" cy="8" r="4"/><path d="M1.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5z"/><circle cx="17.5" cy="9" r="3"/><path d="M17 13.6c3.3.2 5.5 2.4 5.5 5.9H18c0-2.4-.4-4.3-1-5.9z"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };

  /* ================= 上の帯 ================= */
  function buildTop() {
    var main = el('main');
    if (!main || el('sk-top')) return;
    var bar = document.createElement('div');
    bar.className = 'sk-top';
    bar.id = 'sk-top';
    var mac = /Mac|iP(hone|ad)/.test(navigator.platform || '');
    bar.innerHTML =
      '<button type="button" class="sk-search" id="sk-search" aria-label="どこでも検索（お客様・問い合わせ・見積書・機能）">' + ICON.search +
        '<span>お客様・問い合わせ・見積書・機能を検索…</span><kbd>' + (mac ? '⌘K' : 'Ctrl+K') + '</kbd></button>' +
      '<span class="sk-gap"></span>' +
      '<button type="button" class="sk-bell" id="sk-bell" aria-haspopup="true" aria-expanded="false" aria-controls="sk-pop" aria-label="お知らせ（要対応）">' + ICON.bell + '<b id="sk-bell-n" hidden></b></button>' +
      '<span class="sk-sep" aria-hidden="true"></span>' +
      '<button type="button" class="sk-user" id="sk-user" title="ログインの安全（2段階認証）"><span class="sk-avatar" id="sk-avatar" aria-hidden="true">?</span><span class="sk-user-t"><b id="sk-user-name"></b><small id="sk-user-role"></small></span></button>' +
      '<div class="sk-pop" id="sk-pop" role="dialog" aria-label="要対応の一覧" hidden></div>';
    main.insertBefore(bar, main.firstChild);
    el('sk-search').addEventListener('click', function () { if (window.lumFinder) window.lumFinder.open(); });
    el('sk-bell').addEventListener('click', function (e) { e.stopPropagation(); togglePop(); });
    el('sk-user').addEventListener('click', function () { if (window.lumOtp) window.lumOtp.open(); });
    document.addEventListener('click', function (e) { var p = el('sk-pop'); if (p && !p.hidden && !p.contains(e.target)) togglePop(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') togglePop(false); });
    // メニューの下の一言
    var side = el('side'), foot = side && side.querySelector('.ui-side-foot');
    if (side && foot && !el('sk-motto')) {
      var m = document.createElement('p');
      m.className = 'sk-side-motto';
      m.id = 'sk-motto';
      m.innerHTML = 'サイトで、<br>もっと遠くへ。<small>あなたの仕事が、まだ見ぬお客様とつながる。</small>';
      side.insertBefore(m, foot);
    }
    paintUser();
    setInterval(paintBell, 4000);
    paintBell();
  }
  function paintUser() {
    var w = window.lumStaff && window.lumStaff.who();
    var name = (w && w.name) || 'オーナー';
    var role = w && window.lumStaff.LABEL ? (window.lumStaff.LABEL[w.role] || w.role) : 'オーナー';
    if (el('sk-user-name')) el('sk-user-name').textContent = name;
    if (el('sk-user-role')) el('sk-user-role').textContent = role;
    if (el('sk-avatar')) el('sk-avatar').textContent = String(name).trim().charAt(0) || '?';
  }
  /* 左のメニューに付いている「要対応」の数を、お知らせの一覧に集めます。 */
  function attention() {
    var out = [];
    document.querySelectorAll('#shell-nav [id^="tab-"]').forEach(function (b) {
      var badge = b.querySelector('.nav-count, .inq-badge, .bk-badge, .rev-badge');
      var n = badge ? parseInt(badge.textContent, 10) || 0 : 0;
      var lbl = b.querySelector('.ui-nav-lbl');
      var label = lbl ? (lbl.firstChild && lbl.firstChild.nodeType === 3 ? lbl.firstChild.nodeValue : lbl.textContent).trim() : b.textContent.trim();
      if (n > 0) out.push({ tab: b.id.slice(4), label: label, n: n, title: badge.getAttribute('aria-label') || '' });
    });
    return out;
  }
  function paintBell() {
    var list = attention(), total = list.reduce(function (a, x) { return a + x.n; }, 0);
    var b = el('sk-bell-n');
    if (!b) return;
    b.hidden = !total;
    b.textContent = total > 99 ? '99+' : String(total);
    el('sk-bell').setAttribute('aria-label', total ? 'お知らせ（要対応 ' + total + '件）' : 'お知らせ（要対応はありません）');
    var p = el('sk-pop');
    if (p && !p.hidden) fillPop(list);
  }
  function fillPop(list) {
    var p = el('sk-pop');
    p.innerHTML = '<h3>要対応</h3>' + (list.length ? list.map(function (x) {
      return '<button type="button" class="row" data-go="' + esc(x.tab) + '" title="' + esc(x.title) + '"><span>' + esc(x.label) + '</span><b>' + x.n + '</b></button>';
    }).join('') : '<p class="empty">いま対応が要るものはありません。</p>') +
      '<div class="foot"><button type="button" data-go="portal">ホームで見る</button><button type="button" id="sk-pop-close">閉じる</button></div>';
    p.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () { togglePop(false); if (window.lumShowTab) window.lumShowTab(b.getAttribute('data-go')); });
    });
    el('sk-pop-close').addEventListener('click', function () { togglePop(false); });
  }
  function togglePop(on) {
    var p = el('sk-pop'), b = el('sk-bell');
    if (!p) return;
    var show = on === undefined ? p.hidden : on;
    if (show) fillPop(attention());
    p.hidden = !show;
    b.setAttribute('aria-expanded', show ? 'true' : 'false');
  }

  /* ================= ホーム ================= */
  var D = { src: null, a30: null, a180: null, quotes: null, pages: null, mode: 'day', loading: false };
  function dashHost() {
    var portal = el('portal');
    if (!portal) return null;
    var h = el('dash');
    if (!h) {
      h = document.createElement('div');
      h.id = 'dash';
      portal.insertBefore(h, portal.firstChild);
      addCss();
    }
    return h;
  }
  async function loadExtra() {
    if (D.loading) return;
    D.loading = true;
    var r = await Promise.all([api('/api/analytics?days=30'), api('/api/analytics?days=180'), api('/api/quotes'),
      fetch('/seo-pages.json', { cache: 'no-store' }).then(function (x) { return x.ok ? x.json() : null; }).catch(function () { return null; }),
      api('/api/shop-profile')]);
    D.a30 = r[0]; D.a180 = r[1]; D.quotes = r[2] && Array.isArray(r[2].list) ? r[2].list : null; D.pages = (r[3] && r[3].pages) || {};
    D.profile = (r[4] && r[4].profile) || null;
    D.loading = false;
    soon();
  }
  /* 読み込みの結果は何回かに分けて届くので、続けて届いたものは1回の描き直しにまとめます。 */
  var soonT = 0;
  function soon() { clearTimeout(soonT); soonT = setTimeout(paint, 160); }

  function pct(cur, prev) {
    if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || prev <= 0) return null;
    return Math.round((cur - prev) / prev * 100);
  }
  function monthKey(ms) { return ymd(ms).slice(0, 7); }
  function kpis() {
    var now = Date.now(), thisM = monthKey(now), lastM = monthKey(new Date(Date.UTC(new Date(now + JST).getUTCFullYear(), new Date(now + JST).getUTCMonth(), 0)).getTime());
    var out = [];
    var s = D.a30 && D.a30.summary, c = s && s.cur, p = s && s.prev;
    var vk = c && Number(c.visits) ? 'visits' : 'views';
    out.push({ icon: 'visit', tone: '#2563eb', label: 'サイトの訪問', value: c ? num(c[vk]) : '—', d: c && p ? pct(c[vk], p[vk]) : null, cmp: '前の30日比', tab: 'stats-admin' });
    var G = D.profile || {};
    out.push({ icon: 'mail', tone: '#16a34a', label: '問い合わせ（30日）', value: c ? num(c.submits) : '—', d: c && p ? pct(c.submits, p.submits) : null, cmp: '前の30日比', tab: 'inquiries-admin',
      goal: G.goalInquiries && c ? { target: G.goalInquiries, cur: Number(c.submits) || 0, unit: '件' } : null });
    var bk = D.src && D.src.booking && D.src.booking.state === 'ok' ? (D.src.booking.data.bookings || []) : null;
    var bThis = 0, bLast = 0;
    if (bk) bk.forEach(function (b) {
      var st = b.status || 'tentative';
      if (st === 'cancelled') return;
      var t = Number(b.start) || Date.parse(b.key);
      if (!t) return;
      var k = monthKey(t);
      if (k === thisM) bThis++; else if (k === lastM) bLast++;
    });
    out.push({ icon: 'cal', tone: '#2563eb', label: '今月の予約', value: bk ? num(bThis) + '件' : '—', d: bk ? pct(bThis, bLast) : null, cmp: '前月比', tab: 'booking-admin',
      goal: G.goalBookings && bk ? { target: G.goalBookings, cur: bThis, unit: '件' } : null });
    var won = wonByMonth();
    out.push({ icon: 'yen', tone: '#f97316', label: '今月の受注額', value: won ? yen(won[thisM] || 0) : '—', d: won ? pct(won[thisM] || 0, won[lastM] || 0) : null, cmp: '前月比', tab: 'quotes-admin',
      goal: G.goalSales && won ? { target: G.goalSales, cur: won[thisM] || 0, unit: '円' } : null });
    var mb = D.src && D.src.members && D.src.members.state === 'ok' ? (D.src.members.data.members || []) : null;
    var mThis = 0, mLast = 0;
    if (mb) mb.forEach(function (m) { var t = Date.parse(m.created || ''); if (!t) return; var k = monthKey(t); if (k === thisM) mThis++; else if (k === lastM) mLast++; });
    out.push({ icon: 'users', tone: '#2563eb', label: '会員', value: mb ? num(mb.length) + '人' : '—', extra: mb ? '今月 +' + mThis + '人' : '', d: mb ? pct(mThis, mLast) : null, cmp: '新規・前月比', tab: 'list-view' });
    return out;
  }
  function wonByMonth() {
    if (!D.quotes) return null;
    var m = {};
    D.quotes.forEach(function (q) {
      if ((q.kind || 'quote') !== 'quote' || q.status !== 'won') return;
      var t = Date.parse(q.decidedAt || q.date || '');
      if (!t) return;
      var k = monthKey(t);
      m[k] = (m[k] || 0) + (Number(q.total) || 0);
    });
    return m;
  }

  function kpiHtml(list) {
    return '<div class="dk-kpis">' + list.map(function (k) {
      var d = k.d, cls = d == null ? '' : d > 0 ? ' up' : d < 0 ? ' down' : '';
      var delta = d == null ? '<span class="dk-delta">比べる数がまだありません</span>'
        : '<span class="dk-delta' + cls + '">' + (d > 0 ? ICON.up : d < 0 ? ICON.down : '') + (d > 0 ? '+' : '') + d + '%</span>';
      return '<button type="button" class="dk-kpi" data-go="' + k.tab + '" aria-label="' + esc(k.label + ' ' + k.value + (d == null ? '' : '、' + k.cmp + (d > 0 ? '+' : '') + d + '%') + '。押すと開きます') + '">' +
        '<span class="dk-kpi-h"><i class="dk-ic" style="--tone:' + k.tone + '">' + ICON[k.icon] + '</i>' + esc(k.label) + '</span>' +
        '<b class="dk-kpi-v' + (String(k.value).length > 8 ? ' is-long' : '') + '">' + esc(k.value) + '</b>' + (k.extra ? '<span class="dk-kpi-x">' + esc(k.extra) + '</span>' : '') +
        delta + '<small>' + esc(k.cmp) + '</small>' + goalHtml(k.goal) + '</button>';
    }).join('') + '</div>';
  }

  /* 月の目標の進み具合（お店のプロフィールで決めた数）。月の日数の進みと比べて、遅れていれば色を変えます。 */
  function goalHtml(g) {
    if (!g || !g.target) return '';
    var r = Math.min(1, g.cur / g.target), p = Math.round(g.cur / g.target * 100);
    var d = new Date(Date.now() + JST), days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    var pace = d.getUTCDate() / days;
    var cls = r >= 1 ? ' done' : r + 0.05 < pace ? ' behind' : '';
    var t = g.unit === '円' ? yen(g.target) : num(g.target) + g.unit;
    return '<span class="dk-goal' + cls + '" aria-hidden="true"><i style="width:' + Math.round(r * 100) + '%"></i><em style="left:' + Math.round(pace * 100) + '%"></em></span>' +
      '<small class="dk-goal-t">目標 ' + esc(t) + ' の ' + p + '%' + (r >= 1 ? '（達成）' : r + 0.05 < pace ? '（月の進みより遅れ）' : '') + '</small>';
  }
  window.lumDashGoals = function (prof) { D.profile = prof || null; paint(); };

  /* ---- 月のレポート（印刷・PDF） ----
     家族・税理士さん・金融機関に渡せる1枚。画面にある数字だけで作ります（取りに行きません）。 */
  function printReport() {
    var k = kpis(), b = barsData(), parts = donutParts(), pages = topPages(), now = Date.now();
    var brand = (window.lumSite && window.lumSite.name) || '';
    var t = function (x) { return esc(x); };
    var rows = k.map(function (x) {
      return '<tr><th>' + t(x.label) + '</th><td class="n">' + t(x.value) + '</td><td>' + (x.d == null ? '—' : (x.d > 0 ? '+' : '') + x.d + '%（' + t(x.cmp) + '）') + '</td><td>' +
        (x.goal ? '目標 ' + t(x.goal.unit === '円' ? yen(x.goal.target) : num(x.goal.target) + x.goal.unit) + ' の ' + Math.round(x.goal.cur / x.goal.target * 100) + '%' : '') + '</td></tr>';
    }).join('');
    var html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>月のレポート ' + t(ymd(now).slice(0, 7)) + '</title><style>' +
      'body{font-family:"Hiragino Sans","Yu Gothic UI","Noto Sans JP",system-ui,sans-serif;color:#0f172a;margin:0;background:#f3f5f9}main{max-width:190mm;margin:12px auto;background:#fff;padding:14mm 14mm 12mm}' +
      'h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px;border-left:4px solid #2563eb;padding-left:8px}.sub{color:#64748b;font-size:12px;margin:4px 0 0}' +
      'table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}td.n{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.bar{display:inline-block;height:8px;background:#2563eb;border-radius:4px;vertical-align:middle;margin-right:6px}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
      '.tool{max-width:190mm;margin:12px auto 0;display:flex;gap:8px;align-items:center;font-size:13px}.tool button{font:inherit;font-weight:700;padding:9px 16px;border-radius:10px;border:0;background:#0f172a;color:#fff;cursor:pointer}' +
      '@media print{body{background:#fff}main{margin:0;padding:0}.tool{display:none}}</style></head><body>' +
      '<div class="tool"><button onclick="print()">印刷・PDFで保存</button><span>PDFにするときは、印刷の画面で「PDFに保存」を選んでください。</span></div>' +
      '<main><h1>月のレポート' + (brand ? '（' + t(brand) + '）' : '') + '</h1><p class="sub">' + t(ymd(now).replace(/-/g, '/')) + ' 時点。訪問と問い合わせは直近30日、予約と受注額は今月の数字です。</p>' +
      '<h2>主な数字</h2><table><tr><th>項目</th><th>数</th><th>前と比べて</th><th>月の目標</th></tr>' + rows + '</table>' +
      (b ? '<h2>' + t(b.title) + '（月別）</h2><table>' + b.items.map(function (x) {
        var max = Math.max.apply(null, b.items.map(function (y) { return y.v; })) || 1;
        return '<tr><th>' + t(x.label) + '</th><td><span class="bar" style="width:' + Math.round(x.v / max * 220) + 'px"></span>' + t(b.unit === 'yen' ? yen(x.v) : num(x.v) + '件') + '</td></tr>';
      }).join('') + '</table>' : '') +
      '<div class="two">' +
        (parts ? '<div><h2>どこから来たか（30日）</h2><table>' + parts.map(function (x) { return '<tr><th>' + t(x.label) + '</th><td class="n">' + num(x.v) + '</td></tr>'; }).join('') + '</table></div>' : '<div></div>') +
        (pages ? '<div><h2>よく見られたページ（30日）</h2><table>' + pages.map(function (x) { return '<tr><th>' + x.i + '. ' + t(x.title) + '</th><td class="n">' + num(x.v) + '</td></tr>'; }).join('') + '</table></div>' : '<div></div>') +
      '</div>' +
      '<p class="sub" style="margin-top:14px">この管理画面の記録から作ったレポートです。訪問者の名前やメールアドレスは含みません。</p></main></body></html>';
    var url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    var w = window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    return !!w;
  }

  /* ---- 訪問の推移（線＋面） ---- */
  function seriesFor(mode) {
    var rows = mode === 'day' ? (D.a30 && D.a30.series) : (D.a180 && D.a180.series);
    if (!rows || !rows.length) return null;
    var key = rows.some(function (r) { return Number(r.visits) > 0; }) ? 'visits' : 'views';
    if (mode === 'day') return rows.map(function (r) { return { label: md(r.date), full: r.date, v: Number(r[key]) || 0 }; });
    var buckets = [], map = {};
    rows.forEach(function (r) {
      var k, lab;
      if (mode === 'week') {
        var t = Date.parse(r.date + 'T00:00:00Z'), dow = new Date(t).getUTCDay(), mon = t - ((dow + 6) % 7) * DAY;
        k = new Date(mon).toISOString().slice(0, 10); lab = md(k) + '〜';
      } else { k = r.date.slice(0, 7); lab = Number(k.slice(5)) + '月'; }
      if (!map[k]) { map[k] = { label: lab, full: k, v: 0 }; buckets.push(map[k]); }
      map[k].v += Number(r[key]) || 0;
    });
    return mode === 'week' ? buckets.slice(-13) : buckets.slice(-6);
  }
  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }
  function lineSvg(pts) {
    var W = 640, H = 240, L = 44, R = 12, T = 14, B = 28;
    var max = niceMax(Math.max.apply(null, pts.map(function (p) { return p.v; })) || 1);
    var x = function (i) { return L + (pts.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (pts.length - 1)); };
    var y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var grid = '';
    for (var g = 0; g <= 4; g++) {
      var gv = max * g / 4, gy = y(gv);
      grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" class="dk-grid"/>' +
        '<text x="' + (L - 8) + '" y="' + (gy + 4) + '" class="dk-axis" text-anchor="end">' + num(gv) + '</text>';
    }
    var step = Math.max(1, Math.ceil(pts.length / 7)), xl = '';
    pts.forEach(function (p, i) { if (i % step === 0 || i === pts.length - 1) xl += '<text x="' + x(i) + '" y="' + (H - 8) + '" class="dk-axis" text-anchor="middle">' + esc(p.label) + '</text>'; });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' ');
    var area = line + ' L' + x(pts.length - 1).toFixed(1) + ' ' + y(0) + ' L' + x(0).toFixed(1) + ' ' + y(0) + ' Z';
    var dots = pts.map(function (p, i) { return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="4" class="dk-dot"/>'; }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="dk-svg" role="img" aria-label="訪問の推移のグラフ（下の表でも読めます）">' +
      '<defs><linearGradient id="dk-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a78d6" stop-opacity=".28"/><stop offset="1" stop-color="#2a78d6" stop-opacity="0"/></linearGradient></defs>' +
      grid + '<path d="' + area + '" fill="url(#dk-area)"/><path d="' + line + '" class="dk-line"/>' + dots + xl +
      '<line class="dk-cross" id="dk-cross" y1="' + T + '" y2="' + (H - B) + '" x1="0" x2="0" visibility="hidden"/>' +
      '<circle class="dk-hot" id="dk-hot" r="6" cx="0" cy="0" visibility="hidden"/>' +
      '<rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '" fill="transparent" id="dk-hit"/></svg>';
  }
  function bindLine(box, pts) {
    var svg = box.querySelector('svg'), hit = box.querySelector('#dk-hit'), tip = box.querySelector('.dk-tip');
    if (!svg || !hit) return;
    var W = 640, L = 44, R = 12, T = 14, B = 28, H = 240;
    var max = niceMax(Math.max.apply(null, pts.map(function (p) { return p.v; })) || 1);
    function at(ev) {
      var r = svg.getBoundingClientRect();
      var sx = (ev.clientX - r.left) / r.width * W;
      var i = pts.length === 1 ? 0 : Math.round((sx - L) / ((W - L - R) / (pts.length - 1)));
      i = Math.max(0, Math.min(pts.length - 1, i));
      var px = L + (pts.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (pts.length - 1)), py = T + (H - T - B) * (1 - pts[i].v / max);
      var c = box.querySelector('#dk-cross'), h = box.querySelector('#dk-hot');
      c.setAttribute('x1', px); c.setAttribute('x2', px); c.setAttribute('visibility', 'visible');
      h.setAttribute('cx', px); h.setAttribute('cy', py); h.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.innerHTML = '<small>' + esc(pts[i].full) + '</small><b>' + num(pts[i].v) + '</b> 訪問';
      var left = px / W * r.width, top = py / H * r.height;
      tip.style.left = Math.max(4, Math.min(r.width - tip.offsetWidth - 4, left - tip.offsetWidth / 2)) + 'px';
      tip.style.top = Math.max(0, top - tip.offsetHeight - 12) + 'px';
    }
    function off() { tip.hidden = true; box.querySelectorAll('#dk-cross, #dk-hot').forEach(function (n) { n.setAttribute('visibility', 'hidden'); }); }
    hit.addEventListener('pointermove', at);
    hit.addEventListener('pointerdown', at);
    hit.addEventListener('pointerleave', off);
  }

  /* ---- どこから来たか（ドーナツ） ---- */
  function donutParts() {
    var k = D.a30 && D.a30.referrerKinds;
    if (!k || !k.length) return null;
    var list = k.map(function (x) { return { label: x.label, v: Number(x.count) || 0 }; }).filter(function (x) { return x.v > 0; }).sort(function (a, b) { return b.v - a.v; });
    if (list.length > 5) {
      var rest = list.slice(4).reduce(function (a, x) { return a + x.v; }, 0);
      list = list.slice(0, 4).concat([{ label: 'その他', v: rest }]);
    }
    return list;
  }
  function donutSvg(parts) {
    var total = parts.reduce(function (a, x) { return a + x.v; }, 0) || 1;
    var R = 80, r = 54, cx = 100, cy = 100, a0 = -Math.PI / 2, out = '';
    parts.forEach(function (p, i) {
      var a1 = a0 + p.v / total * Math.PI * 2;
      if (parts.length === 1) a1 = a0 + Math.PI * 2 - 0.0001;
      var big = a1 - a0 > Math.PI ? 1 : 0;
      var P = function (a, rr) { return (cx + Math.cos(a) * rr).toFixed(2) + ' ' + (cy + Math.sin(a) * rr).toFixed(2); };
      out += '<path d="M' + P(a0, R) + ' A' + R + ' ' + R + ' 0 ' + big + ' 1 ' + P(a1, R) + ' L' + P(a1, r) + ' A' + r + ' ' + r + ' 0 ' + big + ' 0 ' + P(a0, r) + ' Z" fill="' + SERIES[i] + '" class="dk-slice" data-i="' + i + '"><title>' + esc(p.label + ' ' + num(p.v) + '（' + Math.round(p.v / total * 100) + '%）') + '</title></path>';
      a0 = a1;
    });
    return '<svg viewBox="0 0 200 200" class="dk-donut" role="img" aria-label="どこから来たかの内訳（右の一覧に数字があります）">' + out +
      '<text x="100" y="88" text-anchor="middle" class="dk-axis">合計</text>' +
      '<text x="100" y="112" text-anchor="middle" class="dk-donut-n">' + num(total) + '</text>' +
      '<text x="100" y="130" text-anchor="middle" class="dk-axis">訪問</text></svg>';
  }

  /* ---- 月別の受注額（棒） ---- */
  function barsData() {
    var now = Date.now(), d = new Date(now + JST), months = [];
    for (var i = 5; i >= 0; i--) {
      var t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 15);
      months.push(new Date(t).toISOString().slice(0, 7));
    }
    var won = wonByMonth();
    if (won && months.some(function (m) { return won[m]; })) {
      return { title: '受注額の推移', unit: 'yen', items: months.map(function (m) { return { label: Number(m.slice(5)) + '月', full: m, v: won[m] || 0 }; }), tab: 'quotes-admin', foot: '今月の受注額', btn: '見積書を表示' };
    }
    var rows = D.a180 && D.a180.series;
    if (!rows) return null;
    var map = {};
    rows.forEach(function (r) { var k = r.date.slice(0, 7); map[k] = (map[k] || 0) + (Number(r.submits) || 0); });
    return { title: '問い合わせの推移', unit: 'count', items: months.map(function (m) { return { label: Number(m.slice(5)) + '月', full: m, v: map[m] || 0 }; }), tab: 'inquiries-admin', foot: '今月の問い合わせ', btn: '問い合わせを表示' };
  }
  function barsSvg(b) {
    var W = 420, H = 220, L = 52, R = 8, T = 30, B = 26;
    var max = niceMax(Math.max.apply(null, b.items.map(function (x) { return x.v; })) || 1);
    var fmt = function (v) { return b.unit === 'yen' ? (v >= 10000 ? '¥' + (v / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 }) + '万' : yen(v)) : num(v); };
    var grid = '';
    for (var g = 0; g <= 4; g++) {
      var gv = max * g / 4, gy = T + (H - T - B) * (1 - g / 4);
      grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" class="dk-grid"/><text x="' + (L - 6) + '" y="' + (gy + 4) + '" text-anchor="end" class="dk-axis">' + fmt(gv) + '</text>';
    }
    var n = b.items.length, slot = (W - L - R) / n, bw = Math.min(40, slot * 0.56), out = '';
    b.items.forEach(function (it, i) {
      var h = (H - T - B) * (it.v / max), x = L + slot * i + (slot - bw) / 2, y = T + (H - T - B) - h, last = i === n - 1;
      var r = Math.min(4, h / 2);
      out += '<g class="dk-bar' + (last ? ' is-now' : '') + '"><title>' + esc(it.label + ' ' + (b.unit === 'yen' ? yen(it.v) : num(it.v) + '件')) + '</title>' +
        '<rect x="' + (L + slot * i) + '" y="' + T + '" width="' + slot + '" height="' + (H - T - B) + '" fill="transparent"/>' +
        (h > 0 ? '<path d="M' + x + ' ' + (y + h) + ' V' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' H' + (x + bw - r) + ' Q' + (x + bw) + ' ' + y + ' ' + (x + bw) + ' ' + (y + r) + ' V' + (y + h) + ' Z"/>' : '') +
        '<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" class="dk-axis">' + esc(it.label) + '</text>' +
        (last ? '<text x="' + (x + bw / 2) + '" y="' + Math.max(12, y - 8) + '" text-anchor="middle" class="dk-bar-v">' + esc(b.unit === 'yen' ? yen(it.v) : num(it.v) + '件') + '</text>' : '') + '</g>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="dk-svg" role="img" aria-label="' + esc(b.title) + '（月別）">' + grid + out + '</svg>';
  }

  /* ---- 人気のページ TOP5 ---- */
  function topPages() {
    var t = D.a30 && D.a30.topPaths;
    if (!t || !t.length) return null;
    var total = t.reduce(function (a, x) { return a + (Number(x.count) || 0); }, 0) || 1;
    return t.slice(0, 5).map(function (x, i) {
      var path = x.name || x.path || '/';
      var meta = D.pages[path] || D.pages[path.replace(/\/$/, '/index.html')] || null;
      var title = path === '/' ? 'トップページ' : meta ? String(meta.label || meta.title || path).split(/[|｜]/)[0].trim() : path;
      return { i: i + 1, path: path, title: title, v: Number(x.count) || 0, share: Math.round((Number(x.count) || 0) / total * 100) };
    });
  }

  /* ---- いちばん先にやること ---- */
  function firstTodo() {
    if (!D.src || !window.lumPortalCore) return null;
    try { var t = window.lumPortalCore.buildToday(D.src, Date.now()); return { top: t.todo[0] || null, count: t.todo.length }; } catch (_) { return null; }
  }

  function paint() {
    var host = dashHost();
    if (!host) return;
    var w = window.lumStaff && window.lumStaff.who();
    var name = w && w.name && w.role !== 'owner' ? w.name : '';
    var now = Date.now();
    var brand = (window.lumSite && window.lumSite.name) || '';
    var todo = firstTodo();
    var line = seriesFor(D.mode), parts = donutParts(), bars = barsData(), pages = topPages();
    var LV = { urgent: '至急', action: '要対応', today: '予定' };

    var html =
      '<header class="dk-hello"><div><h1 tabindex="-1" id="dk-h1">おかえりなさい' + (name ? '、' + esc(name) + 'さん' : '') + '</h1>' +
        '<p>あなたのサイトは、今日もどこかで見られています。</p></div>' +
        '<span class="dk-hello-acts">' +
          (!(D.profile && (D.profile.goalInquiries || D.profile.goalBookings || D.profile.goalSales)) ? '<button type="button" class="dk-mini" id="dk-goalset">月の目標を決める</button>' : '') +
          '<button type="button" class="dk-mini" id="dk-report">月のレポートを印刷</button>' +
          '<span class="dk-range" title="数字のカードとグラフの期間">' + esc(ymd(now - 29 * DAY).replace(/-/g, '/')) + ' – ' + esc(ymd(now).replace(/-/g, '/')) + '</span></span></header>' +
      '<div class="dk-hero">' +
        '<section class="dk-card dk-first">' +
          (todo && todo.top
            ? '<span class="dk-chip lv-' + todo.top.level + '">' + (LV[todo.top.level] || 'お知らせ') + '</span>' +
              '<h2>' + esc(todo.top.title) + '<span class="dk-count">' + esc(todo.top.count) + esc(todo.top.unit || '') + '</span></h2>' +
              '<p>' + esc(todo.top.why) + '</p>' +
              '<div class="dk-actions"><button type="button" class="dk-btn" id="dk-first-go">' + esc((todo.top.go && todo.top.go.label) || '開く') + '</button>' +
              (todo.count > 1 ? '<a href="#lp-today" class="dk-link" id="dk-first-all">今日やること ' + todo.count + '件をすべて見る</a>' : '') + '</div>'
            : '<span class="dk-chip lv-ok">順調です</span><h2>今日やることはありません</h2><p>急ぎのものも、今日の予定も見つかりませんでした。下の数字とマップで、いまの様子を確かめられます。</p>') +
          '<small class="dk-eyebrow">いちばん先にやること</small>' +
        '</section>' +
        '<section class="dk-card dk-quote"><blockquote>“ サイトは、どこかの誰かの<br>今日を、少しだけ変えていく。 ”</blockquote><p>' + esc(brand || 'あなたのサイト') + '</p></section>' +
      '</div>' +
      kpiHtml(kpis()) +
      '<div id="opsmap-slot"></div>' +
      '<div class="dk-grid2">' +
        '<section class="dk-card"><div class="dk-card-h"><h2>訪問の推移</h2><div class="dk-seg" role="tablist" aria-label="まとめ方">' +
          [['day', '日次'], ['week', '週次'], ['month', '月次']].map(function (m) {
            return '<button type="button" role="tab" aria-selected="' + (D.mode === m[0]) + '" data-mode="' + m[0] + '">' + m[1] + '</button>';
          }).join('') + '</div></div>' +
          (line ? '<div class="dk-chart">' + lineSvg(line) + '<div class="dk-tip" hidden></div></div>' +
            '<details class="dk-table"><summary>表で見る</summary><table><tbody>' + line.map(function (p) { return '<tr><th>' + esc(p.full) + '</th><td>' + num(p.v) + '</td></tr>'; }).join('') + '</tbody></table></details>'
            : '<p class="dk-empty">' + (D.loading ? '読み込み中…' : 'アクセス解析のデータがまだありません。') + '</p>') +
        '</section>' +
        '<section class="dk-card"><div class="dk-card-h"><h2>どこから来たか</h2><small>直近30日</small></div>' +
          (parts ? '<div class="dk-donut-wrap">' + donutSvg(parts) + '<ul class="dk-legend">' + parts.map(function (p, i) {
            var tot = parts.reduce(function (a, x) { return a + x.v; }, 0) || 1;
            return '<li><i style="background:' + SERIES[i] + '"></i><span>' + esc(p.label) + '</span><b>' + (Math.round(p.v / tot * 1000) / 10).toFixed(1) + '%</b></li>';
          }).join('') + '</ul></div>' : '<p class="dk-empty">' + (D.loading ? '読み込み中…' : 'まだデータがありません。') + '</p>') +
        '</section>' +
      '</div>' +
      '<div class="dk-grid2 dk-grid2b">' +
        '<section class="dk-card"><div class="dk-card-h"><h2>人気のページ TOP5</h2><button type="button" class="dk-link" data-go="stats-admin">すべてのページを見る ' + ICON.arrow + '</button></div>' +
          (pages ? '<ol class="dk-top">' + pages.map(function (p) {
            return '<li><span class="dk-rank">' + p.i + '</span><span class="dk-thumb" aria-hidden="true">' + esc(p.title.charAt(0)) + '</span>' +
              '<span class="dk-top-t"><b>' + esc(p.title) + '</b><small>' + esc(p.path) + '</small></span>' +
              '<span class="dk-top-v">' + num(p.v) + '</span><span class="dk-top-s"><i style="width:' + Math.max(4, p.share) + '%"></i>' + p.share + '%</span>' +
              '<a class="dk-top-open" href="' + esc(p.path) + '" target="_blank" rel="noopener" aria-label="' + esc(p.title) + ' を開く（新しいタブ）">↗</a></li>';
          }).join('') + '</ol>' : '<p class="dk-empty">' + (D.loading ? '読み込み中…' : 'まだデータがありません。') + '</p>') +
        '</section>' +
        '<section class="dk-card"><div class="dk-card-h"><h2>' + esc(bars ? bars.title : '受注額の推移') + '</h2><small>月別</small></div>' +
          (bars ? '<div class="dk-chart">' + barsSvg(bars) + '</div>' + (function () {
            var it = bars.items, cur = it[it.length - 1].v, prev = it[it.length - 2].v, d = pct(cur, prev);
            return '<div class="dk-bars-foot"><div><small>' + esc(bars.foot) + '</small><b>' + (bars.unit === 'yen' ? yen(cur) : num(cur) + '件') + '</b>' +
              (d == null ? '' : '<span class="dk-delta ' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? ICON.up : ICON.down) + (d > 0 ? '+' : '') + d + '%</span><small>前月比</small>') +
              '</div><button type="button" class="dk-btn ghost" data-go="' + bars.tab + '">' + esc(bars.btn) + ' ' + ICON.arrow + '</button></div>';
          })() : '<p class="dk-empty">' + (D.loading ? '読み込み中…' : 'まだデータがありません。') + '</p>') +
        '</section>' +
      '</div>';
    // 中身が前と同じなら作り直しません（ホームの読み込みは何回かに分けて届くため、
    // 毎回作り直すと、そのたびに画面全体の配置の計算が走っていました）。
    if (html === D.html && host.firstChild && el('opsmap-slot')) return;
    D.html = html;
    host.innerHTML = html;
    // 運営マップ（admin-opsmap.js）は、作り直さずに差し込み直します
    var slot = el('opsmap-slot'), map = el('opsmap');
    if (slot && map) slot.appendChild(map);
    else if (slot && window.lumOpsMapMount) window.lumOpsMapMount(slot);
    host.querySelectorAll('[data-go]').forEach(function (b) { b.addEventListener('click', function () { if (window.lumShowTab) window.lumShowTab(b.getAttribute('data-go')); }); });
    host.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { D.mode = b.getAttribute('data-mode'); paint(); }); });
    if (el('dk-report')) el('dk-report').addEventListener('click', function () { if (!printReport()) alert('新しい窓を開けませんでした。ポップアップを許可してください。'); });
    if (el('dk-goalset')) el('dk-goalset').addEventListener('click', function () {
      if (window.lumAdvisorProfile) window.lumAdvisorProfile();
      if (window.lumShowTab) window.lumShowTab('advisor-admin');
    });
    var go = el('dk-first-go');
    if (go && todo && todo.top) go.addEventListener('click', function () { if (window.lumPortalOpen) window.lumPortalOpen(todo.top); else if (window.lumShowTab) window.lumShowTab(todo.top.tab); });
    var all = el('dk-first-all');
    if (all) all.addEventListener('click', function (e) { e.preventDefault(); var t = el('lp-today'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    var chart = host.querySelector('.dk-grid2 .dk-chart');
    if (chart && line) bindLine(chart, line);
    if (!D.revealed) { reveal(host); D.revealed = true; }   // ふわっと出すのは最初の1回だけ
  }

  function addCss() {
    if (el('dk-css')) return;
    var s = document.createElement('style');
    s.id = 'dk-css';
    s.textContent =
      '#dash{display:grid;gap:16px;margin-bottom:18px}' +
      '.dk-hello{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:2px 0 2px}' +
      '.dk-hello h1{font-size:26px;font-weight:800;letter-spacing:.01em;margin:0;color:#0f172a}' +
      '.dk-hello h1:focus{outline:none}' +
      '.dk-hello p{margin:4px 0 0;color:#64748b;font-size:14px}' +
      '.dk-hello-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.dk-mini{height:40px;padding:0 14px;border:1px solid var(--ui-border);border-radius:12px;background:#fff;font:inherit;font-size:13px;font-weight:700;color:#1f2937;cursor:pointer}' +
      '.dk-mini:hover{border-color:#bfd3fb}' +
      '.dk-goal{position:relative;display:block;width:100%;height:6px;border-radius:3px;background:#e8edf5;margin-top:10px;overflow:visible}' +
      '.dk-goal i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--ui-accent)}.dk-goal.done i{background:#16a34a}.dk-goal.behind i{background:#f59e0b}' +
      '.dk-goal em{position:absolute;top:-3px;width:2px;height:12px;background:#94a3b8;border-radius:1px}' +
      '.dk-goal-t{display:block;margin-top:4px}' +
      '.dk-range{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px;border:1px solid var(--ui-border);border-radius:12px;background:#fff;font-size:14px;font-weight:600;color:#1f2937;font-variant-numeric:tabular-nums}' +
      '.dk-card{background:#fff;border:1px solid var(--ui-border);border-radius:16px;box-shadow:var(--ui-shadow);padding:18px 20px;min-width:0}' +
      '.dk-card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap}' +
      '.dk-card-h h2{font-size:16px;font-weight:800;margin:0;color:#0f172a}' +
      '.dk-card-h small{color:#64748b;font-size:12px}' +
      '.dk-hero{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(0,1fr);gap:16px}' +
      '.dk-first{position:relative;display:flex;flex-direction:column;gap:8px;padding:22px 24px;background:radial-gradient(120% 140% at 100% 0%,rgba(37,99,235,.08),transparent 55%),#fff}' +
      '.dk-first h2{font-size:20px;font-weight:800;margin:4px 0 0;line-height:1.4;color:#0f172a;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}' +
      '.dk-count{font-size:30px;font-weight:800;color:var(--ui-accent);font-variant-numeric:tabular-nums}' +
      '.dk-first p{margin:0;color:#475569;font-size:14px;line-height:1.75;max-width:60ch}' +
      '.dk-eyebrow{position:absolute;top:18px;right:20px;color:#94a3b8;font-size:12px;letter-spacing:.12em}' +
      '.dk-chip{align-self:flex-start;display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:800;background:#eaf1fe;color:#1d4ed8}' +
      '.dk-chip.lv-urgent{background:#fee2e2;color:#b91c1c}.dk-chip.lv-action{background:#fef3c7;color:#92400e}.dk-chip.lv-ok{background:#dcfce7;color:#166534}' +
      '.dk-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:6px}' +
      '.dk-btn{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 16px;border-radius:999px;border:0;background:var(--ui-accent);color:#fff;font:inherit;font-weight:700;font-size:14px;cursor:pointer}' +
      '.dk-btn:hover{background:var(--ui-accent-hover)}' +
      '.dk-btn.ghost{background:#fff;color:#1f2937;border:1px solid var(--ui-border);height:36px;font-size:13px}' +
      '.dk-btn.ghost:hover{border-color:var(--ui-border-strong);background:#f8fafc}' +
      '.dk-link{border:0;background:none;padding:0;font:inherit;font-size:13px;font-weight:700;color:var(--ui-accent);cursor:pointer;display:inline-flex;align-items:center;gap:4px;text-decoration:none}' +
      '.dk-quote{display:flex;flex-direction:column;justify-content:center;gap:10px;background:linear-gradient(135deg,#eef2f8,#e6ebf3);border-color:#dfe5ee}' +
      '.dk-quote blockquote{margin:0;font-size:19px;line-height:1.85;color:#334155;font-family:"Zen Old Mincho","Hiragino Mincho ProN",serif;letter-spacing:.04em}' +
      '.dk-quote p{margin:0;color:#64748b;font-size:14px;padding-left:24px;position:relative}' +
      '.dk-quote p::before{content:"";position:absolute;left:0;top:50%;width:16px;height:1px;background:#94a3b8}' +
      '.dk-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}' +
      '.dk-kpi{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:16px 18px;border:1px solid var(--ui-border);border-radius:16px;background:#fff;box-shadow:var(--ui-shadow);font:inherit;color:#0f172a;cursor:pointer;min-width:0}' +
      '.dk-kpi:hover{border-color:#bfd3fb;box-shadow:0 10px 26px rgba(37,99,235,.1)}' +
      '.dk-kpi-h{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#334155;margin-bottom:6px}' +
      '.dk-ic{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:color-mix(in srgb,var(--tone) 14%,#fff);color:var(--tone)}' +
      '.dk-kpi-v{font-size:30px;font-weight:800;line-height:1.15;letter-spacing:-.01em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}' +
      '.dk-kpi-v.is-long{font-size:22px;line-height:1.55;letter-spacing:-.02em}' +
      '.dk-kpi-x{font-size:12px;color:#64748b}' +
      '.dk-delta{display:inline-flex;align-items:center;gap:3px;margin-top:6px;font-size:14px;font-weight:800;color:#64748b}' +
      '.dk-delta.up{color:#15803d}.dk-delta.down{color:#b91c1c}' +
      '.dk-kpi small{font-size:12px;color:#94a3b8}' +
      '.dk-grid2{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:16px}' +
      '.dk-grid2b{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)}' +
      '.dk-seg{display:inline-flex;padding:3px;border:1px solid var(--ui-border);border-radius:10px;background:#f8fafc}' +
      '.dk-seg button{border:0;background:none;font:inherit;font-size:13px;font-weight:700;color:#64748b;padding:5px 14px;border-radius:8px;cursor:pointer;min-height:30px}' +
      '.dk-seg button[aria-selected="true"]{background:#fff;color:var(--ui-accent);box-shadow:0 1px 3px rgba(15,23,42,.1)}' +
      '.dk-chart{position:relative}' +
      '.dk-svg{width:100%;height:auto;display:block;overflow:visible}' +
      '.dk-grid{stroke:#e8edf4;stroke-width:1}' +
      '.dk-axis{fill:#64748b;font-size:11px;font-variant-numeric:tabular-nums}' +
      '.dk-line{fill:none;stroke:#2a78d6;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}' +
      '.dk-dot{fill:#fff;stroke:#2a78d6;stroke-width:2}' +
      '.dk-cross{stroke:#94a3b8;stroke-width:1;stroke-dasharray:3 3}' +
      '.dk-hot{fill:#2a78d6;stroke:#fff;stroke-width:3}' +
      '.dk-tip{position:absolute;pointer-events:none;background:#fff;border:1px solid var(--ui-border);border-radius:10px;padding:6px 10px;box-shadow:0 8px 20px rgba(15,23,42,.12);font-size:12px;color:#0f172a;white-space:nowrap}' +
      '.dk-tip small{display:block;color:#64748b}.dk-tip b{font-size:15px;font-variant-numeric:tabular-nums}' +
      '.dk-table{margin-top:6px;font-size:12px;color:#64748b}.dk-table summary{cursor:pointer}.dk-table table{border-collapse:collapse;margin-top:6px}.dk-table th,.dk-table td{padding:2px 12px 2px 0;text-align:left;font-weight:500;font-variant-numeric:tabular-nums}' +
      '.dk-donut-wrap{display:grid;grid-template-columns:minmax(150px,200px) minmax(0,1fr);align-items:center;gap:18px}' +
      '.dk-donut{width:100%;height:auto}.dk-slice{stroke:#fff;stroke-width:2}.dk-donut-n{font-size:24px;font-weight:800;fill:#0f172a}' +
      '.dk-legend{list-style:none;margin:0;padding:0;display:grid;gap:10px}' +
      '.dk-legend li{display:flex;align-items:center;gap:10px;font-size:14px;color:#334155}' +
      '.dk-legend i{width:12px;height:12px;border-radius:50%;flex:none}.dk-legend span{flex:1;min-width:0}.dk-legend b{font-variant-numeric:tabular-nums;color:#0f172a}' +
      '.dk-top{list-style:none;margin:0;padding:0}' +
      '.dk-top li{display:grid;grid-template-columns:22px 40px minmax(0,1fr) auto 110px 22px;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #eef1f6}' +
      '.dk-top li:first-child{border-top:0}' +
      '.dk-rank{font-weight:800;color:#0f172a;text-align:center}' +
      '.dk-thumb{width:40px;height:40px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;color:#fff;background:linear-gradient(135deg,#1e3a8a,#3b82f6)}' +
      '.dk-top li:nth-child(2) .dk-thumb{background:linear-gradient(135deg,#0f766e,#14b8a6)}.dk-top li:nth-child(3) .dk-thumb{background:linear-gradient(135deg,#9a3412,#f97316)}.dk-top li:nth-child(4) .dk-thumb{background:linear-gradient(135deg,#6d28d9,#a78bfa)}.dk-top li:nth-child(5) .dk-thumb{background:linear-gradient(135deg,#334155,#64748b)}' +
      '.dk-top-t{min-width:0}.dk-top-t b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dk-top-t small{display:block;color:#94a3b8;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.dk-top-v{font-variant-numeric:tabular-nums;font-weight:700;color:#334155}' +
      '.dk-top-s{display:flex;align-items:center;gap:6px;font-size:12px;color:#64748b;font-variant-numeric:tabular-nums}.dk-top-s i{display:block;height:6px;border-radius:3px;background:#2a78d6;opacity:.85}' +
      '.dk-top-open{color:#94a3b8;text-decoration:none;font-weight:700}.dk-top-open:hover{color:var(--ui-accent)}' +
      '.dk-bar path{fill:#1baf7a;opacity:.75}.dk-bar.is-now path{opacity:1}.dk-bar:hover path{opacity:1}' +
      '.dk-bar-v{font-size:12px;font-weight:800;fill:#0f172a}' +
      '.dk-bars-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:10px;padding:12px 14px;border-radius:12px;background:#f8fafc}' +
      '.dk-bars-foot div{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.dk-bars-foot b{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}.dk-bars-foot small{color:#64748b;font-size:12px}' +
      '.dk-empty{color:#64748b;font-size:13px;padding:24px 0;text-align:center}' +
      '@media (max-width:1200px){.dk-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}' +
      '@media (max-width:960px){.dk-hero,.dk-grid2,.dk-grid2b{grid-template-columns:minmax(0,1fr)}.dk-quote{display:none}}' +
      '@media (max-width:640px){.dk-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.dk-kpi-v{font-size:24px}.dk-hello h1{font-size:21px}' +
        '.dk-top li{grid-template-columns:18px 34px minmax(0,1fr) auto;gap:8px}.dk-top-s,.dk-top-open{display:none}.dk-thumb{width:34px;height:34px}' +
        '.dk-donut-wrap{grid-template-columns:minmax(0,140px) minmax(0,1fr);gap:12px}.dk-eyebrow{display:none}.dk-first{padding:18px}.dk-card{padding:16px}}';
    document.head.appendChild(s);
  }

  /* ホームを開いているときだけ、いつもの見出しの代わりに「おかえりなさい」を出します */
  function watchHome() {
    var portal = el('portal');
    if (!portal) return;
    // ホームは class（on）で出し入れしています。style だけを見ていたため、ほかの画面でも
    // 見出しが隠れたままでした。実際に見えているかで決めます。
    var sync = function () {
      var shell = el('shell');
      document.body.classList.toggle('sk-home', getComputedStyle(portal).display !== 'none' && !!shell && getComputedStyle(shell).display !== 'none');
    };
    new MutationObserver(sync).observe(portal, { attributes: true, attributeFilter: ['style', 'class'] });
    sync();
  }

  /* 押したところから広がる波紋（Material の ripple）。動きを減らす設定では出しません。 */
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('pointerdown', function (e) {
    if (reduce) return;
    var t = e.target.closest && e.target.closest('.dk-btn, .dk-kpi, .ui-nav-item, .sk-bell, .sk-pop .row');
    if (!t) return;
    var r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
    var w = document.createElement('span');
    w.className = 'sk-ripple';
    w.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
    t.appendChild(w);
    setTimeout(function () { w.remove(); }, 600);
  });
  /* 見えるところに来たカードを、ふわっと出す */
  var io = window.IntersectionObserver && !reduce ? new IntersectionObserver(function (es) {
    es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('is-in'); io.unobserve(x.target); } });
  }, { rootMargin: '0px 0px -8% 0px' }) : null;
  function reveal(host) {
    if (!io) return;
    host.querySelectorAll('.dk-kpi, .dk-card').forEach(function (n, i) {
      if (n.dataset.rv) return;
      n.dataset.rv = '1';
      n.classList.add('sk-reveal');
      n.style.transitionDelay = Math.min(i, 6) * 40 + 'ms';
      io.observe(n);
    });
  }

  window.addEventListener('lum:portal', function (e) {
    D.src = e.detail;
    buildTop();
    paintUser();
    soon();
    if (!D.a30 && !D.loading) loadExtra();
  });
  function boot() {
    var shell = el('shell');
    if (!shell) return;
    var ready = function () { if (shell.style.display !== 'none') { buildTop(); watchHome(); paint(); return true; } return false; };
    if (!ready()) new MutationObserver(function (m, obs) { if (ready()) obs.disconnect(); }).observe(shell, { attributes: true, attributeFilter: ['style'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
