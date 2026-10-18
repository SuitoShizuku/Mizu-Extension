async function main() {
    let memoField = document.getElementsByTagName('textarea')
    for (let i = 0; i < memoField.length; i++) {
        let element = memoField.item(i);
        if(element.parentNode.parentNode.childNodes.item(0).childNodes.item(1).nodeName == 'P'){
            element.parentNode.parentNode.childNodes.item(0).childNodes.item(1).textContent = `(${element.textContent.length}文字)`
        }else{
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
            if(element.type == 'number') {
                if(element.value > 100){
                    if(!element.classList.length){
                        element.className = `iariri_over ${element.style.backgroundColor}`
                        // console.log(element.className)
                        // element.style.backgroundColor = 'red'
                        element.style.backgroundColor = settings.iacharaOverflowHighlightProperty;
                    }
                }else{
                    if(element.className.match(/iariri_over/)){
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
            if(/*element.style == null && */element.textContent.match(/^(目星|聞き耳|図書館)$/)){
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
    let sidebar = document.getElementsByClassName('edit_mainContainer__URa5B').item(0).getElementsByTagName('aside').item(0)
    let popups = document.createElement('div')
    let popupsbtn = document.createElement('button')
    popups.style.backgroundColor = 'transparent'
    popups.style.borderRadius = '4px'
    popupsbtn.className = 'button_sideButton__lWcU8 iariri_popup'
    popupsbtn.id = 'iariri_popup'
    popupsbtn.style.color = '#a0a0a0'
    popupsbtn.style.borderRadius = '4px'
    popupsbtn.textContent = 'ポップアップする'
    popups.appendChild(popupsbtn)
    sidebar.appendChild(popups)
    document.getElementById('iariri_popup').onclick = (function (){
        const urls = location.href.split('/')
        window.open(`https://iachara.com/view/${urls[urls.length-1]}`, '', 'location=no, width=600, height=800');
    })
}

(async () => {
    const settings = await chrome.storage.local.get({
        iacharaOverflowHighligh: true,
        iacharaSkillHighlight: true,
        iacharaMemoCount: true,
        iacharaPopupButton: true
    });

    let loadCount = 0
    setInterval(() => {
        if (document.getElementById("memo")) {
            loadCount++
            if (loadCount == 1 && settings.iacharaPopupButton) firstLoad()
            main(settings)
        }
    }, 1000);
})();