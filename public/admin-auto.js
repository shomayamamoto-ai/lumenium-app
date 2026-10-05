/* ---- 自動改善 ----
   各ツールが測った数字を毎朝1枚にまとめ（観測）、決まったルールで提案を
   出し、サイトの文章を半分ずつの人に見せて比べ（実験）、設定で許したこと
   だけを自動で行う画面。管理画面（admin-members.html）の1タブです。

   中身はすべて /api/auto から読み、書くのも同じところです。訪問者に配る
   実験の設定は /api/exp、毎朝の処理は api/auto-cron.js（social-cron.js の中）。

   数字の言い方は控えめにしています。人数が少ないうちは「判断できません」
   「参考程度」と出し、「良くなります」とは書きません。自動でしたことは、
   すべて「記録」に残り、そこから元に戻せます。
   書き方は ES5 のままです（ほかの管理画面のファイルと同じ）。 */
(function () {
  var el = function (id) { return document.getElementById(id); };
  var S = { started: false, data: null, sec: 'props', busy: false, drafted: false };
  var SECTIONS = [['props', '提案'], ['exps', '実験'], ['log', '記録'], ['trend', '数字の推移'], ['settings', '設定']];
  var STATUS = { open: '未対応', testing: '実験中', adopted: '採用済み', done: '済み', dismissed: '見送り' };
  var PHASE = { running: '実験中', watch: '採用後の見張り中', adopted: '採用済み', stopped: '終了（元のまま）', reverted: '元に戻した' };
  var KIND_BTN = { experiment: '実験する', setting: '採用する', sns: '承認待ちに入れる', fix: '直した', news: '済んだ', info: '済んだ' };
  var TAB_NAMES = { 'seo-admin': 'SEO / AIO 分析', 'inquiries-admin': '問い合わせ管理', 'booking-admin': '予約管理', 'list-view': '会員リスト', 'social-admin': 'SNS（文章）' };

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function demo() { try { return sessionStorage.getItem('lum_demo') === '1'; } catch (_) { return false; } }
  function say(t, info) {
    var m = el('au-msg');
    if (!m) return;
    m.textContent = t || '';
    m.classList.toggle('show', !!t);
    m.classList.toggle('info', !!info);
  }
  function pct(v) { return v == null || !isFinite(v) ? '—' : (Number(v) * 100).toFixed(1) + '%'; }
  function when(iso) {
    if (!iso) return '—';
    var d = new Date(Date.parse(iso) + 9 * 3600000);
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
  }
  function badge(label) { return label ? ' <span class="au-tag au-tag--warn">' + esc(label) + '</span>' : ''; }
  function abRow(name, r) {
    return '<tr><td>' + name + '</td><td>' + (r ? r.n : 0) + '</td><td>' + (r ? r.k : 0) + '</td><td>' + (r && r.n ? pct(r.p) : '—') + '</td><td>' +
      (r && r.n ? pct(r.lo) + '〜' + pct(r.hi) : '—') + (r && r.label ? badge(r.label) : '') + '</td></tr>';
  }

  async function api(url, opts) {
    try { return await window.lumAdmin.fetch(url, opts); }
    catch (_) { return { res: { ok: false, status: 0 }, data: { ok: false, message: '通信できませんでした。ネットの接続を確かめて、もう一度お試しください。' } }; }
  }
  function post(body) {
    return api('/api/auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  async function act(body, okText) {
    if (S.busy) return;
    S.busy = true;
    say('処理しています…', true);
    var r = await post(body);
    S.busy = false;
    var d = r.data || {};
    if (!d.ok) { say(d.message || '処理できませんでした。'); return false; }
    await load();
    go(S.sec);
    say(d.message || okText || '済みました。', true);
    return true;
  }

  /* ---- 見た目（この画面だけのもの） ---- */
  function style() {
    if (el('au-style')) return;
    var s = document.createElement('style');
    s.id = 'au-style';
    s.textContent =
      '#auto-admin textarea, #auto-admin input[type=number] { padding: 9px 11px; background: #faf9f6; color: var(--text); border: 1px solid var(--border); border-radius: 9px; font-size: 12.5px; font-family: inherit; max-width: 100%; min-width: 0; }' +
      '#auto-admin textarea { width: 100%; line-height: 1.6; resize: vertical; }' +
      '#auto-admin button { padding: 9px 14px; font-size: 12.5px; }' +
      '.au-head { display: grid; gap: 8px; grid-template-columns: minmax(0, 1fr) auto; align-items: start; background: #f3f1ec; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; }' +
      '.au-head p { font-size: 12.5px; line-height: 1.8; margin: 0; overflow-wrap: anywhere; }' +
      '.au-head .au-acts { display: flex; flex-direction: column; gap: 6px; }' +
      '.au-stop { background: #b42318 !important; }' +
      '.au-paused { border-color: rgba(180,35,24,0.45); background: rgba(180,35,24,0.06); }' +
      '.au-list { display: grid; gap: 8px; }' +
      '.au-card { border: 1px solid var(--border); border-radius: 11px; background: #fff; padding: 12px 14px; min-width: 0; }' +
      '.au-card h3 { font-size: 13.5px; font-weight: 700; line-height: 1.6; margin: 4px 0 6px; overflow-wrap: anywhere; }' +
      '.au-card ul { margin: 4px 0 8px 18px; font-size: 12px; line-height: 1.8; }' +
      '.au-card .au-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }' +
      '.au-tag { display: inline-block; font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #f3f1ec; color: var(--sub); margin-right: 4px; white-space: nowrap; }' +
      '.au-tag--warn { background: rgba(251,191,36,0.18); color: #92400e; }' +
      '.au-tag--ok { background: rgba(16,185,129,0.14); color: #047857; }' +
      '.au-tag--ng { background: rgba(180,35,24,0.1); color: #b42318; }' +
      '.au-ab { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 10px; font-size: 12px; margin: 6px 0; }' +
      '.au-ab dt { color: var(--sub); white-space: nowrap; font-weight: 700; }' +
      '.au-ab dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }' +
      '.au-verdict { font-size: 12.5px; line-height: 1.8; font-weight: 700; margin: 6px 0; }' +
      '.au-tbl { width: 100%; overflow-x: auto; }' +
      '.au-tbl table { font-size: 12px; min-width: 520px; }' +
      '.au-tbl th, .au-tbl td { padding: 7px 8px; white-space: nowrap; }' +
      '.au-sw { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 10px; align-items: start; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 12.5px; }' +
      '.au-sw input { margin-top: 4px; }' +
      '.au-sw b { display: block; }' +
      '.au-more { font-size: 12px; color: var(--sub); margin-top: 10px; }' +
      '@media (max-width: 520px) { .au-head { grid-template-columns: minmax(0, 1fr); } .au-head .au-acts { flex-direction: row; flex-wrap: wrap; } }';
    document.head.appendChild(s);
  }

  function shell() {
    style();
    var host = el('auto-admin');
    host.innerHTML =
      '<h2 style="font-size:15px;font-weight:700;margin-bottom:4px">自動改善</h2>' +
      '<p class="share-note" style="margin-bottom:12px">ほかのツールが測った数字を毎朝まとめて、次にすることを提案します。サイトの文章は、元の文章と新しい案を半分ずつの人に見せて比べ、はっきり良い方だけを残せます。' +
      '自動でしてよいことは「設定」で決めます（最初は、提案と下書きを作るだけです）。料金・法的なページ・連絡先は、自動では決して変えません。</p>' +
      '<div id="au-head"></div>' +
      '<div class="nq-row vid-secs" role="tablist" aria-label="自動改善の項目">' + SECTIONS.map(function (s) {
        return '<button type="button" class="nq-chip" data-sec="' + s[0] + '" aria-pressed="false">' + s[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="msg" id="au-msg" style="margin:0 0 12px"></p>' +
      '<div id="au-body"><p class="soc-small">読み込んでいます…</p></div>';
    host.querySelectorAll('[data-sec]').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-sec')); });
    });
  }

  async function load() {
    var r = await api('/api/auto');
    var d = r.data || {};
    if (!d.ok) {
      el('au-body').innerHTML = '<div class="bk-warn"><p>' + esc(d.message || '読み込めませんでした。') + '</p></div>';
      return false;
    }
    S.data = d;
    head();
    return true;
  }

  function head() {
    var d = S.data, s = d.settings;
    var on = Object.keys(d.switches).filter(function (k) { return s[k] && !s.paused; }).map(function (k) { return d.switches[k]; });
    var running = d.experiments.filter(function (e) { return e.phase === 'running' || e.phase === 'watch'; }).length;
    var open = d.proposals.filter(function (p) { return p.status === 'open'; }).length;
    var last = d.last ? '最後に毎朝の処理が動いたのは ' + when(d.last.at) + '。' : 'まだ毎朝の処理は動いていません。';
    var warn = [];
    if (!d.ready.cron) warn.push('CRON_SECRET が未設定のため、毎朝の処理が動きません（「いま1回動かす」は使えます）。');
    if (!d.ready.github) warn.push('GITHUB_TOKEN が未設定のため、勝った案を採用（サイトの文章を書き換え）できません。');
    if (!d.ready.ai) warn.push('AIのキーが未設定のため、下書きは作りません（提案はルールだけで出ます）。');
    el('au-head').innerHTML =
      '<div class="au-head' + (s.paused ? ' au-paused' : '') + '"><div>' +
      (s.paused
        ? '<p><b>すべて止めています。</b>毎朝は数字を読むだけで、実験も自動の変更もしません。実験中の文章も、全員が元の文章に戻っています。</p>'
        : '<p><b>自動でしてよいこと：</b>' + esc(on.length ? on.join('、') : 'なし') + '</p>') +
      '<p class="soc-small">' + esc(last) + ' 実験・見張り ' + running + '件／未対応の提案 ' + open + '件。今月のAIの利用 約' + (d.usage.yen || 0) + '円（上限の目安 ' + d.usage.cap + '円）。</p>' +
      (warn.length ? '<p class="soc-small" style="color:#92400e">' + warn.map(esc).join('<br>') + '</p>' : '') +
      '</div><div class="au-acts">' +
      (s.paused ? '<button type="button" id="au-resume">再開する</button>' : '<button type="button" class="au-stop" id="au-kill">すべて止める</button>') +
      '<button type="button" class="ghost" id="au-run">いま1回動かす</button></div></div>';
    var k = el('au-kill'), rs = el('au-resume'), rn = el('au-run');
    if (k) k.addEventListener('click', function () {
      if (confirm('自動の動きをすべて止めます。実験中の文章も、1分ほどで全員が元の文章に戻ります。採用済みの文章はそのままです（戻すときは「記録」から）。よろしいですか？')) act({ action: 'kill' });
    });
    if (rs) rs.addEventListener('click', function () { act({ action: 'resume' }); });
    rn.addEventListener('click', function () { act({ action: 'run' }, '数字を読み直し、提案を更新しました。'); });
  }

  function go(sec) {
    S.sec = sec;
    try { sessionStorage.setItem('lum_auto_sec', sec); } catch (_) {}
    document.querySelectorAll('#auto-admin [data-sec]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-sec') === sec ? 'true' : 'false');
    });
    if (!S.data) return;
    var body = el('au-body');
    body.innerHTML = ({ props: props, exps: exps, log: logView, trend: trend, settings: settings }[sec] || props)();
    wire(body);
  }

  /* ---- 提案 ---- */
  function evidence(list) {
    return '<ul>' + (list || []).map(function (e) { return '<li>' + esc(e.text) + badge(e.label) + '</li>'; }).join('') + '</ul>';
  }
  function propCard(p) {
    var d = S.data, a = p.action || {};
    var risk = p.risk === '低' ? 'au-tag--ok' : p.risk === '高' ? 'au-tag--ng' : 'au-tag--warn';
    var h = '<div class="au-card"><span class="au-tag">' + esc(d.areas[p.area] || p.area) + '</span><span class="au-tag ' + risk + '">リスク ' + esc(p.risk) + '</span>' +
      (p.status !== 'open' ? '<span class="au-tag">' + esc(STATUS[p.status] || p.status) + '</span>' : '') +
      '<h3>' + esc(p.title) + '</h3>' +
      '<span class="soc-lab" style="margin-top:0">根拠</span>' + evidence(p.evidence) +
      '<span class="soc-lab">期待できること</span><p class="soc-small" style="font-size:12px">' + esc(p.effect) + '</p>';
    if (p.kind === 'experiment' && p.status === 'open') {
      var meta = d.keys[a.key] || {};
      h += '<dl class="au-ab"><dt>対象</dt><dd>' + esc(meta.label || a.key) + '（成果: ' + esc(meta.goal || '') + '）</dd><dt>いまの文章（A）</dt><dd>' + esc(a.a) + '</dd></dl>' +
        '<label class="soc-lab" for="au-b-' + esc(p.id) + '">比べる案（B）' + (p.draft ? (p.draft.by === 'ai' ? '　AIの下書き。直してから始められます' : '') : '　まだ下書きがありません。書いてください') + '</label>' +
        '<textarea id="au-b-' + esc(p.id) + '" rows="2">' + esc(p.draft ? p.draft.text : '') + '</textarea>' +
        (p.draft && p.draft.why ? '<p class="soc-small">ねらい: ' + esc(p.draft.why) + '</p>' : '') +
        '<p class="soc-small">長さは元の±3割まで。金額・連絡先・「必ず」などの言い切りは使えません。</p>';
    } else if (p.draft && p.draft.kind === 'sns') {
      h += '<span class="soc-lab">投稿の下書き（AI）</span><p class="soc-small" style="font-size:12px;white-space:pre-wrap">' + esc(p.draft.text) + '</p>' +
        (p.draft.queued ? '<p class="soc-small">承認待ちに入っています。投稿はしていません。</p>' : '');
    } else if (p.draft && p.draft.kind === 'news') {
      h += '<span class="soc-lab">お知らせの下書き（AI）</span><p class="soc-small" style="font-size:12px;white-space:pre-wrap"><b>' + esc(p.draft.title) + '</b>\n' + esc(p.draft.body) + '</p>' +
        '<p class="soc-small">「お知らせ投稿」に貼り付けて、空欄（ここに◯◯を書く）を埋めてから出してください。</p>';
    } else if (a.type === 'fix' && a.items) {
      h += '<span class="soc-lab">直し方</span><ul>' + a.items.map(function (i) {
        return '<li><b>' + esc(i.problem) + '</b>（' + esc(i.count) + '件）' + (i.fix ? '<br>' + esc(i.fix) : '') + (i.pages && i.pages.length ? '<br><span class="soc-small">' + esc(i.pages.join('、')) + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    if (p.status === 'open') {
      h += '<div class="au-row">';
      if (a.type === 'open') h += '<button type="button" data-tab="' + esc(a.tab) + '">' + esc((TAB_NAMES[a.tab] || '画面') + 'を開く') + '</button><button type="button" class="ghost" data-adopt="' + esc(p.id) + '">済んだ</button>';
      else if (!(p.kind === 'sns' && !p.draft)) h += '<button type="button" data-adopt="' + esc(p.id) + '">' + esc(KIND_BTN[p.kind] || '採用する') + '</button>';
      else h += '<button type="button" class="ghost" data-adopt="' + esc(p.id) + '">済んだ</button>';
      h += '<button type="button" class="ghost" data-dismiss="' + esc(p.id) + '">見送る</button></div>';
    }
    return h + '</div>';
  }
  function props() {
    var list = S.data.proposals;
    var open = list.filter(function (p) { return p.status === 'open'; });
    var rest = list.filter(function (p) { return p.status !== 'open'; });
    return (open.length ? '<div class="au-list">' + open.map(propCard).join('') + '</div>'
      : '<p class="empty">いま出ている提案はありません。数字は毎朝読み直します。</p>') +
      (rest.length ? '<p class="au-more">採用・見送り・実験中（30日は同じ提案を出しません）</p><div class="au-list">' + rest.slice(0, 10).map(propCard).join('') + '</div>' : '');
  }

  /* ---- 実験 ---- */
  function expCard(e) {
    var h = '<div class="au-card"><span class="au-tag' + (e.phase === 'running' || e.phase === 'watch' ? ' au-tag--ok' : '') + '">' + esc(PHASE[e.phase] || e.phase) + '</span>' +
      '<span class="au-tag">' + (e.by === 'auto' ? '自動で開始' : '手で開始') + '</span>' +
      '<h3>' + esc(e.label) + '</h3><p class="soc-small">成果として数えるもの: ' + esc(e.goalLabel || '') + '。始めた日 ' + when(e.startedAt) + '</p>' +
      '<dl class="au-ab"><dt>A（元）</dt><dd>' + esc(e.a) + '</dd><dt>B（案）</dt><dd>' + esc(e.b) + '</dd></dl>';
    var L = e.live || e.result;
    if (L) {
      h += '<div class="au-tbl"><table><thead><tr><th></th><th>見た人</th><th>成果</th><th>率</th><th>ありうる幅（95%）</th></tr></thead><tbody>' +
        abRow('A（元）', L.a) + abRow('B（案）', L.b) +
        '</tbody></table></div><p class="au-verdict">' + esc(L.text) + '</p>' +
        (e.phase !== 'running' ? '' : '<p class="soc-small">' + (L.days != null ? L.days + '日目。' : '') + '人数は「人・日」です（同じ人が2日見れば2人）。各案' + S.data.min.exposures + '人・成果' + S.data.min.conversions + '件・' + S.data.min.days + '日がそろってから、B が良い確率' + Math.round(S.data.min.probability * 100) + '%以上で採用の目安とします。毎日見ているので、ごくまれに偶然の差を勝ちと判断することがあり、そのため採用後' + S.data.min.watchDays + '日間は見張ります。</p>');
    }
    if (e.phase === 'watch' && e.watchLive) {
      var w = e.watchLive;
      h += '<p class="au-verdict">採用後 ' + w.days + '日目／' + S.data.min.watchDays + '日：率 ' + pct(w.w.p) + '（' + w.w.k + '/' + w.w.n + '人）。採用前の元の文章の幅の下限 ' + pct(e.baseline && e.baseline.lo) + ' を下回ったら' + (S.data.settings.autoRevert ? '自動で戻します。' : 'お知らせします（自動で戻すは切れています）。') + '</p>';
    }
    if (e.revertReason) h += '<p class="soc-small" style="color:#b42318">' + esc(e.revertReason) + '</p>';
    h += '<div class="au-row">';
    if (e.phase === 'running') {
      h += '<button type="button" data-exp-adopt="' + esc(e.id) + '"' + (e.live && e.live.verdict === 'b_wins' ? '' : ' class="ghost"') + '>B を採用する</button>' +
        '<button type="button" class="ghost" data-exp-stop="' + esc(e.id) + '">止める（元のまま）</button>' +
        '<button type="button" class="ghost" data-force="B">この端末で B を見る</button><button type="button" class="ghost" data-force="">この端末の表示を戻す</button>';
    }
    if (e.phase === 'watch' || e.phase === 'adopted') h += '<button type="button" class="ghost bk-danger" data-exp-revert="' + esc(e.id) + '">元の文章に戻す</button>';
    return h + '</div></div>';
  }
  function exps() {
    var list = S.data.experiments;
    var now = list.filter(function (e) { return e.phase === 'running' || e.phase === 'watch'; });
    var past = list.filter(function (e) { return !(e.phase === 'running' || e.phase === 'watch'); });
    return (now.length ? '<div class="au-list">' + now.map(expCard).join('') + '</div>'
      : '<p class="empty">いま動いている実験はありません。「提案」の「実験する」から始められます。</p>') +
      (past.length ? '<p class="au-more">これまでの実験</p><div class="au-list">' + past.map(expCard).join('') + '</div>' : '') +
      '<p class="soc-small" style="margin-top:10px">「この端末で B を見る」はこの端末だけの表示の切り替えで、数には入りません。トップページを開き直すと反映されます。</p>';
  }

  /* ---- 記録 ---- */
  function logView() {
    var list = S.data.log;
    if (!list.length) return '<p class="empty">まだ記録はありません。自動でしたこと・手でしたことは、ここに残ります。</p>';
    return '<div class="au-list">' + list.map(function (e) {
      return '<div class="au-card"><span class="au-tag' + (e.by === 'auto' ? ' au-tag--warn' : '') + '">' + (e.by === 'auto' ? '自動' : '手動') + '</span><span class="soc-small">' + when(e.at) + '</span>' +
        (e.undone ? '<span class="au-tag">元に戻し済み</span>' : '') +
        '<h3>' + esc(e.title) + '</h3>' +
        (e.before != null || e.after != null ? '<dl class="au-ab">' + (e.before != null ? '<dt>前</dt><dd>' + esc(e.before) + '</dd>' : '') + (e.after != null ? '<dt>後</dt><dd>' + esc(e.after) + '</dd>' : '') + '</dl>' : '') +
        (e.evidence && e.evidence.length ? '<ul>' + e.evidence.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
        (e.note ? '<p class="soc-small">' + esc(e.note) + '</p>' : '') +
        (e.undo && !e.undone ? '<div class="au-row"><button type="button" class="ghost bk-danger" data-undo="' + esc(e.id) + '">元に戻す</button></div>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  /* ---- 数字の推移（毎朝の1枚を表で） ---- */
  function trend() {
    var snaps = S.data.snapshots;
    if (!snaps.length) return '<p class="empty">まだ記録がありません。毎朝1回、数字を読んで残します（「いま1回動かす」でも残せます）。</p>';
    var g = function (o, path) { return path.split('.').reduce(function (x, k) { return x == null ? null : x[k]; }, o); };
    var cols = [
      ['訪問（30日）', function (s) { return g(s, 'analytics.visits'); }],
      ['問い合わせ画面→送信', function (s) { var f = g(s, 'analytics.form.cur'); return f && f.n ? pct(f.p) + '（' + f.k + '/' + f.n + '）' : '—'; }],
      ['AIから来た訪問', function (s) { return g(s, 'analytics.ai.visits'); }],
      ['SEO 必ず直す', function (s) { return g(s, 'seo.must'); }],
      ['AIで名前が出た率', function (s) { var m = g(s, 'aio.mention'); return m && m.n ? pct(m.p) : '—'; }],
      ['返信の中央値', function (s) { var v = g(s, 'inquiries.median30'); return v == null ? '—' : v + '時間'; }],
      ['無断キャンセル', function (s) { var m = g(s, 'booking.noshow'); return m && m.n ? pct(m.p) : '—'; }],
      ['会員', function (s) { return g(s, 'members.total'); }]
    ];
    return '<div class="au-tbl"><table><thead><tr><th>日付</th>' + cols.map(function (c) { return '<th>' + esc(c[0]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      snaps.map(function (s) {
        return '<tr><td>' + esc(s.date) + '</td>' + cols.map(function (c) { var v = c[1](s); return '<td>' + esc(v == null ? '—' : v) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="soc-small" style="margin-top:8px">— は、その日に読めなかったか、まだ使っていないツールです（0 とは別です）。率の幅と件数の少なさは「提案」の根拠に出しています。</p>';
  }

  /* ---- 設定 ---- */
  var SW_NOTE = {
    drafts: '数字から提案を出し、文章が要るものはAIに下書きを頼みます（AIのキーがあり、月の上限の内のときだけ）。サイトは変わりません。',
    autoStart: '低リスクの文章（見出し・説明・ボタン）だけ、AIの案で実験を始めます。同じページで1つまで。',
    autoAdopt: '各案' + '200人・成果10件・7日以上で、B が良い確率95%以上のとき、B をサイトの文章にします（GitHub に1コミット）。',
    autoRevert: '採用後14日間、成果の率が採用前の元の文章の幅の下を下回ったら、元の文章に戻します。',
    snsToQueue: 'AIが書いたSNSの下書きを「承認待ち」に入れます。投稿は自動ではしません。'
  };
  function settings() {
    var d = S.data, s = d.settings;
    return '<div>' + Object.keys(d.switches).map(function (k) {
      return '<label class="au-sw"><input type="checkbox" data-sw="' + k + '"' + (s[k] ? ' checked' : '') + '><span><b>' + esc(d.switches[k]) + '</b><span class="soc-small">' + esc(SW_NOTE[k] || '') + '</span></span></label>';
    }).join('') +
      '<label class="soc-lab" for="au-yen">AIの月の上限の目安（円）</label><input type="number" id="au-yen" min="0" step="100" value="' + esc(s.monthlyYen) + '"> ' +
      '<span class="soc-small">今月 約' + (d.usage.yen || 0) + '円（' + (d.usage.calls || 0) + '回）。目安を超えた月は、下書きを作りません。</span>' +
      '<div class="au-row" style="margin-top:12px"><button type="button" id="au-save">設定を保存</button></div>' +
      '<p class="soc-small" style="margin-top:10px">料金・法的なページ（プライバシーポリシーなど）・連絡先は、どの設定でも自動では変えません。「すべて止める」は、いつでも上の箱から押せます。</p></div>';
  }

  function wire(body) {
    body.querySelectorAll('[data-adopt]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-adopt');
        var ta = el('au-b-' + id);
        act({ action: 'proposal.adopt', id: id, b: ta ? ta.value : undefined }, '受け付けました。');
      });
    });
    body.querySelectorAll('[data-dismiss]').forEach(function (b) {
      b.addEventListener('click', function () { act({ action: 'proposal.dismiss', id: b.getAttribute('data-dismiss') }, '見送りました。30日は同じ提案を出しません。'); });
    });
    body.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { if (window.lumShowTab) window.lumShowTab(b.getAttribute('data-tab')); });
    });
    body.querySelectorAll('[data-exp-stop]').forEach(function (b) {
      b.addEventListener('click', function () { if (confirm('実験を止めて、全員に元の文章（A）を出します。よろしいですか？')) act({ action: 'exp.stop', id: b.getAttribute('data-exp-stop') }); });
    });
    body.querySelectorAll('[data-exp-adopt]').forEach(function (b) {
      b.addEventListener('click', function () {
        var e = S.data.experiments.filter(function (x) { return x.id === b.getAttribute('data-exp-adopt'); })[0];
        var sure = e && e.live && e.live.verdict === 'b_wins' ? 'B をサイトの文章にします。' : 'まだ B が良いとは言えません（' + (e && e.live ? e.live.text : '') + '）。それでも B を採用しますか？';
        if (confirm(sure + ' 採用後14日間は見張ります。')) act({ action: 'exp.adopt', id: b.getAttribute('data-exp-adopt') }, '採用しました。サイトへの反映は約1〜2分後です。');
      });
    });
    body.querySelectorAll('[data-exp-revert]').forEach(function (b) {
      b.addEventListener('click', function () { if (confirm('元の文章（A）に戻します。よろしいですか？')) act({ action: 'exp.revert', id: b.getAttribute('data-exp-revert') }); });
    });
    body.querySelectorAll('[data-undo]').forEach(function (b) {
      b.addEventListener('click', function () { if (confirm('この記録の変更を元に戻します。よろしいですか？')) act({ action: 'log.undo', id: b.getAttribute('data-undo') }, '元に戻しました。'); });
    });
    body.querySelectorAll('[data-force]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-force');
        try { if (v) localStorage.setItem('lum_exp_force', v); else localStorage.removeItem('lum_exp_force'); } catch (_) {}
        say(v ? 'この端末では B を表示します（数には入りません）。トップページを開き直してください。' : 'この端末の表示を、ふだんの振り分けに戻しました。', true);
      });
    });
    var save = el('au-save');
    if (save) save.addEventListener('click', function () {
      var next = {};
      body.querySelectorAll('[data-sw]').forEach(function (c) { next[c.getAttribute('data-sw')] = c.checked; });
      next.monthlyYen = el('au-yen').value;
      if ((next.autoAdopt || next.autoStart) && !S.data.settings.autoAdopt && !S.data.settings.autoStart &&
        !confirm('自動で実験・採用を入れると、サイトの文章が人の手を通らずに変わることがあります（どれも記録に残り、元に戻せます）。よろしいですか？')) return;
      act({ action: 'settings.save', settings: next }, '設定を保存しました。');
    });
  }

  /* ---------------- 開始 ---------------- */

  window.lumAutoInit = async function () {
    if (S.started) return;
    S.started = true;
    shell();
    try { S.sec = sessionStorage.getItem('lum_auto_sec') || 'props'; } catch (_) {}
    if (!SECTIONS.some(function (s) { return s[0] === S.sec; })) S.sec = 'props';
    if (await load()) go(S.sec);
    else document.querySelectorAll('#auto-admin [data-sec]').forEach(function (b) { b.disabled = true; });
    if (demo()) { say('デモ表示：架空の会社の提案・実験・記録です。保存・変更は行われません。', true); return; }
    // 下書きが無い提案があれば、開いたときに1回だけ頼みます（毎朝の時間が足りなかった日のため）。
    var d = S.data;
    if (d && !S.drafted && d.settings.drafts && !d.settings.paused && d.ready.ai &&
      d.proposals.some(function (p) { return p.status === 'open' && !p.draft && (p.kind === 'experiment' || p.kind === 'sns' || p.kind === 'news'); })) {
      S.drafted = true;
      say('提案の下書きをAIに頼んでいます…', true);
      var r = await post({ action: 'drafts' });
      if (r.data && r.data.ok && r.data.count) { await load(); go(S.sec); }
      say((r.data && r.data.message) || '', true);
    }
  };
})();
