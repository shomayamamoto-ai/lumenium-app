/* ---- 運営マップ（ホームの LIVE の組織図） ----
 *
 * 「いま、どこで何が動いているか」を一枚で把握するための図です。
 *   上: ● LIVE・日時・時計・要対応の合計・今日の操作・今日の問い合わせ・24時間の動き
 *   中: あなた（オーナー）→ 管理ポータル → 部門（お客様対応・発信・サイト・改善・管理）
 *       → 各ツール（状態のランプ・要対応の数・最後に動いた時刻・吹き出しで一番の用件）
 *   右: 自動で動いている仕組み（毎朝の自動処理・自動改善・口コミの同期・サイトの公開）と担当者
 *   下: 流れる記録（だれが・いつ・何をしたか）
 *
 * 部門とツールは、左のメニュー（#shell-nav）からそのまま作るので、その人の役割で
 * 見えないツールは出ません。数字は、ホームの読み込み結果（lum:portal）・操作の記録
 * （/api/audit。管理者以上）・担当者（/api/staff。オーナーのみ）から作ります。 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  var JST = 9 * 3600000;
  var hm = function (ms) { var d = new Date(ms + JST); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };
  var ymd = function (ms) { return new Date(ms + JST).toISOString().slice(0, 10); };
  var when = function (iso) {
    var t = Date.parse(iso || '');
    if (!t) return '';
    return ymd(t) === ymd(Date.now()) ? '今日 ' + hm(t) : (new Date(t + JST).getUTCMonth() + 1) + '/' + new Date(t + JST).getUTCDate() + ' ' + hm(t);
  };
  var TONE = { 'お客様対応': '#3b82f6', '発信': '#ec4899', 'サイト': '#14b8a6', '改善': '#8b5cf6', '管理': '#f59e0b' };
  var AREA_TAB = {
    inquiries: 'inquiries-admin', booking: 'booking-admin', reviews: 'reviews-admin', quotes: 'quotes-admin', members: 'list-view',
    news: 'news-admin', sns: 'social-admin', video: 'video-admin', copy: 'copy-admin', seo: 'seo-admin', analytics: 'stats-admin',
    auto: 'auto-admin', advisor: 'advisor-admin', settings: 'health-admin', staff: 'staff-admin', audit: 'audit-admin'
  };
  var SRC_TAB = {
    'inquiries-admin': 'inquiries', 'booking-admin': 'booking', 'reviews-admin': 'reviews', 'quotes-admin': 'quotes', 'list-view': 'members',
    'news-admin': 'news', 'social-admin': 'social', 'video-admin': 'video', 'stats-admin': 'analytics', 'seo-admin': 'seoAudit', 'health-admin': 'health'
  };
  var M = { src: null, audit: null, staff: null, auto: null, at: 0, still: false, timer: 0, clock: 0 };
  try { M.still = localStorage.getItem('lum_ops_still') === '1'; } catch (_) {}
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function api(url) {
    if (!window.lumAdmin) return null;
    var sh = el('shell');
    if (!sh || sh.style.display === 'none' || (window.lumAdmin.key && !window.lumAdmin.key())) return null;
    if (window.lumStaff && !window.lumStaff.canRead(url)) return null;
    try { var r = await window.lumAdmin.fetch(url); return r && r.data && r.data.ok !== false ? r.data : null; } catch (_) { return null; }
  }
  async function loadMore() {
    var r = await Promise.all([api('/api/audit'), api('/api/staff'), api('/api/auto?view=badge')]);
    M.audit = r[0] && Array.isArray(r[0].items) ? r[0].items : null;
    M.staff = r[1] && Array.isArray(r[1].staff) ? r[1].staff : null;
    M.auto = r[2];
    M.at = Date.now();
    paint();
  }

  /* 左のメニューから、部門とツールを読みます */
  function departments() {
    var out = [];
    document.querySelectorAll('#shell-nav .ui-nav-group').forEach(function (g) {
      var lbl = g.querySelector('.ui-nav-label');
      var name = lbl ? lbl.textContent.trim() : '';
      if (!name || name === 'その他') return;
      var tools = [];
      g.querySelectorAll('[id^="tab-"]').forEach(function (b) {
        var badge = b.querySelector('.nav-count, .inq-badge, .bk-badge, .rev-badge');
        var l = b.querySelector('.ui-nav-lbl');
        var label = l ? (l.firstChild && l.firstChild.nodeType === 3 ? l.firstChild.nodeValue : l.textContent).trim() : b.textContent.trim();
        var ic = b.querySelector('.ui-nav-ic');
        tools.push({ tab: b.id.slice(4), label: label, n: badge ? parseInt(badge.textContent, 10) || 0 : 0, why: badge ? badge.getAttribute('aria-label') || '' : '', icon: ic ? ic.innerHTML : '' });
      });
      if (tools.length) out.push({ name: name, tone: TONE[name] || '#64748b', tools: tools });
    });
    return out;
  }
  function lastByTab() {
    var m = {};
    (M.audit || []).forEach(function (e) {
      var tab = AREA_TAB[e.area];
      if (tab && !m[tab]) m[tab] = e;
    });
    return m;
  }
  function todayRows() {
    if (!M.src || !window.lumPortalCore) return {};
    var by = {};
    try {
      window.lumPortalCore.buildToday(M.src, Date.now()).todo.forEach(function (r) { if (!by[r.tab]) by[r.tab] = r; });
    } catch (_) {}
    return by;
  }

  function stats(depts) {
    var need = 0;
    depts.forEach(function (d) { d.tools.forEach(function (t) { need += t.n; }); });
    var today = ymd(Date.now());
    var ops = M.audit ? M.audit.filter(function (e) { return ymd(Date.parse(e.at)) === today; }).length : null;
    var inq = M.src && M.src.inquiries && M.src.inquiries.state === 'ok' ? (M.src.inquiries.data.items || []).filter(function (x) { return !x.spam && ymd(Date.parse(x.receivedAt)) === today; }).length : null;
    var cron = M.src && M.src.social && M.src.social.state === 'ok' && M.src.social.data.cron ? M.src.social.data.cron.at : null;
    // 24時間の動き（1時間ごとの操作の数）。記録が読めなければ、ここ14日の訪問。
    var spark = null, sparkLabel = '';
    if (M.audit) {
      var now = Date.now(), b = new Array(24).fill(0);
      M.audit.forEach(function (e) { var age = now - Date.parse(e.at); if (age >= 0 && age < 86400000) b[23 - Math.floor(age / 3600000)]++; });
      spark = b; sparkLabel = '24時間の操作 ' + b.reduce(function (a, x) { return a + x; }, 0) + '回';
    } else if (M.src && M.src.analytics && M.src.analytics.state === 'ok' && M.src.analytics.data.series) {
      spark = M.src.analytics.data.series.map(function (r) { return Number(r.visits || r.views) || 0; });
      sparkLabel = '7日の訪問';
    }
    return { need: need, ops: ops, inq: inq, cron: cron, spark: spark, sparkLabel: sparkLabel };
  }
  function sparkSvg(v) {
    if (!v || !v.length) return '';
    var W = 150, H = 34, max = Math.max.apply(null, v) || 1;
    var pts = v.map(function (x, i) { return (i * W / (v.length - 1)).toFixed(1) + ',' + (H - 3 - x / max * (H - 8)).toFixed(1); });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="om-spark" aria-hidden="true"><polyline points="' + pts.join(' ') + '"/><circle cx="' + W + '" cy="' + pts[pts.length - 1].split(',')[1] + '" r="2.5"/></svg>';
  }

  function automation() {
    var s = M.src || {}, out = [];
    var so = s.social && s.social.state === 'ok' ? s.social.data : null;
    if (so) {
      var c = so.cron;
      out.push({ name: '毎朝の自動処理', role: 'SNSの予約投稿・反応の取得', ok: !!(c && c.at), meta: c && c.at ? '最終 ' + when(c.at) + (Array.isArray(c.sent) && c.sent.length ? '・送信 ' + c.sent.length + '件' : '') : 'まだ動いていません', tab: 'social-admin' });
    }
    if (M.auto) {
      out.push({ name: '自動改善', role: '数字から提案・文章の実験', ok: true, meta: M.auto.total ? '決めてほしいこと ' + M.auto.total + '件' : '提案を待っています', warn: !!M.auto.total, tab: 'auto-admin' });
    }
    var rv = s.reviews && s.reviews.state === 'ok' ? s.reviews.data : null;
    if (rv) out.push({ name: '口コミの同期', role: 'Google の口コミを取り込む', ok: !!rv.lastSync, meta: rv.lastSync ? '最終 ' + when(rv.lastSync) : 'まだ同期していません', tab: 'reviews-admin' });
    var dp = s.deploy && s.deploy.state === 'ok' ? s.deploy.data : null;
    if (dp) out.push({ name: 'サイトの公開', role: '直した文章をサイトに反映', ok: dp.state !== 'failed', warn: dp.state === 'failed', meta: dp.state === 'failed' ? '最後の公開が失敗しました' : dp.state === 'building' ? '公開しています…' : '公開済み', tab: 'health-admin' });
    return out;
  }

  function paint() {
    var box = el('opsmap');
    if (!box) return;
    var depts = departments();
    var st = stats(depts), last = lastByTab(), rows = todayRows();
    var w = window.lumStaff && window.lumStaff.who();
    var me = (w && w.name) || 'オーナー', role = w && window.lumStaff.LABEL ? (window.lumStaff.LABEL[w.role] || '') : 'オーナー';
    var brand = (window.lumSite && window.lumSite.name) || '管理ポータル';
    var now = Date.now(), d = new Date(now + JST), wk = '日月火水木金土'.charAt(d.getUTCDay());
    var html =
      '<div class="om-top">' +
        '<span class="om-live"><i></i>LIVE</span>' +
        '<span class="om-date">' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '（' + wk + '）</span>' +
        '<span class="om-clock" id="om-clock">' + hm(now) + '<small>:' + ('0' + d.getUTCSeconds()).slice(-2) + '</small></span>' +
        '<button type="button" class="om-still" id="om-still" aria-pressed="' + M.still + '">' + (M.still ? '▶ 動きを再開' : '❚❚ 動きを止める') + '</button>' +
        '<span class="om-gap"></span>' +
        chip('要対応', st.need, st.need ? 'hot' : '') +
        chip('今日の操作', st.ops == null ? '—' : st.ops) +
        chip('今日の問い合わせ', st.inq == null ? '—' : st.inq) +
        chip('自動処理の最終', st.cron ? hm(Date.parse(st.cron)) : '—', 'violet') +
        (st.spark ? '<span class="om-spark-w"><small>' + esc(st.sparkLabel) + '</small>' + sparkSvg(st.spark) + '</span>' : '') +
      '</div>' +
      '<div class="om-body">' +
        '<div class="om-tree" id="om-tree">' +
          '<svg class="om-wires" id="om-wires" aria-hidden="true"></svg>' +
          '<div class="om-row om-row-top"><div class="om-node om-owner" id="om-owner"><span class="om-av">' + esc(me.charAt(0)) + '</span><span><small>' + esc(role || 'オーナー') + '・最終決定</small><b>' + esc(me) + '</b></span></div></div>' +
          '<div class="om-row"><div class="om-node om-hub" id="om-hub"><span class="om-hub-mark" aria-hidden="true"></span><span><small>管理ポータル</small><b>' + esc(brand) + '</b><em><i class="om-dot ok"></i>稼働中</em></span></div></div>' +
          '<div class="om-depts" id="om-depts">' + depts.map(function (dp) {
            var need = dp.tools.filter(function (t) { return t.n > 0; }).length;
            var top = dp.tools.slice().sort(function (a, b) { return b.n - a.n; })[0];
            return '<section class="om-dept" style="--tone:' + dp.tone + '"><header class="om-dept-h" data-wire="dept"><b>' + esc(dp.name) + '</b><span>' + need + '/' + dp.tools.length + '</span></header>' +
              '<ul>' + dp.tools.map(function (t) {
                var src = SRC_TAB[t.tab] && M.src ? M.src[SRC_TAB[t.tab]] : null;
                var off = src && src.state === 'off';
                var state = t.n > 0 ? 'ng' : off ? 'off' : 'ok';
                var lt = last[t.tab], row = rows[t.tab];
                var bubble = top && top === t && t.n > 0 ? (row ? row.title : t.why) : '';
                return '<li><button type="button" class="om-tool is-' + state + '" data-go="' + esc(t.tab) + '" data-wire="tool" aria-label="' + esc(t.label + '：' + (t.n ? '要対応 ' + t.n + '件' : off ? '未設定' : '順調') + (lt ? '、最後の操作 ' + when(lt.at) : '')) + '">' +
                  '<span class="om-ic">' + t.icon + '</span>' +
                  '<span class="om-tt"><b>' + esc(t.label) + '</b><small><i class="om-dot ' + state + '"></i>' + (t.n ? '要対応 ' + t.n : off ? '未設定' : '順調') + (lt ? '・' + esc(when(lt.at)) : '') + '</small></span>' +
                  (t.n ? '<span class="om-n">' + t.n + '</span>' : '') +
                  (bubble ? '<span class="om-bubble" title="' + esc(bubble) + '">' + esc(bubble) + '</span>' : '') + '</button></li>';
              }).join('') + '</ul></section>';
          }).join('') + '</div>' +
        '</div>' +
        '<aside class="om-side">' +
          '<h3><span class="om-diamond" aria-hidden="true"></span>自動で動く仕組み</h3>' +
          automation().map(function (a) {
            return '<button type="button" class="om-auto' + (a.warn ? ' is-warn' : '') + '" data-go="' + a.tab + '"><b>' + esc(a.name) + '</b><small>' + esc(a.role) + '</small><em><i class="om-dot ' + (a.warn ? 'ng' : a.ok ? 'ok' : 'off') + '"></i>' + esc(a.meta) + '</em></button>';
          }).join('') +
          (M.staff && M.staff.length ? '<h3 class="om-h-staff">担当者</h3>' + M.staff.slice(0, 6).map(function (p) {
            var lbl = window.lumStaff && window.lumStaff.LABEL ? window.lumStaff.LABEL[p.role] || p.role : p.role;
            return '<div class="om-person' + (p.active === false ? ' is-off' : '') + '"><span class="om-av sm">' + esc(String(p.name || '?').charAt(0)) + '</span><span><b>' + esc(p.name) + '</b><small>' + esc(lbl) + (p.lastLoginAt ? '・最終ログイン ' + esc(when(p.lastLoginAt)) : '・まだログインなし') + '</small></span></div>';
          }).join('') : '') +
        '</aside>' +
      '</div>' +
      ticker();
    box.innerHTML = html;
    box.classList.toggle('is-still', M.still || reduce);
    box.querySelectorAll('[data-go]').forEach(function (b) { b.addEventListener('click', function () { if (window.lumShowTab) window.lumShowTab(b.getAttribute('data-go')); }); });
    el('om-still').addEventListener('click', function () {
      M.still = !M.still;
      try { localStorage.setItem('lum_ops_still', M.still ? '1' : '0'); } catch (_) {}
      paint();
    });
    requestAnimationFrame(wires);
  }
  function chip(label, v, cls) { return '<span class="om-chip' + (cls ? ' ' + cls : '') + '"><small>' + esc(label) + '</small><b>' + esc(v) + '</b></span>'; }

  function ticker() {
    var items = (M.audit || []).slice(0, 18);
    if (!items.length) {
      var rows = [];
      try { rows = M.src && window.lumPortalCore ? window.lumPortalCore.buildToday(M.src, Date.now()).todo.slice(0, 8) : []; } catch (_) {}
      if (!rows.length) return '';
      return '<div class="om-ticker" aria-label="いまの用件"><div class="om-track">' + [0, 1].map(function () {
        return rows.map(function (r) { return '<span><b>' + esc(r.count) + esc(r.unit || '') + '</b>' + esc(r.title) + '</span>'; }).join('');
      }).join('') + '</div></div>';
    }
    var one = items.map(function (e) {
      var what = e.result === 'login' ? 'ログイン' : e.result === 'failed' ? 'ログインに失敗' : (e.actLabel || e.act || '操作');
      var area = { inquiries: '問い合わせ', booking: '予約', reviews: '口コミ', quotes: '見積書', members: '会員', news: 'お知らせ', sns: 'SNS', video: '動画', copy: '文章', seo: 'SEO', analytics: '解析', auto: '自動改善', advisor: 'AI', settings: '設定', staff: '担当者', audit: '記録', login: '' }[e.area] || '';
      return '<span><time>' + hm(Date.parse(e.at)) + '</time><b>' + esc(e.name || e.by) + '</b><i>→</i>' + (area ? esc(area) + '：' : '') + esc(what) + (e.result === 'denied' ? '（断られた）' : '') + '</span>';
    }).join('');
    return '<div class="om-ticker" aria-label="最近の操作の記録"><div class="om-track">' + one + one + '</div></div>';
  }

  /* 線を引きます（オーナー → ポータル → 各部門 → 各ツール） */
  function wires() {
    var tree = el('om-tree'), svg = el('om-wires');
    if (!tree || !svg) return;
    var R = tree.getBoundingClientRect();
    if (!R.width) return;
    svg.setAttribute('viewBox', '0 0 ' + R.width + ' ' + R.height);
    var rel = function (n) { var r = n.getBoundingClientRect(); return { x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height }; };
    var own = el('om-owner'), hub = el('om-hub');
    if (!own || !hub) return;
    var o = rel(own), h = rel(hub), out = '';
    var curve = function (x1, y1, x2, y2, cls, tone) {
      var my = (y1 + y2) / 2;
      var d = 'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + my + ' ' + x2 + ' ' + my + ' ' + x2 + ' ' + y2;
      return '<path d="' + d + '" class="om-w ' + cls + '"' + (tone ? ' style="--tone:' + tone + '"' : '') + '/><path d="' + d + '" class="om-flow ' + cls + '"' + (tone ? ' style="--tone:' + tone + '"' : '') + '/>';
    };
    out += curve(o.x + o.w / 2, o.y + o.h, h.x + h.w / 2, h.y, 'is-main');
    var stacked = false;
    tree.querySelectorAll('.om-dept').forEach(function (sec) {
      var hd = rel(sec.querySelector('.om-dept-h')), tone = getComputedStyle(sec).getPropertyValue('--tone').trim();
      if (hd.y < h.y + h.h) stacked = true;
      out += curve(h.x + h.w / 2, h.y + h.h, hd.x + hd.w / 2, hd.y, '', tone);
      var tools = sec.querySelectorAll('.om-tool');
      if (!tools.length) return;
      var lx = hd.x + 14, lastY = hd.y + hd.h;
      tools.forEach(function (t) {
        var r = rel(t), cy = r.y + r.h / 2;
        out += '<path d="M' + lx + ' ' + cy + ' H' + r.x + '" class="om-w om-branch" style="--tone:' + tone + '"/>';
        lastY = cy;
      });
      out += '<path d="M' + lx + ' ' + (hd.y + hd.h) + ' V' + lastY + '" class="om-w om-branch" style="--tone:' + tone + '"/>' +
        '<path d="M' + lx + ' ' + (hd.y + hd.h) + ' V' + lastY + '" class="om-flow om-branch" style="--tone:' + tone + '"/>';
    });
    svg.innerHTML = stacked ? '' : out;
  }

  function tick() {
    var c = el('om-clock');
    if (!c) return;
    var now = Date.now(), d = new Date(now + JST);
    c.innerHTML = hm(now) + '<small>:' + ('0' + d.getUTCSeconds()).slice(-2) + '</small>';
  }

  function addCss() {
    if (el('om-css')) return;
    var s = document.createElement('style');
    s.id = 'om-css';
    s.textContent =
      '#opsmap-slot{min-width:0;max-width:100%}#opsmap{position:relative;min-width:0;max-width:100%;contain:inline-size;border-radius:20px;padding:16px 18px 0;color:#dbe4f5;overflow:hidden;' +
        'background:radial-gradient(120% 90% at 50% -10%,rgba(56,189,248,.10),transparent 55%),linear-gradient(180deg,#0d1730 0%,#0a1224 100%);' +
        'border:1px solid #1d2a4a;box-shadow:0 18px 50px rgba(2,6,23,.35),inset 0 1px 0 rgba(255,255,255,.05)}' +
      '#opsmap::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;background-image:linear-gradient(rgba(148,163,184,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.06) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(180deg,#000,transparent 85%)}' +
      '.om-top{position:relative;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid rgba(148,163,184,.14)}' +
      '.om-live{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;letter-spacing:.16em;color:#fda4af}' +
      '.om-live i{width:8px;height:8px;border-radius:50%;background:#f43f5e;box-shadow:0 0 0 0 rgba(244,63,94,.6);animation:omPulse 1.6s infinite}' +
      '@keyframes omPulse{70%{box-shadow:0 0 0 8px rgba(244,63,94,0)}100%{box-shadow:0 0 0 0 rgba(244,63,94,0)}}' +
      '.om-date{font-weight:700;color:#e2e8f0}.om-clock{font-size:24px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:.02em}.om-clock small{font-size:15px;color:#94a3b8}' +
      '.om-still{min-height:30px;padding:0 12px;border-radius:999px;border:1px solid rgba(148,163,184,.3);background:rgba(15,23,42,.6);color:#cbd5e1;font:inherit;font-size:12px;font-weight:700;cursor:pointer}' +
      '.om-still:hover{border-color:#93c5fd;color:#fff}' +
      '.om-gap{flex:1}' +
      '.om-chip{display:inline-flex;flex-direction:column;justify-content:center;min-width:84px;padding:6px 12px;border-radius:12px;background:rgba(15,23,42,.65);border:1px solid rgba(148,163,184,.18)}' +
      '.om-chip small{font-size:10.5px;color:#94a3b8;letter-spacing:.06em}.om-chip b{font-size:18px;color:#fff;font-variant-numeric:tabular-nums;line-height:1.25}' +
      '.om-chip.hot{border-color:rgba(244,63,94,.5);background:rgba(76,5,25,.45)}.om-chip.hot b{color:#fda4af}' +
      '.om-chip.violet{border-color:rgba(167,139,250,.45)}.om-chip.violet b{color:#c4b5fd}' +
      '.om-spark-w{display:flex;flex-direction:column;align-items:flex-end;gap:2px}.om-spark-w small{font-size:10.5px;color:#94a3b8}' +
      '.om-spark{width:150px;height:34px}.om-spark polyline{fill:none;stroke:#38bdf8;stroke-width:1.6;stroke-linejoin:round}.om-spark circle{fill:#38bdf8}' +
      '.om-body{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:16px;padding:14px 0 16px}' +
      '.om-tree{position:relative;min-width:0}' +
      '.om-wires{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}' +
      '.om-w{fill:none;stroke:var(--tone,#38bdf8);stroke-opacity:.35;stroke-width:1.5}.om-w.is-main{stroke:#38bdf8;stroke-opacity:.55;stroke-width:2}' +
      '.om-flow{fill:none;stroke:var(--tone,#38bdf8);stroke-width:2.4;stroke-linecap:round;stroke-dasharray:2 16;filter:drop-shadow(0 0 3px var(--tone,#38bdf8));animation:omFlow 1.6s linear infinite}' +
      '.om-flow.is-main{stroke:#7dd3fc}.om-flow.om-branch{stroke-width:2;animation-duration:2.4s}' +
      '@keyframes omFlow{to{stroke-dashoffset:-36}}' +
      '#opsmap.is-still .om-flow,#opsmap.is-still .om-live i,#opsmap.is-still .om-track{animation:none}' +
      '.om-row{position:relative;display:flex;justify-content:center;margin-bottom:22px}' +
      '.om-node{position:relative;display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:14px;background:rgba(15,23,42,.88);border:1px solid rgba(125,211,252,.35);box-shadow:0 0 0 1px rgba(56,189,248,.06),0 10px 30px rgba(2,6,23,.45)}' +
      '.om-node small{display:block;font-size:11px;color:#94a3b8;letter-spacing:.04em}.om-node b{display:block;font-size:17px;color:#fff;letter-spacing:.02em}' +
      '.om-node em{display:flex;align-items:center;gap:5px;font-style:normal;font-size:11.5px;color:#86efac}' +
      '.om-owner{border-color:rgba(255,255,255,.55);box-shadow:0 0 22px rgba(56,189,248,.25)}' +
      '.om-hub{border-color:rgba(56,189,248,.6)}' +
      '.om-hub-mark{width:34px;height:34px;border-radius:10px;background:conic-gradient(from 210deg,#2563eb,#22d3ee,#a78bfa,#2563eb);box-shadow:0 0 18px rgba(56,189,248,.45)}' +
      '.om-av{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;flex:none;font-weight:800;color:#fff;background:linear-gradient(135deg,#1e40af,#38bdf8);box-shadow:0 0 0 2px rgba(255,255,255,.25)}' +
      '.om-av.sm{width:30px;height:30px;font-size:13px}' +
      '.om-depts{position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}' +
      '.om-dept{position:relative;min-width:0}' +
      '.om-dept-h{position:relative;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;padding:8px 12px;border-radius:12px;background:rgba(15,23,42,.9);border:1px solid color-mix(in srgb,var(--tone) 55%,transparent);box-shadow:inset 3px 0 0 var(--tone)}' +
      '.om-dept-h b{font-size:13.5px;color:#f1f5f9}.om-dept-h span{font-size:11px;color:#94a3b8;font-variant-numeric:tabular-nums}' +
      '.om-dept ul{list-style:none;margin:0;padding:0 0 0 16px;display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.om-dept li{min-width:0}' +
      '.om-tool{position:relative;display:flex;align-items:center;gap:10px;width:100%;min-height:52px;padding:8px 10px;border-radius:12px;text-align:left;cursor:pointer;font:inherit;color:#e2e8f0;' +
        'background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.2);transition:border-color .2s,transform .2s,box-shadow .2s}' +
      '.om-tool:hover{border-color:color-mix(in srgb,var(--tone) 70%,#fff);transform:translateY(-1px);box-shadow:0 8px 22px rgba(2,6,23,.5)}' +
      '.om-tool.is-ng{border-color:rgba(244,63,94,.55);box-shadow:0 0 0 1px rgba(244,63,94,.15),0 0 18px rgba(244,63,94,.12)}' +
      '.om-ic{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:10px;flex:none;color:#fff;background:color-mix(in srgb,var(--tone) 30%,#0f172a);border:1px solid color-mix(in srgb,var(--tone) 55%,transparent)}' +
      '.om-ic .ui-icon{width:18px;height:18px}.om-ic .ui-icon .duo{opacity:.3}' +
      '.om-tt{min-width:0;flex:1}.om-tt b{display:block;font-size:13px;color:#f8fafc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.om-tt small{display:flex;align-items:center;gap:5px;font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.om-dot{display:inline-block;width:7px;height:7px;border-radius:50%;flex:none;background:#64748b}.om-dot.ok{background:#22c55e;box-shadow:0 0 6px #22c55e}.om-dot.ng{background:#f43f5e;box-shadow:0 0 6px #f43f5e}' +
      '.om-n{min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#f43f5e;color:#fff;font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}' +
      '.om-bubble{position:relative;display:block;margin-top:0;padding:4px 9px;border-radius:8px;background:#f8fafc;color:#0f172a;font-size:11.5px;font-weight:700;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 12px rgba(2,6,23,.35);animation:omPop 3.2s ease-in-out infinite}' +
      '.om-tool{flex-wrap:wrap}.om-bubble{flex:1 1 100%;min-width:0}' +
      '@keyframes omPop{50%{box-shadow:0 4px 12px rgba(2,6,23,.35),0 0 0 3px color-mix(in srgb,var(--tone) 35%,transparent)}}#opsmap.is-still .om-bubble{animation:none}' +
      '.om-side{position:relative;display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:16px;background:rgba(15,23,42,.55);border:1px solid rgba(167,139,250,.25)}' +
      '.om-side h3{display:flex;align-items:center;gap:8px;margin:2px 2px 4px;font-size:14px;color:#ede9fe}' +
      '.om-diamond{width:10px;height:10px;transform:rotate(45deg);background:linear-gradient(135deg,#a78bfa,#38bdf8);border-radius:2px}' +
      '.om-h-staff{margin-top:10px!important}' +
      '.om-auto{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:9px 12px;border-radius:12px;text-align:left;cursor:pointer;font:inherit;color:#e2e8f0;background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.2);box-shadow:inset 3px 0 0 #a78bfa}' +
      '.om-auto:hover{border-color:#a78bfa}.om-auto.is-warn{box-shadow:inset 3px 0 0 #f43f5e}' +
      '.om-auto b{font-size:13px;color:#f8fafc}.om-auto small{font-size:11px;color:#94a3b8}.om-auto em{display:flex;align-items:center;gap:5px;font-style:normal;font-size:11.5px;color:#cbd5e1}' +
      '.om-person{display:flex;align-items:center;gap:10px;padding:6px 4px}.om-person b{display:block;font-size:13px;color:#f8fafc}.om-person small{display:block;font-size:11px;color:#94a3b8}.om-person.is-off{opacity:.5}' +
      '.om-ticker{position:relative;margin:0 -18px;padding:10px 0;border-top:1px solid rgba(148,163,184,.14);background:rgba(2,6,23,.45);overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}' +
      '.om-track{display:inline-flex;gap:34px;white-space:nowrap;padding-left:18px;animation:omMarquee 70s linear infinite}' +
      '.om-ticker:hover .om-track{animation-play-state:paused}' +
      '@keyframes omMarquee{to{transform:translateX(-50%)}}' +
      '.om-track span{font-size:12.5px;color:#cbd5e1}.om-track time{color:#7dd3fc;font-weight:700;margin-right:8px;font-variant-numeric:tabular-nums}.om-track b{color:#fff;margin-right:4px}.om-track i{font-style:normal;color:#22c55e;margin:0 6px}' +
      '@media (max-width:1499px){.om-body{grid-template-columns:minmax(0,1fr)}.om-side{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));align-items:start}.om-side h3{grid-column:1/-1}}' +
      '@media (max-width:640px){#opsmap{padding:14px 12px 0;border-radius:16px}.om-clock{font-size:20px}.om-spark-w{display:none}.om-chip{min-width:0;flex:1 1 40%}.om-depts{grid-template-columns:minmax(0,1fr)}.om-dept ul{padding-left:18px}.om-ticker{margin:0 -12px}}' +
      '@media (prefers-reduced-motion:reduce){.om-flow,.om-live i,.om-bubble,.om-track{animation:none!important}.om-ticker{overflow-x:auto}}';
    document.head.appendChild(s);
  }

  window.lumOpsMapMount = function (slot) {
    addCss();
    var box = el('opsmap');
    if (!box) {
      box = document.createElement('section');
      box.id = 'opsmap';
      box.setAttribute('aria-label', '運営マップ（いまの動き）');
    }
    slot.appendChild(box);
    paint();
    if (!M.at) loadMore();
    if (!M.clock) M.clock = setInterval(tick, 1000);
    if (!M.timer) M.timer = setInterval(function () {
      var p = el('portal');
      if (p && p.style.display !== 'none' && !document.hidden) loadMore();
    }, 60000);
  };
  window.addEventListener('lum:portal', function (e) { M.src = e.detail; paint(); });
  window.addEventListener('resize', function () { requestAnimationFrame(wires); });
  // 左のメニューの数が変わったら（各ツールの数え直し）、マップも描き直します
  setInterval(function () { if (el('opsmap') && el('portal') && el('portal').style.display !== 'none') { var k = depKey(); if (k !== M.key) { M.key = k; paint(); } } }, 5000);
  function depKey() { return Array.prototype.map.call(document.querySelectorAll('#shell-nav .nav-count, #shell-nav .inq-badge, #shell-nav .bk-badge, #shell-nav .rev-badge'), function (b) { return b.textContent; }).join(','); }
})();
