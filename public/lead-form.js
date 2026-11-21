/* 申込フォーム（/training.html・/salon.html・/partners.html）。
 *
 * 送り先はトップのお問い合わせと同じ /api/contact です。届いた申込は、
 * 管理画面の「問い合わせ管理」に残り、メールとLINEで知らせが来ます。
 * 研修と美容室の申込は、見積書の「問い合わせから作る」がそのまま読める形
 * （【題名】の概算見積り／・項目: 値／概算: ¥…）で本文を組み立てます。
 *
 * 助成金の目安（data-subsidy の JSON）は、研修のページだけにあります。 */
(function () {
  'use strict';
  var yen = function (n) { return '¥' + Math.round(Number(n) || 0).toLocaleString('ja-JP'); };
  function val(f, name) { var x = f.elements[name]; return x ? String(x.value || '').trim() : ''; }
  function visit() {
    try { var x = JSON.parse(sessionStorage.getItem('lum_s') || 'null'); return x ? { s: x.src || '', m: x.med || '', c: x.cmp || '', r: x.ref || '' } : null; } catch (_) { return null; }
  }

  function buildTraining(f, plans) {
    var p = plans.filter(function (x) { return x.id === val(f, 'plan'); })[0] || plans[0];
    var n = Math.max(1, Number(val(f, 'people')) || 1);
    var lines = [
      '【' + p.short + '】の概算見積り',
      '・研修: ' + p.name,
      '・受講予定: ' + n + '名',
      '・社員数: ' + (val(f, 'staff') || '未記入'),
      '・希望時期: ' + (val(f, 'when') || '未定'),
      '・助成金: ' + (val(f, 'subsidy') || '未記入'),
      '・形式: ' + (val(f, 'style') || '未記入'),
      '概算: ' + yen(p.price) + '〜' + yen(p.price) + '（税別）',
      '',
      '研修で解決したいこと:',
      val(f, 'goal') || '（未記入）'
    ];
    return { topics: ['ai'], message: lines.join('\n') };
  }
  function buildSalon(f, salon) {
    var m = salon.monitor;
    var lines = [
      '【美容室まとめパック（モニター）】の概算見積り',
      '・店名: ' + (val(f, 'company') || '未記入'),
      '・地域: ' + (val(f, 'area') || '未記入'),
      '・スタッフ: ' + (val(f, 'staff') || '未記入'),
      '・いまの予約の受け方: ' + (val(f, 'booking') || '未記入'),
      '・Instagram: ' + (val(f, 'insta') || 'なし'),
      '概算: 月額' + yen(m.monthly) + '（モニター' + m.months + 'か月・初期' + yen(m.setup) + '）',
      '',
      'いちばん困っていること:',
      val(f, 'goal') || '（未記入）'
    ];
    return { topics: ['sns'], message: lines.join('\n') };
  }
  function buildPartner(f) {
    var lines = [
      '【社労士の先生からの提携のご相談】',
      '・事務所名: ' + (val(f, 'company') || '未記入'),
      '・所在地: ' + (val(f, 'area') || '未記入'),
      '・顧問先の規模: ' + (val(f, 'clients') || '未記入'),
      '・ご希望: ' + (val(f, 'want') || '未記入'),
      '',
      val(f, 'goal') || '（ご相談の内容は未記入）'
    ];
    return { topics: ['ai'], message: lines.join('\n') };
  }

  function bind(f) {
    var kind = f.getAttribute('data-kind');
    var data = {};
    try { data = JSON.parse(f.getAttribute('data-offer') || '{}'); } catch (_) {}
    var out = f.querySelector('.lf-out');
    var btn = f.querySelector('button[type=submit]');
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      out.className = 'lf-out';
      if (!val(f, 'name') || !val(f, 'email')) { out.textContent = 'お名前とメールアドレスを入れてください。'; out.className = 'lf-out ng'; return; }
      if (f.elements.agree && !f.elements.agree.checked) { out.textContent = '個人情報の取り扱いに同意のうえ、送信してください。'; out.className = 'lf-out ng'; return; }
      var b = kind === 'training' ? buildTraining(f, data.plans || []) : kind === 'salon' ? buildSalon(f, data.salon || { monitor: {} }) : buildPartner(f);
      btn.disabled = true; out.textContent = '送っています…';
      try {
        var r = await fetch('/api/contact', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: val(f, 'name'), email: val(f, 'email'), phone: val(f, 'phone'), company: val(f, 'company'),
            orgType: kind === 'salon' ? 'sole' : 'company', topics: b.topics, message: b.message.slice(0, 1000),
            website: val(f, 'website'), page: location.pathname, src: visit()
          })
        });
        var j = await r.json().catch(function () { return {}; });
        if (r.ok && j.ok) {
          f.reset();
          out.className = 'lf-out ok';
          out.innerHTML = '受け付けました。2営業日以内にメールでご連絡します。<br>すぐに話したい方は、<a href="/book.html">30分のオンライン相談の日時を選ぶ</a>こともできます。';
          if (window.lumTrack) try { window.lumTrack('lead_' + kind); } catch (_) {}
        } else {
          out.className = 'lf-out ng';
          out.textContent = j.message || '送れませんでした。時間をおいてもう一度お試しいただくか、お問い合わせページからご連絡ください。';
        }
      } catch (_) {
        out.className = 'lf-out ng';
        out.textContent = '通信できませんでした。電波のよい所でもう一度お試しください。';
      }
      btn.disabled = false;
    });
  }

  /* 助成金の目安。決まった率・上限を当てはめるだけの計算で、受け取れる額を約束するものではありません。 */
  function bindCalc(box) {
    var s = {};
    try { s = JSON.parse(box.getAttribute('data-subsidy') || '{}'); } catch (_) { return; }
    var plans = s.plans || [];
    function calc() {
      var p = plans.filter(function (x) { return x.id === box.querySelector('[name=cplan]').value; })[0] || plans[0];
      var n = Math.max(1, Math.min(200, Number(box.querySelector('[name=cpeople]').value) || 1));
      var fee = Math.max(0, Number(box.querySelector('[name=cfee]').value) || p.price);
      var capPer = 0;
      (s.caps || []).forEach(function (c) { if (p.hours >= c.from) capPer = c.cap; });
      var feeAid = Math.min(Math.floor(fee * s.rate), capPer * n);
      var wage = s.wage ? s.wage * p.hours * n : 0;
      var total = feeAid + wage;
      var pay = Math.max(0, fee - feeAid);
      box.querySelector('.lf-calc-out').innerHTML =
        '<b>助成の目安 ' + yen(total) + '</b>（受講料の助成 ' + yen(feeAid) + (wage ? '＋研修中の賃金の助成 ' + yen(wage) : '') + '）<br>' +
        '受講料 ' + yen(fee) + ' のうち、会社の負担の目安 ' + yen(pay) + (wage ? '（賃金の助成を差し引くと ' + yen(Math.max(0, pay - wage)) + '）' : '') +
        '<br><span class="lf-small">' + (p.hours < s.minHours ? 'この研修は' + p.hours + '時間なので、対象の目安（' + s.minHours + '時間以上）に届きません。実務研修をお選びください。' : s.note) + '</span>';
      if (p.hours < s.minHours) box.querySelector('.lf-calc-out').innerHTML = '<b>この研修は対象外の目安です</b><br><span class="lf-small">' + p.hours + '時間の研修は、助成の対象の目安（' + s.minHours + '時間以上）に届きません。実務研修（10時間）をお選びください。</span>';
    }
    box.addEventListener('input', calc);
    box.addEventListener('change', function (e) {
      if (e.target.name === 'cplan') {
        var p = plans.filter(function (x) { return x.id === e.target.value; })[0];
        if (p) box.querySelector('[name=cfee]').value = p.price;
      }
      calc();
    });
    calc();
  }

  document.querySelectorAll('form.lf').forEach(bind);
  document.querySelectorAll('.lf-calc').forEach(bindCalc);
})();
