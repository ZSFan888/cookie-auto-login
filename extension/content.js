// content.js v2
// 仅在顶层 frame 执行，sessionStorage 去重防止同标签页重复触发

if (window.top === window.self) {
  const hostname = location.hostname;
  let site = null;
  if (hostname.includes('bilibili.com')) site = 'bilibili';
  else if (hostname.includes('douyin.com') || hostname.includes('snssdk.com')) site = 'douyin';

  if (site) {
    const flagKey = `__cl_${site}`;
    if (!sessionStorage.getItem(flagKey)) {
      sessionStorage.setItem(flagKey, '1');
      chrome.storage.local.get('autoDetect', ({ autoDetect }) => {
        if (autoDetect === false) return;
        chrome.runtime.sendMessage({ type: 'AUTO_DETECT', site }, (resp) => {
          if (chrome.runtime.lastError) return;
          if (resp?.action === 'restored' && resp?.ok > 0) {
            setTimeout(() => location.reload(), 800);
          }
        });
      });
    }
  }
}
