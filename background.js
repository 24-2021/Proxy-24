chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    proxies: [
      { type: 'http', host: '127.0.0.1', port: 8080 },
      { type: 'socks5', host: '127.0.0.1', port: 9050 }
    ],
    isProxyEnabled: false,
    currentProxy: 0
  }, function() {
    console.log('默认设置已完成。');
    // 初始化时设置为直连模式
    chrome.proxy.settings.set({
      value: { mode: 'direct' },
      scope: 'regular'
    }, function() {
      console.log('初始代理设置为直连模式');
    });
  });
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleProxy') {
    updateProxySettings(message.enable, message.proxyConfig);
    sendResponse({success: true});
  } else if (message.action === 'getProxyState') {
    chrome.proxy.settings.get({}, function(config) {
      sendResponse({
        isEnabled: config.value.mode !== 'direct',
        currentConfig: config.value
      });
    });
    return true; // 保持消息通道开放以进行异步响应
  }
});

// 更新代理设置的函数
function updateProxySettings(enable, proxyConfig) {
  let config = {};
  
  if (enable && proxyConfig) {
    config = {
      mode: 'fixed_servers',
      rules: {
        singleProxy: {
          scheme: proxyConfig.type,
          host: proxyConfig.host,
          port: parseInt(proxyConfig.port)
        },
        bypassList: ['localhost', '127.0.0.1']
      }
    };
  } else {
    config = { mode: 'direct' };
  }
  
  chrome.proxy.settings.set({
    value: config,
    scope: 'regular'
  }, function() {
    console.log('代理设置已更新:', enable ? '启用' : '禁用');
    chrome.storage.sync.set({ isProxyEnabled: enable });
  });
}

// 处理代理认证
chrome.webRequest.onAuthRequired.addListener(
  function(details, callbackFn) {
    // 如果需要代理认证，可以在这里处理
    console.log('需要代理认证:', details);
    // 目前不提供认证，返回取消
    callbackFn({cancel: true});
  },
  {urls: ["<all_urls>"]},
  ["asyncBlocking"]
);