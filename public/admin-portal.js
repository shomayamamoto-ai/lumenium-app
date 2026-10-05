/* ---- 管理ポータル：今日やること ----
   ログインして最初に見る画面の、いちばん上。「いま何をすればいいか」を、
   各タブを開いて回らなくても分かるようにするためのものです。

   新しい API は作っていません。各タブがふだん読んでいるものを同時に読み、
   ここで並べ直すだけです（問い合わせ・予約・SNS・会員・お知らせ・設定状況・
   サイトの更新・アクセス解析）。どれか1つが読めなくても、残りはそのまま
   出します。読めなかったものは「読めなかった」と書きます。黙って 0 件に
   見せると、本当に何もないのか、確かめられていないのかが区別できません。

   並べ方は急ぎの順です。
     至急   … お客様を待たせている・何かが止まっている
     要対応 … 今日のうちに手を動かすもの
     予定   … 今日・明日の予定（予約・予約投稿）
     今週の様子 … 知っておくとよいこと（やることには数えません）

   計算の部分（lumPortalCore）は画面に触りません。scripts/test-portal.mjs が
   Node で直接読んで確かめます。自動で読み直すことも、動きのある表示も
   しません（オーナーは画面が動くのを好みません）。「再読込」で読み直します。 */
(function (root) {
  'use strict';

  var H = 3600000, DAY = 86400000, JST = 9 * H;
  var LEVELS = { urgent: 0, action: 1, today: 2, fyi: 3 };
  var LEVEL_LABEL = { urgent: '至急', action: '要対応', today: '予定', fyi: 'お知らせ' };

  /* ---------------- 計算（画面に触らない） ---------------- */

  function jstDay(ms) { return new Date(ms + JST).toISOString().slice(0, 10); }
  function dayStart(ms) {
    var d = new Date(ms + JST);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - JST;
  }
  function hm(ms) {
    var d = new Date(ms + JST);
    return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
  }
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : 0; }
  function ok(s) { return !!(s && s.state === 'ok' && s.data); }

  /* 1つの返事を「読めた・未設定・読めなかった」に分けます。未設定は
     その機能を使っていないだけかもしれないので、失敗とは書き分けます。 */
  function classify(status, data) {
    if (!status) return { state: 'fail', data: null };
    var d = data && typeof data === 'object' ? data : null;
    var code = d && d.code ? String(d.code) : '';
    if (status === 503 || /NOT_CONFIGURED/.test(code) || (d && d.stored === false)) return { state: 'off', data: d };
    if (status >= 200 && status < 300 && d && d.ok !== false) return { state: 'ok', data: d };
    return { state: 'fail', data: d };
  }

  /* 予約の始まりと終わり。古い記録には start/end が無いので、予約管理の
     画面（admin-booking.js の span）と同じ補い方をします。 */
  function bkSpan(b) {
    var s = Number(b.start) || Date.parse(b.key);
    var e = Number(b.end) || s + ((b.service && b.service.minutes) || 60) * 60000;
    return { start: s, end: e };
  }
  function bkStatus(b) { return b.status || (b.mode === 'google' ? 'confirmed' : 'tentative'); }

  function inquiryRows(s) {
    if (!ok(s)) return [];
    var d = s.data, m = d.metrics || {}, c = m.counts || {}, items = d.items || [];
    var promised = num(d.promised) || num(m.promised) || 48;
    var out = [];
    var late = items.filter(function (x) { return x.overdue === 'late' && !x.spam; })
      .sort(function (a, b) { return Date.parse(a.receivedAt) - Date.parse(b.receivedAt); });
    if (num(m.late) > 0) {
      out.push({ id: 'inq-late', level: 'urgent', tab: 'inquiries-admin', count: m.late, unit: '件',
        title: '返信の期限（' + promised + '時間）を過ぎた問い合わせ',
        why: 'サイトで「' + promised + '時間以内に返信」とお約束しています。古いものから先に返信してください。',
        go: late[0] ? { label: 'いちばん古いものを開く', inq: late[0].id } : { label: '受信箱を開く', inq: '' } });
    }
    var unread = num(c.unread);
    if (unread > 0) {
      var first = items.filter(function (x) { return !x.readAt && !x.spam && (x.status || 'new') === 'new'; });
      var warn = num(m.warn);
      out.push({ id: 'inq-unread', level: 'action', tab: 'inquiries-admin', count: unread, unit: '件',
        title: 'まだ読んでいない問い合わせ',
        why: warn ? 'うち' + warn + '件は、届いてから24時間を過ぎています。' : '中身を確かめて、返信するか「対応中」にしてください。',
        go: unread === 1 && first[0] ? { label: '開く', inq: first[0].id } : { label: '受信箱を開く', inq: '' } });
    }
    return out;
  }

  function bookingRows(s, now) {
    if (!ok(s)) return [];
    var list = (s.data.bookings || []).slice().sort(function (a, b) { return bkSpan(a).start - bkSpan(b).start; });
    var t0 = dayStart(now), out = [];
    var live = function (b) { var st = bkStatus(b); return st === 'confirmed' || st === 'tentative' || st === 'visited'; };
    var on = function (from) {
      return list.filter(function (b) { var st = bkSpan(b).start; return st >= from && st < from + DAY && live(b); });
    };
    var today = on(t0), tomorrow = on(t0 + DAY);
    if (today.length) {
      var next = today.filter(function (b) { return bkSpan(b).end >= now && bkStatus(b) !== 'visited'; })[0];
      out.push({ id: 'bk-today', level: 'today', tab: 'booking-admin', count: today.length, unit: '件',
        title: '今日の予約',
        why: next ? '次は ' + hm(bkSpan(next).start) + '〜' + (next.service && next.service.name ? '（' + next.service.name + '）' : '') + 'です。'
          : '今日の予約はすべて時間が過ぎました。来店の記録をつけておくと、あとで数えられます。',
        go: { label: '予約を見る', sec: 'list' } });
    }
    if (tomorrow.length) {
      out.push({ id: 'bk-tomorrow', level: 'today', tab: 'booking-admin', count: tomorrow.length, unit: '件',
        title: '明日の予約',
        why: '最初は ' + hm(bkSpan(tomorrow[0]).start) + '〜です。準備が要るものを確かめておきましょう。',
        go: { label: '予約を見る', sec: 'list' } });
    }
    var tent = list.filter(function (b) { return bkStatus(b) === 'tentative' && bkSpan(b).end >= now; });
    if (tent.length) {
      out.push({ id: 'bk-tentative', level: 'action', tab: 'booking-admin', count: tent.length, unit: '件',
        title: 'まだ確定していない仮予約',
        why: '内容を確かめて「確定にする」を押すと、お客様に確定のメールが届きます。',
        go: { label: '仮予約を見る', sec: 'list' } });
    }
    return out;
  }

  function socialRows(s, now) {
    if (!ok(s)) return [];
    var d = s.data, out = [], since = now - 7 * DAY, failed = 0, unknown = 0;
    (d.recent || []).forEach(function (p) {
      if (!(Date.parse(p.at) >= since)) return;
      (p.results || []).forEach(function (r) {
        if (r.ok) return;
        if (r.unknown) unknown++; else failed++;
      });
    });
    if (failed) {
      out.push({ id: 'sns-failed', level: 'urgent', tab: 'social-admin', count: failed, unit: '件',
        title: '送れなかったSNS投稿（ここ7日）',
        why: '相手のサービスが受け付けませんでした。理由を確かめて、必要なら送り直してください。',
        go: { label: 'SNSの記録を見る' } });
    }
    if (unknown) {
      out.push({ id: 'sns-unknown', level: 'action', tab: 'social-admin', count: unknown, unit: '件',
        title: '届いたか分からないSNS投稿（ここ7日）',
        why: '途中で通信が切れ、結果を受け取れませんでした。二重に出さないよう、先にSNSの画面で確かめてください。',
        go: { label: 'SNSの記録を見る' } });
    }
    var sch = d.schedule || {}, today = jstDay(now);
    var items = (sch.items || []).filter(function (i) { return i.date === today; });
    if (items.length) {
      var hour = num(sch.jstHour) || 9;
      var nowH = new Date(now + JST).getUTCHours();
      if (sch.ready === false) {
        out.push({ id: 'sns-today', level: 'urgent', tab: 'social-admin', count: items.length, unit: '件',
          title: '今日の予約投稿が送られない状態です',
          why: sch.message || '予約投稿を送る仕組みが止まっています。',
          go: { label: '予約投稿を見る' } });
      } else {
        out.push({ id: 'sns-today', level: nowH > hour ? 'action' : 'today', tab: 'social-admin', count: items.length, unit: '件',
          title: '今日の予約投稿',
          why: nowH > hour ? '今朝' + hour + '時に送られるはずの分が、まだ残っています。記録を確かめてください。'
            : '今朝' + hour + '時ごろに自動で送られます。',
          go: { label: '予約投稿を見る' } });
      }
    }
    var ap = (d.approvals || []).filter(function (a) { return !a.expired; });
    var approved = ap.filter(function (a) { return a.status === 'approved' && !a.scheduledId; });
    var returned = ap.filter(function (a) { return a.status === 'returned'; });
    var pending = ap.filter(function (a) { return a.status === 'pending'; });
    if (approved.length) {
      out.push({ id: 'sns-approved', level: 'action', tab: 'social-admin', count: approved.length, unit: '件',
        title: '承認されたのに、まだ出していない投稿',
        why: '確認がすみました。「今すぐ送る」か「予約」で出せます。',
        go: { label: '承認の一覧を見る' } });
    }
    if (returned.length) {
      out.push({ id: 'sns-returned', level: 'action', tab: 'social-admin', count: returned.length, unit: '件',
        title: '差し戻された投稿',
        why: '直してほしい点が書かれています。直して、もう一度確認を頼んでください。',
        go: { label: '承認の一覧を見る' } });
    }
    if (pending.length) {
      out.push({ id: 'sns-pending', level: 'fyi', tab: 'social-admin', count: pending.length, unit: '件',
        title: '承認待ちの投稿',
        why: '確認をお願いした相手の返事を待っています。',
        go: { label: '承認の一覧を見る' } });
    }
    return out;
  }

  function memberRows(s, now) {
    if (!ok(s)) return [];
    var week = (s.data.members || []).filter(function (m) { return Date.parse(m.created) >= now - 7 * DAY; });
    if (!week.length) return [];
    return [{ id: 'mem-new', level: 'fyi', tab: 'list-view', count: week.length, unit: '人',
      title: '今週登録した会員',
      why: 'ここ7日で新しく登録した人です。',
      go: { label: '会員リストを見る' } }];
  }

  function newsRows(s, now) {
    if (!s || s.state !== 'ok') return [];
    var list = Array.isArray(s.data) ? s.data : (s.data && s.data.items) || [];
    var dates = list.map(function (n) { return String((n && n.date) || ''); }).filter(function (x) { return /^\d{4}-\d{2}-\d{2}/.test(x); }).sort();
    if (!dates.length) {
      return [{ id: 'news-stale', level: 'action', tab: 'news-admin', count: 0, unit: '',
        title: 'お知らせがまだ1件もありません',
        why: '動きのあるサイトは、営業していることが伝わります。短い近況でも1本出しましょう。',
        go: { label: 'お知らせを書く' } }];
    }
    var last = dates[dates.length - 1].slice(0, 10);
    var days = Math.floor((Date.parse(jstDay(now)) - Date.parse(last)) / DAY);
    if (!(days >= 30)) return [];
    return [{ id: 'news-stale', level: 'action', tab: 'news-admin', count: days, unit: '日',
      title: 'お知らせを30日以上出していません',
      why: '最後は ' + last + ' です。更新が止まったサイトは「営業しているのかな」と思われがちです。',
      go: { label: 'お知らせを書く' } }];
  }

  function healthRows(s) {
    if (!ok(s)) return [];
    var bad = (s.data.checks || []).filter(function (c) { return c.state === 'error'; });
    if (!bad.length) return [];
    return [{ id: 'health-error', level: 'urgent', tab: 'health-admin', count: bad.length, unit: '件',
      title: '止まっている機能があります',
      why: bad.slice(0, 3).map(function (c) { return c.label; }).join('・') + (bad.length > 3 ? ' ほか' : '') + 'が動いていません。',
      go: { label: '設定状況を見る' } }];
  }

  function deployRows(s) {
    if (!ok(s) || s.data.state !== 'failed') return [];
    var url = /^https:\/\//.test(s.data.url || '') ? s.data.url : '';
    return [{ id: 'deploy-failed', level: 'urgent', tab: 'health-admin', count: 1, unit: '',
      title: 'サイトの更新（ビルド）が失敗しています',
      why: '保存したお知らせや文章が、まだサイトに出ていません。サイトの制作担当に連絡してください。',
      go: url ? { label: '詳しい状況を開く', href: url } : { label: '設定状況を見る' } }];
  }

  function analyticsRows(s) {
    if (!ok(s) || !s.data.summary || !s.data.summary.cur) return [];
    var cur = s.data.summary.cur, prev = s.data.summary.prev || null;
    var v = num(cur.visits) || num(cur.views);
    var key = num(cur.visits) ? 'visits' : 'views';
    var why = '';
    if (prev && num(prev[key])) {
      var diff = v - num(prev[key]);
      why = 'その前の7日より' + (diff === 0 ? '変わらず' : Math.abs(diff) + '回' + (diff > 0 ? '多い' : '少ない')) + '。';
    }
    if (num(cur.submits)) why += '問い合わせの送信は' + cur.submits + '件でした。';
    return [{ id: 'analytics-week', level: 'fyi', tab: 'stats-admin', count: v, unit: '回',
      title: 'ここ7日の訪問', why: why || 'ここ7日にサイトを訪れた回数です。',
      go: { label: 'アクセス解析を見る' } }];
  }

  var SOURCE_NAMES = {
    inquiries: '問い合わせ', booking: '予約', social: 'SNS', members: '会員', news: 'お知らせ',
    health: '設定状況', deploy: 'サイトの更新状況', analytics: 'アクセス解析'
  };

  /* src: { inquiries: {state, data}, booking: …, … }（無いものは読めなかった扱い）
     → { rows, todo, fyi, off: [名前], failed: [名前] } */
  function buildToday(src, now) {
    src = src || {};
    now = now || Date.now();
    var rows = [].concat(
      healthRows(src.health), deployRows(src.deploy), inquiryRows(src.inquiries),
      bookingRows(src.booking, now), socialRows(src.social, now), newsRows(src.news, now),
      memberRows(src.members, now), analyticsRows(src.analytics)
    );
    rows = rows.map(function (r, i) { r.order = i; return r; }).sort(function (a, b) {
      return (LEVELS[a.level] - LEVELS[b.level]) || (a.order - b.order);
    });
    var off = [], failed = [];
    Object.keys(SOURCE_NAMES).forEach(function (k) {
      var s = src[k];
      if (s && s.state === 'off') off.push(SOURCE_NAMES[k]);
      else if (!s || s.state !== 'ok') failed.push(SOURCE_NAMES[k]);
    });
    return {
      rows: rows,
      todo: rows.filter(function (r) { return r.level !== 'fyi'; }),
      fyi: rows.filter(function (r) { return r.level === 'fyi'; }),
      off: off, failed: failed
    };
  }

  root.lumPortalCore = {
    classify: classify, buildToday: buildToday, jstDay: jstDay, dayStart: dayStart,
    LEVEL_LABEL: LEVEL_LABEL, SOURCE_NAMES: SOURCE_NAMES
  };

  /* ---------------- 画面 ---------------- */

  if (typeof document === 'undefined') return;

  var el = function (id) { return document.getElementById(id); };
  var P = { data: null, at: 0, loading: false };

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var CSS =
    '.lp-box{background:#fff;border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:14px}' +
    '.lp-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}' +
    '.lp-head h2{font-size:16px;font-weight:800;margin-right:auto}' +
    '.lp-when{font-size:12px;color:var(--sub)}' +
    '.lp-head button{padding:7px 13px;font-size:12px;border-radius:999px}' +
    '.lp-rows{list-style:none;margin:0;padding:0;display:grid;gap:8px}' +
    '.lp-row{display:grid;grid-template-columns:76px minmax(0,1fr) auto;gap:12px;align-items:center;' +
      'border:1px solid var(--border);border-left:4px solid var(--sub);border-radius:10px;padding:10px 12px;background:#fff}' +
    '.lp-row.urgent{border-left-color:#b42318;background:#fff8f7}' +
    '.lp-row.action{border-left-color:#b45309;background:#fffdf7}' +
    '.lp-row.today{border-left-color:#3d3fbf}' +
    '.lp-row.fyi{border-left-color:var(--border);background:#faf9f6}' +
    '.lp-n{font-size:24px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums}' +
    '.lp-n small{font-size:12px;font-weight:700;margin-left:2px;color:var(--sub)}' +
    '.lp-lv{display:block;font-size:10.5px;font-weight:800;letter-spacing:.04em;color:var(--sub);margin-bottom:2px}' +
    '.lp-row.urgent .lp-lv{color:#b42318}.lp-row.action .lp-lv{color:#b45309}.lp-row.today .lp-lv{color:#3d3fbf}' +
    '.lp-what b{display:block;font-size:14px;line-height:1.5}' +
    '.lp-what span{display:block;font-size:12.5px;color:var(--sub);line-height:1.7}' +
    '.lp-row button,.lp-row a.lp-go{padding:9px 14px;font-size:12.5px;white-space:nowrap}' +
    '.lp-row a.lp-go{display:inline-block;border-radius:10px;background:var(--grad);color:#fff;font-weight:700;text-decoration:none}' +
    '.lp-empty{font-size:14px;font-weight:700;padding:14px 12px;border:1px dashed var(--border);border-radius:10px;background:#faf9f6}' +
    '.lp-empty small{display:block;font-size:12px;font-weight:400;color:var(--sub);margin-top:2px}' +
    '.lp-sub{font-size:12.5px;font-weight:800;color:var(--sub);margin:14px 0 8px}' +
    '.lp-notes{font-size:12px;color:var(--sub);line-height:1.7;margin-top:10px}' +
    '.lp-notes p+p{margin-top:2px}' +
    '@media (max-width:560px){' +
      '.lp-box{padding:14px 12px}' +
      '.lp-row{grid-template-columns:58px minmax(0,1fr);gap:4px 10px;align-items:start}' +
      '.lp-row button,.lp-row a.lp-go{grid-column:1 / -1;width:100%;text-align:center;margin-top:6px}' +
      '.lp-n{font-size:20px}' +
    '}';

  function addCss() {
    if (el('lp-css')) return;
    var s = document.createElement('style');
    s.id = 'lp-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---- 読む ----
     どれも任意です。1つが遅くても全体を待たせすぎないよう、15秒で
     「読めなかった」として先に進みます。 */
  var SOURCES = [
    // 「すべて」の新しい順の1ページ目。期限切れは「対応中」のこともあるので、
    // 未対応だけに絞ると、開くべき1件が見つからないことがあります。
    ['inquiries', '/api/inquiries?status=all'],
    ['booking', '/api/booking?recent=all'],
    ['social', '/api/social'],
    ['members', '/api/members-list'],
    ['news', '/news.json', true],
    ['health', '/api/health'],
    ['settings', '/api/settings'],
    ['deploy', '/api/deploy-status?latest=1'],
    ['analytics', '/api/analytics?days=7']
  ];

  function within(p, ms) {
    return Promise.race([p, new Promise(function (ok) { setTimeout(function () { ok(null); }, ms); })]);
  }

  async function readOne(src) {
    try {
      if (src[2]) {
        var res = await fetch(src[1], { cache: 'no-store' });
        var list = res.ok ? await res.json().catch(function () { return null; }) : null;
        return list ? { state: 'ok', data: list } : { state: 'fail', data: null };
      }
      var r = await within(window.lumAdmin.fetch(src[1]), 15000);
      if (!r || !r.res) return { state: 'fail', data: null };
      return classify(r.res.status, r.data);
    } catch (_) {
      return { state: 'fail', data: null };
    }
  }

  async function load() {
    if (P.loading) return;
    P.loading = true;
    var btn = el('lp-reload');
    if (btn) { btn.disabled = true; btn.textContent = '読み込み中…'; }
    var got = await Promise.all(SOURCES.map(readOne));
    var src = {};
    SOURCES.forEach(function (s, i) { src[s[0]] = got[i]; });
    P.data = src;
    P.at = Date.now();
    P.loading = false;
    paint();
  }

  /* ---- 開く ---- */
  function open(row) {
    var g = row.go || {};
    if (g.href) { window.open(g.href, '_blank', 'noopener'); return; }
    if (g.inq != null && window.lumInqOpen) { window.lumInqOpen(g.inq); return; }
    if (g.sec && row.tab === 'booking-admin') {
      try { sessionStorage.setItem('lum_booking_sec', g.sec); } catch (_) {}
    }
    if (window.lumShowTab) window.lumShowTab(row.tab);
    window.scrollTo(0, 0);
  }

  function rowHtml(r, i) {
    var count = r.unit ? '<span class="lp-n">' + esc(r.count) + '<small>' + esc(r.unit) + '</small></span>' : '<span class="lp-n">!</span>';
    var btn = r.go && r.go.href
      ? '<a class="lp-go" href="' + esc(r.go.href) + '" target="_blank" rel="noopener">' + esc(r.go.label) + '</a>'
      : '<button type="button" data-lp="' + i + '">' + esc((r.go && r.go.label) || '開く') + '</button>';
    return '<li class="lp-row ' + r.level + '" data-id="' + esc(r.id) + '">' +
      '<div><span class="lp-lv">' + LEVEL_LABEL[r.level] + '</span>' + count + '</div>' +
      '<div class="lp-what"><b>' + esc(r.title) + '</b><span>' + esc(r.why) + '</span></div>' + btn + '</li>';
  }

  function stamp(ms) {
    var d = new Date(ms);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function paint() {
    var host = el('lp-today');
    if (!host) return;
    var head = '<div class="lp-head"><h2 id="lp-today-h">今日やること</h2>' +
      '<span class="lp-when" id="lp-when">' + (P.at ? '最終更新 ' + stamp(P.at) : '読み込み中…') + '</span>' +
      '<button type="button" class="ghost" id="lp-reload"' + (P.loading ? ' disabled' : '') + '>' + (P.loading ? '読み込み中…' : '再読込') + '</button></div>';
    if (!P.data) { host.innerHTML = head + '<p class="lp-notes">各機能の状態を読み込んでいます…</p>'; bindHead(); return; }
    var t = buildToday(P.data, Date.now());
    var all = t.todo.concat(t.fyi);
    var body = t.todo.length
      ? '<ol class="lp-rows" id="lp-todo">' + t.todo.map(function (r) { return rowHtml(r, all.indexOf(r)); }).join('') + '</ol>'
      : '<p class="lp-empty" id="lp-empty">今日やることはありません' +
        '<small>' + (t.failed.length ? 'ただし、読み込めなかったものがあります（下に書いています）。' : '急ぎのものも、今日の予定も見つかりませんでした。') + '</small></p>';
    if (t.fyi.length) {
      body += '<h3 class="lp-sub">今週の様子</h3><ol class="lp-rows" id="lp-fyi">' +
        t.fyi.map(function (r) { return rowHtml(r, all.indexOf(r)); }).join('') + '</ol>';
    }
    var notes = [];
    if (t.failed.length) notes.push('読み込めなかったもの: ' + t.failed.join('・') + '（通信の失敗か、まだ準備中です。「再読込」でもう一度読みます）');
    if (t.off.length) notes.push('未設定のため見ていないもの: ' + t.off.join('・'));
    if (notes.length) body += '<div class="lp-notes" id="lp-notes">' + notes.map(function (n) { return '<p>' + esc(n) + '</p>'; }).join('') + '</div>';
    host.innerHTML = head + body;
    bindHead();
    host.querySelectorAll('[data-lp]').forEach(function (b) {
      b.addEventListener('click', function () { open(all[Number(b.getAttribute('data-lp'))]); });
    });
    if (root.lumPortalAfterPaint) root.lumPortalAfterPaint(P.data);
  }

  function bindHead() {
    var b = el('lp-reload');
    if (b) b.addEventListener('click', load);
  }

  /* 管理画面の buildPortal() から一度だけ呼ばれます。 */
  root.lumPortalInit = function () {
    var portal = el('portal');
    if (!portal || el('lp-today')) return;
    addCss();
    var box = document.createElement('section');
    box.className = 'lp-box';
    box.id = 'lp-today';
    box.setAttribute('aria-labelledby', 'lp-today-h');
    portal.insertBefore(box, portal.firstChild);
    paint();
    load();
  };
  root.lumPortalData = function () { return P.data; };
  root.lumPortalReload = load;
})(typeof window !== 'undefined' ? window : globalThis);
