/* ============================================================
 * ADD: mizu-q Offscreen Document - Audio Engine
 * ADD: Web Audio APIによるパラメトリックEQ処理 & スペクトラム解析
 * ============================================================ */

// EDIT: タブごとのオーディオセッション
const audioSessions = new Map();
const captureStartPromises = new Map();
const cancelledCaptureTabs = new Set();
let spectrumRenderQuality = 8;

// EDIT: デフォルトEQバンド設定 (初期状態は0個)
const DEFAULT_BANDS = [];
const LIMITER_CEILING_DB = -0.3;
const LIMITER_ATTACK_SECONDS = 0;
const LIMITER_RELEASE_SECONDS = 0.06;
const FILTER_CROSSFADE_SECONDS = 0.02;
const FILTER_PARAM_TIME_CONSTANT = 0.015;

function isCutBand(band) {
  return band.type === 'highpass' || band.type === 'lowpass';
}

function isShelfBand(band) {
  return band.type === 'lowshelf' || band.type === 'highshelf';
}

function filterTopologyKey(bands) {
  return JSON.stringify(bands.map((band) => ({
    type: band.type,
    enabled: band.enabled === true,
    slope: isCutBand(band) ? (band.slope || 12) : null
  })));
}

function sameShelfParameters(previousBands, nextBands) {
  for (let i = 0; i < nextBands.length; i++) {
    const next = nextBands[i];
    if (!next.enabled || !isShelfBand(next)) continue;
    const previous = previousBands[i];
    if (!previous || previous.type !== next.type || previous.enabled !== next.enabled) return false;
    if (previous.frequency !== next.frequency || previous.gain !== next.gain || previous.Q !== next.Q) return false;
  }
  return true;
}

function canUpdateFilterChainInPlace(chain, bands) {
  return chain.topologyKey === filterTopologyKey(bands)
    && sameShelfParameters(chain.bands, bands);
}

function scheduleFilterParam(param, value, now) {
  if (!Number.isFinite(value)) return;
  param.setTargetAtTime(value, now, FILTER_PARAM_TIME_CONSTANT);
}

function updateFilterChainParameters(session, chain, bands) {
  const now = session.audioContext.currentTime;
  bands.forEach((band, index) => {
    if (!band.enabled || isShelfBand(band)) return;

    const bandNodes = chain.bandNodes[index];
    if (!bandNodes) return;
    const frequency = Math.max(20, Math.min(20000, band.frequency));
    const gain = isCutBand(band) ? 0 : Math.max(-24, Math.min(24, band.gain || 0));

    bandNodes.filters.forEach((filter) => {
      scheduleFilterParam(filter.frequency, frequency, now);
      if (!isCutBand(band)) {
        scheduleFilterParam(filter.Q, Math.max(0.1, Math.min(18, band.Q || 1.0)), now);
        scheduleFilterParam(filter.gain, gain, now);
      }
    });
  });

  chain.bands = JSON.parse(JSON.stringify(bands));
}

function createFilterChain(session, bands) {
  const { audioContext, preAnalyser, preLimiterAnalyser } = session;
  const input = audioContext.createGain();
  const output = audioContext.createGain();
  output.gain.value = 0;
  const chain = {
    input,
    output,
    filters: [],
    nodes: [input, output],
    bandNodes: [],
    bands: JSON.parse(JSON.stringify(bands)),
    topologyKey: filterTopologyKey(bands),
    fadeStart: 0,
    fadeEnd: 0,
    fadeFrom: 0,
    fadeTo: 0,
    cleanupTimer: null
  };

  preAnalyser.connect(input);
  let previousNode = input;

  bands.forEach((band) => {
    if (!band.enabled) {
      chain.bandNodes.push({ type: band.type, filters: [] });
      return;
    }

    const freq = Math.max(20, Math.min(20000, band.frequency));
    const gain = (band.type === 'highpass' || band.type === 'lowpass') ? 0 : Math.max(-24, Math.min(24, band.gain || 0));
    const bandFilters = [];

    if (isCutBand(band)) {
      const slopeDb = band.slope || 12; // 6, 12, 24, 36, 48 dB/oct
      const stages = Math.max(1, Math.round(slopeDb / 12));
      const qVal = stages === 1 && slopeDb === 6 ? 0.5 : 0.707;

      for (let s = 0; s < stages; s++) {
        const filter = audioContext.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = freq;
        filter.Q.value = qVal;
        bandFilters.push(filter);
      }
    } else if (isShelfBand(band)) {
      // Web Audio の BiquadFilterNode は Shelf の Q を反映しないため、
      // RBJ の shelf-slope (S) を Q から導いた IIR フィルターを使う。
      const coefficients = getShelfCoefficients(band, audioContext.sampleRate);
      const filter = audioContext.createIIRFilter(coefficients.feedforward, coefficients.feedback);
      bandFilters.push(filter);
    } else {
      const filter = audioContext.createBiquadFilter();
      filter.type = band.type;
      filter.frequency.value = freq;
      filter.Q.value = Math.max(0.1, Math.min(18, band.Q || 1.0));
      filter.gain.value = gain;
      bandFilters.push(filter);
    }

    bandFilters.forEach((filter) => {
      previousNode.connect(filter);
      previousNode = filter;
      chain.filters.push(filter);
      chain.nodes.push(filter);
    });
    chain.bandNodes.push({ type: band.type, filters: bandFilters });
  });

  previousNode.connect(output);
  output.connect(preLimiterAnalyser);
  return chain;
}

function disposeFilterChain(session, chain) {
  if (!chain) return;
  if (chain.cleanupTimer) clearTimeout(chain.cleanupTimer);
  chain.nodes.forEach(node => node.disconnect());
  session.filterChains.delete(chain);
}

function getScheduledChainGain(chain, now) {
  if (chain.fadeEnd <= now || chain.fadeEnd <= chain.fadeStart) return chain.fadeTo;
  const progress = Math.max(0, Math.min(1, (now - chain.fadeStart) / (chain.fadeEnd - chain.fadeStart)));
  return chain.fadeFrom + (chain.fadeTo - chain.fadeFrom) * progress;
}

function scheduleChainGain(chain, target, now) {
  const current = getScheduledChainGain(chain, now);
  const end = now + FILTER_CROSSFADE_SECONDS;
  const gain = chain.output.gain;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(current, now);
  gain.linearRampToValueAtTime(target, end);
  chain.fadeStart = now;
  chain.fadeEnd = end;
  chain.fadeFrom = current;
  chain.fadeTo = target;
}

// フィルター構成変更時は新旧チェーンを短くクロスフェードし、音声経路を切断しない。
function replaceFilterNodes(session, bands) {
  const nextChain = createFilterChain(session, bands);
  const now = session.audioContext.currentTime;
  const previousChains = [...session.filterChains];
  session.filterChains.add(nextChain);
  session.filterChain = nextChain;

  if (previousChains.length === 0) {
    nextChain.output.gain.setValueAtTime(1, now);
    nextChain.fadeFrom = 1;
    nextChain.fadeTo = 1;
    return;
  }

  previousChains.forEach((chain) => {
    if (chain.cleanupTimer) clearTimeout(chain.cleanupTimer);
    scheduleChainGain(chain, 0, now);
    chain.cleanupTimer = setTimeout(() => disposeFilterChain(session, chain), (FILTER_CROSSFADE_SECONDS + 0.02) * 1000);
  });
  scheduleChainGain(nextChain, 1, now);
}

function getShelfCoefficients(band, sampleRate) {
  const frequency = Math.max(20, Math.min(20000, band.frequency));
  const gain = Math.max(-24, Math.min(24, band.gain || 0));
  // Q を大きくするほど遷移を急にする。極端な値による不安定化は抑える。
  const slope = Math.max(0.1, Math.min(1.5, band.Q || 1));
  const A = Math.pow(10, gain / 40);
  const w0 = 2 * Math.PI * frequency / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = (sinW0 / 2) * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2);
  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
  let b0, b1, b2, a0, a1, a2;

  if (band.type === 'lowshelf') {
    b0 = A * ((A + 1) - (A - 1) * cosW0 + twoSqrtAAlpha);
    b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
    b2 = A * ((A + 1) - (A - 1) * cosW0 - twoSqrtAAlpha);
    a0 = (A + 1) + (A - 1) * cosW0 + twoSqrtAAlpha;
    a1 = -2 * ((A - 1) + (A + 1) * cosW0);
    a2 = (A + 1) + (A - 1) * cosW0 - twoSqrtAAlpha;
  } else {
    b0 = A * ((A + 1) + (A - 1) * cosW0 + twoSqrtAAlpha);
    b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
    b2 = A * ((A + 1) + (A - 1) * cosW0 - twoSqrtAAlpha);
    a0 = (A + 1) - (A - 1) * cosW0 + twoSqrtAAlpha;
    a1 = 2 * ((A - 1) - (A + 1) * cosW0);
    a2 = (A + 1) - (A - 1) * cosW0 - twoSqrtAAlpha;
  }

  return {
    feedforward: [b0 / a0, b1 / a0, b2 / a0],
    feedback: [1, a1 / a0, a2 / a0]
  };
}

function updateLimiterRouting(session) {
  session.preLimiterAnalyser.disconnect();
  session.limiter.disconnect();
  session.ceilingGain.disconnect();
  session.ceilingShaper.disconnect();

  if (session.limiterEnabled && !session.bypassed) {
    session.preLimiterAnalyser.connect(session.limiter);
    session.limiter.connect(session.ceilingGain);
    session.ceilingGain.connect(session.ceilingShaper);
    session.ceilingShaper.connect(session.outputGain);
  } else {
    session.preLimiterAnalyser.connect(session.outputGain);
  }
}

// EDIT: EQフィルターチェインを初期構築
function createEQChain(audioContext, source, initialBands) {
  const inputGain = audioContext.createGain();
  inputGain.gain.value = 1.0;
  const outputGain = audioContext.createGain();
  outputGain.gain.value = 1.0;
  const preLimiterAnalyser = audioContext.createAnalyser();
  preLimiterAnalyser.fftSize = 2048;
  const limiter = audioContext.createDynamicsCompressor();
  limiter.threshold.value = -2.0;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = LIMITER_ATTACK_SECONDS;
  limiter.release.value = LIMITER_RELEASE_SECONDS;
  const ceilingGain = audioContext.createGain();
  ceilingGain.gain.value = Math.pow(10, LIMITER_CEILING_DB / 20);
  const ceilingShaper = audioContext.createWaveShaper();
  const ceilingLinear = Math.pow(10, LIMITER_CEILING_DB / 20);
  const ceilingCurve = new Float32Array(65537);
  for (let i = 0; i < ceilingCurve.length; i++) {
    const sample = (i / (ceilingCurve.length - 1)) * 2 - 1;
    ceilingCurve[i] = Math.max(-ceilingLinear, Math.min(ceilingLinear, sample));
  }
  ceilingShaper.curve = ceilingCurve;
  ceilingShaper.oversample = '4x';

  // EDIT: 高解像度FFT (8192サンプル)
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.65;

  const preAnalyser = audioContext.createAnalyser();
  preAnalyser.fftSize = 8192;
  preAnalyser.smoothingTimeConstant = 0.65;

  source.connect(inputGain);
  inputGain.connect(preAnalyser);
  outputGain.connect(analyser);
  analyser.connect(audioContext.destination);

  const sessionObj = {
    audioContext,
    source,
    inputGain,
    preAnalyser,
    outputGain,
    preLimiterAnalyser,
    limiter,
    ceilingGain,
    ceilingShaper,
    analyser,
    filterChain: null,
    filterChains: new Set(),
    bands: JSON.parse(JSON.stringify(initialBands || DEFAULT_BANDS)),
    bypassed: false,
    inputGainSetting: 1.0,
    outputGainSetting: 1.0,
    limiterEnabled: true,
    limiterThreshold: -2.0,
    levelPeakDb: -96
  };

  replaceFilterNodes(sessionObj, sessionObj.bypassed ? [] : sessionObj.bands);
  updateLimiterRouting(sessionObj);
  return sessionObj;
}

// EDIT: タブ音声のキャプチャを開始
async function startCapture(tabId, streamId) {
  if (audioSessions.has(tabId)) {
    const session = audioSessions.get(tabId);
    chrome.runtime.sendMessage({ type: 'CAPTURE_READY', tabId, powered: !session.bypassed });
    return;
  }
  if (captureStartPromises.has(tabId)) return captureStartPromises.get(tabId);

  cancelledCaptureTabs.delete(tabId);
  let startPromise;
  startPromise = (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        },
        video: false
      });

      if (cancelledCaptureTabs.has(tabId)) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const sessionObj = createEQChain(audioContext, source, DEFAULT_BANDS);

      audioSessions.set(tabId, {
        ...sessionObj,
        stream,
        spectrumInterval: null
      });

      console.log(`mizu-q: Audio capture started for tab ${tabId}`);

      chrome.runtime.sendMessage({ type: 'CAPTURE_READY', tabId, powered: true });

      // EDIT: キャプチャ開始完了後に自動的にスペクトラム送信を開始
      startSpectrumStream(tabId);
    } catch (e) {
      if (!cancelledCaptureTabs.has(tabId)) {
        console.error('mizu-q: Failed to start capture:', e);
        chrome.runtime.sendMessage({ type: 'CAPTURE_FAILED', tabId, error: e.message });
      }
    } finally {
      if (captureStartPromises.get(tabId) === startPromise) {
        captureStartPromises.delete(tabId);
      }
      cancelledCaptureTabs.delete(tabId);
    }
  })();

  captureStartPromises.set(tabId, startPromise);
  return startPromise;
}

// EDIT: キャプチャ停止
async function stopCapture(tabId) {
  const pendingStart = captureStartPromises.get(tabId);
  if (pendingStart) {
    cancelledCaptureTabs.add(tabId);
    await pendingStart;
  }
  const session = audioSessions.get(tabId);
  if (!session) return;

  if (session.spectrumInterval) {
    clearInterval(session.spectrumInterval);
  }

  session.source.disconnect();
  session.inputGain.disconnect();
  [...session.filterChains].forEach(chain => disposeFilterChain(session, chain));
  session.outputGain.disconnect();
  session.preLimiterAnalyser.disconnect();
  session.limiter.disconnect();
  session.ceilingGain.disconnect();
  session.ceilingShaper.disconnect();
  session.analyser.disconnect();
  session.preAnalyser.disconnect();
  session.audioContext.close();

  session.stream.getTracks().forEach(track => track.stop());

  audioSessions.delete(tabId);
  console.log(`mizu-q: Audio capture stopped for tab ${tabId}`);
}

// EDIT: スペクトラムデータのストリーミング開始 (高解像度 1024サンプル転送)
function startSpectrumStream(tabId) {
  const session = audioSessions.get(tabId);
  if (!session) return;

  if (session.spectrumInterval) {
    clearInterval(session.spectrumInterval);
  }

  const bufferLength = session.analyser.frequencyBinCount;
  const postData = new Uint8Array(bufferLength);
  const preData = new Uint8Array(bufferLength);
  const levelData = new Float32Array(session.analyser.fftSize);
  const preLimiterLevelData = new Float32Array(session.preLimiterAnalyser.fftSize);

  session.spectrumInterval = setInterval(() => {
    if (!audioSessions.has(tabId)) return;

    session.analyser.getByteFrequencyData(postData);
    session.preAnalyser.getByteFrequencyData(preData);
    session.analyser.getFloatTimeDomainData(levelData);
    session.preLimiterAnalyser.getFloatTimeDomainData(preLimiterLevelData);

    let peak = 0;
    for (let i = 0; i < levelData.length; i++) {
      peak = Math.max(peak, Math.abs(levelData[i]));
    }
    const instantaneousDb = peak > 1e-8 ? Math.max(-96, 20 * Math.log10(peak)) : -96;
    session.levelPeakDb = Math.max(instantaneousDb, session.levelPeakDb - 0.8);

    let preLimiterPeak = 0;
    for (let i = 0; i < preLimiterLevelData.length; i++) {
      preLimiterPeak = Math.max(preLimiterPeak, Math.abs(preLimiterLevelData[i]));
    }
    const preLimiterPeakDb = preLimiterPeak > 1e-8
      ? Math.max(-96, 20 * Math.log10(preLimiterPeak))
      : -96;

    // EQ描画細度に合わせてスペクトラムも高密度化し、FFTの全ビン数を上限にする。
    const sampleRate = session.audioContext.sampleRate;
    const nyquist = sampleRate / 2;
    const maxFreq = Math.min(22050, nyquist);
    const maxBin = Math.floor((maxFreq / nyquist) * bufferLength);

    const targetSize = Math.min(bufferLength, 512 * spectrumRenderQuality);
    const step = maxBin / targetSize;
    const reducedPost = new Array(targetSize);
    const reducedPre = new Array(targetSize);

    for (let i = 0; i < targetSize; i++) {
      const idx = Math.min(bufferLength - 1, Math.floor(i * step));
      reducedPost[i] = postData[idx];
      reducedPre[i] = preData[idx];
    }

    chrome.runtime.sendMessage({
      type: 'SPECTRUM_DATA',
      tabId: tabId,
      data: {
        post: reducedPost,
        pre: reducedPre,
        maxFreq: maxFreq,
        sampleRate: session.audioContext.sampleRate,
        fftSize: session.analyser.fftSize,
        levelDb: session.levelPeakDb,
        // Limiter ON時は「LimiterがなければCeilingを超える」状態もクリップ予兆として扱う。
        clipping: session.levelPeakDb >= -0.5 || (
          session.limiterEnabled && !session.bypassed && preLimiterPeakDb >= LIMITER_CEILING_DB
        ),
        limiterReduction: session.limiterEnabled && !session.bypassed ? session.limiter.reduction : 0
      }
    });
  }, 25); // EDIT: ~40fpsでスムーズに送信
}

// EDIT: スペクトラムストリーミング停止
function stopSpectrumStream(tabId) {
  const session = audioSessions.get(tabId);
  if (!session) return;

  if (session.spectrumInterval) {
    clearInterval(session.spectrumInterval);
    session.spectrumInterval = null;
  }
}

// EDIT: EQパラメータの更新 (スロープ次数・可変長バンド対応)
function updateEQParams(tabId, params) {
  const session = audioSessions.get(tabId);
  if (!session) return;

  const bandsChanged = params.bands !== undefined;
  const nextBands = bandsChanged ? JSON.parse(JSON.stringify(params.bands)) : session.bands;
  const nextBypassed = params.bypass !== undefined ? params.bypass : session.bypassed;
  const bypassChanged = nextBypassed !== session.bypassed;

  if (bandsChanged) session.bands = nextBands;
  if (bypassChanged) session.bypassed = nextBypassed;

  if (bandsChanged || bypassChanged) {
    const effectiveBands = session.bypassed ? [] : session.bands;
    const currentChain = session.filterChain;
    if (currentChain && canUpdateFilterChainInPlace(currentChain, effectiveBands)) {
      updateFilterChainParameters(session, currentChain, effectiveBands);
    } else {
      replaceFilterNodes(session, effectiveBands);
    }
  }

  if (params.outputGain !== undefined) {
    session.outputGainSetting = Math.max(0, Math.min(4, params.outputGain));
  }

  if (params.inputGain !== undefined) {
    session.inputGainSetting = Math.max(0, Math.min(4, params.inputGain));
  }

  if (params.limiterThreshold !== undefined) {
    session.limiterThreshold = Math.max(-32, Math.min(0, params.limiterThreshold));
    session.limiter.threshold.setTargetAtTime(session.limiterThreshold, session.audioContext.currentTime, 0.005);
  }

  if (params.limiterEnabled !== undefined && session.limiterEnabled !== params.limiterEnabled) {
    session.limiterEnabled = params.limiterEnabled;
    updateLimiterRouting(session);
  }

  if (bypassChanged) {
    updateLimiterRouting(session);
  }

  // OFF中もフェーダー設定は保存するが、実際のゲインは0 dBにする。
  if (params.inputGain !== undefined || params.outputGain !== undefined || params.bypass !== undefined) {
    const now = session.audioContext.currentTime;
    session.inputGain.gain.setTargetAtTime(session.bypassed ? 1 : session.inputGainSetting, now, 0.01);
    session.outputGain.gain.setTargetAtTime(session.bypassed ? 1 : session.outputGainSetting, now, 0.01);
  }
}

// ADD: メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'OFFSCREEN_PING':
      sendResponse({ ready: true });
      break;
    case 'SET_RENDER_QUALITY': {
      const quality = Number(message.quality);
      spectrumRenderQuality = [8, 16].includes(quality) ? quality : 8;
      sendResponse({ updated: true });
      break;
    }
    case 'GET_CAPTURE_STATUS': {
      const session = audioSessions.get(message.tabId);
      sendResponse({
        active: Boolean(session),
        starting: captureStartPromises.has(message.tabId),
        powered: session ? !session.bypassed : true
      });
      break;
    }
    case 'START_CAPTURE':
      startCapture(message.tabId, message.streamId);
      break;
    case 'STOP_CAPTURE':
      stopCapture(message.tabId)
        .then(() => sendResponse({ stopped: true }))
        .catch((e) => sendResponse({ stopped: false, error: e.message }));
      return true;
    case 'START_SPECTRUM_STREAM':
      startSpectrumStream(message.tabId);
      break;
    case 'STOP_SPECTRUM_STREAM':
      stopSpectrumStream(message.tabId);
      break;
    case 'SET_EQ_PARAMS':
      updateEQParams(message.tabId, message.params);
      break;
    case 'SET_EQ_BYPASS':
      updateEQParams(message.tabId, { bypass: message.bypass });
      break;
  }
});
