/* 오요가 방문 기록 받는 곳 — POST /api/oy
   js/oy.js 가 보낸 짧은 기록(페이지 열림·떠남·링크 누름)을 DB 에 쌓는다.

   개인정보: IP 는 저장하지 않는다. IP·브라우저 정보에 그날의 무작위 값(salts 표)을 섞어
   짧은 표시(visitor)만 남기고, 날이 바뀌면 전날 값을 지운다. 그래서 같은 날 안에서만
   "같은 사람"을 알 수 있고, 지난 기록은 누구도 다시 사람과 이을 수 없다. 쿠키도 없다.

   DB 주소(DATABASE_URL)가 없으면 아무것도 하지 않고 204 를 돌려준다. 표는 처음 받을 때
   스스로 만든다. 정식 주소(oyoga.kr)가 아니거나 ?debug_analytics 로 보낸 기록은
   site='oyoga-test' 로 따로 쌓는다. */
import crypto from 'node:crypto';
import postgres from 'postgres';

const SITE = 'oyoga';
const LIVE_HOST = /(^|\.)oyoga\.kr$/;
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const sql = DB_URL
  ? postgres(DB_URL, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 })
  : null;

const SCHEMA = [
  `create table if not exists pageviews (
    vid          text primary key,
    site         text not null,
    day          date not null,
    ts           timestamptz not null default now(),
    visitor      text not null,
    path         text not null,
    ref_host     text,
    channel      text,
    utm_source   text,
    utm_medium   text,
    utm_campaign text,
    device       text,
    os           text,
    browser      text,
    vw           smallint,
    country      text,
    region       text,
    city         text,
    engaged_ms   integer,
    scroll_pct   smallint,
    sections     text[],
    left_at      timestamptz
  )`,
  `create index if not exists pageviews_site_day on pageviews (site, day)`,
  `create table if not exists events (
    id      bigint generated always as identity primary key,
    site    text not null,
    day     date not null,
    ts      timestamptz not null default now(),
    visitor text not null,
    vid     text,
    path    text,
    name    text not null,
    target  text,
    label   text,
    section text
  )`,
  `create index if not exists events_site_day on events (site, day)`,
  `create table if not exists salts (
    day  date primary key,
    salt text not null
  )`
];

let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => { for (const s of SCHEMA) await sql.unsafe(s); })();
    schemaReady.catch(() => { schemaReady = null; }); // 실패하면 다음 요청에서 다시
  }
  return schemaReady;
}

// 한국 날짜. 방문자 표시는 이 날짜 단위로 바뀐다
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const kstDay = () => dayFmt.format(new Date());

let saltCache = { day: '', salt: '' };
async function saltFor(day) {
  if (saltCache.day === day) return saltCache.salt;
  const fresh = crypto.randomBytes(16).toString('hex');
  await sql`insert into salts (day, salt) values (${day}, ${fresh}) on conflict (day) do nothing`;
  const [row] = await sql`select salt from salts where day = ${day}`;
  await sql`delete from salts where day < ${day}`; // 지난날 값은 지운다 — 되돌릴 수 없게
  saltCache = { day, salt: row.salt };
  return row.salt;
}

const BOT = /bot\b|bot\/|crawl|spider|slurp|yeti\/|daumoa|bingpreview|mediapartners|facebookexternalhit|embedly|pinterest|lighthouse|pagespeed|headless|phantomjs|puppeteer|playwright|selenium|python|curl\/|wget|httpclient|okhttp|go-http|axios|node-fetch|scrapy|bytespider|petalbot|semrush|ahrefs|mj12|dotbot/i;

function parseUA(ua) {
  const tablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua);
  const mobile = !tablet && /Mobi|iPhone|iPod|Android/i.test(ua);
  const os = /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Android/i.test(ua) ? 'Android'
    : /Windows/i.test(ua) ? 'Windows'
    : /Macintosh|Mac OS X/i.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/i.test(ua) ? 'Linux' : 'other';
  // 앱 안 브라우저(카카오톡·네이버·인스타)를 먼저 가른다 — 어디서 왔는지의 큰 단서다
  const browser = /KAKAOTALK/i.test(ua) ? 'KakaoTalk'
    : /NAVER\(inapp/i.test(ua) ? 'NAVER app'
    : /Instagram/i.test(ua) ? 'Instagram'
    : /FBAN|FBAV/i.test(ua) ? 'Facebook'
    : /DaumApps/i.test(ua) ? 'Daum app'
    : /SamsungBrowser/i.test(ua) ? 'Samsung Internet'
    : /Whale\//i.test(ua) ? 'Whale'
    : /Edg(e|A|iOS)?\//i.test(ua) ? 'Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
    : /Firefox\/|FxiOS/i.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS/i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari' : 'other';
  return { device: tablet ? 'tablet' : mobile ? 'mobile' : 'desktop', os, browser };
}

const hostIs = (h, re) => re.test(h);
function channelOf(refHost, utmSource, browser, host) {
  if (utmSource) return utmSource.toLowerCase().slice(0, 40);
  if (refHost) {
    if (refHost === host || LIVE_HOST.test(refHost)) return 'internal';
    if (hostIs(refHost, /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/)) return 'ai';
    if (hostIs(refHost, /(^|\.)search\.naver\.com$/)) return 'naver_search';
    if (hostIs(refHost, /(^|\.)(map\.naver\.com|place\.naver\.com)$/)) return 'naver_map';
    if (hostIs(refHost, /(^|\.)blog\.naver\.com$/)) return 'naver_blog';
    if (hostIs(refHost, /(^|\.)cafe\.naver\.com$/)) return 'naver_cafe';
    if (hostIs(refHost, /(^|\.)(naver\.com|naver\.me)$/)) return 'naver';
    if (hostIs(refHost, /(^|\.)google\.[a-z.]+$/)) return 'google';
    if (hostIs(refHost, /(^|\.)instagram\.com$/)) return 'instagram';
    if (hostIs(refHost, /(^|\.)(facebook\.com|fb\.com)$/)) return 'facebook';
    if (hostIs(refHost, /(^|\.)(kakao\.com|kakaocdn\.net)$/)) return 'kakao';
    if (hostIs(refHost, /(^|\.)daum\.net$/)) return 'daum';
    if (hostIs(refHost, /(^|\.)bing\.com$/)) return 'bing';
    if (hostIs(refHost, /(^|\.)(youtube\.com|youtu\.be)$/)) return 'youtube';
    return 'other';
  }
  // 앱 안 브라우저는 보낸 곳을 숨기는 일이 많아 브라우저로 짐작한다
  if (browser === 'KakaoTalk') return 'kakao';
  if (browser === 'Instagram') return 'instagram';
  if (browser === 'NAVER app') return 'naver';
  if (browser === 'Facebook') return 'facebook';
  return 'direct';
}

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const int = (v, lo, hi) => (v !== null && v !== '' && Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : null);
function refHostOf(r) {
  if (typeof r !== 'string' || !r) return null;
  try { return new URL(r).hostname.toLowerCase().slice(0, 100) || null; } catch { return null; }
}
function normPath(p) {
  if (typeof p !== 'string' || p.length > 200 || !/^\/[\w\-./%~]*(\?s=[\w\-.%~]+)?$/.test(p)) return null;
  return p.replace(/\/index\.html$/, '/');
}
// 글자 배열을 Postgres 배열 글자로 — 값은 매개변수로 넘기고 ::text[] 로 바꾼다
const pgTextArray = (items) => '{' + items.map((s) => '"' + s.replace(/(["\\])/g, '\\$1') + '"').join(',') + '}';
function header(req, name) {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v || '';
}

// 돌려주는 값은 응답 머리글 X-Oy 로 나간다: stored | nodb | origin | size | invalid | bot
async function record(req) {
  if (!sql) return 'nodb';
  const host = header(req, 'x-forwarded-host') || header(req, 'host');
  const hostname = host.split(':')[0].toLowerCase();
  const origin = header(req, 'origin');
  if (origin) {
    let oh = '';
    try { oh = new URL(origin).hostname.toLowerCase(); } catch { return 'origin'; }
    if (oh !== hostname) return 'origin'; // 다른 사이트에서 보낸 기록은 받지 않는다
  }

  let b = req.body;
  if (typeof b === 'string') {
    if (b.length > 4000) return 'size';
    try { b = JSON.parse(b); } catch { return 'invalid'; }
  }
  if (!b || typeof b !== 'object') return 'invalid';

  const ua = header(req, 'user-agent').slice(0, 400);
  if (!ua || BOT.test(ua)) return 'bot';
  const vid = typeof b.v === 'string' && /^[\w-]{8,40}$/.test(b.v) ? b.v : null;
  const path = normPath(b.p);
  if (!vid || !path) return 'invalid';

  const site = LIVE_HOST.test(hostname) && !b.test ? SITE : SITE + '-test';
  await ensureSchema();
  const day = kstDay();
  const salt = await saltFor(day);
  const ip = header(req, 'x-forwarded-for').split(',')[0].trim() || header(req, 'x-real-ip') || req.socket?.remoteAddress || '';
  const visitor = crypto.createHash('sha256').update([salt, site, ip, ua].join('|')).digest('base64url').slice(0, 16);
  const { device, os, browser } = parseUA(ua);
  const country = str(header(req, 'x-vercel-ip-country'), 8);
  const region = str(header(req, 'x-vercel-ip-country-region'), 16);
  let city = header(req, 'x-vercel-ip-city');
  try { city = decodeURIComponent(city); } catch { /* 그대로 */ }
  city = str(city, 60);

  if (b.t === 'view') {
    const u = b.u && typeof b.u === 'object' ? b.u : {};
    const refHost = refHostOf(b.r);
    const utmSource = str(u.source, 60);
    const channel = channelOf(refHost, utmSource, browser, hostname);
    await sql`
      insert into pageviews (vid, site, day, visitor, path, ref_host, channel, utm_source, utm_medium, utm_campaign,
                             device, os, browser, vw, country, region, city)
      values (${vid}, ${site}, ${day}, ${visitor}, ${path}, ${refHost}, ${channel},
              ${utmSource}, ${str(u.medium, 60)}, ${str(u.campaign, 60)},
              ${device}, ${os}, ${browser}, ${int(b.w, 0, 10000)}, ${country}, ${region}, ${city})
      on conflict (vid) do nothing`;
    console.log(`[oy] ${site} view ${path} ${channel} ${device}`); // 한 줄 기록 — IP·방문자 표시는 남기지 않는다
    return 'stored';
  } else if (b.t === 'leave') {
    const sections = Array.isArray(b.sec) ? b.sec.slice(0, 40).map((s) => str(s, 60)).filter(Boolean) : [];
    // 같은 페이지에서 여러 번 올 수 있다(탭을 오갈 때). 큰 값만 남긴다
    await sql`
      insert into pageviews (vid, site, day, visitor, path, device, os, browser, country, region, city,
                             engaged_ms, scroll_pct, sections, left_at)
      values (${vid}, ${site}, ${day}, ${visitor}, ${path}, ${device}, ${os}, ${browser}, ${country}, ${region}, ${city},
              ${int(b.ms, 0, 1800000)}, ${int(b.s, 0, 100)}, ${pgTextArray(sections)}::text[], now())
      on conflict (vid) do update set
        engaged_ms = greatest(coalesce(pageviews.engaged_ms, 0), excluded.engaged_ms),
        scroll_pct = greatest(coalesce(pageviews.scroll_pct, 0), excluded.scroll_pct),
        sections   = array(select distinct unnest(coalesce(pageviews.sections, '{}') || excluded.sections)),
        left_at    = excluded.left_at`;
    console.log(`[oy] ${site} leave ${path} ${int(b.ms, 0, 1800000)}ms ${int(b.s, 0, 100)}%`);
    return 'stored';
  } else if (b.t === 'click') {
    const name = typeof b.n === 'string' && /^[a-z0-9_-]{1,40}$/.test(b.n) ? b.n : null;
    if (!name) return 'invalid';
    await sql`
      insert into events (site, day, visitor, vid, path, name, target, label, section)
      values (${site}, ${day}, ${visitor}, ${vid}, ${path}, ${name}, ${str(b.to, 300)}, ${str(b.l, 80)}, ${str(b.sec, 60)})`;
    console.log(`[oy] ${site} click ${path} ${name}`);
    return 'stored';
  }
  return 'invalid';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
    return;
  }
  let result = 'error';
  try {
    result = await record(req);
  } catch (err) {
    console.error('[oy] error', err && err.message);
  }
  res.setHeader('X-Oy', result); // 시험할 때 저장됐는지 보는 용도. 비밀은 담지 않는다
  res.status(204).end();
}
