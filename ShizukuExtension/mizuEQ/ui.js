
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

// EDIT: ボタン表示の更新 (powered状態で管理)
function updateButtonUI(button, isCapturing, isPowered) {
  if (!isCapturing) {
    button.textContent = 'EQを開始';
    button.style.backgroundColor = '#ffffff50';
  } else if (isPowered) {
    button.textContent = 'EQを停止(Shiftで完全に停止)';
    button.style.backgroundColor = '#ff4d4d80';
  } else {
    button.textContent = 'EQを再開(Shiftで完全に停止)';
    button.style.backgroundColor = '#ffffff50';
  }
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
  // EDIT: powered状態で停止/再開を区別 (EQ電源ボタンと同じ軸)
  let eqPowered = status?.powered !== false;
  if (button) {
    button.disabled = prepared?.ready !== true;
    updateButtonUI(button, captureActive, eqPowered);

    // EDIT: 未キャプチャ→START_EQ、キャプチャ中+Shiftクリック→STOP_EQ(完全停止)、キャプチャ中通常クリック→TOGGLE_EQ
    button.addEventListener('click', (event) => {
      if (activeTabId === null) return;

      if (!captureActive) {
        // EDIT: 開始 (キャプチャ未開始)
        chrome.runtime.sendMessage({
          type: 'START_EQ',
          tabId: activeTabId
        }, response => {
          if (chrome.runtime.lastError || response?.error) return;
          captureActive = response?.capturing === true || response?.starting === true;
          eqPowered = true;
          updateButtonUI(button, captureActive, eqPowered);
          // ADD: EQウィンドウを表示・中央配置させる
          if (captureActive || response?.starting) {
            chrome.runtime.sendMessage({
              type: 'SHOW_EQ_WINDOW',
              tabId: activeTabId
            });
          }
        });
      } else if (event.shiftKey) {
        // ADD: Shift+クリック時はTabCaptureも含めて完全停止し、ボタンを「EQを開始」に戻す
        chrome.runtime.sendMessage({
          type: 'STOP_EQ',
          tabId: activeTabId
        }, response => {
          if (chrome.runtime.lastError || response?.error) return;
          captureActive = false;
          eqPowered = false;
          updateButtonUI(button, captureActive, eqPowered);
        });
      } else {
        // EDIT: 停止/再開 → TOGGLE_EQ (EQ電源ボタンと同一動作: バイパス切り替え)
        // ウィンドウは非表示にならず、EQ処理のみ ON/OFF する
        chrome.runtime.sendMessage({
          type: 'TOGGLE_EQ',
          tabId: activeTabId,
          captureActive
        }, response => {
          if (chrome.runtime.lastError || response?.error) return;
          // EDIT: response.active が新しいpowered状態
          eqPowered = response?.active === true;
          updateButtonUI(button, captureActive, eqPowered);
        });
      }
    });
  }
});