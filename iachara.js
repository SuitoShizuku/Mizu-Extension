async function main() {
    let memoField = document.getElementsByTagName('textarea')
    for (let i = 0; i < memoField.length; i++) {
        let element = memoField.item(i);
        if (element.parentNode.parentNode.childNodes.item(0).childNodes.item(1).nodeName == 'P') {
            element.parentNode.parentNode.childNodes.item(0).childNodes.item(1).textContent = `(${element.textContent.length}文字)`
        } else {
            element.parentNode.parentNode.childNodes.item(0).childNodes.item(1).before(makeLengthCounter(element.textContent.length))
        }
    }

    // 技能値関連
    let skillValueTotals = document.getElementsByClassName('utility_border5__G6kf6')
    const settings = await chrome.storage.local.get({ iacharaOverflowHighlightProperty: '#FF0000', iacharaSkillHighlightProperty: '#DEA5A4' })
    for (let i = 0; i < skillValueTotals.length; i++) {
        let elements = skillValueTotals.item(i);
        // 100以上の技能値をハイライト
        let skillValueInput = elements.getElementsByTagName('input')
        for (let j = 0; j < skillValueInput.length; j++) {
            let element = skillValueInput.item(j);
            if (element.type == 'number') {
                if (element.value > 100) {
                    if (!element.classList.length) {
                        element.className = `iariri_over ${element.style.backgroundColor}`
                        // console.log(element.className)
                        // element.style.backgroundColor = 'red'
                        element.style.backgroundColor = settings.iacharaOverflowHighlightProperty;
                    }
                } else {
                    if (element.className.match(/iariri_over/)) {
                        element.style.backgroundColor = `rgb${element.className.split('rgb')[1]}`
                        console.log(`rgb${element.className.split('rgb')[1]}`)
                        element.removeAttribute('class')
                    }
                }
            }
        }
        // 3大技能をハイライト
        let skillValueStr = elements.getElementsByTagName('div')
        for (let j = 0; j < skillValueStr.length; j++) {
            let element = skillValueStr.item(j);
            if (/*element.style == null && */element.textContent.match(/^(目星|聞き耳|図書館)$/)) {
                // element.parentElement.style.backgroundColor = '#DEA5A4'
                element.parentElement.style.backgroundColor = settings.iacharaSkillHighlightProperty;
                element.style.color = '#000'
                // element.style.mixBlendMode = 'difference'
            }
        }
    }
    let outputBtn = document.getElementsByClassName('MuiBox-root css-0').item(0)
}

function makeLengthCounter(params2) {
    let cbox = document.createElement('p')
    cbox.textContent = `(${params2}文字)`
    cbox.style.color = 'gray'
    // cbox.style.marginLeft = '40rem'
    return cbox
}

function firstLoad() {
    let footer = document.getElementsByClassName('MuiBox-root css-xgi2r').item(0)
    let popups = document.createElement('div')
    let popupsbtn = document.createElement('div')
    // popups.style.backgroundColor = 'transparent'
    // popups.style.borderRadius = '4px'
    // popupsbtn.className = 'button_sideButton__lWcU8 iariri_popup'
    popups.id = 'iariri_popup'
    // popupsbtn.style.color = '#a0a0a0'
    // popupsbtn.style.borderRadius = '4px'
    popupsbtn.textContent = 'ポップアップ表示'
    popupsbtn.onclick = (function () {
        const urls = location.href.split('/')
        window.open(`https://iachara.com/view/${urls[urls.length - 1]}`, '', 'location=no, width=600, height=800');
    })
    popups.appendChild(popupsbtn)
    footer.appendChild(popups)
}

/**
 * @type { MutationObserver }
 */
const observer = new MutationObserver(async () => {
    const settings = await chrome.storage.local.get({
        iacharaOverflowHighligh: true,
        iacharaSkillHighlight: true,
        iacharaMemoCount: true,
        iacharaPopupButton: true
    });
    main(settings)
});

(async () => {
    setTimeout(() => {
        firstLoad()
        observer.observe(document.body, {
            childList: false,
            subtree: true,
            characterData: true,
            attributes: true
        })
    }, 3000);
})();