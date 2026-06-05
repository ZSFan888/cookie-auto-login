/**
 * background.js v2 — Service Worker
 *
 * 改进：
 * - 抖音检测使用 /passport/user/state/ + Referer
 * - 关键 Cookie 健康检查（SESSDATA / bili_jct / sessionid 等）
 * - 过滤已过期 Cookie
 * - 登录检测失败自动重试（最多 2 次）
 * - Cookie 写入兼容 sameSite 枚举值
 */

const SITES = {
  bilibili: {
    name: '哔哩哔哩',
    domains: ['.bilibili.com', 'bilibili.com', '.bilivideo.com'],
    checkUrl: 'https://api.bilibili.com/x/web-interface/nav',
    loginIndicator: (d) => d?.data?.isLogin === true,
    requiredCookies: ['SESSDATA', 'bili_jct', 'DedeUserID'],
  },
  douyin: {
    name: '抖音',
    domains: ['.douyin.com', 'douyin.com', '.snssdk.com'],
    checkUrl: 'https://www.douyin.com/passport/user/state/',
    loginIndicator: (d) => d?.data?.user_id_str?.length > 0,
    checkHeaders: { 'Referer': 'https://www.douyin.com/', 'X-Requested-With': 'XMLHttpRequest' },
    requiredCookies: ['sessionid', 'uid_tt'],
  },
};

// ── Cookie 读取（去重 + 过滤过期）───────────────────────────────
async function getCookiesForSite(domains) {
  const all = [];
  for (const domain of domains) {
    try { all.push(...await chrome.cookies.getAll({ domain })); } catch (_) {}
  }
  const seen = new Set();
  const now = Date.now() / 1000;
  return all.filter(c => {
    const key = `${c.name}|${c.domain}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (c.expirationDate && c.expirationDate < now) return false;
    return true;
  });
}

// ── Cookie 写入 ─────────────────────────────────────────────────
async function setCookiesForSite(cookies) {
  const res = { ok: 0, fail: 0, errors: [] };
  const now = Date.now() / 1000;
  const validSameSite = new Set(['strict', 'lax', 'no_restriction', 'unspecified']);
  for (const c of cookies) {
    if (c.expirationDate && c.expirationDate < now) continue;
    try {
      const d = {
        url: `https://${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}${c.path}`,
        name: c.name, value: c.value, domain: c.domain, path: c.path,
        secure: c.secure, httpOnly: c.httpOnly,
        sameSite: validSameSite.has(c.sameSite) ? c.sameSite : 'unspecified',
      };
      if (c.expirationDate) d.expirationDate = c.expirationDate;
      await chrome.cookies.set(d);
      res.ok++;
    } catch (e) { res.fail++; res.errors.push(`${c.name}: ${e.message}`); }
  }
  return res;
}

// ── 登录检测（带重试）──────────────────────────────────────────
async function checkLoginStatus(siteKey, retries = 2) {
  const site = SITES[siteKey];
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(site.checkUrl, {
        credentials: 'include',
        headers: { 'User-Agent': navigator.userAgent, ...(site.checkHeaders || {}) },
      });
      if (!res.ok) continue;
      return site.loginIndicator(await res.json());
    } catch (_) {
      if (i < retries) await new Promise(r => setTimeout(r, 600 * (i + 1)));
    }
  }
  return false;
}

// ── 关键 Cookie 健康检查 ────────────────────────────────────────
function validateCookies(siteKey, cookies) {
  const required = SITES[siteKey].requiredCookies || [];
  const names = new Set(cookies.map(c => c.name));
  const missing = required.filter(n => !names.has(n));
  return { valid: missing.length === 0, missing };
}

// ── CF Worker API ───────────────────────────────────────────────
async function getConfig() {
  return new Promise(r => chrome.storage.local.get(['workerUrl', 'workerSecret'], r));
}

async function workerFetch(path, method = 'GET', body = null) {
  const { workerUrl, workerSecret } = await getConfig();
  if (!workerUrl || !workerSecret) throw new Error('未配置 Worker URL 或密钥');
  const res = await fetch(workerUrl.replace(/\/$/, '') + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Secret': workerSecret },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`Worker ${res.status}`);
  return res.json();
}

async function pushToKV(siteKey, cookies) {
  const health = validateCookies(siteKey, cookies);
  const r = await workerFetch('/save', 'POST', {
    site: siteKey, cookies,
    meta: { count: cookies.length, valid: health.valid, missing: health.missing, savedAt: new Date().toISOString() },
  });
  return { ...r, health };
}

async function pullFromKV(siteKey) {
  return workerFetch(`/load?site=${siteKey}`);
}

// ── 自动检测主流程 ───────────────────────────────────────────────
async function autoDetect(siteKey) {
  const site = SITES[siteKey];
  const isLoggedIn = await checkLoginStatus(siteKey);
  if (isLoggedIn) {
    const cookies = await getCookiesForSite(site.domains);
    const { health } = await pushToKV(siteKey, cookies);
    return { action: 'extracted', count: cookies.length, loggedIn: true, health };
  } else {
    const data = await pullFromKV(siteKey);
    const cookies = data?.cookies || [];
    if (!cookies.length) return { action: 'no_cookies', loggedIn: false };
    const health = validateCookies(siteKey, cookies);
    const setResult = await setCookiesForSite(cookies);
    return { action: 'restored', loggedIn: false, health, ...setResult };
  }
}

// ── 消息处理 ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'AUTO_DETECT':
          sendResponse({ ok: true, ...await autoDetect(msg.site) }); break;
        case 'CHECK_LOGIN':
          sendResponse({ ok: true, loggedIn: await checkLoginStatus(msg.site) }); break;
        case 'EXTRACT_COOKIES': {
          const cookies = await getCookiesForSite(SITES[msg.site].domains);
          const { health } = await pushToKV(msg.site, cookies);
          sendResponse({ ok: true, count: cookies.length, health }); break;
        }
        case 'RESTORE_COOKIES': {
          const data = await pullFromKV(msg.site);
          const cookies = data?.cookies || [];
          const health = validateCookies(msg.site, cookies);
          sendResponse({ ok: true, meta: data?.meta, health, ...await setCookiesForSite(cookies) }); break;
        }
        case 'GET_COOKIES_PREVIEW': {
          const cookies = await getCookiesForSite(SITES[msg.site].domains);
          sendResponse({
            ok: true,
            health: validateCookies(msg.site, cookies),
            cookies: cookies.map(c => ({
              name: c.name, domain: c.domain,
              value: c.value.length > 24 ? c.value.slice(0, 24) + '…' : c.value,
              expires: c.expirationDate
                ? new Date(c.expirationDate * 1000).toLocaleDateString('zh-CN') : '会话',
            })),
          }); break;
        }
        case 'GET_KV_STATUS':
          sendResponse({ ok: true, ...await workerFetch('/status') }); break;
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) { sendResponse({ ok: false, error: e.message }); }
  })();
  return true;
});
