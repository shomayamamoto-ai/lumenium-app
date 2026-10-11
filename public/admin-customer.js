/* ---- お客様カルテ ----
   1人のお客様の、問い合わせ・予約・見積書（請求書）・会員登録を、1つの時系列に
   まとめて右側に出します。「前に何を相談して、いつ来て、いくら見積もったか」を、
   画面を行き来せずに見られるようにするためです。

   開き方: window.lumCustomer.open({ email, name, company })
     ・どこでも検索（admin-finder.js）の「お客様」
     ・問い合わせの詳細の「このお客様の記録」
     ・予約の詳細の「このお客様の記録」

   同じ人かどうかは、メールアドレス（大文字・小文字は区別しない）で決めます。
   見積書にはメールが残らないので、元の問い合わせ（inquiryId）か、宛先に会社名・
   お名前が入っているかで結びます（後者は「たぶん」なので、そう書き添えます）。
   データは開くたびに読み直し、その人の役割で見えている画面の分だけを読みます。 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    var t = String(s == null ? '' : s);
    try { t = t.normalize('NFKC'); } catch (_) {}
    return t.toLowerCase().replace(/\s+/g, '');
  }
  function yen(n) { return '¥' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function ymd(ms) {
    if (!ms) return '';
    var d = new Date(ms + 9 * 3600000);
    return d.getUTCFullYear() + '/' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
  }
  function visibleTab(id) {
    var b = el('tab-' + id);
    return !!(b && getComputedStyle(b).display !== 'none' && !(b.closest('li') && b.closest('li').style.display === 'none'));
  }
  async function api(url) {
    if (!window.lumAdmin) return null;
    try { var r = await window.lumAdmin.fetch(url); return r && r.data && r.data.ok ? r.data : null; } catch (_) { return null; }
  }
  function quoteCore() {
    if (window.lumQuoteCore) return Promise.resolve();
    return new Promise(function (ok) {
      var sc = document.createElement('script');
      sc.src = '/quote-core.js';
      sc.onload = sc.onerror = function () { ok(); };
      document.head.appendChild(sc);
    });
  }

  function addCss() {
    if (el('cu-css')) return;
    var s = document.createElement('style');
    s.id = 'cu-css';
    s.textContent =
      '.cu-back{position:fixed;inset:0;background:rgba(23,23,28,.32);z-index:1990}' +
      '.cu{position:fixed;top:0;right:0;bottom:0;width:min(560px,100vw);background:var(--ui-bg,#f6f4ef);z-index:1995;display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(0,0,0,.18)}' +
      '.cu-head{display:flex;gap:12px;align-items:flex-start;padding:18px 20px 14px;background:var(--ui-surface,#fff);border-bottom:1px solid var(--ui-border,#dcd8ce)}' +
      '.cu-head h2{margin:0;font-size:19px;line-height:1.4}.cu-head .sub{font-size:12.5px;color:var(--ui-text-2,#45454f);margin-top:3px;overflow-wrap:anywhere}' +
      '.cu-x{margin-left:auto;flex:none;border:1px solid var(--ui-border,#dcd8ce);background:#faf9f6;border-radius:10px;width:36px;height:36px;font-size:16px;cursor:pointer;color:var(--ui-text-2,#45454f)}' +
      '.cu-body{flex:1;overflow:auto;padding:16px 20px 28px}' +
      '.cu-sum{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}' +
      '.cu-sum div{background:var(--ui-surface,#fff);border:1px solid var(--ui-border,#dcd8ce);border-radius:12px;padding:10px 12px}' +
      '.cu-sum b{display:block;font-size:20px;font-variant-numeric:tabular-nums}.cu-sum span{font-size:11.5px;color:var(--ui-text-2,#45454f)}' +
      '.cu-acts{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}' +
      '.cu-acts a,.cu-acts button{font:inherit;font-size:12.5px;padding:8px 13px;border-radius:10px;border:1px solid var(--ui-border-strong,#b9b4a8);background:var(--ui-surface,#fff);color:var(--ui-text,#17171c);text-decoration:none;cursor:pointer}' +
      '.cu-acts .pri{background:var(--ui-accent,#3d3fbf);border-color:var(--ui-accent,#3d3fbf);color:#fff}' +
      '.cu-h{font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--ui-text-3,#75757f);margin:16px 0 8px}' +
      '.cu-tl{list-style:none;margin:0;padding:0;border-left:2px solid var(--ui-border,#dcd8ce)}' +
      '.cu-tl li{position:relative;margin:0 0 10px 0;padding-left:16px}' +
      '.cu-tl li::before{content:"";position:absolute;left:-6px;top:14px;width:10px;height:10px;border-radius:50%;background:var(--ui-surface,#fff);border:2px solid var(--ui-border-strong,#b9b4a8)}' +
      '.cu-tl li.k-inq::before{border-color:#3d3fbf}.cu-tl li.k-bk::before{border-color:#047857}.cu-tl li.k-qt::before{border-color:#b45309}.cu-tl li.k-mb::before{border-color:#75757f}' +
      '.cu-it{display:block;width:100%;text-align:left;font:inherit;color:inherit;background:var(--ui-surface,#fff);border:1px solid var(--ui-border,#dcd8ce);border-radius:12px;padding:10px 12px;cursor:pointer}' +
      '.cu-it:hover{border-color:var(--ui-border-strong,#b9b4a8)}div.cu-it{cursor:default}' +
      '.cu-it .top{display:flex;gap:8px;align-items:baseline}.cu-it .top b{font-size:13.5px}.cu-it time{margin-left:auto;font-size:11.5px;color:var(--ui-text-3,#75757f);white-space:nowrap}' +
      '.cu-it .tag{font-size:10.5px;font-weight:700;border-radius:999px;padding:1px 8px;background:#efeefb;color:#2f31a3;white-space:nowrap}' +
      '.cu-it .tag.bk{background:#e7f5ef;color:#047857}.cu-it .tag.qt{background:#fdf1e3;color:#9a4b07}.cu-it .tag.mb{background:#eeebe3;color:#45454f}' +
      '.cu-it p{margin:4px 0 0;font-size:12.5px;color:var(--ui-text-2,#45454f);line-height:1.6;overflow-wrap:anywhere}' +
      '.cu-note{font-size:12px;color:var(--ui-text-3,#75757f);line-height:1.7}' +
      '@media (max-width:640px){.cu-sum{grid-template-columns:repeat(2,1fr)}}';
    document.head.appendChild(s);
  }

  var ST_INQ = { new: '未対応', doing: '対応中', done: '完了' };
  var ST_BK = { confirmed: '確定', tentative: '仮予約', cancelled: '取り消し', visited: '来店済み', noshow: '無断キャンセル' };
  var ST_QT = { draft: '下書き', sent: '送付済み', won: '受注', lost: '失注', paid: '入金済み' };

  var P = { back: null, panel: null, lastFocus: null, seq: 0 };

  function close() {
    if (!P.panel) return;
    P.panel.remove(); P.back.remove();
    P.panel = P.back = null;
    document.removeEventListener('keydown', onKey, true);
    if (P.lastFocus && document.contains(P.lastFocus)) { try { P.lastFocus.focus(); } catch (_) {} }
  }
  function onKey(e) { if (e.key === 'Escape' && P.panel) { e.stopPropagation(); close(); } }
  function go(tab, then) {
    close();
    if (window.lumShowTab && window.lumShowTab(tab) === false) return;
    if (then) setTimeout(then, 60);
  }

  async function open(who) {
    who = who || {};
    var email = String(who.email || '').trim();
    if (!email && !who.name) return;
    addCss();
    close();
    P.lastFocus = document.activeElement;
    var back = document.createElement('div');
    back.className = 'cu-back';
    back.addEventListener('click', close);
    var panel = document.createElement('aside');
    panel.className = 'cu';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'お客様カルテ');
    panel.innerHTML = '<div class="cu-head"><div><h2>' + esc((who.name || email) + ' 様') + '</h2><div class="sub">' + esc([who.company, email].filter(Boolean).join('　')) + '</div></div>' +
      '<button type="button" class="cu-x" aria-label="閉じる">✕</button></div><div class="cu-body"><p class="cu-note">記録を集めています…</p></div>';
    document.body.appendChild(back);
    document.body.appendChild(panel);
    P.back = back; P.panel = panel;
    panel.querySelector('.cu-x').addEventListener('click', close);
    panel.querySelector('.cu-x').focus();
    document.addEventListener('keydown', onKey, true);
    var my = ++P.seq;
    var d = await gather(email, who);
    if (my !== P.seq || !P.panel) return;
    draw(d, who, email);
  }

  async function gather(email, who) {
    var key = norm(email);
    var same = function (x) { return key && norm(x) === key; };
    var res = await Promise.all([
      visibleTab('inquiries-admin') && email ? api('/api/inquiries?status=all&q=' + encodeURIComponent(email)) : null,
      visibleTab('booking-admin') ? api('/api/booking?recent=all') : null,
      visibleTab('quotes-admin') ? quoteCore().then(function () { return api('/api/quotes'); }) : null,
      visibleTab('list-view') && email ? api('/api/members-list') : null,
    ]);
    var inq = ((res[0] && res[0].items) || []).filter(function (x) { return same(x.email); });
    var bk = ((res[1] && res[1].bookings) || []).filter(function (b) { return email ? same(b.email) : norm(b.name) === norm(who.name); });
    var mb = ((res[3] && res[3].members) || []).filter(function (m) { return same(m.email); })[0] || null;
    // 呼び名・会社名は、いちばん新しい記録から補います。
    var name = who.name || (inq[0] && inq[0].name) || (bk[0] && bk[0].name) || (mb && mb.name) || '';
    var company = who.company || (inq[0] && inq[0].company) || (bk[0] && bk[0].company) || (mb && mb.company) || '';
    var inqIds = {};
    inq.forEach(function (x) { inqIds[x.id] = 1; });
    var nCo = norm(company), nName = norm(name);
    var qt = ((res[2] && res[2].list) || []).map(function (x) {
      if (x.inquiryId && inqIds[x.inquiryId]) return Object.assign({ sure: true }, x);
      var to = norm(x.to);
      if ((nCo && nCo.length >= 2 && to.indexOf(nCo) >= 0) || (nName && nName.length >= 2 && to.indexOf(nName) >= 0)) return Object.assign({ sure: false }, x);
      return null;
    }).filter(Boolean);
    return { inq: inq, bk: bk, qt: qt, mb: mb, name: name, company: company };
  }

  function bkStatus(b) { return b.status || (b.mode === 'google' ? 'confirmed' : 'tentative'); }

  function draw(d, who, email) {
    var body = P.panel.querySelector('.cu-body');
    var h2 = P.panel.querySelector('h2');
    h2.textContent = (d.name || email) + ' 様';
    P.panel.querySelector('.sub').textContent = [d.company, email].filter(Boolean).join('　');

    var items = [];
    d.inq.forEach(function (x) {
      items.push({ at: Date.parse(x.receivedAt) || 0, k: 'inq', tag: '問い合わせ・' + (ST_INQ[x.status] || x.status || ''),
        t: (x.topics && x.topics.length ? x.topics.join('、') : 'お問い合わせ'), p: x.snippet || '',
        run: function () { go('inquiries-admin', function () { if (window.lumInqOpen) window.lumInqOpen(x.id); }); } });
    });
    d.bk.forEach(function (b) {
      var st = bkStatus(b);
      items.push({ at: Date.parse(b.at || '') || b.start || 0, k: 'bk', tag: '予約・' + (ST_BK[st] || st),
        t: (b.when || ymd(b.start)) + (b.service ? '　' + b.service.name : ''), p: [b.note, b.memo ? 'メモ：' + b.memo : ''].filter(Boolean).join('　'),
        run: function () { go('booking-admin', function () { if (window.lumBookOpen) window.lumBookOpen(b.id); }); } });
    });
    d.qt.forEach(function (x) {
      items.push({ at: Date.parse(x.createdAt || x.date || '') || 0, k: 'qt', tag: (x.kind === 'invoice' ? '請求書・' : '見積書・') + (ST_QT[x.status] || x.status || ''),
        t: (x.number || '') + '　' + (x.subject || '') + '　' + yen(x.total), p: (x.sure ? '' : '宛先の名前が一致した見積書です（同じ方か、念のためご確認ください）'),
        run: function () { go('quotes-admin', function () { if (window.lumQuoteOpen) window.lumQuoteOpen(x.id); }); } });
    });
    if (d.mb) {
      var mAt = Date.parse(d.mb.created_at || d.mb.createdAt || '') || 0;
      items.push({ at: mAt, k: 'mb', tag: '会員', t: '会員登録' + (d.mb.unsubscribed ? '（配信停止中）' : ''), p: '', run: null });
    }
    items.sort(function (a, b) { return b.at - a.at; });

    var won = d.qt.filter(function (x) { return x.kind !== 'invoice' && (x.status === 'won'); }).reduce(function (a, x) { return a + (Number(x.total) || 0); }, 0);
    var visits = d.bk.filter(function (b) { return bkStatus(b) === 'visited'; }).length;
    var first = items.length ? items[items.length - 1].at : 0;
    var upcoming = d.bk.filter(function (b) { var s = bkStatus(b); return (s === 'confirmed' || s === 'tentative') && (b.start || 0) > Date.now(); }).length;

    var html = '<div class="cu-sum">' +
      '<div><b>' + d.inq.length + '</b><span>問い合わせ</span></div>' +
      '<div><b>' + d.bk.length + '</b><span>予約（来店 ' + visits + (upcoming ? '・予定 ' + upcoming : '') + '）</span></div>' +
      '<div><b>' + d.qt.length + '</b><span>見積書・請求書</span></div>' +
      '<div><b>' + (won ? yen(won) : '—') + '</b><span>受注した金額（税込）</span></div>' +
    '</div>';
    html += '<div class="cu-acts">' +
      (email ? '<a class="pri" href="mailto:' + esc(email) + '">メールを書く</a>' : '') +
      (visibleTab('quotes-admin') ? '<button type="button" data-cu="quote">この方あての見積書を作る</button>' : '') +
      (email ? '<button type="button" data-cu="copy">メールアドレスをコピー</button>' : '') +
    '</div>';
    html += first ? '<p class="cu-note">はじめての記録: ' + esc(ymd(first)) + (d.mb ? '　・会員' + (d.mb.unsubscribed ? '（お知らせメールは配信停止中）' : '') : '') + '</p>' : '';
    html += '<div class="cu-h">これまでの記録（新しい順）</div>';
    html += items.length ? '<ul class="cu-tl">' + items.map(function (it, i) {
      var tagCls = it.k === 'bk' ? ' bk' : it.k === 'qt' ? ' qt' : it.k === 'mb' ? ' mb' : '';
      var inner = '<span class="top"><span class="tag' + tagCls + '">' + esc(it.tag) + '</span><b>' + esc(it.t) + '</b><time>' + esc(ymd(it.at)) + '</time></span>' + (it.p ? '<p>' + esc(it.p) + '</p>' : '');
      return '<li class="k-' + it.k + '">' + (it.run ? '<button type="button" class="cu-it" data-run="' + i + '">' + inner + '</button>' : '<div class="cu-it">' + inner + '</div>') + '</li>';
    }).join('') + '</ul>' : '<p class="cu-note">この方の記録は見つかりませんでした。</p>';
    html += '<p class="cu-note" style="margin-top:14px">同じメールアドレスの問い合わせ・予約・会員登録と、その問い合わせから作った見積書を集めています。見られるのは、あなたの役割で開ける画面の分だけです。</p>';
    body.innerHTML = html;
    body.querySelectorAll('[data-run]').forEach(function (b) {
      b.addEventListener('click', function () { var it = items[Number(b.getAttribute('data-run'))]; if (it && it.run) it.run(); });
    });
    var q = body.querySelector('[data-cu="quote"]');
    if (q) q.addEventListener('click', function () {
      var pre = { toCompany: d.company || '', toPerson: d.name || '', toEmail: email || '', honor: d.company && !d.name ? '御中' : '様' };
      go('quotes-admin', function () { if (window.lumQuoteNew) window.lumQuoteNew(pre); });
    });
    var c = body.querySelector('[data-cu="copy"]');
    if (c) c.addEventListener('click', function () {
      var done = function () { c.textContent = 'コピーしました'; setTimeout(function () { c.textContent = 'メールアドレスをコピー'; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(email).then(done, function () {});
    });
  }

  window.lumCustomer = { open: open, close: close };
})();
