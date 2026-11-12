/* ---- CM制作キット（AIで人物・声・BGMを作り、After Effectsで組み、Claudeが点検する） ----
 *
 *   1 企画      何のCMか・誰に・ひとこと・雰囲気・長さ（15 / 17 / 30秒）・画面の形
 *   2 構成案    Claude がカット割り（秒数）・字幕・ナレーション・各生成AIへの指示文を作る（/api/cm-plan）
 *               人物は全カットで同じ人に見えるよう、固定の描写を決めて全カットの指示文に入れます
 *               秒数・字幕・ナレーションはここで直せます（ナレーションが秒数に収まるかも見ます）
 *   3 素材      動画生成AI（人物の映像）・音声生成AI（ナレーション）・音楽生成AI（BGM）で作り、
 *               決まった名前（S01.mp4 / voice_S01.wav / bgm.wav）で1つのフォルダに入れる
 *   4 AEで組む  After Effects のスクリプト（.jsx）を書き出す。実行すると、コンポジション・仮の板・字幕・
 *               ナレーションの目印を作り、フォルダを選べば素材を秒数どおりに並べ、BGM の音量も整えます
 *   5 点検      書き出した動画をここで開くと、長さ・縦横・真っ暗なコマ・似すぎたカットを機械で調べ、
 *               各カットの1コマを Claude に見せて、構成案どおりか・人物が同じ人か・字幕が読めるかを点検します
 *               （動画はこの端末の中で読み、送るのは切り出した小さな静止画だけです）
 *
 * 作りかけ（企画と構成案）は、この端末のブラウザに残します。 */
(function () {
  'use strict';
  if (window.lumCmKitInit) return;

  var TAB = 'cmkit-admin';
  var SAVE_KEY = 'lum_cmkit_v1';
  var el = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function r1(v) { return Math.round(v * 10) / 10; }
  var DIMS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };
  var TONES = ['あたたかい', '上品・落ち着いた', '元気・明るい', 'かっこいい', '静かでまじめ', 'ユーモア'];
  var COLORS = ['#c23b42', '#2563eb', '#ca8a04', '#16a34a', '#7c3aed', '#0e7490', '#db2777', '#475569'];

  var S = load() || { step: 1, brief: { product: '', target: '', message: '', tone: 'あたたかい', seconds: 17, aspect: '16:9' }, plan: null, check: null };
  var V = { busy: false, frames: null, facts: '' };
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ step: S.step, brief: S.brief, plan: S.plan, check: S.check })); } catch (_) {} }
  function load() { try { var v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return v && v.brief ? v : null; } catch (_) { return null; } }

  function say(m) {
    var t = el('ck-toast');
    if (!t) { t = document.createElement('div'); t.id = 'ck-toast'; t.className = 'ck-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = m; t.hidden = false; clearTimeout(say.h); say.h = setTimeout(function () { t.hidden = true; }, 3600);
  }
  function copy(text) {
    var done = function () { say('コピーしました。'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    else fallback();
    function fallback() { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (_) {} ta.remove(); }
  }
  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' }));
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* 流して返る返事を読み切り、JSON にします。途中の失敗は \u0000 のあとに理由が来ます。 */
  async function stream(body, onProgress) {
    var res;
    try {
      res = await fetch('/api/cm-plan', { method: 'POST', headers: { Authorization: 'Bearer ' + (window.lumAdmin && window.lumAdmin.key ? window.lumAdmin.key() : ''), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (_) { return { error: '通信できませんでした。もう一度お試しください。' }; }
    var ct = res.headers.get('content-type') || '';
    if (!res.ok || /json/.test(ct)) {
      var d = {}; try { d = await res.json(); } catch (_) {}
      if (res.status === 401 && window.lumAdmin) window.lumAdmin.signOut(d.message);
      if (d && d.ok !== false && (d.shots || d.verdict)) return { data: d };
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

  /* 秒数をそろえる（つなぎ目のずれ・最後の秒数）。 */
  function normalize(plan) {
    var total = +S.brief.seconds || 17;
    var sh = (plan.shots || []).slice().sort(function (a, b) { return a.start - b.start; });
    sh.forEach(function (s, i) {
      s.no = i + 1;
      s.start = i === 0 ? 0 : sh[i - 1].end;
      s.end = r1(i === sh.length - 1 ? total : Math.max(s.start + 0.5, Math.min(+s.end || s.start + 2, total - 0.5 * (sh.length - 1 - i))));
      s.start = r1(s.start);
    });
    plan.shots = sh; plan.duration = total;
    return plan;
  }
  function narrationWarn(s) {
    var len = Array.from(String(s.narration || '').replace(/[\s、。！？!?「」]/g, '')).length, room = (s.end - s.start) * 6.5;
    return len > room ? 'ナレーションが ' + len + '字あり、' + r1(s.end - s.start) + '秒では読みきれないかもしれません（目安 ' + Math.floor(room) + '字）。' : '';
  }

  /* ---- After Effects のスクリプト ---- */
  function jsx() {
    var p = S.plan, d = DIMS[S.brief.aspect] || DIMS['16:9'];
    var data = {
      name: ('CM ' + (S.brief.product || '') + ' ' + p.duration + 's').slice(0, 60), w: d[0], h: d[1], duration: p.duration,
      shots: p.shots.map(function (s) { return { no: s.no, start: s.start, end: s.end, scene: s.scene, text: s.onscreen_text || '', narration: s.narration || '', prompt: s.video_prompt_en || '' }; })
    };
    return '﻿' + [
      '// Lumenium CM制作キットが作ったスクリプトです。',
      '// After Effects の「ファイル > スクリプト > スクリプトファイルを実行」で開いてください。',
      '// 作るもの: コンポジション、カットごとの仮の板、字幕、ナレーションの目印（マーカー）。',
      '// 素材のフォルダを選ぶと、S01.mp4 … / voice_S01.wav … / narration.wav / bgm.wav を秒数どおりに並べます。',
      '(function () {',
      '  var P = ' + JSON.stringify(data) + ';',
      '  var W = P.w, H = P.h, i, s;',
      '  function pad(n) { return (n < 10 ? "0" : "") + n; }',
      '  function tp(l) { return l.property("ADBE Transform Group"); }',
      '  var files = [];',
      '  function find(re) { for (var k = 0; k < files.length; k++) { if (files[k] instanceof File && re.test(decodeURI(files[k].name))) return files[k]; } return null; }',
      '  function imp(f) { return app.project.importFile(new ImportOptions(f)); }',
      '  app.beginUndoGroup("CM: " + P.name);',
      '  var comp = app.project.items.addComp(P.name, W, H, 1, P.duration, 30);',
      '  comp.bgColor = [0, 0, 0];',
      '  for (i = P.shots.length - 1; i >= 0; i--) {',
      '    s = P.shots[i];',
      '    var ph = comp.layers.addSolid([0.16 + 0.07 * (i % 3), 0.18 + 0.05 * (i % 2), 0.24 + 0.06 * (i % 4)], "S" + pad(s.no) + " 仮 " + s.scene.substr(0, 18), W, H, 1, P.duration);',
      '    ph.inPoint = s.start; ph.outPoint = s.end; ph.comment = s.prompt;',
      '  }',
      '  var textCount = 0;',
      '  for (i = 0; i < P.shots.length; i++) {',
      '    s = P.shots[i];',
      '    if (s.narration) comp.markerProperty.setValueAtTime(s.start, new MarkerValue("S" + pad(s.no) + " ナレーション: " + s.narration));',
      '    if (!s.text) continue;',
      '    var t = comp.layers.addText(s.text); textCount++;',
      '    t.name = "字幕 S" + pad(s.no);',
      '    var src = t.property("ADBE Text Properties").property("ADBE Text Document"), td = src.value;',
      '    td.fontSize = Math.round(Math.min(W, H) * 0.055); td.fillColor = [1, 1, 1];',
      '    td.applyStroke = true; td.strokeColor = [0, 0, 0]; td.strokeWidth = Math.max(2, Math.round(td.fontSize * 0.08)); td.strokeOverFill = false;',
      '    td.justification = ParagraphJustification.CENTER_JUSTIFY;',
      '    try { td.font = ($.os.indexOf("Windows") >= 0) ? "YuGothic-Bold" : "HiraginoSans-W6"; } catch (e) {}',
      '    src.setValue(td);',
      '    tp(t).property("ADBE Position").setValue([W / 2, H * (H > W ? 0.78 : 0.86)]);',
      '    t.inPoint = s.start; t.outPoint = s.end;',
      '    var op = tp(t).property("ADBE Opacity"), f = Math.min(0.2, (s.end - s.start) / 4);',
      '    op.setValueAtTime(s.start, 0); op.setValueAtTime(s.start + f, 100); op.setValueAtTime(s.end - f, 100); op.setValueAtTime(s.end, 0);',
      '  }',
      '  var folder = Folder.selectDialog("作った素材のフォルダを選んでください（S01.mp4 / voice_S01.wav / bgm.wav など）。キャンセルすると、仮の板と字幕だけで組みます。");',
      '  var placed = [], missing = [];',
      '  if (folder) {',
      '    files = folder.getFiles();',
      '    for (i = 0; i < P.shots.length; i++) {',
      '      s = P.shots[i];',
      '      var nm = "S" + pad(s.no);',
      '      var vf = find(new RegExp("^" + nm + "([_\\\\- ].*)?\\\\.(mp4|mov|m4v|avi|png|jpe?g)$", "i"));',
      '      if (vf) {',
      '        var it = imp(vf), L = comp.layers.add(it);',
      '        L.startTime = s.start; L.inPoint = s.start; L.outPoint = Math.min(s.end, s.start + (it.duration > 0 ? it.duration : P.duration));',
      '        var sc = Math.max(W / it.width, H / it.height) * 100; tp(L).property("ADBE Scale").setValue([sc, sc]);',
      '        L.name = nm + " 映像"; if (textCount) L.moveAfter(comp.layer(textCount + 1));',
      '        if (it.duration > 0 && it.duration < s.end - s.start - 0.05) missing.push(nm + " の映像が " + (Math.round((s.end - s.start - it.duration) * 10) / 10) + " 秒足りません");',
      '        placed.push(nm);',
      '      } else missing.push(nm + " の映像（" + nm + ".mp4）");',
      '      var af = find(new RegExp("^voice_" + nm + "([_\\\\- ].*)?\\\\.(wav|mp3|m4a|aiff?)$", "i"));',
      '      if (af) { var A = comp.layers.add(imp(af)); A.startTime = s.start; A.name = "声 " + nm; A.moveToEnd(); placed.push("声 " + nm); }',
      '    }',
      '    var nf = find(/^narration([_\\- ].*)?\\.(wav|mp3|m4a|aiff?)$/i);',
      '    if (nf) { var N = comp.layers.add(imp(nf)); N.startTime = 0; N.name = "ナレーション"; N.moveToEnd(); placed.push("ナレーション"); }',
      '    var bf = find(/^bgm([_\\- ].*)?\\.(wav|mp3|m4a|aiff?)$/i);',
      '    if (bf) {',
      '      var B = comp.layers.add(imp(bf)); B.startTime = 0; B.name = "BGM"; B.moveToEnd();',
      '      try { var lv = B.property("ADBE Audio Group").property("ADBE Audio Levels"); lv.setValueAtTime(0, [-40, -40]); lv.setValueAtTime(0.4, [-14, -14]); lv.setValueAtTime(P.duration - 0.8, [-14, -14]); lv.setValueAtTime(P.duration, [-40, -40]); } catch (e) {}',
      '      placed.push("BGM");',
      '    } else missing.push("BGM（bgm.wav）");',
      '  }',
      '  comp.openInViewer();',
      '  app.endUndoGroup();',
      '  alert("組み立てました（" + P.duration + "秒・" + W + "×" + H + "）。" + (placed.length ? "\\n並べた素材: " + placed.join("、") : "") + (missing.length ? "\\n足りないもの: " + missing.join("、") : "") + "\\n\\nナレーションの目印は、タイムラインのコンポジションマーカーにあります。書き出したら、CM制作キットの「5 点検」で確かめてください。");',
      '})();',
      ''
    ].join('\n');
  }

  function promptsText() {
    var p = S.plan, out = [];
    out.push('■ CM: ' + (S.brief.product || '') + '（' + p.duration + '秒・' + S.brief.aspect + '）', 'コンセプト: ' + p.concept, 'ひとこと: ' + p.tagline, '');
    out.push('■ 人物（全カット共通）', p.person.description, p.person.prompt_en, '');
    p.shots.forEach(function (s) {
      out.push('■ S' + pad(s.no) + '  ' + s.start + '〜' + s.end + '秒（' + r1(s.end - s.start) + '秒）  → S' + pad(s.no) + '.mp4', '場面: ' + s.scene, 'カメラ: ' + s.camera, '字幕: ' + (s.onscreen_text || '（なし）'), 'ナレーション: ' + (s.narration || '（なし）') + (s.narration ? '  → voice_S' + pad(s.no) + '.wav' : ''), '[動画生成AI] ' + s.video_prompt_en, '[最初の1コマ・画像生成AI] ' + s.image_prompt_en, '');
    });
    out.push('■ 声（音声生成AI）', p.voice.direction, p.voice.prompt_en, '');
    out.push('■ BGM（音楽生成AI）→ bgm.wav', p.bgm.direction + '（' + p.bgm.bpm + ' BPM）', p.bgm.prompt_en, '');
    out.push('■ 仕上げに確かめること'); p.checks.forEach(function (c) { out.push('・' + c); });
    return out.join('\n');
  }

  /* ---- 画面 ---- */
  var STEPS = [[1, '企画'], [2, '構成案'], [3, '素材'], [4, 'AEで組む'], [5, '点検']];
  function paint() {
    var host = el(TAB);
    host.innerHTML = '<div class="ck-wrap"><ol class="ck-steps">' + STEPS.map(function (s) {
      var off = s[0] > 1 && !S.plan;
      return '<li><button type="button" class="ck-step' + (s[0] === S.step ? ' on' : '') + '" data-s="' + s[0] + '"' + (off ? ' disabled' : '') + (s[0] === S.step ? ' aria-current="step"' : '') + '><i>' + s[0] + '</i>' + s[1] + '</button></li>';
    }).join('') + '</ol><div id="ck-body"></div></div>';
    Array.prototype.forEach.call(host.querySelectorAll('.ck-step'), function (b) { b.addEventListener('click', function () { go(+b.dataset.s); }); });
    body();
  }
  function go(n) { S.step = n; save(); paint(); var h = el(TAB); if (h && h.getBoundingClientRect().top < 0) h.scrollIntoView({ block: 'start' }); }

  function timeline(p) {
    return '<div class="ck-tl" aria-label="カット割り">' + p.shots.map(function (s, i) {
      return '<a href="#ck-shot-' + s.no + '" class="ck-seg" style="flex:' + (s.end - s.start) + ';background:' + COLORS[i % COLORS.length] + '" title="S' + pad(s.no) + ' ' + esc(s.scene) + '"><b>S' + pad(s.no) + '</b><span>' + r1(s.end - s.start) + '秒</span></a>';
    }).join('') + '</div><div class="ck-ticks"><span>0秒</span><span>' + p.duration + '秒</span></div>';
  }
  function copyBtn(text, label) { return '<button type="button" class="ck-copy" data-copy="' + esc(text) + '">' + esc(label || 'コピー') + '</button>'; }

  function body() {
    var b = el('ck-body'), n = S.step, B = S.brief, p = S.plan;
    if (n === 1 || !p && n > 1) {
      b.innerHTML =
        '<div class="ck-card">' +
          '<p class="ck-note">人物の映像・ナレーションの声・BGM は生成AIで作り、編集は After Effects で行う前提で、Claude が構成案を作ります。</p>' +
          '<label class="ck-lab">何のCMか<span>商品・サービス・お店の名前と、何をするものか</span><input id="ck-product" type="text" maxlength="200" value="' + esc(B.product) + '" placeholder="例）駅前の美容室「ルメ」。仕事帰りに寄れる、21時まで営業のカット専門店"></label>' +
          '<label class="ck-lab">届けたい相手<input id="ck-target" type="text" maxlength="200" value="' + esc(B.target) + '" placeholder="例）平日は忙しい、30代の会社員"></label>' +
          '<label class="ck-lab">いちばん伝えたい一言<input id="ck-message" type="text" maxlength="200" value="' + esc(B.message) + '" placeholder="例）帰り道に、髪を軽くしていこう"></label>' +
          '<div class="ck-lab">雰囲気<div class="ck-chips">' + TONES.map(function (t) { return '<button type="button" class="ck-chip' + (t === B.tone ? ' on' : '') + '" data-tone="' + esc(t) + '" aria-pressed="' + (t === B.tone) + '">' + esc(t) + '</button>'; }).join('') + '</div></div>' +
          '<div class="ck-two">' +
            '<label class="ck-lab">長さ<select id="ck-sec">' + [15, 17, 30].map(function (s) { return '<option value="' + s + '"' + (s === +B.seconds ? ' selected' : '') + '>' + s + '秒</option>'; }).join('') + '</select></label>' +
            '<label class="ck-lab">画面の形<select id="ck-aspect">' + [['16:9', '横（16:9・テレビ / YouTube）'], ['9:16', '縦（9:16・ショート / リール）'], ['1:1', '正方形（1:1）']].map(function (a) { return '<option value="' + a[0] + '"' + (a[0] === B.aspect ? ' selected' : '') + '>' + a[1] + '</option>'; }).join('') + '</select></label>' +
          '</div>' +
          '<div class="ck-acts"><button type="button" id="ck-make" class="ck-b pri">構成案を作る</button>' + (p ? '<button type="button" id="ck-toplan" class="ck-b">いまの構成案を見る</button>' : '') + '<span id="ck-state" class="ck-state" role="status"></span></div>' +
        '</div>';
      ['product', 'target', 'message'].forEach(function (k) { el('ck-' + k).addEventListener('input', function () { B[k] = this.value; save(); }); });
      el('ck-sec').addEventListener('change', function () { B.seconds = +this.value; save(); });
      el('ck-aspect').addEventListener('change', function () { B.aspect = this.value; save(); });
      Array.prototype.forEach.call(b.querySelectorAll('.ck-chip'), function (c) { c.addEventListener('click', function () { B.tone = c.dataset.tone; save(); body(); }); });
      if (el('ck-toplan')) el('ck-toplan').addEventListener('click', function () { go(2); });
      el('ck-make').addEventListener('click', async function () {
        if (!B.product.trim()) { say('何のCMかを書いてください。'); el('ck-product').focus(); return; }
        if (V.busy) return; V.busy = true; this.disabled = true;
        var st = el('ck-state'); st.textContent = 'Claude が構成案を書いています…（30秒〜1分ほど）';
        var r = await stream({ action: 'plan', product: B.product, target: B.target, message: B.message, tone: B.tone, seconds: B.seconds, aspect: B.aspect }, function (len) { st.textContent = 'Claude が構成案を書いています…（' + len.toLocaleString() + '字）'; });
        V.busy = false; this.disabled = false;
        if (r.error) { st.textContent = r.error; return; }
        S.plan = normalize(r.data); S.check = null; save(); go(2);
      });
      return;
    }
    if (n === 2) {
      b.innerHTML =
        '<div class="ck-card"><div class="ck-head"><div><small>コンセプト</small><b>' + esc(p.concept) + '</b></div><div><small>締めのひとこと</small><b>' + esc(p.tagline) + '</b></div></div>' +
          timeline(p) +
          '<div class="ck-acts"><button type="button" id="ck-all" class="ck-b">指示文をまとめてコピー</button><button type="button" id="ck-txt" class="ck-b">テキストで保存</button><button type="button" id="ck-redo" class="ck-b">企画に戻って作り直す</button><button type="button" id="ck-next" class="ck-b pri">素材づくりへ</button></div></div>' +
        '<div class="ck-card"><h3>人物（全カットで同じ人に見せるための設定）</h3><p class="ck-p">' + esc(p.person.description) + '</p><pre class="ck-pre">' + esc(p.person.prompt_en) + '</pre>' + copyBtn(p.person.prompt_en) + '</div>' +
        p.shots.map(function (s, i) {
          var w = narrationWarn(s);
          return '<div class="ck-card ck-shot" id="ck-shot-' + s.no + '" style="--c:' + COLORS[i % COLORS.length] + '">' +
            '<div class="ck-shothd"><b>S' + pad(s.no) + '</b><label>始まり<input type="number" step="0.1" min="0" class="ck-in" data-i="' + i + '" data-k="start" value="' + s.start + '"' + (i === 0 ? ' disabled' : '') + '></label><label>終わり<input type="number" step="0.1" min="0" class="ck-in" data-i="' + i + '" data-k="end" value="' + s.end + '"' + (i === p.shots.length - 1 ? ' disabled' : '') + '></label><span>' + r1(s.end - s.start) + '秒 → S' + pad(s.no) + '.mp4</span></div>' +
            '<p class="ck-p"><b>場面</b>' + esc(s.scene) + '<br><b>カメラ</b>' + esc(s.camera) + '</p>' +
            '<div class="ck-two"><label class="ck-lab sm">字幕<input type="text" class="ck-in" data-i="' + i + '" data-k="onscreen_text" value="' + esc(s.onscreen_text) + '"></label>' +
            '<label class="ck-lab sm">ナレーション' + (s.narration ? '（→ voice_S' + pad(s.no) + '.wav）' : '') + '<input type="text" class="ck-in" data-i="' + i + '" data-k="narration" value="' + esc(s.narration) + '"></label></div>' +
            (w ? '<p class="ck-warn">' + esc(w) + '</p>' : '') +
            '<div class="ck-pr"><small>動画生成AIへ</small><pre class="ck-pre">' + esc(s.video_prompt_en) + '</pre>' + copyBtn(s.video_prompt_en) + '</div>' +
            '<div class="ck-pr"><small>最初の1コマ（画像生成AIで作ってから動かす場合）</small><pre class="ck-pre">' + esc(s.image_prompt_en) + '</pre>' + copyBtn(s.image_prompt_en) + '</div>' +
          '</div>';
        }).join('') +
        '<div class="ck-card"><h3>声（音声生成AIへ）</h3><p class="ck-p">' + esc(p.voice.direction) + '</p><pre class="ck-pre">' + esc(p.voice.prompt_en) + '</pre>' + copyBtn(p.voice.prompt_en) +
          '<h3 style="margin-top:14px">BGM（音楽生成AIへ・' + p.bgm.bpm + ' BPM）→ bgm.wav</h3><p class="ck-p">' + esc(p.bgm.direction) + '</p><pre class="ck-pre">' + esc(p.bgm.prompt_en) + '</pre>' + copyBtn(p.bgm.prompt_en) + '</div>';
      el('ck-all').addEventListener('click', function () { copy(promptsText()); });
      el('ck-txt').addEventListener('click', function () { download('CM構成案_' + (S.brief.product || 'cm').slice(0, 20) + '.txt', promptsText()); });
      el('ck-redo').addEventListener('click', function () { go(1); });
      el('ck-next').addEventListener('click', function () { go(3); });
      b.addEventListener('change', onEdit);
    } else if (n === 3) {
      var voices = p.shots.filter(function (s) { return s.narration; });
      b.innerHTML =
        '<div class="ck-card"><h3>作るもの（1つのフォルダに、この名前で入れてください）</h3>' +
          '<p class="ck-note">動画生成AI（人物の映像）・音声生成AI（ナレーション）・音楽生成AI（BGM）は、お使いのサービスで作ってください。各カットの指示文は「2 構成案」でコピーできます。人物を同じ人に見せるには、先に1枚の基準の画像を作り、それを各カットの最初の1コマとして使う（画像から動画にする）と崩れにくくなります。</p>' +
          '<table class="ck-tbl"><thead><tr><th>ファイル名</th><th>中身</th><th>長さ</th></tr></thead><tbody>' +
            p.shots.map(function (s) { return '<tr><td><code>S' + pad(s.no) + '.mp4</code></td><td>' + esc(s.scene) + '</td><td>' + r1(s.end - s.start) + '秒以上</td></tr>'; }).join('') +
            voices.map(function (s) { return '<tr><td><code>voice_S' + pad(s.no) + '.wav</code></td><td>「' + esc(s.narration) + '」</td><td>' + r1(s.end - s.start) + '秒以内</td></tr>'; }).join('') +
            '<tr><td><code>bgm.wav</code></td><td>' + esc(p.bgm.direction) + '</td><td>' + p.duration + '秒</td></tr>' +
          '</tbody></table>' +
          '<p class="ck-note">ナレーションを1本で録った場合は <code>narration.wav</code>（0秒から並べます）。mp3・m4a・mov・png でも読み込めます。</p>' +
          '<div class="ck-acts"><button type="button" id="ck-voices" class="ck-b">ナレーション原稿をコピー</button><button type="button" id="ck-next" class="ck-b pri">AEで組む</button></div></div>';
      el('ck-voices').addEventListener('click', function () { copy(voices.map(function (s) { return 'voice_S' + pad(s.no) + '（' + r1(s.end - s.start) + '秒以内）: ' + s.narration; }).join('\n')); });
      el('ck-next').addEventListener('click', function () { go(4); });
    } else if (n === 4) {
      var d = DIMS[S.brief.aspect];
      b.innerHTML =
        '<div class="ck-card"><h3>After Effects で組む</h3>' +
          '<ol class="ck-ol">' +
            '<li>下のボタンでスクリプト（.jsx）を保存します。</li>' +
            '<li>After Effects で「ファイル › スクリプト › スクリプトファイルを実行…」から、保存した .jsx を選びます。</li>' +
            '<li>素材のフォルダを聞かれたら、3 で用意したフォルダを選びます（まだ無ければキャンセル。仮の板と字幕だけで組みます）。</li>' +
            '<li>' + d[0] + '×' + d[1] + '・30fps・' + p.duration + '秒のコンポジションができ、映像・声・BGM が秒数どおりに並びます。BGM は声が聞こえる大きさ（−14dB）に下げ、最初と最後をフェードします。</li>' +
            '<li>字幕の位置・書体、色味、つなぎ目を整えて、H.264（mp4）で書き出します。</li>' +
          '</ol>' +
          '<div class="ck-acts"><button type="button" id="ck-jsx" class="ck-b pri">スクリプトを保存（.jsx）</button><button type="button" id="ck-next" class="ck-b">書き出したら、点検へ</button></div>' +
          '<details class="ck-det"><summary>スクリプトの中身を見る</summary><pre class="ck-pre ck-code">' + esc(jsx().slice(1)) + '</pre></details>' +
        '</div>';
      el('ck-jsx').addEventListener('click', function () { download('CM_' + (S.brief.product || 'cm').replace(/[\\/:*?"<>|\s]/g, '').slice(0, 20) + '_' + p.duration + 's.jsx', jsx(), 'application/javascript;charset=utf-8'); });
      el('ck-next').addEventListener('click', function () { go(5); });
    } else {
      b.innerHTML =
        '<div class="ck-card"><h3>書き出した動画を点検する</h3>' +
          '<p class="ck-note">動画はこの端末の中で読みます。長さ・縦横・真っ暗なコマ・似すぎたカットを機械で調べ、各カットの途中の1コマだけを Claude に見せて、構成案どおりか・人物が同じ人に見えるか・字幕が読めるかを点検します。</p>' +
          '<label class="ck-lab">動画ファイル<input type="file" id="ck-video" accept="video/*"></label>' +
          '<div id="ck-facts"></div><div id="ck-frames" class="ck-frames"></div>' +
          '<div class="ck-acts"><button type="button" id="ck-ask" class="ck-b pri" disabled>Claude に点検してもらう</button><span id="ck-state" class="ck-state" role="status"></span></div>' +
          '<div id="ck-result">' + (S.check ? resultHtml(S.check) : '') + '</div>' +
        '</div>';
      el('ck-video').addEventListener('change', function () { var f = this.files && this.files[0]; if (f) inspect(f); });
      el('ck-ask').addEventListener('click', askCheck);
    }
    Array.prototype.forEach.call(b.querySelectorAll('.ck-copy'), function (c) { c.addEventListener('click', function () { copy(c.dataset.copy); }); });
  }

  function onEdit(e) {
    var x = e.target; if (!x.classList.contains('ck-in') || S.step !== 2) return;
    var sh = S.plan.shots, i = +x.dataset.i, k = x.dataset.k;
    if (k === 'start' || k === 'end') {
      var v = r1(+x.value);
      if (k === 'end' && sh[i + 1]) { v = Math.max(sh[i].start + 0.5, Math.min(v, sh[i + 1].end - 0.5)); sh[i].end = v; sh[i + 1].start = v; }
      if (k === 'start' && sh[i - 1]) { v = Math.max(sh[i - 1].start + 0.5, Math.min(v, sh[i].end - 0.5)); sh[i].start = v; sh[i - 1].end = v; }
      save(); body(); return;
    }
    sh[i][k] = x.value; save();
    if (k === 'narration') body();
  }

  /* ---- 点検（この端末の中で動画を読む） ---- */
  function once(node, ev) { return new Promise(function (res) { var f = function () { node.removeEventListener(ev, f); res(); }; node.addEventListener(ev, f); }); }
  async function inspect(file) {
    var p = S.plan, facts = el('ck-facts'), fr = el('ck-frames');
    facts.innerHTML = '<p class="ck-note">動画を読んでいます…</p>'; fr.innerHTML = ''; el('ck-ask').disabled = true;
    var url = URL.createObjectURL(file), v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    try { await Promise.race([once(v, 'loadeddata'), new Promise(function (_, rj) { setTimeout(function () { rj(new Error('timeout')); }, 15000); })]); }
    catch (_) { facts.innerHTML = '<p class="ck-warn">この動画を読めませんでした。mp4（H.264）で書き出したものをお試しください。</p>'; return; }
    var dur = v.duration, vw = v.videoWidth, vh = v.videoHeight, d = DIMS[S.brief.aspect];
    var cv = document.createElement('canvas'), W = 512, H = Math.round(512 * vh / vw); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d'), small = document.createElement('canvas'); small.width = 16; small.height = 16; var sctx = small.getContext('2d', { willReadFrequently: true });
    var frames = [], flags = [];
    for (var i = 0; i < p.shots.length; i++) {
      var s = p.shots[i], t = Math.min(dur - 0.05, (s.start + s.end) / 2);
      v.currentTime = Math.max(0, t); await once(v, 'seeked');
      ctx.drawImage(v, 0, 0, W, H);
      sctx.drawImage(v, 0, 0, 16, 16);
      var px = sctx.getImageData(0, 0, 16, 16).data, gray = [], sum = 0;
      for (var k = 0; k < px.length; k += 4) { var g = 0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2]; gray.push(g); sum += g; }
      var lum = sum / gray.length, diff = null;
      if (frames.length) { var prev = frames[frames.length - 1].gray, dd = 0; for (var q = 0; q < gray.length; q++) dd += Math.abs(gray[q] - prev[q]); diff = dd / gray.length; }
      var f = { no: s.no, t: t, data: cv.toDataURL('image/jpeg', 0.72).split(',')[1], gray: gray, lum: lum, notes: [] };
      if (lum < 12) f.notes.push('真っ暗に近いコマです');
      if (diff !== null && diff < 3) f.notes.push('ひとつ前のカットとほとんど同じ絵です（つなぎ忘れ？）');
      frames.push(f);
    }
    URL.revokeObjectURL(url);
    var lenOk = Math.abs(dur - p.duration) <= 0.25, ratioOk = Math.abs(vw / vh - d[0] / d[1]) < 0.02;
    if (!lenOk) flags.push('長さが ' + r1(dur) + '秒です（構成案は ' + p.duration + '秒）。');
    if (!ratioOk) flags.push('縦横が ' + vw + '×' + vh + ' です（構成案は ' + S.brief.aspect + '）。');
    frames.forEach(function (f) { f.notes.forEach(function (nt) { flags.push('S' + pad(f.no) + ': ' + nt); }); });
    V.frames = frames;
    V.facts = ['長さ ' + r1(dur) + '秒（構成案 ' + p.duration + '秒）', '大きさ ' + vw + '×' + vh + '（構成案 ' + S.brief.aspect + '）'].concat(flags).join('\n');
    facts.innerHTML = '<ul class="ck-facts">' +
      '<li class="' + (lenOk ? 'ok' : 'ng') + '">長さ ' + r1(dur) + '秒' + (lenOk ? '（構成案どおり）' : '（構成案は ' + p.duration + '秒）') + '</li>' +
      '<li class="' + (ratioOk ? 'ok' : 'ng') + '">大きさ ' + vw + '×' + vh + (ratioOk ? '（' + S.brief.aspect + '）' : '（構成案は ' + S.brief.aspect + '）') + '</li>' +
      flags.filter(function (x) { return /^S\d/.test(x); }).map(function (x) { return '<li class="ng">' + esc(x) + '</li>'; }).join('') +
    '</ul>';
    fr.innerHTML = frames.map(function (f) { return '<figure><img src="data:image/jpeg;base64,' + f.data + '" alt="S' + pad(f.no) + 'の' + r1(f.t) + '秒のコマ"><figcaption>S' + pad(f.no) + '・' + r1(f.t) + '秒' + (f.notes.length ? ' ⚠' : '') + '</figcaption></figure>'; }).join('');
    el('ck-ask').disabled = false;
  }

  async function askCheck() {
    if (!V.frames || V.busy) return;
    V.busy = true; var btn = el('ck-ask'); btn.disabled = true;
    var st = el('ck-state'); st.textContent = 'Claude が各カットを見ています…';
    var plan = { duration: S.plan.duration, aspect: S.brief.aspect, person: S.plan.person.description, shots: S.plan.shots.map(function (s) { return { no: s.no, start: s.start, end: s.end, scene: s.scene, onscreen_text: s.onscreen_text, narration: s.narration }; }) };
    var r = await stream({ action: 'check', plan: plan, facts: V.facts, frames: V.frames.map(function (f) { return { no: f.no, t: f.t, data: f.data }; }) }, function (len) { st.textContent = 'Claude が各カットを見ています…（' + len.toLocaleString() + '字）'; });
    V.busy = false; btn.disabled = false;
    if (r.error) { st.textContent = r.error; return; }
    st.textContent = '';
    S.check = r.data; save();
    el('ck-result').innerHTML = resultHtml(r.data);
  }
  function resultHtml(c) {
    var V2 = { ok: ['そのまま出せます', '#16a34a'], fix: ['直せば出せます', '#ca8a04'], redo: ['作り直しが必要です', '#c23b42'] }[c.verdict] || ['点検しました', '#475569'];
    return '<div class="ck-res"><div class="ck-verdict" style="--c:' + V2[1] + '">' + V2[0] + '</div><p class="ck-p">' + esc(c.overall) + '</p>' +
      '<ul class="ck-shotres">' + (c.shots || []).map(function (s) { return '<li class="' + (s.ok ? 'ok' : 'ng') + '"><b>S' + pad(s.no) + '</b>' + esc(s.comment) + '</li>'; }).join('') + '</ul>' +
      ((c.fixes || []).length ? '<h3>直すこと</h3><ol class="ck-ol">' + c.fixes.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ol>' : '') + '</div>';
  }

  var CSS =
    '.ck-wrap{display:grid;gap:14px;max-width:980px}' +
    '.ck-steps{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}.ck-step{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px 0 6px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}.ck-step i{font-style:normal;display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#eceae5;font-size:12px}.ck-step.on{border-color:var(--ui-accent);background:#fff5f5}.ck-step.on i{background:var(--ui-accent)}.ck-step:disabled{opacity:.45;cursor:default}' +
    '.ck-card{background:#fff;border:1px solid var(--ui-border);border-radius:16px;padding:18px}.ck-card h3{margin:0 0 8px;font-size:14.5px}' +
    '.ck-note{font-size:12.5px;color:#4a4a54;line-height:1.8;margin:0 0 12px}.ck-p{font-size:13.5px;line-height:1.85;margin:0 0 8px}.ck-p b{display:inline-block;font-size:11.5px;color:#5f5f69;margin-right:6px}' +
    '.ck-lab{display:grid;gap:5px;font-size:13px;font-weight:700;color:#2a2a31;margin-bottom:12px}.ck-lab span{font-weight:400;font-size:12px;color:#5f5f69}.ck-lab input[type=text],.ck-lab select{width:100%;box-sizing:border-box;min-height:44px;padding:0 12px;border:1px solid var(--ui-border);border-radius:10px;font:inherit;font-size:14px;background:#faf9f6}.ck-lab.sm{font-size:12px;margin:0}' +
    '.ck-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
    '.ck-chips{display:flex;flex-wrap:wrap;gap:6px}.ck-chip{min-height:38px;padding:0 14px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:13px;cursor:pointer}.ck-chip.on{border-color:var(--ui-accent);background:#fff5f5;font-weight:700}' +
    '.ck-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}.ck-b{display:inline-flex;align-items:center;min-height:42px;padding:0 16px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}.ck-b.pri{background:var(--ui-accent);border-color:var(--ui-accent)}.ck-b:disabled{opacity:.5}.ck-state{font-size:12.5px;color:#4a4a54}' +
    '.ck-head{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.ck-head small{display:block;font-size:11.5px;color:#5f5f69}.ck-head b{font-size:15px;line-height:1.6}' +
    '.ck-tl{display:flex;gap:2px;height:46px;border-radius:10px;overflow:hidden}.ck-seg{display:grid;place-content:center;text-align:center;min-width:0;text-decoration:none;line-height:1.2}.ck-seg b{font-size:12px}.ck-seg span{font-size:10.5px;opacity:.9}.ck-ticks{display:flex;justify-content:space-between;font-size:11px;color:#5f5f69;margin-top:3px}' +
    '.ck-shot{border-left:5px solid var(--c)}.ck-shothd{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:8px}.ck-shothd b{font-size:16px}.ck-shothd label{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#5f5f69}.ck-shothd input{width:72px;min-height:34px;border:1px solid var(--ui-border);border-radius:8px;padding:0 6px;font:inherit}.ck-shothd span{font-size:12px;color:#4a4a54}' +
    '.ck-shot .ck-lab input{min-height:38px}.ck-warn{font-size:12.5px;color:#9a3412;background:#fff7ed;border-radius:8px;padding:6px 10px;margin:8px 0 0}' +
    '.ck-pr{margin-top:10px}.ck-pr small{font-size:11.5px;color:#5f5f69;font-weight:700}.ck-pre{white-space:pre-wrap;word-break:break-word;font:12.5px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f6f5f2;border-radius:8px;padding:9px 11px;margin:4px 0 6px}.ck-code{max-height:320px;overflow:auto;font-size:11.5px}' +
    '.ck-copy{min-height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer}' +
    '.ck-tbl{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:10px}.ck-tbl th,.ck-tbl td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--ui-border);vertical-align:top}.ck-tbl th{font-size:11.5px;color:#5f5f69}.ck-tbl code,.ck-note code{font-size:12px;background:#f3f1ec;padding:1px 5px;border-radius:4px}' +
    '.ck-ol{margin:0 0 8px;padding-left:20px;display:grid;gap:6px;font-size:13.5px;line-height:1.75}.ck-det{margin-top:12px}.ck-det summary{cursor:pointer;font-size:13px;font-weight:700}' +
    '.ck-facts{list-style:none;margin:10px 0;padding:0;display:grid;gap:4px;font-size:13px}.ck-facts li::before{content:"✓ ";color:#16a34a;font-weight:800}.ck-facts li.ng::before{content:"! ";color:#c23b42}' +
    '.ck-frames{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.ck-frames figure{margin:0}.ck-frames img{width:100%;border-radius:8px;display:block;background:#000}.ck-frames figcaption{font-size:11.5px;color:#4a4a54;margin-top:3px}' +
    '.ck-res{margin-top:14px;border-top:1px dashed var(--ui-border);padding-top:14px}.ck-verdict{display:inline-block;font-weight:800;font-size:15px;color:var(--c);border:2px solid var(--c);border-radius:999px;padding:4px 14px;margin-bottom:8px}' +
    '.ck-shotres{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:5px}.ck-shotres li{font-size:13px;line-height:1.7;padding:6px 10px;border-radius:8px;background:#f0fdf4}.ck-shotres li.ng{background:#fff7f7}.ck-shotres b{margin-right:8px}' +
    '.ck-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:4500;background:#17171c;color:#fff;border-radius:999px;padding:10px 18px;font-size:13.5px;max-width:calc(100vw - 32px)}' +
    '#shell .ck-b,#shell .ck-step,#shell .ck-chip,#shell .ck-copy{color:#1f2937!important}#shell .ck-b.pri,#shell .ck-step.on i{color:#fff!important}#shell .ck-seg{color:#fff!important}' +
    '@media (max-width:640px){.ck-two,.ck-head{grid-template-columns:1fr}.ck-card{padding:14px}.ck-step{padding:0 10px 0 5px;font-size:12.5px}.ck-seg span{display:none}}';

  window.lumCmKitInit = function () {
    var host = el(TAB);
    if (!host || S.started) return;
    S.started = true;
    var st = document.createElement('style'); st.id = 'ck-css'; st.textContent = CSS; document.head.appendChild(st);
    if (S.step > 1 && !S.plan) S.step = 1;
    paint();
  };
})();
