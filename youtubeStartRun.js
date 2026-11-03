(function() {
    'use strict';

    // MAINワールドからの要求に応じてStorageの最新値を応答する
    window.addEventListener('message', async (event) => {
        if (event.data && event.data.type === 'YTP_URL_CONFIG_REQUEST') {
            const data = await chrome.storage.local.get({
                youtubeCopyCustomize: true,
                youtubeCopyCustomizeProperty: 'raw'
            });
            window.postMessage({ type: 'YTP_URL_CONFIG_RESPONSE', config: data }, '*');
        }
    });
})();