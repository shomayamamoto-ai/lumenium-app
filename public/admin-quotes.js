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
  /* 同じ部品を2つの画面で使います。「見積書」（mode: quote）と「請求書・領収書」（mode: bill）。
     描くのは開いている方だけで（中の id が重ならないように）、一覧の絞り込み・開いている書類・
     保存していない変更は、画面ごとにしまっておきます。 */
  var HOSTS = { quote: 'quotes-admin', bill: 'bills-admin' };
  var TAB = HOSTS.quote;
  var el = function (id) { return document.getElementById(id); };
  var S = {
    mode: 'quote', mounted: '', sec: 'list', filter: '', q: '', data: null,
    open: '', cur: null, dirty: false, pick: false, inq: null, panel: ''
  };
  var MODE_SECTIONS = {
    quote: [['list', '見積書'], ['stats', '数字'], ['catalog', 'よく使う品目'], ['book', '記載の記録'], ['settings', '設定']],
    bill: [['list', '請求書・領収書'], ['catalog', 'よく使う品目'], ['book', '記載の記録'], ['settings', '設定']]
  };
  var MODE_FILTERS = {
    quote: [['todo', '要対応'], ['all', 'すべて'], ['draft', '下書き'], ['sent', '送付済み'], ['won', '受注'], ['lost', '失注'], ['expired', '期限切れ']],
    bill: [['todo', '要対応'], ['all', 'すべて'], ['invoice', '請求書'], ['unpaid', '未入金'], ['paid', '入金済み'], ['receipt', '領収書'], ['draft', '下書き']]
  };
  function secs() { return MODE_SECTIONS[S.mode]; }
  function modeOf(x) { return (x && x.kind && x.kind !== 'quote') ? 'bill' : 'quote'; }
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
    '.qt-host button{transition:none}.qt-host .qt-acts button,.qt-host .qt-bar button{font-size:12px;padding:8px 13px}' +
    '.qt-top{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:14px}' +
    '.qt-card{border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:#fff;min-width:0}' +
    'button.qt-card-btn{font:inherit;color:inherit;text-align:left;cursor:pointer;width:100%;display:flex;flex-direction:column;justify-content:flex-start;align-items:stretch}button.qt-card-btn:hover{border-color:var(--ui-border-strong,#b9b4a8)}' +
    'button.qt-card-btn.on{outline:2px solid var(--ui-accent,#3d3fbf);outline-offset:-2px}button.qt-card-btn.hot .v{color:#b42318}' +
    '.qt-tag.attn{background:rgba(180,35,24,.1);color:#b42318}' +
    '.qt-card .k{font-size:11px;font-weight:700;color:var(--sub)}.qt-card .v{font-size:20px;font-weight:800;line-height:1.3;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}' +
    '.qt-card .n{font-size:11px;color:var(--sub);line-height:1.6}' +
    '.qt-note{border:1px solid var(--border);border-left:4px solid #b45309;border-radius:10px;padding:9px 12px;margin-bottom:10px;font-size:12.5px;line-height:1.75;background:#fffdf7}' +
    '.qt-note.red{border-left-color:#b42318;background:#fff8f7}.qt-note.gray{border-left-color:var(--sub);background:#faf9f6}.qt-note.blue{border-left-color:var(--ui-accent);background:#f7f7ff}' +
    '.qt-note.green{border-left-color:#047857;background:#f3fbf7}.qt-vers{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.qt-vers button{font-size:11.5px;padding:5px 10px}' +
    '.qt-find{margin:0 0 10px;font-size:12.5px}.qt-find summary{cursor:pointer;font-weight:700;color:var(--sub);padding:4px 0}' +
    '.qt-find-row{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin:6px 0}.qt-find-row label{display:flex;gap:6px;align-items:center;font-size:12px}' +
    '.qt-find-row .qt-in{width:auto;max-width:150px}.qt-find-row .sr{gap:0}' +
    '.qt-paysum{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px;margin-bottom:8px}.qt-paysum b{font-size:15px;font-variant-numeric:tabular-nums}.qt-paysum .left b{color:#b42318}' +
    '.qt-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}' +
    '.qt-bar input[type=search]{flex:1 1 200px;min-width:0;padding:9px 12px;border:1px solid var(--border);border-radius:10px;background:#faf9f6;font:inherit;font-size:13px}' +
    '.qt-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--border)}.qt-list li{border-bottom:1px solid var(--border)}' +
    '.qt-open{display:block;width:100%;text-align:left;background:none;border:0;padding:11px 2px;color:var(--text);font:inherit;font-weight:400;cursor:pointer;letter-spacing:0;border-radius:0}' +
    '.qt-open:hover{filter:none;background:#faf9f6}.qt-open:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px;border-radius:4px}' +
    '.qt-open .l1{display:flex;gap:8px;align-items:baseline;justify-content:space-between}' +
    '.qt-open .who{font-size:13.5px;font-weight:700;overflow-wrap:anywhere;min-width:0}.qt-open .amt{font-size:14px;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}' +
    '.qt-open .meta{font-size:11.5px;color:var(--sub);line-height:1.7;overflow-wrap:anywhere}' +
    '.qt-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 8px;border-radius:999px;background:#f3f1ec;color:var(--sub);margin:0 4px 2px 0;white-space:nowrap}' +
    '.qt-tag.sent{background:rgba(59,130,246,.13);color:#1d4ed8}.qt-tag.won,.qt-tag.paid{background:rgba(16,185,129,.16);color:#047857}' +
    '.qt-tag.issued{background:rgba(16,185,129,.16);color:#047857}.qt-tag.rcp{background:rgba(180,83,9,.12);color:#92400e}' +
    '.qt-client{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin:8px 0 2px;font-size:12.5px;line-height:1.7;border:1px dashed var(--border);border-radius:10px;padding:8px 10px;background:#fbfaf7}' +
    '.qt-client:empty{display:none}.qt-client button{font-size:12px;padding:6px 12px}' +
    '.qt-past{margin-top:4px;font-size:12px}.qt-host select.qt-past{width:auto;max-width:100%;padding:6px 8px;font-size:12px}' +
    '.qt-bk{list-style:none;margin:0;padding:0}.qt-bk li{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:6px 0;border-top:1px dashed var(--border);font-size:12.5px;min-width:0}' +
    '.qt-bk li:first-child{border-top:0}.qt-bk li span{min-width:0;overflow-wrap:anywhere}.qt-bk li small{color:var(--sub)}.qt-bk button{flex:none;font-size:11px;padding:4px 10px}' +
    '.qt-tag.lost{background:#f3f1ec;color:#6b6b74}.qt-tag.expired{background:rgba(180,35,24,.1);color:#b42318}.qt-tag.inv{background:rgba(99,102,241,.12);color:var(--ui-accent)}' +
    '.qt-sec{border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-top:12px;background:#fff;min-width:0}' +
    '.qt-sec h4{font-size:12px;letter-spacing:.08em;color:var(--sub);font-weight:700;margin:0 0 8px}' +
    '.qt-acts{display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
    '.qt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:4px 12px}' +
    '.qt-field{margin:6px 0;min-width:0}.qt-field label,.qt-field .lb{display:block;font-size:12px;font-weight:700;margin-bottom:4px}' +
    '.qt-field .hint{font-size:11px;color:var(--sub);line-height:1.6;margin-top:3px}.qt-field .hint.bad{color:#b42318;font-weight:700}.qt-field .hint.ok{color:#047857}' +
    '.qt-host input.qt-in,.qt-host select.qt-in,.qt-host textarea.qt-in{width:100%;min-width:0;padding:9px 10px;border:1px solid var(--border);border-radius:10px;background:#faf9f6;font:inherit;font-size:13px;line-height:1.5;color:var(--text)}' +
    '.qt-host textarea.qt-in{resize:vertical}' +
    '.qt-items{display:flex;flex-direction:column;gap:6px}' +
    '.qt-row{display:grid;grid-template-columns:minmax(0,1fr) 70px 58px 108px 112px 96px 34px;gap:6px;align-items:center}' +
    '.qt-row.head{font-size:11px;font-weight:700;color:var(--sub)}.qt-row.head span{padding-left:2px}' +
    '.qt-row .lb{display:none}.qt-row .amt{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;font-size:13px;white-space:nowrap}' +
    '.qt-row.disc .amt{color:#7a2a20}.qt-row .c{min-width:0;display:block}' +
    '.qt-row .opt{display:inline-flex;gap:5px;align-items:center;font-size:11px;color:var(--sub);margin-top:3px;cursor:pointer}.qt-row .opt input{width:14px;height:14px;margin:0}' +
    '.qt-row.is-opt{background:#f4f2fb;border-radius:10px}.qt-row.is-opt .amt{color:var(--sub);font-weight:600}' +
    '.qt-pay{font-size:12.5px;margin-top:6px}.qt-pay span{display:inline-block;margin-right:12px;white-space:nowrap}' +
    '.qt-host .qt-row .del{padding:6px 0;width:34px;font-size:13px;background:#faf9f6;border:1px solid var(--border);color:var(--sub)}' +
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
    host.classList.add('qt-host');
    host.innerHTML =
      (S.mode === 'bill'
        ? '<p class="share-note ui-intro">請求書と領収書を作って、印刷・PDFにしたり、お客様にメールで送ったりします。見積書が無くても、ここから直接作れます。入金を記録すると残りが分かり、入金ごとに領収書も作れます。' +
          '宛先や品目は、前に作った書類から候補に出ます（「記載の記録」）。</p>'
        : '<p class="share-note ui-intro">見積書を作って、印刷・PDFにしたり、お客様にメールで送ったりします。合計と消費税は自動で計算します（税率ごとに1回だけ端数を処理する、インボイス制度の決まりどおり）。' +
          '受注したら、同じ内容で請求書の下書きも作れます（請求書は「請求書・領収書」の画面に入ります）。</p>') +
      '<div class="nq-row" role="tablist" aria-label="' + (S.mode === 'bill' ? '請求書・領収書' : '見積書') + 'の項目">' + secs().map(function (s) {
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
    if (!secs().some(function (s) { return s[0] === sec; })) sec = 'list';
    S.sec = sec;
    try { sessionStorage.setItem('lum_qt_sec_' + S.mode, sec); } catch (_) {}
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
    if (sec === 'book') return bookView(body);
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
    var kind = core().kindOf(x);
    if (kind !== 'quote') {
      var st = statusOf(x);
      return '<span class="qt-tag ' + (kind === 'receipt' ? 'rcp' : 'inv') + '">' + core().KIND_LABEL[kind] + '</span><span class="qt-tag ' + st + '">' + esc(core().statusTable(kind)[st]) + '</span>';
    }
    var s = statusOf(x);
    return '<span class="qt-tag ' + s + '">' + esc(core().QUOTE_STATUS[s]) + '</span>';
  }
  function attn(x) { return core().quoteAttentionKind(x, S.data.today); }
  function mine(x) { return modeOf(x) === S.mode; }
  function unpaid(x) { return (x.kind || 'quote') === 'invoice' && x.status === 'sent' && (x.balance == null || x.balance > 0); }
  function matches(x) {
    var kind = x.kind || 'quote';
    if (!mine(x)) return false;
    if (S.filter === 'todo') { if (!attn(x)) return false; }
    else if (S.filter === 'invoice' || S.filter === 'receipt') { if (kind !== S.filter) return false; }
    else if (S.filter === 'unpaid') { if (!unpaid(x)) return false; }
    else if (S.filter !== 'all') { if (statusOf(x) !== S.filter) return false; }
    var f = S.find || {};
    if ((f.from || f.to || f.min || f.max) && !core().searchQuotes([x], f).length) return false;
    if (!S.q) return true;
    var hay = [x.number, x.to, x.subject, x.source].join(' ').toLowerCase();
    return S.q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }

  function listView(body) {
    var C = core();
    var bill = S.mode === 'bill';
    var list = S.data.list.filter(mine);
    var st = C.quoteStats(S.data.list, S.data.today);
    var at = C.quoteAttention(list, S.data.today);
    // 最初に開いたとき、手を打つ時期の書類があれば、それだけを先に見せます。
    if (!S.filter || !MODE_FILTERS[S.mode].some(function (f) { return f[0] === S.filter; })) S.filter = at.total ? 'todo' : 'all';
    paintBadges();
    var counts = { todo: at.total, all: list.length };
    list.forEach(function (x) {
      var k = statusOf(x);
      counts[k] = (counts[k] || 0) + 1;
      if (bill) { counts[x.kind] = (counts[x.kind] || 0) + 1; if (unpaid(x)) counts.unpaid = (counts.unpaid || 0) + 1; }
    });
    var rows = list.filter(matches);
    var month = String(S.data.today).slice(0, 7);
    var sum = function (a, f) { return a.reduce(function (n, x) { return n + (Number(f(x)) || 0); }, 0); };
    var invs = list.filter(function (x) { return x.kind === 'invoice' && x.status !== 'void'; });
    var unp = invs.filter(unpaid);
    var monthInv = invs.filter(function (x) { return String(x.date).slice(0, 7) === month; });
    var monthRcp = list.filter(function (x) { return x.kind === 'receipt' && x.status !== 'void' && String(x.date).slice(0, 7) === month; });
    var top = bill
      ? card('未入金', unp.length + '件', '残り ' + yen(sum(unp, function (x) { return x.balance != null ? x.balance : x.total; })) + '（送付済みの請求書）', 'unpaid', unp.length ? '' : '') +
        card('支払期限切れ', at.overdue + '件', at.overdue ? '入金を確かめて、まだならお客様へ連絡を' : '期限を過ぎた請求書はありません', 'todo', at.overdue ? ' hot' : '') +
        card('今月の請求', monthInv.length + '件', '合計 ' + yen(sum(monthInv, function (x) { return x.total; }))) +
        card('今月の領収書', monthRcp.length + '件', '合計 ' + yen(sum(monthRcp, function (x) { return x.total; })), 'receipt')
      : card('要対応', at.total + '件', at.total ? attnText(at) : '手を打つ時期の見積書はありません', 'todo', at.total ? ' hot' : '') +
        card('返事待ち', st.waiting + '件', '合計 ' + yen(st.waitingAmount) + '（送付済み・期限内）', 'sent') +
        card('受注率', st.winRate == null ? '—' : Math.round(st.winRate * 100) + '%', st.decided ? st.decided + '件中 ' + st.won + '件' + (st.few ? '（まだ少ないので参考程度）' : '') : 'まだ決まった見積書がありません') +
        card('今月の見積書', st.monthCount + '件', '合計 ' + yen(st.monthAmount) + (st.monthWonAmount ? '・受注 ' + yen(st.monthWonAmount) : ''));
    body.innerHTML =
      (settingsMissing() ? '<div class="qt-note">はじめに「設定」で、見積書に載せる会社名・住所・連絡先を入れてください（登録番号があれば、それも）。入れるまでは、見積書の発行元が空のままです。 <button type="button" class="ghost" id="qt-goset" style="font-size:12px;padding:6px 12px;margin-left:4px">設定を開く</button></div>' : '') +
      '<div class="qt-top">' + top + '</div>' +
      (bill
        ? '<div class="qt-bar"><button type="button" id="qt-newinv">＋ 新しい請求書</button><button type="button" id="qt-newrcp">＋ 新しい領収書</button>' +
          '<span class="soc-small">見積書から作るときは、見積書を「受注」にして「請求書を作る」を押します。</span></div>'
        : '<div class="qt-bar"><button type="button" id="qt-new">＋ 新しい見積書</button><button type="button" class="ghost" id="qt-frominq">問い合わせから作る</button></div>') +
      '<div class="nq-row" role="group" aria-label="絞り込み">' + MODE_FILTERS[S.mode].map(function (f) {
        var n = counts[f[0]] || 0;
        return '<button type="button" class="nq-chip" data-qf="' + f[0] + '" aria-pressed="' + (S.filter === f[0]) + '">' + f[1] + ' ' + n + '</button>';
      }).join('') + '</div>' +
      '<div class="qt-bar"><input type="search" id="qt-q" placeholder="宛先・件名・番号で探す" aria-label="' + (bill ? '請求書・領収書' : '見積書') + 'を探す" value="' + esc(S.q) + '">' +
        '<button type="button" class="ghost" id="qt-xlsx">Excel で書き出す</button></div>' +
      (function () {
        var f = S.find || {};
        var on = !!(f.from || f.to || f.min || f.max);
        return '<details class="qt-find"' + (on ? ' open' : '') + '><summary>日付・金額で探す' + (on ? '（絞り込み中）' : '') + '</summary><div class="qt-find-row">' +
          '<label>発行日<input type="date" class="qt-in" id="qt-f-from" value="' + esc(f.from || '') + '"></label><span>〜</span><label class="sr">まで<input type="date" class="qt-in" id="qt-f-to" value="' + esc(f.to || '') + '"></label>' +
          '<label>金額<input class="qt-in" id="qt-f-min" inputmode="numeric" placeholder="下限" value="' + esc(f.min || '') + '"></label><span>〜</span><label class="sr">上限<input class="qt-in" id="qt-f-max" inputmode="numeric" placeholder="上限" value="' + esc(f.max || '') + '"></label>' +
          '<button type="button" class="ghost" id="qt-f-clear">条件を消す</button></div>' +
          '<p class="soc-small">取引の日・金額・取引先（上の欄）で探せます。電子帳簿保存法の「探せるように保存する」決まりにも、この画面で対応しています。</p></details>';
      })() +
      (rows.length ? '<ul class="qt-list">' + rows.map(function (x) {
        var meta = [x.number, '発行 ' + ymdText(x.date)];
        if ((x.kind || 'quote') === 'invoice') { if (x.dueDate) meta.push('支払期限 ' + ymdText(x.dueDate)); }
        else if ((x.kind || 'quote') === 'quote' && x.validUntil) meta.push('有効期限 ' + ymdText(x.validUntil));
        if (x.sentAt) meta.push('送付 ' + md(x.sentAt));
        if (x.openedAt) meta.push('お客様が開いた ' + md(x.openedAt));
        else if (x.sentAt && statusOf(x) === 'sent') meta.push('まだ開かれていません');
        if (x.inquiryId) meta.push('問い合わせから');
        var ak = attn(x);
        return '<li><button type="button" class="qt-open" data-qid="' + esc(x.id) + '"><div class="l1"><span class="who">' + (ak ? '<span class="qt-tag attn">' + esc(C.ATTN_LABEL[ak]) + '</span>' : '') + tagOf(x) + esc(x.to) + '</span><span class="amt">' + yen(x.total) + '</span></div>' +
          '<div class="meta">' + esc(x.subject || '（件名なし）') + '</div><div class="meta">' + esc(meta.join('・')) + '</div></button></li>';
      }).join('') + '</ul>'
        : '<p class="soc-small">' + (bill
          ? (S.filter === 'todo' && list.length ? '期限を過ぎた請求書はありません。見落としはありません。' : list.length ? '当てはまる書類はありません。' : 'まだ請求書・領収書がありません。「＋ 新しい請求書」「＋ 新しい領収書」で作るか、受注した見積書から「請求書を作る」で作ってください。')
          : (S.filter === 'todo' && list.length ? '手を打つ時期の見積書はありません。見落としはありません。' : list.length ? '当てはまる見積書はありません。' : 'まだ見積書がありません。「＋ 新しい見積書」か「問い合わせから作る」で始めてください。')) + '</p>');
    if (el('qt-goset')) el('qt-goset').addEventListener('click', function () { go('settings'); });
    if (bill) {
      el('qt-newinv').addEventListener('click', function () { openNew(null, 'invoice'); });
      el('qt-newrcp').addEventListener('click', function () { openNew(null, 'receipt'); });
    } else {
      el('qt-new').addEventListener('click', function () { openNew(); });
      el('qt-frominq').addEventListener('click', function () { S.pick = true; go('list'); });
    }
    body.querySelectorAll('[data-qf]').forEach(function (b) {
      b.addEventListener('click', function () { S.filter = b.getAttribute('data-qf'); listView(body); });
    });
    body.querySelectorAll('[data-qjump]').forEach(function (b) {
      b.addEventListener('click', function () { S.filter = b.getAttribute('data-qjump'); listView(body); });
    });
    var q = el('qt-q');
    q.addEventListener('input', function () {
      S.q = q.value.trim();
      var pos = q.selectionStart;
      listView(body);
      var n = el('qt-q'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {}
    });
    ['qt-f-from', 'qt-f-to', 'qt-f-min', 'qt-f-max'].forEach(function (id) {
      el(id).addEventListener('change', function () {
        S.find = { from: el('qt-f-from').value, to: el('qt-f-to').value, min: el('qt-f-min').value.replace(/[^\d]/g, ''), max: el('qt-f-max').value.replace(/[^\d]/g, '') };
        listView(body);
      });
    });
    el('qt-f-clear').addEventListener('click', function () { S.find = {}; listView(body); });
    el('qt-xlsx').addEventListener('click', exportXlsx);
    body.querySelectorAll('[data-qid]').forEach(function (b) {
      b.addEventListener('click', function () { openQuote(b.getAttribute('data-qid')); });
    });
  }
  /* 上の数字。filter があるものは押すと、その条件で一覧を絞り込みます。 */
  function card(k, v, n, filter, cls) {
    var inner = '<div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div><div class="n">' + esc(n) + '</div>';
    return filter
      ? '<button type="button" class="qt-card qt-card-btn' + (cls || '') + (S.filter === filter ? ' on' : '') + '" data-qjump="' + filter + '">' + inner + '</button>'
      : '<div class="qt-card">' + inner + '</div>';
  }
  function attnText(at) {
    var C = core();
    return ['expired', 'overdue', 'expiring', 'opened', 'stale'].filter(function (k) { return at[k]; }).map(function (k) { return C.ATTN_LABEL[k] + ' ' + at[k]; }).join('・');
  }
  /* タブの横の「要対応」の数（共通の部品 admin-badge.js）。 */
  function paintBadge(host, at) {
    if (!window.lumNavBadge || !at) return;
    var C = window.lumQuoteCore;
    var parts = ['expired', 'overdue', 'expiring', 'opened', 'stale'].filter(function (k) { return at[k]; }).map(function (k) { return (C ? C.ATTN_LABEL[k] : k) + ' ' + at[k] + '件'; });
    window.lumNavBadge(host, at.total || 0, parts);
  }
  /* 見積書の画面には見積書の、請求書・領収書の画面には請求書の「要対応」を出します。 */
  function paintBadges() {
    var C = core();
    if (!C || !S.data) return;
    paintBadge(HOSTS.quote, C.quoteAttention(S.data.list.filter(function (x) { return modeOf(x) === 'quote'; }), S.data.today));
    paintBadge(HOSTS.bill, C.quoteAttention(S.data.list.filter(function (x) { return modeOf(x) === 'bill'; }), S.data.today));
  }
  window.lumQuoteBadge = async function () {
    try { await loadCore(); } catch (_) {}
    var r = await api('/api/quotes?view=badge');
    var d = r.data;
    if (!d || !d.ok) return;
    paintBadge(HOSTS.quote, d.quote || d);
    paintBadge(HOSTS.bill, d.bill || { total: 0 });
  };
  if (window.lumNavPoll) window.lumNavPoll(function () { window.lumQuoteBadge(); });

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

  function openNew(pre, kind) {
    var s = S.data.settings || {};
    var t = S.data.today;
    var k = kind || 'quote';
    S.cur = {
      kind: 'quote', number: '', date: t, toCompany: '', toPerson: '', honor: '御中', toEmail: '', subject: '',
      items: [{ kind: 'item', name: '', qty: 1, unit: '式', price: 0, rate: 10 }],
      taxMode: s.taxMode || 'excl', validUntil: core().addDays(t, Number(s.validDays) || 30),
      delivery: s.delivery || '', payTerms: s.payTerms || '', notes: s.notes || '', memo: '', status: 'draft', history: [],
      scope: s.defScope || '', excluded: s.defExcluded || '', terms: s.defTerms || '', schedule: core().parseSchedule(s.defSchedule || '')
    };
    // 見積書を使わずに、請求書・領収書を直接作るとき。見積書だけの欄は空にします。
    if (k !== 'quote') {
      Object.assign(S.cur, { kind: k, validUntil: '', delivery: '', payTerms: '', notes: '', scope: '', excluded: '', terms: '', schedule: [], honor: '御中' });
      if (k === 'invoice') S.cur.dueDate = core().endOfNextMonth(t);
      if (k === 'receipt') Object.assign(S.cur, { proviso: '', payMethod: s.payMethod || '銀行振込' });
    }
    // お客様カルテ（admin-customer.js）から開いたときは、宛先を入れておきます。
    if (pre) ['toCompany', 'toPerson', 'toEmail', 'honor'].forEach(function (f) { if (pre[f]) S.cur[f] = String(pre[f]); });
    S.dirty = false;
    S.panel = '';
    go('list');
  }

  async function openQuote(id) {
    say('');
    el('qt-body').innerHTML = '<p class="soc-small">読み込んでいます…</p>';
    var r = await api('/api/quotes?id=' + encodeURIComponent(id));
    if (!r.data || !r.data.ok) { say((r.data && r.data.message) || '読み込めませんでした。'); S.cur = null; go('list'); return; }
    showDoc(r.data.quote);
  }
  /* 書類を、その種類の画面で開きます（見積書は「見積書」、請求書・領収書は「請求書・領収書」）。 */
  function showDoc(q, msg) {
    var mode = modeOf(q);
    if (mode !== S.mode) {
      if (window.lumShowTab && window.lumShowTab(HOSTS[mode]) === false) return;
      mount(mode);
    }
    S.cur = q;
    S.dirty = false;
    S.panel = '';
    S.pick = false;
    go('list');
    if (msg) say(msg, true);
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
    return '<div class="qt-row' + (it.optional ? ' is-opt' : '') + '" data-i="' + i + '" data-kind="item">' +
      '<div class="c nm"><label><span class="lb">品目</span><input class="qt-in" data-f="name" value="' + esc(it.name) + '" placeholder="品目" aria-label="品目" list="qt-cat"></label>' +
      '<label class="opt"><input type="checkbox" data-f="optional"' + (it.optional ? ' checked' : '') + '>オプション（合計に含めず、別の表で見せる）</label></div>' +
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
    var kind = C.kindOf(q);
    var inv = kind === 'invoice';
    var rec = kind === 'receipt';
    var noun = C.KIND_LABEL[kind];
    var saved = !!q.id;
    var st = saved ? statusOf(q) : 'draft';
    var stTable = C.statusTable(kind);
    var bk = book();
    var dl = function (id, list) { return '<datalist id="' + id + '">' + list.filter(Boolean).map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist>'; };
    var past = function (f) {
      var w = (bk.words[f] || []).filter(function (v) { return v !== q[f]; });
      return w.length ? '<select class="qt-in qt-past" data-past="' + f + '" aria-label="前に書いた文から入れる"><option value="">前に書いた文から入れる…</option>' +
        w.map(function (v, i) { return '<option value="' + i + '">' + esc(v.replace(/\s+/g, ' ').slice(0, 60)) + '</option>'; }).join('') + '</select>' : '';
    };
    var stOpts = Object.keys(stTable).filter(function (k) { return k !== 'expired'; }).map(function (k) {
      return '<option value="' + k + '"' + (q.status === k ? ' selected' : '') + '>' + stTable[k] + '</option>';
    }).join('');
    var cat = (S.data.catalog || []);
    var catNames = cat.map(function (c) { return c.name; });
    var learned = bk.items.filter(function (it) { return catNames.indexOf(it.name) < 0; });
    var hist = (q.history || []).slice().reverse();
    S.painting = true;
    try { body.innerHTML = paintEditor(); } finally { S.painting = false; }
    function paintEditor() {
      return '<div class="qt-bar"><button type="button" class="ghost" id="qt-back">← 一覧へ</button>' +
        (q.toEmail && window.lumCustomer ? '<button type="button" class="ghost" id="qt-karte" style="font-size:12px;padding:6px 12px">このお客様の記録</button>' : '') +
        '<b style="font-size:14px">' + esc(saved ? noun + ' ' + q.number : '新しい' + noun + '（まだ保存していません）') + '</b>' +
        (saved ? '<span>' + tagOf(q) + '</span>' : '') + '</div>' +
      (q.inquiryId ? '<div class="qt-note blue">問い合わせから作った' + noun + 'です' + (q.source ? '（' + esc(q.source) + '）' : '') + '。 <button type="button" class="ghost" id="qt-inqback" style="font-size:12px;padding:6px 12px">元の問い合わせを開く</button></div>' : '') +
      (q.fromQuote ? '<div class="qt-note blue">' + (rec ? '元の書類の宛先・品目を引き継いで作った領収書です。' : '受注した見積書から作った請求書です。') + ' <button type="button" class="ghost" id="qt-qback" style="font-size:12px;padding:6px 12px">元の' + (rec ? '書類' : '見積書') + 'を開く</button></div>' : '') +
      (q.acceptedAt ? '<div class="qt-note green">お客様が見積書のリンクから「この内容で発注します」を押しました（' + esc(q.acceptedBy) + '・' + esc(md(q.acceptedAt)) + '）。</div>' : '') +
      (saved && C.isLocked(q) ? '<div class="qt-note blue">お客様に渡った' + noun + 'です（第' + (q.version || 1) + '版）。直して保存すると「訂正版」になり、いまの版はそのまま残ります（電子帳簿保存法のため、消すことはできません）。' +
        ((q.versions || []).length ? '<div class="qt-vers">前の版: ' + q.versions.map(function (v) { return '<button type="button" class="ghost" data-ver="' + v.n + '">第' + v.n + '版（' + esc(md(v.at)) + 'まで）</button>'; }).join('') + '</div>' : '') + '</div>' : '') +
      (saved && st === 'expired' ? '<div class="qt-note red">有効期限（' + esc(C.jpDate(q.validUntil)) + '）を過ぎています。まだお話が続いているなら、有効期限を延ばして保存するか、複製して出し直してください。</div>' : '') +
      '<div class="qt-acts">' +
        '<button type="button" id="qt-save">保存</button>' +
        '<button type="button" class="ghost" id="qt-print">印刷・PDFで保存</button>' +
        (saved ? '<button type="button" class="ghost" id="qt-mail">メールで送る</button><button type="button" class="ghost" id="qt-link">リンクを作る</button>' +
          '<button type="button" class="ghost" id="qt-dup">複製</button>' +
          (kind === 'quote' && q.status === 'won' ? '<button type="button" class="ghost" id="qt-inv">請求書を作る</button>' : '') +
          ((kind === 'quote' && q.status === 'won') || (inv && q.status !== 'void') ? '<button type="button" class="ghost" id="qt-rcp">領収書を作る' + (inv ? '（請求額の全額）' : '') + '</button>' : '') +
          '<label style="font-size:12px;display:flex;gap:6px;align-items:center">状態 <select class="qt-in" id="qt-status" style="width:auto">' + stOpts + '</select></label>' +
          (C.isLocked(q) ? '' : '<button type="button" class="ghost" id="qt-del">消す</button>') : '') +
      '</div>' +
      '<div id="qt-panel"></div>' +
      (inv && saved ? payHtml(q) : '') +
      '<div class="qt-sec"><h4>宛先と内容</h4><div class="qt-grid">' +
        field('qt-toCompany', '宛先（会社・団体名）', inp('qt-toCompany', q.toCompany, ' autocomplete="off" list="qt-bk-co"')) +
        field('qt-toPerson', '宛先（ご担当者のお名前）', inp('qt-toPerson', q.toPerson, ' autocomplete="off" list="qt-bk-pe"')) +
        field('qt-honor', '敬称', '<select class="qt-in" id="qt-honor"><option value="御中"' + (q.honor === '御中' ? ' selected' : '') + '>御中（会社あて）</option><option value="様"' + (q.honor !== '御中' ? ' selected' : '') + '>様（個人あて）</option></select>',
          '会社名だけなら「御中」、お名前を書くなら「様」。両方は付けません。') +
        field('qt-toEmail', 'お客様のメールアドレス', inp('qt-toEmail', q.toEmail, ' type="email" autocomplete="off" list="qt-bk-em"'), '印刷物には出ません（メールで送るときに使います）。') +
      '</div>' +
      dl('qt-bk-co', uniq(bk.clients.map(function (c) { return c.company; }))) + dl('qt-bk-pe', uniq(bk.clients.map(function (c) { return c.person; }))) +
      dl('qt-bk-em', uniq(bk.clients.map(function (c) { return c.email; }))) +
      ['subject', 'delivery', 'payTerms', 'proviso', 'payMethod'].map(function (f) { return dl('qt-bk-' + f, bk.words[f] || []); }).join('') +
      '<div class="qt-client" id="qt-client" aria-live="polite"></div>' +
      '<div class="qt-grid">' +
        field('qt-subject', '件名', inp('qt-subject', q.subject, ' placeholder="例: ホームページ制作" list="qt-bk-subject"')) +
        field('qt-number', inv ? '請求番号' : rec ? '領収書番号' : '見積番号', inp('qt-number', q.number, ' placeholder="空なら保存のときに自動で振ります"')) +
        field('qt-date', inv ? '請求日' : '発行日', inp('qt-date', q.date, ' type="date"')) +
        (inv
          ? field('qt-dueDate', 'お支払期限', inp('qt-dueDate', q.dueDate, ' type="date"')) +
            field('qt-delivery', 'お取引日（納品・作業の日）', inp('qt-delivery', q.delivery, ' placeholder="例: 2026年9月20日／2026年9月分" list="qt-bk-delivery"'), '適格請求書（インボイス）には、取引の年月日が必要です。')
          : rec
          ? field('qt-proviso', '但し書き（何の代金か）', inp('qt-proviso', q.proviso, ' placeholder="例: ホームページ制作代として" list="qt-bk-proviso"'), '「お品代」だけより、何の代金かが分かる書き方がおすすめです。') +
            field('qt-delivery', 'お取引日（納品・作業の日）', inp('qt-delivery', q.delivery, ' placeholder="例: 2026年9月20日／2026年9月分" list="qt-bk-delivery"'), '適格簡易請求書（インボイス）には、取引の年月日が必要です。') +
            field('qt-payMethod', 'お支払方法', inp('qt-payMethod', q.payMethod, ' placeholder="例: 銀行振込" list="qt-bk-payMethod"'))
          : field('qt-validUntil', '有効期限', inp('qt-validUntil', q.validUntil, ' type="date"'), 'この日を過ぎて返事がないと「期限切れ」になります。') +
            field('qt-delivery', '納期', inp('qt-delivery', q.delivery, ' list="qt-bk-delivery"')) +
            field('qt-payTerms', 'お支払条件', inp('qt-payTerms', q.payTerms, ' list="qt-bk-payTerms"'))) +
      '</div></div>' +
      '<div class="qt-sec"><h4>品目</h4>' +
        '<div style="max-width:300px">' + field('qt-taxMode', '単価の書き方', '<select class="qt-in" id="qt-taxMode"><option value="excl"' + (q.taxMode !== 'incl' ? ' selected' : '') + '>税抜の単価（消費税は下で足す）</option><option value="incl"' + (q.taxMode === 'incl' ? ' selected' : '') + '>税込の単価（消費税は内数で出す）</option></select>') + '</div>' +
        '<div class="qt-items" id="qt-items"><div class="qt-row head" aria-hidden="true"><span>品目</span><span>数量</span><span>単位</span><span>単価</span><span>税率</span><span style="text-align:right">金額</span><span></span></div>' +
          q.items.map(itemRow).join('') + '</div>' +
        '<datalist id="qt-cat">' + cat.map(function (c) { return '<option value="' + esc(c.name) + '">'; }).join('') +
          learned.map(function (c) { return '<option value="' + esc(c.name) + '">前に使った品目（' + esc(yen(c.price)) + '）</option>'; }).join('') + '</datalist>' +
        '<div class="qt-acts" style="margin-top:8px"><button type="button" class="ghost" id="qt-add">＋ 行を足す</button><button type="button" class="ghost" id="qt-adddisc">＋ 値引き</button>' +
        (cat.length ? '<select class="qt-in" id="qt-addcat" style="width:auto;max-width:100%" aria-label="よく使う品目から足す"><option value="">よく使う品目から足す…</option>' +
          cat.map(function (c, i) { return '<option value="' + i + '">' + esc(c.name) + '（' + esc(yen(c.price)) + '）</option>'; }).join('') + '</select>' : '') +
        '</div>' +
        '<div class="soc-small" style="margin-top:6px">品目の欄に打ち始めると、よく使う品目と前に使った品目が候補に出ます（選ぶと単価と単位も入ります）。値引きは「どの税率から引くか」を選びます。「全体」にすると、税率ごとの金額の割合で分けて引きます。</div>' +
        '<div class="qt-tot" id="qt-tot" aria-live="polite"></div>' +
      '</div>' +
      (kind !== 'quote' ? '' :
      '<div class="qt-sec"><h4>作業範囲とお取引条件</h4>' +
        '<div class="soc-small" style="margin-bottom:8px">「どこまでが含まれるか」「修正や変更をどう扱うか」を先に書いておくと、あとで揉めにくくなります。空の欄は印刷されません。既定の文面は「設定」で決められます。</div>' +
        field('qt-scope', '作業範囲・前提条件', '<textarea class="qt-in" id="qt-scope" rows="3" placeholder="例: ・お打ち合わせで伺った内容にもとづきます　・素材はお客様にご用意いただきます">' + esc(q.scope || '') + '</textarea>' + past('scope')) +
        field('qt-excluded', 'このお見積りに含まれないもの', '<textarea class="qt-in" id="qt-excluded" rows="3" placeholder="例: ・サーバー・ドメイン費用（実費）　・公開後の保守">' + esc(q.excluded || '') + '</textarea>' + past('excluded')) +
        field('qt-terms', 'お取引条件（修正の回数・仕様変更・検収・不具合の扱いなど）', '<textarea class="qt-in" id="qt-terms" rows="4">' + esc(q.terms || '') + '</textarea>' + past('terms')) +
        field('qt-schedule', 'お支払いの分割', inp('qt-schedule', C.scheduleText(q.schedule), ' placeholder="例: 着手時 50% / 納品時 50%（一括なら空のまま）"'),
          '「着手時 30% / 中間 40% / 納品時 30%」のように書くと、合計を割合で分けた金額が見積書に載ります。割合は合計100%に。') +
        '<div class="qt-pay" id="qt-pay" aria-live="polite"></div>' +
      '</div>') +
      '<div class="qt-sec"><h4>備考と社内メモ</h4>' +
        field('qt-notes', '備考（' + noun + 'に印刷されます）', '<textarea class="qt-in" id="qt-notes" rows="3">' + esc(q.notes) + '</textarea>' + past('notes')) +
        field('qt-memo', '社内メモ（印刷されません・お客様には見えません）', '<textarea class="qt-in" id="qt-memo" rows="3">' + esc(q.memo) + '</textarea>') +
      '</div>' +
      (hist.length ? '<div class="qt-sec"><h4>記録</h4><ul class="qt-hist">' + hist.map(function (h) {
        return '<li><time>' + esc(md(h.at)) + '</time>' + esc(h.text) + '</li>';
      }).join('') + '</ul>' +
        (q.openedAt ? '<div class="soc-small" style="margin-top:6px">お客様がリンクを開いた回数: ' + (q.views || 0) + '回（最後 ' + esc(md(q.lastViewedAt)) + '）。会社のメールの安全確認の仕組みが先にリンクを開くことがあり、その場合もここに数えられます。</div>' : '') +
      '</div>' : ''); }

    el('qt-back').addEventListener('click', function () { if (!leaveOk()) return; S.cur = null; go('list'); });
    if (el('qt-karte')) el('qt-karte').addEventListener('click', function () { window.lumCustomer.open({ email: q.toEmail, name: q.toPerson, company: q.toCompany }); });
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
      if (el('qt-rcp')) el('qt-rcp').addEventListener('click', function () { derive('receipt'); });
      el('qt-status').addEventListener('change', changeStatus);
      if (el('qt-del')) el('qt-del').addEventListener('click', remove);
      body.querySelectorAll('[data-ver]').forEach(function (b) { b.addEventListener('click', function () { showVersion(Number(b.getAttribute('data-ver'))); }); });
      if (inv) bindPay(q);
    }
    body.querySelectorAll('.qt-sec input, .qt-sec select:not(.qt-past), .qt-sec textarea').forEach(function (f) {
      f.addEventListener('input', onEdit);
      f.addEventListener('change', onEdit);
    });
    // 前に書いた文から入れる（いまの文が空なら置き換え、あれば後ろに足します）。
    body.querySelectorAll('[data-past]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var f = sel.getAttribute('data-past');
        var w = (bk.words[f] || []).filter(function (v) { return v !== q[f]; })[Number(sel.value)];
        sel.value = '';
        var ta = el('qt-' + f);
        if (!w || !ta) return;
        ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + w : w;
        onEdit({ type: 'input', target: ta });
      });
    });
    // 宛先を入れたら、前に使った宛先かを見て、ご担当者・敬称・メールを入れ、前回の書類を案内します。
    ['qt-toCompany', 'qt-toPerson', 'qt-toEmail'].forEach(function (id) {
      el(id).addEventListener('change', function (e) { if (!S.painting && e.target.isConnected) clientHint(true); });
    });
    clientHint(false);
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

  /* ---------------- 入金（請求書） ---------------- */
  function payHtml(q) {
    var C = core();
    var total = C.computeTotals(numeric(q), S.data.settings.rounding).total;
    var paid = C.paidTotal(q), left = Math.max(0, total - paid);
    var list = q.payments || [];
    var over = q.status === 'sent' && left > 0 && q.dueDate && S.data.today > q.dueDate;
    return '<div class="qt-sec"><h4>入金</h4>' +
      '<div class="qt-paysum"><span>請求額 <b>' + yen(total) + '</b></span><span>入金済み <b>' + yen(paid) + '</b></span><span' + (left ? ' class="left"' : '') + '>残り <b>' + yen(left) + '</b></span></div>' +
      (over ? '<div class="qt-note red">お支払期限（' + esc(C.jpDate(q.dueDate)) + '）を過ぎて、' + yen(left) + ' がまだです。 <button type="button" class="ghost" id="qt-remind" style="font-size:12px;padding:6px 12px">お支払いのお願いのメールを作る</button></div>' : '') +
      (list.length ? '<ul class="qt-hist">' + list.map(function (p, i) {
        return '<li><time>' + esc(C.jpDate(p.date)) + '</time>' + yen(p.amount) + (p.note ? '（' + esc(p.note) + '）' : '') +
          (p.receipt ? ' <span class="qt-tag rcp">領収書 ' + esc(p.receipt) + '</span>'
            : (q.status !== 'void' ? ' <button type="button" class="ghost" data-rcpi="' + i + '" style="font-size:11px;padding:3px 9px">この入金の領収書を作る</button>' : '') +
              ' <button type="button" class="ghost" data-unpay="' + i + '" style="font-size:11px;padding:3px 9px">取り消す</button>') + '</li>';
      }).join('') + '</ul>' : '<p class="soc-small">まだ入金の記録はありません。</p>') +
      (q.status === 'void' || !left ? '' :
      '<div class="qt-acts" style="margin-top:8px">' +
        '<label style="font-size:12px">入金日 <input type="date" class="qt-in" id="qt-pdate" value="' + esc(S.data.today) + '" style="width:auto"></label>' +
        '<label style="font-size:12px">金額 <input class="qt-in" id="qt-pamt" inputmode="numeric" value="' + left + '" style="width:130px"></label>' +
        '<input class="qt-in" id="qt-pnote" maxlength="60" placeholder="メモ（例：振込・一部）" style="flex:1 1 140px;width:auto">' +
        '<button type="button" id="qt-padd">入金を記録</button></div>' +
      '<p class="soc-small">全額そろうと「入金済み」になります。一部だけの入金は、残りが「支払期限切れ」の対象のまま残ります。</p>') +
      '</div>';
  }
  function bindPay(q) {
    var add = el('qt-padd');
    if (add) add.addEventListener('click', async function () {
      var amt = el('qt-pamt').value.replace(/[^\d]/g, '');
      if (!amt) { say('入金の金額を入れてください。'); return; }
      this.disabled = true;
      var r = await send({ action: 'payment.add', id: q.id, date: el('qt-pdate').value, amount: Number(amt), note: el('qt-pnote').value });
      this.disabled = false;
      afterPay(r);
    });
    document.querySelectorAll('[data-rcpi]').forEach(function (b) {
      b.addEventListener('click', function () { derive('receipt', { payIndex: Number(b.getAttribute('data-rcpi')) }); });
    });
    document.querySelectorAll('[data-unpay]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('この入金の記録を取り消します。よろしいですか？')) return;
        afterPay(await send({ action: 'payment.remove', id: q.id, index: Number(b.getAttribute('data-unpay')) }));
      });
    });
    if (el('qt-remind')) el('qt-remind').addEventListener('click', function () {
      S.panel = '';
      togglePanel('mail');
      var C = core(), left = Math.max(0, C.computeTotals(numeric(q), S.data.settings.rounding).total - C.paidTotal(q));
      if (el('qt-msub')) el('qt-msub').value = '【お支払いのお願い】請求書 ' + q.number + '（' + (S.data.settings.company || '') + '）';
      if (el('qt-mbody')) el('qt-mbody').value = (C.addressee ? C.addressee(q) : '') + '\n\nいつもお世話になっております。\n' + C.jpDate(q.dueDate) + 'がお支払期限の請求書（' + q.number + '）について、' + yen(left) + 'のご入金をまだ確認できておりません。\n\n行き違いでお支払いいただいている場合は、ご容赦ください。\nお手数ですが、ご確認のほどよろしくお願いいたします。\n\n請求書: {リンク}\n\n' + (S.data.settings.company || '');
      say('お支払いのお願いの文を入れました。読んで直してから送ってください。', true);
    });
  }
  function afterPay(r) {
    var d = r.data || {};
    if (!d.ok) { say(d.message || '記録できませんでした。'); return; }
    S.cur = d.quote;
    upsert(Object.assign({}, S.data.list.filter(function (x) { return x.id === d.quote.id; })[0] || {}, core().quoteSummary(d.quote, S.data.settings.rounding)));
    editor(el('qt-body'));
    say(d.message || '記録しました。', true);
  }

  /* 訂正する前の版を、印刷の形で開きます（読むだけ）。 */
  async function showVersion(n) {
    var r = await api('/api/quotes?id=' + encodeURIComponent(S.cur.id) + '&version=' + n);
    var d = r.data || {};
    if (!d.ok) { say(d.message || 'その版を開けませんでした。'); return; }
    var url = URL.createObjectURL(new Blob([core().docPage(d.quote, S.data.settings, { toolbar: '第' + n + '版（訂正する前の版・読むだけ）' })], { type: 'text/html;charset=utf-8' }));
    var w = window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    if (!w) say('新しい窓を開けませんでした。ブラウザがポップアップを止めていないか確かめてください。');
  }

  /* 一覧を Excel に（税理士さんに渡す・会計ソフトに取り込む）。 */
  async function exportXlsx() {
    if (demo()) { say('デモ版のため書き出せません（実際の画面では、見積書・請求書の一覧が Excel で保存されます）。'); return; }
    say('Excel を作っています…', true);
    var res;
    try { res = await window.lumAdmin.tap(await fetch('/api/quotes?view=xlsx', { headers: { Authorization: 'Bearer ' + window.lumAdmin.key() } })); }
    catch (_) { say('通信できませんでした。'); return; }
    if (!res.ok) { say('書き出せませんでした。'); return; }
    var blob = await res.blob();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '見積書・請求書-' + S.data.today + '.xlsx';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    say('Excel を保存しました。', true);
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
    // 描き直しで外された欄（入力中のまま消えた欄）からの知らせは読まない。読むと、
    // 描き直す前の古い中身で、いまの内容を上書きしてしまいます。
    if (S.painting || (e && e.target && e.target.isConnected === false)) return;
    S.dirty = true;
    // よく使う品目の名前を選んだら、単価・単位・税率も入れる（単価が空のときだけ）。
    var t = e && e.target;
    if (t && t.getAttribute && t.getAttribute('data-f') === 'name' && e.type === 'change') {
      var c = (S.data.catalog || []).filter(function (x) { return x.name === t.value; })[0] ||
        book().items.filter(function (x) { return x.name === t.value; })[0];
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
    ['toCompany', 'toPerson', 'honor', 'toEmail', 'subject', 'number', 'date', 'validUntil', 'dueDate', 'delivery', 'payTerms', 'taxMode', 'notes', 'memo', 'scope', 'excluded', 'terms', 'proviso', 'payMethod'].forEach(function (k) {
      var v = val('qt-' + k);
      if (v !== undefined) q[k] = v;
    });
    if (val('qt-schedule') !== undefined) q.schedule = core().parseSchedule(val('qt-schedule'));
    var items = [];
    document.querySelectorAll('#qt-items .qt-row[data-i]').forEach(function (row) {
      var g = function (f) { var x = row.querySelector('[data-f=' + f + ']'); return x ? x.value : ''; };
      if (row.getAttribute('data-kind') === 'discount') {
        items.push({ kind: 'discount', name: g('name'), price: g('price'), rate: g('rate') === 'all' ? 'all' : Number(g('rate')) });
      } else {
        var o = row.querySelector('[data-f=optional]');
        var it = { kind: 'item', name: g('name'), qty: g('qty'), unit: g('unit'), price: g('price'), rate: Number(g('rate')) };
        if (o && o.checked) it.optional = true;
        row.classList.toggle('is-opt', !!(o && o.checked));
        items.push(it);
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
          : { kind: 'item', name: it.name, qty: Math.round(n(it.qty) * 100) / 100, unit: it.unit, price: Math.round(n(it.price)), rate: it.rate, optional: !!it.optional };
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
    if (t.options && t.options.count) rows += '<tr><th>オプション ' + t.options.count + '件（合計に含まない）</th><td>＋' + yen(t.options.incl) + '</td></tr>';
    var pay = el('qt-pay');
    if (pay) {
      var sa = C.scheduleAmounts(t.total, S.cur.schedule);
      pay.innerHTML = sa.rows.length
        ? (sa.ok ? '' : '<div class="qt-note red">' + esc(sa.message) + '</div>') + sa.rows.map(function (r, i) {
            return '<span>' + (i + 1) + '回目 ' + esc(r.label) + ' ' + r.pct + '%：<b>' + yen(r.amount) + '</b></span>';
          }).join('')
        : '';
    }
    el('qt-tot').innerHTML = (t.errors.length ? '<div class="qt-note red">' + esc(t.errors.join(' ')) + '</div>' : '') +
      '<table>' + rows + '</table><div class="soc-small" style="margin-top:4px">消費税は税率ごとの合計から1回だけ計算し、1円未満は「' + esc(C.ROUNDING[t.rounding]) + '」です（「設定」で変えられます）。</div>';
  }

  async function save() {
    readForm();
    var q = numeric(S.cur);
    var t = core().computeTotals(q, S.data.settings.rounding);
    if (t.errors.length) { say(t.errors.join(' ')); return false; }
    var sa = core().scheduleAmounts(t.total, q.schedule);
    if (!sa.ok) { say(sa.message); return false; }
    var b = el('qt-save');
    b.disabled = true;
    var r = await send({ action: 'save', quote: q });
    b.disabled = false;
    var d = r.data || {};
    if (!d.ok) { say(d.message || '保存できませんでした。'); return false; }
    S.cur = d.quote;
    S.dirty = false;
    upsert(d.summary);
    S.data.book = core().learnBook(S.data.book, d.quote, new Date().toISOString());
    go('list');
    say('保存しました（' + d.quote.number + '）。', true);
    return true;
  }
  function upsert(sum) {
    if (!sum) return;
    var list = S.data.list;
    var done = false;
    for (var i = 0; i < list.length; i++) { if (list[i].id === sum.id) { list[i] = sum; done = true; break; } }
    if (!done) list.unshift(sum);
    paintBadges();
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

  async function derive(action, extra) {
    if (!leaveOk()) return;
    var r = await send(Object.assign({ action: action, id: S.cur.id }, extra || {}));
    var d = r.data || {};
    if (!d.ok) { say(d.message || 'できませんでした。'); return; }
    upsert(d.summary);
    S.dirty = false;
    showDoc(d.quote, d.message || '作りました。');
  }

  async function remove() {
    var noun = core().KIND_LABEL[core().kindOf(S.cur)];
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
    var tpl = C.MAIL_BY_KIND[C.kindOf(q)] || { subject: s.mailSubject, body: s.mailBody };
    var blocked = !m.key ? 'メールの設定（RESEND_API_KEY）がまだのため、ここからは送れません。「リンクを作る」でリンクだけ作り、ふだんのメールやLINEに貼って送ることはできます。'
      : m.sandbox ? '送信元が Resend の試用アドレス（onboarding@resend.dev）のままなので、お客様には届きません（試用中は自分あてにしか送れない決まりです）。送信元のドメインを設定するまでは、「リンクを作る」でリンクだけ作って、ふだんのメールで送ってください。'
      : !m.secret ? 'リンクの署名に使う鍵（SESSION_SECRET か ADMIN_KEY）がありません。「設定状況」で入れてください。' : '';
    host.innerHTML = '<div class="qt-sec"><h4>メールで送る</h4>' +
      (blocked ? '<div class="qt-note red">' + esc(blocked) + '</div>' : '') +
      '<p class="soc-small" style="margin:0 0 6px">お客様には「見るだけのリンク」を送ります（PDFの添付ではありません）。リンクは ' + esc(s.linkDays || 60) + '日間開けます。送ると状態が「送付済み」になり、お客様が開くと「開いた日」がここに出ます。{リンク} のところに、送るときにリンクが入ります。</p>' +
      field('qt-mto', '宛先のメールアドレス', inp('qt-mto', q.toEmail, ' type="email"')) +
      field('qt-msub', '件名', inp('qt-msub', C.fillMail(tpl.subject, vars))) +
      field('qt-mbody', '本文', '<textarea class="qt-in" id="qt-mbody" rows="12">' + esc(C.fillMail(tpl.body, vars)) + '</textarea>') +
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

  /* ---------------- 記載の記録（宛先・よく書く文・品目） ----------------
     保存した見積書・請求書・領収書から覚えたもの。作るときの候補になります（quote-core.js の learnBook）。 */
  function book() { return core().cleanBook(S.data && S.data.book); }
  function uniq(list) { var seen = {}; return list.filter(function (v) { if (!v || seen[v]) return false; seen[v] = 1; return true; }); }
  var KIND_JA = function (k) { return core().KIND_LABEL[k] || '見積書'; };

  function clientHint(fill) {
    var box = el('qt-client');
    if (!box) return;
    var C = core();
    var bk = book();
    var c = C.findClient(bk, val('qt-toCompany')) || C.findClient(bk, val('qt-toPerson')) || C.findClient(bk, val('qt-toEmail'));
    if (!c) { box.innerHTML = ''; return; }
    if (fill) {
      var put = function (id, v) { var f = el(id); if (f && v && !f.value.trim()) { f.value = v; } };
      put('qt-toCompany', c.company); put('qt-toPerson', c.person); put('qt-toEmail', c.email);
      if (el('qt-honor') && !S.cur.id) el('qt-honor').value = c.honor;
      readForm();
      S.dirty = true;
    }
    var self = c.lastId && c.lastId === S.cur.id;
    box.innerHTML = '<span>前にも作ったお客様です（' + c.count + '回）。' + (c.lastNumber && !self ? '前回: ' + esc(KIND_JA(c.lastKind)) + ' ' + esc(c.lastNumber) + (c.subject ? '「' + esc(c.subject) + '」' : '') : '') + '</span>' +
      (c.lastId && !self ? '<button type="button" class="ghost" id="qt-copyprev">前回の品目と文を写す</button>' : '');
    if (el('qt-copyprev')) el('qt-copyprev').addEventListener('click', function () { copyPrev(c.lastId); });
  }

  async function copyPrev(id) {
    readForm();
    var has = S.cur.items.some(function (it) { return it.name || core().num(it.price) > 0; });
    if (has && !confirm('いま入っている品目を、前回の書類の品目で置き換えます。よろしいですか？')) return;
    var r = await api('/api/quotes?id=' + encodeURIComponent(id));
    if (!r.data || !r.data.ok) { say((r.data && r.data.message) || '前回の書類を開けませんでした。'); return; }
    S.cur = core().copyFromPrevious(S.cur, r.data.quote);
    if (!S.cur.items.length) S.cur.items = [{ kind: 'item', name: '', qty: 1, unit: '式', price: 0, rate: 10 }];
    S.dirty = true;
    editor(el('qt-body'));
    say('前回（' + (r.data.quote.number || '') + '）の件名・品目・文を写しました。金額と日付を確かめてから保存してください。', true);
  }

  function bookView(body) {
    var bk = book();
    var LBL = { subject: '件名', delivery: '納期・お取引日', payTerms: 'お支払条件', notes: '備考', scope: '作業範囲・前提条件', excluded: '含まれないもの', terms: 'お取引条件', proviso: '但し書き', payMethod: 'お支払方法' };
    var del = function (what, value) { return '<button type="button" class="ghost" data-forget="' + esc(what) + '" data-v="' + esc(value) + '">消す</button>'; };
    body.innerHTML =
      '<p class="share-note" style="margin-bottom:8px">保存した見積書・請求書・領収書から、宛先・よく書く文・品目を自動で覚えています。新しく作るとき、欄に打ち始めると候補に出ます。前にも作ったお客様なら、ご担当者・メールが入り、「前回の品目と文を写す」が使えます。見積書から請求書・領収書を作ると、宛先と品目はそのまま引き継がれます。</p>' +
      '<div class="qt-sec"><h4>宛先（' + bk.clients.length + '件）</h4>' + (bk.clients.length ? '<ul class="qt-bk">' + bk.clients.map(function (c) {
        return '<li><span><b>' + esc([c.company, c.person].filter(Boolean).join(' ')) + '</b> <small>' + esc(c.honor) + (c.email ? '・' + esc(c.email) : '') + '・' + c.count + '回' + (c.lastNumber ? '・前回 ' + esc(c.lastNumber) : '') + '</small></span>' + del('client', c.company + '|' + c.person) + '</li>';
      }).join('') + '</ul>' : '<p class="soc-small">まだありません。見積書を保存すると、ここに増えます。</p>') + '</div>' +
      '<div class="qt-sec"><h4>前に使った品目（' + bk.items.length + '件）</h4>' + (bk.items.length ? '<ul class="qt-bk">' + bk.items.slice(0, 60).map(function (it) {
        return '<li><span>' + esc(it.name) + ' <small>' + esc(yen(it.price)) + ' / ' + esc(it.unit || '—') + '・' + it.count + '回</small></span>' + del('item', it.name) + '</li>';
      }).join('') + '</ul>' : '<p class="soc-small">まだありません。</p>') +
      '<p class="soc-small" style="margin-top:6px">いつも同じ値段で出す品目は、「よく使う品目」に入れておくと、候補の先頭に出ます。</p></div>' +
      core().BOOK_FIELDS.filter(function (f) { return (bk.words[f] || []).length; }).map(function (f) {
        return '<div class="qt-sec"><h4>' + esc(LBL[f] || f) + '</h4><ul class="qt-bk">' + bk.words[f].map(function (w) {
          return '<li><span>' + esc(w.replace(/\s+/g, ' ').slice(0, 120)) + '</span>' + del(f, w) + '</li>';
        }).join('') + '</ul></div>';
      }).join('');
    body.querySelectorAll('[data-forget]').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        var r = await send({ action: 'book.forget', what: b.getAttribute('data-forget'), value: b.getAttribute('data-v') });
        var d = r.data || {};
        if (!d.ok) { b.disabled = false; say(d.message || '消せませんでした。'); return; }
        S.data.book = d.book;
        bookView(body);
        say(d.message || '消しました。', true);
      });
    });
  }

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
          field('qs-receiptPrefix', '領収書番号の頭', inp('qs-receiptPrefix', s.receiptPrefix || 'RCP', ' maxlength="6"'), '例: RCP → RCP-2026-0001') +
          field('qs-payMethod', '領収書のお支払方法（既定）', inp('qs-payMethod', s.payMethod || '銀行振込')) +
          field('qs-delivery', '納期（既定）', inp('qs-delivery', s.delivery)) +
          field('qs-payTerms', 'お支払条件（既定）', inp('qs-payTerms', s.payTerms)) +
        '</div>' +
        field('qs-notes', '備考（既定。新しい見積書に最初から入ります）', '<textarea class="qt-in" id="qs-notes" rows="2">' + esc(s.notes) + '</textarea>') +
        '<h4 style="margin:14px 0 4px">作業範囲とお取引条件（既定。新しい見積書に最初から入ります）</h4>' +
        '<div class="soc-small" style="margin-bottom:6px">見積書で揉めやすいのは「どこまで含むか」「修正や変更の扱い」「検収」「支払い」です。ひな形を入れて、数字や言い回しを自分の取引に合わせて直してください。 <button type="button" class="ghost" id="qs-tpl" style="font-size:12px;padding:6px 12px">ひな形を入れる</button></div>' +
        field('qs-defScope', '作業範囲・前提条件', '<textarea class="qt-in" id="qs-defScope" rows="3">' + esc(s.defScope || '') + '</textarea>') +
        field('qs-defExcluded', 'このお見積りに含まれないもの', '<textarea class="qt-in" id="qs-defExcluded" rows="3">' + esc(s.defExcluded || '') + '</textarea>') +
        field('qs-defTerms', 'お取引条件', '<textarea class="qt-in" id="qs-defTerms" rows="4">' + esc(s.defTerms || '') + '</textarea>') +
        field('qs-defSchedule', 'お支払いの分割', inp('qs-defSchedule', s.defSchedule || '', ' placeholder="例: 着手時 50% / 納品時 50%（一括なら空のまま）"')) +
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

    el('qs-tpl').addEventListener('click', function () {
      var T = core().CLAUSE_TEMPLATES;
      var filled = 0;
      Object.keys(T).forEach(function (k) {
        var f = el('qs-' + k);
        if (f && !f.value.trim()) { f.value = T[k]; filled++; }
      });
      say(filled ? 'ひな形を入れました（空の欄だけ）。数字や言い回しを直して「設定を保存」を押してください。' : '空の欄がないので、ひな形は入れませんでした。', true);
    });
    el('qs-save').addEventListener('click', async function () {
      var out = { logo: img.logo, seal: img.seal };
      ['company', 'person', 'tel', 'email', 'address', 'regNo', 'taxMode', 'validDays', 'linkDays', 'prefix', 'invoicePrefix', 'receiptPrefix', 'payMethod', 'delivery', 'payTerms', 'notes', 'bank', 'mailSubject', 'mailBody', 'defScope', 'defExcluded', 'defTerms', 'defSchedule'].forEach(function (k) {
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

  /* ---------------- 2つの画面に出す ---------------- */

  var KEEP = ['sec', 'filter', 'q', 'find', 'cur', 'dirty', 'pick', 'panel'];
  var VIEWS = {};
  /* その画面に描く。いま描いている方の状態（開いている書類・入力中の中身も）はしまっておきます。 */
  function mount(mode) {
    if (S.mounted === mode) return;
    if (S.mounted) {
      if (S.cur && el('qt-items')) readForm();
      var keep = {};
      KEEP.forEach(function (k) { keep[k] = S[k]; });
      VIEWS[S.mounted] = keep;
      var old = el(HOSTS[S.mounted]);
      if (old) old.innerHTML = '';
    }
    var v = VIEWS[mode];
    if (!v) {
      var sec = 'list';
      try { sec = sessionStorage.getItem('lum_qt_sec_' + mode) || 'list'; } catch (_) {}
      v = { sec: sec, filter: '', q: '', find: {}, cur: null, dirty: false, pick: false, panel: '' };
    }
    KEEP.forEach(function (k) { S[k] = v[k]; });
    S.mode = mode;
    S.mounted = mode;
    TAB = HOSTS[mode];
    shell();
  }

  var booting = null;
  function boot() {
    if (!booting) {
      booting = (async function () {
        addCss();
        try { await loadCore(); } catch (_) { S.coreFail = true; return false; }
        return await load();
      })();
    }
    return booting;
  }

  async function show(mode) {
    var had = !!S.data;
    mount(mode);
    go(S.sec);
    if (had) return;
    var ok = await boot();
    if (S.mode !== mode) return;
    if (S.coreFail) {
      el('qt-body').innerHTML = '<div class="qt-note red">画面の部品（/quote-core.js）を読み込めませんでした。再読み込みしてください。</div>';
      return;
    }
    if (!ok) return;
    paintBadges();
    go(S.sec);
  }

  /* どこでも検索・お客様カルテから。書類の種類に合った画面で開きます。 */
  window.lumQuoteOpen = async function (id) {
    if (!(await boot())) return;
    var hit = S.data.list.filter(function (x) { return x.id === id; })[0];
    var mode = modeOf(hit || { kind: 'quote' });
    if (S.mode !== mode || !S.mounted) {
      if (window.lumShowTab && window.lumShowTab(HOSTS[mode]) === false) return;
      mount(mode);
    }
    if (!leaveOk()) return;
    S.sec = 'list';
    openQuote(id);
  };
  /* 新しい見積書（お客様カルテ・どこでも検索の「新しい見積書を作る」）。 */
  window.lumQuoteNew = async function (pre) { return newIn('quote', pre, 'quote'); };
  /* 新しい請求書・領収書（kind: 'invoice' | 'receipt'）。 */
  window.lumBillNew = async function (kind, pre) { return newIn('bill', pre, kind === 'receipt' ? 'receipt' : 'invoice'); };
  async function newIn(mode, pre, kind) {
    if (!(await boot())) return;
    if (S.mode !== mode || !S.mounted) {
      if (window.lumShowTab && window.lumShowTab(HOSTS[mode]) === false) return;
      mount(mode);
    }
    if (leaveOk()) openNew(pre, kind);
  }

  window.lumQuotesInit = function () { boot(); };
  window.lumBillsInit = function () { boot(); };
  window.lumQuotesShow = function () { show('quote'); };
  window.lumBillsShow = function () { show('bill'); };
  window.addEventListener('beforeunload', function (e) {
    var other = VIEWS[S.mode === 'quote' ? 'bill' : 'quote'];
    if (S.dirty || (other && other.dirty)) { e.preventDefault(); e.returnValue = ''; }
  });
})();
