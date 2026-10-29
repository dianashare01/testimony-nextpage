/* 증언: 다음 페이지 — 홈페이지 관리자 화면
 *
 * 다녀간 수를 보고, 홈페이지 문구를 고칩니다.
 * 관리자 코드는 이 탭에만 잠깐 남고(sessionStorage), 주소에는 절대 넣지 않습니다.
 */

(function () {
  'use strict';

  // 내 컴퓨터에서 확인할 때는 가까이 있는 서버를 씁니다 (wrangler dev)
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = LOCAL ? 'http://127.0.0.1:8787' : 'https://qr-mission-api.jhmonounity.workers.dev';
  var SITE = 'testimony';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var code = '';
  var DATA = null;      // 다녀간 수
  var SAVED = {};       // 지금 저장돼 있는 문구
  var DEFAULTS = {};    // 홈페이지에 원래 적힌 문구

  /* 칸 이름. 없으면 키를 그대로 보여 줍니다. */
  var NAMES = {
    'guide.host': '주최 줄', 'guide.rec': '부제', 'guide.lead': '소개글',
    'venue.1.name': '첫 번째 전시장', 'venue.1.date': '첫 번째 기간',
    'venue.2.name': '두 번째 전시장', 'venue.2.date': '두 번째 기간',
    'notice.title': '관람 전 안내 제목', 'notice.body': '관람 전 안내 본문',
    'hall.host': '주최 줄', 'hall.title': '큰 제목', 'hall.rec': '부제', 'hall.lead': '소개글',
    'rooms.title': '전시실 고르기 제목',
    'soon.title': '준비 중 알림 제목', 'soon.body': '준비 중 알림 본문',
    'footer.copy': '맨 아래 저작권 줄'
  };

  var GROUPS = [
    { t: '전시 안내 화면', is: function (k) { return /^(guide|venue|notice)\./.test(k); } },
    { t: '온라인 전시관 화면', is: function (k) { return /^(hall|rooms)\./.test(k); } },
    { t: '전시실 이름', is: function (k) { return /^room\./.test(k); } },
    { t: '그 밖에', is: function () { return true; } }
  ];

  /* ── 서버 부르기 ─────────────────────────── */

  function api(path, opts) {
    var o = opts || {};
    o.headers = o.headers || {};
    o.headers['X-Admin-Key'] = code;
    return fetch(API + path, o).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok || !d.ok) throw new Error(d && d.error ? d.error : '불러오지 못했습니다');
        return d;
      });
    });
  }

  /* ── 다녀간 수 ───────────────────────────── */

  function sum(rows, page, from) {
    var n = { views: 0, uniq: 0 };
    rows.forEach(function (r) {
      if (page && r.page !== page) return;
      if (from && r.day < from) return;
      n.views += r.views; n.uniq += r.uniq;
    });
    return n;
  }

  function daysAgo(n) {
    return new Date(Date.now() + 9 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
  }

  function nf(n) { return Number(n || 0).toLocaleString('ko-KR'); }

  function drawStats() {
    var rows = DATA.rows;
    var all = {};
    DATA.byPage.forEach(function (r) { all[r.page] = r; });
    var g = function (p) { return all[p] || { views: 0, uniq: 0 }; };

    var today = sum(rows, 'home', DATA.today);
    var week = sum(rows, 'home', daysAgo(6));

    var list = [
      ['오늘 접속', nf(today.views), nf(today.uniq) + '명'],
      ['최근 7일', nf(week.views), nf(week.uniq) + '명'],
      ['홈페이지 전체', nf(g('home').views), nf(g('home').uniq) + '명'],
      ['온라인 전시관', nf(g('hall').views), nf(g('hall').uniq) + '명'],
      ['둘러보기 시작', nf(g('tour').views), nf(g('tour').uniq) + '명']
    ];

    var box = $('#stats');
    box.innerHTML = '';
    list.forEach(function (it) {
      var d = document.createElement('div');
      d.className = 'stat';
      d.innerHTML = '<div class="k"></div><div class="v"></div><div class="k"></div>';
      var p = d.children;
      p[0].textContent = it[0];
      p[1].textContent = it[1];
      p[2].textContent = it[2] + ' 다녀감';
      box.appendChild(d);
    });

    $('#since').textContent = DATA.since
      ? (DATA.since + ' 부터 세고 있습니다')
      : '아직 기록이 없습니다. 홈페이지에 한 번 들어가 보세요.';
  }

  function drawBars() {
    var days = DATA.days;
    var by = {};
    DATA.rows.forEach(function (r) {
      var d = by[r.day] || (by[r.day] = { home: 0, hall: 0, tour: 0 });
      if (d[r.page] !== undefined) d[r.page] += r.views;
    });

    var list = [];
    for (var i = days - 1; i >= 0; i--) {
      var day = daysAgo(i);
      list.push({ day: day, v: (by[day] || {}).home || 0, t: (by[day] || {}).tour || 0 });
    }

    var max = Math.max.apply(null, list.map(function (d) { return d.v; }).concat([1]));
    var box = $('#bars');
    box.innerHTML = '';
    list.forEach(function (d) {
      var b = document.createElement('div');
      b.className = 'b' + (d.day === DATA.today ? ' on' : '');
      b.style.height = Math.max(2, Math.round(d.v / max * 100)) + '%';
      b.dataset.t = d.day.slice(5).replace('-', '/') + ' · 접속 ' + d.v + ' · 둘러보기 ' + d.t;
      box.appendChild(b);
    });

    $('#ax-from').textContent = list[0].day;
    $('#ax-to').textContent = list[list.length - 1].day;
  }

  function roomName(no) {
    return SAVED['room.' + no] || DEFAULTS['room.' + no] || ('전시실 ' + no);
  }

  function drawRooms() {
    var rows = DATA.byPage.filter(function (r) { return r.page.indexOf('room:') === 0; });
    rows.sort(function (a, b) { return a.page < b.page ? -1 : 1; });

    var t = $('#rooms');
    t.innerHTML = '';
    var head = t.insertRow();
    ['전시실', '열어 본 수', '다녀간 사람'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    });

    if (!rows.length) {
      var r = t.insertRow();
      var c = r.insertCell();
      c.colSpan = 3;
      c.textContent = '아직 기록이 없습니다.';
      return;
    }

    rows.forEach(function (r) {
      var no = r.page.slice(5);
      var tr = t.insertRow();
      tr.insertCell().textContent = no + ' · ' + roomName(no);
      tr.insertCell().textContent = nf(r.views);
      tr.insertCell().textContent = nf(r.uniq) + '명';
    });
  }

  function csv() {
    var lines = ['날짜,화면,열어 본 수,다녀간 사람'];
    DATA.rows.forEach(function (r) {
      var name = r.page.indexOf('room:') === 0 ? roomName(r.page.slice(5)) : r.page;
      lines.push([r.day, '"' + String(name).replace(/"/g, '""') + '"', r.views, r.uniq].join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '다녀간수_' + DATA.today + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ── 문구 고치기 ─────────────────────────── */

  function drawEdit() {
    var keys = Object.keys(DEFAULTS);
    Object.keys(SAVED).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });

    var box = $('#edit');
    box.innerHTML = '';

    var used = {};
    GROUPS.forEach(function (g) {
      var mine = keys.filter(function (k) { return !used[k] && g.is(k); });
      mine.forEach(function (k) { used[k] = true; });
      if (!mine.length) return;

      var h = document.createElement('h3');
      h.textContent = g.t;
      box.appendChild(h);

      mine.forEach(function (k) {
        var wrap = document.createElement('label');
        wrap.innerHTML = '<span class="n"></span><span class="k"></span><textarea></textarea>';
        $('.n', wrap).textContent = NAMES[k] || k;
        $('.k', wrap).textContent = k;
        var ta = $('textarea', wrap);
        ta.dataset.k = k;
        ta.value = SAVED[k] || '';
        ta.placeholder = DEFAULTS[k] || '';
        ta.rows = Math.min(6, Math.max(1, Math.ceil((DEFAULTS[k] || '').length / 46)));
        ta.addEventListener('input', function () {
          wrap.classList.toggle('changed', ta.value !== (SAVED[k] || ''));
        });
        box.appendChild(wrap);
      });
    });
  }

  function save() {
    var items = {};
    $$('#edit textarea').forEach(function (ta) {
      var v = ta.value.trim();
      // 원래 문구와 같으면 저장하지 않고 지웁니다 — 나중에 홈페이지를 고쳐도 따라갑니다
      items[ta.dataset.k] = (v === (DEFAULTS[ta.dataset.k] || '')) ? '' : v;
    });

    $('#saved').classList.add('hidden');
    $('#save-err').classList.add('hidden');
    $('#save').disabled = true;

    api('/api/admin/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: SITE, items: items })
    }).then(function () {
      SAVED = {};
      Object.keys(items).forEach(function (k) { if (items[k]) SAVED[k] = items[k]; });
      $$('#edit label').forEach(function (l) { l.classList.remove('changed'); });
      $('#saved').textContent = '저장했습니다. 홈페이지를 새로 고치면 보입니다.';
      $('#saved').classList.remove('hidden');
      drawRooms();
    }).catch(function (e) {
      $('#save-err').textContent = e.message;
      $('#save-err').classList.remove('hidden');
    }).then(function () {
      $('#save').disabled = false;
    });
  }

  /* ── 불러오기 ────────────────────────────── */

  function loadDefaults() {
    return fetch('index.html', { cache: 'no-cache' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        $$('[data-cms]', doc).forEach(function (el) {
          DEFAULTS[el.getAttribute('data-cms')] = el.textContent.trim();
        });
      })
      .catch(function () { /* 못 읽으면 빈칸으로 보여 줍니다 */ });
  }

  function loadAll() {
    var days = Number($('#range').value) || 30;
    return Promise.all([
      api('/api/admin/visits?site=' + SITE + '&days=' + days),
      fetch(API + '/api/content?site=' + SITE).then(function (r) { return r.json(); })
    ]).then(function (res) {
      DATA = res[0];
      SAVED = (res[1] && res[1].items) || {};
      $('#updated').textContent = new Date().toLocaleString('ko-KR') + ' 기준';
      drawStats();
      drawBars();
      drawRooms();
      drawEdit();
    });
  }

  /* ── 들어가기 ────────────────────────────── */

  function open() {
    $('#login').classList.add('hidden');
    $('#panel').classList.remove('hidden');
  }

  function tryCode(v) {
    code = String(v || '').trim();
    if (!code) return;
    $('#err').classList.add('hidden');
    $('#go').disabled = true;
    loadDefaults()
      .then(loadAll)
      .then(function () {
        try { sessionStorage.setItem('tnp:admin', code); } catch (e) { /* 안 되면 매번 칩니다 */ }
        open();
      })
      .catch(function (e) {
        $('#err').textContent = (e.message === '권한이 없습니다')
          ? '코드가 맞지 않습니다.' : e.message;
        $('#err').classList.remove('hidden');
      })
      .then(function () { $('#go').disabled = false; });
  }

  $('#go').addEventListener('click', function () { tryCode($('#code').value); });
  $('#code').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') tryCode($('#code').value);
  });

  $('#refresh').addEventListener('click', function () { loadAll().catch(function () {}); });
  $('#range').addEventListener('change', function () { loadAll().catch(function () {}); });
  $('#csv').addEventListener('click', csv);
  $('#save').addEventListener('click', save);

  $('#logout').addEventListener('click', function () {
    code = '';
    try { sessionStorage.removeItem('tnp:admin'); } catch (e) { /* 지울 게 없으면 그만 */ }
    location.reload();
  });

  try {
    var kept = sessionStorage.getItem('tnp:admin');
    if (kept) tryCode(kept);
  } catch (e) { /* 저장소를 못 쓰면 코드를 칩니다 */ }
})();
