Page({
  data: {
    messages: [],
    showLoginPopup: false,
  },
  async onShow() {
    const app = getApp()
    if (!app.isUserLoggedIn()) {
      this.setData({ showLoginPopup: true })
      return
    }
    await this.loadMessages()
  },
  onLoginSuccess() {
    this.setData({ showLoginPopup: false })
    this.onShow()
  },
  onLoginClose() {
    this.setData({ showLoginPopup: false })
  },
  async loadMessages() {
    const app = getApp()
    try {
      await app.ensureLogin()
      const result = await app.request({ url: '/api/mp/notifications' })
      this.setData({
        messages: (result.data || []).map((item) => ({
          id: item.id,
          time: app.formatDisplayDateTime(item.createdAt),
          text: item.content || item.title,
          unread: !item.read,
        })),
      })
    } catch (error) {
      app.showError(error, '加载消息失败')
    }
  },
  async markRead(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const item = this.data.messages[idx]
    if (!item || !item.unread) {
      return
    }
    const app = getApp()
    try {
      await app.request({
        url: `/api/mp/notifications/${item.id}/read`,
        method: 'POST',
      })
      this.setData({
        [`messages[${idx}].unread`]: false,
      })
    } catch (error) {
      app.showError(error, '标记已读失败')
    }
  },
})