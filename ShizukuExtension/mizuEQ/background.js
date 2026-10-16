/* ============================================================
 * EDIT: mizu-q Background Service Worker
 * EDIT: tabCapture、Offscreen Document管理、確実な同期
 * ============================================================ */

// EQセッション。starting 中は、音声エンジンの準備完了通知を待つ。
const activeSessions = new Map();
const DEFAULT_URL_PATTERNS = ['https://www.youtube.com/watch?v=*'];
let offscreenCreationPromise = null;

function isCaptureableUrl(url) {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:' || protocol === 'file:';
  } catch (e) {
    return false;
  }
}

function wildcardToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesAnyPattern(url, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return false;
  return patterns.some(pattern => {
    try {
      return wildcardToRegex(String(pattern).trim()).test(url);
    } catch (e) {
      return false;
    }
  });
}

// EDIT: Offscreen Documentの作成
async function ensureOffscreen() {
  if (!offscreenCreationPromise) {
    offscreenCreationPromise = (async () => {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });
      if (contexts.length === 0) {
        try {
          await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Tab audio capture and EQ processing'
          });
        } catch (e) {
          // Service Worker の別イベントが先に作成を完了した場合は、その文書を再利用する。
          if (!String(e?.message || e).includes('single offscreen document')) throw e;
        }
      }

      // Document 作成直後は offscreen.js のメッセージリスナーがまだ準備中の場合がある。
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          const response = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_PING' });
          if (response?.ready) return;
        } catch (e) {}
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Offscreen audio engine is not ready');
    })().finally(() => {
      offscreenCreationPromise = null;
    });
  }
  await offscreenCreationPromise;
  const { mizuEQ_eqRenderQuality } = await chrome.storage.local.get(['mizuEQ_eqRenderQuality']);
  const requestedQuality = Number(mizuEQ_eqRenderQuality);
  const eqRenderQuality = [8, 16].includes(requestedQuality) ? requestedQuality : 8;
  chrome.runtime.sendMessage({ type: 'SET_RENDER_QUALITY', quality: eqRenderQuality }).catch(() => {});
}

async function syncSessionFromOffscreen(tabId) {
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length === 0) return null;

    const status = await chrome.runtime.sendMessage({ type: 'GET_CAPTURE_STATUS', tabId });
    if (!status?.active && !status?.starting) return null;
    const session = {
      active: status.active === true,
      starting: status.starting === true,
      powered: status.powered !== false
    };
    activeSessions.set(tabId, session);
    return session;
  } catch (e) {
    return null;
  }
}

// EDIT: タブの音声キャプチャを開始
function requestTabStreamId(tabId) {
  // Promise rejectionを値に変換し、開始セッションの復元時に未処理拒否を残さない。
  return chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }).then(
    streamId => ({ streamId }),
    error => ({ error })
  );
}

async function startCapture(tabId, streamIdResultPromise = null) {
  let existingSession = activeSessions.get(tabId);
  if (existingSession) {
    // 既にアクティブな場合はContent Scriptに表示メッセージを再送
    try {
      if (existingSession.active) {
        chrome.tabs.sendMessage(tabId, {
          type: 'EQ_ACTIVATED',
          tabId: tabId,
          powered: existingSession.powered !== false
        });
      }
    } catch (e) {}
    return;
  }

  // 非同期処理に入る前に予約し、同じタブへの重複開始を防止する。
  const reservation = { active: false, starting: true, powered: true };
  activeSessions.set(tabId, reservation);

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isCaptureableUrl(tab?.url)) {
      if (activeSessions.get(tabId) === reservation) activeSessions.delete(tabId);
      return;
    }

    await ensureOffscreen();

    // Service Worker が再起動しても Offscreen Document の既存セッションは残る。
    // 新しいストリームを要求せず、そのセッションを復元する。
    const restoredSession = await syncSessionFromOffscreen(tabId);
    if (restoredSession) {
      if (restoredSession.active) {
        chrome.tabs.sendMessage(tabId, {
          type: 'EQ_ACTIVATED',
          tabId,
          powered: restoredSession.powered !== false
        }).catch(() => {});
      }
      return;
    }

    // 待機中に OFF にされた場合は開始しない。
    if (activeSessions.get(tabId) !== reservation) return;

    const streamIdResult = await (streamIdResultPromise || requestTabStreamId(tabId));
    if (streamIdResult.error) throw streamIdResult.error;
    const { streamId } = streamIdResult;

    if (activeSessions.get(tabId) !== reservation) return;

    // getMediaStreamId の取得だけでは音声処理はまだ開始していない。
    // Offscreen Document から CAPTURE_READY を受けて初めて active にする。
    reservation.streamId = streamId;

    // EDIT: Offscreen Documentにキャプチャ開始を通知
    chrome.runtime.sendMessage({
      type: 'START_CAPTURE',
      tabId: tabId,
      streamId: streamId
    });

  } catch (e) {
    // この開始処理自身が所有している予約だけを破棄する。
    if (activeSessions.get(tabId) === reservation) activeSessions.delete(tabId);
    console.error('mizu-q: Capture failed:', e);
    chrome.tabs.sendMessage(tabId, { type: 'EQ_ERROR', error: e.message }).catch(() => {});
    throw e;
  }
}

// EDIT: タブの音声キャプチャを停止
async function stopCapture(tabId) {
  if (!activeSessions.has(tabId)) await syncSessionFromOffscreen(tabId);
  if (!activeSessions.has(tabId)) return;

  activeSessions.delete(tabId);

  // EDIT: Offscreen Documentにキャプチャ停止を通知
  await chrome.runtime.sendMessage({
    type: 'STOP_CAPTURE',
    tabId: tabId
  });

  // EDIT: Content Scriptに非表示を通知
  try {
    chrome.tabs.sendMessage(tabId, {
      type: 'EQ_DEACTIVATED',
      tabId: tabId
    }).catch(() => {});
  } catch (e) {}
}

// EDIT: メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PREPARE_EQ') {
    ensureOffscreen()
      .then(() => sendResponse({ ready: true }))
      .catch(error => sendResponse({ ready: false, error: error.message }));
    return true;
  }

  if (message.type === 'TOGGLE_EQ') {
    const tabId = message.tabId || sender.tab?.id;
    if (!tabId) {
      sendResponse({ active: false, starting: false, enabled: false, error: 'タブIDを取得できませんでした' });
      return false;
    }
    const knownSession = activeSessions.get(tabId);
    if (knownSession?.active || message.captureActive === true) {
      (async () => {
        const session = knownSession || await syncSessionFromOffscreen(tabId);
        if (session?.active) {
          session.powered = !session.powered;
          chrome.runtime.sendMessage({
            type: 'SET_EQ_BYPASS',
            tabId,
            bypass: !session.powered
          });
          chrome.tabs.sendMessage(tabId, {
            type: 'EQ_POWER_CHANGED',
            powered: session.powered
          }).catch(() => {});
          sendResponse({ active: session.powered, capturing: true, starting: false, enabled: session.powered, tabId });
        } else {
          sendResponse({ active: false, capturing: false, starting: false, enabled: false, error: 'Capture session is not active', tabId });
        }
      })().catch((e) => sendResponse({ active: false, capturing: false, starting: false, enabled: false, error: e.message, tabId }));
    } else if (knownSession?.starting) {
      stopCapture(tabId)
        .then(() => sendResponse({ active: false, capturing: false, starting: false, enabled: false, tabId }))
        .catch(e => sendResponse({ active: false, capturing: false, starting: false, enabled: false, error: e.message, tabId }));
      return true;
    } else {
      // クリックジェスチャーを保つため、状態確認やOffscreen準備をawaitする前にIDを要求する。
      const streamIdResultPromise = requestTabStreamId(tabId);
      startCapture(tabId, streamIdResultPromise).then(() => {
        const createdSession = activeSessions.get(tabId);
        sendResponse({
          active: createdSession?.active === true,
          capturing: createdSession?.active === true || createdSession?.starting === true,
          starting: createdSession?.starting === true,
          enabled: createdSession?.active === true || createdSession?.starting === true,
          tabId
        });
      }).catch(e => sendResponse({ active: false, capturing: false, starting: false, enabled: false, error: e.message, tabId }));
    }
    return true;
  }

  if (message.type === 'GET_STATUS') {
    const tabId = message.tabId;
    (async () => {
      const session = activeSessions.get(tabId) || await syncSessionFromOffscreen(tabId);
      sendResponse({
        active: session?.active === true && session?.powered !== false,
        capturing: session?.active === true,
        starting: session?.starting === true,
        powered: session?.powered !== false,
        tabId
      });
    })();
    return true;
  }

  // 閉じた EQ ウィンドウを、現在有効なタブで再表示する。
  if (message.type === 'SHOW_EQ_WINDOW') {
    const tabId = message.tabId;
    (async () => {
      const session = activeSessions.get(tabId) || await syncSessionFromOffscreen(tabId);
      if (session?.active && session.powered !== false) {
        chrome.tabs.sendMessage(tabId, { type: 'SHOW_EQ_WINDOW', tabId }).catch(() => {});
        sendResponse({ shown: true });
      } else {
        sendResponse({ shown: false });
      }
    })();
    return true;
  }

  if (message.type === 'QUERY_TAB_STATUS') {
    const tabId = sender.tab ? sender.tab.id : null;
    (async () => {
      const session = tabId
        ? (activeSessions.get(tabId) || await syncSessionFromOffscreen(tabId))
        : null;
      sendResponse({
        active: session?.active === true,
        powered: session?.powered !== false,
        tabId
      });
    })();
    return true;
  }

  if (message.type === 'CHECK_URL_MATCH') {
    chrome.storage.local.get(['mizuEQ_urlPatterns'], result => {
      const patterns = result.mizuEQ_urlPatterns ?? DEFAULT_URL_PATTERNS;
      sendResponse({ matches: matchesAnyPattern(message.url, patterns) });
    });
    return true;
  }

  if (message.type === 'UPDATE_EQ_PARAMS') {
    chrome.runtime.sendMessage({
      type: 'SET_EQ_PARAMS',
      tabId: message.tabId,
      params: message.params
    });
    return false;
  }

  if (message.type === 'RENDER_QUALITY_CHANGED') {
    const requestedQuality = Number(message.quality);
    const quality = [8, 16].includes(requestedQuality) ? requestedQuality : 8;
    chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
      .then(contexts => contexts.length
        ? chrome.runtime.sendMessage({ type: 'SET_RENDER_QUALITY', quality })
        : null)
      .then(() => sendResponse({ updated: true }))
      .catch(error => sendResponse({ updated: false, error: error.message }));
    return true;
  }

  // Offscreen Document が音声ノードを作成してから UI を開く。
  if (message.type === 'CAPTURE_READY') {
    const session = activeSessions.get(message.tabId);
    if (session) {
      session.active = true;
      session.starting = false;
      session.powered = message.powered !== false;
      chrome.tabs.sendMessage(message.tabId, {
        type: 'EQ_ACTIVATED',
        tabId: message.tabId,
        powered: session.powered
      }).catch(() => {});
    } else {
      // 準備中に OFF になった場合、遅れて作られた音声セッションを回収する。
      chrome.runtime.sendMessage({ type: 'STOP_CAPTURE', tabId: message.tabId });
    }
    return false;
  }

  if (message.type === 'CAPTURE_FAILED') {
    activeSessions.delete(message.tabId);
    chrome.tabs.sendMessage(message.tabId, { type: 'EQ_ERROR', error: message.error }).catch(() => {});
    return false;
  }

  if (message.type === 'SPECTRUM_DATA') {
    const tabId = message.tabId;
    try {
      chrome.tabs.sendMessage(tabId, {
        type: 'SPECTRUM_UPDATE',
        data: message.data
      }).catch(() => {});
    } catch (e) {}
    return false;
  }

  if (message.type === 'REQUEST_SPECTRUM') {
    chrome.runtime.sendMessage({
      type: 'START_SPECTRUM_STREAM',
      tabId: message.tabId
    });
    return false;
  }

  if (message.type === 'STOP_SPECTRUM') {
    chrome.runtime.sendMessage({
      type: 'STOP_SPECTRUM_STREAM',
      tabId: message.tabId
    });
    return false;
  }
});

// EDIT: タブが閉じられたときにセッションをクリーンアップ
chrome.tabs.onRemoved.addListener((tabId) => {
  stopCapture(tabId).catch(() => {});
});

