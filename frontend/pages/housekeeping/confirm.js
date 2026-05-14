Page({
  data: {
    selection: null,
    serviceAddress: '',
    contactPhone: '',
    note: '',
    showLoginPopup: false,
  },
  async onShow() {
    const app = getApp()
    if (!app.isUserLoggedIn()) {
      this.setData({ showLoginPopup: true })
      return
    }
    const selection = wx.getStorageSync('housekeeping-selection') || null
    if (!selection || !selection.packageId) {
      wx.showToast({ title: '请先选择套餐', icon: 'none' })
      return
    }

    try {
      const isBound = await app.ensureBound()
      if (!isBound) {
        wx.showToast({ title: '请先绑定房屋', icon: 'none' })
        return
      }
      await app.ensureLogin()
      const [bindingsResult, profileResult] = await Promise.all([
        app.request({ url: '/api/mp/bindings' }),
        app.request({ url: '/api/mp/me' }),
      ])
      const approvedBinding = (bindingsResult.data || []).find((item) => item.status === 'APPROVED')
      const profile = profileResult.data || {}
      this.setData({
        selection,
        serviceAddress: (approvedBinding && approvedBinding.roomNo) || this.data.serviceAddress,
        contactPhone: profile.phone || (approvedBinding && approvedBinding.phone) || '',
      })
    } catch (error) {
      app.showError(error, '加载预约信息失败')
    }
  },
  onLoginSuccess() {
    this.setData({ showLoginPopup: false })
    this.onShow()
  },
  onLoginClose() {
    this.setData({ showLoginPopup: false })
  },
  inputPhone(e) {
    this.setData({ contactPhone: e.detail.value })
  },
  inputAddress(e) {
    this.setData({ serviceAddress: e.detail.value })
  },
  inputNote(e) {
    this.setData({ note: e.detail.value })
  },
  async submit() {
    const app = getApp()
    const selection = this.data.selection
    if (!selection) {
      wx.showToast({ title: '预约信息缺失', icon: 'none' })
      return
    }
    if (!this.data.contactPhone || !this.data.serviceAddress) {
      wx.showToast({ title: '请填写地址和电话', icon: 'none' })
      return
    }

    try {
      await app.request({
        url: '/api/mp/housekeeping/orders',
        method: 'POST',
        data: {
          packageId: selection.packageId,
          contactPhone: this.data.contactPhone,
          serviceAddress: this.data.serviceAddress,
          serviceDate: selection.serviceDate,
          serviceTime: selection.serviceTime,
          amount: selection.amount,
          note: this.data.note,
        },
      })
      wx.showToast({ title: '预约已提交', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/order/index' })
      }, 800)
    } catch (error) {
      app.showError(error, '预约失败')
    }
  }
})