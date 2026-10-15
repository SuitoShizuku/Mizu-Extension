// EDIT: YouTubeBackur - content.js
(() => {
  // EDIT: デフォルト設定値
  const DEFAULT_CONFIG = {
    enabled: true,
    blur: 40,        // 0～128px
    brightness: 70,  // 0～100%
    opacity: 85      // 0～100%
  };

  let currentConfig = { ...DEFAULT_CONFIG };

  // EDIT: 軽量化のためのCanvas解像度 (低解像度でキャプチャしCSSで拡大・ブラーをかけることでGPU/メモリ負荷を最小化)
  const CANVAS_WIDTH = 320;
  const CANVAS_HEIGHT = 180;
  const TARGET_FPS = 30;
  const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

  let containerEl = null;
  let canvasEl = null;
  let ctx = null;
  let videoEl = null;
  let renderLoopId = null;
  let useVideoFrameCallback = false;
  let lastFrameTime = 0;
  let isWatching = false;

  // EDIT: 設定の読み込みとストレージ変更監視
  function initConfig() {
    chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
      if (chrome.runtime.lastError) {
        chrome.storage.local.get(DEFAULT_CONFIG, (localItems) => {
          currentConfig = { ...DEFAULT_CONFIG, ...localItems };
          applyConfigStyles();
        });
      } else {
        currentConfig = { ...DEFAULT_CONFIG, ...items };
        applyConfigStyles();
      }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' || areaName === 'local') {
        for (const [key, change] of Object.entries(changes)) {
          if (key in currentConfig) {
            currentConfig[key] = change.newValue;
          }
        }
        applyConfigStyles();
        checkPageStatus();
      }
    });
  }

  // EDIT: CanvasとコンテナのDOM構築 (body直下に確実に配置)
  function createDOMElements() {
    if (!document.body) return;

    if (document.getElementById('yt-backur-container')) {
      containerEl = document.getElementById('yt-backur-container');
      canvasEl = document.getElementById('yt-backur-canvas');
      if (canvasEl && !ctx) {
        ctx = canvasEl.getContext('2d');
      }
      return;
    }

    containerEl = document.createElement('div');
    containerEl.id = 'yt-backur-container';

    canvasEl = document.createElement('canvas');
    canvasEl.id = 'yt-backur-canvas';
    canvasEl.width = CANVAS_WIDTH;
    canvasEl.height = CANVAS_HEIGHT;

    // EDIT: 互換性と描画安定性を最優先した2Dコンテキスト取得
    ctx = canvasEl.getContext('2d');

    containerEl.appendChild(canvasEl);
    document.body.prepend(containerEl);
  }

  // EDIT: CSSフィルタと不透明度の動的適用
  function applyConfigStyles() {
    if (!canvasEl) return;
    const { blur, brightness, opacity } = currentConfig;
    canvasEl.style.filter = `blur(${blur}px) brightness(${brightness}%)`;
    canvasEl.style.opacity = `${opacity / 100}`;
  }

  // EDIT: 現在のページが通常プレイヤー再生中かどうかの判定
  function isNormalPlayerActive() {
    // watchページ以外・ショート動画・埋め込み等は対象外
    if (!location.pathname.startsWith('/watch')) {
      return false;
    }

    // フルスクリーン判定
    const isFullscreen = !!(document.fullscreenElement || document.querySelector('.ytp-fullscreen'));
    if (isFullscreen) {
      document.documentElement.classList.add('yt-backur-fullscreen');
      document.body.classList.add('yt-backur-fullscreen');
      return false;
    } else {
      document.documentElement.classList.remove('yt-backur-fullscreen');
      document.body.classList.remove('yt-backur-fullscreen');
    }

    return true;
  }

  // EDIT: 1フレームの描画処理 (超低解像度Canvasへ描画)
  function renderFrame(now) {
    if (!videoEl || videoEl.paused || videoEl.ended || document.hidden) {
      return;
    }

    // EDIT: 最大FPS制限によるGPU負荷低減
    if (!now || now - lastFrameTime >= FRAME_INTERVAL_MS) {
      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        if (!ctx && canvasEl) {
          ctx = canvasEl.getContext('2d');
        }
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          lastFrameTime = now || performance.now();
        }
      }
    }
  }

  // EDIT: レンダリングループの開始
  function startRenderLoop() {
    stopRenderLoop();
    if (!currentConfig.enabled || !isNormalPlayerActive() || !videoEl) {
      return;
    }

    isWatching = true;

    // 初回1フレーム描画
    renderFrame(performance.now());

    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype && typeof videoEl.requestVideoFrameCallback === 'function') {
      useVideoFrameCallback = true;
      const callback = (now, metadata) => {
        if (!isWatching) return;
        renderFrame(now);
        renderLoopId = videoEl.requestVideoFrameCallback(callback);
      };
      renderLoopId = videoEl.requestVideoFrameCallback(callback);
    } else {
      useVideoFrameCallback = false;
      const loop = (now) => {
        if (!isWatching) return;
        renderFrame(now);
        renderLoopId = requestAnimationFrame(loop);
      };
      renderLoopId = requestAnimationFrame(loop);
    }
  }

  // EDIT: レンダリングループの停止 (一時停止や非表示時のCPU/GPU消費ゼロ化)
  function stopRenderLoop() {
    isWatching = false;
    if (renderLoopId !== null) {
      if (useVideoFrameCallback && videoEl && typeof videoEl.cancelVideoFrameCallback === 'function') {
        videoEl.cancelVideoFrameCallback(renderLoopId);
      } else {
        cancelAnimationFrame(renderLoopId);
      }
      renderLoopId = null;
    }
  }

  // EDIT: 最適な動画要素を確実に検索
  function findMainVideo() {
    return document.querySelector('video.video-stream.html5-main-video') ||
           document.querySelector('video.html5-main-video') ||
           document.querySelector('#movie_player video') ||
           document.querySelector('ytd-watch-flexy video') ||
           document.querySelector('ytd-watch-grid video') ||
           document.querySelector('video');
  }

  // EDIT: 動画要素の取得とイベントリスナーの登録
  function bindVideoElement() {
    const newVideo = findMainVideo();
    if (!newVideo) return;

    if (newVideo === videoEl) {
      if (!videoEl.paused && !videoEl.ended && !isWatching) {
        startRenderLoop();
      }
      return;
    }

    if (videoEl) {
      videoEl.removeEventListener('play', onVideoPlay);
      videoEl.removeEventListener('playing', onVideoPlay);
      videoEl.removeEventListener('pause', onVideoPause);
      videoEl.removeEventListener('ended', onVideoPause);
      videoEl.removeEventListener('seeked', onVideoSeeked);
      videoEl.removeEventListener('timeupdate', onVideoTimeUpdate);
    }

    videoEl = newVideo;

    videoEl.addEventListener('play', onVideoPlay);
    videoEl.addEventListener('playing', onVideoPlay);
    videoEl.addEventListener('pause', onVideoPause);
    videoEl.addEventListener('ended', onVideoPause);
    videoEl.addEventListener('seeked', onVideoSeeked);
    videoEl.addEventListener('timeupdate', onVideoTimeUpdate);

    if (!videoEl.paused && !videoEl.ended) {
      startRenderLoop();
    } else {
      renderFrame(performance.now());
    }
  }

  function onVideoPlay() {
    if (currentConfig.enabled && isNormalPlayerActive()) {
      startRenderLoop();
    }
  }

  function onVideoPause() {
    stopRenderLoop();
  }

  function onVideoSeeked() {
    renderFrame(performance.now());
  }

  function onVideoTimeUpdate() {
    // 描画ループが何らかの理由で停止していた場合の自己修復
    if (currentConfig.enabled && isNormalPlayerActive() && videoEl && !videoEl.paused && !isWatching) {
      startRenderLoop();
    }
  }

  // EDIT: 状態のチェックとクラス適用 (htmlおよびbody双方に付与して背景透過を徹底)
  function checkPageStatus() {
    createDOMElements();

    const isNormal = isNormalPlayerActive();
    const shouldBeActive = currentConfig.enabled && isNormal;

    if (shouldBeActive) {
      document.documentElement.classList.add('yt-backur-active');
      document.body.classList.add('yt-backur-active');
      applyConfigStyles();
      bindVideoElement();

      if (videoEl && !videoEl.paused && !videoEl.ended) {
        startRenderLoop();
      } else {
        renderFrame(performance.now());
      }
    } else {
      document.documentElement.classList.remove('yt-backur-active');
      document.body.classList.remove('yt-backur-active');
      stopRenderLoop();
    }
  }

  // EDIT: イベントハンドラー登録
  document.addEventListener('fullscreenchange', checkPageStatus);
  document.addEventListener('webkitfullscreenchange', checkPageStatus);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopRenderLoop();
    } else {
      checkPageStatus();
    }
  });

  // EDIT: YouTubeのSPA遷移イベント (yt-navigate-finish) を監視
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(checkPageStatus, 100);
    setTimeout(checkPageStatus, 500);
  });

  // EDIT: 定期的な死活監視 (SPA遷移や広告切り替え時の復旧用)
  setInterval(() => {
    if (currentConfig.enabled && isNormalPlayerActive()) {
      if (!containerEl || !document.getElementById('yt-backur-container')) {
        createDOMElements();
      }
      bindVideoElement();
      if (videoEl && !videoEl.paused && !isWatching) {
        startRenderLoop();
      }
    }
  }, 1000);

  // EDIT: ページ初期化
  function init() {
    createDOMElements();
    initConfig();

    const observer = new MutationObserver(() => {
      if (!containerEl || !document.getElementById('yt-backur-container')) {
        createDOMElements();
      }
      if (!videoEl || !isWatching) {
        bindVideoElement();
      }
      checkPageStatus();
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    checkPageStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
