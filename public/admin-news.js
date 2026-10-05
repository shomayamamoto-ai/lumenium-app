/* お知らせ投稿の追加の機能（管理画面 admin-members.html の「お知らせ投稿」）。
   下書き・予約・画像・「SNSにも出す」・保存の履歴と「この時点に戻す」。

   投稿のフォームと一覧は admin-members.html の中にあります。ここは
   window.lumNews として、その途中から呼ばれる小さな入口だけを持ちます:
     extra(payload)     投稿の直前。予約・画像を足す。下書きはここで保存して null
     saved(payload, d)  保存できたあと（SNSにも出すボタン、下書きの片付け）
     decorate(li, n)    一覧の1件に「予約」の印と画像の小さな見本を付ける
     edit(n) / reset()  編集を始めた・やめた
     load(data)         一覧を読み込んだ（下書きもここで受け取る）
     visible(items)     サイトに出ているはずの分だけ（反映済みかの比べ合わせ用）

   予約の判断（公開日が来たか）は src/lib/news.js と同じ決まりです。
   日付は日本時間で数えます。 */
(function () {
  'use strict';

  var S = {
    mode: 'now',        // now | scheduled | draft
    image: null,        // { url, alt }
    draftId: '',        // 下書きの続きを書いているとき
    drafts: null,       // null = 保存先が無い
    editing: false,
    built: false
  };

  function $(id) { return document.getElementById(id); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function jstDay(offset) {
    return new Date(Date.now() + 9 * 3600000 + (offset || 0) * 86400000).toISOString().slice(0, 10);
  }
  function say(text, isInfo) {
    var m = $('news-msg');
    if (!m) return;
    m.textContent = text;
    m.classList.add('show');
    m.classList.toggle('info', !!isInfo);
  }
  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function md(day) { return String(day || '').slice(5).replace('-', '/'); }

  /* ---- 予約の判断（src/lib/news.js と同じ） ---- */
  function isLive(n, today) {
    if (!n || !n.title) return false;
    if (n.status === 'scheduled') return /^\d{4}-\d{2}-\d{2}$/.test(n.publishAt || '') && n.publishAt <= today;
    return true;
  }

  /* ---- 画面の部品 ---- */
  var CSS =
    '.nw-sec{margin:0 0 14px}' +
    '.nw-img{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px}' +
    '.nw-img img{width:96px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border);background:#fff}' +
    '.nw-in{width:100%;padding:10px 12px;background:#faf9f6;color:var(--text);border:1px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit}' +
    '.nw-badge{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;margin-right:6px;vertical-align:1px;white-space:nowrap}' +
    '.nw-badge.sch{background:rgba(180,83,9,.1);color:#92400e;border:1px solid rgba(180,83,9,.35)}' +
    '.nw-badge.due{background:rgba(4,120,87,.1);color:#065f46;border:1px solid rgba(4,120,87,.35)}' +
    '.nw-badge.img{background:#f3f1ec;color:var(--sub);border:1px solid var(--border)}' +
    '.nw-list{list-style:none;margin:0;padding:0}' +
    '.nw-list li{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px}' +
    '.nw-list .t{flex:1 1 180px;min-width:0;overflow-wrap:anywhere}' +
    '.nw-list .s{color:var(--sub);font-size:11.5px}' +
    '.nw-list button{padding:5px 10px;font-size:11.5px}' +
    '.nw-after{margin-top:12px;background:rgba(20,184,166,.08);border:1px solid #14b8a6;border-radius:10px;padding:11px 13px;font-size:12.5px;line-height:1.75}' +
    '.nw-after:empty{display:none}' +
    '.nw-after button{margin-top:8px;font-size:12px;padding:7px 12px}' +
    '#nw-history summary{cursor:pointer;font-size:12.5px;font-weight:700;color:var(--sub);padding:6px 0}' +
    '#news-items li img.nw-th{width:44px;height:30px;object-fit:cover;border-radius:5px;flex-shrink:0;align-self:center}' +
    // スマホでは題名に幅を残し、ボタンは次の行へ（題名が1文字ずつ折り返さないように）。
    '@media (max-width:480px){#news-items li{flex-wrap:wrap}#news-items li .nw-t{flex:1 1 55%;min-width:0}}';

  function build() {
    if (S.built) return;
    var form = $('news-form');
    var btn = $('news-btn');
    if (!form || !btn) return;
    S.built = true;

    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    /* 画像（任意・説明は必須） */
    var img = document.createElement('div');
    img.className = 'nw-sec';
    img.innerHTML =
      '<p class="nq-label" style="margin-bottom:6px">画像（任意・1枚）</p>' +
      '<div class="nw-img"><span id="nw-img-view"></span>' +
        '<button type="button" class="ghost" id="nw-img-pick" style="font-size:12px;padding:8px 12px">画像を選ぶ</button>' +
        '<button type="button" class="ghost" id="nw-img-drop" style="font-size:12px;padding:8px 12px;display:none">画像を外す</button>' +
        '<input type="file" id="nw-img-file" accept="image/jpeg,image/png,image/webp" style="display:none"></div>' +
      '<div id="nw-alt-row" style="display:none">' +
        '<label for="nw-img-alt" style="display:block;font-size:12.5px;font-weight:700;margin-bottom:6px">画像の説明（必須・120文字まで）</label>' +
        '<input type="text" id="nw-img-alt" class="nw-in" maxlength="120" placeholder="例：新しくなったトップページの画面">' +
        '<p class="share-note" style="margin:6px 0 0">何が写っているかを短く書いてください。目の不自由な方の読み上げや、検索エンジンが画像を理解するのに使われます。</p>' +
      '</div>';
    form.insertBefore(img, btn);

    /* 公開のしかた */
    var how = document.createElement('div');
    how.className = 'nq';
    how.style.marginTop = '14px';
    how.innerHTML =
      '<p class="nq-label">公開のしかた</p>' +
      '<div class="nq-row" role="group" aria-label="公開のしかた">' +
        '<button type="button" class="nq-chip" data-nw-mode="now">すぐ公開</button>' +
        '<button type="button" class="nq-chip" data-nw-mode="scheduled">日付を決めて予約</button>' +
        '<button type="button" class="nq-chip" data-nw-mode="draft">下書きとして保存</button>' +
      '</div>' +
      '<div id="nw-when" style="display:none">' +
        '<label for="nw-publish-at" style="display:block;font-size:12.5px;font-weight:700;margin-bottom:6px">公開する日</label>' +
        '<input type="date" id="nw-publish-at" class="nw-in" style="max-width:220px">' +
      '</div>' +
      '<p class="share-note" id="nw-how-note" style="margin:8px 0 0"></p>';
    form.insertBefore(how, btn);

    /* 保存のあとに出す案内（SNSにも出す） */
    var after = document.createElement('div');
    after.className = 'nw-after';
    after.id = 'nw-after';
    var msg = $('news-msg');
    if (msg && msg.parentNode) msg.parentNode.insertBefore(after, msg.nextSibling);

    /* 下書きの一覧と、保存の履歴 */
    var list = $('news-items');
    var box = list ? list.parentNode : null;
    if (box) {
      var dr = document.createElement('div');
      dr.id = 'nw-drafts';
      dr.style.cssText = 'margin-bottom:18px';
      box.insertBefore(dr, box.firstChild);
      var hist = document.createElement('details');
      hist.id = 'nw-history';
      hist.style.cssText = 'margin-top:18px';
      hist.innerHTML = '<summary>保存の履歴（最近20回）・元に戻す</summary>' +
        '<p class="share-note" style="margin:6px 0 8px">お知らせを保存するたびに、その時点の一覧が GitHub に残っています。間違えて消した・書き換えたときは、その前の時点に戻せます。</p>' +
        '<p class="msg" id="nw-history-msg"></p><ul class="nw-list" id="nw-history-list"></ul>';
      box.appendChild(hist);
      hist.addEventListener('toggle', function () { if (hist.open) loadHistory(); });
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-nw-mode]'), function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-nw-mode')); });
    });
    var pa = $('nw-publish-at');
    pa.min = jstDay(1);
    pa.max = jstDay(365);
    $('nw-img-pick').addEventListener('click', function () { $('nw-img-file').click(); });
    $('nw-img-file').addEventListener('change', onFile);
    $('nw-img-drop').addEventListener('click', function () { setImage(null); });
    $('nw-img-alt').addEventListener('input', function () { if (S.image) S.image.alt = this.value; });
    setMode('now');
    renderDrafts();
  }

  /* 日付の欄（admin-members.html の「日付」）は、予約のときは使いません。 */
  function dateRow() {
    var d = $('news-date');
    return d ? d.parentNode : null;
  }

  function setMode(mode) {
    if (mode === 'draft' && (S.editing || S.drafts === null)) {
      say(S.editing
        ? '公開済みのお知らせは、下書きに戻せません。直した内容は「この内容で更新」で保存してください。'
        : '下書きには保存先（Upstash Redis）が要ります。設定状況から保存先をつなぐと使えます。');
      mode = 'now';
    }
    S.mode = mode;
    Array.prototype.forEach.call(document.querySelectorAll('[data-nw-mode]'), function (b) {
      var m = b.getAttribute('data-nw-mode');
      b.setAttribute('aria-pressed', String(m === mode));
      if (m === 'draft') b.disabled = S.editing || S.drafts === null;
    });
    $('nw-when').style.display = mode === 'scheduled' ? 'block' : 'none';
    var row = dateRow();
    if (row) {
      row.style.display = mode === 'scheduled' ? 'none' : '';
      var lab = row.previousElementSibling;
      if (lab && lab.classList.contains('nq-label')) lab.style.display = mode === 'scheduled' ? 'none' : '';
    }
    if (mode === 'scheduled' && !$('nw-publish-at').value) $('nw-publish-at').value = jstDay(1);
    var note = $('nw-how-note');
    note.textContent = mode === 'scheduled'
      ? '選んだ日の朝9時ごろに、自動でサイトに出ます。それまではサイトにも検索にも出ません。'
      : mode === 'draft'
        ? '下書きはサイトに出ず、サイトの作り直しも起きません。続きはあとから「下書き」の一覧で書けます。'
        : '保存すると約1〜2分でサイトに出ます。';
    var b = $('news-btn');
    b.textContent = mode === 'draft' ? '下書きを保存'
      : mode === 'scheduled' ? (S.editing ? 'この内容で予約を更新' : '予約する')
      : (S.editing ? 'この内容で更新' : '投稿する');
  }

  /* ---- 画像 ---- */
  function setImage(img) {
    S.image = img ? { url: img.url, alt: img.alt || '' } : null;
    var v = $('nw-img-view');
    v.innerHTML = S.image ? '<img src="' + esc(S.image.url) + '" alt="">' : '';
    $('nw-img-drop').style.display = S.image ? '' : 'none';
    $('nw-img-pick').textContent = S.image ? '別の画像にする' : '画像を選ぶ';
    $('nw-alt-row').style.display = S.image ? 'block' : 'none';
    $('nw-img-alt').value = S.image ? S.image.alt : '';
  }

  var MAX_UP = Math.floor(4.4 * 1048576);
  function toJpeg(file) {
    return new Promise(function (ok, no) {
      var u = URL.createObjectURL(file);
      var im = new Image();
      im.onload = function () {
        // 長い辺を1600pxまで。お知らせのページの幅には十分で、重くなりません。
        var scale = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
        var w = Math.round(im.naturalWidth * scale), h = Math.round(im.naturalHeight * scale);
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
        cx.drawImage(im, 0, 0, w, h);
        URL.revokeObjectURL(u);
        cv.toBlob(function (b) { if (b && b.size <= MAX_UP) ok(b); else no(new Error('big')); }, 'image/jpeg', 0.85);
      };
      im.onerror = function () { URL.revokeObjectURL(u); no(new Error('read')); };
      im.src = u;
    });
  }
  async function onFile() {
    var f = $('nw-img-file').files[0];
    $('nw-img-file').value = '';
    if (!f) return;
    var pick = $('nw-img-pick');
    pick.disabled = true;
    say('画像を縮めて置いています…', true);
    try {
      var blob = await toJpeg(f);
      var res = await fetch('/api/social-upload?kind=news', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + window.lumAdmin.key(), 'Content-Type': 'image/jpeg' },
        body: blob
      });
      var d = {};
      try { d = await res.clone().json(); } catch (_) {}
      if (res.status === 401 && window.lumAdmin.tap) await window.lumAdmin.tap(res);
      if (d.ok && d.url) {
        setImage({ url: d.url, alt: '' });
        say('画像を置きました。下の「画像の説明」を書いてください。', true);
        $('nw-img-alt').focus();
      } else {
        say(d.message || '画像を置けませんでした。');
      }
    } catch (_) {
      say('画像を読み込めませんでした。JPEG・PNG・WebP の画像を選んでください。');
    }
    pick.disabled = false;
  }

  /* ---- 下書き ---- */
  function formValues() {
    return {
      title: $('news-title').value.trim(),
      body: $('news-body').value.trim(),
      link: $('news-link').value.trim()
    };
  }
  function setLink(v) {
    var input = $('news-link'), pick = $('news-link-pick');
    input.value = v || '';
    var known = Array.prototype.some.call(pick.options, function (o) { return o.value === input.value && o.value !== '__custom'; });
    pick.value = known ? input.value : '__custom';
    input.style.display = pick.value === '__custom' ? 'block' : 'none';
  }
  async function saveDraft() {
    var v = formValues();
    if (!v.title && !v.body) { say('タイトルか本文のどちらかを書いてから保存してください。'); return; }
    if (S.image && !String(S.image.alt || '').trim()) { say('画像の説明を書いてください（下書きでも必要です）。'); $('nw-img-alt').focus(); return; }
    var btn = $('news-btn');
    btn.disabled = true;
    var r = await window.lumAdmin.fetch('/api/news-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'draft-save', id: S.draftId || undefined, title: v.title, body: v.body, link: v.link,
        image: S.image, publishAt: $('nw-publish-at').value || '' })
    }).catch(function () { return null; });
    btn.disabled = false;
    if (r && r.res.ok && r.data.ok) {
      S.drafts = r.data.drafts || [];
      if (!S.draftId && S.drafts[0]) S.draftId = S.drafts[0].id;
      renderDrafts();
      say(r.data.message || '下書きを保存しました。', true);
    } else {
      say((r && r.data && r.data.message) || '下書きを保存できませんでした。');
    }
  }
  function openDraft(d) {
    if ($('news-cancel') && $('news-cancel').style.display !== 'none') $('news-cancel').click();
    $('news-title').value = d.title || '';
    $('news-body').value = d.body || '';
    setLink(d.link || '');
    setImage(d.image || null);
    S.draftId = d.id;
    if (d.publishAt && d.publishAt > jstDay(0)) $('nw-publish-at').value = d.publishAt;
    setMode('draft');
    say('下書きの続きです。書き終えたら「すぐ公開」か「日付を決めて予約」を選んでから保存してください。', true);
    $('news-title').focus();
  }
  async function dropDraft(d, btn) {
    if (!confirm('下書き「' + (d.title || '（題名なし）') + '」を削除しますか？')) return;
    btn.disabled = true;
    var r = await window.lumAdmin.fetch('/api/news-post', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'draft-delete', id: d.id })
    }).catch(function () { return null; });
    btn.disabled = false;
    if (r && r.res.ok && r.data.ok) {
      S.drafts = r.data.drafts || [];
      if (S.draftId === d.id) S.draftId = '';
      renderDrafts();
      say(r.data.message || '下書きを削除しました。', true);
    } else {
      say((r && r.data && r.data.message) || '削除できませんでした。');
    }
  }
  function renderDrafts() {
    var host = $('nw-drafts');
    if (!host) return;
    if (S.drafts === null) { host.innerHTML = ''; return; }
    host.innerHTML = '<h3 style="font-size:12px;letter-spacing:0.1em;color:var(--sub);font-weight:700;margin-bottom:6px">下書き（サイトには出ていません）</h3>';
    var ul = document.createElement('ul');
    ul.className = 'nw-list';
    if (!S.drafts.length) {
      ul.innerHTML = '<li class="s">下書きはありません。「公開のしかた」で「下書きとして保存」を選ぶと、ここに残ります。</li>';
    }
    S.drafts.forEach(function (d) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="t">' + (d.image ? '<span class="nw-badge img">画像あり</span>' : '') + esc(d.title || '（題名なし）') + '</span>' +
        '<span class="s">' + esc(when(d.savedAt)) + ' 保存</span>';
      var go = document.createElement('button');
      go.type = 'button'; go.className = 'ghost'; go.textContent = '続きを書く';
      go.addEventListener('click', function () { openDraft(d); });
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'ghost'; del.textContent = '削除';
      del.addEventListener('click', function () { dropDraft(d, del); });
      li.appendChild(go); li.appendChild(del);
      ul.appendChild(li);
    });
    host.appendChild(ul);
  }

  /* ---- 保存の履歴と「この時点に戻す」 ---- */
  function humanMessage(m) {
    m = String(m || '');
    var x;
    if ((x = /^news: edit (.*)$/.exec(m))) return '編集：' + x[1];
    if ((x = /^news: remove (.*)$/.exec(m))) return '削除（' + x[1] + '）';
    if ((x = /^news: (\w{7}) の時点に戻す$/.exec(m))) return '元に戻す（' + x[1] + ' の時点へ）';
    if (/^news: 予約の公開日/.test(m)) return '予約の公開（自動）';
    if ((x = /^news: (.*)$/.exec(m))) return '投稿：' + x[1];
    return m;
  }
  async function loadHistory() {
    var ul = $('nw-history-list'), msg = $('nw-history-msg');
    ul.innerHTML = '<li class="s">読み込み中…</li>';
    msg.classList.remove('show');
    var r = await window.lumAdmin.fetch('/api/news-post?history=1').catch(function () { return null; });
    if (!r || !r.res.ok || !r.data.ok) {
      ul.innerHTML = '';
      msg.textContent = (r && r.data && r.data.message) || '保存の履歴を読み込めませんでした。';
      msg.classList.add('show');
      return;
    }
    ul.innerHTML = '';
    (r.data.history || []).forEach(function (c, i) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="s" style="flex:0 0 auto">' + esc(when(c.at)) + '</span>' +
        '<span class="t">' + esc(humanMessage(c.message)) + '</span>';
      if (i === 0) {
        li.insertAdjacentHTML('beforeend', '<span class="s">いまの状態</span>');
      } else {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'ghost'; b.textContent = 'この時点に戻す';
        b.addEventListener('click', function () {
          if (!confirm(when(c.at) + ' の時点のお知らせ一覧に戻します。\n\nそれより後に投稿・編集したお知らせは、一覧から消えるか元の文に戻ります（履歴には残るので、あとからまた戻せます）。\n\nよろしいですか？')) return;
          if (window.lumNewsPost) window.lumNewsPost({ action: 'revert', sha: c.sha }, b);
        });
        li.appendChild(b);
      }
      ul.appendChild(li);
    });
    if (!ul.children.length) ul.innerHTML = '<li class="s">まだ履歴がありません。</li>';
  }

  /* ---- SNSにも出す ---- */
  function offerSocial(title, body, url) {
    var box = $('nw-after');
    box.innerHTML = '';
    var p = document.createElement('div');
    p.textContent = 'お知らせのページ（' + url + '）は約1〜2分でできます。SNSでも知らせますか？';
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'SNSにも出す';
    b.addEventListener('click', function () { toSocial(title, body, url); });
    var x = document.createElement('button');
    x.type = 'button'; x.className = 'ghost'; x.style.marginLeft = '6px';
    x.textContent = '閉じる';
    x.addEventListener('click', function () { box.innerHTML = ''; });
    box.appendChild(p); box.appendChild(b); box.appendChild(x);
  }
  function toSocial(title, body, url) {
    var text = title + (body ? '\n\n' + (body.length > 120 ? body.slice(0, 119) + '…' : body) : '');
    var DRAFT_KEY = 'lum_social_draft_v1';
    var ta = $('social-text'), ln = $('social-link');
    var ready = ta && ta.dataset.restored === '1';
    // SNS（文章）の書きかけは、画面を開く前はこの端末に保存されたものが使われます。
    var old = null;
    try { old = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (_) { old = null; }
    var had = ready ? ta.value.trim() : (old && String(old.text || '').trim());
    if (had && had !== text && !confirm('SNS（文章）に書きかけの本文があります。お知らせの内容に置き換えますか？')) return;
    if (ready) {
      ta.value = text;
      ln.value = url;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ln.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      var d = old && typeof old === 'object' ? old : {};
      d.text = text; d.link = url;
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (_) {}
    }
    if (window.lumShowTab) window.lumShowTab('social-admin');
    if (!ready) {
      // 初めて開くときは、読み込みのあとで書きかけが入ります。念のため入っていなければ入れます。
      setTimeout(function () {
        var t2 = $('social-text');
        if (t2 && !t2.value.trim()) { t2.value = text; $('social-link').value = url; t2.dispatchEvent(new Event('input', { bubbles: true })); }
      }, 1500);
    }
  }

  /* ---- admin-members.html から呼ばれる入口 ---- */
  window.lumNews = {
    extra: function (payload) {
      build();
      if (S.image && !String(S.image.alt || '').trim()) {
        say('画像の説明を書いてください。何が写っているかを短く（例：新しくなったトップページの画面）。');
        $('nw-img-alt').focus();
        return null;
      }
      if (S.mode === 'draft') { saveDraft(); return null; }
      payload.image = S.image ? { url: S.image.url, alt: S.image.alt.trim() } : null;
      if (S.mode === 'scheduled') {
        var day = $('nw-publish-at').value;
        if (!day || day <= jstDay(0)) { say('予約の日付は、明日以降の日付を選んでください。'); $('nw-publish-at').focus(); return null; }
        payload.status = 'scheduled';
        payload.publishAt = day;
        delete payload.date;
      }
      if (S.draftId) payload.fromDraft = S.draftId;
      return payload;
    },
    saved: function (payload, d) {
      var box = $('nw-after');
      if (box) box.innerHTML = '';
      if (payload.fromDraft && S.drafts) {
        S.drafts = S.drafts.filter(function (x) { return x.id !== payload.fromDraft; });
        renderDrafts();
      }
      if ((payload.action === 'add' || payload.action === 'edit') && payload.status !== 'scheduled' && d && d.id) {
        offerSocial(payload.title, payload.body || '', location.origin + '/news/' + d.id + '.html');
      } else if (payload.status === 'scheduled' && box) {
        box.textContent = '予約しました（' + payload.publishAt + ' の朝9時ごろに公開）。SNSでのお知らせは、公開された日に「掲載中のお知らせ」の一覧から出せます。';
      }
      S.draftId = '';
      setImage(null);
      setMode('now');
      var h = $('nw-history');
      if (h && h.open) loadHistory();
    },
    decorate: function (li, n) {
      var today = jstDay(0);
      var t = li.children[1];
      if (!t) return;
      t.classList.add('nw-t');
      if (n.status === 'scheduled') {
        var due = n.publishAt && n.publishAt <= today;
        var b = document.createElement('span');
        b.className = 'nw-badge ' + (due ? 'due' : 'sch');
        b.textContent = due ? '予約日になりました（次の作り直しで出ます）' : '予約：' + md(n.publishAt) + ' 公開';
        t.insertBefore(b, t.firstChild);
      }
      if (n.image && n.image.url) {
        var im = document.createElement('img');
        im.className = 'nw-th';
        im.src = n.image.url;
        im.alt = n.image.alt || '';
        li.insertBefore(im, t);
      }
      // 公開済みのものから、あとで SNS に出す。
      if (isLive(n, today)) {
        var sb = document.createElement('button');
        sb.type = 'button'; sb.className = 'ghost';
        sb.style.cssText = 'padding:5px 10px;font-size:11.5px';
        sb.textContent = 'SNSへ';
        sb.title = 'このお知らせを SNS（文章）の本文に入れて開きます';
        sb.addEventListener('click', function () { toSocial(n.title || '', n.body || '', location.origin + '/news/' + n.id + '.html'); });
        li.insertBefore(sb, t.nextSibling);
      }
    },
    edit: function (n) {
      build();
      S.editing = true;
      S.draftId = '';
      setImage(n.image || null);
      if (n.status === 'scheduled' && n.publishAt) $('nw-publish-at').value = n.publishAt;
      setMode(n.status === 'scheduled' ? 'scheduled' : 'now');
    },
    reset: function () {
      build();
      S.editing = false;
      S.draftId = '';
      setImage(null);
      setMode('now');
    },
    load: function (data) {
      build();
      if (data && Object.prototype.hasOwnProperty.call(data, 'drafts')) {
        S.drafts = Array.isArray(data.drafts) ? data.drafts : null;
      }
      renderDrafts();
      setMode(S.mode);
    },
    visible: function (items) {
      var today = jstDay(0);
      return (items || []).filter(function (n) { return isLive(n, today); });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
