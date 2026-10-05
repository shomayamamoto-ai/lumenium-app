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

  /* ---------------- はじめての設定 ----------------
     設定状況（api/health.js）の行と、キーの入力（api/settings.js）の有無から、
     順番つきの手順にします。上から順にやれば、お客様に関わるもの
     （記録・メール・宛先・会員）が先に整います。

     state: done（済み）・todo（まだ）・skipped（「使わない」を選んだ）・
            unknown（読めなかったので分からない）
     任意の手順は「使わない」にでき、完了に数えます。予約を受けない
     お店が、Google 連携のせいでいつまでも 100% にならないのは不親切です。 */
  var STEPS = [
    { id: 'admin', title: '管理キーを長くする', where: 'Vercel の環境変数 ADMIN_KEY',
      why: 'この管理画面の鍵です。24文字以上にすると、総当たりで当てられる心配がなくなります。',
      go: { env: 'ADMIN_KEY' } },
    { id: 'store', title: '保存先（Upstash Redis）をつなぐ', test: 'store',
      why: '問い合わせ・予約・アクセスの記録をしまっておく場所です。無いと一覧が残りません。',
      go: { name: 'UPSTASH_REDIS_REST_URL', env: 'KV_REST_API_URL' } },
    { id: 'resend', title: 'メールを送れるようにする（Resend）', test: 'resend',
      why: '問い合わせフォームと会員登録のメールは、これで送ります。無いとフォームが動きません。',
      go: { name: 'RESEND_API_KEY', env: 'RESEND_API_KEY' } },
    { id: 'sender', title: '送信元を自社のドメインにする', test: 'resend', where: 'Resend の Domains と、Vercel の環境変数 CONTACT_FROM_EMAIL',
      why: 'Resend の試用アドレスのままだと、お客様あてのメール（予約の確認・自動返信）が届きません。',
      go: { env: 'CONTACT_FROM_EMAIL' } },
    { id: 'contactTo', title: '問い合わせの届け先を決める',
      why: '問い合わせの知らせが届くアドレスです。ふだん見ているアドレスにしてください。',
      go: { name: 'CONTACT_TO_EMAIL', env: 'CONTACT_TO_EMAIL' } },
    { id: 'member', title: '会員ページの鍵を決める（MEMBER_CODE・SESSION_SECRET）',
      why: '会員登録とログインを守る鍵です。無いと会員登録が動きません。',
      go: { name: 'MEMBER_CODE', env: 'MEMBER_CODE' } },
    { id: 'github', title: 'お知らせ・文章の保存先（GitHub）をつなぐ', test: 'github', optional: true,
      why: 'お知らせ投稿と文章編集で直したものを、サイトに反映するのに使います。',
      go: { name: 'GITHUB_TOKEN', env: 'GITHUB_TOKEN' } },
    { id: 'ai', title: 'AI のキーを入れる（Anthropic）', test: 'ai', optional: true,
      why: 'SEO / AIO 分析と AIアドバイザーに使います。使った分だけ料金がかかります。',
      go: { name: 'ANTHROPIC_API_KEY', env: 'ANTHROPIC_API_KEY' } },
    { id: 'google', title: 'Google カレンダーとつなぐ（予約）', test: 'google', optional: true,
      why: '予約の候補を、カレンダーの本当の空きに合わせます。二重予約を防げます。',
      go: { name: 'GOOGLE_REFRESH_TOKEN', env: 'GOOGLE_REFRESH_TOKEN' } },
    { id: 'cron', title: '毎朝の仕事の合言葉を決める（CRON_SECRET）', optional: true, where: 'Vercel の環境変数 CRON_SECRET',
      why: '予約の前日のお知らせ・予約投稿・週のまとめメールは、これがあると毎朝自動で動きます。',
      go: { env: 'CRON_SECRET' } },
    { id: 'social', title: 'SNS を1つ以上つなぐ', optional: true,
      why: '管理画面から、X・Instagram・LINE などへまとめて投稿できるようになります。',
      go: { tab: 'social-admin' } },
    { id: 'brand', title: 'サイトの名前を設定する（SITE_NAME・SITE_URL）', where: 'Vercel の環境変数 SITE_NAME・SITE_URL',
      why: 'メールや画面に出る社名です。設定しないと、元の会社（Lumenium）の名前のままになります。',
      go: {} }
  ];

  /* src: { health, settings, booking, social }（どれも {state, data}）
     opts: { host: この画面のホスト名, skipped: { 手順のid: true } }
     → { steps, done, total, pct（読めなかったときは null） } */
  function buildSetup(src, opts) {
    src = src || {};
    opts = opts || {};
    var skipped = opts.skipped || {};
    var hOk = ok(src.health), by = {};
    if (hOk) (src.health.data.checks || []).forEach(function (c) { by[c.id] = c; });
    var set = null;
    if (ok(src.settings) && Array.isArray(src.settings.data.settings)) {
      set = {};
      src.settings.data.settings.forEach(function (x) { set[x.name] = x; });
    }
    var isOk = function (id) { return !!(by[id] && by[id].state === 'ok'); };
    var note = function (id) { return (by[id] && by[id].note) || ''; };
    var judge = {
      admin: function () { return hOk ? [isOk('admin') ? 'done' : 'todo', isOk('admin') ? '' : note('admin')] : null; },
      store: function () { return hOk ? [isOk('store') ? 'done' : 'todo', isOk('store') ? '' : note('store')] : null; },
      resend: function () { return hOk ? [isOk('resend') ? 'done' : 'todo', ''] : null; },
      sender: function () {
        if (!hOk) return null;
        if (!isOk('resend')) return ['todo', '先にメールの送信（Resend）を設定してください。'];
        return by.sender ? ['todo', '送信元が Resend の試用アドレスのままです。'] : ['done', ''];
      },
      contactTo: function () { return hOk ? [isOk('contactTo') ? 'done' : 'todo', isOk('contactTo') ? '' : note('contactTo')] : null; },
      member: function () {
        if (!hOk) return null;
        var miss = [isOk('memberCode') ? '' : 'MEMBER_CODE', isOk('sessionSecret') ? '' : 'SESSION_SECRET'].filter(Boolean);
        return miss.length ? ['todo', miss.join('・') + ' がまだです。'] : ['done', ''];
      },
      github: function () { return hOk ? [isOk('github') ? 'done' : 'todo', ''] : null; },
      ai: function () { return hOk ? [isOk('ai') ? 'done' : 'todo', ''] : null; },
      google: function () {
        var b = ok(src.booking) ? src.booking.data : null;
        if (by.google || (set && set.GOOGLE_REFRESH_TOKEN && set.GOOGLE_REFRESH_TOKEN.set) || (b && b.connected)) return ['done', ''];
        if ((set && set.GOOGLE_CALENDAR_ICS_URL && set.GOOGLE_CALENDAR_ICS_URL.set) || (b && b.ics)) {
          return ['done', '簡易接続（カレンダーの非公開URL）です。空きは見えますが、予約はカレンダーに自動では入りません。'];
        }
        if (!set && !b) return null;
        return ['todo', ''];
      },
      cron: function () { return hOk ? [isOk('cron') ? 'done' : 'todo', ''] : null; },
      social: function () { return hOk ? [isOk('social') ? 'done' : 'todo', isOk('social') ? note('social') : ''] : null; },
      brand: function () {
        var br = ok(src.social) && src.social.data.brand;
        if (!br || !br.name) return null;
        var host = String(opts.host || '').replace(/^www\./, '');
        var same = !!br.host && !!host && (host === br.host || host.slice(-br.host.length - 1) === '.' + br.host);
        return br.name !== 'Lumenium' || same ? ['done', '社名: ' + br.name] : ['todo', 'いまは「' + br.name + '」のままです。'];
      }
    };
    var steps = STEPS.map(function (st, i) {
      var j = judge[st.id]();
      var state = j ? j[0] : 'unknown';
      if (state !== 'done' && st.optional && skipped[st.id]) state = 'skipped';
      return { id: st.id, n: i + 1, title: st.title, why: st.why, where: st.where || '', optional: !!st.optional,
        test: st.id === 'google' && state !== 'done' ? '' : (st.test || ''), go: st.go, state: state, note: j ? j[1] : '' };
    });
    var known = steps.filter(function (x) { return x.state !== 'unknown'; }).length;
    var done = steps.filter(function (x) { return x.state === 'done' || x.state === 'skipped'; }).length;
    return { steps: steps, done: done, total: steps.length, pct: known ? Math.round((done / steps.length) * 100) : null };
  }

  /* ---------------- カードの印 ----------------
     機能のカードに出す「未対応 3」などの印。「今日やること」と同じ読み込み・
     同じ行から作るので、上の一覧とカードで数が食い違うことはありません。
     → { タブのid: { text, tone: urgent|action|today|fyi } } */
  function buildBadges(src, now, setup) {
    src = src || {};
    var rows = buildToday(src, now).rows, by = {};
    rows.forEach(function (r) { by[r.id] = r; });
    var out = {};
    var put = function (tab, text, tone) { if (!out[tab]) out[tab] = { text: text, tone: tone }; };

    if (ok(src.inquiries)) {
      var c = (src.inquiries.data.metrics || {}).counts || {};
      if (num(c.new)) put('inquiries-admin', '未対応 ' + c.new, by['inq-late'] ? 'urgent' : 'action');
    }
    if (by['bk-tentative']) put('booking-admin', '仮予約 ' + by['bk-tentative'].count, 'action');
    if (by['bk-today']) put('booking-admin', '今日 ' + by['bk-today'].count + '件', 'today');

    if (by['sns-failed']) put('social-admin', '失敗 ' + by['sns-failed'].count, 'urgent');
    if (by['sns-today'] && by['sns-today'].level === 'urgent') put('social-admin', '予約投稿が止まっています', 'urgent');
    if (by['sns-unknown']) put('social-admin', '要確認 ' + by['sns-unknown'].count, 'action');
    var ap = (by['sns-approved'] ? by['sns-approved'].count : 0) + (by['sns-returned'] ? by['sns-returned'].count : 0);
    if (ap) put('social-admin', '承認の対応 ' + ap, 'action');
    if (by['sns-today']) put('social-admin', '今日の予約 ' + by['sns-today'].count, by['sns-today'].level);

    if (by['news-stale']) put('news-admin', by['news-stale'].count ? by['news-stale'].count + '日 更新なし' : 'まだありません', 'action');
    if (by['mem-new']) put('list-view', '今週 +' + by['mem-new'].count + '人', 'fyi');
    if (by['analytics-week']) put('stats-admin', '7日で ' + by['analytics-week'].count + '回', 'fyi');

    var bad = (by['health-error'] ? by['health-error'].count : 0) + (by['deploy-failed'] ? 1 : 0);
    if (bad) put('health-admin', '要対応 ' + bad, 'urgent');
    if (setup && setup.pct != null && setup.pct < 100) put('health-admin', '設定 ' + setup.pct + '%', 'action');
    return out;
  }

  root.lumPortalCore = {
    classify: classify, buildToday: buildToday, buildSetup: buildSetup, buildBadges: buildBadges, jstDay: jstDay, dayStart: dayStart,
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
    /* はじめての設定 */
    '.lp-setup summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
    '.lp-setup summary::-webkit-details-marker{display:none}' +
    '.lp-setup summary h2{font-size:16px;font-weight:800}' +
    '.lp-setup summary .lp-pct{font-size:12.5px;font-weight:700;color:var(--sub)}' +
    '.lp-setup summary .lp-tg{margin-left:auto;font-size:12px;color:var(--sub);text-decoration:underline}' +
    '.lp-setup[open] summary .lp-tg-c,.lp-setup:not([open]) summary .lp-tg-o{display:none}' +
    '.lp-bar{display:block;flex-basis:100%;height:6px;border-radius:999px;background:#eceae4;overflow:hidden}' +
    '.lp-bar i{display:block;height:100%;background:#3d3fbf}' +
    '.lp-steps{list-style:none;margin:12px 0 0;padding:0;border-top:1px solid var(--border)}' +
    '.lp-step{display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px;padding:12px 2px;border-bottom:1px solid var(--border)}' +
    '.lp-mk{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:var(--sub)}' +
    '.lp-step.done .lp-mk{background:#047857;border-color:#047857;color:#fff}' +
    '.lp-step.skipped .lp-mk{background:#8a8a94;border-color:#8a8a94;color:#fff}' +
    '.lp-step.todo .lp-mk{border-color:#b45309;color:#b45309}' +
    '.lp-step b{display:block;font-size:13.5px;line-height:1.5}' +
    '.lp-step.done b,.lp-step.skipped b{color:var(--sub);font-weight:700}' +
    '.lp-st{display:inline-block;margin-left:6px;font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;vertical-align:1px}' +
    '.lp-st.done{background:rgba(16,185,129,.14);color:#047857}.lp-st.todo{background:rgba(251,191,36,.18);color:#92400e}' +
    '.lp-st.skipped,.lp-st.unknown{background:rgba(23,23,28,.06);color:var(--sub)}' +
    '.lp-step p{font-size:12.5px;color:var(--sub);line-height:1.7;margin-top:2px}' +
    '.lp-step p.lp-nt{color:var(--text)}' +
    '.lp-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
    '.lp-acts button{padding:7px 13px;font-size:12px}' +
    '.lp-out{font-size:12px;line-height:1.75;margin-top:8px;padding:8px 10px;border-radius:9px;border:1px solid var(--border);background:#faf9f6}' +
    '.lp-out[hidden]{display:none}' +
    '.lp-out.ok{border-color:rgba(4,120,87,.4);background:rgba(20,184,166,.08)}.lp-out.error{border-color:rgba(180,35,24,.4);background:#fff8f7;color:#b42318}' +
    '.lp-out.warn{border-color:rgba(217,119,6,.45);background:rgba(251,191,36,.10)}' +
    '.lp-target{outline:2px solid #3d3fbf !important;outline-offset:3px}' +
    /* ポモドーロは、表示を選んだときだけ。選んでいないときの時計は、
       文字盤（秒針が回る）を外して、時刻と日付の1行にします。 */
    '#portal:not(.lp-pomo) #pomo{display:none}' +
    '#portal:not(.lp-pomo) .portal-body{grid-template-columns:minmax(0,1fr)}' +
    'body:not(.lp-pomo) #pomo-pill{display:none !important}' +
    '#portal:not(.lp-pomo) #portal-hub{padding:10px 16px;gap:10px;min-height:0}' +
    '#portal:not(.lp-pomo) #portal-hub .hub-face{display:none}' +
    '#portal:not(.lp-pomo) #portal-hub .hub-read{flex-direction:row;align-items:baseline;gap:10px}' +
    '#portal:not(.lp-pomo) #portal-hub .hub-clock{font-size:20px}' +
    '#portal:not(.lp-pomo) #portal-hub .hub-sub{font-size:12.5px;margin-top:0}' +
    '#portal .pnode{transition:none}' +
    /* カードの印。問い合わせの「未読」の丸はタブの方に残し、カードではこちらに揃えます。 */
    '.pnode .inq-badge{display:none}' +
    '.pn-live{margin-top:5px;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:800;border:1px solid transparent}' +
    '.pn-live.urgent{background:#b42318;color:#fff}' +
    '.pn-live.action{background:rgba(251,191,36,.2);color:#92400e;border-color:rgba(217,119,6,.35)}' +
    '.pn-live.today{background:rgba(61,63,191,.1);color:#3d3fbf}' +
    '.pn-live.fyi{background:#f3f1ec;color:var(--sub)}' +
    '.lp-foot{margin-top:14px;font-size:12px;color:var(--sub)}' +
    '.lp-foot label{display:inline-flex;align-items:center;gap:7px;cursor:pointer}' +
    '.lp-foot input{width:15px;height:15px;accent-color:#3d3fbf}' +
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
    paintSetup();
    paintBadges();
  }

  /* ---- はじめての設定 ---- */
  function skippedMap() {
    try { return JSON.parse(localStorage.getItem('lum_setup_skip') || '{}') || {}; } catch (_) { return {}; }
  }
  function setSkipped(id, on) {
    var m = skippedMap();
    if (on) m[id] = true; else delete m[id];
    try { localStorage.setItem('lum_setup_skip', JSON.stringify(m)); } catch (_) {}
  }

  var STATE_LABEL = { done: '済み', todo: 'まだ', skipped: '使わない', unknown: '確認できません' };
  var setupOpen = null;   // 開け閉めは、読み直しても保ちます

  function paintSetup() {
    var host = el('lp-setup');
    if (!host || !P.data) return;
    var r = buildSetup(P.data, { host: location.hostname, skipped: skippedMap() });
    var full = r.pct === 100;
    var open = setupOpen == null ? !full : setupOpen;
    var pct = r.pct == null ? '状態を読み込めませんでした'
      : full ? 'すべて完了（' + r.total + ' / ' + r.total + '）'
      : r.done + ' / ' + r.total + ' 完了（' + r.pct + '%）';
    host.innerHTML = '<details class="lp-box lp-setup" id="lp-setup-d"' + (open ? ' open' : '') + '>' +
      '<summary><h2 id="lp-setup-h">はじめての設定</h2><span class="lp-pct" id="lp-pct">' + esc(pct) + '</span>' +
      '<span class="lp-tg"><span class="lp-tg-o">たたむ</span><span class="lp-tg-c">開く</span></span>' +
      (r.pct == null ? '' : '<span class="lp-bar" aria-hidden="true"><i style="width:' + r.pct + '%"></i></span>') + '</summary>' +
      (r.pct == null ? '<p class="lp-notes">設定状況が読めなかったため、どこまで済んでいるか分かりません。「再読込」でもう一度読みます。</p>' : '') +
      '<ol class="lp-steps">' + r.steps.map(function (st) {
        var acts = [];
        if (st.state === 'todo' || st.state === 'unknown') acts.push('<button type="button" data-set="' + st.id + '">設定する</button>');
        if (st.test && st.state !== 'skipped') acts.push('<button type="button" class="ghost" data-test="' + st.id + '">テスト</button>');
        if (st.optional && st.state === 'todo') acts.push('<button type="button" class="ghost" data-skip="' + st.id + '">使わない</button>');
        if (st.state === 'skipped') acts.push('<button type="button" class="ghost" data-unskip="' + st.id + '">やっぱり使う</button>');
        return '<li class="lp-step ' + st.state + '" data-step="' + st.id + '">' +
          '<span class="lp-mk" aria-hidden="true">' + (st.state === 'done' || st.state === 'skipped' ? '✓' : st.n) + '</span>' +
          '<div><b>' + esc(st.title) + (st.optional ? '（任意）' : '') +
          '<span class="lp-st ' + st.state + '">' + STATE_LABEL[st.state] + '</span></b>' +
          (st.state === 'done' ? '' : '<p>' + esc(st.why) + '</p>') +
          (st.note ? '<p class="lp-nt">' + esc(st.note) + '</p>' : '') +
          (st.state !== 'done' && st.where ? '<p>設定する場所: ' + esc(st.where) + '（この画面からは変えられません）</p>' : '') +
          (acts.length ? '<div class="lp-acts">' + acts.join('') + '</div>' : '') +
          '<div class="lp-out" id="lp-out-' + st.id + '" hidden></div></div></li>';
      }).join('') + '</ol></details>';
    var d = el('lp-setup-d');
    d.addEventListener('toggle', function () { setupOpen = d.open; });
    var find = function (id) { return r.steps.filter(function (x) { return x.id === id; })[0]; };
    host.querySelectorAll('[data-set]').forEach(function (b) {
      b.addEventListener('click', function () { goSetting(find(b.getAttribute('data-set'))); });
    });
    host.querySelectorAll('[data-test]').forEach(function (b) {
      b.addEventListener('click', function () { runTest(find(b.getAttribute('data-test')), b); });
    });
    host.querySelectorAll('[data-skip],[data-unskip]').forEach(function (b) {
      b.addEventListener('click', function () {
        setSkipped(b.getAttribute('data-skip') || b.getAttribute('data-unskip'), b.hasAttribute('data-skip'));
        paintSetup();
        paintBadges();
      });
    });
  }

  /* 「設定する」: その値を入れる行（設定状況の「キーの入力」）か、設定状況の
     説明の行まで連れて行き、枠で示します。動かさずに、その場所へ飛びます。 */
  function goSetting(st) {
    if (!st || !window.lumShowTab) return;
    var g = st.go || {};
    if (window.lumShowTab(g.tab || 'health-admin') === false) return;
    if (g.tab) { window.scrollTo(0, 0); return; }
    var label = '';
    var set = P.data && ok(P.data.settings) ? P.data.settings.data.settings || [] : [];
    set.forEach(function (x) { if (x.name === g.name) label = x.label; });
    var tries = 0;
    (function look() {
      var hit = null;
      if (label) {
        document.querySelectorAll('#set-list .set-row').forEach(function (row) {
          var h = row.querySelector('h4');
          if (!hit && h && h.textContent.trim() === label) hit = row;
        });
      }
      if (!hit && g.env) {
        var b = document.querySelector('#health-list [data-env="' + g.env + '"]');
        if (b) hit = b.closest('#health-list > div') || b.parentNode;
      }
      if (!hit && tries++ < 30) { setTimeout(look, 150); return; }
      document.querySelectorAll('.lp-target').forEach(function (x) { x.classList.remove('lp-target'); });
      if (hit) hit.classList.add('lp-target');
      var target = hit || el('health-admin');
      if (target) target.scrollIntoView({ block: hit ? 'center' : 'start' });
    })();
  }

  async function runTest(st, btn) {
    var out = el('lp-out-' + st.id);
    btn.disabled = true;
    out.hidden = false;
    out.className = 'lp-out';
    out.textContent = st.test === 'resend' ? '確かめています…（管理者のアドレスに、テストメールを1通送ります）' : '確かめています…';
    var r = null;
    try {
      r = await window.lumAdmin.fetch('/api/settings-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: st.test })
      });
    } catch (_) {}
    btn.disabled = false;
    if (!r || !r.res) { out.className = 'lp-out error'; out.textContent = '通信に失敗しました。時間をおいてもう一度お試しください。'; return; }
    var d = r.data || {};
    if (!r.res.ok || !d.ok) { out.className = 'lp-out error'; out.textContent = d.message || 'テストできませんでした。'; return; }
    var items = d.items || [{ state: d.state, text: d.message }];
    var worst = items.some(function (x) { return x.state === 'error'; }) ? 'error'
      : items.some(function (x) { return x.state === 'warn'; }) ? 'warn' : 'ok';
    out.className = 'lp-out ' + worst;
    out.innerHTML = items.map(function (x) {
      return '<div>' + (x.state === 'ok' ? '✓ ' : x.state === 'warn' ? '注意: ' : '問題: ') + esc(x.text) + '</div>';
    }).join('');
  }

  /* カードの印。印が無くなったカードからは消します。 */
  function paintBadges() {
    if (!P.data) return;
    var setup = buildSetup(P.data, { host: location.hostname, skipped: skippedMap() });
    var b = buildBadges(P.data, Date.now(), setup);
    document.querySelectorAll('#portal-nodes .pnode').forEach(function (node) {
      var tab = node.id.replace(/^pnode-/, '');
      var span = node.querySelector('.pn-live');
      var x = b[tab];
      if (!x) { if (span) span.remove(); return; }
      if (!span) {
        span = document.createElement('span');
        node.appendChild(span);
      }
      span.className = 'pn-live ' + x.tone;
      span.textContent = x.text;
    });
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
    var setup = document.createElement('div');
    setup.id = 'lp-setup';
    portal.insertBefore(setup, box.nextSibling);
    var foot = document.createElement('p');
    foot.className = 'lp-foot';
    foot.innerHTML = '<label><input type="checkbox" id="lp-pomo-on">ポモドーロタイマーを表示する</label>';
    portal.appendChild(foot);
    el('lp-pomo-on').addEventListener('change', function () {
      try { localStorage.setItem('lum_pomo_show', this.checked ? '1' : '0'); } catch (_) {}
      applyPomo();
    });
    applyPomo();
    paint();
    load();
  };

  /* ポモドーロタイマーは、はじめは出しません（表示は端末ごとに覚えます）。
     ただし、前に始めたタイマーが動いている・止めてあるときは出します。
     見えないところで時間が来て鳴るのは、いちばん困るためです。 */
  function applyPomo() {
    var show = false, running = false;
    try {
      show = localStorage.getItem('lum_pomo_show') === '1';
      var t = JSON.parse(localStorage.getItem('lum_pomo') || 'null');
      running = !!(t && ((t.run && t.ends > Date.now()) || t.paused));
    } catch (_) {}
    var on = show || running;
    el('portal').classList.toggle('lp-pomo', on);
    document.body.classList.toggle('lp-pomo', on);
    var box = el('lp-pomo-on');
    if (box) box.checked = on;
  }
  root.lumPortalData = function () { return P.data; };
  root.lumPortalReload = load;
})(typeof window !== 'undefined' ? window : globalThis);
