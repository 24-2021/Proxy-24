document.addEventListener('DOMContentLoaded', function() {
  const proxySelect = document.getElementById('proxy-select');
  const toggleButton = document.getElementById('toggle-proxy');
  const addProxyButton = document.getElementById('add-proxy');
  const deleteProxyButton = document.getElementById('delete-proxy');
  const proxyTypeInput = document.getElementById('proxy-type');
  const proxyHostInput = document.getElementById('proxy-host');
  const proxyPortInput = document.getElementById('proxy-port');
  const statusIndicator = document.createElement('div');
  
  // 添加状态指示器
  statusIndicator.id = 'status-indicator';
  document.querySelector('form').appendChild(statusIndicator);

  // 加载代理并填充下拉菜单
  function loadProxies() {
    proxySelect.innerHTML = ''; // 清空现有选项
    
    chrome.storage.sync.get(['proxies', 'currentProxy', 'isProxyEnabled'], function(data) {
      if (data.proxies && data.proxies.length > 0) {
        data.proxies.forEach((proxy, index) => {
          const option = document.createElement('option');
          option.value = index;
          option.textContent = `${proxy.type} - ${proxy.host}:${proxy.port}`;
          proxySelect.appendChild(option);
        });
        proxySelect.value = data.currentProxy || 0;
        proxySelect.disabled = false;
        toggleButton.disabled = false;
        deleteProxyButton.disabled = false;
        
        // 更新按钮文本和状态指示器
        updateUI(data.isProxyEnabled);
      } else {
        proxySelect.disabled = true;
        toggleButton.disabled = true;
        deleteProxyButton.disabled = true;
        statusIndicator.textContent = '没有可用的代理配置';
        statusIndicator.style.backgroundColor = '#ffcccc';
      }
    });
  }
  
  // 更新UI状态
  function updateUI(isEnabled) {
    toggleButton.textContent = isEnabled ? '禁用代理' : '启用代理';
    toggleButton.className = isEnabled ? 'btn-danger' : 'btn-success';
    statusIndicator.textContent = isEnabled ? '代理已启用' : '代理已禁用';
    statusIndicator.style.backgroundColor = isEnabled ? '#d4edda' : '#f8d7da';
    statusIndicator.style.color = isEnabled ? '#155724' : '#721c24';
  }
  
  // 初始加载
  loadProxies();
  
  // 向background.js发送消息以获取当前代理状态
  chrome.runtime.sendMessage({action: 'getProxyState'}, function(response) {
    if (response) {
      updateUI(response.isEnabled);
    }
  });

  // 切换代理开关
  toggleButton.addEventListener('click', () => {
    chrome.storage.sync.get(['proxies', 'isProxyEnabled', 'currentProxy'], function(data) {
      const newState = !data.isProxyEnabled;
      const selectedProxy = data.proxies[parseInt(proxySelect.value)];
      
      chrome.runtime.sendMessage({
        action: 'toggleProxy',
        enable: newState,
        proxyConfig: selectedProxy
      }, function(response) {
        if (response && response.success) {
          updateUI(newState);
        }
      });
    });
  });

  // 更改当前代理
  proxySelect.addEventListener('change', () => {
    const newProxyIndex = parseInt(proxySelect.value);
    chrome.storage.sync.set({ currentProxy: newProxyIndex }, function() {
      console.log('当前代理已更改为:', newProxyIndex);
      
      // 如果代理已启用，则立即应用新的代理设置
      chrome.storage.sync.get(['isProxyEnabled', 'proxies'], function(data) {
        if (data.isProxyEnabled) {
          const selectedProxy = data.proxies[newProxyIndex];
          chrome.runtime.sendMessage({
            action: 'toggleProxy',
            enable: true,
            proxyConfig: selectedProxy
          });
        }
      });
    });
  });

  // 添加新代理
  addProxyButton.addEventListener('click', () => {
    const type = proxyTypeInput.value.trim();
    const host = proxyHostInput.value.trim();
    const port = parseInt(proxyPortInput.value);

    if (type && host && !isNaN(port)) {
      chrome.storage.sync.get(['proxies'], function(data) {
        const newProxies = [...(data.proxies || []), { type, host, port }];
        chrome.storage.sync.set({ proxies: newProxies }, function() {
          console.log('新代理已添加:', { type, host, port });

          // 清空输入字段
          proxyTypeInput.value = '';
          proxyHostInput.value = '';
          proxyPortInput.value = '';
          
          // 重新加载代理列表
          loadProxies();
        });
      });
    } else {
      alert('请正确填写所有字段。');
    }
  });
  
  // 删除当前选中的代理
  deleteProxyButton.addEventListener('click', () => {
    const selectedIndex = parseInt(proxySelect.value);
    
    chrome.storage.sync.get(['proxies', 'currentProxy', 'isProxyEnabled'], function(data) {
      if (!data.proxies || data.proxies.length === 0) {
        return;
      }
      
      // 如果当前正在使用要删除的代理，先禁用代理
      if (data.isProxyEnabled && data.currentProxy === selectedIndex) {
        chrome.runtime.sendMessage({
          action: 'toggleProxy',
          enable: false
        });
      }
      
      // 删除选中的代理
      const newProxies = data.proxies.filter((_, index) => index !== selectedIndex);
      
      // 更新当前代理索引
      let newCurrentProxy = data.currentProxy;
      if (selectedIndex === data.currentProxy) {
        newCurrentProxy = newProxies.length > 0 ? 0 : -1;
      } else if (selectedIndex < data.currentProxy) {
        newCurrentProxy--;
      }
      
      // 保存更新后的代理列表和当前代理索引
      chrome.storage.sync.set({ 
        proxies: newProxies,
        currentProxy: newCurrentProxy
      }, function() {
        console.log('代理已删除，索引:', selectedIndex);
        
        // 重新加载代理列表
        loadProxies();
        
        // 如果之前代理是启用状态，并且还有其他代理可用，则启用新的当前代理
        if (data.isProxyEnabled && newProxies.length > 0 && newCurrentProxy >= 0) {
          chrome.runtime.sendMessage({
            action: 'toggleProxy',
            enable: true,
            proxyConfig: newProxies[newCurrentProxy]
          });
        }
      });
    });
  });
});