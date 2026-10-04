/* ---- 問い合わせ管理 ----
   フォームから届いた問い合わせを、1か所で「誰が・いつまでに・どう返したか」
   まで見るための画面。管理画面（admin-members.html）の1タブです。

   サイトには「48時間以内に返信」と書いてあります。この画面はその約束を
   守れているかを、ごまかさずに出すためのものです。返信がまだのものは
   24時間で黄色、48時間で赤。返信までの時間は、ここ30日の中央値です
   （平均だと、1件の放置が全体を大きく見せます）。経過時間は土日も含めた
   ただの時間で、営業時間では数えていません。

   返信そのものは、ふだん使っているメールソフトで行います。この画面から
   メールを送る仕組みにすると、送った控えが手元のメールソフトに残らず、
   その後のやり取りが追えなくなるためです。ここでは文例を差し込んで
   「メールソフトで返信」を開くか、「コピー」して貼り付けます。

   保存と計算は api/inquiries.js と api/_inquiries.js にあります。 */
(function () {
  'use strict';
  var TAB = 'inquiries-admin';
  var el = function (id) { return document.getElementById(id); };
  var S = {
    started: false, sec: 'inbox', status: 'new', q: '', page: 1, list: null, sel: {}, open: '', item: null,
    sender: null, settings: null, templates: null, vars: [], brand: '', lineToken: false, days: 30, tplEdit: null
  };
  var SECTIONS = [['inbox', '受信箱'], ['stats', '集計'], ['templates', '返信の文例'], ['settings', '設定']];
  var FILTERS = [['new', '未対応'], ['doing', '対応中'], ['done', '完了'], ['spam', '迷惑'], ['all', 'すべて']];
  var STATUS = { new: '未対応', doing: '対応中', done: '完了' };
  var MAIL = {
    owner: { sent: '送信済み', failed: '送れませんでした', skipped: '送っていません（ブロックするドメイン）', pending: '送れませんでした（途中で止まりました）' },
    auto: { off: '送らない設定', sent: '送信済み', failed: '送れませんでした', sandbox: '送っていません（送信元がResendの試用アドレス）', skipped: '送っていません' },
    line: { off: '送らない設定', sent: '送信済み', failed: '送れませんでした' }
  };

  /* 深いリンク（通知メール・LINE の「管理画面で開く」）。タブの選び直しより
     先に読む必要があるので、読み込まれた時点で控えておきます。 */
  (function () {
    var m = /[#&]inq=([a-z0-9_-]{1,40})/.exec(location.hash || '');
    if (!m) return;
    S.open = m[1];
    try { sessionStorage.setItem('lum_admin_tab', TAB); } catch (_) {}
  })();

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function demo() { try { return sessionStorage.getItem('lum_demo') === '1'; } catch (_) { return false; } }
  function say(t, info) {
    var m = el('inq-msg');
    if (!m) return;
    m.textContent = t || '';
    m.classList.toggle('show', !!t);
    m.classList.toggle('info', !!info);
  }
  async function api(url, opts) {
    try { return await window.lumAdmin.fetch(url, opts); }
    catch (_) { return { res: { ok: false, status: 0 }, data: { ok: false, message: '通信できませんでした。ネットの接続を確かめて、もう一度お試しください。' } }; }
  }
  function send(method, body) {
    return api('/api/inquiries', { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  /* 日本時間の「10/3 14:20」 */
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
  function fill(text, r) {
    var v = {
      name: r.name || '', company: r.company || '', brand: S.brand || (window.lumSite && window.lumSite.name) || '',
      reply_hours: S.settings ? S.settings.replyHours : 48, topics: (r.topics || []).join('、')
    };
    return String(text || '').replace(/\{(name|company|brand|reply_hours|topics)\}/g, function (_, k) { return v[k] == null ? '' : String(v[k]); })
      .replace(/^[ 　]+/gm, '');
  }

  var CSS =
    '#inquiries-admin .inq-top{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:14px}' +
    '.inq-card{border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:#fff;min-width:0}' +
    '.inq-card .k{font-size:11px;font-weight:700;color:var(--sub)}.inq-card .v{font-size:20px;font-weight:800;line-height:1.3}' +
    '.inq-card .n{font-size:11px;color:var(--sub);line-height:1.6}' +
    '.inq-card.warn{border-color:#d97706;background:rgba(251,191,36,.08)}.inq-card.late{border-color:#b42318;background:rgba(248,113,113,.08)}' +
    '.inq-note{border:1px solid var(--border);border-left:4px solid #b45309;border-radius:10px;padding:9px 12px;margin-bottom:10px;font-size:12.5px;line-height:1.75;background:#fffdf7}' +
    '.inq-note.red{border-left-color:#b42318;background:#fff8f7}.inq-note.gray{border-left-color:var(--sub);background:#faf9f6}' +
    '.inq-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}' +
    '.inq-bar input[type=search]{flex:1 1 200px;min-width:0;padding:9px 12px;border:1px solid var(--border);border-radius:10px;background:#faf9f6;font:inherit;font-size:13px}' +
    '.inq-bar button,.inq-acts button{font-size:12px;padding:8px 13px}' +
    '.inq-bulk{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px;font-size:12px;color:var(--sub)}' +
    '.inq-bulk button{font-size:11.5px;padding:6px 10px}' +
    '.inq-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--border)}' +
    '.inq-list li{display:flex;gap:10px;align-items:flex-start;border-bottom:1px solid var(--border);padding:10px 2px}' +
    '.inq-list li.unread .who{font-weight:800}' +
    '.inq-list input[type=checkbox]{margin-top:4px;width:18px;height:18px;flex:none}' +
    '.inq-open{flex:1;min-width:0;text-align:left;background:none;border:0;padding:0;color:var(--text);font:inherit;font-weight:400;cursor:pointer;letter-spacing:0}' +
    '.inq-open:hover{filter:none}.inq-open:focus-visible{outline:2px solid #3d3fbf;outline-offset:3px;border-radius:4px}' +
    '.inq-open .who{font-size:13.5px;overflow-wrap:anywhere}.inq-open .meta{font-size:11.5px;color:var(--sub);line-height:1.7;overflow-wrap:anywhere}' +
    '.inq-open .snip{font-size:12.5px;line-height:1.7;color:#33333b;overflow-wrap:anywhere;margin-top:2px}' +
    '.inq-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 8px;border-radius:999px;background:#f3f1ec;color:var(--sub);margin:0 4px 2px 0;white-space:nowrap}' +
    '.inq-tag.new{background:rgba(61,63,191,.12);color:#3d3fbf}.inq-tag.ok{background:rgba(16,185,129,.16);color:#047857}' +
    '.inq-tag.warn{background:rgba(251,191,36,.22);color:#92400e}.inq-tag.late,.inq-tag.ng{background:rgba(248,113,113,.17);color:#b42318}' +
    '.inq-pages{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:12px;font-size:12px;color:var(--sub)}' +
    '.inq-pages button{font-size:12px;padding:7px 12px}' +
    '.inq-d h3{font-size:16px;font-weight:800;margin:6px 0 2px;overflow-wrap:anywhere}' +
    '.inq-sec{border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-top:12px;background:#fff;min-width:0}' +
    '.inq-sec h4{font-size:12px;letter-spacing:.08em;color:var(--sub);font-weight:700;margin:0 0 8px}' +
    '.inq-body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13.5px;line-height:1.85}' +
    '.inq-dl{display:grid;grid-template-columns:8.5em minmax(0,1fr);gap:4px 10px;font-size:12.5px;line-height:1.7;margin:0}' +
    '.inq-dl dt{color:var(--sub);font-weight:700}.inq-dl dd{margin:0;overflow-wrap:anywhere}' +
    '.inq-acts{display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
    '.inq-acts .nq-chip{font-size:12px;padding:7px 12px}' +
    '#inquiries-admin textarea,#inquiries-admin .inq-in,#inquiries-admin select{width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:10px;background:#faf9f6;font:inherit;font-size:13px;line-height:1.6}' +
    '#inquiries-admin textarea{resize:vertical}' +
    '#inquiries-admin input[type=number].inq-in{width:110px}' +
    '.inq-hist{list-style:none;margin:0;padding:0;font-size:12px;line-height:1.7}.inq-hist li{padding:3px 0;border-top:1px dashed var(--border)}.inq-hist li:first-child{border-top:0}' +
    '.inq-hist time{color:var(--sub);margin-right:8px;white-space:nowrap}' +
    '.inq-tbl{width:100%;font-size:12.5px}.inq-tbl td,.inq-tbl th{padding:6px 8px}' +
    '.inq-meter{display:block;height:8px;border-radius:4px;background:#3d3fbf;min-width:2px}' +
    '.inq-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}' +
    '.inq-check{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.6;margin:6px 0}' +
    '.inq-check input{width:18px;height:18px;margin-top:2px;flex:none}' +
    '.inq-steps{margin:6px 0 0 1.3em;padding:0;font-size:12.5px;line-height:1.8}' +
    '.inq-badge{display:inline-block;min-width:18px;margin-left:6px;padding:0 6px;border-radius:999px;background:#b42318;color:#fff;font-size:10.5px;font-weight:800;line-height:18px;text-align:center;vertical-align:1px}' +
    '@media (max-width:560px){#inquiries-admin .inq-top{grid-template-columns:1fr 1fr}.inq-dl{grid-template-columns:1fr}.inq-dl dt{margin-top:4px}.inq-card .v{font-size:18px}}';

  function addCss() {
    if (el('inq-css')) return;
    var s = document.createElement('style');
    s.id = 'inq-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- タブとポータルの「未読」の印 ---------------- */

  function setBadge(n) {
    ['tab-' + TAB, 'pnode-' + TAB].forEach(function (id) {
      var host = el(id);
      if (!host) return;
      var target = host.querySelector(id.indexOf('tab-') === 0 ? 'span' : '.pn-name') || host;
      var b = target.querySelector('.inq-badge');
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'inq-badge'; target.appendChild(b); }
      b.textContent = n > 99 ? '99+' : String(n);
      b.setAttribute('aria-label', '未読 ' + n + '件');
    });
  }
  window.lumInqBadge = async function () {
    addCss();
    var r = await api('/api/inquiries?view=badge');
    setBadge(r.data && r.data.ok ? r.data.unread || 0 : 0);
  };

  /* ---------------- 骨組み ---------------- */

  function shell() {
    var host = el(TAB);
    host.innerHTML =
      '<h2 style="font-size:15px;font-weight:700;margin-bottom:4px">問い合わせ管理</h2>' +
      '<p class="share-note" style="margin-bottom:12px">フォームから届いた問い合わせの一覧です。返信したら「返信した」を押すと、約束（' +
      '<span id="inq-promise">48</span>時間以内に返信）を守れているかが分かります。返信はふだんのメールソフトで行います。</p>' +
      '<div class="nq-row" role="tablist" aria-label="問い合わせ管理の項目">' + SECTIONS.map(function (s) {
        return '<button type="button" class="nq-chip" data-isec="' + s[0] + '" aria-pressed="false">' + s[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="msg" id="inq-msg" style="margin:0 0 12px"></p>' +
      '<div id="inq-body"></div>';
    host.querySelectorAll('[data-isec]').forEach(function (b) {
      b.addEventListener('click', function () { S.open = ''; go(b.getAttribute('data-isec')); });
    });
  }

  function go(sec) {
    S.sec = sec;
    try { sessionStorage.setItem('lum_inq_sec', sec); } catch (_) {}
    document.querySelectorAll('#' + TAB + ' [data-isec]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-isec') === sec ? 'true' : 'false');
    });
    say('');
    var body = el('inq-body');
    if (sec === 'inbox') return S.open ? detail(body, S.open) : inbox(body);
    if (sec === 'stats') return statsView(body);
    if (sec === 'templates') return templatesView(body);
    return settingsView(body);
  }

  /* ---------------- 受信箱 ---------------- */

  async function loadList() {
    var qs = '?status=' + encodeURIComponent(S.status) + '&page=' + S.page + (S.q ? '&q=' + encodeURIComponent(S.q) : '');
    var r = await api('/api/inquiries' + qs);
    S.list = r.data || {};
    if (S.list.sender) S.sender = S.list.sender;
    if (S.list.promised && el('inq-promise')) el('inq-promise').textContent = S.list.promised;
    if (!r.res.ok && !S.list.ok) say(S.list.message || '読み込めませんでした。');
    if (S.list.metrics) setBadge(S.list.metrics.counts.unread);
    return S.list;
  }

  function topCards(d) {
    var m = d.metrics;
    if (!m) return '';
    var med = m.median30;
    var few = m.replied30 < 3;
    var medCls = med == null ? '' : med > d.promised ? ' late' : med > d.warnH ? ' warn' : '';
    return '<div class="inq-top">' +
      card('未読', m.counts.unread + '件', '開いていない「未対応」', '') +
      card('24時間を超えて未返信', m.warn + '件', '約束の48時間まで、あと少し', m.warn ? ' warn' : '') +
      card('48時間を超えて未返信', m.late + '件', m.late ? '約束の時間を過ぎています' : '約束を過ぎたものはありません', m.late ? ' late' : '') +
      card('返信までの時間（30日）', med == null ? '—' : hours(med),
        med == null ? 'ここ30日で「返信した」ものがまだありません'
          : '中央値・' + m.replied30 + '件のうち' + m.within + '件が' + d.promised + '時間以内' + (few ? '（件数が少ないため参考程度）' : ''), medCls) +
      '</div>';
  }
  function card(k, v, n, cls) {
    return '<div class="inq-card' + cls + '"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div><div class="n">' + esc(n) + '</div></div>';
  }

  function notes(d) {
    var out = '';
    if (!d.stored) out += '<div class="inq-note red">' + esc(d.message || '保存先が無いため、問い合わせは保存されていません。') + '</div>';
    if (d.metrics && d.metrics.counts.mailFailed) {
      out += '<div class="inq-note red"><b>メールで通知できなかった問い合わせが ' + d.metrics.counts.mailFailed + '件あります。</b>' +
        '一覧の「メール未送信」の印があるものです。問い合わせ自体はここに残っているので、開いて返信してください。' +
        '続くようなら「設定状況」でメールの設定（RESEND_API_KEY）を確かめてください。</div>';
    }
    if (d.autoReply && d.sender && d.sender.sandbox) out += '<div class="inq-note">' + esc(d.sender.sandboxNote) + '</div>';
    return out;
  }

  async function inbox(body) {
    body.innerHTML = '<p class="soc-small">読み込んでいます…</p>';
    var d = await loadList();
    if (S.sec !== 'inbox' || S.open) return;
    var c = (d.metrics && d.metrics.counts) || {};
    var count = function (k) { return k === 'all' ? '' : c[k] != null ? '（' + c[k] + '）' : ''; };
    body.innerHTML = notes(d) + topCards(d) +
      '<div class="nq-row" aria-label="状態で絞り込む">' + FILTERS.map(function (f) {
        return '<button type="button" class="nq-chip" data-ifil="' + f[0] + '" aria-pressed="' + (S.status === f[0]) + '">' + f[1] + count(f[0]) + '</button>';
      }).join('') + '</div>' +
      '<div class="inq-bar">' +
        '<label for="inq-q" class="soc-small" style="position:absolute;left:-9999px">検索</label>' +
        '<input type="search" id="inq-q" placeholder="名前・会社・メール・本文で検索" value="' + esc(S.q) + '">' +
        '<button type="button" class="ghost" id="inq-csv">CSVで書き出す</button>' +
      '</div>' +
      '<div class="inq-bulk" id="inq-bulk"></div>' +
      '<ul class="inq-list" id="inq-list"></ul>' +
      '<div class="inq-pages" id="inq-pages"></div>' +
      (d.stored ? '<p class="soc-small" style="margin-top:12px">受信から' + (d.retentionDays || 365) + '日を過ぎた問い合わせは、自動で消えます（期間は「設定」で変えられます）。必要なものはCSVで書き出して保管してください。</p>' : '');
    body.querySelectorAll('[data-ifil]').forEach(function (b) {
      b.addEventListener('click', function () { S.status = b.getAttribute('data-ifil'); S.page = 1; S.sel = {}; inbox(body); });
    });
    var qt = null;
    el('inq-q').addEventListener('input', function () {
      var v = this.value;
      clearTimeout(qt);
      qt = setTimeout(function () { S.q = v.trim(); S.page = 1; S.sel = {}; inbox(body).then(function () { var q = el('inq-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }); }, 350);
    });
    el('inq-csv').addEventListener('click', exportCsv);
    drawList(d);
  }

  function drawList(d) {
    var ul = el('inq-list');
    var items = d.items || [];
    if (!items.length) {
      ul.innerHTML = '<li><span class="soc-small">' + (d.stored === false ? 'まだ表示できる問い合わせはありません。'
        : S.q ? '「' + esc(S.q) + '」に当てはまる問い合わせはありません。'
        : S.status === 'new' ? '未対応の問い合わせはありません。' : 'この状態の問い合わせはありません。') + '</span></li>';
    } else {
      ul.innerHTML = items.map(function (it) {
        var tags = '';
        if (it.spam) tags += '<span class="inq-tag">迷惑</span>';
        else tags += '<span class="inq-tag' + (it.status === 'new' ? ' new' : it.status === 'done' ? ' ok' : '') + '">' + STATUS[it.status] + '</span>';
        if (it.status === 'new' && !it.readAt && !it.spam) tags += '<span class="inq-tag new">未読</span>';
        if (it.overdue === 'late') tags += '<span class="inq-tag late">48時間を超えています</span>';
        else if (it.overdue === 'warn') tags += '<span class="inq-tag warn">24時間を超えています</span>';
        if (it.mailOwner === 'failed' || it.mailOwner === 'pending') tags += '<span class="inq-tag ng">メール未送信</span>';
        if (it.replyH != null) tags += '<span class="inq-tag ok">返信まで ' + hours(it.replyH) + '</span>';
        if (it.estimate) tags += '<span class="inq-tag">見積り付き</span>';
        return '<li class="' + (it.status === 'new' && !it.readAt ? 'unread' : '') + '">' +
          '<input type="checkbox" data-isel="' + esc(it.id) + '"' + (S.sel[it.id] ? ' checked' : '') + ' aria-label="' + esc(it.name) + 'さんの問い合わせを選ぶ">' +
          '<button type="button" class="inq-open" data-iopen="' + esc(it.id) + '">' +
            '<div class="who">' + esc(it.company ? it.company + ' ' + it.name + ' 様' : it.name + ' 様') + '</div>' +
            '<div class="meta">' + when(it.receivedAt) + '（' + hours(it.ageH) + '前）' +
              (it.topics && it.topics.length ? '・' + esc(it.topics.join('、')) : '') + '・' + esc(it.source || '直接・不明') +
              (it.assignee ? '・担当 ' + esc(it.assignee) : '') + '</div>' +
            '<div>' + tags + '</div>' +
            '<div class="snip">' + esc(it.snippet) + '</div>' +
          '</button></li>';
      }).join('');
    }
    ul.querySelectorAll('[data-iopen]').forEach(function (b) {
      b.addEventListener('click', function () { openItem(b.getAttribute('data-iopen')); });
    });
    ul.querySelectorAll('[data-isel]').forEach(function (b) {
      b.addEventListener('change', function () {
        if (b.checked) S.sel[b.getAttribute('data-isel')] = true; else delete S.sel[b.getAttribute('data-isel')];
        drawBulk(d);
      });
    });
    drawBulk(d);
    var pg = el('inq-pages');
    if ((d.pages || 1) <= 1) { pg.innerHTML = d.total ? '<span>' + d.total + '件</span>' : ''; return; }
    pg.innerHTML = '<button type="button" class="ghost" id="inq-prev"' + (d.page <= 1 ? ' disabled' : '') + '>前へ</button>' +
      '<span>' + d.page + ' / ' + d.pages + 'ページ（' + d.total + '件）</span>' +
      '<button type="button" class="ghost" id="inq-next"' + (d.page >= d.pages ? ' disabled' : '') + '>次へ</button>';
    el('inq-prev').addEventListener('click', function () { S.page--; S.sel = {}; inbox(el('inq-body')); });
    el('inq-next').addEventListener('click', function () { S.page++; S.sel = {}; inbox(el('inq-body')); });
  }

  function drawBulk(d) {
    var box = el('inq-bulk');
    if (!box) return;
    var ids = Object.keys(S.sel);
    var items = d.items || [];
    if (!items.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<label class="inq-check" style="margin:0"><input type="checkbox" id="inq-all"' + (ids.length && ids.length === items.length ? ' checked' : '') + '>このページを全部選ぶ</label>' +
      (ids.length ? '<span>' + ids.length + '件を：</span>' +
        '<button type="button" class="ghost" data-ibulk="doing">対応中にする</button>' +
        '<button type="button" class="ghost" data-ibulk="done">完了にする</button>' +
        (S.status === 'spam' ? '<button type="button" class="ghost" data-ibulk="unspam">迷惑から戻す</button>'
          : '<button type="button" class="ghost" data-ibulk="spam">迷惑にする</button>') : '');
    el('inq-all').addEventListener('change', function () {
      S.sel = {};
      if (this.checked) items.forEach(function (it) { S.sel[it.id] = true; });
      drawList(d);
    });
    box.querySelectorAll('[data-ibulk]').forEach(function (b) {
      b.addEventListener('click', function () { bulk(b.getAttribute('data-ibulk'), b); });
    });
  }

  async function bulk(what, btn) {
    var ids = Object.keys(S.sel);
    if (!ids.length) return;
    var patch = what === 'spam' ? { spam: true } : what === 'unspam' ? { spam: false } : { status: what };
    if (what === 'spam' && !confirm(ids.length + '件を迷惑に分類します。一覧の「迷惑」に移ります（消えはしません）。よろしいですか？')) return;
    btn.disabled = true;
    var r = await send('PATCH', Object.assign({ ids: ids }, patch));
    btn.disabled = false;
    if (!r.data.ok) { say(r.data.message || '変更できませんでした。'); return; }
    S.sel = {};
    await inbox(el('inq-body'));
    say(r.data.count + '件を変更しました。', true);
  }

  async function exportCsv() {
    var btn = el('inq-csv');
    if (btn) btn.disabled = true;
    try {
      var qs = '?view=export&status=' + encodeURIComponent(S.status) + (S.q ? '&q=' + encodeURIComponent(S.q) : '');
      var r = await api('/api/inquiries' + qs);
      if (!r.res.ok) { say((r.data && r.data.message) || '書き出せませんでした。'); return; }
      var text = await r.res.text();
      var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'inquiries-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      say('いま表示している条件の問い合わせを、CSVで書き出しました。個人情報が入っているので、保管場所に気をつけてください。', true);
    } finally { if (btn) btn.disabled = false; }
  }

  /* ---------------- 1件 ---------------- */

  function openItem(id) {
    S.open = id;
    try { history.replaceState(history.state, '', location.pathname + location.search + '#inq=' + id); } catch (_) {}
    detail(el('inq-body'), id);
  }
  function closeItem() {
    S.open = '';
    S.item = null;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (_) {}
    inbox(el('inq-body'));
  }

  async function ensureSettings() {
    if (S.settings) return;
    var r = await api('/api/inquiries?view=settings');
    var d = r.data || {};
    if (d.ok) {
      S.settings = d.settings; S.templates = d.templates || []; S.vars = d.vars || [];
      S.brand = d.brand || ''; S.lineToken = !!d.lineToken; S.sender = d.sender || S.sender;
    }
  }

  async function detail(body, id) {
    body.innerHTML = '<p class="soc-small">読み込んでいます…</p>';
    var pair = await Promise.all([api('/api/inquiries?id=' + encodeURIComponent(id)), ensureSettings()]);
    var r = pair[0];
    if (S.open !== id) return;
    if (!r.data.ok) {
      body.innerHTML = '<p class="msg show">' + esc(r.data.message || '読み込めませんでした。') + '</p>' +
        '<button type="button" class="ghost" id="inq-back" style="margin-top:10px;font-size:12px;padding:8px 13px">← 一覧に戻る</button>';
      el('inq-back').addEventListener('click', closeItem);
      return;
    }
    S.item = r.data.item;
    if (r.data.sender) S.sender = r.data.sender;
    drawDetail();
    // 開いたら既読。デモや通信の失敗では何も言いません（既読は大事な操作ではないので）。
    if (!S.item.readAt && !demo()) {
      send('PATCH', { id: id, read: true }).then(function (x) {
        if (x.data && x.data.ok && S.item && S.item.id === id) { S.item.readAt = x.data.item.readAt; window.lumInqBadge(); }
      });
    }
  }

  function mailWord(kind, v) { return (MAIL[kind] && MAIL[kind][v]) || v || '—'; }

  function drawDetail() {
    var it = S.item;
    var body = el('inq-body');
    var who = it.company ? it.company + ' ' + it.name + ' 様' : it.name + ' 様';
    var o = it.overdue;
    var src = it.source || {};
    var mail = it.mail || {};
    var tpls = S.templates || [];
    body.innerHTML =
      '<button type="button" class="ghost" id="inq-back" style="font-size:12px;padding:8px 13px">← 一覧に戻る</button>' +
      '<div class="inq-d">' +
      '<h3>' + esc(who) + '</h3>' +
      '<div class="soc-small">' + when(it.receivedAt) + ' に受信' + (it.repliedAt ? '・' + when(it.repliedAt) + ' に返信（' + hours(it.replyH) + '後）' : '') + '</div>' +
      (o === 'late' ? '<div class="inq-note red" style="margin-top:10px">受信から48時間を超えています。サイトでは「48時間以内に返信」とお約束しています。</div>'
        : o === 'warn' ? '<div class="inq-note" style="margin-top:10px">受信から24時間を超えました。48時間以内の返信をお約束しています。</div>' : '') +
      (mail.owner === 'failed' || mail.owner === 'pending' ? '<div class="inq-note red" style="margin-top:10px">この問い合わせは、メールでの通知が送れていません（' + esc(mail.ownerError || '理由不明') + '）。ここから返信してください。</div>' : '') +

      '<div class="inq-sec"><h4>状態</h4><div class="inq-acts">' +
        ['new', 'doing', 'done'].map(function (s) {
          return '<button type="button" class="nq-chip" data-ist="' + s + '" aria-pressed="' + (!it.spam && it.status === s) + '">' + STATUS[s] + '</button>';
        }).join('') +
        '<button type="button" class="ghost" id="inq-replied">' + (it.repliedAt ? '「返信した」を取り消す' : '返信した') + '</button>' +
        '<button type="button" class="ghost" id="inq-spam">' + (it.spam ? '迷惑から戻す' : '迷惑にする') + '</button>' +
      '</div>' +
      '<label class="soc-lab" for="inq-assignee">担当（だれが返すか・自由に書けます）</label>' +
      '<div class="inq-acts"><input class="inq-in" id="inq-assignee" maxlength="40" style="flex:1 1 180px;width:auto" value="' + esc(it.assignee) + '" placeholder="例：山本">' +
      '<button type="button" class="ghost" id="inq-assign">担当を保存</button></div></div>' +

      '<div class="inq-sec"><h4>問い合わせの内容</h4><div class="inq-body">' + esc(it.message) + '</div></div>' +

      '<div class="inq-sec"><h4>送ってきた人</h4><dl class="inq-dl">' +
        '<dt>お名前</dt><dd>' + esc(it.name) + '</dd>' +
        (it.company ? '<dt>会社名</dt><dd>' + esc(it.company) + (it.org ? '（' + esc(it.org) + '）' : '') + '</dd>' : it.org ? '<dt>区分</dt><dd>' + esc(it.org) + '</dd>' : '') +
        '<dt>メール</dt><dd><a href="mailto:' + esc(it.email) + '">' + esc(it.email) + '</a></dd>' +
        (it.phone ? '<dt>電話</dt><dd><a href="tel:' + esc(it.phone.replace(/[^\d+]/g, '')) + '">' + esc(it.phone) + '</a></dd>' : '') +
        '<dt>ご相談の内容</dt><dd>' + esc((it.topics || []).join('、') || '（選択なし）') + '</dd>' +
        '<dt>どこから来たか</dt><dd>' + esc(src.label || '直接・不明') + '</dd>' +
        '<dt>送られたページ</dt><dd>' + esc(it.page || '—') + '</dd>' +
        '<dt>見積り</dt><dd>' + (it.estimate ? '見積りシミュレーターの内容が本文に入っています' : 'なし') + '</dd>' +
        '<dt>メール通知</dt><dd>' + esc(mailWord('owner', mail.owner)) + '</dd>' +
        '<dt>受付確認メール</dt><dd>' + esc(mailWord('auto', mail.auto)) + (mail.autoError ? '（' + esc(mail.autoError) + '）' : '') + '</dd>' +
        '<dt>LINE通知</dt><dd>' + esc(mailWord('line', mail.line)) + (mail.lineError ? '（' + esc(mail.lineError) + '）' : '') + '</dd>' +
      '</dl>' +
      (it.email && it.email.indexOf('@') > 0 ? '<div class="inq-acts" style="margin-top:8px"><button type="button" class="ghost" id="inq-block">「@' + esc(it.email.split('@')[1]) + '」からの送信をブロック</button></div>' : '') +
      '</div>' +

      '<div class="inq-sec"><h4>返信する</h4>' +
        '<p class="soc-small" style="margin-bottom:6px">文例を選ぶと、お名前などを差し込んだ文が入ります。直してから「メールソフトで返信」を押すか、「コピー」して貼り付けてください。送ったら「返信した」を押します。</p>' +
        '<label class="soc-lab" for="inq-tpl">文例</label>' +
        '<select id="inq-tpl"><option value="">（文例を使わない）</option>' + tpls.map(function (t) {
          return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>';
        }).join('') + '</select>' +
        '<label class="soc-lab" for="inq-rsub">件名</label><input class="inq-in" id="inq-rsub" maxlength="150">' +
        '<label class="soc-lab" for="inq-rbody">本文</label><textarea id="inq-rbody" rows="9"></textarea>' +
        '<div class="inq-acts" style="margin-top:8px">' +
          '<button type="button" id="inq-mailto">メールソフトで返信</button>' +
          '<button type="button" class="ghost" id="inq-copy">コピー</button>' +
          '<span class="soc-small" id="inq-rstate" role="status"></span>' +
        '</div></div>' +

      '<div class="inq-sec"><h4>メモ（社内用・お客様には見えません）</h4>' +
        (it.notes && it.notes.length ? '<ul class="inq-hist">' + it.notes.slice().reverse().map(function (n) {
          return '<li><time>' + when(n.at) + '</time>' + esc(n.text) + '</li>';
        }).join('') + '</ul>' : '<p class="soc-small">まだありません。</p>') +
        '<label class="soc-lab" for="inq-note">メモを足す</label><textarea id="inq-note" rows="2" maxlength="1000" placeholder="例：電話で日程を相談済み。来週火曜に見積りを送る。"></textarea>' +
        '<div class="inq-acts" style="margin-top:6px"><button type="button" class="ghost" id="inq-addnote">メモを保存</button></div></div>' +

      '<div class="inq-sec"><h4>これまでの流れ</h4><ul class="inq-hist">' + (it.history || []).slice().reverse().map(function (h) {
        return '<li><time>' + when(h.at) + '</time>' + esc(h.text) + '</li>';
      }).join('') + '</ul></div>' +
      '</div>';

    el('inq-back').addEventListener('click', closeItem);
    body.querySelectorAll('[data-ist]').forEach(function (b) {
      b.addEventListener('click', function () { patch({ status: b.getAttribute('data-ist') }, b); });
    });
    el('inq-replied').addEventListener('click', function () { patch({ replied: !it.repliedAt }, this); });
    el('inq-spam').addEventListener('click', function () { patch({ spam: !it.spam }, this); });
    el('inq-assign').addEventListener('click', function () { patch({ assignee: el('inq-assignee').value }, this); });
    el('inq-addnote').addEventListener('click', function () {
      var t = el('inq-note').value.trim();
      if (!t) { say('メモが空です。'); return; }
      patch({ note: t }, this);
    });
    var blockBtn = el('inq-block');
    if (blockBtn) blockBtn.addEventListener('click', async function () {
      var dom = it.email.split('@')[1];
      if (/^(gmail\.com|yahoo\.co\.jp|icloud\.com|outlook\.com|hotmail\.com|docomo\.ne\.jp|ezweb\.ne\.jp|softbank\.ne\.jp)$/i.test(dom)) {
        if (!confirm('「' + dom + '」は多くの人が使うメールです。ブロックすると、ふつうのお客様の問い合わせも迷惑に入ります。本当にブロックしますか？')) return;
      } else if (!confirm('これから「@' + dom + '」から届く問い合わせは、メールで知らせずに「迷惑」に入ります。よろしいですか？（「設定」でいつでも外せます）')) return;
      this.disabled = true;
      var r = await send('POST', { action: 'domain.block', domain: dom });
      this.disabled = false;
      if (!r.data.ok) { say(r.data.message || 'ブロックできませんでした。'); return; }
      S.settings = r.data.settings;
      say('「' + dom + '」をブロックしました。この問い合わせを迷惑にするには「迷惑にする」を押してください。', true);
    });
    el('inq-tpl').addEventListener('change', function () {
      var t = tpls.filter(function (x) { return x.id === el('inq-tpl').value; })[0];
      el('inq-rsub').value = t ? fill(t.subject, it) : '';
      el('inq-rbody').value = t ? fill(t.body, it) : '';
    });
    el('inq-mailto').addEventListener('click', function () {
      var sub = el('inq-rsub').value, txt = el('inq-rbody').value;
      var url = 'mailto:' + encodeURIComponent(it.email) + '?subject=' + encodeURIComponent(sub || 'Re: お問い合わせの件') + '&body=' + encodeURIComponent(txt);
      // 長い mailto は、メールソフトによって途中で切られます。
      el('inq-rstate').textContent = url.length > 1900 ? '本文が長いため、メールソフトによっては途中で切れます。その場合は「コピー」して貼り付けてください。' : 'メールソフトを開きました。送ったら「返信した」を押してください。';
      location.href = url;
    });
    el('inq-copy').addEventListener('click', async function () {
      var text = (el('inq-rsub').value ? '件名：' + el('inq-rsub').value + '\n\n' : '') + el('inq-rbody').value;
      var ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
        var ta = el('inq-rbody'); ta.focus(); ta.select();
        try { ok = document.execCommand('copy'); } catch (__) {}
      }
      el('inq-rstate').textContent = ok ? 'コピーしました。メールソフトに貼り付けて送ってください。' : 'コピーできませんでした。本文を選んでコピーしてください。';
    });
  }

  async function patch(p, btn) {
    if (btn) btn.disabled = true;
    var r = await send('PATCH', Object.assign({ id: S.item.id }, p));
    if (btn) btn.disabled = false;
    if (!r.data.ok) { say(r.data.message || '変更できませんでした。'); return; }
    var keep = { sub: el('inq-rsub') && el('inq-rsub').value, body: el('inq-rbody') && el('inq-rbody').value, tpl: el('inq-tpl') && el('inq-tpl').value };
    S.item = r.data.item;
    drawDetail();
    if (keep.body != null) { el('inq-tpl').value = keep.tpl; el('inq-rsub').value = keep.sub; el('inq-rbody').value = keep.body; }
    say(p.note ? 'メモを保存しました。' : p.replied ? '返信した時刻を記録しました。' : '変更しました。', true);
    window.lumInqBadge();
  }

  /* ---------------- 集計 ---------------- */

  async function statsView(body) {
    body.innerHTML = '<p class="soc-small">読み込んでいます…</p>';
    var r = await api('/api/inquiries?view=stats&days=' + S.days);
    if (S.sec !== 'stats') return;
    var d = r.data || {};
    if (!d.ok) { body.innerHTML = '<p class="msg show">' + esc(d.message || '読み込めませんでした。') + '</p>'; return; }
    if (!d.stored) { body.innerHTML = '<div class="inq-note red">' + esc(d.message) + '</div>'; return; }
    var s = d.stats;
    var table = function (title, rows, note) {
      var max = rows.reduce(function (m, x) { return Math.max(m, x[1]); }, 0) || 1;
      return '<div class="inq-sec" style="margin-top:0"><h4>' + esc(title) + '</h4>' +
        (rows.length ? '<table class="inq-tbl"><tbody>' + rows.map(function (x) {
          return '<tr><td style="width:45%;overflow-wrap:anywhere">' + esc(x[0]) + '</td><td style="width:3.5em;text-align:right">' + x[1] + '件</td>' +
            '<td><span class="inq-meter" style="width:' + Math.round(x[1] / max * 100) + '%"></span></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="soc-small">まだありません。</p>') +
        (note ? '<p class="soc-small" style="margin-top:6px">' + note + '</p>' : '') + '</div>';
    };
    body.innerHTML =
      '<div class="nq-row" aria-label="期間">' + [30, 90].map(function (n) {
        return '<button type="button" class="nq-chip" data-idays="' + n + '" aria-pressed="' + (S.days === n) + '">ここ' + n + '日</button>';
      }).join('') + '</div>' +
      '<div class="inq-top">' + card('問い合わせ', s.total + '件', '迷惑を除いた数', '') +
        card('迷惑に分類', s.byStatus.spam + '件', '数には入れていません', '') + '</div>' +
      (s.total < 10 ? '<p class="soc-small" style="margin-bottom:10px">件数が少ないうちは、1件で割合が大きく動きます。傾向は参考程度に見てください。</p>' : '') +
      '<div class="inq-grid2">' +
        table('状態', [['未対応', s.byStatus.new], ['対応中', s.byStatus.doing], ['完了', s.byStatus.done]]) +
        table('ご相談の内容', s.byTopic, '1件で複数を選んだ人は、それぞれに数えています。') +
        table('どこから来たか', s.bySource, '問い合わせた訪問の入口です。「直接・不明」には、ブックマーク・URLの入力・メールやアプリ内のリンク（紹介元が届かないもの）が入ります。') +
        table('キャンペーン（計測リンクの utm_campaign）', s.byCampaign, '計測リンクに名前を付けたときだけ出ます。') +
      '</div>';
    body.querySelectorAll('[data-idays]').forEach(function (b) {
      b.addEventListener('click', function () { S.days = Number(b.getAttribute('data-idays')); statsView(body); });
    });
  }

  /* ---------------- 返信の文例 ---------------- */

  var VAR_HELP = '{name}＝お名前、{company}＝会社名、{brand}＝自社名、{reply_hours}＝返信の約束の時間、{topics}＝ご相談の内容';

  async function templatesView(body) {
    body.innerHTML = '<p class="soc-small">読み込んでいます…</p>';
    S.settings = null;
    await ensureSettings();
    if (S.sec !== 'templates') return;
    if (!S.settings) { body.innerHTML = '<div class="inq-note red">' + esc((S.list && S.list.message) || '保存先が無いため、文例を保存できません。') + '</div>'; return; }
    var e = S.tplEdit;
    body.innerHTML =
      '<p class="soc-small" style="margin-bottom:10px">よく書く返信を文例にしておくと、1件ごとに選ぶだけで、お名前などが差し込まれます。使える差し込み：' + esc(VAR_HELP) + '</p>' +
      '<ul class="inq-list" style="margin-bottom:12px">' + S.templates.map(function (t) {
        return '<li><div style="flex:1;min-width:0"><div class="who" style="font-size:13.5px;font-weight:700">' + esc(t.name) + '</div>' +
          '<div class="soc-small">' + esc(t.subject || '（件名なし）') + '</div>' +
          '<div class="snip" style="font-size:12px;color:#33333b;white-space:pre-wrap;overflow-wrap:anywhere;max-height:5.4em;overflow:hidden">' + esc(t.body) + '</div></div>' +
          '<div class="inq-acts" style="flex:none"><button type="button" class="ghost" data-tedit="' + esc(t.id) + '">直す</button>' +
          '<button type="button" class="ghost" data-tdel="' + esc(t.id) + '">消す</button></div></li>';
      }).join('') + '</ul>' +
      '<div class="inq-sec"><h4>' + (e && e.id ? '文例を直す' : '文例を新しく作る') + '</h4>' +
        '<label class="soc-lab" for="inq-tname">名前（自分用）</label><input class="inq-in" id="inq-tname" maxlength="40" value="' + esc(e ? e.name : '') + '" placeholder="例：日程のご相談">' +
        '<label class="soc-lab" for="inq-tsub">件名</label><input class="inq-in" id="inq-tsub" maxlength="120" value="' + esc(e ? e.subject : '') + '" placeholder="例：【{brand}】お問い合わせありがとうございます">' +
        '<label class="soc-lab" for="inq-tbody">本文</label><textarea id="inq-tbody" rows="8" maxlength="3000">' + esc(e ? e.body : '') + '</textarea>' +
        '<div class="inq-acts" style="margin-top:8px"><button type="button" id="inq-tsave">文例を保存</button>' +
        (e ? '<button type="button" class="ghost" id="inq-tnew">新しく作るに戻る</button>' : '') + '</div></div>';
    body.querySelectorAll('[data-tedit]').forEach(function (b) {
      b.addEventListener('click', function () {
        S.tplEdit = S.templates.filter(function (t) { return t.id === b.getAttribute('data-tedit'); })[0] || null;
        templatesView(body).then(function () { var f = el('inq-tname'); if (f) f.focus(); });
      });
    });
    body.querySelectorAll('[data-tdel]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('この文例を消します。よろしいですか？')) return;
        var r = await send('POST', { action: 'template.delete', id: b.getAttribute('data-tdel') });
        if (!r.data.ok) { say(r.data.message || '消せませんでした。'); return; }
        S.tplEdit = null;
        await templatesView(body);
        say('文例を消しました。', true);
      });
    });
    var nb = el('inq-tnew');
    if (nb) nb.addEventListener('click', function () { S.tplEdit = null; templatesView(body); });
    el('inq-tsave').addEventListener('click', async function () {
      var item = { id: e && e.id, name: el('inq-tname').value, subject: el('inq-tsub').value, body: el('inq-tbody').value };
      this.disabled = true;
      var r = await send('POST', { action: 'template.save', item: item });
      this.disabled = false;
      if (!r.data.ok) { say(r.data.message || '保存できませんでした。'); return; }
      S.tplEdit = null;
      await templatesView(body);
      say('文例を保存しました。', true);
    });
  }

  /* ---------------- 設定 ---------------- */

  async function settingsView(body) {
    body.innerHTML = '<p class="soc-small">読み込んでいます…</p>';
    S.settings = null;
    await ensureSettings();
    if (S.sec !== 'settings') return;
    var st = S.settings;
    if (!st) { body.innerHTML = '<div class="inq-note red">保存先が無いため、設定を保存できません。問い合わせはメールでだけ届きます。</div>'; return; }
    var sd = S.sender || {};
    var ar = st.autoReply;
    var sample = { name: '山田 花子', company: '株式会社サンプル', topics: ['動画制作'] };
    body.innerHTML =
      '<div class="inq-sec" style="margin-top:0"><h4>保存期間</h4>' +
        '<label class="soc-lab" for="inq-ret">受信から何日たったら消すか（30〜1095日）</label>' +
        '<input type="number" class="inq-in" id="inq-ret" min="30" max="1095" value="' + st.retentionDays + '"> 日' +
        '<p class="soc-small" style="margin-top:6px">お名前・メールアドレス・問い合わせの内容は個人情報です。必要以上に長く持たないよう、期間を過ぎたものは自動で消します（一覧を開いたときに消えます）。' +
        'プライバシーポリシーに保存期間を書いている場合は、その日数と揃えてください。残しておきたいものは、消える前にCSVで書き出してください。</p></div>' +

      '<div class="inq-sec"><h4>返信の約束</h4>' +
        '<label class="soc-lab" for="inq-rh">何時間以内に返信するか（受付確認メールの {reply_hours} に入ります）</label>' +
        '<input type="number" class="inq-in" id="inq-rh" min="1" max="168" value="' + st.replyHours + '"> 時間' +
        '<p class="soc-small" style="margin-top:6px">サイトには「48時間以内に返信」と書いてあります。ここだけ変えても、サイトの文は変わりません（「文章編集」で直します）。一覧の黄色・赤は24時間・48時間のままです。</p></div>' +

      '<div class="inq-sec"><h4>受付確認メール（送ってくれた人へ自動で1通）</h4>' +
        (sd.sandbox ? '<div class="inq-note">' + esc(sd.sandboxNote) + '</div>' : '') +
        '<label class="inq-check"><input type="checkbox" id="inq-aron"' + (ar.on ? ' checked' : '') + '>問い合わせが届いたら、送ってくれた人に受付確認メールを送る</label>' +
        '<p class="soc-small">送信元：' + esc(sd.from || '') + '。お客様の本文は入れません（他人のアドレスを入れて、宣伝文を届けさせるいたずらを防ぐためです）。お名前や会社名にURLのようなものがあるときも送りません。</p>' +
        '<label class="soc-lab" for="inq-arsub">件名</label><input class="inq-in" id="inq-arsub" maxlength="120" value="' + esc(ar.subject) + '">' +
        '<label class="soc-lab" for="inq-arbody">本文</label><textarea id="inq-arbody" rows="9" maxlength="3000">' + esc(ar.body) + '</textarea>' +
        '<p class="soc-small">使える差し込み：' + esc(VAR_HELP) + '</p>' +
        '<details style="margin-top:6px"><summary class="soc-small" style="cursor:pointer">見本（山田 花子様・株式会社サンプルの場合）</summary>' +
        '<div class="inq-body" id="inq-arprev" style="font-size:12.5px;border:1px dashed var(--border);border-radius:10px;padding:10px;margin-top:6px"></div></details></div>' +

      '<div class="inq-sec"><h4>LINE で自分に知らせる</h4>' +
        '<p class="soc-small">問い合わせが届いたら、LINE公式アカウントから自分のLINEに「問い合わせが来ました」を1通送ります。お客様の本文は送りません（お名前・ご相談の内容・管理画面へのリンクだけ）。公式アカウントの月の無料通数から1通ずつ使います。</p>' +
        (S.lineToken ? '<p class="soc-small" style="color:#047857;font-weight:700">LINE のチャネルアクセストークンは設定済みです。</p>'
          : '<p class="soc-small" style="color:#b42318;font-weight:700">LINE のチャネルアクセストークン（LINE_CHANNEL_TOKEN）が未設定です。「設定状況 › キーの入力」で入れてください（SNS（文章）で使うものと同じです）。</p>') +
        '<ol class="inq-steps">' +
          '<li>スマホのLINEで、自社のLINE公式アカウントを友だちに追加します（追加していないと届きません）。</li>' +
          '<li>パソコンで LINE Developers（developers.line.biz）にログインし、公式アカウントのチャネル（Messaging API）を開きます。</li>' +
          '<li>「チャネル基本設定」のいちばん下にある「あなたのユーザーID」（U で始まる33文字）をコピーします。</li>' +
          '<li>下の欄に貼り付け、「LINEで知らせる」に印を付けて保存します。</li>' +
        '</ol>' +
        '<label class="soc-lab" for="inq-luid">あなたのユーザーID</label><input class="inq-in" id="inq-luid" maxlength="40" value="' + esc(st.lineUserId) + '" placeholder="U から始まる33文字" autocomplete="off" spellcheck="false">' +
        '<label class="inq-check"><input type="checkbox" id="inq-lon"' + (st.lineOn ? ' checked' : '') + '>LINEで知らせる</label></div>' +

      '<div class="inq-sec"><h4>ブロックするドメイン</h4>' +
        '<p class="soc-small">ここにあるドメインから届いた問い合わせは、メールやLINEで知らせずに「迷惑」に入ります（消しはしません）。1行に1つ。例：spam-example.com</p>' +
        '<textarea id="inq-dom" rows="4" spellcheck="false">' + esc((st.blockedDomains || []).join('\n')) + '</textarea></div>' +

      '<div class="inq-acts" style="margin-top:12px"><button type="button" id="inq-ssave">設定を保存</button></div>';
    var prev = function () { el('inq-arprev').textContent = '件名：' + fill(el('inq-arsub').value, sample) + '\n\n' + fill(el('inq-arbody').value, sample); };
    el('inq-arsub').addEventListener('input', prev);
    el('inq-arbody').addEventListener('input', prev);
    prev();
    el('inq-ssave').addEventListener('click', async function () {
      var settings = {
        retentionDays: Number(el('inq-ret').value), replyHours: Number(el('inq-rh').value),
        autoReply: { on: el('inq-aron').checked, subject: el('inq-arsub').value, body: el('inq-arbody').value },
        lineUserId: el('inq-luid').value.trim(), lineOn: el('inq-lon').checked,
        blockedDomains: el('inq-dom').value
      };
      if (settings.lineOn && !settings.lineUserId) { say('LINEで知らせるには、ユーザーIDを入れてください。'); return; }
      this.disabled = true;
      var r = await send('POST', { action: 'settings.save', settings: settings });
      this.disabled = false;
      if (!r.data.ok) { say(r.data.message || '保存できませんでした。'); return; }
      S.settings = r.data.settings;
      await settingsView(body);
      say('設定を保存しました。' + (S.settings.autoReply.on && sd.sandbox ? '（ただし送信元が試用アドレスのため、受付確認メールはまだ送られません）' : ''), true);
    });
  }

  /* ---------------- 開始 ---------------- */

  window.lumInquiriesInit = async function () {
    if (S.started) return;
    S.started = true;
    addCss();
    shell();
    try { S.sec = sessionStorage.getItem('lum_inq_sec') || 'inbox'; } catch (_) {}
    if (S.open) S.sec = 'inbox';
    if (!SECTIONS.some(function (s) { return s[0] === S.sec; })) S.sec = 'inbox';
    if (S.open) await ensureSettings();
    go(S.sec);
  };
})();
