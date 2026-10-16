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
    // 設定の値を読み込み反映
    setInitData('ytBackur', 'youtubeBackur', 'checkbox', false)
    setInitData('gfFileManager', 'gigafileFileManager', 'checkbox', true)
    setInitData('gfCopy', 'gigafileCopy', 'checkbox', true)
    setInitData('gfDelKey', 'gigafileDelKey', 'checkbox', false)

    // 初期化ボタン
    document.getElementById("initializeCache").addEventListener('click', async (event) => {
        if (event.shiftKey) {
            await chrome.storage.local.clear()
                .then(() => {
                    setNof("キャッシュを削除しました。")
                    setTimeout(() => {
                        location.reload();
                    }, 1000);
                })
                .catch((e) => {
                    setNof("キャッシュ削除にエラーが発生しました" + String(e))
                });
        } else {
            setNof("キャッシュを削除するにはShiftキーを押しながらもう一度クリックしてください。")
        }
    });


})();

/**
 * 設定入力の初期化
 * @param {string} elmId 対象の入力欄のID
 * @param {string} key ストレージのキー
 * @param {'checkbox' | 'value'} type ストレージの型
 * @param {any} defaultValue デフォルトの値
 */
async function setInitData(elmId, key, type, defaultValue) {
    let AllData = await chrome.storage.local.get(null);
    let elm = document.getElementById(elmId);
    if (type == 'checkbox') {
        elm.checked = AllData[key] ?? defaultValue;
        elm.addEventListener('click', async (event) => {
            const isChecked = (event.target).checked;
            await chrome.storage.local.set({ [key]: isChecked })
        });
    } else if (type == 'value') {
        elm.value = AllData[key] ?? defaultValue;
        elm.addEventListener('change', async (event) => {
            const value = (event.target).value;
            await chrome.storage.local.set({ [key]: value })
        });
    }
}