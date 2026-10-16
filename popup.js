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

// EDIT: mizuEQ 関連処理
let activeTabId = null;
let captureActive = false;

// ADD: EQ描画品質キーとURLパターンキー
const QUALITY_KEY = 'mizuEQ_eqRenderQuality';
const URL_PATTERNS_KEY = 'mizuEQ_urlPatterns';
const DEFAULT_URL_PATTERNS = ['https://www.youtube.com/watch?v=*'];

// ADD: EQ描画品質の読み込み
async function loadQuality(select) {
  const result = await chrome.storage.local.get(QUALITY_KEY);
  select.value = [8, 16].includes(Number(result[QUALITY_KEY]))
    ? String(Number(result[QUALITY_KEY]))
    : '8';
}

// ADD: EQ描画品質の保存
function saveQuality(select) {
  const value = Number(select.value);
  const quality = [8, 16].includes(value) ? value : 8;
  chrome.storage.local.set({ [QUALITY_KEY]: quality });
  chrome.runtime.sendMessage({ type: 'RENDER_QUALITY_CHANGED', quality });
}

// ADD: 対象URLパターンの読み込み
async function loadUrlPatterns() {
  const result = await chrome.storage.local.get(URL_PATTERNS_KEY);
  return result[URL_PATTERNS_KEY] ?? [...DEFAULT_URL_PATTERNS];
}

// ADD: 対象URLパターンの保存
function saveUrlPatterns(patterns) {
  const validPatterns = patterns
    .map(pattern => pattern.trim())
    .filter(Boolean);
  return chrome.storage.local.set({ [URL_PATTERNS_KEY]: validPatterns });
}

// ADD: ボタン表示の更新
function updateButtonUI(button, isCapturing) {
  button.textContent = isCapturing ? 'EQを停止' : 'EQを開始';
  button.style.backgroundColor = isCapturing ? '#ff4d4d80' : '#ffffff50';
}

document.addEventListener('DOMContentLoaded', async () => {
  const button = document.getElementById('loadEQ');
  const qualitySelect = document.getElementById('eqQuality');
  const urlPatternsTextarea = document.getElementById('eqUrlPatterns');

  if (button) button.disabled = true;

  // ADD: EQ描画品質の初期化と変更監視
  if (qualitySelect) {
    await loadQuality(qualitySelect);
    qualitySelect.addEventListener('change', () => {
      saveQuality(qualitySelect);
    });
  }

  // ADD: URLパターンの初期化と変更監視
  if (urlPatternsTextarea) {
    const patterns = await loadUrlPatterns();
    urlPatternsTextarea.value = patterns.join('\n');
    urlPatternsTextarea.addEventListener('change', () => {
      const newPatterns = urlPatternsTextarea.value.split('\n');
      saveUrlPatterns(newPatterns);
    });
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  if (activeTabId === null) return;

  const [prepared, status] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'PREPARE_EQ' }),
    chrome.runtime.sendMessage({ type: 'GET_STATUS', tabId: activeTabId })
  ]);

  captureActive = status?.capturing === true;
  if (button) {
    button.disabled = prepared?.ready !== true;
    updateButtonUI(button, captureActive);

    // EDIT: クリック直後に即座にTOGGLE_EQを送信(ユーザーアクション制限対策)
    button.addEventListener('click', () => {
      if (activeTabId === null) return;

      chrome.runtime.sendMessage({
        type: 'TOGGLE_EQ',
        tabId: activeTabId,
        captureActive
      }, response => {
        if (chrome.runtime.lastError || response?.error) return;
        captureActive = response?.capturing === true || response?.starting === true;
        updateButtonUI(button, captureActive);
      });
    });
  }
});