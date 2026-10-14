const PANEL_DEFAULT = '/sidepanel/default.html'
const PANEL_CONFIGS = [
  {
    name: 'GigaFile便',
    match: (url) => url.includes('gigafile.nu'),
    path: '/sidepanel/gigafile.html'
//   },
//   {
//     name: 'YouTube',
//     match: (url) => url.includes('youtube.com'),
//     path: 'youtube_sidepanel.html'
//   },
//   {
//     name: 'X (Twitter)',
//     match: (url) => url.includes('twitter.com') || url.includes('x.com'),
//     path: 'twitter_sidepanel.html'
  }
];

/**
 * サイドパネルをURLによって切り替える関数
 * @param {number | undefined} tabId Active Tab
 * @param {string | undefined} url Active Tab Url
 * @returns {Promise<boolean>} Success
 */
async function updateSidePanel(tabId, url) {
  if (!tabId || !url) return false;

  try {
    // 現在のタブのサイドパネル設定を取得
    const currentOptions = await chrome.sidePanel.getOptions({ tabId });

    // URLにマッチする設定をテーブルから検索
    const matchedConfig = PANEL_CONFIGS.find(config => config.match(url));

    if (matchedConfig) {
      // マッチするサイトが開かれている場合
      const isCustomPanelOpen = currentOptions.path && !PANEL_CONFIGS.some(c => c.path === currentOptions.path);

      if (isCustomPanelOpen) {
        await chrome.sidePanel.setOptions({ tabId, enabled: true });
      } else {
        await chrome.sidePanel.setOptions({
          tabId,
          path: matchedConfig.path,
          enabled: true
        });
      }
      return true;
    } else {
      // マッチするサイトがない場合
      // ユーザーが意図的に開いたカスタムパネル等でなければ無効化
      const isConfiguredSitePanel = PANEL_CONFIGS.some(c => c.path === currentOptions.path);
      if (!currentOptions.path || isConfiguredSitePanel) {
        await chrome.sidePanel.setOptions({ tabId, enabled: false });
      }
      return false;
    }
  } catch (error) {
    console.error('SidePanel update error:', error);
  }
  return false
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    updateSidePanel(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab) {
    updateSidePanel(tab.id, tab.url);
  }
});

// Scriptからのメッセージを受けてサイドパネルを開く
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openSidePanel' && sender.tab) {
    chrome.sidePanel.open({ tabId: sender.tab.id });
  }
});