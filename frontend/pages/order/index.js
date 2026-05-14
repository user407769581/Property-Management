/** @typedef {'pending' | 'processing' | 'completed' | 'cancelled'} FilterBucket */

const FILTER_TABS = ['全部', '待处理', '处理中', '已完成', '已取消']

/**
 * @param {string} tabLabel
 * @returns {FilterBucket | null} null 表示「全部」
 */
function tabToBucket(tabLabel) {
  const map = {
    待处理: 'pending',
    处理中: 'processing',
    已完成: 'completed',
    已取消: 'cancelled',
  }
  return map[tabLabel] ?? null
}

function repairFilterBucket(status) {
  const s = String(status || '')
  if (s === 'PENDING') return 'pending'
  if (s === 'PROCESSING') return 'processing'
  if (s === 'COMPLETED') return 'completed'
  if (s === 'CANCELLED') return 'cancelled'
  return 'pending'
}

function housekeepingFilterBucket(status, paymentStatus) {
  if (String(paymentStatus || '') === 'PENDING') return 'pending'
  const s = String(status || '')
  if (s === 'WAIT_ASSIGN') return 'pending'
  if (s === 'IN_SERVICE') return 'processing'
  if (s === 'COMPLETED') return 'completed'
  if (s === 'CANCELLED') return 'cancelled'
  return 'pending'
}

function feedbackFilterBucket(status) {
  const s = String(status || '')
  if (s === 'HANDLED') return 'completed'
  return 'pending'
}

function lostFoundFilterBucket(status) {
  const s = String(status || '')
  if (s === 'HANDLED') return 'completed'
  return 'pending'
}

function feedbackStatusMeta(status) {
  const s = String(status || '')
  if (s === 'HANDLED') return { text: '已处理', className: 'bd' }
  return { text: '待处理', className: 'bc' }
}

function lostFoundStatusMeta(status) {
  const s = String(status || '')
  if (s === 'HANDLED') return { text: '已处理', className: 'bd' }
  return { text: '待处理', className: 'bc' }
}

Page({
  data: {
    filters: FILTER_TABS,
    activeFilter: 0,
    orders: [],
    displayOrders: [],
    showLoginPopup: false,
  },
  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    const app = getApp()
    if (!app.isUserLoggedIn()) {
      this.setData({ showLoginPopup: true })
      return
    }
    try {
      const isBound = await app.ensureBound()
      if (!isBound) {
        this.setData({ orders: [], displayOrders: [] })
        return
      }
      await this.loadOrders()
    } catch (error) {
      app.showError(error, '加载工单失败')
    }
  },
  onLoginSuccess() {
    this.setData({ showLoginPopup: false })
    this.onShow()
  },
  onLoginClose() {
    this.setData({ showLoginPopup: false })
  },
  async loadOrders() {
    const app = getApp()
    const listDate = (iso) => {
      const d = app.formatDisplayDate(iso)
      return d.length >= 10 ? d.slice(5) : d
    }
    const [repairResult, housekeepingResult, feedbackResult, lostResult] = await Promise.all([
      app.request({ url: '/api/mp/repair-orders' }),
      app.request({ url: '/api/mp/housekeeping/orders' }),
      app.request({ url: '/api/mp/feedback' }),
      app.request({ url: '/api/mp/lost-found' }),
    ])

    const orders = []
      .concat((repairResult.data || []).map((item) => {
        const meta = app.getRepairStatusMeta(item.status)
        return {
          rowKey: `repair-${item.id}`,
          statusMeta: meta,
          id: item.id,
          type: 'repair',
          filterBucket: repairFilterBucket(item.status),
          title: item.description || '报修工单',
          sub: `${item.orderNo} · 报修`,
          rawStatus: item.status,
          status: meta.text,
          statusClass: meta.className,
          date: listDate(item.createdAt),
          icon: 'icon-repair',
          color: 'var(--gold)',
          bg: 'rgba(197,165,114,.1)',
          link: `/pages/order/detail?id=${item.id}&type=repair`,
        }
      }))
      .concat((housekeepingResult.data || []).map((item) => {
        const meta = app.getHousekeepingStatusMeta(item.status, item.paymentStatus)
        return {
          rowKey: `housekeeping-${item.id}`,
          statusMeta: meta,
          id: item.id,
          type: 'housekeeping',
          filterBucket: housekeepingFilterBucket(item.status, item.paymentStatus),
          title: item.serviceAddress || '家政预约',
          sub: `${item.orderNo} · 家政`,
          rawStatus: item.status,
          status: meta.text,
          statusClass: meta.className,
          date: listDate(item.createdAt),
          icon: 'icon-hk',
          color: 'var(--grn)',
          bg: 'rgba(92,138,110,.1)',
          link: `/pages/housekeeping/detail?id=${item.id}`,
        }
      }))
      .concat((feedbackResult.data || []).map((item) => {
        const meta = feedbackStatusMeta(item.status)
        const preview = String(item.content || '').replace(/\s+/g, ' ').trim().slice(0, 24)
        return {
          rowKey: `feedback-${item.id}`,
          statusMeta: meta,
          id: item.id,
          type: 'feedback',
          filterBucket: feedbackFilterBucket(item.status),
          title: preview ? `${preview}${String(item.content || '').length > 24 ? '…' : ''}` : '意见反馈',
          sub: item.orderNo ? `${item.orderNo} · 意见反馈` : '意见反馈',
          rawStatus: item.status,
          status: meta.text,
          statusClass: meta.className,
          date: listDate(item.createdAt),
          icon: 'icon-feedback',
          color: 'var(--blu)',
          bg: 'rgba(92,126,168,.1)',
          link: `/pages/feedback/detail?id=${item.id}`,
        }
      }))
      .concat((lostResult.data || []).map((item) => {
        const meta = lostFoundStatusMeta(item.status)
        return {
          rowKey: `lost-${item.id}`,
          statusMeta: meta,
          id: item.id,
          type: 'lost',
          filterBucket: lostFoundFilterBucket(item.status),
          title: item.itemName || '失物登记',
          sub: item.orderNo ? `${item.orderNo} · 失物招领` : '失物招领',
          rawStatus: item.status,
          status: meta.text,
          statusClass: meta.className,
          date: listDate(item.createdAt),
          icon: 'icon-lost',
          color: 'var(--org)',
          bg: 'rgba(196,136,92,.1)',
          link: `/pages/lost/detail?id=${item.id}`,
        }
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))

    this.setData({ orders }, this.applyFilter)
  },
  switchFilter(e) {
    this.setData({ activeFilter: e.currentTarget.dataset.index }, this.applyFilter)
  },
  applyFilter() {
    const tabLabel = this.data.filters[this.data.activeFilter]
    const bucket = tabToBucket(tabLabel)
    const displayOrders = bucket
      ? this.data.orders.filter((item) => item.filterBucket === bucket)
      : this.data.orders
    this.setData({ displayOrders })
  },
  goDetail(e) {
    const link = e.currentTarget.dataset.link
    if (link) {
      wx.navigateTo({ url: link })
    }
  },
})
