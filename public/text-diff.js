/* 2つの文の「変えたところ」。文章編集の保存前の確認と、保存の履歴が使います。
 *
 *   lumTextDiff.parts(a, b)  -> [{ t: '=' | '-' | '+', s: '…' }]
 *   lumTextDiff.html(a, b)   -> { before: '…<del>…</del>…', after: '…<ins>…</ins>…' }（エスケープ済み）
 *
 * 1文字ずつ比べます（日本語は単語の区切りが無いため）。前後の同じ部分を先に
 * 外し、残りが長すぎるとき（4万マス超）は、残り全体を「変わった」として
 * 扱います——長い本文を全部書き換えたときに画面が固まらないように。
 * 画面（window.lumTextDiff）とテスト（scripts/test-content.mjs）で同じものを使います。 */
(function (root) {
  'use strict';
  var LIMIT = 40000;

  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function parts(a, b) {
    a = String(a == null ? '' : a);
    b = String(b == null ? '' : b);
    if (a === b) return a ? [{ t: '=', s: a }] : [];
    var p = 0;
    while (p < a.length && p < b.length && a.charAt(p) === b.charAt(p)) p++;
    var q = 0;
    while (q < a.length - p && q < b.length - p && a.charAt(a.length - 1 - q) === b.charAt(b.length - 1 - q)) q++;
    var x = a.slice(p, a.length - q), y = b.slice(p, b.length - q);
    var mid = [];
    if (!x.length || !y.length || x.length * y.length > LIMIT) {
      if (x) mid.push({ t: '-', s: x });
      if (y) mid.push({ t: '+', s: y });
    } else {
      // いちばん長い共通の並び（LCS）を表で求め、後ろから辿ります。
      var n = x.length, m = y.length, i, j;
      var L = new Array(n + 1);
      for (i = 0; i <= n; i++) L[i] = new Uint16Array(m + 1);
      for (i = n - 1; i >= 0; i--) {
        for (j = m - 1; j >= 0; j--) {
          L[i][j] = x.charAt(i) === y.charAt(j) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
        }
      }
      i = 0; j = 0;
      var push = function (t, ch) {
        var last = mid[mid.length - 1];
        if (last && last.t === t) last.s += ch; else mid.push({ t: t, s: ch });
      };
      while (i < n && j < m) {
        if (x.charAt(i) === y.charAt(j)) { push('=', x.charAt(i)); i++; j++; }
        else if (L[i + 1][j] >= L[i][j + 1]) { push('-', x.charAt(i)); i++; }
        else { push('+', y.charAt(j)); j++; }
      }
      while (i < n) { push('-', x.charAt(i)); i++; }
      while (j < m) { push('+', y.charAt(j)); j++; }
      // 1文字だけ同じ、のような細切れは読みにくいので、前後の変更にまとめます。
      var tidy = [];
      mid.forEach(function (seg, k) {
        if (seg.t === '=' && seg.s.length < 2 && k > 0 && k < mid.length - 1) {
          tidy.push({ t: '-', s: seg.s }, { t: '+', s: seg.s });
        } else tidy.push(seg);
      });
      var merged = [];
      // 「消す」と「足す」が入り混じったものを、消す→足すの順にそろえます。
      tidy.forEach(function (seg) {
        if (seg.t === '=') { merged.push({ t: '=', s: seg.s }); return; }
        var run = merged[merged.length - 1];
        if (!run || run.t === '=') { run = { t: 'x', del: '', ins: '' }; merged.push(run); }
        if (seg.t === '-') run.del += seg.s; else run.ins += seg.s;
      });
      mid = [];
      merged.forEach(function (r) {
        if (r.t === '=') mid.push(r);
        else { if (r.del) mid.push({ t: '-', s: r.del }); if (r.ins) mid.push({ t: '+', s: r.ins }); }
      });
    }
    var out = [];
    if (p) out.push({ t: '=', s: a.slice(0, p) });
    out = out.concat(mid);
    if (q) out.push({ t: '=', s: a.slice(a.length - q) });
    return out;
  }

  function html(a, b) {
    var before = '', after = '';
    parts(a, b).forEach(function (x) {
      var s = esc(x.s).replace(/\n/g, '<br>');
      if (x.t === '=') { before += s; after += s; }
      else if (x.t === '-') before += '<del>' + s + '</del>';
      else after += '<ins>' + s + '</ins>';
    });
    return { before: before, after: after };
  }

  root.lumTextDiff = { parts: parts, html: html, esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
