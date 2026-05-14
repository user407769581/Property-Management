const MAX_REPAIR_PHOTOS = 3

Page({
  data: {
    showLoginPopup: false,
    address: '',
    description: '',
    /** 本地临时路径，与发布房源一致用于 <image> 预览 */
    photoPaths: [],
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
        wx.showToast({ title: '请先绑定房屋', icon: 'none' })
        return
      }
    } catch (error) {
      app.showError(error, '加载报修页失败')
    }
  },
  onLoginSuccess() {
    this.setData({ showLoginPopup: false })
    this.onShow()
  },
  onLoginClose() {
    this.setData({ showLoginPopup: false })
    wx.navigateBack()
  },
  inputAddress(e) {
    this.setData({ address: e.detail.value })
  },
  inputDescription(e) {
    this.setData({ description: e.detail.value })
  },
  async addPhoto() {
    const app = getApp()
    const remain = MAX_REPAIR_PHOTOS - this.data.photoPaths.length
    if (remain <= 0) {
      wx.showToast({ title: `最多${MAX_REPAIR_PHOTOS}张图片`, icon: 'none' })
      return
    }
    const more = await app.chooseLocalPhotos({
      currentCount: this.data.photoPaths.length,
      maxCount: MAX_REPAIR_PHOTOS,
    })
    if (!more.length) return
    this.setData({ photoPaths: [...this.data.photoPaths, ...more].slice(0, MAX_REPAIR_PHOTOS) })
  },
  removePhoto(e) {
    const i = Number(e.currentTarget.dataset.i)
    if (Number.isNaN(i)) return
    const photoPaths = this.data.photoPaths.filter((_, j) => j !== i)
    this.setData({ photoPaths })
  },
  async submit() {
    const app = getApp()
    if (!String(this.data.address || '').trim()) {
      wx.showToast({ title: '请填写上门地址', icon: 'none' })
      return
    }
    if (!this.data.description) {
      wx.showToast({ title: '请填写问题描述', icon: 'none' })
      return
    }
    try {
      const session = app.globalData.session || {}
      const paths = this.data.photoPaths || []
      const imageUrls = []
      for (let p = 0; p < paths.length; p += 1) {
        imageUrls.push(await app.uploadImage(paths[p], 'repair'))
      }
      await app.request({
        url: '/api/mp/repair-orders',
        method: 'POST',
        data: {
          address: String(this.data.address || '').trim(),
          description: this.data.description,
          phone: (session.user && session.user.phone) || '',
          /** 与租房发布一致传 JSON 字符串，避免部分环境下数组序列化异常 */
          imagesJson: JSON.stringify(imageUrls.filter(Boolean)),
        },
      })
      wx.showToast({ title: '工单已提交', icon: 'success' });
      setTimeout(() => { wx.switchTab({ url: '/pages/order/index' }) }, 800);
    } catch (error) {
      app.showError(error, '提交失败')
    }
  }
})