/**
 * Cloudflare Worker v2
 *
 * KV 绑定: COOKIE_KV
 * 环境变量: SECRET  (wrangler secret put SECRET)
 *
 * POST   /save              保存 Cookie
 * GET    /load?site=xxx     读取 Cookie
 * GET    /status            两个站点元数据
 * DELETE /clear?site=xxx    清除
 */

const SITES = new Set(['bilibili', 'douyin']);
const TTL = 60 * 60 * 24 * 30; // 30 天

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Secret',
};

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });
const err = (msg, s = 400) => json({ ok: false, error: msg }, s);

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.headers.get('X-Secret') !== env.SECRET) return err('Unauthorized', 401);

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    // POST /save
    if (path === '/save' && req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return err('Invalid JSON'); }
      const { site, cookies, meta } = body;
      if (!SITES.has(site)) return err('Invalid site');
      if (!Array.isArray(cookies)) return err('cookies must be an array');
      await env.COOKIE_KV.put(`cookies:${site}`, JSON.stringify({
        cookies,
        meta: { count: cookies.length, savedAt: new Date().toISOString(), ...meta },
      }), { expirationTtl: TTL });
      return json({ ok: true, count: cookies.length });
    }

    // GET /load
    if (path === '/load' && req.method === 'GET') {
      const site = url.searchParams.get('site');
      if (!SITES.has(site)) return err('Invalid site');
      const raw = await env.COOKIE_KV.get(`cookies:${site}`);
      if (!raw) return json({ ok: true, cookies: [], meta: null });
      const { cookies, meta } = JSON.parse(raw);
      return json({ ok: true, cookies, meta });
    }

    // GET /status
    if (path === '/status' && req.method === 'GET') {
      const result = {};
      for (const site of SITES) {
        const raw = await env.COOKIE_KV.get(`cookies:${site}`);
        result[site] = raw ? { exists: true, ...JSON.parse(raw).meta } : { exists: false };
      }
      return json({ ok: true, sites: result });
    }

    // DELETE /clear
    if (path === '/clear' && req.method === 'DELETE') {
      const site = url.searchParams.get('site');
      if (!SITES.has(site)) return err('Invalid site');
      await env.COOKIE_KV.delete(`cookies:${site}`);
      return json({ ok: true });
    }

    return err('Not Found', 404);
  },
};
