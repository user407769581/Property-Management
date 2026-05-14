Page({
  data: {
    showLoginPopup: false,
    content: '',
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
        return
      }
      const result = await app.request({ url: '/api/mp/feedback' })
      const statusLabels = { PENDING: '待处理', HANDLED: '已处理', REPLIED: '已回复' }
      const records = (result.data || []).map((r) => ({
        ...r,
        statusLabel: statusLabels[r.status] || r.status || '—',
      }))
      this.setData({ records })
    } catch (error) {
      app.showError(error, '加载反馈失败')
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
  inputContent(e) {
    this.setData({ content: e.detail.value })
  },
  async submit() {
    if (!this.data.content) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' })
      return
    }
    const app = getApp()
    try {
      await app.request({
        url: '/api/mp/feedback',
        method: 'POST',
        data: { content: this.data.content },
      })
      wx.showToast({ title: '反馈已提交', icon: 'none' });
      this.setData({ content: '' })
      await this.onShow()
    } catch (error) {
      app.showError(error, '提交失败')
    }
  },
})