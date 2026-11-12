/* ---- お客様マップ（お客様対応を、表ではなく地図で見渡して動かす） ----
 *
 * 問い合わせと見積書を、1枚の地図の上の「エリア」に置いたコマとして見せます。
 *   A 新しい相談（問い合わせ: 未対応） → B 対応中 → C 見積中（見積書: 下書き・送付済み） → D 受注
 *   下の段: 完了（問い合わせ: 完了・直近30日）／ 失注（直近60日）
 * コマをドラッグして別のエリアに置くと、その状態に変わります（問い合わせは /api/inquiries の PATCH、
 * 見積書は /api/quotes の status）。相談のコマを「見積中」に置くと、その問い合わせから見積書の
 * 下書きを作る画面を開きます。動かしたあとは「元に戻す」で戻せます。
 * 指で触る端末では、ドラッグの代わりに、コマを押して出る欄の「移動先」で動かします
 * （画面を送る指の動きと取り違えないため）。キーボードでも同じ欄で動かせます。
 *
 * 上の見張り台に全体の数、横の「次の一手」に、いま動かすべきコマ（返信の期限を過ぎた相談、
 * 送ってから返事のない見積書など）を出します。押すとそのコマが光ります。 */
(function () {
  'use strict';
  if (window.lumCustMapInit) return;

  var TAB = 'custmap-admin';
  var H = 3600000, DAY = 86400000;
  var el = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function yen(v) { return '¥' + Math.round(Number(v) || 0).toLocaleString('ja-JP'); }
  function ago(iso) {
    var t = Date.parse(iso || ''); if (!t) return '';
    var h = (Date.now() - t) / H;
    return h < 1 ? 'いま' : h < 24 ? Math.floor(h) + '時間前' : Math.floor(h / 24) + '日前';
  }

  /* エリア。kind: どちらのコマを置けるか（inq: 問い合わせ / quote: 見積書） */
  var ZONES = [
    { id: 'new', code: 'A', label: '新しい相談', kind: 'inq', status: 'new', tone: '#c23b42', hint: 'まず返信する' },
    { id: 'doing', code: 'B', label: '対応中', kind: 'inq', status: 'doing', tone: '#2563eb', hint: 'やり取りを進める' },
    { id: 'quote', code: 'C', label: '見積中', kind: 'quote', status: 'sent', tone: '#ca8a04', hint: '返事を待つ・後押し' },
    { id: 'won', code: 'D', label: '受注', kind: 'quote', status: 'won', tone: '#16a34a', hint: '請求書へ' },
    { id: 'done', code: 'E', label: '完了（30日）', kind: 'inq', status: 'done', tone: '#64748b', hint: '', small: true },
    { id: 'lost', code: 'F', label: '失注（60日）', kind: 'quote', status: 'lost', tone: '#94a3b8', hint: '', small: true }
  ];
  var ZONE = {}; ZONES.forEach(function (z) { ZONE[z.id] = z; });

  var S = { started: false, tokens: [], settingsHours: 48, sel: '', undo: null, glow: '' };

  async function api(url, opt) {
    try { var r = await window.lumAdmin.fetch(url, opt); return r && r.data ? r.data : null; } catch (_) { return null; }
  }

  /* ---- 読み込み ---- */
  async function load() {
    var host = el(TAB);
    if (!S.tokens.length) host.querySelector('.cm-body').innerHTML = '<p class="soc-small">地図を広げています…</p>';
    var r = await Promise.all([
      api('/api/inquiries?status=new'), api('/api/inquiries?status=doing'), api('/api/inquiries?status=done'), api('/api/quotes')
    ]);
    var inq = [].concat((r[0] && r[0].items) || [], (r[1] && r[1].items) || [], (r[2] && r[2].items) || []);
    var quotes = ((r[3] && r[3].list) || []).filter(function (q) { return (q.kind || 'quote') === 'quote'; });
    if (!r[0] && !r[3]) { host.querySelector('.cm-body').innerHTML = '<p class="soc-small">問い合わせと見積書を読めませんでした。保存先（Upstash Redis）の設定を「設定状況」で確かめてください。</p>'; return; }
    var now = Date.now(), quoted = {};
    var toks = [];
    quotes.forEach(function (q) {
      var st = q.status === 'expired' ? 'sent' : q.status;
      var zone = st === 'won' ? 'won' : st === 'lost' ? 'lost' : 'quote';
      var dt = Date.parse(q.decidedAt || q.date || q.createdAt || '') || now;
      if (zone === 'won' && now - dt > 120 * DAY) return;
      if (zone === 'lost' && now - dt > 60 * DAY) return;
      if (q.inquiryId) quoted[q.inquiryId] = true;
      toks.push({ key: 'q:' + q.id, type: 'quote', id: q.id, zone: zone, status: q.status, name: q.to || '（宛先なし）', sub: q.subject || '', amount: q.total,
        at: q.sentAt || q.date || q.createdAt, sentAt: q.sentAt, openedAt: q.openedAt, inquiryId: q.inquiryId, number: q.number, validUntil: q.validUntil });
    });
    inq.forEach(function (x) {
      if (x.spam || quoted[x.id]) return;
      if (x.status === 'done' && now - (Date.parse(x.receivedAt) || now) > 30 * DAY) return;
      toks.push({ key: 'i:' + x.id, type: 'inq', id: x.id, zone: x.status, status: x.status, name: [x.company, x.name].filter(Boolean).join(' ') || '（名前なし）',
        sub: (x.topics || []).join('・'), snippet: x.snippet, at: x.receivedAt, overdue: !!x.overdue, ageH: x.ageH, replied: !!x.repliedAt, read: !!x.readAt, estimate: x.estimate });
    });
    S.tokens = toks;
    paint();
  }

  /* ---- 次の一手（いま動かすべきコマ） ---- */
  function nextMoves() {
    var out = [];
    S.tokens.forEach(function (t) {
      if (t.type === 'inq' && t.zone === 'new' && t.overdue) out.push({ t: t, w: 100 + (t.ageH || 0), text: '返信の期限を過ぎています。まず返信を', go: 'reply' });
      else if (t.type === 'inq' && t.zone === 'new' && !t.read) out.push({ t: t, w: 60, text: 'まだ読んでいない相談です', go: 'reply' });
      else if (t.type === 'inq' && t.zone === 'doing' && t.estimate) out.push({ t: t, w: 40, text: '概算を見ています。見積書にしましょう（「見積中」へ運ぶ）', go: 'quote' });
      else if (t.type === 'quote' && t.zone === 'quote' && t.sentAt && Date.now() - Date.parse(t.sentAt) > 7 * DAY) out.push({ t: t, w: 50, text: (t.openedAt ? '開いたまま' : '送ってから') + '1週間、返事がありません。ひと声かけましょう', go: 'open' });
      else if (t.type === 'quote' && t.zone === 'quote' && t.status === 'draft') out.push({ t: t, w: 30, text: '下書きのままです。送れば「見積中」が動きます', go: 'open' });
    });
    return out.sort(function (a, b) { return b.w - a.w; }).slice(0, 4);
  }

  /* ---- 描画 ---- */
  function tokenHtml(t) {
    var z = ZONE[t.zone];
    var warn = t.type === 'inq' ? (t.overdue ? 'hot' : t.zone === 'new' && (t.ageH || 0) > 24 ? 'warm' : '')
      : (t.status === 'draft' ? 'draft' : t.zone === 'quote' && t.sentAt && Date.now() - Date.parse(t.sentAt) > 7 * DAY ? 'warm' : '');
    var initial = String(t.name).replace(/^(株式会社|有限会社|合同会社)\s*/, '').charAt(0) || '?';
    var sub = t.type === 'quote' ? yen(t.amount) + (t.status === 'draft' ? '・下書き' : t.openedAt && t.zone === 'quote' ? '・開封済み' : '') : (ago(t.at) + (t.sub ? '・' + t.sub : ''));
    return '<button type="button" class="cm-tok ' + warn + (S.glow === t.key ? ' glow' : '') + (S.sel === t.key ? ' sel' : '') + '" data-key="' + esc(t.key) + '" style="--z:' + z.tone + '"' +
      ' aria-label="' + esc(t.name + '（' + z.label + '）' + (t.type === 'quote' ? ' ' + yen(t.amount) : '') + (warn === 'hot' ? '・返信の期限を過ぎています' : '') + '。押すと詳しく見られ、移動先を選べます') + '">' +
      '<span class="cm-av" aria-hidden="true">' + esc(initial) + '</span>' +
      '<span class="cm-tx"><b>' + esc(t.name) + '</b><small>' + esc(sub) + '</small></span>' +
      (warn === 'hot' ? '<span class="cm-flag" aria-hidden="true">!</span>' : '') + '</button>';
  }

  function paint() {
    var host = el(TAB);
    var body = host.querySelector('.cm-body');
    var by = {}; ZONES.forEach(function (z) { by[z.id] = []; });
    S.tokens.forEach(function (t) { (by[t.zone] || (by[t.zone] = [])).push(t); });
    var sum = function (id) { return by[id].reduce(function (a, t) { return a + (Number(t.amount) || 0); }, 0); };
    var hot = by.new.filter(function (t) { return t.overdue; }).length;
    var month = new Date(Date.now() + 9 * H).toISOString().slice(0, 7);
    var wonMonth = by.won.filter(function (t) { return String(t.at || '').slice(0, 7) === month || true; });
    var moves = nextMoves();
    body.innerHTML =
      '<div class="cm-top">' +
        '<div class="cm-hud" role="group" aria-label="全体の数">' +
          '<div><small>新しい相談</small><b>' + by.new.length + '</b>' + (hot ? '<em class="hot">期限超え ' + hot + '</em>' : '') + '</div>' +
          '<div><small>対応中</small><b>' + by.doing.length + '</b></div>' +
          '<div><small>見積中</small><b>' + by.quote.length + '</b><em>' + yen(sum('quote')) + '</em></div>' +
          '<div><small>受注（120日）</small><b>' + by.won.length + '</b><em>' + yen(sum('won')) + '</em></div>' +
        '</div>' +
        '<p class="cm-how">コマを<b>ドラッグして別のエリアに置く</b>と、状態が変わります（指で触る画面では、コマを押して「移動先」を選びます）。相談を「見積中」に運ぶと、見積書の下書きを作ります。</p>' +
      '</div>' +
      '<div class="cm-wrap">' +
        '<div class="cm-map" role="application" aria-label="お客様マップ">' +
          '<div class="cm-flow" aria-hidden="true"><span>A</span><i></i><span>B</span><i></i><span>C</span><i></i><span>D</span></div>' +
          '<div class="cm-zones">' + ZONES.map(function (z) {
            var list = by[z.id] || [];
            var money = z.kind === 'quote' && list.length ? '・' + yen(sum(z.id)) : '';
            return '<section class="cm-zone' + (z.small ? ' small' : '') + '" data-zone="' + z.id + '" style="--z:' + z.tone + '" role="region" aria-label="' + esc(z.code + 'エリア ' + z.label + ' ' + list.length + '件') + '">' +
              '<header><span class="cm-code">' + z.code + '</span><b>' + esc(z.label) + '</b><small>' + list.length + '件' + esc(money) + '</small>' + (z.hint ? '<em>' + esc(z.hint) + '</em>' : '') + '</header>' +
              '<div class="cm-floor">' + (list.length ? list.map(tokenHtml).join('') : '<p class="cm-empty">ここに置けます</p>') + '</div></section>';
          }).join('') + '</div>' +
        '</div>' +
        '<aside class="cm-side">' +
          '<div class="cm-panel" id="cm-detail">' + detailHtml() + '</div>' +
          '<div class="cm-panel"><h3>次の一手</h3>' + (moves.length ? '<ol class="cm-moves">' + moves.map(function (m) {
            return '<li><button type="button" class="cm-move" data-glow="' + esc(m.t.key) + '"><b>' + esc(m.t.name) + '</b><span>' + esc(m.text) + '</span></button></li>';
          }).join('') + '</ol>' : '<p class="soc-small">いま急いで動かすコマはありません。</p>') + '</div>' +
          '<div class="cm-legend" aria-hidden="true"><span><i class="lg hot"></i>返信の期限超え</span><span><i class="lg warm"></i>急ぎめ・返事待ち1週間</span><span><i class="lg draft"></i>見積の下書き</span></div>' +
        '</aside>' +
      '</div>' +
      '<div class="cm-toast" id="cm-toast" role="status" aria-live="polite" hidden></div>';
    bind(body);
    void wonMonth;
  }

  function tok(key) { return S.tokens.filter(function (t) { return t.key === key; })[0]; }
  function allowed(t) { return ZONES.filter(function (z) { return z.id !== t.zone && (z.kind === t.type || (t.type === 'inq' && z.id === 'quote')); }); }

  function detailHtml() {
    var t = S.sel && tok(S.sel);
    if (!t) return '<h3>コマを選ぶと、ここに出ます</h3><p class="soc-small">お客様のコマを押すと、中身と、動かす先が出ます。</p>';
    var z = ZONE[t.zone];
    return '<h3>' + esc(t.name) + '</h3>' +
      '<p class="cm-st" style="--z:' + z.tone + '"><span class="cm-code">' + z.code + '</span>' + esc(z.label) + '</p>' +
      '<dl class="cm-dl">' +
        (t.type === 'quote'
          ? '<dt>見積書</dt><dd>' + esc((t.number ? t.number + ' ' : '') + (t.sub || '')) + '</dd><dt>金額</dt><dd>' + yen(t.amount) + '</dd>' +
            (t.sentAt ? '<dt>送った日</dt><dd>' + esc(String(t.sentAt).slice(0, 10)) + (t.openedAt ? '（開封済み）' : '') + '</dd>' : '') +
            (t.validUntil ? '<dt>有効期限</dt><dd>' + esc(t.validUntil) + '</dd>' : '')
          : '<dt>届いた</dt><dd>' + esc(ago(t.at)) + (t.overdue ? '（返信の期限を過ぎています）' : '') + '</dd>' + (t.sub ? '<dt>ご相談</dt><dd>' + esc(t.sub) + '</dd>' : '') +
            (t.snippet ? '<dt>本文</dt><dd>' + esc(t.snippet) + '</dd>' : '')) +
      '</dl>' +
      '<label class="cm-lab">移動先<select id="cm-to"><option value="">選ぶ</option>' + allowed(t).map(function (o) {
        return '<option value="' + o.id + '">' + o.code + ' ' + esc(o.label) + (t.type === 'inq' && o.id === 'quote' ? '（見積書を作る）' : '') + '</option>';
      }).join('') + '</select></label>' +
      '<div class="cm-acts"><button type="button" id="cm-go-move" class="cm-b pri">動かす</button><button type="button" id="cm-open" class="cm-b">' + (t.type === 'quote' ? '見積書を開く' : '問い合わせを開く') + '</button></div>';
  }

  /* ---- 動かす ---- */
  function toast(text, undo) {
    var b = el('cm-toast'); if (!b) return;
    b.innerHTML = esc(text) + (undo ? ' <button type="button" id="cm-undo">元に戻す</button>' : '');
    b.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { b.hidden = true; }, 7000);
    var u = el('cm-undo');
    if (u) u.addEventListener('click', function () { b.hidden = true; if (undo) undo(); });
  }
  async function move(t, toId, isUndo) {
    var to = ZONE[toId], from = t.zone;
    if (!to || toId === from) return;
    if (t.type === 'inq' && toId === 'quote') {
      if (!confirm(t.name + ' さんの問い合わせから、見積書の下書きを作ります。見積書の画面に移りますか？')) return;
      if (window.lumQuoteFromInquiry) window.lumQuoteFromInquiry(t.id);
      return;
    }
    if ((to.kind === 'quote') !== (t.type === 'quote')) {
      toast(t.type === 'quote' ? '見積書は、見積中・受注・失注の間で動かせます。' : '問い合わせは、受注・失注には直接置けません。先に「見積中」へ運んで見積書にしてください。');
      return;
    }
    var old = t.zone, oldStatus = t.status;
    t.zone = toId; t.status = to.status; S.sel = t.key;
    paint();
    var r = t.type === 'inq'
      ? await api('/api/inquiries', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, status: to.status }) })
      : await api('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', id: t.id, status: to.status }) });
    // デモでは保存されません。地図の上の動きだけは試せるように、コマはそのままにします。
    if (r && r.demo) { toast(isUndo ? '元に戻しました（デモのため保存はしません）。' : t.name + ' を「' + to.label + '」に動かしました（デモのため保存はしません）。', isUndo ? null : function () { move(t, old, true); }); return; }
    if (!r || r.ok === false) {
      t.zone = old; t.status = oldStatus; paint();
      toast((r && r.message) || '動かせませんでした。もう一度試してください。');
      return;
    }
    if (window.lumInqBadge && t.type === 'inq') try { window.lumInqBadge(); } catch (_) {}
    toast(isUndo ? '元に戻しました。' : t.name + ' を「' + to.label + '」に動かしました。', isUndo ? null : function () { move(t, old, true); });
  }

  /* ドラッグ（マウス・ペン）。指は画面を送る動きと取り違えるので、押して出る欄で動かします。 */
  function bind(body) {
    body.querySelectorAll('.cm-tok').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.dragged) { delete b.dataset.dragged; return; }
        S.sel = b.getAttribute('data-key'); S.glow = '';
        paint();
        var d = el('cm-detail'); if (d && window.innerWidth < 1100) d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      b.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch' || e.button !== 0) return;
        var t = tok(b.getAttribute('data-key')); if (!t) return;
        var sx = e.clientX, sy = e.clientY, ghost = null, over = null;
        var onMove = function (ev) {
          if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          if (!ghost) {
            ghost = b.cloneNode(true); ghost.classList.add('cm-ghost'); document.body.appendChild(ghost);
            b.classList.add('lifting');
            body.querySelectorAll('.cm-zone').forEach(function (z) {
              var ok = allowed(t).some(function (a) { return a.id === z.getAttribute('data-zone'); });
              z.classList.add(ok ? 'can' : 'cannot');
            });
          }
          ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
          var under = document.elementFromPoint(ev.clientX, ev.clientY);
          var z = under && under.closest ? under.closest('.cm-zone') : null;
          if (over && over !== z) over.classList.remove('over');
          over = z; if (z) z.classList.add('over');
        };
        var onUp = function () {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          if (!ghost) return;
          b.dataset.dragged = '1';
          ghost.remove(); b.classList.remove('lifting');
          body.querySelectorAll('.cm-zone').forEach(function (z) { z.classList.remove('can', 'cannot', 'over'); });
          if (over) move(t, over.getAttribute('data-zone'));
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    });
    body.querySelectorAll('[data-glow]').forEach(function (b) {
      b.addEventListener('click', function () {
        S.glow = b.getAttribute('data-glow'); S.sel = S.glow; paint();
        var x = body.querySelector('.cm-tok[data-key="' + S.glow.replace(/"/g, '') + '"]');
        if (x) { x.scrollIntoView({ behavior: 'smooth', block: 'center' }); x.focus({ preventScroll: true }); }
      });
    });
    var go = el('cm-go-move');
    if (go) go.addEventListener('click', function () { var t = tok(S.sel), v = el('cm-to').value; if (t && v) move(t, v); else if (t) toast('移動先を選んでください。'); });
    var op = el('cm-open');
    if (op) op.addEventListener('click', function () {
      var t = tok(S.sel); if (!t) return;
      if (t.type === 'quote') { if (window.lumQuoteOpen) window.lumQuoteOpen(t.id); }
      else if (window.lumInqOpen) window.lumInqOpen(t.id);
    });
  }

  var CSS =
    '#custmap-admin .cm-top{display:grid;gap:10px;margin-bottom:12px}' +
    '.cm-hud{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}' +
    '.cm-hud>div{background:#fff;border:1px solid var(--ui-border);border-radius:14px;padding:10px 14px;display:grid;gap:2px}' +
    '.cm-hud small{font-size:12px;color:#5f5f69;font-weight:700}.cm-hud b{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}' +
    '.cm-hud em{font-style:normal;font-size:12.5px;font-weight:700;color:#5f5f69}.cm-hud em.hot{color:#b4232a}' +
    '.cm-how{font-size:13px;color:#4a4a54;margin:0;line-height:1.8}' +
    '.cm-wrap{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;align-items:start}' +
    '.cm-map{position:relative;border-radius:20px;padding:14px;background:#eef0ea;background-image:linear-gradient(rgba(23,23,28,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(23,23,28,.045) 1px,transparent 1px);background-size:24px 24px;border:1px solid var(--ui-border)}' +
    '.cm-flow{display:flex;align-items:center;gap:6px;margin:0 2px 10px;font-weight:800;font-size:12px;color:#5f5f69}.cm-flow span{width:22px;height:22px;border-radius:6px;background:#fff;border:1px solid var(--ui-border);display:grid;place-items:center}.cm-flow i{flex:1;height:2px;background:repeating-linear-gradient(90deg,#b9b6ae 0 6px,transparent 6px 11px)}' +
    '.cm-zones{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}' +
    '.cm-zone{position:relative;background:rgba(255,255,255,.82);border:2px dashed color-mix(in srgb,var(--z) 45%,#fff);border-radius:16px;padding:10px;min-height:220px;transition:background .15s,border-color .15s,transform .15s}' +
    '.cm-zone.small{grid-column:span 2;min-height:96px}' +
    '.cm-zone header{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-bottom:8px}.cm-zone header b{font-size:14px}.cm-zone header small{font-size:12px;color:#5f5f69;font-weight:700}.cm-zone header em{flex-basis:100%;font-style:normal;font-size:12px;color:#5f5f69}' +
    '.cm-code{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--z);color:#fff;font-weight:800;font-size:13px}' +
    '.cm-floor{display:flex;flex-direction:column;gap:7px}.cm-zone.small .cm-floor{flex-direction:row;flex-wrap:wrap}' +
    '.cm-empty{font-size:12px;color:#8a8a93;margin:6px 2px}' +
    '.cm-zone.can{border-style:solid;background:color-mix(in srgb,var(--z) 6%,#fff)}.cm-zone.cannot{opacity:.45}.cm-zone.over{background:color-mix(in srgb,var(--z) 14%,#fff);transform:scale(1.01);border-color:var(--z)}' +
    '.cm-tok{position:relative;display:flex;align-items:center;gap:8px;width:100%;min-height:48px;padding:6px 10px 6px 6px;border:1px solid var(--ui-border);border-left:4px solid var(--z);border-radius:12px;background:#fff;text-align:left;font:inherit;cursor:grab;box-shadow:0 6px 14px -12px rgba(23,23,28,.6);touch-action:auto}' +
    '.cm-zone.small .cm-tok{width:auto;max-width:220px}' +
    '.cm-tok:hover{border-color:var(--z)}.cm-tok.sel{outline:3px solid var(--z);outline-offset:1px}.cm-tok.lifting{opacity:.35}' +
    '.cm-tok.hot{border-color:#e8a1a4;background:#fff6f6}.cm-tok.warm{background:#fffaf0}.cm-tok.draft{border-style:dashed}' +
    '.cm-tok.glow{animation:cmGlow 1.2s ease-in-out 3}@keyframes cmGlow{50%{box-shadow:0 0 0 6px color-mix(in srgb,var(--z) 35%,transparent)}}' +
    '.cm-av{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--z) 14%,#fff);color:var(--z);font-weight:800;font-size:15px}' +
    '.cm-tx{min-width:0;display:grid}.cm-tx b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cm-tx small{font-size:12px;color:#5f5f69;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.cm-flag{position:absolute;right:-6px;top:-6px;width:20px;height:20px;border-radius:50%;background:#c23b42;color:#fff;font-weight:800;font-size:12px;display:grid;place-items:center;box-shadow:0 0 0 2px #fff}' +
    '.cm-ghost{position:fixed;z-index:5000;pointer-events:none;width:220px;transform:translate(-50%,-50%) rotate(-3deg);box-shadow:0 18px 30px -12px rgba(23,23,28,.5);cursor:grabbing}' +
    '.cm-side{display:grid;gap:12px}.cm-panel{background:#fff;border:1px solid var(--ui-border);border-radius:16px;padding:14px 16px}.cm-panel h3{font-size:15px;font-weight:800;margin:0 0 6px}' +
    '.cm-st{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;margin:0 0 8px}' +
    '.cm-dl{display:grid;grid-template-columns:5.5em minmax(0,1fr);gap:4px 8px;font-size:13px;margin:0 0 10px}.cm-dl dt{color:#5f5f69;font-weight:700}.cm-dl dd{margin:0;overflow-wrap:anywhere}' +
    '.cm-lab{display:grid;gap:4px;font-size:12.5px;font-weight:700;color:#4a4a54}.cm-lab select{min-height:40px;border-radius:10px;border:1px solid var(--ui-border);padding:0 8px;font:inherit}' +
    '.cm-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.cm-b{min-height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.cm-b.pri{background:var(--ui-accent);border-color:var(--ui-accent);color:#fff}' +
    '.cm-moves{list-style:none;margin:0;padding:0;display:grid;gap:6px}.cm-move{display:grid;gap:2px;width:100%;text-align:left;padding:8px 10px;border-radius:10px;border:1px solid var(--ui-border);background:#fbfaf8;font:inherit;cursor:pointer}.cm-move b{font-size:13px}.cm-move span{font-size:12px;color:#4a4a54}.cm-move:hover{border-color:var(--ui-accent)}' +
    '.cm-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;color:#5f5f69}.cm-legend .lg{display:inline-block;width:12px;height:12px;border-radius:4px;margin-right:4px;vertical-align:-1px;border:1px solid #d6d3cc}.lg.hot{background:#fff6f6;border-color:#e8a1a4}.lg.warm{background:#fffaf0}.lg.draft{border-style:dashed}' +
    '.cm-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:4500;background:#17171c;color:#fff;border-radius:999px;padding:10px 16px;font-size:13.5px;box-shadow:0 14px 30px -12px rgba(0,0,0,.5);max-width:calc(100vw - 32px)}.cm-toast button{margin-left:8px;background:none;border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:999px;padding:4px 12px;font:inherit;font-weight:700;cursor:pointer}' +
    /* 管理画面のボタン共通の文字色（白など）を上書き。名前が見えなくなっていました */
    '#shell .cm-tok,#shell .cm-move{color:#1f2937!important}#shell .cm-tok .cm-tx b,#shell .cm-move b{color:#17171c!important}#shell .cm-tok .cm-tx small,#shell .cm-move span{color:#4a4a54!important}#shell .cm-tok .cm-av{color:var(--z)!important}#shell .cm-flag{color:#fff!important}#shell .cm-b{color:#1f2937!important}#shell .cm-b.pri{color:#fff!important}' +
    '@media (max-width:1100px){.cm-wrap{grid-template-columns:1fr}}' +
    '@media (max-width:760px){.cm-hud{grid-template-columns:repeat(2,minmax(0,1fr))}.cm-zones{grid-template-columns:1fr 1fr}.cm-zone{min-height:140px}.cm-flow{display:none}}' +
    '@media (max-width:480px){.cm-zones{grid-template-columns:1fr}.cm-zone.small{grid-column:auto}}';

  window.lumCustMapInit = function () {
    var host = el(TAB);
    if (!host) return;
    if (!S.started) {
      S.started = true;
      var st = document.createElement('style'); st.id = 'cm-css'; st.textContent = CSS; document.head.appendChild(st);
      host.innerHTML = '<div class="cm-body"></div>';
    }
    load();
  };
  /* 開くたびに読み直します（ほかの画面で返信・見積を進めたあと、地図が古いままにならないように）。 */
  window.lumCustMapShow = function () { if (S.started) load(); };
})();
