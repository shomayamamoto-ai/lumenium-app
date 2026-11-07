/* 文章の書式ボタン（文章編集・ブログ記事・項目を足す、のすべての文章欄で使います）。
 *
 *   段落▾（段落・見出し・小見出し） B  I  リンク ｜ 箇条書き  番号 ｜ 表▾  画像 ｜ 元に戻す  やり直す
 *
 * 書式は文章の中の短い印として入ります（読み方は /markup.js。サイト・静的ページ・
 * 見え方の確認で同じものを使います）。印を手で打つ必要はありません。
 *
 * 文字の入れ替えは、ブラウザの「文字を入力した」と同じ形（insertText）で行います。
 * こうすると ⌘Z（元に戻す）がボタンで入れた書式にも効きます。値を直接書き換えると、
 * 元に戻す履歴が消えてしまいます。
 *
 * 見出し・箇条書き・表・画像は、段落として出す欄（記事の本文・FAQ の答え・説明文など）
 * だけで使えます。見出しやボタンの短い欄では押せない状態にして、理由を出します。
 *
 *   lumRichbar.attach(textarea, { block: true|false, onChange: fn }) → ボタンの並び（要素）
 */
(function () {
  'use strict';
  if (window.lumRichbar) return;

  var CSS =
    '.rb{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:4px;border:1px solid var(--border,#dcd8ce);border-bottom:0;border-radius:10px 10px 0 0;background:#fff;position:relative}' +
    '.rb+textarea{border-top-left-radius:0!important;border-top-right-radius:0!important}' +
    '.rb button,.rb select{font:inherit;font-size:12.5px;min-height:32px!important;height:32px;border:0;background:none;border-radius:7px;padding:0 8px;color:#17171c;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-shadow:none;width:auto}' +
    '.rb select{padding:0 6px;border:1px solid transparent;max-width:120px}' +
    '.rb button:hover:not(:disabled),.rb select:hover:not(:disabled){background:#f1efe9}' +
    '.rb button:disabled,.rb select:disabled{opacity:.35;cursor:not-allowed}' +
    '.rb .sep{width:1px;height:20px;background:var(--border,#dcd8ce);margin:0 4px}' +
    '.rb svg{width:17px;height:17px;display:block}' +
    '.rb .rb-b{font-weight:800;font-size:15px}.rb .rb-i{font-style:italic;font-family:Georgia,serif;font-size:15px}' +
    '.rb-menu{position:absolute;z-index:30;top:38px;background:#fff;border:1px solid var(--border,#dcd8ce);border-radius:10px;box-shadow:0 12px 30px -12px rgba(0,0,0,.3);padding:6px;display:grid;gap:2px;min-width:150px}' +
    '.rb-menu button{justify-content:flex-start;width:100%!important;height:32px}' +
    '.rb-note{flex-basis:100%;font-size:11px;color:var(--sub,#5b5b66);padding:2px 6px 0}';

  var ICON = {
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    ul: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="4.5" cy="6.5" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="17.5" r="1" fill="currentColor"/><path d="M9 6.5h11M9 12h11M9 17.5h11"/></svg>',
    ol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M3.5 5l1.5-1v5M3 14.5c.4-.8 2.6-1 2.6.4 0 1-2.6 1.6-2.6 3.1h2.8" stroke-width="1.4"/></svg>',
    table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10M15 9.5v10"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 17"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 0 0 0 12"/></svg>',
    caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><path d="M6 9l6 6 6-6"/></svg>'
  };
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var MOD = MAC ? '⌘' : 'Ctrl+';

  function css() {
    if (document.getElementById('rb-css')) return;
    var s = document.createElement('style');
    s.id = 'rb-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---- 文字の入れ替え（元に戻せる形で） ---- */
  function replace(ta, from, to, text, selFrom, selTo) {
    ta.focus();
    ta.setSelectionRange(from, to);
    var ok = false;
    try { ok = document.execCommand && document.execCommand('insertText', false, text); } catch (_) { ok = false; }
    if (!ok || ta.value.slice(from, from + text.length) !== text) {
      ta.setRangeText(text, from, to, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (selFrom != null) ta.setSelectionRange(selFrom, selTo == null ? selFrom : selTo);
  }
  /* カーソルのある行（選んでいれば、選んだ範囲にかかる行すべて） */
  function lineRange(ta) {
    var v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
    var s = v.lastIndexOf('\n', a - 1) + 1;
    var e = v.indexOf('\n', b > a && v[b - 1] === '\n' ? b - 1 : b);
    if (e < 0) e = v.length;
    return { s: s, e: e, text: v.slice(s, e) };
  }
  /* 選んだ文字を印で囲む（選んでいなければカーソルのある行の文字。もう一度押すと外す） */
  function wrap(ta, mark) {
    var v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
    if (a === b) {
      var r = lineRange(ta);
      a = r.s; b = r.e;
      // 行頭の段落の印（## や - ）は囲まない
      var lead = /^(#{2,3}\s+|[-*]\s+|\d{1,3}[.)．]\s*)/.exec(v.slice(a, b));
      if (lead) a += lead[0].length;
    }
    while (a < b && /\s/.test(v[a])) a++;
    while (b > a && /\s/.test(v[b - 1])) b--;
    if (a === b) return false;
    var n = mark.length, inside = v.slice(a, b);
    // 外側の * の数（太字は2つ、斜体は1つ、両方なら3つ）で、付いているかを見ます。
    var before = 0, after = 0;
    while (before < 3 && v[a - before - 1] === '*') before++;
    while (after < 3 && v[b + after] === '*') after++;
    var have = Math.min(before, after);
    var on = mark === '**' ? have >= 2 : have === 1 || have === 3;
    if (on) {
      replace(ta, a - n, b + n, inside, a - n, b - n);
    } else if (inside.slice(0, n) === mark && inside.slice(-n) === mark && inside.length > 2 * n) {
      replace(ta, a, b, inside.slice(n, -n), a, b - 2 * n);
    } else {
      replace(ta, a, b, mark + inside + mark, a + n, b + n);
    }
    return true;
  }
  /* 行頭の印を付け替える（見出し・箇条書き・番号） */
  function prefixLines(ta, kind) {
    var r = lineRange(ta);
    var lines = r.text.split('\n');
    var re = /^(#{2,3}\s+|[-*]\s+|\d{1,3}[.)．]\s*)/;
    var all = lines.filter(function (l) { return l.trim(); }).every(function (l) {
      return kind === 'ul' ? /^[-*]\s+/.test(l) : kind === 'ol' ? /^\d{1,3}[.)．]\s*/.test(l) : kind === 'h2' ? /^##\s+/.test(l) : kind === 'h3' ? /^###\s+/.test(l) : false;
    });
    var n = 0;
    var out = lines.map(function (l) {
      var body = l.replace(re, '');
      if (!l.trim() && lines.length > 1) return l;
      if (kind === 'p' || all) return body;
      if (kind === 'ul') return '- ' + body;
      if (kind === 'ol') return (++n) + '. ' + body;
      if (kind === 'h2') return '## ' + body;
      if (kind === 'h3') return '### ' + body;
      return body;
    }).join('\n');
    replace(ta, r.s, r.e, out, r.s + out.length);
  }
  /* 前後に空行を足して、段落として入れる（表・画像） */
  function insertBlock(ta, text) {
    var v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
    var before = v.slice(0, a), after = v.slice(b);
    var pre = !before ? '' : /\n\n$/.test(before) ? '' : /\n$/.test(before) ? '\n' : '\n\n';
    var post = !after ? '' : /^\n\n/.test(after) ? '' : /^\n/.test(after) ? '\n' : '\n\n';
    replace(ta, a, b, pre + text + post, a + pre.length, a + pre.length + text.length);
  }
  function currentKind(ta) {
    var l = lineRange(ta).text.split('\n')[0];
    return /^###\s+/.test(l) ? 'h3' : /^##\s+/.test(l) ? 'h2' : 'p';
  }

  function attach(ta, opts) {
    css();
    var o = opts || {};
    var block = !!o.block;
    var M = window.lumMarkup;
    var bar = document.createElement('div');
    bar.className = 'rb';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', '文章の書式');
    var noBlock = '見出し・箇条書き・表・画像は、段落として出す欄（記事の本文・説明文・答えなど）で使えます。この欄は見出しやボタンなどの短い文なので、太字・斜体・リンクまでです。';
    var dis = block ? '' : ' disabled title="' + noBlock + '"';
    bar.innerHTML =
      '<select class="rb-para" aria-label="段落の種類"' + (block ? ' title="段落の種類"' : ' disabled title="' + noBlock + '"') + '>' +
        '<option value="p">段落</option><option value="h2">見出し</option><option value="h3">小見出し</option></select>' +
      '<span class="sep"></span>' +
      '<button type="button" class="rb-b" data-do="b" title="太字（' + MOD + 'B）" aria-label="太字">B</button>' +
      '<button type="button" class="rb-i" data-do="i" title="斜体（' + MOD + 'I）" aria-label="斜体">I</button>' +
      '<button type="button" data-do="link" title="リンク（' + MOD + 'K）" aria-label="リンク">' + ICON.link + '</button>' +
      '<span class="sep"></span>' +
      '<button type="button" data-do="ul" aria-label="箇条書き"' + (block ? ' title="箇条書き"' : dis) + '>' + ICON.ul + '</button>' +
      '<button type="button" data-do="ol" aria-label="番号付きリスト"' + (block ? ' title="番号付きリスト"' : dis) + '>' + ICON.ol + '</button>' +
      '<span class="sep"></span>' +
      '<button type="button" data-do="table" aria-label="表を入れる" aria-haspopup="menu"' + (block ? ' title="表を入れる"' : dis) + '>' + ICON.table + ICON.caret + '</button>' +
      '<button type="button" data-do="image" aria-label="画像を入れる"' + (block ? ' title="画像を入れる"' : dis) + '>' + ICON.image + '</button>' +
      '<span class="sep"></span>' +
      '<button type="button" data-do="undo" title="元に戻す（' + MOD + 'Z）" aria-label="元に戻す">' + ICON.undo + '</button>' +
      '<button type="button" data-do="redo" title="やり直す（' + (MAC ? '⌘⇧Z' : 'Ctrl+Y') + '）" aria-label="やり直す">' + ICON.redo + '</button>';

    var changed = function () { if (o.onChange) o.onChange(); };
    var para = bar.querySelector('.rb-para');
    var sync = function () { if (block) para.value = currentKind(ta); };
    ta.addEventListener('keyup', sync);
    ta.addEventListener('click', sync);
    para.addEventListener('change', function () { prefixLines(ta, para.value); changed(); });

    // ボタンを押してもカーソル（選んだ範囲）が外れないように
    bar.addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });

    function link() {
      var a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
      var label = v.slice(a, b);
      var url = window.prompt('リンク先のアドレス（https://… または サイトの中なら /pricing.html など）', 'https://');
      if (url == null) return;
      url = url.trim();
      if (!M || !M.safeUrl(url)) { window.alert('リンク先は https:// か http:// で始まるアドレス、またはサイトの中（/ から始まる）にしてください。'); return; }
      if (!label) {
        label = window.prompt('リンクにする文字', '詳しくはこちら');
        if (label == null || !label.trim()) return;
      }
      var t = '[' + label.replace(/[[\]]/g, '') + '](' + url + ')';
      replace(ta, a, b, t, a + t.length);
      changed();
    }
    function image() {
      var url = window.prompt('画像のアドレス（https://… または サイトの中の /img/… など）', 'https://');
      if (url == null) return;
      url = url.trim();
      if (!M || !M.safeUrl(url, true)) { window.alert('画像は https:// で始まるアドレス、またはサイトの中（/ から始まる）にしてください。'); return; }
      var alt = window.prompt('画像の説明（目の見えない方の読み上げと、画像の下の小さな説明に使います）', '') || '';
      insertBlock(ta, '![' + alt.replace(/[[\]]/g, '') + '](' + url + ')');
      changed();
    }
    var menu = null;
    function closeMenu() { if (menu) { menu.remove(); menu = null; } }
    function tableMenu(btn) {
      if (menu) { closeMenu(); return; }
      menu = document.createElement('div');
      menu.className = 'rb-menu';
      menu.setAttribute('role', 'menu');
      menu.style.left = btn.offsetLeft + 'px';
      [[2, 3], [3, 3], [3, 5], [4, 4]].forEach(function (d) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.textContent = d[0] + '列 × ' + d[1] + '行（1行目が見出し）';
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        b.addEventListener('click', function () {
          var cols = d[0], rows = d[1];
          var head = '| ' + Array.apply(null, Array(cols)).map(function (_, i) { return '見出し' + (i + 1); }).join(' | ') + ' |';
          var sep = '|' + Array.apply(null, Array(cols)).map(function () { return '---'; }).join('|') + '|';
          var body = [];
          for (var r = 0; r < rows - 1; r++) body.push('| ' + Array.apply(null, Array(cols)).map(function () { return '　'; }).join(' | ') + ' |');
          insertBlock(ta, [head, sep].concat(body).join('\n'));
          closeMenu();
          changed();
        });
        menu.appendChild(b);
      });
      bar.appendChild(menu);
    }
    document.addEventListener('click', function (e) { if (menu && !bar.contains(e.target)) closeMenu(); });

    function act(what, btn) {
      if (what === 'b') { if (wrap(ta, '**')) changed(); }
      else if (what === 'i') { if (wrap(ta, '*')) changed(); }
      else if (what === 'link') link();
      else if (what === 'ul' || what === 'ol') { prefixLines(ta, what); changed(); }
      else if (what === 'table') tableMenu(btn);
      else if (what === 'image') image();
      else if (what === 'undo' || what === 'redo') {
        ta.focus();
        try { document.execCommand(what); } catch (_) {}
        changed();
      }
      sync();
    }
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-do]');
      if (!b || b.disabled) return;
      act(b.getAttribute('data-do'), b);
    });
    ta.addEventListener('keydown', function (e) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      var k = e.key.toLowerCase();
      if (k === 'b' || k === 'i' || k === 'k') {
        e.preventDefault();
        act(k === 'b' ? 'b' : k === 'i' ? 'i' : 'link');
      }
    });
    // 表や箇条書きを入れて行が増えたら、欄も伸ばします（18行まで。それ以上は欄の中で送ります）。
    if (ta.tagName === 'TEXTAREA') {
      ta.addEventListener('input', function () {
        var need = Math.min(18, ta.value.split('\n').length + 1);
        if (need > ta.rows) ta.rows = need;
      });
    }
    ta.parentNode.insertBefore(bar, ta);
    return bar;
  }

  /* 段落として出す欄か（文章編集の住所から）。サイトの表示が段落の書式まで
     読む欄だけです（src/components/Landing.jsx の <Rich>、scripts の bx()）。 */
  var BLOCK = [
    /^articles\.@[^.]+\.content$/,
    /^faq\..*\.a$/,
    /^services\.@[^.]+\.desc$/,
    /^site\.CASE_STUDIES\..*\.desc$/,
    /^site\.FLOW_STEPS\.@[^.]+\.desc$/,
    /^site\.BRAND_CHAPTERS\..*\.body\.\d+$/,
    /^site\.PROFILE_BRICKS\..*\.text$/,
    /^text\.lp\.(lead|aboutFacts|adminLead|adminNote|adminPitch|adminF\dDesc)$/
  ];
  function isBlock(path) { return BLOCK.some(function (re) { return re.test(String(path || '')); }); }

  window.lumRichbar = { attach: attach, isBlock: isBlock };
})();
