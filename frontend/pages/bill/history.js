Page({
  data: {
    showLoginPopup: false,
    records: [],
  },
  async onShow() {
    const app = getApp()
    if (!app.isUserLoggedIn()) {
      this.setData({ showLoginPopup: true })
      return
    }
    try {
      const isBound = await app.ensureBound()
      if (!isBound) {
        wx.showToast({ title: '请先绑定房屋', icon: 'none' })
        return
      }
      await this.loadHistory()
    } catch (error) {
      app.showError(error, '加载失败')
    }
  },
  onLoginSuccess() {
    this.setData({ showLoginPopup: false })
    this.onShow()
  },
  onLoginClose() {
    this.setData({ showLoginPopup: false })
    wx.navigateBack()
  },
  async loadHistory() {
    const app = getApp()
    const result = await app.request({ url: '/api/mp/bills/paid-history' })
    const records = (result.data || []).map((item) => {
      const n = Number(item.amount || 0)
      const amountStr = Number.isInteger(n) ? String(n) : n.toFixed(2)
      return {
        id: item.id,
        month: item.month,
        title: item.title || '物业管理费',
        amount: amountStr,
        paidAtText: item.updatedAt ? app.formatDisplayDateTime(item.updatedAt) : '—',
      }
    })
    this.setData({ records })
  },
})
