/* ---- 掲載キット（SEO / AIO 分析の画面の上に出ます） ----
 *
 * 計測で分かっていること：社名で聞いても別の会社が挙がり、答えの材料は
 * 比較サイト・紹介サイト・事業者情報でした。サイトの中の文章は、質問に答える形に
 * なっています。足りないのは、サイトの外にある「この会社は実在する」という裏づけです。
 *
 * そこは登録の作業なので、この画面でできるのは「速くする」ことです。
 *   ・どこでも同じ表記で書くための会社情報（写すだけ）
 *   ・紹介文（短い・ふつう・長い）
 *   ・登録する先と、済んだかどうかの印（この端末に覚えます）
 *
 * ここに書く事実は、サイトに載っているものだけです（料金は src/data/site.js の
 * PRICE_OPTIONS と各サービスのページ。scripts/test-seo-kit.mjs が数字を見比べます）。 */
(function () {
  'use strict';
  if (window.lumSeoKit) return;

  var KEY = 'lum_seo_kit_done';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var FACTS = [
    ['社名', 'Lumenium（ルメニウム）'],
    ['代表', '山本 捷真'],
    ['所在地', '東京都'],
    ['設立', '2026年'],
    ['公式サイト', 'https://lumenium.net'],
    ['事業内容', '業務効率化システム開発、ホームページ制作、生成AI研修、動画制作、SNS運用・LINE構築、キャスト手配、ロゴ・バナーなどの制作'],
    ['対応地域', '東京拠点・オンラインで全国対応']
  ];

  var TEXTS = [
    ['短い（約60字）', '東京のLumenium（ルメニウム）。業務効率化システムの開発、ホームページ制作、企業向け生成AI研修を、相談から一社でお受けします。'],
    ['ふつう（約130字）', 'Lumenium（ルメニウム）は、東京を拠点に、業務効率化システムの開発・ホームページ制作・企業向け生成AI研修・動画制作を行う会社です。何を作るか決まっていない段階から相談でき、相談と見積りは無料。オンラインで全国に対応します。公式サイト: https://lumenium.net'],
    ['長い（約300字）', 'Lumenium（ルメニウム）は、東京を拠点とする制作・DX支援の会社です（代表: 山本 捷真、2026年設立）。予約・在庫・顧客管理などの手作業を仕組みにする業務効率化システムの開発（30万円〜）、ホームページ制作（LP30万円〜・サイト60万円〜）、企業向け生成AI研修（講師1回10万円〜）、動画制作（5万円〜）、SNS運用・LINE構築（20万円〜）、キャスト手配、ロゴ・バナーなどの制作（3万円〜）を、企画から一社でお受けします。何を作るか決まっていない段階からご相談いただけます。相談・見積りは無料、48時間以内にご返信します。オンラインで全国対応。公式サイト: https://lumenium.net']
  ];

  /* 登録する先。上ほど先に。「計測」は、直近の計測で答えの材料として何度も読まれていたサイトです。 */
  var PLACES = [
    { id: 'gbp', name: 'Googleビジネスプロフィール', url: 'https://www.google.com/business/', why: 'Google の検索・マップ・AIの回答が読む、事業者情報です。無料で登録できます。' },
    { id: 'bing', name: 'Bing Places for Business', url: 'https://www.bingplaces.com/', why: 'ChatGPT の検索や Copilot が読んでいる Bing の事業者情報です。' },
    { id: 'sns', name: '自社のSNSのプロフィール', url: '', why: 'X・Instagram などのプロフィールに、社名を上と同じ表記で書き、公式サイトのURLを入れます。' },
    { id: 'sameas', name: 'SNSのURLを、サイトの会社情報に入れる', url: '', why: 'いまサイトには、公式アカウントのURLが1つも入っていません。URLが分かれば、サイト側の作業で入れられます（開発の担当に伝えてください）。' },
    { id: 'biz', name: '比較ビズ', url: 'https://www.biz.ne.jp/', why: '計測で、答えの材料としていちばん多く読まれていたサイトです。', measured: true },
    { id: 'imitsu', name: 'アイミツ', url: 'https://imitsu.jp/', why: '計測で、制作会社を挙げる答えに使われていました。', measured: true },
    { id: 'lancers', name: 'ランサーズ', url: 'https://www.lancers.jp/', why: '計測で読まれていました。プロフィールを作り、社名とURLを入れます。', measured: true },
    { id: 'crowdworks', name: 'クラウドワークス', url: 'https://crowdworks.jp/', why: '計測で読まれていました。プロフィールを作り、社名とURLを入れます。', measured: true }
  ];

  function done() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (_) {} }

  function copy(text, btn) {
    var ok = function () { var old = btn.textContent; btn.textContent = '写しました'; setTimeout(function () { btn.textContent = old; }, 1400); };
    var fallback = function () {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (_) {}
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  }

  var factsText = function () { return FACTS.map(function (f) { return f[0] + ': ' + f[1]; }).join('\n'); };

  var CSS =
    '.sk{background:#fff;border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin-bottom:16px}' +
    '.sk>summary{cursor:pointer;font-size:15px;font-weight:800;line-height:1.5;list-style-position:outside}.sk>summary span{display:block;font-size:12.5px;font-weight:400;color:var(--sub);margin-top:2px}' +
    '.sk-lead{font-size:13.5px;line-height:1.85;margin:12px 0 4px}.sk-note{font-size:12.5px;line-height:1.8;color:var(--sub);margin:6px 0 0}' +
    '.sk h4{font-size:13px;margin:16px 0 6px}' +
    '.sk-box{position:relative;background:#faf9f6;border:1px solid var(--border);border-radius:10px;padding:11px 12px;font-size:13.5px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.sk-row{display:flex;gap:8px;justify-content:space-between;align-items:center;margin:10px 0 4px}.sk-row b{font-size:12.5px}' +
    '.sk-b{min-height:34px;padding:0 12px;border-radius:999px;border:1px solid var(--border);background:#fff;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}' +
    '.sk-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}.sk-li{display:grid;grid-template-columns:auto 1fr auto;gap:4px 10px;align-items:start;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:#fbfaf8}' +
    '.sk-li input{width:20px;height:20px;margin-top:2px}.sk-li b{font-size:13.5px}.sk-li p{grid-column:2 / -1;margin:0;font-size:12.5px;line-height:1.75;color:var(--sub)}.sk-li.on{background:#eef6ee;border-color:#9bd0a6}.sk-li a{font-size:12.5px;font-weight:700;white-space:nowrap}' +
    '.sk-tag{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:#eef2ff;font-size:10.5px;font-weight:700;color:#3730a3;vertical-align:1px}' +
    '#shell .sk-b{color:#1f2937!important}';

  function paint(host) {
    var d = done();
    var left = PLACES.filter(function (p) { return !d[p.id]; }).length;
    host.innerHTML =
      '<details class="sk"' + (left ? ' open' : '') + '>' +
        '<summary>数字を動かすために、サイトの外でやること<span>' + (left ? 'あと' + left + '件（' + PLACES.length + '件中）' : PLACES.length + '件すべて済み') + '。上から順に、15〜30分ずつで進められます。</span></summary>' +
        '<p class="sk-lead">計測では、社名で聞いても別の会社が挙がっていました。答えの材料になっていたのは、比較サイト・紹介サイト・事業者情報です。サイトの中の文章は、すでに質問に答える形になっています。足りないのは、<strong>サイトの外にある「この会社は実在する」という裏づけ</strong>です。下の文を写して、登録してください。</p>' +
        '<p class="sk-note">「おすすめの会社は？」のような質問で、毎回名前が挙がる会社はありません。100%は目標にせず、まず「社名で聞かれたら正しく答えが返る」状態を作り、そのあと得意な分野の質問を1つずつ取りにいきます。</p>' +
        '<h4>1. 会社情報（どこに書くときも、この表記のまま）</h4>' +
        '<div class="sk-box" id="sk-facts">' + esc(factsText()) + '</div>' +
        '<div class="sk-row"><span class="sk-note" style="margin:0">表記がそろっていると、別々のページが「同じ会社」と読まれます。</span><button type="button" class="sk-b" data-copy="facts">会社情報を写す</button></div>' +
        '<h4>2. 紹介文（欄の長さに合わせて選ぶ）</h4>' +
        TEXTS.map(function (t, i) {
          return '<div class="sk-row"><b>' + esc(t[0]) + '</b><button type="button" class="sk-b" data-copy="t' + i + '">写す</button></div><div class="sk-box">' + esc(t[1]) + '</div>';
        }).join('') +
        '<h4>3. 登録する先（済んだら印を付ける）</h4>' +
        '<ul class="sk-list">' + PLACES.map(function (p) {
          return '<li class="sk-li' + (d[p.id] ? ' on' : '') + '"><input type="checkbox" id="sk-' + p.id + '" data-id="' + p.id + '"' + (d[p.id] ? ' checked' : '') + '>' +
            '<label for="sk-' + p.id + '"><b>' + esc(p.name) + '</b>' + (p.measured ? '<span class="sk-tag">計測で読まれた</span>' : '') + '</label>' +
            (p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">開く ↗</a>' : '<span></span>') +
            '<p>' + esc(p.why) + '</p></li>';
        }).join('') + '</ul>' +
        '<p class="sk-note">掲載の条件と費用は、それぞれのサイトで確かめてください（有料のものもあります）。載ったあとは、この画面の「載りに行くべきページ」で載っているかを確かめ、次の計測で数字が動くかを見ます。印は、この端末に覚えています。</p>' +
      '</details>';
    host.onclick = function (e) {
      var b = e.target.closest('[data-copy]');
      if (!b) return;
      var k = b.getAttribute('data-copy');
      copy(k === 'facts' ? factsText() : TEXTS[+k.slice(1)][1], b);
    };
    host.onchange = function (e) {
      var c = e.target.closest('input[data-id]');
      if (!c) return;
      var open = host.querySelector('details').open;
      var dd = done(); if (c.checked) dd[c.getAttribute('data-id')] = 1; else delete dd[c.getAttribute('data-id')];
      save(dd); paint(host); host.querySelector('details').open = open;
    };
  }

  window.lumSeoKit = function (host) {
    if (!host) return;
    if (!document.getElementById('sk-css')) { var st = document.createElement('style'); st.id = 'sk-css'; st.textContent = CSS; document.head.appendChild(st); }
    paint(host);
  };
  window.lumSeoKit.FACTS = FACTS; window.lumSeoKit.TEXTS = TEXTS; window.lumSeoKit.PLACES = PLACES;
})();
