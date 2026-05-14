Page({
  data: {
    detail: null,
  },
  async onLoad(options) {
    this.orderId = options.id
    const app = getApp()
    try {
      const result = await app.request({ url: `/api/mp/repair-orders/${this.orderId}` })
      const raw = result.data || {}
      const imageUrls = Array.isArray(raw.imageUrls) ? raw.imageUrls.filter(Boolean) : []
      this.setData({
        detail: Object.assign({}, raw, {
          statusText: app.getRepairStatusMeta(raw.status).text,
          imageUrls,
          createdAtDisplay: app.formatDisplayDateTime(raw.createdAt),
        }),
      })
    } catch (error) {
      app.showError(error, '加载工单详情失败')
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