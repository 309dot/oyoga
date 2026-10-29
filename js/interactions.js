/* 오요가 인터랙션
   - 의존성 없음. 이 파일이 실패하거나 꺼져 있어도 콘텐츠는 그대로 보인다.
     상태 클래스를 붙이는 것만 JS 가 하고, 모양은 전부 CSS 가 정한다.
   - prefers-reduced-motion 이면 움직임은 끄고 기능만 남긴다. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  /* 1. 고정 내비게이션 — 스크롤을 내리면 유리 질감과 그림자 */
  var ticking = false;
  function syncScrolled() {
    root.classList.toggle('is-scrolled', window.scrollY > 24);
    syncCta();
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(syncScrolled);
    }
  }, { passive: true });

  /* 2. 페이지 끝 정보 구역(FAQ·푸터)이 보이면 이벤트 배너가 비켜난다.
        FAQ 답변과 푸터의 주소·전화를 가리지 않게. 클래스명은 footer-in-view 를
        유지하지만 FAQ 까지 포함한다. 둘 중 하나라도 보이면 켠다. */
  var endZone = document.querySelectorAll('.faq, .footer');
  if (endZone.length && hasIO) {
    var visibleEnd = new Set();
    var endObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) visibleEnd.add(e.target); else visibleEnd.delete(e.target);
      });
      root.classList.toggle('footer-in-view', visibleEnd.size > 0);
      syncCta();
    });
    Array.prototype.forEach.call(endZone, function (el) { endObserver.observe(el); });
  }

  /* 3. 모바일 고정 CTA — 모바일에선 상담·예약이 햄버거 안에 숨어 있다.
        이벤트 배너는 1920px 미만에서 항상 뜨므로, 겹치지 않게 사용자가 배너를
        닫은 뒤에만 띄운다(히어로를 지나고 페이지 끝 구역이 아닐 때). 배너 상태는
        클래스가 아니라 실제 display 로 판정한다. 767px 초과에선 CSS 가 숨긴다. */
  var bannerWrap = document.querySelector('.navi_event_mobile');
  var bannerCard = document.querySelector('.container_event');
  function bannerShown() {
    if (!bannerWrap || !bannerCard) return false;
    return getComputedStyle(bannerWrap).display !== 'none' &&
           getComputedStyle(bannerCard).display !== 'none';
  }
  function syncCta() {
    var show = window.scrollY > window.innerHeight * 0.6 &&
               !bannerShown() &&
               !root.classList.contains('footer-in-view');
    root.classList.toggle('show-sticky-cta', show);
  }
  window.addEventListener('resize', syncCta, { passive: true });
  // 배너 닫기 버튼은 기존 스크립트가 display:none 을 거는데, 그 직후에 다시 판정
  Array.prototype.forEach.call(document.querySelectorAll('.btn_close'), function (b) {
    b.addEventListener('click', function () { setTimeout(syncCta, 0); });
  });
  syncScrolled();

  /* 4. 스크롤 리빌 — 처음에 화면 밖이던 블록만 숨겼다가 들어올 때 보여준다.
        처음부터 보이는 요소는 손대지 않는다. 숨기면 LCP 가 늦어지고 깜빡인다. */
  if (reduceMotion || !hasIO) return;

  var BLOCKS = [
    '.section-3', '.container-9', '.container-45',                  // index: 프로그램 행·강사진·뉴스
    '.container-21', '.container-46', '.img_program01-2',           // about: 소개
    '.team-list-item', '.container-29', '.container-31',            // about: 강사·지점
    '.container-32', '.container-34',                               // about: 하단 CTA
    '.section-22', '.section-23', '.div-block-2', '.container_img', // 프로그램 상세
    '.container-41',                                                // 갤러리 행
    '.container-7', '.container-19', '.container-27',
    '.container-35', '.container-43',                               // 섹션 제목
    '.faq-head', '.faq-item'                                        // FAQ
  ].join(',');
  var STAGGER_STEP = 90;
  var STAGGER_MAX = 450;

  var revealer = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-visible');
      revealer.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px' });

  // 첫 판정은 여백 없이: 화면 하단에 걸쳐 일부라도 보이는 요소는 숨기지 않는다
  var probe = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      probe.unobserve(e.target);
      if (e.isIntersecting) return;
      e.target.classList.add('reveal');
      revealer.observe(e.target);
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll(BLOCKS), function (el) {
    if (el.closest('.navbar, .footer')) return;
    // 조상도 대상이면 건너뛴다 — 안팎이 겹쳐서 두 번 움직이지 않게
    if (el.parentElement && el.parentElement.closest(BLOCKS)) return;
    // 같은 부모 아래 형제끼리는 차례로 등장
    var siblings = Array.prototype.filter.call(el.parentElement.children, function (c) {
      return c.matches(BLOCKS);
    });
    var i = siblings.indexOf(el);
    if (i > 0) {
      el.style.setProperty('--reveal-delay', Math.min(i * STAGGER_STEP, STAGGER_MAX) + 'ms');
    }
    probe.observe(el);
  });
})();
