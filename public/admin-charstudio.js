/* ---- キャラクター工房（何枚描いても同じキャラクターに見せる） ----
 *
 *   1 キャラ設定  名前・年齢・性格・世界観・好きな色・絵柄（ざっくりで可）
 *   2 設定資料    Claude が REFERENCE SHEET を作る（/api/char-plan design）：顔・髪・目・体・服・靴、
 *                 小物、配色（色見本）、表情6つ、絶対に崩さない特徴、どの絵にも入れる固定の描写（英語）、
 *                 三面図・表情集・小物・配色・全身の、画像生成AIへの指示文。設定資料は1枚のページで保存・印刷できます
 *   3 場面        描きたい場面を1行ずつ → 場面ごとの指示文と、複数コマを1枚にする指示文（/api/char-plan scenes）
 *   4 照合        描いた絵を読み込むと、配色が設定どおりかを機械で見て（この端末の中で）、
 *                 Claude が設定資料と1枚ずつ比べ、違う所と、描き直すときに足す一文を返す（/api/char-plan check）
 *
 * 絵を描くのは、お使いの画像生成AIです。ここは、そのAIに渡す指示文と点検を受け持ちます。
 * 作りかけ（設定と設定資料・場面）は、この端末のブラウザに残します（絵は残しません）。 */
(function () {
  'use strict';
  if (window.lumCharStudioInit) return;

  var TAB = 'charstudio-admin';
  var SAVE_KEY = 'lum_charstudio_v1';
  var el = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var STYLES = [['anime', 'アニメ塗り'], ['soft', '柔らかい厚塗り'], ['water', '水彩風'], ['chibi', 'ちびキャラ'], ['manga', 'モノクロ漫画']];
  var SHEET_LABEL = { turnaround: '三面図（正面・横・後ろ）', expressions: '表情集', accessories: '小物', palette: '配色見本', full: '全身・決めポーズ' };

  var S = load() || { step: 1, brief: { name: '', age: '', personality: '', world: '', colors: '', style: 'anime', notes: '' }, design: null, scenesIn: '', layout: '2x2', aspect: '1:1', scenes: null, check: null };
  var V = { busy: false, images: [] };
  function save() { try { var o = {}; for (var k in S) if (k !== 'started') o[k] = S[k]; localStorage.setItem(SAVE_KEY, JSON.stringify(o)); } catch (_) {} }
  function load() { try { var v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return v && v.brief ? v : null; } catch (_) { return null; } }

  function say(m) {
    var t = el('cs-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cs-toast'; t.className = 'cs-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = m; t.hidden = false; clearTimeout(say.h); say.h = setTimeout(function () { t.hidden = true; }, 3600);
  }
  function copy(text) {
    var done = function () { say('コピーしました。'); };
    var fb = function () { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (_) {} ta.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb); else fb();
  }
  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' }));
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function hexOk(h) { return /^#[0-9a-f]{6}$/i.test(String(h || '')) ? h : '#cccccc'; }
  function rgb(h) { h = hexOk(h); return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

  /* 流して返る返事を読み切り、JSON にします（admin-cmkit.js と同じ決まり）。 */
  async function stream(body, onProgress) {
    var res;
    try { res = await fetch('/api/char-plan', { method: 'POST', headers: { Authorization: 'Bearer ' + (window.lumAdmin && window.lumAdmin.key ? window.lumAdmin.key() : ''), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (_) { return { error: '通信できませんでした。もう一度お試しください。' }; }
    var ct = res.headers.get('content-type') || '';
    if (!res.ok || /json/.test(ct)) {
      var d = {}; try { d = await res.json(); } catch (_) {}
      if (res.status === 401 && window.lumAdmin) window.lumAdmin.signOut(d.message);
      if (d && d.ok !== false && (d.palette || d.scenes || d.images)) return { data: d };
      return { error: (d && d.message) || '作れませんでした（' + res.status + '）。' };
    }
    var text = '';
    if (res.body && res.body.getReader) {
      var rd = res.body.getReader(), dec = new TextDecoder();
      for (;;) { var x = await rd.read(); if (x.done) break; text += dec.decode(x.value, { stream: true }); if (onProgress) onProgress(text.length); }
    } else text = await res.text();
    var cut = text.indexOf('\u0000');
    if (cut >= 0) return { error: text.slice(cut + 1) || '途中で止まりました。' };
    try { return { data: JSON.parse(text) }; } catch (_) { return { error: '返事の形が想定と違いました。もう一度お試しください。' }; }
  }

  /* ---- 設定資料（1枚のページ。画面にも、保存するファイルにも同じものを使います） ---- */
  function sheetHtml(d) {
    var A = d.appearance || {};
    return '<article class="cs-sheet">' +
      '<header class="cs-sh-hd"><small>CHARACTER REFERENCE SHEET</small><h2>' + esc(d.name) + '</h2><p>' + esc(d.summary) + '</p></header>' +
      '<section class="cs-sh-grid">' +
        '<div class="cs-sh-box"><h3>見た目</h3><dl>' + [['顔', A.face], ['髪', A.hair], ['目', A.eyes], ['体', A.body], ['服', A.outfit], ['靴', A.shoes]].map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl></div>' +
        '<div class="cs-sh-box"><h3>配色</h3><ul class="cs-pal">' + (d.palette || []).map(function (c) { return '<li><i style="background:' + hexOk(c.hex) + '"></i><b>' + esc(c.name) + '</b><code>' + esc(hexOk(c.hex)) + '</code><span>' + esc(c.where) + '</span></li>'; }).join('') + '</ul></div>' +
        '<div class="cs-sh-box"><h3>表情</h3><ul class="cs-exp">' + (d.expressions || []).map(function (x) { return '<li><b>' + esc(x.label) + '</b><span>' + esc(x.detail) + '</span></li>'; }).join('') + '</ul></div>' +
        '<div class="cs-sh-box"><h3>小物</h3><ul class="cs-acc">' + (d.accessories || []).map(function (x) { return '<li><b>' + esc(x.name) + '</b><span>' + esc(x.detail) + '</span></li>'; }).join('') + '</ul></div>' +
      '</section>' +
      '<div class="cs-sh-keep"><h3>絶対に崩さない特徴</h3><ul>' + (d.must_keep || []).map(function (k) { return '<li>' + esc(k) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="cs-sh-box"><h3>どの絵にも入れる固定の描写</h3><pre class="cs-pre">' + esc(d.fixed_prompt_en) + '</pre><h3>避けるもの</h3><pre class="cs-pre">' + esc(d.negative_en) + '</pre></div>' +
    '</article>';
  }
  var SHEET_CSS =
    '.cs-sheet{background:#fff;border:1px solid #e3e0da;border-radius:16px;padding:20px;color:#17171c}' +
    '.cs-sh-hd small{font-size:11px;letter-spacing:.18em;color:#7c3aed;font-weight:800}.cs-sh-hd h2{margin:2px 0 4px;font-size:24px}.cs-sh-hd p{margin:0 0 14px;font-size:13.5px;line-height:1.8;color:#3f3f46}' +
    '.cs-sh-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:12px}.cs-sh-box{border:1px solid #ece9e3;border-radius:12px;padding:12px 14px}.cs-sh-box h3,.cs-sh-keep h3{margin:0 0 8px;font-size:13px;letter-spacing:.06em}' +
    '.cs-sh-box dl{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;margin:0;font-size:13px;line-height:1.7}.cs-sh-box dt{font-weight:800;color:#6b6b75}.cs-sh-box dd{margin:0}' +
    '.cs-pal{list-style:none;margin:0;padding:0;display:grid;gap:6px}.cs-pal li{display:grid;grid-template-columns:28px auto auto 1fr;gap:8px;align-items:center;font-size:12.5px}.cs-pal i{width:28px;height:28px;border-radius:8px;border:1px solid rgba(0,0,0,.12)}.cs-pal code{font-size:11.5px;color:#52525b}.cs-pal span{color:#52525b}' +
    '.cs-exp,.cs-acc{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:12.5px;line-height:1.7}.cs-exp b,.cs-acc b{margin-right:6px}' +
    '.cs-sh-keep{border:2px solid #7c3aed;border-radius:12px;padding:12px 14px;margin-bottom:12px;background:#faf5ff}.cs-sh-keep ul{margin:0;padding-left:18px;font-size:13px;line-height:1.8}' +
    '.cs-pre{white-space:pre-wrap;word-break:break-word;font:12.5px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f6f5f2;border-radius:8px;padding:9px 11px;margin:0 0 8px}' +
    '@media (max-width:640px){.cs-sh-grid{grid-template-columns:1fr}.cs-sheet{padding:14px}}';

  function sheetFile(d) {
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(d.name) + ' 設定資料</title>' +
      '<style>body{margin:0;padding:24px;background:#f4f2ee;font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif}' + SHEET_CSS + '@media print{body{background:#fff;padding:0}.cs-sheet{border:0}}</style></head><body>' +
      sheetHtml(d) +
      '<section class="cs-sheet" style="margin-top:16px"><h3>設定資料の絵を作る指示文（画像生成AIへ）</h3>' + (d.sheets || []).map(function (s) { return '<h3>' + esc(SHEET_LABEL[s.kind] || s.title) + '</h3><pre class="cs-pre">' + esc(s.prompt_en) + '</pre>'; }).join('') + '</section>' +
      '</body></html>';
  }

  /* ---- 画面 ---- */
  var STEPS = [[1, 'キャラ設定'], [2, '設定資料'], [3, '場面'], [4, '照合']];
  function paint() {
    var host = el(TAB);
    host.innerHTML = '<div class="cs-wrap"><ol class="cs-steps">' + STEPS.map(function (s) {
      return '<li><button type="button" class="cs-step' + (s[0] === S.step ? ' on' : '') + '" data-s="' + s[0] + '"' + (s[0] > 1 && !S.design ? ' disabled' : '') + (s[0] === S.step ? ' aria-current="step"' : '') + '><i>' + s[0] + '</i>' + s[1] + '</button></li>';
    }).join('') + '</ol><div id="cs-body"></div></div>';
    Array.prototype.forEach.call(host.querySelectorAll('.cs-step'), function (b) { b.addEventListener('click', function () { go(+b.dataset.s); }); });
    body();
  }
  function go(n) { S.step = n; save(); paint(); }
  function copyBtn(text) { return '<button type="button" class="cs-copy" data-copy="' + esc(text) + '">コピー</button>'; }
  function field(k, label, ph, hint) { return '<label class="cs-lab">' + label + (hint ? '<span>' + hint + '</span>' : '') + '<input type="text" id="cs-' + k + '" maxlength="200" value="' + esc(S.brief[k]) + '" placeholder="' + esc(ph) + '"></label>'; }

  function body() {
    var b = el('cs-body'), n = S.step, d = S.design;
    if (n === 1 || !d) {
      b.innerHTML = '<div class="cs-card">' +
        '<p class="cs-note">ざっくりで構いません。空いている所は Claude が決めます。決まった設定資料を、どの絵の指示文にも入れることで、何枚描いても同じキャラクターに見せます。</p>' +
        '<div class="cs-two">' + field('name', '名前', '例）ミナ') + field('age', '年齢・性別など', '例）16歳の女の子、高校1年生') + '</div>' +
        field('personality', '性格', '例）明るいけれど、人前では少し照れる') +
        field('world', 'どこで使うか・世界観', '例）お店のSNSの4コマ漫画の看板キャラ。現代の商店街') +
        field('colors', '好きな色・雰囲気', '例）ミントグリーンとクリーム色、さわやか') +
        '<div class="cs-lab">絵柄<div class="cs-chips">' + STYLES.map(function (s) { return '<button type="button" class="cs-chip' + (s[0] === S.brief.style ? ' on' : '') + '" data-style="' + s[0] + '" aria-pressed="' + (s[0] === S.brief.style) + '">' + s[1] + '</button>'; }).join('') + '</div></div>' +
        '<label class="cs-lab">ほかの希望<textarea id="cs-notes" rows="3" maxlength="400" placeholder="例）左耳にだけ星のイヤリング。エプロン姿が基本">' + esc(S.brief.notes) + '</textarea></label>' +
        '<div class="cs-acts"><button type="button" id="cs-make" class="cs-b pri">設定資料を作る</button>' + (d ? '<button type="button" id="cs-tosheet" class="cs-b">いまの設定資料を見る</button>' : '') + '<span id="cs-state" class="cs-state" role="status"></span></div></div>';
      ['name', 'age', 'personality', 'world', 'colors'].forEach(function (k) { el('cs-' + k).addEventListener('input', function () { S.brief[k] = this.value; save(); }); });
      el('cs-notes').addEventListener('input', function () { S.brief.notes = this.value; save(); });
      Array.prototype.forEach.call(b.querySelectorAll('.cs-chip'), function (c) { c.addEventListener('click', function () { S.brief.style = c.dataset.style; save(); body(); }); });
      if (el('cs-tosheet')) el('cs-tosheet').addEventListener('click', function () { go(2); });
      el('cs-make').addEventListener('click', async function () {
        if (V.busy) return; V.busy = true; this.disabled = true;
        var st = el('cs-state'); st.textContent = 'Claude が設定資料を書いています…（30秒〜1分ほど）';
        var r = await stream({ action: 'design', brief: S.brief }, function (len) { st.textContent = 'Claude が設定資料を書いています…（' + len.toLocaleString() + '字）'; });
        V.busy = false; this.disabled = false;
        if (r.error) { st.textContent = r.error; return; }
        S.design = r.data; S.scenes = null; S.check = null; save(); go(2);
      });
    } else if (n === 2) {
      b.innerHTML = sheetHtml(d) +
        '<div class="cs-card"><h3>設定資料の絵を作る（画像生成AIへの指示文）</h3><p class="cs-note">まず「三面図」を作り、気に入った1枚を基準の画像にしてください。以降の絵は、その画像を参照画像として一緒に渡すと、いっそう崩れにくくなります。</p>' +
          (d.sheets || []).map(function (s) { return '<div class="cs-pr"><b>' + esc(SHEET_LABEL[s.kind] || s.title) + '</b><pre class="cs-pre">' + esc(s.prompt_en) + '</pre>' + copyBtn(s.prompt_en) + '</div>'; }).join('') +
          '<div class="cs-acts"><button type="button" id="cs-save" class="cs-b">設定資料をページで保存（印刷できます）</button><button type="button" id="cs-fixed" class="cs-b">固定の描写をコピー</button><button type="button" id="cs-redo" class="cs-b">設定に戻って作り直す</button><button type="button" id="cs-next" class="cs-b pri">場面を描く</button></div></div>';
      el('cs-save').addEventListener('click', function () { download((d.name || 'character') + '_設定資料.html', sheetFile(d), 'text/html;charset=utf-8'); });
      el('cs-fixed').addEventListener('click', function () { copy(d.fixed_prompt_en + '\nNegative: ' + d.negative_en); });
      el('cs-redo').addEventListener('click', function () { go(1); });
      el('cs-next').addEventListener('click', function () { go(3); });
    } else if (n === 3) {
      var sc = S.scenes;
      b.innerHTML = '<div class="cs-card">' +
        '<label class="cs-lab">描きたい場面<span>1行に1場面（8つまで）。4コマなら4行。</span><textarea id="cs-scenes" rows="5" placeholder="例）&#10;朝、店のシャッターを開けて伸びをする&#10;常連のおばあちゃんに新作のパンを渡す&#10;焼きすぎたパンを前に固まる&#10;夕方、売り切れの札を出して笑う">' + esc(S.scenesIn) + '</textarea></label>' +
        '<div class="cs-two"><label class="cs-lab">まとめる形<select id="cs-layout"><option value="2x2"' + (S.layout === '2x2' ? ' selected' : '') + '>2×2のコマ割り</option><option value="4"' + (S.layout === '4' ? ' selected' : '') + '>縦4コマ</option></select></label>' +
        '<label class="cs-lab">画面の形<select id="cs-aspect">' + [['1:1', '正方形'], ['4:5', '縦長（4:5・Instagram）'], ['9:16', '縦（9:16）'], ['16:9', '横（16:9）']].map(function (a) { return '<option value="' + a[0] + '"' + (a[0] === S.aspect ? ' selected' : '') + '>' + a[1] + '</option>'; }).join('') + '</select></label></div>' +
        '<div class="cs-acts"><button type="button" id="cs-mk" class="cs-b pri">場面の指示文を作る</button><span id="cs-state" class="cs-state" role="status"></span></div></div>' +
        (sc ? '<div class="cs-card"><h3>場面ごとの指示文</h3>' + sc.scenes.map(function (s, i) { return '<div class="cs-pr"><b>' + (i + 1) + '. ' + esc(s.title) + '</b>' + (s.note ? '<p class="cs-note">' + esc(s.note) + '</p>' : '') + '<pre class="cs-pre">' + esc(s.prompt_en) + '</pre>' + copyBtn(s.prompt_en) + '</div>'; }).join('') +
          '<div class="cs-pr"><b>全部を1枚に（' + (S.layout === '4' ? '縦4コマ' : '2×2') + '）</b><pre class="cs-pre">' + esc(sc.panel_prompt_en) + '</pre>' + copyBtn(sc.panel_prompt_en) + '</div>' +
          '<div class="cs-acts"><button type="button" id="cs-next" class="cs-b pri">描いた絵を照合する</button></div></div>' : '');
      el('cs-scenes').addEventListener('input', function () { S.scenesIn = this.value; save(); });
      el('cs-layout').addEventListener('change', function () { S.layout = this.value; save(); });
      el('cs-aspect').addEventListener('change', function () { S.aspect = this.value; save(); });
      if (el('cs-next')) el('cs-next').addEventListener('click', function () { go(4); });
      el('cs-mk').addEventListener('click', async function () {
        var lines = S.scenesIn.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        if (!lines.length) { say('描きたい場面を書いてください。'); return; }
        if (V.busy) return; V.busy = true; this.disabled = true;
        var st = el('cs-state'); st.textContent = '場面の指示文を書いています…';
        var r = await stream({ action: 'scenes', design: d, scenes: lines, layout: S.layout, aspect: S.aspect }, function (len) { st.textContent = '場面の指示文を書いています…（' + len.toLocaleString() + '字）'; });
        V.busy = false; this.disabled = false;
        if (r.error) { st.textContent = r.error; return; }
        S.scenes = r.data; save(); body();
      });
    } else {
      b.innerHTML = '<div class="cs-card"><h3>描いた絵を、設定資料と照合する</h3>' +
        '<p class="cs-note">絵はこの端末の中で読みます。まず配色が設定どおりかを機械で見て、そのあと縮小した絵を Claude に見せ、髪・目・服・小物・崩さない特徴が設定どおりかを1枚ずつ点検します（6枚まで）。</p>' +
        '<label class="cs-lab">絵のファイル<input type="file" id="cs-files" accept="image/*" multiple></label>' +
        '<div id="cs-imgs" class="cs-imgs"></div>' +
        '<div class="cs-acts"><button type="button" id="cs-ask" class="cs-b pri"' + (V.images.length ? '' : ' disabled') + '>Claude に照合してもらう</button><span id="cs-state" class="cs-state" role="status"></span></div>' +
        '<div id="cs-result">' + (S.check ? resultHtml(S.check) : '') + '</div></div>';
      el('cs-files').addEventListener('change', function () { readImages(this.files); });
      el('cs-ask').addEventListener('click', askCheck);
      paintImages();
    }
    Array.prototype.forEach.call(b.querySelectorAll('.cs-copy'), function (c) { c.addEventListener('click', function () { copy(c.dataset.copy); }); });
  }

  /* ---- 照合（この端末の中で読む） ---- */
  function loadImg(file) { return new Promise(function (res, rej) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { res({ im: im, url: u }); }; im.onerror = rej; im.src = u; }); }
  /* 絵の中の主な色（4ビットずつにまとめて数え、白と黒に近い背景は除く）。 */
  function mainColors(ctx, w, h) {
    var px = ctx.getImageData(0, 0, w, h).data, count = {};
    for (var i = 0; i < px.length; i += 16) {
      var r = px[i], g = px[i + 1], b = px[i + 2];
      if ((r > 240 && g > 240 && b > 240) || (r < 14 && g < 14 && b < 14)) continue;
      var k = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4); count[k] = (count[k] || 0) + 1;
    }
    return Object.keys(count).sort(function (a, b) { return count[b] - count[a]; }).slice(0, 24).map(function (k) { return k.split(',').map(function (v) { return (+v << 4) + 8; }); });
  }
  async function readImages(files) {
    var list = Array.prototype.slice.call(files || [], 0, 6);
    V.images = [];
    for (var i = 0; i < list.length; i++) {
      try {
        var x = await loadImg(list[i]), s = Math.min(1, 1024 / Math.max(x.im.width, x.im.height));
        var cv = document.createElement('canvas'); cv.width = Math.round(x.im.width * s); cv.height = Math.round(x.im.height * s);
        var ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(x.im, 0, 0, cv.width, cv.height);
        var mc = mainColors(ctx, cv.width, cv.height);
        var pal = (S.design.palette || []).map(function (c) {
          var t = rgb(c.hex), best = 999;
          mc.forEach(function (m) { var dd = Math.sqrt(Math.pow(m[0] - t[0], 2) + Math.pow(m[1] - t[1], 2) + Math.pow(m[2] - t[2], 2)); if (dd < best) best = dd; });
          return { name: c.name, hex: hexOk(c.hex), ok: best < 56 };
        });
        V.images.push({ name: list[i].name, url: x.url, data: cv.toDataURL('image/jpeg', 0.82).split(',')[1], pal: pal });
      } catch (_) { say(list[i].name + ' を読めませんでした。'); }
    }
    paintImages();
    var ask = el('cs-ask'); if (ask) ask.disabled = !V.images.length;
  }
  function paintImages() {
    var box = el('cs-imgs'); if (!box) return;
    box.innerHTML = V.images.map(function (im) {
      var hit = im.pal.filter(function (p) { return p.ok; }).length;
      return '<figure><img src="' + im.url + '" alt="' + esc(im.name) + '"><figcaption><b>' + esc(im.name) + '</b><span>配色 ' + hit + ' / ' + im.pal.length + ' 色が見つかりました</span><span class="cs-dots">' +
        im.pal.map(function (p) { return '<i class="' + (p.ok ? 'ok' : 'ng') + '" style="background:' + p.hex + '" title="' + esc(p.name + (p.ok ? '：見つかりました' : '：見つかりません')) + '"></i>'; }).join('') + '</span></figcaption></figure>';
    }).join('');
  }
  async function askCheck() {
    if (!V.images.length || V.busy) return;
    V.busy = true; var btn = el('cs-ask'); btn.disabled = true;
    var st = el('cs-state'); st.textContent = 'Claude が1枚ずつ見ています…';
    var r = await stream({ action: 'check', design: S.design, images: V.images.map(function (im) { return { name: im.name, data: im.data }; }) }, function (len) { st.textContent = 'Claude が1枚ずつ見ています…（' + len.toLocaleString() + '字）'; });
    V.busy = false; btn.disabled = false;
    if (r.error) { st.textContent = r.error; return; }
    st.textContent = ''; S.check = r.data; save();
    el('cs-result').innerHTML = resultHtml(r.data);
    Array.prototype.forEach.call(el('cs-result').querySelectorAll('.cs-copy'), function (c) { c.addEventListener('click', function () { copy(c.dataset.copy); }); });
  }
  function resultHtml(c) {
    return '<div class="cs-res"><p class="cs-p">' + esc(c.overall) + '</p>' + (c.images || []).map(function (im) {
      var tone = im.score >= 85 ? '#16a34a' : im.score >= 65 ? '#ca8a04' : '#c23b42';
      return '<div class="cs-resitem"><div class="cs-score" style="color:' + tone + '">' + im.score + '</div><div><b>' + esc(im.name) + '</b>' +
        (im.matches.length ? '<p class="cs-ok">合っている: ' + im.matches.map(esc).join('、') + '</p>' : '') +
        (im.differences.length ? '<p class="cs-ng">違う: ' + im.differences.map(esc).join('、') + '</p>' : '') +
        (im.fix_en ? '<pre class="cs-pre">' + esc(im.fix_en) + '</pre>' + copyBtn(im.fix_en) : '') + '</div></div>';
    }).join('') + '</div>';
  }

  var CSS = SHEET_CSS +
    '.cs-wrap{display:grid;gap:14px;max-width:980px}' +
    '.cs-steps{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}.cs-step{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px 0 6px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}.cs-step i{font-style:normal;display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#eceae5;font-size:12px}.cs-step.on{border-color:#7c3aed;background:#faf5ff}.cs-step.on i{background:#7c3aed}.cs-step:disabled{opacity:.45;cursor:default}' +
    '.cs-card{background:#fff;border:1px solid var(--ui-border);border-radius:16px;padding:18px}.cs-card h3{margin:0 0 8px;font-size:14.5px}' +
    '.cs-note{font-size:12.5px;color:#4a4a54;line-height:1.8;margin:0 0 12px}.cs-p{font-size:13.5px;line-height:1.85;margin:0 0 10px}' +
    '.cs-lab{display:grid;gap:5px;font-size:13px;font-weight:700;color:#2a2a31;margin-bottom:12px}.cs-lab span{font-weight:400;font-size:12px;color:#5f5f69}.cs-lab input[type=text],.cs-lab select,.cs-lab textarea{width:100%;box-sizing:border-box;min-height:44px;padding:8px 12px;border:1px solid var(--ui-border);border-radius:10px;font:inherit;font-size:14px;background:#faf9f6}.cs-lab textarea{line-height:1.8;resize:vertical}' +
    '.cs-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
    '.cs-chips{display:flex;flex-wrap:wrap;gap:6px}.cs-chip{min-height:38px;padding:0 14px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:13px;cursor:pointer}.cs-chip.on{border-color:#7c3aed;background:#faf5ff;font-weight:700}' +
    '.cs-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}.cs-b{display:inline-flex;align-items:center;min-height:42px;padding:0 16px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}.cs-b.pri{background:#7c3aed;border-color:#7c3aed}.cs-b:disabled{opacity:.5}.cs-state{font-size:12.5px;color:#4a4a54}' +
    '.cs-pr{margin-top:12px}.cs-pr>b{display:block;font-size:13px;margin-bottom:4px}.cs-copy{min-height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer}' +
    '.cs-imgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-bottom:6px}.cs-imgs figure{margin:0;border:1px solid var(--ui-border);border-radius:12px;overflow:hidden;background:#faf9f6}.cs-imgs img{width:100%;aspect-ratio:1;object-fit:cover;display:block}.cs-imgs figcaption{padding:7px 9px;display:grid;gap:3px;font-size:11.5px}.cs-imgs figcaption b{font-size:12px;word-break:break-all}' +
    '.cs-dots{display:flex;flex-wrap:wrap;gap:3px}.cs-dots i{width:16px;height:16px;border-radius:5px;border:2px solid #16a34a}.cs-dots i.ng{border-color:#c23b42;opacity:.55}' +
    '.cs-res{margin-top:14px;border-top:1px dashed var(--ui-border);padding-top:14px;display:grid;gap:10px}.cs-resitem{display:grid;grid-template-columns:56px 1fr;gap:10px;padding:10px;border:1px solid var(--ui-border);border-radius:12px}.cs-score{font-size:26px;font-weight:800;text-align:center;font-variant-numeric:tabular-nums}.cs-ok,.cs-ng{font-size:12.5px;line-height:1.7;margin:4px 0}.cs-ng{color:#9a3412}' +
    '.cs-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:4500;background:#17171c;color:#fff;border-radius:999px;padding:10px 18px;font-size:13.5px;max-width:calc(100vw - 32px)}' +
    '#shell .cs-b,#shell .cs-step,#shell .cs-chip,#shell .cs-copy{color:#1f2937!important}#shell .cs-b.pri,#shell .cs-step.on i{color:#fff!important}' +
    '@media (max-width:640px){.cs-two{grid-template-columns:1fr}.cs-card{padding:14px}.cs-step{padding:0 10px 0 5px;font-size:12.5px}}';

  window.lumCharStudioInit = function () {
    var host = el(TAB);
    if (!host || S.started) return;
    S.started = true;
    var st = document.createElement('style'); st.id = 'cs-css'; st.textContent = CSS; document.head.appendChild(st);
    if (S.step > 1 && !S.design) S.step = 1;
    paint();
  };
})();
