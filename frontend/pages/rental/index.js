Page({
  data: {
    rentals: []
  },
  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    const app = getApp()
    try {
      const result = await app.request({ url: '/api/mp/rentals', auth: false })
      this.setData({
        rentals: (result.data || []).map((item) => ({
          id: item.id,
          title: item.title,
          price: item.rent,
          coverUrl: (app.parseRentalImageUrls(item)[0] || ''),
          tags: [item.layout, `${item.area}㎡`, app.getRentalStatusText(item.status)],
          bg: 'linear-gradient(135deg,#E8E4DE,#D5CFC5)',
        })),
      })
    } catch (error) {
      app.showError(error, '加载房源失败')
    }
  },
  goPublish() {
    wx.navigateTo({ url: '/pages/rental/publish' })
  },
  goManage() {
    wx.navigateTo({ url: '/pages/rental/manage' })
  },
  goDetail(e) {
    wx.navigateTo({ url: `/pages/rental/detail?id=${e.currentTarget.dataset.id}` })
  }
})