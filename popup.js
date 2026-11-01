// EDIT: サイドパネルで設定を開く
document.getElementById('openSidePanel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'sidepanel/default.html',
      enabled: true
    });
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  }
});
// メトロジグ
document.getElementById('openMetrozig').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'sidepanel/metrozig.html',
      enabled: true
    });
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  }
});
