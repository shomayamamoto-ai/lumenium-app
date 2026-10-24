/* ---- 資料：1分プレゼン（自己紹介のスライドとタイマー） ----
   交流会などで使う自己紹介の1枚を、管理画面でいつでも見られるようにしたものです。
   資料づくりのときに見返す・そのまま全画面で発表する・印刷（PDF）して配る、に使えます。

   元の画面では、進み具合のカード（理想・現在・早い／遅い）が本文の上に重なって
   いました。ここではそのカードを右の列（写真と「次」の下）に並べ、本文とは別の場所に
   置いています。どの画面の大きさでも重なりません。

   中身は api/present.js に保存します（無ければ既定の中身）。写真は /profile.jpg。 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var S = { deck: null, saved: false, left: 60, running: false, timer: 0, clock: 0, editing: false };

  async function api(method, body) {
    try {
      var r = await window.lumAdmin.fetch('/api/present', method === 'GET' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return (r && r.data) || {};
    } catch (_) { return { ok: false, message: '通信できませんでした。' }; }
  }

  var CSS =
    '#present-admin .pr-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}' +
    '#present-admin .pr-bar button{font:inherit;font-size:13px;font-weight:700;padding:9px 14px;border-radius:10px;border:1px solid var(--ui-border,#dcd8ce);background:#fff;color:#17171c;cursor:pointer;min-height:40px}' +
    '#present-admin .pr-bar button.pri{background:#b8892f;border-color:#b8892f;color:#fff}' +
    '.pr-wrap{container-type:inline-size;width:100%}' +
    '.pr-stage{position:relative;aspect-ratio:16/9;width:100%;background:radial-gradient(120% 90% at 30% 0%,#2a1f14 0,#15100b 55%,#0e0b08 100%);color:#f6efe3;border-radius:14px;overflow:hidden;' +
      'font-family:"Hiragino Sans","Yu Gothic UI","Noto Sans JP",system-ui,sans-serif;display:grid;grid-template-columns:minmax(0,1fr) 25cqw;grid-template-rows:auto minmax(0,1fr) auto;column-gap:2.6cqw;padding:2.4cqw 2.6cqw 1.6cqw;box-shadow:0 20px 50px rgba(0,0,0,.35)}' +
    '.pr-top{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;margin-bottom:1.2cqw}' +
    '.pr-ev{font-size:1.05cqw;font-weight:800;letter-spacing:.3em;color:#e9dcc4}' +
    '.pr-cnt{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:1.5cqw;letter-spacing:.12em;color:#d9c39a}' +
    '.pr-main{display:grid;grid-template-columns:9cqw minmax(0,1fr);column-gap:1.6cqw;min-height:0;overflow:hidden}' +
    '.pr-no{font-family:"Hiragino Mincho ProN","Yu Mincho",Georgia,serif;font-size:8.4cqw;line-height:.9;color:#5e4a2f;margin-top:2.2cqw}' +
    '.pr-co{display:flex;align-items:center;gap:.8cqw;font-size:1.05cqw;font-weight:800;letter-spacing:.12em;color:#e9dcc4}' +
    '.pr-badge{font-size:.95cqw;font-weight:800;letter-spacing:.04em;color:#203a7a;background:#dfe8ff;border-radius:999px;padding:.25cqw .9cqw}' +
    '.pr-name{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-weight:800;font-size:5.6cqw;line-height:1.1;margin:.6cqw 0 .5cqw;color:#fffaf0;letter-spacing:.04em}' +
    '.pr-name small{font-size:2cqw;margin-left:1cqw;color:#e9dcc4;letter-spacing:.2em}' +
    '.pr-title{font-size:1.75cqw;font-weight:800;line-height:1.45;color:#f0a33a;margin:0 0 1cqw}' +
    '.pr-sec{border-top:1px solid rgba(233,220,196,.16);padding:.8cqw 0}' +
    '.pr-sec b{display:block;font-size:.9cqw;letter-spacing:.14em;color:#f0a33a;margin-bottom:.35cqw}' +
    '.pr-sec p{margin:0;font-size:1.45cqw;line-height:1.6;color:#fffaf0}' +
    '.pr-chips{display:flex;flex-wrap:wrap;gap:.6cqw}.pr-chips span{font-size:1.25cqw;border:1px solid rgba(233,220,196,.45);border-radius:999px;padding:.35cqw 1cqw;color:#fffaf0}' +
    '.pr-side{grid-row:2/3;grid-column:2;display:flex;flex-direction:column;gap:1cqw;min-height:0}' +
    '.pr-photo{flex:1 1 auto;min-height:0;border-radius:1cqw;overflow:hidden;border:.25cqw solid rgba(233,220,196,.25);background:#2a2018}' +
    '.pr-photo img{width:100%;height:100%;object-fit:cover;object-position:center top;display:block}' +
    '.pr-next{border:1px solid rgba(233,220,196,.22);border-radius:1cqw;padding:.8cqw 1.1cqw;background:rgba(0,0,0,.18)}' +
    '.pr-next b{display:block;font-size:1.15cqw;color:#f0a33a;margin-bottom:.2cqw}.pr-next span{display:block;font-size:1.05cqw;color:#e9dcc4;line-height:1.6}' +
    /* 進み具合のカード（本文に重ならないよう、右の列に入れています） */
    '.pr-pace{border:1px solid rgba(110,231,183,.28);border-radius:1cqw;padding:.8cqw 1.1cqw;background:rgba(6,40,30,.35)}' +
    '.pr-pace .row{display:flex;justify-content:space-between;align-items:baseline;gap:.6cqw}' +
    '.pr-pace .k{font-size:.95cqw;color:#a7f3d0;font-weight:800}.pr-pace .v{font-size:1.35cqw;font-weight:800;color:#6ee7b7;font-variant-numeric:tabular-nums}' +
    '.pr-pace .now .k,.pr-pace .now .v{color:#93c5fd}' +
    '.pr-pace .diff{display:inline-block;margin-top:.4cqw;font-size:.95cqw;font-weight:800;border-radius:999px;padding:.15cqw .8cqw;background:#14532d;color:#bbf7d0}' +
    '.pr-pace .diff.late{background:#7f1d1d;color:#fecaca}.pr-pace .diff.on{background:#78350f;color:#fde68a}' +
    '.pr-pace .meta{font-size:.85cqw;color:#cbd5e1;margin-top:.3cqw}' +
    '.pr-foot{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:2cqw;margin-top:1cqw}' +
    '.pr-cells{display:flex;gap:.28cqw;height:2.4cqw}.pr-cells i{flex:1;border-radius:.3cqw;background:#e6c27a;box-shadow:0 0 .6cqw rgba(230,194,122,.25);transition:opacity .25s}' +
    '.pr-cells i.r{background:#e2453b}.pr-cells i.o{background:#f0862e}.pr-cells i.gone{opacity:.12;box-shadow:none}' +
    '.pr-scale{display:flex;justify-content:space-between;font-size:.85cqw;color:#e9dcc4;margin-top:.4cqw}' +
    '.pr-left{display:flex;align-items:baseline;gap:1.4cqw}.pr-left small{font-size:1.1cqw;font-weight:800;color:#e9dcc4}' +
    '.pr-left b{font-family:"Hiragino Mincho ProN","Yu Mincho",Georgia,serif;font-size:4.6cqw;line-height:1;color:#fffaf0;font-variant-numeric:tabular-nums}' +
    '.pr-stage.is-end .pr-left b{color:#f87171}' +
    '.pr-stage:fullscreen{border-radius:0;width:100vw;height:100vh;aspect-ratio:auto}' +
    '#present-admin .pr-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:10px 14px;margin-top:14px;border:1px solid var(--ui-border,#dcd8ce);border-radius:14px;padding:14px;background:#fff}' +
    '#present-admin .pr-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:#45454f}' +
    '#present-admin .pr-form input,#present-admin .pr-form textarea{font:inherit;font-size:13px;font-weight:400;padding:8px 10px;border:1px solid var(--ui-border,#dcd8ce);border-radius:10px;background:#faf9f6;width:100%}' +
    '#present-admin .pr-form .wide{grid-column:1/-1}' +
    '@media print{body *{visibility:hidden}.pr-wrap,.pr-wrap *{visibility:visible}.pr-wrap{position:fixed;left:0;top:0;width:100%}.pr-stage{border-radius:0;box-shadow:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4 landscape;margin:0}}' +
    '@media (prefers-reduced-motion:reduce){.pr-cells i{transition:none}}';

  function addCss() {
    if (el('pr-css')) return;
    var s = document.createElement('style');
    s.id = 'pr-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function hmToMin(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
  function nowText() { var d = new Date(); return d.getHours() + ':' + pad(d.getMinutes()); }
  /* 理想の時間帯と比べて、いまどれだけ早い／遅いか。 */
  function paceDiff(d) {
    var a = hmToMin(d.idealFrom), b = hmToMin(d.idealTo), n = nowMin();
    if (a == null) return null;
    var fmt = function (m) { m = Math.round(Math.abs(m) * 60); var h = Math.floor(m / 3600), mm = Math.floor(m % 3600 / 60), ss = m % 60; return (h ? h + '時間' : '') + (mm ? mm + '分' : '') + (h ? '' : ss + '秒'); };
    if (n < a) return { cls: '', text: fmt(a - n) + ' 早い' };
    if (b != null && n > b) return { cls: 'late', text: fmt(n - b) + ' 遅れ' };
    return { cls: 'on', text: 'ちょうどの時間です' };
  }

  function stageHtml(d) {
    var total = d.seconds || 60, cells = '';
    var gone = total - S.left;
    for (var i = 0; i < total; i++) {
      // 左の端が最後の数秒（赤→だいだい）。時間がたつと、右から消えていきます。
      var cls = i < 5 ? 'r' : i < 10 ? 'o' : '';
      if (i >= total - gone) cls += ' gone';
      cells += '<i class="' + cls + '"></i>';
    }
    var marks = [];
    for (var m = 0; m <= total; m += Math.max(5, Math.round(total / 12))) marks.push(m);
    var mm = Math.floor(S.left / 60), ss = S.left % 60;
    var p = paceDiff(d);
    return '<div class="pr-stage' + (S.left <= 0 ? ' is-end' : '') + '" id="pr-stage">' +
      '<div class="pr-top"><span class="pr-ev">' + esc(d.event) + '</span><span class="pr-cnt">プレゼン ' + pad(d.number) + ' / ' + pad(d.total) + '</span></div>' +
      '<div class="pr-main"><div class="pr-no" aria-hidden="true">' + pad(d.number) + '</div><div style="min-width:0">' +
        '<div class="pr-co">' + esc(d.company) + (d.badge ? '<span class="pr-badge">★ ' + esc(d.badge) + '</span>' : '') + '</div>' +
        '<div class="pr-name">' + esc(d.name) + (d.honor ? '<small>' + esc(d.honor) + '</small>' : '') + '</div>' +
        '<p class="pr-title">' + esc(d.title) + '</p>' +
        (d.area ? '<div class="pr-sec"><b>活動範囲</b><p>' + esc(d.area) + '</p></div>' : '') +
        (d.targets ? '<div class="pr-sec"><b>つながりたい人</b><p>' + esc(d.targets) + '</p></div>' : '') +
        (d.topics && d.topics.length ? '<div class="pr-sec"><b>こんな話が出たら</b><div class="pr-chips">' + d.topics.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div></div>' : '') +
      '</div></div>' +
      '<div class="pr-side">' +
        '<div class="pr-photo">' + (d.photo ? '<img src="' + esc(d.photo) + '" alt="' + esc(d.name) + 'の写真">' : '') + '</div>' +
        (d.next && d.next.length ? '<div class="pr-next"><b>次 ▶ ' + esc(d.next[0]) + '</b>' + d.next.slice(1).map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') + '</div>' : '') +
        (d.idealFrom ? '<div class="pr-pace" aria-label="進み具合">' +
          '<div class="row"><span class="k">理想</span><span class="v">' + esc(d.idealFrom) + (d.idealTo ? '〜' + esc(d.idealTo) : '') + '</span></div>' +
          '<div class="row now"><span class="k">現在</span><span class="v" id="pr-now">' + esc(nowText()) + '</span></div>' +
          (p ? '<span class="diff ' + p.cls + '" id="pr-diff">' + esc(p.text) + '</span>' : '') +
          ((d.startAt || d.endAt) ? '<div class="meta">' + (d.startAt ? '開始 ' + esc(d.startAt) : '') + (d.endAt ? '　終了 ' + esc(d.endAt) : '') + '</div>' : '') +
        '</div>' : '') +
      '</div>' +
      '<div class="pr-foot"><div><div class="pr-cells" aria-hidden="true">' + cells + '</div>' +
        '<div class="pr-scale">' + marks.map(function (m) { return '<span>' + (m >= 60 && m % 60 === 0 ? (m / 60) + '分' : m) + '</span>'; }).join('') + '</div></div>' +
        '<div class="pr-left"><small>残り</small><b id="pr-left" role="timer" aria-live="off">' + mm + ':' + pad(ss) + '</b></div></div>' +
    '</div>';
  }

  function draw() {
    var host = el('present-admin');
    if (!host || !S.deck) return;
    var d = S.deck;
    var fs = document.fullscreenElement && document.fullscreenElement.id === 'pr-stage';
    host.innerHTML =
      '<p class="share-note ui-intro">交流会などで使う自己紹介の1枚です。資料づくりのときに見返したり、そのまま全画面で発表したり、印刷（PDF）して配れます。進み具合（理想・現在・早い／遅い）は、文字に重ならないよう右の列に並べています。</p>' +
      '<div class="pr-bar">' +
        '<button type="button" class="pri" id="pr-go">' + (S.running ? '一時停止' : S.left < d.seconds ? '続ける' : 'はじめる') + '</button>' +
        '<button type="button" id="pr-reset">はじめに戻す</button>' +
        '<button type="button" id="pr-full">全画面で発表</button>' +
        '<button type="button" id="pr-print">印刷・PDF</button>' +
        '<button type="button" id="pr-edit">' + (S.editing ? '編集を閉じる' : '中身を直す') + '</button>' +
        '<span class="soc-small">キー操作: スペース＝はじめる／止める・R＝戻す・F＝全画面</span>' +
      '</div>' +
      '<div class="pr-wrap" id="pr-wrap">' + stageHtml(d) + '</div>' +
      (S.editing ? formHtml(d) : '');
    bind();
    if (fs) { var st = el('pr-stage'); if (st && st.requestFullscreen) st.requestFullscreen().catch(function () {}); }
  }

  function formHtml(d) {
    var f = function (k, label, v, attrs) { return '<label>' + label + '<input data-k="' + k + '" value="' + esc(v == null ? '' : v) + '"' + (attrs || '') + '></label>'; };
    var t = function (k, label, v, rows, wide) { return '<label class="' + (wide ? 'wide' : '') + '">' + label + '<textarea data-k="' + k + '" rows="' + (rows || 2) + '">' + esc(v) + '</textarea></label>'; };
    return '<div class="pr-form" id="pr-form">' +
      f('event', 'イベントの名前', d.event) + f('number', '自分の番', d.number, ' inputmode="numeric"') + f('total', '全体の人数', d.total, ' inputmode="numeric"') + f('seconds', '持ち時間（秒）', d.seconds, ' inputmode="numeric"') +
      f('company', '会社・団体', d.company) + f('badge', '印（空なら出しません）', d.badge) + f('name', 'お名前', d.name) + f('honor', '呼び方（さん など）', d.honor) +
      t('title', '肩書・一言', d.title, 2, true) + f('area', '活動範囲', d.area) +
      t('targets', 'つながりたい人', d.targets, 3, true) +
      f('topics', 'こんな話が出たら（「、」で区切る・8つまで）', (d.topics || []).join('、')) +
      t('next', '次の人（1行に1人・5人まで）', (d.next || []).join('\n'), 3) +
      f('idealFrom', '理想の時間帯（から）例 08:53', d.idealFrom) + f('idealTo', '理想の時間帯（まで）', d.idealTo) +
      f('startAt', '会の開始', d.startAt) + f('endAt', '会の終了', d.endAt) +
      f('photo', '写真のアドレス（ふだんは /profile.jpg）', d.photo) +
      '<div class="wide" style="display:flex;gap:8px;align-items:center"><button type="button" id="pr-save" style="font:inherit;font-weight:700;padding:9px 16px;border-radius:10px;border:0;background:#b8892f;color:#fff;cursor:pointer">保存する</button><span class="soc-small" id="pr-say" role="status"></span></div>' +
    '</div>';
  }

  function readForm() {
    var d = JSON.parse(JSON.stringify(S.deck));
    document.querySelectorAll('#pr-form [data-k]').forEach(function (x) {
      var k = x.getAttribute('data-k'), v = x.value;
      if (k === 'topics') d[k] = v.split(/[、,，]/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8);
      else if (k === 'next') d[k] = v.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 5);
      else if (k === 'number' || k === 'total' || k === 'seconds') d[k] = Math.max(1, parseInt(v, 10) || d[k]);
      else d[k] = v;
    });
    return d;
  }

  function bind() {
    el('pr-go').addEventListener('click', toggle);
    el('pr-reset').addEventListener('click', reset);
    el('pr-full').addEventListener('click', full);
    el('pr-print').addEventListener('click', function () { window.print(); });
    el('pr-edit').addEventListener('click', function () { S.editing = !S.editing; draw(); });
    var form = el('pr-form');
    if (form) {
      // 直すと、上のスライドにすぐ反映します（保存は「保存する」で）。
      form.addEventListener('input', function () { S.deck = readForm(); if (!S.running) S.left = S.deck.seconds; el('pr-wrap').innerHTML = stageHtml(S.deck); });
      el('pr-save').addEventListener('click', async function () {
        this.disabled = true;
        var r = await api('POST', { deck: readForm() });
        this.disabled = false;
        el('pr-say').textContent = r.message || (r.ok ? '保存しました。' : '保存できませんでした。');
        if (r.ok && r.deck) S.deck = r.deck;
      });
    }
  }

  function tick() {
    if (!S.running) return;
    S.left = Math.max(0, S.left - 1);
    paint();
    if (S.left <= 0) { stop(); try { navigator.vibrate && navigator.vibrate(200); } catch (_) {} }
  }
  function paint() {
    var stage = el('pr-stage');
    if (!stage) return;
    var total = S.deck.seconds, gone = total - S.left;
    stage.querySelectorAll('.pr-cells i').forEach(function (c, i) { c.classList.toggle('gone', i >= total - gone); });
    el('pr-left').textContent = Math.floor(S.left / 60) + ':' + pad(S.left % 60);
    stage.classList.toggle('is-end', S.left <= 0);
    var go = el('pr-go');
    if (go) go.textContent = S.running ? '一時停止' : S.left < total && S.left > 0 ? '続ける' : 'はじめる';
  }
  function paintClock() {
    var n = el('pr-now'); if (n) n.textContent = nowText();
    var dEl = el('pr-diff'), p = S.deck && paceDiff(S.deck);
    if (dEl && p) { dEl.textContent = p.text; dEl.className = 'diff ' + p.cls; }
  }
  function toggle() {
    if (S.running) { stop(); return; }
    if (S.left <= 0) S.left = S.deck.seconds;
    S.running = true;
    clearInterval(S.timer);
    S.timer = setInterval(tick, 1000);
    paint();
  }
  function stop() { S.running = false; clearInterval(S.timer); paint(); }
  function reset() { stop(); S.left = S.deck.seconds; paint(); }
  function full() {
    var st = el('pr-stage');
    if (!st) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    else if (st.requestFullscreen) st.requestFullscreen().catch(function () {});
  }

  function onKey(e) {
    var host = el('present-admin');
    if (!host || host.style.display === 'none' || !S.deck) return;
    var tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'r' || e.key === 'R') reset();
    else if (e.key === 'f' || e.key === 'F') full();
  }

  window.lumPresentInit = async function () {
    addCss();
    var host = el('present-admin');
    if (host) host.innerHTML = '<p class="soc-small">読み込んでいます…</p>';
    var r = await api('GET');
    S.deck = r.deck || null;
    if (!S.deck) { if (host) host.innerHTML = '<p class="msg show">' + esc(r.message || '読み込めませんでした。') + '</p>'; return; }
    S.left = S.deck.seconds || 60;
    draw();
    document.addEventListener('keydown', onKey);
    clearInterval(S.clock);
    S.clock = setInterval(paintClock, 1000);
  };
})();
