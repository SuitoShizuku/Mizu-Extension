(async () => {
    const settings = await chrome.storage.local.get({
        youtubeBackur: false
    });
    if (settings.youtubeBackur) {
        document.getElementsByTagName('body').item(0)
    }
})();