Page({
  data: {
    detail: null,
  },
  async onLoad(options) {
    const id = options.id
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      return
    }
    const app = getApp()
    try {
      const result = await app.request({ url: `/api/mp/feedback/${id}` })
      const raw = result.data || {}
      const statusText = raw.status === 'HANDLED' ? '已处理' : '待处理'
      this.setData({
        detail: Object.assign({}, raw, {
          statusText,
          hasReply: Boolean(String(raw.reply || '').trim()),
          createdAtDisplay: app.formatDisplayDateTime(raw.createdAt),
        }),
      })
    } catch (error) {
      app.showError(error, '加载失败')
    }
  },
})
