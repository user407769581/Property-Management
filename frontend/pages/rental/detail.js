Page({
  data: {
    detail: null,
  },
  async onLoad(options) {
    const app = getApp()
    try {
      const result = await app.request({ url: `/api/mp/rentals/${options.id}`, auth: false })
      const d = result.data || {}
      const gallery = app.parseRentalImageUrls(d)
      this.setData({
        detail: {
          ...d,
          gallery,
          statusText: app.getRentalStatusText(d.status),
        },
      })
    } catch (error) {
      app.showError(error, '加载房源详情失败')
    }
  },
  call() {
    if (!this.data.detail || !this.data.detail.phone) {
      wx.showToast({ title: '暂无联系电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: this.data.detail.phone })
  }
})