(function() {
    'use strict';

    let isPatched = false;

    // URLのパラメータ削除処理
    function formatUrl(originalUrl, mode) {
        if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;
        try {
            const url = new URL(originalUrl);

            if (mode === 'remove_si') {
                url.searchParams.delete('si');
            } else if (mode === 'remove_si_t') {
                url.searchParams.delete('si');
                url.searchParams.delete('t');
            }

            return url.toString();
        } catch (e) {
            return originalUrl;
        }
    }

    // プレイヤーAPIの上書き処理
    function applyPatch(mode) {
        if (isPatched) return;

        const player = document.getElementById('movie_player');
        if (!player) {
            setTimeout(() => applyPatch(mode), 200);
            return;
        }

        const targets = [player];
        if (typeof player.O === 'function') {
            try {
                const internalApi = player.O();
                if (internalApi) targets.push(internalApi);
            } catch (e) {}
        }

        targets.forEach((target) => {
            if (typeof target.getVideoUrl === 'function' && !target.__isPatched) {
                const originalGetVideoUrl = target.getVideoUrl;

                // thisと引数を完全に保持して上書き
                target.getVideoUrl = function(...args) {
                    const rawUrl = originalGetVideoUrl.apply(this, args);
                    return formatUrl(rawUrl, mode);
                };

                target.__isPatched = true;
            }
        });

        isPatched = true;
    }

    // ISOLATEDワールドからの設定受信
    window.addEventListener('message', (event) => {
        if (!event.data || event.data.type !== 'YTP_URL_CONFIG_RESPONSE') return;

        const { youtubeCopyCustomize, youtubeCopyCustomizeProperty } = event.data.config;

        // OFF または raw の場合は一切上書きを行わずに完全終了
        if (!youtubeCopyCustomize || youtubeCopyCustomizeProperty === 'raw') {
            return;
        }

        // カスタマイズが必要な場合のみパッチを適用
        applyPatch(youtubeCopyCustomizeProperty);
    });

    // 起動時に設定要求を送信
    window.postMessage({ type: 'YTP_URL_CONFIG_REQUEST' }, '*');
})();