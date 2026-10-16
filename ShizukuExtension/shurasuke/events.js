window.addEventListener("load",function() {
// ボタンの作成
let fill_btn = document.createElement('button', 'id=fillbtn')
fill_btn.innerText = 'この月を一括で追加'
fill_btn.id = 'fillbtn'
fill_btn.style = 'width: 314px;margin-left:11px;border-color:#3030f0;background-color:#ddf;font-weight:bold'
fill_btn.addEventListener('click', ()=> {
    // 開いているカレンダーの月を取得し、日程計算後記入
    let calendars = document.querySelectorAll('.calheader')
    calendars = Array.prototype.slice.call(calendars)
    let insert_schedule = genScheduleList(calendars, document.getElementById('postfix').value)
    // 日程の追加アクション
    let schedule = document.getElementById('schedule')
    schedule.value = `${schedule.value}${insert_schedule}`
})
// 入力オプションの下に追加
document.getElementById('optdiv').after(fill_btn)
})

// 記入内容計算関数
function genScheduleList(date, suffix){
    calend = date[0].textContent.split(/\n/g)[2].split(/年|月/g)
    let weekchars = ['(日)','(月)','(火)','(水)','(木)','(金)','(土)','(日)','(月)','(火)','(水)','(木)','(金)','(土)']
    var firstDayDate = new Date(`${calend[0]}/${calend[1]}/1`)
    var wDay = firstDayDate.getDay()
    const DayCount = DayCounter(calend[0],calend[1])
    console.log(firstDayDate)
    let WeekChars = []
    for (let i = 0; i < DayCount; i++) {
        console.log(i)
        if(i < 7){
            WeekChars.push(weekchars[wDay+i])
        }else if(i < 14){
            WeekChars.push(weekchars[wDay+(i-7)])
        }else if(i < 21){
            WeekChars.push(weekchars[wDay+(i-14)])
        }else if(i < 28){
            WeekChars.push(weekchars[wDay+(i-21)])
        }else{
            WeekChars.push(weekchars[wDay+(i-28)])
        }
    }
    let result = ''
    for(let i=0;i<DayCount;i++){
        result += `${calend[1]}/${i+1}${WeekChars[i]}${suffix}\n`
    }
    console.log(result)
    return result
}

// 月の日数計算関数
function DayCounter(year, month){
    if(month == '2'){
        if(year % 4 === 0 && (year % 100 !==0 || year % 400 === 0)){
            return 29
        }
        return 28
    }else if(month == '4' || month == '6' || month == '9' || month == '11'){
        return 30
    }
    return 31
}