Page({
  data: {
    loggedIn: false,
    showLoginPopup: false,
    profile: {
      nickname: '新业主用户',
      phone: '',
      boundText: '未绑定房屋',
      bound: false,
    },
    menuGroup1: [
      { name: '房屋管理', sub: '查看绑定状态', path: '/pages/bind/index', iconPath: "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' stroke='currentColor' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z'/%3E%3Cpolyline points='9 22 9 12 15 12 15 22'/%3E%3C/svg%3E", color: 'var(--gold)', bg: 'rgba(197,165,114,.1)', needBind: false },
      { name: '我的账单', sub: '待加载', path: '/pages/bill/index', iconPath: "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' stroke='currentColor' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='2' y='5' width='20' height='14' rx='2'/%3E%3Cline x1='2' y1='10' x2='22' y2='10'/%3E%3C/svg%3E", color: 'var(--blu)', bg: 'rgba(92,126,168,.1)', needBind: true },
      { name: '我的工单', sub: '待加载', path: '/pages/order/index', iconPath: "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' stroke='currentColor' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z'/%3E%3Cpolyline points='14 2 14 8 20 8'/%3E%3C/svg%3E", color: 'var(--org)', bg: 'rgba(196,136,92,.1)', isTab: true, needBind: true }
    ],
    /** 未绑定房屋时，最新一条非「已通过」申请（用于首页级状态提示） */
    bindingBanner: null,
    menuGroup2: [
      { name: '我的房源', sub: '', path: '/pages/rental/manage', iconPath: "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' stroke='currentColor' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 10.5 12 3l9 7.5'/%3E%3Cpath d='M5 9.5V21h14V9.5'/%3E%3Cpath d='M9 21v-6h6v6'/%3E%3C/svg%3E", color: 'var(--org)', bg: 'rgba(196,136,92,.1)', needBind: true },
      { name: '意见反馈', sub: '', path: '/pages/feedback/index', iconPath: "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' stroke='currentColor' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'/%3E%3C/svg%3E", color: 'var(--blu)', bg: 'rgba(92,126,168,.1)', needBind: true },
      { name: '失物招领', sub: '', path: '/pages/lost/index', iconPath: "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' stroke='currentColor' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E", color: 'var(--grn)', bg: 'rgba(92,138,110,.1)', needBind: false },
      { name: '联系客服', sub: '待加载', path: '/pages/cs/index', iconPath: "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' stroke='currentColor' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.88.37 1.85.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.96.33 1.93.57 2.81.7A2 2 0 0122 16.92z'/%3E%3C/svg%3E", color: 'var(--gold)', bg: 'rgba(197,165,114,.1)', needBind: false }
    ]
  },
  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    const app = getApp()
    if (!app.isUserLoggedIn()) {
      this.setData({ loggedIn: false, showLoginPopup: true, bindingBanner: null })
      return
    }
    this.setData({ loggedIn: true })
    try {
      await app.ensureLogin()
      await this.loadProfile()
    } catch (error) {
      app.showError(error, '加载我的页面失败')
    }
  },
  async loadProfile() {
    const app = getApp()
    const user = await app.refreshProfile()
    let dashboard = { pendingBills: 0, repairOrders: 0, housekeepingOrders: 0 }
    if (user.boundHouseId) {
      const dashboardResult = await app.request({ url: '/api/mp/me/dashboard' })
      dashboard = dashboardResult.data
    }
    const customerServiceResult = await app.request({ url: '/api/mp/customer-service', auth: false })

    let bindingBanner = null
    if (!user.boundHouseId) {
      try {
        const latestResult = await app.request({ url: '/api/mp/binding-applications/latest' })
        const la = latestResult.data
        if (la && la.status === 'PENDING') {
          bindingBanner = {
            type: 'pending',
            title: '绑定申请审核中',
            roomLabel: la.roomNo ? `申请房屋：${la.roomNo}` : '已提交绑定申请',
            hint: '工作人员将尽快处理，审核结果将通知您，无需重复提交',
          }
        } else if (la && la.status === 'REJECTED') {
          bindingBanner = {
            type: 'rejected',
            title: '绑定申请未通过',
            roomLabel: la.roomNo ? `${la.roomNo}` : '',
            hint: '请进入「房屋管理」查看说明，可修改后重新提交',
          }
        }
      } catch (_) {}
    }

    this.setData({
      loggedIn: true,
      bindingBanner,
      profile: {
        nickname: user.nickname || '新业主用户',
        phone: user.phone || '',
        bound: !!user.boundHouseId,
        boundText: user.boundHouseId ? '已绑定房屋' : '未绑定房屋',
      },
      menuGroup1: this.data.menuGroup1.map((item) => {
        if (item.name === '房屋管理') {
          let sub = user.boundHouseId ? '已绑定房屋' : '去提交绑定申请'
          if (bindingBanner && bindingBanner.type === 'pending') {
            sub = '审核进行中'
          }
          if (bindingBanner && bindingBanner.type === 'rejected') {
            sub = '上次申请未通过，可重新提交'
          }
          return Object.assign({}, item, { sub })
        }
        if (item.name === '我的账单') {
          return Object.assign({}, item, { sub: `待缴 ${dashboard.pendingBills || 0} 笔` })
        }
        if (item.name === '我的工单') {
          return Object.assign({}, item, { sub: `${(dashboard.repairOrders || 0) + (dashboard.housekeepingOrders || 0)} 个处理中/历史工单` })
        }
        return item
      }),
      menuGroup2: this.data.menuGroup2.map((item) => (
        item.name === '联系客服'
          ? Object.assign({}, item, { sub: (customerServiceResult.data && customerServiceResult.data.phone) || '暂无客服电话' })
          : item
      )),
    })
  },
  showLogin() {
    this.setData({ showLoginPopup: true })
  },
  onLoginSuccess() {
    this.setData({ showLoginPopup: false, loggedIn: true })
    this.loadProfile().catch(() => {})
  },
  onLoginClose() {
    this.setData({ showLoginPopup: false })
  },
  goToBind() {
    wx.navigateTo({ url: '/pages/bind/index' })
  },
  navTo(e) {
    const app = getApp()
    const item = e.currentTarget.dataset.item
    if (!app.isUserLoggedIn()) {
      this.setData({ showLoginPopup: true })
      return
    }
    if (item.needBind && !this.data.profile.bound) {
      wx.showToast({ title: '请先绑定房屋', icon: 'none' })
      setTimeout(() => { wx.navigateTo({ url: '/pages/bind/index' }) }, 500)
      return
    }
    if (item.isTab) {
      wx.switchTab({ url: item.path })
    } else {
      wx.navigateTo({ url: item.path })
    }
  }
})
