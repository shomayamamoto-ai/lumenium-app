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
    if (!a.cronReady) {
      body += '<p class="aio-auto-warn">CRON_SECRET が未設定のため、自動計測は動きません。Vercel の環境変数に入れてください（毎朝の自動処理と同じものです）。</p>';
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

  window.lumAioAuto = function (auto, meta, reload) {
    state.auto = auto || null;
    state.meta = meta || null;
    state.reload = reload || null;
    paint();
  };
})();
