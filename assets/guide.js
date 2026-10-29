/* 증언: 다음 페이지 — 언어별 안내 페이지 공통 동작
   (전시 안내 / 온라인 전시관 두 갈래, 펼침 목록, 준비 중 알림) */

(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ── 두 갈래 ─────────────────────────────── */

  var tabs = $$('.tab');
  var views = { guide: $('#view-guide'), hall: $('#view-hall') };

  function show(name, push) {
    if (!views[name]) name = 'guide';
    tabs.forEach(function (t) {
      t.setAttribute('aria-selected', String(t.dataset.view === name));
    });
    Object.keys(views).forEach(function (k) {
      if (views[k]) views[k].hidden = (k !== name);
    });
    if (push) {
      var h = (name === 'hall') ? '#3d' : ' ';
      history.replaceState(null, '', location.pathname + (name === 'hall' ? h : ''));
      window.scrollTo(0, 0);
    }
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () { show(t.dataset.view, true); });
  });

  show(location.hash.indexOf('#3d') === 0 || location.hash === '#tour' ? 'hall' : 'guide', false);

  /* ── 모두 펼치기 ──────────────────────────── */

  var expand = $('.expand');
  var items = $$('.item');

  if (expand) {
    expand.addEventListener('click', function () {
      var allOpen = items.every(function (d) { return d.open; });
      items.forEach(function (d) { d.open = !allOpen; });
      expand.textContent = allOpen ? expand.dataset.expand : expand.dataset.collapse;
    });

    items.forEach(function (d) {
      d.addEventListener('toggle', function () {
        var allOpen = items.every(function (x) { return x.open; });
        expand.textContent = allOpen ? expand.dataset.collapse : expand.dataset.expand;
      });
    });
  }

  /* ── 준비 중 알림 ─────────────────────────── */

  var modal = $('#soon');
  var lastFocus = null;

  function openModal(from) {
    if (!modal) return;
    lastFocus = from || document.activeElement;
    modal.hidden = false;
    var ok = $('.ok', modal);
    if (ok) ok.focus();
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  $$('[data-soon]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (!el.hasAttribute('data-soon')) return;
      e.preventDefault();
      openModal(el);
    });
  });

  if (modal) {
    $$('.ok, .x', modal).forEach(function (b) { b.addEventListener('click', closeModal); });
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  }
})();
