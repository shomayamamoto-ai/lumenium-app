/* ---- SNS（動画） ----
   ショート動画を「調べる → 台本 → 絵コンテ → 確かめる → 出す → 数字 → 次の一手」
   の順に回すための画面。管理画面（admin-members.html）の1タブです。

   判定と計算（禁止ワード・表記・流用・音量・無音・統計）は /video-core.js に
   あり、サーバーも同じものを使います。画面とサーバーで判定が食い違うと、
   どちらを信じればいいか分からなくなるためです。

   動画と音声の解析（出荷前チェック・無音カット）は、このブラウザの中だけで
   行います。動画はどこにも送りません。関数に送ると 4.5MB の上限とお金の
   両方に引っかかるうえ、まだ出す前の動画を外に出す理由がないからです。

   数字の言い方は控えめにしています。件数が少ないうちは「まだ判断できません」
   と出し、たまたまの差を「勝ちパターン」と呼ばないようにしています。 */
(function () {
  var V = window.lumVideoCore;
  var el = function (id) { return document.getElementById(id); };
  var S = {
    started: false, projects: [], accounts: [], ready: {}, rules: null, stored: false,
    pid: '', data: null, sec: 'project', scriptId: '', file: null, fileUrl: '', ship: null, cut: null,
    pubQueue: null, polling: {}
  };
  var SECTIONS = [
    ['project', 'プロジェクト'], ['research', '競合リサーチ'], ['script', '台本'], ['board', '絵コンテ'],
    ['ship', '出荷前チェック'], ['silence', '無音カット'], ['publish', '投稿'], ['metrics', '数字'],
    ['pdca', 'PDCA'], ['import', 'snsautoから取り込む']
  ];
  var NET_LABEL = { instagram: 'Instagram リール', youtube: 'YouTube ショート', tiktok: 'TikTok' };
  var STATUS_LABEL = {
    draft: '下書き', uploading: 'アップロード中', scheduled: '予約済み', processing: '準備中（Instagram が変換中）',
    published: '公開済み', inbox: 'TikTok の受信箱に送信済み', failed: '失敗'
  };
  var STAGE_LABEL = { plan: 'Plan（計画）', do: 'Do（実行）', check: 'Check（評価）', act: 'Act（改善）' };

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function demo() { try { return sessionStorage.getItem('lum_demo') === '1'; } catch (_) { return false; } }
  function say(t, info) {
    var m = el('vid-msg');
    if (!m) return;
    m.textContent = t || '';
    m.classList.toggle('show', !!t);
    m.classList.toggle('info', !!info);
  }
  function int(v) { return v == null || v === '' || !isFinite(v) ? '—' : Math.round(Number(v)).toLocaleString('ja-JP'); }
  function pct(v) { return v == null || !isFinite(v) ? '—' : (Number(v) * 100).toFixed(1) + '%'; }
  function sec(v) { return v == null || !isFinite(v) ? '—' : (Math.round(Number(v) * 10) / 10) + '秒'; }
  function num(v) { var x = parseFloat(v); return isFinite(x) ? x : null; }
  function fmtMetric(metric, v) {
    var f = (V.METRICS[metric] || {}).fmt;
    return f === 'pct' ? pct(v) : f === 'sec' ? sec(v) : int(v);
  }

  async function api(url, opts) {
    try { return await window.lumAdmin.fetch(url, opts); }
    catch (_) { return { res: { ok: false, status: 0 }, data: { ok: false, message: '通信できませんでした。ネットの接続を確かめて、もう一度お試しください。' } }; }
  }
  function send(url, method, body) {
    return api(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  function post(body) { return send('/api/video', 'POST', Object.assign({ project: S.pid }, body)); }
  function pubApi(body) { return send('/api/video-publish', 'POST', Object.assign({ project: S.pid }, body)); }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function stamp() { return new Date().toISOString().slice(0, 10); }
  function project() { return (S.data && S.data.project) || null; }
  function needProject(host) {
    if (project()) return false;
    host.innerHTML = '<p class="soc-small">' + (S.stored
      ? '上の「プロジェクト」で、まずプロジェクトを作るか選んでください。'
      : '保存先（Upstash Redis）が未接続のため、プロジェクトを保存できません。「設定状況 › キーの入力」で保存先を入れてください。出荷前チェックと無音カットは、このままでも使えます。') + '</p>';
    return true;
  }

  /* ---------------- 骨組み ---------------- */

  function shell() {
    var host = el('video-admin');
    host.innerHTML =
      '<h2 style="font-size:15px;font-weight:700;margin-bottom:4px">SNS（動画）</h2>' +
      '<p class="share-note" style="margin-bottom:12px">ショート動画（Instagram リール・YouTube ショート・TikTok）を、競合を調べるところから、台本・絵コンテ・出す前の確認・投稿・数字の振り返りまで続けて行います。' +
      '動画の解析はこのブラウザの中だけで行い、どこにも送りません。</p>' +
      '<div class="vid-top">' +
        '<label class="soc-lab" for="vid-project" style="margin:0">プロジェクト</label>' +
        '<select id="vid-project"></select>' +
        '<button type="button" class="ghost" id="vid-new" style="font-size:12px;padding:7px 12px">新しく作る</button>' +
      '</div>' +
      '<div class="nq-row vid-secs" role="tablist" aria-label="SNS（動画）の項目">' + SECTIONS.map(function (s) {
        return '<button type="button" class="nq-chip" data-sec="' + s[0] + '" aria-pressed="false">' + s[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="msg" id="vid-msg" style="margin:0 0 12px"></p>' +
      '<div id="vid-body"></div>';
    host.querySelectorAll('[data-sec]').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-sec')); });
    });
    el('vid-project').addEventListener('change', function () { pick(this.value); });
    el('vid-new').addEventListener('click', function () { S.pid = ''; S.data = { project: null }; go('project', true); });
  }

  function go(sec, blank) {
    S.sec = sec;
    try { sessionStorage.setItem('lum_video_sec', sec); } catch (_) {}
    document.querySelectorAll('#video-admin [data-sec]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-sec') === sec ? 'true' : 'false');
    });
    say('');
    var body = el('vid-body');
    var fn = R[sec] || R.project;
    fn(body, blank);
  }

  function fillProjects() {
    var s = el('vid-project');
    s.innerHTML = (S.projects.length ? '' : '<option value="">（まだありません）</option>') + S.projects.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === S.pid ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
  }

  async function loadList() {
    var r = await api('/api/video');
    var d = r.data || {};
    S.ready = d.ready || {};
    S.rules = d.rules || V.RULES;
    S.stored = !!d.stored;
    S.projects = d.projects || [];
    S.accounts = d.accounts || [];
    if (!r.res.ok && !d.ok) say(d.message || '読み込めませんでした。');
    else if (!S.stored && d.message) say(d.message, true);
    var saved = '';
    try { saved = sessionStorage.getItem('lum_video_pid') || ''; } catch (_) {}
    var want = S.projects.some(function (p) { return p.id === saved; }) ? saved : (S.projects[0] ? S.projects[0].id : '');
    fillProjects();
    if (want) await pick(want, true);
    else { S.data = { project: null }; }
  }

  async function pick(pid, quiet) {
    S.pid = pid;
    try { sessionStorage.setItem('lum_video_pid', pid); } catch (_) {}
    if (!pid) { S.data = { project: null }; go(S.sec); return; }
    var r = await api('/api/video?project=' + encodeURIComponent(pid));
    if (!r.data || !r.data.ok) { say((r.data && r.data.message) || '読み込めませんでした。'); S.data = { project: null }; }
    else {
      S.data = r.data;
      if (!S.data.scripts.some(function (s) { return s.id === S.scriptId; })) S.scriptId = S.data.scripts[0] ? S.data.scripts[0].id : '';
    }
    fillProjects();
    if (!quiet) go(S.sec);
    resumePolling();
  }

  async function reload() { if (S.pid) await pick(S.pid, true); go(S.sec); }

  var R = {};

  /* ---------------- 1. プロジェクトとブランド設定 ---------------- */

  function notationText(map) {
    return Object.keys(map || {}).map(function (k) { return k + ' → ' + map[k]; }).join('\n');
  }
  function parseNotation(text) {
    var o = {};
    String(text || '').split('\n').forEach(function (line) {
      var m = line.split(/\s*(?:→|->|=>|＞|>)\s*/);
      if (m.length >= 2 && m[0].trim() && m[1].trim()) o[m[0].trim()] = m[1].trim();
    });
    return o;
  }
  function lines(text) { return String(text || '').split(/\n|、|,/).map(function (s) { return s.trim(); }).filter(Boolean); }

  R.project = function (host, blank) {
    var p = blank ? null : project();
    var b = (p && p.brand) || {};
    host.innerHTML =
      '<h3 class="soc-step">1　プロジェクトとブランド設定</h3>' +
      '<p class="soc-small">台本づくりとチェックの「決まりごと」です。禁止ワードが入った台本は、書き出しと投稿ができなくなります。</p>' +
      '<div class="soc-fields">' +
        '<input type="text" id="vp-name" maxlength="80" placeholder="プロジェクト名（例：カフェの公式アカウント）" value="' + esc(p ? p.name : '') + '">' +
        '<input type="text" id="vp-desc" maxlength="500" placeholder="説明（任意）" value="' + esc(p ? p.description : '') + '">' +
        '<input type="text" id="vp-persona" maxlength="300" placeholder="話し手（例：店長。20年パンを焼いている）" value="' + esc(b.persona) + '">' +
        '<input type="text" id="vp-tone" maxlength="300" placeholder="口調（例：親しみやすく、言い切りすぎない）" value="' + esc(b.tone) + '">' +
      '</div>' +
      '<div class="vid-grid3">' +
        '<div><label class="soc-lab" for="vp-banned">禁止ワード（1行に1つ）</label><textarea id="vp-banned" rows="4" placeholder="絶対に&#10;必ず儲かる">' + esc((b.banned_words || []).join('\n')) + '</textarea></div>' +
        '<div><label class="soc-lab" for="vp-notation">表記の統一（1行に「元 → 後」）</label><textarea id="vp-notation" rows="4" placeholder="パソコン → PC">' + esc(notationText(b.notation)) + '</textarea></div>' +
        '<div><label class="soc-lab" for="vp-except">例外（置き換えない語。1行に1つ）</label><textarea id="vp-except" rows="4" placeholder="パソコン教室">' + esc((b.notation_exceptions || []).join('\n')) + '</textarea></div>' +
      '</div>' +
      '<label class="soc-lab" for="vp-style">絵コンテの画風（英語。画像生成に渡す文の後ろに付きます）</label>' +
      '<input type="text" id="vp-style" class="vid-in" maxlength="300" placeholder="warm natural light, shallow depth of field, 35mm photo" value="' + esc(b.style) + '">' +
      '<div class="vid-acts"><button type="button" id="vp-save">保存</button>' +
      (p ? '<button type="button" class="ghost" id="vp-del">このプロジェクトを削除</button>' : '') + '</div>' +
      (p && p.imported_from ? '<p class="soc-small" style="margin-top:8px">snsauto から取り込んだプロジェクトです。</p>' : '') +
      accountsHtml();
    el('vp-save').addEventListener('click', async function () {
      var body = {
        id: p ? p.id : undefined, name: el('vp-name').value, description: el('vp-desc').value,
        created_at: p ? p.created_at : undefined, research: p ? p.research : [], imported_from: p ? p.imported_from : '',
        brand: {
          persona: el('vp-persona').value, tone: el('vp-tone').value, banned_words: lines(el('vp-banned').value),
          notation: parseNotation(el('vp-notation').value), notation_exceptions: lines(el('vp-except').value), style: el('vp-style').value
        }
      };
      if (!body.name.trim()) { say('プロジェクト名を入れてください。'); return; }
      this.disabled = true;
      var r = await send('/api/video', 'POST', { action: 'project.save', project: body });
      this.disabled = false;
      if (!r.data.ok) { say(r.data.message || '保存できませんでした。'); return; }
      var pid = r.data.project.id;
      var i = S.projects.findIndex(function (x) { return x.id === pid; });
      if (i >= 0) S.projects[i] = r.data.project; else S.projects.push(r.data.project);
      await pick(pid, true);
      go('project');
      say('保存しました。', true);
    });
    if (el('vp-del')) el('vp-del').addEventListener('click', async function () {
      if (!confirm('「' + p.name + '」と、その中の競合・台本・投稿・PDCA をすべて削除します。元に戻せません。よろしいですか？')) return;
      var r = await send('/api/video', 'POST', { action: 'project.delete', id: p.id });
      if (!r.data.ok) { say(r.data.message || '削除できませんでした。'); return; }
      S.projects = S.projects.filter(function (x) { return x.id !== p.id; });
      S.pid = ''; S.data = { project: null };
      try { sessionStorage.removeItem('lum_video_pid'); } catch (_) {}
      fillProjects();
      if (S.projects[0]) await pick(S.projects[0].id, true);
      go('project');
      say('削除しました。', true);
    });
  };

  function accountsHtml() {
    if (!S.accounts.length) return '';
    return '<h3 class="soc-step" style="margin-top:20px">取り込んだ連携アカウント</h3>' +
      '<p class="soc-small">snsauto から移したアカウントです。トークン（鍵）は持ち出していないので、どれも「再連携が必要」です。「投稿」の画面から連携し直してください。</p>' +
      S.accounts.map(function (a) {
        return '<div class="soc-res"><b>' + esc(NET_LABEL[a.platform] || a.platform) + '</b><span>@' + esc(a.username) + '　<span class="vid-tag warn">' + esc(a.status_label || '再連携が必要') + '</span></span></div>';
      }).join('');
  }

  /* ---------------- 2. 競合リサーチ ---------------- */

  var CSV_COLS = ['url', 'title', 'caption', 'published_at', 'duration_sec', 'views', 'likes', 'comments', 'shares'];

  R.research = function (host) {
    if (needProject(host)) return;
    var d = S.data;
    var band = d.band || { ok: false, message: '' };
    var analysed = d.posts.filter(function (p) { return p.analysis; });
    host.innerHTML =
      '<h3 class="soc-step">2　競合リサーチ</h3>' +
      '<p class="soc-small">反応率＝（いいね＋コメント＋シェア）÷再生、伸びる速さ＝再生÷投稿からの時間。総合点は、伸びる速さ・反応率・再生数の「順位」を 4：3.5：2.5 で混ぜたものです（値の種類が違うため、生の数は足しません）。</p>' +
      '<details class="soc-more"><summary>投稿を追加する（手入力・CSV' + (S.ready.instagram ? '・Instagram' : '') + '）</summary>' +
        '<div style="margin-top:8px">' +
        (S.ready.instagram
          ? '<label class="soc-lab" for="vr-ig">Instagram の競合アカウントから集める（最近のリール最大25件）</label>' +
            '<div class="vid-row"><input type="text" id="vr-ig" class="vid-in" placeholder="ユーザー名（@なし）" style="max-width:260px"><button type="button" id="vr-ig-go" style="font-size:12px;padding:8px 14px">集める</button></div>' +
            '<p class="soc-small">Instagram は他のアカウントの再生数と長さを公開していないため、その2つは空欄で入ります。</p>'
          : '<p class="soc-small">Instagram のキーを入れると、競合アカウントのリールをまとめて集められます（「設定状況 › キーの入力」）。</p>') +
        '<label class="soc-lab" for="vr-csv">CSV を貼る（1行目は見出し: ' + CSV_COLS.join(',') + '）</label>' +
        '<textarea id="vr-csv" rows="4" placeholder="url,title,caption,published_at,duration_sec,views,likes,comments,shares"></textarea>' +
        '<div class="vid-row"><input type="file" id="vr-csv-file" accept=".csv,text/csv"><button type="button" id="vr-csv-go" style="font-size:12px;padding:8px 14px">CSV を取り込む</button>' +
        '<button type="button" class="ghost" id="vr-csv-tpl" style="font-size:12px;padding:8px 12px">見本のCSV</button></div>' +
        '<label class="soc-lab">1件ずつ入れる</label>' +
        '<div class="vid-grid3">' +
          '<input type="url" id="vr-url" placeholder="URL">' +
          '<input type="text" id="vr-title" placeholder="タイトル（1行目）">' +
          '<input type="datetime-local" id="vr-at" aria-label="投稿日時">' +
          '<input type="number" id="vr-dur" placeholder="長さ（秒）" min="0">' +
          '<input type="number" id="vr-views" placeholder="再生数" min="0">' +
          '<input type="number" id="vr-likes" placeholder="いいね" min="0">' +
          '<input type="number" id="vr-comments" placeholder="コメント" min="0">' +
          '<input type="number" id="vr-shares" placeholder="シェア" min="0">' +
        '</div>' +
        '<textarea id="vr-caption" rows="2" placeholder="キャプション（ハッシュタグも含めてそのまま）" style="margin-top:6px"></textarea>' +
        '<div class="vid-acts"><button type="button" id="vr-add" style="font-size:12px;padding:8px 14px">追加</button></div>' +
        '</div></details>' +
      '<div class="soc-res' + (band.ok ? ' ok' : '') + '" style="margin-top:10px"><b>上位の長さ</b><span>' +
        (band.ok ? '中央値 ' + band.median + '秒（真ん中半分は ' + band.q1 + '〜' + band.q3 + '秒、上位' + band.n + '本から）。台本の長さの目安に使います。' : esc(band.message || 'まだ判断できません。')) + '</span></div>' +
      '<div class="vid-row" style="margin:10px 0 6px"><span class="soc-small">' + d.posts.length + '件（上限 ' + ((d.caps && d.caps.posts) || 300) + '件）</span>' +
        '<button type="button" id="vr-analyze" style="font-size:12px;padding:8px 14px"' + (S.ready.ai ? '' : ' disabled') + '>未分析の投稿を構成分析（最大8件）</button>' +
        '<button type="button" class="ghost" id="vr-del" style="font-size:12px;padding:8px 12px">選んだ投稿を削除</button></div>' +
      (S.ready.ai ? '' : '<p class="soc-small">構成分析には AI のキーが要ります（「設定状況 › キーの入力」）。</p>') +
      '<div class="tbl vid-scroll"><table class="vid-table"><thead><tr><th></th><th>順位</th><th>タイトル</th><th>再生</th><th>反応率</th><th>伸び（再生/時）</th><th>長さ</th><th>総合点</th><th>フック</th></tr></thead><tbody>' +
        (d.posts.length ? d.posts.map(function (p) {
          return '<tr><td><input type="checkbox" class="vr-pick" value="' + esc(p.id) + '" aria-label="選ぶ"></td><td>' + p.rank + '</td>' +
            '<td style="min-width:180px">' + (p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.title || '（無題）') + '</a>' : esc(p.title || '（無題）')) + '</td>' +
            '<td>' + int(p.views) + '</td><td>' + pct(p.engagement_rate) + '</td><td>' + int(p.velocity) + '</td><td>' + sec(p.duration_sec) + '</td>' +
            '<td>' + (p.score == null ? '—' : p.score.toFixed(2)) + '</td><td>' + (p.analysis ? esc(V.HOOK_LABELS[p.analysis.hook_type] || p.analysis.hook_type) : '未分析') + '</td></tr>';
        }).join('') : '<tr><td colspan="9" class="empty">まだありません。上の「投稿を追加する」から入れてください。</td></tr>') +
      '</tbody></table></div>' +
      (analysed.length ? '<h3 class="soc-step" style="margin-top:18px">構成分析</h3><p class="soc-small">画面内テロップは動画ファイルが無いので未測定です。下の数字はキャプションの統計です。</p>' +
        analysed.map(function (p) {
          var a = p.analysis;
          var c = a.caption || {};
          return '<details class="soc-more"><summary>' + esc(p.title || '（無題）') + '　<span class="vid-tag">' + esc(V.HOOK_LABELS[a.hook_type] || a.hook_type) + '</span></summary>' +
            '<p class="soc-small" style="margin-top:6px">フック: 「' + esc(a.hook_text) + '」</p>' +
            '<div class="tbl vid-scroll"><table class="vid-table"><thead><tr><th>区切り</th><th>時間</th><th>ねらい</th></tr></thead><tbody>' +
            (a.beats || []).map(function (x) { return '<tr><td>' + esc(x.label) + '</td><td>' + sec(x.start) + '〜' + sec(x.end) + '</td><td>' + esc(x.purpose) + '</td></tr>'; }).join('') +
            '</tbody></table></div>' +
            '<p class="soc-small">キャプション: ' + int(c.line_count) + '行・1行平均 ' + (c.avg_chars == null ? '—' : c.avg_chars) + '字・最大 ' + int(c.max_chars) + '字・' + (c.chars_per_sec == null ? '秒あたり —' : '1秒あたり ' + c.chars_per_sec + '字') +
            ((a.hashtags || []).length ? '・タグ ' + a.hashtags.map(function (t) { return '#' + esc(t); }).join(' ') : '') + '</p>' +
            ((a.takeaways || []).length ? '<p class="soc-small">まねしてよい型: ' + a.takeaways.map(esc).join(' ／ ') + '</p>' : '') +
            '</details>';
        }).join('') : '');

    if (el('vr-ig-go')) el('vr-ig-go').addEventListener('click', async function () {
      this.disabled = true;
      say('Instagram から集めています…', true);
      var r = await post({ action: 'ig.discover', username: el('vr-ig').value });
      this.disabled = false;
      if (!r.data.ok) { say(r.data.message || '集められませんでした。'); return; }
      await reload();
      say(r.data.note || '集めました。', true);
    });
    el('vr-csv-file').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      f.text().then(function (t) { el('vr-csv').value = t; });
    });
    el('vr-csv-tpl').addEventListener('click', function () {
      download('競合の投稿_見本.csv', V.csv([CSV_COLS, ['https://www.instagram.com/reel/xxxx/', '朝の仕込みを30秒で', '朝の仕込みを30秒で #パン屋', '2026-10-01T08:00:00+09:00', '28', '12000', '640', '22', '35']]), 'text/csv;charset=utf-8');
    });
    el('vr-csv-go').addEventListener('click', async function () {
      var rows = V.parseCsv(el('vr-csv').value);
      if (!rows.length) { say('CSV に行がありません（1行目は見出しです）。'); return; }
      var posts = rows.map(function (r) {
        return { url: r.url, title: r.title || String(r.caption || '').split('\n')[0].slice(0, 120), caption: r.caption, published_at: r.published_at,
          duration_sec: r.duration_sec, views: r.views, likes: r.likes, comments: r.comments, shares: r.shares, source: 'csv' };
      });
      this.disabled = true;
      var added = 0;
      for (var i = 0; i < posts.length; i += 50) {
        say('取り込んでいます… ' + Math.min(posts.length, i + 50) + ' / ' + posts.length, true);
        var r = await post({ action: 'posts.add', posts: posts.slice(i, i + 50) });
        if (!r.data.ok) { this.disabled = false; say(r.data.message || '取り込めませんでした。'); return; }
        added += r.data.added || 0;
      }
      this.disabled = false;
      await reload();
      say(added + '件取り込みました。', true);
    });
    el('vr-add').addEventListener('click', async function () {
      var at = el('vr-at').value;
      var p = {
        url: el('vr-url').value.trim(), title: el('vr-title').value.trim(), caption: el('vr-caption').value,
        published_at: at ? new Date(at).toISOString() : '', duration_sec: el('vr-dur').value, views: el('vr-views').value,
        likes: el('vr-likes').value, comments: el('vr-comments').value, shares: el('vr-shares').value, source: 'manual'
      };
      if (!p.title && !p.caption) { say('タイトルかキャプションを入れてください。'); return; }
      var r = await post({ action: 'posts.add', posts: [p] });
      if (!r.data.ok) { say(r.data.message || '追加できませんでした。'); return; }
      await reload();
      say('追加しました。', true);
    });
    el('vr-analyze').addEventListener('click', async function () {
      this.disabled = true;
      say('AIが構成を分析しています（30秒ほどかかります）…', true);
      var r = await post({ action: 'analyze' });
      this.disabled = false;
      if (!r.data.ok) { say(r.data.message || '分析できませんでした。'); return; }
      await reload();
      say(r.data.analyzed + '件を分析しました。' + (r.data.left ? 'あと' + r.data.left + '件あります（もう一度押すと続きを分析します）。' : ''), true);
    });
    el('vr-del').addEventListener('click', async function () {
      var ids = Array.prototype.map.call(document.querySelectorAll('.vr-pick:checked'), function (c) { return c.value; });
      if (!ids.length) { say('削除する投稿にチェックを入れてください。'); return; }
      if (!confirm(ids.length + '件を削除します。よろしいですか？')) return;
      var r = await post({ action: 'posts.delete', ids: ids });
      if (!r.data.ok) { say(r.data.message || '削除できませんでした。'); return; }
      await reload();
    });
  };

  /* ---------------- 3. 台本 ---------------- */

  function currentScript() {
    var d = S.data;
    return d && d.scripts ? d.scripts.filter(function (s) { return s.id === S.scriptId; })[0] || null : null;
  }
  function sources() {
    return (S.data.posts || []).reduce(function (a, p) { if (p.title) a.push(p.title); if (p.caption) a.push(p.caption); return a; }, []);
  }
  function scriptPicker() {
    var d = S.data;
    return '<div class="vid-row"><label class="soc-lab" for="vs-pick" style="margin:0">台本</label><select id="vs-pick">' +
      (d.scripts.length ? d.scripts.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === S.scriptId ? ' selected' : '') + '>' + esc(s.title || '（無題）') + '</option>'; }).join('') : '<option value="">（まだありません）</option>') +
      '</select></div>';
  }
  function bindPicker(after) {
    var s = el('vs-pick');
    if (s) s.addEventListener('change', function () { S.scriptId = this.value; after(); });
  }

  R.script = function (host) {
    if (needProject(host)) return;
    var d = S.data;
    var band = d.band || {};
    host.innerHTML =
      '<h3 class="soc-step">3　台本</h3>' +
      '<details class="soc-ai" id="vs-gen-box"' + (d.scripts.length ? '' : ' open') + '><summary>AIに台本を作ってもらう</summary><div class="soc-ai-body">' +
        '<label class="soc-lab" for="vs-topic">何についての動画か（テーマ・伝えたいこと）</label>' +
        '<textarea id="vs-topic" rows="3" placeholder="例：秋限定のかぼちゃのパン。1日30個。焼き上がりは11時。"></textarea>' +
        '<div class="vid-row" style="margin-top:6px">' +
          '<select id="vs-net" aria-label="投稿先"><option value="instagram">Instagram リール</option><option value="youtube">YouTube ショート</option><option value="tiktok">TikTok</option></select>' +
          '<input type="number" id="vs-dur" min="5" max="180" placeholder="長さ（秒）" style="width:120px" aria-label="長さ（秒）">' +
          '<button type="button" id="vs-gen" style="font-size:12.5px;padding:8px 14px"' + (S.ready.ai ? '' : ' disabled') + '>台本を作る</button>' +
        '</div>' +
        '<p class="soc-small" style="margin-top:6px">長さを空欄にすると、競合の上位の長さ（' + (band.ok ? '中央値 ' + band.median + '秒' : 'まだ判断できないため30秒') + '）を使います。冒頭約3秒をフックにし、テロップ・ナレーション・映す画を秒ごとに分けます。' +
        '作ったあと、禁止ワード・表記の統一・競合との言い回しの重なり（10文字以上）・テロップの速さを機械的に確かめます。重なりがあれば最大2回作り直します。' +
        (S.ready.ai ? '' : '<br>AI のキーが未設定です（「設定状況 › キーの入力」）。') + '</p>' +
      '</div></details>' +
      scriptPicker() +
      '<div class="vid-row" style="margin-top:6px"><button type="button" class="ghost" id="vs-blank" style="font-size:12px;padding:7px 12px">空の台本を作る</button>' +
        (currentScript() ? '<button type="button" class="ghost" id="vs-del" style="font-size:12px;padding:7px 12px">この台本を削除</button>' : '') + '</div>' +
      '<div id="vs-edit"></div>';
    bindPicker(function () { R.script(host); });
    el('vs-gen').addEventListener('click', async function () {
      var topic = el('vs-topic').value.trim();
      if (!topic) { say('テーマを入れてください。'); return; }
      this.disabled = true;
      say('AIが台本を書いています（30秒〜1分ほど）…', true);
      var r = await post({ action: 'script.generate', topic: topic, platform: el('vs-net').value, duration: num(el('vs-dur').value) });
      this.disabled = false;
      if (!r.data.ok) { say(r.data.message || '作れませんでした。'); return; }
      S.scriptId = r.data.script.id;
      await reload();
      say(r.data.message, true);
    });
    el('vs-blank').addEventListener('click', async function () {
      var r = await post({ action: 'script.save', item: { title: '新しい台本', platform: 'instagram', lines: [{ start: 0, end: 3, narration: '', telop: '', visual: '' }] } });
      if (!r.data.ok) { say(r.data.message || '作れませんでした。'); return; }
      S.scriptId = r.data.item.id;
      await reload();
    });
    if (el('vs-del')) el('vs-del').addEventListener('click', async function () {
      if (!confirm('この台本を削除します。よろしいですか？')) return;
      await post({ action: 'script.delete', id: S.scriptId });
      S.scriptId = '';
      await reload();
    });
    var s = currentScript();
    if (s) editor(el('vs-edit'), JSON.parse(JSON.stringify(s)));
  };

  function editor(host, s) {
    host.innerHTML =
      '<div class="soc-fields" style="margin-top:10px">' +
        '<input type="text" id="ve-title" maxlength="200" placeholder="タイトル" value="' + esc(s.title) + '">' +
        '<select id="ve-hook-type" aria-label="フックの型">' + V.HOOK_TYPES.map(function (h) { return '<option value="' + h + '"' + (s.hook_type === h ? ' selected' : '') + '>フック: ' + V.HOOK_LABELS[h] + '</option>'; }).join('') + '</select>' +
        '<input type="text" id="ve-hook" maxlength="300" placeholder="フック（最初の約3秒）" value="' + esc(s.hook) + '">' +
        '<input type="text" id="ve-cta" maxlength="300" placeholder="CTA（最後にしてほしい行動）" value="' + esc(s.cta) + '">' +
        '<input type="text" id="ve-tags" placeholder="ハッシュタグ（空白区切り・5個まで）" value="' + esc((s.hashtags || []).join(' ')) + '">' +
        '<select id="ve-net" aria-label="投稿先">' + Object.keys(NET_LABEL).map(function (n) { return '<option value="' + n + '"' + (s.platform === n ? ' selected' : '') + '>' + NET_LABEL[n] + '</option>'; }).join('') + '</select>' +
      '</div>' +
      '<label class="soc-lab">行（時間・ナレーション・テロップ・映す画）</label>' +
      '<div class="tbl vid-scroll"><table class="vid-table vid-lines"><thead><tr><th>開始</th><th>終了</th><th>ナレーション</th><th>テロップ</th><th>映す画（英語）</th><th></th></tr></thead><tbody id="ve-rows"></tbody></table></div>' +
      '<div class="vid-row" style="margin-top:6px"><button type="button" class="ghost" id="ve-add" style="font-size:12px;padding:7px 12px">行を足す</button></div>' +
      '<div id="ve-checks" style="margin-top:10px"></div>' +
      (s.rationale ? '<p class="soc-small">この構成にした理由（AI）: ' + esc(s.rationale) + '</p>' : '') +
      '<div class="vid-acts"><button type="button" id="ve-save">保存</button>' +
        '<button type="button" class="ghost ve-out" data-out="srt">テロップ（SRT）</button>' +
        '<button type="button" class="ghost ve-out" data-out="csv">台本（CSV）</button>' +
        '<button type="button" class="ghost ve-out" data-out="txt">ナレーション（テキスト）</button></div>';
    function rows() {
      el('ve-rows').innerHTML = s.lines.map(function (l, i) {
        return '<tr data-i="' + i + '">' +
          '<td><input type="number" step="0.1" min="0" class="ve-f" data-k="start" value="' + esc(l.start) + '" aria-label="開始（秒）"></td>' +
          '<td><input type="number" step="0.1" min="0" class="ve-f" data-k="end" value="' + esc(l.end) + '" aria-label="終了（秒）"></td>' +
          '<td><textarea rows="2" class="ve-f" data-k="narration" aria-label="ナレーション">' + esc(l.narration) + '</textarea></td>' +
          '<td><textarea rows="2" class="ve-f" data-k="telop" aria-label="テロップ">' + esc(l.telop) + '</textarea></td>' +
          '<td><textarea rows="2" class="ve-f" data-k="visual" aria-label="映す画">' + esc(l.visual) + '</textarea></td>' +
          '<td><button type="button" class="ghost ve-x" style="font-size:11px;padding:4px 8px" aria-label="この行を消す">消す</button></td></tr>';
      }).join('');
    }
    rows();
    var result = null;
    function collect() {
      s.title = el('ve-title').value; s.hook = el('ve-hook').value; s.cta = el('ve-cta').value; s.hook_type = el('ve-hook-type').value;
      s.platform = el('ve-net').value;
      s.hashtags = el('ve-tags').value.split(/[\s、,]+/).map(function (t) { return t.replace(/^#/, ''); }).filter(Boolean);
      return s;
    }
    function check() {
      result = V.checkScript(collect(), project().brand, sources());
      var c = result;
      var h = '';
      h += c.banned.length
        ? '<div class="soc-res ng"><b>禁止ワード</b><span>' + c.banned.map(function (b) { return '「' + esc(b.word) + '」'; }).join('・') + ' が入っています。直すまで書き出しと投稿はできません。</span></div>'
        : '<div class="soc-res ok"><b>禁止ワード</b><span>入っていません。</span></div>';
      h += c.notation.length
        ? '<div class="soc-res"><b>表記の統一</b><span>' + c.notation.length + 'か所をそろえられます。<br>' + c.notation.slice(0, 8).map(function (n) {
            return esc(n.where) + '：<del>' + esc(n.before) + '</del> → <ins>' + esc(n.after) + '</ins>';
          }).join('<br>') + '<br><button type="button" class="ghost" id="ve-norm" style="font-size:11px;padding:4px 10px;margin-top:4px">表記をそろえる</button></span></div>'
        : '<div class="soc-res ok"><b>表記の統一</b><span>そろっています。</span></div>';
      h += c.originality.clean
        ? '<div class="soc-res ok"><b>流用の疑い</b><span>競合と10文字以上同じ言い回しはありません。</span></div>'
        : '<div class="soc-res ng"><b>流用の疑い</b><span>競合と同じ言い回しがあります。言い換えてください。<br>' + c.originality.findings.map(function (f) {
            return '「' + esc(f.shared) + '」（' + f.shared_length + '文字、元: ' + esc(f.source.slice(0, 40)) + '）';
          }).join('<br>') + '</span></div>';
      h += c.speed.length
        ? '<div class="soc-res"><b>テロップの速さ</b><span>' + c.speed.map(function (x) { return (x.index + 1) + '行目: 1秒あたり ' + x.cps + '文字'; }).join('、') + '。8文字を超えると読み切れない人が増えます。文字を減らすか、時間を延ばしてください。</span></div>'
        : '<div class="soc-res ok"><b>テロップの速さ</b><span>どの行も1秒あたり8文字以内です。</span></div>';
      if (c.tooManyTags) h += '<div class="soc-res"><b>ハッシュタグ</b><span>5個までにしてください（多いと宣伝くさく見え、読まれにくくなります）。</span></div>';
      el('ve-checks').innerHTML = h;
      var blocked = c.banned.length > 0;
      document.querySelectorAll('.ve-out').forEach(function (b) { b.disabled = blocked; });
      if (el('ve-norm')) el('ve-norm').addEventListener('click', function () {
        var n = result.script;
        s.title = n.title; s.hook = n.hook; s.cta = n.cta; s.body = n.body; s.lines = n.lines;
        el('ve-title').value = s.title || ''; el('ve-hook').value = s.hook || ''; el('ve-cta').value = s.cta || '';
        rows(); check();
      });
    }
    host.addEventListener('input', function (e) {
      var t = e.target;
      if (t.classList.contains('ve-f')) {
        var i = Number(t.closest('tr').getAttribute('data-i'));
        var k = t.getAttribute('data-k');
        s.lines[i][k] = k === 'start' || k === 'end' ? (num(t.value) || 0) : t.value;
      }
      check();
    });
    host.addEventListener('change', function (e) { if (e.target.id === 've-net' || e.target.id === 've-hook-type') check(); });
    host.addEventListener('click', async function (e) {
      var t = e.target;
      if (t.classList.contains('ve-x')) {
        s.lines.splice(Number(t.closest('tr').getAttribute('data-i')), 1);
        rows(); check();
      }
      if (t.classList.contains('ve-out')) {
        var kind = t.getAttribute('data-out');
        var name = (s.title || 'script').replace(/[\\/:*?"<>|]/g, '_');
        if (kind === 'srt') download(name + '.srt', V.toSrt(s.lines), 'application/x-subrip;charset=utf-8');
        if (kind === 'csv') download(name + '.csv', V.csv([['開始', '終了', 'ナレーション', 'テロップ', '映す画']].concat(s.lines.map(function (l) { return [l.start, l.end, l.narration, l.telop, l.visual]; }))), 'text/csv;charset=utf-8');
        if (kind === 'txt') download(name + '_ナレーション.txt', s.lines.map(function (l) { return l.narration; }).filter(Boolean).join('\n'));
      }
    });
    el('ve-add').addEventListener('click', function () {
      var last = s.lines[s.lines.length - 1];
      var st = last ? Number(last.end) || 0 : 0;
      s.lines.push({ start: st, end: Math.round((st + 3) * 10) / 10, narration: '', telop: '', visual: '' });
      rows(); check();
    });
    el('ve-save').addEventListener('click', async function () {
      collect();
      this.disabled = true;
      var r = await post({ action: 'script.save', item: s });
      this.disabled = false;
      if (!r.data.ok) { say(r.data.message || '保存できませんでした。'); return; }
      await reload();
      say(result && result.banned.length ? '保存しました。禁止ワードが残っているため、書き出しと投稿はできません。' : '保存しました。', true);
    });
    check();
  }

  /* ---------------- 4. 絵コンテ ---------------- */

  R.board = function (host) {
    if (needProject(host)) return;
    var s = currentScript();
    host.innerHTML = '<h3 class="soc-step">4　絵コンテ</h3>' +
      '<p class="soc-small">台本の1行を1カットにします。「映す画」は画像生成AIや撮影の指示にそのまま使える英語の文で、最後に「文字・ロゴ・透かしを入れない」指示を必ず付けます（テロップは編集で入れるため）。</p>' +
      scriptPicker() + '<div id="vb-body"></div>';
    bindPicker(function () { R.board(host); });
    if (!s) { el('vb-body').innerHTML = '<p class="soc-small">先に「台本」で台本を作ってください。</p>'; return; }
    var shots = JSON.parse(JSON.stringify(s.shots || []));
    var style = s.style || (project().brand || {}).style || '';
    function draw() {
      el('vb-body').innerHTML =
        '<label class="soc-lab" for="vb-style">画風（英語）</label>' +
        '<div class="vid-row"><input type="text" id="vb-style" class="vid-in" value="' + esc(style) + '" placeholder="warm natural light, 35mm photo">' +
        '<button type="button" class="ghost" id="vb-make" style="font-size:12px;padding:8px 12px">台本から作り直す</button></div>' +
        '<div class="tbl vid-scroll" style="margin-top:8px"><table class="vid-table vid-lines"><thead><tr><th>#</th><th>時間</th><th>テロップ</th><th>映す画（プロンプト）</th><th>カメラ</th><th>つなぎ</th></tr></thead><tbody>' +
        (shots.length ? shots.map(function (x, i) {
          return '<tr data-i="' + i + '"><td>' + (i + 1) + '</td><td style="white-space:nowrap">' + sec(x.start) + '〜' + sec(x.end) + '</td><td>' + esc(x.telop) + '</td>' +
            '<td><textarea rows="3" class="vb-f" data-k="visual_prompt" aria-label="映す画">' + esc(x.visual_prompt) + '</textarea></td>' +
            '<td><input type="text" class="vb-f" data-k="camera" value="' + esc(x.camera) + '" aria-label="カメラ"></td>' +
            '<td><input type="text" class="vb-f" data-k="transition" value="' + esc(x.transition) + '" aria-label="つなぎ"></td></tr>';
        }).join('') : '<tr><td colspan="6" class="empty">まだありません。「台本から作り直す」を押してください。</td></tr>') +
        '</tbody></table></div>' +
        '<div class="vid-acts"><button type="button" id="vb-save">保存</button><button type="button" class="ghost" id="vb-csv">絵コンテ（CSV）</button></div>';
      el('vb-make').addEventListener('click', function () {
        if (shots.length && !confirm('いまの絵コンテを、台本から作り直します。手で直したところは消えます。よろしいですか？')) return;
        style = el('vb-style').value;
        shots = V.shotsFromLines(s.lines, style);
        draw();
      });
      el('vb-style').addEventListener('input', function () { style = this.value; });
      el('vb-body').addEventListener('input', function (e) {
        var t = e.target;
        if (!t.classList.contains('vb-f')) return;
        shots[Number(t.closest('tr').getAttribute('data-i'))][t.getAttribute('data-k')] = t.value;
      });
      el('vb-save').addEventListener('click', async function () {
        var item = Object.assign({}, s, { shots: shots, style: style });
        var r = await post({ action: 'script.save', item: item });
        if (!r.data.ok) { say(r.data.message || '保存できませんでした。'); return; }
        await reload();
        say('保存しました。', true);
      });
      el('vb-csv').addEventListener('click', function () {
        download((s.title || 'storyboard') + '_絵コンテ.csv', V.csv([['#', '開始', '終了', 'ナレーション', 'テロップ', '映す画', 'カメラ', 'つなぎ']].concat(shots.map(function (x, i) {
          return [i + 1, x.start, x.end, x.narration, x.telop, x.visual_prompt, x.camera, x.transition];
        }))), 'text/csv;charset=utf-8');
      });
    }
    draw();
  };

  /* ---------------- 5. 出荷前チェック（ブラウザだけ） ---------------- */

  function fileBox(id, label) {
    return '<label class="soc-lab" for="' + id + '">' + label + '</label>' +
      '<input type="file" id="' + id + '" accept="video/*,audio/*">' +
      (S.file ? '<p class="soc-small">選んである動画: ' + esc(S.file.name) + '（' + (S.file.size / 1048576).toFixed(1) + 'MB）</p>' : '');
  }
  function setFile(f) {
    if (S.fileUrl) URL.revokeObjectURL(S.fileUrl);
    S.file = f; S.fileUrl = f ? URL.createObjectURL(f) : ''; S.ship = null; S.cut = null; S.audio = null;
  }

  /** 動画から音声を取り出します（48kHz）。同じファイルなら使い回します。 */
  async function decodeAudio(file, progress) {
    if (S.audio && S.audio.file === file) return S.audio.buf;
    progress('音声を取り出しています…');
    var bytes = await file.arrayBuffer();
    var Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var ctx = new Ctx(2, 48000, 48000);
    var buf = await new Promise(function (ok, ng) { ctx.decodeAudioData(bytes, ok, ng); });
    S.audio = { file: file, buf: buf };
    return buf;
  }

  function videoMeta(url) {
    return new Promise(function (ok) {
      var v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true; v.src = url;
      v.onloadedmetadata = function () { ok({ width: v.videoWidth, height: v.videoHeight, duration: v.duration }); };
      v.onerror = function () { ok({ width: 0, height: 0, duration: 0, error: true }); };
    });
  }

  R.ship = function (host) {
    host.innerHTML = '<h3 class="soc-step">5　出荷前チェック</h3>' +
      '<p class="soc-small">投稿する前に、長さ・縦横比・大きさ・音量・文字の位置を確かめます。動画はこのブラウザの中だけで調べ、どこにも送りません。</p>' +
      fileBox('vk-file', '確かめる動画') +
      '<div class="vid-acts"><button type="button" id="vk-go"' + (S.file ? '' : ' disabled') + '>確かめる</button><span class="soc-small" id="vk-state"></span></div>' +
      '<div id="vk-out"></div>';
    el('vk-file').addEventListener('change', function () { setFile(this.files[0] || null); R.ship(host); });
    el('vk-go').addEventListener('click', runShip);
    if (S.ship) drawShip();
  };

  async function runShip() {
    var st = el('vk-state');
    var btn = el('vk-go');
    btn.disabled = true;
    try {
      st.textContent = '動画の情報を読んでいます…';
      var meta = await videoMeta(S.fileUrl);
      var out = { meta: meta, size: S.file.size, checks: meta.error ? [] : V.shipChecks(meta), loud: null, audioErr: '' };
      try {
        var buf = await decodeAudio(S.file, function (t) { st.textContent = t; });
        st.textContent = '音量を測っています…';
        await new Promise(function (r) { setTimeout(r, 30); });
        var chs = [];
        for (var c = 0; c < Math.min(buf.numberOfChannels, 2); c++) chs.push(buf.getChannelData(c));
        var L = V.integratedLoudness(chs, buf.sampleRate);
        out.loud = { lufs: L.lufs, advice: V.loudnessAdvice(L.lufs) };
        if (!meta.duration) out.checks = V.shipChecks({ duration: buf.duration });
      } catch (e) {
        out.audioErr = '音声を取り出せませんでした（音声の無い動画か、このブラウザが読めない形式です）。';
      }
      S.ship = out;
      st.textContent = '';
      drawShip();
    } finally { btn.disabled = false; }
  }

  function drawShip() {
    var o = S.ship;
    var m = o.meta;
    var mb = o.size / 1048576;
    var h = '<div class="vid-ship"><div class="vid-frame"><video id="vk-video" src="' + esc(S.fileUrl) + '" muted playsinline preload="auto"></video><canvas id="vk-safe" aria-hidden="true"></canvas></div><div>';
    h += o.checks.map(function (c) { return '<div class="soc-res ' + (c.ok ? 'ok' : 'ng') + '"><b>' + (c.ok ? '◯' : '△') + '</b><span>' + esc(c.text) + '</span></div>'; }).join('');
    h += '<div class="soc-res ' + (mb <= 1024 ? 'ok' : 'ng') + '"><b>' + (mb <= 1024 ? '◯' : '△') + '</b><span>大きさ ' + mb.toFixed(1) + 'MB' + (mb > 1024 ? '（Instagram の上限 1GB を超えています）' : '') + (mb > 4.5 ? '。4.5MB を超えるので、アップロードはブラウザから置き場所へ直接送ります。' : '') + '</span></div>';
    if (o.loud) h += '<div class="soc-res ' + (o.loud.advice.level === 'ok' ? 'ok' : 'ng') + '"><b>音量</b><span>' + (o.loud.lufs == null || !isFinite(o.loud.lufs) ? '測れませんでした' : o.loud.lufs + ' LUFS（目標 −14）') + '。' + esc(o.loud.advice.text) + '</span></div>';
    if (o.audioErr) h += '<div class="soc-res ng"><b>音量</b><span>' + esc(o.audioErr) + '</span></div>';
    h += '<p class="soc-small">左の画面の色の帯は、各SNSのボタンやアカウント名が重なりやすい場所です（上 ' + V.RULES.ship.SAFE_TOP_MARGIN + 'px・下 ' + V.RULES.ship.BOTTOM_UI + 'px、1920px の高さのとき）。テロップと大事なものは、帯の外に置いてください。</p>';
    h += '<p class="soc-small">音量は ITU-R BS.1770 の方式（K特性・400ms区切り・−70 LUFS と −10 LU のゲート）で測っています。</p></div></div>';
    el('vk-out').innerHTML = h;
    var v = el('vk-video');
    v.addEventListener('loadeddata', function () {
      try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch (_) {}
    });
    v.addEventListener('seeked', drawSafe);
    v.addEventListener('loadedmetadata', drawSafe);
  }

  /** 安全領域の帯（動かない静止の重ね絵）。 */
  function drawSafe() {
    var v = el('vk-video'), c = el('vk-safe');
    if (!v || !c) return;
    var w = v.clientWidth, h = v.clientHeight;
    if (!w || !h) return;
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    var top = Math.round(h * V.RULES.ship.SAFE_TOP_MARGIN / V.RULES.ship.FRAME_H);
    var bottom = Math.round(h * V.RULES.ship.BOTTOM_UI / V.RULES.ship.FRAME_H);
    g.fillStyle = 'rgba(180,35,24,0.28)';
    g.fillRect(0, 0, w, top);
    g.fillRect(0, h - bottom, w, bottom);
    g.fillStyle = 'rgba(180,35,24,0.16)';
    g.fillRect(w - Math.round(w * 0.14), h - bottom - Math.round(h * 0.28), Math.round(w * 0.14), Math.round(h * 0.28));
    g.strokeStyle = '#ffffff'; g.lineWidth = 1;
    g.strokeRect(0.5, top + 0.5, w - 1, h - top - bottom - 1);
  }

  /* ---------------- 6. 無音カット候補（ブラウザだけ） ---------------- */

  R.silence = function (host) {
    var r = V.RULES.silence;
    host.innerHTML = '<h3 class="soc-step">6　無音カット候補</h3>' +
      '<p class="soc-small">話していない「間」を見つけ、切る場所の候補を出します。切るのは ' + r.MIN_GAP_SEC + '秒以上の無音（' + r.NOISE_FLOOR_DB + 'dBFS 未満）だけで、話の前後には ' + r.HANDLE_SEC + '秒ずつ余白を残します。' +
      '「し」「す」などの息の音（4〜8kHz がこのファイルの静かなところより ' + r.CONSONANT_MARGIN_DB + 'dB 以上大きい部分）は、無音に見えても残します。動画はどこにも送りません。</p>' +
      fileBox('vc-file', '調べる動画（または音声）') +
      '<div class="vid-acts"><button type="button" id="vc-go"' + (S.file ? '' : ' disabled') + '>候補を出す</button><span class="soc-small" id="vc-state" aria-live="polite"></span></div>' +
      '<div id="vc-out"></div>';
    el('vc-file').addEventListener('change', function () { setFile(this.files[0] || null); R.silence(host); });
    el('vc-go').addEventListener('click', runSilence);
    if (S.cut) drawCut();
  };

  async function runSilence() {
    var st = el('vc-state');
    var btn = el('vc-go');
    btn.disabled = true;
    try {
      var buf = await decodeAudio(S.file, function (t) { st.textContent = t; });
      var n = buf.length;
      var chs = [];
      for (var c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
      var meter = V.frameMeter(buf.sampleRate);
      var CHUNK = buf.sampleRate * 2;
      var mono = new Float32Array(CHUNK);
      // 2秒ずつ処理し、そのたびに画面へ順番を返します（長い動画でも固まらないように）。
      for (var i = 0; i < n; i += CHUNK) {
        var len = Math.min(CHUNK, n - i);
        for (var k = 0; k < len; k++) {
          var s = 0;
          for (var ch = 0; ch < chs.length; ch++) s += chs[ch][i + k];
          mono[k] = s / chs.length;
        }
        meter.push(len === CHUNK ? mono : mono.subarray(0, len));
        st.textContent = '解析しています… ' + Math.min(100, Math.round(((i + len) / n) * 100)) + '%';
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      S.cut = V.silenceCuts(meter.done(), buf.duration);
      st.textContent = '';
      drawCut();
    } catch (e) {
      st.textContent = '';
      say('音声を取り出せませんでした（音声の無い動画か、このブラウザが読めない形式です）。');
    } finally { btn.disabled = false; }
  }

  function drawCut() {
    var c = S.cut;
    var name = S.file ? S.file.name : 'clip';
    el('vc-out').innerHTML =
      '<div class="soc-res ' + (c.cuts.length ? 'ok' : '') + '"><b>結果</b><span>' + (c.cuts.length
        ? c.cuts.length + 'か所を切ると、' + c.total + '秒 → ' + Math.round((c.total - c.saved) * 10) / 10 + '秒（' + c.saved + '秒短く）なります。'
        : '切れる無音はありませんでした。') +
        (c.consonantKept ? '　息の音として残した所: ' + c.consonantKept + 'か所。' : '') + '</span></div>' +
      (c.cuts.length ? '<div class="tbl vid-scroll" style="max-height:260px"><table class="vid-table"><thead><tr><th>#</th><th>切る範囲</th><th>長さ</th></tr></thead><tbody>' +
        c.cuts.map(function (x, i) { return '<tr><td>' + (i + 1) + '</td><td>' + V.srtTime(x.start).replace(',', '.') + ' 〜 ' + V.srtTime(x.end).replace(',', '.') + '</td><td>' + sec(x.end - x.start) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '') +
      '<div class="vid-acts"><button type="button" class="ghost" id="vc-csv">候補（CSV）</button><button type="button" class="ghost" id="vc-edl">編集ソフト用（EDL）</button><button type="button" class="ghost" id="vc-keep">残す区間の一覧</button></div>' +
      '<p class="soc-small">EDL は Premiere Pro・DaVinci Resolve・Final Cut（変換が必要）で読み込めます。30fps として書き出しています。</p>';
    el('vc-csv').addEventListener('click', function () {
      download(name + '_無音候補.csv', V.csv([['#', '開始（秒）', '終了（秒）', '長さ（秒）']].concat(c.cuts.map(function (x, i) { return [i + 1, x.start, x.end, Math.round((x.end - x.start) * 1000) / 1000]; }))), 'text/csv;charset=utf-8');
    });
    el('vc-edl').addEventListener('click', function () { download(name + '.edl', V.toEdl(c.keeps, { fps: 30, clip: name, title: name })); });
    el('vc-keep').addEventListener('click', function () {
      download(name + '_残す区間.txt', c.keeps.map(function (k) { return k.start.toFixed(3) + '\t' + k.end.toFixed(3); }).join('\n') + '\n');
    });
  }

  /* ---------------- 7. 投稿 ---------------- */

  function badge(ok, yes, no) { return '<span class="vid-tag ' + (ok ? 'ok' : 'warn') + '">' + (ok ? yes : no) + '</span>'; }

  R.publish = function (host) {
    if (needProject(host)) return;
    var rd = S.ready;
    var d = S.data;
    host.innerHTML = '<h3 class="soc-step">7　投稿</h3>' +
      '<div class="vid-nets">' +
        '<div class="soc-net"><span class="nm">Instagram リール</span>' + badge(rd.instagram && rd.blob, '使えます', rd.instagram ? '置き場所が未接続' : 'キーが未設定') +
          '<span class="sub">「SNS（文章）」と同じ Instagram のキーを使います。動画は置き場所（Vercel Blob）に置き、Instagram が取りに来ます。予約できます（その日の朝9時ごろ）。</span></div>' +
        '<div class="soc-net"><span class="nm">YouTube ショート</span>' + badge(rd.youtube, '連携済み', rd.youtubeClient ? '未連携' : 'Googleのキーが未設定') +
          '<span class="sub">ブラウザから YouTube に直接アップロードします。審査前の Google Cloud プロジェクトからは「非公開」になります。<button type="button" class="linkish" id="vp-yt-link"' + (rd.youtubeClient ? '' : ' disabled') + '>YouTube連携</button></span></div>' +
        '<div class="soc-net"><span class="nm">TikTok</span>' + badge(rd.tiktok && rd.blob, '連携済み', rd.tiktokClient ? '未連携' : 'キーが未設定') +
          '<span class="sub">TikTok アプリの受信箱（下書き）に送ります。一般公開まで自動で行うには TikTok の審査が必要なため、最後はアプリで確かめて公開してください。<button type="button" class="linkish" id="vp-tt-link"' + (rd.tiktokClient ? '' : ' disabled') + '>TikTok連携</button></span></div>' +
      '</div>' +
      '<p class="soc-small" id="vp-caps"></p>' +
      '<details class="soc-ai" open><summary>新しい投稿</summary><div class="soc-ai-body">' +
        '<div class="soc-fields">' +
          '<select id="vn-net" aria-label="投稿先">' + Object.keys(NET_LABEL).map(function (n) { return '<option value="' + n + '">' + NET_LABEL[n] + '</option>'; }).join('') + '</select>' +
          '<select id="vn-script" aria-label="元にする台本"><option value="">台本を使わない</option>' + d.scripts.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === S.scriptId ? ' selected' : '') + '>台本: ' + esc(s.title || '（無題）') + '</option>'; }).join('') + '</select>' +
        '</div>' +
        '<input type="text" id="vn-title" class="vid-in" maxlength="100" placeholder="タイトル（YouTube は必須・100文字まで）" style="margin-top:8px">' +
        '<textarea id="vn-caption" rows="4" placeholder="本文（キャプション）" style="margin-top:8px"></textarea>' +
        '<input type="text" id="vn-tags" class="vid-in" placeholder="ハッシュタグ（空白区切り・5個まで）" style="margin-top:8px">' +
        '<div id="vn-fit" class="soc-small" style="margin-top:6px"></div>' +
        '<label class="soc-lab" for="vn-file">動画ファイル</label><input type="file" id="vn-file" accept="video/mp4,video/quicktime,video/webm">' +
        '<div class="vid-row" style="margin-top:8px" id="vn-yt-opts">' +
          '<select id="vn-privacy" aria-label="公開範囲"><option value="public">公開</option><option value="unlisted">限定公開</option><option value="private">非公開</option></select>' +
          '<input type="datetime-local" id="vn-at" aria-label="公開日時（YouTube の予約公開）">' +
        '</div>' +
        '<div class="vid-row" style="margin-top:8px" id="vn-ig-opts"><input type="date" id="vn-date" aria-label="予約日（Instagram）"><span class="soc-small">予約する場合だけ日付を選んでください（明日以降）。</span></div>' +
        '<div class="vid-acts"><button type="button" id="vn-go">投稿する</button><button type="button" class="ghost" id="vn-draft">下書きとして保存</button><span class="soc-small" id="vn-state" aria-live="polite"></span></div>' +
      '</div></details>' +
      '<h3 class="soc-step">投稿の一覧</h3><div id="vp-list"></div>';

    function fillFromScript() {
      var s = d.scripts.filter(function (x) { return x.id === el('vn-script').value; })[0];
      if (!s) return;
      el('vn-title').value = s.title || '';
      el('vn-caption').value = [s.hook, s.body, s.cta].filter(Boolean).join('\n\n');
      el('vn-tags').value = (s.hashtags || []).join(' ');
      if (s.platform) el('vn-net').value = s.platform;
      opts(); fit();
    }
    function opts() {
      var net = el('vn-net').value;
      el('vn-yt-opts').style.display = net === 'youtube' ? '' : 'none';
      el('vn-ig-opts').style.display = net === 'instagram' ? '' : 'none';
    }
    function tags() { return el('vn-tags').value.split(/[\s、,]+/).map(function (t) { return t.replace(/^#/, ''); }).filter(Boolean); }
    function fit() {
      var net = el('vn-net').value;
      var P = V.PLATFORMS[net];
      var f = V.fitCaption(el('vn-caption').value, tags(), P.caption);
      var msg = '送る本文は ' + V.charLen(f.text) + ' / ' + P.caption + ' 文字。';
      if (f.trimmed) msg += 'ハッシュタグを残すため、本文の最後を ' + f.trimmed + ' 文字削ります（削るのは本文の25%まで）。';
      if (f.dropped.length) msg += '入りきらないため、ハッシュタグ ' + f.dropped.map(function (t) { return '#' + t; }).join(' ') + ' を外します。';
      if (tags().length > 5) msg += 'ハッシュタグは5個までがおすすめです。';
      el('vn-fit').textContent = msg;
    }
    el('vn-script').addEventListener('change', fillFromScript);
    el('vn-net').addEventListener('change', function () { opts(); fit(); });
    el('vn-caption').addEventListener('input', fit);
    el('vn-tags').addEventListener('input', fit);
    opts();
    if (el('vn-script').value) fillFromScript(); else fit();

    el('vp-yt-link').addEventListener('click', function () { connect('youtube'); });
    el('vp-tt-link').addEventListener('click', function () { connect('tiktok'); });
    el('vn-draft').addEventListener('click', function () { createPub(false); });
    el('vn-go').addEventListener('click', function () { createPub(true); });
    drawPubs();
    loadQueue();
  };

  async function connect(net) {
    if (demo()) { say('デモ版のため連携はできません。'); return; }
    var r = await api('/api/video-oauth?start=' + net);
    if (!r.data.ok) { say(r.data.message || '始められませんでした。'); return; }
    if (!r.data.willSave && !confirm('保存先（Upstash Redis）が未接続のため、許可のあとに表示される値を Vercel の環境変数に手で貼る必要があります。続けますか？')) return;
    window.open(r.data.url, '_blank', 'noopener');
    say('別のタブで許可してください。終わったら、この画面を読み込み直すと反映されます。', true);
  }

  async function loadQueue() {
    var r = await api('/api/video-publish');
    var d = r.data || {};
    S.pubQueue = d;
    var caps = d.caps || {};
    var t = Object.keys(caps).map(function (n) { return NET_LABEL[n] + ' ' + caps[n].used + '/' + caps[n].cap + '件'; }).join('、');
    var c = el('vp-caps');
    if (c) c.textContent = (t ? '直近24時間の投稿数（自前の安全弁）: ' + t + '。' : '') +
      (d.ready && d.ready.schedule && !d.ready.schedule.ok ? ' 予約: ' + d.ready.schedule.message : '') +
      (d.cron && d.cron.at ? ' 前回の自動処理: ' + new Date(d.cron.at).toLocaleString('ja-JP') + '（開始 ' + d.cron.started + '・公開 ' + d.cron.published + '・失敗 ' + d.cron.failed + '）' : '');
  }

  function pubRow(u) {
    var acts = [];
    if (u.status === 'failed' || u.status === 'draft') acts.push('<button type="button" class="linkish vp-send" data-id="' + esc(u.id) + '">' + (u.status === 'failed' ? 'もう一度送る' : '送る') + '</button>');
    if (u.status === 'processing') acts.push('<button type="button" class="linkish vp-ig" data-id="' + esc(u.id) + '">状況を確かめる</button>');
    if (u.status === 'scheduled' && u.platform === 'instagram') acts.push('<button type="button" class="linkish vp-unsch" data-id="' + esc(u.id) + '">予約を取り消す</button>');
    if (u.status === 'inbox') acts.push('<button type="button" class="linkish vp-tt" data-id="' + esc(u.id) + '">TikTok 側の状況</button>');
    if (u.external_id) acts.push('<button type="button" class="linkish vp-mx" data-id="' + esc(u.id) + '">数字を取る</button>');
    acts.push('<button type="button" class="linkish vp-del" data-id="' + esc(u.id) + '">削除</button>');
    var last = V.latestSnapshot(u);
    return '<div class="soc-post"><div class="when">' + esc(NET_LABEL[u.platform] || u.platform) + '　<span class="vid-tag ' + (u.status === 'published' || u.status === 'inbox' ? 'ok' : u.status === 'failed' ? 'ng' : '') + '">' + esc(STATUS_LABEL[u.status] || u.status) + '</span>' +
      (u.scheduled_for ? '　予約: ' + esc(u.scheduled_for) : '') + (u.published_at ? '　' + esc(new Date(u.published_at).toLocaleString('ja-JP')) : '') + '</div>' +
      '<div class="body">' + esc(u.title ? u.title + '\n' : '') + esc(String(u.caption || '').slice(0, 160)) + '</div>' +
      (u.error ? '<div class="mx" style="color:#b42318">' + esc(u.error) + '</div>' : '') +
      (u.external_url ? '<div class="mx"><a href="' + esc(u.external_url) + '" target="_blank" rel="noopener">投稿を開く</a></div>' : '') +
      (last ? '<div class="mx">最新の数字（' + esc(String(last.captured_at).slice(0, 10)) + '）: 再生 ' + int(last.views) + '・いいね ' + int(last.likes) + '・保存 ' + int(last.saves) + (last.avg_watch_sec != null ? '・平均視聴 ' + sec(last.avg_watch_sec) : '') + '</div>' : '') +
      '<div class="vid-links">' + acts.join('') + '</div></div>';
  }

  function drawPubs() {
    var host = el('vp-list');
    if (!host) return;
    var pubs = S.data.pubs || [];
    host.innerHTML = pubs.length ? pubs.map(pubRow).join('') : '<p class="soc-small">まだありません。</p>';
    host.onclick = async function (e) {
      var t = e.target;
      var id = t.getAttribute && t.getAttribute('data-id');
      if (!id) return;
      var u = S.data.pubs.filter(function (x) { return x.id === id; })[0];
      if (!u) return;
      if (t.classList.contains('vp-send')) {
        if (u.platform === 'youtube') { say('YouTube は動画ファイルをこのブラウザから送るため、上の「新しい投稿」で動画を選び直して送ってください。'); return; }
        await sendPub(u, null);
      }
      if (t.classList.contains('vp-ig')) await pollInstagram(u.id, 1);
      if (t.classList.contains('vp-unsch')) { var r = await pubApi({ action: 'unschedule', pub: u.id }); if (!r.data.ok) say(r.data.message); await reload(); }
      if (t.classList.contains('vp-tt')) { var r2 = await pubApi({ action: 'tiktok.status', pub: u.id }); say(r2.data.ok ? r2.data.label : r2.data.message, r2.data.ok); if (r2.data.ok) await reload(); }
      if (t.classList.contains('vp-mx')) await fetchMetrics(u.id);
      if (t.classList.contains('vp-del')) {
        if (!confirm('この投稿の記録を削除します（SNS上の投稿は消えません）。よろしいですか？')) return;
        await post({ action: 'pub.delete', id: u.id });
        await reload();
      }
    };
  }

  async function uploadToBlob(file, progress) {
    if (demo()) throw new Error('デモ版のため、アップロードはされません。');
    if (!S.ready.blob) throw new Error('動画の置き場所（Vercel Blob）が未接続です。「設定状況 › キーの入力」の「画像の置き場所（Vercel Blob）」をつないでください。');
    if (!window.lumBlobUpload) {
      await new Promise(function (ok, ng) {
        var sc = document.createElement('script');
        sc.src = '/blob-upload.js'; sc.onload = ok; sc.onerror = function () { ng(new Error('アップロードの部品を読み込めませんでした。')); };
        document.head.appendChild(sc);
      });
    }
    var safe = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-60) || 'video.mp4';
    var out = await window.lumBlobUpload('video/' + stamp() + '/' + safe, file, {
      access: 'public', handleUploadUrl: '/api/video-upload', contentType: file.type || 'video/mp4',
      headers: { Authorization: 'Bearer ' + window.lumAdmin.key() },
      multipart: file.size > 100 * 1048576,
      onUploadProgress: function (p) { progress('動画を置き場所に送っています… ' + Math.round(p.percentage) + '%'); }
    });
    return out.url;
  }

  async function createPub(now) {
    var st = el('vn-state');
    var net = el('vn-net').value;
    var file = el('vn-file').files[0] || null;
    var tags = el('vn-tags').value.split(/[\s、,]+/).map(function (t) { return t.replace(/^#/, ''); }).filter(Boolean);
    var item = {
      platform: net, script_id: el('vn-script').value, title: el('vn-title').value, caption: el('vn-caption').value, hashtags: tags,
      privacy: el('vn-privacy').value, status: 'draft'
    };
    var s = S.data.scripts.filter(function (x) { return x.id === item.script_id; })[0];
    if (s) {
      item.hook_type = s.hook_type || '';
      var chk = V.checkScript(s, project().brand, sources());
      if (chk.banned.length) { say('元の台本に禁止ワード（' + chk.banned.map(function (b) { return b.word; }).join('・') + '）が入っています。台本を直してから投稿してください。'); return; }
    }
    var cap = V.findBanned([item.title, item.caption], (project().brand || {}).banned_words);
    if (cap.length) { say('本文に禁止ワード（' + cap.map(function (b) { return b.word; }).join('・') + '）が入っています。'); return; }
    if (net === 'youtube' && !item.title.trim()) { say('YouTube はタイトルが必要です。'); return; }
    if (now && !file) { say('動画ファイルを選んでください。'); return; }
    if (file) {
      var meta = await videoMeta(URL.createObjectURL(file));
      item.duration_sec = meta.duration || null;
      item.video_size = file.size;
      var P = V.PLATFORMS[net];
      if (meta.duration && (meta.duration < P.minSec || meta.duration > P.maxSec) && !confirm(P.label + ' の長さの範囲（' + P.minSec + '〜' + P.maxSec + '秒）から外れています（' + Math.round(meta.duration) + '秒）。このまま進めますか？')) return;
    }
    var btns = [el('vn-go'), el('vn-draft')];
    btns.forEach(function (b) { b.disabled = true; });
    try {
      if (file && net !== 'youtube') {
        item.video_url = await uploadToBlob(file, function (t) { st.textContent = t; });
      }
      st.textContent = '記録しています…';
      var r = await post({ action: 'pub.save', item: item });
      if (!r.data.ok) throw new Error(r.data.message || '保存できませんでした。');
      var pub = r.data.item;
      if (now) {
        var date = net === 'instagram' ? el('vn-date').value : '';
        if (date) {
          var r2 = await pubApi({ action: 'schedule', pub: pub.id, date: date });
          if (!r2.data.ok) throw new Error(r2.data.message);
          say(r2.data.message, true);
        } else {
          await sendPub(pub, file, function (t) { st.textContent = t; });
        }
      } else say('下書きとして保存しました。', true);
      await reload();
    } catch (e) {
      say(String((e && e.message) || e));
    } finally {
      st.textContent = '';
      btns.forEach(function (b) { if (b) b.disabled = false; });
    }
  }

  async function sendPub(pub, file, progress) {
    progress = progress || function (t) { say(t, true); };
    if (pub.platform === 'instagram') {
      progress('Instagram に送っています…');
      var r = await pubApi({ action: 'instagram.start', pub: pub.id });
      if (!r.data.ok) { say(r.data.message || '送れませんでした。'); await reload(); return; }
      say(r.data.message, true);
      await reload();
      await pollInstagram(pub.id, 60);
    } else if (pub.platform === 'tiktok') {
      progress('TikTok に送っています（大きな動画は1分ほどかかります）…');
      var r3 = await pubApi({ action: 'tiktok.send', pub: pub.id });
      say(r3.data.ok ? r3.data.message : (r3.data.message || '送れませんでした。'), r3.data.ok);
      await reload();
    } else if (pub.platform === 'youtube') {
      await uploadYouTube(pub, file, progress);
      await reload();
    }
  }

  /** Instagram の準備ができるまで、5秒おきに短く聞きます（1回の問い合わせは数秒）。 */
  async function pollInstagram(id, times) {
    if (S.polling[id]) return;
    S.polling[id] = true;
    try {
      for (var i = 0; i < times; i++) {
        var r = await pubApi({ action: 'instagram.status', pub: id });
        var d = r.data || {};
        if (d.state === 'published') { say(d.message || '公開しました。', true); await reload(); return; }
        if (!d.ok || d.state === 'failed') { say(d.message || '公開できませんでした。'); await reload(); return; }
        if (times > 1) say('Instagram が動画を準備しています…（' + (i + 1) * 5 + '秒）', true);
        if (i < times - 1) await new Promise(function (ok) { setTimeout(ok, 5000); });
      }
      say('まだ準備中です。この画面を閉じても、毎朝の自動処理か、次にこの画面を開いたときに公開します。', true);
    } finally { delete S.polling[id]; }
  }

  function resumePolling() {
    if (!S.data || !S.data.pubs || demo()) return;
    S.data.pubs.forEach(function (u) { if (u.status === 'processing' && u.platform === 'instagram') pollInstagram(u.id, 12); });
  }

  /** YouTube へはブラウザから直接、8MB ずつ送ります（途中で切れても続きから）。 */
  async function uploadYouTube(pub, file, progress) {
    if (demo()) { say('デモ版のため、アップロードはされません。'); return; }
    if (!file) { say('動画ファイルを選んでください。'); return; }
    var t = await pubApi({ action: 'youtube.token' });
    if (!t.data.ok) { say(t.data.message || 'YouTube の鍵を作れませんでした。'); return; }
    var at = el('vn-at') && el('vn-at').value ? new Date(el('vn-at').value).toISOString() : '';
    var f = V.fitCaption(pub.caption, pub.hashtags, V.PLATFORMS.youtube.caption);
    var meta = {
      snippet: { title: (pub.title || '').slice(0, 100), description: f.text, tags: pub.hashtags.slice(0, 15), categoryId: '22' },
      status: { privacyStatus: at ? 'private' : pub.privacy, selfDeclaredMadeForKids: false }
    };
    if (at) meta.status.publishAt = at;
    progress('YouTube の受け口を用意しています…');
    var init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + t.data.token, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(file.size), 'X-Upload-Content-Type': file.type || 'video/mp4' },
      body: JSON.stringify(meta)
    }).catch(function () { return null; });
    var loc = init && init.ok ? init.headers.get('Location') : '';
    if (!loc) {
      var why = '';
      try { why = ((await init.json()).error || {}).message || ''; } catch (_) {}
      say('YouTube に受け付けてもらえませんでした' + (why ? '（' + why + '）' : '') + '。YouTube Data API v3 が有効か、連携し直しが要らないか確かめてください。');
      await post({ action: 'pub.save', item: Object.assign({}, pub, { status: 'failed', error: 'YouTube の受け口を作れませんでした' + (why ? '（' + why + '）' : '') }) });
      return;
    }
    var CH = 8 * 1024 * 1024;
    var sent = 0, tries = 0, done = null;
    while (!done) {
      var end = Math.min(file.size, sent + CH);
      var res = await fetch(loc, { method: 'PUT', headers: { 'Content-Range': 'bytes ' + sent + '-' + (end - 1) + '/' + file.size }, body: file.slice(sent, end) }).catch(function () { return null; });
      if (res && (res.status === 200 || res.status === 201)) { done = await res.json(); break; }
      if (res && res.status === 308) {
        var rg = res.headers.get('Range');
        sent = rg ? Number(rg.split('-')[1]) + 1 : 0;
        tries = 0;
      } else {
        // 切れたら、どこまで届いたかを聞いて続きから送ります（3回まで）。
        if (++tries > 3) { say('YouTube への送信が途中で止まりました。ネットの接続を確かめて、もう一度送ってください。'); await post({ action: 'pub.save', item: Object.assign({}, pub, { status: 'failed', error: 'YouTube への送信が途中で止まりました' }) }); return; }
        await new Promise(function (ok) { setTimeout(ok, 2000 * tries); });
        var q = await fetch(loc, { method: 'PUT', headers: { 'Content-Range': 'bytes */' + file.size } }).catch(function () { return null; });
        if (q && q.status === 308) { var rg2 = q.headers.get('Range'); sent = rg2 ? Number(rg2.split('-')[1]) + 1 : 0; }
        if (q && (q.status === 200 || q.status === 201)) { done = await q.json(); break; }
      }
      progress('YouTube に送っています… ' + Math.round((sent / file.size) * 100) + '%');
    }
    var r = await pubApi({ action: 'youtube.done', pub: pub.id, videoId: done.id, publishAt: at });
    say(r.data.ok ? (at ? 'YouTube に予約公開で送りました（' + new Date(at).toLocaleString('ja-JP') + '）。' : 'YouTube に送りました。') + 'Google の審査前のプロジェクトからは「非公開」になります。YouTube Studio で確かめてください。' : (r.data.message || '記録できませんでした。'), r.data.ok);
  }

  async function fetchMetrics(id) {
    var r = await pubApi({ action: 'metrics', pub: id });
    if (!r.data.ok) { say(r.data.message || '数字を取れませんでした。'); return false; }
    return true;
  }

  /* ---------------- 8. 数字 ---------------- */

  function ownRows(metric) {
    return (S.data.pubs || []).map(function (u) {
      var snap = V.latestSnapshot(u);
      var pt = V.jstParts(u.published_at);
      var script = S.data.scripts.filter(function (s) { return s.id === u.script_id; })[0];
      return {
        id: u.id, value: V.metricValue(snap, metric),
        hook_type: u.hook_type || (script && script.hook_type) || '',
        duration: V.durationBucket(u.duration_sec || (script && script.target_duration_sec)),
        hour: pt.hour, weekday: pt.weekday
      };
    });
  }

  R.metrics = function (host) {
    if (needProject(host)) return;
    var pubs = (S.data.pubs || []).filter(function (u) { return u.external_id || (u.snapshots || []).length; });
    var metric = S.metric || 'views';
    host.innerHTML = '<h3 class="soc-step">8　数字の取得</h3>' +
      '<p class="soc-small">数字は、押したときに各SNSから取りに行き、その時点の値として記録します（何度でも取れます。あとから伸びを比べられます）。' +
      'Instagram はリールのインサイト（再生・リーチ・保存・平均視聴時間）、YouTube は再生・高評価・コメント、TikTok は動画IDが分かる場合だけ取れます。</p>' +
      '<div class="vid-acts"><button type="button" id="vm-all"' + (pubs.some(function (u) { return u.external_id; }) ? '' : ' disabled') + '>公開済みの数字をまとめて取る</button><span class="soc-small" id="vm-state"></span></div>' +
      '<div class="tbl vid-scroll"><table class="vid-table"><thead><tr><th>投稿先</th><th>投稿</th><th>日時</th><th>再生</th><th>いいね</th><th>保存</th><th>平均視聴</th><th>維持率</th><th>取得</th></tr></thead><tbody>' +
      (pubs.length ? pubs.map(function (u) {
        var s = V.latestSnapshot(u) || {};
        return '<tr><td>' + esc(NET_LABEL[u.platform] || u.platform) + '</td><td style="min-width:160px">' + esc(String(u.title || u.caption || '').slice(0, 40)) + '</td><td>' + esc(String(u.published_at || '').slice(0, 10)) + '</td>' +
          '<td>' + int(s.views) + '</td><td>' + int(s.likes) + '</td><td>' + int(s.saves) + '</td><td>' + sec(s.avg_watch_sec) + '</td><td>' + pct(s.retention_rate) + '</td>' +
          '<td>' + (u.external_id ? '<button type="button" class="linkish vm-one" data-id="' + esc(u.id) + '">取る</button>' : '—') + '</td></tr>';
      }).join('') : '<tr><td colspan="9" class="empty">公開済みの投稿がまだありません。</td></tr>') +
      '</tbody></table></div>' +
      '<h3 class="soc-step" style="margin-top:18px">伸ばす仕組み（自社の投稿どうしの比較）</h3>' +
      '<p class="soc-small">フックの型・長さ・投稿した時間帯・曜日で、自社の投稿を比べます。たまたまの差を「勝ちパターン」と呼ばないよう、投稿が6本以上、比べる値ごとに3本以上そろうまでは結果を出しません。区間は 95%（ブートストラップ・乱数の種 ' + V.RULES.stats.BOOTSTRAP_SEED + ' で固定）です。</p>' +
      '<div class="vid-row"><label class="soc-lab" for="vm-metric" style="margin:0">比べる数字</label><select id="vm-metric">' +
        Object.keys(V.METRICS).map(function (k) { return '<option value="' + k + '"' + (k === metric ? ' selected' : '') + '>' + V.METRICS[k].label + '</option>'; }).join('') + '</select></div>' +
      '<div id="vm-learn"></div>';
    var rows = ownRows(metric);
    el('vm-learn').innerHTML = [['hook_type', 'フックの型'], ['duration', '長さ'], ['hour', '時間帯'], ['weekday', '曜日']].map(function (a) {
      var r = V.attributeInsight(rows, a[0], metric);
      if (!r.ok) return '<div class="soc-res"><b>' + a[1] + '</b><span>まだ判断できません。' + esc(r.message) + '</span></div>';
      return '<div class="soc-res ' + (r.clear ? 'ok' : '') + '"><b>' + a[1] + '</b><span>' + r.values.map(function (v) {
        var name = a[0] === 'hook_type' ? (V.HOOK_LABELS[v.value] || v.value) : v.value;
        return esc(name) + ': 平均 ' + fmtMetric(metric, v.mean) + '（' + fmtMetric(metric, v.low) + '〜' + fmtMetric(metric, v.high) + '、' + v.n + '本・' + v.reliability.label + '）';
      }).join('<br>') + '<br>' + (r.clear ? '一番上と二番目の区間が重なっていないので、差があると言えます。' : '区間が重なっているので、差があるとはまだ言えません。') + '</span></div>';
    }).join('');
    el('vm-metric').addEventListener('change', function () { S.metric = this.value; R.metrics(host); });
    host.querySelectorAll('.vm-one').forEach(function (b) {
      b.addEventListener('click', async function () { if (await fetchMetrics(b.getAttribute('data-id'))) { await reload(); say('数字を取りました。', true); } });
    });
    el('vm-all').addEventListener('click', async function () {
      var list = pubs.filter(function (u) { return u.external_id; });
      this.disabled = true;
      var ok = 0;
      for (var i = 0; i < list.length; i++) {
        el('vm-state').textContent = '取っています… ' + (i + 1) + ' / ' + list.length;
        if (await fetchMetrics(list[i].id)) ok++;
      }
      this.disabled = false;
      el('vm-state').textContent = '';
      await reload();
      say(ok + '件の数字を取りました。' + (ok < list.length ? '取れなかったものは、上に理由が出ています。' : ''), ok === list.length);
    });
  };

  /* ---------------- 9. PDCA ---------------- */

  R.pdca = function (host) {
    if (needProject(host)) return;
    var cycles = S.data.pdca || [];
    var editing = S.pdcaEdit != null ? cycles.filter(function (c) { return c.id === S.pdcaEdit; })[0] || { stage: 'plan', target: { metric: 'views' }, publication_ids: [] } : null;
    host.innerHTML = '<h3 class="soc-step">9　PDCA</h3>' +
      '<p class="soc-small">「こうすれば伸びるはず」という仮説を1つずつ立て、投稿を紐づけて確かめます。判定は、紐づけた投稿の値の平均の区間（95%）が基準値の上か下かで行います。' +
      '紐づけた投稿が3本未満なら「まだ判断できません」、3〜5本は参考程度、6〜11本は使える、12本以上で十分です。</p>' +
      '<div class="vid-acts"><button type="button" id="vd-new">仮説を立てる</button></div>' +
      '<div id="vd-form"></div>' +
      cycles.map(function (c) {
        var v = V.pdcaVerdict(c, S.data.pubs);
        var m = c.target || {};
        return '<div class="soc-post"><div class="when">' + esc(STAGE_LABEL[c.stage] || c.stage) + '　<span class="vid-tag ' + (v.verdict === 'improved' ? 'ok' : v.verdict === 'worse' ? 'ng' : '') + '">' + esc(v.reliability.label) + '</span></div>' +
          '<div class="body"><b>' + esc(c.title) + '</b>\n' + esc(c.hypothesis) + '</div>' +
          '<div class="mx">指標: ' + esc((V.METRICS[m.metric] || {}).label || m.metric || '未設定') + '・基準値 ' + (m.baseline == null ? '—' : fmtMetric(m.metric, m.baseline)) + (m.target != null ? '・目標の伸び ' + esc(m.target) : '') + '・紐づけた投稿 ' + (c.publication_ids || []).length + '本</div>' +
          '<div class="mx">判定: ' + esc(v.label) + (v.ci ? '（平均 ' + fmtMetric(m.metric, v.ci.mean) + '、区間 ' + fmtMetric(m.metric, v.ci.low) + '〜' + fmtMetric(m.metric, v.ci.high) + '）' : '') + '</div>' +
          (c.learnings ? '<div class="mx">学び: ' + esc(c.learnings) + '</div>' : '') +
          ((c.next_actions || []).length ? '<div class="mx">次にやること: ' + c.next_actions.map(esc).join(' ／ ') + '</div>' : '') +
          '<div class="mx"><button type="button" class="linkish vd-edit" data-id="' + esc(c.id) + '">直す</button>　<button type="button" class="linkish vd-del" data-id="' + esc(c.id) + '">削除</button></div></div>';
      }).join('');
    el('vd-new').addEventListener('click', function () { S.pdcaEdit = ''; R.pdca(host); });
    host.querySelectorAll('.vd-edit').forEach(function (b) { b.addEventListener('click', function () { S.pdcaEdit = b.getAttribute('data-id'); R.pdca(host); }); });
    host.querySelectorAll('.vd-del').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('この仮説を削除します。よろしいですか？')) return;
        await post({ action: 'pdca.delete', id: b.getAttribute('data-id') });
        await reload();
      });
    });
    if (!editing) return;
    var c = editing;
    var t = c.target || {};
    el('vd-form').innerHTML = '<div class="soc-ai"><div class="soc-fields">' +
        '<input type="text" id="vd-title" maxlength="200" placeholder="仮説の名前（例：冒頭3秒を問いかけにする）" value="' + esc(c.title) + '">' +
        '<select id="vd-stage" aria-label="段階">' + Object.keys(STAGE_LABEL).map(function (k) { return '<option value="' + k + '"' + (c.stage === k ? ' selected' : '') + '>' + STAGE_LABEL[k] + '</option>'; }).join('') + '</select>' +
        '<select id="vd-metric" aria-label="指標">' + Object.keys(V.METRICS).map(function (k) { return '<option value="' + k + '"' + (t.metric === k ? ' selected' : '') + '>' + V.METRICS[k].label + '</option>'; }).join('') + '</select>' +
        '<input type="number" step="any" id="vd-base" placeholder="基準値（割合は 0.45 のように）" value="' + esc(t.baseline == null ? '' : t.baseline) + '">' +
      '</div>' +
      '<textarea id="vd-hypo" rows="2" placeholder="仮説（なぜそうなると考えるか）" style="margin-top:8px">' + esc(c.hypothesis) + '</textarea>' +
      '<label class="soc-lab">紐づける投稿</label><div class="vid-checks">' + (S.data.pubs.length ? S.data.pubs.map(function (u) {
        return '<label><input type="checkbox" class="vd-pub" value="' + esc(u.id) + '"' + ((c.publication_ids || []).indexOf(u.id) >= 0 ? ' checked' : '') + '> ' + esc(NET_LABEL[u.platform] || u.platform) + '・' + esc(String(u.title || u.caption || '').slice(0, 30)) + '</label>';
      }).join('') : '<span class="soc-small">投稿がまだありません。</span>') + '</div>' +
      '<textarea id="vd-learn" rows="2" placeholder="学び（Check のあとに）" style="margin-top:8px">' + esc(c.learnings) + '</textarea>' +
      '<textarea id="vd-next" rows="2" placeholder="次にやること（1行に1つ）" style="margin-top:8px">' + esc((c.next_actions || []).join('\n')) + '</textarea>' +
      '<div class="vid-acts"><button type="button" id="vd-save">保存</button><button type="button" class="ghost" id="vd-cancel">やめる</button></div></div>';
    el('vd-cancel').addEventListener('click', function () { S.pdcaEdit = null; R.pdca(host); });
    el('vd-save').addEventListener('click', async function () {
      var item = {
        id: c.id, created_at: c.created_at, title: el('vd-title').value, stage: el('vd-stage').value, hypothesis: el('vd-hypo').value,
        target: { metric: el('vd-metric').value, baseline: num(el('vd-base').value), target: t.target },
        publication_ids: Array.prototype.map.call(document.querySelectorAll('.vd-pub:checked'), function (x) { return x.value; }),
        learnings: el('vd-learn').value, next_actions: el('vd-next').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean)
      };
      var r = await post({ action: 'pdca.save', item: item });
      if (!r.data.ok) { say(r.data.message || '保存できませんでした。'); return; }
      S.pdcaEdit = null;
      await reload();
      say('保存しました。', true);
    });
  };

  /* ---------------- 10. snsauto から取り込む ---------------- */

  var TABLE_LABEL = {
    projects: 'プロジェクト', social_accounts: '連携アカウント', research_runs: 'リサーチ', competitor_posts: '競合の投稿',
    structure_analyses: '構成分析', scripts: '台本', storyboards: '絵コンテ', shots: 'カット', publications: '投稿',
    metric_snapshots: '数字の記録', pdca_cycles: 'PDCA'
  };

  R['import'] = function (host) {
    host.innerHTML = '<h3 class="soc-step">10　snsauto から取り込む</h3>' +
      '<p class="soc-small">snsauto の「移行ファイル」（.zip）を選ぶと、まずこのブラウザの中で中身を読み、件数を見せます。取り込むのは確認のあとです。' +
      'SNS のトークン（鍵）は移行ファイルに入っていないため、連携アカウントは「再連携が必要」として入ります。同じファイルを2回取り込んでも、重複せず上書きになります。</p>' +
      '<input type="file" id="vi-file" accept=".zip,application/zip">' +
      '<div id="vi-out" style="margin-top:10px"></div>';
    el('vi-file').addEventListener('change', async function () {
      var f = this.files[0];
      if (!f) return;
      var out = el('vi-out');
      out.innerHTML = '<p class="soc-small">読んでいます…</p>';
      try {
        if (!window.DecompressionStream) throw new Error('このブラウザは zip の展開に対応していません。最新の Chrome・Edge・Safari・Firefox でお試しください。');
        var bytes = new Uint8Array(await f.arrayBuffer());
        var files = await V.readZip(bytes, function (n) { return n === 'manifest.json' || /^data\/[a-z_]+\.json$/.test(n); });
        var parsed = V.snsautoTables(files);
        var counts = V.snsautoCounts(parsed.tables);
        var mapped = V.mapSnsauto(parsed.tables);
        S.importing = mapped;
        out.innerHTML =
          '<div class="tbl vid-scroll"><table class="vid-table" id="vi-counts"><thead><tr><th>中身</th><th>件数</th></tr></thead><tbody>' +
          Object.keys(counts).map(function (k) { return '<tr data-table="' + k + '"><td>' + esc(TABLE_LABEL[k] || k) + '</td><td>' + counts[k] + '</td></tr>'; }).join('') +
          '</tbody></table></div>' +
          '<p class="soc-small">書き出し日時: ' + esc(parsed.manifest.exported_at || '不明') + '・範囲: ' + esc(parsed.manifest.scope || '不明') + (parsed.manifest.excluded && parsed.manifest.excluded.length ? '・入っていないもの: ' + parsed.manifest.excluded.map(esc).join('、') : '') + '</p>' +
          '<p class="soc-small">取り込み先: ' + mapped.projects.map(function (p) { return '「' + esc(p.project.name) + '」（競合 ' + p.posts.length + '・台本 ' + p.scripts.length + '・投稿 ' + p.pubs.length + '・PDCA ' + p.pdca.length + '）'; }).join('、') + '</p>' +
          '<div class="vid-acts"><button type="button" id="vi-go"' + (S.stored ? '' : ' disabled') + '>この内容で取り込む</button><span class="soc-small" id="vi-state" aria-live="polite"></span></div>' +
          (S.stored ? '' : '<p class="soc-small">保存先（Upstash Redis）が未接続のため、取り込めません。</p>');
        el('vi-go').addEventListener('click', runImport);
      } catch (e) {
        out.innerHTML = '<div class="soc-res ng"><b>読めません</b><span>' + esc(String((e && e.message) || e)) + '</span></div>';
      }
    });
  };

  async function runImport() {
    var m = S.importing;
    var st = el('vi-state');
    var btn = el('vi-go');
    btn.disabled = true;
    try {
      for (var i = 0; i < m.projects.length; i++) {
        var p = m.projects[i];
        st.textContent = '「' + p.project.name + '」を取り込んでいます…';
        var r = await send('/api/video', 'PUT', { kind: 'project', project: p.project });
        if (!r.data.ok) throw new Error(r.data.message || 'プロジェクトを保存できませんでした。');
        var kinds = [['posts', p.posts], ['scripts', p.scripts], ['pubs', p.pubs], ['pdca', p.pdca]];
        for (var k = 0; k < kinds.length; k++) {
          var items = kinds[k][1];
          for (var j = 0; j < items.length; j += 50) {
            st.textContent = '「' + p.project.name + '」: ' + kinds[k][0] + ' ' + Math.min(items.length, j + 50) + ' / ' + items.length;
            var r2 = await send('/api/video', 'PUT', { kind: kinds[k][0], project: p.project.id, items: items.slice(j, j + 50) });
            if (!r2.data.ok) throw new Error(r2.data.message || '保存できませんでした。');
          }
        }
      }
      if (m.accounts.length) {
        var r3 = await send('/api/video', 'PUT', { kind: 'accounts', items: m.accounts });
        if (!r3.data.ok) throw new Error(r3.data.message || '連携アカウントを保存できませんでした。');
      }
      st.textContent = '';
      await loadList();
      if (m.projects[0]) await pick(m.projects[0].project.id, true);
      go('project');
      say('取り込みました。連携アカウントは「再連携が必要」です。「投稿」の画面から連携し直してください。', true);
    } catch (e) {
      st.textContent = '';
      say(String((e && e.message) || e) + '（途中まで入ったものは、もう一度取り込むと上書きされます）');
    } finally { if (btn) btn.disabled = false; }
  }

  /* ---------------- 開始 ---------------- */

  window.lumVideoInit = async function () {
    if (S.started) return;
    S.started = true;
    if (!V) { el('video-admin').innerHTML = '<p class="msg show">部品（/video-core.js）を読み込めませんでした。再読み込みしてください。</p>'; return; }
    shell();
    try { S.sec = sessionStorage.getItem('lum_video_sec') || 'project'; } catch (_) {}
    if (!SECTIONS.some(function (s) { return s[0] === S.sec; })) S.sec = 'project';
    await loadList();
    go(S.sec);
  };
})();
