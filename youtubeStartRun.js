// ADD: Storage の設定変更を検知して Window Message で MAIN ワールドに転送
(async function() {
    'use strict';

    // ADD: 初期設定値を MAIN ワールドへ送信
    const data = await chrome.storage.local.get({ youtubeCopyCustomizeProperty: 'remove_si' });
    window.postMessage({ type: 'YTP_URL_CONFIG_UPDATE', config: data }, '*');

    // ADD: storage の変更をリアルタイム監視
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.youtubeCopyCustomizeProperty) {
            window.postMessage({
                type: 'YTP_URL_CONFIG_UPDATE',
                config: { youtubeCopyCustomizeProperty: changes.youtubeCopyCustomizeProperty.newValue }
            }, '*');
        }
    });
})();