/* 증언: 다음 페이지 — 다녀간 수 세기 · 관리자가 고친 문구 넣기
 *
 * 다녀간 수는 누가 왔는지 전혀 받지 않습니다.
 * 날짜와 어느 화면인지, 그리고 '이 브라우저가 오늘 처음인지' 예/아니오만 보냅니다.
 * 그 예/아니오를 판단하는 날짜는 이 기기 안에만 남습니다.
 */

(function () {
  'use strict';

  // 내 컴퓨터에서 확인할 때는 가까이 있는 서버를 씁니다 (wrangler dev)
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = LOCAL ? 'http://127.0.0.1:8787' : 'https://qr-mission-api.jhmonounity.workers.dev';
  var SITE = 'testimony';
  var OK_KEY = /^[A-Za-z0-9._:-]{1,40}$/;

  /* ── 다녀간 수 ────────────────────────────── */

  function kstDay() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }

  // 오늘 이 브라우저로 처음 들어왔는지. 저장소를 못 쓰면 '처음 아님'으로 둡니다.
  function firstToday() {
    try {
      var today = kstDay();
      if (localStorage.getItem('tnp:day') === today) return false;
      localStorage.setItem('tnp:day', today);
      return true;
    } catch (e) {
      return false;
    }
  }

  var first = firstToday();
  var sent = {};

  function count(page) {
    if (!OK_KEY.test(page) || sent[page]) return;
    sent[page] = true;
    // 본문을 그냥 글자로 보냅니다. 이러면 브라우저가 미리 묻지 않아 가볍습니다.
    var payload = JSON.stringify({ site: SITE, page: page, first: first });
    first = false;
    try {
      fetch(API + '/api/hit', { method: 'POST', body: payload, keepalive: true })
        .catch(function () { /* 숫자를 못 세도 화면은 그대로 */ });
    } catch (e) { /* 숫자를 못 세도 화면은 그대로 */ }
  }

  window.tnpCount = count;

  count('home');
  if (location.hash === '#3d' || location.hash === '#tour') count('hall');

  window.addEventListener('hashchange', function () {
    if (location.hash === '#3d' || location.hash === '#tour') count('hall');
  });

  /* ── 관리자가 고친 문구 ──────────────────── */

  function apply(items) {
    Object.keys(items).forEach(function (k) {
      if (!OK_KEY.test(k)) return;
      var v = String(items[k] == null ? '' : items[k]);
      if (!v) return;
      var els = document.querySelectorAll('[data-cms="' + k + '"]');
      Array.prototype.forEach.call(els, function (el) { el.textContent = v; });
    });
    window.tnpCms = items;
    document.dispatchEvent(new CustomEvent('tnp:cms', { detail: items }));
  }

  fetch(API + '/api/content?site=' + SITE)
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.ok && d.items) apply(d.items); })
    .catch(function () { /* 못 불러오면 원래 문구가 그대로 나옵니다 */ });
})();
