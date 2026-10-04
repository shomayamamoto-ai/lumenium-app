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
