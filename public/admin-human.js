/* ---- 人間らしい文章（書く・書き直す・点検する） ----
 *
 * 書き方の決まりと点検は /rhythm.js（src/lib/rhythm.js の写し。AI 側の api/human-write.js と同じもの）。
 *
 *   材料から書く      … その場の材料（いつ・どこで・誰が・何が起きた・言われた言葉）を渡して、AI に書いてもらう
 *   今の文章を直す    … 書いた文章を、事実は変えずに書き直してもらう
 *   点検だけ          … AI を使わず、機械っぽく読まれやすい所を数えるだけ（キーが無くても使えます）
 *
 * 出てきた案は、この画面の中の欄に入るだけです。保存も送信もしません。
 * 案の欄は打ち直せて、打つたびに点検し直します。「指摘のところを直す」は、
 * 点検で見つかったことだけを AI に直してもらいます（1回の呼び出しで直しきれない
 * ことがあるので、押すかどうかは人が決めます）。
 *
 * 文の並びは「緩急の波」として、1文を1本の棒（高さ＝長さ、色＝頭の動き方）で出します。
 * 同じ高さ・同じ色が並んでいたら、平らに読まれている所です。 */
(function () {
  'use strict';
  if (window.lumHumanInit) return;

  var TAB = 'human-admin';
  var el = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var R = function () { return window.lumRhythm; };

  var MODES = [
    { id: 'write', label: '材料から書く', note: 'その場の材料を渡して、AIに書いてもらいます。' },
    { id: 'rewrite', label: '今の文章を直す', note: '書いた文章を、事実は変えずに書き直してもらいます。' },
    { id: 'check', label: '点検だけ', note: 'AIを使わず、機械っぽく読まれやすい所を数えます。' }
  ];
  var PURPOSES = [['blog', 'ブログ記事'], ['sns', 'SNSの投稿'], ['news', 'お知らせ'], ['story', 'エッセイ・語り'], ['free', '指定なし']];
  var LENGTHS = [['short', '短め（150〜250字）'], ['medium', 'ふつう（400〜600字）'], ['long', '長め（900〜1300字）']];
  var MODE_TONE = { observe: '#2563eb', hesitate: '#ca8a04', assert: '#c23b42', explain: '#9ca3af' };

  var S = { started: false, mode: 'write', busy: false, before: null, lastSrc: '' };

  function opts(list, cur) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); }

  function paint() {
    var host = el(TAB);
    var m = S.mode;
    host.innerHTML =
      '<div class="hw-wrap">' +
        '<div class="hw-main">' +
          '<div class="hw-seg" role="tablist" aria-label="使い方">' + MODES.map(function (x) {
            return '<button type="button" role="tab" class="hw-segb' + (x.id === m ? ' on' : '') + '" aria-selected="' + (x.id === m) + '" data-m="' + x.id + '">' + esc(x.label) + '</button>';
          }).join('') + '</div>' +
          '<p class="hw-note">' + esc(MODES.filter(function (x) { return x.id === m; })[0].note) + '</p>' +
          (m === 'write'
            ? '<label class="hw-lab" for="hw-material">その場の材料<span>ここに書いたことだけを使います。いつ・どこで・誰が・何が起きた・言われた言葉・数字など、箇条書きで構いません。</span></label>' +
              '<textarea id="hw-material" rows="7" placeholder="例）&#10;・火曜の午後三時、店の電話が二回鳴って切れた&#10;・あとで、予約ページが携帯で開いていなかったと分かった&#10;・直すのは簡単だと思っていた&#10;・どこまで直せば「開ける」と言えるのか迷っている"></textarea>' +
              '<div class="hw-row">' +
                '<label class="hw-lab sm">書いている人（任意）<input id="hw-voice" type="text" maxlength="80" placeholder="例）小さな美容室の店主"></label>' +
                '<label class="hw-lab sm">用途<select id="hw-purpose">' + opts(PURPOSES, 'blog') + '</select></label>' +
                '<label class="hw-lab sm">長さ<select id="hw-length">' + opts(LENGTHS, 'medium') + '</select></label>' +
              '</div>'
            : '<label class="hw-lab" for="hw-text">' + (m === 'check' ? '点検する文章' : '直したい文章') + '<span>' + (m === 'check' ? '打つたびに点検します。AIは使いません。' : '書いてある事実・数字・固有名詞は変えずに書き直します。') + '</span></label>' +
              '<textarea id="hw-text" rows="9" placeholder="ここに文章を貼ってください"></textarea>' +
              (m === 'rewrite' ? '<div class="hw-row"><label class="hw-lab sm">用途<select id="hw-purpose">' + opts(PURPOSES, 'blog') + '</select></label></div>' : '')) +
          (m === 'check' ? '' :
            '<div class="hw-acts"><button type="button" id="hw-go" class="hw-b pri">' + (m === 'write' ? '書いてもらう' : '書き直してもらう') + '</button><span id="hw-state" class="hw-state" role="status"></span></div>') +
          '<div id="hw-out" class="hw-out" hidden>' +
            '<div class="hw-outhd"><b>案</b><span>まだどこにも入っていません。直してから使ってください。</span></div>' +
            '<textarea id="hw-draft" rows="12" aria-label="案（直せます）"></textarea>' +
            '<div class="hw-acts">' +
              '<button type="button" id="hw-fix" class="hw-b">指摘のところを直す</button>' +
              '<button type="button" id="hw-copy" class="hw-b">コピー</button>' +
              '<button type="button" id="hw-again" class="hw-b">もう一度書いてもらう</button>' +
              '<span id="hw-state2" class="hw-state" role="status"></span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<aside class="hw-side">' +
          '<section class="hw-card" aria-label="点検"><h3>点検</h3><div id="hw-check"><p class="hw-empty">文章が入ると、ここに点検の結果が出ます。</p></div></section>' +
          '<details class="hw-card hw-rules"><summary>この書き方の決まり</summary><ol>' +
            ((R() && R().WRITING_RULES) || []).map(function (r) { return '<li><b>' + esc(r.title) + '</b><span>' + esc(r.body) + '</span></li>'; }).join('') +
          '</ol></details>' +
        '</aside>' +
      '</div>';
    wire();
  }

  /* ---- 点検の見せ方 ---- */
  function checkHtml(r, prev) {
    if (!r || !r.stats.n) return '<p class="hw-empty">文が見つかりませんでした。</p>';
    var tone = r.score >= 85 ? '#16a34a' : r.score >= 65 ? '#ca8a04' : '#c23b42';
    var maxLen = Math.max.apply(null, r.list.map(function (x) { return x.len; }).concat([20]));
    var L = R().MODE_LABEL;
    var bars = r.list.map(function (x, i) {
      var h = Math.max(8, Math.round(x.len / maxLen * 64));
      return '<button type="button" class="hw-bar" data-i="' + i + '" style="height:' + h + 'px;background:' + MODE_TONE[x.mode] + '" title="' + esc((i + 1) + '文目・' + x.len + '字・' + L[x.mode] + '・文末「' + x.end + '」\n' + x.text) + '" aria-label="' + esc((i + 1) + '文目 ' + x.len + '字 ' + L[x.mode]) + '"></button>';
    }).join('');
    var diff = prev && prev.stats.n ? (r.score - prev.score) : null;
    return '<div class="hw-score"><div class="hw-num" style="color:' + tone + '">' + r.score + '<small>/100</small></div><div><b style="color:' + tone + '">' + esc(r.grade) + '</b>' +
        (diff !== null ? '<span class="hw-diff">直す前 ' + prev.score + ' → ' + (diff >= 0 ? '+' : '') + diff + '</span>' : '') +
        '<span class="hw-meta">' + r.stats.n + '文・' + r.stats.chars + '字・1文の平均' + r.stats.avg + '字（' + r.stats.shortest + '〜' + r.stats.longest + '字）</span></div></div>' +
      '<div class="hw-wave" aria-label="緩急の波（1本が1文。高さは長さ、色は頭の動き方）">' + bars + '</div>' +
      '<div class="hw-legend">' + ['observe', 'hesitate', 'assert', 'explain'].map(function (k) { return '<span><i style="background:' + MODE_TONE[k] + '"></i>' + L[k] + '</span>'; }).join('') + '</div>' +
      (r.issues.length
        ? '<ul class="hw-issues">' + r.issues.map(function (x) {
            return '<li class="' + x.level + '"><button type="button" class="hw-iss" data-at="' + (x.at || []).join(',') + '"><b>' + (x.level === 'warn' ? '要注意' : 'ひとこと') + '｜' + esc(x.title) + '</b><span>' + esc(x.detail) + '</span></button></li>';
          }).join('') + '</ul>'
        : '<p class="hw-ok">機械っぽく読まれやすい所は見つかりませんでした。最後は声に出して読んで決めてください。</p>');
  }

  function showCheck(text) {
    var box = el('hw-check');
    if (!box || !R()) return;
    if (!String(text || '').trim()) { box.innerHTML = '<p class="hw-empty">文章が入ると、ここに点検の結果が出ます。</p>'; return; }
    var r = R().analyze(text);
    box.innerHTML = checkHtml(r, S.before);
    S.last = r;
    var fix = el('hw-fix');
    if (fix) fix.disabled = !r.issues.length || S.busy;
  }

  /* 指摘や棒を押すと、その文を案の欄で選びます（どこのことか、すぐ分かるように）。 */
  function selectSentence(i) {
    var ta = el('hw-out') && !el('hw-out').hidden ? el('hw-draft') : el('hw-text');
    if (!ta || !S.last || !S.last.list[i]) return;
    var s = S.last.list[i].text, at = ta.value.indexOf(s);
    if (at < 0) at = ta.value.indexOf(s.slice(0, Math.min(12, s.length)));
    if (at < 0) return;
    ta.focus(); ta.setSelectionRange(at, at + s.length);
  }

  async function call(body, stateEl) {
    S.busy = true;
    var btns = document.querySelectorAll('#' + TAB + ' .hw-b'); Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
    stateEl.textContent = body.mode === 'fix' ? '指摘のところを直しています…' : '書いています…（20秒ほど）';
    var r = null;
    try { r = await window.lumAdmin.fetch('/api/human-write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (_) {}
    S.busy = false;
    Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
    var d = (r && r.data) || {};
    if (!d.ok) { stateEl.textContent = d.message || '書けませんでした。通信を確かめて、もう一度お試しください。'; showCheck(el('hw-draft') && !el('hw-out').hidden ? el('hw-draft').value : ''); return null; }
    stateEl.textContent = d.demo || d.note ? (d.note || 'デモ表示：AIは呼んでいません。') : '';
    return d;
  }

  function wire() {
    var host = el(TAB);
    Array.prototype.forEach.call(host.querySelectorAll('.hw-segb'), function (b) {
      b.addEventListener('click', function () { if (S.mode !== b.dataset.m) { S.mode = b.dataset.m; S.before = null; paint(); } });
    });
    var text = el('hw-text'), draft = el('hw-draft');
    if (text) text.addEventListener('input', function () { if (S.mode === 'check' || el('hw-out').hidden) showCheck(text.value); });
    draft.addEventListener('input', function () { showCheck(draft.value); });
    host.addEventListener('click', function (e) {
      var t = e.target.closest('.hw-bar, .hw-iss');
      if (!t) return;
      var raw = t.classList.contains('hw-bar') ? t.dataset.i : String(t.dataset.at || '').split(',')[0];
      if (raw !== '') selectSentence(+raw);
    });

    var go = el('hw-go');
    async function run() {
      var body;
      if (S.mode === 'write') {
        var mat = el('hw-material').value.trim();
        if (!mat) { el('hw-state').textContent = 'その場の材料を書いてください。'; el('hw-material').focus(); return; }
        body = { mode: 'write', material: mat, voice: el('hw-voice').value.trim(), purpose: el('hw-purpose').value, length: el('hw-length').value };
        S.before = null;
      } else {
        var src = text.value.trim();
        if (!src) { el('hw-state').textContent = '直したい文章を貼ってください。'; text.focus(); return; }
        body = { mode: 'rewrite', text: src, purpose: el('hw-purpose').value };
        S.before = R() ? R().analyze(src) : null;
      }
      S.lastReq = body;
      var d = await call(body, el('hw-state'));
      if (!d) return;
      el('hw-out').hidden = false;
      draft.value = d.text;
      showCheck(d.text);
      el('hw-out').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (go) go.addEventListener('click', run);
    el('hw-again').addEventListener('click', function () { if (S.lastReq) run(); });
    el('hw-fix').addEventListener('click', async function () {
      var v = draft.value.trim();
      if (!v) return;
      var prev = R() ? R().analyze(v) : null;
      var d = await call({ mode: 'fix', text: v, purpose: (el('hw-purpose') || {}).value || 'free' }, el('hw-state2'));
      if (!d) return;
      S.before = prev;
      draft.value = d.text;
      showCheck(d.text);
    });
    el('hw-copy').addEventListener('click', function () {
      var s2 = el('hw-state2');
      var done = function () { s2.textContent = 'コピーしました。'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(draft.value).then(done, function () { draft.select(); document.execCommand('copy'); done(); });
      else { draft.select(); document.execCommand('copy'); done(); }
    });
  }

  var CSS =
    '.hw-wrap{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start}' +
    '.hw-main,.hw-card{background:#fff;border:1px solid var(--ui-border);border-radius:16px;padding:18px}.hw-side{display:grid;gap:14px;position:sticky;top:92px}' +
    '.hw-seg{display:inline-flex;flex-wrap:wrap;gap:4px;padding:4px;background:#f3f1ec;border-radius:999px}.hw-segb{min-height:38px;padding:0 16px;border:0;border-radius:999px;background:transparent;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}.hw-segb.on{background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.12)}' +
    '.hw-note{font-size:13px;color:#5f5f69;margin:10px 0 14px}' +
    '.hw-lab{display:grid;gap:5px;font-size:13px;font-weight:700;color:#2a2a31;margin-bottom:6px}.hw-lab span{font-weight:400;font-size:12px;color:#5f5f69;line-height:1.7}.hw-lab.sm{font-size:12.5px;margin:0}' +
    '.hw-wrap textarea{width:100%;box-sizing:border-box;padding:12px 13px;background:#faf9f6;border:1px solid var(--ui-border);border-radius:12px;font:inherit;font-size:14.5px;line-height:1.9;resize:vertical;color:#17171c}' +
    '.hw-row{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-top:10px}.hw-row input,.hw-row select{min-height:42px;border-radius:10px;border:1px solid var(--ui-border);padding:0 10px;font:inherit;font-size:13.5px;background:#fff;width:100%;box-sizing:border-box}' +
    '.hw-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}.hw-b{min-height:42px;padding:0 16px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}.hw-b.pri{background:var(--ui-accent);border-color:var(--ui-accent)}.hw-b:disabled{opacity:.5;cursor:default}.hw-state{font-size:12.5px;color:#5f5f69}' +
    '.hw-out{margin-top:18px;padding-top:16px;border-top:1px dashed var(--ui-border)}.hw-outhd{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;margin-bottom:8px}.hw-outhd b{font-size:14px}.hw-outhd span{font-size:12px;color:#5f5f69}' +
    '.hw-card h3{margin:0 0 10px;font-size:14px}.hw-empty{font-size:12.5px;color:#5f5f69;margin:0}' +
    '.hw-score{display:flex;gap:12px;align-items:center;margin-bottom:12px}.hw-num{font-size:34px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}.hw-num small{font-size:12px;color:#5f5f69;font-weight:600}.hw-score b{display:block;font-size:13.5px}.hw-meta,.hw-diff{display:block;font-size:11.5px;color:#5f5f69;margin-top:2px}.hw-diff{color:#2a2a31;font-weight:700}' +
    '.hw-wave{display:flex;align-items:flex-end;gap:3px;height:70px;padding:4px 6px;background:#faf9f6;border-radius:10px;overflow-x:auto}.hw-bar{flex:1 0 8px;max-width:22px;min-width:8px;border:0;border-radius:4px 4px 2px 2px;padding:0;cursor:pointer;min-height:0}.hw-bar:hover{outline:2px solid #17171c}' +
    '.hw-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11.5px;color:#5f5f69;margin:6px 0 10px}.hw-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}' +
    '.hw-issues{list-style:none;margin:0;padding:0;display:grid;gap:6px}.hw-iss{display:grid;gap:3px;width:100%;text-align:left;padding:9px 11px;border-radius:10px;border:1px solid var(--ui-border);background:#fbfaf8;font:inherit;cursor:pointer}.hw-issues li.warn .hw-iss{border-color:#efc2c4;background:#fff7f7}.hw-iss b{font-size:12.5px}.hw-iss span{font-size:12px;line-height:1.7}' +
    '.hw-ok{font-size:12.5px;color:#166534;margin:0}' +
    '.hw-rules summary{cursor:pointer;font-weight:700;font-size:14px}.hw-rules ol{margin:10px 0 0;padding-left:18px;display:grid;gap:8px}.hw-rules li b{display:block;font-size:12.5px}.hw-rules li span{font-size:12px;color:#4a4a54;line-height:1.75}' +
    '#shell .hw-segb,#shell .hw-b,#shell .hw-iss{color:#1f2937!important}#shell .hw-b.pri{color:#fff!important}#shell .hw-iss span{color:#4a4a54!important}#shell .hw-iss b{color:#17171c!important}' +
    '@media (max-width:1100px){.hw-wrap{grid-template-columns:1fr}.hw-side{position:static}}' +
    '@media (max-width:620px){.hw-row{grid-template-columns:1fr}.hw-main,.hw-card{padding:14px}.hw-segb{padding:0 12px;font-size:13px}}';

  window.lumHumanInit = function () {
    var host = el(TAB);
    if (!host || S.started) return;
    S.started = true;
    var st = document.createElement('style'); st.id = 'hw-css'; st.textContent = CSS; document.head.appendChild(st);
    paint();
  };
})();
