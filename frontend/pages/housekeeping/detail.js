Page({
  data: {
    detail: null,
  },
  async onLoad(options) {
    const app = getApp()
    try {
      const result = await app.request({ url: `/api/mp/housekeeping/orders/${options.id}` })
      this.setData({
        detail: Object.assign({}, result.data, {
          statusText: app.getHousekeepingStatusMeta(result.data.status, result.data.paymentStatus).text,
          canPay: result.data.paymentStatus === 'PENDING',
        }),
      })
    } catch (error) {
      app.showError(error, '加载家政详情失败')
    }
  },
  callStaff() {
    const phone = this.data.detail && this.data.detail.housekeeperPhone
    if (!phone) {
      wx.showToast({ title: '暂无服务人员电话', icon: 'none' })
      return
    }
    const num = String(phone).replace(/\D/g, '')
    if (!num) {
      wx.showToast({ title: '号码无效', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: num })
  },
  async payOrder() {
    const app = getApp()
    const detail = this.data.detail
    if (!detail || !detail.id) {
      return
    }
    try {
      const result = await app.request({
        url: `/api/mp/housekeeping/orders/${detail.id}/pay`,
        method: 'POST',
      })
      await app.requestWechatPayment(result.data)
      wx.showToast({ title: '支付成功', icon: 'success' })
      this.onLoad({ id: detail.id })
    } catch (error) {
      app.showError(error, '支付失败')
    }
  },
})