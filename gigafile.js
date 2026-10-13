/**
 * 
 * アップロード時のリンクコピーボタン
 * 
 */
if (location.href == 'https://gigafile.nu/') {
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

                    // 出力
                    const url = aTag.getAttribute('href') + "?deleteKey=" + delKey.getAttribute('origin');

                    if (!ednode.querySelector('.custom-copy-btn')) {
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