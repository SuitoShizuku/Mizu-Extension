// ADD: YouTubeBackur - popup.js
(() => {
  // ADD: デフォルト設定値
  const DEFAULT_CONFIG = {
    enabled: true,
    blur: 40,
    brightness: 70,
    opacity: 85
  };

  // ADD: 要素取得
  const toggleEnabled = document.getElementById('toggle-enabled');
  const inputBlur = document.getElementById('input-blur');
  const inputBrightness = document.getElementById('input-brightness');
  const inputOpacity = document.getElementById('input-opacity');

  const valBlur = document.getElementById('val-blur');
  const valBrightness = document.getElementById('val-brightness');
  const valOpacity = document.getElementById('val-opacity');

  const btnReset = document.getElementById('btn-reset');

  // ADD: UIのラベル更新
  function updateLabels(config) {
    valBlur.textContent = `${config.blur}px`;
    valBrightness.textContent = `${config.brightness}%`;
    valOpacity.textContent = `${config.opacity}%`;
  }

  // ADD: 設定値をUIに反映
  function updateUI(config) {
    toggleEnabled.checked = config.enabled;
    inputBlur.value = config.blur;
    inputBrightness.value = config.brightness;
    inputOpacity.value = config.opacity;
    updateLabels(config);
  }

  // ADD: 設定の保存 (sync優先、失敗時はlocal)
  function saveConfig(newConfig) {
    chrome.storage.sync.set(newConfig, () => {
      if (chrome.runtime.lastError) {
        chrome.storage.local.set(newConfig);
      }
    });
  }

  // ADD: 現在のUI状態から設定を取得して保存
  function handleInputChange() {
    const config = {
      enabled: toggleEnabled.checked,
      blur: parseInt(inputBlur.value, 10),
      brightness: parseInt(inputBrightness.value, 10),
      opacity: parseInt(inputOpacity.value, 10)
    };
    updateLabels(config);
    saveConfig(config);
  }

  // ADD: ストレージから初期設定の読み込み
  chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
    if (chrome.runtime.lastError) {
      chrome.storage.local.get(DEFAULT_CONFIG, (localItems) => {
        updateUI({ ...DEFAULT_CONFIG, ...localItems });
      });
    } else {
      updateUI({ ...DEFAULT_CONFIG, ...items });
    }
  });

  // ADD: イベントリスナー登録
  toggleEnabled.addEventListener('change', handleInputChange);
  inputBlur.addEventListener('input', handleInputChange);
  inputBrightness.addEventListener('input', handleInputChange);
  inputOpacity.addEventListener('input', handleInputChange);

  // ADD: リセットボタンの処理
  btnReset.addEventListener('click', () => {
    updateUI(DEFAULT_CONFIG);
    saveConfig(DEFAULT_CONFIG);
  });
})();
