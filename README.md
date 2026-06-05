# cookie-auto-login

B站 / 抖音 Cookie 自动登录浏览器扩展 + Cloudflare Worker KV

## 目录结构

```
extension/    ← Chrome 扩展
  manifest.json
  background.js   Service Worker（核心逻辑）
  content.js      页面注入脚本
  popup.html      管理 UI
  popup.js        UI 交互
  icons/          图标文件

worker/       ← Cloudflare Worker
  worker.js
  wrangler.toml
```

## 部署 Worker

```bash
cd worker
npm install -g wrangler
wrangler login
wrangler kv:namespace create COOKIE_KV   # 复制 id → 填入 wrangler.toml
wrangler secret put SECRET               # 输入密钥
wrangler deploy
```

## 安装扩展

1. Chrome → `chrome://extensions/` → 开发者模式
2. 加载已解压的扩展 → 选择 `extension/` 目录
3. 插件设置页填入 Worker URL 和密钥

## 关键 Cookie

| 平台 | 必要 Cookie |
|------|------------|
| B站  | SESSDATA · bili_jct · DedeUserID |
| 抖音 | sessionid · uid_tt |

Cookie 保存在 KV 中，TTL 30 天自动过期。
