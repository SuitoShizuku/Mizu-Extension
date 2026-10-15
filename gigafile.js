(async () => {
    /**
     * 
     * アップロード時のリンクコピーボタン
     * 
     */
    if (location.href == 'https://gigafile.nu/') {
        const settings = await chrome.storage.local.get({
            gigafileFileManager: true,
            gigafileCopy: true,
            gigafileDelKey: false
        });
        const targetNode = document.getElementById("file_list")
        const callback = async (mutationsList, observer) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    for (const ednode of mutation.addedNodes) {
                        if (!(ednode instanceof HTMLElement)) continue;
                        const aTag = ednode.querySelector('a.file_info_url');
                        const delKey = ednode.querySelector('input.delkey');

                        if (!aTag || !delKey) continue;

                        // ここでaTagのstyleのdisplayがinlineになるまで待つ
                        await waitForDisplayInline(aTag);

                        if (settings.gigafileFileManager) {
                            // ファイルの日付を算出
                            const fileDateArr = aTag.getAttribute('href').split(/\/|-/)[3].match(/.{1,2}/g)
                            const nowDate = new Date();
                            let fileDate = 0;
                            // 今が7~12月 かつ ファイルの日付が1~6月なら ファイルの日付を翌年にする。
                            if(nowDate.getMonth() >= 6 && nowDate.getMonth() <= 11 && Number(fileDateArr[0]) >= 0 && Number(fileDateArr[0]) <= 5) {
                                fileDateArr.unshift((nowDate.getFullYear() + 1).toString())
                                fileDate = new Date(fileDateArr[0], fileDateArr[1]-1, fileDateArr[2], 0, 0, 0).getTime();
                            }else {
                                fileDateArr.unshift(nowDate.getFullYear().toString())
                                fileDate = new Date(fileDateArr[0], fileDateArr[1]-1, fileDateArr[2], 0, 0, 0).getTime();
                            }
                            const fileData = await chrome.storage.local.get({ gigafileFiles: [] })
                            fileData.gigafileFiles.push({
                                url: aTag.getAttribute('href'),
                                filename: ednode.getElementsByTagName('span').item(0).textContent,
                                date: fileDate,
                                deleteKey: delKey.getAttribute('origin')
                            })
                            await chrome.storage.local.set(fileData)
                        }

                        // 出力
                        // const url = aTag.getAttribute('href') + "?deleteKey=" + delKey.getAttribute('origin');
                        const url = function () {
                            if (settings.gigafileDelKey) {
                                return aTag.getAttribute('href') + "?deleteKey=" + delKey.getAttribute('origin')
                            } else {
                                return aTag.getAttribute('href')
                            }
                        }();

                        if (!ednode.querySelector('.custom-copy-btn') && settings.gigafileCopy) {
                            addButton(ednode, url);
                        }
                    }
                }
            }
        };
        /**
         * display:inline;まで待機
         * @param {HTMLElement} element
         * @returns {Promise<HTMLElement>}
         */
        async function waitForDisplayInline(element) {
            return new Promise((resolve) => {
                if (element.style.display === 'inline' || window.getComputedStyle(element).display === 'inline') {
                    return resolve(element);
                }
                const observer = new MutationObserver((_, obs) => {
                    if (element.style.display === 'inline' || window.getComputedStyle(element).display === 'inline') {
                        obs.disconnect();
                        resolve(element);
                    }
                });
                observer.observe(element, {
                    attributes: true,
                    attributeFilter: ['style']
                });
            });
        }
        const observer = new MutationObserver(callback);
        const config = {
            childList: true,     // 子要素の追加・削除を監視
            subtree: true,       // 監視対象の配下すべての要素も監視
            characterData: true, // テキストノードの変化を監視
            attributes: false    // 属性の変化（classなど）も監視したい場合は true
        };
        observer.observe(targetNode, config);
        /**
         * ボタン追加関数
         * @param {HTMLElement} node 
         */
        function addButton(node, url) {
            const copyButton = document.createElement("button");
            copyButton.className = "mizu-copy-btn";
            copyButton.textContent = "リンクをコピー";
            copyButton.style.fontWeight = 'bold';
            copyButton.onclick = function () {
                navigator.clipboard.writeText(url);
            };
            node.appendChild(copyButton)
        }

        /**
         * 
         * 削除キーでワンクリック削除機能
         * 
         */
    } else if (location.href.match(/https:\/\/[0-9]?[0-9][0-9]\.gigafile\.nu\/.+\?deleteKey=..../)) {
        const delKey = location.href.split('?deleteKey=');
        let inputDelKey = document.getElementById("delkey");
        inputDelKey.value = delKey[1]
    }

    //ファイルマネージャー
    let sidepanelButton = document.createElement('button')
    sidepanelButton.style.width = '468px';
    sidepanelButton.style.height = '35px';
    sidepanelButton.style.borderRadius = '5px';
    sidepanelButton.style.borderWidth = '0';
    sidepanelButton.style.backgroundColor = '#303b47';
    sidepanelButton.style.color = '#fff';
    sidepanelButton.style.fontWeight = 'bold';
    sidepanelButton.style.margin = '16px 0';
    sidepanelButton.textContent = "ファイルマネージャーを表示"
    sidepanelButton.onclick = (event) => {
        chrome.runtime.sendMessage({ action: 'openSidePanel' });
    };
    document.getElementById('contents_header').before(sidepanelButton)
})();