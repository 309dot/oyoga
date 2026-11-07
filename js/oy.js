/* 오요가 방문 기록 — 직접 만든 분석. 받는 곳은 api/oy.js
   페이지가 열릴 때(view), 떠날 때(leave: 머문 시간·스크롤 깊이·지나간 섹션),
   링크를 누를 때(click) /api/oy 로 짧은 기록을 보낸다. 쿠키는 쓰지 않는다.

   - 이 기기 빼기: 주소 끝에 ?notrack=1 을 붙여 한 번 열면 그 브라우저는 더 세지 않는다.
     ?notrack=0 으로 되돌린다. 원장님·우리 팀 기기에 한 번씩 해 두면 숫자가 깨끗하다.
     (기억하는 값은 이것 하나뿐이고, 기기 안에만 남는다)
   - 확인: ?debug_analytics 를 붙이면 보내는 내용이 콘솔에 찍히고, 기록은 시험용
     (site='oyoga-test')으로 따로 쌓인다. 정식 주소가 아니면 이때만 보낸다.
   - 전환 이벤트 이름은 링크에 data-track 이 있으면 그것, 없으면 아래 RULES 로 정한다.
     GA4·네이버·Clarity 는 js/analytics.js 가 'oy:track' 이벤트를 받아 넘긴다. */
(function () {
  'use strict';

  var ENDPOINT = '/api/oy';
  var debug = /[?&]debug_analytics\b/.test(location.search);
  var off = false;
  try {
    var m = location.search.match(/[?&]notrack=([01])\b/);
    if (m) {
      if (m[1] === '1') localStorage.setItem('oy-notrack', '1');
      else localStorage.removeItem('oy-notrack');
      console.info('[oy] 이 기기는 ' + (m[1] === '1' ? '이제 세지 않아요' : '다시 세요'));
    }
    off = localStorage.getItem('oy-notrack') === '1';
  } catch (e) { /* 저장소를 못 쓰면 그냥 센다 */ }
  var live = /(^|\.)oyoga\.kr$/.test(location.hostname);
  var enabled = !off && (debug || (live && !navigator.webdriver));

  function beacon(data) {
    if (!enabled) return;
    if (debug) { data.test = 1; console.info('[oy]', data.t, data); }
    var body = JSON.stringify(data);
    try { if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return; } catch (e) { /* 아래로 */ }
    try {
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } })
        .catch(function () {});
    } catch (e) { /* 보내지 못해도 사이트는 그대로 */ }
  }

  function rid() {
    var a = new Uint8Array(12), out = '';
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    for (var j = 0; j < a.length; j++) out += ('0' + a[j].toString(16)).slice(-2);
    return out;
  }
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function text(a) { return (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60); }

  function pagePath() {
    var p = location.pathname.replace(/\/index\.html$/, '/');
    if (/\/story\.html$/.test(p)) {
      var s = new URLSearchParams(location.search).get('s');
      if (s) p += '?s=' + encodeURIComponent(s).slice(0, 80);
    }
    return p;
  }
  function utm() {
    var q = new URLSearchParams(location.search), o = {};
    ['source', 'medium', 'campaign'].forEach(function (k) {
      var v = q.get('utm_' + k);
      if (v) o[k] = v.slice(0, 60);
    });
    return o;
  }

  /* 섹션 이름: id → 흔하지 않은 첫 class → aria-labelledby → aria-label 순 */
  var GENERIC = { sec: 1, band: 1, grp: 1 };
  function sectionKey(s) {
    var cls = (s.getAttribute('class') || '').split(/\s+/)[0];
    return String(
      s.id || (cls && !GENERIC[cls] && cls) || s.getAttribute('aria-labelledby') ||
      s.getAttribute('aria-label') || cls || 'section'
    ).slice(0, 40);
  }

  var path = pagePath(), vid, shownAt, engaged, maxScroll, seen, leaves, lastLeave;

  function measureScroll() {
    var doc = document.documentElement;
    var h = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
    var y = window.scrollY || doc.scrollTop || 0;
    var pct = h > 0 ? Math.min(100, Math.round((y + window.innerHeight) / h * 100)) : 100;
    if (pct > maxScroll) maxScroll = pct;
  }
  var ticking = false;
  addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; measureScroll(); });
  }, { passive: true });

  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting && e.target.oyKey) seen[e.target.oyKey] = 1; });
  }, { rootMargin: '0px 0px -25% 0px' }) : null; // 화면 위쪽 3/4 안에 들어오면 지나간 것으로
  function watchSections() {
    if (!io) return;
    var used = {};
    Array.prototype.forEach.call(document.querySelectorAll('section'), function (s) {
      var k = sectionKey(s);
      used[k] = (used[k] || 0) + 1;
      s.oyKey = used[k] > 1 ? k + '-' + used[k] : k;
      io.unobserve(s);
      io.observe(s); // 다시 붙이면 지금 보이는 섹션도 바로 알려 준다
    });
  }

  function pause() { if (shownAt) { engaged += now() - shownAt; shownAt = 0; } }
  function resume() { if (!shownAt && document.visibilityState === 'visible') shownAt = now(); }
  function leave() {
    pause();
    var data = { t: 'leave', v: vid, p: path, ms: Math.round(engaged), s: maxScroll, sec: Object.keys(seen) };
    // 떠날 때는 visibilitychange 와 pagehide 가 함께 오는 일이 많다 — 달라진 게 없으면 한 번만
    var sig = data.ms + '|' + data.s + '|' + data.sec.length;
    if (sig === lastLeave || ++leaves > 30) return;
    lastLeave = sig;
    beacon(data);
  }
  function start(restored) {
    vid = rid(); engaged = 0; shownAt = 0; maxScroll = 0; seen = {}; leaves = 0; lastLeave = '';
    resume();
    measureScroll();
    watchSections();
    beacon({
      t: 'view', v: vid, p: path, w: window.innerWidth || document.documentElement.clientWidth, u: utm(),
      r: restored ? location.href : document.referrer || '' // 뒤로 가기로 돌아온 화면은 사이트 안 이동으로
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') leave(); else resume();
  });
  addEventListener('pagehide', leave);
  addEventListener('pageshow', function (e) { if (e.persisted) start(true); });
  start(false);

  /* 링크 주소 → 전환 이벤트 이름. 위에서부터 먼저 맞는 것을 쓴다 */
  var RULES = [
    [/pf\.kakao\.com/, 'kakao_consult'],
    [/booking\.naver\.com\/.*items\/5238615/, 'trial_booking'],   // 요가 1회 체험권
    [/booking\.naver\.com/, 'booking'],
    [/blog\.naver\.com\/.*categoryNo=10\b/, 'schedule'],          // 요가 일정
    [/blog\.naver\.com\/.*(categoryNo=24\b|logNo=224351981535)/, 'ryt200'],
    [/blog\.naver\.com\/.*categoryNo=11\b/, 'teacher_blog'],      // 강사 소개 글
    [/blog\.naver\.com/, 'blog'],
    [/instagram\.com/, 'instagram'],
    [/map\.naver\.com/, 'map_open'],
    [/^tel:/, 'call']
  ];
  function eventName(a) {
    var explicit = a.getAttribute('data-track');
    if (explicit) return explicit;
    var href = a.getAttribute('href') || '';
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i][0].test(href)) return RULES[i][1];
    }
    return null;
  }
  function placeOf(a) {
    var s = a.closest('section');
    if (s && s.oyKey) return s.oyKey;
    return a.closest('header, nav') ? 'nav' : a.closest('footer') ? 'footer' : '';
  }

  // 캡처 단계에서 듣는다 — 새 탭으로 열리거나 페이지를 떠나기 전에 먼저 기록
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var name = eventName(a);
    if (!name) {
      // 사이트 안 다른 페이지로 가는 링크 — 어느 자리의 링크로 넘어갔는지 남긴다
      var u;
      try { u = new URL(a.href, location.href); } catch (er) { return; }
      if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search)) return;
      beacon({ t: 'click', v: vid, p: path, n: 'nav', to: u.pathname + u.search, l: text(a), sec: placeOf(a) });
      return;
    }
    var params = { link_url: a.href, link_text: text(a), page_path: location.pathname };
    beacon({ t: 'click', v: vid, p: path, n: name, to: a.href, l: params.link_text, sec: placeOf(a) });
    try { document.dispatchEvent(new CustomEvent('oy:track', { detail: { name: name, params: params } })); } catch (er) { /* 옛 브라우저 */ }
    if (debug) console.info('[analytics]', name, params);
  }, true);
})();
