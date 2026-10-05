/* 文章編集（admin-members.html の「文章編集」）の追加の画面。
   いちばん上に切り替えのボタンを足し、もとの「文章を直す」画面の横に
   次の画面を並べます:
     項目を足す・隠す  よくある質問・お客様の声・実績を足す／元からある項目を隠す
     検索結果の見え方  ページごとのタイトルと説明文（数え表示と検索結果の見本つき）
     ブログ記事を書く  新しい記事を書く・直す・消す（見え方の確認つき、下書きも可）
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
    { id: 'items', label: '項目を足す・隠す' },
    { id: 'seo', label: '検索結果の見え方' },
    { id: 'blog', label: 'ブログ記事を書く' },
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
    '.cp-list button{padding:5px 10px;font-size:11.5px}' +
    '.cp-h{font-size:12px;letter-spacing:.1em;color:var(--sub);font-weight:700;margin:12px 0 6px}' +
    '.cp-in{display:block;width:100%;margin-top:5px;padding:10px 12px;background:#faf9f6;color:var(--text);border:1px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;line-height:1.7;font-weight:400}' +
    'textarea.cp-in{resize:vertical}' +
    '.cp-prev{background:#fff;border:1px solid var(--border);border-radius:10px;padding:12px 16px;font-size:14px;line-height:1.9;max-height:420px;overflow:auto;overflow-wrap:anywhere}' +
    '.cp-prev h2{font-size:18px;margin:0 0 4px}.cp-prev h3{font-size:15.5px;margin:16px 0 6px;padding-left:10px;border-left:3px solid #4f46e5}' +
    '.cp-prev h4{font-size:14px;margin:12px 0 4px}.cp-prev p{margin:0 0 8px}.cp-prev ul{margin:0 0 8px 1.2em}' +
    '.cp-serp{background:#fff;border:1px solid var(--border);border-radius:10px;padding:12px 14px;font-family:Arial,"Hiragino Sans","Noto Sans JP",sans-serif;max-width:600px}' +
    '.cp-serp .u{font-size:12px;color:#4d5156;overflow-wrap:anywhere}' +
    '.cp-serp .h{font-size:18px;line-height:1.35;color:#1a0dab;margin:3px 0;overflow-wrap:anywhere}' +
    '.cp-serp .d{font-size:13px;line-height:1.6;color:#4d5156;overflow-wrap:anywhere}' +
    '#copy-admin .nq label.nq-label{display:block;margin-bottom:10px}';

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
    if (id === 'items') renderItems();
    if (id === 'seo') renderSeo();
    if (id === 'blog') renderBlog();
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

  /* ---- 項目を足す・隠す ----
     決まり（文字数）は src/lib/content-extra.js の LISTS と同じです。
     保存は1件ずつ（押すとすぐ保存され、1〜2分でサイトに出ます）。 */
  var LISTS = {
    faq: { label: 'よくある質問', prefix: 'faq-a-', max: 30,
      fields: [['q', '質問', 4, 120, 1], ['a', '回答', 10, 1000, 4]] },
    testimonials: { label: 'お客様の声', prefix: 'voice-a-', max: 30,
      fields: [['text', 'お声', 8, 200, 3], ['name', 'お名前（業種など。例：飲食店 店長）', 2, 40, 1], ['detail', 'ご依頼の内容（任意）', 0, 60, 1]] },
    cases: { label: '実績（主な事例）', prefix: 'case-a-', max: 30,
      fields: [['tag', '分野（例：Web・システム）', 1, 20, 1], ['title', '題名', 4, 60, 1], ['desc', '説明', 10, 300, 3]] }
  };
  var itemsList = 'faq';

  function section(name) {
    var s = (C.stored && C.stored[name]) || {};
    return typeof s === 'object' ? s : {};
  }
  /* 元からある項目（content-schema.json から。上書きした文があればそちら） */
  function builtins(list) {
    var out = [], groups = {};
    var cur = function (f) { return (C.stored && typeof C.stored[f.path] === 'string') ? C.stored[f.path] : f.value; };
    (C.schema.groups || []).forEach(function (g) {
      g.fields.forEach(function (f) {
        var m;
        if (list === 'faq' && (m = /^faq\.@([^.]+)\.label$/.exec(f.path))) groups[m[1]] = cur(f);
        if (list === 'faq' && (m = /^faq\.@([^.]+)\.items\.@([^.]+)\.q$/.exec(f.path))) out.push({ id: m[2], group: m[1], text: cur(f) });
        if (list === 'testimonials' && (m = /^site\.TESTIMONIALS\.@([^.]+)\.text$/.exec(f.path))) out.push({ id: m[1], text: cur(f) });
        if (list === 'cases' && (m = /^site\.CASE_STUDIES\.@([^.]+)\.title$/.exec(f.path))) out.push({ id: m[1], text: cur(f) });
      });
    });
    return { items: out, groups: groups };
  }

  async function saveOps(ops, btn, msgId, okText) {
    if (btn) btn.disabled = true;
    var r = await window.lumAdmin.fetch('/api/content-save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: ops })
    }).catch(function () { return null; });
    if (btn) btn.disabled = false;
    if (!r || !r.res.ok || !r.data.ok) {
      say(msgId, (r && r.data && r.data.message) || '保存できませんでした。時間をおいてもう一度お試しください。');
      return false;
    }
    if (r.data.overrides) C.stored = r.data.overrides;
    say(msgId, r.data.changed ? (okText || '保存しました。') + 'サイトへの反映（約1〜2分）を上に表示します。' : '変更はありませんでした。', true);
    if (r.data.commit && r.data.commit.sha) window.lumDeployWatch('copy-state', r.data.commit.sha, '文章');
    return true;
  }

  function counter(input, min, max) {
    var c = document.createElement('span');
    c.className = 'cp-s';
    var upd = function () {
      var n = input.value.trim().length;
      c.textContent = n + ' / ' + max + ' 文字' + (n && n < min ? '（' + min + '文字以上）' : '');
      c.style.color = n > max || (n && n < min) ? '#b42318' : '';
    };
    input.addEventListener('input', upd);
    upd();
    return c;
  }

  /** 足す・直すのフォーム。item が無ければ新しく足す。 */
  function itemForm(list, item, groups, done) {
    var spec = LISTS[list];
    var f = document.createElement('div');
    f.className = 'nq';
    f.style.marginTop = '8px';
    var inputs = {};
    if (list === 'faq') {
      var lab = document.createElement('label');
      lab.className = 'nq-label'; lab.textContent = '載せるグループ';
      var sel = document.createElement('select');
      sel.className = 'cp-in';
      Object.keys(groups).forEach(function (g) {
        var o = document.createElement('option');
        o.value = g; o.textContent = groups[g];
        sel.appendChild(o);
      });
      if (item && item.group) sel.value = item.group;
      lab.appendChild(sel);
      f.appendChild(lab);
      inputs.group = sel;
    }
    spec.fields.forEach(function (d) {
      var lab = document.createElement('label');
      lab.className = 'nq-label';
      lab.textContent = d[1];
      var el = d[4] > 1 ? document.createElement('textarea') : document.createElement('input');
      if (d[4] > 1) el.rows = d[4]; else el.type = 'text';
      el.className = 'cp-in';
      el.maxLength = d[3];
      el.value = item ? (item[d[0]] || '') : '';
      lab.appendChild(el);
      lab.appendChild(counter(el, d[2], d[3]));
      f.appendChild(lab);
      inputs[d[0]] = el;
    });
    var row = document.createElement('div');
    row.className = 'cp-row';
    var ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = item ? 'この内容で保存' : '足して保存';
    var no = document.createElement('button');
    no.type = 'button'; no.className = 'ghost'; no.textContent = 'やめる';
    no.addEventListener('click', function () { done(false); });
    ok.addEventListener('click', async function () {
      var v = { id: item ? item.id : spec.prefix + Math.random().toString(36).slice(2, 8) };
      if (inputs.group) v.group = inputs.group.value;
      for (var i = 0; i < spec.fields.length; i++) {
        var d = spec.fields[i], val = inputs[d[0]].value.trim();
        if (val.length < d[2]) { say('cp-i-msg', d[1].replace(/（.*$/, '') + 'は' + d[2] + '文字以上で書いてください。'); inputs[d[0]].focus(); return; }
        v[d[0]] = val;
      }
      var ops = { added: {} };
      ops.added[list] = {};
      ops.added[list][v.id] = v;
      if (await saveOps(ops, ok, 'cp-i-msg', item ? '直しました。' : '足しました。')) done(true);
    });
    row.appendChild(ok); row.appendChild(no);
    f.appendChild(row);
    return f;
  }

  async function renderItems() {
    var box = $('cp-v-items');
    box.innerHTML = '<p class="cp-s">読み込み中…</p>';
    await loadSchema();
    if (!C.stored) await loadData();
    var spec = LISTS[itemsList];
    var added = (section('added')[itemsList] || []);
    var hidden = (section('hidden')[itemsList] || []);
    var b = builtins(itemsList);
    box.innerHTML =
      '<p class="share-note" style="margin-bottom:10px">よくある質問・お客様の声・実績を、ここから<strong>足す</strong>ことと、元からある項目を<strong>隠す</strong>ことができます。隠した項目は消えずに残るので、いつでも表示に戻せます。足した項目の文字の直しもここで行います。</p>' +
      '<div class="nq-row" role="group" aria-label="どの一覧か" id="cp-i-lists"></div>' +
      '<p class="msg" id="cp-i-msg"></p>' +
      '<h3 class="cp-h">足した項目（' + added.length + ' / ' + spec.max + '）</h3><ul class="cp-list" id="cp-i-added"></ul>' +
      '<div id="cp-i-new" style="margin-top:10px"></div>' +
      '<h3 class="cp-h" style="margin-top:18px">元からある項目</h3><ul class="cp-list" id="cp-i-base"></ul>';
    var lists = $('cp-i-lists');
    Object.keys(LISTS).forEach(function (k) {
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'nq-chip'; x.textContent = LISTS[k].label;
      x.setAttribute('aria-pressed', String(k === itemsList));
      x.addEventListener('click', function () { itemsList = k; renderItems(); });
      lists.appendChild(x);
    });
    var ua = $('cp-i-added');
    if (!added.length) ua.innerHTML = '<li class="cp-s">まだありません。</li>';
    added.forEach(function (it) {
      var li = document.createElement('li');
      var row = document.createElement('div');
      row.className = 'cp-row';
      var main = it.q || it.text || it.title || '';
      row.innerHTML = '<span class="t">' + esc(main) + (itemsList === 'faq' && b.groups[it.group] ? '<br><span class="cp-s">' + esc(b.groups[it.group]) + '</span>' : '') + '</span>';
      var ed = document.createElement('button');
      ed.type = 'button'; ed.className = 'ghost'; ed.textContent = '直す';
      ed.addEventListener('click', function () {
        if (li.querySelector('.nq')) return;
        li.appendChild(itemForm(itemsList, it, b.groups, function (saved) { if (saved) renderItems(); else li.removeChild(li.querySelector('.nq')); }));
      });
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'ghost'; del.textContent = '削除';
      del.addEventListener('click', async function () {
        if (!confirm('「' + main.slice(0, 40) + '」を削除しますか？（保存の履歴からは戻せます）')) return;
        var ops = { added: {} };
        ops.added[itemsList] = {};
        ops.added[itemsList][it.id] = null;
        if (await saveOps(ops, del, 'cp-i-msg', '削除しました。')) renderItems();
      });
      row.appendChild(ed); row.appendChild(del);
      li.appendChild(row);
      ua.appendChild(li);
    });
    var add = document.createElement('button');
    add.type = 'button';
    add.textContent = '＋ ' + spec.label + 'を足す';
    add.disabled = added.length >= spec.max;
    add.addEventListener('click', function () {
      var host = $('cp-i-new');
      add.style.display = 'none';
      var form = itemForm(itemsList, null, b.groups, function (saved) { if (saved) renderItems(); else { host.removeChild(form); add.style.display = ''; } });
      host.appendChild(form);
    });
    $('cp-i-new').appendChild(add);
    var ub = $('cp-i-base');
    b.items.forEach(function (it) {
      var off = hidden.indexOf(it.id) >= 0;
      var li = document.createElement('li');
      var row = document.createElement('div');
      row.className = 'cp-row';
      row.innerHTML = '<span class="t"' + (off ? ' style="opacity:.55;text-decoration:line-through"' : '') + '>' + esc(it.text) +
        (itemsList === 'faq' && b.groups[it.group] ? '<br><span class="cp-s">' + esc(b.groups[it.group]) + '</span>' : '') + '</span>' +
        (off ? '<span class="cp-s">隠しています</span>' : '');
      var tg = document.createElement('button');
      tg.type = 'button'; tg.className = 'ghost';
      tg.textContent = off ? '表示に戻す' : '隠す';
      tg.addEventListener('click', async function () {
        if (!off && !confirm('この項目をサイトから隠しますか？（消えません。あとで「表示に戻す」で戻せます）')) return;
        var ops = { hidden: {} };
        ops.hidden[itemsList] = {};
        ops.hidden[itemsList][it.id] = !off;
        if (await saveOps(ops, tg, 'cp-i-msg', off ? '表示に戻しました。' : '隠しました。')) renderItems();
      });
      row.appendChild(tg);
      li.appendChild(row);
      ub.appendChild(li);
    });
  }

  /* ---- 検索結果の見え方（ページごとのタイトルと説明文） ----
     元の文は /seo-pages.json（ビルドが作る一覧）、変えた文は content.json の
     "seo"。目安の長さは src/lib/content-extra.js の SEO_GUIDE と同じです。
     目安を外れても保存はできます（検索結果で途中が切れやすい、というだけ）。 */
  var GUIDE = { title: [15, 62], description: [60, 160] };
  var LIMIT = { title: 80, description: 200 };
  var seoPages = null, seoPath = '';

  function guideNote(kind, n) {
    var g = GUIDE[kind];
    if (!n) return { text: '空欄なら元の文を使います', bad: false };
    if (n < g[0]) return { text: n + ' 文字（目安 ' + g[0] + '〜' + g[1] + '）短めです', bad: true };
    if (n > g[1]) return { text: n + ' 文字（目安 ' + g[0] + '〜' + g[1] + '）長めです。検索結果では途中で切れます', bad: true };
    return { text: n + ' 文字（目安 ' + g[0] + '〜' + g[1] + '）ちょうどよい長さです', bad: false };
  }
  function cut(t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; }

  async function renderSeo() {
    var box = $('cp-v-seo');
    box.innerHTML = '<p class="cp-s">読み込み中…</p>';
    if (!C.stored) await loadData();
    if (!seoPages) {
      try { seoPages = (await (await fetch('/seo-pages.json', { cache: 'no-store' })).json()).pages || {}; } catch (_) { seoPages = {}; }
    }
    var paths = Object.keys(seoPages);
    if (!paths.length) { box.innerHTML = '<p class="msg show">ページの一覧（seo-pages.json）を読み込めませんでした。</p>'; return; }
    if (!seoPath || !seoPages[seoPath]) seoPath = seoPages['/pricing.html'] ? '/pricing.html' : paths[0];
    var seo = section('seo');
    box.innerHTML =
      '<p class="share-note" style="margin-bottom:10px">Google などの検索結果に出る、ページの<strong>タイトル</strong>と<strong>説明文</strong>です。空欄のままなら元の文が使われます。目安はタイトル15〜62文字、説明文60〜160文字です（超えても保存できますが、検索結果では途中で切れます）。</p>' +
      '<label class="nq-label" for="cp-seo-page" style="display:block">ページ</label>' +
      '<select id="cp-seo-page" class="cp-in" style="margin-bottom:12px"></select>' +
      '<label class="nq-label" for="cp-seo-title" style="display:block">タイトル</label>' +
      '<input type="text" id="cp-seo-title" class="cp-in" maxlength="' + LIMIT.title + '">' +
      '<p class="cp-s" id="cp-seo-tn" style="margin:4px 0 12px"></p>' +
      '<label class="nq-label" for="cp-seo-desc" style="display:block">説明文</label>' +
      '<textarea id="cp-seo-desc" class="cp-in" rows="3" maxlength="' + LIMIT.description + '"></textarea>' +
      '<p class="cp-s" id="cp-seo-dn" style="margin:4px 0 12px"></p>' +
      '<p class="nq-label">検索結果での見え方（見本）</p>' +
      '<div class="cp-serp" id="cp-serp"></div>' +
      '<div class="cp-row" style="margin-top:12px"><button type="button" id="cp-seo-save">保存</button>' +
      '<button type="button" class="ghost" id="cp-seo-reset">元の文に戻す</button></div>' +
      '<p class="msg" id="cp-seo-msg"></p>';
    var sel = $('cp-seo-page');
    paths.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p;
      o.textContent = (seo[p] ? '● ' : '') + (seoPages[p].label || p) + '（' + p + '）';
      sel.appendChild(o);
    });
    sel.value = seoPath;
    var ti = $('cp-seo-title'), de = $('cp-seo-desc');
    var cur = seo[seoPath] || {};
    var def = seoPages[seoPath];
    ti.value = cur.title || '';
    de.value = cur.description || '';
    ti.placeholder = def.title;
    de.placeholder = def.description;
    $('cp-seo-reset').disabled = !seo[seoPath];
    function upd() {
      var t = ti.value.trim(), d = de.value.trim();
      var tn = guideNote('title', t.length), dn = guideNote('description', d.length);
      $('cp-seo-tn').textContent = tn.text;
      $('cp-seo-tn').style.color = tn.bad ? '#b45309' : '';
      $('cp-seo-dn').textContent = dn.text;
      $('cp-seo-dn').style.color = dn.bad ? '#b45309' : '';
      var host = location.host || 'example.com';
      $('cp-serp').innerHTML =
        '<div class="u">' + esc(host + ' › ' + seoPath.replace(/^\//, '')) + '</div>' +
        '<div class="h">' + esc(cut(t || def.title, 62)) + '</div>' +
        '<div class="d">' + esc(cut(d || def.description, 160)) + '</div>';
    }
    ti.addEventListener('input', upd);
    de.addEventListener('input', upd);
    upd();
    sel.addEventListener('change', function () { seoPath = sel.value; renderSeo(); });
    $('cp-seo-save').addEventListener('click', async function () {
      var t = ti.value.trim(), d = de.value.trim();
      var ops = { seo: {} };
      ops.seo[seoPath] = t || d ? { title: t, description: d } : null;
      if (await saveOps(ops, this, 'cp-seo-msg', '保存しました。')) { var m = $('cp-seo-msg').textContent; await renderSeo(); say('cp-seo-msg', m, true); }
    });
    $('cp-seo-reset').addEventListener('click', async function () {
      if (!confirm('このページのタイトルと説明文を、元の文に戻しますか？')) return;
      var ops = { seo: {} };
      ops.seo[seoPath] = null;
      if (await saveOps(ops, this, 'cp-seo-msg', '元の文に戻しました。')) { var m = $('cp-seo-msg').textContent; await renderSeo(); say('cp-seo-msg', m, true); }
    });
  }

  /* ---- ブログ記事を書く ----
     content.json の "added.articles" に入り、ビルドで /blog/<英字の名前>.html に
     なります（元からある記事は /blog/post-<番号>.html のまま）。本文の書き方は
     ビルドと同じ: 「## 見出し」「### 小見出し」「- 箇条書き」「**太字**」、
     空行で段落。決まりは src/lib/content-extra.js の checkArticle と同じです。 */
  var SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
  var ALIM = { title: [4, 80], description: [10, 160], body: [50, 20000] };

  function slugProblem(slug, taken) {
    if (!slug) return '英字の名前を入れてください。';
    if (!SLUG_RE.test(slug) || /--/.test(slug)) return '英小文字・数字・ハイフンだけで、先頭と末尾は英数字にしてください（例：ai-first-steps）。';
    if (slug === 'index' || /^post-/.test(slug)) return '「index」と「post-」で始まる名前は使えません。';
    if (taken.indexOf(slug) >= 0) return 'この名前はほかの記事で使っています。';
    return '';
  }
  /* ビルド（scripts/build-content-pages.mjs の md）と同じ書き方の見本。 */
  function mdLite(src) {
    var inl = function (t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); };
    var html = '', inList = false;
    var close = function () { if (inList) { html += '</ul>'; inList = false; } };
    String(src || '').split('\n').forEach(function (raw) {
      var line = raw.trim();
      if (!line) { close(); return; }
      if (line.indexOf('### ') === 0) { close(); html += '<h4>' + inl(line.slice(4)) + '</h4>'; return; }
      if (line.indexOf('## ') === 0) { close(); html += '<h3>' + inl(line.slice(3)) + '</h3>'; return; }
      if (line.indexOf('- ') === 0) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inl(line.slice(2)) + '</li>'; return; }
      close();
      html += '<p>' + inl(line) + '</p>';
    });
    close();
    return html;
  }

  async function renderBlog() {
    var box = $('cp-v-blog');
    box.innerHTML = '<p class="cp-s">読み込み中…</p>';
    await loadSchema();
    if (!C.stored) await loadData();
    var list = (section('added').articles || []).slice();
    list.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    box.innerHTML =
      '<p class="share-note" style="margin-bottom:10px">新しいブログ記事を書けます。保存すると約1〜2分でサイトのブログに出ます（「下書き」にした記事は出ません）。元からある記事の文の直しは「文章を直す」の「ブログ記事」からできます。</p>' +
      '<p class="msg" id="cp-b-msg"></p>' +
      '<div id="cp-b-edit"></div>' +
      '<h3 class="cp-h">ここで書いた記事（' + list.length + '本）</h3><ul class="cp-list" id="cp-b-list"></ul>';
    var ul = $('cp-b-list');
    if (!list.length) ul.innerHTML = '<li class="cp-s">まだありません。</li>';
    list.forEach(function (a) {
      var li = document.createElement('li');
      var row = document.createElement('div');
      row.className = 'cp-row';
      row.innerHTML = '<span class="cp-s" style="flex:0 0 auto">' + esc(a.date || '日付なし') + '</span>' +
        '<span class="t">' + (a.draft ? '<span class="cp-chip" style="margin-right:6px">下書き</span>' : '') + esc(a.title || '（題名なし）') +
        '<br><span class="cp-s">/blog/' + esc(a.slug) + '.html</span></span>';
      var ed = document.createElement('button');
      ed.type = 'button'; ed.className = 'ghost'; ed.textContent = '直す';
      ed.addEventListener('click', function () { openArticle(a, list); });
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'ghost'; del.textContent = '削除';
      del.addEventListener('click', async function () {
        if (!confirm('記事「' + (a.title || a.slug) + '」を削除しますか？\nサイトからも消えます（保存の履歴からは戻せます）。')) return;
        var ops = { articles: {} };
        ops.articles[a.slug] = null;
        if (await saveOps(ops, del, 'cp-b-msg', '削除しました。')) { var m = $('cp-b-msg').textContent; await renderBlog(); say('cp-b-msg', m, true); }
      });
      row.appendChild(ed); row.appendChild(del);
      li.appendChild(row);
      ul.appendChild(li);
    });
    var add = document.createElement('button');
    add.type = 'button'; add.textContent = '＋ 新しい記事を書く';
    add.addEventListener('click', function () { openArticle(null, list); });
    $('cp-b-edit').appendChild(add);
  }

  function categories() {
    var seen = {};
    (C.schema.groups || []).forEach(function (g) {
      g.fields.forEach(function (f) { if (/^articles\.[^.]+\.category$/.test(f.path)) seen[f.value] = 1; });
    });
    return Object.keys(seen);
  }

  function openArticle(a, list) {
    var host = $('cp-b-edit');
    var taken = list.filter(function (x) { return !a || x.slug !== a.slug; }).map(function (x) { return x.slug; });
    var today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    host.innerHTML =
      '<div class="nq">' +
      '<p class="nq-label" style="font-size:13px">' + (a ? '記事を直す' : '新しい記事') + '</p>' +
      '<label class="nq-label" for="cp-b-title">題名<input type="text" id="cp-b-title" class="cp-in" maxlength="80"></label><p class="cp-s" id="cp-b-tn"></p>' +
      '<label class="nq-label" for="cp-b-slug" style="margin-top:8px">記事の住所に使う英字の名前<input type="text" id="cp-b-slug" class="cp-in" maxlength="60" placeholder="例：ai-first-steps" autocapitalize="off" spellcheck="false"></label>' +
      '<p class="cp-s" id="cp-b-sn"></p>' +
      '<div class="cp-row" style="margin-top:8px"><label class="nq-label" style="flex:1 1 150px">公開日<input type="date" id="cp-b-date" class="cp-in"></label>' +
      '<label class="nq-label" style="flex:1 1 150px">カテゴリ<input type="text" id="cp-b-cat" class="cp-in" maxlength="20" list="cp-b-cats"></label></div>' +
      '<datalist id="cp-b-cats">' + categories().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
      '<label class="nq-label" for="cp-b-desc" style="margin-top:8px">説明（検索結果や一覧に出る1〜2文）<textarea id="cp-b-desc" class="cp-in" rows="2" maxlength="160"></textarea></label><p class="cp-s" id="cp-b-dn"></p>' +
      '<p class="nq-label" style="margin-top:8px">本文</p>' +
      '<div class="nq-row" style="margin-bottom:6px">' +
        '<button type="button" class="nq-chip" data-ins="## ">見出し</button>' +
        '<button type="button" class="nq-chip" data-ins="### ">小見出し</button>' +
        '<button type="button" class="nq-chip" data-ins="- ">箇条書き</button>' +
        '<button type="button" class="nq-chip" data-bold="1">太字</button></div>' +
      '<textarea id="cp-b-body" class="cp-in" rows="12" maxlength="20000"></textarea><p class="cp-s" id="cp-b-bn"></p>' +
      '<label class="copy-only" style="display:block;margin:10px 0"><input type="checkbox" id="cp-b-draft"> 下書きにする（保存はしますが、サイトには出しません）</label>' +
      '<p class="nq-label">見え方（サイトでの出方の見本）</p><div class="cp-prev" id="cp-b-prev"></div>' +
      '<div class="cp-row" style="margin-top:12px"><button type="button" id="cp-b-save">保存</button><button type="button" class="ghost" id="cp-b-cancel">やめる</button></div>' +
      '</div>';
    var f = {
      title: $('cp-b-title'), slug: $('cp-b-slug'), date: $('cp-b-date'), cat: $('cp-b-cat'),
      desc: $('cp-b-desc'), body: $('cp-b-body'), draft: $('cp-b-draft')
    };
    f.title.value = a ? a.title : '';
    f.slug.value = a ? a.slug : '';
    f.date.value = (a && a.date) || today;
    f.cat.value = a ? a.category : '';
    f.desc.value = a ? a.description : '';
    f.body.value = a ? a.body : '## はじめに\n\n';
    f.draft.checked = !!(a && a.draft);
    function n(el, lim, id) {
      var k = el.value.trim().length;
      var bad = k && (k < lim[0] || k > lim[1]);
      $(id).textContent = k + ' 文字（' + lim[0] + '〜' + lim[1] + '）';
      $(id).style.color = bad ? '#b45309' : '';
    }
    function upd() {
      n(f.title, ALIM.title, 'cp-b-tn');
      n(f.desc, ALIM.description, 'cp-b-dn');
      n(f.body, ALIM.body, 'cp-b-bn');
      var sp = slugProblem(f.slug.value.trim(), taken);
      $('cp-b-sn').textContent = sp || ('住所：' + location.origin + '/blog/' + f.slug.value.trim() + '.html');
      $('cp-b-sn').style.color = sp && f.slug.value ? '#b42318' : '';
      $('cp-b-prev').innerHTML = '<h2>' + esc(f.title.value || '（題名）') + '</h2>' +
        '<p class="cp-s">' + esc((f.date.value || '').replace(/-/g, '.')) + ' ・ ' + esc(f.cat.value || 'カテゴリ') + '</p>' + mdLite(f.body.value);
    }
    ['title', 'slug', 'date', 'cat', 'desc', 'body'].forEach(function (k) { f[k].addEventListener('input', upd); });
    Array.prototype.forEach.call(host.querySelectorAll('[data-ins]'), function (b) {
      b.addEventListener('click', function () {
        var ta = f.body, s0 = ta.selectionStart, v = ta.value;
        var ls = v.lastIndexOf('\n', s0 - 1) + 1;
        ta.value = v.slice(0, ls) + b.getAttribute('data-ins') + v.slice(ls);
        ta.focus();
        ta.setSelectionRange(s0 + b.getAttribute('data-ins').length, s0 + b.getAttribute('data-ins').length);
        upd();
      });
    });
    host.querySelector('[data-bold]').addEventListener('click', function () {
      var ta = f.body, s0 = ta.selectionStart, s1 = ta.selectionEnd, v = ta.value;
      if (s0 === s1) { say('cp-b-msg', '太字にしたい言葉を選んでから押してください。', true); return; }
      ta.value = v.slice(0, s0) + '**' + v.slice(s0, s1) + '**' + v.slice(s1);
      ta.focus();
      upd();
    });
    upd();
    $('cp-b-cancel').addEventListener('click', function () { renderBlog(); });
    $('cp-b-save').addEventListener('click', async function () {
      var v = {
        slug: f.slug.value.trim(), title: f.title.value.trim(), date: f.date.value, category: f.cat.value.trim(),
        description: f.desc.value.trim(), body: f.body.value, draft: f.draft.checked
      };
      var sp = slugProblem(v.slug, taken);
      if (sp) { say('cp-b-msg', sp); f.slug.focus(); return; }
      if (!v.draft) {
        var checks = [['title', '題名'], ['description', '説明'], ['body', '本文']];
        for (var i = 0; i < checks.length; i++) {
          var k = checks[i][0], lim = ALIM[k], len = String(v[k]).trim().length;
          if (len < lim[0] || len > lim[1]) { say('cp-b-msg', checks[i][1] + 'は' + lim[0] + '〜' + lim[1] + '文字にしてください（いま' + len + '文字）。下書きなら、このままでも保存できます。'); return; }
        }
        if (!v.category) { say('cp-b-msg', 'カテゴリを入れてください。'); f.cat.focus(); return; }
      } else if (!v.title) { say('cp-b-msg', '下書きでも題名は入れてください。'); f.title.focus(); return; }
      var ops = { articles: {} };
      if (a && a.slug !== v.slug) ops.articles[a.slug] = null;
      ops.articles[v.slug] = v;
      if (await saveOps(ops, this, 'cp-b-msg', v.draft ? '下書きを保存しました（サイトには出ません）。' : '記事を保存しました。')) {
        var m = $('cp-b-msg').textContent; await renderBlog(); say('cp-b-msg', m, true);
      }
    });
    f.title.focus();
  }

  // 文章編集を初めて開いたとき（admin-members.html の lumCopyInit から）。
  window.lumCopyMore = function () {
    build();
  };
})();
