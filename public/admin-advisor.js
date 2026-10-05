/* ---- AIアドバイザー ----
   管理画面（admin-members.html）の1タブ。サイトの数字を見ながら、次に何を
   するかを相談する画面です。

   読むところ
     /api/advisor-store?view=state   画面を開いたとき（保存した会話・ToDo・
                                     今月の額・1回の目安・数字から作った質問・
                                     渡している数字）
     /api/advisor（POST・SSE）        相談そのもの。答えは少しずつ届きます。
   書くところ
     /api/advisor-store（POST）       会話を消す・ToDo・自動改善の提案に入れる

   「実行」ボタン
     AIが出す下書きは、ボタンとして答えの下に並びます。押すまで何も起きません。
     押しても「いつもの画面の入力欄に入れる」か「一覧に1件足す」だけで、
     公開・投稿・保存は、その画面のいつものボタンをオーナーが押して行います。
     何が起きるかは、ボタンのすぐ上にそのまま書きます。

   会話は、保存先があればサーバーが答えのたびに保存します（最大20件）。
   いま開いている会話は、このタブの sessionStorage にも置きます（読み込み直し
   で消えないように）。動きのある表示はしません（オーナーは画面が動くのを
   好みません）。書き方は ES5 のままです（ほかの管理画面のファイルと同じ）。 */
(function () {
  var el = function (id) { return document.getElementById(id); };
  var CHAT_KEY = 'lum_advisor_chat';
  var MODE_KEY = 'lum_advisor_mode';
  var S = {
    started: false, state: null, view: 'chat', mode: 'deep', convId: '', messages: [],
    busy: false, controller: null, loading: false
  };
  var VIEWS = [['chat', '相談'], ['saved', '保存した相談'], ['todo', 'ToDo']];
  var KIND_LABEL = { news: 'お知らせ', copy: 'サイトの文章', sns: 'SNSの投稿', experiment: '文章の比べる案', pdca: '動画の仮説', todo: 'ToDo' };
  var TAB_LABEL = {
    'news-admin': 'お知らせ投稿', 'social-admin': 'SNS（文章）', 'video-admin': 'SNS（動画）', 'copy-admin': '文章編集',
    'auto-admin': '自動改善', 'seo-admin': 'SEO / AIO 分析', 'stats-admin': 'アクセス解析', 'inquiries-admin': '問い合わせ管理',
    'booking-admin': '予約管理', 'list-view': '会員リスト', 'health-admin': '設定状況', 'advisor-admin': 'AIアドバイザー'
  };
  var METRIC_LABEL = {
    views: '再生数', avg_watch_sec: '平均視聴秒数', retention_rate: '視聴維持率', avp: '平均視聴率', hold_3s: '3秒維持率',
    engagement_rate: '反応率', save_rate: '保存率', likes: 'いいね', saves: '保存', reach: 'リーチ'
  };

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function demo() { try { return sessionStorage.getItem('lum_demo') === '1'; } catch (_) { return false; } }
  function say(t, info) {
    var m = el('adv-msg');
    if (!m) return;
    m.textContent = t || '';
    m.classList.toggle('show', !!t);
    m.classList.toggle('info', !!info);
  }
  function yen(n) { return '約' + Math.round(Number(n) || 0).toLocaleString('ja-JP') + '円'; }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(Date.parse(iso) + 9 * 3600000);
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
  }
  function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  /** 画面が描かれるのを待つ（最大 ms）。見つからなければ null。 */
  async function waitFor(fn, ms) {
    var end = Date.now() + (ms || 6000);
    while (Date.now() < end) {
      var v = null;
      try { v = fn(); } catch (_) {}
      if (v) return v;
      await wait(120);
    }
    return null;
  }

  async function api(url, opts) {
    try { return await window.lumAdmin.fetch(url, opts); }
    catch (_) { return { res: { ok: false, status: 0 }, data: { ok: false, message: '通信できませんでした。ネットの接続を確かめて、もう一度お試しください。' } }; }
  }
  function post(body) {
    return api('/api/advisor-store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  /* ---- 答えの文章 ----
     見出しや強調の記号を落として、ふつうの文章に戻します。答え方は指示して
     ありますが、混ざったものがそのまま出ると、コピーして別のAIに貼ったとき
     にも記号だけが残ります。最後の2行（SOURCES:: と NEXT::）は印とボタンに
     変えるので、本文には出しません。届きかけ（「NEX」まで）も隠します——
     1文字ずつ増える様子が見えると、壊れているように見えるからです。 */
  var TAIL_TAGS = ['SOURCES::', 'NEXT::'];
  function cutTail(t) {
    var lines = String(t == null ? '' : t).split('\n').filter(function (l) { return !/^\s*(SOURCES|NEXT)::/.test(l); });
    var last = lines.length ? lines[lines.length - 1].trim() : '';
    if (last && TAIL_TAGS.some(function (tag) { return tag.indexOf(last) === 0; })) lines.pop();
    return lines.join('\n').replace(/\s+$/, '');
  }
  function tailList(t, tag) {
    var m = new RegExp('(^|\\n)\\s*' + tag + '::([^\\n]*)').exec(String(t || ''));
    if (!m) return [];
    return m[2].split('||').map(function (q) { return q.replace(/\s+/g, ' ').trim(); })
      .filter(function (q) { return q && q.length <= 40 && q !== 'なし'; }).slice(0, tag === 'NEXT' ? 4 : 8);
  }
  function plain(t) {
    return cutTail(t)
      .replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, '')      // 見出し
      .replace(/\*\*([^*]+)\*\*/g, '$1')            // 強調
      .replace(/(^|[^\w*])\*([^*\n]+)\*/g, '$1$2')  // 斜体
      .replace(/^[ \t]{0,3}[-*+][ \t]+/gm, '・')      // 箇条書き
      .replace(/^[ \t]{0,3}>[ \t]?/gm, '')          // 引用
      .replace(/`+/g, '')                          // コード記号
      .replace(/^[ \t]*[-–—]{3,}[ \t]*$/gm, '');    // 区切り線
  }

  /* ---- 見た目（この画面だけのもの） ---- */
  function style() {
    if (el('adv-style')) return;
    var s = document.createElement('style');
    s.id = 'adv-style';
    s.textContent =
      '#advisor-admin button { padding: 9px 14px; font-size: 12.5px; }' +
      '#advisor-admin input[type=text] { flex: 1; min-width: 0; padding: 12px 13px; background: #faf9f6; color: var(--text); border: 1px solid var(--border); border-radius: 10px; font-size: 14px; font-family: inherit; }' +
      '.adv-bar { background: #f3f1ec; border: 1px solid var(--border); border-radius: 12px; padding: 11px 13px; margin-bottom: 12px; font-size: 12.5px; line-height: 1.8; }' +
      '.adv-bar p { margin: 0; overflow-wrap: anywhere; }' +
      '.adv-bar .adv-warn { color: #92400e; font-weight: 700; }' +
      '.adv-modes { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }' +
      '.adv-modes .nq-chip { padding: 7px 12px; font-size: 12px; }' +
      '.adv-small { font-size: 11.5px; color: var(--sub); line-height: 1.7; margin: 4px 0 0; overflow-wrap: anywhere; }' +
      '.adv-log { max-height: 60vh; overflow-y: auto; background: #f3f1ec; border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 12px; font-size: 13.5px; line-height: 1.75; }' +
      '.adv-m { margin-bottom: 16px; min-width: 0; }' +
      '.adv-who { font-size: 10.5px; letter-spacing: .12em; font-weight: 800; color: var(--sub); margin-bottom: 4px; }' +
      '.adv-text { white-space: pre-wrap; overflow-wrap: anywhere; }' +
      '.adv-user .adv-text { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 8px 11px; }' +
      '.adv-acts { display: grid; gap: 8px; margin-top: 10px; }' +
      '.adv-act { background: #fff; border: 1px solid var(--border); border-left: 3px solid #3d3fbf; border-radius: 10px; padding: 10px 12px; min-width: 0; }' +
      '.adv-act h4 { font-size: 12.5px; font-weight: 800; margin: 0 0 4px; overflow-wrap: anywhere; }' +
      '.adv-act .adv-pre { font-size: 12.5px; white-space: pre-wrap; overflow-wrap: anywhere; background: #faf9f6; border-radius: 8px; padding: 7px 9px; margin: 4px 0 6px; max-height: 14em; overflow-y: auto; }' +
      '.adv-act .adv-does { font-size: 11.5px; color: var(--sub); line-height: 1.7; margin: 0 0 7px; }' +
      '.adv-act .adv-res { font-size: 12px; margin: 6px 0 0; overflow-wrap: anywhere; }' +
      '.adv-act .adv-res.ng { color: #b42318; }' +
      '.adv-act .adv-res.ok { color: #047857; }' +
      '.adv-src { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 9px; font-size: 11px; color: var(--sub); }' +
      '.adv-tag { display: inline-block; font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #e9e6df; color: #44403c; white-space: nowrap; }' +
      '.adv-tag--no { background: rgba(251,191,36,0.18); color: #92400e; }' +
      '.adv-tools { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }' +
      '.adv-tools button { font-size: 11.5px !important; padding: 5px 11px !important; }' +
      '.adv-next { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; align-items: center; }' +
      '.adv-next button, .adv-starts button { font-size: 12px !important; padding: 6px 10px !important; text-align: left; }' +
      '.adv-starts { display: grid; gap: 6px; margin-bottom: 12px; }' +
      '.adv-starts .adv-s { display: grid; gap: 2px; min-width: 0; }' +
      '.adv-form { display: flex; gap: 8px; flex-wrap: wrap; }' +
      '.adv-form input[type=text] { flex: 1 1 220px; }' +
      '.adv-cont { margin-bottom: 12px; }' +
      '.adv-card { border: 1px solid var(--border); border-radius: 11px; background: #fff; padding: 11px 13px; min-width: 0; }' +
      '.adv-card h3 { font-size: 13.5px; font-weight: 700; line-height: 1.6; margin: 0 0 4px; overflow-wrap: anywhere; }' +
      '.adv-card .adv-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }' +
      '.adv-list { display: grid; gap: 8px; }' +
      '.adv-todo { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 10px; align-items: start; }' +
      '.adv-todo input { margin-top: 5px; width: 18px; height: 18px; }' +
      '.adv-todo.done h3 { text-decoration: line-through; color: var(--sub); }' +
      '.adv-srcs ul { margin: 6px 0 0 18px; font-size: 12px; line-height: 1.8; }' +
      '.adv-srcs summary { cursor: pointer; font-size: 12.5px; font-weight: 700; }' +
      '@media (max-width: 520px) { .adv-log { max-height: 64vh; padding: 11px; } .adv-form button { flex: 1 1 auto; } }';
    document.head.appendChild(s);
  }

  function shell() {
    style();
    var host = el('advisor-admin');
    host.innerHTML =
      '<h2 style="font-size:15px;font-weight:700;margin-bottom:4px">AIアドバイザー</h2>' +
      '<p class="share-note" style="margin-bottom:12px">アクセス解析・SEO点検・AIでの見え方・SNS・問い合わせ・予約・会員・お知らせ・自動改善の数字を渡して、次に何をするかを相談できます。' +
      'お客様の名前・メール・電話・問い合わせの本文は渡していません（件数だけです）。答えの下の<b>ボタンは、押すまで何も起きません</b>。押しても入力欄に入るか一覧に1件入るだけで、公開や投稿はいつもの画面で行います。</p>' +
      '<div id="adv-bar" class="adv-bar"><p>読み込んでいます…</p></div>' +
      '<div class="nq-row vid-secs" role="tablist" aria-label="AIアドバイザーの項目">' + VIEWS.map(function (v) {
        return '<button type="button" class="nq-chip" data-view="' + v[0] + '" aria-pressed="false">' + v[1] + '<span class="adv-count" data-count="' + v[0] + '"></span></button>';
      }).join('') + '</div>' +
      '<p class="msg" id="adv-msg" role="status" style="margin:0 0 12px"></p>' +
      '<div id="adv-body"></div>';
    host.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-view')); });
    });
  }

  function go(view) {
    S.view = view;
    document.querySelectorAll('#advisor-admin [data-view]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-view') === view ? 'true' : 'false');
    });
    say('');
    if (view === 'saved') renderSaved();
    else if (view === 'todo') renderTodos();
    else renderChat();
  }

  function counts() {
    var st = S.state || {};
    var c = { saved: (st.conversations || []).length, todo: (st.todos || []).filter(function (t) { return !t.done; }).length };
    document.querySelectorAll('#advisor-admin [data-count]').forEach(function (s) {
      var n = c[s.getAttribute('data-count')];
      s.textContent = n ? '（' + n + '）' : '';
    });
  }

  /* ---- 上の帯：今月の額・1回の目安・モデルの選択 ---- */
  function renderBar() {
    var st = S.state;
    var host = el('adv-bar');
    if (!host) return;
    if (!st) { host.innerHTML = '<p>読み込めませんでした。「再読込」で読み直してください。</p>'; return; }
    var u = st.usage || {};
    var ratio = u.cap ? u.yen / u.cap : 0;
    var month = u.recorded
      ? '今月の利用額（目安）: <b>' + yen(u.yen) + '</b>（' + (u.calls || 0) + '回）／上限の目安 ' + yen(u.cap) +
        (ratio >= 1 ? '　<span class="adv-warn">上限に達しました。来月1日に再開します。</span>' : ratio >= 0.8 ? '　<span class="adv-warn">上限の8割を超えました。</span>' : '')
      : '保存先が無いため、今月の利用額は記録できていません（上限の目安 ' + yen(u.cap) + '）。';
    var e = st.estimate || {};
    var est = function (x) { return x ? '約' + Math.round(x.lo) + '〜' + Math.round(x.hi) + '円' : '—'; };
    host.innerHTML =
      '<p>' + month + '</p>' +
      '<div class="adv-modes" role="group" aria-label="答え方">' +
        '<button type="button" class="nq-chip" data-mode="deep" aria-pressed="' + (S.mode === 'deep') + '">しっかり考える（1回 ' + est(e.deep) + '）</button>' +
        '<button type="button" class="nq-chip" data-mode="quick" aria-pressed="' + (S.mode === 'quick') + '">手早く・安く（1回 ' + est(e.quick) + '）</button>' +
      '</div>' +
      '<p class="adv-small">' + (S.mode === 'quick'
        ? '「手早く・安く」は短い質問向けです。安いほうのモデルが、考える量を減らして答えます。込み入った相談は「しっかり考える」を選んでください。'
        : '1回の額は目安です。続けて相談すると安いほう、久しぶりや検索が多いと高いほうに近づきます。') +
      '　円は1ドル150円で計算した目安で、実際の請求は console.anthropic.com で確かめられます。</p>';
    host.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () {
        S.mode = b.getAttribute('data-mode');
        try { sessionStorage.setItem(MODE_KEY, S.mode); } catch (_) {}
        renderBar();
      });
    });
  }

  /* ---- 相談 ---- */
  function renderChat() {
    var body = el('adv-body');
    var st = S.state || {};
    var convs = st.conversations || [];
    var last = convs.filter(function (c) { return c.id !== S.convId; })[0];
    var empty = !S.messages.length;
    var sources = st.sources || [];
    var okN = sources.filter(function (s) { return s.ok; }).length;
    body.innerHTML =
      (empty && last ? '<div class="adv-cont"><button type="button" class="ghost" id="adv-continue">前回の相談の続き：「' + esc(last.title) + '」（' + esc(when(last.updatedAt)) + '）</button></div>' : '') +
      (empty && (st.starters || []).length
        ? '<p class="adv-small" style="margin:0 0 6px;font-weight:700">いまの数字から、聞くとよいこと</p><div class="adv-starts">' + st.starters.map(function (s, i) {
            return '<div class="adv-s"><button type="button" class="ghost" data-start="' + i + '">' + esc(s.q) + '</button><span class="adv-small">' + esc(s.why) + '</span></div>';
          }).join('') + '</div>'
        : '') +
      '<div class="adv-log" id="adv-log" aria-label="相談のやりとり"></div>' +
      '<form class="adv-form" id="adv-form">' +
        '<label for="adv-input" class="sr-only" style="position:absolute;left:-9999px">質問</label>' +
        '<input type="text" id="adv-input" placeholder="例：問い合わせを増やすには、何から？" autocomplete="off" maxlength="2000">' +
        '<button type="submit" id="adv-send">送信</button>' +
        '<button type="button" class="ghost" id="adv-stop" style="display:none">止める</button>' +
        '<button type="button" class="ghost" id="adv-new">新しい相談</button>' +
      '</form>' +
      '<p class="adv-small">' + (st.stored === false
        ? '保存先が無いため、会話はこのタブを閉じると消えます。'
        : demo() ? 'デモ版のため、会話は保存されません。' : '会話は答えのたびに自動で保存されます（最新20件）。') + '</p>' +
      (sources.length ? '<details class="adv-srcs" style="margin-top:10px"><summary>アドバイザーに渡している数字（' + sources.length + '種類のうち' + okN + '種類）</summary><ul>' +
        sources.map(function (s) {
          return '<li>' + (s.ok ? '<span class="adv-tag">あり</span> ' : '<span class="adv-tag adv-tag--no">まだ</span> ') + esc(s.label) + (s.ok ? '' : '（' + esc(s.note) + '）') + '</li>';
        }).join('') + '</ul><p class="adv-small">お客様の名前・メール・電話・問い合わせの本文は渡していません。問い合わせはジャンル別の件数、予約は件数、会員は人数だけです。</p></details>' : '');

    var log = el('adv-log');
    if (empty) {
      log.innerHTML = '<div class="adv-m"><div class="adv-who">ADVISOR</div><div class="adv-text">' +
        esc('このサイトの数字を見ています。上の「聞くとよいこと」を押すか、下に打ち込んでください。\n\n答えの下に出るボタンは、押すまで何もしません。') + '</div></div>';
    } else {
      S.messages.forEach(function (m, i) { log.appendChild(msgNode(m, i, i === S.messages.length - 1)); });
    }
    log.scrollTop = log.scrollHeight;

    var c = el('adv-continue');
    if (c) c.addEventListener('click', function () { openConv(last.id); });
    body.querySelectorAll('[data-start]').forEach(function (b) {
      b.addEventListener('click', function () { ask(st.starters[Number(b.getAttribute('data-start'))].q); });
    });
    el('adv-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = el('adv-input').value;
      el('adv-input').value = '';
      ask(v);
    });
    el('adv-stop').addEventListener('click', function () {
      if (S.controller) { try { S.controller.abort(); } catch (_) {} }
    });
    el('adv-new').addEventListener('click', function () {
      if (S.busy) return;
      S.messages = []; S.convId = '';
      saveLocal();
      renderChat();
      el('adv-input').focus();
    });
    syncBusy();
  }

  function syncBusy() {
    if (!el('adv-send')) return;
    el('adv-send').disabled = S.busy;
    el('adv-new').disabled = S.busy;
    el('adv-stop').style.display = S.busy ? 'inline-block' : 'none';
  }

  function previewOf(a) {
    var i = a.input || {};
    if (a.kind === 'news') return '題名: ' + i.title + (i.body ? '\n本文: ' + i.body : '');
    if (a.kind === 'copy') return (window.lumCopyLabel ? window.lumCopyLabel(i.path) : i.path) + '\n' + i.text;
    if (a.kind === 'sns') return i.text;
    if (a.kind === 'experiment') return '対象: ' + (i.label || i.key) + '\n比べる案（B）: ' + i.b;
    if (a.kind === 'pdca') return '仮説: ' + i.title + '\n' + i.hypothesis + '\n確かめる指標: ' + (METRIC_LABEL[i.metric] || i.metric) +
      ((i.next_actions || []).length ? '\n次にやること: ' + i.next_actions.join(' ／ ') : '');
    if (a.kind === 'todo') return i.title + (i.detail ? '\n' + i.detail : '') + (i.tab ? '\n（' + (TAB_LABEL[i.tab] || i.tab) + '）' : '');
    return '';
  }

  function actNode(a, mi, ai) {
    var d = document.createElement('div');
    d.className = 'adv-act';
    d.innerHTML = '<h4>' + esc(KIND_LABEL[a.kind] || a.kind) + (a.input && a.input.why ? '：' + esc(a.input.why) : '') + '</h4>' +
      '<div class="adv-pre">' + esc(previewOf(a)) + '</div>' +
      '<p class="adv-does">押すと: ' + esc(a.does) + '</p>' +
      '<button type="button" data-act="' + mi + ':' + ai + '">' + esc(a.button) + '</button>' +
      '<p class="adv-res" role="status"></p>';
    d.querySelector('button').addEventListener('click', function () { runAction(a, d); });
    return d;
  }

  function msgNode(m, i, isLast) {
    var wrap = document.createElement('div');
    wrap.className = 'adv-m ' + (m.role === 'user' ? 'adv-user' : 'adv-ai');
    wrap.innerHTML = '<div class="adv-who">' + (m.role === 'user' ? 'あなた' : 'ADVISOR') + '</div><div class="adv-text"></div>';
    wrap.querySelector('.adv-text').textContent = m.role === 'user' ? m.content : plain(m.content);
    if (m.role === 'assistant') fillAssistant(wrap, m, i, isLast);
    return wrap;
  }

  /* 答えの下に付けるもの: ボタン・使った数字・この回答の額・コピー・次の質問。 */
  function fillAssistant(wrap, m, i, isLast) {
    var old = wrap.querySelectorAll('.adv-acts, .adv-src, .adv-tools, .adv-next');
    Array.prototype.forEach.call(old, function (n) { n.parentNode.removeChild(n); });
    if ((m.actions || []).length) {
      var acts = document.createElement('div');
      acts.className = 'adv-acts';
      m.actions.forEach(function (a, ai) { acts.appendChild(actNode(a, i, ai)); });
      wrap.appendChild(acts);
    }
    var src = m.sources && m.sources.length ? m.sources : tailList(m.content, 'SOURCES');
    if (src.length || m.done) {
      var s = document.createElement('div');
      s.className = 'adv-src';
      s.innerHTML = src.length
        ? '<span>この答えで使った数字:</span>' + src.map(function (x) { return '<span class="adv-tag">' + esc(x) + '</span>'; }).join('')
        : '<span>この答えは、サイトの数字を使っていません（一般的な話です）。</span>';
      wrap.appendChild(s);
    }
    if (m.content) {
      var tools = document.createElement('div');
      tools.className = 'adv-tools';
      tools.innerHTML = '<button type="button" class="ghost">この回答をコピー</button>' +
        (m.yen != null ? '<span class="adv-small" style="margin:0">この回答の額: ' + (m.yen < 1 ? '1円未満' : yen(m.yen)) + '</span>' : '');
      var cb = tools.querySelector('button');
      cb.addEventListener('click', function () {
        try {
          navigator.clipboard.writeText(plain(m.content));
          cb.textContent = 'コピーしました';
          setTimeout(function () { cb.textContent = 'この回答をコピー'; }, 1600);
        } catch (_) { say('コピーできませんでした。文章を選んでコピーしてください。'); }
      });
      wrap.appendChild(tools);
    }
    /* 続きの質問ボタン。古い答えのボタンは出しません——下に新しい会話が
       続いているのに上のボタンがまだ押せると、どこの続きか分からなくなります。 */
    var next = isLast ? tailList(m.content, 'NEXT') : [];
    if (next.length) {
      var n = document.createElement('div');
      n.className = 'adv-next';
      n.innerHTML = '<span class="adv-small" style="margin:0">次に聞く:</span>' + next.map(function (q) {
        return '<button type="button" class="ghost">' + esc(q) + '</button>';
      }).join('');
      n.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { ask(b.textContent); }); });
      wrap.appendChild(n);
    }
  }

  function saveLocal() {
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify({ id: S.convId, messages: S.messages.slice(-40) })); } catch (_) {}
  }

  async function ask(text) {
    text = String(text || '').trim();
    if (S.busy || !text) return;
    if (S.view !== 'chat') go('chat');
    S.busy = true;
    say('');
    S.messages.push({ role: 'user', content: text });
    var me = { role: 'assistant', content: '', actions: [], sources: [] };
    S.messages.push(me);
    renderChat();
    var log = el('adv-log');
    var wrap = log.lastChild;
    var textEl = wrap.querySelector('.adv-text');
    textEl.textContent = '数字を集めて、考えています…';
    syncBusy();

    var history = S.messages.slice(0, -1).map(function (m) {
      return { role: m.role, content: m.content, actions: m.actions, sources: m.sources };
    });
    var res;
    S.controller = new AbortController();
    try {
      res = await fetch('/api/advisor', {
        method: 'POST',
        signal: S.controller.signal,
        headers: { Authorization: 'Bearer ' + window.lumAdmin.key(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, mode: S.mode, convId: S.convId || undefined })
      });
    } catch (_) {
      return fail('通信に失敗しました。ネットの接続を確かめて、もう一度お試しください。');
    }
    if (!res.ok) {
      var err = {};
      try { err = await res.json(); } catch (_) {}
      if (res.status === 401) window.lumAdmin.signOut(err.message || '管理キーが無効になりました。');
      return fail(err.message || ('エラー (HTTP ' + res.status + ')'));
    }

    var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
    var acts = null;
    while (true) {
      var chunk;
      try { chunk = await reader.read(); } catch (_) { break; } // 止めた
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      var parts = buf.split('\n\n');
      buf = parts.pop();
      for (var i = 0; i < parts.length; i++) {
        var line = parts[i].trim();
        if (line.indexOf('data: ') !== 0) continue;
        var ev;
        try { ev = JSON.parse(line.slice(6)); } catch (_) { continue; }
        if (ev.t) {
          me.content += ev.t;
          textEl.textContent = plain(me.content) || '考えています…';
          log.scrollTop = log.scrollHeight;
        }
        if (ev.action) {
          me.actions.push(ev.action);
          if (!acts) { acts = document.createElement('div'); acts.className = 'adv-acts'; wrap.appendChild(acts); }
          acts.appendChild(actNode(ev.action, S.messages.length - 1, me.actions.length - 1));
          log.scrollTop = log.scrollHeight;
        }
        if (ev.note) say(ev.note, true);
        if (ev.saved) {
          S.convId = ev.saved.id;
          upsertConv(ev.saved);
        }
        if (ev.demo) say('デモ版のため、会話は保存されません。', true);
        if (ev.done) {
          me.yen = ev.yen;
          if (S.state && S.state.usage) S.state.usage.yen += Number(ev.yen) || 0;
        }
        if (ev.error) me.content += '\n\n（エラー: ' + ev.error + '）';
      }
    }
    me.sources = tailList(me.content, 'SOURCES');
    me.done = true;
    if (!me.content) me.content = '（答えを止めました）';
    finish();
    textEl.textContent = plain(me.content);
    fillAssistant(wrap, me, S.messages.length - 1, true);
    log.scrollTop = log.scrollHeight;
    if (S.state && S.state.usage) { S.state.usage.calls = (S.state.usage.calls || 0) + 1; renderBar(); }
  }

  function fail(msg) {
    var me = S.messages[S.messages.length - 1];
    if (me && me.role === 'assistant' && !me.content) S.messages.pop();
    finish();
    renderChat();
    say(msg);
  }

  function finish() {
    S.busy = false;
    S.controller = null;
    saveLocal();
    syncBusy();
    counts();
  }

  function upsertConv(meta) {
    if (!S.state) return;
    var list = (S.state.conversations || []).filter(function (c) { return c.id !== meta.id; });
    list.unshift(meta);
    S.state.conversations = list.slice(0, S.state.convMax || 20);
    counts();
  }

  /* ---- 「実行」ボタン ---- */
  function result(card, text, ok, extra) {
    var r = card.querySelector('.adv-res');
    r.className = 'adv-res ' + (ok ? 'ok' : 'ng');
    r.textContent = text;
    if (extra) r.appendChild(extra);
  }
  function openButton(tab, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ghost';
    b.style.marginLeft = '6px';
    b.textContent = label || ((TAB_LABEL[tab] || '画面') + 'を開く');
    b.addEventListener('click', function () { show(tab); });
    return b;
  }
  function show(tab) {
    if (!window.lumShowTab) return false;
    var ok = window.lumShowTab(tab);
    if (ok !== false) window.scrollTo(0, 0);
    return ok !== false;
  }
  function setVal(node, v) {
    node.value = v;
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function place(node) {
    try { node.focus({ preventScroll: true }); } catch (_) { node.focus(); }
    node.scrollIntoView({ block: 'center' });
  }
  function replaceOk(node, label) {
    return !node.value.trim() || confirm(label + 'には、書きかけの文があります。アドバイザーの案に置き換えますか？');
  }

  async function runAction(a, card) {
    var btn = card.querySelector('button');
    var i = a.input || {};
    btn.disabled = true;
    try {
      if (a.kind === 'todo' || a.kind === 'experiment') {
        var r = await post({ action: a.kind === 'todo' ? 'todo.add' : 'proposal.add', input: i });
        var d = r.data || {};
        if (!d.ok) { result(card, d.message || '入れられませんでした。', false); btn.disabled = false; return; }
        if (a.kind === 'todo') {
          if (S.state) S.state.todos = d.todos || S.state.todos;
          counts();
          result(card, d.message || 'ToDo に入れました。', true, openButtonView('todo', 'ToDoを見る'));
        } else {
          result(card, d.message || '自動改善の提案に入れました。', true, openButton('auto-admin', '自動改善を開く'));
        }
        return;
      }
      if (a.kind === 'news') {
        if (!show('news-admin')) { btn.disabled = false; return; }
        var t = await waitFor(function () { return el('news-title'); }, 4000);
        if (!t) { result(card, 'お知らせ投稿の画面が開けませんでした。', false); btn.disabled = false; return; }
        if (!replaceOk(t, 'お知らせの題名')) { btn.disabled = false; return; }
        setVal(t, i.title);
        setVal(el('news-body'), i.body || '');
        place(t);
        say('');
        result(card, 'お知らせ投稿の入力欄に入れました。まだ公開していません。', true);
      } else if (a.kind === 'sns') {
        if (!show('social-admin')) { btn.disabled = false; return; }
        var ta = await waitFor(function () { return el('social-text'); }, 5000);
        if (!ta) { result(card, 'SNS（文章）の画面が開けませんでした。', false); btn.disabled = false; return; }
        if (!replaceOk(ta, 'SNSの入力欄')) { btn.disabled = false; return; }
        setVal(ta, i.text);
        place(ta);
        result(card, 'SNS（文章）の入力欄に入れました。まだ投稿していません。', true);
      } else if (a.kind === 'copy') {
        if (!show('copy-admin')) { btn.disabled = false; return; }
        // 文章の一覧が読み込まれるのを待ち、その項目だけに絞ってから入れます。
        var search = await waitFor(function () { return el('copy-fields') && el('copy-fields').querySelector('textarea') && el('copy-search'); }, 9000);
        if (!search) { result(card, '文章編集の一覧を読み込めませんでした。文章は上の枠からコピーしてください。', false); btn.disabled = false; return; }
        setVal(search, i.path);
        var box = await waitFor(function () {
          var lab = el('copy-fields').querySelector('span[title="' + i.path.replace(/"/g, '') + '"]');
          var w = lab && lab.parentNode && lab.parentNode.parentNode;
          return w && w.querySelector('textarea');
        }, 3000);
        if (!box) { result(card, 'その項目が見つかりませんでした。文章は上の枠からコピーしてください。', false); btn.disabled = false; return; }
        setVal(box, i.text);
        place(box);
        result(card, '文章編集でこの項目を開いて、案を入れました。まだ保存していません（「変更を保存」で保存します）。', true);
      } else if (a.kind === 'pdca') {
        if (!show('video-admin')) { btn.disabled = false; return; }
        var sec = await waitFor(function () { return document.querySelector('#video-admin [data-sec="pdca"]'); }, 6000);
        if (!sec) { result(card, 'SNS（動画）の画面が開けませんでした。', false); btn.disabled = false; return; }
        sec.click();
        // プロジェクトが選ばれていないと「仮説を立てる」が出ません（その旨の文が出ます）。
        var nb = await waitFor(function () {
          if (el('vd-new')) return el('vd-new');
          var vb = el('vid-body');
          return vb && /まずプロジェクトを作るか選んで|保存先（Upstash Redis）が未接続/.test(vb.textContent) ? 'none' : null;
        }, 6000);
        if (!nb || nb === 'none') { result(card, 'SNS（動画）で、先にプロジェクトを選んでください。そのあと、もう一度このボタンを押してください。', false); btn.disabled = false; return; }
        nb.click();
        var title = await waitFor(function () { return el('vd-title'); }, 3000);
        if (!title) { result(card, 'PDCAの入力欄が開けませんでした。', false); btn.disabled = false; return; }
        setVal(title, i.title);
        setVal(el('vd-hypo'), i.hypothesis || '');
        if (el('vd-metric') && i.metric) setVal(el('vd-metric'), i.metric);
        setVal(el('vd-next'), (i.next_actions || []).join('\n'));
        place(title);
        result(card, 'SNS（動画）の PDCA に入れました。まだ保存していません（「保存」で残ります）。', true);
      }
      btn.disabled = false;
      btn.textContent = 'もう一度入れる';
    } catch (e) {
      result(card, '入れられませんでした: ' + String((e && e.message) || e).slice(0, 120), false);
      btn.disabled = false;
    }
  }
  function openButtonView(view, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ghost';
    b.style.marginLeft = '6px';
    b.textContent = label;
    b.addEventListener('click', function () { go(view); });
    return b;
  }

  /* ---- 保存した相談 ---- */
  function renderSaved() {
    var st = S.state || {};
    var body = el('adv-body');
    if (st.stored === false) {
      body.innerHTML = '<div class="bk-warn"><p>保存先（Upstash Redis）が無いため、会話を残せません。「設定状況 › キーの入力」で保存先を入れると、ここに最新20件が残ります。</p></div>';
      return;
    }
    var list = st.conversations || [];
    body.innerHTML = '<p class="adv-small" style="margin:0 0 10px">最新' + (st.convMax || 20) + '件まで残ります（それより古いものと、180日たったものは消えます）。</p>' +
      (list.length ? '<div class="adv-list">' + list.map(function (c, i) {
        return '<div class="adv-card"><h3>' + esc(c.title) + '</h3>' +
          '<p class="adv-small" style="margin:0">' + esc(when(c.updatedAt)) + '・やりとり ' + esc(c.count) + '件' + (c.id === S.convId ? '・いま開いている相談' : '') + '</p>' +
          '<div class="adv-row"><button type="button" data-open="' + i + '">開いて続ける</button><button type="button" class="ghost" data-del="' + i + '">消す</button></div></div>';
      }).join('') + '</div>' : '<p class="soc-small">まだ保存した相談はありません。「相談」で質問すると、答えのたびにここに残ります。</p>');
    body.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () { openConv(list[Number(b.getAttribute('data-open'))].id); });
    });
    body.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var c = list[Number(b.getAttribute('data-del'))];
        if (!confirm('「' + c.title + '」を消します。元に戻せません。よろしいですか？')) return;
        b.disabled = true;
        var r = await post({ action: 'conv.delete', id: c.id });
        var d = r.data || {};
        if (!d.ok) { say(d.message || '消せませんでした。'); b.disabled = false; return; }
        S.state.conversations = d.conversations || [];
        if (c.id === S.convId) { S.convId = ''; saveLocal(); }
        counts();
        renderSaved();
        say(d.message || '消しました。', true);
      });
    });
  }

  async function openConv(id) {
    if (S.busy) return;
    say('読み込んでいます…', true);
    var r = await api('/api/advisor-store?view=conv&id=' + encodeURIComponent(id));
    var d = r.data || {};
    if (!d.ok || !d.conv) { say(d.message || '読み込めませんでした。'); return; }
    S.convId = d.conv.id;
    S.messages = (d.conv.messages || []).map(function (m) { var x = Object.assign({}, m); if (x.role === 'assistant') x.done = true; return x; });
    saveLocal();
    go('chat');
    say('「' + d.conv.title + '」を開きました。続けて質問できます。', true);
  }

  /* ---- ToDo ---- */
  function renderTodos() {
    var st = S.state || {};
    var body = el('adv-body');
    if (st.stored === false) {
      body.innerHTML = '<div class="bk-warn"><p>保存先（Upstash Redis）が無いため、ToDo を残せません。「設定状況 › キーの入力」で保存先を入れると使えます。</p></div>';
      return;
    }
    var all = st.todos || [];
    var open = all.filter(function (t) { return !t.done; });
    var done = all.filter(function (t) { return t.done; });
    var row = function (t) {
      return '<div class="adv-card adv-todo' + (t.done ? ' done' : '') + '">' +
        '<input type="checkbox" data-done="' + esc(t.id) + '"' + (t.done ? ' checked' : '') + ' aria-label="済んだ">' +
        '<div><h3>' + esc(t.title) + '</h3>' + (t.detail ? '<p class="adv-small" style="white-space:pre-wrap">' + esc(t.detail) + '</p>' : '') +
        '<p class="adv-small">' + esc(when(t.at)) + ' に入れました' + (t.done && t.doneAt ? '・' + esc(when(t.doneAt)) + ' に済み' : '') + '</p>' +
        '<div class="adv-row">' + (t.tab && TAB_LABEL[t.tab] ? '<button type="button" class="ghost" data-tab="' + esc(t.tab) + '">' + esc(TAB_LABEL[t.tab]) + 'を開く</button>' : '') +
        '<button type="button" class="ghost" data-tdel="' + esc(t.id) + '">消す</button></div></div></div>';
    };
    body.innerHTML = '<p class="adv-small" style="margin:0 0 10px">アドバイザーの答えから「ToDoに入れる」を押したものです。まだのものは、ポータルの「今日やること」にも出ます。</p>' +
      (open.length ? '<div class="adv-list">' + open.map(row).join('') + '</div>' : '<p class="soc-small">まだのToDoはありません。</p>') +
      (done.length ? '<details style="margin-top:12px"><summary class="adv-small" style="cursor:pointer;font-weight:700">済んだもの（' + done.length + '）</summary><div class="adv-list" style="margin-top:8px">' + done.map(row).join('') + '</div></details>' : '');
    body.querySelectorAll('[data-done]').forEach(function (c) {
      c.addEventListener('change', async function () {
        c.disabled = true;
        var r = await post({ action: c.checked ? 'todo.done' : 'todo.undo', id: c.getAttribute('data-done') });
        var d = r.data || {};
        if (!d.ok) { say(d.message || '変えられませんでした。'); c.checked = !c.checked; c.disabled = false; return; }
        S.state.todos = d.todos || [];
        counts();
        renderTodos();
      });
    });
    body.querySelectorAll('[data-tdel]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('このToDoを消します。よろしいですか？')) return;
        b.disabled = true;
        var r = await post({ action: 'todo.delete', id: b.getAttribute('data-tdel') });
        var d = r.data || {};
        if (!d.ok) { say(d.message || '消せませんでした。'); b.disabled = false; return; }
        S.state.todos = d.todos || [];
        counts();
        renderTodos();
      });
    });
    body.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { show(b.getAttribute('data-tab')); });
    });
  }

  /* ---- 読み込み ---- */
  async function load() {
    S.loading = true;
    var r = await api('/api/advisor-store?view=state');
    S.loading = false;
    var d = r.data || {};
    if (!d.ok) {
      S.state = { stored: false, conversations: [], todos: [], starters: [], sources: [], usage: { cap: 0 }, estimate: {} };
      say(d.message || '数字を読み込めませんでした。相談はできます。');
    } else {
      S.state = d;
    }
    renderBar();
    counts();
  }

  window.lumAdvisorInit = async function () {
    if (S.started) return;
    S.started = true;
    shell();
    try { S.mode = sessionStorage.getItem(MODE_KEY) === 'quick' ? 'quick' : 'deep'; } catch (_) {}
    // 読み込み直しても、開いていた相談は残します。
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(CHAT_KEY) || 'null'); } catch (_) {}
    if (Array.isArray(saved)) saved = { id: '', messages: saved }; // 以前の形
    if (saved && Array.isArray(saved.messages)) {
      S.convId = saved.id || '';
      S.messages = saved.messages.filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'; })
        .map(function (m) { if (m.role === 'assistant') m.done = true; return m; });
    }
    go('chat');
    await load();
    if (S.view === 'chat' && !S.busy) renderChat();
    else go(S.view);
  };
})();
