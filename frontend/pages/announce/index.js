Page({
  data: {
    announcements: []
  },
  async onShow() {
    const app = getApp()
    try {
      const result = await app.request({ url: '/api/mp/announcements', auth: false })
      this.setData({
        announcements: (result.data || []).map((item) => ({
          id: item.id,
          date: app.formatDisplayDate(item.createdAt),
          title: item.title,
          desc: String(item.content || '').replace(/<[^>]+>/g, '').slice(0, 60),
        })),
      })
    } catch (error) {
      app.showError(error, '加载公告失败')
    }
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/announce/detail?id=${id}` })
  }
})