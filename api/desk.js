// 오요가 방문 노트: 쌓인 방문 기록(api/oy.js 가 받은 것)을 한 번에 묶어서 돌려준다. desk.html 이 읽는다.
//
//   GET    /api/desk?range=1|7|30|90[&site=test]   통계 JSON. 질의 한 번으로 끝낸다(DB가 멀리 있어도 한 번만 오간다).
//   DELETE /api/desk?site=test                      시험 기록(site='oyoga-test')만 지운다.
//
// 누가 볼 수 있나
//   - 시험 기록(site=test) 읽기: 누구나. 사람 기록이 아니다.
//   - Vercel 미리보기 배포(VERCEL_ENV=preview): Vercel 로그인이 이미 지키고 있어서 열쇠 없이 열린다.
//   - 정식 사이트: 환경 변수 OY_DESK_KEY 와 같은 열쇠를 Authorization: Bearer 로 보내야 한다.
//     열쇠가 설정되지 않았으면 아무도 못 본다.
import crypto from 'node:crypto';
import postgres from 'postgres';

const SITE = 'oyoga';
const TEST_SITE = 'oyoga-test';
const RANGES = new Set([1, 7, 30, 90]);
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const KEY = (process.env.OY_DESK_KEY || '').trim();
const OPEN_ENV = process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'development';

const sql = DB_URL ? postgres(DB_URL, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 }) : null;

function header(req, name) {
  const v = req.headers && req.headers[name];
  return Array.isArray(v) ? v[0] : v || '';
}

function sameKey(given) {
  const a = crypto.createHash('sha256').update(String(given).normalize('NFC')).digest();
  const b = crypto.createHash('sha256').update(KEY.normalize('NFC')).digest();
  return crypto.timingSafeEqual(a, b);
}

// 브라우저는 머리글에 한글을 실을 수 없어서 화면은 열쇠를 encodeURIComponent 로 감싸 보낸다.
// 감싸지 않고 온 값(예전 화면, curl)도 그대로 받는다.
function keyMatches(given) {
  if (sameKey(given)) return true;
  let plain;
  try { plain = decodeURIComponent(given); } catch { return false; }
  return plain !== given && sameKey(plain.trim());
}

async function access(req, site, writing) {
  if (site === TEST_SITE && !writing) return { ok: true, mode: 'test' };
  if (OPEN_ENV) return { ok: true, mode: 'preview' };
  if (!KEY) return { ok: false, configured: false };
  const m = /^Bearer\s+(.+)$/i.exec(header(req, 'authorization'));
  if (m && keyMatches(m[1].trim())) return { ok: true, mode: 'key' };
  await new Promise((r) => setTimeout(r, 400)); // 열쇠를 마구 넣어 보는 걸 늦춘다
  return { ok: false, configured: true };
}

function kstDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function addDays(day, n) {
  const t = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

// 지금 기간: from 00:00(한국 시각)부터 지금까지. 견줄 기간: 그보다 n일 앞선, 길이가 같은 구간.
// 오늘은 아직 끝나지 않았으니 견줄 쪽도 "그때 이 시각"까지만 센다.
async function stats(site, n) {
  const today = kstDay();
  const from = addDays(today, -(n - 1));
  const pfrom = addDays(from, -n);
  const [row] = await sql`
    with cur as (
      select day, ts, visitor, path, channel, ref_host, utm_source, utm_medium, utm_campaign,
             device, browser, country, region, city, engaged_ms, scroll_pct, sections
      from pageviews
      where site = ${site} and day between ${from}::date and ${today}::date
    ), prv as (
      select visitor, path, engaged_ms, scroll_pct, sections
      from pageviews
      where site = ${site}
        and ts >= (${pfrom}::date)::timestamp at time zone 'Asia/Seoul'
        and ts < now() - make_interval(days => ${n}::int)
    ), ev as (
      select day, ts, visitor, path, name, target, section
      from events
      where site = ${site} and day between ${from}::date and ${today}::date
    ), pev as (
      select visitor, name
      from events
      where site = ${site}
        and ts >= (${pfrom}::date)::timestamp at time zone 'Asia/Seoul'
        and ts < now() - make_interval(days => ${n}::int)
    )
    select json_build_object(
      'totals', json_build_object(
        'visits', (select count(distinct visitor) from cur),
        'views', (select count(*) from cur),
        'engagedMs', (select percentile_cont(0.5) within group (order by ms)
                      from (select sum(engaged_ms) as ms from cur where engaged_ms is not null group by visitor) t),
        'actions', (select count(*) from ev where name <> 'nav'),
        'actionVisits', (select count(distinct visitor) from ev where name <> 'nav'),
        'homeViews', (select count(*) from cur where path = '/'),
        'homeTracked', (select count(*) from cur where path = '/' and sections is not null),
        'homeDeep', (select count(*) from cur where path = '/' and sections is not null and scroll_pct >= 90)
      ),
      'prev', json_build_object(
        'visits', (select count(distinct visitor) from prv),
        'views', (select count(*) from prv),
        'engagedMs', (select percentile_cont(0.5) within group (order by ms)
                      from (select sum(engaged_ms) as ms from prv where engaged_ms is not null group by visitor) t),
        'actions', (select count(*) from pev where name <> 'nav'),
        'actionVisits', (select count(distinct visitor) from pev where name <> 'nav'),
        'homeViews', (select count(*) from prv where path = '/'),
        'homeTracked', (select count(*) from prv where path = '/' and sections is not null),
        'homeDeep', (select count(*) from prv where path = '/' and sections is not null and scroll_pct >= 90)
      ),
      'daily', (
        select coalesce(json_agg(json_build_object(
                 'day', g.d, 'visits', coalesce(v.visits, 0), 'views', coalesce(v.views, 0), 'actions', coalesce(a.actions, 0)
               ) order by g.d), '[]'::json)
        from (select generate_series(${from}::date, ${today}::date, interval '1 day')::date as d) g
        left join (select day, count(distinct visitor) as visits, count(*) as views from cur group by day) v on v.day = g.d
        left join (select day, count(*) as actions from ev where name <> 'nav' group by day) a on a.day = g.d
      ),
      'channels', (
        select coalesce(json_agg(t), '[]'::json) from (
          select coalesce(channel, 'direct') as key, count(distinct visitor) as visits, count(*) as views
          from cur where coalesce(channel, '') <> 'internal'
          group by 1 order by 2 desc, 3 desc limit 16
        ) t
      ),
      'refs', (
        select coalesce(json_agg(t), '[]'::json) from (
          select ref_host as host, count(distinct visitor) as visits
          from cur where ref_host is not null and coalesce(channel, '') <> 'internal'
          group by 1 order by 2 desc limit 12
        ) t
      ),
      'campaigns', (
        select coalesce(json_agg(t), '[]'::json) from (
          select utm_source as source, utm_medium as medium, utm_campaign as campaign, count(distinct visitor) as visits
          from cur where utm_source is not null
          group by 1, 2, 3 order by 4 desc limit 12
        ) t
      ),
      'pages', (
        select coalesce(json_agg(t), '[]'::json) from (
          select path, count(*) as views, count(distinct visitor) as visits,
                 round(avg(engaged_ms))::int as "engagedMs", round(avg(scroll_pct))::int as scroll
          from cur group by path order by 2 desc limit 20
        ) t
      ),
      'sections', (
        select coalesce(json_agg(t), '[]'::json) from (
          select s.key, count(*) as views
          from cur, unnest(cur.sections) as s(key)
          where cur.path = '/'
          group by s.key order by 2 desc
        ) t
      ),
      'actionsBy', (
        select coalesce(json_agg(t), '[]'::json) from (
          select name, count(*) as count, count(distinct visitor) as visits
          from ev where name <> 'nav'
          group by name order by 2 desc
        ) t
      ),
      'actionPlaces', (
        select coalesce(json_agg(t), '[]'::json) from (
          select name, path, coalesce(section, '') as section, count(*) as count
          from ev where name <> 'nav'
          group by 1, 2, 3 order by 4 desc limit 40
        ) t
      ),
      'flows', (
        select coalesce(json_agg(t), '[]'::json) from (
          select path as "from", split_part(coalesce(target, ''), '#', 1) as "to", count(*) as count
          from ev where name = 'nav'
          group by 1, 2 order by 3 desc limit 12
        ) t
      ),
      'hours', (
        select coalesce(json_agg(t), '[]'::json) from (
          select extract(isodow from ts at time zone 'Asia/Seoul')::int as dow,
                 extract(hour from ts at time zone 'Asia/Seoul')::int as hour,
                 count(distinct visitor) as visits
          from cur group by 1, 2
        ) t
      ),
      'devices', (
        select coalesce(json_agg(t), '[]'::json) from (
          select coalesce(device, 'desktop') as key, count(distinct visitor) as visits
          from cur group by 1 order by 2 desc
        ) t
      ),
      'browsers', (
        select coalesce(json_agg(t), '[]'::json) from (
          select coalesce(browser, 'other') as key, count(distinct visitor) as visits
          from cur group by 1 order by 2 desc limit 10
        ) t
      ),
      'regions', (
        select coalesce(json_agg(t), '[]'::json) from (
          select coalesce(country, '') as country, coalesce(region, '') as region, count(distinct visitor) as visits
          from cur group by 1, 2 order by 3 desc limit 10
        ) t
      ),
      'cities', (
        select coalesce(json_agg(t), '[]'::json) from (
          select city, count(distinct visitor) as visits
          from cur where city is not null and city <> ''
          group by 1 order by 2 desc limit 10
        ) t
      ),
      'recent', (
        select coalesce(json_agg(t), '[]'::json) from (
          select ts, path, channel, device, browser, engaged_ms as "engagedMs", scroll_pct as scroll
          from cur order by ts desc limit 14
        ) t
      ),
      'first', (select min(day) from pageviews where site = ${site})
    ) as data`;
  return { today, from, to: today, days: n, ...row.data };
}

async function purgeTest() {
  const [row] = await sql`
    with e as (delete from events where site = ${TEST_SITE} returning 1),
         p as (delete from pageviews where site = ${TEST_SITE} returning 1)
    select (select count(*) from e)::int as events, (select count(*) from p)::int as pageviews`;
  return row;
}

function send(res, code, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(code);
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, DELETE');
    return send(res, 405, { error: 'method' });
  }
  const url = new URL(req.url || '/', 'http://desk.local');
  const site = url.searchParams.get('site') === 'test' ? TEST_SITE : SITE;
  const writing = req.method === 'DELETE';
  const gate = await access(req, site, writing);
  if (!gate.ok) return send(res, 401, { error: 'locked', configured: gate.configured });
  if (!sql) return send(res, 503, { error: 'nodb' });
  try {
    if (writing) {
      if (site !== TEST_SITE) return send(res, 400, { error: 'only test records can be deleted' });
      const gone = await purgeTest();
      console.log(`[desk] purged ${TEST_SITE}: ${gone.pageviews} pageviews, ${gone.events} events`);
      return send(res, 200, { ok: true, deleted: gone });
    }
    let n = parseInt(url.searchParams.get('range') || '7', 10);
    if (!RANGES.has(n)) n = 7;
    const data = await stats(site, n);
    return send(res, 200, { ok: true, site, access: gate.mode, generatedAt: new Date().toISOString(), ...data });
  } catch (err) {
    console.error('[desk] error', err && err.message);
    return send(res, 500, { error: 'query' });
  }
}
