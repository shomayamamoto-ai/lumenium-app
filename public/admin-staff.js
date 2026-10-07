/* ---- 担当者と権限・操作の記録 ----
   管理画面（admin-members.html）に入れる人を、オーナー（管理キー ADMIN_KEY の
   持ち主）のほかに増やすための画面と、だれが何をしたかを見る画面。

   ・ログインしている人と役割をヘッダーに出します。
   ・その役割で使えないタブは出しません。使えるが一部の操作ができない画面は、
     上に一言出します（「この操作は管理者以上が使えます」など）。断るのは
     サーバーです（api/_permissions.js の表）。ここでボタンを隠すのは、押して
     から断られる回数を減らすためだけです。
   ・「担当者と権限」タブ（オーナーだけ）: 足す・役割を変える・止める・消す・
     キーを作り直す。キーは作ったときに1回だけ表示します。
   ・「操作の記録」タブ（管理者以上）: だれ・画面・日付で絞り込み、CSV で保存。

   役割の名前と、タブごとに要る役割は api/_permissions.js の表と合わせています。
   デモ（?demo=1）では「この役割で見る」で、役割ごとの見え方を確かめられます。 */
(function () {
  'use strict';
  var RANK = { viewer: 0, staff: 1, manager: 2, owner: 3 };
  var LABEL = { owner: 'オーナー', manager: '管理者', staff: '担当者', viewer: '閲覧のみ' };
  var AREA = {
    login: 'ログイン', inquiries: '問い合わせ', booking: '予約', reviews: '口コミ', sns: 'SNS',
    video: 'SNS（動画）', news: 'お知らせ', copy: '文章編集', members: '会員', analytics: 'アクセス解析',
    seo: 'SEO / AIO', advisor: 'AIアドバイザー', auto: '自動改善', settings: '設定・キー',
    staff: '担当者と権限', share: '共有リンク', audit: '操作の記録', other: 'その他'
  };
  var RESULT = { ok: '通した', denied: '断った', failed: 'ログイン失敗', login: 'ログイン' };
  var METHOD = { POST: '送信・保存', PUT: '保存', PATCH: '更新', DELETE: '削除' };

  /* タブを見るのに要る役割。書いていないタブは全員が見られます（閲覧のみも）。 */
  var TAB_MIN = { 'health-admin': 'manager', 'advisor-admin': 'staff', 'staff-admin': 'owner', 'audit-admin': 'manager' };
  /* その画面の主な保存・送信に要る役割。足りないときに上へ一言出します。 */
  var WRITE_MIN = {
    'inquiries-admin': 'staff', 'reviews-admin': 'staff', 'social-admin': 'staff', 'booking-admin': 'staff',
    'news-admin': 'staff', 'advisor-admin': 'staff', 'list-view': 'manager', 'video-admin': 'manager',
    'copy-admin': 'manager', 'stats-admin': 'manager', 'seo-admin': 'manager', 'auto-admin': 'manager',
    'health-admin': 'owner'
  };
  /* 使えるけれど一部だけできない画面の一言（役割ごと）。 */
  var PARTIAL = {
    staff: {
      'social-admin': '担当者は「承認をお願いする」から投稿を出します（承認されたものは担当者も送れます）。直接の投稿・予約・設定は管理者以上が使えます。',
      'news-admin': '担当者は下書きの保存までできます。公開・削除は管理者以上が使えます。',
      'inquiries-admin': 'CSV の書き出し・設定・返信の文例の保存は管理者以上が使えます。',
      'booking-admin': '受付時間などの設定は管理者以上が使えます。',
      'reviews-admin': '口調・署名などの設定は管理者以上が使えます。'
    },
    manager: {
      'list-view': '会員の書き出し・共有リンク・削除はオーナーだけが使えます。',
      'health-admin': 'キーの入力・テスト・引き継ぎはオーナーだけが使えます。'
    }
  };

  var S = { who: null, builtRole: '', ready: true, staff: null, audit: null, q: { by: '', area: '', from: '', to: '' } };
  var el = function (id) { return document.getElementById(id); };
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function demo() { try { return sessionStorage.getItem('lum_demo') === '1'; } catch (_) { return false; } }
  function role() { return (S.who && S.who.role) || 'owner'; }
  function atLeast(need) { return RANK[role()] >= RANK[need]; }
  function when(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  var CSS =
    '#who-chip{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--text);' +
      'border:1px solid var(--border);border-radius:999px;padding:5px 11px;background:#fff;white-space:nowrap;max-width:100%}' +
    '#who-chip[hidden]{display:none}#who-chip .r{font-weight:600;color:var(--sub)}' +
    '#who-chip:not([hidden])~#sign-out{margin-left:0}' +
    '#role-note{border:1px solid var(--border);border-left:4px solid #3d3fbf;border-radius:10px;padding:9px 12px;margin:0 0 12px;' +
      'font-size:12.5px;line-height:1.75;background:#f7f7fd;overflow-wrap:anywhere}#role-note[hidden]{display:none}' +
    '.stf-note{border:1px solid var(--border);border-left:4px solid #b45309;border-radius:10px;padding:9px 12px;margin:0 0 12px;font-size:12.5px;line-height:1.75;background:#fffdf7}' +
    '.stf-roles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:8px;margin:0 0 16px}' +
    '.stf-role{border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:#fff;font-size:12px;line-height:1.7;min-width:0}' +
    '.stf-role b{display:block;font-size:13px;margin-bottom:2px}' +
    '.stf-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:8px;align-items:end;margin:0 0 8px}' +
    '.stf-form label{display:block;font-size:11.5px;font-weight:700;color:var(--sub)}' +
    '#staff-admin input,#staff-admin select,#audit-admin input,#audit-admin select{width:100%;padding:9px 11px;border:1px solid var(--border);' +
      'border-radius:10px;background:#faf9f6;font:inherit;font-size:13px;margin-top:3px;min-width:0}' +
    '.stf-key{border:2px solid #047857;border-radius:12px;padding:12px 14px;margin:10px 0 14px;background:#f3fbf7}' +
    '.stf-key p{font-size:12.5px;line-height:1.75;margin:0 0 8px}' +
    '.stf-key .row{display:flex;gap:8px;flex-wrap:wrap}.stf-key input{flex:1 1 220px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px!important}' +
    '.stf-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--border)}' +
    '.stf-list li{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;border-bottom:1px solid var(--border);padding:10px 2px}' +
    '.stf-list .who{flex:1 1 200px;min-width:0;font-size:13.5px;font-weight:700;overflow-wrap:anywhere}' +
    '.stf-list .meta{display:block;font-size:11.5px;font-weight:400;color:var(--sub);line-height:1.7}' +
    '.stf-list select{width:auto!important;margin:0!important;padding:7px 9px!important;font-size:12.5px!important}' +
    '.stf-list .acts{display:flex;flex-wrap:wrap;gap:6px}.stf-list button,.aud-bar button{font-size:12px;padding:7px 12px}' +
    '.stf-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 8px;border-radius:999px;background:#f3f1ec;color:var(--sub);margin-left:6px;white-space:nowrap}' +
    '.stf-tag.off{background:rgba(248,113,113,.17);color:#b42318}.stf-tag.ok{background:rgba(16,185,129,.16);color:#047857}' +
    '.aud-bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px;align-items:end;margin:0 0 10px}' +
    '.aud-bar label{display:block;font-size:11.5px;font-weight:700;color:var(--sub)}' +
    '.aud-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px;font-size:12px;color:var(--sub)}' +
    '.aud-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--border)}' +
    '.aud-list li{display:grid;grid-template-columns:9.5em minmax(0,1fr) auto;gap:4px 10px;align-items:baseline;border-bottom:1px solid var(--border);padding:8px 2px;font-size:12.5px;line-height:1.6}' +
    '.aud-list time{color:var(--sub);font-size:11.5px;white-space:nowrap}.aud-list .what{overflow-wrap:anywhere}.aud-list .what small{color:var(--sub)}' +
    '@media (max-width:560px){.aud-list li{grid-template-columns:minmax(0,1fr) auto}.aud-list time{grid-column:1/-1}' +
      '#who-chip{order:5;margin-left:0}#who-chip:not([hidden])~#sign-out{margin-left:auto}}' +
    '#lum-demo-bar .stf-demo{display:inline-flex;align-items:center;gap:6px;font-size:12px}' +
    '#lum-demo-bar .stf-demo select{font:inherit;font-size:12px;padding:4px 8px;border:1px solid #1b2a4a;border-radius:8px;background:#fff;color:#1b2a4a}';

  function addCss() {
    if (el('stf-css')) return;
    var s = document.createElement('style');
    s.id = 'stf-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---- ヘッダーの「だれが入っているか」 ---- */
  function paintChip() {
    addCss();
    var chip = el('who-chip');
    var out = el('sign-out');
    if (!chip && out) {
      chip = document.createElement('span');
      chip.id = 'who-chip';
      chip.setAttribute('aria-label', 'ログイン中の人');
      out.parentNode.insertBefore(chip, out);
    }
    if (!chip) return;
    if (!S.who) { chip.hidden = true; return; }
    chip.hidden = false;
    chip.innerHTML = S.who.role === 'owner'
      ? esc(S.who.name || 'オーナー')
      : esc(S.who.name) + '<span class="r">・' + esc(LABEL[S.who.role] || S.who.role) + '</span>';
    // 広い画面では上の帯を出さないので、左のメニューの頭の札にも同じことを書きます。
    var pill = el('side-pill');
    if (pill) pill.textContent = S.who.role === 'owner'
      ? (S.who.name && S.who.name !== 'オーナー' ? S.who.name + '・オーナー' : 'オーナー')
      : (S.who.name || '') + '・' + (LABEL[S.who.role] || S.who.role);
  }

  /* ---- 役割に合わせた画面 ---- */
  function noteFor(tab) {
    var r = role();
    if (r === 'owner' || !tab || tab === 'portal') return '';
    if (r === 'viewer') return '閲覧のみの役割です。見ることはできますが、保存・送信・削除はできません（押すと理由が表示されます）。';
    var need = WRITE_MIN[tab];
    if (need && RANK[r] < RANK[need]) {
      return 'この画面の保存・送信は' + (need === 'owner' ? 'オーナーだけ' : LABEL[need] + '以上') + 'が使えます。いまの役割（' + LABEL[r] + '）では見ることができます。';
    }
    return (PARTIAL[r] && PARTIAL[r][tab]) || '';
  }

  function onTab(id) {
    var main = document.querySelector('.shell-main');
    if (!main) return;
    var n = el('role-note');
    if (!n) {
      n = document.createElement('p');
      n.id = 'role-note';
      n.setAttribute('role', 'note');
      main.insertBefore(n, main.firstChild);
    }
    var t = noteFor(id);
    n.textContent = t;
    n.hidden = !t;
    hideOwnerOnly();
  }

  /* オーナーだけのもの（キーの入力・共有リンク・はじめての設定）を、ほかの役割では出しません。 */
  function hideOwnerOnly() {
    var owner = role() === 'owner';
    var keys = el('portal-keys');
    if (keys) keys.hidden = !owner;
    var share = document.querySelector('#list-view .share-block');
    if (share) share.hidden = !owner;
    var setup = el('lp-setup');
    if (setup) setup.hidden = !owner;
    var health = el('health-admin');
    if (health) {
      var after = false;
      Array.prototype.forEach.call(health.children, function (c) {
        if (c.tagName === 'H3' && /キーの入力/.test(c.textContent)) after = true;
        if (after) c.hidden = !owner;
      });
    }
  }

  /* ---- デモ: 「この役割で見る」 ---- */
  function demoSwitch() {
    if (!demo()) return;
    var bar = el('lum-demo-bar');
    if (!bar || el('stf-demo-role')) return;
    var cur = 'owner';
    try { cur = sessionStorage.getItem('lum_demo_role') || 'owner'; } catch (_) {}
    var w = document.createElement('label');
    w.className = 'stf-demo';
    w.innerHTML = 'この役割で見る <select id="stf-demo-role">' +
      ['owner', 'manager', 'staff', 'viewer'].map(function (r) {
        return '<option value="' + r + '"' + (r === cur ? ' selected' : '') + '>' + LABEL[r] + '</option>';
      }).join('') + '</select>';
    var exit = el('lum-demo-exit');
    bar.insertBefore(w, exit || null);
    w.querySelector('select').addEventListener('change', function (e) {
      try { sessionStorage.setItem('lum_demo_role', e.target.value); sessionStorage.removeItem('lum_admin_tab'); } catch (_) {}
      location.reload();
    });
  }

  /* ---- 担当者と権限（オーナーだけ） ---- */
  function staffSay(t, info) {
    var m = el('stf-msg');
    if (!m) return;
    m.textContent = t || '';
    m.className = 'msg' + (t ? ' show' : '') + (info ? ' info' : '');
  }
  async function api(url, opts) {
    try { return await window.lumAdmin.fetch(url, opts); }
    catch (_) { return { res: { ok: false, status: 0 }, data: { ok: false, message: '通信できませんでした。ネットの接続を確かめて、もう一度お試しください。' } }; }
  }
  function post(url, body) {
    return api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  function roleCards() {
    return '<div class="stf-roles">' +
      '<div class="stf-role"><b>オーナー</b>管理キー（ADMIN_KEY）で入る人。何でもできます（キー・設定・担当者・会員の書き出しと削除・共有リンク）。</div>' +
      '<div class="stf-role"><b>管理者</b>担当者の管理とキーの設定のほかは、何でもできます（公開・送信・設定の変更も）。</div>' +
      '<div class="stf-role"><b>担当者</b>問い合わせ・予約の対応、SNS は承認をお願いする形で、お知らせは下書きまで、口コミの返信。設定や会員の書き出し・削除はできません。</div>' +
      '<div class="stf-role"><b>閲覧のみ</b>見るだけ。保存・送信・削除はできません。</div>' +
      '</div>';
  }

  function staffFrame() {
    var p = el('staff-admin');
    if (!p || p.dataset.built) return;
    p.dataset.built = '1';
    p.innerHTML =
      '<p class="share-note ui-intro">管理画面に入れる人を足して、役割ごとに使える範囲を決めます。' +
      'パスワードではなく、1人ずつの「個人のキー」を発行します（作ったときに1回だけ表示します）。ログインすると12時間使えます。</p>' +
      '<div id="stf-off"></div>' +
      roleCards() +
      '<h3 style="font-size:13.5px;font-weight:700;margin:0 0 6px">人を足す</h3>' +
      '<form class="stf-form" id="stf-form">' +
        '<label>名前<input id="stf-name" maxlength="40" required autocomplete="off" placeholder="例：佐藤 花子"></label>' +
        '<label>メール（任意）<input id="stf-email" type="email" maxlength="120" autocomplete="off"></label>' +
        '<label>役割<select id="stf-role"><option value="staff">担当者</option><option value="viewer">閲覧のみ</option><option value="manager">管理者</option></select></label>' +
        '<div><button type="submit" id="stf-add">足してキーを作る</button></div>' +
      '</form>' +
      '<p class="msg" id="stf-msg"></p>' +
      '<div id="stf-key"></div>' +
      '<h3 style="font-size:13.5px;font-weight:700;margin:16px 0 6px">いまの人たち</h3>' +
      '<ul class="stf-list" id="stf-list"></ul>' +
      '<p class="share-note" style="margin-top:10px">止める・キーを作り直す・役割を変えると、その人のログイン中の画面もすぐに使えなくなります。消しても、操作の記録は残ります。</p>';
    el('stf-form').addEventListener('submit', function (e) {
      e.preventDefault();
      addStaff();
    });
  }

  function showKey(name, key) {
    var box = el('stf-key');
    if (!box) return;
    if (!key) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="stf-key" role="status"><p><b>' + esc(name) + 'さんのキー</b>（この画面を離れると二度と表示されません）。' +
      'コピーして、本人に直接渡してください。メールやチャットに残したくないときは、口頭や紙でもかまいません。</p>' +
      '<div class="row"><input id="stf-key-val" readonly aria-label="発行したキー"><button type="button" id="stf-key-copy">コピー</button>' +
      '<button type="button" class="ghost" id="stf-key-done">渡したので閉じる</button></div></div>';
    el('stf-key-val').value = key;
    el('stf-key-copy').addEventListener('click', function () {
      var f = el('stf-key-val');
      f.select();
      try { navigator.clipboard.writeText(f.value); } catch (_) { document.execCommand('copy'); }
      staffSay('コピーしました。本人の画面の「管理キー」の欄に貼って入ってもらいます。', true);
    });
    el('stf-key-done').addEventListener('click', function () { showKey('', ''); staffSay(''); });
  }

  function paintStaff() {
    var list = el('stf-list');
    if (!list) return;
    var off = el('stf-off');
    if (off) {
      off.innerHTML = S.ready ? '' : '<div class="stf-note">担当者の機能には、保存先（Upstash Redis）を Vercel の環境変数につなぐ必要があります。' +
        'つなぐまでは、オーナーの管理キーだけで使えます（「設定状況」で確かめられます）。</div>';
    }
    el('stf-add').disabled = !S.ready;
    var rows = S.staff || [];
    if (!rows.length) {
      list.innerHTML = '<li><span class="who">まだだれもいません<span class="meta">いまはオーナー（管理キー）だけが入れます。</span></span></li>';
      return;
    }
    list.innerHTML = rows.map(function (m) {
      return '<li data-id="' + esc(m.id) + '"><span class="who">' + esc(m.name) +
        '<span class="stf-tag ' + (m.active ? 'ok' : 'off') + '">' + (m.active ? '使える' : '止めている') + '</span>' +
        '<span class="meta">' + (m.email ? esc(m.email) + '・' : '') + '最後のログイン ' + esc(when(m.lastLoginAt)) +
        '・キー発行 ' + esc(when(m.keyIssuedAt)) + '</span></span>' +
        '<select data-act="role" aria-label="' + esc(m.name) + 'さんの役割">' +
          ['manager', 'staff', 'viewer'].map(function (r) { return '<option value="' + r + '"' + (m.role === r ? ' selected' : '') + '>' + LABEL[r] + '</option>'; }).join('') +
        '</select>' +
        '<span class="acts"><button type="button" class="ghost" data-act="reset">キーを作り直す</button>' +
        '<button type="button" class="ghost" data-act="' + (m.active ? 'disable' : 'enable') + '">' + (m.active ? '止める' : '戻す') + '</button>' +
        '<button type="button" class="ghost bk-danger" data-act="remove">消す</button></span></li>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-act]'), function (b) {
      var li = b.closest('li');
      var id = li.getAttribute('data-id');
      var m = rows.find(function (x) { return x.id === id; }) || {};
      if (b.tagName === 'SELECT') {
        b.addEventListener('change', function () {
          if (!confirm(m.name + 'さんの役割を「' + LABEL[b.value] + '」にします。本人はもう一度キーで入り直します。よろしいですか？')) { b.value = m.role; return; }
          act({ action: 'update', id: id, role: b.value });
        });
        return;
      }
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-act');
        var ask = {
          reset: m.name + 'さんのキーを作り直します。古いキーはすぐに使えなくなります。よろしいですか？',
          disable: m.name + 'さんを止めます。ログイン中の画面もすぐに使えなくなります。よろしいですか？',
          remove: m.name + 'さんを消します。元に戻せません（操作の記録は残ります）。よろしいですか？'
        }[a];
        if (ask && !confirm(ask)) return;
        act({ action: a, id: id }, m.name);
      });
    });
  }

  async function act(body, name) {
    staffSay('保存しています…', true);
    var r = await post('/api/staff', body);
    if (r.data && r.data.staff) S.staff = r.data.staff;
    staffSay((r.data && r.data.message) || (r.res.ok ? '保存しました。' : '保存できませんでした。'), r.res.ok && r.data.ok !== false);
    if (r.res.ok && r.data.key) showKey(name || (r.data.member && r.data.member.name) || '', r.data.key);
    paintStaff();
  }

  async function addStaff() {
    var name = el('stf-name').value.trim();
    if (!name) { staffSay('名前を入れてください。'); return; }
    el('stf-add').disabled = true;
    staffSay('作っています…', true);
    var r = await post('/api/staff', { action: 'create', name: name, email: el('stf-email').value.trim(), role: el('stf-role').value });
    el('stf-add').disabled = !S.ready;
    if (r.data && r.data.staff) S.staff = r.data.staff;
    staffSay((r.data && r.data.message) || '作れませんでした。', r.res.ok && r.data.ok !== false);
    if (r.res.ok && r.data.key) {
      showKey(r.data.member.name, r.data.key);
      el('stf-name').value = '';
      el('stf-email').value = '';
    }
    paintStaff();
  }

  async function loadStaff() {
    staffFrame();
    staffSay('読み込み中…', true);
    var r = await api('/api/staff');
    if (!r.res.ok || !r.data.ok) { staffSay((r.data && r.data.message) || '読み込めませんでした。'); return; }
    S.ready = r.data.ready !== false;
    S.staff = r.data.staff || [];
    staffSay(r.data.demo ? r.data.message : '', true);
    paintStaff();
  }

  /* ---- 操作の記録（管理者以上） ---- */
  function auditFrame() {
    var p = el('audit-admin');
    if (!p || p.dataset.built) return;
    p.dataset.built = '1';
    p.innerHTML =
      '<p class="share-note ui-intro">だれが・いつ・どの画面で保存や送信をしたか（断られたものも）の記録です。' +
      '180日・5,000件まで残ります。本文・キー・メールアドレスなどの中身は残しません。接続元は IP ではなく、元に戻せない印だけです。</p>' +
      '<div class="aud-bar">' +
        '<label>だれ<select id="aud-by"><option value="">全員</option></select></label>' +
        '<label>画面<select id="aud-area"><option value="">すべて</option>' +
          Object.keys(AREA).map(function (k) { return '<option value="' + k + '">' + AREA[k] + '</option>'; }).join('') + '</select></label>' +
        '<label>いつから<input type="date" id="aud-from"></label>' +
        '<label>いつまで<input type="date" id="aud-to"></label>' +
      '</div>' +
      '<div class="aud-acts"><button type="button" id="aud-go">絞り込む</button>' +
        '<button type="button" class="ghost" id="aud-csv">CSVで保存</button><span id="aud-count"></span></div>' +
      '<p class="msg" id="aud-msg"></p>' +
      '<ul class="aud-list" id="aud-list"></ul>';
    el('aud-go').addEventListener('click', loadAudit);
    el('aud-csv').addEventListener('click', saveCsv);
    ['aud-by', 'aud-area'].forEach(function (id) { el(id).addEventListener('change', loadAudit); });
  }

  function auditSay(t, info) {
    var m = el('aud-msg');
    if (!m) return;
    m.textContent = t || '';
    m.className = 'msg' + (t ? ' show' : '') + (info ? ' info' : '');
  }

  function query() {
    var q = new URLSearchParams();
    var by = el('aud-by').value, area = el('aud-area').value, from = el('aud-from').value, to = el('aud-to').value;
    if (by) q.set('by', by);
    if (area) q.set('area', area);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return q;
  }

  function paintAudit(d) {
    var sel = el('aud-by');
    var cur = sel.value;
    sel.innerHTML = '<option value="">全員</option>' + (d.people || []).map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === cur ? ' selected' : '') + '>' + esc(p.name || p.id) + '（' + esc(LABEL[p.role] || p.role) + '）</option>';
    }).join('');
    el('aud-count').textContent = d.total ? d.total + '件' + (d.total > d.shown ? '（新しい' + d.shown + '件を表示。CSVには全部入ります）' : '') : '';
    var list = el('aud-list');
    var items = d.items || [];
    if (!items.length) {
      list.innerHTML = '<li><span></span><span class="what">' + (d.stored === false ? esc(d.message || '') : 'この条件の記録はありません。') + '</span><span></span></li>';
      return;
    }
    list.innerHTML = items.map(function (e) {
      var what = (AREA[e.area] || e.area) + '：' + (e.act || METHOD[e.m] || e.m || '');
      var tag = e.result === 'denied' || e.result === 'failed' ? 'off' : e.result === 'login' ? '' : 'ok';
      return '<li><time>' + esc(when(e.at)) + '</time>' +
        '<span class="what">' + esc(e.name || e.by) + ' <small>' + esc(LABEL[e.role] || e.role) + '</small><br>' + esc(what) +
        (e.target ? ' <small>（' + esc(e.target) + '）</small>' : '') + '</span>' +
        '<span class="stf-tag ' + tag + '">' + esc(RESULT[e.result] || e.result) + '</span></li>';
    }).join('');
  }

  async function loadAudit() {
    auditFrame();
    auditSay('読み込み中…', true);
    var q = query();
    var r = await api('/api/audit' + (q.toString() ? '?' + q : ''));
    if (!r.res.ok || !r.data.ok) { auditSay((r.data && r.data.message) || '読み込めませんでした。'); return; }
    auditSay(r.data.stored === false ? r.data.message : '', true);
    paintAudit(r.data);
  }

  async function saveCsv() {
    var q = query();
    q.set('format', 'csv');
    auditSay('CSV を作っています…', true);
    var res;
    try {
      res = await window.lumAdmin.tap(await fetch('/api/audit?' + q, { headers: { Authorization: 'Bearer ' + window.lumAdmin.key() } }));
    } catch (_) { auditSay('通信できませんでした。'); return; }
    if (!res.ok) { auditSay((await res.text().catch(function () { return ''; })) || '保存できませんでした。'); return; }
    var blob = await res.blob();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '操作の記録-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    auditSay('CSV を保存しました（Excel で開けます）。', true);
  }

  /* ---- ほかの画面から呼ぶもの ---- */
  window.lumStaff = {
    LABEL: LABEL,
    role: role,
    who: function () { return S.who; },
    isOwner: function () { return role() === 'owner'; },
    /** ログインできたとき（/api/admin-ping の返事）。前と違う役割でタブを作り直す必要があれば true。 */
    signedIn: function (data) {
      var w = (data && data.who) || { id: 'owner', name: 'オーナー', role: 'owner' };
      if (!RANK.hasOwnProperty(w.role)) w.role = 'viewer';
      S.who = w;
      S.ready = !(data && data.staff === false);
      paintChip();
      demoSwitch();
      return !!S.builtRole && S.builtRole !== w.role;
    },
    signedOut: function () { S.who = null; paintChip(); var n = el('role-note'); if (n) n.hidden = true; },
    canSee: function (tab) { return atLeast(TAB_MIN[tab] || 'viewer'); },
    /** タブの一覧から、この役割で見られるものだけ。作った役割を覚えておきます。 */
    filterTabs: function (tabs) {
      S.builtRole = role();
      return tabs.filter(function (t) { return atLeast(TAB_MIN[t.id] || 'viewer'); });
    },
    /** その窓口を読めるか（ポータルが、断られると分かっているものを取りに行かないため）。 */
    canRead: function (url) {
      var p = String(url || '').split('?')[0];
      if (/^\/api\/(settings|share-links|staff|members-xlsx|members-view)$/.test(p)) return role() === 'owner';
      if (p === '/api/audit') return atLeast('manager');
      return true;
    },
    onTab: onTab,
    noteFor: noteFor
  };
  window.lumStaffInit = loadStaff;
  window.lumAuditInit = loadAudit;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { addCss(); demoSwitch(); });
  else { addCss(); demoSwitch(); }
})();
