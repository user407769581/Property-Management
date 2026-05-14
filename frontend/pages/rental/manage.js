Page({
  data: {
    showLoginPopup: false,
    rentals: [],
  },
  async onShow() {
    const app = getApp()
    if (!app.isUserLoggedIn()) {
      this.setData({ showLoginPopup: true })
      return
    }
    try {
      const isBound = await app.ensureBound()
      if (!isBound) {
        this.setData({ rentals: [] })
        return
      }
      const result = await app.request({ url: '/api/mp/my/rentals' })
      this.setData({
        rentals: (result.data || []).map((item) => ({
          id: item.id,
          title: item.title,
          address: item.address,
          price: item.rent,
          status: item.status,
          statusText: app.getRentalStatusText(item.status),
          coverUrl: app.parseRentalImageUrls(item)[0] || '',
        })),
      })
    } catch (error) {
      app.showError(error, '加载我的房源失败')
    }
  },
  onLoginSuccess() {
    this.setData({ showLoginPopup: false })
    this.onShow()
  },
  onLoginClose() {
    this.setData({ showLoginPopup: false })
  },
  async changeStatus(e) {
    const { id, action } = e.currentTarget.dataset
    const app = getApp()
    const url = action === 'publish'
      ? `/api/mp/rentals/${id}/publish`
      : `/api/mp/rentals/${id}/unpublish`
    try {
      await app.request({ url, method: 'POST' })
      wx.showToast({ title: action === 'publish' ? '已发布' : '已下架', icon: 'success' })
      await this.onShow()
    } catch (error) {
      app.showError(error, '操作失败')
    }
  },
  async removeRental(e) {
    const id = e.currentTarget.dataset.id
    const confirmResult = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: '删除后不可恢复，是否继续？',
        success: resolve,
        fail: () => resolve({ confirm: false }),
      })
    })
    if (!confirmResult.confirm) {
      return
    }
    const app = getApp()
    try {
      await app.request({
        url: `/api/mp/rentals/${id}`,
        method: 'DELETE',
      })
      wx.showToast({ title: '删除成功', icon: 'success' })
      await this.onShow()
    } catch (error) {
      app.showError(error, '删除失败')
    }
  },
})
