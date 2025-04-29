// 在 chrome.runtime.onInstalled 事件处理函数中初始化白名单
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    proxies: [
      { type: 'http', host: '127.0.0.1', port: 8080 },
      { type: 'socks5', host: '127.0.0.1', port: 9050 }
    ],
    isProxyEnabled: false,
    currentProxy: 0,
    whitelist: [] // 初始化白名单为空数组
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

// 监听来自popup.js的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'toggleProxy') {
    updateProxySettings(request.enable, request.proxyConfig);
    sendResponse({success: true});
  } else if (request.action === 'getProxyState') {
    chrome.proxy.settings.get({}, function(config) {
      sendResponse({
        isEnabled: config.value.mode !== 'direct',
        currentConfig: config.value
      });
    });
    return true; // 保持消息通道开放以进行异步响应
  } else if (request.action === 'addToWhitelist') {
    // 修正：使用 request 而不是 message
    addToWhitelist(request.domain, sendResponse);
    return true;
  } else if (request.action === 'removeFromWhitelist') {
    // 修正：使用 request 而不是 message
    removeFromWhitelist(request.domain, sendResponse);
    return true;
  } else if (request.action === 'getWhitelist') {
    // 获取白名单列表
    getWhitelist(sendResponse);
    return true;
  }
  
  // 批量添加到白名单
  if (request.action === 'batchAddToWhitelist') {
    chrome.storage.sync.get(['whitelist'], function(data) {
      const whitelist = data.whitelist || [];
      const newWhitelist = [...whitelist, ...request.domains];
      
      chrome.storage.sync.set({whitelist: newWhitelist}, function() {
        sendResponse({success: true});
      });
    });
    return true; // 异步响应
  }
  
  // 清空白名单
  if (request.action === 'clearWhitelist') {
    chrome.storage.sync.set({whitelist: []}, function() {
      sendResponse({success: true});
    });
    return true; // 异步响应
  }
});

// 添加域名到白名单
function addToWhitelist(domain, callback) {
  if (!domain) {
    callback({success: false, message: '域名不能为空'});
    return;
  }
  
  // 格式化域名，移除协议前缀和路径
  domain = formatDomain(domain);
  
  chrome.storage.sync.get(['whitelist'], function(data) {
    let whitelist = data.whitelist || [];
    
    // 检查域名是否已存在于白名单中
    if (whitelist.includes(domain)) {
      callback({success: false, message: '该域名已在白名单中'});
      return;
    }
    
    // 添加到白名单
    whitelist.push(domain);
    chrome.storage.sync.set({whitelist: whitelist}, function() {
      // 如果代理已启用，更新代理设置以应用新的白名单
      chrome.storage.sync.get(['isProxyEnabled', 'proxies', 'currentProxy'], function(data) {
        if (data.isProxyEnabled && data.proxies && data.proxies[data.currentProxy]) {
          updateProxySettings(true, data.proxies[data.currentProxy]);
        }
        callback({success: true, whitelist: whitelist});
      });
    });
  });
}

// 从白名单移除域名
function removeFromWhitelist(domain, callback) {
  chrome.storage.sync.get(['whitelist'], function(data) {
    let whitelist = data.whitelist || [];
    
    // 过滤掉要移除的域名
    whitelist = whitelist.filter(item => item !== domain);
    
    chrome.storage.sync.set({whitelist: whitelist}, function() {
      // 如果代理已启用，更新代理设置以应用新的白名单
      chrome.storage.sync.get(['isProxyEnabled', 'proxies', 'currentProxy'], function(data) {
        if (data.isProxyEnabled && data.proxies && data.proxies[data.currentProxy]) {
          updateProxySettings(true, data.proxies[data.currentProxy]);
        }
        callback({success: true, whitelist: whitelist});
      });
    });
  });
}

// 获取白名单列表
function getWhitelist(callback) {
  chrome.storage.sync.get(['whitelist'], function(data) {
    callback({whitelist: data.whitelist || []});
  });
}

// 格式化域名，移除协议前缀和路径
function formatDomain(domain) {
  // 移除协议前缀 (http://, https://, etc.)
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/i, '');
  
  // 移除路径和查询参数
  domain = domain.split('/')[0];
  
  return domain.trim().toLowerCase();
}

// 修改 updateProxySettings 函数以支持白名单
function updateProxySettings(enable, proxyConfig) {
  let config = {};
  
  if (enable && proxyConfig) {
    // 确保代理类型正确
    const scheme = proxyConfig.type.toLowerCase();
    
    // 获取白名单
    chrome.storage.sync.get(['whitelist'], function(data) {
      const whitelist = data.whitelist || [];
      // 修改白名单格式，确保正确的匹配模式
      const formattedWhitelist = whitelist.map(domain => {
        // 确保域名前有通配符和点，这样可以匹配子域名
        return domain.startsWith('*.') ? domain : `*.${domain}`;
      });
      // 添加不带通配符的版本，以匹配主域名
      whitelist.forEach(domain => {
        formattedWhitelist.push(domain);
      });
      
      const bypassList = ['<local>', 'localhost', '127.0.0.1'].concat(formattedWhitelist);
      
      if (scheme === 'socks5' && proxyConfig.username && proxyConfig.password) {
        // 对于带认证的SOCKS5代理，使用PAC脚本
        let bypassRules = '';
        if (whitelist.length > 0) {
          bypassRules = `
            // 检查是否在白名单中
            // 使用更精确的匹配方式
            if (${whitelist.map(domain => {
              // 转义点，避免正则表达式中的特殊含义
              const escapedDomain = domain.replace(/\./g, '\\.');
              // 使用更精确的匹配模式
              return `(host === "${domain}" || host.endsWith(".${domain}"))`;
            }).join(' || ')}) {
              return "DIRECT";
            }
          `;
        }
        
        const pacScript = `
          function FindProxyForURL(url, host) {
            // 本地地址直连
            if (shExpMatch(host, "localhost") || shExpMatch(host, "127.0.0.1")) {
              return "DIRECT";
            }
            ${bypassRules}
            return "SOCKS5 ${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}";
          }
        `;
        
        config = {
          mode: 'pac_script',
          pacScript: {
            data: pacScript
          }
        };
        console.log('设置带认证的SOCKS5代理 (PAC脚本模式)，白名单域名数量:', whitelist.length);
      } else {
        // 对于其他代理类型或不需要认证的SOCKS5，使用普通模式
        config = {
          mode: 'fixed_servers',
          rules: {
            singleProxy: {
              scheme: scheme,
              host: proxyConfig.host,
              port: parseInt(proxyConfig.port)
            },
            bypassList: bypassList
          }
        };
        console.log('设置代理:', scheme, proxyConfig.host, proxyConfig.port, '白名单域名数量:', whitelist.length);
      }
      
      if (proxyConfig.username && proxyConfig.password && scheme !== 'socks5') {
        console.log('代理需要认证 (非SOCKS5)');
      }
      
      chrome.proxy.settings.set({
        value: config,
        scope: 'regular'
      }, function() {
        if (chrome.runtime.lastError) {
          console.error('代理设置错误:', chrome.runtime.lastError);
        } else {
          console.log('代理设置已更新:', enable ? '启用' : '禁用');
          chrome.storage.sync.set({ isProxyEnabled: enable });
        }
      });
    });
  } else {
    config = { mode: 'direct' };
    console.log('设置为直连模式');
    
    chrome.proxy.settings.set({
      value: config,
      scope: 'regular'
    }, function() {
      if (chrome.runtime.lastError) {
        console.error('代理设置错误:', chrome.runtime.lastError);
      } else {
        console.log('代理设置已更新:', enable ? '启用' : '禁用');
        chrome.storage.sync.set({ isProxyEnabled: enable });
      }
    });
  }
}

// 处理代理认证
chrome.webRequest.onAuthRequired.addListener(
  function(details, callbackFn) {
    // 检查是否是代理认证请求
    if (details.isProxy) {
      chrome.storage.sync.get(['proxies', 'currentProxy'], function(data) {
        if (data.proxies && data.proxies[data.currentProxy]) {
          const currentProxy = data.proxies[data.currentProxy];
          if (currentProxy.username && currentProxy.password) {
            console.log('提供代理认证信息');
            callbackFn({
              authCredentials: {
                username: currentProxy.username,
                password: currentProxy.password
              }
            });
            return;
          }
        }
        // 如果没有认证信息，尝试继续请求而不是直接取消
        console.log('没有代理认证信息，尝试继续请求');
        callbackFn({});
      });
    } else {
      // 非代理认证请求，继续
      callbackFn({});
    }
  },
  {urls: ["<all_urls>"]},
  ["asyncBlocking"]
);