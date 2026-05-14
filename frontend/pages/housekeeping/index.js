Page({
  data: {
    packages: []
  },
  async onShow() {
    const app = getApp()
    try {
      const result = await app.request({ url: '/api/mp/housekeeping/packages', auth: false })
      this.setData({
        packages: (result.data || []).map((item, index) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          dur: `${item.durationHours}小时`,
          desc: item.description,
          sel: index === 0,
        })),
      })
    } catch (error) {
      app.showError(error, '加载套餐失败')
    }
  },
  selectPkg(e) {
    const idx = e.currentTarget.dataset.idx;
    const pkgs = this.data.packages.map((p, i) => ({ ...p, sel: i === idx }));
    this.setData({ packages: pkgs });
  },
  goNext() {
    const selectedPackage = this.data.packages.find((item) => item.sel)
    if (!selectedPackage) {
      wx.showToast({ title: '请选择套餐', icon: 'none' })
      return
    }
    wx.setStorageSync('housekeeping-selection', {
      packageId: selectedPackage.id,
      packageName: selectedPackage.name,
      amount: selectedPackage.price,
      durationText: selectedPackage.dur,
    })
    wx.navigateTo({ url: '/pages/housekeeping/time' });
  }
})