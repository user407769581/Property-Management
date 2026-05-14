Page({
  data: {
    buildingOptions: [],
    buildings: [],
    houseOptions: [],
    rooms: [],
    bIdx: -1,
    rIdx: -1,
    applicantName: '',
    /** 微信授权登录手机号，提交绑定时由服务端写入申请记录 */
    loginPhone: '',
    currentBinding: null,
    latestApplication: null,
    showLoginPopup: false,
    /** 自定义选择面板（替代原生 picker，避免系统深色底栏） */
    sheetOpen: false,
    sheetKind: '',
    sheetList: [],
    sheetSel: 0,
    sheetTitle: '',
  },
  noop() {},
  async onShow() {
    const app = getApp()
    if (!app.isUserLoggedIn()) {
      this.setData({ showLoginPopup: true })
      return
    }
    try {
      await app.ensureLogin()
      await this.loadBindingData()
    } catch (error) {
      app.showError(error, '加载绑定信息失败')
    }
  },
  onLoginSuccess() {
    this.setData({ showLoginPopup: false })
    this.onShow()
  },
  onLoginClose() {
    this.setData({ showLoginPopup: false })
  },
  async loadBindingData() {
    const app = getApp()
    const [buildingsResult, bindingsResult, latestResult, profileResult] = await Promise.all([
      app.request({ url: '/api/mp/buildings', auth: false }),
      app.request({ url: '/api/mp/bindings' }),
      app.request({ url: '/api/mp/binding-applications/latest' }),
      app.request({ url: '/api/mp/me' }),
    ])

    const bindings = bindingsResult.data || []
    const profile = profileResult.data || {}
    const currentBinding = profile.boundHouseId
      ? (bindings.find((item) => item.status === 'APPROVED') || {
          roomNo: '已绑定房屋',
          applicantName: profile.nickname || '',
          phone: profile.phone || '',
        })
      : null
    const latestApplication = profile.boundHouseId
      ? null
      : ((latestResult.data && latestResult.data.status !== 'APPROVED' && latestResult.data) || null)
    const appStatusText = latestApplication
      ? (latestApplication.status === 'PENDING' ? '审核中' : (latestApplication.status === 'REJECTED' ? '审核未通过' : latestApplication.status))
      : ''
    const appBadgeText = latestApplication
      ? (latestApplication.status === 'PENDING' ? '待审核' : (latestApplication.status === 'REJECTED' ? '已驳回' : latestApplication.status))
      : ''
    this.setData({
      buildingOptions: buildingsResult.data || [],
      buildings: (buildingsResult.data || []).map((item) => item.name),
      latestApplication,
      latestApplicationStatusText: appStatusText,
      latestApplicationBadgeText: appBadgeText,
      currentBinding,
      applicantName: currentBinding
        ? currentBinding.applicantName
        : (latestApplication ? latestApplication.applicantName : ''),
      loginPhone: profile.phone || '',
    })
  },
  openBuildingSheet() {
    const { buildings } = this.data
    if (!buildings.length) {
      wx.showToast({ title: '暂无楼号数据', icon: 'none' })
      return
    }
    const bIdx = this.data.bIdx
    this.setData({
      sheetOpen: true,
      sheetKind: 'building',
      sheetList: buildings,
      sheetSel: bIdx >= 0 ? bIdx : 0,
      sheetTitle: '请选择楼号',
    })
  },
  openRoomSheet() {
    if (this.data.bIdx < 0) {
      wx.showToast({ title: '请先选择楼号', icon: 'none' })
      return
    }
    const { rooms } = this.data
    if (!rooms.length) {
      wx.showToast({ title: '暂无户号', icon: 'none' })
      return
    }
    const rIdx = this.data.rIdx
    this.setData({
      sheetOpen: true,
      sheetKind: 'room',
      sheetList: rooms,
      sheetSel: rIdx >= 0 ? rIdx : 0,
      sheetTitle: '请选择户号',
    })
  },
  onSheetPick(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    if (!Number.isNaN(idx)) {
      this.setData({ sheetSel: idx })
    }
  },
  cancelSheet() {
    this.setData({ sheetOpen: false })
  },
  async confirmSheet() {
    const { sheetKind, sheetSel } = this.data
    this.setData({ sheetOpen: false })
    if (sheetKind === 'building') {
      await this.applyBuildingIndex(sheetSel)
    } else if (sheetKind === 'room') {
      this.setData({ rIdx: sheetSel })
    }
  },
  async applyBuildingIndex(index) {
    const selectedBuilding = this.data.buildingOptions[index]
    this.setData({
      bIdx: index,
      rIdx: -1,
      houseOptions: [],
      rooms: [],
    })
    if (!selectedBuilding) {
      return
    }
    const app = getApp()
    try {
      const result = await app.request({
        url: '/api/mp/houses',
        auth: false,
        data: { buildingId: selectedBuilding.id },
      })
      this.setData({
        houseOptions: result.data || [],
        rooms: (result.data || []).map((item) => item.roomNo),
      })
    } catch (error) {
      app.showError(error, '加载房屋失败')
    }
  },
  inputName(e) {
    this.setData({ applicantName: e.detail.value })
  },
  async unbindCurrent() {
    const currentBinding = this.data.currentBinding
    if (!currentBinding || !currentBinding.id) {
      wx.showToast({ title: '暂无可解绑记录', icon: 'none' })
      return
    }
    const confirmResult = await new Promise((resolve) => {
      wx.showModal({
        title: '确认解绑',
        content: '解绑后将失去业主相关功能权限，是否继续？',
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
        url: `/api/mp/bindings/${currentBinding.id}/unbind`,
        method: 'POST',
      })
      await app.refreshProfile()
      wx.showToast({ title: '解绑成功', icon: 'success' })
      await this.loadBindingData()
    } catch (error) {
      app.showError(error, '解绑失败')
    }
  },
  async submit() {
    const app = getApp()
    const building = this.data.buildingOptions[this.data.bIdx]
    const house = this.data.houseOptions[this.data.rIdx]

    if (!building || !house) {
      wx.showToast({ title: '请选择楼号和户号', icon: 'none' })
      return
    }
    if (!this.data.applicantName) {
      wx.showToast({ title: '请填写真实姓名', icon: 'none' })
      return
    }
    if (!this.data.loginPhone) {
      wx.showToast({ title: '请先使用手机号登录小程序', icon: 'none' })
      return
    }

    try {
      await app.request({
        url: '/api/mp/binding-applications',
        method: 'POST',
        data: {
          buildingId: building.id,
          roomNo: house.roomNo,
          applicantName: this.data.applicantName,
        },
      })
      wx.showToast({ title: '绑定申请已提交', icon: 'none' })
      await this.loadBindingData()
      setTimeout(() => {
        wx.navigateBack()
      }, 800)
    } catch (error) {
      app.showError(error, '提交失败')
    }
  },
})