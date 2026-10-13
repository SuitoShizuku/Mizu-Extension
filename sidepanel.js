// 通知ヘッダー
let notificationTimer = null;
function setNof(texts) {
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

// 初期化ボタン
document.getElementById("initializeCache").addEventListener('click', async (event) => {
  if (event.shiftKey) {
    await chrome.storage.local.clear()
      .then(() => {
        setNof("キャッシュを削除しました。")
      })
      .catch((e) => {
        setNof("キャッシュ削除にエラーが発生しました" + String(e))
      });
  } else {
    setNof("キャッシュを削除するにはShiftキーを押しながらもう一度クリックしてください。")
  }
});