/* ---- 左のメニューとホームのボタンに出す「要対応」の数（全ツール共通） ----
   どのツールも、対応が要るものの数を同じ見た目・同じ言い方で出すための部品です。

     window.lumNavBadge(tabId, n, parts)
       tabId … 'booking-admin' など（左のメニューは #tab-<id>、ホームのボタンは #pnode-<id>）
       n     … 数（0 なら消す）
       parts … 内訳の文の配列（例: ['新しい予約 1件', '確定待ち 2件']）。
               読み上げとマウスを重ねたときの説明に使います。

   見た目は .nav-count（admin-ui.css）。ブラウザのタブの「(5) …」と新着の通知
   （admin-finder.js）は、この印の数を足して出します。

     window.lumNavPoll(fn, ms)
       ログインしてメニューができたら1回、その後は画面を見ているあいだ ms ごと
       （既定3分）と、ほかのタブから戻ってきたときに fn を呼びます。 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };

  window.lumNavBadge = function (tabId, n, parts) {
    n = Math.max(0, Math.round(Number(n) || 0));
    var label = '要対応 ' + n + '件' + (parts && parts.length ? '（' + parts.join('・') + '）' : '');
    ['tab-' + tabId, 'pnode-' + tabId].forEach(function (id) {
      var host = el(id);
      if (!host) return;
      var target = host.querySelector(id.indexOf('tab-') === 0 ? '.ui-nav-lbl' : '.pn-name') || host.querySelector('span') || host;
      var b = target.querySelector('.nav-count');
      if (!n) { if (b) b.remove(); host.removeAttribute('title'); return; }
      if (!b) { b = document.createElement('span'); b.className = 'nav-count'; target.appendChild(b); }
      b.textContent = n > 99 ? '99+' : String(n);
      b.setAttribute('aria-label', label);
      host.setAttribute('title', label);
    });
  };

  window.lumNavPoll = function (fn, ms) {
    var every = ms || 3 * 60000;
    var started = false;
    function begin() {
      if (started || !window.lumAdmin || !document.querySelector('#shell-nav .shell-tab')) return false;
      started = true;
      // 最初の1回は少しだけ後に。ログイン直後はホームの数字を先に取りに行かせたいので、
      // 各ツールの「要対応」の数がいっせいに通信を始めないようにします。
      setTimeout(function () { try { fn(); } catch (_) {} }, 1200);
      setInterval(function () { if (!document.hidden) { try { fn(); } catch (_) {} } }, every);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) { try { fn(); } catch (_) {} } });
      return true;
    }
    if (begin()) return;
    var obs = window.MutationObserver ? new MutationObserver(function () { if (begin() && obs) obs.disconnect(); }) : null;
    function watch() { if (obs) obs.observe(document.body, { childList: true, subtree: true }); begin(); }
    if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);
  };
})();
