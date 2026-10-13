// サイドパネルを開くボタン
document.getElementById('openSidePanel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    window.close();
  }
});