// 通知ヘッダー
let notificationTimer = null;
async function setNof(texts) {
    // 残ったタイマー初期化
    if (notificationTimer) {
        clearTimeout(notificationTimer);
    }

    const notificationObj = document.getElementById("notification");
    const header = document.getElementsByTagName("header").item(0);
    notificationObj.textContent = texts;
    header.style.display = 'block';
    header.classList.add('nofShow');
    header.classList.remove('nofHide');
    setTimeout(() => {
        header.classList.remove('nofShow');
        header.classList.add('nofHide');
        setTimeout(() => {
            header.style.display = 'none';
        }, 500);
    }, 2500);
}


(async () => {
    init();

    // ストレージが変更されたら初期化処理を実行
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.gigafileFiles) {
            init();
        }
    });

    async function init() {
        /**
         * @type {{gigafileFiles: Array<{
         *  url: string,
         *  filename: string,
         *  date: number,
         *  deleteKey: string}>}}
         */
        const db = await chrome.storage.local.get({ gigafileFiles: [] });
        // 再初期化時に既存の要素をクリア
        const filesElm = document.getElementById('files');
        if (filesElm) filesElm.innerHTML = '';

        db.gigafileFiles.forEach((file) => {
            // 日付チェック
            const now = new Date()
            now.setHours(0, 0, 0, 0)
            if (now.getTime() > file.date) {
                //期限切れならデータベースから消す
                db.gigafileFiles = db.gigafileFiles.filter((f) => f.url !== file.url);
                chrome.storage.local.set({ gigafileFiles: db.gigafileFiles });
                return;
            };
            // 日付を正規化
            const date = new Date(file.date);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            // 残り日数計算
            const last = new Date(date - now).getTime() / 1000 / 60 / 60 / 24
            addFile(file.url, file.filename, `${year}年${month}月${day}日(${last}日)`, file.deleteKey);
        })
    }
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
                <!-- <button class="btn-dl">DL</button> -->
                <input type="text" readonly style="width:4em" value="${deleteKey}">
                <!-- <button class="btn-delete">Delete</button> -->
                <button class="btn-remove">Remove</button>
            </span>`;

    elm.querySelector('.btn-copy').addEventListener('click', () => copyUrl(url));
    // elm.querySelector('.btn-dl').addEventListener('click', () => openUrl(url));
    // elm.querySelector('.btn-delete').addEventListener('click', () => deleteFile(url, deleteKey));
    elm.querySelector('.btn-remove').addEventListener('click', () => removeFile(url));

    document.getElementById('files').append(elm);
}

/**
 * URLコピー関数
 * @param {string} url
 */
function copyUrl(url) {
    navigator.clipboard.writeText(url)
        .catch(() => {
            setNof("コピーに失敗しました。");
        })
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
                setNof("このファイルを削除しました。");
            } else {
                setNof("このファイルの削除に失敗しました。");
            }
        } catch (error) {
            setNof("このファイルの削除に失敗しました。");
        }
    }
}

/**
 * ファイル削除関数
 * @param {string} url
 */
async function removeFile(url) {
    const db = await chrome.storage.local.get({ gigafileFiles: [] });
    db.gigafileFiles = db.gigafileFiles.filter((f) => f.url !== url);
    await chrome.storage.local.set({ gigafileFiles: db.gigafileFiles });
    setNof("リストから削除しました");
}