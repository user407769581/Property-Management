function billStatusText(status) {
  const map = {
    PENDING: '待缴费',
    PAID: '已缴费',
    OVERDUE: '已逾期',
    CANCELLED: '已取消',
  }
  return map[status] || status || '—'
}

Page({
  data: {
    showLoginPopup: false,
    bills: [],
    totalCount: 0,
    totalAmount: 0,
    /** 接口返回的全部待缴总额（顶部卡片） */
    summaryAmount: 0,
    /** 待缴笔数（PENDING），用于全选展示 */
    pendingBillCount: 0,
    /** 是否已全选所有待缴 */
    selectAllChecked: false,
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
      await this.loadBills()
    } catch (error) {
      app.showError(error, '加载账单失败')
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
  goPaidHistory() {
    wx.navigateTo({ url: '/pages/bill/history' })
  },
  async loadBills() {
    const app = getApp()
    const [billResult, summaryResult] = await Promise.all([
      app.request({ url: '/api/mp/bills' }),
      app.request({ url: '/api/mp/bills/summary' }),
    ])
    const bills = (billResult.data || []).map((item) => ({
      id: item.id,
      month: item.month,
      sub: item.title,
      subClass: item.status === 'PENDING' ? 'var(--red)' : 'var(--g5)',
      amount: Number(item.amount || 0),
      checked: false,
      status: item.status,
      statusText: billStatusText(item.status),
    }))
    const summaryAmount = Number(summaryResult.data.totalAmount || 0)
    this.setData(
      {
        bills,
        summaryAmount,
      },
      this.calcTotal,
    )
  },
  toggleCheck(e) {
    const billId = e.currentTarget.dataset.id
    const idx = this.data.bills.findIndex((b) => String(b.id) === String(billId))
    if (idx < 0) {
      return
    }
    const row = this.data.bills[idx]
    if (row.status !== 'PENDING') {
      return
    }
    const key = `bills[${idx}].checked`
    this.setData({ [key]: !row.checked }, this.calcTotal)
  },
  toggleSelectAll() {
    const bills = this.data.bills
    const pending = bills.filter((b) => b.status === 'PENDING')
    if (!pending.length) {
      return
    }
    const allOn = pending.every((b) => b.checked)
    const next = !allOn
    const updates = {}
    bills.forEach((b, i) => {
      if (b.status === 'PENDING') {
        updates[`bills[${i}].checked`] = next
      }
    })
    this.setData(updates, this.calcTotal)
  },
  calcTotal() {
    let count = 0
    let amount = 0
    const bills = this.data.bills
    bills.forEach((b) => {
      if (b.checked && b.status === 'PENDING') {
        count++
        amount += Number(b.amount)
      }
    })
    const pending = bills.filter((b) => b.status === 'PENDING')
    const selectAllChecked = pending.length > 0 && pending.every((b) => b.checked)
    this.setData({
      totalCount: count,
      totalAmount: amount,
      pendingBillCount: pending.length,
      selectAllChecked,
    })
  },
  async submit() {
    if (this.data.totalCount === 0) return wx.showToast({ title: '请选择账单', icon: 'none' });
    const app = getApp()
    try {
      const billIds = this.data.bills.filter(item => item.checked && item.status === 'PENDING').map(item => item.id)
      const previewResult = await app.request({
        url: '/api/mp/payments/preview',
        method: 'POST',
        data: { billIds },
      })
      const totalAmount = Number((previewResult.data && previewResult.data.totalAmount) || 0)
      if (!totalAmount) {
        wx.showToast({ title: '暂无可支付账单', icon: 'none' })
        return
      }
      const modalResult = await new Promise((resolve) => {
        wx.showModal({
          title: '确认缴费',
          content: `本次共支付 ${totalAmount.toFixed(2)} 元`,
          success: resolve,
          fail: () => resolve({ confirm: false }),
        })
      })
      if (!modalResult.confirm) {
        return
      }
      const submitResult = await app.request({
        url: '/api/mp/payments/submit',
        method: 'POST',
        data: {
          businessType: 'property_bill',
          billIds,
        },
      })
      await app.requestWechatPayment(submitResult.data)
      const result = await app.request({ url: `/api/mp/payments/${submitResult.data.orderNo}/result` })
      const paid = result.data && result.data.status === 'SUCCESS'
      wx.showToast({ title: paid ? '缴费成功' : '支付结果确认中', icon: paid ? 'success' : 'none' });
      await this.loadBills()
    } catch (error) {
      app.showError(error, '缴费失败')
    }
  }
})