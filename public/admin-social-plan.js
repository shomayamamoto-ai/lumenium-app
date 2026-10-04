/* ---- SNS（文章）の「運用プラン」 ----
   何を・どのくらいの間隔で出すかを決めて、守れているかを見る画面。
   SNS（文章）タブの中に「投稿する／運用プラン」の切り替えとして出ます。

   SNS（文章）の本体（admin-members.html）には手を入れず、決まった id の要素
   （#social-plan-root・投稿欄の #social-tpl・#social-text・#social-nets など）に
   あとから部品を足すだけにしています。本体を直している人と、ぶつからないためです。

   数え方（柱の割合・週の区切り・LINE の通数・振り返り）は /social-plan-core.js
   にあり、サーバーも同じものを使います。目安はどれも一般的な調査から取った
   「目安」で、件数が少ないうちは「判断できません」「参考程度」と出します。 */
(function () {
  'use strict';
  var C = null;
  var D = null;
  var S = { view: 'compose', pillar: '', loading: false, stale: true, editing: false, draft: null, msg: '' };
  var el = function (id) { return document.getElementById(id); };

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(v) { return Math.round((Number(v) || 0) * 100) + '%'; }
  function demo() { try { return sessionStorage.getItem('lum_demo') === '1'; } catch (_) { return false; } }
  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (_) {}
    return null;
  }
  async function api(url, opts) {
    try { return await window.lumAdmin.fetch(url, opts); }
    catch (_) { return { res: { ok: false, status: 0 }, data: { ok: false, message: '通信できませんでした。ネットの接続を確かめて、もう一度お試しください。' } }; }
  }
  function put(body) {
    return api('/api/social-plan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  function say(t, ok) {
    var m = el('spl-msg');
    if (!m) return;
    m.textContent = t || '';
    m.classList.toggle('show', !!t);
    m.classList.toggle('info', !!ok);
  }
  function netLabel(id) {
    var n = D && (D.networks || []).filter(function (x) { return x.id === id; })[0];
    return n ? n.label : (C && C.NET_LABELS[id]) || id;
  }
  function pillars() { return (D && D.plan && D.plan.pillars) || []; }
  function pillarById(id) { return pillars().filter(function (p) { return p.id === id; })[0] || null; }
  function chip(p) {
    if (!p) return '<span class="spl-chip none">柱なし</span>';
    return '<span class="spl-chip" style="background:' + p.color + '1f;color:' + p.color + ';border-color:' + p.color + '55">' +
      '<i style="background:' + p.color + '"></i>' + esc(p.name) + (p.promo ? '（宣伝）' : '') + '</span>';
  }
  function band(r) {
    return r && r.label ? ' <span class="spl-band ' + r.level + '">' + esc(r.label) + '</span>' : '';
  }

  /* ---- 見た目（このファイルの部品だけ。動きは付けません） ---- */
  var CSS =
    '.spl-tabs{display:flex;gap:0;margin:2px 0 14px;border:1px solid var(--border);border-radius:10px;overflow:hidden;width:max-content;max-width:100%}' +
    '.spl-tabs button{background:#fff;color:var(--text);border:0;border-radius:0;font-size:12.5px;padding:8px 16px;font-weight:700;box-shadow:none}' +
    '.spl-tabs button[aria-pressed="true"]{background:#0f766e;color:#fff}' +
    '.spl-sec{background:#fff;border:1px solid var(--border);border-radius:12px;padding:13px 15px;margin-bottom:14px}' +
    '.spl-sec>h3{font-size:14px;font-weight:800;margin:0 0 3px}' +
    '.spl-sec>.lead{font-size:11.5px;color:var(--sub);line-height:1.75;margin:0 0 9px}' +
    '.spl-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;border:1px solid var(--border);margin:1px 3px 1px 0;white-space:nowrap}' +
    '.spl-chip i{display:inline-block;width:8px;height:8px;border-radius:50%}' +
    '.spl-chip.none{background:#f3f1ec;color:var(--sub)}' +
    '.spl-band{display:inline-block;font-size:10px;font-weight:700;padding:0 7px;border-radius:999px;margin-left:4px;vertical-align:1px}' +
    '.spl-band.none{background:#e7e4dc;color:var(--sub)}.spl-band.low{background:rgba(251,191,36,.22);color:#92400e}' +
    '.spl-meyasu{display:inline-block;font-size:10px;font-weight:700;padding:0 6px;border-radius:999px;background:rgba(99,102,241,.12);color:#3730a3;margin-left:3px;vertical-align:1px}' +
    '.spl-bar{display:flex;height:14px;border-radius:7px;overflow:hidden;background:#eeeae2;margin:6px 0 4px}' +
    '.spl-bar span{display:block;height:100%}' +
    '.spl-meter{position:relative;height:10px;border-radius:5px;background:#eeeae2;margin:4px 0}' +
    '.spl-meter b{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:#0f766e}' +
    '.spl-meter b.over{background:#b42318}.spl-meter em{position:absolute;top:-3px;bottom:-3px;width:2px;background:#17171c}' +
    '.spl-warn{background:rgba(251,191,36,.14);border:1px solid rgba(217,119,6,.35);border-radius:9px;padding:7px 11px;font-size:12px;line-height:1.75;margin:6px 0;color:#7c2d12}' +
    '.spl-good{background:rgba(16,185,129,.09);border:1px solid rgba(4,120,87,.25);border-radius:9px;padding:7px 11px;font-size:12px;line-height:1.75;margin:6px 0;color:#065f46}' +
    '.spl-note{font-size:11px;color:var(--sub);line-height:1.7;margin-top:6px}' +
    '.spl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}' +
    '.spl-card{border:1px solid var(--border);border-radius:10px;padding:9px 11px;background:#fbfaf7;font-size:12px;line-height:1.7;min-width:0;overflow-wrap:anywhere}' +
    '.spl-card .t{font-weight:800;font-size:12.5px}' +
    '.spl-form .row{border:1px solid var(--border);border-radius:10px;padding:9px 11px;margin-bottom:8px;background:#fbfaf7}' +
    '.spl-form label{display:block;font-size:11px;font-weight:700;margin:6px 0 3px}' +
    '.spl-form input[type=text],.spl-form textarea,.spl-in{width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;background:#fff;color:var(--text)}' +
    '.spl-sw{display:inline-flex;gap:5px;flex-wrap:wrap}.spl-sw label{display:inline-flex;margin:0;cursor:pointer}' +
    '.spl-sw input{position:absolute;opacity:0;width:1px;height:1px}.spl-sw span{display:inline-block;width:22px;height:22px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px var(--border)}' +
    '.spl-sw input:checked+span{box-shadow:0 0 0 2px #17171c}.spl-sw input:focus-visible+span{outline:2px solid #3d3fbf;outline-offset:2px}' +
    '.spl-btns{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}' +
    '.spl-btns button{font-size:12px;padding:6px 12px}' +
    '.spl-compose{margin:0 0 10px;padding:9px 12px;border:1px dashed #0f766e;border-radius:11px;background:rgba(20,184,166,.05);font-size:12px;line-height:1.7}' +
    '.spl-compose select{width:auto;max-width:100%;font-size:12.5px;padding:5px 8px}' +
    '.spl-list{list-style:none;margin:0;padding:0}' +
    '.spl-list li{border-top:1px solid var(--border);padding:8px 0;font-size:12.5px;line-height:1.75;display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}' +
    '.spl-list li:first-child{border-top:0}' +
    '.spl-list .body{flex:1 1 240px;min-width:0}' +
    '.spl-list .why{font-size:11px;color:var(--sub)}' +
    '.spl-wide{min-width:540px}' +
    '.spl-kind{display:inline-block;font-size:10px;font-weight:800;padding:0 7px;border-radius:999px;background:#e7e4dc;margin-right:5px}' +
    '@media (max-width:560px){.spl-tabs{width:100%}.spl-tabs button{flex:1}.spl-sec{padding:11px 12px}}';

  function addCss() {
    if (el('spl-css')) return;
    var s = document.createElement('style');
    s.id = 'spl-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---- 数え方の部品（/social-plan-core.js）を読む ---- */
  var corePromise = null;
  function loadCore() {
    if (window.lumSocialPlan) { C = window.lumSocialPlan; return Promise.resolve(C); }
    if (corePromise) return corePromise;
    corePromise = new Promise(function (ok, ng) {
      var sc = document.createElement('script');
      sc.src = '/social-plan-core.js';
      sc.onload = function () { C = window.lumSocialPlan; C ? ok(C) : ng(new Error('core')); };
      sc.onerror = function () { corePromise = null; ng(new Error('core')); };
      document.head.appendChild(sc);
    });
    return corePromise;
  }

  /* ---- 切り替え（投稿する／運用プラン） ---- */
  function setup() {
    var root = el('social-plan-root');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    addCss();
    root.innerHTML =
      '<div class="spl-tabs" role="group" aria-label="表示の切り替え">' +
        '<button type="button" id="spl-to-compose" aria-pressed="true">投稿する</button>' +
        '<button type="button" id="spl-to-plan" aria-pressed="false">運用プラン</button>' +
      '</div>' +
      '<div id="spl-view" style="display:none"><p class="msg" id="spl-msg" style="margin-bottom:10px"></p><div id="spl-body"></div></div>';
    el('spl-to-compose').addEventListener('click', function () { setView('compose'); });
    el('spl-to-plan').addEventListener('click', function () { setView('plan'); });
    composerAddon();
  }

  function setView(v) {
    S.view = v;
    var root = el('social-plan-root');
    var panel = el('social-admin');
    if (!root || !panel) return;
    el('spl-to-compose').setAttribute('aria-pressed', v === 'compose' ? 'true' : 'false');
    el('spl-to-plan').setAttribute('aria-pressed', v === 'plan' ? 'true' : 'false');
    el('spl-view').style.display = v === 'plan' ? 'block' : 'none';
    // 運用プランを見ている間は、投稿欄から下を隠します（消しはしません）。
    var after = false;
    Array.prototype.forEach.call(panel.children, function (c) {
      if (c === root) { after = true; return; }
      if (!after) return;
      if (v === 'plan') {
        if (c.dataset.splHid === undefined) c.dataset.splHid = c.style.display || '';
        c.style.display = 'none';
      } else if (c.dataset.splHid !== undefined) {
        c.style.display = c.dataset.splHid;
        delete c.dataset.splHid;
      }
    });
    if (v === 'plan' && (S.stale || !D)) load();
    else if (v === 'plan') render();
  }

  async function load() {
    if (S.loading) return;
    S.loading = true;
    var body = el('spl-body');
    if (body && !D) body.innerHTML = '<p class="spl-note">読み込んでいます…</p>';
    try {
      await loadCore();
    } catch (_) {
      S.loading = false;
      if (body) body.innerHTML = '<p class="spl-warn">画面の部品（social-plan-core.js）を読み込めませんでした。再読み込みしてください。</p>';
      return;
    }
    var r = await api('/api/social-plan');
    S.loading = false;
    var d = r.data || {};
    if (!d.ok) {
      if (body) body.innerHTML = '<p class="spl-warn">' + esc(d.message || '運用プランを読み込めませんでした。') + '</p>';
      return;
    }
    D = d;
    S.stale = false;
    try { await probeInbox(); } catch (_) { S.inbox = null; }
    fillPillarSelect();
    if (S.view === 'plan') render();
  }

  function items() { return C.itemsOf(D.posts, D.queue, D.plan.tags); }

  /* ---- 画面の組み立て。上から「いま見るもの」の順です ---- */
  var SECTIONS = [];
  function render() {
    var body = el('spl-body');
    if (!body || !D || !C) return;
    var it = items();
    body.innerHTML = SECTIONS.map(function (s) {
      var h = s.html(it);
      return h ? '<section class="spl-sec" id="spl-' + s.id + '">' + h + '</section>' : '';
    }).join('') +
      (D.stored ? '' : '<p class="spl-warn">保存先（Upstash Redis）が未接続のため、投稿の記録とプランを保存できません。数字はすべて0として出ています。</p>');
    SECTIONS.forEach(function (s) { if (s.bind) s.bind(it); });
  }

  /* ================================================================
     5. 投稿直後の1時間（と、返事の早さ）
     ================================================================ */
  function nowMs() { return S.now ? S.now() : Date.now(); }
  function hourHtml() {
    var hot = C.firstHour(D.posts, nowMs());
    var sp = S.inbox ? C.replySpeed(S.inbox.items) : null;
    if (!hot.length && !sp) return '';
    var h = '<h3>投稿直後の1時間と、返事の早さ</h3>';
    if (hot.length) {
      h += '<p class="lead">出してすぐ（最初の30〜60分）の反応が、その後どれだけ広がるかに効くと言われています<span class="spl-meyasu">目安</span>。' +
        'この時間はコメントにすぐ返事をして、ストーリーズや LINE で知らせるのがおすすめです。</p>';
      h += hot.map(function (x) {
        var p = x.post;
        var links = p.nets.map(function (n) {
          var u = p.urls && p.urls[n];
          return u ? '<a href="' + esc(window.lumSafeHref ? window.lumSafeHref(u) : u) + '" target="_blank" rel="noopener">' + esc(netLabel(n)) + 'で見る</a>' : '<span>' + esc(netLabel(n)) + '</span>';
        }).join('　');
        return '<div class="spl-good" style="color:var(--text)"><b>反応を見る時間</b>　あと <span class="spl-left" data-at="' + esc(p.at) + '">' + x.minutesLeft + '</span> 分' +
          '<div style="font-size:12px;margin:2px 0">' + esc(String(p.text || '').slice(0, 60)) + '</div>' +
          '<div style="font-size:12px">' + links + '</div>' +
          '<div class="spl-btns" style="margin-top:4px"><button type="button" class="ghost spl-go" data-go="inbox">コメントの受信箱を見る</button></div></div>';
      }).join('');
    }
    if (S.inbox) {
      if (sp) {
        h += '<p style="font-size:12.5px;margin:8px 0 2px">返事までの時間（中央値）：<b>' + fmtMin(sp.median) + '</b>　1時間以内に返せた割合：<b>' + pct(sp.within) + '</b>' + band(sp.reliability) + '</p>' +
          '<p class="spl-note">64% の人が、SNS での返事は1時間以内を期待しているという調査があります<span class="spl-meyasu">目安</span>。早い返事ほど、来店や問い合わせにつながりやすくなります。</p>';
      } else {
        h += '<p class="spl-note">受信箱のコメントに、届いた時刻と返事をした時刻の両方が無いため、返事の早さは数えられません。</p>';
      }
    }
    return h;
  }
  function fmtMin(m) { return m < 60 ? m + '分' : Math.floor(m / 60) + '時間' + (m % 60 ? (m % 60) + '分' : ''); }
  function bindHour() {
    Array.prototype.forEach.call(document.querySelectorAll('#spl-hour .spl-go'), function (b) {
      b.addEventListener('click', function () { go(b.dataset.go); });
    });
  }
  /* 残り分数は1分ごとに数字だけ書き換えます（動きは付けません）。 */
  setInterval(function () {
    var spans = document.querySelectorAll('.spl-left');
    if (!spans.length) return;
    var gone = false;
    Array.prototype.forEach.call(spans, function (s) {
      var left = Math.ceil(C.FIRST_HOUR_MIN - (nowMs() - Date.parse(s.dataset.at)) / 60000);
      if (left <= 0) gone = true;
      else s.textContent = String(left);
    });
    if (gone && S.view === 'plan') render();
  }, 60000);
  SECTIONS.unshift({ id: 'hour', html: hourHtml, bind: bindHour });

  /* 投稿欄：送った直後に、運用プランの「反応を見る時間」へ案内します。 */
  function justPostedAddon() {
    if (!S.lastPostAt || Date.now() - S.lastPostAt > 60 * 60000) return '';
    return '<div class="spl-good" style="margin-top:6px">投稿しました。これから1時間は「反応を見る時間」です。コメントにはなるべく早く返事をしましょう。' +
      ' <button type="button" class="ghost" onclick="window.lumSocialPlanUI.setView(\'plan\')" style="font-size:11.5px;padding:4px 10px">運用プランで見る</button></div>';
  }

  /* ================================================================
     3. 今週やること
     ================================================================ */
  function checklistHtml(it) {
    var list = C.weekChecklist({ items: it, plan: D.plan, today: D.today, recommend: D.recommend, inbox: S.inbox });
    var useAi = ls('lum_spl_ai') !== '0';
    var h = '<h3>今週やること</h3>' +
      '<p class="lead">柱のかたより・ペース・LINE の回数・コメントの返事から、今週やると良いことを並べています。「下書きを作る」を押すと、投稿欄に出す先・柱・メモを入れます。</p>' +
      '<label style="display:flex;gap:6px;align-items:center;font-size:12px;margin-bottom:4px"><input type="checkbox" id="spl-ai"' + (useAi ? ' checked' : '') + '> 「下書きを作る」で、AIにも下書きを書いてもらう</label>';
    if (!list.length) return h + '<p class="spl-good">今週やることは、いまのところありません。</p>';
    h += '<ul class="spl-list">' + list.map(function (x, i) {
      var btn = x.draft ? '<button type="button" class="spl-do" data-i="' + i + '" style="font-size:12px;padding:6px 12px">下書きを作る</button>'
        : x.go ? '<button type="button" class="ghost spl-go" data-go="' + esc(x.go) + '" style="font-size:12px;padding:6px 12px">' + (x.go === 'inbox' ? '受信箱を見る' : '見る') + '</button>' : '';
      return '<li><div class="body"><span class="spl-kind">' + esc(x.kind) + '</span>' +
        (x.draft && x.draft.pillar ? chip(pillarById(x.draft.pillar)) : '') + '<b>' + esc(x.title) + '</b>' +
        '<div class="why">' + esc(x.why) + '</div></div>' + btn + '</li>';
    }).join('') + '</ul>';
    S.checklist = list;
    return h;
  }
  function bindChecklist() {
    var ai = el('spl-ai');
    if (ai) ai.addEventListener('change', function () { ls('lum_spl_ai', ai.checked ? '1' : '0'); });
    Array.prototype.forEach.call(document.querySelectorAll('.spl-do'), function (b) {
      b.addEventListener('click', function () {
        var x = (S.checklist || [])[Number(b.dataset.i)];
        if (x && x.draft) makeDraft(x.draft, !!(el('spl-ai') && el('spl-ai').checked));
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#spl-todo .spl-go'), function (b) {
      b.addEventListener('click', function () { go(b.dataset.go); });
    });
  }
  function go(where) {
    if (where === 'inbox') {
      var box = S.inbox && S.inbox.anchor ? document.querySelector(S.inbox.anchor) : document.querySelector('#social-admin [id*="inbox"]');
      if (box) { setView('compose'); box.scrollIntoView({ block: 'start' }); return; }
      say('コメントの受信箱は、この画面ではまだ使えません。各SNSのアプリで確かめてください。', true);
      return;
    }
    var t = el('spl-' + where);
    if (t) t.scrollIntoView({ block: 'start' });
  }

  /* 投稿欄に入れます。投稿欄の部品（id）に値を入れて、いつもの入力と同じ
     出来事（input・change）を起こすだけで、投稿欄の作りには触りません。 */
  function makeDraft(dr, useAi) {
    setView('compose');
    var want = dr.nets || [];
    var boxes = document.querySelectorAll('#social-nets input[type="checkbox"][data-net]');
    Array.prototype.forEach.call(boxes, function (cb) {
      var on = want.indexOf(cb.dataset.net) !== -1;
      if (cb.checked !== on) { cb.checked = on; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    S.pillar = dr.pillar || '';
    ls('lum_spl_pillar', S.pillar || null);
    var sel = el('spl-pillar');
    if (sel) sel.value = S.pillar;
    var det = el('social-ai');
    if (det) det.open = true;
    var tp = el('social-ai-topic');
    if (tp) { tp.value = dr.topic || ''; tp.dispatchEvent(new Event('input', { bubbles: true })); }
    addonUpdate();
    var target = det || el('spl-compose');
    if (target) target.scrollIntoView({ block: 'start' });
    var goBtn = el('social-ai-go');
    if (useAi && goBtn && !goBtn.disabled) goBtn.click();
    else {
      var st = el('social-ai-state');
      if (st) st.textContent = 'メモを入れました。「選んだSNSの下書きを作る」を押すと、AIが下書きを書きます。';
    }
  }

  /* コメントの受信箱があれば、返事を待っている数と、返事までの時間を読みます。
     まだ無い（作られていない・使えない）ときは、何も出しません。 */
  /* コメントの受信箱は、SNS（文章）の「コメントを読み込む」を押したときだけ
     Meta に取りに行きます。ここではその結果を使うだけです（開くたびに API を
     叩かないため）。読み込まれたら、その場で表示を更新します。 */
  async function probeInbox() {
    var d = window.lumSocialInbox;
    S.inbox = d && Array.isArray(d.items) ? d : null;
  }
  window.addEventListener('lum:inbox', function () {
    probeInbox();
    if (S.view === 'plan') render();
  });
  SECTIONS.push({ id: 'todo', html: checklistHtml, bind: bindChecklist });

  /* ================================================================
     1. 柱（テーマ）と、そのバランス
     ================================================================ */
  function pillarsHtml(it) {
    if (S.editing) return pillarForm();
    var ps = pillars();
    var mix = C.pillarMix(it, ps, D.today);
    var h = '<h3>柱（テーマ）とバランス</h3>' +
      '<p class="lead">いつも出す話題を3〜5つ決めておくと、毎回「何を書こう」と悩まずに済みます。' +
      '役立つ話・共感される話を8割、宣伝は2割までが目安です<span class="spl-meyasu">目安</span>。</p>';
    if (!ps.length) {
      return h + '<p class="spl-warn">まだ柱が決まっていません。</p>' +
        '<div class="spl-btns"><button type="button" id="spl-p-sample">おすすめの柱で始める</button>' +
        '<button type="button" class="ghost" id="spl-p-edit">自分で決める</button></div>';
    }
    h += '<div class="spl-grid">' + ps.map(function (p) {
      var row = mix.rows.filter(function (r) { return r.id === p.id; })[0] || { n: 0, share: 0 };
      return '<div class="spl-card">' + chip(p) +
        (p.desc ? '<div>' + esc(p.desc) + '</div>' : '') +
        (p.ideas.length ? '<div class="spl-note">ネタの例：' + p.ideas.map(esc).join('／') + '</div>' : '') +
        '<div style="margin-top:4px;font-weight:700">直近30日＋予約：' + row.n + '本' + (mix.tagged ? '（' + pct(row.share) + '）' : '') + '</div></div>';
    }).join('') + '</div>';
    h += '<div class="spl-btns"><button type="button" class="ghost" id="spl-p-edit">柱を直す</button></div>';
    // 割合
    h += '<h4 style="font-size:12.5px;margin:12px 0 2px">直近30日と予約の割合' + band(mix.reliability) + '</h4>';
    if (mix.tagged) {
      h += '<div class="spl-bar" role="img" aria-label="柱ごとの割合">' + mix.rows.filter(function (r) { return r.n; }).map(function (r) {
        return '<span title="' + esc(r.name) + ' ' + pct(r.share) + '" style="width:' + (r.share * 100) + '%;background:' + r.color + '"></span>';
      }).join('') + '</div>' +
        '<div style="font-size:11.5px">' + mix.rows.map(function (r) { return chip(pillarById(r.id)) + r.n + '本 '; }).join('') + '</div>' +
        '<div style="font-size:12px;margin-top:8px">宣伝の割合：<b>' + pct(mix.promoShare) + '</b>（目安は20%まで<span class="spl-meyasu">目安</span>）</div>' +
        '<div class="spl-meter"><b class="' + (mix.promoOver ? 'over' : '') + '" style="width:' + Math.min(100, mix.promoShare * 100) + '%"></b><em style="left:20%"></em></div>';
    } else {
      h += '<p class="spl-note">柱の付いた投稿がまだありません。投稿欄の「柱」を選んで出すと、ここに割合が出ます。</p>';
    }
    if (mix.reliability.note && mix.tagged) h += '<p class="spl-note">' + esc(mix.reliability.note) + '</p>';
    mix.warnings.forEach(function (w) { h += '<p class="spl-warn">' + esc(w) + '</p>'; });
    mix.notes.forEach(function (w) { h += '<p class="spl-note">' + esc(w) + '</p>'; });
    h += untaggedHtml(it);
    return h;
  }

  /* 柱の付いていない投稿・予約に、あとから柱を付ける（直近30日分だけ）。 */
  function untaggedHtml(it) {
    var from = C.addDays(D.today, -29);
    var list = it.filter(function (x) { return !x.pillar && x.day >= from; }).slice(0, 8);
    if (!list.length || !pillars().length) return '';
    return '<details style="margin-top:8px"><summary style="font-size:12px;cursor:pointer">柱が付いていない投稿に、あとから付ける（' + list.length + '件）</summary>' +
      '<ul class="spl-list" style="margin-top:6px">' + list.map(function (x) {
        return '<li><div class="body"><span class="spl-kind">' + (x.scheduled ? '予約 ' : '') + esc(x.day) + '</span>' + esc(String(x.src.text || '').slice(0, 60)) + '</div>' +
          '<select class="spl-tag" data-id="' + esc(x.id) + '" aria-label="この投稿の柱" style="width:auto;font-size:12px;padding:4px 6px"><option value="">選ぶ</option>' +
          pillars().map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('') + '</select></li>';
      }).join('') + '</ul></details>';
  }

  function pillarForm() {
    var ps = S.draft || [];
    var sw = function (i, cur) {
      return '<div class="spl-sw" role="radiogroup" aria-label="色">' + C.PILLAR_COLORS.map(function (c, k) {
        return '<label><input type="radio" name="spl-c' + i + '" value="' + c + '"' + (c === cur ? ' checked' : '') + ' aria-label="色' + (k + 1) + '"><span style="background:' + c + '"></span></label>';
      }).join('') + '</div>';
    };
    return '<h3>柱（テーマ）を決める</h3>' +
      '<p class="lead">3〜5つが目安です<span class="spl-meyasu">目安</span>。「宣伝」に印を付けた柱は、宣伝の割合（20%まで）として数えます。</p>' +
      '<div class="spl-form">' + ps.map(function (p, i) {
        return '<div class="row" data-i="' + i + '">' +
          '<label for="spl-n' + i + '">名前（20字まで）</label><input type="text" id="spl-n' + i + '" maxlength="20" value="' + esc(p.name) + '">' +
          '<label for="spl-d' + i + '">どんな話か</label><input type="text" id="spl-d' + i + '" maxlength="80" value="' + esc(p.desc) + '">' +
          '<label for="spl-i' + i + '">ネタの例（1行に1つ）</label><textarea id="spl-i' + i + '" rows="2">' + esc((p.ideas || []).join('\n')) + '</textarea>' +
          '<label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" id="spl-pr' + i + '"' + (p.promo ? ' checked' : '') + '> 宣伝の柱（新商品・セール・予約のお願いなど）</label>' +
          '<label>色</label>' + sw(i, p.color) +
          '<div class="spl-btns"><button type="button" class="ghost spl-p-del" data-i="' + i + '">この柱を消す</button></div></div>';
      }).join('') + '</div>' +
      '<div class="spl-btns">' +
        (ps.length < C.PILLAR_MAX ? '<button type="button" class="ghost" id="spl-p-add">柱を足す</button>' : '') +
        '<button type="button" id="spl-p-save">保存</button>' +
        '<button type="button" class="ghost" id="spl-p-cancel">やめる</button>' +
      '</div>' +
      (ps.length < C.PILLAR_MIN ? '<p class="spl-note">あと' + (C.PILLAR_MIN - ps.length) + 'つ足すと、目安の3つになります。</p>' : '');
  }

  function readForm() {
    return (S.draft || []).map(function (p, i) {
      var c = document.querySelector('input[name="spl-c' + i + '"]:checked');
      return {
        id: p.id, name: el('spl-n' + i).value, desc: el('spl-d' + i).value,
        ideas: el('spl-i' + i).value.split('\n'), promo: el('spl-pr' + i).checked, color: c ? c.value : p.color
      };
    });
  }

  function bindPillars() {
    var on = function (id, fn) { var b = el(id); if (b) b.addEventListener('click', fn); };
    on('spl-p-sample', function () {
      S.draft = C.SAMPLE_PILLARS.map(function (p, i) { return { id: '', name: p.name, desc: p.desc, ideas: p.ideas.slice(), promo: p.promo, color: C.PILLAR_COLORS[i] }; });
      S.editing = true; render();
    });
    on('spl-p-edit', function () {
      S.draft = pillars().map(function (p) { return { id: p.id, name: p.name, desc: p.desc, ideas: p.ideas.slice(), promo: p.promo, color: p.color }; });
      if (!S.draft.length) S.draft.push({ id: '', name: '', desc: '', ideas: [], promo: false, color: C.PILLAR_COLORS[0] });
      S.editing = true; render();
    });
    on('spl-p-add', function () {
      S.draft = readForm();
      S.draft.push({ id: '', name: '', desc: '', ideas: [], promo: false, color: C.PILLAR_COLORS[S.draft.length % C.PILLAR_COLORS.length] });
      render();
    });
    on('spl-p-cancel', function () { S.editing = false; S.draft = null; render(); });
    on('spl-p-save', async function () {
      var next = readForm().filter(function (p) { return String(p.name).trim(); });
      var plan = { pillars: next, targets: D.plan.targets, tags: D.plan.tags };
      var r = await put({ plan: plan });
      var d = r.data || {};
      if (!d.ok) { say(d.message || '保存できませんでした。'); return; }
      D.plan = d.plan;
      S.editing = false; S.draft = null;
      fillPillarSelect();
      say(d.message || '保存しました。', true);
      render();
    });
    Array.prototype.forEach.call(document.querySelectorAll('.spl-p-del'), function (b) {
      b.addEventListener('click', function () {
        S.draft = readForm();
        S.draft.splice(Number(b.dataset.i), 1);
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.spl-tag'), function (s) {
      s.addEventListener('change', async function () {
        if (!s.value) return;
        var r = await put({ tag: { id: s.dataset.id, pillar: s.value } });
        var d = r.data || {};
        if (!d.ok) { say(d.message || '柱を付けられませんでした。'); s.value = ''; return; }
        D.plan = d.plan;
        say(d.message || '柱を付けました。', true);
        render();
      });
    });
  }
  SECTIONS.push({ id: 'pillars', html: pillarsHtml, bind: bindPillars });

  /* ================================================================
     2. ペースの目標
     ================================================================ */
  function md(day) { return Number(day.slice(5, 7)) + '/' + Number(day.slice(8, 10)) + '（' + C.WEEKDAYS[C.weekdayOf(day)] + '）'; }
  function prefFor(net) {
    var r = (D.recommend || {})[net];
    return r && Array.isArray(r.weekdays) ? r.weekdays : [];
  }
  function suggestFor(it, row) {
    return C.suggestDays(it, row.net, D.today, row.left, prefFor(row.net), row.per);
  }
  function cadenceHtml(it) {
    var cd = C.cadence(it, D.plan.targets, D.today);
    var h = '<h3>ペースの目標</h3>' +
      '<p class="lead">たまにまとめて出すより、決まったペースで出し続けるほうが伸びやすいと言われています' +
      '（週5本以上出すアカウントは、伸びが2〜3倍速かったという調査があります）<span class="spl-meyasu">目安</span>。' +
      '「出した本数」と「予約している本数」を合わせて数えます。週は月曜〜日曜です。</p>';
    if (!cd.rows.length) return h + '<p class="spl-note">目標が1つもありません。下の「目標を変える」から選んでください。</p>' + targetsForm();
    h += '<p style="font-size:13px;font-weight:800;margin:4px 0 8px">今週（' + md(cd.weekFrom) + '〜' + md(cd.weekTo) + '）は、あと ' + cd.weekLeft + ' 本</p>';
    h += '<div class="soc-scroll"><table class="soc-tbl spl-wide"><thead><tr><th>SNS</th><th>目標<span class="spl-meyasu">目安</span></th><th>今週</th><th>今月</th><th>あと</th><th>空いている日のおすすめ</th></tr></thead><tbody>' +
      cd.rows.map(function (r) {
        var w = r.week;
        var m = r.month;
        var days = suggestFor(it, r);
        var rec = (D.recommend || {})[r.net];
        return '<tr><td><b>' + esc(netLabel(r.net)) + '</b></td>' +
          '<td>' + (r.per === 'week' ? '週' : '月') + r.n + '本<div class="spl-note" style="margin:0">' + esc(r.note) + '</div></td>' +
          '<td class="n">' + (r.per === 'week' ? w.done + (w.booked ? '＋予約' + w.booked : '') + ' / ' + w.target : w.done + (w.booked ? '＋予約' + w.booked : '')) + '</td>' +
          '<td class="n">' + m.done + (m.booked ? '＋予約' + m.booked : '') + ' / ' + m.target + '</td>' +
          '<td class="n"><b>' + (r.left ? r.left + '本' : '達成') + '</b></td>' +
          '<td>' + (days.length ? days.map(function (d) { return d === D.today ? '今日' : md(d); }).join('・') : (r.left ? '今' + (r.per === 'week' ? '週' : '月') + 'はもう空いている日がありません' : '—')) +
          (days.length && rec && rec.basis && rec.basis !== 'general' ? '<div class="spl-note" style="margin:0">反応の良い曜日を優先</div>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="spl-note">おすすめの日は、まだ出していない日を、なるべく間を空けて選んでいます。反応やサイトへの訪問の数字がたまると、その曜日を優先します。</p>';
    return h + targetsForm();
  }
  function targetsForm() {
    var t = D.plan.targets;
    return '<details style="margin-top:8px" id="spl-t-box"><summary style="font-size:12px;cursor:pointer">目標を変える</summary>' +
      '<div class="soc-scroll"><table class="soc-tbl spl-wide" style="margin-top:6px"><tbody>' + Object.keys(C.DEFAULT_TARGETS).map(function (net) {
        var x = t[net] || C.DEFAULT_TARGETS[net];
        return '<tr><td><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" class="spl-t-on" data-net="' + net + '"' + (x.on ? ' checked' : '') + '> ' + esc(netLabel(net)) + '</label></td>' +
          '<td><select class="spl-t-per" data-net="' + net + '" aria-label="' + esc(netLabel(net)) + 'の単位" style="width:auto;font-size:12px;padding:4px 6px"><option value="week"' + (x.per === 'week' ? ' selected' : '') + '>週に</option><option value="month"' + (x.per === 'month' ? ' selected' : '') + '>月に</option></select> ' +
          '<input type="number" class="spl-t-n spl-in" data-net="' + net + '" min="0" max="31" value="' + x.n + '" aria-label="' + esc(netLabel(net)) + 'の本数" style="width:64px;display:inline-block"> 本</td>' +
          '<td class="spl-note" style="margin:0">おすすめ：' + esc(C.DEFAULT_TARGETS[net].note) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="spl-btns"><button type="button" id="spl-t-save">目標を保存</button><button type="button" class="ghost" id="spl-t-reset">おすすめの値に戻す</button></div></details>';
  }
  function bindCadence() {
    var save = el('spl-t-save');
    if (!save) return;
    save.addEventListener('click', async function () {
      var targets = {};
      Object.keys(C.DEFAULT_TARGETS).forEach(function (net) {
        var q = function (cls) { return document.querySelector('.' + cls + '[data-net="' + net + '"]'); };
        targets[net] = { on: q('spl-t-on').checked, per: q('spl-t-per').value, n: Number(q('spl-t-n').value) };
      });
      await savePlanWith({ targets: targets }, '目標を保存しました。');
    });
    el('spl-t-reset').addEventListener('click', async function () {
      await savePlanWith({ targets: {} }, 'おすすめの値に戻しました。');
    });
  }
  async function savePlanWith(part, okText) {
    var plan = { pillars: D.plan.pillars, targets: D.plan.targets, tags: D.plan.tags };
    for (var k in part) plan[k] = part[k];
    var r = await put({ plan: plan });
    var d = r.data || {};
    if (!d.ok) { say(d.message || '保存できませんでした。'); return false; }
    D.plan = d.plan;
    say(okText || d.message || '保存しました。', true);
    render();
    return true;
  }
  SECTIONS.push({ id: 'cadence', html: cadenceHtml, bind: bindCadence });

  /* ================================================================
     4. 保存・シェアされる投稿（Instagram のカルーセル）
     ================================================================ */
  var CK = 'lum_spl_carousel';
  function carousel() {
    if (S.car) return S.car;
    var c = null;
    try { c = JSON.parse(ls(CK) || 'null'); } catch (_) { c = null; }
    if (!c || !Array.isArray(c.slides)) c = { pillar: '', cover: '', slides: ['', '', ''], last: C.SAVE_CTA, caption: '' };
    S.car = c;
    return c;
  }
  function carSave() { ls(CK, JSON.stringify(S.car)); }
  function carouselHtml() {
    var c = carousel();
    var h = '<h3>保存・シェアされる投稿（カルーセル）</h3>' +
      '<p class="lead">Instagram では「保存」と「DMで送られた数」が特に重く見られます。複数枚の投稿（カルーセル）は、1枚の画像より届く数が5割ほど・保存が7割ほど多いという調査があります<span class="spl-meyasu">目安</span>。' +
      '表紙で「見ると何が分かるか」を約束し、1枚に1つずつ、最後に「保存して見返してね」で締めるのが基本の形です。</p>' +
      '<div class="spl-form">' +
      '<label for="spl-c-pillar">柱（テーマ）</label><select id="spl-c-pillar" class="spl-in" style="width:auto"><option value="">選ばない</option>' +
        pillars().map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === c.pillar ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>' +
      '<label for="spl-c-cover">1枚目：表紙の一言（例：開店前に見て！ コーヒー豆の選び方3つ）</label>' +
      '<input type="text" id="spl-c-cover" class="spl-car" maxlength="80" value="' + esc(c.cover) + '">' +
      c.slides.map(function (s, i) {
        return '<label for="spl-c-s' + i + '">' + (i + 2) + '枚目</label>' +
          '<div style="display:flex;gap:6px;align-items:flex-start"><textarea id="spl-c-s' + i + '" class="spl-car" rows="2" style="flex:1">' + esc(s) + '</textarea>' +
          (c.slides.length > C.CAROUSEL_MIN ? '<button type="button" class="ghost spl-c-del" data-i="' + i + '" aria-label="' + (i + 2) + '枚目を消す" style="font-size:11px;padding:5px 9px">消す</button>' : '') + '</div>';
      }).join('') +
      (c.slides.length < C.CAROUSEL_MAX ? '<div class="spl-btns" style="margin-top:4px"><button type="button" class="ghost" id="spl-c-add">1枚足す</button></div>' : '') +
      '<label for="spl-c-last">' + (c.slides.length + 2) + '枚目（最後）：保存・シェアのお願い</label>' +
      '<input type="text" id="spl-c-last" class="spl-car" maxlength="80" value="' + esc(c.last) + '">' +
      '<label for="spl-c-cap">キャプション（投稿の本文）</label>' +
      '<textarea id="spl-c-cap" class="spl-car" rows="4">' + esc(c.caption) + '</textarea>' +
      '</div>' +
      '<div class="spl-btns"><button type="button" class="ghost" id="spl-c-mkcap">キャプションのたたき台を作る</button>' +
        '<button type="button" class="ghost" id="spl-c-copy">テキストをコピー</button>' +
        '<button type="button" class="ghost" id="spl-c-dl">テキストで保存</button>' +
        '<button type="button" id="spl-c-use">キャプションを投稿欄に入れる</button>' +
        '<button type="button" class="ghost" id="spl-c-clear">白紙に戻す</button></div>' +
      '<div id="spl-c-checks" style="margin-top:10px">' + carouselChecksHtml() + '</div>' +
      '<p class="spl-note">画像（1枚ずつの絵）は、このテキストを元に Canva などで作ってください。この画面から送れるのは、いまは1枚目の画像だけです。</p>';
    return h;
  }
  function carouselChecksHtml() {
    var k = C.carouselCheck(S.car || carousel());
    return '<h4 style="font-size:12.5px;margin:0 0 4px">確認（' + k.ok + ' / ' + k.total + '）<span class="spl-meyasu">目安</span></h4>' +
      '<ul class="spl-list">' + k.checks.map(function (x) {
        return '<li><div class="body"><b style="color:' + (x.ok ? '#047857' : '#92400e') + '">' + (x.ok ? 'OK' : 'まだ') + '</b>　' + esc(x.label) +
          (x.detail && !x.ok ? '<div class="why">' + esc(x.detail) + '</div>' : '') + '</div></li>';
      }).join('') + '</ul>';
  }
  function carRead() {
    var c = S.car;
    c.pillar = el('spl-c-pillar').value;
    c.cover = el('spl-c-cover').value;
    c.slides = c.slides.map(function (_, i) { return el('spl-c-s' + i).value; });
    c.last = el('spl-c-last').value;
    c.caption = el('spl-c-cap').value;
    carSave();
  }
  function bindCarousel() {
    if (!el('spl-c-cover')) return;
    var box = el('spl-carousel');
    box.addEventListener('input', function (e) {
      if (!e.target.classList.contains('spl-car')) return;
      carRead();
      el('spl-c-checks').innerHTML = carouselChecksHtml();
    });
    el('spl-c-pillar').addEventListener('change', carRead);
    var add = el('spl-c-add');
    if (add) add.addEventListener('click', function () { carRead(); S.car.slides.push(''); carSave(); render(); focusLater('spl-c-s' + (S.car.slides.length - 1)); });
    Array.prototype.forEach.call(document.querySelectorAll('.spl-c-del'), function (b) {
      b.addEventListener('click', function () { carRead(); S.car.slides.splice(Number(b.dataset.i), 1); carSave(); render(); focusLater('spl-carousel'); });
    });
    el('spl-c-mkcap').addEventListener('click', function () {
      carRead();
      if (S.car.caption.trim() && !confirm('いまのキャプションを、たたき台で置き換えますか？')) return;
      S.car.caption = C.carouselCaption(S.car);
      el('spl-c-cap').value = S.car.caption;
      carSave();
      el('spl-c-checks').innerHTML = carouselChecksHtml();
    });
    el('spl-c-copy').addEventListener('click', function () {
      carRead();
      var text = C.carouselText(S.car);
      var done = function () { say('テキストをコピーしました。', true); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { say('コピーできませんでした。「テキストで保存」を使ってください。'); });
      else say('コピーできませんでした。「テキストで保存」を使ってください。');
    });
    el('spl-c-dl').addEventListener('click', function () {
      carRead();
      var blob = new Blob([C.carouselText(S.car)], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'carousel-' + D.today + '.txt';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
    el('spl-c-use').addEventListener('click', function () {
      carRead();
      if (!S.car.caption.trim()) S.car.caption = C.carouselCaption(S.car);
      setView('compose');
      var cb = document.querySelector('#social-nets input[data-net="instagram"]');
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      var ta = el('social-text');
      if (ta) {
        if (ta.value.trim() && !confirm('投稿欄の本文を、このキャプションで置き換えますか？')) return;
        ta.value = S.car.caption;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.scrollIntoView({ block: 'center' });
      }
      S.pillar = S.car.pillar || S.pillar;
      if (el('spl-pillar')) el('spl-pillar').value = S.pillar;
      addonUpdate();
    });
    el('spl-c-clear').addEventListener('click', function () {
      if (!confirm('カルーセルの下書きを消して、白紙に戻しますか？')) return;
      S.car = null; ls(CK, null); render();
    });
  }
  function focusLater(id) { var x = el(id); if (x && x.focus) x.focus(); }
  SECTIONS.push({ id: 'carousel', html: carouselHtml, bind: bindCarousel });

  /* 投稿欄：保存・シェア要素の点数（助言だけ。送るのは止めません）。 */
  function scoreAddon() {
    var ta = el('social-text');
    var sc = C.saveShareScore(ta ? ta.value : '');
    if (!sc) return '';
    return '<div style="margin-top:6px"><b>保存・シェア要素</b>：' + sc.score + ' / ' + sc.max + '（' + esc(sc.label) + '）<span class="spl-meyasu">目安</span>' +
      (sc.tips.length ? '<div class="soc-small">' + sc.tips.map(esc).join('<br>') + '</div>' : '') + '</div>';
  }

  /* ================================================================
     6. LINE の送りすぎ注意
     ================================================================ */
  function lineHtml(it) {
    var lt = D.plan.targets.line;
    var q = D.line;
    var lm = C.lineMonth(it, D.today);
    var prevDay = C.addDays(C.monthStart(D.today), -1);
    var prev = C.lineMonth(it, prevDay);
    if (!(lt && lt.on) && !q && !lm.count && !prev.count) return '';
    var h = '<h3>LINE の送りすぎ注意</h3>' +
      '<p class="lead">LINE 公式アカウントの一斉送信は、月2〜4通が目安です<span class="spl-meyasu">目安</span>。友だちは「多くても週1通まで」を好む人が多く、送りすぎるとブロックされやすくなります。</p>';
    var w = Math.min(100, lm.count / 6 * 100);
    h += '<p style="font-size:13px;margin:2px 0"><b>今月（' + Number(D.today.slice(5, 7)) + '月）：' + lm.count + ' 通</b>（送った ' + lm.sent + '・予約 ' + lm.booked + '）　先月：' + prev.count + ' 通</p>' +
      '<div class="spl-meter" role="img" aria-label="今月の送信数 ' + lm.count + ' 通（目安 2〜4 通）"><b class="' + (lm.count > C.LINE_MAX ? 'over' : '') + '" style="width:' + w + '%"></b>' +
        '<em style="left:' + (C.LINE_MIN / 6 * 100) + '%"></em><em style="left:' + (C.LINE_MAX / 6 * 100) + '%"></em></div>' +
      '<p class="spl-note" style="margin-top:0">線のあいだ（2〜4通）が目安の範囲です。</p>';
    if (lm.state === 'over') h += '<p class="spl-warn">今月は目安の4通を超えています。来月は回数を減らしてみましょう。</p>';
    else if (lm.state === 'full') h += '<p class="spl-warn">今月はもう4通です。これ以上送ると、ブロックが増えやすくなります。</p>';
    else if (lm.state === 'few') h += '<p class="spl-note">今月はまだ少なめです。忘れられない程度に、月2通くらいは送りましょう。</p>';
    else h += '<p class="spl-good">今月は目安の範囲です。</p>';
    if (!q) {
      h += '<p class="spl-note">友だちの人数とブロックの割合は、LINE をつなぐと出ます（設定状況の「SNS（文章）」から）。</p>';
      return h;
    }
    if (!q.ok) return h + '<p class="spl-note">LINE の人数を読めませんでした' + (q.message ? '（' + esc(q.message) + '）' : '') + '。</p>';
    var tr = C.lineTrend(q.trend);
    h += '<p style="font-size:12.5px;margin:10px 0 2px">友だち：<b>' + (q.followers != null ? Number(q.followers).toLocaleString('ja-JP') + '人' : '—') + '</b>' +
      (q.reach != null ? '　届く人数：' + Number(q.reach).toLocaleString('ja-JP') + '人' : '') + '</p>';
    if (tr) {
      h += '<p style="font-size:12px;margin:0">' + esc(tr.from) + ' から ' + esc(tr.to) + ' で ' + (tr.diff >= 0 ? '+' : '') + tr.diff + '人</p>' + spark(tr.points);
    } else {
      h += '<p class="spl-note">人数の移り変わりは、この画面を開いた日ごとにメモしています。2日分たまると出ます。</p>';
    }
    if (q.note) h += '<p class="spl-note">' + esc(q.note) + '</p>';
    var br = C.lineBlockRate(q);
    var bb = C.blockBand(br);
    if (bb) {
      h += '<p style="font-size:12.5px;margin:8px 0 2px">ブロックの割合（おおよそ）：<b>' + pct(br) + '</b>　<span class="spl-band ' + (bb.level === 'act' ? 'low' : 'none') + '">' + esc(bb.label) + '</span></p>' +
        '<p class="' + (bb.level === 'act' ? 'spl-warn' : 'spl-note') + '">' + esc(bb.note) + '</p>' +
        '<p class="spl-note">目安：20%以下は良好、20〜30%は平均的、30%を超えたら見直しが必要<span class="spl-meyasu">目安</span>。「友だち − 届く人数」から出しているので、おおよその値です。</p>';
    }
    return h;
  }
  /* 小さな折れ線（動きなし）。 */
  function spark(pts) {
    if (!pts || pts.length < 2) return '';
    var W = 280, H = 44;
    var min = Infinity, max = -Infinity;
    pts.forEach(function (p) { min = Math.min(min, p.n); max = Math.max(max, p.n); });
    var span = max - min || 1;
    var d = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + (i / (pts.length - 1) * (W - 4) + 2).toFixed(1) + ' ' + (H - 4 - (p.n - min) / span * (H - 8)).toFixed(1);
    }).join(' ');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:' + W + 'px;height:' + H + 'px;display:block" role="img" aria-label="友だちの人数の移り変わり">' +
      '<path d="' + d + '" fill="none" stroke="#0f766e" stroke-width="2"/></svg>';
  }
  SECTIONS.push({ id: 'line', html: lineHtml });

  /* ================================================================
     7. 月次の振り返り
     ================================================================ */
  function months() {
    var out = [];
    var d = D.today;
    for (var i = 0; i < 3; i++) { out.push(d.slice(0, 7)); d = C.addDays(C.monthStart(d), -1); }
    return out;
  }
  function reviewHtml(it) {
    var ms = months();
    if (!S.month || ms.indexOf(S.month) === -1) S.month = ms[1];
    var rv = C.monthlyReview(it, pillars(), S.month);
    var name = function (m) { return Number(m.slice(0, 4)) + '年' + Number(m.slice(5, 7)) + '月'; };
    var num = function (v, has) { return has ? Number(v).toLocaleString('ja-JP') : '—'; };
    var h = '<h3>月次の振り返り</h3>' +
      '<p class="lead">柱ごと・SNSごとに、出した本数と、反応・サイトに来た人・問い合わせを並べます。サイトに来た人と問い合わせは、計測リンクの付いた投稿の分だけです（投稿から7日間）。件数が少ないうちは「判断できません」「参考程度」と出します。</p>' +
      '<label for="spl-month" style="font-size:12px;font-weight:700">月</label> <select id="spl-month" style="width:auto;font-size:12.5px;padding:5px 8px">' +
        ms.map(function (m, i) { return '<option value="' + m + '"' + (m === S.month ? ' selected' : '') + '>' + name(m) + (i === 0 ? '（今月・途中）' : '') + '</option>'; }).join('') + '</select>' +
      '<p style="font-size:12.5px;margin:6px 0">' + name(S.month) + 'に出した投稿：<b>' + rv.total + ' 本</b>' + band(rv.reliability) + '</p>';
    if (!rv.total) return h + '<p class="spl-note">この月に出した投稿はありません。</p>';
    h += '<div class="soc-scroll"><table class="soc-tbl spl-wide"><thead><tr><th>柱</th><th>本数</th><th>反応</th><th>サイトに来た人</th><th>問い合わせ</th><th></th></tr></thead><tbody>' +
      rv.rows.map(function (r) {
        return '<tr><td>' + (r.id ? chip(pillarById(r.id)) : chip(null)) + '</td><td class="n">' + r.posts + '</td>' +
          '<td class="n">' + num(r.reactions, r.reacted) + '</td><td class="n">' + num(r.visits, r.measured) + '</td><td class="n">' + num(r.inquiries, r.measured) + '</td>' +
          '<td>' + (r.posts ? band(r.reliability) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    h += '<div class="soc-scroll"><table class="soc-tbl spl-wide" style="margin-top:10px"><thead><tr><th>SNS</th><th>本数</th><th>サイトに来た人</th><th>問い合わせ</th><th></th></tr></thead><tbody>' +
      rv.nets.map(function (x) {
        return '<tr><td>' + esc(netLabel(x.net)) + '</td><td class="n">' + x.posts + '</td><td class="n">' + num(x.visits, x.measured) + '</td><td class="n">' + num(x.inquiries, x.measured) + '</td><td>' + band(x.reliability) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="spl-note">「—」は数字が取れていないものです（反応は「反応を取得」した投稿だけ、サイトの数字は計測リンクの付いた投稿だけ）。</p>';
    h += '<h4 style="font-size:12.5px;margin:10px 0 2px">来月の配分のヒント<span class="spl-meyasu">目安</span></h4>' +
      rv.tips.map(function (x) { return '<p class="spl-good" style="color:var(--text)">' + esc(x) + '</p>'; }).join('');
    return h;
  }
  function bindReview() {
    var s = el('spl-month');
    if (s) s.addEventListener('change', function () { S.month = s.value; render(); var r = el('spl-review'); if (r) r.scrollIntoView({ block: 'start' }); });
  }
  SECTIONS.push({ id: 'review', html: reviewHtml, bind: bindReview });

  /* 投稿欄：LINE を選んでいて、その月の5通目になるときは知らせます（止めはしません）。 */
  function lineWarnAddon() {
    if (!D) return '';
    var cb = document.querySelector('#social-nets input[data-net="line"]');
    if (!cb || !cb.checked) return '';
    var when = document.querySelector('input[name="social-when"]:checked');
    var date = el('social-date');
    var day = when && when.value === 'date' && date && /^\d{4}-\d{2}-\d{2}$/.test(date.value) ? date.value : D.today;
    var lm = C.lineMonth(items(), day);
    if (!lm.nextIsOver) return '';
    return '<div class="spl-warn">LINE：この送信で ' + Number(day.slice(5, 7)) + '月の ' + (lm.count + 1) + ' 通目になります（送った分と予約を合わせて数えています）。' +
      '目安は月2〜4通で、送りすぎるとブロックされやすくなります。急ぎでなければ、来月に回すか、ほかのSNSだけにすることも考えてみてください。</div>';
  }

  /* ================================================================
     投稿欄に足す部品（柱の選択など）。投稿欄そのものは書き換えません。
     ================================================================ */
  var ADDON = [justPostedAddon, lineWarnAddon, scoreAddon];
  function composerAddon() {
    var anchor = el('social-tpl');
    if (!anchor || el('spl-compose')) return;
    var box = document.createElement('div');
    box.id = 'spl-compose';
    box.className = 'spl-compose';
    box.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">' +
        '<label for="spl-pillar" style="font-weight:700">柱（テーマ）</label>' +
        '<select id="spl-pillar"><option value="">選ばない</option></select>' +
        '<span class="soc-small" id="spl-pillar-note">選ぶと、運用プランの「バランス」に数えます。</span>' +
      '</div><div id="spl-addon"></div>';
    anchor.parentNode.insertBefore(box, anchor);
    el('spl-pillar').addEventListener('change', function () { S.pillar = el('spl-pillar').value; ls('lum_spl_pillar', S.pillar || null); addonUpdate(); });
    S.pillar = ls('lum_spl_pillar') || '';
    // 本文・出す先・日付が変わったら、足した部品を更新します。
    ['social-text'].forEach(function (id) { var x = el(id); if (x) x.addEventListener('input', addonSoon); });
    var nets = el('social-nets');
    if (nets) nets.addEventListener('change', addonSoon);
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t && (t.name === 'social-when' || t.id === 'social-date')) addonSoon();
    });
  }
  function fillPillarSelect() {
    var s = el('spl-pillar');
    if (!s) return;
    var ps = pillars();
    s.innerHTML = '<option value="">選ばない</option>' + ps.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.name) + (p.promo ? '（宣伝）' : '') + '</option>';
    }).join('');
    if (S.pillar && !pillarById(S.pillar)) S.pillar = '';
    s.value = S.pillar;
    el('spl-pillar-note').textContent = ps.length ? '選ぶと、運用プランの「バランス」に数えます。' : '柱は「運用プラン」で決められます。';
    addonUpdate();
  }
  var addonTimer = 0;
  function addonSoon() { clearTimeout(addonTimer); addonTimer = setTimeout(addonUpdate, 250); }
  function addonUpdate() {
    var out = el('spl-addon');
    if (!out || !C) return;
    out.innerHTML = ADDON.map(function (f) { return f() || ''; }).join('');
  }

  /* 送るとき、選んだ柱を一緒に渡します（/api/social が予約・記録に残します）。 */
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  if (realFetch) {
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || String(input);
        var u = new URL(url, location.href);
        var method = String((init && init.method) || 'GET').toUpperCase();
        if (u.pathname === '/api/social' && method === 'POST' && init && typeof init.body === 'string') {
          var b = JSON.parse(init.body);
          var a = b.action || 'post';
          if (a === 'post' || a === 'schedule') {
            if (S.pillar && !b.pillar) {
              b.pillar = S.pillar;
              init = Object.assign({}, init, { body: JSON.stringify(b) });
            }
            return realFetch(input, init).then(function (res) { afterSend(a, res.clone()); return res; });
          }
        }
      } catch (_) {}
      return realFetch(input, init);
    };
  }
  function afterSend(action, res) {
    res.json().then(function (d) {
      var ok = action === 'post' ? d && d.posted > 0 : d && d.ok;
      if (!ok) return;
      S.stale = true;
      if (action === 'post') S.lastPostAt = Date.now();
      S.pillar = '';
      ls('lum_spl_pillar', null);
      var s = el('spl-pillar');
      if (s) s.value = '';
      addonUpdate();
    }).catch(function () {});
  }

  /* SNS（文章）タブを開いたときに、部品を置いてプランを読みます。 */
  function hook() {
    var orig = window.lumSocialInit;
    if (typeof orig !== 'function' || orig.splWrapped) return;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      setup();
      if (!D && !S.loading) load();
      return r;
    };
    wrapped.splWrapped = true;
    window.lumSocialInit = wrapped;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);
  else hook();

  // テスト・ほかの部品から使う入り口。
  window.lumSocialPlanUI = { load: load, setView: setView, state: function () { return { S: S, D: D }; } };
})();
