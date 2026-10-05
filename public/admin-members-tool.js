/* ---- 会員リスト（詳しく見る・グループ・お知らせメール・増え方） ----
   管理画面（admin-members.html）の「会員リスト」タブに足す部分です。
   一覧の表・検索・Excel/CSV・共有リンクは admin-members.html のまま使い、
   ここではその上に項目の切り替えを置いて、次のものを足しています。

   ・会員一覧: 名前を押すと、その人の詳しい内容（名前と会社名の修正、
     お知らせメールの配信の状態、登録したときの同意の記録、グループ、
     削除）が開きます。グループで絞り込めます。
   ・グループ: お知らせメールを一部の人だけに送るための分け方
     （Resend の「セグメント」）。会員からは見えません。
   ・お知らせメール: 会員にまとめて送るメール。
   ・増え方: 月ごとの登録・配信停止・どのページから登録したか。

   会員は Resend（メール送信サービス）の連絡先です。保存と計算は
   api/members.js・api/members-list.js・api/_members.js にあります。 */
(function () {
  'use strict';
  var HOST = 'list-view';
  var el = function (id) { return document.getElementById(id); };
  var S = {
    sec: 'list', seg: '', members: [], segments: [], mode: 'segments', truncated: false, loaded: false,
    open: '', detail: null, ask: ''
  };
  var SECTIONS = [['list', '会員一覧'], ['groups', 'グループ'], ['mail', 'お知らせメール'], ['growth', '増え方']];
  var REASONS = [['request', '本人から削除の依頼があった'], ['duplicate', '重複・テストの登録'], ['other', 'その他']];

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function demo() { try { return sessionStorage.getItem('lum_demo') === '1'; } catch (_) { return false; } }
  function say(t, info) {
    var m = el('mt-msg');
    if (!m) return;
    m.textContent = t || '';
    m.classList.toggle('show', !!t);
    m.classList.toggle('info', !!info);
  }
  async function api(url, opts) {
    try { return await window.lumAdmin.fetch(url, opts); }
    catch (_) { return { res: { ok: false, status: 0 }, data: { ok: false, message: '通信できませんでした。ネットの接続を確かめて、もう一度お試しください。' } }; }
  }
  function post(body) {
    return api('/api/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  /* 日本時間の「2026/10/03 14:20」 */
  function when(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return '—';
    var d = new Date(t + 9 * 3600000);
    return d.getUTCFullYear() + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '/' + ('0' + d.getUTCDate()).slice(-2) +
      ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
  }
  function segName(id) {
    for (var i = 0; i < S.segments.length; i++) if (S.segments[i].id === id) return S.segments[i].name;
    return '';
  }
  /* 一覧を読み直す。表の「更新」と同じ動きです。 */
  function reload() { var b = el('reload-btn'); if (b) b.click(); }
  /* 表を描き直す。表は検索欄の入力で描き直されるので、それを借ります。 */
  function redraw() { var s = el('search'); if (s) s.dispatchEvent(new Event('input')); }

  var CSS =
    '#mt-nav{margin-bottom:12px}' +
    '.mt-card{border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin:0 0 14px;background:#fff;min-width:0}' +
    '.mt-card h3{font-size:15px;font-weight:700;margin:0;overflow-wrap:anywhere}' +
    '.mt-head{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:6px}' +
    '.mt-sec{border-top:1px solid var(--border);padding:10px 0 4px;margin-top:8px;min-width:0}' +
    '.mt-sec h4{font-size:12px;letter-spacing:.08em;color:var(--sub);font-weight:700;margin:0 0 8px}' +
    '.mt-note{font-size:12px;color:var(--sub);line-height:1.75;margin:4px 0 8px;overflow-wrap:anywhere}' +
    '.mt-box{border:1px solid var(--border);border-left:4px solid #b45309;border-radius:10px;padding:9px 12px;margin:0 0 10px;font-size:12.5px;line-height:1.75;background:#fffdf7;overflow-wrap:anywhere}' +
    '.mt-box.red{border-left-color:#b42318;background:#fff8f7}.mt-box.gray{border-left-color:var(--sub);background:#faf9f6}' +
    '.mt-box.ok{border-left-color:#047857;background:#f6fbf8}' +
    '.mt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}' +
    '.mt-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--sub);min-width:0}' +
    '.mt-field input,.mt-field select,.mt-field textarea{width:100%;min-width:0;padding:9px 11px;border:1px solid var(--border);border-radius:10px;background:#faf9f6;font:inherit;font-size:13.5px;color:var(--text)}' +
    '.mt-field textarea{min-height:200px;line-height:1.7;resize:vertical}' +
    '.mt-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}' +
    '.mt-acts button{font-size:12px;padding:8px 13px}' +
    'button.mt-danger{background:#b42318;color:#fff;border:0}' +
    '.mt-dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;font-size:12.5px;line-height:1.7;margin:0}' +
    '.mt-dl dt{color:var(--sub)}.mt-dl dd{margin:0;overflow-wrap:anywhere;min-width:0}' +
    '.mt-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 8px;border-radius:999px;background:#f3f1ec;color:var(--sub);margin:0 4px 2px 0;white-space:nowrap}' +
    '.mt-tag.ok{background:rgba(16,185,129,.16);color:#047857}.mt-tag.ng{background:rgba(248,113,113,.17);color:#b42318}' +
    '.mt-checks{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px}' +
    '.mt-checks label{display:flex;gap:6px;align-items:center}' +
    '.mt-checks input{width:18px;height:18px}' +
    'button.mt-name{background:none;border:0;padding:0;color:#3d3fbf;font:inherit;font-weight:700;text-decoration:underline;text-underline-offset:3px;cursor:pointer;text-align:left;letter-spacing:0}' +
    'button.mt-name:hover{filter:none}button.mt-name:focus-visible{outline:2px solid #3d3fbf;outline-offset:3px;border-radius:4px}' +
    '.mt-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--border)}' +
    '.mt-list li{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;border-bottom:1px solid var(--border);padding:9px 2px;font-size:13px}' +
    '.mt-list li .grow{flex:1 1 160px;min-width:0;overflow-wrap:anywhere}' +
    '.mt-list li button{font-size:11.5px;padding:6px 10px}' +
    '#mt-seg{padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:#faf9f6;font:inherit;font-size:13px;max-width:100%}' +
    '@media (max-width:520px){.mt-dl{grid-template-columns:1fr}.mt-dl dt{margin-top:4px}}';

  /* ---------------- 骨組み ---------------- */

  function shell() {
    var host = el(HOST);
    if (!host || el('members-tool')) return;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    var box = el('members-tool-slot') || document.createElement('div');
    box.id = 'members-tool';
    if (!box.parentNode) host.insertBefore(box, host.firstChild);
    box.innerHTML =
      '<div class="nq-row" id="mt-nav" role="tablist" aria-label="会員リストの項目">' + SECTIONS.map(function (s) {
        return '<button type="button" class="nq-chip" data-msec="' + s[0] + '" aria-pressed="false">' + s[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="msg" id="mt-msg" role="status" style="margin:0 0 12px"></p>' +
      '<div id="mt-body"></div>';
    box.querySelectorAll('[data-msec]').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-msec')); });
    });
    // グループで絞る欄を、表の検索欄の隣に置きます。
    var bar = host.querySelector('.toolbar');
    if (bar && !el('mt-seg')) {
      var sel = document.createElement('select');
      sel.id = 'mt-seg';
      sel.setAttribute('aria-label', 'グループで絞り込み');
      sel.addEventListener('change', function () { S.seg = sel.value; redraw(); });
      var search = el('search');
      bar.insertBefore(sel, search ? search.nextSibling : bar.firstChild);
    }
    var sec = 'list';
    try { sec = sessionStorage.getItem('lum_mem_sec') || 'list'; } catch (_) {}
    go(sec);
  }

  /* 一覧の部品（共有リンク・検索・表）。「会員一覧」のときだけ出します。 */
  function listParts() {
    var host = el(HOST);
    return Array.prototype.filter.call(host.children, function (c) { return c.id !== 'members-tool'; });
  }

  function go(sec) {
    if (!SECTIONS.some(function (s) { return s[0] === sec; })) sec = 'list';
    S.sec = sec;
    try { sessionStorage.setItem('lum_mem_sec', sec); } catch (_) {}
    document.querySelectorAll('[data-msec]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-msec') === sec ? 'true' : 'false');
    });
    listParts().forEach(function (c) { c.style.display = sec === 'list' ? '' : 'none'; });
    say('');
    draw();
  }

  function draw() {
    var body = el('mt-body');
    if (!body) return;
    if (S.sec === 'list') return drawList(body);
    if (S.sec === 'groups') return drawGroups(body);
    if (S.sec === 'mail') return window.lumMembersMail ? window.lumMembersMail(body) : (body.innerHTML = '');
    if (S.sec === 'growth') return window.lumMembersGrowth ? window.lumMembersGrowth(body) : (body.innerHTML = '');
  }

  function segOptions() {
    var sel = el('mt-seg');
    if (!sel) return;
    var legacy = S.mode === 'legacy';
    sel.style.display = legacy || !S.segments.length ? 'none' : '';
    sel.innerHTML = '<option value="">すべてのグループ</option>' + S.segments.map(function (s) {
      return '<option value="' + esc(s.id) + '">' + esc(s.name) + '（' + (s.count == null ? '?' : s.count) + '人）</option>';
    }).join('') + '<option value="none">どのグループにも入っていない人</option>';
    if (S.seg && S.seg !== 'none' && !segName(S.seg)) S.seg = '';
    sel.value = S.seg;
  }

  /* ---------------- 会員一覧（詳しく見る） ---------------- */

  function drawList(body) {
    var html = '';
    if (S.truncated) html += '<div class="mt-box">会員が多いため、最初の5,000人だけを表示しています。</div>';
    if (!S.open) { body.innerHTML = html + '<p class="mt-note" style="margin:0 0 10px">お名前を押すと、その人の詳しい内容（同意の記録・配信の状態・グループ・削除）が開きます。</p>'; return; }
    body.innerHTML = html + '<div class="mt-card" id="mt-detail"><p class="mt-note">読み込み中…</p></div>';
    if (S.detail && S.detail.member.id === S.open) return drawDetail();
    loadDetail(S.open);
  }

  async function loadDetail(id) {
    var r = await api('/api/members?id=' + encodeURIComponent(id));
    if (S.open !== id) return;
    if (!r.data || r.data.ok !== true) {
      var d = el('mt-detail');
      if (d) d.innerHTML = '<p class="mt-note">' + esc((r.data && r.data.message) || '読み込めませんでした。') + '</p>' +
        '<div class="mt-acts"><button type="button" class="ghost" data-mt="close">閉じる</button></div>';
      wire();
      return;
    }
    S.detail = r.data;
    drawDetail();
  }

  function consentHtml(c, stored) {
    if (c) {
      return '<dl class="mt-dl"><dt>同意した日時</dt><dd>' + esc(when(c.at)) + '</dd>' +
        '<dt>登録したページ</dt><dd>' + esc(c.source || '（不明）') + '</dd>' +
        '<dt>同意した文面の版</dt><dd>' + esc(c.version || '（不明）') + '</dd>' +
        '<dt>送信元の識別子</dt><dd>' + (c.hasIp ? 'あり（IPアドレスは元に戻せない形で保存）' : 'なし') + '</dd></dl>' +
        '<p class="mt-note">登録フォームで「お知らせメールを受け取る」に同意したときの記録です。お知らせメールを送ってよい根拠になります。</p>';
    }
    if (!stored) return '<div class="mt-box gray">同意の記録の保存先（Upstash Redis）がつながっていないため、記録を読めません。</div>';
    return '<div class="mt-box gray">この人の同意の記録はありません。同意の記録を始める前（2026年10月より前）に登録した人か、Resend の画面から直接入れた人です。お知らせメールを送る前に、受け取りに同意しているか確かめてください。</div>';
  }

  function drawDetail() {
    var d = el('mt-detail');
    if (!d || !S.detail) return;
    var m = S.detail.member;
    var legacy = S.mode === 'legacy';
    var groups = legacy ? '<p class="mt-note">この Resend のアカウントは古い形（Audiences）のため、グループは使えません。</p>'
      : !S.segments.length ? '<p class="mt-note">グループはまだありません。「グループ」で作れます。</p>'
      : '<div class="mt-checks">' + S.segments.map(function (s) {
        return '<label><input type="checkbox" data-mtseg="' + esc(s.id) + '"' + ((m.segments || []).indexOf(s.id) !== -1 ? ' checked' : '') + '>' + esc(s.name) + '</label>';
      }).join('') + '</div>';
    var unsub = m.unsubscribed
      ? '<p><span class="mt-tag ng">配信停止</span></p><p class="mt-note">この人にはお知らせメールを送りません。本人が止めたものを、こちらから「受け取る」に戻すことはできません（特定電子メール法で、断った人に送ることは禁じられています）。また受け取りたいときは、本人に登録し直してもらってください。</p>'
      : '<p><span class="mt-tag ok">受け取る</span></p>' + (S.ask === 'unsub'
        ? '<div class="mt-box">この人へのお知らせメールを止めます。本人から「もう送らないで」と連絡があったときに使います。止めたあとは、こちらから元に戻せません。' +
          '<div class="mt-acts"><button type="button" class="mt-danger" data-mt="unsub-do">配信を止める</button><button type="button" class="ghost" data-mt="cancel">やめる</button></div></div>'
        : '<div class="mt-acts"><button type="button" class="ghost" data-mt="unsub">配信を止める</button></div>');
    var del = S.ask === 'delete'
      ? '<div class="mt-box red"><strong>' + esc(m.name || m.email) + ' 様を削除します。元に戻せません。</strong><br>' +
        '消えるもの: Resend の連絡先（名前・会社名・メールアドレス・配信の状態・グループ）と、同意の記録。<br>' +
        '残るもの: これまでに送ったメールの送信履歴（Resend の管理画面 › Emails に一定期間残ります）と、あなたのメールソフトに届いた「会員登録のお知らせ」。必要ならそれぞれ削除してください。<br>' +
        'この画面には「いつ・なぜ削除したか」と受付番号だけを記録します（名前やアドレスは残しません）。' +
        '<label class="mt-field" style="margin-top:8px">削除する理由<select id="mt-reason">' + REASONS.map(function (x) {
          return '<option value="' + x[0] + '">' + x[1] + '</option>';
        }).join('') + '</select></label>' +
        '<div class="mt-acts"><button type="button" class="mt-danger" data-mt="delete-do">削除する</button><button type="button" class="ghost" data-mt="cancel">やめる</button></div></div>'
      : '<p class="mt-note">本人から「個人情報を消してほしい」と依頼があったとき（個人情報保護法）などに使います。</p>' +
        '<div class="mt-acts"><button type="button" class="ghost" data-mt="delete">この会員を削除する…</button></div>';
    d.innerHTML =
      '<div class="mt-head"><h3>' + esc(m.name || '（名前なし）') + ' 様</h3>' +
      '<button type="button" class="ghost" data-mt="close" style="font-size:12px;padding:7px 12px">閉じる</button></div>' +
      '<dl class="mt-dl"><dt>メールアドレス</dt><dd>' + esc(m.email) + '</dd><dt>登録日時</dt><dd>' + esc(when(m.created)) + '</dd></dl>' +
      '<p class="mt-note">メールアドレスはここでは変えられません（Resend が連絡先をアドレスで見分けているため）。変わったときは、新しいアドレスで登録し直してもらい、古い方を削除してください。</p>' +
      '<div class="mt-sec"><h4>お名前と会社名</h4><div class="mt-grid">' +
      '<label class="mt-field">お名前<input type="text" id="mt-name" maxlength="50" value="' + esc(m.name) + '"></label>' +
      '<label class="mt-field">会社名・所属<input type="text" id="mt-company" maxlength="80" value="' + esc(m.company) + '"></label></div>' +
      '<div class="mt-acts"><button type="button" data-mt="save">保存</button></div></div>' +
      '<div class="mt-sec"><h4>お知らせメールの配信</h4>' + unsub + '</div>' +
      '<div class="mt-sec"><h4>同意の記録</h4>' + consentHtml(S.detail.consent, S.detail.consentStored) + '</div>' +
      '<div class="mt-sec"><h4>グループ</h4>' + groups + '</div>' +
      '<div class="mt-sec"><h4>削除</h4>' + del + '</div>';
    wire();
  }

  function wire() {
    var d = el('mt-detail');
    if (!d) return;
    d.querySelectorAll('[data-mt]').forEach(function (b) {
      b.addEventListener('click', function () { act(b.getAttribute('data-mt'), b); });
    });
    d.querySelectorAll('[data-mtseg]').forEach(function (c) {
      c.addEventListener('change', function () { toggleSeg(c); });
    });
  }

  async function act(what, btn) {
    var m = S.detail && S.detail.member;
    if (what === 'close') { S.open = ''; S.detail = null; S.ask = ''; return draw(); }
    if (what === 'cancel') { S.ask = ''; return drawDetail(); }
    if (what === 'unsub' || what === 'delete') { S.ask = what; return drawDetail(); }
    if (!m) return;
    btn.disabled = true;
    var r;
    if (what === 'save') {
      r = await post({ action: 'update', id: m.id, name: el('mt-name').value.trim(), company: el('mt-company').value.trim() });
      if (r.data && r.data.ok) { say('保存しました。', true); m.name = el('mt-name').value.trim(); m.company = el('mt-company').value.trim(); reload(); }
    } else if (what === 'unsub-do') {
      r = await post({ action: 'unsubscribe', id: m.id });
      if (r.data && r.data.ok) { say('配信を止めました。この人にはお知らせメールを送りません。', true); m.unsubscribed = true; S.ask = ''; reload(); }
    } else if (what === 'delete-do') {
      r = await post({ action: 'delete', id: m.id, email: m.email, reason: el('mt-reason').value });
      if (r.data && r.data.ok) {
        S.open = ''; S.detail = null; S.ask = '';
        say('削除しました。受付番号: ' + r.data.ref + '（' + when(r.data.at) + '）。本人へ「削除しました」と返事をするときに使えます。' +
          (r.data.audited ? '' : '（保存先がつながっていないため、削除の記録は残せませんでした）'), true);
        reload();
        return draw();
      }
    }
    btn.disabled = false;
    if (!r || !r.data || !r.data.ok) say((r && r.data && r.data.message) || 'できませんでした。');
    else drawDetail();
  }

  async function toggleSeg(c) {
    var m = S.detail && S.detail.member;
    if (!m) return;
    var seg = c.getAttribute('data-mtseg');
    var on = c.checked;
    c.disabled = true;
    var r = await post({ action: on ? 'segment.join' : 'segment.leave', id: m.id, segment: seg });
    c.disabled = false;
    if (!r.data || !r.data.ok) { c.checked = !on; return say((r.data && r.data.message) || 'できませんでした。'); }
    m.segments = (m.segments || []).filter(function (x) { return x !== seg; });
    if (on) m.segments.push(seg);
    say((on ? '「' + segName(seg) + '」に入れました。' : '「' + segName(seg) + '」から外しました。'), true);
    reload();
  }

  /* ---------------- グループ ---------------- */

  function drawGroups(body) {
    if (S.mode === 'legacy') {
      body.innerHTML = '<div class="mt-box">この Resend のアカウントは古い形（Audiences）のままのため、グループは使えません。Resend の管理画面で Segments への移行が済むと使えるようになります。お知らせメールは、配信を受け取る全員に送れます。</div>';
      return;
    }
    var rows = S.segments.map(function (s) {
      var asking = S.ask === 'seg:' + s.id;
      return '<li><span class="grow"><strong>' + esc(s.name) + '</strong>　' + (s.count == null ? '人数不明' : s.count + '人') + '</span>' +
        (asking
          ? '<span class="mt-note" style="margin:0">「' + esc(s.name) + '」を消します。会員は消えません。</span>' +
            '<button type="button" class="mt-danger" data-gseg-del="' + esc(s.id) + '">消す</button><button type="button" class="ghost" data-gcancel>やめる</button>'
          : '<button type="button" class="ghost" data-gshow="' + esc(s.id) + '">一覧で見る</button>' +
            '<button type="button" class="ghost" data-gask="' + esc(s.id) + '">削除…</button>') + '</li>';
    }).join('');
    body.innerHTML =
      '<p class="mt-note" style="margin-top:0">グループは、お知らせメールを一部の人にだけ送るための分け方です（例: 常連さん、セミナーに来た人）。会員からは見えません。人を入れるには、「会員一覧」でお名前を押し、「グループ」の欄にチェックを入れます。</p>' +
      (S.segments.length ? '<ul class="mt-list">' + rows + '</ul>' : '<div class="mt-box gray">グループはまだありません。</div>') +
      '<div class="mt-card" style="margin-top:12px"><h4 style="font-size:12px;color:var(--sub);margin:0 0 8px">新しいグループ</h4>' +
      '<label class="mt-field">名前<input type="text" id="mt-gname" maxlength="50" placeholder="例: セミナー参加者"></label>' +
      '<div class="mt-acts"><button type="button" id="mt-gadd">作る</button></div></div>';
    el('mt-gadd').addEventListener('click', async function () {
      var name = el('mt-gname').value.trim();
      if (!name) return say('グループの名前を入れてください。');
      this.disabled = true;
      var r = await post({ action: 'segment.create', name: name });
      this.disabled = false;
      if (!r.data || !r.data.ok) return say((r.data && r.data.message) || '作れませんでした。');
      S.segments.push(r.data.segment);
      say('「' + name + '」を作りました。', true);
      segOptions();
      drawGroups(body);
    });
    body.querySelectorAll('[data-gshow]').forEach(function (b) {
      b.addEventListener('click', function () { S.seg = b.getAttribute('data-gshow'); segOptions(); go('list'); redraw(); });
    });
    body.querySelectorAll('[data-gask]').forEach(function (b) {
      b.addEventListener('click', function () { S.ask = 'seg:' + b.getAttribute('data-gask'); drawGroups(body); });
    });
    body.querySelectorAll('[data-gcancel]').forEach(function (b) {
      b.addEventListener('click', function () { S.ask = ''; drawGroups(body); });
    });
    body.querySelectorAll('[data-gseg-del]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = b.getAttribute('data-gseg-del');
        b.disabled = true;
        var r = await post({ action: 'segment.delete', segment: id });
        S.ask = '';
        if (!r.data || !r.data.ok) { say((r.data && r.data.message) || '消せませんでした。'); return drawGroups(body); }
        say('「' + segName(id) + '」を消しました。', true);
        S.segments = S.segments.filter(function (s) { return s.id !== id; });
        segOptions();
        drawGroups(body);
      });
    });
  }

  /* ---------------- admin-members.html から呼ばれるところ ---------------- */

  window.lumMembersTool = {
    /** 一覧を読み終えたとき（api/members-list.js の応答）。 */
    loaded: function (data) {
      shell();
      S.loaded = true;
      S.members = (data && data.members) || [];
      S.segments = (data && data.segments) || [];
      S.mode = (data && data.mode) || 'segments';
      S.truncated = !!(data && data.truncated);
      segOptions();
      if (S.sec !== 'list') draw();
    },
    /** 表に出すか（グループの絞り込み）。 */
    keep: function (m) {
      if (!S.seg) return true;
      var s = m.segments || [];
      return S.seg === 'none' ? s.length === 0 : s.indexOf(S.seg) !== -1;
    },
    /** 表のお名前の欄。押すと詳しい内容が開きます。 */
    nameCell: function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mt-name';
      b.textContent = m.name || '（名前なし）';
      b.addEventListener('click', function () {
        S.open = m.id; S.detail = null; S.ask = '';
        if (S.sec !== 'list') go('list'); else draw();
        var d = el('members-tool');
        if (d) d.scrollIntoView({ block: 'start' });
      });
      return b;
    },
    state: function () { return S; },
    say: say, esc: esc, when: when, api: api, post: post, segName: segName, demo: demo, reload: reload
  };
})();

/* ---- お知らせメール ----
   会員にまとめて送るメール。送るのは Resend の Broadcasts で、配信を
   止めた人には送りません。特定電子メール法で決まっている送信者の名前・
   住所・問い合わせ先・配信停止のリンクは、本文の下に必ず付きます（ここで
   消すことはできません）。

   送る前に、見本（プレビュー）と自分あてのテスト送信で確かめ、最後に
   「◯人に送ります」を確かめてから送ります。送信元が Resend の試用
   アドレスのままのときは、お客様に届かないので送りません。 */
(function () {
  'use strict';
  var T = window.lumMembersTool;
  if (!T) return;
  var el = function (id) { return document.getElementById(id); };
  var esc = T.esc, when = T.when, say = T.say;
  var DRAFT = 'lum_mem_mail_draft';
  var M = { info: null, seg: '', count: null, stopped: 0, confirm: false, preview: null, stats: {}, busy: false };

  function draft(v) {
    try {
      if (v === undefined) return JSON.parse(sessionStorage.getItem(DRAFT) || '{}') || {};
      sessionStorage.setItem(DRAFT, JSON.stringify(v));
    } catch (_) {}
    return {};
  }
  function form() {
    var sched = el('mm-when-on') && el('mm-when-on').checked && el('mm-when').value;
    return {
      subject: el('mm-subject').value.trim(), body: el('mm-body').value,
      segment: el('mm-seg').value, segmentName: T.segName(el('mm-seg').value),
      scheduledAt: sched ? sched + ':00+09:00' : ''
    };
  }
  function keep() { var f = form(); draft({ subject: f.subject, body: f.body }); }

  async function load(body) {
    body.innerHTML = '<p class="mt-note">読み込み中…</p>';
    var r = await T.api('/api/members?view=mail');
    if (!r.data || r.data.ok !== true) {
      body.innerHTML = '<div class="mt-box red">' + esc((r.data && r.data.message) || '読み込めませんでした。') + '</div>';
      return;
    }
    M.info = r.data;
    draw(body);
    count();
  }

  function banners() {
    var i = M.info, out = '';
    if (i.sandbox) {
      out += '<div class="mt-box red"><strong>いまは送れません。</strong>送信元が Resend の試用アドレス（' + esc(i.from) + '）のままです。この状態では、Resend に登録した本人のアドレス以外には届かないため、お知らせメールは送れません（自分あてのテスト送信だけはできます）。<br>' + esc(i.steps) + '</div>';
    }
    if (!i.address) {
      out += '<div class="mt-box"><strong>送信者の住所が未設定です。</strong>特定電子メール法で、お知らせメールには送信者の住所を書くことが決まっています。「設定状況 › キーの入力」の「お知らせメールに書く住所」に入れると送れるようになります。</div>';
    }
    return out;
  }

  function draw(body) {
    var S = T.state();
    var d = draft();
    var legacy = S.mode === 'legacy';
    body.innerHTML =
      '<p class="mt-note" style="margin-top:0">会員にまとめてメールを送ります。送るのは、登録のときにお知らせメールの受け取りに同意した人だけです（配信を止めた人には送りません）。</p>' +
      banners() +
      '<div class="mt-card"><h3 style="margin-bottom:8px">新しいお知らせメール</h3>' +
      '<label class="mt-field">件名<input type="text" id="mm-subject" maxlength="' + M.info.limits.subject + '" placeholder="例: 年末年始の営業日のお知らせ" value="' + esc(d.subject || '') + '"></label>' +
      '<label class="mt-field" style="margin-top:8px">本文<textarea id="mm-body" maxlength="' + M.info.limits.body + '" placeholder="いつもありがとうございます。&#10;&#10;■ 営業日&#10;・12月28日（土）〜1月5日（日）はお休みです">' + esc(d.body || '') + '</textarea></label>' +
      '<p class="mt-note">書き方: 空いた行で段落が分かれます。「■ 」で始まる行は見出し、「・」で始まる行は箇条書き、**ここ** は太字、https:// で始まるURLはリンクになります。本文の下には、送信者の名前・住所・問い合わせ先・配信停止のリンクが自動で付きます。</p>' +
      '<div class="mt-grid" style="margin-top:6px">' +
      '<label class="mt-field">送る相手<select id="mm-seg"><option value="">会員全員（配信を受け取る人）</option>' +
      (legacy ? '' : S.segments.map(function (s) { return '<option value="' + esc(s.id) + '">グループ「' + esc(s.name) + '」</option>'; }).join('')) +
      '</select></label>' +
      '<div class="mt-field"><label style="display:flex;gap:6px;align-items:center;color:var(--sub)"><input type="checkbox" id="mm-when-on" style="width:18px;height:18px">日時を決めて送る（予約）</label>' +
      '<input type="datetime-local" id="mm-when" disabled aria-label="送る日時（日本時間）"></div></div>' +
      '<p class="mt-note" id="mm-count" role="status" style="font-size:13px;color:var(--text)">届く人数: 数えています…</p>' +
      '<div class="mt-acts"><button type="button" class="ghost" id="mm-preview">見本を見る</button>' +
      '<button type="button" class="ghost" id="mm-test">テスト送信（' + esc(M.info.owner) + ' あて）</button>' +
      '<button type="button" id="mm-go">送信の確認へ</button></div>' +
      '<div id="mm-confirm"></div><div id="mm-prev"></div></div>' +
      '<div class="mt-card"><h3 style="margin-bottom:8px">送ったお知らせメール</h3><div id="mm-hist"></div></div>';
    el('mm-seg').value = M.seg;
    el('mm-seg').addEventListener('change', function () { M.seg = this.value; M.confirm = false; el('mm-confirm').innerHTML = ''; count(); });
    el('mm-when-on').addEventListener('change', function () { el('mm-when').disabled = !this.checked; M.confirm = false; el('mm-confirm').innerHTML = ''; });
    ['mm-subject', 'mm-body'].forEach(function (id) {
      el(id).addEventListener('input', function () { keep(); if (M.confirm) { M.confirm = false; el('mm-confirm').innerHTML = ''; } });
    });
    el('mm-preview').addEventListener('click', preview);
    el('mm-test').addEventListener('click', test);
    el('mm-go').addEventListener('click', askSend);
    history();
  }

  async function count() {
    var c = el('mm-count');
    if (!c) return;
    c.textContent = '届く人数: 数えています…';
    var seg = M.seg;
    var r = await T.post({ action: 'mail.count', segment: seg });
    if (M.seg !== seg || !el('mm-count')) return;
    if (!r.data || !r.data.ok) { M.count = null; c.textContent = '届く人数: 数えられませんでした（' + ((r.data && r.data.message) || '通信できませんでした') + '）'; return; }
    M.count = r.data.count;
    M.stopped = r.data.stopped;
    c.textContent = '届く人数: ' + r.data.count + '人' + (r.data.stopped ? '（配信を止めた ' + r.data.stopped + '人には送りません）' : '');
  }

  async function preview() {
    var f = form();
    var r = await T.post({ action: 'mail.preview', subject: f.subject, body: f.body });
    var box = el('mm-prev');
    if (!r.data || !r.data.ok) { box.innerHTML = '<div class="mt-box red">' + esc((r.data && r.data.message) || '見本を作れませんでした。') + '</div>'; return; }
    box.innerHTML = '<div class="mt-sec"><h4>見本（実際に届く形）</h4>' +
      '<p class="mt-note">件名: <strong style="color:var(--text)">' + esc(r.data.subject || '（件名なし）') + '</strong>　配信停止のリンクは、実際のメールでは1人ずつのリンクになります。</p>' +
      '<iframe id="mm-frame" title="お知らせメールの見本" sandbox="" style="width:100%;height:440px;border:1px solid var(--border);border-radius:10px;background:#fff"></iframe>' +
      '<details style="margin-top:6px"><summary class="mt-note" style="cursor:pointer">文字だけのメールソフトで見たときの形</summary><pre style="white-space:pre-wrap;font-size:12px;line-height:1.7;background:#faf9f6;border:1px solid var(--border);border-radius:10px;padding:10px;overflow-wrap:anywhere">' + esc(r.data.text) + '</pre></details></div>';
    el('mm-frame').srcdoc = r.data.html;
  }

  async function test() {
    var f = form();
    var b = el('mm-test');
    b.disabled = true;
    var r = await T.post({ action: 'mail.test', subject: f.subject, body: f.body });
    b.disabled = false;
    if (r.data && r.data.demo) return say(r.data.message, true);
    if (!r.data || !r.data.ok) return say((r.data && r.data.message) || 'テストのメールを送れませんでした。');
    say(r.data.to + ' あてにテストのメールを送りました。件名の頭に【テスト】が付きます。届くまで数分かかることがあります。', true);
  }

  function askSend() {
    var f = form();
    var i = M.info;
    var box = el('mm-confirm');
    var stop = [];
    if (i.sandbox) stop.push('送信元が Resend の試用アドレスのため送れません（上の直し方をご覧ください）。');
    if (!i.address) stop.push('送信者の住所が未設定のため送れません。');
    if (!f.subject) stop.push('件名を入れてください。');
    if (!f.body.trim()) stop.push('本文を入れてください。');
    if (M.count == null) stop.push('届く人数を数えられていません。少し待ってから、もう一度押してください。');
    else if (M.count < 1) stop.push('送る相手がいません。');
    if (el('mm-when-on').checked && !el('mm-when').value) stop.push('予約の日時を入れてください。');
    if (stop.length) { box.innerHTML = '<div class="mt-box red" style="margin-top:10px">' + stop.map(esc).join('<br>') + '</div>'; return; }
    M.confirm = true;
    var target = f.segment ? 'グループ「' + T.segName(f.segment) + '」の' : '会員全員のうち配信を受け取る';
    box.innerHTML = '<div class="mt-box" style="margin-top:10px"><strong>' + esc(target) + ' ' + M.count + '人に、「' + esc(f.subject) + '」を' +
      (f.scheduledAt ? ' ' + esc(el('mm-when').value.replace('T', ' ')) + '（日本時間）に送ります。' : '今すぐ送ります。') + '</strong><br>' +
      (f.scheduledAt ? '送る時間までなら、下の履歴から取り消せます。' : '送ったあとは取り消せません。') +
      ' 見本とテスト送信で、誤字やリンクを確かめましたか？' +
      '<div class="mt-acts"><button type="button" class="mt-danger" id="mm-send">' + M.count + '人に送信する</button><button type="button" class="ghost" id="mm-cancel">やめる</button></div></div>';
    el('mm-cancel').addEventListener('click', function () { M.confirm = false; box.innerHTML = ''; });
    el('mm-send').addEventListener('click', send);
  }

  async function send() {
    var f = form();
    var b = el('mm-send');
    b.disabled = true;
    var r = await T.post({ action: 'mail.send', subject: f.subject, body: f.body, segment: f.segment, segmentName: f.segmentName, scheduledAt: f.scheduledAt, confirmCount: M.count });
    b.disabled = false;
    if (r.data && r.data.code === 'COUNT_CHANGED') {
      M.count = r.data.count;
      el('mm-count').textContent = '届く人数: ' + r.data.count + '人';
      askSend();
      return say(r.data.message);
    }
    if (!r.data || !r.data.ok) return say((r.data && r.data.message) || '送れませんでした。');
    M.confirm = false;
    el('mm-confirm').innerHTML = '';
    draft({});
    el('mm-subject').value = '';
    el('mm-body').value = '';
    say(r.data.scheduledAt ? r.data.count + '人あての予約をしました（' + when(r.data.scheduledAt) + ' に送ります）。' : r.data.count + '人あてに送り始めました。全員に届くまで数分かかることがあります。', true);
    reloadInfo();
  }

  async function reloadInfo() {
    var r = await T.api('/api/members?view=mail');
    if (r.data && r.data.ok) { M.info = r.data; history(); }
  }

  function fmtStat(s) {
    if (!s) return '取得できません';
    return s.n + (s.more ? '人以上' : '人');
  }

  function history() {
    var box = el('mm-hist');
    if (!box) return;
    var items = (M.info && M.info.history) || [];
    if (!items.length) { box.innerHTML = '<p class="mt-note">まだ送ったものはありません。</p>'; return; }
    box.innerHTML = (M.info.historyFromResend ? '' : '<div class="mt-box gray">Resend から履歴を読めなかったため、この画面から送った控えだけを出しています。</div>') +
      '<ul class="mt-list">' + items.map(function (h) {
        var st = M.stats[h.id];
        var tagCls = h.status === 'sent' ? 'ok' : (h.status === 'failed' ? 'ng' : '');
        var line = st === 'loading' ? '<span class="mt-note" style="margin:0">数えています…</span>'
          : st ? '<span class="mt-note" style="margin:0;color:var(--text)">届いた ' + fmtStat(st.delivered) + '・開いた ' + fmtStat(st.opened) + '・リンクを押した ' + fmtStat(st.clicked) +
            '・届かなかった ' + fmtStat(st.bounced) + '・配信停止 ' + fmtStat(st.unsubscribed) + '</span>' : '';
        return '<li><span class="grow"><strong>' + esc(h.subject) + '</strong><br><span class="mt-note" style="margin:0">' +
          '<span class="mt-tag ' + tagCls + '">' + esc(h.statusLabel) + '</span>' +
          esc(h.sentAt ? '送信 ' + when(h.sentAt) : h.scheduledAt ? '予約 ' + when(h.scheduledAt) : '作成 ' + when(h.createdAt)) +
          (h.count != null ? '・' + h.count + '人' : '') + (h.group ? '・' + esc(h.group) : '') + '</span>' +
          (line ? '<br>' + line : '') + '</span>' +
          (h.status === 'sent' ? '<button type="button" class="ghost" data-mmstat="' + esc(h.id) + '">数字を見る</button>' : '') +
          (h.status === 'scheduled' ? '<button type="button" class="ghost" data-mmcancel="' + esc(h.id) + '">予約を取り消す</button>' : '') + '</li>';
      }).join('') + '</ul>' +
      '<p class="mt-note">「開いた」「リンクを押した」は、Resend でそのドメインの開封・クリックの計測を有効にしているときだけ数えられます。画像を読み込まないメールソフトでは開いても数えられないため、実際より少なめに出ます。</p>';
    box.querySelectorAll('[data-mmstat]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = b.getAttribute('data-mmstat');
        M.stats[id] = 'loading';
        history();
        var r = await T.api('/api/members?view=broadcast&id=' + encodeURIComponent(id));
        M.stats[id] = r.data && r.data.ok ? r.data.stats : { delivered: null, opened: null, clicked: null, bounced: null, unsubscribed: null };
        history();
      });
    });
    box.querySelectorAll('[data-mmcancel]').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        var r = await T.post({ action: 'mail.cancel', id: b.getAttribute('data-mmcancel') });
        b.disabled = false;
        if (!r.data || !r.data.ok) return say((r.data && r.data.message) || '取り消せませんでした。');
        say('予約を取り消しました。', true);
        reloadInfo();
      });
    });
  }

  window.lumMembersMail = function (body) {
    if (M.info) { draw(body); count(); } else load(body);
  };
})();

/* ---- 増え方 ----
   月ごとに何人登録したか（登録日時から数えます）、いま配信を止めている
   人数、どのページから登録したか（同意の記録から）。
   Resend は「いつ配信を止めたか」を返さないため、月ごとの配信停止は、
   この画面と配信停止のリンクで止めたものだけを数えています。 */
(function () {
  'use strict';
  var T = window.lumMembersTool;
  if (!T) return;
  var esc = T.esc;

  function label(m) { return Number(m.slice(5)) + '月' + (m.slice(5) === '01' ? '（' + m.slice(0, 4) + '）' : ''); }

  function draw(body, g) {
    var max = 1;
    g.series.forEach(function (x) { if (x.added > max) max = x.added; });
    var stops = {};
    (g.stops || []).forEach(function (x) { stops[x.month] = x.stops; });
    var card = function (k, v, n) {
      return '<div class="mt-card" style="margin:0"><div class="mt-note" style="margin:0;font-weight:700">' + k + '</div>' +
        '<div style="font-size:22px;font-weight:800;line-height:1.3">' + v + '</div><div class="mt-note" style="margin:0">' + n + '</div></div>';
    };
    var th = 'font-weight:700;color:var(--sub);white-space:nowrap;';
    body.innerHTML =
      (g.truncated ? '<div class="mt-box">会員が多いため、最初の5,000人だけで数えています。</div>' : '') +
      '<div class="mt-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:14px">' +
      card('会員', g.total + '人', '登録している人の合計') +
      card('お知らせを受け取る', g.subscribed + '人', 'お知らせメールが届く人') +
      card('配信停止', g.unsubscribed + '人', 'いま止めている人') +
      card('今月の登録', g.thisMonth + '人', '日本時間の今月') + '</div>' +
      '<div class="mt-card"><h3 style="margin-bottom:4px">月ごとの新しい登録</h3>' +
      '<p class="mt-note" style="margin-top:0">ここ12か月。棒の長さが、その月に登録した人数です。右端は月末の会員数（いまいる人の登録日から数えたもの。削除した人は入りません）。</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>' +
      '<th style="' + th + 'text-align:left;padding:4px 6px 4px 0">月</th>' +
      '<th style="' + th + 'text-align:left;padding:4px 6px">新しい登録</th>' +
      '<th style="' + th + 'text-align:right;padding:4px 0 4px 6px">配信停止*</th>' +
      '<th style="' + th + 'text-align:right;padding:4px 0 4px 6px">会員数</th></tr></thead><tbody>' +
      g.series.map(function (x) {
        var w = x.added ? Math.max(2, Math.round(x.added / max * 100)) : 0;
        return '<tr style="border-top:1px solid var(--border)">' +
          '<td style="padding:5px 6px 5px 0;white-space:nowrap">' + esc(label(x.month)) + '</td>' +
          '<td style="padding:5px 6px;width:100%"><div style="display:flex;align-items:center;gap:6px" title="' + esc(x.month + ': ' + x.added + '人') + '">' +
          '<span style="display:block;flex:0 1 auto;height:10px;width:' + w + '%;background:#3d3fbf;border-radius:0 4px 4px 0"></span>' +
          '<span style="font-variant-numeric:tabular-nums;white-space:nowrap">' + x.added + '人</span></div></td>' +
          '<td style="padding:5px 0 5px 6px;text-align:right;font-variant-numeric:tabular-nums">' + (stops[x.month] || 0) + '</td>' +
          '<td style="padding:5px 0 5px 6px;text-align:right;font-variant-numeric:tabular-nums">' + x.total + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="mt-note">* 配信停止は、この画面と、登録完了メールなどの配信停止のリンクで止めた数です。お知らせメールの「配信を停止する」（Resend のページ）で止めた人は、いつ止めたかが Resend から取れないため、月ごとには数えられません（上の「配信停止」の合計には入っています）。' +
      (g.auditStored ? '' : '保存先（Upstash Redis）がつながっていないため、月ごとの配信停止は数えられません。') + '</p></div>' +
      '<div class="mt-card"><h3 style="margin-bottom:4px">どのページから登録したか</h3>' +
      (!g.consentsKnown ? '<div class="mt-box gray">同意の記録の保存先（Upstash Redis）がつながっていないため、分かりません。</div>'
        : '<ul class="mt-list">' + g.sources.map(function (s) {
          return '<li><span class="grow">' + esc(s.source) + '</span><strong>' + s.count + '人</strong></li>';
        }).join('') + (g.noRecord ? '<li><span class="grow" style="color:var(--sub)">記録なし（同意の記録を始める前に登録した人・Resend に直接入れた人）</span><strong>' + g.noRecord + '人</strong></li>' : '') + '</ul>') +
      '</div>';
  }

  window.lumMembersGrowth = async function (body) {
    body.innerHTML = '<p class="mt-note">数えています…</p>';
    var r = await T.api('/api/members?view=growth');
    if (!r.data || r.data.ok !== true) {
      body.innerHTML = '<div class="mt-box red">' + esc((r.data && r.data.message) || '読み込めませんでした。') + '</div>';
      return;
    }
    draw(body, r.data);
  };
})();
