/* 오요가 분석 — 바깥 도구(GA4·네이버·Clarity)
   아래 CONFIG 에 측정 ID 를 넣으면 바로 동작한다. 비어 있으면 아무것도 불러오지
   않고 아무것도 보내지 않는다(동작하지 않는 자리표시자를 라이브에 두지 않기 위해).

   전환 이벤트: 상담·예약·일정 같은 링크 누름은 js/oy.js(직접 만든 방문 기록)가 알아내
   'oy:track' 이벤트로 알려 준다. 여기서는 그것을 GA4·Clarity 로 넘기기만 한다. */
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

  // 전환 이벤트 — js/oy.js 가 알려 준다(?debug_analytics 를 붙이면 그쪽에서 콘솔에 찍는다)
  document.addEventListener('oy:track', function (e) {
    var d = e.detail || {};
    if (window.gtag) window.gtag('event', d.name, d.params);
    if (window.clarity) window.clarity('event', d.name);
  });
})();
