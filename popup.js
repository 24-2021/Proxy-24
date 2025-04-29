document.addEventListener('DOMContentLoaded', function() {
  const proxySelect = document.getElementById('proxy-select');
  const toggleButton = document.getElementById('toggle-proxy');
  const addProxyButton = document.getElementById('add-proxy');
  const deleteProxyButton = document.getElementById('delete-proxy');
  const proxyTypeInput = document.getElementById('proxy-type');
  const proxyHostInput = document.getElementById('proxy-host');
  const proxyPortInput = document.getElementById('proxy-port');
  const proxyUsernameInput = document.getElementById('proxy-username');
  const proxyPasswordInput = document.getElementById('proxy-password');
  const statusIndicator = document.getElementById('status-indicator');
  
  // 白名单相关元素
  // 删除这两行
  // const whitelistDomainInput = document.getElementById('whitelist-domain');
  // const addWhitelistButton = document.getElementById('add-whitelist');
  const whitelistItemsSelect = document.getElementById('whitelist-items');
  const removeWhitelistButton = document.getElementById('remove-whitelist');
  const batchWhitelistInput = document.getElementById('batch-whitelist');
  const batchAddWhitelistButton = document.getElementById('batch-add-whitelist');
  const clearWhitelistButton = document.getElementById('clear-whitelist');
  
  // 选项卡切换功能
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      // 移除所有选项卡的活动状态
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // 添加当前选项卡的活动状态
      this.classList.add('active');
      const tabId = this.getAttribute('data-tab');
      document.getElementById(`${tabId}-tab`).classList.add('active');
    });
  });
  
  // 加载代理列表
  loadProxies();
  
  // 加载白名单
  loadWhitelist();
  
  // 添加新代理
  addProxyButton.addEventListener('click', function() {
    const type = proxyTypeInput.value;
    const host = proxyHostInput.value.trim();
    const port = proxyPortInput.value.trim();
    const username = proxyUsernameInput.value.trim();
    const password = proxyPasswordInput.value.trim();
    
    if (!host || !port) {
      showMessage('请输入代理主机和端口', 'error');
      return;
    }
    
    chrome.storage.sync.get(['proxies'], function(data) {
      const proxies = data.proxies || [];
      
      // 添加新代理
      proxies.push({
        type: type,
        host: host,
        port: port,
        username: username,
        password: password
      });
      
      chrome.storage.sync.set({proxies: proxies}, function() {
        // 清空输入框
        proxyHostInput.value = '';
        proxyPortInput.value = '';
        proxyUsernameInput.value = '';
        proxyPasswordInput.value = '';
        
        // 重新加载代理列表
        loadProxies();
        
        // 选择新添加的代理
        setTimeout(function() {
          proxySelect.selectedIndex = proxies.length - 1;
          proxySelect.dispatchEvent(new Event('change'));
        }, 100);
        
        // 添加成功后切换到代理设置选项卡
        document.querySelector('.tab[data-tab="proxy"]').click();
      });
    });
  });
  
  // 删除当前选中的代理
  deleteProxyButton.addEventListener('click', function() {
    const selectedIndex = proxySelect.selectedIndex;
    
    if (selectedIndex === -1) {
      showMessage('请选择要删除的代理', 'warning');
      return;
    }
    
    chrome.storage.sync.get(['proxies', 'currentProxy', 'isProxyEnabled'], function(data) {
      const proxies = data.proxies || [];
      
      // 删除选中的代理
      proxies.splice(selectedIndex, 1);
      
      // 更新存储
      const updates = {proxies: proxies};
      
      // 如果删除的是当前使用的代理，则禁用代理
      if (data.isProxyEnabled && data.currentProxy === selectedIndex) {
        updates.isProxyEnabled = false;
        
        // 设置为直连模式
        chrome.proxy.settings.set({
          value: {mode: 'direct'},
          scope: 'regular'
        });
      }
      
      // 如果当前选中的代理索引大于删除的代理索引，则减少当前代理索引
      if (data.currentProxy > selectedIndex) {
        updates.currentProxy = data.currentProxy - 1;
      }
      
      chrome.storage.sync.set(updates, function() {
        // 重新加载代理列表
        loadProxies();
        
        // 更新状态指示器
        updateStatusIndicator(false);
      });
    });
  });
  
  // 切换代理状态
  toggleButton.addEventListener('click', function() {
    const selectedIndex = proxySelect.selectedIndex;
    
    if (selectedIndex === -1) {
      showMessage('请选择要使用的代理', 'warning');
      return;
    }
    
    chrome.storage.sync.get(['proxies', 'isProxyEnabled'], function(data) {
      const proxies = data.proxies || [];
      const currentProxy = proxies[selectedIndex];
      const newState = !data.isProxyEnabled;
      
      // 发送消息到background.js以更新代理设置
      chrome.runtime.sendMessage({
        action: 'toggleProxy',
        enable: newState,
        proxyConfig: {
          type: currentProxy.type,
          host: currentProxy.host,
          port: currentProxy.port,
          username: currentProxy.username,
          password: currentProxy.password
        }
      }, function(response) {
        if (response && response.success) {
          // 更新存储
          chrome.storage.sync.set({
            isProxyEnabled: newState,
            currentProxy: selectedIndex
          }, function() {
            // 更新状态指示器
            updateStatusIndicator(newState);
            
            // 更新按钮文本
            toggleButton.textContent = newState ? '禁用代理' : '启用代理';
            toggleButton.className = newState ? 'btn-danger' : 'btn-success';
          });
        }
      });
    });
  });
  
  // 代理选择变化时
  proxySelect.addEventListener('change', function() {
    const selectedIndex = proxySelect.selectedIndex;
    
    if (selectedIndex === -1) {
      return;
    }
    
    chrome.storage.sync.get(['isProxyEnabled', 'currentProxy'], function(data) {
      // 如果当前有代理启用，且选择了不同的代理，则更新按钮状态
      if (data.isProxyEnabled && data.currentProxy === selectedIndex) {
        toggleButton.textContent = '禁用代理';
        toggleButton.className = 'btn-danger';
      } else {
        toggleButton.textContent = '启用代理';
        toggleButton.className = 'btn-success';
      }
    });
  });
  
  // 添加白名单域名
  // 删除这个事件监听器
  // addWhitelistButton.addEventListener('click', function() {
  //   const domain = whitelistDomainInput.value.trim();
  //   if (!domain) {
  //     alert('请输入有效的域名');
  //     return;
  //   }
  //   
  //   chrome.runtime.sendMessage(
  //     { action: 'addToWhitelist', domain: domain },
  //     function(response) {
  //       if (response && response.success) {
  //         whitelistDomainInput.value = '';
  //         loadWhitelist();
  //       } else {
  //         alert(response && response.message ? response.message : '添加失败');
  //       }
  //     }
  //   );
  // });
  
  // 移除白名单域名
  removeWhitelistButton.addEventListener('click', function() {
    const selectedIndex = whitelistItemsSelect.selectedIndex;
    if (selectedIndex === -1) {
      showMessage('请选择要移除的域名', 'warning');
      return;
    }
    
    const domain = whitelistItemsSelect.options[selectedIndex].value;
    chrome.runtime.sendMessage(
      { action: 'removeFromWhitelist', domain: domain },
      function(response) {
        if (response && response.success) {
          loadWhitelist();
          showMessage('域名已成功移除', 'success');
        } else {
          showMessage('移除失败', 'error');
        }
      }
    );
  });
  
  // 加载代理列表
  function loadProxies() {
    chrome.storage.sync.get(['proxies', 'currentProxy', 'isProxyEnabled'], function(data) {
      const proxies = data.proxies || [];
      
      // 清空选择框
      proxySelect.innerHTML = '';
      
      // 添加代理到选择框
      proxies.forEach(function(proxy, index) {
        const option = document.createElement('option');
        option.value = index;
        // 添加认证标志
        const authBadge = (proxy.username && proxy.password) ? ' 🔒' : '';
        option.textContent = `${proxy.type.toUpperCase()} - ${proxy.host}:${proxy.port}${authBadge}`;
        proxySelect.appendChild(option);
      });
      
      // 如果没有代理，禁用相关按钮
      if (proxies.length === 0) {
        toggleButton.disabled = true;
        deleteProxyButton.disabled = true;
        
        // 添加提示选项
        const option = document.createElement('option');
        option.disabled = true;
        option.textContent = '没有可用的代理';
        proxySelect.appendChild(option);
        
        // 更新状态指示器
        updateStatusIndicator(false);
      } else {
        toggleButton.disabled = false;
        deleteProxyButton.disabled = false;
        
        // 选择当前代理
        if (data.isProxyEnabled && data.currentProxy !== undefined) {
          proxySelect.selectedIndex = data.currentProxy;
          
          // 更新按钮文本
          toggleButton.textContent = '禁用代理';
          toggleButton.className = 'btn-danger';
          
          // 更新状态指示器
          updateStatusIndicator(true);
        } else {
          // 默认选择第一个代理
          proxySelect.selectedIndex = 0;
          
          // 更新按钮文本
          toggleButton.textContent = '启用代理';
          toggleButton.className = 'btn-success';
          
          // 更新状态指示器
          updateStatusIndicator(false);
        }
      }
    });
  }
  
  // 加载白名单列表
  function loadWhitelist() {
    chrome.runtime.sendMessage(
      { action: 'getWhitelist' },
      function(response) {
        // 清空现有选项
        whitelistItemsSelect.innerHTML = '';
        
        // 添加白名单域名到选择框
        if (response && response.whitelist && response.whitelist.length > 0) {
          response.whitelist.forEach(function(domain) {
            const option = document.createElement('option');
            option.value = domain;
            option.textContent = domain;
            whitelistItemsSelect.appendChild(option);
          });
        } else {
          // 如果白名单为空，显示提示信息
          const option = document.createElement('option');
          option.disabled = true;
          option.textContent = '白名单为空';
          whitelistItemsSelect.appendChild(option);
        }
      }
    );
  }
  
  // 更新状态指示器
  function updateStatusIndicator(isEnabled) {
    if (!statusIndicator) return;
    
    if (isEnabled) {
      statusIndicator.textContent = '代理已启用';
      statusIndicator.className = 'status-enabled';
    } else {
      statusIndicator.textContent = '代理已禁用';
      statusIndicator.className = 'status-disabled';
    }
  }
  
  // 批量添加白名单域名
  batchAddWhitelistButton.addEventListener('click', function() {
    const batchText = batchWhitelistInput.value.trim();
    if (!batchText) {
      showMessage('请输入要批量添加的域名', 'warning');
      return;
    }
    
    // 按行分割域名
    const domains = batchText.split('\n').map(d => d.trim()).filter(d => d);
    
    if (domains.length === 0) {
      showMessage('未找到有效的域名', 'warning');
      return;
    }
    
    // 获取现有白名单
    chrome.runtime.sendMessage(
      { action: 'getWhitelist' },
      function(response) {
        if (response && response.whitelist) {
          const existingWhitelist = response.whitelist;
          const newDomains = [];
          const duplicateDomains = [];
          
          // 检查每个域名是否已存在
          domains.forEach(domain => {
            if (existingWhitelist.includes(domain)) {
              duplicateDomains.push(domain);
            } else {
              newDomains.push(domain);
            }
          });
          
          if (newDomains.length === 0) {
            showMessage('所有域名已存在于白名单中', 'warning');
            return;
          }
          
          // 添加新域名
          chrome.runtime.sendMessage(
            { action: 'batchAddToWhitelist', domains: newDomains },
            function(response) {
              if (response && response.success) {
                // 清空输入框
                batchWhitelistInput.value = '';
                
                // 重新加载白名单
                loadWhitelist();
                
                // 显示结果
                let message = `成功添加 ${newDomains.length} 个域名`;
                if (duplicateDomains.length > 0) {
                  message += `，${duplicateDomains.length} 个域名已存在`;
                }
                showMessage(message, 'success');
              } else {
                showMessage('批量添加失败', 'error');
              }
            }
          );
        }
      }
    );
  });
  
  // 清空白名单
  clearWhitelistButton.addEventListener('click', function() {
    if (confirm('确定要清空所有白名单域名吗？此操作不可撤销。')) {
      chrome.runtime.sendMessage(
        { action: 'clearWhitelist' },
        function(response) {
          if (response && response.success) {
            loadWhitelist();
            showMessage('白名单已清空', 'success');
          } else {
            showMessage('清空白名单失败', 'error');
          }
        }
      );
    }
  });
  
  // 检查当前代理状态
  chrome.runtime.sendMessage({action: 'getProxyState'}, function(response) {
    if (response) {
      updateStatusIndicator(response.isEnabled);
    }
  });
});

// 添加显示消息的函数
function showMessage(message, type = 'error') {
  const container = document.getElementById('message-container');
  container.textContent = message;
  container.className = `message-container message-${type} message-show`;
  
  // 1秒后自动隐藏
  setTimeout(() => {
    container.className = 'message-container';
  }, 1000);
}
