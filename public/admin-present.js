/* ---- 資料：提案資料（自己紹介とご提案・14枚） ----
   過去に作った提案資料「Lumenium 自己紹介・ご提案」を、管理画面の中でそのまま見せ・発表します。
   スライドの中身は /proposal-deck.js（開いたときに読み込みます）。1枚は 1920×1080 の枠で、
   画面の幅に合わせて縮めて表示します。できること:
   ・前後に送る（← → キー・スペース）、一覧から選ぶ
   ・全画面で発表（F キー）。話す内容のメモ（ノート）は、全画面にしない画面の下に出ます
   ・印刷・PDF（1枚ずつ横長のページに） */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  var W = 1920, H = 1080;
  var S = { started: false, i: 0, notes: true, deck: null };
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function css() {
    if (el('pd-css')) return;
    var s = document.createElement('style');
    s.id = 'pd-css';
    s.textContent =
      '#present-admin .pd-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}' +
      '#present-admin .pd-bar button{font:inherit;font-size:13px;font-weight:700;padding:9px 14px;border-radius:10px;border:1px solid var(--ui-border,#dcd8ce);background:#fff;color:#17171c;cursor:pointer;min-height:40px}' +
      '#present-admin .pd-bar button.pri{background:var(--ui-accent);border-color:var(--ui-accent);color:#fff}' +
      '#present-admin .pd-bar button:disabled{opacity:.45;cursor:default}' +
      '#present-admin .pd-count{font-size:13px;font-weight:700;color:var(--sub,#55555e);font-variant-numeric:tabular-nums;min-width:4.5em;text-align:center}' +
      '#present-admin .pd-sp{flex:1 1 auto}' +
      '.pd-frame{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:12px;background:#141826;box-shadow:0 1px 3px rgba(15,23,42,.12),0 8px 24px rgba(15,23,42,.08)}' +
      '.pd-slide{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;overflow:hidden}' +
      '.pd-slide>section{position:absolute;inset:0;box-sizing:border-box;font-family:"Noto Sans JP",sans-serif;color:#1b1e2b;line-height:1.3;letter-spacing:0;text-align:left;-webkit-font-smoothing:antialiased}' +
      '.pd-slide>section *{margin:0;box-sizing:border-box}' +
      '.pd-slide>section h1,.pd-slide>section h2,.pd-slide>section h3{letter-spacing:0}' +
      '.pd-slide .pd-ic svg{width:100%;height:100%;display:block}' +
      '#present-admin .pd-notes{margin-top:10px;border:1px solid var(--ui-border,#dcd8ce);border-radius:12px;background:#fff;padding:12px 14px;font-size:13.5px;line-height:1.85;color:#2b2b33}' +
      '#present-admin .pd-notes b{display:block;font-size:11.5px;letter-spacing:.08em;color:var(--sub,#55555e);margin-bottom:4px}' +
      '#present-admin .pd-sec{font-size:12px;color:var(--sub,#55555e);margin:6px 2px 0}' +
      '#present-admin .pd-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:16px}' +
      '#present-admin .pd-thumb{display:block;padding:0;border:2px solid transparent;border-radius:10px;background:none;cursor:pointer;text-align:left;font:inherit}' +
      '#present-admin .pd-thumb[aria-current="true"]{border-color:var(--ui-accent)}' +
      '#present-admin .pd-thumb .pd-frame{border-radius:8px;box-shadow:none;border:1px solid var(--ui-border,#dcd8ce)}' +
      '#present-admin .pd-thumb span{display:block;font-size:11.5px;color:var(--sub,#55555e);padding:4px 2px 0}' +
      /* 全画面で発表 */
      '.pd-show{position:fixed;inset:0;background:#0b0d16;z-index:4000;display:flex;align-items:center;justify-content:center;cursor:none}' +
      '.pd-show .pd-frame{border-radius:0;box-shadow:none;width:auto;height:auto;aspect-ratio:auto}' +
      '.pd-show-hint{position:fixed;right:16px;bottom:12px;color:rgba(255,255,255,.55);font-size:12px;z-index:4001;font-family:system-ui,sans-serif;pointer-events:none}' +
      /* 印刷・PDF（1枚ずつ） */
      '#pd-print{display:none}' +
      '@media print{body.pd-printing>*:not(#pd-print){display:none!important}body.pd-printing #pd-print{display:block}' +
      'body.pd-printing{background:#fff!important;margin:0}#pd-print .pd-page{position:relative;width:1920px;height:1080px;overflow:hidden;break-after:page;page-break-after:always}' +
      '#pd-print .pd-page:last-child{break-after:auto;page-break-after:auto}#pd-print .pd-slide{transform:none}' +
      '#pd-print *{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
    document.head.appendChild(s);
  }

  function fonts(list) {
    (list || []).forEach(function (href, k) {
      if (!/^https:\/\/fonts\.googleapis\.com\/css2\?/.test(href) || el('pd-font-' + k)) return;
      var l = document.createElement('link');
      l.id = 'pd-font-' + k;
      l.rel = 'stylesheet';
      l.href = href;
      document.head.appendChild(l);
    });
  }

  var wait = null;
  function loadDeck() {
    if (window.lumProposalDeck) return Promise.resolve(window.lumProposalDeck);
    if (wait) return wait;
    wait = new Promise(function (ok, ng) {
      var s = document.createElement('script');
      s.src = '/proposal-deck.js';
      s.onload = function () { window.lumProposalDeck ? ok(window.lumProposalDeck) : ng(new Error('deck')); };
      s.onerror = function () { wait = null; ng(new Error('deck')); };
      document.head.appendChild(s);
    });
    return wait;
  }

  /* 1枚の HTML（中身は自分たちの資料。アイコンだけ、ここで管理画面の線のアイコンに置き換えます）。 */
  function slideHtml(sl) {
    var html = sl.html;
    if (window.lumIcon) html = html.replace(/<span class="pd-ic" data-ic="([a-z]+)"([^>]*)><\/span>/g, function (_, n, rest) { return '<span class="pd-ic"' + rest + '>' + window.lumIcon(n) + '</span>'; });
    return '<div class="pd-slide">' + html + '</div>';
  }
  /* 枠の幅に合わせて縮める（枠は 16:9）。 */
  function fit(frame, w, h) {
    var sl = frame.querySelector('.pd-slide');
    if (!sl) return;
    var fw = w || frame.clientWidth, fh = h || frame.clientHeight;
    var k = Math.min(fw / W, fh / H) || 0;
    sl.style.transform = 'scale(' + k + ')';
  }
  var ro = window.ResizeObserver ? new ResizeObserver(function (list) { list.forEach(function (e) { fit(e.target); }); }) : null;
  function watch(frame) { if (ro) ro.observe(frame); else fit(frame); }

  function sectionOf(i) {
    var d = S.deck, id = d.slides[i].id, at = '';
    d.sections.forEach(function (s) {
      var k = d.slides.findIndex(function (x) { return x.id === s.start; });
      if (k >= 0 && k <= i) at = s.text;
    });
    return id && at;
  }

  function paint() {
    var host = el('present-admin');
    var d = S.deck, n = d.slides.length, sl = d.slides[S.i];
    host.innerHTML =
      '<p class="share-note ui-intro">過去に作った提案資料「' + esc(d.title) + '」です。ここからそのまま発表したり、印刷・PDFにして渡したりできます。← → キーで送り、F キーで全画面になります。</p>' +
      '<div class="pd-bar">' +
        '<button type="button" id="pd-prev"' + (S.i ? '' : ' disabled') + ' aria-label="前のスライド">← 前</button>' +
        '<span class="pd-count" aria-live="polite">' + (S.i + 1) + ' / ' + n + '</span>' +
        '<button type="button" id="pd-next"' + (S.i < n - 1 ? '' : ' disabled') + ' aria-label="次のスライド">次 →</button>' +
        '<span class="pd-sp"></span>' +
        '<button type="button" class="pri" id="pd-show">全画面で発表</button>' +
        '<button type="button" id="pd-print-btn">印刷・PDF</button>' +
        '<button type="button" id="pd-notes-btn" aria-pressed="' + S.notes + '">' + (S.notes ? 'ノートを隠す' : 'ノートを見る') + '</button>' +
      '</div>' +
      '<div class="pd-frame" id="pd-main" role="img" aria-label="スライド ' + (S.i + 1) + '">' + slideHtml(sl) + '</div>' +
      '<p class="pd-sec">' + esc(sectionOf(S.i)) + '</p>' +
      (S.notes && sl.notes ? '<div class="pd-notes"><b>話す内容（ノート）</b>' + esc(sl.notes) + '</div>' : '') +
      '<div class="pd-thumbs" role="list">' + d.slides.map(function (x, i) {
        return '<button type="button" class="pd-thumb" role="listitem" data-go="' + i + '" aria-current="' + (i === S.i) + '" aria-label="' + (i + 1) + '枚目へ"><div class="pd-frame">' + slideHtml(x) + '</div><span>' + (i + 1) + '</span></button>';
      }).join('') + '</div>';
    host.querySelectorAll('.pd-frame').forEach(watch);
    el('pd-prev').addEventListener('click', function () { go(S.i - 1); });
    el('pd-next').addEventListener('click', function () { go(S.i + 1); });
    el('pd-show').addEventListener('click', show);
    el('pd-print-btn').addEventListener('click', printAll);
    el('pd-notes-btn').addEventListener('click', function () { S.notes = !S.notes; paint(); });
    host.querySelectorAll('[data-go]').forEach(function (b) { b.addEventListener('click', function () { go(Number(b.getAttribute('data-go'))); }); });
  }

  function go(i) {
    var n = S.deck.slides.length;
    i = Math.max(0, Math.min(n - 1, i));
    if (i === S.i && el('pd-main')) return;
    S.i = i;
    try { sessionStorage.setItem('lum_pd_i', String(i)); } catch (_) {}
    if (box) return drawShow();
    var main = el('pd-main');
    if (!main) return paint();
    // 一覧は描き直さず、大きい1枚と数・ノート・選択の印だけ差し替えます。
    main.innerHTML = slideHtml(S.deck.slides[i]);
    fit(main);
    main.setAttribute('aria-label', 'スライド ' + (i + 1));
    var host = el('present-admin');
    host.querySelector('.pd-count').textContent = (i + 1) + ' / ' + n;
    el('pd-prev').disabled = i === 0;
    el('pd-next').disabled = i === n - 1;
    host.querySelector('.pd-sec').textContent = sectionOf(i);
    var nt = host.querySelector('.pd-notes');
    var sl = S.deck.slides[i];
    if (S.notes && sl.notes) {
      if (!nt) { nt = document.createElement('div'); nt.className = 'pd-notes'; host.querySelector('.pd-sec').after(nt); }
      nt.innerHTML = '<b>話す内容（ノート）</b>' + esc(sl.notes);
    } else if (nt) nt.remove();
    host.querySelectorAll('.pd-thumb').forEach(function (b, k) { b.setAttribute('aria-current', String(k === i)); });
  }

  /* ---- 全画面で発表 ---- */
  var box = null;
  function drawShow() {
    var f = box.querySelector('.pd-frame');
    f.innerHTML = slideHtml(S.deck.slides[S.i]);
    sizeShow();
  }
  function sizeShow() {
    if (!box) return;
    var f = box.querySelector('.pd-frame');
    var k = Math.min(window.innerWidth / W, window.innerHeight / H);
    f.style.width = Math.round(W * k) + 'px';
    f.style.height = Math.round(H * k) + 'px';
    fit(f, W * k, H * k);
  }
  function show() {
    if (box) return;
    box = document.createElement('div');
    box.className = 'pd-show';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '発表中');
    box.innerHTML = '<div class="pd-frame"></div>';
    var hint = document.createElement('div');
    hint.className = 'pd-show-hint';
    hint.textContent = '← → で送る・Esc で戻る';
    document.body.appendChild(box);
    document.body.appendChild(hint);
    box.addEventListener('click', function (e) { go(S.i + (e.clientX < window.innerWidth / 3 ? -1 : 1)); });
    drawShow();
    if (box.requestFullscreen) box.requestFullscreen().catch(function () {});
    setTimeout(function () { hint.remove(); }, 2500);
    window.addEventListener('resize', sizeShow);
  }
  function endShow() {
    if (!box) return;
    window.removeEventListener('resize', sizeShow);
    box.remove();
    box = null;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    paint();
  }
  document.addEventListener('fullscreenchange', function () { if (box && !document.fullscreenElement) endShow(); });

  /* ---- 印刷・PDF（1枚を1ページに） ---- */
  function printAll() {
    var wrap = document.createElement('div');
    wrap.id = 'pd-print';
    wrap.innerHTML = S.deck.slides.map(function (x) { return '<div class="pd-page">' + slideHtml(x) + '</div>'; }).join('');
    var page = document.createElement('style');
    page.id = 'pd-page';
    page.textContent = '@page{size:1920px 1080px;margin:0}';
    document.body.appendChild(wrap);
    document.head.appendChild(page);
    document.body.classList.add('pd-printing');
    var done = function () {
      document.body.classList.remove('pd-printing');
      wrap.remove();
      page.remove();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    // フォントが読み込まれてから印刷します（明朝が抜けないように）。
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () { setTimeout(function () { window.print(); setTimeout(done, 1500); }, 150); });
  }

  function visible() { var h = el('present-admin'); return !!h && h.style.display !== 'none'; }
  document.addEventListener('keydown', function (e) {
    if (!S.deck || (!box && !visible())) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (box && e.key === ' ')) { e.preventDefault(); go(S.i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(S.i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(S.deck.slides.length - 1); }
    else if (e.key === 'Escape' && box) { e.preventDefault(); endShow(); }
    else if ((e.key === 'f' || e.key === 'F') && !box) { e.preventDefault(); show(); }
  });

  window.lumPresentInit = async function () {
    if (S.started) return;
    S.started = true;
    css();
    var host = el('present-admin');
    host.innerHTML = '<p class="soc-small">読み込んでいます…</p>';
    try { S.deck = await loadDeck(); } catch (_) {
      S.started = false;
      host.innerHTML = '<p class="soc-small">資料を読み込めませんでした。再読み込みしてください。</p>';
      return;
    }
    fonts(S.deck.fonts);
    try { S.i = Math.max(0, Math.min(S.deck.slides.length - 1, Number(sessionStorage.getItem('lum_pd_i')) || 0)); } catch (_) { S.i = 0; }
    paint();
  };
})();
