const MAX_PHOTOS = 9

Page({
  data: {
    showLoginPopup: false,
    types: ['一室一厅', '两室一厅', '三室一厅', '三室两厅'],
    typeIdx: 1,
    /** 本地临时路径，可多张 */
    photoPaths: [],
    form: {
      title: '',
      rent: '',
      area: '',
      layout: '两室一厅',
      address: '已绑定房屋',
      phone: '',
    }
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
      const [bindingsResult, profileResult] = await Promise.all([
        app.request({ url: '/api/mp/bindings' }),
        app.request({ url: '/api/mp/me' }),
      ])
      const approvedBinding = (bindingsResult.data || []).find((item) => item.status === 'APPROVED')
      const profile = profileResult.data || {}
      this.setData({
        'form.phone': profile.phone || '',
        'form.address': (approvedBinding && approvedBinding.roomNo) || this.data.form.address,
      })
    } catch (error) {
      app.showError(error, '加载发布页失败')
    }
  },
  onLoginSuccess() {
    this.setData({ showLoginPopup: false })
    this.onShow()
  },
  onLoginClose() {
    this.setData({ showLoginPopup: false })
  },
  bindType(e) {
    const typeIdx = Number(e.detail.value)
    this.setData({
      typeIdx,
      'form.layout': this.data.types[typeIdx],
    })
  },
  inputField(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`form.${key}`]: e.detail.value })
  },
  async addPhoto() {
    const app = getApp()
    const remain = MAX_PHOTOS - this.data.photoPaths.length
    if (remain <= 0) {
      wx.showToast({ title: '最多9张图片', icon: 'none' })
      return
    }
    const more = await app.chooseLocalPhotos({ currentCount: this.data.photoPaths.length, maxCount: MAX_PHOTOS })
    if (!more.length) return
    this.setData({ photoPaths: [...this.data.photoPaths, ...more].slice(0, MAX_PHOTOS) })
  },
  removePhoto(e) {
    const i = Number(e.currentTarget.dataset.i)
    if (Number.isNaN(i)) return
    const photoPaths = this.data.photoPaths.filter((_, j) => j !== i)
    this.setData({ photoPaths })
  },
  async submit() {
    const app = getApp()
    const form = this.data.form
    if (!form.title || !form.rent || !form.area || !form.phone) {
      wx.showToast({ title: '请完整填写房源信息', icon: 'none' })
      return
    }
    try {
      const paths = this.data.photoPaths || []
      const urls = []
      for (let p = 0; p < paths.length; p += 1) {
        urls.push(await app.uploadImage(paths[p], 'rentals'))
      }
      const coverImage = urls[0] || ''
      const imagesJson = urls.length ? JSON.stringify(urls) : ''
      const createResult = await app.request({
        url: '/api/mp/rentals',
        method: 'POST',
        data: {
          title: form.title,
          address: form.address,
          rent: Number(form.rent),
          area: Number(form.area),
          layout: form.layout,
          phone: form.phone,
          coverImage,
          imagesJson,
        },
      })
      await app.request({
        url: `/api/mp/rentals/${createResult.data.id}/publish`,
        method: 'POST',
      })
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => { wx.navigateBack() }, 800);
    } catch (error) {
      app.showError(error, '发布失败')
    }
  }
})