Page({
  data: {
    service: {
      phone: '',
      serviceHours: '',
      description: '',
    },
  },
  async onShow() {
    const app = getApp()
    try {
      const result = await app.request({ url: '/api/mp/customer-service', auth: false })
      this.setData({ service: result.data || {} })
    } catch (error) {
      app.showError(error, '加载客服信息失败')
    }
  },
  call() {
    if (!this.data.service.phone) {
      wx.showToast({ title: '暂无客服电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: this.data.service.phone })
  }
})