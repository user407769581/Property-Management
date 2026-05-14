Component({
  properties: {
    show: { type: Boolean, value: false },
    /** 为 true 时整体上移，避开自定义 tabBar（仅 tab 页需要） */
    liftForTabBar: { type: Boolean, value: false },
  },
  methods: {
    noop() {},
    onMaskTap() {
      this.triggerEvent('close')
    },
    onClose() {
      this.triggerEvent('close')
    },
    async onGetPhoneNumber(e) {
      if (e.detail.errMsg !== 'getPhoneNumber:ok') {
        return
      }
      const app = getApp()
      try {
        wx.showLoading({ title: '登录中…', mask: true })
        await app.ensureLogin()
        const result = await app.request({
          url: '/api/mp/auth/phone',
          method: 'POST',
          data: { code: e.detail.code },
        })
        const bound = Boolean(result.data && result.data.boundHouseId && String(result.data.boundHouseId).trim())
        const session = Object.assign({}, app.globalData.session, {
          user: result.data,
          requiresBinding: !bound,
        })
        app.setSession(session)
        wx.hideLoading()
        this.triggerEvent('login', { user: result.data })
      } catch (error) {
        wx.hideLoading()
        app.showError(error, '登录失败')
      }
    },
  },
})
