(async () => {
    /**
     * @type {{files: Array<{
     *  url: string,
     *  filename: string,
     *  date: number,
     *  deleteKey: string}>}}
     */
    const db = await chrome.storage.local.get({ files: []});
    db.files.forEach((file) => {
        // 日付チェック
        const now = new Date();
        if(now.getTime() > file.date) {
            //期限切れならデータベースから消す
            db.files = db.files.filter((f) => f.url !== file.url);
            chrome.storage.local.set({ files: db.files });
            return;
        };
        // 日付を正規化
        const date = new Date(file.date);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        addFile(file.url, file.filename, `${year}年${month}月${day}日`, file.deleteKey);
    })
})();


/**
 * ファイル追加関数
 * @param {string} url ファイルのURL
 * @param {string} filename ファイル名
 * @param {string} date 有効期限
 * @param {string} deleteKey ファイルの削除キー
 */
function addFile(url, filename, date, deleteKey) {
    let elm = document.createElement('div');
    elm.innerHTML = `
            <a target="_blank" href="${url}">${filename}</a>
            <span>
                <date>${date}</date>
                <button class="btn-copy">Copy</button>
                <button class="btn-dl">DL</button>
                <input type="text" readonly style="width:4em" value="${deleteKey}">
                <button class="btn-delete">Delete</button>
            </span>`;

    elm.querySelector('.btn-copy').addEventListener('click', () => copyUrl(url));
    elm.querySelector('.btn-dl').addEventListener('click', () => openUrl(url));
    elm.querySelector('.btn-delete').addEventListener('click', () => deleteFile(url, deleteKey));

    document.getElementById('files').append(elm);
}

/**
 * URLコピー関数
 * @param {string} url
 */
function copyUrl(url) {
    navigator.clipboard.writeText(url);
}

/**
 * ファイルDL関数
 * @param {string} url
 */
function openUrl(url) {
    window.open(url, '_blank');
}

/**
 * ファイル削除関数
 * @param {string} url
 * @param {string} delkey
 */
async function deleteFile(url, delkey) {
    if (confirm("このファイルを削除しますか?")) {
        const file = url.split('/')[3].split('?')[0];
        try {
            const params = new URLSearchParams({
                file: file,
                delkey: delkey
            });
            // キャッシュ
            params.append("_", Date.now().toString());

            const response = await fetch(`https://gigafile.nu/remove.php?${params.toString()}`, {
                method: "GET"
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const json = await response.json();
            if (json.status === 0) {
                alert("このファイルを削除しました。");
            } else {
                alert("このファイルの削除に失敗しました。");
            }
        } catch (error) {
            alert("このファイルの削除に失敗しました。");
        }
    }
}