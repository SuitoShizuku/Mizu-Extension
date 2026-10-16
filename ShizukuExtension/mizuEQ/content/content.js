/* ============================================================
 * EDIT: mizu-q Content Script - Floating EQ Window
 * EDIT: Ozone風パラメトリックEQ UI
 * EDIT: HPF/LPFスクロール滑らかさ調整、確実なON/OFF連動、ドメイン設定同期
 * ============================================================ */

(function () {
  'use strict';

  // ADD: 二重注入防止
  if (document.getElementById('mizu-q-host')) return;

  // ============================================================
  // EDIT: プロ仕様オーディオプラグイン用カラーパレット
  // ============================================================
  const COLOR_PALETTE = [
    '#38bdf8', // スカイシアン
    '#fbbf24', // アンバー
    '#34d399', // エメラルド
    '#fb7185', // ローズ
    '#a78bfa', // バイオレット
    '#f97316', // コーラル
    '#2dd4bf', // ティール
    '#818cf8'  // インディゴ
  ];

  const FILTER_TYPE_NAMES = {
    'peaking': 'Peaking',
    'lowshelf': 'Low Shelf',
    'highshelf': 'High Shelf',
    'highpass': 'High Pass',
    'lowpass': 'Low Pass'
  };

  // EDIT: デフォルトプリセット定義 (Standardプリセット)
  const BUILTIN_PRESETS = [
    {
      name: 'Flat',
      inputGain: 1.0,
      outputGain: 1.0,
      limiterThreshold: -2.0,
      limiterEnabled: true,
      bands: []
    },
    {
      name: 'Acoustic',
      inputGain: 1.0,
      outputGain: 1.0,
      limiterThreshold: -2.0,
      limiterEnabled: true,
      bands: [
        { type: 'lowshelf', frequency: 120, gain: 2.5, Q: 1.2, enabled: true },
        { type: 'peaking', frequency: 800, gain: -1.5, Q: 1.0, enabled: true },
        { type: 'peaking', frequency: 3200, gain: 3.0, Q: 1.4, enabled: true },
        { type: 'highshelf', frequency: 9000, gain: 2.0, Q: 0.8, enabled: true }
      ]
    },
    {
      name: 'Vocal Boost',
      inputGain: 1.0,
      outputGain: 1.0,
      limiterThreshold: -2.0,
      limiterEnabled: true,
      bands: [
        { type: 'highpass', frequency: 90, gain: 0, Q: 0.707, slope: 24, enabled: true },
        { type: 'peaking', frequency: 1200, gain: 3.5, Q: 0.7, enabled: true },
        { type: 'peaking', frequency: 3500, gain: 4.0, Q: 1.5, enabled: true },
        { type: 'highshelf', frequency: 8500, gain: 2.5, Q: 0.8, enabled: true }
      ]
    },
    {
      name: 'Eargasm Explosion',
      inputGain: 1.0,
      outputGain: 0.54,
      limiterThreshold: -3.0,
      limiterEnabled: true,
      bands: [
        { type: 'peaking', frequency: 125, gain: 9.0, Q: 0.4, enabled: true },
        { type: 'peaking', frequency: 500, gain: 3.0, Q: 1.5, enabled: true },
        { type: 'peaking', frequency: 2000, gain: 6.0, Q: 1.5, enabled: true },
        { type: 'peaking', frequency: 8000, gain: 10.5, Q: 1.5, enabled: true },
        { type: 'highshelf', frequency: 12000, gain: 8.0, Q: 0.9, enabled: true }
      ]
    }
  ];

  const FREQ_LABELS = [20, 50, 100, 200, 500, '1k', '2k', '5k', '10k', '20k'];
  const FREQ_VALUES = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const DB_RANGE = 24;
  const FULL_WIDTH = 895;
  const FULL_HEIGHT = 440;
  const MINI_WIDTH = 340;
  const MINI_HEIGHT = 150;
  const HEADER_HEIGHT = 36;

  // ============================================================
  // EDIT: 状態管理 & ドメイン取得
  // ============================================================
  const currentDomain = window.location.hostname || 'default';
  let bands = [];
  let inputGain = 1.0;
  let outputGain = 1.0;
  let limiterThreshold = -2.0;
  let limiterEnabled = true;
  let fadersLinked = false;
  let eqPowerOn = true;
  let captureActive = false;
  // ADD: キャプチャ起動処理中フラグ
  let isStartingCapture = false;
  const isYouTube = /(^|\.)youtube\.com$/i.test(window.location.hostname);
  let youtubeControlsObserver = null;
  let youtubeSyncPending = false;
  let domainDataReady = false;
  let pendingActivationTabId = null;
  let pendingBandUpdate = null;
  let lastBandUpdateAt = 0;
  const BAND_UPDATE_INTERVAL_MS = 30;
  let userPresets = [];
  let currentPresetName = 'Custom';
  let isMiniMode = false;
  let isVisible = false;
  let activeBandIndex = -1;
  let hoveredBandIndex = -1;
  // ADD: HUDポップアップ制御 & 数値入力用の状態変数
  let activeHudBandIndex = -1;
  let isHudHovered = false;
  let isHudEditing = false;
  let hudHideTimer = null;
  let tabId = null;
  let spectrumData = null;
  let renderQuality = 8;
  let animFrameId = null;
  let dragState = null;
  let mouseDownTime = 0;
  let hasMovedSignificantly = false;

  let smoothedPostData = null;
  let peakHoldData = null;

  let winX = 60;
  let winY = 60;

  // ============================================================
  // EDIT: Shadow DOM ホスト作成 & styles.css 参照
  // ============================================================
  const host = document.createElement('div');
  host.id = 'mizu-q-host';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'closed' });

  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('styles.css');
  shadow.appendChild(styleLink);

  // ============================================================
  // EDIT: EQ Window DOM構築
  // ============================================================
  const eqWindow = document.createElement('div');
  eqWindow.className = 'eq-window';
  eqWindow.style.display = 'none';
  shadow.appendChild(eqWindow);

  // EDIT: ヘッダーバー (プリセットをリセットボタンの左に配置)
  const header = document.createElement('div');
  header.className = 'eq-header';
  header.innerHTML = `
    <div class="eq-header-left">
      <span class="eq-logo">mizu-q</span>
      <span class="eq-help-hint">左クリック: 追加/切替 | 右クリック: 削除 | ホイールスクロール: スロープ・Qの調整</span>
    </div>
    <div class="eq-header-right">
      <div class="preset-dropdown-container">
        <button class="preset-btn" id="mqPresetBtn">
          <span id="mqPresetLabel">Presets</span>
          <span class="preset-arrow">▼</span>
        </button>
        <div class="preset-menu" id="mqPresetMenu" style="display: none;"></div>
      </div>
      <button class="eq-btn power-btn active" id="mqPower" title="EQ オン／オフ">⏻</button>
      <button class="eq-btn reset-btn" id="mqReset" title="EQをリセット (全ポイント削除)">⟳</button>
      <button class="eq-btn mini-btn" id="mqMini" title="ミニモード切替">▬</button>
      <button class="eq-btn close-btn" id="mqClose" title="閉じる">✕</button>
    </div>
  `;
  eqWindow.appendChild(header);

  // スペクトラムキャンバスコンテナ
  const eqBody = document.createElement('div');
  eqBody.className = 'eq-body';
  eqWindow.appendChild(eqBody);

  const spectrumContainer = document.createElement('div');
  spectrumContainer.className = 'spectrum-container';
  eqBody.appendChild(spectrumContainer);

  const canvas = document.createElement('canvas');
  canvas.className = 'spectrum-canvas';
  spectrumContainer.appendChild(canvas);

  // EDIT: ノードHUDポップアップ
  const hudPopup = document.createElement('div');
  hudPopup.className = 'node-hud-popup';
  hudPopup.style.display = 'none';
  // ADD: HUDへのホバー & イベント伝播制御
  hudPopup.addEventListener('mouseenter', () => {
    isHudHovered = true;
    cancelHideHud();
  });
  hudPopup.addEventListener('mouseleave', () => {
    isHudHovered = false;
    scheduleHideHud();
  });
  hudPopup.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
  hudPopup.addEventListener('wheel', (e) => {
    e.stopPropagation();
  }, { passive: false });
  hudPopup.addEventListener('contextmenu', (e) => {
    e.stopPropagation();
  });
  spectrumContainer.appendChild(hudPopup);

  const faders = document.createElement('div');
  faders.className = 'volume-faders';
  faders.innerHTML = `
    <div class="fader-row">
      <div class="volume-fader"><span class="volume-label">IN</span><output class="volume-value" id="mqInputValue">0.0 dB</output><input id="mqInputGain" class="volume-slider" type="range" min="-33" max="12" step="1" value="0" aria-label="Input volume"></div>
      <div class="volume-fader"><span class="volume-label">OUT</span><output class="volume-value" id="mqOutputValue">0.0 dB</output><input id="mqOutputGain" class="volume-slider" type="range" min="-33" max="12" step="1" value="0" aria-label="Output volume"></div>
      <div class="volume-fader"><span class="volume-label">THRESHOLD</span><output class="volume-value" id="mqThresholdValue">-2.0 dB</output><input id="mqLimiterThreshold" class="volume-slider limiter-slider" type="range" min="-32" max="0" step="0.5" value="-2" aria-label="Limiter threshold" title="Ceiling -0.3 dB / Attack 0 ms / Release 60 ms"></div>
    </div>
    <div class="fader-actions">
      <button class="fader-action-btn" id="mqLink" type="button">LINK</button>
      <button class="fader-action-btn limiter-btn active" id="mqLimiterPower" type="button" title="Limiter オン／オフ">⏻</button>
    </div>
    <div class="signal-flow" aria-label="Signal flow">
      <span>IN</span><b>→</b><span>EQ</span><b>→</b><span>LIMIT</span><b>→</b><span>OUT</span>
    </div>
    <output class="current-level" id="mqCurrentLevel">−∞ dBFS</output>`;
  eqBody.appendChild(faders);

  // ============================================================
  // EDIT: プリセット管理 & ドメイン別EQストレージロジック
  // ============================================================

  async function loadDomainAndPresetData(restoreDomainSettings) {
    return new Promise((resolve) => {
      const domainSettingsKey = 'mizuEQ_domain_eq_' + currentDomain;
      const storageKeys = ['mizuEQ_mizu_user_presets', 'mizuEQ_eqRenderQuality'];
      if (restoreDomainSettings) storageKeys.push(domainSettingsKey);

      chrome.storage.local.get(storageKeys, (result) => {
        renderQuality = [8, 16].includes(Number(result.mizuEQ_eqRenderQuality))
          ? Number(result.mizuEQ_eqRenderQuality)
          : 8;
        if (restoreDomainSettings) {
          const savedState = result[domainSettingsKey];
          if (Array.isArray(savedState)) {
            bands = JSON.parse(JSON.stringify(savedState));
          } else if (savedState && Array.isArray(savedState.bands)) {
            bands = JSON.parse(JSON.stringify(savedState.bands));
            inputGain = Number.isFinite(savedState.inputGain) ? savedState.inputGain : 1.0;
            outputGain = Number.isFinite(savedState.outputGain) ? savedState.outputGain : 1.0;
            limiterThreshold = Number.isFinite(savedState.limiterThreshold) ? savedState.limiterThreshold : -2.0;
            limiterEnabled = savedState.limiterEnabled !== false;
            fadersLinked = savedState.fadersLinked === true;
          }
        }
        userPresets = result.mizuEQ_mizu_user_presets || [];
        syncRightPanel();
        domainDataReady = true;
        if (pendingActivationTabId) {
          activateEQ(pendingActivationTabId);
          pendingActivationTabId = null;
        }
        resolve();
      });
    });
  }

  function saveDomainEQ() {
    const key = 'mizuEQ_domain_eq_' + currentDomain;
    chrome.storage.local.set({
      [key]: { bands, inputGain, outputGain, limiterThreshold, limiterEnabled, fadersLinked }
    });
  }

  function renderPresetMenu() {
    const menu = shadow.getElementById('mqPresetMenu');
    if (!menu) return;
    menu.innerHTML = '';

    const standardTitle = document.createElement('div');
    standardTitle.className = 'preset-section-title';
    standardTitle.textContent = 'Standard';
    menu.appendChild(standardTitle);

    BUILTIN_PRESETS.forEach(p => {
      const item = document.createElement('div');
      item.className = 'preset-item' + (currentPresetName === p.name ? ' active' : '');
      item.textContent = p.name;
      item.addEventListener('click', () => {
        applyPreset(p);
        menu.style.display = 'none';
      });
      menu.appendChild(item);
    });

    if (userPresets.length > 0) {
      const userTitle = document.createElement('div');
      userTitle.className = 'preset-section-title';
      userTitle.textContent = 'User Presets';
      menu.appendChild(userTitle);

      userPresets.forEach((p, idx) => {
        const item = document.createElement('div');
        item.className = 'preset-item' + (currentPresetName === p.name ? ' active' : '');

        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;
        item.appendChild(nameSpan);

        const delBtn = document.createElement('span');
        delBtn.className = 'preset-del-btn';
        delBtn.textContent = '✕';
        delBtn.title = '削除';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          userPresets.splice(idx, 1);
          chrome.storage.local.set({ mizuEQ_mizu_user_presets: userPresets });
          renderPresetMenu();
        });
        item.appendChild(delBtn);

        item.addEventListener('click', () => {
          applyPreset(p);
          menu.style.display = 'none';
        });
        menu.appendChild(item);
      });
    }

    const divider = document.createElement('div');
    divider.className = 'preset-menu-divider';
    menu.appendChild(divider);

    const saveAction = document.createElement('div');
    saveAction.className = 'save-preset-action';
    saveAction.textContent = '+ Save as Preset...';
    saveAction.addEventListener('click', () => {
      menu.style.display = 'none';
      promptSavePreset();
    });
    menu.appendChild(saveAction);
  }

  function applyPreset(preset) {
    bands = JSON.parse(JSON.stringify(preset.bands));
    inputGain = Number.isFinite(preset.inputGain) ? preset.inputGain : 1.0;
    outputGain = Number.isFinite(preset.outputGain) ? preset.outputGain : 1.0;
    limiterThreshold = Number.isFinite(preset.limiterThreshold) ? preset.limiterThreshold : -2.0;
    limiterEnabled = preset.limiterEnabled !== false;
    currentPresetName = preset.name;
    const label = shadow.getElementById('mqPresetLabel');
    if (label) label.textContent = preset.name;

    syncRightPanel();
    sendEQParams({ bands, inputGain, outputGain, limiterThreshold, limiterEnabled });
    saveDomainEQ();
  }

  function gainToDb(gain) {
    return gain <= 0.001 ? -33 : 20 * Math.log10(gain);
  }

  function dbToGain(db) {
    return db <= -33 ? 0 : Math.pow(10, db / 20);
  }

  function formatDb(db) {
    return db <= -32.5 ? '−∞' : `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
  }

  function syncRightPanel() {
    const inputSlider = shadow.getElementById('mqInputGain');
    const outputSlider = shadow.getElementById('mqOutputGain');
    if (!inputSlider || !outputSlider) return;
    const inputDb = Math.max(-33, Math.min(12, gainToDb(inputGain)));
    const outputDb = Math.max(-33, Math.min(12, gainToDb(outputGain)));
    inputSlider.value = inputDb;
    outputSlider.value = outputDb;
    shadow.getElementById('mqInputValue').textContent = formatDb(inputDb);
    shadow.getElementById('mqOutputValue').textContent = formatDb(outputDb);
    shadow.getElementById('mqLimiterThreshold').value = limiterThreshold;
    shadow.getElementById('mqThresholdValue').textContent = `${limiterThreshold.toFixed(1)} dB`;
    shadow.getElementById('mqLink').classList.toggle('active', fadersLinked);
    shadow.getElementById('mqLimiterPower').classList.toggle('active', limiterEnabled);
  }

  function promptSavePreset() {
    const name = window.prompt('プリセット名を入力してください:', `Preset ${userPresets.length + 1}`);
    if (!name || name.trim() === '') return;

    userPresets.push({
      name: name.trim(),
      bands: JSON.parse(JSON.stringify(bands)),
      inputGain,
      outputGain,
      limiterThreshold,
      limiterEnabled
    });
    chrome.storage.local.set({ mizuEQ_mizu_user_presets: userPresets });
    currentPresetName = name.trim();
    const label = shadow.getElementById('mqPresetLabel');
    if (label) label.textContent = name.trim();
    renderPresetMenu();
  }

  // ============================================================
  // EDIT: イベント登録
  // ============================================================

  let headerDrag = null;
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.eq-btn') || e.target.closest('.preset-dropdown-container')) return;
    headerDrag = { startX: e.clientX - winX, startY: e.clientY - winY };
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (headerDrag) {
      winX = e.clientX - headerDrag.startX;
      winY = e.clientY - headerDrag.startY;
      updateWindowPosition();
    }
    if (dragState) {
      handleBandDrag(e);
    }
  });

  document.addEventListener('mouseup', (e) => {
    headerDrag = null;
    if (dragState) {
      const elapsed = Date.now() - mouseDownTime;
      if (!hasMovedSignificantly && elapsed < 350) {
        cycleBandMode(dragState.bandIndex);
      }
      const finishedBandIndex = dragState.bandIndex;
      dragState = null;
      flushPendingBandUpdate();
      canvas.style.cursor = 'default';
      // EDIT: 操作終了直後に即座に消さず、ノード上やHUD上なら維持する
      if (!isHudHovered && !isHudEditing && hoveredBandIndex < 0) {
        scheduleHideHud(350);
      }
    }
  });

  const presetBtn = shadow.getElementById('mqPresetBtn');
  const presetMenu = shadow.getElementById('mqPresetMenu');
  presetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShown = presetMenu.style.display === 'block';
    if (!isShown) renderPresetMenu();
    presetMenu.style.display = isShown ? 'none' : 'block';
  });

  document.addEventListener('click', (e) => {
    if (presetMenu && presetMenu.style.display === 'block') {
      presetMenu.style.display = 'none';
    }
  });

  shadow.getElementById('mqReset').addEventListener('click', () => {
    bands = [];
    inputGain = 1.0;
    outputGain = 1.0;
    limiterThreshold = -2.0;
    limiterEnabled = true;
    fadersLinked = false;
    currentPresetName = 'Flat';
    const label = shadow.getElementById('mqPresetLabel');
    if (label) label.textContent = 'Flat';
    activeBandIndex = -1;
    hoveredBandIndex = -1;
    hideHud();
    syncRightPanel();
    sendEQParams({ bands, inputGain, outputGain, limiterThreshold, limiterEnabled });
    saveDomainEQ();
  });

  shadow.getElementById('mqMini').addEventListener('click', () => {
    isMiniMode = !isMiniMode;
    updateWindowMode();
  });

  shadow.getElementById('mqClose').addEventListener('click', () => {
    hideEQWindow();
  });

  // EDIT: 電源ボタンUI同期
  function updatePowerButton() {
    const powerButton = shadow.getElementById('mqPower');
    powerButton.classList.toggle('active', eqPowerOn);
    powerButton.title = eqPowerOn ? 'EQ をオフにする' : 'EQ をオンにする';
    syncYouTubeEQButtons();
  }

  // EDIT: EQ電源・キャプチャ切り替え
  function toggleEQPower() {
    if (isStartingCapture) return;
    if (!captureActive) {
      isStartingCapture = true;
      syncYouTubeEQButtons();
    }
    chrome.runtime.sendMessage({
      type: 'TOGGLE_EQ',
      tabId: tabId || undefined,
      captureActive
    }, (response) => {
      if (chrome.runtime.lastError) {
        isStartingCapture = false;
        syncYouTubeEQButtons();
        return;
      }
      if (response && !response.error) {
        if (response.tabId && !tabId) {
          tabId = response.tabId;
        }
        if (response.starting) {
          isStartingCapture = true;
        } else {
          isStartingCapture = false;
          if (response.active) {
            captureActive = true;
            eqPowerOn = true;
          } else {
            eqPowerOn = response.enabled === true;
          }
        }
        updatePowerButton();
      } else {
        isStartingCapture = false;
        syncYouTubeEQButtons();
      }
    });
  }

  shadow.getElementById('mqPower').addEventListener('click', toggleEQPower);

  // EDIT: プレイヤー本体のDOMへ配置し、サイズ・ホバー・非表示はYouTubeのスタイルに従う
  function syncYouTubeEQButtons() {
    if (!isYouTube) return;
    document.querySelectorAll('.ytp-right-controls').forEach(controls => {
      let button = controls.querySelector('.mizu-q-youtube-button');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'ytp-button mizu-q-youtube-button';
        button.style.position = 'relative';
        // YouTubeのSVG用位置調整と干渉しないよう、内容だけをボタン中央に固定する
        button.innerHTML = '<span aria-hidden="true" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-family:Arial,sans-serif;font-size:12px;font-weight:700;line-height:1"><span style="position:relative">EQ<span class="mizu-q-eq-indicator" style="position:absolute;left:0;right:0;bottom:-5px;height:2px;background:currentColor"></span></span></span>';
        button.addEventListener('click', event => {
          event.stopPropagation();
          toggleEQPower();
        });
        controls.prepend(button);
      }
      const indicator = button.querySelector('.mizu-q-eq-indicator');
      if (isStartingCapture) {
        const label = 'EQ 起動中…';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', 'false');
        if (indicator) indicator.style.opacity = '0.5';
      } else if (captureActive) {
        const label = eqPowerOn ? 'EQ をオフにする' : 'EQ をオンにする';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(eqPowerOn));
        if (indicator) indicator.style.opacity = eqPowerOn ? '1' : '0';
      } else {
        const label = 'EQ を起動する';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', 'false');
        if (indicator) indicator.style.opacity = '0';
      }
    });
  }

  // EDIT: キャプチャ状態更新
  function setCaptureActive(active) {
    captureActive = active;
    if (active) isStartingCapture = false;
    syncYouTubeEQButtons();
  }

  // ADD: YouTube用コントロール監視の初期化
  function initYouTubeControlsObserver() {
    if (!isYouTube || youtubeControlsObserver) return;
    youtubeControlsObserver = new MutationObserver(() => {
      if (youtubeSyncPending) return;
      youtubeSyncPending = true;
      requestAnimationFrame(() => {
        youtubeSyncPending = false;
        syncYouTubeEQButtons();
      });
    });
    youtubeControlsObserver.observe(document.documentElement, { childList: true, subtree: true });

    // YouTube SPA遷移イベント監視
    window.addEventListener('yt-navigate-finish', () => {
      syncYouTubeEQButtons();
    });

    // 読み込み初期の数回同期間隔
    syncYouTubeEQButtons();
    setTimeout(syncYouTubeEQButtons, 500);
    setTimeout(syncYouTubeEQButtons, 1500);
    setTimeout(syncYouTubeEQButtons, 3000);
  }

  function setVolume(kind, db) {
    const normalizedDb = Math.max(-33, Math.min(12, db));
    if (kind === 'input') {
      const previousDb = Math.max(-33, Math.min(12, gainToDb(inputGain)));
      inputGain = dbToGain(normalizedDb);
      shadow.getElementById('mqInputGain').value = normalizedDb;
      shadow.getElementById('mqInputValue').textContent = formatDb(normalizedDb);
      if (fadersLinked) {
        const linkedDb = Math.max(-33, Math.min(12, gainToDb(outputGain) + normalizedDb - previousDb));
        outputGain = dbToGain(linkedDb);
        shadow.getElementById('mqOutputGain').value = linkedDb;
        shadow.getElementById('mqOutputValue').textContent = formatDb(linkedDb);
      }
    } else {
      const previousDb = Math.max(-33, Math.min(12, gainToDb(outputGain)));
      outputGain = dbToGain(normalizedDb);
      shadow.getElementById('mqOutputGain').value = normalizedDb;
      shadow.getElementById('mqOutputValue').textContent = formatDb(normalizedDb);
      if (fadersLinked) {
        const linkedDb = Math.max(-33, Math.min(12, gainToDb(inputGain) + normalizedDb - previousDb));
        inputGain = dbToGain(linkedDb);
        shadow.getElementById('mqInputGain').value = linkedDb;
        shadow.getElementById('mqInputValue').textContent = formatDb(linkedDb);
      }
    }
    sendEQParams({ inputGain, outputGain });
    saveDomainEQ();
  }

  function bindVolumeFader(id, kind) {
    const slider = shadow.getElementById(id);
    slider.addEventListener('input', (e) => setVolume(kind, Number(e.target.value)));
    slider.addEventListener('wheel', (e) => {
      e.preventDefault();
      const nextDb = Number(slider.value) + (e.deltaY < 0 ? 1 : -1);
      setVolume(kind, nextDb);
    }, { passive: false });
  }

  bindVolumeFader('mqInputGain', 'input');
  bindVolumeFader('mqOutputGain', 'output');

  function setLimiterThreshold(db) {
    limiterThreshold = Math.max(-32, Math.min(0, db));
    shadow.getElementById('mqLimiterThreshold').value = limiterThreshold;
    shadow.getElementById('mqThresholdValue').textContent = `${limiterThreshold.toFixed(1)} dB`;
    sendEQParams({ limiterThreshold });
    saveDomainEQ();
  }

  const thresholdSlider = shadow.getElementById('mqLimiterThreshold');
  thresholdSlider.addEventListener('input', (e) => setLimiterThreshold(Number(e.target.value)));
  thresholdSlider.addEventListener('wheel', (e) => {
    e.preventDefault();
    setLimiterThreshold(Number(thresholdSlider.value) + (e.deltaY < 0 ? 0.5 : -0.5));
  }, { passive: false });

  shadow.getElementById('mqLink').addEventListener('click', () => {
    fadersLinked = !fadersLinked;
    shadow.getElementById('mqLink').classList.toggle('active', fadersLinked);
    saveDomainEQ();
  });

  shadow.getElementById('mqLimiterPower').addEventListener('click', () => {
    limiterEnabled = !limiterEnabled;
    shadow.getElementById('mqLimiterPower').classList.toggle('active', limiterEnabled);
    sendEQParams({ limiterEnabled });
    saveDomainEQ();
  });

  canvas.addEventListener('mousedown', (e) => {
    if (isMiniMode) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (e.button === 2) {
      e.preventDefault();
      const bandIndex = findBandAtPosition(x, y);
      if (bandIndex >= 0) {
        removeBand(bandIndex);
        hideHud();
      }
      return;
    }

    if (e.button === 0) {
      mouseDownTime = Date.now();
      hasMovedSignificantly = false;

      const bandIndex = findBandAtPosition(x, y);
      if (bandIndex >= 0) {
        activeBandIndex = bandIndex;
        dragState = { bandIndex, startX: x, startY: y };
        canvas.style.cursor = 'grabbing';
        showHudForBand(bandIndex);
      } else {
        const newIndex = addNewBandAt(x, y);
        if (newIndex >= 0) {
          activeBandIndex = newIndex;
          dragState = { bandIndex: newIndex, startX: x, startY: y };
          canvas.style.cursor = 'grabbing';
          showHudForBand(newIndex);
        }
      }
    }
  });

  // EDIT: キャンバス上のマウス移動とHUD表示制御
  canvas.addEventListener('mousemove', (e) => {
    if (isMiniMode || dragState) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const bandIndex = findBandAtPosition(x, y);

    hoveredBandIndex = bandIndex;
    if (bandIndex >= 0) {
      canvas.style.cursor = 'pointer';
      cancelHideHud();
      showHudForBand(bandIndex);
    } else {
      canvas.style.cursor = 'crosshair';
      scheduleHideHud();
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (!dragState) {
      hoveredBandIndex = -1;
      scheduleHideHud();
    }
  });

  // EDIT: スロープ角度の選択肢 (dB/oct)
  const SLOPE_OPTIONS = [6, 12, 24, 36, 48];

  // EDIT: スクロールでQ / スロープ角度 (dB/oct) を調整
  canvas.addEventListener('wheel', (e) => {
    if (isMiniMode) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let targetIndex = dragState ? dragState.bandIndex : (hoveredBandIndex >= 0 ? hoveredBandIndex : findBandAtPosition(x, y));

    if (targetIndex >= 0 && targetIndex < bands.length) {
      e.preventDefault();
      const targetBand = bands[targetIndex];

      if (targetBand.type === 'highpass' || targetBand.type === 'lowpass') {
        // EDIT: HPF / LPF のスロープ角度 (6, 12, 24, 36, 48 dB/oct) をスクロールで切り替え
        const currentSlope = targetBand.slope || 12;
        let currentIdx = SLOPE_OPTIONS.indexOf(currentSlope);
        if (currentIdx === -1) currentIdx = 1; // 12dB/oct

        if (e.deltaY < 0) {
          // 上スクロール: より急峻なスロープへ (角度を急にする)
          currentIdx = Math.min(SLOPE_OPTIONS.length - 1, currentIdx + 1);
        } else {
          // 下スクロール: より緩やかなスロープへ (角度をなだらかにする)
          currentIdx = Math.max(0, currentIdx - 1);
        }
        targetBand.slope = SLOPE_OPTIONS[currentIdx];
      } else {
        // Peaking / Shelf のQ幅調整 (Q: 0.1 ~ 18.0)
        const delta = e.deltaY > 0 ? -0.12 : 0.12;
        const isShelf = targetBand.type === 'lowshelf' || targetBand.type === 'highshelf';
        // Shelf は Q を傾斜 (S) として使うため、安全な 0.1〜1.5 にする。
        targetBand.Q = Math.max(0.1, Math.min(isShelf ? 1.5 : 18.0, targetBand.Q * (1 + delta)));
      }

      sendEQParams({ bands, inputGain, outputGain });
      saveDomainEQ();
      showHudForBand(targetIndex);
    }
  }, { passive: false });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // ============================================================
  // EDIT: メッセージリスナー & 起動連携
  // ============================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EQ_ACTIVATED') {
      tabId = message.tabId;
      isStartingCapture = false;
      eqPowerOn = message.powered !== false;
      setCaptureActive(true);
      updatePowerButton();
      if (domainDataReady) {
        activateEQ(message.tabId);
      } else {
        // URL 自動起動が保存済み設定の読込より早い場合は、設定を読んでから有効化する。
        pendingActivationTabId = message.tabId;
      }
    }
    if (message.type === 'EQ_DEACTIVATED') {
      isStartingCapture = false;
      setCaptureActive(false);
      hideEQWindow();
    }
    if (message.type === 'EQ_POWER_CHANGED') {
      eqPowerOn = message.powered === true;
      updatePowerButton();
      if (eqPowerOn && tabId) {
        showEQWindow();
        chrome.runtime.sendMessage({ type: 'REQUEST_SPECTRUM', tabId });
      }
    }
    if (message.type === 'SPECTRUM_UPDATE') {
      spectrumData = message.data;
      const levelDisplay = shadow.getElementById('mqCurrentLevel');
      if (levelDisplay && Number.isFinite(message.data.levelDb)) {
        levelDisplay.textContent = message.data.levelDb <= -90
          ? '−∞ dBFS'
          : `${message.data.levelDb.toFixed(1)} dBFS`;
        levelDisplay.classList.remove('level-green', 'level-yellow', 'level-red', 'clipping');
        if (message.data.clipping === true || message.data.levelDb >= -3) {
          levelDisplay.classList.add('level-red');
        } else if (message.data.levelDb >= -12) {
          levelDisplay.classList.add('level-yellow');
        } else {
          levelDisplay.classList.add('level-green');
        }
      }
    }
    if (message.type === 'EQ_ERROR') {
      isStartingCapture = false;
      syncYouTubeEQButtons();
      console.error('mizu-q: Audio engine could not start:', message.error);
    }
    if (message.type === 'SHOW_EQ_WINDOW') {
      if (tabId) {
        showEQWindow();
        chrome.runtime.sendMessage({ type: 'REQUEST_SPECTRUM', tabId });
      }
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.mizuEQ_eqRenderQuality) return;
    const nextQuality = Number(changes.mizuEQ_eqRenderQuality.newValue);
    renderQuality = [8, 16].includes(nextQuality) ? nextQuality : 8;
  });

  function activateEQ(activatedTabId) {
    tabId = activatedTabId;
    showEQWindow();
    sendEQParams({ bands, inputGain, outputGain, limiterThreshold, limiterEnabled });
    chrome.runtime.sendMessage({ type: 'REQUEST_SPECTRUM', tabId });
  }

  // EDIT: ドメイン設定の読み込み後、すでに動作中のEQだけをUIへ同期する。
  // URLパターン一致を理由にキャプチャを自動開始・停止しない。
  if (isYouTube) {
    initYouTubeControlsObserver();
  }

  chrome.runtime.sendMessage({ type: 'CHECK_URL_MATCH', url: window.location.href }, (matchRes) => {
    const restoreDomainSettings = matchRes?.matches === true;
    loadDomainAndPresetData(restoreDomainSettings).then(() => {
      chrome.runtime.sendMessage({ type: 'QUERY_TAB_STATUS' }, (statusRes) => {
        if (statusRes?.tabId) {
          tabId = statusRes.tabId;
        }
        if (statusRes && statusRes.active) {
          eqPowerOn = statusRes.powered !== false;
          setCaptureActive(true);
          updatePowerButton();
          activateEQ(statusRes.tabId);
        }
      });
    });
  });

  // ============================================================
  // EDIT: バンド操作ロジック
  // ============================================================

  function addNewBandAt(x, y) {
    const w = canvas.clientWidth || (isMiniMode ? MINI_WIDTH : FULL_WIDTH);
    const h = canvas.clientHeight || (isMiniMode ? MINI_HEIGHT : (FULL_HEIGHT - HEADER_HEIGHT));
    const freq = Math.max(20, Math.min(20000, xToFreq(x, w)));
    const gain = Math.max(-DB_RANGE, Math.min(DB_RANGE, yToDb(y, h)));

    const newBand = {
      type: 'peaking',
      frequency: freq,
      gain: gain,
      Q: 1.0,
      enabled: true
    };

    bands.push(newBand);
    currentPresetName = 'Custom';
    const label = shadow.getElementById('mqPresetLabel');
    if (label) label.textContent = 'Custom';

    sendEQParams({ bands, inputGain, outputGain });
    saveDomainEQ();
    return bands.length - 1;
  }

  function removeBand(index) {
    if (index >= 0 && index < bands.length) {
      bands.splice(index, 1);
      if (activeBandIndex === index) activeBandIndex = -1;
      hoveredBandIndex = -1;
      sendEQParams({ bands, inputGain, outputGain });
      saveDomainEQ();
    }
  }

  function cycleBandMode(index) {
    if (index < 0 || index >= bands.length) return;
    const band = bands[index];
    const freq = band.frequency;

    const hasOtherHPF = bands.some((b, idx) => idx !== index && b.type === 'highpass');
    const hasOtherLPF = bands.some((b, idx) => idx !== index && b.type === 'lowpass');

    let modeSequence;
    if (freq <= 750) {
      modeSequence = ['peaking', 'lowshelf'];
      if (!hasOtherHPF) {
        modeSequence.push('highpass');
      }
    } else {
      modeSequence = ['peaking', 'highshelf'];
      if (!hasOtherLPF) {
        modeSequence.push('lowpass');
      }
    }

    const currentIdx = modeSequence.indexOf(band.type);
    if (currentIdx === -1) {
      band.type = modeSequence[0];
    } else {
      band.type = modeSequence[(currentIdx + 1) % modeSequence.length];
    }

    // HPF / LPFの場合はデフォルトQを滑らかなバターワース特性(0.707)に初期化し、ゲイン0
    if (band.type === 'highpass' || band.type === 'lowpass') {
      band.gain = 0;
      band.Q = 0.707;
    }

    sendEQParams({ bands, inputGain, outputGain });
    saveDomainEQ();
    showHudForBand(index);
  }

  function handleBandDrag(e) {
    if (!dragState) return;
    hasMovedSignificantly = true;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = canvas.clientWidth || (isMiniMode ? MINI_WIDTH : FULL_WIDTH);
    const h = canvas.clientHeight || (isMiniMode ? MINI_HEIGHT : (FULL_HEIGHT - HEADER_HEIGHT));
    const band = bands[dragState.bandIndex];
    if (!band) return;

    band.frequency = Math.max(20, Math.min(20000, xToFreq(x, w)));

    if (band.type !== 'highpass' && band.type !== 'lowpass') {
      band.gain = Math.max(-DB_RANGE, Math.min(DB_RANGE, yToDb(y, h)));
    }

    // ドラッグ中の最新値を最大約33fpsで送り、音声側でパラメータを滑らかに補間する。
    sendEQParams({ bands, inputGain, outputGain }, true);
    saveDomainEQ();
    showHudForBand(dragState.bandIndex);
  }

  // ============================================================
  // EDIT: HUDポップアップ制御 & パラメータ数値入力
  // ============================================================

  // ADD: HUD非表示スケジューリング
  function scheduleHideHud(delay = 240) {
    if (isHudHovered || isHudEditing) return;
    if (hudHideTimer) clearTimeout(hudHideTimer);
    hudHideTimer = setTimeout(() => {
      if (!isHudHovered && !isHudEditing && hoveredBandIndex < 0) {
        hideHud();
      }
    }, delay);
  }

  // ADD: HUD非表示タイマーのキャンセル
  function cancelHideHud() {
    if (hudHideTimer) {
      clearTimeout(hudHideTimer);
      hudHideTimer = null;
    }
  }

  // EDIT: HUDの非表示処理
  function hideHud() {
    cancelHideHud();
    isHudHovered = false;
    isHudEditing = false;
    activeHudBandIndex = -1;
    hudPopup.style.display = 'none';
  }

  // ADD: 入力された周波数文字列のパース (20Hz ～ 20000Hz)
  function parseFrequencyInput(valStr) {
    if (valStr === undefined || valStr === null) return NaN;
    const s = String(valStr).trim().toLowerCase();
    const match = s.match(/^([+-]?\d*(?:\.\d+)?)\s*(k|khz|hz)?$/);
    if (!match) return NaN;
    let val = parseFloat(match[1]);
    if (isNaN(val)) return NaN;
    if (match[2] === 'k' || match[2] === 'khz') {
      val *= 1000;
    }
    return Math.max(20, Math.min(20000, Math.round(val)));
  }

  // ADD: 入力されたゲイン文字列のパース (-15dB ～ +15dB)
  function parseGainInput(valStr) {
    if (valStr === undefined || valStr === null) return NaN;
    const s = String(valStr).trim().toLowerCase().replace('db', '').trim();
    const val = parseFloat(s);
    if (isNaN(val)) return NaN;
    return Math.max(-DB_RANGE, Math.min(DB_RANGE, Math.round(val * 10) / 10));
  }

  // ADD: 入力されたQ / スロープ文字列のパース
  function parseQorSlopeInput(valStr, isFilterCut, bandType) {
    if (valStr === undefined || valStr === null) return NaN;
    const s = String(valStr).trim().toLowerCase();
    if (isFilterCut) {
      const num = parseFloat(s.replace(/db\/oct|db|oct/g, '').trim());
      if (isNaN(num)) return NaN;
      return SLOPE_OPTIONS.reduce((prev, curr) => Math.abs(curr - num) < Math.abs(prev - num) ? curr : prev);
    } else {
      const val = parseFloat(s);
      if (isNaN(val)) return NaN;
      const isShelf = (bandType === 'lowshelf' || bandType === 'highshelf');
      const maxQ = isShelf ? 1.5 : 18.0;
      return Math.max(0.1, Math.min(maxQ, Math.round(val * 100) / 100));
    }
  }

  // ADD: 入力欄表示用の周波数フォーマット
  function formatFreqInput(freq) {
    if (freq >= 1000) {
      const k = freq / 1000;
      return (freq % 100 === 0 ? k.toFixed(k >= 10 ? 0 : 1) : k.toFixed(2)) + 'k';
    }
    return Math.round(freq).toString();
  }

  // ADD: HUD入力欄からパラメータへのコミット処理
  function commitHudParam(index, param, rawValue) {
    if (index < 0 || index >= bands.length) return;
    const band = bands[index];
    const isFilterCut = (band.type === 'highpass' || band.type === 'lowpass');
    let changed = false;

    if (param === 'freq') {
      const parsed = parseFrequencyInput(rawValue);
      if (!isNaN(parsed) && parsed !== band.frequency) {
        band.frequency = parsed;
        changed = true;
      }
    } else if (param === 'gain') {
      if (!isFilterCut) {
        const parsed = parseGainInput(rawValue);
        if (!isNaN(parsed) && parsed !== band.gain) {
          band.gain = parsed;
          changed = true;
        }
      }
    } else if (param === 'q-or-slope') {
      const parsed = parseQorSlopeInput(rawValue, isFilterCut, band.type);
      if (!isNaN(parsed)) {
        if (isFilterCut) {
          if (band.slope !== parsed) {
            band.slope = parsed;
            changed = true;
          }
        } else {
          if (band.Q !== parsed) {
            band.Q = parsed;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      sendEQParams({ bands, inputGain, outputGain });
      saveDomainEQ();
    }
  }

  // ADD: 矢印キーでの微調整ハンドラ
  function handleHudArrowKey(index, param, input, direction, isShift) {
    if (index < 0 || index >= bands.length) return;
    const band = bands[index];
    const isFilterCut = (band.type === 'highpass' || band.type === 'lowpass');

    if (param === 'freq') {
      const current = parseFrequencyInput(input.value) || band.frequency;
      const step = isShift ? 100 : (current >= 1000 ? 50 : 10);
      const next = Math.max(20, Math.min(20000, current + direction * step));
      band.frequency = next;
      input.value = formatFreqInput(next);
    } else if (param === 'gain') {
      if (isFilterCut) return;
      const current = parseGainInput(input.value) || band.gain;
      const step = isShift ? 1.0 : 0.5;
      const next = Math.max(-DB_RANGE, Math.min(DB_RANGE, Math.round((current + direction * step) * 10) / 10));
      band.gain = next;
      input.value = `${next >= 0 ? '+' : ''}${next.toFixed(1)}`;
    } else if (param === 'q-or-slope') {
      if (isFilterCut) {
        const currentSlope = band.slope || 12;
        let sIdx = SLOPE_OPTIONS.indexOf(currentSlope);
        if (sIdx === -1) sIdx = 1;
        sIdx = Math.max(0, Math.min(SLOPE_OPTIONS.length - 1, sIdx + direction));
        band.slope = SLOPE_OPTIONS[sIdx];
        input.value = String(band.slope);
      } else {
        const currentQ = parseQorSlopeInput(input.value, false, band.type) || band.Q;
        const step = isShift ? 0.2 : 0.05;
        const isShelf = (band.type === 'lowshelf' || band.type === 'highshelf');
        const maxQ = isShelf ? 1.5 : 18.0;
        const nextQ = Math.max(0.1, Math.min(maxQ, Math.round((currentQ + direction * step) * 100) / 100));
        band.Q = nextQ;
        input.value = nextQ.toFixed(2);
      }
    }

    sendEQParams({ bands, inputGain, outputGain });
    saveDomainEQ();
  }

  // ADD: HUD入力要素へのイベント登録
  function attachHudInputListeners(input, index, param) {
    let initialValue = input.value;

    input.addEventListener('focus', () => {
      isHudEditing = true;
      cancelHideHud();
      initialValue = input.value;
      input.select();
    });

    input.addEventListener('blur', () => {
      isHudEditing = false;
      commitHudParam(index, param, input.value);
      updateHudInputsFromBand(index);
      scheduleHideHud(300);
    });

    input.addEventListener('keydown', (e) => {
      // 外部ページや動画プレイヤーのキーボードショートカットへの伝播を防止
      e.stopPropagation();

      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.value = initialValue;
        input.blur();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleHudArrowKey(index, param, input, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
      }
    });
  }

  // ADD: 現在のバンド値とHUD入力欄表示の同期
  function updateHudInputsFromBand(index) {
    if (index < 0 || index >= bands.length) return;
    const band = bands[index];
    const isFilterCut = (band.type === 'highpass' || band.type === 'lowpass');

    const freqInput = hudPopup.querySelector('input[data-param="freq"]');
    if (freqInput && shadow.activeElement !== freqInput) {
      freqInput.value = formatFreqInput(band.frequency);
    }

    const gainInput = hudPopup.querySelector('input[data-param="gain"]');
    if (gainInput && shadow.activeElement !== gainInput) {
      gainInput.value = `${band.gain >= 0 ? '+' : ''}${band.gain.toFixed(1)}`;
    }

    const qInput = hudPopup.querySelector('input[data-param="q-or-slope"]');
    if (qInput && shadow.activeElement !== qInput) {
      qInput.value = isFilterCut ? String(band.slope || 12) : band.Q.toFixed(2);
    }
  }

  // EDIT: HUDポップアップ制御 & 数値入力対応UI生成
  function showHudForBand(index) {
    if (index < 0 || index >= bands.length || isMiniMode) {
      scheduleHideHud();
      return;
    }

    cancelHideHud();

    const band = bands[index];
    const w = canvas.clientWidth || FULL_WIDTH;
    const h = canvas.clientHeight || (FULL_HEIGHT - HEADER_HEIGHT);
    const x = freqToX(band.frequency, w);
    const y = dbToY((band.type === 'highpass' || band.type === 'lowpass') ? 0 : band.gain, h);

    const color = COLOR_PALETTE[index % COLOR_PALETTE.length];
    const modeName = FILTER_TYPE_NAMES[band.type] || band.type;
    const isFilterCut = (band.type === 'highpass' || band.type === 'lowpass');
    const slopeDb = band.slope || 12;

    // すでに同じバンドのHUDが表示されている場合はDOMを再構築せず値のみ更新
    if (activeHudBandIndex === index && hudPopup.style.display === 'block') {
      updateHudInputsFromBand(index);
    } else {
      activeHudBandIndex = index;
      hudPopup.innerHTML = `
        <div class="hud-header" style="color: ${color}">
          <span class="hud-dot" style="background: ${color}"></span>
          <span class="hud-title">${modeName}</span>
          <span class="hud-num">#${index + 1}</span>
        </div>
        <div class="hud-body">
          <div class="hud-item">
            <span class="hud-label">Freq:</span>
            <div class="hud-input-wrap">
              <input class="hud-input" data-param="freq" type="text" value="${formatFreqInput(band.frequency)}" title="周波数を入力 (例: 1000, 1.2k)" spellcheck="false" autocomplete="off" />
              <span class="hud-unit">Hz</span>
            </div>
          </div>
          ${!isFilterCut ? `
          <div class="hud-item">
            <span class="hud-label">Gain:</span>
            <div class="hud-input-wrap">
              <input class="hud-input" data-param="gain" type="text" value="${band.gain >= 0 ? '+' : ''}${band.gain.toFixed(1)}" title="ゲインを入力 (例: +3.0, -2.5)" spellcheck="false" autocomplete="off" />
              <span class="hud-unit">dB</span>
            </div>
          </div>` : ''}
          <div class="hud-item">
            <span class="hud-label">${isFilterCut ? 'Slope:' : 'Q:'}</span>
            <div class="hud-input-wrap">
              <input class="hud-input" data-param="q-or-slope" type="text" value="${isFilterCut ? slopeDb : band.Q.toFixed(2)}" title="${isFilterCut ? 'スロープ角度 (6, 12, 24, 36, 48)' : 'Q値を入力 (例: 0.71, 1.4)'}" spellcheck="false" autocomplete="off" />
              <span class="hud-unit">${isFilterCut ? 'dB/oct' : ''}</span>
            </div>
          </div>
        </div>
      `;

      hudPopup.querySelectorAll('.hud-input').forEach((input) => {
        attachHudInputListeners(input, index, input.dataset.param);
      });
    }

    const popupHeight = isFilterCut ? 68 : 88;
    let popupY = y + 16;
    if (popupY + popupHeight > h - 10) {
      popupY = y - popupHeight - 16;
    }
    const popupX = Math.max(75, Math.min(w - 75, x));

    hudPopup.style.left = `${popupX}px`;
    hudPopup.style.top = `${popupY}px`;
    hudPopup.style.borderColor = `${color}40`;
    hudPopup.style.display = 'block';
  }

  // ============================================================
  // EDIT: 描画ループ & キャンバス描画
  // ============================================================

  function startRenderLoop() {
    if (animFrameId) return;
    function render() {
      drawSpectrum();
      animFrameId = requestAnimationFrame(render);
    }
    animFrameId = requestAnimationFrame(render);
  }

  function stopRenderLoop() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function drawSpectrum() {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const displayW = isMiniMode ? MINI_WIDTH : (spectrumContainer.clientWidth || FULL_WIDTH);
    const displayH = isMiniMode ? (MINI_HEIGHT - HEADER_HEIGHT) : (spectrumContainer.clientHeight || (FULL_HEIGHT - HEADER_HEIGHT));
    if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      canvas.style.width = displayW + 'px';
      canvas.style.height = displayH + 'px';
      ctx.scale(dpr, dpr);
    }

    const cw = displayW;
    const ch = displayH;

    ctx.clearRect(0, 0, cw, ch);

    drawGrid(ctx, cw, ch);
    drawHighDefSpectrum(ctx, cw, ch);
    drawIndividualAndCompositeEQCurves(ctx, cw, ch);

    if (!isMiniMode) {
      drawBandNodes(ctx, cw, ch);
    }
  }

  function drawGrid(ctx, w, h) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;

    FREQ_VALUES.forEach(freq => {
      const x = freqToX(freq, w);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    });

    const dbSteps = [-24, -18, -12, -6, 0, 6, 12, 18, 24];
    dbSteps.forEach(db => {
      const y = dbToY(db, h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    const zeroY = dbToY(0, h);
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(w, zeroY);
    ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.textAlign = 'center';
    FREQ_LABELS.forEach((label, i) => {
      const x = freqToX(FREQ_VALUES[i], w);
      ctx.fillText(label, x, h - 5);
    });

    if (!isMiniMode) {
      ctx.textAlign = 'right';
      dbSteps.forEach(db => {
        if (db === 0) return;
        const y = dbToY(db, h);
        ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 24, y + 3);
      });
    }
  }

  function drawHighDefSpectrum(ctx, w, h) {
    if (!spectrumData || !spectrumData.post || spectrumData.post.length === 0) return;

    const rawPost = spectrumData.post;
    const numBins = rawPost.length;
    const maxFreq = spectrumData.maxFreq || 22050;

    if (!smoothedPostData || smoothedPostData.length !== numBins) {
      smoothedPostData = new Float32Array(numBins);
      for (let i = 0; i < numBins; i++) smoothedPostData[i] = rawPost[i];
    } else {
      for (let i = 0; i < numBins; i++) {
        const target = rawPost[i];
        if (target > smoothedPostData[i]) {
          smoothedPostData[i] = smoothedPostData[i] * 0.14 + target * 0.86;
        } else {
          smoothedPostData[i] = smoothedPostData[i] * 0.88 + target * 0.12;
        }
      }
    }

    if (!peakHoldData || peakHoldData.length !== w) {
      peakHoldData = new Float32Array(w);
    }

    const points = new Array(w);
    for (let px = 0; px < w; px++) {
      const freq = xToFreq(px, w);
      const binIdx = (freq / maxFreq) * numBins;
      const lower = Math.floor(binIdx);
      const upper = Math.min(numBins - 1, lower + 1);
      const frac = binIdx - lower;

      let val = 0;
      if (lower >= 0 && lower < numBins) {
        val = smoothedPostData[lower] * (1 - frac) + (smoothedPostData[upper] || smoothedPostData[lower]) * frac;
      }

      const norm = Math.max(0, Math.min(1, (val - 12) / 240));
      const y = h - (Math.pow(norm, 1.12) * h * 0.94);
      points[px] = { x: px, y };

      if (y < peakHoldData[px] || peakHoldData[px] === 0) {
        peakHoldData[px] = y;
      } else {
        peakHoldData[px] = peakHoldData[px] * 0.993 + (h * 0.99) * 0.007;
      }
    }

    if (points.length < 2) return;

    // 1. スモーキーな半透明グラデーション (Ozone / Pro-Q 調の落ち着いたトーン)
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();

    const fillGrad = ctx.createLinearGradient(0, 0, 0, h);
    fillGrad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    fillGrad.addColorStop(0.4, 'rgba(14, 165, 233, 0.12)');
    fillGrad.addColorStop(0.8, 'rgba(30, 41, 59, 0.05)');
    fillGrad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // 2. シャープなエッジライン
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // 3. ピークホールドライン
    ctx.beginPath();
    ctx.moveTo(0, peakHoldData[0]);
    for (let px = 1; px < w; px++) {
      ctx.lineTo(px, peakHoldData[px]);
    }
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 1.0;
    ctx.stroke();
  }

  // ============================================================
  // EDIT: Biquadフィルター周波数応答計算 (LS/HS完全整合 & HPF/LPFスロープ幅)
  // ============================================================

  function getBiquadCoefficients(band, Fs) {
    const f0 = Math.max(20, Math.min(20000, band.frequency));
    const Q = Math.max(0.1, Math.min(18, band.Q || 1.0));
    const gainDB = (band.type === 'highpass' || band.type === 'lowpass') ? 0 : (band.gain || 0);

    const w0 = 2 * Math.PI * f0 / Fs;
    const cos_w0 = Math.cos(w0);
    const sin_w0 = Math.sin(w0);
    const A = Math.pow(10, gainDB / 40);

    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

    switch (band.type) {
      case 'peaking': {
        const alpha = sin_w0 / (2 * Q);
        b0 = 1 + alpha * A;
        b1 = -2 * cos_w0;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cos_w0;
        a2 = 1 - alpha / A;
        break;
      }

      case 'lowshelf': {
        const slope = Math.max(0.1, Math.min(1.5, band.Q || 1));
        const alpha = (sin_w0 / 2) * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2);
        const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) - (A - 1) * cos_w0 + twoSqrtAAlpha);
        b1 = 2 * A * ((A - 1) - (A + 1) * cos_w0);
        b2 = A * ((A + 1) - (A - 1) * cos_w0 - twoSqrtAAlpha);
        a0 = (A + 1) + (A - 1) * cos_w0 + twoSqrtAAlpha;
        a1 = -2 * ((A - 1) + (A + 1) * cos_w0);
        a2 = (A + 1) + (A - 1) * cos_w0 - twoSqrtAAlpha;
        break;
      }

      case 'highshelf': {
        const slope = Math.max(0.1, Math.min(1.5, band.Q || 1));
        const alpha = (sin_w0 / 2) * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2);
        const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) + (A - 1) * cos_w0 + twoSqrtAAlpha);
        b1 = -2 * A * ((A - 1) + (A + 1) * cos_w0);
        b2 = A * ((A + 1) + (A - 1) * cos_w0 - twoSqrtAAlpha);
        a0 = (A + 1) - (A - 1) * cos_w0 + twoSqrtAAlpha;
        a1 = 2 * ((A - 1) - (A + 1) * cos_w0);
        a2 = (A + 1) - (A - 1) * cos_w0 - twoSqrtAAlpha;
        break;
      }

      case 'highpass': {
        // EDIT: Q値によって音を完全に切るまでの横幅(減衰スロープの緩やかさ〜急峻さ)を調整
        const alpha = sin_w0 / (2 * Math.max(0.15, Q));
        b0 = (1 + cos_w0) / 2;
        b1 = -(1 + cos_w0);
        b2 = (1 + cos_w0) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cos_w0;
        a2 = 1 - alpha;
        break;
      }

      case 'lowpass': {
        // EDIT: Q値によって音を完全に切るまでの横幅(減衰スロープの緩やかさ〜急峻さ)を調整
        const alpha = sin_w0 / (2 * Math.max(0.15, Q));
        b0 = (1 - cos_w0) / 2;
        b1 = 1 - cos_w0;
        b2 = (1 - cos_w0) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cos_w0;
        a2 = 1 - alpha;
        break;
      }
    }

    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  }

  function evaluateBiquadDb(coef, freq, Fs) {
    const phi = 2 * Math.PI * freq / Fs;
    const cos1 = Math.cos(phi);
    const cos2 = Math.cos(2 * phi);
    const sin1 = Math.sin(phi);
    const sin2 = Math.sin(2 * phi);

    const numReal = coef.b0 + coef.b1 * cos1 + coef.b2 * cos2;
    const numImag = -coef.b1 * sin1 - coef.b2 * sin2;
    const denReal = 1 + coef.a1 * cos1 + coef.a2 * cos2;
    const denImag = -coef.a1 * sin1 - coef.a2 * sin2;

    const numMag2 = numReal * numReal + numImag * numImag;
    const denMag2 = denReal * denReal + denImag * denImag;

    if (denMag2 < 1e-12) return 0;
    const mag2 = numMag2 / denMag2;
    if (mag2 < 1e-12) return -120;

    return 10 * Math.log10(mag2);
  }

  // 個別バンドEQ線 + 合計EQコンポジットカーブの描画
  function drawIndividualAndCompositeEQCurves(ctx, w, h) {
    const Fs = 44100;
    const activeBands = bands.map((b, i) => {
      const isCut = (b.type === 'highpass' || b.type === 'lowpass');
      const slopeDb = b.slope || 12;
      const multiplier = isCut ? (slopeDb / 12) : 1;
      return {
        band: b,
        index: i,
        coef: b.enabled ? getBiquadCoefficients(b, Fs) : null,
        multiplier: multiplier
      };
    });

    if (!isMiniMode && activeBands.length > 0) {
      activeBands.forEach(({ band, index, coef, multiplier }) => {
        if (!band.enabled || !coef) return;
        const color = COLOR_PALETTE[index % COLOR_PALETTE.length];
        // EDIT: HUDホバー・数値編集中も対象バンドの周波数特性曲線をハイライト
        const isHighlighted = (index === activeBandIndex || index === hoveredBandIndex || ((isHudHovered || isHudEditing) && index === activeHudBandIndex));

        ctx.beginPath();
        const sampleCount = Math.max(2, Math.round(w * renderQuality));
        for (let sample = 0; sample < sampleCount; sample++) {
          const px = sample * w / (sampleCount - 1);
          const freq = xToFreq(px, w);
          const db = evaluateBiquadDb(coef, freq, Fs) * multiplier;
          const y = dbToY(db, h);
          if (sample === 0) ctx.moveTo(px, y);
          else ctx.lineTo(px, y);
        }

        ctx.strokeStyle = color + (isHighlighted ? 'cc' : '55');
        ctx.lineWidth = isHighlighted ? 2.0 : 1.2;
        if (isHighlighted) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 6;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      });
    }

    const activeList = activeBands.filter(b => b.coef);

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(124, 77, 255, 0.6)';
    ctx.shadowBlur = 8;

    const sampleCount = Math.max(2, Math.round(w * renderQuality));
    for (let sample = 0; sample < sampleCount; sample++) {
      const px = sample * w / (sampleCount - 1);
      const freq = xToFreq(px, w);
      let totalDb = 0;

      for (let i = 0; i < activeList.length; i++) {
        totalDb += evaluateBiquadDb(activeList[i].coef, freq, Fs) * activeList[i].multiplier;
      }

      const y = dbToY(totalDb, h);
      if (sample === 0) {
        ctx.moveTo(px, y);
      } else {
        ctx.lineTo(px, y);
      }
    }

    ctx.stroke();
    ctx.shadowBlur = 0;

    if (bands.length > 0) {
      ctx.lineTo(w, dbToY(0, h));
      ctx.lineTo(0, dbToY(0, h));
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(124, 77, 255, 0.09)');
      grad.addColorStop(0.5, 'rgba(79, 195, 247, 0.04)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  function drawBandNodes(ctx, w, h) {
    bands.forEach((band, i) => {
      if (!band.enabled) return;

      const x = freqToX(band.frequency, w);
      let displayGain = band.gain;
      if (band.type === 'highpass' || band.type === 'lowpass') {
        displayGain = 0;
      }
      const y = dbToY(displayGain, h);
      const isSelected = (i === activeBandIndex);
      // EDIT: HUDホバー・数値編集中も対象ノードをハイライト状態にする
      const isHovered = (i === hoveredBandIndex || ((isHudHovered || isHudEditing) && i === activeHudBandIndex));
      const radius = (isSelected || isHovered) ? 8.5 : 6.5;
      const color = COLOR_PALETTE[i % COLOR_PALETTE.length];

      // 1. 外枠リング (選択・ホバー時)
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // 2. メインノード本体
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // 3. インナーダークサークル
      ctx.beginPath();
      ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
      ctx.fillStyle = '#14171d';
      ctx.fill();

      // 4. ノード番号 (等幅系でクッキリ)
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 8.5px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i + 1, x, y);
    });
  }

  // ============================================================
  // EDIT: 座標変換 & ユーティリティ
  // ============================================================

  function freqToX(freq, w) {
    const minLog = Math.log10(20);
    const maxLog = Math.log10(20000);
    return ((Math.log10(freq) - minLog) / (maxLog - minLog)) * w;
  }

  function xToFreq(x, w) {
    const minLog = Math.log10(20);
    const maxLog = Math.log10(20000);
    const log = minLog + (x / w) * (maxLog - minLog);
    return Math.pow(10, log);
  }

  function dbToY(db, h) {
    return h / 2 - (db / DB_RANGE) * (h / 2);
  }

  function yToDb(y, h) {
    return -((y - h / 2) / (h / 2)) * DB_RANGE;
  }

  function findBandAtPosition(x, y) {
    const w = canvas.clientWidth || (isMiniMode ? MINI_WIDTH : FULL_WIDTH);
    const h = canvas.clientHeight || (isMiniMode ? MINI_HEIGHT : (FULL_HEIGHT - HEADER_HEIGHT));
    let closest = -1;
    let closestDist = 20;

    bands.forEach((band, i) => {
      if (!band.enabled) return;
      const bx = freqToX(band.frequency, w);
      let displayGain = band.gain;
      if (band.type === 'highpass' || band.type === 'lowpass') displayGain = 0;
      const by = dbToY(displayGain, h);
      const dist = Math.hypot(x - bx, y - by);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });

    return closest;
  }

  // ============================================================
  // EDIT: ウインドウ表示制御
  // ============================================================

  function showEQWindow() {
    isVisible = true;
    eqWindow.style.display = 'flex';
    updateWindowMode();
    updateWindowPosition();
    startRenderLoop();
  }

  function hideEQWindow() {
    isVisible = false;
    eqWindow.style.display = 'none';
    stopRenderLoop();
    hideHud();
    if (tabId) {
      chrome.runtime.sendMessage({ type: 'STOP_SPECTRUM', tabId });
    }
  }

  function updateWindowMode() {
    // 幅が変わっても右上を固定する。ミニ→通常、通常→ミニのどちらも同じ基点。
    const currentWidth = eqWindow.getBoundingClientRect().width || (isMiniMode ? FULL_WIDTH : MINI_WIDTH);
    const rightEdge = winX + currentWidth;
    const nextWidth = isMiniMode ? MINI_WIDTH : FULL_WIDTH;
    winX = rightEdge - nextWidth;

    if (isMiniMode) {
      eqWindow.classList.add('mini');
      eqWindow.style.width = MINI_WIDTH + 'px';
      eqWindow.style.height = MINI_HEIGHT + 'px';
      hideHud();
    } else {
      eqWindow.classList.remove('mini');
      eqWindow.style.width = FULL_WIDTH + 'px';
      eqWindow.style.height = FULL_HEIGHT + 'px';
    }
    shadow.getElementById('mqMini').textContent = isMiniMode ? '▢' : '▬';
    updateWindowPosition();
  }

  function updateWindowPosition() {
    eqWindow.style.left = winX + 'px';
    eqWindow.style.top = winY + 'px';
  }

  function dispatchEQParams(params) {
    if (!tabId) return;
    if (params.bands) lastBandUpdateAt = Date.now();
    chrome.runtime.sendMessage({
      type: 'UPDATE_EQ_PARAMS',
      tabId,
      params
    });
  }

  function flushPendingBandUpdate() {
    if (!pendingBandUpdate) return;
    clearTimeout(pendingBandUpdate);
    pendingBandUpdate = null;
    dispatchEQParams({ bands, inputGain, outputGain });
  }

  function sendEQParams(params, deferBandUpdate = false) {
    if (!tabId) return;
    if (deferBandUpdate && params.bands) {
      if (pendingBandUpdate) return;
      const delay = Math.max(0, BAND_UPDATE_INTERVAL_MS - (Date.now() - lastBandUpdateAt));
      pendingBandUpdate = setTimeout(() => {
        pendingBandUpdate = null;
        dispatchEQParams({ bands, inputGain, outputGain });
      }, delay);
      return;
    }
    flushPendingBandUpdate();
    dispatchEQParams(params);
  }

  function formatFreq(freq) {
    if (freq >= 1000) {
      return (freq / 1000).toFixed(freq >= 10000 ? 0 : 1) + 'k';
    }
    return Math.round(freq).toString();
  }

})();
