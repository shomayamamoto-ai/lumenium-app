/* ---- 自分の2段階認証（ログインの安全） ----
   上の帯の自分の名前を押すと開きます。担当者のキーで入っている人が、スマートフォンの
   認証アプリ（Google Authenticator・Microsoft Authenticator など）を登録します。
   オンにすると、次からキーのあとに6けたのコードを入れて入ります。
   オーナーが「必ず使う」にしていて、まだ設定していない人には、ログインの直後に開きます
   （閉じられません。設定するまで、ほかの画面は使えないためです）。
   計算と保存は api/otp.js・api/_totp.js。QR コードは口コミ管理と同じ部品で作ります。 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  async function api(method, body) {
    try {
      var r = await window.lumAdmin.fetch('/api/otp', method === 'GET' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      return (r && r.data) || {};
    } catch (_) { return { ok: false, message: '通信できませんでした。' }; }
  }
  var qrWait = null;
  function qrCore() {
    if (window.lumReviewsCore) return Promise.resolve(window.lumReviewsCore);
    if (qrWait) return qrWait;
    qrWait = new Promise(function (ok, ng) {
      var s = document.createElement('script');
      s.src = '/reviews-core.js';
      s.onload = function () { window.lumReviewsCore ? ok(window.lumReviewsCore) : ng(new Error('core')); };
      s.onerror = function () { qrWait = null; ng(new Error('core')); };
      document.head.appendChild(s);
    });
    return qrWait;
  }
  function css() {
    if (el('otp-css')) return;
    var s = document.createElement('style');
    s.id = 'otp-css';
    s.textContent =
      '.otp-back{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.otp{width:min(520px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.3);padding:22px 22px 18px;color:#0f172a}' +
      '.otp h2{font-size:18px;margin:0 0 6px}.otp p{font-size:13.5px;line-height:1.8;color:#334155;margin:6px 0}' +
      '.otp .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}' +
      '.otp button{font:inherit;font-size:13.5px;font-weight:700;padding:10px 16px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;cursor:pointer;min-height:44px}' +
      '.otp button.pri{background:var(--ui-accent,#e0565b);border-color:var(--ui-accent,#e0565b);color:#fff;border-radius:999px}.otp button:disabled{opacity:.55}' +
      '.otp input{font:inherit;font-size:20px;letter-spacing:.2em;padding:8px 12px;border:1px solid #cbd5e1;border-radius:10px;width:11em;min-height:44px;font-variant-numeric:tabular-nums}' +
      '.otp .qr{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:10px 0}.otp .qr div:first-child{width:170px;height:170px;border:1px solid #e2e8f0;border-radius:12px;padding:6px;background:#fff}' +
      '.otp .qr svg{width:100%;height:100%;display:block}.otp code{font-size:13px;word-break:break-all;background:#f1f5f9;padding:2px 6px;border-radius:6px}' +
      '.otp .codes{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin:10px 0;font-family:ui-monospace,monospace;font-size:15px}.otp .codes span{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;text-align:center}' +
      '.otp .st{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:2px 10px}.otp .st.on{background:#dcfce7;color:#166534}.otp .st.off{background:#f1f5f9;color:#475569}' +
      '.otp .msg{min-height:1.4em;font-size:13px;color:#b42318;margin-top:8px}.otp .msg.ok{color:#166534}';
    document.head.appendChild(s);
  }

  var box = null, forced = false;
  function close() { if (forced) return; if (box) { box.remove(); box = null; } }
  function frame(inner) {
    css();
    if (!box) {
      box = document.createElement('div');
      box.className = 'otp-back';
      box.addEventListener('click', function (e) { if (e.target === box) close(); });
      document.body.appendChild(box);
      document.addEventListener('keydown', function onKey(e) { if (!box) { document.removeEventListener('keydown', onKey); return; } if (e.key === 'Escape') close(); });
    }
    box.innerHTML = '<div class="otp" role="dialog" aria-modal="true" aria-labelledby="otp-h">' + inner + '</div>';
    var c = box.querySelector('[data-close]');
    if (c) c.addEventListener('click', close);
    var first = box.querySelector('input, button.pri, button');
    if (first) first.focus();
  }
  function say(t, ok) { var m = box && box.querySelector('.msg'); if (m) { m.textContent = t || ''; m.classList.toggle('ok', !!ok); } }

  async function open(opt) {
    forced = !!(opt && opt.forced);
    frame('<h2 id="otp-h">ログインの安全（2段階認証）</h2><p>読み込んでいます…</p>');
    var d = await api('GET');
    if (!d.ok) { frame('<h2 id="otp-h">ログインの安全（2段階認証）</h2><p>' + esc(d.message || '読み込めませんでした。') + '</p><div class="row"><button type="button" data-close>閉じる</button></div>'); forced = false; return; }
    if (d.owner) { forced = false; frame('<h2 id="otp-h">ログインの安全（2段階認証）</h2><p>' + esc(d.message) + '</p><p>担当者に2段階認証を必ず使ってもらうかは、「担当者と権限」で決められます。</p><div class="row"><button type="button" data-close>閉じる</button></div>'); return; }
    if (d.on) return showOn(d);
    showOff(d);
  }

  function showOff(d) {
    frame('<h2 id="otp-h">ログインの安全（2段階認証） <span class="st off">オフ</span></h2>' +
      (forced ? '<p><b>オーナーが「担当者は2段階認証を必ず使う」にしています。</b>設定するまで、ほかの画面は使えません。</p>' : '') +
      '<p>キーが誰かに知られても、あなたのスマートフォンが無ければ入れないようにする仕組みです。スマートフォンに認証アプリ（Google Authenticator・Microsoft Authenticator など、無料）を入れてから始めてください。</p>' +
      '<div class="row"><button type="button" class="pri" id="otp-start">設定を始める</button>' + (forced ? '' : '<button type="button" data-close>あとで</button>') + '</div><div class="msg" role="status"></div>');
    el('otp-start').addEventListener('click', start);
  }

  async function start() {
    var b = el('otp-start'); if (b) b.disabled = true;
    var d = await api('POST', { action: 'start' });
    if (!d.ok) { if (b) b.disabled = false; say(d.message || 'うまくいきませんでした。'); return; }
    frame('<h2 id="otp-h">認証アプリに登録する</h2>' +
      '<p>1. 認証アプリで「QRコードを読み取る」を選び、下のコードを読み取ります。読み取れないときは、「キーを入力」で次の文字を入れてください。</p>' +
      '<div class="qr"><div id="otp-qr"></div><div><code>' + esc(d.secret.replace(/(.{4})/g, '$1 ').trim()) + '</code></div></div>' +
      '<p>2. アプリに出た6けたを入れて「オンにする」を押します。</p>' +
      '<div class="row"><input id="otp-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="6けたのコード"><button type="button" class="pri" id="otp-enable">オンにする</button>' + (forced ? '' : '<button type="button" data-close>やめる</button>') + '</div>' +
      '<div class="msg" role="status"></div>');
    qrCore().then(function (core) { el('otp-qr').innerHTML = core.qrSvg(core.qrEncode(d.uri), { label: '認証アプリに読み取らせるQRコード' }); })
      .catch(function () { el('otp-qr').innerHTML = '<p>QR コードを出せませんでした。右の文字を入れてください。</p>'; });
    el('otp-enable').addEventListener('click', async function () {
      var code = el('otp-code').value.replace(/\D/g, '');
      if (code.length !== 6) { say('6けたの数字を入れてください。'); return; }
      this.disabled = true;
      var r = await api('POST', { action: 'enable', code: code });
      this.disabled = false;
      if (!r.ok) { say(r.message || 'オンにできませんでした。'); return; }
      showCodes(r.codes, r.message);
    });
  }

  function showCodes(codes, message) {
    forced = false;
    frame('<h2 id="otp-h">予備のコード（いまだけ表示します）</h2>' +
      '<p>' + esc(message || '') + '</p>' +
      '<p><b>スマートフォンを無くしたときは、この中の1つを6けたの代わりに使えます（1つにつき1回）。</b>印刷するか、パスワードの管理アプリなど、スマートフォン以外の安全な所に控えてください。</p>' +
      '<div class="codes">' + codes.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>' +
      '<div class="row"><button type="button" id="otp-copy">コピー</button><button type="button" id="otp-dl">ファイルに保存</button><button type="button" class="pri" data-close>控えました</button></div><div class="msg" role="status"></div>');
    var text = '予備のコード（' + location.host + '）\n' + codes.join('\n') + '\n';
    el('otp-copy').addEventListener('click', async function () { try { await navigator.clipboard.writeText(text); say('コピーしました。', true); } catch (_) { say('コピーできませんでした。'); } });
    el('otp-dl').addEventListener('click', function () {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      a.download = '予備のコード.txt';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
  }

  function showOn(d) {
    forced = false;
    frame('<h2 id="otp-h">ログインの安全（2段階認証） <span class="st on">オン</span></h2>' +
      '<p>入るときに、キーのあとで認証アプリの6けたを聞きます。予備のコードの残り: <b>' + (d.recoveryLeft || 0) + 'つ</b>' + ((d.recoveryLeft || 0) <= 2 ? '（少なくなっています。作り直してください）' : '') + '</p>' +
      (d.required ? '<p>オーナーが「必ず使う」にしているため、オフにはできません。スマートフォンを替えたときは、オーナーにリセットを頼んでください。</p>' : '') +
      '<div class="row"><input id="otp-code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" aria-label="6けたのコード（か予備のコード）"></div>' +
      '<div class="row"><button type="button" id="otp-recovery">予備のコードを作り直す</button>' + (d.required ? '' : '<button type="button" id="otp-off">オフにする</button>') + '<button type="button" class="pri" data-close>閉じる</button></div>' +
      '<p style="font-size:12px;color:#64748b">作り直す・オフにするには、上の欄にいまの6けた（か予備のコード）を入れてから押してください。</p><div class="msg" role="status"></div>');
    el('otp-recovery').addEventListener('click', async function () {
      var r = await api('POST', { action: 'recovery', code: el('otp-code').value.trim() });
      if (!r.ok) { say(r.message || 'できませんでした。'); return; }
      showCodes(r.codes, r.message);
    });
    if (el('otp-off')) el('otp-off').addEventListener('click', async function () {
      if (!confirm('2段階認証をオフにします。キーだけで入れるようになります。よろしいですか？')) return;
      var r = await api('POST', { action: 'disable', code: el('otp-code').value.trim() });
      if (!r.ok) { say(r.message || 'できませんでした。'); return; }
      open();
    });
  }

  window.lumOtp = { open: open };
})();
