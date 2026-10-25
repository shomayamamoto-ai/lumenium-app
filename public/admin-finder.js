/* ---- どこでも検索・タブの件数・新着の通知 ----
   管理画面（admin-members.html）全体にかかる、3つの便利機能です。

   1. どこでも検索（⌘K / Ctrl+K、または「/」、上の帯の「検索」）
      画面の名前・問い合わせ・予約・見積書・会員を、名前・会社・メール・件名・
      番号で探して、その画面のその1件を直接開きます。よく使う操作（新しい見積書・
      要対応の予約など）もここから。↑↓で選んで Enter、Esc で閉じます。
      見られるのは、その人の役割で見えている画面のデータだけです（admin-staff.js が
      隠したタブのデータは取りに行きません）。

   2. ブラウザのタブに件数
      左のメニューの赤い数（問い合わせの未読・予約の要対応・口コミの未返信）を足して、
      「(5) 予約管理 | ○○ 管理」のように題名の頭に出します。ほかのタブで作業していても
      気づけます。

   3. 新着のデスクトップ通知（使うときだけ。検索の「操作」から オン／オフ）
      管理画面を開いているあいだ、2分ごとに問い合わせと予約の数を数え直し、増えたら
      画面の隅に知らせます。押すとその画面を開きます。

   どの画面の作りにも手を入れず、各画面が出している入口（lumShowTab・lumInqOpen・
   lumQuoteOpen・lumBookOpen・lumInqBadge・lumBookBadge）だけを使います。 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  var KEY_LABEL = MAC ? '⌘K' : 'Ctrl+K';
  var CACHE_MS = 2 * 60000;
  var POLL_MS = 2 * 60000;
  var NOTIFY_KEY = 'lum_notify_new';

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 全角・半角、大文字・小文字、カタカナ・ひらがなの違いをならして比べます。 */
  function norm(s) {
    var t = String(s == null ? '' : s);
    try { t = t.normalize('NFKC'); } catch (_) {}
    return t.toLowerCase().replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }).replace(/\s+/g, ' ').trim();
  }
  function hit(hay, words) {
    var h = norm(hay);
    return words.every(function (w) { return h.indexOf(w) >= 0; });
  }
  function yen(n) { return '¥' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function md(ms) {
    if (!ms) return '';
    var d = new Date(ms + 9 * 3600000);
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
  }
  function visibleTab(id) {
    var b = el('tab-' + id);
    return !!(b && !b.hidden && b.closest('li') && b.closest('li').style.display !== 'none' && getComputedStyle(b).display !== 'none');
  }
  async function api(url) {
    if (!window.lumAdmin) return null;
    try { var r = await window.lumAdmin.fetch(url); return r && r.data && r.data.ok ? r.data : null; } catch (_) { return null; }
  }

  /* ---------------- 見た目 ---------------- */

  function addCss() {
    if (el('fd-css')) return;
    var s = document.createElement('style');
    s.id = 'fd-css';
    s.textContent =
      '.fd-open{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 10px 0 12px;border:1px solid var(--ui-border,#dcd8ce);border-radius:999px;background:var(--ui-surface,#fff);color:var(--ui-text-2,#45454f);font:inherit;font-size:13px;cursor:pointer;margin-right:8px}' +
      '.fd-open:hover{border-color:var(--ui-border-strong,#b9b4a8);color:var(--ui-text,#17171c)}' +
      '.fd-open kbd,.fd kbd{font:inherit;font-size:11px;border:1px solid var(--ui-border,#dcd8ce);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--ui-text-2,#45454f);background:#faf9f6}' +
      '.fd-back{position:fixed;inset:0;background:rgba(23,23,28,.36);z-index:2000;display:flex;align-items:flex-start;justify-content:center;padding:10vh 16px 16px}' +
      '.fd{width:100%;max-width:640px;max-height:76vh;display:flex;flex-direction:column;background:var(--ui-surface,#fff);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.22);overflow:hidden}' +
      '.fd-top{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--ui-border,#dcd8ce)}' +
      '.fd-top svg{flex:none;color:var(--ui-text-3,#75757f)}' +
      '.fd-in{flex:1;min-width:0;border:0;outline:0;font:inherit;font-size:16px;background:transparent;color:var(--ui-text,#17171c)}' +
      '.fd-list{overflow:auto;padding:6px 0 8px}' +
      '.fd-group{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--ui-text-3,#75757f);padding:10px 16px 4px}' +
      '.fd-item{display:flex;gap:10px;align-items:center;width:100%;text-align:left;border:0;background:none;font:inherit;color:inherit;padding:9px 16px;cursor:pointer}' +
      '.fd-item[aria-selected="true"]{background:#efeefb}' +
      '.fd-item .t{flex:1;min-width:0}.fd-item .t b{display:block;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.fd-item .t small{display:block;font-size:12px;color:var(--ui-text-3,#75757f);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.fd-item .k{flex:none;font-size:11px;color:var(--ui-text-3,#75757f);border:1px solid var(--ui-border,#dcd8ce);border-radius:999px;padding:1px 8px}' +
      '.fd-empty{padding:18px 16px;color:var(--ui-text-3,#75757f);font-size:13px}' +
      '.fd-foot{display:flex;flex-wrap:wrap;gap:6px 14px;padding:8px 14px;border-top:1px solid var(--ui-border,#dcd8ce);font-size:11.5px;color:var(--ui-text-3,#75757f)}' +
      '.fd-side{width:calc(100% - 24px);margin:4px 12px 10px;border:1px solid var(--ui-border,#dcd8ce);background:var(--ui-surface,#fff);color:var(--ui-text-2,#45454f)}' +
      '.fd-side kbd{margin-left:auto;font:inherit;font-size:11px;border:1px solid var(--ui-border,#dcd8ce);border-bottom-width:2px;border-radius:5px;padding:0 5px;background:#faf9f6}' +
      '@media (max-width:1023px){.fd-side kbd{display:none}}' +
      '@media (max-width:640px){.fd-back{padding:8px}.fd{max-height:88vh}.fd-open span.fd-l{display:none}.fd-open kbd{display:none}}';
    document.head.appendChild(s);
  }
  var ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

  /* 「検索」の入口を2か所に出します。広い画面では上の帯が隠れるので左のメニューの頭に、
     狭い画面では上の帯に（ログインのあと、メニューができてから）。 */
  function mountButton() {
    addCss();
    var nav = el('shell-nav');
    if (nav && !el('fd-side')) {
      var sb = document.createElement('button');
      sb.type = 'button';
      sb.id = 'fd-side';
      sb.className = 'ui-nav-item fd-side';
      sb.setAttribute('aria-label', 'どこでも検索（' + KEY_LABEL + '）');
      sb.innerHTML = '<i class="ui-nav-ic">' + ICON + '</i><span class="ui-nav-lbl">検索</span><kbd>' + KEY_LABEL + '</kbd>';
      sb.addEventListener('click', function () { open(''); });
      nav.parentNode.insertBefore(sb, nav);
    }
    if (el('fd-open')) return;
    var top = el('app-top');
    var gap = top && top.querySelector('.ui-top-gap');
    if (!top || !gap) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'fd-open';
    b.className = 'fd-open';
    b.setAttribute('aria-label', 'どこでも検索（' + KEY_LABEL + '）');
    b.innerHTML = ICON + '<span class="fd-l">検索</span><kbd>' + KEY_LABEL + '</kbd>';
    b.addEventListener('click', function () { open(''); });
    gap.parentNode.insertBefore(b, gap.nextSibling);
  }

  /* ---------------- データ（開いたときに読み、2分は使い回す） ---------------- */

  var C = { at: 0, bookings: null, quotes: null, members: null, loading: null };
  /* ほかのツールが足す検索の対象（各ツールのファイルが自分で登録します。このファイルは触りません）。
       window.lumFinderSources.push({
         group: '口コミ',            // 見出し
         tab: 'reviews-admin',       // この画面が見える役割のときだけ読む
         load: function (api) { return api('/api/reviews'); },   // 1回読んで2分使い回す
         match: function (words, data, hit) { return [{ k, t, s, run }] }   // hit(文字列, words) で当たり判定
       }) */
  var SOURCES = window.lumFinderSources = window.lumFinderSources || [];
  function load() {
    if (C.loading) return C.loading;
    if (Date.now() - C.at < CACHE_MS && (C.bookings || C.quotes || C.members)) return Promise.resolve();
    var extra = SOURCES.map(function (src) {
      if (src.tab && !visibleTab(src.tab)) return null;
      try { return Promise.resolve(src.load(api)).catch(function () { return null; }); } catch (_) { return null; }
    });
    C.loading = Promise.all([
      visibleTab('booking-admin') ? api('/api/booking?recent=all') : null,
      visibleTab('quotes-admin') ? quoteCore().then(function () { return api('/api/quotes'); }) : null,
      visibleTab('list-view') ? api('/api/members-list') : null,
    ].concat(extra)).then(function (r) {
      C.bookings = r[0] && r[0].bookings || [];
      C.quotes = r[1] && r[1].list || [];
      C.members = r[2] && r[2].members || [];
      C.extra = r.slice(3);
      C.at = Date.now();
      C.loading = null;
    }, function () { C.loading = null; });
    return C.loading;
  }
  /* 見積書の計算の部品。デモの見積書はこれで作るので、見積書の画面をまだ開いていなくても
     探せるよう、先に読みます（本番では読まなくても困りませんが、読んでも軽いものです）。 */
  function quoteCore() {
    if (window.lumQuoteCore) return Promise.resolve();
    return new Promise(function (ok) {
      var sc = document.createElement('script');
      sc.src = '/quote-core.js';
      sc.onload = sc.onerror = function () { ok(); };
      document.head.appendChild(sc);
    });
  }
  var inqSeq = 0;
  async function searchInquiries(q) {
    if (!q || !visibleTab('inquiries-admin')) return [];
    var my = ++inqSeq;
    var d = await api('/api/inquiries?status=all&q=' + encodeURIComponent(q));
    if (my !== inqSeq) return null; // 打ち続けている間の古い答えは捨てる
    return (d && d.items) || [];
  }

  /* ---------------- 候補を作る ---------------- */

  var ST_INQ = { new: '未対応', doing: '対応中', done: '完了' };
  var ST_BK = { confirmed: '確定', tentative: '仮予約', cancelled: 'キャンセル', visited: '来店済み', noshow: '無断キャンセル' };
  var ST_QT = { draft: '下書き', sent: '送付済み', won: '受注', lost: '失注', paid: '入金済み', issued: '発行済み', void: '取消' };

  function tabs() {
    return [].slice.call(document.querySelectorAll('#shell-nav .shell-tab')).filter(function (b) {
      return getComputedStyle(b).display !== 'none' && !(b.closest('li') && b.closest('li').style.display === 'none');
    }).map(function (b) {
      var lbl = b.querySelector('.ui-nav-lbl');
      var name = lbl ? (lbl.firstChild && lbl.firstChild.nodeType === 3 ? lbl.firstChild.textContent : lbl.textContent) : b.textContent;
      return { id: b.id.replace(/^tab-/, ''), name: String(name).trim() };
    });
  }
  function notifyOn() { try { return localStorage.getItem(NOTIFY_KEY) === '1'; } catch (_) { return false; } }

  function actions() {
    var out = [];
    if (visibleTab('booking-admin')) out.push({ k: '操作', t: '要対応の予約を見る', s: '新しい予約・確定待ち・未記入', run: function () { go('booking-admin', function () { if (window.lumBookOpen) window.lumBookOpen(''); }); } });
    if (visibleTab('inquiries-admin')) out.push({ k: '操作', t: '未対応の問い合わせを見る', s: '問い合わせ管理の受信箱', run: function () { go('inquiries-admin'); } });
    if (visibleTab('quotes-admin')) out.push({ k: '操作', t: '新しい見積書を作る', s: '見積書', run: function () { go('quotes-admin', function () { if (window.lumQuoteNew) window.lumQuoteNew(); }); } });
    if (visibleTab('bills-admin')) {
      out.push({ k: '操作', t: '新しい請求書を作る', s: '請求書・領収書', run: function () { go('bills-admin', function () { if (window.lumBillNew) window.lumBillNew('invoice'); }); } });
      out.push({ k: '操作', t: '新しい領収書を作る', s: '請求書・領収書', run: function () { go('bills-admin', function () { if (window.lumBillNew) window.lumBillNew('receipt'); }); } });
    }
    if (visibleTab('news-admin')) out.push({ k: '操作', t: 'お知らせを書く', s: 'お知らせ投稿', run: function () { go('news-admin'); } });
    out.push({ k: '操作', t: notifyOn() ? '新着のデスクトップ通知を止める（いまはオン）' : '新着をデスクトップに知らせる（いまはオフ）',
      s: '管理画面を開いているあいだ、新しい問い合わせ・予約が入ったら画面の隅に知らせます', run: toggleNotify });
    return out;
  }

  function build(q, inq) {
    var words = norm(q).split(' ').filter(Boolean);
    var groups = [];
    var tb = tabs().filter(function (t) { return !words.length || hit(t.name, words); }).map(function (t) {
      return { k: '画面', t: t.name, s: '', run: function () { go(t.id); } };
    });
    var acts = actions().filter(function (a) { return !words.length || hit(a.t + ' ' + a.s, words); });
    if (!words.length) {
      groups.push(['よく使う操作', acts]);
      groups.push(['画面', tb]);
      return groups;
    }
    if (tb.length) groups.push(['画面', tb.slice(0, 6)]);
    /* お客様（メールアドレスで1人にまとめる）。開くとお客様カルテ（admin-customer.js）。 */
    if (window.lumCustomer) {
      var people = {};
      var add = function (email, name, company, kind) {
        var e = String(email || '').trim().toLowerCase();
        if (!e || e.indexOf('@') < 0) return;
        var p = people[e] || (people[e] = { email: String(email).trim(), name: '', company: '', n: { inq: 0, bk: 0, mb: 0 } });
        if (!p.name && name) p.name = name;
        if (!p.company && company) p.company = company;
        p.n[kind]++;
      };
      (inq || []).forEach(function (x) { add(x.email, x.name, x.company, 'inq'); });
      (C.bookings || []).forEach(function (b) { if (hit([b.name, b.company, b.email].join(' '), words)) add(b.email, b.name, b.company, 'bk'); });
      (C.members || []).forEach(function (m) { if (hit([m.name, m.company, m.email].join(' '), words)) add(m.email, m.name, m.company, 'mb'); });
      var ppl = Object.keys(people).map(function (k) { return people[k]; }).slice(0, 5).map(function (p) {
        var cnt = [p.n.inq ? '問い合わせ ' + p.n.inq : '', p.n.bk ? '予約 ' + p.n.bk : '', p.n.mb ? '会員' : ''].filter(Boolean).join('・');
        return { k: 'カルテ', t: (p.name || p.email) + (p.company ? '（' + p.company + '）' : ''), s: [p.email, cnt].filter(Boolean).join('　'),
          run: function () { close(); window.lumCustomer.open({ email: p.email, name: p.name, company: p.company }); } };
      });
      if (ppl.length) groups.push(['お客様', ppl]);
    }
    if (inq && inq.length) groups.push(['問い合わせ', inq.slice(0, 8).map(function (x) {
      return { k: ST_INQ[x.status] || '問い合わせ', t: (x.name || '（名前なし）') + (x.company ? '（' + x.company + '）' : ''),
        s: [md(Date.parse(x.receivedAt)), x.email, x.snippet].filter(Boolean).join('　'), run: function () { go('inquiries-admin', function () { if (window.lumInqOpen) window.lumInqOpen(x.id); }); } };
    })]);
    var bk = (C.bookings || []).filter(function (b) {
      return hit([b.name, b.company, b.email, b.tel, b.service && b.service.name, b.when, b.memo].join(' '), words);
    }).sort(function (a, b) { return (b.start || 0) - (a.start || 0); }).slice(0, 8).map(function (b) {
      var st = b.status || (b.mode === 'google' ? 'confirmed' : 'tentative');
      return { k: ST_BK[st] || '予約', t: (b.name || '（名前なし）') + ' 様', s: [b.when || md(b.start), b.service && b.service.name, b.email].filter(Boolean).join('　'),
        run: function () { go('booking-admin', function () { if (window.lumBookOpen) window.lumBookOpen(b.id); }); } };
    });
    if (bk.length) groups.push(['予約', bk]);
    var qt = (C.quotes || []).filter(function (x) { return hit([x.number, x.to, x.subject].join(' '), words); }).slice(0, 8).map(function (x) {
      return { k: (x.kind === 'invoice' ? '請求書 ' : x.kind === 'receipt' ? '領収書 ' : '') + (ST_QT[x.status] || ''), t: (x.number || '（番号なし）') + '　' + (x.subject || ''),
        s: [x.to, yen(x.total) + '（税込）', x.date].filter(Boolean).join('　'), run: function () { go('quotes-admin', function () { if (window.lumQuoteOpen) window.lumQuoteOpen(x.id); }); } };
    });
    if (qt.length) groups.push(['見積書・請求書', qt]);
    var mb = (C.members || []).filter(function (m) { return hit([m.name, m.company, m.email].join(' '), words); }).slice(0, 6).map(function (m) {
      return { k: '会員', t: m.name || m.email, s: [m.company, m.email].filter(Boolean).join('　'), run: function () { go('list-view', function () { if (window.lumMemberOpen) window.lumMemberOpen(m.id || m.email); else filterMembers(m.email); }); } };
    });
    if (mb.length) groups.push(['会員', mb]);
    SOURCES.forEach(function (src, i) {
      var data = C.extra && C.extra[i];
      if (!data) return;
      var found = [];
      try { found = (src.match(words, data, hit) || []).slice(0, 8); } catch (_) { found = []; }
      found.forEach(function (it) { var run = it.run; it.run = function () { close(); if (run) run(); }; });
      if (found.length) groups.push([src.group, found]);
    });
    if (acts.length) groups.push(['操作', acts]);
    return groups;
  }

  function go(tab, then) {
    close();
    if (window.lumShowTab && window.lumShowTab(tab) === false) return;
    if (then) setTimeout(then, 60);
  }
  function filterMembers(email) {
    var s = el('search');
    if (!s) return;
    s.value = email;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.focus();
  }

  /* ---------------- 検索の窓 ---------------- */

  var W = { back: null, input: null, list: null, items: [], sel: 0, lastFocus: null, timer: 0 };

  function open(q) {
    if (!window.lumAdmin || !el('shell') || el('shell').style.display === 'none') return;
    addCss();
    if (W.back) { W.input.focus(); return; }
    W.lastFocus = document.activeElement;
    var back = document.createElement('div');
    back.className = 'fd-back';
    back.innerHTML =
      '<div class="fd" role="dialog" aria-modal="true" aria-label="どこでも検索">' +
        '<div class="fd-top">' + ICON +
          '<input class="fd-in" id="fd-in" type="search" autocomplete="off" spellcheck="false" placeholder="名前・会社・メール・見積番号・画面の名前で探す" aria-label="検索" aria-controls="fd-list" aria-autocomplete="list">' +
          '<kbd>Esc</kbd></div>' +
        '<div class="fd-list" id="fd-list" role="listbox" aria-label="見つかったもの"></div>' +
        '<div class="fd-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> で選ぶ</span><span><kbd>Enter</kbd> で開く</span><span><kbd>' + KEY_LABEL + '</kbd> または <kbd>/</kbd> でいつでも</span></div>' +
      '</div>';
    document.body.appendChild(back);
    W.back = back;
    W.input = back.querySelector('#fd-in');
    W.list = back.querySelector('#fd-list');
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    W.input.addEventListener('input', function () { schedule(); });
    W.input.addEventListener('keydown', onKey);
    W.input.value = q || '';
    W.input.focus();
    draw(null);
    load().then(function () { if (W.back) draw(null); });
    if (W.input.value) schedule();
  }
  function close() {
    if (!W.back) return;
    W.back.remove();
    W.back = null;
    clearTimeout(W.timer);
    if (W.lastFocus && W.lastFocus.focus && document.contains(W.lastFocus)) { try { W.lastFocus.focus(); } catch (_) {} }
  }
  function schedule() {
    clearTimeout(W.timer);
    draw(null);
    var q = W.input.value.trim();
    if (!q) return;
    W.timer = setTimeout(async function () {
      var inq = await searchInquiries(q);
      if (inq === null || !W.back || W.input.value.trim() !== q) return;
      draw(inq);
    }, 250);
  }
  var lastInq = [];
  function draw(inq) {
    if (!W.back) return;
    if (inq) lastInq = inq; else if (!W.input.value.trim()) lastInq = [];
    var groups = build(W.input.value, lastInq);
    W.items = [];
    var html = '';
    groups.forEach(function (g) {
      if (!g[1].length) return;
      html += '<div class="fd-group" role="presentation">' + esc(g[0]) + '</div>';
      g[1].forEach(function (it) {
        var i = W.items.length;
        W.items.push(it);
        html += '<button type="button" class="fd-item" role="option" id="fd-o' + i + '" data-i="' + i + '" aria-selected="false">' +
          '<span class="t"><b>' + esc(it.t) + '</b>' + (it.s ? '<small>' + esc(it.s) + '</small>' : '') + '</span>' +
          (it.k ? '<span class="k">' + esc(it.k) + '</span>' : '') + '</button>';
      });
    });
    var q = W.input.value.trim();
    if (!html) html = '<div class="fd-empty">' + (C.loading ? '読み込んでいます…' : '「' + esc(q) + '」に当てはまるものは見つかりませんでした。名前の一部や、メールアドレスの一部でも探せます。') + '</div>';
    W.list.innerHTML = html;
    W.list.querySelectorAll('[data-i]').forEach(function (b) {
      b.addEventListener('mousemove', function () { select(Number(b.getAttribute('data-i')), true); });
      b.addEventListener('click', function () { run(Number(b.getAttribute('data-i'))); });
    });
    W.sel = 0;
    select(0, true);
  }
  function select(i, quiet) {
    if (!W.items.length) { W.input.removeAttribute('aria-activedescendant'); return; }
    W.sel = Math.max(0, Math.min(W.items.length - 1, i));
    W.list.querySelectorAll('.fd-item').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-i') === String(W.sel) ? 'true' : 'false'); });
    W.input.setAttribute('aria-activedescendant', 'fd-o' + W.sel);
    if (!quiet) { var cur = el('fd-o' + W.sel); if (cur) cur.scrollIntoView({ block: 'nearest' }); }
  }
  function run(i) { var it = W.items[i]; if (it && it.run) it.run(); }
  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); select(W.sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(W.sel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(W.sel); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') { e.preventDefault(); select(W.sel + (e.shiftKey ? -1 : 1)); }
  }

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      if (!el('shell') || el('shell').style.display === 'none') return;
      e.preventDefault();
      if (W.back) close(); else open('');
      return;
    }
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !W.back) {
      var t = e.target;
      var typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (typing || !el('shell') || el('shell').style.display === 'none') return;
      e.preventDefault();
      open('');
    }
  });

  /* ---------------- ブラウザのタブに件数 ---------------- */

  /* 数える印: 共通の .nav-count（admin-badge.js）と、以前からの各ツールの印。
     「はじめての設定」の残り（.ui-badge）は、お客様対応ではないので足しません。 */
  var BADGES = '.nav-count, .inq-badge, .bk-badge, .rev-badge';
  function badgeTotal() {
    var n = 0;
    document.querySelectorAll('#shell-nav .shell-tab').forEach(function (tab) {
      var b = tab.querySelector(BADGES);
      var v = b ? parseInt(b.textContent, 10) : 0;
      if (isFinite(v)) n += v;
    });
    return n;
  }
  function countOf(tabId) {
    var tab = el('tab-' + tabId);
    var b = tab && tab.querySelector(BADGES);
    var v = b ? parseInt(b.textContent, 10) : 0;
    return isFinite(v) ? v : 0;
  }
  /* 題名の頭に「(5) 」。デモのときは admin-demo.js が「【デモ】」を必ず頭に付けるので、
     その後ろに入れます（前に入れると、互いに付け直し合って題名が伸び続けます）。
     万一ほかの仕組みと付け直し合っても止まるよう、1秒に20回を超えたら休みます。 */
  var DEMO_MARK = '【デモ】';
  var paints = [];
  function paintTitle() {
    var now = Date.now();
    paints = paints.filter(function (t) { return now - t < 1000; });
    if (paints.length > 20) return;
    var t = document.title;
    var demo = t.indexOf(DEMO_MARK) === 0;
    var base = t.split(DEMO_MARK).join('').replace(/^\s*\(\d+\+?\)\s*/, '');
    var n = badgeTotal();
    var want = (demo ? DEMO_MARK : '') + (n ? '(' + (n > 99 ? '99+' : n) + ') ' : '') + base;
    if (t !== want) { paints.push(now); document.title = want; }
  }

  /* ---------------- 新着の通知 ---------------- */

  /* 増えたら知らせるタブと、その言い方。 */
  var WATCH = [
    ['inquiries-admin', '新しい問い合わせがあります'],
    ['booking-admin', '予約に動きがあります'],
    ['reviews-admin', '新しい口コミがあります'],
    ['social-admin', 'SNSの投稿に対応が要ります'],
    ['video-admin', '動画の投稿に対応が要ります'],
  ];
  var last = {};
  var bornAt = 0;
  function checkNew() {
    // ログイン直後は、最初の数が出そろうまで（20秒）比べません。0→2 を「新着」と誤らないため。
    var ready = bornAt && Date.now() - bornAt > 20000 && notifyOn() && window.Notification && Notification.permission === 'granted';
    var told = false;
    WATCH.forEach(function (w) {
      var n = countOf(w[0]);
      if (ready && !told && last[w[0]] != null && n > last[w[0]]) { note(w[1], '要対応 ' + n + '件', w[0]); told = true; }
      last[w[0]] = n;
    });
  }
  function note(title, body, tab) {
    try {
      var n = new Notification(title, { body: body + '｜' + ((window.lumSite && window.lumSite.name) || '') + ' 管理', tag: 'lum-new-' + tab });
      n.onclick = function () { try { window.focus(); } catch (_) {} if (window.lumShowTab) window.lumShowTab(tab); n.close(); };
    } catch (_) {}
  }
  function toggleNotify() {
    close();
    if (notifyOn()) {
      try { localStorage.removeItem(NOTIFY_KEY); } catch (_) {}
      toast('新着のデスクトップ通知を止めました。');
      return;
    }
    if (!window.Notification) { toast('このブラウザはデスクトップ通知に対応していません。'); return; }
    Notification.requestPermission().then(function (p) {
      if (p !== 'granted') { toast('通知が許可されませんでした。ブラウザのサイトの設定で「通知」を許可すると使えます。'); return; }
      try { localStorage.setItem(NOTIFY_KEY, '1'); } catch (_) {}
      toast('新着をデスクトップに知らせます。管理画面を開いているあいだ、2分ごとに確かめます。');
    });
  }
  function toast(t) {
    var m = el('fd-toast');
    if (!m) {
      m = document.createElement('div');
      m.id = 'fd-toast';
      m.setAttribute('role', 'status');
      m.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2100;background:#17171c;color:#fff;font-size:13px;line-height:1.6;padding:10px 16px;border-radius:10px;max-width:min(92vw,520px);box-shadow:0 8px 24px rgba(0,0,0,.25)';
      document.body.appendChild(m);
    }
    m.textContent = t;
    m.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { m.hidden = true; }, 5000);
  }

  /* 数え直し: 予約は admin-booking.js が画面を見ているあいだ3分ごとに数えます。
     ここでは問い合わせを2分ごとに。通知がオンなら、画面が裏にあっても数えます。 */
  function poll() {
    if (!window.lumAdmin || !el('shell') || el('shell').style.display === 'none') return;
    if (document.hidden && !notifyOn()) return;
    if (window.lumInqBadge && visibleTab('inquiries-admin')) window.lumInqBadge();
    if (document.hidden && window.lumBookBadge && visibleTab('booking-admin')) window.lumBookBadge();
  }

  /* ---------------- 始まり ---------------- */

  (function watch() {
    var started = false;
    var queued = false;
    function check() {
      queued = false;
      paintTitle();
      checkNew();
      if (!started && document.querySelector('#shell-nav .shell-tab')) {
        started = true;
        bornAt = Date.now();
        mountButton();
        setInterval(poll, POLL_MS);
      }
    }
    // 画面の書き換えは多いので、1コマにまとめて1回だけ数えます。
    function later() { if (!queued) { queued = true; requestAnimationFrame(check); } }
    function startObs() {
      new MutationObserver(later).observe(document.body, { childList: true, subtree: true, characterData: true });
      var t = document.querySelector('title');
      if (t) new MutationObserver(paintTitle).observe(t, { childList: true, characterData: true, subtree: true });
      check();
    }
    if (document.body) startObs(); else document.addEventListener('DOMContentLoaded', startObs);
  })();

  window.lumFinder = { open: open, close: close };
})();
