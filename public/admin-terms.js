/* ---- AI用語図鑑（さがす・写す・作る画面に足す） ----
 *
 * 『動きでわかるAI用語図鑑』（© Lumenium 山本捷真）の用語を、管理画面の中で使えるようにします。
 * 図鑑の中身は、このサイトのファイルには入っていません。書き出した JSON をこの画面で取り込むと、
 * 保存先に入り、ログインした人だけが読めます（api/ai-terms.js）。
 *
 *   この画面        … 分野からさがす・言葉でさがす・指示文を写す・いくつかまとめて写す・取り込む
 *   lumTerms.field  … 文章・SNS・CM・キャラクターの画面に置く「使う型・用語」の欄。
 *                     図鑑から選ぶと指示文が欄に入り、AI には用語の意味ごと渡ります（api/_ai-terms.js）。
 *
 * 絵（動き）は図鑑の本体にしかありません。ここは言葉だけです。 */
(function () {
  'use strict';
  if (window.lumTerms) return;

  var TAB = 'terms-admin';
  var SHOW_MAX = 150;
  var el = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var norm = function (s) { return String(s || '').normalize('NFKC').toLowerCase(); };
  var JP = /[぀-ヿ一-鿿]/;

  /* ---- 中身 ---- */
  var D = { state: 'idle', meta: null, sections: [], flat: [], error: '', noStore: false, wait: null };

  /** 写す言葉。指示文（日本語の文）があればそれ。名前だけの用語は「名前（英語名）」。 */
  function sayOf(it) {
    var jp = it[0], en = it[1];
    if (en && en !== jp && (JP.test(en) || /\n/.test(en))) return en;
    return en && en !== jp ? jp + '（' + en + '）' : jp;
  }
  var isPhrase = function (it) { return !!(it[1] && it[1] !== it[0] && (JP.test(it[1]) || /\n/.test(it[1]))); };

  function index(sections) {
    var flat = [];
    sections.forEach(function (s) {
      s.groups.forEach(function (g) {
        g.items.forEach(function (it) {
          flat.push({ n: flat.length, s: s, g: g.title, it: it, hay: norm(it[0] + '\n' + it[1] + '\n' + it[2] + '\n' + g.title + '\n' + s.label) });
        });
      });
    });
    return flat;
  }
  function take(data) {
    D.meta = (data && data.meta) || null;
    D.sections = (data && data.sections) || [];
    D.noStore = !!(data && data.noStore);
    D.flat = index(D.sections);
    D.state = 'ready';
    D.error = '';
  }
  function load(force) {
    if (D.state === 'ready' && !force) return Promise.resolve(D);
    if (D.wait) return D.wait;
    D.state = 'loading';
    D.wait = window.lumAdmin.fetch('/api/ai-terms').then(function (r) {
      D.wait = null;
      if (r && r.data && r.data.ok) take(r.data);
      else { D.state = 'error'; D.error = (r && r.data && r.data.message) || '図鑑を読めませんでした。'; }
      return D;
    }, function () { D.wait = null; D.state = 'error'; D.error = '図鑑を読めませんでした。通信を確かめて、もう一度お試しください。'; return D; });
    return D.wait;
  }
  function search(q, secIds) {
    var words = norm(q).split(/\s+/).filter(Boolean);
    var only = secIds && secIds.length ? secIds : null;
    var hits = D.flat.filter(function (r) {
      if (only && only.indexOf(r.s.id) < 0) return false;
      for (var i = 0; i < words.length; i++) if (r.hay.indexOf(words[i]) < 0) return false;
      return true;
    });
    if (!words.length) return hits;
    // 名前に当たったものを先に（同じ中では図鑑の順のまま）。
    var rank = function (r) { var n = norm(r.it[0]); return n === words[0] ? 0 : n.indexOf(words[0]) === 0 ? 1 : n.indexOf(words[0]) > 0 ? 2 : 3; };
    return hits.map(function (r) { return [rank(r), r]; }).sort(function (a, b) { return a[0] - b[0] || a[1].n - b[1].n; }).map(function (x) { return x[1]; });
  }

  function copy(text, btn) {
    var done = function () { if (!btn) return; var old = btn.textContent; btn.textContent = '写しました'; setTimeout(function () { btn.textContent = old; }, 1400); };
    var fallback = function () {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (_) {}
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }

  /* ---- この画面 ---- */
  var S = { started: false, q: '', sec: '', tray: [], msg: '', busy: false };

  function itemHtml(r, withSec) {
    var it = r.it, n = r.n;
    var picked = S.tray.indexOf(n) >= 0;
    return '<li class="tz-it">' +
      '<div class="tz-hd"><b>' + esc(it[0]) + '</b>' + (withSec ? '<button type="button" class="tz-sec" data-sec="' + esc(r.s.id) + '">' + esc(r.s.label) + '</button>' : '') + '</div>' +
      (it[2] ? '<p class="tz-desc">' + esc(it[2]) + '</p>' : '') +
      (isPhrase(it) ? '<p class="tz-say">' + esc(it[1]) + '</p>' : (it[1] && it[1] !== it[0] ? '<p class="tz-en">' + esc(it[1]) + '</p>' : '')) +
      '<div class="tz-acts"><button type="button" class="tz-b sm" data-copy="' + n + '">' + (isPhrase(it) ? '指示文を写す' : '名前を写す') + '</button>' +
      '<button type="button" class="tz-b sm' + (picked ? ' on' : '') + '" data-pick="' + n + '" aria-pressed="' + picked + '">' + (picked ? 'まとめに入っています' : 'まとめに足す') + '</button></div>' +
    '</li>';
  }

  function bodyHtml() {
    if (D.state === 'loading' || D.state === 'idle') return '<p class="tz-wait">図鑑を読み込んでいます…</p>';
    if (D.state === 'error') return '<p class="tz-err">' + esc(D.error) + '</p><button type="button" class="tz-b" id="tz-retry">もう一度読む</button>';
    if (!D.sections.length) {
      return '<div class="tz-empty"><h3>まだ図鑑が入っていません</h3>' +
        (D.noStore ? '<p>保存先（Upstash）がつながっていないため、図鑑を置けません。先に「設定状況」で保存先をつないでください。</p>' :
        '<ol><li>図鑑を書き出したファイル（<b>ai-terms.json</b>）を用意します。</li><li>下のボタンで、そのファイルを選びます。</li><li>取り込むと、この画面と、文章・SNS・CM・キャラクターの画面で使えるようになります。</li></ol>' +
        '<label class="tz-b pri tz-file">図鑑のファイルを選ぶ<input type="file" id="tz-file2" accept=".json,application/json"></label>' +
        '<p class="tz-fine">図鑑の中身は、サイトの公開ファイルには入りません。保存先に置かれ、ログインした人だけが読めます。</p>') +
      '</div>';
    }
    var q = S.q.trim();
    if (q) {
      var hits = search(q, S.sec ? [S.sec] : null);
      if (!hits.length) return '<p class="tz-wait">「' + esc(q) + '」に当たる用語はありませんでした。言葉を短くするか、分野を「すべて」にしてお試しください。</p>';
      return '<p class="tz-count">' + hits.length + '件' + (hits.length > SHOW_MAX ? '（はじめの' + SHOW_MAX + '件を出しています。言葉を足すとしぼれます）' : '') + '</p>' +
        '<ul class="tz-list">' + hits.slice(0, SHOW_MAX).map(function (r) { return itemHtml(r, !S.sec); }).join('') + '</ul>';
    }
    if (!S.sec) {
      return '<ul class="tz-secs">' + D.sections.map(function (s) {
        var c = s.groups.reduce(function (a, g) { return a + g.items.length; }, 0);
        return '<li><button type="button" class="tz-card" data-sec="' + esc(s.id) + '"><b>' + esc(s.label) + '<i>' + c + '</i></b><span>' + esc(s.tip || s.title) + '</span></button></li>';
      }).join('') + '</ul>';
    }
    var s = D.sections.filter(function (x) { return x.id === S.sec; })[0];
    if (!s) return '';
    return '<div class="tz-sechd"><button type="button" class="tz-b sm tz-back" data-sec="">← 分野の一覧</button><h3>' + esc(s.title || s.label) + '</h3>' + (s.tip ? '<p>' + esc(s.tip) + '</p>' : '') + '</div>' +
      s.groups.map(function (g) {
        return '<section class="tz-grp">' + (g.title ? '<h4>' + esc(g.title) + '<i>' + g.items.length + '</i></h4>' : '') +
          '<ul class="tz-list">' + D.flat.filter(function (r) { return r.s === s && r.g === g.title; }).map(function (r) { return itemHtml(r, false); }).join('') + '</ul></section>';
      }).join('');
  }

  function metaHtml() {
    var m = D.meta;
    if (!m) return '';
    var d = m.importedAt ? new Date(m.importedAt) : null;
    var when = d && !isNaN(d) ? d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() : '';
    return '<p class="tz-meta">' + esc(m.name || 'AI用語図鑑') + '｜' + (m.sections || []).length + '分野・' + (m.count || 0).toLocaleString() + '項目' +
      (when ? '｜' + when + ' に取り込み' + (m.by ? '（' + esc(m.by) + '）' : '') : '') + (m.copyright ? '｜' + esc(m.copyright) : '') + '</p>';
  }

  function trayHtml() {
    if (!S.tray.length) return '';
    return '<div class="tz-tray" role="region" aria-label="まとめ"><b>まとめ ' + S.tray.length + '件</b>' +
      '<span class="tz-trayl">' + S.tray.map(function (n) { return '<button type="button" class="tz-tag" data-drop="' + n + '" title="まとめから外す">' + esc(D.flat[n].it[0]) + ' ×</button>'; }).join('') + '</span>' +
      '<button type="button" class="tz-b pri sm" id="tz-copyall">まとめて写す</button><button type="button" class="tz-b sm" id="tz-clear">空にする</button></div>';
  }

  function paint(keepFocus) {
    var host = el(TAB);
    if (!host) return;
    var has = D.state === 'ready' && D.sections.length > 0;
    var pos = null;
    if (keepFocus && document.activeElement && document.activeElement.id === 'tz-q') pos = document.activeElement.selectionStart;
    host.innerHTML =
      '<div class="tz">' +
        (has ? '<div class="tz-bar">' +
          '<label class="tz-find"><span>さがす</span><input type="search" id="tz-q" placeholder="例）カメラ　余白　PREP　問い合わせ" value="' + esc(S.q) + '" autocomplete="off"></label>' +
          '<label class="tz-find tz-pick"><span>分野</span><select id="tz-sec"><option value="">すべて（' + D.sections.length + '分野）</option>' +
            D.sections.map(function (s) { return '<option value="' + esc(s.id) + '"' + (S.sec === s.id ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('') + '</select></label>' +
          '<div class="tz-tools"><label class="tz-b sm tz-file">図鑑を入れ替える<input type="file" id="tz-file" accept=".json,application/json"></label>' +
          '<button type="button" class="tz-b sm" id="tz-wipe">図鑑を消す</button></div>' +
        '</div>' + metaHtml() : '') +
        (S.msg ? '<p class="tz-msg" role="status">' + esc(S.msg) + '</p>' : '') +
        '<div class="tz-body" id="tz-body">' + bodyHtml() + '</div>' +
        trayHtml() +
      '</div>';
    wire(host);
    if (pos != null) { var q = el('tz-q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (_) {} } }
  }

  function importFile(file) {
    if (!file || S.busy) return;
    if (file.size > 3000000) { S.msg = 'ファイルが大きすぎます（3MBまで）。'; paint(); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var data;
      try { data = JSON.parse(String(fr.result || '')); } catch (_) { S.msg = 'このファイルは読めませんでした。図鑑を書き出した ai-terms.json を選んでください。'; paint(); return; }
      S.busy = true; S.msg = '取り込んでいます…'; paint();
      window.lumAdmin.fetch('/api/ai-terms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import', data: data }) })
        .then(function (r) {
          S.busy = false;
          if (r && r.data && r.data.ok) {
            if (r.data.sections && r.data.sections.length) { take(r.data); S.tray = []; S.sec = ''; S.q = ''; S.msg = (r.data.meta.count || 0).toLocaleString() + '項目を取り込みました。'; }
            else S.msg = r.data.message || '取り込みました。';
          } else S.msg = (r && r.data && r.data.message) || '取り込めませんでした。';
          paint();
        }, function () { S.busy = false; S.msg = '取り込めませんでした。通信を確かめて、もう一度お試しください。'; paint(); });
    };
    fr.readAsText(file);
  }

  function wire(host) {
    var q = el('tz-q');
    if (q) q.addEventListener('input', function () { S.q = q.value; S.msg = ''; paint(true); });
    ['tz-file', 'tz-file2'].forEach(function (id) { var f = el(id); if (f) f.addEventListener('change', function () { importFile(f.files && f.files[0]); }); });
    var pick = el('tz-sec'); if (pick) pick.addEventListener('change', function () { S.sec = pick.value; S.msg = ''; paint(); });
    var retry = el('tz-retry'); if (retry) retry.addEventListener('click', function () { load(true).then(function () { paint(); }); paint(); });
    var wipe = el('tz-wipe');
    if (wipe) wipe.addEventListener('click', function () {
      if (wipe.getAttribute('data-sure') !== '1') { wipe.setAttribute('data-sure', '1'); wipe.textContent = '本当に消す（もう一度押す）'; return; }
      window.lumAdmin.fetch('/api/ai-terms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear' }) }).then(function (r) {
        if (r && r.data && r.data.ok) { take({ meta: null, sections: [] }); S.tray = []; S.sec = ''; S.q = ''; S.msg = '図鑑を消しました。'; }
        else S.msg = (r && r.data && r.data.message) || '消せませんでした。';
        paint();
      });
    });
    var all = el('tz-copyall'); if (all) all.addEventListener('click', function () { copy(S.tray.map(function (n) { return sayOf(D.flat[n].it); }).join('\n'), all); });
    var clr = el('tz-clear'); if (clr) clr.addEventListener('click', function () { S.tray = []; paint(); });
    host.onclick = function (e) {
      var t = e.target.closest('[data-sec],[data-copy],[data-pick],[data-drop]');
      if (!t || !host.contains(t)) return;
      if (t.hasAttribute('data-copy')) { copy(sayOf(D.flat[+t.getAttribute('data-copy')].it), t); return; }
      if (t.hasAttribute('data-pick') || t.hasAttribute('data-drop')) {
        var n = +(t.getAttribute('data-pick') || t.getAttribute('data-drop')), i = S.tray.indexOf(n);
        if (i >= 0) S.tray.splice(i, 1); else if (S.tray.length < 20) S.tray.push(n);
        var y = window.scrollY; paint(); window.scrollTo(0, y); return;
      }
      S.sec = t.getAttribute('data-sec') || ''; S.msg = '';
      if (t.classList.contains('tz-sec') || t.classList.contains('tz-card')) S.q = '';
      paint();
      var top = el(TAB); if (top && t.classList.contains('tz-card')) top.scrollIntoView({ block: 'start' });
    };
  }

  /* ---- ほかの画面に置く「使う型・用語」の欄 ---- */
  var VALS = {};   // 画面を描き直しても、欄に書いたことを残します
  var OPEN = {};

  function field(id, cats, o) {
    o = o || {};
    return '<div class="tzf" data-tzf="' + esc(id) + '" data-cats="' + esc((cats || []).join(',')) + '">' +
      '<label class="tzf-lab" for="' + esc(id) + '">使う型・用語（任意）<span>' + esc(o.note || '図鑑から選ぶか、「PREP法で」のように書きます。図鑑の用語は、意味ごとAIに渡ります。') + '</span></label>' +
      '<textarea id="' + esc(id) + '" rows="2" maxlength="600" placeholder="' + esc(o.placeholder || '例）PREP法で。見出しに数字を1つ入れる') + '">' + esc(VALS[id] || '') + '</textarea>' +
      '<button type="button" class="tzf-open" aria-expanded="false">図鑑から選ぶ</button>' +
      '<div class="tzf-panel" hidden></div>' +
    '</div>';
  }

  function panelHtml(box) {
    var id = box.getAttribute('data-tzf'), st = OPEN[id];
    if (D.state === 'loading' || D.state === 'idle') return '<p class="tzf-note">図鑑を読み込んでいます…</p>';
    if (D.state === 'error') return '<p class="tzf-note">' + esc(D.error) + '</p>';
    if (!D.sections.length) return '<p class="tzf-note">図鑑がまだ入っていません。メニューの「AI用語図鑑」で取り込むと、ここから選べます。欄に直接書いた指定は、そのままAIに渡ります。</p>';
    var cats = (box.getAttribute('data-cats') || '').split(',').filter(function (c) { return D.sections.some(function (s) { return s.id === c; }); });
    var secs = st.sec === '*' ? null : st.sec ? [st.sec] : (cats.length ? cats : null);
    var hits = search(st.q, secs).slice(0, 60);
    return '<div class="tzf-top"><input type="search" class="tzf-q" placeholder="さがす" value="' + esc(st.q) + '" autocomplete="off" aria-label="図鑑をさがす">' +
      '<div class="tzf-chips">' +
        (cats.length ? '<button type="button" class="tzf-chip' + (!st.sec ? ' on' : '') + '" data-c="">この画面向け</button>' : '') +
        cats.map(function (c) { var s = D.sections.filter(function (x) { return x.id === c; })[0]; return '<button type="button" class="tzf-chip' + (st.sec === c ? ' on' : '') + '" data-c="' + esc(c) + '">' + esc(s.label) + '</button>'; }).join('') +
        '<button type="button" class="tzf-chip' + (st.sec === '*' || !cats.length ? ' on' : '') + '" data-c="*">図鑑ぜんぶ</button>' +
      '</div></div>' +
      (hits.length ? '<ul class="tzf-list">' + hits.map(function (r) {
        return '<li><button type="button" class="tzf-it" data-n="' + r.n + '"><b>' + esc(r.it[0]) + '</b><span>' + esc(isPhrase(r.it) ? r.it[1] : (r.it[2] || r.it[1])) + '</span></button></li>';
      }).join('') + '</ul>' : '<p class="tzf-note">当たる用語がありません。</p>');
  }

  function drawPanel(box, keep) {
    var p = box.querySelector('.tzf-panel');
    var pos = null, a = document.activeElement;
    if (keep && a && a.classList && a.classList.contains('tzf-q') && box.contains(a)) pos = a.selectionStart;
    p.innerHTML = panelHtml(box);
    if (pos != null) { var q = p.querySelector('.tzf-q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (_) {} } }
  }

  function bind(root) {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll('.tzf'), function (box) {
      if (box.getAttribute('data-bound')) return;
      box.setAttribute('data-bound', '1');
      css();
      var id = box.getAttribute('data-tzf'), ta = box.querySelector('textarea'), btn = box.querySelector('.tzf-open'), p = box.querySelector('.tzf-panel');
      OPEN[id] = OPEN[id] || { q: '', sec: '' };
      ta.addEventListener('input', function () { VALS[id] = ta.value; });
      btn.addEventListener('click', function () {
        var open = p.hidden;
        p.hidden = !open; btn.setAttribute('aria-expanded', String(open)); btn.textContent = open ? '図鑑を閉じる' : '図鑑から選ぶ';
        if (!open) return;
        drawPanel(box);
        if (D.state !== 'ready') load().then(function () { if (!p.hidden) drawPanel(box); });
      });
      p.addEventListener('input', function (e) { if (e.target.classList.contains('tzf-q')) { OPEN[id].q = e.target.value; drawPanel(box, true); } });
      p.addEventListener('click', function (e) {
        var c = e.target.closest('.tzf-chip');
        if (c) { OPEN[id].sec = c.getAttribute('data-c') || ''; drawPanel(box); return; }
        var b = e.target.closest('.tzf-it');
        if (!b) return;
        var say = sayOf(D.flat[+b.getAttribute('data-n')].it);
        var cur = ta.value.replace(/\s+$/, '');
        var next = (cur ? cur + '\n' : '') + say;
        if (next.length > 600) { b.querySelector('span').textContent = 'これ以上は入りません（600字まで）。欄を整理してください。'; return; }
        ta.value = next; VALS[id] = next;
        b.classList.add('done'); setTimeout(function () { b.classList.remove('done'); }, 900);
      });
    });
  }

  /* ---- 見た目 ---- */
  var CSS =
    '.tz{display:grid;gap:14px}' +
    '.tz-bar{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-end;justify-content:space-between}' +
    '.tz-find{display:grid;gap:4px;flex:1 1 320px;max-width:560px;font-size:12.5px;font-weight:700;color:#2a2a31}.tz-pick{flex:0 1 240px}.tz-back{justify-self:start;margin-bottom:10px}.tz-sechd{display:grid}.tz-find select{min-height:46px;padding:0 12px;border:1px solid var(--ui-border);border-radius:12px;font:inherit;font-size:14px;background:#fff;width:100%;box-sizing:border-box;color:#17171c}.tz-find input{min-height:46px;padding:0 14px;border:1px solid var(--ui-border);border-radius:12px;font:inherit;font-size:15px;background:#fff;width:100%;box-sizing:border-box}' +
    '.tz-tools{display:flex;flex-wrap:wrap;gap:8px}.tz-file{display:inline-flex;align-items:center;position:relative;overflow:hidden}.tz-file input{position:absolute;inset:0;opacity:0;cursor:pointer;font-size:0}' +
    '.tz-meta{font-size:12px;color:#5f5f69;margin:0}.tz-msg{margin:0;padding:10px 12px;border-radius:10px;background:#eef6ee;color:#14532d;font-size:13.5px;font-weight:700}' +
        '.tz-b{min-height:42px;padding:0 16px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}.tz-b.sm{min-height:36px;padding:0 13px;font-size:12.5px}.tz-b.pri{background:var(--ui-accent);border-color:var(--ui-accent)}.tz-b.on{background:#eef6ee;border-color:#9bd0a6}' +
    '.tz-wait,.tz-err,.tz-count{font-size:13.5px;color:#5f5f69;margin:0}.tz-err{color:#b3261e;margin-bottom:10px}' +
    '.tz-empty{background:#fff;border:1px solid var(--ui-border);border-radius:16px;padding:22px;display:grid;gap:12px;justify-items:start}.tz-empty h3{margin:0;font-size:17px}.tz-empty ol{margin:0;padding-left:20px;display:grid;gap:4px;font-size:14px;line-height:1.8}.tz-empty p{margin:0;font-size:14px;line-height:1.8}.tz-fine{font-size:12px!important;color:#5f5f69}' +
    '.tz-secs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}' +
    '.tz-card{display:grid;gap:6px;width:100%;height:100%;text-align:left;align-content:start;padding:14px;border-radius:14px;border:1px solid var(--ui-border);background:#fff;font:inherit;cursor:pointer}.tz-card:hover{border-color:#17171c}.tz-card b{display:flex;justify-content:space-between;gap:8px;font-size:14.5px}.tz-card i,.tz-grp h4 i{font-style:normal;font-size:12px;font-weight:700;color:#5f5f69;font-variant-numeric:tabular-nums}.tz-card span{font-size:12px;line-height:1.7;color:#5f5f69;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}' +
    '.tz-sechd h3{margin:0 0 4px;font-size:18px}.tz-sechd p{margin:0;font-size:13px;line-height:1.8;color:#4a4a54}' +
    '.tz-grp{display:grid;gap:8px;margin-top:6px}.tz-grp h4{margin:8px 0 0;font-size:14px;display:flex;gap:8px;align-items:baseline}' +
    '.tz-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}' +
    '.tz-it{background:#fff;border:1px solid var(--ui-border);border-radius:14px;padding:13px 14px;display:grid;gap:7px;align-content:start;min-width:0}' +
    '.tz-hd{display:flex;gap:8px;justify-content:space-between;align-items:flex-start}.tz-hd b{font-size:15px;line-height:1.5;overflow-wrap:anywhere}.tz-sec{flex:none;border:0;background:#f3f1ec;border-radius:999px;padding:3px 9px;font:inherit;font-size:11px;font-weight:700;cursor:pointer}' +
    '.tz-desc{margin:0;font-size:13px;line-height:1.75;color:#4a4a54}.tz-en{margin:0;font-size:12.5px;color:#5f5f69;overflow-wrap:anywhere}' +
    '.tz-say{margin:0;padding:9px 11px;border-radius:10px;background:#f3f6ff;border:1px solid #d6defa;font-size:13.5px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;color:#1e2a5a}' +
    '.tz-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}' +
    '.tz-tray{position:sticky;bottom:12px;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 14px;border-radius:14px;background:#17171c;box-shadow:0 8px 24px rgba(0,0,0,.22)}.tz-tray>b{color:#fff;font-size:13px}.tz-trayl{display:flex;flex-wrap:wrap;gap:5px;flex:1 1 200px;min-width:0}.tz-tag{border:0;border-radius:999px;background:#33333b;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer}' +
    '#shell .tz-b,#shell .tz-card,#shell .tz-sec{color:#1f2937!important}#shell .tz-b.pri,#shell .tz-tag{color:#fff!important}#shell .tz-card span{color:#5f5f69!important}#shell .tz-card b{color:#17171c!important}' +
    /* ほかの画面に置く欄 */
    '.tzf{display:grid;gap:6px;margin-top:12px}.tzf-lab{display:grid;gap:4px;font-size:13px;font-weight:700;color:#2a2a31}.tzf-lab span{font-weight:400;font-size:12px;color:#5f5f69;line-height:1.7}' +
    '.tzf textarea{width:100%;box-sizing:border-box;padding:10px 12px;background:#faf9f6;border:1px solid var(--ui-border);border-radius:12px;font:inherit;font-size:14px;line-height:1.8;resize:vertical;color:#17171c}' +
    '.tzf-open{justify-self:start;min-height:36px;padding:0 13px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}' +
    '.tzf-panel{border:1px solid var(--ui-border);border-radius:12px;background:#fff;padding:10px;display:grid;gap:8px}.tzf-panel[hidden]{display:none}' +
    '.tzf-top{display:grid;gap:8px}.tzf-q{min-height:38px;padding:0 12px;border:1px solid var(--ui-border);border-radius:10px;font:inherit;font-size:14px;width:100%;box-sizing:border-box;background:#fff}' +
    '.tzf-chips{display:flex;flex-wrap:wrap;gap:5px}.tzf-chip{min-height:30px;padding:0 10px;border-radius:999px;border:1px solid var(--ui-border);background:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.tzf-chip.on{background:#17171c;border-color:#17171c}' +
    '.tzf-list{list-style:none;margin:0;padding:0;display:grid;gap:5px;max-height:300px;overflow:auto}.tzf-it{display:grid;gap:2px;width:100%;text-align:left;padding:8px 10px;border-radius:10px;border:1px solid var(--ui-border);background:#fbfaf8;font:inherit;cursor:pointer}.tzf-it:hover{border-color:#17171c}.tzf-it.done{background:#eef6ee;border-color:#9bd0a6}.tzf-it b{font-size:13px}.tzf-it span{font-size:12px;line-height:1.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    '.tzf-note{margin:0;font-size:12.5px;line-height:1.8;color:#5f5f69}' +
    '#shell .tzf-open,#shell .tzf-chip,#shell .tzf-it{color:#1f2937!important}#shell .tzf-chip.on{color:#fff!important}#shell .tzf-it span{color:#4a4a54!important}#shell .tzf-it b{color:#17171c!important}' +
    '@media (max-width:620px){.tz-pick{flex:1 1 100%;max-width:none}.tz-list{grid-template-columns:1fr}.tz-secs{grid-template-columns:1fr 1fr}.tz-card span{-webkit-line-clamp:2}.tz-tools{width:100%}}';
  function css() {
    if (el('tz-css')) return;
    var st = document.createElement('style'); st.id = 'tz-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  window.lumTerms = { field: field, bind: bind, load: load, sayOf: sayOf, search: search, _take: take };

  window.lumTermsInit = function () {
    var host = el(TAB);
    if (!host || S.started) return;
    S.started = true;
    css();
    paint();
    load().then(function () { paint(); });
  };
})();
