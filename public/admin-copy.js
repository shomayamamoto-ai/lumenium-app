/* 文章編集（admin-members.html の「文章編集」）の追加の画面。
   いちばん上に切り替えのボタンを足し、もとの「文章を直す」画面の横に
   次の画面を並べます:
     保存の履歴      最近20回の保存と、それぞれで変わった項目。「この時点に戻す」

   保存はどれも /api/content-save に送り、サイトへの反映は同じ欄
   （copy-state）で追いかけます。もとの画面とは window.lumCopyLabel
   （住所を言葉に）と window.lumCopyReload（読み直し）でつながっています。 */
(function () {
  'use strict';

  var C = {
    stored: null,     // content.json そのもの（added / hidden / seo を含む）
    schema: null,     // /content-schema.json
    view: 'text',
    built: false
  };
  var VIEWS = [
    { id: 'text', label: '文章を直す' },
    { id: 'history', label: '保存の履歴' }
  ];

  function $(id) { return document.getElementById(id); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function say(id, text, isInfo) {
    var m = $(id);
    if (!m) return;
    m.textContent = text || '';
    m.classList.toggle('show', !!text);
    m.classList.toggle('info', !!isInfo);
  }

  var CSS =
    '.cp-nav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}' +
    '.cp-list{list-style:none;margin:0;padding:0}' +
    '.cp-list li{padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;line-height:1.7}' +
    '.cp-row{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}' +
    '.cp-row .t{flex:1 1 200px;min-width:0;overflow-wrap:anywhere}' +
    '.cp-s{color:var(--sub);font-size:11.5px}' +
    '.cp-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}' +
    '.cp-chip{font-size:11px;padding:2px 8px;border-radius:999px;background:#f3f1ec;border:1px solid var(--border);color:var(--sub);overflow-wrap:anywhere}' +
    '.cp-list button{padding:5px 10px;font-size:11.5px}';

  /* ---- 画面の切り替え ---- */
  function build() {
    if (C.built) return;
    var panel = $('copy-admin');
    var bar = panel && panel.querySelector('.toolbar');
    if (!bar) return;
    C.built = true;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    var nav = document.createElement('div');
    nav.className = 'cp-nav';
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', '文章編集の画面');
    VIEWS.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'nq-chip'; b.textContent = v.label;
      b.setAttribute('data-cp-view', v.id);
      b.addEventListener('click', function () { show(v.id); });
      nav.appendChild(b);
    });
    panel.insertBefore(nav, bar);
    // サイトへの反映の欄は、どの画面でも見えるように切り替えの下へ。
    var state = $('copy-state');
    panel.insertBefore(state, bar);

    // もとの画面（ツールバー・メッセージ・一覧）を1つの箱に。
    var text = document.createElement('div');
    text.id = 'cp-v-text';
    panel.insertBefore(text, bar);
    [bar, $('copy-msg'), $('copy-fields')].forEach(function (el) { if (el) text.appendChild(el); });

    VIEWS.forEach(function (v) {
      if (v.id === 'text') return;
      var box = document.createElement('div');
      box.id = 'cp-v-' + v.id;
      box.style.display = 'none';
      panel.appendChild(box);
    });
    show('text');
  }

  function show(id) {
    C.view = id;
    Array.prototype.forEach.call(document.querySelectorAll('[data-cp-view]'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-cp-view') === id));
    });
    VIEWS.forEach(function (v) {
      var box = $('cp-v-' + v.id);
      if (box) box.style.display = v.id === id ? '' : 'none';
    });
    if (id === 'history') renderHistory();
  }

  /* ---- 読み込みと保存（項目の追加・SEO・記事が使う） ---- */
  async function loadData() {
    var r = await window.lumAdmin.fetch('/api/content-save').catch(function () { return null; });
    if (r && r.res.ok && r.data.ok) {
      C.stored = r.data.stored || r.data.overrides || {};
      return true;
    }
    // GitHub が使えないときは、公開中のファイルを見本に（保存はできません）。
    try {
      var p = await fetch('/content.json', { cache: 'no-store' });
      C.stored = p.ok ? await p.json() : {};
    } catch (_) { C.stored = {}; }
    return false;
  }
  async function loadSchema() {
    if (C.schema) return C.schema;
    try { C.schema = await (await fetch('/content-schema.json', { cache: 'no-store' })).json(); } catch (_) { C.schema = { groups: [] }; }
    return C.schema;
  }

  /* ---- 保存の履歴 ---- */
  function changeLabel(k) {
    var m;
    var LIST = { faq: 'よくある質問', testimonials: 'お客様の声', cases: '実績' };
    if ((m = /^added\.(\w+):(.*)$/.exec(k))) return (LIST[m[1]] || m[1]) + '（足した項目）';
    if ((m = /^hidden\.(\w+):(.*)$/.exec(k))) return (LIST[m[1]] || m[1]) + '（表示・非表示）';
    if ((m = /^seo:(.*)$/.exec(k))) return '検索結果の見え方：' + m[1];
    if ((m = /^articles:(.*)$/.exec(k))) return 'ブログ記事：' + m[1];
    return window.lumCopyLabel ? window.lumCopyLabel(k) : k;
  }
  function humanMessage(m) {
    var x;
    m = String(m || '');
    if ((x = /^content: (\w{7}) の時点に戻す$/.exec(m))) return '元に戻す（' + x[1] + ' の時点へ）';
    return m.replace(/^content:\s*/, '');
  }
  async function renderHistory() {
    var box = $('cp-v-history');
    box.innerHTML =
      '<p class="share-note" style="margin-bottom:10px">文章を保存するたびに、その時点の内容が GitHub に残っています。間違えて書き換えたときは、その前の時点に戻せます（戻したことも1回の保存として残るので、戻したあとでも元に戻せます）。</p>' +
      '<p class="msg" id="cp-h-msg"></p><ul class="cp-list" id="cp-h-list"><li class="cp-s">読み込み中…</li></ul>';
    var r = await window.lumAdmin.fetch('/api/content-save?history=1').catch(function () { return null; });
    var ul = $('cp-h-list');
    if (!r || !r.res.ok || !r.data.ok) {
      ul.innerHTML = '';
      say('cp-h-msg', (r && r.data && r.data.message) || '保存の履歴を読み込めませんでした。');
      return;
    }
    ul.innerHTML = '';
    var list = r.data.history || [];
    if (!list.length) ul.innerHTML = '<li class="cp-s">まだ保存の記録がありません。</li>';
    list.forEach(function (c, i) {
      var li = document.createElement('li');
      var row = document.createElement('div');
      row.className = 'cp-row';
      row.innerHTML = '<span class="cp-s">' + esc(when(c.at)) + '</span><span class="t">' + esc(humanMessage(c.message)) + '</span>';
      if (i === 0) {
        row.insertAdjacentHTML('beforeend', '<span class="cp-s">いまの状態</span>');
      } else {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'ghost'; b.textContent = 'この時点に戻す';
        b.addEventListener('click', function () { revert(c, b); });
        row.appendChild(b);
      }
      li.appendChild(row);
      var chips = document.createElement('div');
      chips.className = 'cp-chips';
      if (c.changes == null) {
        chips.innerHTML = '<span class="cp-s">変わった項目を読めませんでした</span>';
      } else if (!c.changes.length) {
        chips.innerHTML = '<span class="cp-s">文章の変更はありません（書き方の整理など）</span>';
      } else {
        c.changes.slice(0, 6).forEach(function (k) {
          var s = document.createElement('span');
          s.className = 'cp-chip';
          s.textContent = changeLabel(k);
          chips.appendChild(s);
        });
        if (c.changes.length > 6) chips.insertAdjacentHTML('beforeend', '<span class="cp-s">ほか ' + (c.changes.length - 6) + ' 件</span>');
      }
      li.appendChild(chips);
      ul.appendChild(li);
    });
  }
  async function revert(c, btn) {
    if (window.lumDirtyCopy && window.lumDirtyCopy()) {
      if (!confirm('「文章を直す」に未保存の変更が' + window.lumDirtyCopy() + '件あります。戻すと、その変更は消えます。続けますか？')) return;
    }
    if (!confirm(when(c.at) + ' の時点の文章に戻します。\n\nそれより後に保存した変更は、サイトから外れます（履歴には残るので、あとからまた戻せます）。\n\nよろしいですか？')) return;
    btn.disabled = true;
    var r = await window.lumAdmin.fetch('/api/content-save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revert: c.sha })
    }).catch(function () { return null; });
    btn.disabled = false;
    if (!r || !r.res.ok || !r.data.ok) {
      say('cp-h-msg', (r && r.data && r.data.message) || '戻せませんでした。');
      return;
    }
    C.stored = r.data.stored || C.stored;
    if (window.lumCopyReload) await window.lumCopyReload();
    if (r.data.commit && r.data.commit.sha) window.lumDeployWatch('copy-state', r.data.commit.sha, '文章');
    await renderHistory();
    say('cp-h-msg', r.data.message, true);
  }

  // 文章編集を初めて開いたとき（admin-members.html の lumCopyInit から）。
  window.lumCopyMore = function () {
    build();
  };
})();
