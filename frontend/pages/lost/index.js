Page({
  data: {
    form: {
      lostAt: '',
      itemName: '',
      location: '',
      phone: '',
    },
    records: [],
    showLoginPopup: false,
  },
  async onShow() {
    const app = getApp()
    if (!app.isUserLoggedIn()) {
      this.setData({ showLoginPopup: true })
      return
    }
    try {
      await app.ensureLogin()
      const session = app.globalData.session || {}
      const result = await app.request({ url: '/api/mp/lost-found' })
      const statusLabels = { PENDING: '待处理', HANDLED: '已处理' }
      const records = (result.data || []).map((r) => ({
        ...r,
        statusLabel: statusLabels[r.status] || r.status || '—',
      }))
      this.setData({
        'form.lostAt': '',
        'form.phone': (session.user && session.user.phone) || '',
        records,
      })
    } catch (error) {
      app.showError(error, '加载失物招领失败')
    }
  },
  onLoginSuccess() {
    this.setData({ showLoginPopup: false })
    this.onShow()
  },
  onLoginClose() {
    this.setData({ showLoginPopup: false })
  },
  inputField(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`form.${key}`]: e.detail.value })
  },
  async submit() {
    const app = getApp()
    const form = this.data.form
    if (!String(form.lostAt || '').trim() || !form.itemName || !form.location || !form.phone) {
      wx.showToast({ title: '请完整填写信息', icon: 'none' })
      return
    }
    try {
      await app.request({
        url: '/api/mp/lost-found',
        method: 'POST',
        data: {
          ...form,
          lostAt: String(form.lostAt || '').trim(),
        },
      })
      wx.showToast({ title: '已提交，物业会尽快联系您', icon: 'none' });
      await this.onShow()
    } catch (error) {
      app.showError(error, '提交失败')
    }
  },
})