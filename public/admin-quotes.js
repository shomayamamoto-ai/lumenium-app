/* ---- 見積書 ----
   見積書（と、受注したあとの請求書）を作って、印刷・PDFにしたり、
   お客様にメールで送ったりする画面。管理画面（admin-members.html）の1タブです。

   できること。
     ・見積書の一覧（下書き・送付済み・受注・失注・期限切れ・請求書で絞る、探す）
     ・作る・直す（品目・数量・単価・税率・値引き。合計と消費税はその場で計算）
     ・問い合わせから作る（サイトの概算見積りが付いていれば、品目まで入ります）
     ・印刷・PDFで保存（ブラウザの印刷の画面から。A4 1枚の形）
     ・メールで送る（見るだけのリンク付き。お客様が開いたら、開いた日が出ます）
     ・複製、受注した見積書から請求書の下書き
     ・数字（今月の件数と金額・受注率・決まるまでの日数・どこから来たお客様か）
     ・よく使う品目、発行元の設定（会社名・登録番号・端数処理・ロゴ・印影）

   計算と紙の形は /quote-core.js（api/_quote-core.js から自動で作るもの）、
   読み書きは api/quotes.js です。 */
(function () {
  'use strict';
  var TAB = 'quotes-admin';
  var el = function (id) { return document.getElementById(id); };
  var S = {
    started: false, sec: 'list', filter: 'all', q: '', data: null,
    open: '', cur: null, dirty: false, pick: false, inq: null, panel: ''
  };
  var SECTIONS = [['list', '見積書'], ['stats', '数字'], ['catalog', 'よく使う品目'], ['settings', '設定']];
  var FILTERS = [['all', 'すべて'], ['draft', '下書き'], ['sent', '送付済み'], ['won', '受注'], ['lost', '失注'], ['expired', '期限切れ'], ['invoice', '請求書']];
  var core = function () { return window.lumQuoteCore; };

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function demo() { try { return sessionStorage.getItem('lum_demo') === '1'; } catch (_) { return false; } }
  function say(t, info) {
    var m = el('qt-msg');
    if (!m) return;
    m.textContent = t || '';
    m.classList.toggle('show', !!t);
    m.classList.toggle('info', !!info);
    if (t) { try { m.scrollIntoView({ block: 'nearest' }); } catch (_) {} }
  }
  async function api(url, opts) {
    try { return await window.lumAdmin.fetch(url, opts); }
    catch (_) { return { res: { ok: false, status: 0 }, data: { ok: false, message: '通信できませんでした。ネットの接続を確かめて、もう一度お試しください。' } }; }
  }
  function send(body) {
    return api('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  /* 計算のファイル（/quote-core.js）は、このタブを開いたときに1回だけ読みます。 */
  var coreWait = null;
  function loadCore() {
    if (core()) return Promise.resolve();
    if (coreWait) return coreWait;
    coreWait = new Promise(function (ok, ng) {
      var s = document.createElement('script');
      s.src = '/quote-core.js';
      s.onload = function () { ok(); };
      s.onerror = function () { coreWait = null; ng(new Error('core')); };
      document.head.appendChild(s);
    });
    return coreWait;
  }

  /* 「10/3」 */
  function md(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return '';
    var d = new Date(t + 9 * 3600000);
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
  }
  function ymdText(s) { return s ? Number(s.slice(5, 7)) + '/' + Number(s.slice(8, 10)) : '—'; }
  function yen(n) { return core().yen(n); }

  var CSS =
    '#quotes-admin button{transition:none}#quotes-admin .qt-acts button,#quotes-admin .qt-bar button{font-size:12px;padding:8px 13px}' +
    '.qt-top{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:14px}' +
    '.qt-card{border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:#fff;min-width:0}' +
    '.qt-card .k{font-size:11px;font-weight:700;color:var(--sub)}.qt-card .v{font-size:20px;font-weight:800;line-height:1.3;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}' +
    '.qt-card .n{font-size:11px;color:var(--sub);line-height:1.6}' +
    '.qt-note{border:1px solid var(--border);border-left:4px solid #b45309;border-radius:10px;padding:9px 12px;margin-bottom:10px;font-size:12.5px;line-height:1.75;background:#fffdf7}' +
    '.qt-note.red{border-left-color:#b42318;background:#fff8f7}.qt-note.gray{border-left-color:var(--sub);background:#faf9f6}.qt-note.blue{border-left-color:#3d3fbf;background:#f7f7ff}' +
    '.qt-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}' +
    '.qt-bar input[type=search]{flex:1 1 200px;min-width:0;padding:9px 12px;border:1px solid var(--border);border-radius:10px;background:#faf9f6;font:inherit;font-size:13px}' +
    '.qt-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--border)}.qt-list li{border-bottom:1px solid var(--border)}' +
    '.qt-open{display:block;width:100%;text-align:left;background:none;border:0;padding:11px 2px;color:var(--text);font:inherit;font-weight:400;cursor:pointer;letter-spacing:0;border-radius:0}' +
    '.qt-open:hover{filter:none;background:#faf9f6}.qt-open:focus-visible{outline:2px solid #3d3fbf;outline-offset:2px;border-radius:4px}' +
    '.qt-open .l1{display:flex;gap:8px;align-items:baseline;justify-content:space-between}' +
    '.qt-open .who{font-size:13.5px;font-weight:700;overflow-wrap:anywhere;min-width:0}.qt-open .amt{font-size:14px;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}' +
    '.qt-open .meta{font-size:11.5px;color:var(--sub);line-height:1.7;overflow-wrap:anywhere}' +
    '.qt-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 8px;border-radius:999px;background:#f3f1ec;color:var(--sub);margin:0 4px 2px 0;white-space:nowrap}' +
    '.qt-tag.sent{background:rgba(59,130,246,.13);color:#1d4ed8}.qt-tag.won,.qt-tag.paid{background:rgba(16,185,129,.16);color:#047857}' +
    '.qt-tag.lost{background:#f3f1ec;color:#6b6b74}.qt-tag.expired{background:rgba(180,35,24,.1);color:#b42318}.qt-tag.inv{background:rgba(99,102,241,.12);color:#3d3fbf}' +
    '.qt-sec{border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-top:12px;background:#fff;min-width:0}' +
    '.qt-sec h4{font-size:12px;letter-spacing:.08em;color:var(--sub);font-weight:700;margin:0 0 8px}' +
    '.qt-acts{display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
    '.qt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:4px 12px}' +
    '.qt-field{margin:6px 0;min-width:0}.qt-field label,.qt-field .lb{display:block;font-size:12px;font-weight:700;margin-bottom:4px}' +
    '.qt-field .hint{font-size:11px;color:var(--sub);line-height:1.6;margin-top:3px}.qt-field .hint.bad{color:#b42318;font-weight:700}.qt-field .hint.ok{color:#047857}' +
    '#quotes-admin input.qt-in,#quotes-admin select.qt-in,#quotes-admin textarea.qt-in{width:100%;min-width:0;padding:9px 10px;border:1px solid var(--border);border-radius:10px;background:#faf9f6;font:inherit;font-size:13px;line-height:1.5;color:var(--text)}' +
    '#quotes-admin textarea.qt-in{resize:vertical}' +
    '.qt-items{display:flex;flex-direction:column;gap:6px}' +
    '.qt-row{display:grid;grid-template-columns:minmax(0,1fr) 70px 58px 108px 112px 96px 34px;gap:6px;align-items:center}' +
    '.qt-row.head{font-size:11px;font-weight:700;color:var(--sub)}.qt-row.head span{padding-left:2px}' +
    '.qt-row .lb{display:none}.qt-row .amt{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;font-size:13px;white-space:nowrap}' +
    '.qt-row.disc .amt{color:#7a2a20}.qt-row .c{min-width:0;display:block}' +
    '#quotes-admin .qt-row .del{padding:6px 0;width:34px;font-size:13px;background:#faf9f6;border:1px solid var(--border);color:var(--sub)}' +
    '.qt-row input.num{text-align:right;font-variant-numeric:tabular-nums}' +
    '.qt-tot{margin-top:10px;margin-left:auto;max-width:360px;font-size:13px}.qt-tot table{width:100%;border-collapse:collapse}' +
    '.qt-tot th{text-align:left;font-weight:400;color:var(--sub);padding:3px 0}.qt-tot td{text-align:right;padding:3px 0;font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.qt-tot tr.big th,.qt-tot tr.big td{font-size:16px;font-weight:800;color:var(--text);border-top:1px solid var(--text);padding-top:6px}' +
    '.qt-hist{list-style:none;margin:0;padding:0;font-size:12px;line-height:1.7}.qt-hist li{padding:3px 0;border-top:1px dashed var(--border)}.qt-hist li:first-child{border-top:0}' +
    '.qt-hist time{color:var(--sub);margin-right:8px;white-space:nowrap}' +
    '.qt-tbl{width:100%;border-collapse:collapse;font-size:12.5px}.qt-tbl td,.qt-tbl th{padding:6px;border-bottom:1px solid var(--border);text-align:left;vertical-align:middle}' +
    '.qt-tbl th{font-size:11px;color:var(--sub);font-weight:700}.qt-tbl td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}' +
    '.qt-img{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.qt-img img{max-width:160px;max-height:64px;border:1px solid var(--border);border-radius:8px;background:#fff;padding:4px}' +
    '.qt-radio{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.6;margin:6px 0}.qt-radio input{width:18px;height:18px;margin-top:2px;flex:none}' +
    '.qt-link{display:flex;gap:6px;flex-wrap:wrap}.qt-link input{flex:1 1 240px}' +
    '@media (max-width:640px){.qt-top{grid-template-columns:1fr 1fr}.qt-card .v{font-size:17px}' +
    '.qt-row{grid-template-columns:1fr 1fr 1fr;border:1px solid var(--border);border-radius:10px;padding:8px;background:#fff;gap:6px 8px}' +
    '.qt-row.head{display:none}.qt-row .lb{display:block;font-size:10.5px;font-weight:700;color:var(--sub);margin-bottom:2px}' +
    '.qt-row .c.nm{grid-column:1 / -1}.qt-row .amt{align-self:end;padding-bottom:9px}.qt-row .del{justify-self:end;align-self:end}' +
    '.qt-row.disc .c.nm{grid-column:1 / -1}.qt-tot{max-width:none}.qt-tbl{font-size:12px}}';

  function addCss() {
    if (el('qt-css')) return;
    var s = document.createElement('style');
    s.id = 'qt-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- 骨組み ---------------- */

  function shell() {
    var host = el(TAB);
    host.innerHTML =
      '<h2 style="font-size:15px;font-weight:700;margin-bottom:4px">見積書</h2>' +
      '<p class="share-note" style="margin-bottom:12px">見積書を作って、印刷・PDFにしたり、お客様にメールで送ったりします。合計と消費税は自動で計算します（税率ごとに1回だけ端数を処理する、インボイス制度の決まりどおり）。' +
      '受注したら、同じ内容で請求書の下書きも作れます。</p>' +
      '<div class="nq-row" role="tablist" aria-label="見積書の項目">' + SECTIONS.map(function (s) {
        return '<button type="button" class="nq-chip" data-qsec="' + s[0] + '" aria-pressed="false">' + s[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="msg" id="qt-msg" style="margin:0 0 12px"></p>' +
      '<div id="qt-body"></div>';
    host.querySelectorAll('[data-qsec]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!leaveOk()) return;
        S.open = ''; S.cur = null; S.pick = false;
        go(b.getAttribute('data-qsec'));
      });
    });
  }

  function leaveOk() {
    if (!S.dirty) return true;
    if (!confirm('保存していない変更があります。このまま移ると、変更は消えます。よろしいですか？')) return false;
    S.dirty = false;
    return true;
  }

  function go(sec) {
    S.sec = sec;
    try { sessionStorage.setItem('lum_qt_sec', sec); } catch (_) {}
    document.querySelectorAll('#' + TAB + ' [data-qsec]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-qsec') === sec ? 'true' : 'false');
    });
    say('');
    var body = el('qt-body');
    if (!S.data) { body.innerHTML = '<p class="soc-small">読み込んでいます…</p>'; return; }
    if (sec === 'list') {
      if (S.cur) return editor(body);
      if (S.pick) return pickInquiry(body);
      return listView(body);
    }
    if (sec === 'stats') return statsView(body);
    if (sec === 'catalog') return catalogView(body);
    return settingsView(body);
  }

  async function load() {
    var r = await api('/api/quotes');
    if (!r.data || !r.data.ok) {
      el('qt-body').innerHTML = '<div class="qt-note red">' + esc((r.data && r.data.message) || '読み込めませんでした。') + '</div>';
      return false;
    }
    S.data = r.data;
    return true;
  }

  function settingsMissing() {
    var s = S.data.settings || {};
    return !s.company;
  }

  /* ---------------- 一覧 ---------------- */

  function statusOf(x) { return core().effectiveStatus(x, S.data.today); }
  function tagOf(x) {
    if ((x.kind || 'quote') === 'invoice') {
      var st = statusOf(x);
      return '<span class="qt-tag inv">請求書</span><span class="qt-tag ' + st + '">' + esc(core().INVOICE_STATUS[st]) + '</span>';
    }
    var s = statusOf(x);
    return '<span class="qt-tag ' + s + '">' + esc(core().QUOTE_STATUS[s]) + '</span>';
  }
  function matches(x) {
    var kind = x.kind || 'quote';
    if (S.filter === 'invoice') { if (kind !== 'invoice') return false; }
    else if (S.filter !== 'all') { if (kind !== 'quote' || statusOf(x) !== S.filter) return false; }
    if (!S.q) return true;
    var hay = [x.number, x.to, x.subject, x.source].join(' ').toLowerCase();
    return S.q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }

  function listView(body) {
    var C = core();
    var st = C.quoteStats(S.data.list, S.data.today);
    var counts = {};
    S.data.list.forEach(function (x) {
      var k = (x.kind || 'quote') === 'invoice' ? 'invoice' : statusOf(x);
      counts[k] = (counts[k] || 0) + 1;
    });
    var rows = S.data.list.filter(matches);
    body.innerHTML =
      (settingsMissing() ? '<div class="qt-note">はじめに「設定」で、見積書に載せる会社名・住所・連絡先を入れてください（登録番号があれば、それも）。入れるまでは、見積書の発行元が空のままです。 <button type="button" class="ghost" id="qt-goset" style="font-size:12px;padding:6px 12px;margin-left:4px">設定を開く</button></div>' : '') +
      '<div class="qt-top">' +
        card('今月の見積書', st.monthCount + '件', '合計 ' + yen(st.monthAmount)) +
        card('返事待ち', st.waiting + '件', '合計 ' + yen(st.waitingAmount) + '（送付済み・期限内）') +
        card('受注率', st.winRate == null ? '—' : Math.round(st.winRate * 100) + '%', st.decided ? st.decided + '件中 ' + st.won + '件' + (st.few ? '（まだ少ないので参考程度）' : '') : 'まだ決まった見積書がありません') +
        card('期限切れ', st.expired + '件', '有効期限を過ぎて、返事がないもの') +
      '</div>' +
      '<div class="qt-bar"><button type="button" id="qt-new">＋ 新しい見積書</button><button type="button" class="ghost" id="qt-frominq">問い合わせから作る</button></div>' +
      '<div class="nq-row" role="group" aria-label="絞り込み">' + FILTERS.map(function (f) {
        var n = f[0] === 'all' ? S.data.list.length : counts[f[0]] || 0;
        return '<button type="button" class="nq-chip" data-qf="' + f[0] + '" aria-pressed="' + (S.filter === f[0]) + '">' + f[1] + ' ' + n + '</button>';
      }).join('') + '</div>' +
      '<div class="qt-bar"><input type="search" id="qt-q" placeholder="宛先・件名・番号で探す" aria-label="見積書を探す" value="' + esc(S.q) + '"></div>' +
      (rows.length ? '<ul class="qt-list">' + rows.map(function (x) {
        var meta = [x.number, '発行 ' + ymdText(x.date)];
        if ((x.kind || 'quote') === 'invoice') { if (x.dueDate) meta.push('支払期限 ' + ymdText(x.dueDate)); }
        else if (x.validUntil) meta.push('有効期限 ' + ymdText(x.validUntil));
        if (x.sentAt) meta.push('送付 ' + md(x.sentAt));
        if (x.openedAt) meta.push('お客様が開いた ' + md(x.openedAt));
        else if (x.sentAt && statusOf(x) === 'sent') meta.push('まだ開かれていません');
        if (x.inquiryId) meta.push('問い合わせから');
        return '<li><button type="button" class="qt-open" data-qid="' + esc(x.id) + '"><div class="l1"><span class="who">' + tagOf(x) + esc(x.to) + '</span><span class="amt">' + yen(x.total) + '</span></div>' +
          '<div class="meta">' + esc(x.subject || '（件名なし）') + '</div><div class="meta">' + esc(meta.join('・')) + '</div></button></li>';
      }).join('') + '</ul>'
        : '<p class="soc-small">' + (S.data.list.length ? '当てはまる見積書はありません。' : 'まだ見積書がありません。「＋ 新しい見積書」か「問い合わせから作る」で始めてください。') + '</p>');
    if (el('qt-goset')) el('qt-goset').addEventListener('click', function () { go('settings'); });
    el('qt-new').addEventListener('click', function () { openNew(); });
    el('qt-frominq').addEventListener('click', function () { S.pick = true; go('list'); });
    body.querySelectorAll('[data-qf]').forEach(function (b) {
      b.addEventListener('click', function () { S.filter = b.getAttribute('data-qf'); listView(body); });
    });
    var q = el('qt-q');
    q.addEventListener('input', function () {
      S.q = q.value.trim();
      var pos = q.selectionStart;
      listView(body);
      var n = el('qt-q'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {}
    });
    body.querySelectorAll('[data-qid]').forEach(function (b) {
      b.addEventListener('click', function () { openQuote(b.getAttribute('data-qid')); });
    });
  }
  function card(k, v, n) {
    return '<div class="qt-card"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div><div class="n">' + esc(n) + '</div></div>';
  }

  /* ---------------- 問い合わせから作る ---------------- */

  async function pickInquiry(body) {
    body.innerHTML = '<div class="qt-bar"><button type="button" class="ghost" id="qt-back">← 一覧へ</button></div>' +
      '<p class="share-note" style="margin-bottom:8px">見積書にする問い合わせを選んでください。サイトの「概算見積り」が付いている問い合わせは、品目と金額（概算の下限）まで入ります。宛先・件名は、どの問い合わせでも入ります。</p>' +
      '<div id="qt-inq"><p class="soc-small">問い合わせを読んでいます…</p></div>';
    el('qt-back').addEventListener('click', function () { S.pick = false; go('list'); });
    var r = await api('/api/quotes?view=inquiries');
    var host = el('qt-inq');
    if (!host) return;
    var d = r.data || {};
    if (!d.ok) { host.innerHTML = '<div class="qt-note red">' + esc(d.message || '問い合わせを読めませんでした。') + '</div>'; return; }
    if (!d.items.length) { host.innerHTML = '<p class="soc-small">保存された問い合わせがありません。</p>'; return; }
    host.innerHTML = '<ul class="qt-list">' + d.items.map(function (x) {
      return '<li><button type="button" class="qt-open" data-inq="' + esc(x.id) + '"><div class="l1"><span class="who">' +
        (x.estimate ? '<span class="qt-tag won">概算あり</span>' : '') + esc([x.company, x.name].filter(Boolean).join(' ') || '（名前なし）') +
        '</span><span class="meta">' + esc(md(x.receivedAt)) + '</span></div>' +
        '<div class="meta">' + esc((x.topics || []).join('・') || '—') + (x.source ? '・' + esc(x.source) : '') + '</div>' +
        '<div class="meta">' + esc(x.snippet) + '</div></button></li>';
    }).join('') + '</ul>';
    host.querySelectorAll('[data-inq]').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        var x = await send({ action: 'from-inquiry', inquiryId: b.getAttribute('data-inq') });
        b.disabled = false;
        if (!x.data || !x.data.ok) { say((x.data && x.data.message) || '下書きを作れませんでした。'); return; }
        S.pick = false;
        S.cur = x.data.draft;
        S.dirty = true;
        go('list');
        say(x.data.draft.items.length ? '問い合わせから下書きを作りました。金額は概算の下限です。内容を確かめて直してから保存してください。' : '問い合わせから宛先と件名を入れました。品目を足して保存してください。', true);
      });
    });
  }

  /* ---------------- 作る・直す ---------------- */

  function openNew() {
    var s = S.data.settings || {};
    var t = S.data.today;
    S.cur = {
      kind: 'quote', number: '', date: t, toCompany: '', toPerson: '', honor: '御中', toEmail: '', subject: '',
      items: [{ kind: 'item', name: '', qty: 1, unit: '式', price: 0, rate: 10 }],
      taxMode: s.taxMode || 'excl', validUntil: core().addDays(t, Number(s.validDays) || 30),
      delivery: s.delivery || '', payTerms: s.payTerms || '', notes: s.notes || '', memo: '', status: 'draft', history: []
    };
    S.dirty = false;
    S.panel = '';
    go('list');
  }

  async function openQuote(id) {
    say('');
    el('qt-body').innerHTML = '<p class="soc-small">読み込んでいます…</p>';
    var r = await api('/api/quotes?id=' + encodeURIComponent(id));
    if (!r.data || !r.data.ok) { say((r.data && r.data.message) || '読み込めませんでした。'); S.cur = null; go('list'); return; }
    S.cur = r.data.quote;
    S.dirty = false;
    S.panel = '';
    go('list');
  }

  function rateOpts(v, discount) {
    var o = [['10', '10%'], ['8', '8%軽減'], ['0', '非課税']];
    if (discount) o.unshift(['all', '全体で按分']);
    return o.map(function (x) { return '<option value="' + x[0] + '"' + (String(v) === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('');
  }
  function itemRow(it, i) {
    if (it.kind === 'discount') {
      return '<div class="qt-row disc" data-i="' + i + '" data-kind="discount">' +
        '<label class="c nm"><span class="lb">値引きの名前</span><input class="qt-in" data-f="name" value="' + esc(it.name) + '" placeholder="値引き" aria-label="値引きの名前"></label>' +
        '<span class="c"></span><span class="c"></span>' +
        '<label class="c"><span class="lb">値引きの額</span><input class="qt-in num" data-f="price" inputmode="numeric" value="' + esc(it.price || '') + '" aria-label="値引きの額"></label>' +
        '<label class="c"><span class="lb">どの税率から</span><select class="qt-in" data-f="rate" aria-label="どの税率から引くか">' + rateOpts(it.rate, true) + '</select></label>' +
        '<span class="amt" data-amt="' + i + '"></span>' +
        '<button type="button" class="del" data-del="' + i + '" aria-label="この行を消す">✕</button></div>';
    }
    return '<div class="qt-row" data-i="' + i + '" data-kind="item">' +
      '<label class="c nm"><span class="lb">品目</span><input class="qt-in" data-f="name" value="' + esc(it.name) + '" placeholder="品目" aria-label="品目" list="qt-cat"></label>' +
      '<label class="c"><span class="lb">数量</span><input class="qt-in num" data-f="qty" inputmode="decimal" value="' + esc(it.qty) + '" aria-label="数量"></label>' +
      '<label class="c"><span class="lb">単位</span><input class="qt-in" data-f="unit" value="' + esc(it.unit) + '" aria-label="単位"></label>' +
      '<label class="c"><span class="lb">単価</span><input class="qt-in num" data-f="price" inputmode="numeric" value="' + esc(it.price || '') + '" aria-label="単価"></label>' +
      '<label class="c"><span class="lb">税率</span><select class="qt-in" data-f="rate" aria-label="税率">' + rateOpts(it.rate) + '</select></label>' +
      '<span class="amt" data-amt="' + i + '"></span>' +
      '<button type="button" class="del" data-del="' + i + '" aria-label="この行を消す">✕</button></div>';
  }
  function field(id, lb, input, hint) {
    return '<div class="qt-field"><label for="' + id + '">' + esc(lb) + '</label>' + input + (hint ? '<div class="hint" id="' + id + '-hint">' + esc(hint) + '</div>' : '') + '</div>';
  }
  function inp(id, v, attrs) { return '<input class="qt-in" id="' + id + '" value="' + esc(v == null ? '' : v) + '"' + (attrs || '') + '>'; }

  function editor(body) {
    var C = core();
    var q = S.cur;
    var inv = q.kind === 'invoice';
    var noun = inv ? '請求書' : '見積書';
    var saved = !!q.id;
    var st = saved ? statusOf(q) : 'draft';
    var stTable = inv ? C.INVOICE_STATUS : C.QUOTE_STATUS;
    var stOpts = Object.keys(stTable).filter(function (k) { return k !== 'expired'; }).map(function (k) {
      return '<option value="' + k + '"' + (q.status === k ? ' selected' : '') + '>' + stTable[k] + '</option>';
    }).join('');
    var cat = (S.data.catalog || []);
    var hist = (q.history || []).slice().reverse();
    body.innerHTML =
      '<div class="qt-bar"><button type="button" class="ghost" id="qt-back">← 一覧へ</button>' +
        '<b style="font-size:14px">' + esc(saved ? noun + ' ' + q.number : '新しい' + noun + '（まだ保存していません）') + '</b>' +
        (saved ? '<span>' + tagOf(q) + '</span>' : '') + '</div>' +
      (q.inquiryId ? '<div class="qt-note blue">問い合わせから作った' + noun + 'です' + (q.source ? '（' + esc(q.source) + '）' : '') + '。 <button type="button" class="ghost" id="qt-inqback" style="font-size:12px;padding:6px 12px">元の問い合わせを開く</button></div>' : '') +
      (q.fromQuote ? '<div class="qt-note blue">受注した見積書から作った請求書です。 <button type="button" class="ghost" id="qt-qback" style="font-size:12px;padding:6px 12px">元の見積書を開く</button></div>' : '') +
      (saved && st === 'expired' ? '<div class="qt-note red">有効期限（' + esc(C.jpDate(q.validUntil)) + '）を過ぎています。まだお話が続いているなら、有効期限を延ばして保存するか、複製して出し直してください。</div>' : '') +
      '<div class="qt-acts">' +
        '<button type="button" id="qt-save">保存</button>' +
        '<button type="button" class="ghost" id="qt-print">印刷・PDFで保存</button>' +
        (saved ? '<button type="button" class="ghost" id="qt-mail">メールで送る</button><button type="button" class="ghost" id="qt-link">リンクを作る</button>' +
          '<button type="button" class="ghost" id="qt-dup">複製</button>' +
          (!inv && q.status === 'won' ? '<button type="button" class="ghost" id="qt-inv">請求書を作る</button>' : '') +
          '<label style="font-size:12px;display:flex;gap:6px;align-items:center">状態 <select class="qt-in" id="qt-status" style="width:auto">' + stOpts + '</select></label>' +
          '<button type="button" class="ghost" id="qt-del">消す</button>' : '') +
      '</div>' +
      '<div id="qt-panel"></div>' +
      '<div class="qt-sec"><h4>宛先と内容</h4><div class="qt-grid">' +
        field('qt-toCompany', '宛先（会社・団体名）', inp('qt-toCompany', q.toCompany, ' autocomplete="off"')) +
        field('qt-toPerson', '宛先（ご担当者のお名前）', inp('qt-toPerson', q.toPerson, ' autocomplete="off"')) +
        field('qt-honor', '敬称', '<select class="qt-in" id="qt-honor"><option value="御中"' + (q.honor === '御中' ? ' selected' : '') + '>御中（会社あて）</option><option value="様"' + (q.honor !== '御中' ? ' selected' : '') + '>様（個人あて）</option></select>',
          '会社名だけなら「御中」、お名前を書くなら「様」。両方は付けません。') +
        field('qt-toEmail', 'お客様のメールアドレス', inp('qt-toEmail', q.toEmail, ' type="email" autocomplete="off"'), '印刷物には出ません（メールで送るときに使います）。') +
      '</div><div class="qt-grid">' +
        field('qt-subject', '件名', inp('qt-subject', q.subject, ' placeholder="例: ホームページ制作"')) +
        field('qt-number', inv ? '請求番号' : '見積番号', inp('qt-number', q.number, ' placeholder="空なら保存のときに自動で振ります"')) +
        field('qt-date', inv ? '請求日' : '発行日', inp('qt-date', q.date, ' type="date"')) +
        (inv
          ? field('qt-dueDate', 'お支払期限', inp('qt-dueDate', q.dueDate, ' type="date"')) +
            field('qt-delivery', 'お取引日（納品・作業の日）', inp('qt-delivery', q.delivery, ' placeholder="例: 2026年9月20日／2026年9月分"'), '適格請求書（インボイス）には、取引の年月日が必要です。')
          : field('qt-validUntil', '有効期限', inp('qt-validUntil', q.validUntil, ' type="date"'), 'この日を過ぎて返事がないと「期限切れ」になります。') +
            field('qt-delivery', '納期', inp('qt-delivery', q.delivery)) +
            field('qt-payTerms', 'お支払条件', inp('qt-payTerms', q.payTerms))) +
      '</div></div>' +
      '<div class="qt-sec"><h4>品目</h4>' +
        '<div style="max-width:300px">' + field('qt-taxMode', '単価の書き方', '<select class="qt-in" id="qt-taxMode"><option value="excl"' + (q.taxMode !== 'incl' ? ' selected' : '') + '>税抜の単価（消費税は下で足す）</option><option value="incl"' + (q.taxMode === 'incl' ? ' selected' : '') + '>税込の単価（消費税は内数で出す）</option></select>') + '</div>' +
        '<div class="qt-items" id="qt-items"><div class="qt-row head" aria-hidden="true"><span>品目</span><span>数量</span><span>単位</span><span>単価</span><span>税率</span><span style="text-align:right">金額</span><span></span></div>' +
          q.items.map(itemRow).join('') + '</div>' +
        '<datalist id="qt-cat">' + cat.map(function (c) { return '<option value="' + esc(c.name) + '">'; }).join('') + '</datalist>' +
        '<div class="qt-acts" style="margin-top:8px"><button type="button" class="ghost" id="qt-add">＋ 行を足す</button><button type="button" class="ghost" id="qt-adddisc">＋ 値引き</button>' +
        (cat.length ? '<select class="qt-in" id="qt-addcat" style="width:auto;max-width:100%" aria-label="よく使う品目から足す"><option value="">よく使う品目から足す…</option>' +
          cat.map(function (c, i) { return '<option value="' + i + '">' + esc(c.name) + '（' + esc(yen(c.price)) + '）</option>'; }).join('') + '</select>' : '') +
        '</div>' +
        '<div class="soc-small" style="margin-top:6px">品目の欄に打ち始めると、よく使う品目が候補に出ます（選ぶと単価と単位も入ります）。値引きは「どの税率から引くか」を選びます。「全体」にすると、税率ごとの金額の割合で分けて引きます。</div>' +
        '<div class="qt-tot" id="qt-tot" aria-live="polite"></div>' +
      '</div>' +
      '<div class="qt-sec"><h4>備考と社内メモ</h4>' +
        field('qt-notes', '備考（' + noun + 'に印刷されます）', '<textarea class="qt-in" id="qt-notes" rows="3">' + esc(q.notes) + '</textarea>') +
        field('qt-memo', '社内メモ（印刷されません・お客様には見えません）', '<textarea class="qt-in" id="qt-memo" rows="3">' + esc(q.memo) + '</textarea>') +
      '</div>' +
      (hist.length ? '<div class="qt-sec"><h4>記録</h4><ul class="qt-hist">' + hist.map(function (h) {
        return '<li><time>' + esc(md(h.at)) + '</time>' + esc(h.text) + '</li>';
      }).join('') + '</ul>' +
        (q.openedAt ? '<div class="soc-small" style="margin-top:6px">お客様がリンクを開いた回数: ' + (q.views || 0) + '回（最後 ' + esc(md(q.lastViewedAt)) + '）。会社のメールの安全確認の仕組みが先にリンクを開くことがあり、その場合もここに数えられます。</div>' : '') +
      '</div>' : '');

    el('qt-back').addEventListener('click', function () { if (!leaveOk()) return; S.cur = null; go('list'); });
    if (el('qt-inqback')) el('qt-inqback').addEventListener('click', function () {
      if (!leaveOk()) return;
      if (window.lumInqOpen) window.lumInqOpen(q.inquiryId); else say('問い合わせ管理を開けませんでした。');
    });
    if (el('qt-qback')) el('qt-qback').addEventListener('click', function () { if (leaveOk()) openQuote(q.fromQuote); });
    el('qt-save').addEventListener('click', save);
    el('qt-print').addEventListener('click', printDoc);
    if (saved) {
      el('qt-mail').addEventListener('click', function () { togglePanel('mail'); });
      el('qt-link').addEventListener('click', makeLink);
      el('qt-dup').addEventListener('click', function () { derive('duplicate'); });
      if (el('qt-inv')) el('qt-inv').addEventListener('click', function () { derive('invoice'); });
      el('qt-status').addEventListener('change', changeStatus);
      el('qt-del').addEventListener('click', remove);
    }
    body.querySelectorAll('.qt-sec input, .qt-sec select, .qt-sec textarea').forEach(function (f) {
      f.addEventListener('input', onEdit);
      f.addEventListener('change', onEdit);
    });
    el('qt-items').addEventListener('click', function (e) {
      var b = e.target.closest('[data-del]');
      if (!b) return;
      readForm();
      S.cur.items.splice(Number(b.getAttribute('data-del')), 1);
      S.dirty = true;
      redrawItems();
    });
    el('qt-add').addEventListener('click', function () { addItem({ kind: 'item', name: '', qty: 1, unit: '式', price: 0, rate: 10 }); });
    el('qt-adddisc').addEventListener('click', function () { addItem({ kind: 'discount', name: '値引き', price: 0, rate: onlyRate() }); });
    if (el('qt-addcat')) el('qt-addcat').addEventListener('change', function () {
      var c = cat[Number(this.value)];
      this.value = '';
      if (c) addItem({ kind: 'item', name: c.name, qty: 1, unit: c.unit, price: c.price, rate: c.rate });
    });
    if (S.panel) togglePanel(S.panel, true);
    totals();
  }

  /* 値引きの既定の税率。品目の税率が1つだけならそれ、混ざっていれば「全体」。 */
  function onlyRate() {
    var rates = {};
    S.cur.items.forEach(function (it) { if (it.kind !== 'discount') rates[it.rate] = 1; });
    var k = Object.keys(rates);
    return k.length === 1 ? Number(k[0]) : 'all';
  }
  function addItem(it) {
    readForm();
    S.cur.items.push(it);
    S.dirty = true;
    redrawItems();
    var rows = document.querySelectorAll('#qt-items .qt-row[data-i]');
    var last = rows[rows.length - 1];
    if (last) { var f = last.querySelector('input'); if (f) f.focus(); }
  }
  function redrawItems() {
    var host = el('qt-items');
    var head = host.querySelector('.head').outerHTML;
    host.innerHTML = head + S.cur.items.map(itemRow).join('');
    host.querySelectorAll('input, select').forEach(function (f) {
      f.addEventListener('input', onEdit);
      f.addEventListener('change', onEdit);
    });
    totals();
  }

  function onEdit(e) {
    S.dirty = true;
    // よく使う品目の名前を選んだら、単価・単位・税率も入れる（単価が空のときだけ）。
    var t = e && e.target;
    if (t && t.getAttribute && t.getAttribute('data-f') === 'name' && e.type === 'change') {
      var c = (S.data.catalog || []).filter(function (x) { return x.name === t.value; })[0];
      var row = t.closest('.qt-row');
      if (c && row && row.getAttribute('data-kind') === 'item') {
        var p = row.querySelector('[data-f=price]');
        if (!core().num(p.value)) {
          p.value = c.price;
          row.querySelector('[data-f=unit]').value = c.unit;
          row.querySelector('[data-f=rate]').value = String(c.rate);
        }
      }
    }
    readForm();
    totals();
  }

  function val(id) { var f = el(id); return f ? f.value : undefined; }
  function readForm() {
    var q = S.cur;
    ['toCompany', 'toPerson', 'honor', 'toEmail', 'subject', 'number', 'date', 'validUntil', 'dueDate', 'delivery', 'payTerms', 'taxMode', 'notes', 'memo'].forEach(function (k) {
      var v = val('qt-' + k);
      if (v !== undefined) q[k] = v;
    });
    var items = [];
    document.querySelectorAll('#qt-items .qt-row[data-i]').forEach(function (row) {
      var g = function (f) { var x = row.querySelector('[data-f=' + f + ']'); return x ? x.value : ''; };
      if (row.getAttribute('data-kind') === 'discount') {
        items.push({ kind: 'discount', name: g('name'), price: g('price'), rate: g('rate') === 'all' ? 'all' : Number(g('rate')) });
      } else {
        items.push({ kind: 'item', name: g('name'), qty: g('qty'), unit: g('unit'), price: g('price'), rate: Number(g('rate')) });
      }
    });
    q.items = items;
  }
  /* 計算用（数に直したもの）。全角の数字・カンマ・「円」も読みます。 */
  function numeric(q) {
    var C = core();
    var n = function (v) { var x = C.num(v); return isFinite(x) && x > 0 ? x : 0; };
    return Object.assign({}, q, {
      items: q.items.map(function (it) {
        return it.kind === 'discount'
          ? { kind: 'discount', name: it.name, price: Math.round(n(it.price)), rate: it.rate }
          : { kind: 'item', name: it.name, qty: Math.round(n(it.qty) * 100) / 100, unit: it.unit, price: Math.round(n(it.price)), rate: it.rate };
      })
    });
  }
  function totals() {
    var C = core();
    var q = numeric(S.cur);
    var t = C.computeTotals(q, S.data.settings.rounding);
    t.amounts.forEach(function (a, i) {
      var c = document.querySelector('[data-amt="' + i + '"]');
      if (c) c.textContent = yen(a);
    });
    var incl = t.taxMode === 'incl';
    var rows = t.discount ? '<tr><th>値引き前の合計' + (incl ? '（税込）' : '（税抜）') + '</th><td>' + yen(t.itemsTotal) + '</td></tr><tr><th>値引き</th><td>' + yen(-t.discount) + '</td></tr>' : '';
    rows += '<tr><th>小計（税抜）</th><td>' + yen(t.subtotal) + '</td></tr>';
    t.groups.forEach(function (g) {
      if (!g.rate) { rows += '<tr><th>非課税</th><td>' + yen(g.amount) + '</td></tr>'; return; }
      rows += '<tr><th>' + g.rate + '% 対象' + (incl ? '（税込）' : '') + '</th><td>' + yen(incl ? g.incl : g.excl) + '</td></tr>' +
        '<tr><th>' + g.rate + '% 消費税' + (incl ? '（内税）' : '') + '</th><td>' + yen(g.tax) + '</td></tr>';
    });
    rows += '<tr class="big"><th>合計（税込）</th><td>' + yen(t.total) + '</td></tr>';
    el('qt-tot').innerHTML = (t.errors.length ? '<div class="qt-note red">' + esc(t.errors.join(' ')) + '</div>' : '') +
      '<table>' + rows + '</table><div class="soc-small" style="margin-top:4px">消費税は税率ごとの合計から1回だけ計算し、1円未満は「' + esc(C.ROUNDING[t.rounding]) + '」です（「設定」で変えられます）。</div>';
  }

  async function save() {
    readForm();
    var q = numeric(S.cur);
    var t = core().computeTotals(q, S.data.settings.rounding);
    if (t.errors.length) { say(t.errors.join(' ')); return false; }
    var b = el('qt-save');
    b.disabled = true;
    var r = await send({ action: 'save', quote: q });
    b.disabled = false;
    var d = r.data || {};
    if (!d.ok) { say(d.message || '保存できませんでした。'); return false; }
    S.cur = d.quote;
    S.dirty = false;
    upsert(d.summary);
    go('list');
    say('保存しました（' + d.quote.number + '）。', true);
    return true;
  }
  function upsert(sum) {
    if (!sum) return;
    var list = S.data.list;
    for (var i = 0; i < list.length; i++) { if (list[i].id === sum.id) { list[i] = sum; return; } }
    list.unshift(sum);
  }

  async function changeStatus() {
    var sel = el('qt-status');
    var want = sel.value;
    var r = await send({ action: 'status', id: S.cur.id, status: want });
    var d = r.data || {};
    if (!d.ok) { sel.value = S.cur.status; say(d.message || '状態を変えられませんでした。'); return; }
    var keepDirty = S.dirty;
    if (keepDirty) readForm();
    S.cur.status = d.quote.status;
    S.cur.decidedAt = d.quote.decidedAt;
    S.cur.sentAt = d.quote.sentAt;
    S.cur.history = d.quote.history;
    upsert(Object.assign({}, S.data.list.filter(function (x) { return x.id === S.cur.id; })[0] || {}, { status: d.quote.status, decidedAt: d.quote.decidedAt, sentAt: d.quote.sentAt }));
    go('list');
    S.dirty = keepDirty;
    say('状態を「' + sel.options[sel.selectedIndex].text + '」にしました。' + (want === 'won' && S.cur.kind !== 'invoice' ? '「請求書を作る」で、同じ内容の請求書の下書きを作れます。' : ''), true);
  }

  async function derive(action) {
    if (!leaveOk()) return;
    var r = await send({ action: action, id: S.cur.id });
    var d = r.data || {};
    if (!d.ok) { say(d.message || 'できませんでした。'); return; }
    upsert(d.summary);
    S.cur = d.quote;
    S.dirty = false;
    go('list');
    say(d.message || '作りました。', true);
  }

  async function remove() {
    var noun = S.cur.kind === 'invoice' ? '請求書' : '見積書';
    if (!confirm(noun + ' ' + S.cur.number + ' を消します。元に戻せません。お客様に送ったリンクも開けなくなります。よろしいですか？')) return;
    var r = await send({ action: 'delete', id: S.cur.id });
    var d = r.data || {};
    if (!d.ok) { say(d.message || '消せませんでした。'); return; }
    var id = S.cur.id;
    S.data.list = S.data.list.filter(function (x) { return x.id !== id; });
    S.cur = null; S.dirty = false;
    go('list');
    say('消しました。', true);
  }

  /* ---------------- 印刷・PDF ---------------- */

  function printDoc() {
    readForm();
    var q = numeric(S.cur);
    var note = !q.id ? 'まだ保存していません。番号は保存したときに振られます。' : true;
    /* 中身はこの画面で作り、ブラウザの中だけの一時的なアドレス（blob:）で開きます。
       サーバーには何も送らないので、デモでも、保存する前でも確かめられます。 */
    var url = URL.createObjectURL(new Blob([core().docPage(q, S.data.settings, { toolbar: note, draft: true })], { type: 'text/html;charset=utf-8' }));
    var w = window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    if (!w) say('新しい窓を開けませんでした。ブラウザがポップアップを止めていないか確かめてください。');
  }

  /* ---------------- メール・リンク ---------------- */

  function togglePanel(kind, keep) {
    var host = el('qt-panel');
    if (!keep && S.panel === kind) { S.panel = ''; host.innerHTML = ''; return; }
    S.panel = kind;
    if (kind === 'mail') return mailPanel(host);
    if (kind === 'link') return;
  }

  function mailPanel(host) {
    var C = core();
    readForm();
    var s = S.data.settings;
    var q = numeric(S.cur);
    var m = S.data.mail || {};
    var vars = C.mailVars(q, s, '{リンク}', s.rounding);
    var blocked = !m.key ? 'メールの設定（RESEND_API_KEY）がまだのため、ここからは送れません。「リンクを作る」でリンクだけ作り、ふだんのメールやLINEに貼って送ることはできます。'
      : m.sandbox ? '送信元が Resend の試用アドレス（onboarding@resend.dev）のままなので、お客様には届きません（試用中は自分あてにしか送れない決まりです）。送信元のドメインを設定するまでは、「リンクを作る」でリンクだけ作って、ふだんのメールで送ってください。'
      : !m.secret ? 'リンクの署名に使う鍵（SESSION_SECRET か ADMIN_KEY）がありません。「設定状況」で入れてください。' : '';
    host.innerHTML = '<div class="qt-sec"><h4>メールで送る</h4>' +
      (blocked ? '<div class="qt-note red">' + esc(blocked) + '</div>' : '') +
      '<p class="soc-small" style="margin:0 0 6px">お客様には「見るだけのリンク」を送ります（PDFの添付ではありません）。リンクは ' + esc(s.linkDays || 60) + '日間開けます。送ると状態が「送付済み」になり、お客様が開くと「開いた日」がここに出ます。{リンク} のところに、送るときにリンクが入ります。</p>' +
      field('qt-mto', '宛先のメールアドレス', inp('qt-mto', q.toEmail, ' type="email"')) +
      field('qt-msub', '件名', inp('qt-msub', C.fillMail(s.mailSubject, vars))) +
      field('qt-mbody', '本文', '<textarea class="qt-in" id="qt-mbody" rows="12">' + esc(C.fillMail(s.mailBody, vars)) + '</textarea>') +
      '<div class="qt-acts"><button type="button" id="qt-msend"' + (blocked ? ' disabled' : '') + '>この内容で送る</button><button type="button" class="ghost" id="qt-mclose">閉じる</button></div></div>';
    el('qt-mclose').addEventListener('click', function () { togglePanel('mail'); });
    el('qt-msend').addEventListener('click', async function () {
      var to = el('qt-mto').value.trim();
      if (!to) { say('宛先のメールアドレスを入れてください。'); return; }
      if (!confirm(to + ' に送ります。よろしいですか？')) return;
      if (S.dirty && !(await save())) return;
      var b = el('qt-msend');
      if (b) b.disabled = true;
      var r = await send({ action: 'send', id: S.cur.id, to: to, subject: el('qt-msub') ? el('qt-msub').value : '', body: el('qt-mbody') ? el('qt-mbody').value : '' });
      if (b) b.disabled = false;
      var d = r.data || {};
      if (!d.ok) { say(d.message || '送れませんでした。'); return; }
      S.cur = d.quote;
      S.panel = '';
      upsert(Object.assign({}, S.data.list.filter(function (x) { return x.id === d.quote.id; })[0] || {}, { status: d.quote.status, sentAt: d.quote.sentAt }));
      go('list');
      say(d.message, true);
    });
  }

  async function makeLink() {
    // リンクで見えるのは保存した内容です。直しかけなら、先に保存するか聞きます。
    if (S.dirty && confirm('保存していない変更があります。リンクで見えるのは保存した内容です。先に保存しますか？（「キャンセル」なら、前に保存した内容のままリンクを作ります）')) {
      if (!(await save())) return;
    }
    var r = await send({ action: 'link', id: S.cur.id });
    var d = r.data || {};
    var host = el('qt-panel');
    S.panel = 'link';
    if (!d.ok) { host.innerHTML = ''; say(d.message || 'リンクを作れませんでした。'); return; }
    host.innerHTML = '<div class="qt-sec"><h4>見るだけのリンク</h4>' +
      '<p class="soc-small" style="margin:0 0 6px">このリンクを、ふだんのメールやLINEに貼って送れます。開けるのは ' + esc(S.data.settings.linkDays || 60) + '日間です。お客様は見る・印刷・PDFで保存ができ、中身を書き換えることはできません。リンクだけ作っても状態は変わらないので、送ったら状態を「送付済み」にしてください。</p>' +
      '<div class="qt-link"><input class="qt-in" id="qt-linkurl" readonly value="' + esc(d.url) + '" aria-label="見るだけのリンク"><button type="button" class="ghost" id="qt-copy">コピー</button></div></div>';
    el('qt-copy').addEventListener('click', function () {
      var f = el('qt-linkurl');
      f.select();
      var done = function () { say('リンクをコピーしました。', true); };
      if (navigator.clipboard) navigator.clipboard.writeText(f.value).then(done, function () { try { document.execCommand('copy'); done(); } catch (_) {} });
      else { try { document.execCommand('copy'); done(); } catch (_) {} }
    });
  }

  /* ---------------- 数字 ---------------- */

  function statsView(body) {
    var C = core();
    var st = C.quoteStats(S.data.list, S.data.today);
    var month = Number(st.month.slice(5, 7)) + '月';
    body.innerHTML =
      '<div class="qt-top">' +
        card(month + 'の見積書', st.monthCount + '件', '合計 ' + yen(st.monthAmount)) +
        card(month + 'の受注額', yen(st.monthWonAmount), month + 'に出した見積書のうち、受注したもの') +
        card('受注率', st.winRate == null ? '—' : Math.round(st.winRate * 100) + '%', '受注 ÷（受注＋失注）・' + (st.decided ? st.decided + '件中 ' + st.won + '件' : 'まだありません')) +
        card('決まるまで', st.avgDays == null ? '—' : st.avgDays + '日', st.daysN ? '発行日から受注・失注を選んだ日までの平均（' + st.daysN + '件）' : 'まだありません') +
        card('返事待ち', st.waiting + '件', '合計 ' + yen(st.waitingAmount)) +
        card('期限切れ', st.expired + '件', '有効期限を過ぎて、返事がないもの') +
      '</div>' +
      (st.few ? '<div class="qt-note gray">受注・失注が決まった見積書がまだ ' + st.decided + '件です。5件より少ないうちは、1件で割合が大きく動くので、受注率は参考程度に見てください。</div>' : '') +
      '<div class="qt-note gray">受注率は、状態を「受注」「失注」にしたものだけで数えます。返事待ち・期限切れは入りません。結果が分かったら状態を変えておくと、数字が正確になります。</div>' +
      '<div class="qt-sec"><h4>どこから来たお客様か</h4>' +
        (st.sources.length ? '<div style="overflow-x:auto"><table class="qt-tbl"><thead><tr><th>どこから</th><th class="n">件数</th><th class="n">受注</th><th class="n">失注</th><th class="n">受注率</th><th class="n">受注額</th></tr></thead><tbody>' +
          st.sources.map(function (s) {
            return '<tr><td>' + esc(s.source) + '</td><td class="n">' + s.count + '</td><td class="n">' + s.won + '</td><td class="n">' + s.lost + '</td><td class="n">' +
              (s.rate == null ? '—' : Math.round(s.rate * 100) + '%' + (s.decided < 5 ? '<br><span class="soc-small">' + s.decided + '件から</span>' : '')) + '</td><td class="n">' + yen(s.wonAmount) + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<p class="soc-small">まだ見積書がありません。</p>') +
        '<p class="soc-small" style="margin-top:6px">「どこから」は、問い合わせから作った見積書にだけ付きます（その問い合わせのお客様が、どこからサイトに来たか）。ここで新しく作った見積書は「問い合わせ以外」にまとめています。請求書は数えていません。</p>' +
      '</div>';
  }

  /* ---------------- よく使う品目 ---------------- */

  function catalogView(body) {
    var list = (S.data.catalog || []).slice();
    function draw() {
      body.innerHTML =
        (S.data.catalogSeeded ? '<div class="qt-note blue">サイトのサービス紹介の価格（「〜」の下限）から作った見本です。実際によく使う品目と価格に直して「保存」してください。保存するまでは、サイトの価格表をもとにしたままです。</div>' : '') +
        '<p class="share-note" style="margin-bottom:8px">見積書の品目の欄で、ここの名前が候補に出ます。選ぶと単価・単位・税率も入ります。</p>' +
        '<div class="qt-items" id="qt-catrows"><div class="qt-row head" aria-hidden="true" style="grid-template-columns:minmax(0,1fr) 70px 120px 110px 34px"><span>品目</span><span>単位</span><span>単価</span><span>税率</span><span></span></div>' +
        list.map(function (c, i) {
          return '<div class="qt-row" data-ci="' + i + '" style="grid-template-columns:minmax(0,1fr) 70px 120px 110px 34px">' +
            '<label class="c nm"><span class="lb">品目</span><input class="qt-in" data-f="name" value="' + esc(c.name) + '" aria-label="品目"></label>' +
            '<label class="c"><span class="lb">単位</span><input class="qt-in" data-f="unit" value="' + esc(c.unit) + '" aria-label="単位"></label>' +
            '<label class="c"><span class="lb">単価</span><input class="qt-in num" data-f="price" inputmode="numeric" value="' + esc(c.price) + '" aria-label="単価"></label>' +
            '<label class="c"><span class="lb">税率</span><select class="qt-in" data-f="rate" aria-label="税率">' + rateOpts(c.rate) + '</select></label>' +
            '<button type="button" class="del" data-cdel="' + i + '" aria-label="この品目を消す">✕</button></div>';
        }).join('') + '</div>' +
        '<div class="qt-acts" style="margin-top:8px"><button type="button" class="ghost" id="qt-cadd">＋ 品目を足す</button><button type="button" id="qt-csave">保存</button></div>';
      el('qt-cadd').addEventListener('click', function () { read(); list.push({ name: '', unit: '式', price: 0, rate: 10 }); draw(); });
      body.querySelectorAll('[data-cdel]').forEach(function (b) {
        b.addEventListener('click', function () { read(); list.splice(Number(b.getAttribute('data-cdel')), 1); draw(); });
      });
      el('qt-csave').addEventListener('click', async function () {
        read();
        var r = await send({ action: 'catalog', items: list.map(function (c) { return { name: c.name, unit: c.unit, price: core().num(c.price) || 0, rate: Number(c.rate) }; }) });
        var d = r.data || {};
        if (!d.ok) { say(d.message || '保存できませんでした。'); return; }
        S.data.catalog = d.catalog;
        S.data.catalogSeeded = false;
        list = d.catalog.slice();
        draw();
        say(d.message, true);
      });
    }
    function read() {
      body.querySelectorAll('[data-ci]').forEach(function (row) {
        var c = list[Number(row.getAttribute('data-ci'))];
        ['name', 'unit', 'price', 'rate'].forEach(function (f) { c[f] = row.querySelector('[data-f=' + f + ']').value; });
      });
    }
    draw();
  }

  /* ---------------- 設定 ---------------- */

  function settingsView(body) {
    var C = core();
    var s = Object.assign({}, S.data.settings);
    var rounding = Object.keys(C.ROUNDING).map(function (k) {
      return '<label class="qt-radio"><input type="radio" name="qt-round" value="' + k + '"' + (s.rounding === k ? ' checked' : '') + '><span>' + C.ROUNDING[k] + '</span></label>';
    }).join('');
    body.innerHTML =
      '<div class="qt-sec" style="margin-top:0"><h4>発行元（見積書の右上に出ます）</h4><div class="qt-grid">' +
        field('qs-company', '会社名・屋号', inp('qs-company', s.company)) +
        field('qs-person', '担当者', inp('qs-person', s.person)) +
        field('qs-tel', '電話', inp('qs-tel', s.tel, ' inputmode="tel"')) +
        field('qs-email', 'メール', inp('qs-email', s.email, ' type="email"'), 'お客様がメールに返信したときの宛先にもなります。') +
      '</div>' +
        field('qs-address', '住所', '<textarea class="qt-in" id="qs-address" rows="2">' + esc(s.address) + '</textarea>') +
        field('qs-regNo', '登録番号（インボイス）', inp('qs-regNo', s.regNo, ' placeholder="T1234567890123" autocomplete="off"'),
          '適格請求書発行事業者の「T＋13桁」。登録していなければ空のままで構いません（見積書には必須ではありません）。') +
      '</div>' +
      '<div class="qt-sec"><h4>ロゴと印影（どちらも任意）</h4>' +
        '<div class="qt-field"><span class="lb">ロゴ</span><div class="qt-img" id="qs-logo-box"></div><input type="file" id="qs-logo-file" accept="image/png,image/jpeg,image/webp" style="margin-top:6px;max-width:100%">' +
        '<div class="hint">画像の置き場所（Vercel Blob）に置きます。横長の画像がきれいに入ります。</div></div>' +
        '<div class="qt-field"><span class="lb">印影（角印など）</span><div class="qt-img" id="qs-seal-box"></div><input type="file" id="qs-seal-file" accept="image/png,image/jpeg,image/webp" style="margin-top:6px;max-width:100%">' +
        '<div class="hint">背景が透明な PNG がおすすめです。小さく縮めて設定と一緒に保存します（公開の置き場所には置きません）。日本の見積書に印鑑は必須ではありません。</div></div>' +
      '</div>' +
      '<div class="qt-sec"><h4>計算と既定の値</h4>' +
        '<div class="qt-field"><span class="lb">消費税の1円未満の端数</span>' + rounding +
        '<div class="hint">見積書1枚ごと・税率ごとに1回だけ使います（品目ごとには丸めません。インボイス制度の決まりです）。どれを選んでも構いませんが、請求書と同じにしてください。</div></div>' +
        '<div class="qt-grid">' +
          field('qs-taxMode', '単価の書き方（新しい見積書の既定）', '<select class="qt-in" id="qs-taxMode"><option value="excl"' + (s.taxMode !== 'incl' ? ' selected' : '') + '>税抜</option><option value="incl"' + (s.taxMode === 'incl' ? ' selected' : '') + '>税込</option></select>') +
          field('qs-validDays', '有効期限（発行日から何日）', inp('qs-validDays', s.validDays, ' type="number" min="1" max="365"')) +
          field('qs-linkDays', 'お客様のリンクを開ける日数', inp('qs-linkDays', s.linkDays, ' type="number" min="7" max="365"')) +
          field('qs-prefix', '見積番号の頭', inp('qs-prefix', s.prefix, ' maxlength="6"'), '例: Q → Q-2026-0001') +
          field('qs-invoicePrefix', '請求番号の頭', inp('qs-invoicePrefix', s.invoicePrefix, ' maxlength="6"'), '例: INV → INV-2026-0001') +
          field('qs-delivery', '納期（既定）', inp('qs-delivery', s.delivery)) +
          field('qs-payTerms', 'お支払条件（既定）', inp('qs-payTerms', s.payTerms)) +
        '</div>' +
        field('qs-notes', '備考（既定。新しい見積書に最初から入ります）', '<textarea class="qt-in" id="qs-notes" rows="2">' + esc(s.notes) + '</textarea>') +
        field('qs-bank', 'お振込先（請求書に出ます）', '<textarea class="qt-in" id="qs-bank" rows="2" placeholder="例: 〇〇銀行 本店 普通 1234567 カ）ミホン">' + esc(s.bank) + '</textarea>') +
      '</div>' +
      '<div class="qt-sec"><h4>送るメールの文</h4>' +
        '<p class="soc-small" style="margin:0 0 6px">使える差し込み: ' + C.MAIL_VARS.map(function (v) { return '{' + v + '}'; }).join(' ') + '。{リンク} は「見るだけのリンク」です（本文に無ければ最後に足します）。送る前に、1通ごとに直せます。</p>' +
        field('qs-mailSubject', '件名', inp('qs-mailSubject', s.mailSubject)) +
        field('qs-mailBody', '本文', '<textarea class="qt-in" id="qs-mailBody" rows="10">' + esc(s.mailBody) + '</textarea>') +
      '</div>' +
      '<div class="qt-acts" style="margin-top:12px"><button type="button" id="qs-save">設定を保存</button></div>';

    var img = { logo: s.logo || '', seal: s.seal || '' };
    function drawImg(k) {
      var box = el('qs-' + k + '-box');
      box.innerHTML = img[k]
        ? '<img src="' + esc(img[k]) + '" alt="' + (k === 'logo' ? 'ロゴ' : '印影') + '"><button type="button" class="ghost" data-rm="' + k + '" style="font-size:12px;padding:6px 12px">外す</button>'
        : '<span class="soc-small">なし</span>';
      var rm = box.querySelector('[data-rm]');
      if (rm) rm.addEventListener('click', function () { img[k] = ''; drawImg(k); });
    }
    drawImg('logo'); drawImg('seal');

    var reg = el('qs-regNo');
    function regHint() {
      var r = C.checkRegNo(reg.value);
      var h = el('qs-regNo-hint');
      h.className = 'hint' + (r.state === 'format' || r.state === 'check' ? ' bad' : r.state === 'ok' ? ' ok' : '');
      h.textContent = r.state === 'ok' ? '形と検査用の数字が合っています（' + r.value + '）。国税庁の公表サイトで、登録が有効かも一度確かめておくと安心です。'
        : r.message || '適格請求書発行事業者の「T＋13桁」。登録していなければ空のままで構いません（見積書には必須ではありません）。';
    }
    reg.addEventListener('input', regHint);
    if (reg.value) regHint();

    el('qs-seal-file').addEventListener('change', async function () {
      var f = this.files[0];
      this.value = '';
      if (!f) return;
      try { img.seal = await shrink(f, 240, 'image/png'); drawImg('seal'); say('印影を読み込みました。「設定を保存」で保存されます。', true); }
      catch (_) { say('画像を読み込めませんでした。PNG・JPEG・WebP の画像を選んでください。'); }
    });
    el('qs-logo-file').addEventListener('change', async function () {
      var f = this.files[0];
      this.value = '';
      if (!f) return;
      if (demo()) { say('デモ版のため、画像は置けません。'); return; }
      say('ロゴを縮めて置いています…', true);
      try {
        var data = await shrink(f, 600, 'image/png');
        var blob = await (await fetch(data)).blob();
        var res = await fetch('/api/social-upload?kind=quote', {
          method: 'POST', headers: { Authorization: 'Bearer ' + window.lumAdmin.key(), 'Content-Type': 'image/png' }, body: blob
        });
        var d = {};
        try { d = await res.clone().json(); } catch (_) {}
        if (d.ok && d.url) { img.logo = d.url; drawImg('logo'); say('ロゴを置きました。「設定を保存」で保存されます。', true); }
        else say(d.message || 'ロゴを置けませんでした。');
      } catch (_) { say('画像を読み込めませんでした。PNG・JPEG・WebP の画像を選んでください。'); }
    });

    el('qs-save').addEventListener('click', async function () {
      var out = { logo: img.logo, seal: img.seal };
      ['company', 'person', 'tel', 'email', 'address', 'regNo', 'taxMode', 'validDays', 'linkDays', 'prefix', 'invoicePrefix', 'delivery', 'payTerms', 'notes', 'bank', 'mailSubject', 'mailBody'].forEach(function (k) {
        out[k] = el('qs-' + k).value;
      });
      var r0 = body.querySelector('input[name=qt-round]:checked');
      if (r0) out.rounding = r0.value;
      var b = el('qs-save');
      b.disabled = true;
      var r = await send({ action: 'settings', settings: out });
      b.disabled = false;
      var d = r.data || {};
      if (!d.ok) { say(d.message || '保存できませんでした。'); return; }
      S.data.settings = d.settings;
      S.data.regNo = d.regNo;
      say(d.message + (d.regNo && d.regNo.state === 'check' ? '（登録番号は保存しましたが、' + d.regNo.message + '）' : ''), true);
    });
  }

  /* 画像を縮めて data:URL に（長い辺を max px まで）。 */
  function shrink(file, max, type) {
    return new Promise(function (ok, ng) {
      var fr = new FileReader();
      fr.onerror = ng;
      fr.onload = function () {
        var im = new Image();
        im.onerror = ng;
        im.onload = function () {
          var k = Math.min(1, max / Math.max(im.width, im.height));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.width * k));
          c.height = Math.max(1, Math.round(im.height * k));
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          ok(c.toDataURL(type));
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------------- 開始 ---------------- */

  /* ほかの画面から見積書を開く（いまは使っていませんが、問い合わせ管理から呼べるように）。 */
  window.lumQuoteOpen = function (id) {
    if (window.lumShowTab && window.lumShowTab(TAB) === false) return;
    if (S.data) openQuote(id);
    else S.pendingOpen = id;
  };

  window.lumQuotesInit = async function () {
    if (S.started) return;
    S.started = true;
    addCss();
    shell();
    try { S.sec = sessionStorage.getItem('lum_qt_sec') || 'list'; } catch (_) {}
    if (!SECTIONS.some(function (s) { return s[0] === S.sec; })) S.sec = 'list';
    go(S.sec);
    try { await loadCore(); } catch (_) {
      el('qt-body').innerHTML = '<div class="qt-note red">画面の部品（/quote-core.js）を読み込めませんでした。再読み込みしてください。</div>';
      return;
    }
    if (await load()) {
      if (S.pendingOpen) { var id = S.pendingOpen; S.pendingOpen = ''; S.sec = 'list'; openQuote(id); }
      else go(S.sec);
    }
  };
  window.addEventListener('beforeunload', function (e) {
    if (S.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
})();
