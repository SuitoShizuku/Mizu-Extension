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
                console.log('子要素が追加または削除されました:', mutation.addedNodes);
                console.log(mutation)
                /**@type {HTMLElement} */
                const ednode = mutation.addedNodes.item(0)
                const nodes = ednode.getElementsByTagName("div").item(2)
                // console.log(nodes)
                const aTag = nodes.querySelector('a.file_info_url')
                const delKey = nodes.getElementsByTagName('span').item(0).querySelector('input.delkey')
                //ここでaTagのstyleのdisplayがinlineになるまで待つ
                await waitForDisplayInline(aTag);
                // 出力
                const url = aTag.getAttribute('href') + "?deleteKey=" + delKey.getAttribute('origin')
                // console.log(url)
                // ボタン追加
                addButton(ednode, url)
            } else if (mutation.type === 'characterData') {
                console.log('テキスト内容が書き換えられました:', mutation.target.textContent);
            } else if (mutation.type === 'attributes') {
                console.log(`${mutation.attributeName} 属性が変更されました`);
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
        copyButton.textContent = "リンクをコピー";
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