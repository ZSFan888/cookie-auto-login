/* popup.js v2 */

// ── Theme ──────────────────────────────────────────────────────
const html = document.documentElement;
let theme = 'dark';
const themeBtn = document.getElementById('themeBtn');
const SUN = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const MOON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
themeBtn.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', theme);
  themeBtn.innerHTML = theme === 'dark' ? MOON : SUN;
});

// ── Tabs ───────────────────────────────────────────────────────
document.querySelectorAll('.nav-t').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.nav-t').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('tab-' + t.dataset.tab).classList.add('active');
    if (t.dataset.tab === 'cookies') loadCookieTable(curSite);
  });
});

// ── Toast ──────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Log ────────────────────────────────────────────────────────
function log(msg, lv = 'info') {
  const body = document.getElementById('logBody');
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const lvMap = { ok: 'OK', err: 'ERR', info: 'INF', warn: 'WRN' };
  const el = document.createElement('div');
  el.className = 'log-e';
  el.innerHTML = `<span class="log-ts">${ts}</span><span class="log-lv ${lv}">${lvMap[lv]||'INF'}</span><span class="log-msg">${msg}</span>`;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}
document.getElementById('clrLog').addEventListener('click', () => { document.getElementById('logBody').innerHTML = ''; });

// ── Badge / Footer / Chips ─────────────────────────────────────
const ID = { bilibili: 'bili', douyin: 'dy' };

function setBadge(site, state, text) {
  const id = ID[site];
  const el = document.getElementById(`${id}-badge`);
  el.className = `badge ${state}`;
  el.innerHTML = `<span class="bdot"></span><span>${text}</span>`;
}
function setFoot(site, msg, cls = '') {
  const el = document.getElementById(`${ID[site]}-foot`);
  el.className = `card-foot ${cls}`;
  el.textContent = msg;
}
function showChips(site, health) {
  const el = document.getElementById(`${ID[site]}-chips`);
  if (!health) { el.style.display = 'none'; return; }
  const required = site === 'bilibili' ? ['SESSDATA','bili_jct','DedeUserID'] : ['sessionid','uid_tt'];
  const missing = new Set(health.missing || []);
  el.style.display = 'flex';
  el.innerHTML = required.map(n => `<span class="chip${missing.has(n) ? ' miss' : ''}">${n}</span>`).join('');
}

// ── Button loading ─────────────────────────────────────────────
function setLoading(id, on) {
  const btn = document.getElementById(id);
  btn.disabled = on;
  if (on) { btn._orig = btn.innerHTML; btn.innerHTML = `<span class="spin"></span>处理中`; }
  else if (btn._orig) btn.innerHTML = btn._orig;
}

// ── Message ────────────────────────────────────────────────────
function send(msg) {
  return new Promise((res, rej) => {
    chrome.runtime.sendMessage(msg, r => {
      if (chrome.runtime.lastError) return rej(new Error(chrome.runtime.lastError.message));
      if (!r?.ok) return rej(new Error(r?.error || '未知错误'));
      res(r);
    });
  });
}

// ── Auto toggle ────────────────────────────────────────────────
const autoToggle = document.getElementById('autoToggle');
chrome.storage.local.get('autoDetect', ({ autoDetect }) => { autoToggle.checked = autoDetect !== false; });
autoToggle.addEventListener('change', () => {
  chrome.storage.local.set({ autoDetect: autoToggle.checked });
  log(`自动检测 ${autoToggle.checked ? '已开启' : '已关闭'}`, 'info');
});

// ── Settings ───────────────────────────────────────────────────
chrome.storage.local.get(['workerUrl','workerSecret'], ({ workerUrl, workerSecret }) => {
  if (workerUrl) document.getElementById('wUrl').value = workerUrl;
  if (workerSecret) document.getElementById('wSecret').value = workerSecret;
});
document.getElementById('saveBtn').addEventListener('click', () => {
  const url = document.getElementById('wUrl').value.trim();
  const secret = document.getElementById('wSecret').value.trim();
  if (!url) { toast('请填写 Worker URL', 'err'); return; }
  if (!secret) { toast('请填写访问密钥', 'err'); return; }
  chrome.storage.local.set({ workerUrl: url, workerSecret: secret }, () => {
    toast('配置已保存', 'ok'); log('Worker 配置已保存', 'ok');
    refreshKV();
  });
});

// ── KV status ──────────────────────────────────────────────────
async function refreshKV() {
  try {
    const r = await send({ type: 'GET_KV_STATUS' });
    const sites = r.sites || {};
    [['bilibili','kv-bili'], ['douyin','kv-dy']].forEach(([s, key]) => {
      const info = sites[s];
      const badge = document.getElementById(`${key}-b`);
      const meta = document.getElementById(`${key}-mt`);
      if (info?.exists) {
        badge.className = 'badge ok';
        badge.innerHTML = `<span class="bdot"></span>${info.count} 个`;
        meta.textContent = `更新: ${info.savedAt ? new Date(info.savedAt).toLocaleString('zh-CN') : '—'}`;
      } else {
        badge.className = 'badge fail';
        badge.innerHTML = `<span class="bdot"></span>无数据`;
        meta.textContent = '尚未同步';
      }
    });
  } catch (e) { log(`KV 状态查询失败: ${e.message}`, 'warn'); }
}
document.getElementById('kvRefresh').addEventListener('click', refreshKV);

// ── Site actions ───────────────────────────────────────────────
async function doAuto(site) {
  const id = `${ID[site]}-auto`;
  setLoading(id, true); setBadge(site, 'loading', '检测中');
  log(`[${site}] 自动检测…`, 'info');
  try {
    const r = await send({ type: 'AUTO_DETECT', site });
    setBadge(site, r.loggedIn ? 'ok' : 'fail', r.loggedIn ? '已登录' : '未登录');
    showChips(site, r.health);
    if (r.action === 'extracted') {
      setFoot(site, `已登录，提取 ${r.count} 个 Cookie 并同步 KV`, 'ok');
      log(`[${site}] 提取 ${r.count} 个 → KV`, 'ok');
      toast('Cookie 已同步到 KV', 'ok');
    } else if (r.action === 'restored') {
      setFoot(site, `未登录，已恢复 ${r.ok} 个 Cookie，即将刷新`, r.fail > 0 ? 'warn' : 'ok');
      log(`[${site}] 恢复 ${r.ok} 成功 / ${r.fail} 失败`, r.fail > 0 ? 'warn' : 'ok');
      toast(`已恢复 ${r.ok} 个 Cookie`, 'ok');
    } else {
      setFoot(site, '未登录，KV 中无备份', 'warn');
      log(`[${site}] 未登录且 KV 中无数据`, 'warn');
    }
  } catch (e) {
    setBadge(site, 'fail', '错误'); setFoot(site, e.message, 'fail');
    log(`[${site}] 错误: ${e.message}`, 'err'); toast(e.message, 'err');
  }
  setLoading(id, false);
}

async function doExtract(site) {
  const id = `${ID[site]}-ext`;
  setLoading(id, true); log(`[${site}] 提取 Cookie…`, 'info');
  try {
    const r = await send({ type: 'EXTRACT_COOKIES', site });
    showChips(site, r.health);
    setFoot(site, `已提取 ${r.count} 个 Cookie 并上传 KV`, 'ok');
    log(`[${site}] 提取 ${r.count} 个，健康: ${r.health?.valid}`, 'ok');
    toast(`提取 ${r.count} 个 Cookie`, 'ok'); refreshKV();
  } catch (e) {
    setFoot(site, e.message, 'fail');
    log(`[${site}] 提取失败: ${e.message}`, 'err'); toast(e.message, 'err');
  }
  setLoading(id, false);
}

async function doRestore(site) {
  const id = `${ID[site]}-rst`;
  setLoading(id, true); log(`[${site}] 从 KV 恢复 Cookie…`, 'info');
  try {
    const r = await send({ type: 'RESTORE_COOKIES', site });
    showChips(site, r.health);
    setFoot(site, `恢复 ${r.ok} 个，请手动刷新目标页`, r.fail > 0 ? 'warn' : 'ok');
    log(`[${site}] 恢复 ${r.ok} / 失败 ${r.fail}，KV 时间 ${r.meta?.savedAt||'—'}`, r.fail > 0 ? 'warn' : 'ok');
    toast(`恢复 ${r.ok} 个 Cookie`, 'ok');
  } catch (e) {
    setFoot(site, e.message, 'fail');
    log(`[${site}] 恢复失败: ${e.message}`, 'err'); toast(e.message, 'err');
  }
  setLoading(id, false);
}

document.getElementById('bili-auto').addEventListener('click', () => doAuto('bilibili'));
document.getElementById('bili-ext').addEventListener('click', () => doExtract('bilibili'));
document.getElementById('bili-rst').addEventListener('click', () => doRestore('bilibili'));
document.getElementById('dy-auto').addEventListener('click', () => doAuto('douyin'));
document.getElementById('dy-ext').addEventListener('click', () => doExtract('douyin'));
document.getElementById('dy-rst').addEventListener('click', () => doRestore('douyin'));

// ── Cookie preview ─────────────────────────────────────────────
let curSite = 'bilibili';
const segBili = document.getElementById('seg-bili');
const segDy = document.getElementById('seg-dy');

async function loadCookieTable(site) {
  curSite = site;
  const tbl = document.getElementById('ck-tbl');
  tbl.innerHTML = `<div class="empty"><span class="spin"></span>读取中…</div>`;
  try {
    const r = await send({ type: 'GET_COOKIES_PREVIEW', site });
    if (!r.cookies.length) {
      tbl.innerHTML = `<div class="empty"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>该网站暂无 Cookie</div>`;
      return;
    }
    const req = site === 'bilibili' ? new Set(['SESSDATA','bili_jct','DedeUserID']) : new Set(['sessionid','uid_tt']);
    const rows = r.cookies.map(c =>
      `<div class="ck-row" style="${req.has(c.name) ? 'background:var(--primary-dim)' : ''}">
        <span class="nm" title="${c.name}">${c.name}</span>
        <span class="vl">${c.value}</span>
        <span class="dm">${c.domain}</span>
        <span class="ex">${c.expires}</span>
      </div>`).join('');
    const hbar = r.health.valid
      ? `<div class="hbar"><span class="h-ok"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>关键 Cookie 完整</span><span style="font-size:10px;color:var(--muted)">${r.cookies.length} 个</span></div>`
      : `<div class="hbar"><span class="h-warn"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>缺少: ${r.health.missing.join(', ')}</span><span style="font-size:10px;color:var(--muted)">${r.cookies.length} 个</span></div>`;
    tbl.innerHTML = `<div class="ck-hd"><span>名称</span><span>值（预览）</span><span>域名</span><span style="text-align:right">到期</span></div><div class="ck-scroll">${rows}</div>${hbar}`;
  } catch (e) {
    tbl.innerHTML = `<div class="empty" style="color:var(--error)">${e.message}</div>`;
  }
}

segBili.addEventListener('click', () => { segBili.classList.add('active'); segDy.classList.remove('active'); loadCookieTable('bilibili'); });
segDy.addEventListener('click', () => { segDy.classList.add('active'); segBili.classList.remove('active'); loadCookieTable('douyin'); });

// ── Init ───────────────────────────────────────────────────────
(async () => {
  log('扩展启动', 'info');
  for (const site of ['bilibili', 'douyin']) {
    try {
      setBadge(site, 'loading', '检测中');
      const r = await send({ type: 'CHECK_LOGIN', site });
      setBadge(site, r.loggedIn ? 'ok' : 'fail', r.loggedIn ? '已登录' : '未登录');
      setFoot(site, r.loggedIn ? '当前已登录' : '当前未登录');
      log(`[${site}] ${r.loggedIn ? '已登录' : '未登录'}`, r.loggedIn ? 'ok' : 'info');
    } catch (e) {
      setBadge(site, 'idle', '未知');
      setFoot(site, '检测失败，请先访问对应网站');
      log(`[${site}] 检测失败: ${e.message}`, 'warn');
    }
  }
  refreshKV();
})();
