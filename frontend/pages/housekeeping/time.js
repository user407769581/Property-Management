const FIXED_TIMES = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`
}

function formatYMD(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function buildDateOptions(dayCount) {
  const weekNames = ['日', '一', '二', '三', '四', '五', '六']
  const out = []
  const now = new Date()
  for (let i = 0; i < dayCount; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    out.push({
      date: formatYMD(d),
      label: `${d.getMonth() + 1}月${d.getDate()}日`,
      sub: `周${weekNames[d.getDay()]}`,
      isToday: i === 0,
    })
  }
  return out
}

function timesForDate(dateStr) {
  const today = formatYMD(new Date())
  if (dateStr !== today) {
    return FIXED_TIMES.slice()
  }
  const h = new Date().getHours()
  return FIXED_TIMES.filter((t) => {
    const hour = parseInt(t.split(':')[0], 10)
    return hour > h
  })
}

Page({
  data: {
    dateOptions: [],
    displayTimes: [],
    selectedDate: '',
    selectedTime: '',
  },
  onShow() {
    this.setData({
      dateOptions: buildDateOptions(14),
      selectedDate: '',
      selectedTime: '',
      displayTimes: [],
    })
  },
  selectDate(e) {
    const date = e.currentTarget.dataset.date
    const displayTimes = timesForDate(date)
    this.setData({
      selectedDate: date,
      selectedTime: '',
      displayTimes,
    })
    if (!displayTimes.length) {
      wx.showToast({ title: '当日可约时段已满，请选其他日期', icon: 'none' })
    }
  },
  selectTime(e) {
    if (!this.data.selectedDate) {
      wx.showToast({ title: '请先选择日期', icon: 'none' })
      return
    }
    const time = e.currentTarget.dataset.time
    this.setData({ selectedTime: time })
  },
  goNext() {
    if (!this.data.selectedDate || !this.data.selectedTime) {
      wx.showToast({ title: '请选择日期与时间', icon: 'none' })
      return
    }
    const selection = wx.getStorageSync('housekeeping-selection') || {}
    wx.setStorageSync(
      'housekeeping-selection',
      Object.assign({}, selection, {
        serviceDate: this.data.selectedDate,
        serviceTime: this.data.selectedTime,
      }),
    )
    wx.navigateTo({ url: '/pages/housekeeping/confirm' })
  },
})
