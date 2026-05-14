import {
  AlertOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  BellOutlined,
  BuildOutlined,
  CustomerServiceOutlined,
  FileTextOutlined,
  HomeOutlined,
  IdcardOutlined,
  ScheduleOutlined,
  SettingOutlined,
  ShopOutlined,
  SolutionOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'

export type ResourceFieldType =
  | 'text'
  | 'number'
  | 'textarea'
  | 'upload'
  | 'select'
  | 'remoteSelect'
  | 'voteOptions'

export interface ResourceOption {
  label: string
  value: string
}

export interface ResourceField {
  key: string
  label: string
  type?: ResourceFieldType
  readonly?: boolean
  hiddenInTable?: boolean
  hiddenInForm?: boolean
  required?: boolean
  initialValue?: string | number
  options?: ResourceOption[]
  optionsEndpoint?: string
  optionLabelKey?: string
  optionValueKey?: string
}

export interface ResourceAction {
  key: string
  label: string
  method: 'post' | 'put'
  buildUrl: (row: Record<string, unknown>) => string
  payload?: Record<string, unknown>
  staffSelector?: {
    role: 'REPAIR' | 'HOUSEKEEPING'
    payloadKey: 'maintainerId' | 'housekeeperId'
    title?: string
  }
  /** 返回 false 时不展示该按钮（如已处理则隐藏「处理」） */
  visible?: (row: Record<string, unknown>) => boolean
}

export interface ResourceConfig {
  key: string
  label: string
  icon: ReactNode
  endpoint: string
  fields: ResourceField[]
  description: string
  roles?: string[]
  mode?: 'list' | 'single'
  customMode?: 'bills'
  updateKey?: string
  createDisabled?: boolean
  editDisabled?: boolean
  hideActions?: boolean
  /** 列表行增加「详情」按钮，弹窗浏览完整数据（如租房多图） */
  detailModal?: boolean
  headerActions?: ResourceAction[]
  rowActions?: ResourceAction[]
}

export const resourceConfigs: ResourceConfig[] = [
  {
    key: 'accounts',
    label: '后台账号',
    icon: <UserOutlined />,
    endpoint: '/api/admin/accounts',
    description: '创建和维护前台/管理员账号。',
    roles: ['super_admin'],
    fields: [
      { key: 'username', label: '账号' },
      { key: 'name', label: '姓名' },
      {
        key: 'role',
        label: '角色',
        type: 'select',
        initialValue: 'front_desk',
        options: [
          { label: '超级管理员', value: 'super_admin' },
          { label: '前台账号', value: 'front_desk' },
        ],
      },
      { key: 'password', label: '登录密码', hiddenInTable: true, required: false },
      {
        key: 'status',
        label: '状态',
        type: 'select',
        initialValue: 'ACTIVE',
        options: [
          { label: '启用', value: 'ACTIVE' },
          { label: '停用', value: 'INACTIVE' },
        ],
      },
    ],
  },
  {
    key: 'wechat-users',
    label: '小程序用户',
    icon: <IdcardOutlined />,
    endpoint: '/api/admin/wechat-users',
    description: '已登录小程序的用户列表；手机号为微信授权登录手机号，与绑定申请中存档一致（由系统自动带入）。',
    createDisabled: true,
    editDisabled: true,
    hideActions: true,
    fields: [
      { key: 'nickname', label: '昵称', readonly: true },
      { key: 'phone', label: '登录手机号', readonly: true },
      { key: 'boundHouseLabel', label: '绑定房屋', readonly: true },
      { key: 'createdAt', label: '首次登录', readonly: true },
      { key: 'updatedAt', label: '最近更新', readonly: true },
    ],
  },
  {
    key: 'buildings',
    label: '楼宇管理',
    icon: <ApartmentOutlined />,
    endpoint: '/api/admin/buildings',
    description: '维护楼号、编码和状态。',
    fields: [
      { key: 'name', label: '楼宇名称' },
      { key: 'code', label: '楼宇编码' },
      {
        key: 'status',
        label: '状态',
        type: 'select',
        initialValue: 'ACTIVE',
        options: [
          { label: '启用', value: 'ACTIVE' },
          { label: '停用', value: 'INACTIVE' },
        ],
      },
    ],
  },
  {
    key: 'houses',
    label: '房屋档案',
    icon: <HomeOutlined />,
    endpoint: '/api/admin/houses',
    description: '维护户号、面积和所属业主类型。',
    fields: [
      {
        key: 'buildingId',
        label: '所属楼宇',
        type: 'remoteSelect',
        hiddenInTable: true,
        optionsEndpoint: '/api/admin/buildings',
        optionLabelKey: 'name',
        optionValueKey: 'id',
      },
      { key: 'roomNo', label: '房号' },
      { key: 'area', label: '面积', type: 'number' },
      {
        key: 'ownerTypeId',
        label: '业主类型',
        type: 'remoteSelect',
        hiddenInTable: true,
        optionsEndpoint: '/api/admin/owner-types',
        optionLabelKey: 'name',
        optionValueKey: 'id',
      },
      {
        key: 'status',
        label: '状态',
        type: 'select',
        initialValue: 'IDLE',
        options: [
          { label: '空置', value: 'IDLE' },
          { label: '已绑定', value: 'BOUND' },
        ],
      },
      { key: 'buildingName', label: '楼宇名称', hiddenInForm: true },
      { key: 'ownerTypeName', label: '业主类型名称', hiddenInForm: true },
    ],
  },
  {
    key: 'owner-types',
    label: '业主类型',
    icon: <SolutionOutlined />,
    endpoint: '/api/admin/owner-types',
    description: '可视化配置收费规则，不使用 JSON 录入。',
    fields: [
      { key: 'name', label: '类型名称' },
      { key: 'feeRate', label: '收费倍率', type: 'number' },
      { key: 'baseFee', label: '基础物业费', type: 'number' },
      { key: 'description', label: '说明', type: 'textarea' },
    ],
  },
  {
    key: 'binding-approvals',
    label: '绑定审核',
    icon: <TeamOutlined />,
    endpoint: '/api/admin/binding-applications',
    description: '审核业主绑定申请。',
    createDisabled: true,
    editDisabled: true,
    fields: [
      { key: 'applicantName', label: '申请人' },
      { key: 'phone', label: '手机号' },
      { key: 'buildingId', label: '楼宇ID', hiddenInTable: true, hiddenInForm: true, required: false },
      { key: 'roomNo', label: '房号' },
      { key: 'status', label: '状态' },
    ],
    rowActions: [
      {
        key: 'approve',
        label: '通过',
        method: 'post',
        buildUrl: (row) => `/api/admin/binding-applications/${row.id}/approve`,
      },
      {
        key: 'reject',
        label: '驳回',
        method: 'post',
        buildUrl: (row) => `/api/admin/binding-applications/${row.id}/reject`,
      },
    ],
  },
  {
    key: 'repair-orders',
    label: '报修工单',
    icon: <ToolOutlined />,
    endpoint: '/api/admin/repair-orders',
    description: '查看、派单、改派、办结报修工单。',
    createDisabled: true,
    editDisabled: true,
    fields: [
      { key: 'orderNo', label: '工单号' },
      { key: 'address', label: '地址' },
      { key: 'description', label: '问题描述', type: 'textarea' },
      { key: 'status', label: '状态' },
      {
        key: 'maintainerId',
        label: '服务人员',
        type: 'remoteSelect',
        hiddenInForm: true,
        optionsEndpoint: '/api/admin/service-staff?role=REPAIR',
        optionLabelKey: 'name',
        optionValueKey: 'sourceId',
      },
    ],
    rowActions: [
      {
        key: 'assign',
        label: '派单',
        method: 'post',
        buildUrl: (row) => `/api/admin/repair-orders/${row.id}/assign`,
        staffSelector: {
          role: 'REPAIR',
          payloadKey: 'maintainerId',
          title: '选择维修服务人员',
        },
      },
      {
        key: 'reassign',
        label: '改派',
        method: 'post',
        buildUrl: (row) => `/api/admin/repair-orders/${row.id}/reassign`,
        staffSelector: {
          role: 'REPAIR',
          payloadKey: 'maintainerId',
          title: '选择维修服务人员',
        },
      },
      {
        key: 'complete',
        label: '办结',
        method: 'post',
        buildUrl: (row) => `/api/admin/repair-orders/${row.id}/complete`,
        payload: { completeNote: '后台确认已处理' },
      },
    ],
  },
  {
    key: 'housekeeping-packages',
    label: '家政套餐',
    icon: <AppstoreOutlined />,
    endpoint: '/api/admin/housekeeping/packages',
    description: '配置家政套餐、价格和时长。',
    fields: [
      { key: 'name', label: '套餐名称' },
      { key: 'price', label: '价格', type: 'number' },
      { key: 'durationHours', label: '时长', type: 'number' },
      { key: 'description', label: '说明', type: 'textarea' },
    ],
  },
  {
    key: 'service-staff',
    label: '服务人员',
    icon: <CustomerServiceOutlined />,
    endpoint: '/api/admin/service-staff',
    description: '统一维护家政/维修等服务人员档案。',
    fields: [
      {
        key: 'role',
        label: '角色',
        type: 'select',
        initialValue: 'HOUSEKEEPING',
        options: [
          { label: '维修服务', value: 'REPAIR' },
          { label: '家政服务', value: 'HOUSEKEEPING' },
        ],
      },
      { key: 'name', label: '姓名' },
      { key: 'phone', label: '手机号' },
      { key: 'skill', label: '服务类型' },
      { key: 'status', label: '状态', type: 'select', options: [{ label: '启用', value: 'ACTIVE' }, { label: '停用', value: 'INACTIVE' }] },
      { key: 'sourceType', label: '来源类型', hiddenInForm: true, hiddenInTable: true },
      { key: 'sourceId', label: '来源ID', hiddenInForm: true, hiddenInTable: true },
    ],
  },
  {
    key: 'housekeeping-orders',
    label: '家政订单',
    icon: <ScheduleOutlined />,
    endpoint: '/api/admin/housekeeping/orders',
    description: '查看预约单并快速派单/完结。',
    createDisabled: true,
    editDisabled: true,
    fields: [
      { key: 'orderNo', label: '订单号' },
      { key: 'serviceAddress', label: '服务地址' },
      { key: 'serviceDate', label: '日期' },
      { key: 'serviceTime', label: '时段' },
      { key: 'contactPhone', label: '联系电话' },
      { key: 'amount', label: '参考金额', type: 'number' },
      { key: 'paymentStatus', label: '支付/预约' },
      { key: 'clientNote', label: '客户备注', type: 'textarea' },
      { key: 'status', label: '状态' },
      {
        key: 'housekeeperId',
        label: '服务人员',
        type: 'remoteSelect',
        hiddenInForm: true,
        optionsEndpoint: '/api/admin/service-staff?role=HOUSEKEEPING',
        optionLabelKey: 'name',
        optionValueKey: 'sourceId',
      },
    ],
    rowActions: [
      {
        key: 'assign',
        label: '派单',
        method: 'post',
        buildUrl: (row) => `/api/admin/housekeeping/orders/${row.id}/assign`,
        staffSelector: {
          role: 'HOUSEKEEPING',
          payloadKey: 'housekeeperId',
          title: '选择家政服务人员',
        },
      },
      {
        key: 'reassign',
        label: '改派',
        method: 'post',
        buildUrl: (row) => `/api/admin/housekeeping/orders/${row.id}/reassign`,
        staffSelector: {
          role: 'HOUSEKEEPING',
          payloadKey: 'housekeeperId',
          title: '选择家政服务人员',
        },
      },
      {
        key: 'complete',
        label: '完成',
        method: 'post',
        buildUrl: (row) => `/api/admin/housekeeping/orders/${row.id}/complete`,
        payload: { completeNote: '服务已完成' },
      },
    ],
  },
  {
    key: 'property-fee-config',
    label: '物业费配置',
    icon: <SettingOutlined />,
    endpoint: '/api/admin/property-fee-config',
    description: '配置基础物业费金额，系统会按业主类型收费倍率自动计算每户账单。',
    mode: 'single',
    fields: [
      { key: 'baseAmount', label: '基础物业费金额', type: 'number' },
    ],
  },
  {
    key: 'bills',
    label: '物业账单',
    icon: <FileTextOutlined />,
    endpoint: '/api/admin/bills',
    description: '系统每月1号自动生成账单，支持按户补录历史欠费。',
    customMode: 'bills',
    fields: [
      { key: 'buildingName', label: '楼栋' },
      { key: 'roomNo', label: '房号' },
      { key: 'ownerName', label: '当前住户' },
      { key: 'month', label: '账期' },
      { key: 'title', label: '标题' },
      { key: 'amount', label: '金额', type: 'number' },
      { key: 'status', label: '状态' },
    ],
    createDisabled: true,
    editDisabled: true,
  },
  {
    key: 'announcements',
    label: '公告',
    icon: <BellOutlined />,
    endpoint: '/api/admin/announcements',
    description: '发布公告、配置轮播封面与正文。',
    fields: [
      { key: 'title', label: '标题' },
      { key: 'coverImage', label: '封面图', type: 'upload' },
      { key: 'content', label: '公告正文', type: 'textarea' },
      {
        key: 'status',
        label: '状态',
        type: 'select',
        initialValue: 'DRAFT',
        options: [
          { label: '草稿', value: 'DRAFT' },
          { label: '已发布（小程序可见）', value: 'PUBLISHED' },
        ],
      },
      { key: 'sort', label: '排序', type: 'number', initialValue: 0 },
    ],
  },
  {
    key: 'votes',
    label: '投票话题',
    icon: <AlertOutlined />,
    endpoint: '/api/admin/vote-topics',
    description: '管理公告投票话题。',
    fields: [
      {
        key: 'announcementId',
        label: '绑定公告',
        type: 'remoteSelect',
        optionsEndpoint: '/api/admin/announcements',
        optionLabelKey: 'title',
        optionValueKey: 'id',
      },
      { key: 'title', label: '标题' },
      { key: 'description', label: '说明', type: 'textarea' },
      { key: 'options', label: '投票选项', type: 'voteOptions' },
      {
        key: 'status',
        label: '状态',
        type: 'select',
        initialValue: 'DRAFT',
        options: [
          { label: '草稿', value: 'DRAFT' },
          { label: '进行中（公告详情页展示投票）', value: 'ONGOING' },
        ],
      },
    ],
  },
  {
    key: 'rentals',
    label: '租房信息',
    icon: <ShopOutlined />,
    endpoint: '/api/admin/rentals',
    description: '查看和管理房源信息。',
    detailModal: true,
    fields: [
      { key: 'title', label: '标题' },
      { key: 'coverImage', label: '封面图', type: 'upload' },
      { key: 'address', label: '地址' },
      { key: 'rent', label: '租金', type: 'number' },
      { key: 'area', label: '面积', type: 'number' },
      { key: 'status', label: '状态' },
    ],
    rowActions: [
      {
        key: 'publish',
        label: '上架',
        method: 'post',
        buildUrl: (row) => `/api/admin/rentals/${row.id}/publish`,
      },
      {
        key: 'unpublish',
        label: '下架',
        method: 'post',
        buildUrl: (row) => `/api/admin/rentals/${row.id}/unpublish`,
      },
    ],
  },
  {
    key: 'feedback',
    label: '意见反馈',
    icon: <MessageEventIcon />,
    endpoint: '/api/admin/feedback',
    description: '查看业主提交的反馈意见，可标记为已处理。',
    createDisabled: true,
    editDisabled: true,
    fields: [
      { key: 'orderNo', label: '工单号', readonly: true, hiddenInForm: true },
      { key: 'ownerNickname', label: '反馈人', readonly: true, hiddenInForm: true },
      { key: 'ownerPhone', label: '手机号', readonly: true, hiddenInForm: true },
      { key: 'ownerHouseLabel', label: '房屋', readonly: true, hiddenInForm: true },
      { key: 'content', label: '反馈内容', type: 'textarea', readonly: true, hiddenInForm: true },
      { key: 'status', label: '状态', readonly: true, hiddenInForm: true },
      { key: 'createdAt', label: '提交时间', readonly: true, hiddenInForm: true },
      { key: 'reply', label: '备注', type: 'textarea', hiddenInTable: true, hiddenInForm: true },
    ],
    rowActions: [
      {
        key: 'handle',
        label: '处理',
        method: 'post',
        buildUrl: (row) => `/api/admin/feedback/${row.id}/handle`,
        visible: (row) => String(row.status || '') !== 'HANDLED',
      },
    ],
  },
  {
    key: 'lost-found',
    label: '失物招领',
    icon: <BuildOutlined />,
    endpoint: '/api/admin/lost-found',
    description: '维护失物招领处理状态，可标记为已处理。',
    createDisabled: true,
    editDisabled: true,
    fields: [
      { key: 'orderNo', label: '工单号', readonly: true, hiddenInForm: true },
      { key: 'ownerNickname', label: '提交人', readonly: true, hiddenInForm: true },
      { key: 'ownerPhone', label: '登录手机号', readonly: true, hiddenInForm: true },
      { key: 'ownerHouseLabel', label: '绑定房屋', readonly: true, hiddenInForm: true },
      { key: 'itemName', label: '物品名称' },
      { key: 'lostAt', label: '丢失时间' },
      { key: 'location', label: '地点' },
      { key: 'status', label: '状态' },
      { key: 'phone', label: '表单预留电话' },
    ],
    rowActions: [
      {
        key: 'handle',
        label: '处理',
        method: 'post',
        buildUrl: (row) => `/api/admin/lost-found/${row.id}/handle`,
        visible: (row) => String(row.status || '') !== 'HANDLED',
      },
    ],
  },
  {
    key: 'customer-service',
    label: '客服配置',
    icon: <CustomerServiceOutlined />,
    endpoint: '/api/admin/customer-service',
    description: '维护客服电话和服务时间。',
    mode: 'single',
    fields: [
      { key: 'phone', label: '客服电话' },
      { key: 'serviceHours', label: '服务时间' },
      { key: 'description', label: '说明', type: 'textarea' },
    ],
  },
  {
    key: 'system-settings',
    label: '系统设置',
    icon: <SettingOutlined />,
    endpoint: '/api/admin/system-settings',
    description: '可视化维护系统参数。',
    updateKey: 'key',
    createDisabled: true,
    fields: [
      { key: 'key', label: '配置键', readonly: true },
      { key: 'label', label: '配置名称', readonly: true },
      { key: 'value', label: '配置值', type: 'textarea' },
    ],
  },
  {
    key: 'operation-logs',
    label: '操作日志',
    icon: <FileTextOutlined />,
    endpoint: '/api/admin/operation-logs',
    description: '查看后台操作记录。',
    roles: ['super_admin'],
    createDisabled: true,
    editDisabled: true,
    fields: [
      { key: 'module', label: '模块' },
      { key: 'action', label: '动作' },
      { key: 'operator', label: '操作人' },
      { key: 'detail', label: '详情', type: 'textarea' },
      { key: 'createdAt', label: '时间' },
    ],
  },
]

export const findResourceConfig = (key?: string) => resourceConfigs.find((item) => item.key === key)

function MessageEventIcon() {
  return <BellOutlined />
}
