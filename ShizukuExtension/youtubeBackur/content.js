(() => {
    // デフォルト値
    const DEFAULTS = { blur: 20, brightness: 70, opacity: 85 };
    const CANVAS_W = 320, CANVAS_H = 180;
    const FPS_INTERVAL = 1000 / 30;

    let cfg = { enabled: true, ...DEFAULTS };
    let containerEl, canvasEl, ctx, videoEl;
    let loopId = null, useVFC = false, lastT = 0, watching = false;

    function loadConfig(cb) {
        // ストレージ
        chrome.storage.local.get({
            youtubeBackurConfigsBlur: 20,
            youtubeBackurConfigsBrightness: 70,
            youtubeBackurConfigsOpacity: 85,
            youtubeBackur: false
        }, (items) => {
            const conf = {
                blur: items.youtubeBackurConfigsBlur,
                brightness: items.youtubeBackurConfigsBrightness,
                opacity: items.youtubeBackurConfigsOpacity
            }
            cfg = { enabled: items.youtubeBackur, ...DEFAULTS, ...conf };
            cb && cb();
        });
    }

    function createDOM() {
        if (!document.body || document.getElementById('yt-backur-container')) {
            containerEl = document.getElementById('yt-backur-container');
            canvasEl = document.getElementById('yt-backur-canvas');
            if (canvasEl && !ctx) ctx = canvasEl.getContext('2d');
            return;
        }
        containerEl = document.createElement('div');
        containerEl.id = 'yt-backur-container';
        canvasEl = document.createElement('canvas');
        canvasEl.id = 'yt-backur-canvas';
        canvasEl.width = CANVAS_W;
        canvasEl.height = CANVAS_H;
        ctx = canvasEl.getContext('2d');
        containerEl.appendChild(canvasEl);
        document.body.prepend(containerEl);
    }

    function applyStyles() {
        if (!canvasEl) return;
        canvasEl.style.filter = `blur(${cfg.blur}px) brightness(${cfg.brightness}%)`;
        canvasEl.style.opacity = cfg.opacity / 100;
    }

    function isNormalPlayer() {
        if (!location.pathname.startsWith('/watch')) return false;
        const fs = !!(document.fullscreenElement || document.querySelector('.ytp-fullscreen'));
        document.documentElement.classList.toggle('yt-backur-fullscreen', fs);
        document.body.classList.toggle('yt-backur-fullscreen', fs);
        return !fs;
    }

    function renderFrame(now) {
        if (!videoEl || videoEl.paused || videoEl.ended || document.hidden) return;
        if (!now || now - lastT >= FPS_INTERVAL) {
            if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
                if (!ctx && canvasEl) ctx = canvasEl.getContext('2d');
                if (ctx) {
                    ctx.drawImage(videoEl, 0, 0, CANVAS_W, CANVAS_H);
                    lastT = now || performance.now();
                }
            }
        }
    }

    function startLoop() {
        stopLoop();
        if (!cfg.enabled || !isNormalPlayer() || !videoEl) return;
        watching = true;
        renderFrame(performance.now());
        if ('requestVideoFrameCallback' in HTMLVideoElement.prototype && typeof videoEl.requestVideoFrameCallback === 'function') {
            useVFC = true;
            const cb = (now) => { if (!watching) return; renderFrame(now); loopId = videoEl.requestVideoFrameCallback(cb); };
            loopId = videoEl.requestVideoFrameCallback(cb);
        } else {
            useVFC = false;
            const loop = (now) => { if (!watching) return; renderFrame(now); loopId = requestAnimationFrame(loop); };
            loopId = requestAnimationFrame(loop);
        }
    }

    function stopLoop() {
        watching = false;
        if (loopId === null) return;
        useVFC && videoEl && typeof videoEl.cancelVideoFrameCallback === 'function'
            ? videoEl.cancelVideoFrameCallback(loopId)
            : cancelAnimationFrame(loopId);
        loopId = null;
    }

    const findVideo = () =>
        document.querySelector('video.video-stream.html5-main-video') ||
        document.querySelector('video.html5-main-video') ||
        document.querySelector('#movie_player video') ||
        document.querySelector('ytd-watch-flexy video') ||
        document.querySelector('video');

    const onPlay = () => cfg.enabled && isNormalPlayer() && startLoop();
    const onPause = () => stopLoop();
    const onSeeked = () => renderFrame(performance.now());
    const onTime = () => { if (cfg.enabled && isNormalPlayer() && videoEl && !videoEl.paused && !watching) startLoop(); };

    function bindVideo() {
        const v = findVideo();
        if (!v) return;
        if (v === videoEl) {
            if (!videoEl.paused && !videoEl.ended && !watching) startLoop();
            return;
        }
        if (videoEl) {
            ['play', 'playing', 'pause', 'ended', 'seeked', 'timeupdate'].forEach(e => {
                videoEl.removeEventListener(e, { play: onPlay, playing: onPlay, pause: onPause, ended: onPause, seeked: onSeeked, timeupdate: onTime }[e]);
            });
        }
        videoEl = v;
        videoEl.addEventListener('play', onPlay);
        videoEl.addEventListener('playing', onPlay);
        videoEl.addEventListener('pause', onPause);
        videoEl.addEventListener('ended', onPause);
        videoEl.addEventListener('seeked', onSeeked);
        videoEl.addEventListener('timeupdate', onTime);
        videoEl.paused || videoEl.ended ? renderFrame(performance.now()) : startLoop();
    }

    function checkPage() {
        createDOM();
        const active = cfg.enabled && isNormalPlayer();
        document.documentElement.classList.toggle('yt-backur-active', active);
        document.body.classList.toggle('yt-backur-active', active);
        if (active) {
            applyStyles();
            bindVideo();
            videoEl && !videoEl.paused && !videoEl.ended ? startLoop() : renderFrame(performance.now());
        } else {
            stopLoop();
        }
    }

    // EDIT: ストレージ変更時にloadConfigで設定を再読み込み
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!('youtubeBackur' in changes || 'youtubeBackurConfigsBlur' in changes || 'youtubeBackurConfigsBrightness' in changes || 'youtubeBackurConfigsOpacity' in changes)) return;
        loadConfig(() => { applyStyles(); checkPage(); });
    });

    document.addEventListener('fullscreenchange', checkPage);
    document.addEventListener('webkitfullscreenchange', checkPage);
    document.addEventListener('visibilitychange', () => document.hidden ? stopLoop() : checkPage());
    window.addEventListener('yt-navigate-finish', () => { setTimeout(checkPage, 100); setTimeout(checkPage, 500); });
    setInterval(() => {
        if (!cfg.enabled || !isNormalPlayer()) return;
        if (!document.getElementById('yt-backur-container')) createDOM();
        bindVideo();
        if (videoEl && !videoEl.paused && !watching) startLoop();
    }, 1000);

    function init() {
        createDOM();
        loadConfig(checkPage);
        const observer = new MutationObserver(() => {
            if (!document.getElementById('yt-backur-container')) createDOM();
            if (!videoEl || !watching) bindVideo();
            checkPage();
        });
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
