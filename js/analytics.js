/* 오요가 분석
   아래 CONFIG 에 측정 ID 를 넣으면 바로 동작한다. 비어 있으면 아무것도 불러오지
   않고 아무것도 보내지 않는다(동작하지 않는 자리표시자를 라이브에 두지 않기 위해).

   전환 이벤트: 링크를 누르면 이벤트를 보낸다. 이름은 data-track 속성이 있으면 그것을,
   없으면 링크 주소로 추론한다. 그래서 Webflow 가 만든 기존 버튼에 속성을 일일이
   달지 않아도 사이트의 모든 상담·예약·일정 버튼이 잡힌다. */
(function () {
  'use strict';

  var CONFIG = {
    GA4_ID: '',       // Google Analytics 4 측정 ID. 예: 'G-XXXXXXXXXX'
    NAVER_WA: '',     // 네이버 애널리틱스 사이트 ID. 예: 's_1234567890ab'
    CLARITY_ID: ''    // Microsoft Clarity 프로젝트 ID (히트맵·세션 녹화). 예: 'abcdefghij'
  };

  function loadScript(src, onload) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    if (onload) s.onload = onload;
    document.head.appendChild(s);
  }

  if (CONFIG.GA4_ID) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', CONFIG.GA4_ID);
    loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CONFIG.GA4_ID));
  }

  if (CONFIG.NAVER_WA) {
    loadScript('https://wcs.naver.net/wcslog.js', function () {
      window.wcs_add = window.wcs_add || {};
      window.wcs_add.wa = CONFIG.NAVER_WA;
      if (window.wcs) window.wcs_do();
    });
  }

  if (CONFIG.CLARITY_ID) {
    window.clarity = window.clarity || function () {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
    loadScript('https://www.clarity.ms/tag/' + encodeURIComponent(CONFIG.CLARITY_ID));
  }

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

  // 캡처 단계에서 듣는다 — 새 탭으로 열리거나 페이지를 떠나기 전에 먼저 기록
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var name = eventName(a);
    if (!name) return;
    var params = {
      link_url: a.href,
      link_text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      page_path: location.pathname
    };
    if (window.gtag) window.gtag('event', name, params);
    if (window.clarity) window.clarity('event', name);
    // 디버그: 주소창에 ?debug_analytics 를 붙이면 콘솔에 이벤트가 찍힌다
    if (/[?&]debug_analytics\b/.test(location.search)) console.info('[analytics]', name, params);
  }, true);
})();
