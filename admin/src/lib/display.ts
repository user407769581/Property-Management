const ENUM_LABEL_MAP: Record<string, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
  IDLE: '空置',
  BOUND: '已绑定',
  UNBOUND: '已解绑',
  PENDING: '待处理',
  HANDLED: '已处理',
  REPLIED: '已回复',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  PROCESSING: '处理中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  WAIT_ASSIGN: '待上门',
  IN_SERVICE: '服务中',
  PAID: '已支付',
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  OFFLINE: '已下架',
  ONGOING: '进行中',
  SUCCESS: '成功',
  REPAIR: '维修服务',
  HOUSEKEEPING: '家政服务',
  super_admin: '超级管理员',
  front_desk: '前台账号',
}

const FIELD_ENUM_LABEL_MAP: Record<string, Record<string, string>> = {
  role: {
    super_admin: '超级管理员',
    front_desk: '前台账号',
    REPAIR: '维修服务',
    HOUSEKEEPING: '家政服务',
  },
  paymentStatus: {
    PENDING: '待支付',
    PAID: '已支付',
    OFFLINE: '前台预约',
    FAILED: '支付失败',
  },
  module: {
    auth: '认证',
    account: '账号',
    accounts: '账号',
    repair: '报修',
    housekeeping: '家政',
    bill: '账单',
    announcement: '公告',
    vote: '投票',
    feedback: '反馈',
    lost_found: '失物招领',
    system: '系统',
  },
  action: {
    LOGIN: '登录',
    LOGOUT: '退出登录',
    CREATE: '创建',
    UPDATE: '更新',
    DELETE: '删除',
    ASSIGN: '派单',
    REASSIGN: '改派',
    COMPLETE: '完成',
    APPROVE: '通过',
    REJECT: '驳回',
  },
}

export function formatEnumLabel(value: unknown, fieldKey?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  if (fieldKey && FIELD_ENUM_LABEL_MAP[fieldKey]?.[value]) {
    return FIELD_ENUM_LABEL_MAP[fieldKey][value]
  }
  return ENUM_LABEL_MAP[value]
}

const DATE_FIELD_KEYS = new Set(['createdAt', 'updatedAt', 'paidAt'])

const pad = (value: number) => String(value).padStart(2, '0')

export function formatDateTime(value: unknown, fieldKey?: string): string | undefined {
  if (typeof value !== 'string' || !value) {
    return undefined
  }
  const shouldFormat = fieldKey ? DATE_FIELD_KEYS.has(fieldKey) : false
  if (!shouldFormat) {
    return undefined
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
