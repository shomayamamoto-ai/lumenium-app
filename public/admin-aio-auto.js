/* SEO / AIO 分析 › 自動計測の欄。
 *
 * AIO出現率は、サーバーが決まった間隔で自動で計測し、終わるとこの画面の
 * 最新の結果になります（api/_aio-auto.js）。ここでは、
 *   - 自動計測がオンか・次はいつか・前回の結果
 *   - 計測中なら、どこまで進んだか（20秒ごとに読み直し、終わったら結果を出し直す）
 *   - 間隔・回数の設定と「今すぐ自動で計測」
 * を出します。中身は SEO 画面の読み込み（/api/aio の GET）に入って届きます。 */
(function () {
  var el = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var EVERY = [[7, '毎週'], [14, '2週ごと'], [30, '毎月']];
  var SAMPLES = [[1, '1回（安い・幅が広い）'], [3, '3回（標準）'], [5, '5回（幅が狭い・高い）']];
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var NOTE = '。毎朝9時の自動処理で、前回の計測（手で測った分も含む）から間隔が空いていれば始めます。聞くAIは Claude です。';
  var state = { auto: null, meta: null, reload: null, open: false, timer: null, busy: false };

  function day(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '/' + d.getDate() + '（' + WD[d.getDay()] + '）';
  }
  function pct(p) { return p == null ? '—' : Math.round(p * 100) + '%'; }
  function everyLabel(n) { var x = EVERY.filter(function (e) { return e[0] === n; })[0]; return x ? x[1] : n + '日ごと'; }

  function costOf(samples) {
    var m = state.meta || {};
    if (!m.estimateUsd) return '';
    var usd = m.estimateUsd * samples / ((m.samples && m.samples.default) || 3);
    return '1回あたり約$' + usd.toFixed(2) + '（約' + Math.round(usd * 150) + '円）の目安';
  }

  function box() {
    var b = el('seo-auto');
    if (b) return b;
    var anchor = el('seo-run') && el('seo-run').closest('.toolbar');
    if (!anchor) return null;
    b = document.createElement('div');
    b.id = 'seo-auto';
    b.className = 'aio-auto';
    anchor.parentNode.insertBefore(b, anchor);
    b.addEventListener('click', onClick);
    return b;
  }

  function paint() {
    var b = box();
    if (!b) return;
    var a = state.auto;
    var m = state.meta || {};
    if (!a) {
      b.innerHTML = m.stored === false
        ? '<div class="aio-auto-row"><b>自動計測</b><span class="aio-auto-note">保存先（Upstash Redis）が無いため、自動計測は使えません。設定状況で保存先をつなぐと、毎週自動で測ります。</span></div>'
        : '';
      b.hidden = m.stored !== false;
      return;
    }
    b.hidden = false;
    var s = a.settings || {};
    var on = !!s.on;
    var head = '<div class="aio-auto-row">' +
      '<b>自動計測</b>' +
      '<span class="aio-auto-pill ' + (on ? 'on' : 'off') + '">' + (on ? 'オン・' + everyLabel(s.every) : 'オフ') + '</span>';
    var facts = [];
    if (a.running) facts.push('いま計測しています');
    else if (on && a.nextAt) facts.push('次回 ' + day(a.nextAt) + ' 朝9時ごろ');
    if (a.lastFinishedAt) {
      facts.push('前回 ' + day(a.lastFinishedAt) + (a.lastResult ? '：候補として挙がった ' + pct(a.lastResult.recommendRate) + '・名前が出た ' + pct(a.lastResult.openMentionRate) : ''));
    }
    head += '<span class="aio-auto-facts">' + esc(facts.join('　／　')) + '</span>' +
      '<span class="aio-auto-acts">' +
        '<button type="button" class="ghost" data-act="now"' + (a.running ? ' disabled' : '') + '>今すぐ自動で計測</button>' +
        '<button type="button" class="ghost" data-act="toggle" aria-expanded="' + (state.open ? 'true' : 'false') + '">' + (state.open ? '設定を閉じる' : '設定') + '</button>' +
      '</span></div>';

    var body = '';
    if (a.running && a.progress) {
      var p = a.progress;
      var phase = p.phase === 'judge' ? '回答を読み取っています' : p.phase === 'final' ? '集計しています' : '質問しています';
      var ratio = p.total ? Math.min(1, (p.answered + (p.phase === 'judge' ? p.judged : 0)) / (p.total * 2)) : 0;
      if (p.phase === 'final') ratio = 0.98;
      body += '<div class="aio-auto-prog"><div class="aio-auto-bar"><span style="width:' + Math.round(ratio * 100) + '%"></span></div>' +
        '<p>' + esc(phase) + '… 回答 ' + p.answered + ' / ' + p.total + (p.phase !== 'ask' ? '・読み取り ' + p.judged : '') +
        '。この画面を閉じても、サーバーで最後まで進みます（数分〜十数分）。</p></div>';
      if (a.stale) body += '<p class="aio-auto-warn">しばらく進んでいません。続きを呼び直しました。直らないときは、翌朝の自動処理で続きから再開します。</p>';
    }
    if (a.lastError && a.lastError.message) {
      body += '<p class="aio-auto-warn">' + esc(a.lastError.message) + '</p>';
    }
    if (!a.cronReady && on) {
      body += '<p class="aio-auto-note">毎朝9時の自動実行には、Vercel の環境変数 CRON_SECRET が要ります（未設定です）。未設定のままでも、「今すぐ自動で計測」と、計測の日にこの画面を開いたときの計測は動きます。</p>';
    }
    if (state.open) {
      body += '<div class="aio-auto-form">' +
        '<label><input type="checkbox" id="aa-on"' + (on ? ' checked' : '') + '> 自動で計測する</label>' +
        '<label>間隔 <select id="aa-every">' + EVERY.map(function (e) {
          return '<option value="' + e[0] + '"' + (e[0] === s.every ? ' selected' : '') + '>' + e[1] + '</option>';
        }).join('') + '</select></label>' +
        '<label>1つの質問を聞く回数 <select id="aa-samples">' + SAMPLES.map(function (e) {
          return '<option value="' + e[0] + '"' + (e[0] === s.samples ? ' selected' : '') + '>' + e[1] + '</option>';
        }).join('') + '</select></label>' +
        '<button type="button" data-act="save">保存</button>' +
        '<p class="aio-auto-note" id="aa-cost">' + esc(costOf(s.samples || 3) + NOTE) + '</p>' +
      '</div>';
    }
    body += '<p class="aio-auto-msg" id="aa-msg" role="status"></p>';
    b.innerHTML = head + body;
    var sel = el('aa-samples');
    if (sel) sel.addEventListener('change', function () { var c = el('aa-cost'); if (c) c.textContent = costOf(Number(sel.value)) + NOTE; });

    // 計測中は、手動の計測を重ねないようにします。
    var run = el('seo-run');
    if (run) {
      if (a.running) { run.disabled = true; run.title = '自動計測が終わるまでお待ちください'; }
      else if (run.title === '自動計測が終わるまでお待ちください') { run.title = ''; }
    }
    schedule();
  }

  function say(t, bad) {
    var m = el('aa-msg');
    if (!m) return;
    m.textContent = t || '';
    m.classList.toggle('bad', !!bad);
  }

  async function post(body) {
    try { return await window.lumAdmin.fetch('/api/aio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (_) { return { res: { ok: false, status: 0 }, data: { ok: false, message: '通信できませんでした。' } }; }
  }

  async function onClick(e) {
    var t = e.target.closest('[data-act]');
    if (!t || state.busy) return;
    var act = t.dataset.act;
    if (act === 'toggle') { state.open = !state.open; paint(); return; }
    if (act === 'save') {
      state.busy = true;
      var r = await post({ action: 'auto-save', on: el('aa-on').checked, every: Number(el('aa-every').value), samples: Number(el('aa-samples').value) });
      state.busy = false;
      if (r.data && r.data.ok) { state.auto = r.data.auto; state.open = false; paint(); say('保存しました。'); }
      else say((r.data && r.data.message) || '保存できませんでした。', true);
      return;
    }
    if (act === 'now') {
      var s = (state.auto && state.auto.settings) || {};
      if (!confirm('いまからサーバーで AIO出現率を計測します（' + costOf(s.samples || 3) + '）。\n画面を閉じても最後まで進みます。始めますか？')) return;
      state.busy = true;
      t.disabled = true;
      var r2 = await post({ action: 'auto-now' });
      state.busy = false;
      if (r2.data && r2.data.ok) { state.auto = r2.data.auto; paint(); say('計測を始めました。終わると、下の結果が新しい計測に置き換わります。'); }
      else { t.disabled = false; say((r2.data && r2.data.message) || '始められませんでした。', true); }
    }
  }

  // 計測中は20秒ごとに読み直し、終わったら画面全体を出し直します。
  function schedule() {
    clearTimeout(state.timer);
    if (!state.auto || !state.auto.running) return;
    state.timer = setTimeout(async function () {
      var panel = el('seo-admin');
      if (!panel || !panel.offsetParent) { schedule(); return; }
      var r;
      try { r = await window.lumAdmin.fetch('/api/aio'); } catch (_) { r = null; }
      var next = r && r.data && r.data.meta && r.data.meta.auto;
      if (!next) { schedule(); return; }
      var was = state.auto.running;
      state.auto = next;
      if (was && !next.running && state.reload) state.reload();
      else paint();
    }, 20000);
  }


  /* ---- 計測できなかった理由 ----
     回答が取れなかったとき、これまでは「0%」のカードが並び、理由は
     たたんだ内訳の奥にしかありませんでした。数字より先に、何が起きたかと
     直し方を出します。理由は API が返した英文から読み取ります。 */
  function diagnose(kind, raw) {
    var m = String(raw || '');
    if (/credit balance|purchase credits|billing|insufficient/i.test(m)) return {
      cause: 'Anthropic の残高（クレジット）が足りません。',
      fix: 'console.anthropic.com の「Billing」でクレジットを追加してください。追加すれば、そのまま計測できます。' };
    if (/web.?search/i.test(m) && /(not enabled|disabled|enable|not allowed|organization)/i.test(m)) return {
      cause: 'Anthropic のアカウントで、ウェブ検索がオフになっています。',
      fix: 'console.anthropic.com の組織の設定（Settings › Privacy など）で「Web search」を有効にしてください。' };
    if (kind === 'auth' || /x-api-key|authentication|invalid api key/i.test(m)) return {
      cause: 'Claude のAPIキーが受け付けられませんでした。',
      fix: '設定状況 › キーの入力 で、Claude（ANTHROPIC_API_KEY）を入れ直してください（「この画面で保存」）。' };
    if (kind === 'rate' || /rate.?limit/i.test(m)) return {
      cause: '短い時間に呼びすぎて、Anthropic の上限に当たりました。',
      fix: '数分おいてから「今すぐ自動で計測」を押してください（サーバーで3件ずつ、間をあけて聞きます）。' };
    if (kind === 'timeout') return {
      cause: 'AIの回答が、待てる時間（18秒）を超えました。',
      fix: '「今すぐ自動で計測」はサーバーで1回30秒まで待つので、通りやすくなります。' };
    if (kind === 'request' && /model/i.test(m)) return {
      cause: 'このアカウントでは使えないモデルが指定されていました。',
      fix: '使えるモデル・検索の版へ自動で切り替えて聞き直すようにしました。もう一度計測してください。' };
    if (kind === 'request') return {
      cause: 'AIへの依頼の形が受け付けられませんでした（下の英文が API の返した理由です）。',
      fix: 'モデルとウェブ検索の版を自動で切り替えて聞き直すようにしました。もう一度計測し、同じ英文が出るときはそのままお知らせください。' };
    if (kind === 'server' || /overloaded|529|internal/i.test(m)) return {
      cause: 'Anthropic 側で一時的な障害・混雑が起きていました。',
      fix: '時間をおいて「今すぐ自動で計測」を押してください。' };
    if (kind === 'network') return {
      cause: '通信が途中で切れました。',
      fix: 'もう一度計測すれば、ほとんどの場合は通ります。' };
    return { cause: '原因を特定できませんでした。', fix: '「1問だけ試す」で原因を確かめられます。下の英文をそのままお知らせください。' };
  }

  window.lumAioFail = function (run) {
    var body = el('seo-body');
    if (!body) return;
    var host = el('seo-fail');
    if (!host) {
      host = document.createElement('div');
      host.id = 'seo-fail';
      body.insertBefore(host, body.firstChild);
      host.addEventListener('click', function (e) {
        var t = e.target.closest('[data-fail]');
        if (!t) return;
        if (t.dataset.fail === 'probe') { var p = el('seo-probe'); if (p) p.click(); }
        if (t.dataset.fail === 'now') { var n = document.querySelector('#seo-auto [data-act="now"]'); if (n) n.click(); }
      });
    }
    var s = (run && run.summary) || {};
    var failed = s.failed || 0;
    var none = s.asked === 0 && (s.total || 0) > 0;
    ['seo-cards', 'seo-howto', 'seo-actions'].forEach(function (id) {
      var x = el(id);
      if (x) x.classList.toggle('aio-hide', none);
    });
    if (!failed && !none) {
      // チャットで行った計測は、どう測ったかを一言添えます（数字の読み方が変わるため）。
      if (run && run.source === 'chat') {
        host.hidden = false;
        host.className = 'aio-info';
        host.innerHTML = '<p><b>この計測は、Claude のチャットがウェブ検索で各質問に答えたものです。</b>' +
          'APIの料金はかかっていません。1問1回・AIは Claude だけなので、数字の幅（誤差）は広めです。' +
          (run.note ? '<br><span class="aio-info-sub">' + esc(run.note) + '</span>' : '') + '</p>';
        return;
      }
      host.innerHTML = ''; host.hidden = true; return;
    }
    host.hidden = false;
    var title = none
      ? 'この計測では、AIから回答を1件も取れませんでした。数字は「0%」ではなく「測れていない」状態です。'
      : '回答 ' + (s.total || 0) + ' 回のうち ' + failed + ' 回が取れませんでした。率は取れた分だけで出しています。';
    var rows = (s.errors || []).map(function (e) {
      var d = diagnose(e.kind, e.sample);
      return '<li><b>' + esc(e.label || e.kind) + '（' + e.count + '回）</b> ' + esc(d.cause) +
        '<div class="aio-fail-fix">直し方：' + esc(d.fix) + '</div>' +
        (e.sample ? '<div class="aio-fail-raw">API の返した理由：' + esc(String(e.sample).slice(0, 300)) + '</div>' : '') + '</li>';
    }).join('');
    host.className = 'aio-fail';
    host.innerHTML = '<p class="aio-fail-title">' + esc(title) + '</p>' +
      (rows ? '<ul>' + rows + '</ul>' : '') +
      '<div class="aio-fail-acts">' +
        '<button type="button" data-fail="now">今すぐ自動で計測し直す</button>' +
        '<button type="button" class="ghost" data-fail="probe">1問だけ試して原因を確かめる</button>' +
      '</div>';
  };

  window.lumAioAuto = function (auto, meta, reload) {
    state.auto = auto || null;
    state.meta = meta || null;
    state.reload = reload || null;
    paint();
  };
})();
