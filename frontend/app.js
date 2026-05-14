const SESSION_KEY = 'property-mp-session'
// const API_BASE_URL = 'http://192.168.1.211:3000'
// const API_BASE_URL = 'https://6sr8wc135175.vicp.fun'
const API_BASE_URL = 'https://2928ec4e.r3.cpolar.cn'
const MIME_TYPE_MAP = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

App({
  onLaunch() {
    this.hydrateSession()
    this.ensureLogin().catch(() => {})
  },
  globalData: {
    apiBaseUrl: API_BASE_URL,
    session: null,
    loginPromise: null,
  },
  hydrateSession() {
    try {
      const session = wx.getStorageSync(SESSION_KEY)
      if (session && session.token) {
        this.globalData.session = session
      }
    } catch {
      this.globalData.session = null
    }
  },
  setSession(session) {
    this.globalData.session = session
    wx.setStorageSync(SESSION_KEY, session)
  },
  clearSession() {
    this.globalData.session = null
    wx.removeStorageSync(SESSION_KEY)
  },
  rawRequest({ url, method = 'GET', data, header = {} }) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.globalData.apiBaseUrl}${url}`,
        method,
        data,
        header,
        success: (response) => {
          const payload = response.data || {}
          if (response.statusCode >= 200 && response.statusCode < 300 && payload.success !== false) {
            resolve(payload)
            return
          }
          reject({
            statusCode: response.statusCode,
            message: payload.message || '请求失败',
            data: payload,
          })
        },
        fail: (error) => {
          reject({
            message: error.errMsg || '网络请求失败',
          })
        },
      })
    })
  },
  async request({ url, method = 'GET', data, auth = true, retry = true }) {
    const token = this.globalData.session && this.globalData.session.token
    const header = auth && token ? { Authorization: `Bearer ${token}` } : {}

    try {
      return await this.rawRequest({ url, method, data, header })
    } catch (error) {
      if (auth && retry && error && error.statusCode === 401) {
        await this.ensureLogin(true)
        return this.request({ url, method, data, auth, retry: false })
      }
      throw error
    }
  },
  ensureLogin(forceRefresh) {
    if (!forceRefresh && this.globalData.session && this.globalData.session.token) {
      return Promise.resolve(this.globalData.session)
    }
    if (this.globalData.loginPromise) {
      return this.globalData.loginPromise
    }

    this.globalData.loginPromise = new Promise((resolve, reject) => {
      wx.login({
        success: async (loginResult) => {
          try {
            const result = await this.rawRequest({
              url: '/api/mp/auth/login',
              method: 'POST',
              data: { code: loginResult.code || 'demo-code' },
            })
            const session = {
              token: result.data.token,
              user: result.data.user,
              requiresBinding: !!result.data.requiresBinding,
            }
            this.setSession(session)
            resolve(session)
          } catch (error) {
            this.clearSession()
            reject(error)
          } finally {
            this.globalData.loginPromise = null
          }
        },
        fail: async () => {
          try {
            const result = await this.rawRequest({
              url: '/api/mp/auth/login',
              method: 'POST',
              data: { code: 'demo-code' },
            })
            const session = {
              token: result.data.token,
              user: result.data.user,
              requiresBinding: !!result.data.requiresBinding,
            }
            this.setSession(session)
            resolve(session)
          } catch (error) {
            this.clearSession()
            reject(error)
          } finally {
            this.globalData.loginPromise = null
          }
        },
      })
    })

    return this.globalData.loginPromise
  },
  async refreshProfile() {
    const result = await this.request({ url: '/api/mp/me' })
    const bound = Boolean(result.data && result.data.boundHouseId && String(result.data.boundHouseId).trim())
    const session = Object.assign({}, this.globalData.session || {}, {
      user: result.data,
      requiresBinding: !bound,
    })
    this.setSession(session)
    return session.user
  },
  isUserLoggedIn() {
    const s = this.globalData.session
    return !!(s && s.token && s.user && s.user.phone)
  },
  async ensureBound() {
    await this.ensureLogin()
    const user = await this.refreshProfile()
    return Boolean(user.boundHouseId && String(user.boundHouseId).trim())
  },
  showError(error, fallbackMessage) {
    const title = (error && error.message) || fallbackMessage || '操作失败'
    wx.showToast({
      title: String(title).slice(0, 18),
      icon: 'none',
    })
  },
  /** 将接口返回的 ISO 时间转为本地可读：YYYY-MM-DD HH:mm */
  formatDisplayDateTime(value) {
    if (value === undefined || value === null || value === '') {
      return ''
    }
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) {
      return String(value)
    }
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${day} ${h}:${min}`
  },
  /** 仅日期：YYYY-MM-DD */
  formatDisplayDate(value) {
    if (value === undefined || value === null || value === '') {
      return ''
    }
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) {
      return String(value).slice(0, 10)
    }
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },
  getFileExtension(filePath) {
    const match = String(filePath || '').match(/\.([^.\/\\]+)$/)
    return match ? match[1].toLowerCase() : 'png'
  },
  getMimeType(filePath) {
    const extension = this.getFileExtension(filePath)
    return MIME_TYPE_MAP[extension] || 'image/png'
  },
  /**
   * 相册/相机选图（本地临时路径），与发布房源、报修等页共用。
   * @param {{ currentCount?: number; maxCount?: number }} opts
   */
  chooseLocalPhotos(opts = {}) {
    const maxCount = Number(opts.maxCount) > 0 ? Number(opts.maxCount) : 9
    const currentCount = Math.max(0, Number(opts.currentCount) || 0)
    const remain = maxCount - currentCount
    if (remain <= 0) {
      return Promise.resolve([])
    }
    return new Promise((resolve) => {
      wx.chooseImage({
        count: remain,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => resolve(res.tempFilePaths || []),
        fail: () => resolve([]),
      })
    })
  },
  getRepairStatusMeta(status) {
    const mapping = {
      PENDING: { text: '待处理', className: 'bc' },
      PROCESSING: { text: '处理中', className: 'bi' },
      COMPLETED: { text: '已完成', className: 'bd' },
      CANCELLED: { text: '已取消', className: 'bc' },
    }
    return mapping[status] || { text: status || '未知状态', className: 'bc' }
  },
  getHousekeepingStatusMeta(status, paymentStatus) {
    if (paymentStatus === 'PENDING') {
      return { text: '待支付', className: 'bc' }
    }
    const mapping = {
      WAIT_ASSIGN: { text: '待上门', className: 'bi' },
      IN_SERVICE: { text: '服务中', className: 'bi' },
      COMPLETED: { text: '已完成', className: 'bd' },
      CANCELLED: { text: '已取消', className: 'bc' },
    }
    return mapping[status] || { text: status || '未知状态', className: 'bc' }
  },
  getRentalStatusText(status) {
    const mapping = {
      DRAFT: '草稿',
      PUBLISHED: '已发布',
      OFFLINE: '已下架',
    }
    return mapping[status] || (status || '未知状态')
  },
  /** 解析租房记录中的图片 URL 列表：优先 imagesJson，否则 coverImage */
  parseRentalImageUrls(record) {
    if (!record) return []
    let urls = []
    if (record.imagesJson) {
      try {
        const arr = JSON.parse(record.imagesJson)
        if (Array.isArray(arr)) {
          urls = arr.map(String).filter(Boolean)
        }
      } catch (_) {
        /* ignore */
      }
    }
    if (!urls.length && record.coverImage) {
      urls = [String(record.coverImage)]
    }
    const seen = new Set()
    return urls.filter((u) => {
      if (!u || seen.has(u)) return false
      seen.add(u)
      return true
    })
  },
  getVoteTopicStatusText(status) {
    const mapping = {
      DRAFT: '草稿',
      ONGOING: '进行中',
      CLOSED: '已结束',
    }
    return mapping[status] || (status || '未知状态')
  },
  async uploadImage(filePath, directory) {
    if (!filePath) {
      return ''
    }
    await this.ensureLogin()
    const filename = `image.${this.getFileExtension(filePath)}`
    const mimeType = this.getMimeType(filePath)
    const policyResult = await this.request({
      url: '/api/mp/uploads/policy',
      method: 'POST',
      data: {
        directory: directory || 'uploads',
        filename,
        mimeType,
      },
    })
    const policy = policyResult.data || {}

    await new Promise((resolve, reject) => {
      wx.uploadFile({
        url: policy.host,
        filePath,
        name: 'file',
        formData: {
          key: policy.key,
          policy: policy.policy,
          OSSAccessKeyId: policy.accessId,
          signature: policy.signature,
          success_action_status: '200',
          'Content-Type': mimeType,
        },
        success: (response) => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(response)
            return
          }
          reject({ message: '图片上传失败' })
        },
        fail: () => reject({ message: '图片上传失败' }),
      })
    })

    return `${String(policy.host || '').replace(/\/$/, '')}/${policy.key}`
  },
  requestWechatPayment(paymentData) {
    const params = paymentData && paymentData.requestPayment
    if (!params) {
      return Promise.resolve({ mock: true })
    }
    return new Promise((resolve, reject) => {
      wx.requestPayment({
        timeStamp: params.timeStamp,
        nonceStr: params.nonceStr,
        package: params.package,
        signType: params.signType || 'RSA',
        paySign: params.paySign,
        success: resolve,
        fail: reject,
      })
    })
  },
})