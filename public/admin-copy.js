/* 文章編集（admin-members.html の「文章編集」）の追加の画面。
   いちばん上に切り替えのボタンを足し、もとの「文章を直す」画面の横に
   次の画面を並べます:
     項目を足す・隠す  よくある質問・お客様の声・実績を足す／元からある項目を隠す
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

  // 文章編集を初めて開いたとき（admin-members.html の lumCopyInit から）。
  window.lumCopyMore = function () {
    build();
  };
})();
