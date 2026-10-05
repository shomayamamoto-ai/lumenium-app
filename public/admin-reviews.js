/* ---- 口コミ管理（Googleレビュー） ----
   Google マップ・検索に出るお店の口コミを、ここで読んで返信するための画面。
   管理画面（admin-members.html）の1タブです。

   できること。
     ・口コミの一覧（未返信・返信済み・星の数で絞る、探す、並べ替え）
     ・返信を出す・直す・消す（出す前に必ず確認します。出した返信は Google に公開されます）
     ・AIに返信の下書きを頼む（そのままは出ません。読んで直してから出します）
     ・数字：月ごとの平均、星ごとの件数、返信した割合と返信までの時間、よく出る言葉
     ・来店されたお客様への口コミのお願い（全員に同じ文面・見返りなし）と、店頭用のQRコード

   計算は /reviews-core.js（api/_reviews-core.js から自動で作るもの）、
   読み書きは api/reviews.js です。 */
(function () {
  'use strict';
  var TAB = 'reviews-admin';
  var el = function (id) { return document.getElementById(id); };
  var S = {
    started: false, sec: 'inbox', filter: 'unreplied', q: '', sort: 'new', loc: '', open: '',
    data: null, draft: {}, locList: null, busy: false
  };
  var SECTIONS = [['inbox', '口コミ'], ['stats', '数字'], ['ask', 'お願い・QR'], ['settings', '設定']];
  var core = function () { return window.lumReviewsCore; };

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function demo() { try { return sessionStorage.getItem('lum_demo') === '1'; } catch (_) { return false; } }
  function say(t, info) {
    var m = el('rev-msg');
    if (!m) return;
    m.textContent = t || '';
    m.classList.toggle('show', !!t);
    m.classList.toggle('info', !!info);
  }
  async function api(url, opts) {
    try { return await window.lumAdmin.fetch(url, opts); }
    catch (_) { return { res: { ok: false, status: 0 }, data: { ok: false, message: '通信できませんでした。ネットの接続を確かめて、もう一度お試しください。' } }; }
  }
  function send(body) {
    return api('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  /* 計算のファイル（/reviews-core.js）は、このタブを開いたときに1回だけ読みます。 */
  var coreWait = null;
  function loadCore() {
    if (core()) return Promise.resolve();
    if (coreWait) return coreWait;
    coreWait = new Promise(function (ok, ng) {
      var s = document.createElement('script');
      s.src = '/reviews-core.js';
      s.onload = function () { ok(); };
      s.onerror = function () { coreWait = null; ng(new Error('core')); };
      document.head.appendChild(s);
    });
    return coreWait;
  }

  /* 日本時間の「2026/9/20」 */
  function day(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return '—';
    var d = new Date(t + 9 * 3600000);
    return d.getUTCFullYear() + '/' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
  }
  function when(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return '—';
    var d = new Date(t + 9 * 3600000);
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
  }
  function hours(h) {
    if (h == null || !isFinite(h)) return '—';
    if (h < 1) return Math.max(1, Math.round(h * 60)) + '分';
    if (h < 48) return (Math.round(h * 10) / 10) + '時間';
    return (Math.round(h / 24 * 10) / 10) + '日';
  }
  function pct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }
  function stars(n) {
    n = Math.max(0, Math.min(5, n || 0));
    return '<span class="rev-stars" aria-label="星' + n + '">' + '★★★★★'.slice(0, n) + '<span class="off">' + '★★★★★'.slice(0, 5 - n) + '</span></span>';
  }
  function avgText(a) { return a == null ? '—' : (Math.round(a * 10) / 10).toFixed(1); }

  var CSS =
    '#reviews-admin .rev-top{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:14px}' +
    '.rev-card{border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:#fff;min-width:0}' +
    '.rev-card .k{font-size:11px;font-weight:700;color:var(--sub)}.rev-card .v{font-size:20px;font-weight:800;line-height:1.3;overflow-wrap:anywhere}' +
    '.rev-card .n{font-size:11px;color:var(--sub);line-height:1.6}.rev-card.warn{border-color:#d97706;background:rgba(251,191,36,.08)}' +
    '.rev-note{border:1px solid var(--border);border-left:4px solid #b45309;border-radius:10px;padding:9px 12px;margin-bottom:10px;font-size:12.5px;line-height:1.75;background:#fffdf7}' +
    '.rev-note.red{border-left-color:#b42318;background:#fff8f7}.rev-note.gray{border-left-color:var(--sub);background:#faf9f6}.rev-note.blue{border-left-color:#3d3fbf;background:#f7f7ff}' +
    '.rev-note b{font-weight:800}.rev-steps{margin:6px 0 0 1.3em;padding:0;font-size:12.5px;line-height:1.8}' +
    '.rev-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}' +
    '.rev-bar input[type=search]{flex:1 1 200px;min-width:0;padding:9px 12px;border:1px solid var(--border);border-radius:10px;background:#faf9f6;font:inherit;font-size:13px}' +
    '.rev-bar select{flex:0 1 auto;max-width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:#faf9f6;font:inherit;font-size:12.5px}' +
    '#reviews-admin button{transition:none}#reviews-admin .rev-acts button,#reviews-admin .rev-bar button{font-size:12px;padding:8px 13px}' +
    '.rev-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--border)}' +
    '.rev-list li{border-bottom:1px solid var(--border)}' +
    '.rev-open{display:block;width:100%;text-align:left;background:none;border:0;padding:11px 2px;color:var(--text);font:inherit;font-weight:400;cursor:pointer;letter-spacing:0}' +
    '.rev-open:hover{filter:none;background:#faf9f6}.rev-open:focus-visible{outline:2px solid #3d3fbf;outline-offset:2px;border-radius:4px}' +
    '.rev-open .who{font-size:13.5px;font-weight:700;overflow-wrap:anywhere}.rev-open .meta{font-size:11.5px;color:var(--sub);line-height:1.7}' +
    '.rev-open .snip{font-size:12.5px;line-height:1.7;color:#33333b;overflow-wrap:anywhere;margin-top:2px}' +
    '.rev-stars{color:#b45309;letter-spacing:1px;font-size:13px;white-space:nowrap}.rev-stars .off{color:#d6d3cc}' +
    '.rev-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 8px;border-radius:999px;background:#f3f1ec;color:var(--sub);margin:0 4px 2px 0;white-space:nowrap}' +
    '.rev-tag.new{background:rgba(180,35,24,.1);color:#b42318}.rev-tag.ok{background:rgba(16,185,129,.16);color:#047857}' +
    '.rev-sec{border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-top:12px;background:#fff;min-width:0}' +
    '.rev-sec h4{font-size:12px;letter-spacing:.08em;color:var(--sub);font-weight:700;margin:0 0 8px}' +
    '.rev-body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13.5px;line-height:1.85}' +
    '.rev-d h3{font-size:16px;font-weight:800;margin:6px 0 2px;overflow-wrap:anywhere}' +
    '.rev-acts{display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
    '#reviews-admin textarea,#reviews-admin .rev-in,#reviews-admin .rev-sel{width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:10px;background:#faf9f6;font:inherit;font-size:13px;line-height:1.6}' +
    '#reviews-admin textarea{resize:vertical}#reviews-admin .rev-in.num{width:120px}' +
    '.rev-count{font-size:11px;color:var(--sub);margin:4px 0 8px}.rev-count.over{color:#b42318;font-weight:700}' +
    '.rev-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:12px}' +
    '.rev-tbl{width:100%;border-collapse:collapse;font-size:12.5px}.rev-tbl td,.rev-tbl th{padding:6px 6px;border-bottom:1px solid var(--border);text-align:left;vertical-align:middle}' +
    '.rev-tbl th{font-size:11px;color:var(--sub);font-weight:700}.rev-tbl td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}' +
    '.rev-meter{display:block;height:8px;border-radius:4px;background:#3d3fbf;min-width:2px}.rev-meter.amber{background:#b45309}' +
    '.rev-kw{display:flex;flex-wrap:wrap;gap:6px}.rev-kw span{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:3px 10px;font-size:12px;background:#fff}' +
    '.rev-kw span.low{border-color:#f1b7b0;background:#fff8f7}.rev-kw small{color:var(--sub);margin-left:4px}' +
    '.rev-field{margin:10px 0}.rev-field label,.rev-field .lb{display:block;font-size:12px;font-weight:700;margin-bottom:4px}' +
    '.rev-field .hint{font-size:11px;color:var(--sub);line-height:1.6;margin-top:3px}' +
    '.rev-radio{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.6;margin:6px 0}.rev-radio input{width:18px;height:18px;margin-top:2px;flex:none}' +
    '.rev-qr{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}.rev-qr .box{width:180px;max-width:100%;border:1px solid var(--border);border-radius:10px;padding:8px;background:#fff}' +
    '.rev-qr .box svg{display:block;width:100%;height:auto}.rev-qr .txt{flex:1 1 220px;min-width:0;font-size:12.5px;line-height:1.8;overflow-wrap:anywhere}' +
    '.rev-badge{display:inline-block;min-width:18px;margin-left:6px;padding:0 6px;border-radius:999px;background:#b42318;color:#fff;font-size:10.5px;font-weight:800;line-height:18px;text-align:center;vertical-align:1px}' +
    '.rev-loc{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px dashed var(--border);font-size:12.5px;line-height:1.6}.rev-loc input{width:18px;height:18px;margin-top:2px;flex:none}' +
    '@media (max-width:560px){#reviews-admin .rev-top{grid-template-columns:1fr 1fr}.rev-card .v{font-size:18px}.rev-tbl{font-size:12px}}';

  function addCss() {
    if (el('rev-css')) return;
    var s = document.createElement('style');
    s.id = 'rev-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- タブとポータルの「未返信」の印 ---------------- */

  function setBadge(n) {
    ['tab-' + TAB, 'pnode-' + TAB].forEach(function (id) {
      var host = el(id);
      if (!host) return;
      var target = host.querySelector(id.indexOf('tab-') === 0 ? 'span' : '.pn-name') || host;
      var b = target.querySelector('.rev-badge');
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'rev-badge'; target.appendChild(b); }
      b.textContent = n > 99 ? '99+' : String(n);
      b.setAttribute('aria-label', '未返信 ' + n + '件');
    });
  }
  window.lumRevBadge = async function () {
    addCss();
    var r = await api('/api/reviews?view=badge');
    setBadge(r.data && r.data.ok ? r.data.unreplied || 0 : 0);
  };
  /* タブはログインのあとに作られます。管理画面の本体には手を入れず、タブが
     現れたところで1回だけ印を取りに行きます。 */
  (function watchTabs() {
    var done = false;
    function check() {
      if (done || !el('tab-' + TAB) || !window.lumAdmin) return;
      done = true;
      if (obs) obs.disconnect();
      window.lumRevBadge();
    }
    var obs = window.MutationObserver ? new MutationObserver(check) : null;
    function go() {
      if (obs) obs.observe(document.body, { childList: true, subtree: true });
      check();
    }
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  })();

  /* ---------------- 骨組み ---------------- */

  function shell() {
    var host = el(TAB);
    host.innerHTML =
      '<h2 style="font-size:15px;font-weight:700;margin-bottom:4px">口コミ管理（Googleレビュー）</h2>' +
      '<p class="share-note" style="margin-bottom:12px">Google マップ・検索に出るお店の口コミを読み、返信します。ここで出した返信は、お店の名前で Google に公開されます。' +
      '口コミの読み直しは毎朝9時ごろに自動で行います（「今すぐ同期」でいつでも）。</p>' +
      '<div class="nq-row" role="tablist" aria-label="口コミ管理の項目">' + SECTIONS.map(function (s) {
        return '<button type="button" class="nq-chip" data-rsec="' + s[0] + '" aria-pressed="false">' + s[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="msg" id="rev-msg" style="margin:0 0 12px"></p>' +
      '<div id="rev-body"></div>';
    host.querySelectorAll('[data-rsec]').forEach(function (b) {
      b.addEventListener('click', function () { S.open = ''; go(b.getAttribute('data-rsec')); });
    });
  }

  function go(sec) {
    S.sec = sec;
    try { sessionStorage.setItem('lum_rev_sec', sec); } catch (_) {}
    document.querySelectorAll('#' + TAB + ' [data-rsec]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-rsec') === sec ? 'true' : 'false');
    });
    say('');
    var body = el('rev-body');
    if (!S.data) { body.innerHTML = '<p class="soc-small">読み込んでいます…</p>'; return; }
    if (sec === 'inbox') return S.open ? detail(body, S.open) : inbox(body);
    if (sec === 'stats') return statsView(body);
    if (sec === 'ask') return askView(body);
    return settingsView(body);
  }

  async function load() {
    var r = await api('/api/reviews');
    if (!r.data || !r.data.reviews) {
      el('rev-body').innerHTML = '<div class="rev-note red">' + esc((r.data && r.data.message) || '読み込めませんでした。') + '</div>';
      return false;
    }
    S.data = r.data;
    setBadge(core().filterCounts(S.data.reviews).unreplied);
    return true;
  }

  /* ---------------- つながり（つながっていないときの手順） ---------------- */

  function connectNote(d) {
    var c = d.connection || {};
    if (c.ok) return '';
    var gbpButtons = ['no_client', 'no_store'].indexOf(c.state) === -1;
    return '<div class="rev-note' + (c.state === 'not_approved' || c.state === 'expired' ? ' red' : '') + '">' +
      '<b>' + esc(c.message || 'まだ使えません') + '</b>' +
      (c.detail ? '<div class="soc-small" style="margin-top:2px">Google の返事：' + esc(c.detail) + '</div>' : '') +
      '<ol class="rev-steps">' + (c.steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<div class="rev-acts" style="margin-top:8px">' +
        (gbpButtons ? '<button type="button" class="ghost" id="rev-link">Googleビジネスプロフィールを連携</button>' +
          '<button type="button" class="ghost" id="rev-pick">店舗を選ぶ</button>' : '') +
        (c.state === 'no_client' || c.state === 'no_store' ? '<button type="button" class="ghost" id="rev-keys">設定状況を開く</button>' : '') +
        '<button type="button" class="ghost" id="rev-reload">状態を再取得</button>' +
      '</div><div id="rev-conn-out" class="soc-small" style="margin-top:6px"></div>' +
      (c.state === 'not_approved' ? '' : '<div class="soc-small" style="margin-top:6px">連携の前でも、口コミへの返信は Google マップのアプリや、検索結果のお店の欄から直接できます。</div>') +
      '</div>';
  }
  function bindConnect() {
    if (el('rev-link')) el('rev-link').addEventListener('click', connectGbp);
    if (el('rev-pick')) el('rev-pick').addEventListener('click', function () { S.open = ''; go('settings'); setTimeout(pickLocations, 0); });
    if (el('rev-keys')) el('rev-keys').addEventListener('click', function () { if (window.lumShowTab) window.lumShowTab('health-admin'); });
    if (el('rev-reload')) el('rev-reload').addEventListener('click', async function () { say(''); await load(); go(S.sec); });
  }
  async function connectGbp() {
    var out = el('rev-conn-out');
    if (demo()) { out.textContent = 'デモ版のため連携は始めません。'; return; }
    var w = window.open('', '_blank');
    var r = await api('/api/google-oauth?start=1&for=gbp');
    var d = r.data || {};
    if (!d.ok || !d.url) { if (w) w.close(); out.textContent = d.message || '始められませんでした。'; return; }
    if (w) w.location = d.url; else location.href = d.url;
    out.textContent = '開いたタブで Google の許可を済ませてから、「状態を再取得」を押してください。';
  }

  function topCards(d) {
    var list = d.reviews;
    var c = core().filterCounts(list);
    var rs = core().replyStats(list);
    var g = (d.locations || []).filter(function (l) { return l.avg != null; });
    var gAvg = g.length === 1 ? g[0].avg : null;
    var gTotal = g.reduce(function (n, l) { return n + (l.total || 0); }, 0);
    return '<div class="rev-top">' +
      card('平均の星', gAvg != null ? avgText(gAvg) : avgText(core().reviewStats(list).avg),
        gAvg != null ? 'Google に出ている値（' + gTotal + '件）' : 'ここにある' + list.length + '件から', '') +
      card('未返信', c.unreplied + '件', c.unreplied ? '返信がまだの口コミ' : 'すべて返信済みです', c.unreplied ? ' warn' : '') +
      card('返信した割合', pct(rs.rate), rs.replied + ' / ' + rs.total + '件', '') +
      card('最後の同期', d.lastSync ? when(d.lastSync) : '—', d.lastSync ? '毎朝9時ごろにも自動で' : 'まだ一度も読んでいません', '') +
      '</div>';
  }
  function card(k, v, n, cls) {
    return '<div class="rev-card' + cls + '"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div><div class="n">' + esc(n) + '</div></div>';
  }

  async function sync(full) {
    if (S.busy) return;
    S.busy = true;
    say('Google から読み直しています…', true);
    var r = await send({ action: 'sync', full: !!full });
    S.busy = false;
    var d = r.data || {};
    if (d.reviews) S.data = d;
    if (d.reviews) setBadge(core().filterCounts(d.reviews).unreplied);
    go(S.sec);
    say(d.message || (d.ok ? '読み直しました。' : '読み直せませんでした。'), !!d.ok);
  }

  /* ---------------- 一覧 ---------------- */

  function inbox(body) {
    var d = S.data;
    var C = core();
    var counts = C.filterCounts(S.loc ? d.reviews.filter(function (r) { return r.location === S.loc; }) : d.reviews);
    var locs = d.locations || [];
    body.innerHTML = connectNote(d) + topCards(d) +
      '<div class="nq-row" aria-label="絞り込み">' + C.FILTERS.map(function (f) {
        return '<button type="button" class="nq-chip" data-rfil="' + f[0] + '" aria-pressed="' + (S.filter === f[0]) + '">' + f[1] + '（' + counts[f[0]] + '）</button>';
      }).join('') + '</div>' +
      '<div class="rev-bar">' +
        '<label for="rev-q" style="position:absolute;left:-9999px">検索</label>' +
        '<input type="search" id="rev-q" placeholder="本文・名前・返信の文で探す" value="' + esc(S.q) + '">' +
        '<label for="rev-sort" style="position:absolute;left:-9999px">並べ替え</label>' +
        '<select id="rev-sort">' + C.SORTS.map(function (s) { return '<option value="' + s[0] + '"' + (S.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select>' +
        (locs.length > 1 ? '<label for="rev-loc" style="position:absolute;left:-9999px">店舗</label><select id="rev-loc"><option value="">すべての店舗</option>' +
          locs.map(function (l) { return '<option value="' + esc(l.name) + '"' + (S.loc === l.name ? ' selected' : '') + '>' + esc(l.title || l.name) + '</option>'; }).join('') + '</select>' : '') +
        '<button type="button" class="ghost" id="rev-sync"' + (d.connection && d.connection.ok ? '' : ' disabled') + '>今すぐ同期</button>' +
      '</div>' +
      '<ul class="rev-list" id="rev-list"></ul>';
    bindConnect();
    body.querySelectorAll('[data-rfil]').forEach(function (b) {
      b.addEventListener('click', function () { S.filter = b.getAttribute('data-rfil'); inbox(body); });
    });
    el('rev-q').addEventListener('input', function () { S.q = this.value; renderList(); });
    el('rev-sort').addEventListener('change', function () { S.sort = this.value; renderList(); });
    if (el('rev-loc')) el('rev-loc').addEventListener('change', function () { S.loc = this.value; inbox(body); });
    el('rev-sync').addEventListener('click', function () { sync(false); });
    renderList();
  }

  function renderList() {
    var host = el('rev-list');
    if (!host) return;
    var list = core().filterReviews(S.data.reviews, { filter: S.filter, q: S.q, sort: S.sort, location: S.loc });
    if (!list.length) {
      host.innerHTML = '<li class="soc-small" style="padding:14px 2px">' + (S.data.reviews.length
        ? (S.filter === 'unreplied' && !S.q ? '未返信の口コミはありません。' : '当てはまる口コミはありません。')
        : 'まだ口コミがありません（連携して「今すぐ同期」を押すと、ここに出ます）。') + '</li>';
      return;
    }
    host.innerHTML = list.slice(0, 300).map(function (r) {
      var snip = r.comment ? r.comment.replace(/\s+/g, ' ').slice(0, 110) + (r.comment.length > 110 ? '…' : '') : '（本文なし・星だけ）';
      return '<li><button type="button" class="rev-open" data-rid="' + esc(r.id) + '">' +
        '<div class="who">' + stars(r.stars) + ' ' + esc(r.author || 'Google ユーザー') + '</div>' +
        '<div class="meta">' + day(r.createdAt) + ' ' + (r.reply ? '<span class="rev-tag ok">返信済み</span>' : '<span class="rev-tag new">未返信</span>') + '</div>' +
        '<div class="snip">' + esc(snip) + '</div></button></li>';
    }).join('') + (list.length > 300 ? '<li class="soc-small" style="padding:10px 2px">ほか ' + (list.length - 300) + ' 件。絞り込みや検索で探してください。</li>' : '');
    host.querySelectorAll('[data-rid]').forEach(function (b) {
      b.addEventListener('click', function () { S.open = b.getAttribute('data-rid'); detail(el('rev-body'), S.open); window.scrollTo(0, el(TAB).offsetTop - 10); });
    });
  }

  /* ---------------- 1件と返信 ---------------- */

  function find(id) { return (S.data.reviews || []).filter(function (r) { return r.id === id; })[0] || null; }

  function detail(body, id) {
    var r = find(id);
    if (!r) { S.open = ''; return inbox(body); }
    var low = r.stars > 0 && r.stars <= 2;
    var ai = S.data.ai || {};
    var text = S.draft[id] != null ? S.draft[id] : (r.reply ? r.reply.text : '');
    body.innerHTML = '<div class="rev-d">' +
      '<button type="button" class="ghost" id="rev-back" style="font-size:12px;padding:7px 12px">← 一覧に戻る</button>' +
      '<h3>' + stars(r.stars) + ' ' + esc(r.author || 'Google ユーザー') + '</h3>' +
      '<div class="soc-small">' + day(r.createdAt) + ' に投稿' + (r.updatedAt && r.updatedAt !== r.createdAt ? '（' + day(r.updatedAt) + ' に更新）' : '') + '</div>' +
      '<div class="rev-sec"><h4>口コミ</h4><div class="rev-body">' + esc(r.comment || '（本文なし。星だけの口コミです）') + '</div></div>' +
      (r.reply ? '<div class="rev-sec"><h4>いま出ている返信（' + day(r.reply.at) + '）</h4><div class="rev-body">' + esc(r.reply.text) + '</div></div>' : '') +
      (low ? '<div class="rev-note" style="margin-top:12px"><b>星が少ない口コミへの返信のコツ</b><br>' +
        'まずお詫びと、書いてくださったことへのお礼を。原因の言い訳や反論はしない方が、読む人（これからのお客様）に伝わります。' +
        '「責任をすべて認める」言い方や、返金・割引の約束は書かずに、「詳しく伺いたいので、お店に直接ご連絡ください」と案内するのがおすすめです。' +
        'お客様の来店日や内容など、個人のことには触れないでください。</div>' : '') +
      '<div class="rev-sec"><h4>' + (r.reply ? '返信を直す' : '返信を書く') + '</h4>' +
        '<label for="rev-text" style="position:absolute;left:-9999px">返信</label>' +
        '<textarea id="rev-text" rows="7" placeholder="ご来店ありがとうございました。…">' + esc(text) + '</textarea>' +
        '<div class="rev-count" id="rev-count"></div>' +
        '<div class="rev-acts">' +
          '<button type="button" id="rev-post">' + (r.reply ? '返信を直して出す' : '返信を出す') + '</button>' +
          '<button type="button" class="ghost" id="rev-ai"' + (ai.ready || demo() ? '' : ' disabled') + '>AIで下書き</button>' +
          (r.reply ? '<button type="button" class="ghost" id="rev-del">返信を消す</button>' : '') +
        '</div>' +
        '<div class="soc-small" style="margin-top:8px">' + (ai.ready || demo()
          ? 'AIの下書きは、お店の口調・署名（「設定」）で作ります。AIに渡すのは口コミの本文・星・投稿者の表示名だけです。書かれていない事実は作らないように指示していますが、出す前に必ず読んで直してください。' +
            '今月のAIの利用額の目安：約' + (ai.yen || 0) + '円 / 上限 ' + (ai.cap || 0) + '円（' + (ai.calls || 0) + '回）。'
          : 'AIのキー（ANTHROPIC_API_KEY）を入れると、返信の下書きを作れます。手で書いて出すことはいつでもできます。') + '</div>' +
      '</div></div>';
    el('rev-back').addEventListener('click', function () { S.open = ''; inbox(body); });
    var ta = el('rev-text');
    var count = function () {
      var bytes = core().byteLength(ta.value);
      var max = (S.data.limits && S.data.limits.replyBytes) || 4096;
      var c = el('rev-count');
      c.textContent = ta.value.length + '字' + (bytes > max ? '（長すぎます。Google の上限は ' + max + ' バイト・日本語でおよそ1,300字）' : '（Google の上限まで、あと日本語でおよそ' + Math.floor((max - bytes) / 3) + '字）');
      c.classList.toggle('over', bytes > max);
    };
    ta.addEventListener('input', function () { S.draft[id] = ta.value; count(); });
    count();
    el('rev-post').addEventListener('click', function () { postReply(r); });
    el('rev-ai').addEventListener('click', function () { aiDraft(r); });
    if (el('rev-del')) el('rev-del').addEventListener('click', function () { deleteReply(r); });
  }

  async function postReply(r) {
    var text = el('rev-text').value.trim();
    if (!text) { say('返信が空です。'); return; }
    if (core().byteLength(text) > ((S.data.limits && S.data.limits.replyBytes) || 4096)) { say('返信が長すぎます。短くしてください。'); return; }
    if (!confirm((r.reply ? '返信を直して、' : '') + 'この返信を Google に出します。お店の名前で、誰でも読める形で公開されます。\n\nよろしいですか？')) return;
    say('出しています…', true);
    var x = await send({ action: 'reply', id: r.id, text: text });
    var d = x.data || {};
    if (!d.ok) { say(d.message || '出せませんでした。'); return; }
    replaceItem(d.item);
    delete S.draft[r.id];
    setBadge(d.unreplied != null ? d.unreplied : core().filterCounts(S.data.reviews).unreplied);
    detail(el('rev-body'), r.id);
    say(d.message, true);
  }
  async function deleteReply(r) {
    if (!confirm('この口コミへの返信を Google から消します。消した返信は戻せません。\n\nよろしいですか？')) return;
    say('消しています…', true);
    var x = await send({ action: 'reply-delete', id: r.id });
    var d = x.data || {};
    if (!d.ok) { say(d.message || '消せませんでした。'); return; }
    replaceItem(d.item);
    setBadge(d.unreplied != null ? d.unreplied : core().filterCounts(S.data.reviews).unreplied);
    detail(el('rev-body'), r.id);
    say(d.message, true);
  }
  function replaceItem(item) {
    if (!item) return;
    S.data.reviews = S.data.reviews.map(function (x) { return x.id === item.id ? item : x; });
  }
  async function aiDraft(r) {
    var ta = el('rev-text');
    if (ta.value.trim() && !confirm('いま書いてある文を、AIの下書きで置き換えます。よろしいですか？')) return;
    var b = el('rev-ai');
    b.disabled = true;
    say('AIが下書きを書いています（10秒ほど）…', true);
    var x = await send({ action: 'draft', id: r.id });
    b.disabled = false;
    var d = x.data || {};
    if (!d.ok) { say(d.message || '下書きを作れませんでした。'); return; }
    S.draft[r.id] = d.draft;
    if (d.cost && S.data.ai) { S.data.ai.yen = d.cost.yen; S.data.ai.calls = d.cost.calls; }
    detail(el('rev-body'), r.id);
    el('rev-text').focus();
    say(d.message || '下書きを作りました。読んで直してから出してください。', true);
  }

  /* ---------------- 数字 ---------------- */

  function statsView(body) {
    var C = core();
    var list = S.loc ? S.data.reviews.filter(function (r) { return r.location === S.loc; }) : S.data.reviews;
    var st = C.reviewStats(list);
    if (!list.length) {
      body.innerHTML = connectNote(S.data) + '<p class="soc-small">口コミがまだ無いため、数字は出せません。</p>';
      bindConnect();
      return;
    }
    var cmp = st.compare;
    var maxStar = Math.max.apply(null, [1, 2, 3, 4, 5].map(function (k) { return st.stars[k]; }).concat([1]));
    var maxMonth = Math.max.apply(null, st.trend.map(function (m) { return m.count; }).concat([1]));
    var few = list.length < 10;
    body.innerHTML = connectNote(S.data) +
      (few ? '<div class="rev-note gray">口コミが ' + list.length + ' 件と少ないため、平均や割合は1件で大きく動きます。参考程度にご覧ください。</div>' : '') +
      '<div class="rev-top">' +
        card('直近30日の口コミ', cmp.cur.count + '件', 'その前の30日は ' + cmp.prev.count + '件', '') +
        card('直近30日の平均', avgText(cmp.cur.avg), 'その前の30日は ' + avgText(cmp.prev.avg), '') +
        card('直近30日の返信率', pct(cmp.cur.replyRate), 'その前の30日は ' + pct(cmp.prev.replyRate), '') +
        card('返信までの時間', hours(st.reply.medianHours), '中央値・返信した ' + st.reply.replied + '件', '') +
      '</div>' +
      '<div class="rev-grid2">' +
        '<div class="rev-sec"><h4>星ごとの件数（全 ' + st.total + '件・平均 ' + avgText(st.avg) + '）</h4><table class="rev-tbl"><tbody>' +
          [5, 4, 3, 2, 1].map(function (k) {
            var n = st.stars[k];
            return '<tr><th scope="row" style="width:5.5em">' + stars(k) + '</th><td><span class="rev-meter' + (k <= 2 ? ' amber' : '') + '" style="width:' + Math.round(n / maxStar * 100) + '%"></span></td><td class="n" style="width:4em">' + n + '件</td></tr>';
          }).join('') + '</tbody></table></div>' +
        '<div class="rev-sec"><h4>月ごとの件数と平均（口コミが書かれた月）</h4><table class="rev-tbl"><thead><tr><th>月</th><th>件数</th><th></th><th style="text-align:right">平均</th></tr></thead><tbody>' +
          st.trend.map(function (m) {
            return '<tr><td style="white-space:nowrap">' + esc(m.month.replace('-', '年').replace(/^(\d+)年0?(\d+)$/, '$1年$2月')) + '</td><td class="n">' + m.count + '</td>' +
              '<td style="width:40%"><span class="rev-meter" style="width:' + Math.round(m.count / maxMonth * 100) + '%;' + (m.count ? '' : 'background:transparent') + '"></span></td>' +
              '<td class="n">' + (m.avg == null ? '—' : avgText(m.avg)) + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
      '</div>' +
      '<div class="rev-sec"><h4>よく出る言葉（2件以上の口コミに出たもの）</h4>' +
        (st.keywords.length ? '<div class="rev-kw">' + st.keywords.map(function (k) {
          return '<span class="' + (k.avgStars <= 2.5 ? 'low' : '') + '">' + esc(k.word) + '<small>' + k.count + '件・平均★' + k.avgStars + '</small></span>';
        }).join('') + '</div>' : '<p class="soc-small">まだ目立つ言葉はありません。</p>') +
        '<p class="soc-small" style="margin-top:8px">言葉の区切りは簡単なやり方（よく出る言い方の一覧と、漢字・カタカナの続き）で数えています。赤い枠は、その言葉が出た口コミの平均が★2.5以下のもの＝気にされている点の手がかりです。</p></div>' +
      '<p class="soc-small" style="margin-top:10px">返信までの時間は、Google に残る「返信を最後に直した時刻」から数えます。あとで返信を直すと、そのぶん長く出ます。数字は、この画面に読み込んだ口コミ（最大1,500件/店舗）から計算しています。</p>';
    bindConnect();
  }

  /* ---------------- お願い・QR ---------------- */

  var MODES = [
    ['off', '送らない', 'お願いのメールは送りません（QRコードは使えます）。'],
    ['manual', '自分で選んで送る', '「来店済み」にした予約が下に並びます。送るボタンを押したものだけ送ります。'],
    ['auto', '来店済みの翌朝に自動で送る', '毎朝9時ごろ、前の日までに「来店済み」にした予約へ送ります（1日5件まで）。']
  ];

  function askView(body) {
    var d = S.data;
    var q = d.requests || {};
    var link = q.link || '';
    var lim = d.limits || { gapDays: 90, maxAgeDays: 14 };
    var problems = [];
    if (!link) problems.push('口コミを書く画面のリンクがまだありません。連携して一度同期すると自動で入ります（「設定」でプレイスIDを手で入れることもできます）。');
    if (q.mode !== 'off') {
      if (!q.mail) problems.push('メールの設定（RESEND_API_KEY）が無いため、送れません。');
      if (q.sandbox) problems.push('送信元が Resend の試用アドレスのため、お客様には届きません。送信元のドメインを設定してください。');
      if (!q.address) problems.push('送信者の住所（「設定状況」の「お知らせメールに書く住所」）が空のため、送りません。宣伝を含むメールには住所を書く決まり（特定電子メール法）があるためです。');
    }
    body.innerHTML =
      '<div class="rev-note blue"><b>口コミのお願いで、してはいけないこと</b>' +
        '<ul class="rev-steps">' +
          '<li><b>見返りを付けない。</b>「口コミを書いたら割引・プレゼント」はできません。Google の決まりで禁止されているうえ、日本では2023年10月からのステマ規制（景品表示法）の対象にもなります。実際に、割引と引き換えに星4〜5の口コミを頼んだクリニックが、消費者庁から措置命令を受けています。</li>' +
          '<li><b>良さそうな人だけに頼まない。</b>満足度を先に聞いて、満足した人だけに口コミを頼むやり方（レビューゲーティング）は Google の決まりで禁止です。この画面は、来店済みの方<b>全員に同じ文面</b>で送ります。星の数で分ける設定はありません。</li>' +
          '<li><b>書く内容を指定しない。</b>「星5で」「〇〇と書いて」とは頼みません。お願いの文面は「良かった点も、気になった点も」としています。</li>' +
          '<li>同じお客様には' + lim.gapDays + '日に1回まで。メールには配信停止のリンクを入れ、止めた方には二度と送りません。</li>' +
        '</ul></div>' +
      problems.map(function (p) { return '<div class="rev-note red">' + esc(p) + '</div>'; }).join('') +
      '<div class="rev-grid2">' +
        '<div class="rev-sec"><h4>来店後のお願いメール</h4>' +
          MODES.map(function (m) {
            return '<label class="rev-radio"><input type="radio" name="rev-mode" value="' + m[0] + '"' + (q.mode === m[0] ? ' checked' : '') + '><span><b>' + m[1] + '</b><br><span class="soc-small">' + m[2] + '</span></span></label>';
          }).join('') +
          '<div class="rev-acts" style="margin-top:6px"><button type="button" class="ghost" id="rev-mode-save">この設定にする</button><button type="button" class="ghost" id="rev-preview">文面を見る</button></div>' +
          '<pre id="rev-mail" class="rev-body" style="display:none;margin-top:10px;font-family:inherit;font-size:12.5px;background:#faf9f6;border:1px solid var(--border);border-radius:10px;padding:10px"></pre>' +
        '</div>' +
        '<div class="rev-sec"><h4>店頭に置くQRコード</h4>' +
          (link ? '<div class="rev-qr"><div class="box" id="rev-qr"></div><div class="txt">読み取ると、Google の口コミを書く画面が開きます。<br>' +
            '<span class="soc-small">' + esc(link) + '</span>' +
            '<div class="rev-acts" style="margin-top:8px"><button type="button" class="ghost" id="rev-print">印刷する</button><button type="button" class="ghost" id="rev-copy">リンクをコピー</button></div>' +
            '<div class="soc-small" style="margin-top:6px">レジ横などに置くときも、見返り（「書いたら〇〇」）は書き添えないでください。</div></div></div>'
            : '<p class="soc-small">リンクがまだ無いため、QRコードを作れません。</p>') +
        '</div>' +
      '</div>' +
      '<div class="rev-sec"><h4>来店済みの予約（来店から' + lim.maxAgeDays + '日以内）</h4>' + candidatesTable(q) + '</div>' +
      '<div class="rev-sec"><h4>送った記録</h4>' + (q.log && q.log.length ? '<table class="rev-tbl"><tbody>' + q.log.map(function (l) {
        return '<tr><td style="white-space:nowrap">' + when(l.at) + '</td><td>' + esc(l.name || '') + ' 様</td><td>' + (l.ok ? '<span class="rev-tag ok">送りました</span>' : '<span class="rev-tag new">送れませんでした</span>') + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="soc-small">まだ送っていません。</p>') + '</div>';
    if (link && el('rev-qr')) {
      try { el('rev-qr').innerHTML = core().qrSvg(core().qrEncode(link), { label: 'Google の口コミを書く画面のQRコード' }); }
      catch (e) { el('rev-qr').textContent = 'QRコードを作れませんでした。'; }
      el('rev-print').addEventListener('click', function () { printQr(link); });
      el('rev-copy').addEventListener('click', function () {
        var b = this;
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { b.textContent = 'コピーしました'; }, function () { prompt('コピーしてください', link); });
      });
    }
    el('rev-mode-save').addEventListener('click', async function () {
      var v = (body.querySelector('input[name=rev-mode]:checked') || {}).value || 'off';
      if (v === 'auto' && !confirm('来店済みにした予約へ、翌朝自動でお願いのメールを送ります（全員に同じ文面・1日5件まで）。よろしいですか？')) return;
      await savePrefs({ requests: v });
      askView(body);
    });
    el('rev-preview').addEventListener('click', function () {
      var pre = el('rev-mail');
      var m = core().requestMail({ shop: S.data.prefs.shopName, name: '〇〇', link: link || '（口コミを書く画面のリンク）', optout: '（配信停止のリンク）', address: q.address ? '（設定状況の住所）' : '', contact: S.data.prefs.contact });
      pre.textContent = '件名：' + m.subject + '\n\n' + m.text;
      pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
    });
    body.querySelectorAll('[data-send]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = b.getAttribute('data-send');
        var c = (q.candidates || []).filter(function (x) { return x.id === id; })[0];
        if (!c || !confirm(c.name + ' 様に、口コミのお願いのメールを送ります（全員と同じ文面です）。よろしいですか？')) return;
        b.disabled = true;
        var x = await send({ action: 'request-send', id: id });
        var d2 = x.data || {};
        say(d2.message || (d2.ok ? '送りました。' : '送れませんでした。'), !!d2.ok);
        if (d2.ok) { await load(); askView(body); } else b.disabled = false;
      });
    });
  }
  function candidatesTable(q) {
    var list = q.candidates || [];
    if (!list.length) return '<p class="soc-small">「予約管理」で「来店済み」にした予約が、ここに並びます。</p>';
    // 2列だけにして、スマホの幅でもはみ出さないようにしています。
    return '<table class="rev-tbl"><thead><tr><th>お名前・来店日</th><th>状態</th></tr></thead><tbody>' + list.map(function (c) {
      return '<tr><td style="overflow-wrap:anywhere">' + esc(c.name) + ' 様<div class="soc-small">' + day(c.visitedAt) + ' 来店' + (c.service ? '・' + esc(c.service) : '') + '<br>' + esc(c.email) + '</div></td>' +
        '<td style="width:42%;overflow-wrap:anywhere">' + (c.ok ? '<span class="rev-tag ok">送れます</span>' : '<span class="soc-small">' + esc(c.message) + '</span>') +
        (c.ok && q.mode !== 'off' ? '<div style="margin-top:4px"><button type="button" class="ghost" data-send="' + esc(c.id) + '" style="font-size:12px;padding:6px 12px">送る</button></div>' : '') + '</td></tr>';
    }).join('') + '</tbody></table>';
  }
  function printQr(link) {
    var svg = core().qrSvg(core().qrEncode(link), { label: 'QRコード' });
    var shop = (S.data.prefs && S.data.prefs.shopName) || '';
    var w = window.open('', '_blank');
    if (!w) { say('印刷用の画面を開けませんでした（ポップアップを許可してください）。'); return; }
    w.document.write('<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>口コミのQRコード</title><style>' +
      'body{font-family:system-ui,sans-serif;text-align:center;margin:40px 16px;color:#111}svg{width:60mm;height:60mm}h1{font-size:20px;margin:0 0 6px}p{font-size:14px;line-height:1.8;margin:8px 0}' +
      '@media print{button{display:none}}</style></head><body><h1>' + esc(shop) + '</h1><p>よろしければ、Google にご感想をお寄せください。<br>良かった点も、気になった点も、今後の参考にさせていただきます。</p>' +
      svg + '<p style="font-size:11px;color:#555">スマートフォンのカメラで読み取ってください</p><button onclick="print()">印刷する</button></body></html>');
    w.document.close();
  }

  /* ---------------- 設定 ---------------- */

  async function savePrefs(p) {
    var x = await send({ action: 'prefs', prefs: p });
    var d = x.data || {};
    if (d.ok) { S.data.prefs = d.prefs; if (d.ai) S.data.ai = d.ai; if (p.requests) S.data.requests.mode = d.prefs.requests; }
    say(d.message || (d.ok ? '保存しました。' : '保存できませんでした。'), !!d.ok);
    return d.ok;
  }

  function settingsView(body) {
    var p = S.data.prefs || {};
    var ai = S.data.ai || {};
    var tones = { polite: 'ていねい', warm: 'やわらかい', casual: '親しみやすい' };
    var locs = S.data.locations || [];
    body.innerHTML = connectNote(S.data) +
      '<div class="rev-grid2">' +
      '<div class="rev-sec"><h4>返信の書き方（AIの下書きに使います）</h4>' +
        field('rev-shop', '店名', '<input class="rev-in" id="rev-shop" maxlength="60" value="' + esc(p.shopName) + '">', '下書きの中で、お店をこの名前で呼びます。') +
        field('rev-tone', '口調', '<select class="rev-sel" id="rev-tone">' + Object.keys(tones).map(function (k) { return '<option value="' + k + '"' + (p.tone === k ? ' selected' : '') + '>' + tones[k] + '</option>'; }).join('') + '</select>', '') +
        field('rev-sign', '署名（任意）', '<input class="rev-in" id="rev-sign" maxlength="80" value="' + esc(p.signature) + '" placeholder="例：サロン花 店長 山田">', '返信の最後の行に入ります。') +
        field('rev-notes', 'お店について書いてよいこと（任意）', '<textarea id="rev-notes" rows="4" maxlength="600" placeholder="例：電話 03-0000-0000（10〜19時）／火曜定休">' + esc(p.notes) + '</textarea>',
          'AIは、口コミとここに書いたこと以外の事実は書きません。星が少ない口コミで「お店に直接ご連絡ください」と案内するとき、ここに連絡先があればそれを使います。') +
        field('rev-yen', 'AIの月の上限（円）', '<input class="rev-in num" id="rev-yen" inputmode="numeric" value="' + esc(p.monthlyYen) + '">',
          '今月の目安：約' + (ai.yen || 0) + '円（' + (ai.calls || 0) + '回）。この額に達すると、その月は下書きを作りません。1日' + (ai.daily || 40) + '回まで。円は1ドル=150円で出した目安です。') +
      '</div>' +
      '<div class="rev-sec"><h4>お願いメール・QRコード</h4>' +
        field('rev-contact', 'メールに書く連絡先（任意）', '<input class="rev-in" id="rev-contact" maxlength="120" value="' + esc(p.contact) + '" placeholder="例：03-0000-0000">', 'お願いのメールの最後に入ります。') +
        field('rev-place', 'プレイスID（任意）', '<input class="rev-in" id="rev-place" maxlength="300" value="' + esc(p.placeId) + '" placeholder="ChIJ…">',
          'ふつうは空のままで構いません（同期したときに Google から取ります）。取れないときだけ、Google の「Place ID Finder」で調べて入れてください。') +
      '</div></div>' +
      '<div class="rev-acts" style="margin-top:12px"><button type="button" id="rev-save">保存する</button></div>' +
      '<div class="rev-sec"><h4>口コミを見る店舗</h4>' +
        (locs.length ? locs.map(function (l) { return '<div class="soc-small">' + esc(l.title || '') + ' <span style="color:var(--sub)">' + esc(l.name) + '</span>' + (l.syncedAt ? '・' + when(l.syncedAt) + ' に同期' : '') + '</div>'; }).join('')
          : '<p class="soc-small">まだ選ばれていません。</p>') +
        '<p class="soc-small" style="margin-top:6px">選んでいないときは、SNS（文章）で投稿先に選んだ店舗を使います。</p>' +
        '<div class="rev-acts" style="margin-top:6px"><button type="button" class="ghost" id="rev-locs">店舗を選ぶ</button>' +
        '<button type="button" class="ghost" id="rev-full"' + (S.data.connection && S.data.connection.ok ? '' : ' disabled') + '>最初からすべて読み直す</button></div>' +
        '<div id="rev-loc-list" style="margin-top:8px"></div>' +
        '<p class="soc-small" style="margin-top:6px">「最初からすべて読み直す」は、Google で消された口コミをこの画面からも消すときに使います（ふだんは新しいものだけ読みます）。</p></div>';
    bindConnect();
    el('rev-save').addEventListener('click', function () {
      savePrefs({
        shopName: el('rev-shop').value, tone: el('rev-tone').value, signature: el('rev-sign').value, notes: el('rev-notes').value,
        monthlyYen: el('rev-yen').value, contact: el('rev-contact').value, placeId: el('rev-place').value
      });
    });
    el('rev-locs').addEventListener('click', pickLocations);
    el('rev-full').addEventListener('click', function () { if (confirm('すべての口コミを Google から読み直します（件数が多いと30秒ほどかかります）。')) sync(true); });
  }
  function field(id, lb, input, hint) {
    return '<div class="rev-field"><label for="' + id + '">' + esc(lb) + '</label>' + input + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>';
  }
  async function pickLocations() {
    var host = el('rev-loc-list');
    if (!host) return;
    host.innerHTML = '<p class="soc-small">店舗の一覧を読んでいます…</p>';
    var x = await send({ action: 'locations' });
    var d = x.data || {};
    if (!d.ok) { host.innerHTML = '<div class="rev-note red">' + esc(d.message || '店舗の一覧を読めませんでした。') + '</div>'; return; }
    if (!d.locations.length) { host.innerHTML = '<p class="soc-small">このアカウントで管理している店舗がありませんでした。</p>'; return; }
    var cur = (S.data.prefs.locations && S.data.prefs.locations.length ? S.data.prefs.locations : (S.data.locations || []).map(function (l) { return l.name; }));
    host.innerHTML = d.locations.map(function (l, i) {
      return '<label class="rev-loc"><input type="checkbox" value="' + esc(l.name) + '"' + (cur.indexOf(l.name) >= 0 ? ' checked' : '') + '><span><b>' + esc(l.title) + '</b><br><span class="soc-small">' + esc(l.address) + '</span></span></label>';
    }).join('') + '<div class="rev-acts" style="margin-top:8px"><button type="button" id="rev-loc-save">この店舗を見る（5店舗まで）</button></div>';
    el('rev-loc-save').addEventListener('click', async function () {
      var picked = [].slice.call(host.querySelectorAll('input:checked')).map(function (c) { return c.value; }).slice(0, 5);
      if (await savePrefs({ locations: picked })) { await load(); settingsView(el('rev-body')); }
    });
  }

  /* ---------------- 開始 ---------------- */

  window.lumReviewsInit = async function () {
    if (S.started) return;
    S.started = true;
    addCss();
    shell();
    try { S.sec = sessionStorage.getItem('lum_rev_sec') || 'inbox'; } catch (_) {}
    if (!SECTIONS.some(function (s) { return s[0] === S.sec; })) S.sec = 'inbox';
    go(S.sec);
    try { await loadCore(); } catch (_) {
      el('rev-body').innerHTML = '<div class="rev-note red">画面の部品（/reviews-core.js）を読み込めませんでした。再読み込みしてください。</div>';
      return;
    }
    if (await load()) go(S.sec);
  };
})();
