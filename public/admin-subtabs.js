/* 長い画面を、中の切り替え（サブタブ）で分けます。
 *
 * 1つの画面に計測・一覧・設定を縦に積むと、スクロールが数千pxになり、
 * 「どこに何があるか」が分からなくなります。中身の作り（id・組み立て方）
 * には触らず、並んでいる要素に「どのタブのものか」を割り当てて、
 * 選ばれていないタブの要素を隠すだけにしています。
 *
 *   lumSubtabs({
 *     id: 'seo',                       // 最後に開いたタブを覚えておく名前
 *     root: 'seo-admin',               // 子要素を振り分ける入れ物（要素か id）
 *     tabs: [
 *       { key: 'ai', label: 'AIでの見え方', from: '#seo-run' },   // ここから次のタブの from まで
 *       { key: 'gsc', label: 'Google検索', pick: '#gsc-body' },   // 当てはまる子要素だけ
 *     ],
 *     auto: { start: '.set-group', label: fn },  // 見出しから自動でタブを作る（tabs の代わり）
 *     place: function (bar) { ... },   // タブの置き場所（既定は最初に振り分けた要素の前）
 *     onChange: function (key) { ... },
 *   })
 *
 * どのタブにも当てはまらない子要素は、どのタブでも表示したままです。
 * 画面の中のボタンが scrollIntoView で隠れた要素へ移ろうとしたときは、
 * 先にその要素のタブへ切り替えます（ホームの「〜を見る」などがそのまま動きます）。 */
(function () {
  if (window.lumSubtabs) return;

  var all = [];

  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem('lum_subtab_' + k);
      localStorage.setItem('lum_subtab_' + k, v);
    } catch (_) { return null; }
  }

  function childOf(root, node) {
    while (node && node.parentNode !== root) node = node.parentNode;
    return node || null;
  }

  function matches(child, test) {
    if (!test) return false;
    if (Array.isArray(test)) return test.some(function (t) { return matches(child, t); });
    if (typeof test === 'function') return !!test(child);
    return child.matches(test) || !!child.querySelector(test);
  }

  function lumSubtabs(o) {
    var root = typeof o.root === 'string' ? document.getElementById(o.root) : o.root;
    if (!root) return null;
    var tabs = o.tabs || [];
    var active = null;
    var sig = '';
    var bar = document.createElement('div');
    bar.className = 'ui-subtabs' + (o.variant ? ' ' + o.variant : '');
    bar.setAttribute('role', 'tablist');
    if (o.label) bar.setAttribute('aria-label', o.label);

    function build() {
      bar.innerHTML = '';
      tabs.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.dataset.key = t.key;
        if (t.id) b.id = t.id;
        b.textContent = t.label;
        if (t.badge) {
          var s = document.createElement('span');
          s.className = 'ui-subtab-badge' + (t.badgeTone ? ' ' + t.badgeTone : '');
          s.textContent = t.badge;
          b.appendChild(s);
        }
        b.addEventListener('click', function () { select(t.key); });
        bar.appendChild(b);
      });
      paintBar();
    }

    function paintBar() {
      Array.prototype.forEach.call(bar.children, function (b) {
        var on = b.dataset.key === active;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
    }

    // キーボードでは左右の矢印でタブを移ります。
    bar.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var i = tabs.findIndex(function (t) { return t.key === active; });
      var n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      if (!n) return;
      e.preventDefault();
      select(n.key);
      var b = bar.querySelector('[data-key="' + n.key + '"]');
      if (b) b.focus();
    });

    function kids() {
      return Array.prototype.filter.call(root.children, function (c) {
        return c !== bar && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE';
      });
    }

    // 子要素ひとつずつに、どのタブのものかを決めます（null は常に表示）。
    function classify() {
      var list = kids();
      var owner = new Map();
      var starts = [];
      tabs.forEach(function (t) {
        if (!t.from) return;
        var f = typeof t.from === 'function' ? t.from(root) : root.querySelector(t.from);
        var c = f && childOf(root, f);
        var i = c ? list.indexOf(c) : -1;
        if (i >= 0) starts.push({ i: i, key: t.key });
      });
      starts.sort(function (a, b) { return a.i - b.i; });
      starts.forEach(function (s, n) {
        var end = n + 1 < starts.length ? starts[n + 1].i : list.length;
        for (var i = s.i; i < end; i++) owner.set(list[i], s.key);
      });
      list.forEach(function (c) {
        if (owner.has(c)) return;
        for (var k = 0; k < tabs.length; k++) {
          if (matches(c, tabs[k].pick)) { owner.set(c, tabs[k].key); return; }
        }
      });
      return { list: list, owner: owner };
    }

    function autoTabs() {
      var a = o.auto;
      var list = kids();
      var next = [];
      list.forEach(function (c) {
        if (!c.matches(a.start)) return;
        var label = a.label ? a.label(c) : c.textContent.trim().slice(0, 20);
        var t = { key: 'g' + next.length + ':' + (typeof label === 'string' ? label : label.text), from: (function (node) { return function () { return node; }; })(c) };
        if (typeof label === 'string') t.label = label;
        else { t.label = label.text; t.badge = label.badge; t.badgeTone = label.tone; }
        next.push(t);
      });
      var s = next.map(function (t) { return t.key + '|' + (t.badge || ''); }).join('/');
      if (s !== sig) { sig = s; tabs = next; build(); }
      else tabs.forEach(function (t, i) { t.from = next[i].from; });
    }

    var busy = false;
    function apply() {
      busy = true;
      if (o.auto) autoTabs();
      var r = classify();
      if (!tabs.some(function (t) { return t.key === active; })) {
        var saved = o.id && store(o.id);
        var first = tabs.filter(function (t) { return t.key === saved; })[0] ||
          (o.auto && saved && tabs.filter(function (t) { return t.label === String(saved).replace(/^g\d+:/, ''); })[0]) || tabs[0];
        active = first ? first.key : null;
        paintBar();
      }
      var any = false;
      r.list.forEach(function (c) {
        var k = r.owner.get(c);
        if (k) any = true;
        c.classList.toggle('ui-sub-off', !!k && k !== active);
      });
      // 振り分ける中身がまだ無い（読み込み中・エラー）ときは、タブを出しません。
      bar.hidden = !any && !o.always;
      if (!bar.parentNode) {
        if (o.place) o.place(bar);
        else {
          var firstOwned = r.list.filter(function (c) { return r.owner.has(c); })[0];
          root.insertBefore(bar, firstOwned || root.firstChild);
        }
      }
      busy = false;
    }

    function select(key, silent) {
      if (!tabs.some(function (t) { return t.key === key; })) return;
      var changed = key !== active;
      active = key;
      if (o.id) store(o.id, o.auto ? key.replace(/^g\d+:/, '') : key);
      paintBar();
      apply();
      if (!silent && o.onChange) o.onChange(key, changed);
    }

    var queued = false;
    new MutationObserver(function () {
      if (busy || queued) return;
      queued = true;
      Promise.resolve().then(function () { queued = false; apply(); });
    }).observe(root, { childList: true });

    if (!o.auto) build();
    apply();

    var api = {
      root: root,
      bar: bar,
      select: select,
      current: function () { return active; },
      keyOf: function (node) {
        var c = childOf(root, node);
        return c ? classify().owner.get(c) || null : null;
      },
      refresh: apply,
    };
    all.push(api);
    return api;
  }

  /* 隠れているタブの中へ移ろうとしたら、先にそのタブを開きます。
     外側の入れ物から順に開くので、入れ子（設定状況 → キーの入力 → SNS）でも届きます。 */
  function reveal(node) {
    all.forEach(function (t) {
      if (!node || !t.root.contains(node)) return;
      var k = t.keyOf(node);
      if (k && k !== t.current()) t.select(k);
    });
  }
  var orig = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () {
    try { reveal(this); } catch (_) {}
    return orig.apply(this, arguments);
  };

  lumSubtabs.reveal = reveal;
  window.lumSubtabs = lumSubtabs;

  /* ---- 画面ごとの割り当て ----
     見出しの言葉で振り分けるもの（アクセス解析）は、見出しが変わったら
     ここも合わせてください。当てはまらない要素は全部のタブに出るだけで、
     消えはしません。 */
  function head() {
    var words = Array.prototype.slice.call(arguments);
    return function (c) {
      var t = (c.textContent || '').trim();
      return words.some(function (w) { return t.indexOf(w) === 0; });
    };
  }

  function wire() {
    var $ = function (id) { return document.getElementById(id); };

    // SEO / AIO 分析: AIの計測・Google検索・サイトの点検を分けます。
    // 発信量（SNS）は計測結果を読む補足なので、結果のあとに置きます。
    var seoSocial = $('seo-social'), seoBody = $('seo-body');
    if (seoSocial && seoBody) seoBody.parentNode.insertBefore(seoSocial, seoBody.nextSibling);
    lumSubtabs({
      id: 'seo',
      root: 'seo-admin',
      label: 'SEO / AIO 分析の表示の切り替え',
      tabs: [
        { key: 'ai', label: 'AIでの見え方', pick: ['#seo-run', '#seo-setup', '#seo-progress', '#seo-msg', '#seo-social', '#seo-body'] },
        { key: 'gsc', label: 'Google検索', pick: '#gsc-body' },
        { key: 'site', label: 'サイトの点検・クローラー', pick: '#audit-run' },
      ],
    });

    // 設定状況: 「いま動いているか」と「キーを入れる」を分け、キーはまとまりごとに。
    lumSubtabs({
      id: 'health',
      root: 'health-admin',
      label: '設定状況の表示の切り替え',
      tabs: [
        { key: 'status', label: '動いているか', pick: ['#health-reload', '#health-msg', '#health-body'] },
        { key: 'keys', label: 'キーの入力', from: function (r) {
          return Array.prototype.filter.call(r.children, function (c) { return c.tagName === 'H3'; })[0];
        } },
      ],
    });
    var setList = $('set-list');
    if (setList) {
      lumSubtabs({
        id: 'health-keys',
        root: setList,
        variant: 'chips',
        label: 'キーのまとまり',
        auto: {
          start: '.set-group',
          label: function (g) {
            var h = g.querySelector('h4');
            var name = h && h.firstChild && h.firstChild.nodeType === 3 ? h.firstChild.nodeValue.trim() : (h ? h.textContent.trim() : '');
            var m = /(\d+)\s*\/\s*(\d+)/.exec(h && h.querySelector('.tally') ? h.querySelector('.tally').textContent : '');
            if (!m) return name;
            return { text: name, badge: m[1] + '/' + m[2], tone: m[1] === m[2] ? 'ok' : 'warn' };
          },
        },
        place: function (bar) { setList.parentNode.insertBefore(bar, setList); },
      });
    }

    // アクセス解析: 概要・集客・ページ・問い合わせに分けます。
    var stats = $('stats-body');
    if (stats) {
      lumSubtabs({
        id: 'stats',
        root: stats,
        label: 'アクセス解析の表示の切り替え',
        tabs: [
          { key: 'sum', label: '概要', pick: ['#stats-self', '#stats-cards', '#stats-about', head('日別の推移', 'いつ見られているか', '週次メール')] },
          { key: 'src', label: 'どこから来たか', pick: head('どこから来たか', 'AIアシスタントから', '計測用リンク', '検索キーワード') },
          { key: 'page', label: 'ページ', pick: head('最初に見られたページ', 'どこまで読まれたか', 'どのページで帰ったか', 'よく見られたページ') },
          { key: 'conv', label: '問い合わせ', pick: head('問い合わせまでの導線', '問い合わせにつながった', 'サイトの外へ') },
        ],
        place: function (bar) { stats.parentNode.insertBefore(bar, stats); },
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
