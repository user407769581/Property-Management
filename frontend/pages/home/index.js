Page({
  data: {
    banners: [],
    recentOrders: [],
    announcements: [],
    unreadCount: 0,
    showLoginPopup: false,
    loggedIn: false,
    bound: false,
    mockServices: [
      { id: 'pBind', name: '绑定房屋', sub: '尊享专属服务', color: '#C4885C', bg: '#FFF8ED', iconKey: 'bind', needLogin: true, needBind: false },
      { id: 'pRep', name: '报事报修', sub: '极速上门维修', color: '#5C8A6E', bg: '#F2F8F5', iconKey: 'rep', needLogin: true, needBind: true },
      { id: 'pBill', name: '物业缴费', sub: '在线便捷支付', color: '#5C7EA8', bg: '#F0F4FA', iconKey: 'bill', needLogin: true, needBind: true },
      { id: 'pR', name: '租房信息', sub: '海量真实房源', color: '#C45C5C', bg: '#FCF4F4', iconKey: 'rental', needLogin: false, needBind: false },
      { id: 'pHk', name: '家政预约', sub: '专业清洁服务', color: '#5C8A6E', bg: '#F2F8F5', iconKey: 'hk', needLogin: true, needBind: true },
      { id: 'openDoor', name: '门禁开锁', sub: '手机一键开门', color: '#C5A572', bg: '#F8F6F3', iconKey: 'lock', needLogin: true, needBind: true },
      { id: 'pLost', name: '失物招领', sub: '找回遗失物品', color: '#5C7EA8', bg: '#F0F4FA', iconKey: 'lost', needLogin: true, needBind: false },
      { id: 'pFb', name: '意见反馈', sub: '倾听您的声音', color: '#C45C5C', bg: '#FCF4F4', iconKey: 'fb', needLogin: true, needBind: true }
    ]
  },
  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    const app = getApp()
    const loggedIn = app.isUserLoggedIn()
    if (loggedIn) {
      try {
        await app.refreshProfile()
      } catch (_) {}
    }
    const session = app.globalData.session || {}
    const bound = loggedIn && !session.requiresBinding
    this.setData({ loggedIn, bound })
    try {
      await this.loadHomeData()
    } catch (error) {
      app.showError(error, '加载首页失败')
    }
  },
  async loadHomeData() {
    const app = getApp()
    const publicRequests = [
      app.request({ url: '/api/mp/home/banners', auth: false }),
      app.request({ url: '/api/mp/announcements', auth: false }),
    ]
    const [bannerResult, announcementResult] = await Promise.all(publicRequests)

    let unreadCount = 0
    let recentOrders = []

    if (this.data.loggedIn) {
      try {
        const notificationResult = await app.request({ url: '/api/mp/notifications' })
        unreadCount = (notificationResult.data || []).filter((item) => !item.read).length
      } catch (_) {}

      if (this.data.bound) {
        try {
          const listDate = (iso) => {
            const d = app.formatDisplayDate(iso)
            return d.length >= 10 ? d.slice(5) : d
          }
          const [repairResult, housekeepingResult] = await Promise.all([
            app.request({ url: '/api/mp/repair-orders' }),
            app.request({ url: '/api/mp/housekeeping/orders' }),
          ])
          recentOrders = []
            .concat((repairResult.data || []).map((item) => ({
              statusMeta: app.getRepairStatusMeta(item.status),
              id: item.id,
              title: item.description || '报修工单',
              sub: item.orderNo,
              status: app.getRepairStatusMeta(item.status).text,
              statusClass: app.getRepairStatusMeta(item.status).className,
              date: listDate(item.createdAt),
              icon: 'icon-repair',
              color: 'var(--gold)',
              bg: 'rgba(197,165,114,.1)',
              link: `/pages/order/detail?id=${item.id}&type=repair`,
            })))
            .concat((housekeepingResult.data || []).map((item) => ({
              statusMeta: app.getHousekeepingStatusMeta(item.status, item.paymentStatus),
              id: item.id,
              title: item.serviceAddress || '家政订单',
              sub: item.orderNo,
              status: app.getHousekeepingStatusMeta(item.status, item.paymentStatus).text,
              statusClass: app.getHousekeepingStatusMeta(item.status, item.paymentStatus).className,
              date: listDate(item.createdAt),
              icon: 'icon-housekeeping',
              color: 'var(--grn)',
              bg: 'rgba(92,138,110,.1)',
              link: `/pages/housekeeping/detail?id=${item.id}`,
            })))
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .slice(0, 2)
        } catch (_) {}
      }
    }

    this.setData({
      banners: (bannerResult.data || []).map((item) => ({
        id: item.id,
        coverImage: item.coverImage || '',
      })),
      announcements: (announcementResult.data || []).slice(0, 2).map((item) => ({
        id: item.id,
        date: app.formatDisplayDate(item.createdAt),
        title: item.title,
      })),
      unreadCount,
      recentOrders,
    })
  },
  onLoginSuccess() {
    const app = getApp()
    const session = app.globalData.session || {}
    this.setData({
      showLoginPopup: false,
      loggedIn: true,
      bound: !session.requiresBinding,
    })
    this.loadHomeData().catch(() => {})
  },
  onLoginClose() {
    this.setData({ showLoginPopup: false })
  },
  navTo(e) {
    const id = e.currentTarget.dataset.id
    const app = getApp()

    if (id === 'openDoor') {
      wx.showToast({ title: '功能开发中...', icon: 'none' })
      return
    }
    if (id === 'pR') {
      wx.switchTab({ url: '/pages/rental/index' })
      return
    }

    const service = this.data.mockServices.find((s) => s.id === id)
    if (service && service.needLogin && !app.isUserLoggedIn()) {
      this.setData({ showLoginPopup: true })
      return
    }
    if (service && service.needBind && !this.data.bound) {
      wx.showToast({ title: '请先绑定房屋', icon: 'none' })
      setTimeout(() => { wx.navigateTo({ url: '/pages/bind/index' }) }, 500)
      return
    }

    const pageMap = {
      'pBind': '/pages/bind/index',
      'pRep': '/pages/repair/index',
      'pBill': '/pages/bill/index',
      'pHk': '/pages/housekeeping/index',
      'pLost': '/pages/lost/index',
      'pFb': '/pages/feedback/index',
      'pMsg': '/pages/message/index',
      'pAnn': '/pages/announce/index',
      'pW': '/pages/order/index'
    }
    if (pageMap[id]) {
      wx.navigateTo({ url: pageMap[id] })
    } else if (id === 'pAnnd') {
      const announcementId = e.currentTarget.dataset.announcementId
      if (announcementId) {
        wx.navigateTo({ url: `/pages/announce/detail?id=${announcementId}` })
      }
    } else if (id === 'pOd' || id === 'pHkd') {
      const link = e.currentTarget.dataset.link
      if (link) {
        wx.navigateTo({ url: link })
      }
    }
  }
})
