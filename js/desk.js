/* 오요가 방문 노트 — /api/desk 를 읽어 한 장으로 그린다.
   - 기록에서 온 글자(주소, 경로, 꼬리표)는 모두 textContent 로만 넣는다.
   - 그림은 손으로 그린 SVG. 막대는 먹 한 가지, 행동(전환)만 인주색.
   - 열쇠는 이 기기(localStorage)에만 남는다. 주소 끝 #k=열쇠 로 한 번 열면 기억한다. */
(function () {
  'use strict';

  var API = '/api/desk';
  var STORE = 'oy-desk-key';
  var REFRESH_MS = 5 * 60000;   // 보고 있을 때만 5분마다. 무료 DB가 쉴 틈을 준다.
  var IDLE_MS = 30 * 60000;     // 30분 넘게 손대지 않으면 새로 부르기를 멈춘다
  var RANGES = [1, 7, 30, 90];
  var qs = new URLSearchParams(location.search);
  var TEST = qs.get('site') === 'test';
  var STORIES = (window.OY && window.OY.STORIES) || {};
  var state = { range: 7, data: null, key: '', busy: false, trying: false, lastOk: 0, width: 0, anim: true, animT: 0 };

  /* ---------- 이름표 ---------- */
  var CHANNEL = {
    naver_search: '네이버 검색', naver_map: '네이버 지도·플레이스', naver_blog: '네이버 블로그', naver_cafe: '네이버 카페',
    naver: '그 밖의 네이버', naver_place: '네이버 플레이스 링크', google: '구글', instagram: '인스타그램', facebook: '페이스북',
    kakao: '카카오톡', daum: '다음', bing: '빙', youtube: '유튜브', ai: 'AI 검색', direct: '바로 들어옴', other: '다른 사이트', internal: '사이트 안에서'
  };
  var CHANNEL_SUB = {
    direct: '주소를 치거나 즐겨찾기, 보낸 곳을 숨긴 링크', kakao: '카카오톡 대화방에서 연 링크', ai: 'ChatGPT, Perplexity, Gemini 같은 곳',
    naver: '네이버 앱 첫 화면, naver.me 링크', other: '아래 ‘보낸 곳 주소’에 있어요', naver_place: '꼬리표(utm)를 붙인 링크로 들어옴'
  };
  var ACTION = {
    kakao_consult: '카카오톡 상담', trial_booking: '체험 수업 예약', booking: '네이버 예약', map_open: '지도 열기', call: '전화 걸기',
    instagram: '인스타그램', blog: '블로그', ryt200: 'RYT200 글', teacher_blog: '선생님 소개 글', schedule: '블로그 요가 일정'
  };
  var DEVICE = { mobile: '휴대폰', desktop: '컴퓨터', tablet: '태블릿' };
  var SAME_APP = { instagram: 'Instagram', kakao: 'KakaoTalk', facebook: 'Facebook' };
  var BROWSER = {
    KakaoTalk: '카카오톡 안', 'NAVER app': '네이버 앱', Instagram: '인스타그램 안', Facebook: '페이스북 안', 'Daum app': '다음 앱',
    'Samsung Internet': '삼성 인터넷', Whale: '웨일', Edge: '엣지', Opera: '오페라', Firefox: '파이어폭스', Chrome: '크롬', Safari: '사파리', other: '그 밖'
  };
  var KR_REGION = { '11': '서울', '26': '부산', '27': '대구', '28': '인천', '29': '광주', '30': '대전', '31': '울산', '50': '세종', '41': '경기',
    '42': '강원', '51': '강원', '43': '충북', '44': '충남', '45': '전북', '52': '전북', '46': '전남', '47': '경북', '48': '경남', '49': '제주' };
  var HOME = [['hero', '첫 화면'], ['statement', '오요가의 O'], ['week', '이번 주 수업'], ['scenes', '서울에서 제주까지'], ['teachers', '선생님'], ['journal', '이야기와 소식'], ['first', '첫 수업 안내']];
  var PAGE = { '/': '홈', '/index.html': '홈', '/schedule.html': '시간표', '/teachers.html': '선생님', '/academy.html': 'RYT200 과정', '/journal.html': '이야기', '/story.html': '이야기 글' };
  var PLACE = {
    hero: '첫 화면', statement: '오요가의 O', week: '이번 주 수업', scenes: '서울에서 제주까지', teachers: '선생님', journal: '이야기와 소식', first: '첫 수업 안내',
    today: '오늘 수업', ntTitle: '알아 두세요', sat: '토요일', classes: '수업 설명', ctaTitle: '아래 첫 수업 안내', g1: '이달의 선생님', 'with': '지도자 과정 선생님',
    ahero: '첫 화면', why: '왜 제주에서', info: '과정 안내', hours: '무엇을 배우나요', scTitle: '지난 과정의 장면', seoul: '서울 주말 과정', afTitle: '수료 뒤',
    ftTitle: '다시 쓴 글', alTitle: '모든 글', missing: '글 본문', nav: '메뉴', footer: '맨 아래'
  };
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  var ISO_WD = ['', '월', '화', '수', '목', '금', '토', '일'];
  var ISO_WD_LONG = ['', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
  var countryName = (function () {
    try { var dn = new Intl.DisplayNames(['ko'], { type: 'region' }); return function (c) { try { return dn.of(c) || c; } catch (e) { return c; } }; }
    catch (e) { return function (c) { return c; }; }
  })();

  /* ---------- 작은 도구 ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svgEl(tag, attrs, text) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function append(parent) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]); return parent; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sum(list, k) { return list.reduce(function (a, x) { return a + (+x[k] || 0); }, 0); }
  function fmt(n) { return (Math.round(+n || 0)).toLocaleString('ko-KR'); }
  function pct(a, b) { if (!b) return '0%'; var p = a / b * 100; return (p > 0 && p < 1 ? p.toFixed(1) : String(Math.round(p))) + '%'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dur(ms) {
    if (ms == null) return '–';
    var s = Math.round(ms / 1000);
    if (s < 60) return s + '초';
    var m = Math.floor(s / 60); s %= 60;
    if (m < 60) return m + '분' + (s ? ' ' + s + '초' : '');
    return Math.floor(m / 60) + '시간 ' + (m % 60) + '분';
  }
  function durParts(ms) { // 큰 숫자 + 작은 단위로 그리기 위해
    if (ms == null) return [['–', '']];
    var s = Math.round(ms / 1000);
    if (s < 60) return [[String(s), '초']];
    var m = Math.floor(s / 60); s %= 60;
    if (m < 60) return s ? [[String(m), '분'], [String(s), '초']] : [[String(m), '분']];
    return [[String(Math.floor(m / 60)), '시간'], [String(m % 60), '분']];
  }
  // 받침: 0 없음, 1 있음, 2 ㄹ (으로/로 가르기용). 숫자는 읽는 소리로.
  function batchim(word) {
    var w = String(word).replace(/[\s)\]’'".,·%]+$/, '');
    var c = w.charCodeAt(w.length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) { var j = (c - 0xAC00) % 28; return j === 0 ? 0 : j === 8 ? 2 : 1; }
    var dg = /([0-9])$/.exec(w);
    if (dg) return { 0: 1, 1: 2, 3: 1, 6: 1, 7: 2, 8: 2 }[dg[1]] || 0;
    return 0;
  }
  function pp(word, after, plain) { return batchim(word) ? after : plain; }
  function parseDay(s) { return new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))); }
  function addDays(s, n) { return new Date(parseDay(s).getTime() + n * 86400000).toISOString().slice(0, 10); }
  function dayLabel(s, wd) { var d = parseDay(s); return (d.getUTCMonth() + 1) + '월 ' + d.getUTCDate() + '일' + (wd ? ' (' + WD[d.getUTCDay()] + ')' : ''); }
  function kst(iso) { var d = new Date(new Date(iso).getTime() + 9 * 3600000); return { h: d.getUTCHours(), m: d.getUTCMinutes(), day: d.toISOString().slice(0, 10) }; }
  function hhmm(iso) { var p = kst(iso); return pad(p.h) + ':' + pad(p.m); }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return '방금';
    if (s < 3600) return Math.floor(s / 60) + '분 전';
    if (s < 86400) return Math.floor(s / 3600) + '시간 전';
    return Math.floor(s / 86400) + '일 전';
  }
  function hourName(h) { return h === 0 ? '밤 12시' : h < 6 ? '새벽 ' + h + '시' : h < 12 ? '아침 ' + h + '시' : h === 12 ? '낮 12시' : h < 18 ? '오후 ' + (h - 12) + '시' : h < 21 ? '저녁 ' + (h - 12) + '시' : '밤 ' + (h - 12) + '시'; }
  function chLabel(k) { return CHANNEL[k] || String(k || '알 수 없음').replace(/[_-]+/g, ' '); }
  function pageLabel(p) {
    if (!p) return '–';
    var m = /^\/story\.html\?s=([\w\-.%~]+)/.exec(p);
    if (m) { var key = m[1]; try { key = decodeURIComponent(key); } catch (e) { /* 그대로 */ } var s = STORIES[key]; return '글 · ' + (s && s.title ? s.title : key); }
    return PAGE[p] || PAGE[p.split('?')[0]] || p;
  }
  function placeLabel(path, sec) { var p = PLACE[sec]; return pageLabel(path) + (p ? ' · ' + p : ''); }
  function store(get, k, v) {
    try { if (get) return localStorage.getItem(k) || ''; if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* 저장 못 하는 창 */ }
    return '';
  }

  /* ---------- 견주기 ---------- */
  function canCompare(d) { return !!d.first && d.first <= addDays(d.from, -d.days); }
  function change(cur, prev, d, kind) {
    if (!canCompare(d) || cur == null || prev == null) return null;
    if (kind === 'pp') { var dp = Math.round(cur - prev); return { big: (dp > 0 ? '↑ ' : dp < 0 ? '↓ ' : '→ ') + Math.abs(dp) + '%p', dir: Math.sign(dp) }; }
    if (!prev) return cur ? { big: '새로', dir: 1 } : { big: '→ 0%', dir: 0 };
    var r = Math.round((cur - prev) / prev * 100);
    return { big: (r > 0 ? '↑ ' : r < 0 ? '↓ ' : '→ ') + Math.abs(r) + '%', dir: Math.sign(r) };
  }
  function versus(d) { return d.days === 1 ? '어제 이맘때보다' : '그 전 ' + d.days + '일보다'; }

  /* ---------- 말풍선 ---------- */
  var tip = $('dkTip');
  function showTip(x, y, title, lines) {
    clear(tip);
    tip.appendChild(el('h4', null, title));
    lines.forEach(function (l) { var p = el('p'); p.appendChild(el('b', null, l[0])); p.appendChild(el('span', null, l[1])); tip.appendChild(p); });
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth;
    var left = x + 16 + w > vw - 8 ? x - w - 16 : x + 16;
    var top = y - h - 14 < 72 ? y + 18 : y - h - 14;
    tip.style.transform = 'translate(' + Math.round(clamp(left, 8, vw - w - 8)) + 'px,' + Math.round(top) + 'px)';
  }
  function hideTip() { tip.hidden = true; }
  function bindTip(node, fn) {
    function on(e) { var t = fn(); var r = node.getBoundingClientRect(); showTip(e && e.clientX != null ? e.clientX : r.left + r.width * .6, e && e.clientY != null ? e.clientY : r.top + 8, t[0], t[1]); }
    node.addEventListener('pointermove', on);
    node.addEventListener('pointerleave', hideTip);
    node.addEventListener('focus', function () { on(null); });
    node.addEventListener('blur', hideTip);
    node._dkShow = function () { on(null); };
  }

  /* ---------- 줄 막대 ---------- */
  function rows(list, o) {
    o = o || {};
    var ol = el('ol', 'dk-bars' + (o.accent ? ' accent' : '') + (o.small ? ' dk-sm' : ''));
    var max = o.max || Math.max.apply(null, list.map(function (x) { return x.value; }).concat([1]));
    list.forEach(function (x, i) {
      var li = el('li', 'dk-row');
      li.style.setProperty('--d', Math.min(i, 10) * 45 + 'ms');
      var n = el('span', 'n');
      if (x.to != null) append(n, el('span', null, x.label), el('em', null, '→'), el('span', null, x.to));
      else n.textContent = x.label;
      if (x.sub) n.appendChild(el('small', null, x.sub));
      var v = el('span', 'v', x.text != null ? x.text : fmt(x.value));
      if (x.share != null) v.appendChild(el('span', null, x.share));
      var t = el('span', 't');
      var bar = el('i');
      bar.style.width = clamp(x.value / max * 100, 0, 100).toFixed(2) + '%';
      t.appendChild(bar);
      append(li, n, v, t);
      if (x.tip) { li.tabIndex = 0; bindTip(li, x.tip); }
      ol.appendChild(li);
    });
    return ol;
  }
  function empty(box, title, body, small) {
    var e = el('div', 'dk-empty' + (small ? ' sm' : ''));
    e.appendChild(el('b', null, title));
    if (body) e.appendChild(document.createTextNode(body));
    box.appendChild(e);
  }
  function more(summary, items) {
    var det = el('details', 'dk-more');
    det.appendChild(el('summary', null, summary));
    var ul = el('ul');
    items.forEach(function (it) { var li = el('li'); li.appendChild(el('span', null, it[0])); li.appendChild(el('span', null, it[1])); ul.appendChild(li); });
    det.appendChild(ul);
    return det;
  }
  function table(head, body) {
    var det = el('details', 'dk-table');
    det.appendChild(el('summary', null, '표로 보기'));
    var wrap = el('div', 'scroll'), t = el('table'), thead = el('thead'), tr = el('tr');
    head.forEach(function (h) { tr.appendChild(el('th', null, h)); });
    thead.appendChild(tr); t.appendChild(thead);
    var tb = el('tbody');
    body.forEach(function (r) { var row = el('tr'); r.forEach(function (c) { row.appendChild(el('td', null, c)); }); tb.appendChild(row); });
    t.appendChild(tb); wrap.appendChild(t); det.appendChild(wrap);
    return det;
  }

  /* ---------- 세로 막대 / 선 (날마다 · 시간마다) ---------- */
  function niceTop(v) {
    if (v <= 4) return 4;
    var e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 5 ? 5 : 10) * e;
  }
  function roundTop(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h));
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'A' + r + ',' + r + ' 0 0 1 ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'A' + r + ',' + r + ' 0 0 1 ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }
  function columns(fig, pts, o) {
    clear(fig);
    var W = Math.max(280, Math.round(fig.clientWidth || 600));
    var small = W < 600;
    var H = small ? 220 : 280;
    var m = { t: 26, r: 2, b: small || !o.twoLine ? 30 : 46, l: 34 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b, n = pts.length;
    var maxV = Math.max.apply(null, pts.map(function (p) { return p.value; }).concat([0]));
    var top = niceTop(maxV);
    var band = iw / n;
    var asLine = band < 7;
    var y = function (v) { return m.t + ih - v / top * ih; };
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': o.label, tabindex: '0' });

    var ticks = top % 2 ? [0, top] : [0, top / 2, top];
    ticks.forEach(function (v) {
      var ty = y(v);
      if (v > 0) svg.appendChild(svgEl('line', { 'class': 'grid', x1: m.l, x2: W - m.r, y1: ty, y2: ty }));
      svg.appendChild(svgEl('text', { 'class': 'tk', x: m.l - 10, y: ty + 4, 'text-anchor': 'end' }, fmt(v)));
    });

    var marks = [];
    var bw = Math.min(24, Math.max(2, band * .62));
    if (band - bw < 2) bw = Math.max(1, band - 2);
    var cx = function (i) { return m.l + band * i + band / 2; };
    // 아직 오지 않은 시간 (오늘 · 시간마다)
    if (o.futureFrom != null && o.futureFrom < n) {
      var fx = m.l + band * o.futureFrom;
      svg.appendChild(svgEl('rect', { 'class': 'fut', x: fx, y: m.t, width: W - m.r - fx, height: ih }));
    }
    if (asLine) {
      var line = '', area = '';
      pts.forEach(function (p, i) { line += (i ? 'L' : 'M') + cx(i).toFixed(1) + ',' + y(p.value).toFixed(1); });
      area = line + 'L' + cx(n - 1).toFixed(1) + ',' + y(0) + 'L' + cx(0).toFixed(1) + ',' + y(0) + 'Z';
      var g = svgEl('g', { 'class': 'rv' });
      g.appendChild(svgEl('path', { 'class': 'ar', d: area }));
      g.appendChild(svgEl('path', { 'class': 'ln', d: line }));
      svg.appendChild(g);
    } else {
      pts.forEach(function (p, i) {
        if (!(p.value > 0)) return;
        var h = Math.max(1.5, p.value / top * ih);
        marks[i] = svgEl('path', { 'class': 'col' + (p.soft ? ' soft' : ''), d: roundTop(cx(i) - bw / 2, y(0) - h, bw, h, 4), style: '--d:' + Math.round(i / n * 420) + 'ms' });
        svg.appendChild(marks[i]);
      });
    }
    svg.appendChild(svgEl('line', { 'class': 'base', x1: m.l, x2: W - m.r, y1: y(0), y2: y(0) }));

    // 가장 높은 곳 하나에만 숫자를 단다
    var peak = -1;
    pts.forEach(function (p, i) { if (p.value > 0 && (peak < 0 || p.value >= pts[peak].value)) peak = i; });
    if (peak >= 0) svg.appendChild(svgEl('text', { 'class': 'lb', x: cx(peak), y: y(pts[peak].value) - 9, 'text-anchor': 'middle' }, fmt(pts[peak].value)));

    // 아래 눈금: 겹치면 덜 중요한 것을 뺀다 (오늘이 먼저)
    var gapMin = small ? 30 : 38, kept = [];
    pts.map(function (p, i) { return { i: i, p: p }; }).filter(function (t) { return t.p.tick; })
      .sort(function (a, b) { return (b.p.prio || 0) - (a.p.prio || 0) || a.i - b.i; })
      .forEach(function (t) { if (kept.every(function (k) { return Math.abs(cx(k.i) - cx(t.i)) >= gapMin; })) kept.push(t); });
    kept.forEach(function (t) {
      // 양 끝 글자는 그림 밖으로 나가지 않게 붙인다
      var x = cx(t.i), half = String(t.p.tick).length * 4 + 2, anchor = 'middle';
      if (x + half > W - m.r) { x = W - m.r; anchor = 'end'; } else if (x - half < m.l - 6) { x = m.l - 6; anchor = 'start'; }
      svg.appendChild(svgEl('text', { 'class': t.p.prio ? 'lb' : 'tk', x: x, y: y(0) + 19, 'text-anchor': anchor }, t.p.tick));
      if (t.p.tickSub && o.twoLine && !small) svg.appendChild(svgEl('text', { 'class': 'tk', x: x, y: y(0) + 35, 'text-anchor': anchor }, t.p.tickSub));
    });

    // 겨냥: 세로 실선이 가장 가까운 칸으로 붙는다
    var xh = svgEl('line', { 'class': 'xh', x1: -9, x2: -9, y1: m.t, y2: y(0), visibility: 'hidden' });
    var dot = svgEl('circle', { 'class': 'dot', r: 4, cx: -9, cy: -9, visibility: 'hidden' });
    if (asLine) { svg.appendChild(xh); svg.appendChild(dot); }
    svg.appendChild(svgEl('rect', { 'class': 'hit', x: m.l, y: 0, width: iw, height: H }));
    var cur = -1;
    function at(i, ev) {
      cur = i;
      var p = pts[i];
      fig.classList.add('hovering');
      marks.forEach(function (mk, k) { if (mk) mk.classList.toggle('on', k === i); });
      if (asLine) {
        xh.setAttribute('x1', cx(i)); xh.setAttribute('x2', cx(i)); xh.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', cx(i)); dot.setAttribute('cy', y(p.value)); dot.setAttribute('visibility', 'visible');
      }
      var r = svg.getBoundingClientRect(), sx = r.width / W;
      var t = o.tip(p);
      showTip(ev ? ev.clientX : r.left + cx(i) * sx, ev ? ev.clientY : r.top + y(p.value) * sx, t[0], t[1]);
    }
    function off() {
      fig.classList.remove('hovering');
      marks.forEach(function (mk) { if (mk) mk.classList.remove('on'); });
      xh.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden');
      hideTip();
    }
    svg.addEventListener('pointermove', function (e) {
      var r = svg.getBoundingClientRect();
      at(clamp(Math.floor(((e.clientX - r.left) * (W / r.width) - m.l) / band), 0, n - 1), e);
    });
    svg.addEventListener('pointerleave', off);
    svg.addEventListener('focus', function () { at(cur < 0 ? n - 1 : cur); });
    svg.addEventListener('blur', off);
    svg.addEventListener('keydown', function (e) {
      var k = e.key, i = cur < 0 ? n - 1 : cur;
      if (k === 'ArrowLeft') i--; else if (k === 'ArrowRight') i++; else if (k === 'Home') i = 0; else if (k === 'End') i = n - 1;
      else if (k === 'Escape') { off(); return; } else return;
      e.preventDefault(); at(clamp(i, 0, n - 1));
    });
    svg._dkShow = function () { at(cur < 0 ? n - 1 : cur); };
    fig.appendChild(svg);
    if (o.table) fig.appendChild(table(o.table[0], o.table[1]));
  }

  /* ---------- 요일 × 시간 ---------- */
  function heatmap(fig, d) {
    clear(fig);
    var W = Math.max(280, Math.round(fig.clientWidth || 600));
    var small = W < 600, lw = 26, gap = 2;
    var cw = (W - lw) / 24, ch = clamp(cw * 1.15, 13, 24);
    var H = 7 * ch + 24;
    var mtx = {}, max = 0, best = null;
    (d.hours || []).forEach(function (h) { mtx[h.dow + '-' + h.hour] = h.visits; if (h.visits > max) { max = h.visits; best = h; } });
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', tabindex: '0', 'aria-label': '요일과 시간마다 방문 수. 가장 많은 때는 ' + (best ? ISO_WD_LONG[best.dow] + ' ' + hourName(best.hour) : '아직 없음') });
    var cells = {};
    for (var r = 0; r < 7; r++) {
      var dow = r + 1, cy = r * ch;
      svg.appendChild(svgEl('text', { 'class': 'tk', x: 0, y: cy + ch / 2 + 4 }, ISO_WD[dow]));
      for (var c = 0; c < 24; c++) {
        var v = mtx[dow + '-' + c] || 0;
        var lv = v ? Math.ceil(v / max * 5) : 0;
        var rect = svgEl('rect', { 'class': 'cell l' + lv, x: (lw + c * cw + gap / 2).toFixed(1), y: (cy + gap / 2).toFixed(1), width: (cw - gap).toFixed(1), height: (ch - gap).toFixed(1), rx: 3, style: '--d:' + (c * 14 + r * 22) + 'ms' });
        cells[dow + '-' + c] = rect;
        svg.appendChild(rect);
      }
    }
    (small ? [0, 6, 12, 18] : [0, 3, 6, 9, 12, 15, 18, 21]).forEach(function (h) {
      svg.appendChild(svgEl('text', { 'class': 'tk', x: lw + h * cw + 1, y: 7 * ch + 17 }, h + (h === 0 ? '시' : '')));
    });
    svg.appendChild(svgEl('rect', { 'class': 'hit', x: lw, y: 0, width: W - lw, height: 7 * ch }));
    var cur = null;
    function at(dw, hr, ev) {
      cur = [dw, hr];
      fig.classList.add('hovering');
      for (var k in cells) cells[k].classList.toggle('on', k === dw + '-' + hr);
      var v = mtx[dw + '-' + hr] || 0, rr = svg.getBoundingClientRect(), s = rr.width / W;
      showTip(ev ? ev.clientX : rr.left + (lw + hr * cw + cw / 2) * s, ev ? ev.clientY : rr.top + ((dw - 1) * ch) * s, ISO_WD_LONG[dw] + ' ' + hourName(hr), [[fmt(v), '방문']]);
    }
    function off() { fig.classList.remove('hovering'); for (var k in cells) cells[k].classList.remove('on'); hideTip(); }
    svg.addEventListener('pointermove', function (e) {
      var rr = svg.getBoundingClientRect(), s = W / rr.width;
      var x = (e.clientX - rr.left) * s - lw, yy = (e.clientY - rr.top) * s;
      if (x < 0 || yy > 7 * ch) { off(); return; }
      at(clamp(Math.floor(yy / ch), 0, 6) + 1, clamp(Math.floor(x / cw), 0, 23), e);
    });
    svg.addEventListener('pointerleave', off);
    svg.addEventListener('focus', function () { var b = cur || (best ? [best.dow, best.hour] : [1, 9]); at(b[0], b[1]); });
    svg.addEventListener('blur', off);
    svg.addEventListener('keydown', function (e) {
      var b = cur || [1, 9], dw = b[0], hr = b[1];
      if (e.key === 'ArrowLeft') hr--; else if (e.key === 'ArrowRight') hr++; else if (e.key === 'ArrowUp') dw--; else if (e.key === 'ArrowDown') dw++;
      else if (e.key === 'Escape') { off(); return; } else return;
      e.preventDefault(); at(clamp(dw, 1, 7), clamp(hr, 0, 23));
    });
    svg._dkShow = function () { var b = cur || (best ? [best.dow, best.hour] : [1, 9]); at(b[0], b[1]); };
    fig.appendChild(svg);

    var lg = el('div', 'dk-legend');
    lg.appendChild(el('span', null, '적음'));
    var ls = svgEl('svg', { width: 5 * 18, height: 14, viewBox: '0 0 90 14', 'aria-hidden': 'true' });
    for (var i = 1; i <= 5; i++) ls.appendChild(svgEl('rect', { 'class': 'cell l' + i, x: (i - 1) * 18, y: 0, width: 14, height: 14, rx: 3 }));
    lg.appendChild(ls);
    lg.appendChild(el('span', null, '많음 · 한 칸이 한 시간'));
    fig.appendChild(lg);
    if (best) {
      var cap = el('p', 'dk-cap');
      append(cap, '가장 많이 들어오는 때는 ', el('b', null, ISO_WD_LONG[best.dow] + ' ' + hourName(best.hour)), '예요.');
      fig.appendChild(cap);
    }
    var body = [];
    for (var dw = 1; dw <= 7; dw++) { var row = [ISO_WD_LONG[dw]]; for (var hh = 0; hh < 24; hh++) row.push(String(mtx[dw + '-' + hh] || 0)); body.push(row); }
    var head = ['요일']; for (var h2 = 0; h2 < 24; h2++) head.push(h2 + '시');
    fig.appendChild(table(head, body));
  }

  /* ---------- 칸마다 ---------- */
  // 큰 숫자는 기간을 바꿀 때만 앞 숫자에서 굴러가듯 바뀐다 (저절로 새로 부를 때는 그대로)
  var REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countTo(node, to) {
    var from = node._n == null ? 0 : node._n;
    node._n = to;
    cancelAnimationFrame(node._raf);
    if (REDUCE || !state.anim || from === to || document.visibilityState !== 'visible') { node.textContent = fmt(to); return; }
    var t0 = performance.now(), ms = 760;
    (function step(now) {
      var k = Math.min(1, (now - t0) / ms);
      node.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 4)));
      if (k < 1) node._raf = requestAnimationFrame(step);
    })(t0);
  }
  function mast(d) {
    var t = d.totals, n = d.days;
    $('dkPeriod').textContent = n === 1 ? '오늘 · ' + dayLabel(d.to, true) : dayLabel(d.from, true) + ' – ' + dayLabel(d.to, true);
    $('dkIntro').textContent = n === 1 ? '오늘' : '지난 ' + n + '일 동안';
    countTo($('dkVisits'), t.visits);
    var box = $('dkDelta'); clear(box);
    var c = change(t.visits, d.prev.visits, d);
    if (c) { box.appendChild(el('b', null, c.big)); box.appendChild(el('span', null, (c.dir > 0 ? '늘었어요' : c.dir < 0 ? '줄었어요' : '그대로예요') + ' · ' + versus(d))); }
    else box.appendChild(el('span', null, '기록이 더 쌓이면 앞 기간과 견줘요'));

    var lede = $('dkLede'); clear(lede);
    if (!t.visits) {
      lede.textContent = !d.first ? '아직 다녀간 기록이 없어요. 누군가 들어오면 몇 분 안에 여기에 나타나요.'
        : n === 1 ? '오늘은 아직 다녀간 기록이 없어요. 누군가 들어오면 몇 분 안에 여기에 나타나요.' : '이 기간에는 다녀간 기록이 없어요.';
      return;
    }
    var top = (d.channels || [])[0];
    if (top && top.key === 'direct') append(lede, el('b', null, '주소로 바로 들어온 방문'), '이 가장 많았어요. ');
    else if (top) append(lede, el('b', null, chLabel(top.key)), '에서 가장 많이 왔어요. ');
    if (t.actionVisits) {
      var acts = (d.actionsBy || []).slice(0, 2).map(function (a) { return ACTION[a.name] || a.name; });
      var said = acts.length > 1 ? acts[0] + pp(acts[0], '이나', '나') + ' ' + acts[1] : acts[0];
      append(lede, el('b', null, fmt(t.actionVisits) + '번'), '은 ' + said + '까지 이어졌어요.');
    } else append(lede, '아직 상담이나 예약으로 이어진 방문은 없어요.');
  }

  function kpis(d) {
    var t = d.totals, p = d.prev, box = $('dkKpis'); clear(box);
    var deep = t.homeTracked ? t.homeDeep / t.homeTracked * 100 : null, pdeep = p.homeTracked ? p.homeDeep / p.homeTracked * 100 : null;
    var rate = t.visits ? t.actionVisits / t.visits * 100 : null, prate = p.visits ? p.actionVisits / p.visits * 100 : null;
    var items = [
      { k: '페이지 뷰', parts: [[fmt(t.views), '']], c: change(t.views, p.views, d), note: t.visits ? '한 방문에 ' + (t.views / t.visits).toFixed(1) + '쪽' : '' },
      { k: '머문 시간', parts: durParts(t.engagedMs), c: change(t.engagedMs, p.engagedMs, d), note: '한 번 방문할 때 가운데 값' },
      { k: '홈을 끝까지 본 비율', parts: deep == null ? [['–', '']] : [[String(Math.round(deep)), '%']], c: deep == null || pdeep == null ? null : change(deep, pdeep, d, 'pp'), note: t.homeTracked ? '홈 ' + fmt(t.homeTracked) + '번 가운데 ' + fmt(t.homeDeep) + '번' : '' },
      { k: '행동으로 이어진 방문', parts: rate == null ? [['–', '']] : [[rate < 10 ? rate.toFixed(1) : String(Math.round(rate)), '%']], c: rate == null || prate == null ? null : change(rate, prate, d, 'pp'), note: fmt(t.actionVisits) + '번 · 상담, 예약, 전화, 지도' }
    ];
    items.forEach(function (it) {
      var wrap = el('div', 'dk-kpi'), dd = el('dd'), v = el('span', 'v');
      it.parts.forEach(function (pt, i) {
        if (i) v.appendChild(document.createTextNode(' '));
        v.appendChild(document.createTextNode(pt[0]));
        if (pt[1]) v.appendChild(el('small', null, pt[1]));
      });
      dd.appendChild(v);
      var line = el('span', 'd');
      if (it.c) { line.appendChild(el('b', null, it.c.big)); line.appendChild(document.createTextNode(' ' + versus(d))); }
      else if (it.note) line.textContent = it.note;
      dd.appendChild(line);
      if (it.c && it.note) dd.appendChild(el('span', 'd', it.note));
      wrap.appendChild(el('dt', null, it.k));
      wrap.appendChild(dd);
      box.appendChild(wrap);
    });
  }

  function timeChart(d) {
    var fig = $('figTime');
    if (d.days === 1) {
      var byHour = {}; (d.hours || []).forEach(function (h) { byHour[h.hour] = (byHour[h.hour] || 0) + h.visits; });
      var nowH = kst(d.generatedAt).h;
      var pts = []; for (var h = 0; h < 24; h++) pts.push({ value: byHour[h] || 0, soft: h === nowH, hour: h, tick: h === nowH ? '지금' : h % 3 === 0 ? h + '시' : '', prio: h === nowH ? 1 : 0 });
      $('p1').textContent = '시간마다';
      $('p1a').textContent = '오늘 한 시간마다 들어온 방문 · 지금 시간은 옅게';
      columns(fig, pts, {
        label: '오늘 시간마다 방문 수',
        futureFrom: nowH + 1,
        tip: function (p) { return [hourName(p.hour) + ' – ' + (p.hour + 1) + '시' + (p.soft ? ' · 지금' : ''), [[fmt(p.value), '방문']]]; },
        table: [['시간', '방문'], pts.map(function (p) { return [p.hour + '시', fmt(p.value)]; })]
      });
      return;
    }
    var n = d.daily.length;
    var pts2 = d.daily.map(function (x, i) {
      var dt = parseDay(x.day), today = x.day === d.today, tick = '', sub = '';
      if (n <= 14) { tick = today ? '오늘' : String(dt.getUTCDate()); sub = WD[dt.getUTCDay()]; }
      else if (n <= 31) { if (dt.getUTCDay() === 1 || i === 0) tick = (dt.getUTCMonth() + 1) + '.' + dt.getUTCDate(); }
      else if (dt.getUTCDate() === 1 || i === 0) tick = (dt.getUTCMonth() + 1) + '월'; else if (dt.getUTCDate() === 15) tick = '15일';
      if (today) tick = '오늘';
      return { value: x.visits, soft: today, tick: tick, tickSub: sub, prio: today ? 1 : 0, raw: x };
    });
    $('p1').textContent = '날마다';
    $('p1a').textContent = '하루 방문 · 오늘은 아직 진행 중이라 옅게';
    columns(fig, pts2, {
      label: '날마다 방문 수, ' + dayLabel(d.from) + '부터 ' + dayLabel(d.to) + '까지',
      twoLine: n <= 14,
      tip: function (p) { return [dayLabel(p.raw.day, true) + (p.soft ? ' · 진행 중' : ''), [[fmt(p.raw.visits), '방문'], [fmt(p.raw.views), '페이지 뷰'], [fmt(p.raw.actions), '행동']]]; },
      table: [['날짜', '방문', '페이지 뷰', '행동'], d.daily.map(function (x) { return [dayLabel(x.day, true), fmt(x.visits), fmt(x.views), fmt(x.actions)]; })]
    });
  }

  function channels(d) {
    var box = $('boxChannels'); clear(box);
    var list = d.channels || [], total = sum(list, 'visits');
    $('p2a').textContent = total ? '들어온 방문 ' + fmt(total) + ' · 사이트 안 이동은 빼고' : '';
    if (!list.length) return empty(box, '아직 들어온 길이 없어요', '방문이 생기면 네이버, 인스타그램, 카카오톡 가운데 어디서 왔는지 여기에 적혀요.');
    box.appendChild(rows(list.map(function (c) {
      return { label: chLabel(c.key), sub: CHANNEL_SUB[c.key], value: c.visits, share: pct(c.visits, total),
        tip: function () { return [chLabel(c.key), [[fmt(c.visits), '방문'], [fmt(c.views), '첫 페이지 뷰'], [pct(c.visits, total), '들어온 방문 가운데']]]; } };
    })));
    var refs = (d.refs || []).map(function (r) { return [r.host, fmt(r.visits)]; });
    if (refs.length) box.appendChild(more('보낸 곳 주소 ' + refs.length + '곳', refs));
    var camps = (d.campaigns || []).map(function (c) { return [[c.source, c.medium, c.campaign].filter(Boolean).join(' / '), fmt(c.visits)]; });
    if (camps.length) box.appendChild(more('꼬리표(utm) 붙은 링크 ' + camps.length + '개', camps));
  }

  function actions(d) {
    var box = $('boxActions'); clear(box);
    var list = d.actionsBy || [], t = d.totals;
    $('p3a').textContent = t.actions ? '눌린 횟수 · 방문 ' + fmt(t.visits) + '번 가운데 비율' : '';
    if (!list.length) return empty(box, '아직 눌린 버튼이 없어요', '카카오톡 상담, 체험 수업 예약, 전화, 지도 같은 버튼을 누르면 여기에 적혀요.');
    var places = d.actionPlaces || [];
    box.appendChild(rows(list.map(function (a) {
      var where = places.filter(function (p) { return p.name === a.name; }).slice(0, 2).map(function (p) { return placeLabel(p.path, p.section); });
      return { label: ACTION[a.name] || a.name, sub: where.length ? where.join(', ') + '에서 많이' : '', value: a.count, share: pct(a.visits, t.visits),
        tip: function () {
          var lines = [[fmt(a.count), '번 눌림'], [fmt(a.visits), '방문에서']];
          places.filter(function (p) { return p.name === a.name; }).slice(0, 4).forEach(function (p) { lines.push([fmt(p.count), placeLabel(p.path, p.section)]); });
          return [ACTION[a.name] || a.name, lines];
        } };
    }), { accent: true }));
  }

  function pages(d) {
    var box = $('boxPages'), fl = $('boxFlows'); clear(box); clear(fl);
    var list = d.pages || [], total = sum(list, 'views');
    $('p4a').textContent = total ? '페이지 뷰 ' + fmt(total) + ' · 머문 시간과 스크롤은 평균' : '';
    if (!list.length) { empty(box, '아직 본 페이지가 없어요', '누군가 들어오면 어느 페이지를 얼마나 오래, 어디까지 봤는지 여기에 적혀요.'); return; }
    box.appendChild(rows(list.map(function (p) {
      return { label: pageLabel(p.path), sub: '머문 시간 ' + dur(p.engagedMs) + ' · 스크롤 ' + (p.scroll == null ? '–' : p.scroll + '%'), value: p.views, share: pct(p.views, total),
        tip: function () { return [pageLabel(p.path), [[fmt(p.views), '페이지 뷰'], [fmt(p.visits), '방문'], [dur(p.engagedMs), '머문 시간 평균'], [p.scroll == null ? '–' : p.scroll + '%', '스크롤 평균']]]; } };
    })));
    fl.appendChild(el('h3', 'dk-h3', '다음으로 간 곳'));
    var flows = (d.flows || []).filter(function (f) { return f.to; });
    if (!flows.length) { empty(fl, '아직 없어요', '사이트 안 링크를 눌러 다른 페이지로 가면 여기에 적혀요.'); return; }
    var ol = rows(flows.map(function (f) { return { label: pageLabel(f.from), to: pageLabel(f.to), value: f.count }; }), { small: true });
    ol.classList.add('dk-flows');
    fl.appendChild(ol);
  }

  function sections(d) {
    var box = $('boxSections'); clear(box);
    var t = d.totals, seen = {};
    (d.sections || []).forEach(function (s) { seen[s.key] = s.views; });
    $('p5a').textContent = t.homeTracked ? '홈을 본 ' + fmt(t.homeTracked) + '번 가운데, 그 칸이 화면에 들어온 비율' : '';
    if (!t.homeTracked) return empty(box, '아직 홈을 본 기록이 없어요', '홈을 보면 어느 칸까지 내려갔는지 여기에 적혀요.');
    var reach = HOME.map(function (h) { return { key: h[0], name: h[1], v: (seen[h[0]] || 0) / t.homeTracked * 100 }; });
    box.appendChild(rows(reach.map(function (r, i) {
      return { label: r.name, value: r.v, text: Math.round(r.v) + '%', share: null,
        tip: function () { return [r.name, [[fmt(seen[r.key] || 0), '번 화면에 들어옴'], [Math.round(r.v) + '%', '홈을 본 것 가운데']].concat(i ? [[Math.round(reach[i - 1].v - r.v) + '%p', '바로 앞 칸보다 빠짐']] : [])]; } };
    }), { max: 100 }));
    var drop = null;
    for (var i = 1; i < reach.length; i++) { var dd = reach[i - 1].v - reach[i].v; if (!drop || dd > drop.dd) drop = { dd: dd, a: reach[i - 1].name, b: reach[i].name }; }
    if (drop && drop.dd >= 1) {
      var cap = el('p', 'dk-cap');
      append(cap, '가장 많이 떠나는 곳은 ', el('b', null, drop.a + ' → ' + drop.b), ' 사이예요. ' + Math.round(drop.dd) + '%p가 여기서 멈춰요.');
      box.appendChild(cap);
    }
  }

  function heat(d) {
    var fig = $('figHeat');
    $('p6a').textContent = '요일과 시간마다 · 한국 시각';
    if (d.days === 1) { clear(fig); empty(fig, '7일 이상에서 보여요', '하루치로는 요일과 시간의 무늬가 보이지 않아요. 위에서 7일이나 30일을 골라 보세요.'); return; }
    if (!(d.hours || []).length) { clear(fig); empty(fig, '아직 기록이 없어요', '방문이 쌓이면 무슨 요일, 몇 시에 많이 들어오는지 여기에 보여요.'); return; }
    heatmap(fig, d);
  }

  function who(d) {
    var tv = d.totals.visits;
    [['boxDevices', d.devices, function (k) { return DEVICE[k] || k; }], ['boxBrowsers', d.browsers, function (k) { return BROWSER[k] || k; }]].forEach(function (b) {
      var box = $(b[0]); clear(box);
      if (!(b[1] || []).length) return empty(box, '아직 없어요', '', true);
      box.appendChild(rows(b[1].map(function (x) { return { label: b[2](x.key), value: x.visits, share: pct(x.visits, tv) }; }), { small: true }));
    });
    var rb = $('boxRegions'); clear(rb);
    if (!(d.regions || []).length) return empty(rb, '아직 없어요', '', true);
    rb.appendChild(rows(d.regions.map(function (r) {
      var name = r.country === 'KR' ? (KR_REGION[r.region] || '한국 (지역 모름)') : r.country ? countryName(r.country) : '모름';
      return { label: name, value: r.visits, share: pct(r.visits, tv) };
    }), { small: true }));
    var cities = (d.cities || []).map(function (c) { return [c.city, fmt(c.visits)]; });
    if (cities.length) rb.appendChild(more('도시 ' + cities.length + '곳', cities));
    $('p7a').textContent = tv ? '방문 ' + fmt(tv) + '번 기준' : '';
  }

  function recent(d) {
    var box = $('boxRecent'); clear(box);
    var list = d.recent || [];
    $('p8a').textContent = list.length ? '가장 최근 페이지 뷰 ' + list.length + '개' : '';
    if (!list.length) { var li0 = el('li', 'empty'); empty(li0, '아직 없어요', '누군가 들어오면 몇 분 안에 여기에 한 줄씩 적혀요. 시각, 본 페이지, 들어온 길, 머문 시간이 남아요.'); box.appendChild(li0); return; }
    list.forEach(function (r) {
      var li = el('li'), k = kst(r.ts), today = k.day === d.today;
      li.appendChild(el('span', 'tm', (today ? '' : (+k.day.slice(5, 7)) + '.' + (+k.day.slice(8, 10)) + ' ') + hhmm(r.ts)));
      li.appendChild(el('span', 'ago', ago(r.ts)));
      li.appendChild(el('span', 'pg', pageLabel(r.path)));
      var via = [chLabel(r.channel), DEVICE[r.device] || r.device];
      // 앱 안 브라우저는 들어온 길과 다를 때만 덧붙인다 (인스타그램 · 인스타그램 안 같은 겹침 없이)
      if (r.browser && /KakaoTalk|NAVER app|Instagram|Facebook|Daum app/.test(r.browser) && SAME_APP[r.channel] !== r.browser) via.push(BROWSER[r.browser]);
      li.appendChild(el('span', 'via', via.filter(Boolean).join(' · ')));
      var st = r.engagedMs != null ? dur(r.engagedMs) + ' · ' + (r.scroll == null ? '–' : r.scroll + '%')
        : Date.now() - new Date(r.ts).getTime() < 10 * 60000 ? '보는 중' : '머문 시간 모름';
      li.appendChild(el('span', 'st', st));
      box.appendChild(li);
    });
  }

  /* ---------- 화면 고르기 ---------- */
  function show(which) {
    $('dkWait').hidden = which !== 'wait';
    $('dkGate').hidden = which !== 'gate';
    $('dkMain').hidden = which !== 'main';
  }
  function stamp(text) { $('dkStamp').textContent = text; }

  function render(d) {
    state.data = d;
    document.body.classList.remove('dk-locked');
    state.width = document.documentElement.clientWidth;
    $('dkMain').classList.add('has-data');
    stamp(hhmm(d.generatedAt) + ' 기준');
    var flag = $('dkFlag');
    flag.hidden = !(d.site === 'oyoga-test' || d.access === 'preview');
    flag.textContent = d.site === 'oyoga-test' ? '시험 기록만 보는 중' : '미리보기 · Vercel 로그인으로 잠겨 있어요';
    $('dkLock').hidden = d.access !== 'key';
    $('dkSince').textContent = d.first ? '기록 시작 ' + dayLabel(d.first) + ' · 한국 시각 기준 · 보고 있을 때 5분마다 새로 불러와요' : '아직 쌓인 기록이 없어요';
    // 처음 열 때와 기간을 바꿀 때만 그림이 자라 오른다. 저절로 새로 부를 때는 조용히 바꾼다.
    document.body.classList.toggle('dk-anim', !!state.anim && !REDUCE);
    mast(d); kpis(d); timeChart(d); channels(d); actions(d); pages(d); sections(d); heat(d); who(d); recent(d);
    if (state.anim) {
      state.anim = false;
      clearTimeout(state.animT);
      state.animT = setTimeout(function () { document.body.classList.remove('dk-anim'); }, 1800);
    }
  }

  // 맞는 열쇠를 손으로 넣었을 때 브라우저 암호 관리자에 저장하라고 알린다(크롬·엣지·안드로이드).
  // 사파리는 아이디·암호 칸이 있는 폼 제출을 보고 스스로 묻는다.
  function remember(k) {
    try {
      if (!window.PasswordCredential || !navigator.credentials || !navigator.credentials.store) return;
      var id = $('dkUser').value || '오요가 방문 노트';
      navigator.credentials.store(new window.PasswordCredential({ id: id, password: k, name: id })).catch(function () { /* 저장을 거절해도 그만 */ });
    } catch (e) { /* */ }
  }

  var seq = 0;
  function load() {
    var my = ++seq; // 늦게 온 앞 요청은 버린다 (기간을 빨리 바꿔 눌러도 마지막 것만)
    state.busy = true;
    document.body.classList.add('dk-busy');
    var headers = {};
    if (state.key) headers.Authorization = 'Bearer ' + encodeURIComponent(state.key); // 한글 열쇠도 머리글에 실리게
    fetch(API + '?range=' + state.range + (TEST ? '&site=test' : ''), { headers: headers, cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) return r.json().catch(function () { return {}; }).then(function (j) { var e = new Error('locked'); e.info = j; throw e; });
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (my !== seq) return;
        state.lastOk = Date.now();
        if (state.trying) { state.trying = false; remember(state.key); $('dkKey').value = ''; }
        show('main');
        render(d);
      })
      .catch(function (err) {
        if (my !== seq) return;
        if (err.message === 'locked') return lockOut(err.info || {});
        stamp('불러오지 못했어요');
        if (!state.data) {
          show('wait');
          $('dkWait').querySelector('p').textContent = '기록을 불러오지 못했어요. 잠시 뒤 다시 해 볼게요.';
          setTimeout(load, 10000);
        }
      })
      .then(function () { if (my === seq) { state.busy = false; document.body.classList.remove('dk-busy'); } });
  }

  function lockOut(info) {
    var wrong = state.trying && !!state.key;
    state.key = ''; state.trying = false; store(false, STORE, '');
    state.data = null; $('dkMain').classList.remove('has-data');
    show('gate');
    stamp('잠겨 있어요');
    $('dkGateForm').classList.toggle('off', info.configured === false);
    $('dkGateMsg').textContent = info.configured === false
      ? '아직 열쇠가 정해지지 않았어요. Vercel 환경 변수 OY_DESK_KEY에 열쇠를 넣고 다시 배포하면 열려요.'
      : '오요가 방문 기록을 보려면 열쇠를 넣어 주세요.';
    $('dkGateErr').textContent = wrong ? '열쇠가 맞지 않아요.' : '';
    if (wrong) $('dkKey').value = '';
    document.body.classList.add('dk-locked');
    if (info.configured !== false) setTimeout(function () { try { $('dkKey').focus(); } catch (e) { /* */ } }, 60);
  }

  /* ---------- 시작 ---------- */
  // 주소 끝 #k=열쇠 로 열면 이 기기에 기억하고 주소에서는 바로 지운다
  function keyFromHash() {
    var m = /(?:^#|&)k=([^&]+)/.exec(location.hash);
    if (!m) return false;
    try { state.key = decodeURIComponent(m[1]); } catch (e) { state.key = m[1]; }
    store(false, STORE, state.key);
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  }
  if (!keyFromHash()) state.key = store(true, STORE);
  window.addEventListener('hashchange', function () { if (keyFromHash()) { state.anim = true; load(); } });
  // 홈 화면 앱으로 열었을 때 오요가 첫 화면 링크는 사파리로 연다 (앱 안에 갇히지 않게)
  try {
    if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) {
      var brand = document.querySelector('.dk-brand');
      brand.target = '_blank'; brand.rel = 'noopener';
    }
  } catch (e) { /* */ }
  try { var saved = +sessionStorage.getItem('oy-desk-range'); if (RANGES.indexOf(saved) >= 0) state.range = saved; } catch (e) { /* */ }

  Array.prototype.forEach.call(document.querySelectorAll('.dk-range button'), function (b) {
    b.setAttribute('aria-pressed', String(+b.dataset.range === state.range));
    b.addEventListener('click', function () {
      state.range = +b.dataset.range;
      try { sessionStorage.setItem('oy-desk-range', String(state.range)); } catch (e) { /* */ }
      Array.prototype.forEach.call(document.querySelectorAll('.dk-range button'), function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      state.anim = true;
      load();
    });
  });
  $('dkRefresh').addEventListener('click', function () { load(); });
  $('dkGateForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var k = $('dkKey').value.trim();
    if (!k) return;
    state.key = k; state.trying = true;
    store(false, STORE, k);
    $('dkGateErr').textContent = '';
    load();
  });
  $('dkLock').addEventListener('click', function () { store(false, STORE, ''); state.key = ''; lockOut({ configured: true }); });

  var rt = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (state.data && document.documentElement.clientWidth !== state.width) { state.width = document.documentElement.clientWidth; timeChart(state.data); heat(state.data); } }, 160);
  });
  var lastSeen = Date.now();
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, function () { lastSeen = Date.now(); }, { passive: true }); });
  setInterval(function () {
    if (document.visibilityState === 'visible' && state.data && !state.busy && Date.now() - lastSeen < IDLE_MS) load();
  }, REFRESH_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    lastSeen = Date.now();
    if (state.data && !state.busy && Date.now() - state.lastOk > REFRESH_MS) load();
  });
  // 굴리면 말풍선은 숨긴다. 키보드로 고른 그림이면 멈춘 뒤 다시 띄운다.
  var st = 0;
  window.addEventListener('scroll', function () {
    hideTip();
    clearTimeout(st);
    st = setTimeout(function () {
      var a = document.activeElement;
      try { if (a && a._dkShow && a.matches(':focus-visible')) a._dkShow(); } catch (e) { /* */ }
    }, 180);
  }, { passive: true });

  load();
})();
