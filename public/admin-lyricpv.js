/* ---- 文字PV（歌詞を打って、聴きながらタップして、文字が動く動画を作る） ----
 *
 * すべてこの端末の中で動きます。曲のファイルも歌詞も、どこにも送りません
 * （サーバーに保存するのは何もありません。作りかけは、この端末のブラウザにだけ残します。曲は残しません）。
 *
 *   1 素材      曲のファイル（mp3 / m4a / wav）と歌詞（1行＝1フレーズ）。曲なしでも作れます
 *   2 タイミング 曲を聴きながら、歌い出しに合わせて「タップ」。1回押すごとに次の行へ
 *   3 おまかせ   見た目（6種類）を選んで「おまかせ」。行ごとの動き・置き方・強調する1文字を決めます
 *               同じ歌詞が繰り返す行（サビ）は、強く見せます
 *   4 細かく直す 行ごとに、時刻・文字・動き・縦横・大きさ・強調する文字を直せます
 *   5 書き出し   縦（9:16）・横（16:9）・正方形で、動画ファイルにします（曲の長さぶん、実際に再生しながら記録）
 *
 * 描くのは canvas、書き出しは canvas.captureStream と MediaRecorder（音は AudioContext から足します）。
 * スマホでも使えるように、タップの的は大きく、画面は1列に並びます。 */
(function () {
  'use strict';
  if (window.lumLyricPvInit) return;

  var TAB = 'lyricpv-admin';
  var SAVE_KEY = 'lum_lyricpv_v1';
  var el = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function fmt(s) { if (s == null || isNaN(s)) return '--:--.-'; var m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }
  var easeOut = function (k) { return 1 - Math.pow(1 - k, 3); };
  var easeBack = function (k) { var c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ---- 見た目（6種類） ---- */
  var FONT_CSS = 'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@900&family=Noto+Sans+JP:wght@900&family=Dela+Gothic+One&family=RocknRoll+One&family=Yusei+Magic&family=DotGothic16&display=swap';
  var STYLES = [
    { id: 'mincho', label: '明朝・余白', font: '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif', weight: 900, bg: ['#f5f0e6', '#e6dccb'], fg: '#1b1a18', accent: '#b3261e', bgFx: 'grain', fx: ['fade', 'typeon', 'rise', 'fade'], vprob: 0.45 },
    { id: 'pop', label: 'ポップ', font: '"Dela Gothic One", "Hiragino Sans", sans-serif', weight: 400, bg: ['#ffd23f', '#ff8c42'], fg: '#16130f', accent: '#ffffff', bgFx: 'dots', fx: ['pop', 'slam', 'bounce', 'scatter'], vprob: 0.15 },
    { id: 'neon', label: 'ネオン', font: '"RocknRoll One", "Hiragino Sans", sans-serif', weight: 400, bg: ['#07060f', '#1c0b33'], fg: '#ffffff', accent: '#ff3fd8', glow: '#ff3fd8', bgFx: 'lines', fx: ['flicker', 'typeon', 'zoom', 'glitch'], vprob: 0.2 },
    { id: 'hand', label: '手書き・ゆらぎ', font: '"Yusei Magic", "Hiragino Maru Gothic ProN", sans-serif', weight: 400, bg: ['#fbfaf5', '#eef2f7'], fg: '#2b2b2b', accent: '#2f6fd1', bgFx: 'paper', fx: ['typeon', 'wave', 'rise', 'fade'], vprob: 0.25 },
    { id: 'glitch', label: 'グリッチ', font: '"DotGothic16", "Osaka-Mono", monospace', weight: 400, bg: ['#000000', '#0b0f0d'], fg: '#e9ecea', accent: '#00ffa3', glow: '#00ffa3', bgFx: 'scan', fx: ['glitch', 'typeon', 'slam', 'scatter'], vprob: 0.15 },
    { id: 'cinema', label: 'モノクロ・シネマ', font: '"Noto Sans JP", "Hiragino Sans", sans-serif', weight: 900, bg: ['#151515', '#000000'], fg: '#ffffff', accent: '#bdbdbd', bgFx: 'letterbox', fx: ['fade', 'zoom', 'rise', 'fade'], vprob: 0.35 }
  ];
  var STY = {}; STYLES.forEach(function (s) { STY[s.id] = s; });
  var FX = [['fade', 'ふわっと'], ['typeon', '1文字ずつ'], ['rise', '下から'], ['pop', 'はじける'], ['slam', 'ドン'], ['bounce', '弾む'], ['scatter', '集まる'], ['zoom', 'ゆっくり寄る'], ['flicker', '点滅'], ['glitch', 'ノイズ'], ['wave', '波打つ']];
  var FX_LABEL = {}; FX.forEach(function (f) { FX_LABEL[f[0]] = f[1]; });
  var ASPECTS = { '9:16': [720, 1280], '16:9': [1280, 720], '1:1': [960, 960] };

  var P = load() || { title: '', artist: '', lyrics: '', lines: [], style: 'mincho', seed: 1, aspect: '9:16', end: null };
  var S = { started: false, step: 1, audio: null, audioName: '', url: '', tapIdx: 0, playing: false, clock0: 0, clockAt: 0, raf: 0, rec: null, fontsReady: false, actx: null, dest: null };

  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(P)); } catch (_) {} }
  function load() { try { var v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return v && Array.isArray(v.lines) ? v : null; } catch (_) { return null; } }

  /* 歌詞の欄 → 行。すでにある行の時刻と設定は、同じ文字の行に引き継ぎます。 */
  function syncLines() {
    var texts = String(P.lyrics || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 200);
    var old = P.lines;
    P.lines = texts.map(function (tx, i) {
      var o = old[i] && old[i].text === tx ? old[i] : null;
      return o || { text: tx, t: null, fx: 'fade', vert: false, pos: 'center', size: 'M', emph: -1 };
    });
    if (S.tapIdx > P.lines.length) S.tapIdx = P.lines.length;
  }

  /* ---- おまかせ ---- */
  function omakase(reseed) {
    if (reseed) P.seed = (P.seed * 7919 + 13) % 100000 + 1;
    var st = STY[P.style], r = rng(P.seed * 31 + hash(P.style));
    var seen = {};
    P.lines.forEach(function (ln) { seen[ln.text] = (seen[ln.text] || 0) + 1; });
    P.lines.forEach(function (ln, i) {
      var len = ln.text.length, chorus = seen[ln.text] > 1;
      ln.fx = chorus ? (r() < 0.6 ? 'slam' : 'pop') : st.fx[Math.floor(r() * st.fx.length)];
      ln.vert = len <= 12 && r() < st.vprob;
      ln.pos = ln.vert ? (r() < 0.5 ? 'right' : 'center') : ['center', 'center', 'upper', 'lower'][Math.floor(r() * 4)];
      ln.size = chorus || len <= 6 ? 'L' : len >= 18 ? 'S' : 'M';
      // 強調する1文字：漢字を優先して、行の半分くらいに付けます。
      var kanji = []; for (var k = 0; k < len; k++) if (/[一-鿿々]/.test(ln.text[k])) kanji.push(k);
      ln.emph = (chorus || r() < 0.55) && kanji.length ? kanji[Math.floor(r() * kanji.length)] : -1;
      if (i > 0 && P.lines[i - 1].fx === ln.fx && st.fx.length > 1 && !chorus) ln.fx = st.fx[(st.fx.indexOf(ln.fx) + 1) % st.fx.length];
    });
    save();
  }

  /* 時刻を文字数から決めます。all: 全部の行（曲なし）／ それ以外: タップしていない行だけ（前の行のあとに続けます）。 */
  function readTime(ln) { return 1.6 + Array.from(ln.text).length * 0.16; }
  function autoTime(all) {
    var t = 2.5;
    P.lines.forEach(function (ln, i) {
      if (all || ln.t == null) ln.t = Math.round((i ? P.lines[i - 1].t + readTime(P.lines[i - 1]) : t) * 10) / 10;
    });
    var last = P.lines[P.lines.length - 1];
    if (all || P.end == null) P.end = last ? Math.round((last.t + readTime(last) + 1.5) * 10) / 10 : null;
    save();
  }

  function totalLen() {
    var a = S.audio && isFinite(S.audio.duration) ? S.audio.duration : 0;
    var last = P.lines.length ? P.lines[P.lines.length - 1] : null;
    var byLines = last && last.t != null ? last.t + 2 + last.text.length * 0.2 + 2.5 : 0;
    return Math.max(a, P.end || 0, byLines, 5);
  }

  /* ---- 描く ---- */
  function lineSpan(i) {
    var ln = P.lines[i], next = null;
    for (var j = i + 1; j < P.lines.length; j++) if (P.lines[j].t != null) { next = P.lines[j].t; break; }
    var cap = 2.4 + ln.text.length * 0.22 + 2;
    var end = next != null ? Math.min(next, ln.t + cap) : Math.min(P.end || Infinity, ln.t + cap);
    return [ln.t, Math.max(ln.t + 0.5, end)];
  }
  function activeAt(t) {
    var idx = -1;
    for (var i = 0; i < P.lines.length; i++) if (P.lines[i].t != null && P.lines[i].t <= t) idx = i;
    if (idx < 0) return -1;
    return t < lineSpan(idx)[1] ? idx : -2; // -2 = 行と行の間（文字なし）
  }

  function fontOf(st, px) { return st.weight + ' ' + Math.round(px) + 'px ' + st.font; }

  /* 1行の文字の置き場所。横書きは折り返し、縦書きは右から左へ列を作ります。 */
  function layout(ctx, ln, W, H, st) {
    var chars = Array.from(ln.text), n = chars.length, short = Math.min(W, H);
    var base = short * ({ S: 0.075, M: 0.1, L: 0.135 }[ln.size] || 0.1) * (W > H ? 0.85 : 1);
    var out = [];
    if (ln.vert) {
      var maxPer = Math.max(4, Math.floor(H * 0.74 / (base * 1.08)));
      var cols = Math.ceil(n / maxPer), per = Math.ceil(n / cols);
      var colW = base * 1.35, x0 = (ln.pos === 'right' ? W * 0.78 : W / 2 + (cols - 1) * colW / 2);
      for (var i = 0; i < n; i++) {
        var c = Math.floor(i / per), r = i % per, rows = Math.min(per, n - c * per);
        var sz = i === ln.emph ? base * 1.55 : base;
        out.push({ ch: chars[i], x: x0 - c * colW, y: H / 2 - (rows - 1) * base * 1.08 / 2 + r * base * 1.08, size: sz, accent: i === ln.emph, rot: /[ー―〜…—]/.test(chars[i]) ? Math.PI / 2 : 0, punct: /[、。]/.test(chars[i]) });
      }
      return out;
    }
    var maxW = W * 0.84;
    ctx.font = fontOf(st, base);
    var widths = chars.map(function (ch, i) { ctx.font = fontOf(st, i === ln.emph ? base * 1.55 : base); return ctx.measureText(ch).width; });
    // 行に分ける（全角スペース・半角スペース・読点の後ろで切れるなら、そこで）
    var rows = [], cur = [], w = 0;
    for (var k = 0; k < n; k++) {
      if (w + widths[k] > maxW && cur.length) {
        var cut = -1; for (var b = cur.length - 1; b > cur.length / 2; b--) if (/[ 　、]/.test(chars[cur[b]])) { cut = b; break; }
        if (cut > 0) { rows.push(cur.slice(0, cut + 1)); cur = cur.slice(cut + 1); } else { rows.push(cur); cur = []; }
        w = cur.reduce(function (a, j) { return a + widths[j]; }, 0);
      }
      cur.push(k); w += widths[k];
    }
    if (cur.length) rows.push(cur);
    var lh = base * 1.3, cy = { upper: H * 0.3, lower: H * 0.7, center: H / 2 }[ln.pos] || H / 2;
    rows.forEach(function (row, ri) {
      var rw = row.reduce(function (a, j) { return a + widths[j]; }, 0), x = W / 2 - rw / 2;
      row.forEach(function (j) {
        if (/[ 　]/.test(chars[j])) { x += widths[j]; return; }
        out.push({ ch: chars[j], x: x + widths[j] / 2, y: cy - (rows.length - 1) * lh / 2 + ri * lh, size: j === ln.emph ? base * 1.55 : base, accent: j === ln.emph, rot: 0 });
        x += widths[j];
      });
    });
    return out;
  }

  function drawBg(ctx, W, H, t, st, pulse) {
    var g = ctx.createLinearGradient(0, 0, W * 0.3, H);
    g.addColorStop(0, st.bg[0]); g.addColorStop(1, st.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var r = rng(Math.floor(t * 12) + 7), i;
    ctx.save();
    if (st.bgFx === 'grain') { ctx.fillStyle = 'rgba(0,0,0,.05)'; for (i = 0; i < 260; i++) ctx.fillRect(r() * W, r() * H, 1.5, 1.5); }
    else if (st.bgFx === 'dots') {
      ctx.fillStyle = 'rgba(255,255,255,.28)'; var gap = Math.min(W, H) / 16, off = (t * 12) % gap;
      for (var y = -gap; y < H + gap; y += gap) for (var x = -gap; x < W + gap; x += gap) { ctx.beginPath(); ctx.arc(x + off, y + off, gap * 0.16, 0, 7); ctx.fill(); }
    } else if (st.bgFx === 'lines') {
      ctx.strokeStyle = 'rgba(255,63,216,.22)'; ctx.lineWidth = 2;
      for (i = 0; i < 14; i++) { var yy = H * 0.55 + Math.pow((i + (t * 0.8) % 1) / 14, 2) * H * 0.45; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(80,200,255,.14)'; for (i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(W / 2, H * 0.55); ctx.lineTo(W / 2 + i * W * 0.18, H); ctx.stroke(); }
    } else if (st.bgFx === 'paper') {
      ctx.strokeStyle = 'rgba(47,111,209,.10)'; ctx.lineWidth = 1; var lg = Math.min(W, H) / 14;
      for (var py = lg; py < H; py += lg) { ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke(); }
    } else if (st.bgFx === 'scan') {
      ctx.fillStyle = 'rgba(255,255,255,.035)'; for (var sy = (t * 40) % 4; sy < H; sy += 4) ctx.fillRect(0, sy, W, 1);
      if (r() < 0.12) { ctx.fillStyle = 'rgba(0,255,163,.08)'; ctx.fillRect(0, r() * H, W, r() * H * 0.05); }
    } else if (st.bgFx === 'letterbox') {
      var v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.6)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#000'; var bar = H * 0.09; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    }
    if (pulse > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (pulse * 0.22) + ')'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  function drawChar(ctx, st, c, x, y, sc, rot, alpha, color, glow) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.translate(x, y); if (rot) ctx.rotate(rot); if (sc !== 1) ctx.scale(sc, sc);
    ctx.font = fontOf(st, c.size);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = c.size * 0.35; }
    ctx.fillStyle = color;
    var dx = c.punct ? c.size * 0.32 : 0, dy = c.punct ? -c.size * 0.32 : 0;
    ctx.fillText(c.ch, dx, dy);
    ctx.restore();
  }

  function drawLine(ctx, W, H, t, i, st) {
    var ln = P.lines[i], span = lineSpan(i), t0 = span[0], t1 = span[1], dur = t1 - t0;
    var chars = layout(ctx, ln, W, H, st), n = chars.length || 1;
    var E = Math.min(0.7, dur * 0.4), X = Math.min(0.32, dur * 0.2);
    var lt = t - t0, outK = clamp((t - (t1 - X)) / X, 0, 1), r = rng(hash(ln.text) + i);
    // 強調の文字を、背景に大きく薄く敷きます（文字そのものを絵にする）。
    if (ln.emph >= 0 && chars.length) {
      var em = Array.from(ln.text)[ln.emph];
      ctx.save(); ctx.globalAlpha = 0.07 * easeOut(clamp(lt / 0.8, 0, 1)) * (1 - outK);
      ctx.font = fontOf(st, Math.min(W, H) * 0.95); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = st.fg;
      ctx.fillText(em, W / 2 + Math.sin(lt * 0.4) * W * 0.02, H / 2); ctx.restore();
    }
    var shake = 0;
    if (ln.fx === 'slam' && lt < 0.45) shake = (1 - lt / 0.45) * Math.min(W, H) * 0.012;
    chars.forEach(function (c, k) {
      var a = 1, sc = 1, dx = 0, dy = 0, rot = c.rot, kk, s;
      switch (ln.fx) {
        case 'typeon': s = k * Math.min(0.09, E * 1.6 / n); a = clamp((lt - s) / 0.06, 0, 1); break;
        case 'rise': s = k * 0.035; kk = easeOut(clamp((lt - s) / 0.5, 0, 1)); a = kk; dy = (1 - kk) * c.size * 0.7; break;
        case 'pop': s = k * 0.04; kk = clamp((lt - s) / 0.32, 0, 1); a = kk > 0 ? 1 : 0; sc = kk > 0 ? easeBack(kk) : 0; break;
        case 'slam': kk = clamp(lt / 0.18, 0, 1); sc = 2.3 - 1.3 * easeOut(kk); a = kk; dx = (r() - 0.5) * shake * 2; dy = (r() - 0.5) * shake * 2; break;
        case 'bounce': s = k * 0.05; kk = clamp((lt - s) / 0.45, 0, 1); a = kk > 0 ? 1 : 0; dy = -Math.abs(Math.sin(kk * Math.PI * 1.5)) * (1 - kk) * c.size * 0.9; break;
        case 'scatter': kk = easeOut(clamp((lt - k * 0.015) / 0.7, 0, 1)); var ang = r() * 6.28, dist = Math.max(W, H) * (0.3 + r() * 0.4); dx = Math.cos(ang) * dist * (1 - kk); dy = Math.sin(ang) * dist * (1 - kk); rot += (1 - kk) * (r() - 0.5) * 3; a = kk; break;
        case 'zoom': a = easeOut(clamp(lt / 0.6, 0, 1)); sc = 0.9 + 0.14 * clamp(lt / dur, 0, 1); dx = (c.x - W / 2) * (sc - 1); dy = (c.y - H / 2) * (sc - 1); break;
        case 'flicker': a = lt < E ? (r() < 0.25 + lt / E * 0.7 ? 1 : 0.15) : 1; break;
        case 'glitch': a = clamp(lt / 0.12, 0, 1); if (lt < 0.5 || r() < 0.04) dx = (r() - 0.5) * c.size * 0.5; break;
        case 'wave': a = easeOut(clamp((lt - k * 0.03) / 0.4, 0, 1)); dy = Math.sin(t * 3.2 + k * 0.6) * c.size * 0.08; break;
        default: a = easeOut(clamp((lt - k * 0.02) / 0.6, 0, 1));
      }
      a *= 1 - outK; dy -= outK * c.size * 0.25;
      var color = c.accent ? st.accent : st.fg;
      if (st.id === 'pop' && c.accent) { drawChar(ctx, st, c, c.x + dx + c.size * 0.05, c.y + dy + c.size * 0.05, sc, rot, a, '#16130f'); }
      if (ln.fx === 'glitch' && (lt < 0.5 || r() < 0.05)) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        drawChar(ctx, st, c, c.x + dx - c.size * 0.05, c.y + dy, sc, rot, a * 0.7, '#ff2a6d');
        drawChar(ctx, st, c, c.x + dx + c.size * 0.05, c.y + dy, sc, rot, a * 0.7, '#05d9e8');
        ctx.restore();
      }
      drawChar(ctx, st, c, c.x + dx, c.y + dy, sc, rot, a, color, st.glow && (c.accent || ln.fx === 'flicker') ? st.glow : null);
    });
  }

  function drawTitle(ctx, W, H, t, st, k) {
    if (!P.title && !P.artist) return;
    var short = Math.min(W, H);
    ctx.save(); ctx.globalAlpha = k; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = st.fg;
    if (st.glow) { ctx.shadowColor = st.glow; ctx.shadowBlur = short * 0.03; }
    ctx.font = fontOf(st, short * 0.09); ctx.fillText(P.title || '', W / 2, H / 2 - short * 0.03, W * 0.9);
    ctx.font = fontOf(st, short * 0.04); ctx.fillStyle = st.accent; ctx.fillText(P.artist || '', W / 2, H / 2 + short * 0.08, W * 0.9);
    ctx.restore();
  }

  function render(ctx, W, H, t) {
    var st = STY[P.style] || STYLES[0];
    var i = activeAt(t);
    var pulse = 0;
    if (i >= 0 && (P.lines[i].fx === 'slam' || P.lines[i].fx === 'pop')) pulse = clamp(1 - (t - P.lines[i].t) / 0.18, 0, 1);
    drawBg(ctx, W, H, t, st, pulse);
    var first = null; for (var j = 0; j < P.lines.length; j++) if (P.lines[j].t != null) { first = P.lines[j].t; break; }
    if (first == null || t < first) drawTitle(ctx, W, H, t, st, clamp(t / 0.8, 0, 1) * (first == null ? 1 : clamp((first - t) / 0.5, 0, 1)));
    else if (i >= 0) drawLine(ctx, W, H, t, i, st);
    var end = totalLen();
    if (t > end - 2.2 && (P.title || P.artist)) drawTitle(ctx, W, H, t, st, clamp((t - (end - 2.2)) / 0.8, 0, 1) * 0.9);
  }

  /* ---- 再生（曲があれば曲の時刻、なければ時計） ---- */
  function now() {
    if (S.audio) return S.audio.currentTime;
    return S.playing ? S.clockAt + (performance.now() - S.clock0) / 1000 : S.clockAt;
  }
  function seek(t) {
    t = clamp(t, 0, totalLen());
    if (S.audio) S.audio.currentTime = t; else { S.clockAt = t; S.clock0 = performance.now(); }
    frame();
  }
  function play() {
    if (S.playing) return;
    S.playing = true;
    if (S.audio) S.audio.play().catch(function () { S.playing = false; paintTransport(); });
    else { S.clock0 = performance.now(); }
    loop(); paintTransport();
  }
  function pause() {
    if (!S.playing) return;
    if (S.audio) S.audio.pause(); else S.clockAt = now();
    S.playing = false; paintTransport();
  }
  function loop() {
    cancelAnimationFrame(S.raf);
    var tick = function () {
      frame();
      var host = el(TAB);
      if (!S.recording && host && host.style.display === 'none') { pause(); return; } // ほかの画面に移ったら止める
      if (!S.audio && S.playing && now() >= totalLen()) { pause(); if (!S.recording) S.clockAt = 0; }
      if (S.playing) S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
  }
  function frame() {
    var cv = el('lp-canvas'); if (!cv) return;
    var t = now();
    render(cv.getContext('2d'), cv.width, cv.height, t);
    var tm = el('lp-time'); if (tm) tm.textContent = fmt(t) + ' / ' + fmt(totalLen());
    var bar = el('lp-seek'); if (bar && document.activeElement !== bar) { bar.max = String(totalLen()); bar.value = String(t); }
    if (S.step === 2) paintTapInfo(t);
    var cur = activeAt(t);
    if (S.step === 4 && cur !== S.hl) { S.hl = cur; Array.prototype.forEach.call(document.querySelectorAll('#' + TAB + ' .lp-row'), function (r) { r.classList.toggle('now', +r.dataset.i === cur); }); }
  }
  function paintTransport() { var b = el('lp-play'); if (b) { b.textContent = S.playing ? '一時停止' : '再生'; b.setAttribute('aria-pressed', String(S.playing)); } }

  function sizeCanvas() {
    var cv = el('lp-canvas'); if (!cv) return;
    var a = ASPECTS[P.aspect] || ASPECTS['9:16'];
    cv.width = Math.round(a[0] * 0.6); cv.height = Math.round(a[1] * 0.6);
    cv.style.aspectRatio = a[0] + ' / ' + a[1];
    frame();
  }

  function loadFonts() {
    if (!document.getElementById('lp-fonts')) {
      var l = document.createElement('link'); l.id = 'lp-fonts'; l.rel = 'stylesheet'; l.href = FONT_CSS; document.head.appendChild(l);
    }
    if (!document.fonts || !document.fonts.load) return;
    var txt = (P.title || '') + (P.artist || '') + P.lines.map(function (l) { return l.text; }).join('');
    var st = STY[P.style];
    var fam = st.font.split(',')[0];
    document.fonts.load(st.weight + ' 40px ' + fam, txt || 'あ').then(function () { frame(); }, function () {});
  }

  /* ---- 画面 ---- */
  var STEPS = [[1, '素材'], [2, 'タイミング'], [3, 'おまかせ'], [4, '細かく直す'], [5, '書き出し']];

  function paint() {
    var host = el(TAB);
    host.innerHTML =
      '<div class="lp-wrap">' +
        '<div class="lp-stage">' +
          '<div class="lp-cvbox"><canvas id="lp-canvas" aria-label="文字PVのプレビュー"></canvas></div>' +
          '<div class="lp-trans">' +
            '<button type="button" id="lp-play" class="lp-b pri" aria-pressed="false">再生</button>' +
            '<button type="button" id="lp-back" class="lp-b" aria-label="3秒戻る">−3秒</button>' +
            '<input type="range" id="lp-seek" min="0" step="0.05" value="0" aria-label="再生位置">' +
            '<span id="lp-time" class="lp-time">0:00.0</span>' +
          '</div>' +
        '</div>' +
        '<div class="lp-panel">' +
          '<ol class="lp-steps">' + STEPS.map(function (s) { return '<li><button type="button" class="lp-step' + (s[0] === S.step ? ' on' : '') + '" data-s="' + s[0] + '"' + (s[0] === S.step ? ' aria-current="step"' : '') + '><i>' + s[0] + '</i>' + s[1] + '</button></li>'; }).join('') + '</ol>' +
          '<div id="lp-body" class="lp-body"></div>' +
        '</div>' +
      '</div>';
    Array.prototype.forEach.call(host.querySelectorAll('.lp-step'), function (b) { b.addEventListener('click', function () { go(+b.dataset.s); }); });
    el('lp-play').addEventListener('click', function () { S.playing ? pause() : play(); });
    el('lp-back').addEventListener('click', function () { seek(now() - 3); });
    el('lp-seek').addEventListener('input', function () { seek(+this.value); });
    sizeCanvas(); body(); loadFonts();
  }
  function go(n) {
    S.step = n;
    Array.prototype.forEach.call(document.querySelectorAll('#' + TAB + ' .lp-step'), function (b) { var on = +b.dataset.s === n; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    S.hl = null; body();
  }

  function body() {
    var b = el('lp-body'), n = S.step;
    if (n === 1) {
      b.innerHTML =
        '<label class="lp-lab">曲のファイル<span>mp3・m4a・wav など。この端末の中だけで使い、どこにも送りません。曲なしでも作れます。</span>' +
          '<input type="file" id="lp-audio" accept="audio/*"></label>' +
        '<p class="lp-note" id="lp-audioname">' + (S.audioName ? '読み込み済み：' + esc(S.audioName) : (P.lines.some(function (l) { return l.t != null; }) ? '曲は保存していません。続きから作るときは、同じ曲を読み込み直してください。' : '')) + '</p>' +
        '<div class="lp-two"><label class="lp-lab">曲名<input type="text" id="lp-title" maxlength="60" value="' + esc(P.title) + '"></label>' +
        '<label class="lp-lab">歌っている人<input type="text" id="lp-artist" maxlength="60" value="' + esc(P.artist) + '"></label></div>' +
        '<label class="lp-lab">歌詞<span>1行が1つの画面になります。長い行は、歌の区切りで改行してください。</span>' +
          '<textarea id="lp-lyrics" rows="10" placeholder="例）&#10;夜明け前の駅で&#10;君の名前を呼んだ&#10;まだ 間に合うだろうか">' + esc(P.lyrics) + '</textarea></label>' +
        '<div class="lp-acts"><button type="button" id="lp-next1" class="lp-b pri">タイミングへ進む</button><button type="button" id="lp-noaudio" class="lp-b">曲なしで、時間を自動で決める</button></div>';
      el('lp-audio').addEventListener('change', function () { var f = this.files && this.files[0]; if (f) setAudio(f); });
      el('lp-title').addEventListener('input', function () { P.title = this.value; save(); frame(); });
      el('lp-artist').addEventListener('input', function () { P.artist = this.value; save(); frame(); });
      el('lp-lyrics').addEventListener('input', function () { P.lyrics = this.value; syncLines(); save(); frame(); });
      el('lp-next1').addEventListener('click', function () { if (!P.lines.length) return say('歌詞を書いてください。'); loadFonts(); go(2); });
      el('lp-noaudio').addEventListener('click', function () { if (!P.lines.length) return say('歌詞を書いてください。'); autoTime(true); if (!P.lines.some(function (l) { return l.fx !== 'fade'; })) omakase(false); loadFonts(); seek(0); go(3); });
    } else if (n === 2) {
      b.innerHTML =
        '<p class="lp-note">' + (S.audio ? '「再生」で曲を流し、歌い出しに合わせて大きなボタンを押してください。押すたびに次の行へ進みます。キーボードならスペースキーでも押せます。' : '曲が読み込まれていません。1 で曲を選ぶか、「曲なしで、時間を自動で決める」を使ってください。') + '</p>' +
        '<div class="lp-tapinfo"><div><small>いまの行</small><b id="lp-cur">—</b></div><div><small>次にタップする行</small><b id="lp-nexttxt">—</b></div></div>' +
        '<button type="button" id="lp-tap" class="lp-tap"' + (S.audio ? '' : ' disabled') + '>タップ<small id="lp-tapn"></small></button>' +
        '<div class="lp-acts"><button type="button" id="lp-undo" class="lp-b">1つ戻す</button><button type="button" id="lp-restart" class="lp-b">最初から打ち直す</button><button type="button" id="lp-endtap" class="lp-b">ここで曲を終える</button><button type="button" id="lp-next2" class="lp-b pri">おまかせへ進む</button></div>';
      el('lp-tap').addEventListener('pointerdown', function (e) { e.preventDefault(); tap(); });
      el('lp-tap').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); tap(); } });
      el('lp-undo').addEventListener('click', function () { if (S.tapIdx > 0) { S.tapIdx--; P.lines[S.tapIdx].t = null; save(); seek(Math.max(0, now() - 2)); } });
      el('lp-restart').addEventListener('click', function () { P.lines.forEach(function (l) { l.t = null; }); S.tapIdx = 0; P.end = null; save(); seek(0); });
      el('lp-endtap').addEventListener('click', function () { P.end = Math.round(now() * 10) / 10; save(); say('終わりを ' + fmt(P.end) + ' にしました。'); });
      el('lp-next2').addEventListener('click', function () { var miss = P.lines.filter(function (l) { return l.t == null; }).length; if (miss && P.lines.some(function (l) { return l.t != null; })) autoTime(false); if (!P.lines.some(function (l) { return l.fx !== 'fade'; })) omakase(false); go(3); });
      S.tapIdx = P.lines.findIndex(function (l) { return l.t == null; }); if (S.tapIdx < 0) S.tapIdx = P.lines.length;
      paintTapInfo(now());
    } else if (n === 3) {
      b.innerHTML =
        '<p class="lp-note">見た目を選んで「おまかせ」を押すと、行ごとの動き・置き方・強調する1文字を決めます。同じ歌詞が繰り返す行（サビ）は、強く見せます。気に入るまで何度でも押せます。</p>' +
        '<div class="lp-styles" role="radiogroup" aria-label="見た目">' + STYLES.map(function (s) {
          return '<button type="button" role="radio" aria-checked="' + (s.id === P.style) + '" class="lp-sty' + (s.id === P.style ? ' on' : '') + '" data-id="' + s.id + '" style="--a:' + s.bg[0] + ';--b:' + s.bg[1] + ';--f:' + s.fg + ';--c:' + s.accent + '"><span class="sw">字</span>' + esc(s.label) + '</button>';
        }).join('') + '</div>' +
        '<label class="lp-lab">画面の形<select id="lp-aspect">' + Object.keys(ASPECTS).map(function (k) { return '<option value="' + k + '"' + (k === P.aspect ? ' selected' : '') + '>' + { '9:16': '縦（9:16・ショート / リール）', '16:9': '横（16:9・YouTube）', '1:1': '正方形（1:1）' }[k] + '</option>'; }).join('') + '</select></label>' +
        '<div class="lp-acts"><button type="button" id="lp-omakase" class="lp-b pri">おまかせ</button><button type="button" id="lp-next3" class="lp-b">細かく直す</button><button type="button" id="lp-to5" class="lp-b">書き出しへ</button></div>';
      Array.prototype.forEach.call(b.querySelectorAll('.lp-sty'), function (x) { x.addEventListener('click', function () { P.style = x.dataset.id; omakase(false); body(); loadFonts(); frame(); }); });
      el('lp-aspect').addEventListener('change', function () { P.aspect = this.value; save(); sizeCanvas(); });
      el('lp-omakase').addEventListener('click', function () { omakase(true); var f = P.lines.findIndex(function (l) { return l.t != null; }); if (f >= 0 && !S.playing) seek(P.lines[f].t + 0.05); play(); });
      el('lp-next3').addEventListener('click', function () { go(4); });
      el('lp-to5').addEventListener('click', function () { go(5); });
    } else if (n === 4) {
      b.innerHTML = '<p class="lp-note">行を押すと、そこから再生します。時刻は0.1秒ずつ直せます。</p><div class="lp-rows">' + P.lines.map(function (l, i) {
        var chars = Array.from(l.text);
        return '<div class="lp-row" data-i="' + i + '">' +
          '<button type="button" class="lp-jump" data-i="' + i + '" aria-label="' + (i + 1) + '行目から再生">▶</button>' +
          '<div class="lp-rowmain">' +
            '<input type="text" class="lp-in" data-k="text" data-i="' + i + '" value="' + esc(l.text) + '" aria-label="' + (i + 1) + '行目の文字">' +
            '<div class="lp-rowopts">' +
              '<label>時刻<input type="number" step="0.1" min="0" class="lp-in" data-k="t" data-i="' + i + '" value="' + (l.t == null ? '' : l.t) + '"></label>' +
              '<label>動き<select class="lp-in" data-k="fx" data-i="' + i + '">' + FX.map(function (f) { return '<option value="' + f[0] + '"' + (f[0] === l.fx ? ' selected' : '') + '>' + f[1] + '</option>'; }).join('') + '</select></label>' +
              '<label>向き<select class="lp-in" data-k="vert" data-i="' + i + '"><option value="0"' + (l.vert ? '' : ' selected') + '>横</option><option value="1"' + (l.vert ? ' selected' : '') + '>縦</option></select></label>' +
              '<label>置き方<select class="lp-in" data-k="pos" data-i="' + i + '">' + [['center', '真ん中'], ['upper', '上'], ['lower', '下'], ['right', '右（縦）']].map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === l.pos ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select></label>' +
              '<label>大きさ<select class="lp-in" data-k="size" data-i="' + i + '">' + [['S', '小'], ['M', '中'], ['L', '大']].map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === l.size ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select></label>' +
              '<label>強調<select class="lp-in" data-k="emph" data-i="' + i + '"><option value="-1">なし</option>' + chars.map(function (c, k) { return /\s/.test(c) ? '' : '<option value="' + k + '"' + (k === l.emph ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
      b.addEventListener('change', onRowEdit);
      b.addEventListener('input', onRowInput);
      Array.prototype.forEach.call(b.querySelectorAll('.lp-jump'), function (x) { x.addEventListener('click', function () { var l = P.lines[+x.dataset.i]; if (l.t != null) { seek(Math.max(0, l.t - 0.3)); play(); } }); });
    } else {
      var a = ASPECTS[P.aspect];
      b.innerHTML =
        '<p class="lp-note">曲の最初から最後まで、実際に再生しながら記録します（' + fmt(totalLen()) + '）。記録中は、この画面を開いたままにしてください（ほかのタブに移ると、止まったり、かくついたりします）。</p>' +
        '<dl class="lp-sum"><dt>大きさ</dt><dd>' + a[0] + '×' + a[1] + '</dd><dt>見た目</dt><dd>' + esc(STY[P.style].label) + '</dd><dt>行</dt><dd>' + P.lines.length + '行（時刻なし ' + P.lines.filter(function (l) { return l.t == null; }).length + '行）</dd><dt>音</dt><dd>' + (S.audio ? esc(S.audioName) : 'なし（無音の動画になります）') + '</dd></dl>' +
        '<div class="lp-acts"><button type="button" id="lp-rec" class="lp-b pri">動画にする</button><button type="button" id="lp-stoprec" class="lp-b" hidden>途中で止める</button></div>' +
        '<div class="lp-prog" hidden id="lp-progbox"><div id="lp-progbar"></div></div>' +
        '<div id="lp-result"></div>';
      el('lp-rec').addEventListener('click', record);
      el('lp-stoprec').addEventListener('click', function () { if (S.rec) S.rec.stop(); });
    }
  }

  function onRowInput(e) { if (S.step === 4 && e.target.dataset.k === 'text') onRowEdit(e); }
  function onRowEdit(e) {
    if (S.step !== 4) return;
    var x = e.target, i = +x.dataset.i, k = x.dataset.k;
    if (!k || !P.lines[i]) return;
    var l = P.lines[i];
    if (k === 't') l.t = x.value === '' ? null : Math.max(0, Math.round(+x.value * 10) / 10);
    else if (k === 'vert') l.vert = x.value === '1';
    else if (k === 'emph') l.emph = +x.value;
    else if (k === 'text') { l.text = x.value; P.lyrics = P.lines.map(function (y) { return y.text; }).join('\n'); }
    else l[k] = x.value;
    save();
    if (l.t != null && !S.playing && k !== 'text') seek(l.t + 0.6); else frame();
  }

  function paintTapInfo(t) {
    var cur = activeAt(t), c = el('lp-cur'), nx = el('lp-nexttxt'), tn = el('lp-tapn');
    if (!c) return;
    c.textContent = cur >= 0 ? P.lines[cur].text : '—';
    nx.textContent = S.tapIdx < P.lines.length ? P.lines[S.tapIdx].text : '（全部打ちました）';
    tn.textContent = S.tapIdx + ' / ' + P.lines.length;
  }
  function tap() {
    if (!S.audio || S.tapIdx >= P.lines.length) return;
    if (!S.playing) play();
    P.lines[S.tapIdx].t = Math.round(Math.max(0, now() - 0.08) * 100) / 100; // 押す指の遅れを少しだけ引きます
    S.tapIdx++;
    save(); paintTapInfo(now());
    var b = el('lp-tap'); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
  }

  function setAudio(file) {
    pause();
    if (S.url) URL.revokeObjectURL(S.url);
    S.url = URL.createObjectURL(file);
    var a = new Audio(); a.src = S.url; a.preload = 'auto';
    a.addEventListener('ended', function () { S.playing = false; paintTransport(); });
    a.addEventListener('loadedmetadata', function () { frame(); });
    S.audio = a; S.audioName = file.name;
    S.actx = null; S.dest = null;
    var n = el('lp-audioname'); if (n) n.textContent = '読み込み済み：' + file.name;
  }

  /* ---- 書き出し ---- */
  function pickMime() {
    var c = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    if (!window.MediaRecorder) return null;
    for (var i = 0; i < c.length; i++) if (MediaRecorder.isTypeSupported(c[i])) return c[i];
    return '';
  }
  async function record() {
    var mime = pickMime();
    if (mime === null) return say('このブラウザは動画の書き出しに対応していません。パソコンの Chrome か、新しい Safari でお試しください。');
    if (!P.lines.some(function (l) { return l.t != null; })) return say('先に、タイミングを打つか「曲なしで、時間を自動で決める」を使ってください。');
    pause();
    var a = ASPECTS[P.aspect], cv = document.createElement('canvas');
    cv.width = a[0]; cv.height = a[1];
    var ctx = cv.getContext('2d');
    render(ctx, cv.width, cv.height, 0);
    var stream = cv.captureStream(30);
    if (S.audio) {
      try {
        if (!S.actx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          S.actx = new AC();
          var src = S.actx.createMediaElementSource(S.audio);
          S.dest = S.actx.createMediaStreamDestination();
          src.connect(S.dest); src.connect(S.actx.destination);
        }
        if (S.actx.state === 'suspended') await S.actx.resume();
        S.dest.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); });
      } catch (_) { say('音を動画に入れられませんでした。無音で書き出します。'); }
    }
    var chunks = [], rec;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : undefined); } catch (e) { return say('書き出しを始められませんでした（' + (e && e.message || e) + '）'); }
    S.rec = rec;
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    var len = totalLen(), box = el('lp-progbox'), bar = el('lp-progbar');
    el('lp-rec').hidden = true; el('lp-stoprec').hidden = false; box.hidden = false; el('lp-result').innerHTML = '';
    rec.onstop = function () {
      S.recording = false; S.rec = null;
      if (S.audio) S.audio.pause(); S.playing = false; paintTransport();
      var type = (rec.mimeType || mime || 'video/webm').split(';')[0];
      var blob = new Blob(chunks, { type: type });
      var ext = /mp4/.test(type) ? 'mp4' : 'webm';
      var url = URL.createObjectURL(blob);
      var name = (P.title || '文字PV').replace(/[\\/:*?"<>|]/g, '') + '.' + ext;
      var r = el('lp-result');
      if (r) {
        r.innerHTML = '<p class="lp-note"><b>できました</b>（' + (blob.size / 1048576).toFixed(1) + 'MB・' + ext + '）</p>' +
          '<video src="' + url + '" controls playsinline class="lp-video"></video>' +
          '<div class="lp-acts"><a class="lp-b pri" href="' + url + '" download="' + esc(name) + '">保存する</a></div>' +
          (ext === 'webm' ? '<p class="lp-note">webm 形式です。Instagram などに出すときは、mp4 に変換してから（パソコンの Safari なら mp4 で書き出せます）。</p>' : '');
      }
      el('lp-rec').hidden = false; el('lp-stoprec').hidden = true; box.hidden = true;
    };
    S.recording = true;
    if (S.audio) { S.audio.currentTime = 0; } else { S.clockAt = 0; }
    rec.start(500);
    play();
    var draw = function () {
      if (!S.recording) return;
      var t = now();
      render(ctx, cv.width, cv.height, t);
      bar.style.width = clamp(t / len * 100, 0, 100) + '%';
      if (t >= len || (!S.playing && t > 0.5)) { try { rec.stop(); } catch (_) {} return; }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  function say(m) {
    var t = el('lp-toast');
    if (!t) { t = document.createElement('div'); t.id = 'lp-toast'; t.className = 'lp-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = m; t.hidden = false;
    clearTimeout(say.h); say.h = setTimeout(function () { t.hidden = true; }, 3800);
  }

  document.addEventListener('keydown', function (e) {
    if (S.step !== 2 || e.key !== ' ' || !el(TAB) || el(TAB).style.display === 'none') return;
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    e.preventDefault(); tap();
  });

  var CSS =
    '.lp-wrap{display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:18px;align-items:start}' +
    '.lp-stage{position:sticky;top:92px;display:grid;gap:10px}.lp-cvbox{background:#17171c;border-radius:16px;padding:10px;display:grid;place-items:center}' +
    '#lp-canvas{display:block;width:auto;height:auto;max-width:100%;max-height:68vh;border-radius:8px;background:#000}' +
    '.lp-trans{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.lp-trans input[type=range]{flex:1;min-width:120px;accent-color:var(--ui-accent)}.lp-time{font-size:12.5px;font-variant-numeric:tabular-nums;color:#4a4a54}' +
    '.lp-panel{background:#fff;border:1px solid var(--ui-border);border-radius:16px;padding:16px}' +
    '.lp-steps{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-wrap:wrap;gap:6px}.lp-step{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 13px 0 6px;border-radius:999px;border:1px solid var(--ui-border);background:#fbfaf8;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.lp-step i{font-style:normal;display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#eceae5;font-size:12px}.lp-step.on{border-color:var(--ui-accent);background:#fff5f5}.lp-step.on i{background:var(--ui-accent)}' +
    '.lp-note{font-size:12.5px;color:#4a4a54;line-height:1.8;margin:0 0 10px}' +
    '.lp-lab{display:grid;gap:5px;font-size:13px;font-weight:700;color:#2a2a31;margin-bottom:10px}.lp-lab span{font-weight:400;font-size:12px;color:#5f5f69}.lp-lab input[type=text],.lp-lab select,.lp-lab textarea{width:100%;box-sizing:border-box;min-height:42px;padding:8px 11px;border:1px solid var(--ui-border);border-radius:10px;font:inherit;font-size:14px;background:#faf9f6}.lp-lab textarea{line-height:1.9;resize:vertical}' +
    '.lp-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
    '.lp-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.lp-b{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;text-decoration:none}.lp-b.pri{background:var(--ui-accent);border-color:var(--ui-accent)}' +
    '.lp-tapinfo{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.lp-tapinfo div{background:#faf9f6;border-radius:10px;padding:8px 10px}.lp-tapinfo small{display:block;font-size:11px;color:#5f5f69}.lp-tapinfo b{font-size:14px}' +
    '.lp-tap{display:grid;place-items:center;width:100%;min-height:140px;border-radius:20px;border:0;background:#17171c;font:inherit;font-size:26px;font-weight:800;letter-spacing:.1em;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none;transition:transform .08s}.lp-tap small{font-size:12px;font-weight:600;letter-spacing:0;opacity:.75}.lp-tap.hit{animation:lpHit .25s}.lp-tap:disabled{opacity:.4}@keyframes lpHit{0%{transform:scale(.96);background:var(--ui-accent)}100%{transform:scale(1)}}' +
    '.lp-styles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}.lp-sty{display:grid;gap:6px;justify-items:center;padding:10px 6px;border-radius:12px;border:2px solid var(--ui-border);background:#fff;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}.lp-sty.on{border-color:var(--ui-accent)}.lp-sty .sw{display:grid;place-items:center;width:100%;height:56px;border-radius:8px;background:linear-gradient(160deg,var(--a),var(--b));font-size:26px;font-weight:900}' +
    '.lp-rows{display:grid;gap:8px;max-height:62vh;overflow:auto;padding-right:4px}.lp-row{display:grid;grid-template-columns:40px 1fr;gap:8px;padding:8px;border:1px solid var(--ui-border);border-radius:12px;background:#fbfaf8}.lp-row.now{border-color:var(--ui-accent);background:#fff5f5}' +
    '.lp-jump{width:40px;height:40px;border-radius:50%;border:1px solid var(--ui-border);background:#fff;cursor:pointer;font-size:13px}' +
    '.lp-rowmain>input{width:100%;box-sizing:border-box;min-height:38px;border:1px solid var(--ui-border);border-radius:8px;padding:0 10px;font:inherit;font-size:14px;background:#fff}' +
    '.lp-rowopts{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.lp-rowopts label{display:grid;gap:2px;font-size:11px;color:#5f5f69;font-weight:700}.lp-rowopts input,.lp-rowopts select{min-height:34px;border:1px solid var(--ui-border);border-radius:8px;padding:0 6px;font:inherit;font-size:13px;background:#fff}.lp-rowopts input{width:76px}' +
    '.lp-sum{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13px;margin:0 0 8px}.lp-sum dt{color:#5f5f69}.lp-sum dd{margin:0}' +
    '.lp-prog{height:8px;background:#eceae5;border-radius:99px;overflow:hidden;margin-top:12px}#lp-progbar{height:100%;width:0;background:var(--ui-accent)}' +
    '.lp-video{width:100%;max-height:60vh;border-radius:10px;background:#000;margin:6px 0}' +
    '.lp-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:4500;background:#17171c;color:#fff;border-radius:999px;padding:10px 18px;font-size:13.5px;max-width:calc(100vw - 32px)}' +
    '#shell .lp-b,#shell .lp-step,#shell .lp-sty,#shell .lp-jump{color:#1f2937!important}#shell .lp-b.pri,#shell .lp-step.on i{color:#fff!important}#shell .lp-tap{color:#fff!important}#shell .lp-sty .sw{color:var(--f)!important}' +
    '@media (max-width:980px){.lp-wrap{grid-template-columns:1fr}.lp-stage{position:static}#lp-canvas{max-height:56vh}}' +
    '@media (max-width:560px){.lp-two{grid-template-columns:1fr}.lp-styles{grid-template-columns:repeat(2,minmax(0,1fr))}.lp-panel{padding:12px}.lp-step{padding:0 10px 0 5px;font-size:12px}.lp-tap{min-height:120px}}';

  window.lumLyricPvInit = function () {
    var host = el(TAB);
    if (!host || S.started) return;
    S.started = true;
    var st = document.createElement('style'); st.id = 'lp-css'; st.textContent = CSS; document.head.appendChild(st);
    if (!P.lines.length && P.lyrics) syncLines();
    paint();
  };
  window.lumLyricPvShow = function () { if (S.started) frame(); };
})();
