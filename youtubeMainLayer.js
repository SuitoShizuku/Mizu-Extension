(function() {
    'use strict';

    // ADD: 現在のフォーマット設定 (初期値)
    let currentFormat = 'remove_si';

    // ADD: ISOLATED ワールドからの設定変更通知を受信
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'YTP_URL_CONFIG_UPDATE') {
            currentFormat = event.data.config.youtubeCopyCustomizeProperty;
        }
    });

    // ADD: 設定に応じたURL整形処理
    function formatUrl(originalUrl) {
        try {
            const url = new URL(originalUrl);

            // EDIT: 設定値に応じた分岐処理
            if (currentFormat === 'remove_si') {
                url.searchParams.delete('si');
                return url.toString();
            } else if (currentFormat === 'short') {
                const videoId = url.searchParams.get('v');
                const time = url.searchParams.get('t');
                if (videoId) {
                    let shortUrl = `https://youtu.be/${videoId}`;
                    if (time) shortUrl += `?t=${time}`;
                    return shortUrl;
                }
            }
            return originalUrl;
        } catch (e) {
            return originalUrl;
        }
    }

    // ADD: プレイヤーAPIの getVideoUrl をパッチ
    const patchVideoUrlApi = () => {
        const player = document.getElementById('movie_player');
        if (!player) {
            setTimeout(patchVideoUrlApi, 200);
            return;
        }

        const apiTargets = [player];
        if (typeof player.O === 'function') {
            try {
                const internalApi = player.O();
                if (internalApi) apiTargets.push(internalApi);
            } catch (e) {}
        }

        apiTargets.forEach((target) => {
            if (typeof target.getVideoUrl === 'function' && !target.__isPatched) {
                const originalGetVideoUrl = target.getVideoUrl.bind(target);

                target.getVideoUrl = function(...args) {
                    const rawUrl = originalGetVideoUrl(...args);
                    return formatUrl(rawUrl);
                };

                target.__isPatched = true;
            }
        });
    };

    patchVideoUrlApi();
})();