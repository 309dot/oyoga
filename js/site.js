/* 오요가 · 공통 동작과 시간표 계산. 페이지 스크립트가 DOM을 만든 뒤 OYS.start()를 부른다. */
window.OYS = (() => {
  const D = window.OY;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desktop = matchMedia("(min-width: 900px)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const img = (k) => `assets/${k}.jpg`;
  const qs = new URLSearchParams(location.search);

  /* ---------- 서울 시각 (?d=2026-11-05&t=18:40 으로 미리 보기) ---------- */
  function seoulNow() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const g = (t) => parts.find((p) => p.type === t).value;
    let date = `${g("year")}-${g("month")}-${g("day")}`, hh = Number(g("hour")) % 24, mm = Number(g("minute"));
    if (/^\d{4}-\d{2}-\d{2}$/.test(qs.get("d") || "")) date = qs.get("d");
    if (/^\d{1,2}:\d{2}$/.test(qs.get("t") || "")) [hh, mm] = qs.get("t").split(":").map(Number);
    return { date, min: hh * 60 + mm, hh, mm };
  }
  const pad = (n) => String(n).padStart(2, "0");
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const dateObj = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const dow = (s) => dateObj(s).getUTCDay();
  const addDays = (s, n) => { const t = dateObj(s); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const md = (s) => { const [, m, d] = s.split("-").map(Number); return `${m}.${pad(d)}`; };
  const mdKo = (s) => { const [, m, d] = s.split("-").map(Number); return `${m}월 ${d}일`; };
  const ymd = (s) => s.replaceAll("-", ".");
  const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c % 28 ? a : b; };

  /* ---------- 시간표 ---------- */
  function classesOn(date) {
    const w = dow(date);
    if (w === 0) return { list: [], off: "sunday" };
    if (date > D.SCHEDULE.to) return { list: [], off: "unknown" }; // 다음 달 시간표를 아직 넣지 않았다
    if (w === 6) {
      if (!(date in D.SAT)) return { list: [], off: "unknown" };
      return D.SAT[date] ? { list: D.SAT[date].map((c) => ({ ...c })) } : { list: [], off: "holiday" };
    }
    const list = (D.WEEK[w] || []).map((c) => {
      const s = D.SUBS.find((x) => x.dow === w && date <= x.until && (x.after ? toMin(c.t) >= toMin(x.after) : toMin(c.t) < toMin(x.before)));
      return s ? { ...c, w: s.who, orig: c.w } : { ...c };
    });
    return { list };
  }
  function nextClass(now = seoulNow()) {
    for (let i = 0; i < 9; i++) {
      const date = addDays(now.date, i);
      for (const c of classesOn(date).list) {
        const s = toMin(c.t);
        if (i === 0 && now.min >= s + c.len) continue;
        return { date, c, i, live: i === 0 && now.min >= s };
      }
    }
    return null;
  }
  const whenWord = (i, date) => (i === 0 ? "오늘" : i === 1 ? "내일" : `${DOW[dow(date)]}요일`);
  // 오늘부터 수업이 있는 날 n개 (일요일 제외)
  function weekDays(n = 6, from = seoulNow().date) {
    const out = [];
    for (let i = 0; out.length < n && i < 14; i++) { const d = addDays(from, i); if (dow(d) !== 0) out.push({ date: d, i }); }
    return out;
  }
  // 이번 달(시간표 적용일부터 말일까지) 선생님별 수업
  function monthOf(name) {
    const start = D.SCHEDULE.from, [y, m] = start.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const days = new Set(), names = [], slots = [];
    for (let d = start; d <= last; d = addDays(d, 1)) {
      classesOn(d).list.forEach((c) => {
        if (c.w !== name) return;
        days.add(dow(d)); if (!names.includes(c.n)) names.push(c.n);
        slots.push({ date: d, ...c });
      });
    }
    return { days: [...days].sort((a, b) => a - b).map((x) => DOW[x]), names, slots };
  }
  // 요일·시각이 같은 수업을 묶는다: "목 19:00 쉼요가" + 날짜 목록
  function weeklyOf(name) {
    const map = new Map();
    monthOf(name).slots.forEach((s) => {
      const k = `${dow(s.date)}|${s.t}|${s.n}`;
      if (!map.has(k)) map.set(k, { dw: dow(s.date), t: s.t, n: s.n, len: s.len, dates: [] });
      map.get(k).dates.push(s.date);
    });
    return [...map.values()].sort((a, b) => a.dw - b.dw || toMin(a.t) - toMin(b.t));
  }

  /* ---------- 커서를 따라오는 사진 ---------- */
  function floatImages(root, selector, srcOf) {
    if (!fine || reduce) return;
    const fl = document.createElement("div"); fl.className = "float"; fl.setAttribute("aria-hidden", "true"); document.body.appendChild(fl);
    const cache = new Map();
    let x = -400, y = -400, tx = -400, ty = -400, on = false, raf = 0;
    const place = (e) => { const w = fl.offsetWidth || 240, h = fl.offsetHeight || 320; tx = e.clientX + 28 + w > innerWidth - 16 ? e.clientX - 28 - w : e.clientX + 28; ty = Math.max(16, Math.min(innerHeight - h - 16, e.clientY - h / 2)); };
    const loop = () => { x += (tx - x) * 0.16; y += (ty - y) * 0.16; fl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${on ? 1 : 0.92})`; raf = on || Math.abs(tx - x) > 0.5 ? requestAnimationFrame(loop) : 0; };
    root.querySelectorAll(selector).forEach((el) => {
      const src = srcOf(el); if (!src) return;
      el.addEventListener("pointerenter", (e) => {
        if (!desktop.matches) return;
        let im = cache.get(src);
        if (!im) { im = new Image(); im.src = src; im.alt = ""; fl.appendChild(im); cache.set(src, im); }
        fl.querySelectorAll("img").forEach((i) => i.classList.toggle("on", i === im));
        if (!on) { place(e); x = tx; y = ty + 30; }
        on = true; fl.classList.add("on"); if (!raf) raf = requestAnimationFrame(loop);
      });
      el.addEventListener("pointerleave", () => { on = false; fl.classList.remove("on"); });
    });
    addEventListener("pointermove", (e) => { if (!on) return; place(e); if (!raf) raf = requestAnimationFrame(loop); });
  }

  /* ---------- WebGL: 사진 위로 안개가 흐르고 10초에 한 번 숨 쉬듯 확대 (A) ---------- */
  function fogGL(cv, im, holder) {
    const gl = cv.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return;
    const vs = "attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}";
    const fs = `precision highp float;varying vec2 v;uniform sampler2D t;uniform vec2 res,img,mouse;uniform float time;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
      float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
      void main(){
        vec2 uv=vec2(v.x,1.-v.y);
        float rs=res.x/res.y,ri=img.x/img.y;
        vec2 sc=rs>ri?vec2(1.,ri/rs):vec2(rs/ri,1.);
        uv=(uv-.5)*sc+.5;
        float br=.5-.5*cos(time*6.28318/10.);
        uv=(uv-.5)/(1.07+.025*br)+.5;
        uv+=(mouse-.5)*vec2(-.014,.01);
        float f=fbm(uv*3.2+vec2(time*.035,time*.012));
        uv+=(f-.5)*.007;
        vec3 c=texture2D(t,uv).rgb;
        float fog=fbm(vec2(uv.x*1.8-time*.022,uv.y*3.+time*.006));
        fog=smoothstep(.48,.98,fog)*(.16+.14*smoothstep(.9,.2,uv.y));
        c=mix(c,vec3(.9,.9,.88),fog);
        float vg=smoothstep(1.25,.3,length((v-.5)*vec2(1.15,1.)));
        c*=mix(.8,1.,vg);
        gl_FragColor=vec4(c,1.);
      }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (k) => gl.getUniformLocation(pr, k);
    const uRes = U("res"), uImg = U("img"), uMouse = U("mouse"), uTime = U("time");
    const go = () => {
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
      gl.uniform2f(uImg, im.naturalWidth, im.naturalHeight);
      let mx = 0.5, my = 0.5, sx = 0.5, sy = 0.5, vis = true;
      const t0 = performance.now();
      addEventListener("pointermove", (e) => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; });
      new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(holder);
      const size = () => { const d = Math.min(devicePixelRatio || 1, 1.5); cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d; gl.viewport(0, 0, cv.width, cv.height); gl.uniform2f(uRes, cv.width, cv.height); };
      size(); addEventListener("resize", size);
      (function frame(now) {
        if (vis) { sx += (mx - sx) * 0.05; sy += (my - sy) * 0.05; gl.uniform2f(uMouse, sx, sy); gl.uniform1f(uTime, (now - t0) / 1000); gl.drawArrays(gl.TRIANGLES, 0, 3); }
        requestAnimationFrame(frame);
      })(t0);
      holder.classList.add("gl");
    };
    im.complete && im.naturalWidth ? go() : im.addEventListener("load", go, { once: true });
  }

  /* ---------- 로고: 한 줄로 이어 그린 명상하는 사람 (원본 images/_레이어_1.svg) ---------- */
  // MID는 원본 윤곽에서 뽑은 가운데 선이다. 이 선을 따라 가면을 열면 원본 모양 그대로, 다리 → 척추 → 팔 → 머리 순서로 그려진다
  const MARK_OUT = "M132.83 163.5C120.54 163.5 105.61 161.78 92.94 155.28C92.37 154.98 92.14 154.28 92.44 153.71C92.74 153.14 93.44 152.91 94.00 153.21C120.07 166.6 156.29 159.11 156.66 159.04C163.28 157.68 167.13 155.63 167.53 153.24C168.06 149.99 162.61 146.04 160.46 144.79C147.79 138.24 126.59 140.03 126.39 140.04C109.04 140.04 81.67 150.99 81.40 151.11C70.85 155.53 55.58 158.08 54.95 158.19C33.23 163.26 14.20 159.66 14.01 159.63C13.96 159.63 13.93 159.61 13.90 159.59C7.41 157.56 3.66 154.88 2.75 151.61C1.90 148.56 3.88 146.28 3.96 146.19C12.51 136.28 37.08 137.99 38.12 138.08C47.98 138.96 76.52 139.94 76.80 139.94C84.40 139.94 89.75 138.24 92.70 134.88C95.49 131.69 95.04 128.16 95.02 128.01C95.02 127.96 95.02 127.89 95.02 127.84V101.44C95.02 79.12 115.99 66.85 116.21 66.72C116.24 66.70 116.27 66.69 116.32 66.67C129.14 61.07 149.48 50.03 149.48 44.30C149.48 44.20 149.48 44.12 149.51 44.02C149.51 43.95 149.89 42.20 148.33 40.05C146.36 37.35 141.24 33.87 127.99 32.56C127.77 32.56 98.84 31.76 90.45 7.78C82.09 31.76 53.13 32.56 52.83 32.56C39.57 33.87 34.47 37.40 32.53 40.13C31.03 42.27 31.40 44.00 31.40 44.02C31.41 44.12 31.43 44.20 31.43 44.30C31.43 50.03 51.77 61.07 64.58 66.67C75.85 72.17 82.17 71.02 82.24 71.02C82.30 71.02 82.39 71.00 82.47 71.00C89.20 71.00 95.39 62.63 95.45 62.55C103.81 52.85 107.14 45.18 105.19 40.33C103.21 35.42 96.35 34.73 96.29 34.72C96.20 34.72 96.14 34.70 96.05 34.67C94.27 34.12 91.04 34.48 89.85 34.68C84.57 36.35 81.50 38.88 80.74 42.20C79.02 49.63 88.84 59.02 88.94 59.12C89.40 59.55 89.42 60.30 88.99 60.75C88.55 61.22 87.82 61.23 87.35 60.80C86.90 60.38 76.47 50.40 78.49 41.68C79.45 37.48 83.07 34.38 89.25 32.45C89.30 32.45 89.35 32.41 89.40 32.41C89.59 32.38 93.90 31.63 96.65 32.41C97.72 32.53 105.01 33.58 107.37 39.47C109.71 45.27 106.32 53.52 97.30 64.00C97.09 64.32 90.45 73.25 82.60 73.34C81.59 73.50 74.92 74.30 63.65 68.80C60.17 67.29 29.41 53.58 29.15 44.45C29.03 43.82 28.80 41.47 30.66 38.82C33.88 34.27 41.32 31.38 52.73 30.28C53.13 30.28 83.29 29.40 89.34 3.45C89.45 2.91 89.92 2.55 90.47 2.55C91.02 2.55 91.52 2.91 91.64 3.45C97.69 29.40 127.84 30.26 128.16 30.28C139.68 31.40 147.11 34.28 150.33 38.83C152.19 41.48 151.96 43.83 151.84 44.47C151.58 53.55 121.17 67.15 117.36 68.82C116.26 69.49 97.39 81.05 97.39 101.49V127.83C97.47 128.53 97.77 132.68 94.55 136.41C91.17 140.33 85.20 142.31 76.84 142.31C76.50 142.31 47.93 141.33 38.00 140.43C37.77 140.43 13.58 138.71 5.78 147.76C5.73 147.83 4.53 149.24 5.06 151.06C5.55 152.74 7.60 155.19 14.60 157.39C15.78 157.61 33.90 160.78 54.58 155.94C54.82 155.91 70.30 153.31 80.62 148.99C81.77 148.53 108.71 137.76 126.39 137.76C127.19 137.69 148.38 135.89 161.7 142.79C162.68 143.36 170.81 148.26 169.95 153.64C169.36 157.19 165.23 159.71 157.26 161.36C157.06 161.4 146.68 163.55 132.96 163.55L132.83 163.5Z";
  const MARK_MID = "M92.3 154.2L92.8 153.8L96.3 155.6L100.2 157.2L104.3 158.5L108.4 159.7L116.4 161.2L124.7 162.1L135.0 162.3L144.5 161.9L155.1 160.5L158.7 159.8L161.8 158.9L164.3 157.9L166.4 156.6L167.7 155.1L168.4 153.7L168.5 152.1L167.9 150.2L166.7 148.4L164.7 146.5L162.6 144.8L160.2 143.4L157.4 142.2L154.3 141.2L150.8 140.3L147.0 139.6L138.3 138.8L131.4 138.7L122.7 139.1L117.5 139.6L111.4 140.7L103.9 142.5L95.9 144.8L87.3 147.7L76.5 151.8L68.5 154.1L61.4 155.8L50.4 158.0L45.4 158.8L40.0 159.4L33.4 159.7L26.4 159.7L19.4 159.2L14.2 158.4L9.9 156.8L6.6 154.8L5.3 153.6L4.5 152.5L4.0 151.4L3.8 150.1L4.2 148.4L5.1 146.8L6.8 145.2L9.0 143.7L11.5 142.5L14.7 141.4L18.0 140.5L21.7 139.9L28.0 139.3L35.0 139.1L57.7 140.4L78.6 141.1L82.6 140.7L85.9 140.1L88.8 139.0L91.5 137.5L93.1 136.1L94.4 134.4L95.4 132.5L95.9 130.8L96.2 128.1L96.2 102.0L96.5 97.4L97.2 93.4L98.4 89.6L100.0 85.9L102.0 82.3L104.4 79.0L107.0 75.9L109.9 73.1L113.3 70.2L116.6 68.0L130.4 61.2L136.0 58.0L140.7 55.0L144.4 52.4L147.4 49.8L149.4 47.4L150.3 45.4L150.6 43.9L150.5 42.3L150.0 40.9L149.3 39.6L148.2 38.2L146.9 37.1L143.4 35.0L139.5 33.6L135.4 32.5L130.9 31.8L123.3 30.9L117.5 29.7L111.3 27.5L105.7 24.6L101.7 21.8L98.3 18.6L96.5 16.5L94.9 14.2L93.5 11.8L92.3 9.3L91.4 8.6L90.6 8.4L89.8 8.5L88.6 9.4L87.3 12.2L85.7 14.8L83.8 17.3L81.7 19.6L77.5 23.2L72.7 26.1L67.5 28.4L61.8 30.1L56.9 31.0L47.6 32.1L41.5 33.5L38.7 34.5L36.3 35.6L34.2 36.9L32.7 38.3L31.4 40.1L30.5 42.1L30.4 44.0L30.9 46.2L32.0 48.1L33.6 49.8L36.2 52.0L39.3 54.4L44.8 57.9L51.6 61.7L58.8 65.3L67.0 69.0L71.0 70.5L74.8 71.6L78.4 72.2L81.8 72.2L84.9 71.8L87.2 71.0L89.9 69.5L92.7 67.2L95.6 64.3L100.0 58.8L102.8 54.7L104.7 51.2L106.0 48.1L106.7 45.5L106.8 43.0L106.5 40.9L105.6 38.8L104.3 37.1L102.3 35.6L100.1 34.5L97.1 33.7L94.1 33.3L91.4 33.4L88.7 33.9L85.8 35.1L83.2 36.8L81.4 38.5L80.1 40.7L79.6 42.8L79.5 45.3L80.0 47.7L81.0 50.2L82.8 53.5L85.4 56.9L86.8 58.2L89.1 59.7L89.3 60.2";
  let markN = 0;
  function markSVG(cls) {
    const id = "oym" + (++markN);
    return `<svg class="${cls}" viewBox="0 0 173 166" aria-hidden="true" focusable="false"><mask id="${id}" maskUnits="userSpaceOnUse" x="-8" y="-8" width="189" height="182"><path d="${MARK_MID}" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 2" stroke-dashoffset="1.1"/></mask><path d="${MARK_OUT}" fill="currentColor" stroke="currentColor" stroke-width="3" mask="url(#${id})"/></svg>`;
  }
  function drawMark(svg, p) { // p: 0 ~ 1. 0에서는 둥근 끝이 점으로 남지 않게 아예 비운다
    svg.querySelector("mask path").setAttribute("stroke-dashoffset", p <= 0.002 ? 1.1 : Math.max(0, 1 - p));
  }
  // 맨 아래 큰 이름 옆에 로고를 앉히고, 보이기 시작하면 한 줄로 그린다
  function footMark() {
    const giant = document.querySelector(".giant");
    if (!giant) return;
    giant.insertAdjacentHTML("beforeend", markSVG("giant-mark"));
    const svg = giant.querySelector(".giant-mark");
    if (reduce || !window.gsap || !window.ScrollTrigger) { drawMark(svg, 1); return; }
    const o = { p: 0 };
    // 큰 이름이 절반쯤 올라왔을 때 시작한다 (휴대폰에서도 끝까지 내리면 반드시 지나는 지점)
    gsap.to(o, { p: 1, duration: 2.4, ease: "power1.inOut", onUpdate: () => drawMark(svg, o.p), scrollTrigger: { trigger: ".foot", start: () => "bottom bottom+=" + Math.round(giant.offsetHeight * 0.5), invalidateOnRefresh: true, once: true } });
  }

  /* ---------- 페이지 사이: 누른 자리에서 원이 덮고, 다음 페이지에서 가운데로 닫힌다 ---------- */
  const veil = () => document.querySelector(".veil");
  function veilIn() {
    const v = veil(), root = document.documentElement;
    if (!v || !root.classList.contains("veil-in")) return false;
    try { sessionStorage.removeItem("oy-veil"); } catch (e) { /* 저장소 없음 */ }
    if (reduce) { root.classList.remove("veil-in"); return true; }
    v.style.clipPath = "circle(150vmax at 50% 50%)";
    v.classList.add("full");
    root.classList.remove("veil-in");
    v.getBoundingClientRect();
    setTimeout(() => {
      v.style.transition = "clip-path 1s cubic-bezier(.77,0,.18,1)";
      v.style.clipPath = "circle(0px at 50% 50%)";
      v.classList.remove("full");
    }, 120);
    return true;
  }
  function go(url, x, y) {
    const v = veil();
    if (!v || reduce) { location.href = url; return; }
    v.style.transition = "none";
    v.style.clipPath = `circle(0px at ${x}px ${y}px)`;
    v.getBoundingClientRect();
    v.style.transition = "clip-path .72s cubic-bezier(.77,0,.18,1)";
    v.style.clipPath = `circle(150vmax at ${x}px ${y}px)`;
    v.classList.add("full");
    try { sessionStorage.setItem("oy-veil", "1"); } catch (e) { /* 저장소 없음 */ }
    setTimeout(() => { location.href = url; }, 740);
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || !/\/([\w-]+\.html)?$/.test(u.pathname)) return; // 사이트 안 페이지로 갈 때만 장막을 친다
    if (u.pathname === location.pathname && u.search === location.search) return; // 같은 페이지 안 이동
    e.preventDefault();
    go(u.href, e.clientX || innerWidth / 2, e.clientY || innerHeight / 2);
  });
  addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    const v = veil(); if (!v) return;
    v.style.transition = "none"; v.style.clipPath = "circle(0px at 50% 50%)"; v.classList.remove("full");
  });

  /* ---------- 머리, 메뉴, 아래 예약 버튼, 커서 ---------- */
  function chrome() {
    const page = document.body.dataset.page;
    document.querySelectorAll(`[data-nav="${page}"]`).forEach((a) => a.setAttribute("aria-current", "page"));
    const top = document.getElementById("top"), dock = document.getElementById("dock"), stop = document.querySelector("[data-dock-stop]");
    let lastY = scrollY;
    const probeY = () => top.offsetHeight / 2;
    function under() { // 머리 아래에 무엇이 있는지 본다 (겹친 장면과 종이를 정확히 가린다)
      const els = document.elementsFromPoint(innerWidth / 2, probeY());
      const el = els.find((x) => !top.contains(x) && !x.classList.contains("dock") && !x.closest(".loader")); // 여는 화면은 건너뛰어 그 뒤 히어로 기준으로 색을 정한다
      return el && el.closest("[data-dark]");
    }
    function onScroll() {
      const y = scrollY, dark = under();
      top.classList.toggle("on-paper", !dark);
      const far = y > innerHeight * 1.2;
      if (y > lastY + 4 && far && !document.body.classList.contains("menu-open")) top.classList.add("hide");
      else if (y < lastY - 4 || !far) top.classList.remove("hide");
      if (dock) dock.classList.toggle("show", y > innerHeight * 0.7 && (!stop || stop.getBoundingClientRect().top > innerHeight * 0.75));
      lastY = y;
    }
    addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll); onScroll();
    chrome.update = onScroll;

    const menu = document.getElementById("menu"), btn = document.getElementById("menuBtn");
    if (menu && btn) {
      const set = (o) => { menu.classList.toggle("open", o); btn.setAttribute("aria-expanded", String(o)); document.body.classList.toggle("menu-open", o); if (o) setTimeout(() => menu.querySelector("a").focus(), 300); };
      btn.addEventListener("click", () => set(true));
      document.getElementById("menuClose").addEventListener("click", () => { set(false); btn.focus(); });
      menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => set(false)));
      addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("open")) { set(false); btn.focus(); } });
    }

    const cursor = document.getElementById("cursor");
    if (cursor && fine && !reduce) {
      let cx = -200, cy = -200, tx = -200, ty = -200;
      addEventListener("pointermove", (e) => { tx = e.clientX; ty = e.clientY; });
      (function loop() { cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18; cursor.style.setProperty("--x", cx + "px"); cursor.style.setProperty("--y", cy + "px"); requestAnimationFrame(loop); })();
      document.querySelectorAll("[data-cursor]").forEach((el) => {
        el.addEventListener("pointerenter", () => { const l = el.getAttribute("data-cursor"); if (!l) return; cursor.textContent = l; cursor.classList.add("on"); });
        el.addEventListener("pointerleave", () => cursor.classList.remove("on"));
      });
    }
  }

  /* ---------- 스크롤 움직임 ---------- */
  let lenis = null;
  function motion() {
    if (reduce || !window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    if (window.Lenis) {
      lenis = new Lenis({ lerp: 0.085 });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }
    document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
      const id = a.getAttribute("href"), t = id.length > 1 && document.querySelector(id);
      if (!t || !lenis) return;
      e.preventDefault(); lenis.scrollTo(t, { offset: id === "#main" ? 0 : -96, duration: 1.5 });
      history.replaceState(null, "", id);
    }));
    document.querySelectorAll(".reveal").forEach((el) => {
      gsap.fromTo(el, { clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)", duration: 1.4, ease: "expo.inOut", scrollTrigger: { trigger: el, start: "top 90%" } });
    });
    document.querySelectorAll("[data-par]").forEach((im) => {
      const k = parseFloat(im.dataset.par) || 10;
      gsap.fromTo(im, { yPercent: -k }, { yPercent: 0, ease: "none", scrollTrigger: { trigger: im.parentElement, start: "top bottom", end: "bottom top", scrub: true } });
    });
    document.querySelectorAll("[data-drift]").forEach((w) => {
      const k = parseFloat(w.dataset.drift);
      gsap.fromTo(w, { xPercent: -k }, { xPercent: k, ease: "none", scrollTrigger: { trigger: w, start: "top bottom", end: "bottom top", scrub: true } });
    });
    document.querySelectorAll("[data-rise]").forEach((el) => {
      gsap.from(el.querySelectorAll(".line-mask > span"), { yPercent: 110, duration: 1.3, ease: "expo.out", stagger: 0.1, scrollTrigger: { trigger: el, start: "top 80%" } });
    });
    const giant = document.querySelector(".giant");
    if (giant) gsap.from(giant, { yPercent: 40, ease: "none", scrollTrigger: { trigger: ".foot", start: "top bottom", end: "bottom bottom", scrub: true } });
  }

  // 처음 보이는 제목 줄이 아래에서 올라온다 (하위 페이지)
  function intro() {
    const lines = document.querySelectorAll("[data-intro] .line-mask > span");
    if (!lines.length || reduce || !window.gsap) return;
    gsap.from(lines, { yPercent: 110, duration: 1.3, ease: "expo.out", stagger: 0.09, delay: document.documentElement.classList.contains("veil-in") ? 0.55 : 0.15, clearProps: "transform" });
    setTimeout(() => lines.forEach((l) => { l.style.transform = ""; }), 2600); // 탭이 가려져 애니메이션이 멈춰도 글자는 보이게
  }

  function start(opts = {}) {
    chrome();
    if (opts.intro !== false) intro();
    veilIn();
    motion();
    footMark();
  }

  return { D, reduce, desktop, fine, img, seoulNow, toMin, fromMin, pad, DOW, dow, addDays, md, mdKo, ymd, josa,
    classesOn, nextClass, whenWord, weekDays, monthOf, weeklyOf, floatImages, fogGL, markSVG, drawMark, go, start, get lenis() { return lenis; }, refresh: () => chrome.update && chrome.update() };
})();
