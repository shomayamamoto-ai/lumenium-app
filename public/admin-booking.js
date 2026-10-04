/* ---- 予約管理 ----
   サイトの予約欄（トップの「空き日時」とフォーム送信後の日程選び）から入った
   予約を見て、確定・来店済み・無断キャンセル・取り消し・日時の変更をする画面。
   受付の決まり（曜日ごとの時間・休み・前後の空き）とメニューもここで決めます。
   管理画面（admin-members.html）の1タブです。

   中身はすべて /api/booking から読み、書くのも同じところです（PUT は決まり、
   PATCH は1件の予約）。お客様が自分で変更・取り消しするページは
   /api/booking-manage で、予約のメールに入っているリンクから開きます。

   数字の言い方は控えめにしています。件数が少ないうちは「目安です」と出し、
   たまたまの差を傾向と呼ばないようにしています。 */
(function () {
  var el = function (id) { return document.getElementById(id); };
  var S = { started: false, data: null, rules: null, sec: 'list', view: 'upcoming', status: '', weekOff: 0, open: '' };
  var SECTIONS = [
    ['list', '予約一覧'], ['week', '週の表'], ['rules', '受付の決まり'], ['menu', 'メニュー'],
    ['conn', 'つながり・お知らせ'], ['stats', '数字']
  ];
  var STATUS = { confirmed: '確定', tentative: '仮予約', cancelled: 'キャンセル', visited: '来店済み', noshow: '無断キャンセル' };
  var STATUS_CLS = { confirmed: 'ok', tentative: 'warn', cancelled: '', visited: 'ok', noshow: 'ng' };
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var WORDINGS = ['商談', '予約', '来店', '相談'];
  var JST = 9 * 3600000, DAY = 86400000, MIN = 60000;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 入力欄には、消えてしまう placeholder ではなく、常に見える見出しを付けます。 */
  function fld(label, control, note) {
    return '<label class="vid-fld"><span class="soc-lab">' + label + '</span>' + control +
      (note ? '<span class="soc-small" style="display:block;margin-top:3px">' + note + '</span>' : '') + '</label>';
  }
  function demo() { try { return sessionStorage.getItem('lum_demo') === '1'; } catch (_) { return false; } }
  function say(t, info) {
    var m = el('bk-msg');
    if (!m) return;
    m.textContent = t || '';
    m.classList.toggle('show', !!t);
    m.classList.toggle('info', !!info);
  }
  function pct(v) { return v == null || !isFinite(v) ? '—' : (Number(v) * 100).toFixed(1) + '%'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  async function api(url, opts) {
    try { return await window.lumAdmin.fetch(url, opts); }
    catch (_) { return { res: { ok: false, status: 0 }, data: { ok: false, message: '通信できませんでした。ネットの接続を確かめて、もう一度お試しください。' } }; }
  }
  function send(method, body) {
    return api('/api/booking', { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  /* ---- 日付（すべて日本時間） ---- */
  function jp(ms) {
    var d = new Date(ms + JST);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() };
  }
  function dayStart(ms) { var p = jp(ms); return Date.UTC(p.y, p.m - 1, p.d) - JST; }
  function ymd(ms) { var p = jp(ms); return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
  function dayLabel(ms) { var p = jp(ms); return p.m + '/' + p.d + '(' + WD[p.dow] + ')'; }
  function hm(ms) { var p = jp(ms); return pad(p.h) + ':' + pad(p.mi); }
  function hmMin(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  /* 以前の記録には start/end/status がありません。サーバーの recSpan と同じ補い方です。 */
  function span(b) {
    var s = Number(b.start) || Date.parse(b.key);
    var e = Number(b.end) || s + ((b.service && b.service.minutes) || 60) * MIN;
    return { start: s, end: e };
  }
  function status(b) { return b.status || (b.mode === 'google' ? 'confirmed' : 'tentative'); }
  function whenText(b) { var sp = span(b); return dayLabel(sp.start) + ' ' + hm(sp.start) + '〜' + hm(sp.end); }
  function now() { return Date.now(); }
  function list() { return ((S.data && S.data.bookings) || []).slice().sort(function (a, b) { return span(a).start - span(b).start; }); }

  /* 「10:00-12:00, 13:00-18:00」⇔ [[600,720],[780,1080]] */
  function rangesText(r) { return (r || []).map(function (x) { return hmMin(x[0]) + '-' + hmMin(x[1]); }).join(', '); }
  function parseRanges(text) {
    var out = [], bad = [];
    String(text || '').split(/[,、\s]+/).filter(Boolean).forEach(function (part) {
      var m = /^(\d{1,2})[:：](\d{2})[-〜~ー－](\d{1,2})[:：](\d{2})$/.exec(part);
      if (!m) { bad.push(part); return; }
      var s = Number(m[1]) * 60 + Number(m[2]), e = Number(m[3]) * 60 + Number(m[4]);
      if (s >= e || e > 1440 || s % 15 || e % 15) { bad.push(part); return; }
      out.push([s, e]);
    });
    return { ranges: out, bad: bad };
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------------- 骨組み ---------------- */

  function shell() {
    var host = el('booking-admin');
    host.innerHTML =
      '<h2 style="font-size:15px;font-weight:700;margin-bottom:4px">予約管理</h2>' +
      '<p class="share-note" style="margin-bottom:12px">サイトの予約欄から入った予約を見て、確定・来店済み・取り消し・日時の変更をします。' +
      '受付する曜日と時間、休みの日、メニューもここで決めます。お客様は、予約のメールに入っているリンクから自分で変更・取り消しができます。</p>' +
      '<div class="nq-row vid-secs" role="tablist" aria-label="予約管理の項目">' + SECTIONS.map(function (s) {
        return '<button type="button" class="nq-chip" data-sec="' + s[0] + '" aria-pressed="false">' + s[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="msg" id="bk-msg" style="margin:0 0 12px"></p>' +
      '<div id="bk-body"><p class="soc-small">読み込んでいます…</p></div>';
    host.querySelectorAll('[data-sec]').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-sec')); });
    });
  }

  function go(sec) {
    S.sec = sec;
    try { sessionStorage.setItem('lum_booking_sec', sec); } catch (_) {}
    document.querySelectorAll('#booking-admin [data-sec]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-sec') === sec ? 'true' : 'false');
    });
    say('');
    draw();
  }
  function draw() {
    var body = el('bk-body');
    if (!S.data) { body.innerHTML = '<p class="soc-small">読み込んでいます…</p>'; return; }
    (R[S.sec] || R.list)(body);
  }

  async function load() {
    var r = await api('/api/booking?recent=all');
    if (!r.data || !r.data.ok) {
      S.data = { bookings: [], rules: null, failed: true };
      el('bk-body').innerHTML = '<p class="msg show">' + esc((r.data && r.data.message) || '予約の状態を読み込めませんでした。') + '</p>';
      return false;
    }
    S.data = r.data;
    S.rules = JSON.parse(JSON.stringify(r.data.rules));
    return true;
  }

  var R = {};

  /* ---------------- 注意（メールが届かない・保存先が無い） ---------------- */

  function mailWarn() {
    var d = S.data, m = d.mail || {};
    var out = [];
    if (!d.stored) {
      out.push('保存先（Upstash Redis）が Vercel の環境変数に無いため、予約は記録されず、二重予約も防げません。' +
        (d.ics ? '' : 'この状態では、サイトに予約欄は出ません。') + '「つながり・お知らせ」に直し方があります。');
    }
    if (!m.resend) out.push('メールの送信（RESEND_API_KEY）が未設定のため、予約の知らせ・お客様への確認メール・前日のお知らせが送られていません。');
    else if (m.sandbox) {
      out.push('送信元が Resend の試用アドレス（' + (m.from || 'onboarding@resend.dev') + '）のままです。このままでは、お客様あてのメール（予約の確認・変更のリンク・前日のお知らせ）は届きません。' +
        '届くのは Resend に登録したあなたのアドレスあてだけです。Resend で自分のドメインを確認し、Vercel の CONTACT_FROM_EMAIL を「店名 &lt;info@自分のドメイン&gt;」にしてください。');
    }
    if (!out.length) return '';
    return '<div class="bk-warn">' + out.map(function (t) { return '<p>' + t + '</p>'; }).join('') + '</div>';
  }

  /* ---------------- 予約一覧 ---------------- */

  function tag(st) { return '<span class="vid-tag ' + (STATUS_CLS[st] || '') + '">' + STATUS[st] + '</span>'; }

  R.list = function (body) {
    var all = list(), t = now(), t0 = dayStart(t);
    var today = all.filter(function (b) { var s = span(b).start; return s >= t0 && s < t0 + DAY && status(b) !== 'cancelled'; });
    var ahead = all.filter(function (b) { return span(b).end >= t && (status(b) === 'confirmed' || status(b) === 'tentative'); });
    var tent = ahead.filter(function (b) { return status(b) === 'tentative'; });
    var unmarked = all.filter(function (b) { return span(b).end < t && (status(b) === 'confirmed' || status(b) === 'tentative'); });
    var VIEWS = [['upcoming', 'これから'], ['today', '今日'], ['past', '過去'], ['all', 'すべて']];
    var shown = all.filter(function (b) {
      var sp = span(b);
      if (S.view === 'upcoming' && sp.end < t) return false;
      if (S.view === 'today' && !(sp.start >= t0 && sp.start < t0 + DAY)) return false;
      if (S.view === 'past' && sp.end >= t) return false;
      return !S.status || status(b) === S.status;
    });
    if (S.view === 'past' || S.view === 'all') shown.reverse();
    body.innerHTML = mailWarn() +
      '<div class="bk-sum">' +
        '<div><b>' + today.length + '</b><span>今日の予約</span></div>' +
        '<div><b>' + ahead.length + '</b><span>これからの予約</span></div>' +
        '<div><b>' + tent.length + '</b><span>仮予約（確定の連絡待ち）</span></div>' +
        '<div><b>' + unmarked.length + '</b><span>来た・来なかったが未記入</span></div>' +
      '</div>' +
      (tent.length ? '<p class="soc-small" style="margin:0 0 10px">仮予約は、カレンダーへの自動登録をしていない予約です。内容を確かめて「確定にする」を押すと、お客様に確定のメールが届きます。</p>' : '') +
      '<div class="vid-row" style="margin-bottom:10px">' +
        '<div class="nq-row" role="group" aria-label="表示する期間" style="margin:0">' + VIEWS.map(function (v) {
          return '<button type="button" class="nq-chip" data-view="' + v[0] + '" aria-pressed="' + (S.view === v[0]) + '">' + v[1] + '</button>';
        }).join('') + '</div>' +
        '<label class="soc-lab" for="bk-st" style="margin:0 0 0 4px">状態</label>' +
        '<select id="bk-st"><option value="">すべて</option>' + Object.keys(STATUS).map(function (k) {
          return '<option value="' + k + '"' + (S.status === k ? ' selected' : '') + '>' + STATUS[k] + '</option>';
        }).join('') + '</select>' +
      '</div>' +
      (shown.length ? '<div class="bk-list">' + shown.map(card).join('') + '</div>'
        : '<p class="soc-small">' + (all.length ? 'この条件の予約はありません。' : 'まだ予約はありません。サイトの予約欄から入ると、ここに並びます。') + '</p>');
    body.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { S.view = b.getAttribute('data-view'); draw(); });
    });
    el('bk-st').addEventListener('change', function () { S.status = this.value; draw(); });
    bindCards(body);
  };

  function card(b) {
    var st = status(b), open = S.open === b.id, sp = span(b);
    return '<div class="bk-card' + (st === 'cancelled' ? ' is-off' : '') + '" data-id="' + esc(b.id) + '">' +
      '<button type="button" class="bk-head" aria-expanded="' + open + '">' +
        '<span class="bk-when">' + esc(dayLabel(sp.start)) + ' <b>' + hm(sp.start) + '〜' + hm(sp.end) + '</b></span>' +
        '<span class="bk-who">' + esc(b.name || '（名前なし）') + ' 様' +
          (b.service ? '<span class="soc-small"> ' + esc(b.service.name) + '</span>' : '') + '</span>' +
        tag(st) +
      '</button>' +
      (open ? detail(b) : '') +
    '</div>';
  }

  function detail(b) {
    var st = status(b), sp = span(b), t = now();
    var live = st === 'confirmed' || st === 'tentative';
    var rows = [
      ['メニュー', b.service ? b.service.name + '（' + b.service.minutes + '分）' : '—'],
      ['メール', b.email ? '<a class="linkish" href="mailto:' + esc(b.email) + '">' + esc(b.email) + '</a>' : '—', true],
      ['会社名', b.company || ''],
      ['ご相談の内容', (b.topics || []).join('、')],
      ['ご要望', b.note || ''],
      ['受付', (b.at ? new Date(b.at).toLocaleString('ja-JP') : '') + (b.page ? '（' + b.page + '）' : '')],
      ['カレンダー', b.mode === 'google' ? 'Googleカレンダーに登録済み' + (b.meet ? '・Meet: ' + b.meet : '')
        : '自動登録なし' + (b.addUrl && live ? '　<a class="linkish" href="' + esc(b.addUrl) + '" target="_blank" rel="noopener">Googleカレンダーに追加</a>' : ''), true],
      ['お知らせ', b.reminded ? '前日のお知らせを送りました' : '']
    ].filter(function (r) { return r[1]; });
    var hist = (b.history || []).map(function (h) {
      var what = { cancel: '取り消し', move: '日時の変更（' + (h.from || '') + 'から）', confirmed: '確定', visited: '来店済み', noshow: '無断キャンセル', tentative: '仮予約に戻す' }[h.what] || h.what;
      return '<li>' + esc(new Date(h.at).toLocaleString('ja-JP')) + '　' + esc(what) + (h.by === 'customer' ? '（お客様）' : '') + '</li>';
    }).join('');
    var acts = [];
    if (st === 'tentative') acts.push(['confirmed', '確定にする', '']);
    if (sp.start <= t && st !== 'cancelled') {
      if (st !== 'visited') acts.push(['visited', '来店済み', 'ghost']);
      if (st !== 'noshow') acts.push(['noshow', '無断キャンセル', 'ghost']);
    }
    if (live && sp.start > t) {
      acts.push(['move', '日時を変更', 'ghost']);
      acts.push(['cancel', '取り消す', 'ghost bk-danger']);
    }
    return '<div class="bk-detail">' +
      '<dl class="bk-dl">' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + (r[2] ? r[1] : esc(r[1])) + '</dd>'; }).join('') + '</dl>' +
      fld('メモ（お客様には見えません）', '<textarea class="vid-in" rows="2" data-memo maxlength="1000">' + esc(b.memo || '') + '</textarea>') +
      '<div class="vid-acts"><button type="button" class="ghost" data-act="memo">メモを保存</button>' +
        acts.map(function (a) { return '<button type="button" class="' + a[2] + '" data-act="' + a[0] + '">' + a[1] + '</button>'; }).join('') +
      '</div>' +
      '<div data-move></div>' +
      (hist ? '<details class="soc-more" style="margin-top:10px"><summary>これまでの操作</summary><ul class="bk-hist">' + hist + '</ul></details>' : '') +
    '</div>';
  }

  function bindCards(host) {
    host.querySelectorAll('.bk-card').forEach(function (c) {
      var id = c.getAttribute('data-id');
      c.querySelector('.bk-head').addEventListener('click', function () { S.open = S.open === id ? '' : id; draw(); });
      c.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', function () { act(id, btn.getAttribute('data-act'), c, btn); });
      });
    });
  }

  function find(id) { return ((S.data && S.data.bookings) || []).filter(function (b) { return b.id === id; })[0]; }

  async function act(id, action, cardEl, btn) {
    var b = find(id);
    if (!b) return;
    if (action === 'move') return pickMove(b, cardEl);
    if (action === 'cancel' && !confirm(b.name + ' 様の ' + whenText(b) + ' の予約を取り消します。お客様にも取り消しのメールが届きます。よろしいですか？')) return;
    var body = { id: id, action: action };
    if (action === 'memo') body.memo = cardEl.querySelector('[data-memo]').value;
    btn.disabled = true;
    var r = await send('PATCH', body);
    btn.disabled = false;
    if (!r.data || !r.data.ok) { say((r.data && r.data.message) || '変更できませんでした。'); return; }
    replace(r.data.booking);
    draw();
    say(r.data.message, true);
  }
  function replace(nb) {
    var arr = S.data.bookings;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === nb.id) arr[i] = nb;
  }

  /* 日時の変更。候補はサイトの予約欄と同じ決まりで作ったもの（直前の枠は出ません）。 */
  async function pickMove(b, cardEl) {
    var host = cardEl.querySelector('[data-move]');
    host.innerHTML = '<p class="soc-small" style="margin-top:8px">空いている日時を探しています…</p>';
    var r = await api('/api/booking?all=1&service=' + encodeURIComponent((b.service && b.service.id) || ''));
    var slots = (r.data && r.data.slots) || [];
    if (!slots.length) { host.innerHTML = '<p class="soc-small" style="margin-top:8px">いま変更できる空きがありません。</p>'; return; }
    host.innerHTML = '<div class="vid-row" style="margin-top:10px">' +
      '<label class="soc-lab" for="bk-mv" style="margin:0">新しい日時</label>' +
      '<select id="bk-mv">' + slots.map(function (s) { return '<option value="' + esc(s.key) + '">' + esc(s.label) + '</option>'; }).join('') + '</select>' +
      '<button type="button" id="bk-mv-go" style="font-size:12.5px;padding:9px 16px">この日時に変更</button></div>' +
      '<p class="soc-small">お客様に変更のメールが届きます。</p>';
    el('bk-mv-go').addEventListener('click', async function () {
      this.disabled = true;
      var res = await send('PATCH', { id: b.id, action: 'move', key: el('bk-mv').value });
      this.disabled = false;
      if (!res.data || !res.data.ok) { say((res.data && res.data.message) || '変更できませんでした。'); return; }
      replace(res.data.booking);
      draw();
      say(res.data.message, true);
    });
  }

  /* ---------------- 週の表 ---------------- */

  R.week = function (body) {
    var t = now(), t0 = dayStart(t);
    var monday = t0 - ((jp(t0).dow + 6) % 7) * DAY + S.weekOff * 7 * DAY;
    var rules = S.data.rules;
    var all = list();
    var cols = [];
    for (var i = 0; i < 7; i++) {
      var d0 = dayStart(monday + i * DAY + 12 * 3600000);
      var key = ymd(d0), p = jp(d0);
      var closed = rules ? (rules.closed.indexOf(key) >= 0 ? '臨時休業'
        : rules.holidays && S.data.holidays && S.data.holidays[key] ? S.data.holidays[key]
        : !rules.week[p.dow].length ? '定休日' : '') : '';
      var items = all.filter(function (b) { var s = span(b).start; return s >= d0 && s < d0 + DAY; });
      cols.push('<div class="bk-day' + (d0 === t0 ? ' is-today' : '') + '">' +
        '<div class="bk-dh">' + dayLabel(d0) + (closed ? '<span>' + esc(closed) + '</span>' : rules ? '<span>' + esc(rangesText(rules.week[p.dow])) + '</span>' : '') + '</div>' +
        (items.length ? items.map(function (b) {
          var st = status(b), sp = span(b);
          return '<button type="button" class="bk-ev st-' + st + '" data-go="' + esc(b.id) + '" title="' + esc(STATUS[st]) + '">' +
            '<b>' + hm(sp.start) + '</b> ' + esc(b.name || '') + '様' + (b.service ? '<i>' + esc(b.service.name) + '</i>' : '') + '<i>' + STATUS[st] + '</i></button>';
        }).join('') : '<p class="soc-small" style="margin:4px 0 0">—</p>') +
      '</div>');
    }
    body.innerHTML = mailWarn() +
      '<div class="vid-row" style="margin-bottom:10px">' +
        '<button type="button" class="ghost" id="bk-wprev" style="font-size:12px;padding:7px 12px">← 前の週</button>' +
        '<b style="font-size:13px">' + dayLabel(monday) + ' 〜 ' + dayLabel(monday + 6 * DAY) + '</b>' +
        '<button type="button" class="ghost" id="bk-wnext" style="font-size:12px;padding:7px 12px">次の週 →</button>' +
        (S.weekOff ? '<button type="button" class="ghost" id="bk-wnow" style="font-size:12px;padding:7px 12px">今週</button>' : '') +
      '</div>' +
      '<div class="bk-week">' + cols.join('') + '</div>' +
      '<p class="soc-small" style="margin-top:8px">予約を押すと、一覧でその予約を開きます。日の見出しの時間は、その曜日の受付時間です。</p>';
    el('bk-wprev').addEventListener('click', function () { S.weekOff--; draw(); });
    el('bk-wnext').addEventListener('click', function () { S.weekOff++; draw(); });
    if (el('bk-wnow')) el('bk-wnow').addEventListener('click', function () { S.weekOff = 0; draw(); });
    body.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () { S.open = b.getAttribute('data-go'); S.view = 'all'; S.status = ''; go('list'); });
    });
  };

  /* ---------------- 受付の決まり ---------------- */

  function needStore() {
    return S.data.stored ? '' : '<p class="bk-warn"><span>保存先（Upstash Redis）が無いため、ここで決めた内容は保存できません（いまは既定の決まりで動いています）。</span></p>';
  }

  async function saveRules(btn, next) {
    btn.disabled = true;
    say('保存しています…', true);
    var r = await send('PUT', { rules: next });
    btn.disabled = false;
    if (!r.data || !r.data.ok) { say((r.data && r.data.message) || '保存できませんでした。'); return false; }
    S.data.rules = r.data.rules;
    S.rules = JSON.parse(JSON.stringify(r.data.rules));
    say(r.data.message + ((r.data.problems || []).length ? '　' + r.data.problems.join(' ') : ''), !(r.data.problems || []).length);
    return true;
  }

  R.rules = function (body) {
    var r = S.rules;
    var order = [1, 2, 3, 4, 5, 6, 0];
    body.innerHTML = needStore() +
      '<h3 class="soc-h">呼び方</h3>' +
      fld('メールと予約欄での呼び方', '<select id="bk-word">' + WORDINGS.map(function (w) {
        return '<option' + (r.wording === w ? ' selected' : '') + '>' + w + '</option>';
      }).join('') + '</select>', '例: 「来店」なら、お客様へのメールは「来店のご予約」になります。') +
      '<h3 class="soc-h" style="margin-top:18px">曜日ごとの受付時間</h3>' +
      '<p class="soc-small" style="margin-bottom:6px">「10:00-18:00」のように書きます。昼休みがあるときは「10:00-12:00, 13:00-18:00」。空にした曜日は休みです。15分単位で書いてください。</p>' +
      '<div class="bk-hours">' + order.map(function (d) {
        return '<label class="bk-hr"><span>' + WD[d] + '曜日</span><input type="text" class="vid-in" data-dow="' + d + '" value="' + esc(rangesText(r.week[d])) + '" inputmode="numeric" autocomplete="off"></label>';
      }).join('') + '</div>' +
      '<h3 class="soc-h" style="margin-top:18px">休みの日</h3>' +
      '<label class="bk-check"><input type="checkbox" id="bk-hol"' + (r.holidays ? ' checked' : '') + '> 祝日を休みにする</label>' +
      '<p class="soc-small">祝日の表は ' + esc((S.data.holidayLast || '2027-12-31').slice(0, 4)) + ' 年までです。それより先の祝日は、下の「臨時休業の日」に足してください。</p>' +
      fld('臨時休業の日（1行に1日、例: 2026-12-31）', '<textarea id="bk-closed" class="vid-in" rows="3">' + esc((r.closed || []).join('\n')) + '</textarea>') +
      '<h3 class="soc-h" style="margin-top:18px">枠の出し方</h3>' +
      '<div class="vid-grid3">' +
        fld('何時間後から受け付けるか', '<input type="number" id="bk-lead" min="0" max="168" value="' + r.leadHours + '">', '押した直後の枠は出しません。') +
        fld('何日先まで出すか', '<input type="number" id="bk-hor" min="1" max="90" value="' + r.horizonDays + '">') +
        fld('予約の前後に空ける時間', '<select id="bk-buf">' + [0, 15, 30, 45, 60, 90, 120].map(function (n) {
          return '<option value="' + n + '"' + (r.bufferMin === n ? ' selected' : '') + '>' + (n ? n + '分' : '空けない') + '</option>';
        }).join('') + '</select>', '片付け・移動の時間。カレンダーの予定の前後にも空けます。') +
        fld('開始時刻の刻み', '<select id="bk-step">' + [15, 30, 60].map(function (n) {
          return '<option value="' + n + '"' + (r.stepMin === n ? ' selected' : '') + '>' + n + '分ごと</option>';
        }).join('') + '</select>') +
        fld('お客様が変更・取り消しできるのは', '<select id="bk-cut">' + [0, 3, 12, 24, 48, 72].map(function (n) {
          return '<option value="' + n + '"' + (r.cutoffHours === n ? ' selected' : '') + '>' + (n ? '開始の' + n + '時間前まで' : '開始の直前まで') + '</option>';
        }).join('') + (([0, 3, 12, 24, 48, 72].indexOf(r.cutoffHours) < 0) ? '<option value="' + r.cutoffHours + '" selected>開始の' + r.cutoffHours + '時間前まで</option>' : '') + '</select>', 'それを過ぎたら、メールでの連絡をお願いする表示になります。') +
      '</div>' +
      '<h3 class="soc-h" style="margin-top:18px">場所</h3>' +
      '<label class="bk-check"><input type="checkbox" id="bk-online"' + (r.online ? ' checked' : '') + '> オンライン（Googleカレンダーに接続しているとき、Meet のURLを付ける）</label>' +
      fld('来ていただく場所（メールに入ります。オンラインだけなら空で構いません）', '<input type="text" id="bk-place" class="vid-in" maxlength="120" value="' + esc(r.place || '') + '">') +
      '<div class="vid-acts"><button type="button" id="bk-rsave">保存する</button><span class="soc-small" id="bk-rnote"></span></div>';
    el('bk-rsave').addEventListener('click', async function () {
      var next = JSON.parse(JSON.stringify(S.rules));
      var bad = [];
      body.querySelectorAll('[data-dow]').forEach(function (inp) {
        var p = parseRanges(inp.value);
        if (p.bad.length) bad.push(WD[inp.getAttribute('data-dow')] + '曜日の「' + p.bad.join('」「') + '」');
        next.week[Number(inp.getAttribute('data-dow'))] = p.ranges;
      });
      if (bad.length) { say('読めない時間があります: ' + bad.join('、') + '。「10:00-18:00」のように、15分単位で書いてください。'); return; }
      var closed = el('bk-closed').value.split(/\s+/).filter(Boolean);
      var wrong = closed.filter(function (d) { return !/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d)); });
      if (wrong.length) { say('臨時休業の日が読めません: ' + wrong.join('、') + '。2026-12-31 のように書いてください。'); return; }
      next.wording = el('bk-word').value;
      next.holidays = el('bk-hol').checked;
      next.closed = closed;
      next.leadHours = Number(el('bk-lead').value);
      next.horizonDays = Number(el('bk-hor').value);
      next.bufferMin = Number(el('bk-buf').value);
      next.stepMin = Number(el('bk-step').value);
      next.cutoffHours = Number(el('bk-cut').value);
      next.online = el('bk-online').checked;
      next.place = el('bk-place').value;
      if (await saveRules(this, next)) previewCount();
    });
  };

  /* 保存したあと、サイトの予約欄に実際にいくつ枠が出るかを確かめます。 */
  async function previewCount() {
    var n = el('bk-rnote');
    if (!n) return;
    var r = await api('/api/booking?all=1');
    var d = r.data || {};
    n.textContent = !d.ok ? '' : !d.enabled ? 'いまサイトに予約欄は出ていません（保存先・カレンダーの「つながり」をご覧ください）。'
      : 'いまサイトに出ている候補: ' + (d.total || 0) + '件（最初のメニュー・' + (d.minutes || '') + '分の場合）';
  }

  /* ---------------- メニュー ---------------- */

  R.menu = function (body) {
    var list = S.rules.services;
    var mins = [];
    for (var m = 15; m <= 240; m += 15) mins.push(m);
    body.innerHTML = needStore() +
      '<p class="soc-small" style="margin-bottom:10px">予約欄では、受付中のメニューが2つ以上あるときだけ、お客様がメニューを選べます。1つなら選ぶ手間はありません。枠の長さはメニューの時間で決まります。</p>' +
      '<div class="bk-menu">' + list.map(function (s, i) {
        return '<div class="bk-svc" data-i="' + i + '">' +
          '<div class="vid-grid3">' +
            fld('メニュー名', '<input type="text" data-k="name" maxlength="40" value="' + esc(s.name) + '">') +
            fld('時間', '<select data-k="minutes">' + mins.concat(mins.indexOf(s.minutes) < 0 ? [s.minutes] : []).map(function (n) {
              return '<option value="' + n + '"' + (s.minutes === n ? ' selected' : '') + '>' + n + '分</option>';
            }).join('') + '</select>') +
            fld('料金の目安（任意）', '<input type="text" data-k="price" maxlength="40" value="' + esc(s.price || '') + '">') +
          '</div>' +
          fld('説明（任意・予約欄に出ます）', '<input type="text" class="vid-in" data-k="desc" maxlength="200" value="' + esc(s.desc || '') + '">') +
          '<div class="vid-row" style="margin-top:6px">' +
            '<label class="bk-check" style="margin:0"><input type="checkbox" data-k="active"' + (s.active ? ' checked' : '') + '> 受け付ける</label>' +
            '<button type="button" class="ghost" data-del style="font-size:12px;padding:6px 12px;margin-left:auto">消す</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>' +
      '<div class="vid-acts">' +
        '<button type="button" class="ghost" id="bk-add">メニューを足す</button>' +
        '<button type="button" id="bk-msave">保存する</button>' +
      '</div>';
    function collect() {
      return Array.prototype.map.call(body.querySelectorAll('.bk-svc'), function (row) {
        var i = Number(row.getAttribute('data-i'));
        var g = function (k) { return row.querySelector('[data-k="' + k + '"]'); };
        return { id: list[i].id, name: g('name').value, minutes: Number(g('minutes').value), price: g('price').value, desc: g('desc').value, active: g('active').checked };
      });
    }
    body.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = Number(b.closest('.bk-svc').getAttribute('data-i'));
        S.rules.services = collect().filter(function (_, k) { return k !== i; });
        draw();
      });
    });
    el('bk-add').addEventListener('click', function () {
      S.rules.services = collect().concat([{ id: '', name: '', minutes: 60, price: '', desc: '', active: true }]);
      draw();
    });
    el('bk-msave').addEventListener('click', async function () {
      var svcs = collect().filter(function (s) { return s.name.trim(); });
      if (!svcs.some(function (s) { return s.active; })) { say('受け付けるメニューを1つ以上にしてください。'); return; }
      var next = JSON.parse(JSON.stringify(S.data.rules));
      next.services = svcs;
      if (await saveRules(this, next)) draw();
    });
  };

  /* ---------------- つながり・お知らせ ---------------- */

  R.conn = function (body) {
    var d = S.data, m = d.mail || {}, cron = d.cron || {}, line = d.line || {};
    /* いまどの段にいるか。3段あって、できることが違います。
       1. 何もなし   … 受付時間の決まりだけで候補を出す（仮予約）
       2. 簡易接続   … 本当の空きから候補を出す（仮予約のまま）
       3. 通常の接続 … 空きの反映に加えて、予定の登録とMeetの発行まで */
    var level = d.connected ? 3 : d.ics ? 2 : 1;
    var levelText = level === 3 ? '✓ Googleカレンダーに接続済み（' + esc(d.calendarId || 'primary') + '）'
      : level === 2 ? '✓ 簡易接続（カレンダーの空きのみ反映）' : '未接続（受付時間の決まりだけで枠を出しています）';
    var fix = level === 3
      ? 'お客様が予約すると、このカレンダーに予定が入り、お客様にも招待が届きます（オンラインにしていれば Meet のURL付き）。取り消し・日時の変更も、カレンダーの予定に反映されます。'
      : level === 2
        ? '候補日時は、あなたのカレンダーの本当の空きから、予定の前後をあけて出ています。ただし簡易接続は読み取り専用のため、予約はカレンダーに自動では入りません（予約一覧の「Googleカレンダーに追加」か、届くメールの添付ファイルから1回で入れられます）。' +
          '予定の自動登録まで行うには、設定状況の「予約管理（Googleカレンダー）」にクライアントIDとシークレットを入れてから、下の「Googleカレンダーに接続」を押してください。'
        : d.stored
          ? 'いまは受付時間の決まりだけで候補を出し、確定は仮予約です。Googleにログインして、カレンダーの設定から「非公開の iCal 形式の URL」をコピーし、設定状況の「カレンダーの非公開URL（簡易接続）」に貼るだけで、候補が本当の空きから出るようになります（読み取りのみ・Cloud Console は不要）。'
          : d.storedHere
            ? '保存先（Upstash Redis）は、この端末には設定されていますが、Vercel の環境変数には入っていません。予約欄は訪問者のブラウザで動くもので、訪問者のリクエストはこの端末の設定を持っていません。' +
              'Vercel › Settings › Environment Variables に UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN を登録して再デプロイすると、予約欄が表示されるようになります。'
            : '保存先（Upstash Redis）が未設定のため、予約欄はサイトに表示されません。二重予約を防げない状態で予約を受けるわけにいかないためです。' +
              'Vercel › Storage から Upstash をつなぐか（KV_REST_API_URL と KV_REST_API_TOKEN が自動で入ります）、Vercel › Settings › Environment Variables に UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN を登録してください。';
    function row(ok, title, text) {
      return '<div class="bk-conn"><b>' + (ok === true ? '✓ ' : ok === false ? '✗ ' : '△ ') + title + '</b><p>' + text + '</p></div>';
    }
    var last = cron.last;
    body.innerHTML =
      '<h3 class="soc-h">カレンダー</h3>' +
      '<div class="bk-conn"><b style="color:' + (level === 3 ? '#0e7490' : level === 2 ? '#b45309' : 'var(--sub)') + '">' + levelText + '</b><p>' + fix + '</p>' +
        '<div class="vid-acts" style="margin-top:6px">' +
          '<button type="button" id="bk-gconnect" class="ghost">' + (d.connected ? '接続し直す' : 'Googleカレンダーに接続') + '</button>' +
          '<button type="button" id="bk-keys" class="ghost">設定状況でキーを入れる</button>' +
        '</div><p id="bk-gsay" class="soc-small" style="margin-top:6px"></p></div>' +
      '<h3 class="soc-h" style="margin-top:18px">メール</h3>' +
      row(m.resend && !m.sandbox ? true : false, 'お客様へのメール',
        !m.resend ? 'RESEND_API_KEY が未設定です。予約の知らせも、お客様への確認メールも送られていません。設定状況の「問い合わせメール送信」から設定してください。'
          : m.sandbox ? '送信元が Resend の試用アドレス（' + esc(m.from) + '）のままです。お客様あてのメールは届きません（届くのは Resend に登録したあなたのアドレスあてだけです）。Resend で自分のドメインを確認し、Vercel の CONTACT_FROM_EMAIL を「店名 &lt;info@自分のドメイン&gt;」にしてください。'
            : '送信元 ' + esc(m.from) + ' から送っています。予約の受付・確定・変更・取り消し・前日のお知らせが、お客様とあなたの両方に届きます。') +
      row(!!d.links, '変更・取り消しのリンク',
        d.links ? 'お客様あてのメールに、自分で日時の変更・取り消しができるリンクが入ります（開始の' + esc(S.data.rules.cutoffHours) + '時間前まで）。'
          : 'リンクを作るための鍵（SESSION_SECRET）がありません。メールには「返信でご連絡ください」とだけ入ります。設定状況の「ログインセッションの署名鍵」を入れてください。') +
      '<h3 class="soc-h" style="margin-top:18px">前日のお知らせ</h3>' +
      '<label class="bk-check"><input type="checkbox" id="bk-remind"' + (S.data.rules.remind ? ' checked' : '') + '> 前日の朝9時ごろに、翌日のお客様へお知らせメールを送る</label>' +
      row(!!cron.secret, '毎朝の自動処理',
        (cron.secret ? '毎朝9時（日本時間）に動きます（SNS の予約投稿と同じ処理の中で動かしています）。' : 'CRON_SECRET が未設定のため、毎朝の自動処理は動いていません。設定状況の「週次メールの合言葉」を入れてください。') +
        (last ? '<br>前回: ' + esc(new Date(last.at).toLocaleString('ja-JP')) + '　お知らせ ' + esc((last.reminders || {}).sent || 0) + '通' +
          ((last.reminders || {}).failed ? '・送れなかったもの ' + esc(last.reminders.failed) + '通' : '') : '')) +
      '<h3 class="soc-h" style="margin-top:18px">LINE（あなたあて・任意）</h3>' +
      '<p class="soc-small" style="margin-bottom:6px">毎朝、今日の予約の一覧をあなたの LINE に送ります。予約の無い日は送りません（LINE公式アカウントの無料の通数を使います）。</p>' +
      fld('あなたの LINE ユーザーID（U で始まる33文字）', '<input type="text" id="bk-lineid" class="vid-in" maxlength="40" autocomplete="off" value="' + esc(S.data.rules.lineUserId || '') + '">',
        'LINE Developers › あなたのチャネル › 「チャネル基本設定」の一番下「あなたのユーザーID」にあります。') +
      row(!!line.token, 'LINE のチャネルアクセストークン', line.token ? '設定済みです（SNS 投稿の LINE と同じものを使います）。' : '未設定です。設定状況の「LINE チャネルアクセストークン（長期）」を入れると送れるようになります。') +
      '<p class="soc-small" style="margin-top:6px">お客様あての LINE のお知らせはしていません。お客様に LINE で送るには、その方の LINE のユーザーIDが要り、それを知るには予約を LINE の中（LIFF）で受ける仕組みが別に要るためです。お客様へのお知らせはメールで届きます。</p>' +
      '<div class="vid-acts"><button type="button" id="bk-csave">お知らせの設定を保存する</button></div>';
    el('bk-keys').addEventListener('click', function () {
      if (!window.lumShowTab) return;
      window.lumShowTab('health-admin');
      setTimeout(function () { var h = el('set-list'); if (h) h.scrollIntoView({ block: 'start' }); }, 90);
    });
    el('bk-gconnect').addEventListener('click', connectGoogle);
    el('bk-csave').addEventListener('click', async function () {
      var next = JSON.parse(JSON.stringify(S.data.rules));
      next.remind = el('bk-remind').checked;
      next.lineUserId = el('bk-lineid').value.trim();
      if (next.lineUserId && !/^U[0-9a-f]{32}$/.test(next.lineUserId)) { say('LINE のユーザーIDは「U」で始まる33文字（数字と a〜f）です。もう一度お確かめください。'); return; }
      await saveRules(this, next);
    });
  };

  /* 接続ボタンの結果は、ボタンのすぐ下に出します（画面の上のほうに出すと、
     下のボタンを押した人からは見えず「押しても何も起きない」ように見えます）。 */
  async function connectGoogle() {
    var btn = el('bk-gconnect'), out = el('bk-gsay');
    btn.disabled = true;
    out.textContent = 'Google の同意画面を開いています…';
    var r = await api('/api/google-oauth?start=1');
    btn.disabled = false;
    if (!r.res.ok || !r.data.ok) { out.textContent = (r.data && r.data.message) || '接続を開始できませんでした。'; return; }
    var w = window.open(r.data.url, '_blank', 'noopener');
    out.innerHTML = (!w ? 'ポップアップが塞がれました。<a class="linkish" href="' + esc(r.data.url) + '" target="_blank" rel="noopener">Googleの同意画面を開く →</a> ' : '') +
      esc(r.data.willSave === false
        ? '許可すると、保存先が無いため「値を貼ってください」という画面が出ます。表示された値を Vercel の環境変数に登録してください。'
        : '別のタブで許可してから、「接続できたか確認する」を押してください。') +
      ' <button type="button" class="ghost" id="bk-grecheck" style="font-size:12px;padding:6px 12px">接続できたか確認する</button>';
    el('bk-grecheck').addEventListener('click', async function () { await load(); draw(); });
  }

  /* ---------------- 数字 ---------------- */

  R.stats = function (body) {
    var all = list(), t = now();
    var past = all.filter(function (b) { return span(b).start <= t; });
    var rate = rates(past);
    var monday = dayStart(t) - ((jp(dayStart(t)).dow + 6) % 7) * DAY;
    var weeks = [];
    for (var i = 7; i >= 0; i--) {
      var w0 = monday - i * 7 * DAY;
      var inWeek = all.filter(function (b) { var s = span(b).start; return s >= w0 && s < w0 + 7 * DAY; });
      weeks.push({ label: dayLabel(w0).replace(/\(.\)/, '') + '〜', n: inWeek.filter(function (b) { return status(b) !== 'cancelled'; }).length, c: inWeek.length - inWeek.filter(function (b) { return status(b) !== 'cancelled'; }).length });
    }
    var maxW = Math.max.apply(null, weeks.map(function (w) { return w.n + w.c; }).concat([1]));
    var live = all.filter(function (b) { return status(b) !== 'cancelled'; });
    var slots = top(live, function (b) { var p = jp(span(b).start); return WD[p.dow] + '曜 ' + pad(p.h) + '時台'; });
    var svcs = top(live, function (b) { return (b.service && b.service.name) || '（メニューなし・以前の予約）'; });
    var few = past.length < 20;
    body.innerHTML =
      '<h3 class="soc-h">週ごとの予約（取り消しを除く）</h3>' +
      '<div class="bk-bars">' + weeks.map(function (w) {
        return '<div class="bk-bar"><span class="l">' + esc(w.label) + '</span><span class="b"><i style="width:' + Math.round(w.n / maxW * 100) + '%"></i>' +
          (w.c ? '<i class="c" style="width:' + Math.round(w.c / maxW * 100) + '%"></i>' : '') + '</span><span class="n">' + w.n + (w.c ? '<small>（取消 ' + w.c + '）</small>' : '') + '</span></div>';
      }).join('') + '</div>' +
      '<div class="bk-sum" style="margin-top:14px">' +
        '<div><b>' + pct(rate.cancelRate) + '</b><span>取り消しの割合（' + rate.cancelled + ' / ' + rate.all + '件）</span></div>' +
        '<div><b>' + pct(rate.noshowRate) + '</b><span>無断キャンセルの割合（' + rate.noshow + ' / ' + (rate.visited + rate.noshow) + '件）</span></div>' +
      '</div>' +
      '<p class="soc-small">' + (few ? 'まだ件数が少ないので、割合は目安です（20件を超えるころから、ぶれが小さくなります）。' : '') +
        '無断キャンセルの割合は、「来店済み」か「無断キャンセル」を付けた予約だけで計算しています。付けていない予約は数に入りません。</p>' +
      '<div class="bk-two">' +
        '<div><h3 class="soc-h" style="margin-top:14px">よく選ばれる時間</h3>' + rank(slots) + '</div>' +
        '<div><h3 class="soc-h" style="margin-top:14px">よく選ばれるメニュー</h3>' + rank(svcs) + '</div>' +
      '</div>' +
      '<div class="vid-acts"><button type="button" class="ghost" id="bk-csv">予約の一覧を CSV で保存</button>' +
        '<span class="soc-small">Excel で開けます（直近300件まで）。お客様の名前とメールが入るので、扱いにご注意ください。</span></div>';
    el('bk-csv').addEventListener('click', function () { download('予約一覧-' + ymd(now()) + '.csv', csv(all), 'text/csv;charset=utf-8'); });
  };

  function top(arr, keyOf) {
    var c = {};
    arr.forEach(function (b) { var k = keyOf(b); c[k] = (c[k] || 0) + 1; });
    return Object.keys(c).map(function (k) { return [k, c[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
  }
  function rank(rows) {
    if (!rows.length) return '<p class="soc-small">まだありません。</p>';
    return '<ol class="bk-rank">' + rows.map(function (r) { return '<li><span>' + esc(r[0]) + '</span><b>' + r[1] + '件</b></li>'; }).join('') + '</ol>';
  }
  /* サーバーの rates（_booking.js）と同じ数え方。 */
  function rates(arr) {
    var c = { all: 0, cancelled: 0, visited: 0, noshow: 0 };
    arr.forEach(function (b) { c.all++; var st = status(b); if (c[st] !== undefined && st !== 'all') c[st]++; });
    var marked = c.visited + c.noshow;
    c.cancelRate = c.all ? c.cancelled / c.all : null;
    c.noshowRate = marked ? c.noshow / marked : null;
    return c;
  }
  function csv(arr) {
    /* 先頭が = + - @ の値は、表計算ソフトが式として動かすことがあるので ' を付けます。 */
    var q = function (v) {
      var s = String(v == null ? '' : v);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    var head = ['日付', '曜日', '開始', '終了', 'メニュー', '分', 'お名前', '会社名', 'メール', '状態', 'カレンダー', '受付日時', 'メモ', 'ご要望'];
    var rows = arr.map(function (b) {
      var sp = span(b), p = jp(sp.start);
      return [ymd(sp.start), WD[p.dow], hm(sp.start), hm(sp.end), b.service ? b.service.name : '', b.service ? b.service.minutes : Math.round((sp.end - sp.start) / MIN),
        b.name, b.company, b.email, STATUS[status(b)], b.mode === 'google' ? 'Google' : b.mode === 'ics' ? '簡易接続' : '自動登録なし',
        b.at ? new Date(b.at).toLocaleString('ja-JP') : '', b.memo, b.note].map(q).join(',');
    });
    return '﻿' + [head.map(q).join(',')].concat(rows).join('\r\n') + '\r\n';
  }

  /* ---------------- 開始 ---------------- */

  window.lumBookingInit = async function () {
    if (S.started) return;
    S.started = true;
    shell();
    try { S.sec = sessionStorage.getItem('lum_booking_sec') || 'list'; } catch (_) {}
    if (!SECTIONS.some(function (s) { return s[0] === S.sec; })) S.sec = 'list';
    if (await load()) go(S.sec);
    else document.querySelectorAll('#booking-admin [data-sec]').forEach(function (b) { b.disabled = true; });
    if (demo()) say('デモ表示：架空のサロンの予約です。保存・変更・メールの送信は行われません。', true);
  };
})();
