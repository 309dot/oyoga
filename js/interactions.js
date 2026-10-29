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
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(syncScrolled);
    }
  }, { passive: true });
  syncScrolled();

  /* 2. 푸터가 보이면 이벤트 배너가 비켜난다 — 그 자리에 주소·전화가 있다 */
  var footer = document.querySelector('.footer');
  if (footer && hasIO) {
    new IntersectionObserver(function (entries) {
      root.classList.toggle('footer-in-view', entries[0].isIntersecting);
    }).observe(footer);
  }

  /* 3. 스크롤 리빌 — 처음에 화면 밖이던 블록만 숨겼다가 들어올 때 보여준다.
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
    '.container-35', '.container-43'                                // 섹션 제목
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
