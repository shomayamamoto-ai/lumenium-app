/* 管理画面の線のアイコン（絵文字の代わり）。
 *
 * サイト本体の src/components/LineIcon.jsx と同じ描き方です：24×24 の枠、
 * 線の太さ 1.6、角は丸め、色は文字と同じ（currentColor）。
 * ページに1つだけ <svg id="ui-icons"> の束（スプライト）を置き、各画面は
 *   window.lumIcon('bell')            → '<svg class="ui-icon">…</svg>' の文字列
 *   window.lumIcon('bell', 'sm')      → 小さい版（.ui-icon.sm）
 * で使います。名前の一覧は window.lumIcon.names。 */
(function () {
  var P = {
    // LineIcon.jsx と同じもの
    video: 'M3.5 7.5h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 2 15V9a1.5 1.5 0 0 1 1.5-1.5Z M16 10.5l5-3v9l-5-3',
    chat: 'M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9l-4.5 3.5v-3.5H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z M8 11h.01M12 11h.01M16 11h.01',
    web: 'M3 5h18v11H3z M3 8.5h18 M9 20h6 M12 16v4',
    pen: 'M4 20l3.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z M13.5 7l3 3',
    megaphone: 'M4 10v4h3l7 4V6L7 10H4Z M17.5 9.5a3.5 3.5 0 0 1 0 5',
    chart: 'M4 20V4 M4 20h16 M8 16v-4 M12 16V8 M16 16v-6',
    search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z M15.3 15.3 20 20',
    users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5 M16 11a2.5 2.5 0 1 0 0-5 M17 14.6c1.9.4 3.1 1.8 3.5 4.4',
    close: 'M6 6l12 12M18 6L6 18',
    // 管理画面で足したもの
    home: 'M3.5 11 12 4l8.5 7 M5.5 9.5V20h13V9.5 M10 20v-5h4v5',
    bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15Z M10 20.5h4',
    calendar: 'M4 6h16v14H4z M4 10h16 M8 3.5v4 M16 3.5v4',
    mail: 'M3.5 6h17v12h-17z M3.5 6.5 12 13l8.5-6.5',
    inbox: 'M3.5 13.5 6 5h12l2.5 8.5v5h-17z M3.5 13.5H9l1 2h4l1-2h5.5',
    star: 'M12 3.8l2.5 5.2 5.6.8-4.1 4 1 5.6L12 16.8l-5 2.6 1-5.6-4.1-4 5.6-.8Z',
    file: 'M6 3.5h8l4 4v13H6z M14 3.5v4h4 M9 12h6 M9 15.5h6',
    shield: 'M12 3.5l7 2.5v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6Z M9 12l2 2 4-4',
    settings: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 4.5v5 M9 14.5v5',
    sparkle: 'M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2-5.2-1.8 5.2-1.8Z M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z',
    refresh: 'M19.5 12a7.5 7.5 0 0 1-13 5.1 M4.5 12a7.5 7.5 0 0 1 13-5.1 M17.5 3.5V7H14 M6.5 20.5V17H10',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    alert: 'M12 4 2.8 19.5h18.4Z M12 10v4.5 M12 17.2h.01',
    info: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z M12 11v5.5 M12 7.8h.01',
    help: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6 M12 16.8h.01',
    list: 'M9 6.5h11 M9 12h11 M9 17.5h11 M4.5 6.5h.01 M4.5 12h.01 M4.5 17.5h.01',
    menu: 'M4 7h16 M4 12h16 M4 17h16',
    external: 'M14 4.5h5.5V10 M19.5 4.5 11 13 M17 14v5.5H4.5V7H10',
    logout: 'M14 4.5H5.5v15H14 M10 12h10 M16.5 8.5 20 12l-3.5 3.5',
    clock: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z M12 7.5V12l3 2',
    key: 'M8 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M11.5 12h9 M17.5 12v3 M20.5 12v2',
    plus: 'M12 5v14 M5 12h14',
    chevron: 'M6 9l6 6 6-6',
    dot: 'M12 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z'
  };

  function sprite() {
    if (document.getElementById('ui-icons')) return;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('id', 'ui-icons');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    Object.keys(P).forEach(function (k) {
      var s = document.createElementNS(ns, 'symbol');
      s.setAttribute('id', 'ui-i-' + k);
      s.setAttribute('viewBox', '0 0 24 24');
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', P[k]);
      s.appendChild(p);
      svg.appendChild(s);
    });
    document.body.insertBefore(svg, document.body.firstChild);
  }

  window.lumIcon = function (name, size) {
    if (!P[name]) return '';
    return '<svg class="ui-icon' + (size ? ' ' + size : '') + '" aria-hidden="true" focusable="false"><use href="#ui-i-' + name + '"></use></svg>';
  };
  window.lumIcon.names = Object.keys(P);

  if (document.body) sprite();
  else document.addEventListener('DOMContentLoaded', sprite);
})();
