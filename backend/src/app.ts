import cors from 'cors'
import express, { NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import axios from 'axios'

import { env, isWechatMiniProgramConfigured } from './config/env.js'
import { prisma } from './lib/prisma.js'
import { createAccessToken, decodeAccessToken, hashPassword, verifyPassword } from './services/auth.service.js'
import {
  PaymentConfigurationError,
  createMockPaymentResult,
  createPaymentOrderNo,
  createWechatJsapiPayment,
  decryptWechatPayNotifyResource,
  isWechatPayConfigured,
  verifyWechatPayNotifySignature,
  type WechatPayNotifyPayload,
} from './services/payment.service.js'
import { createOssUploadPolicy } from './services/upload.service.js'

const ok = (res: Response, data: unknown, message = 'ok') => res.json({ success: true, message, data })
const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, message })

const toNumber = (value: unknown) => Number(String(value))

/** 小程序展示用工单号：新单存库为 F/L + Date.now()；历史数据 orderNo 为空时用创建时间 + id 尾段保证可读且尽量唯一 */
const mpFeedbackOrderNo = (r: { id: string; orderNo: string | null; createdAt: Date }) =>
  r.orderNo ?? `F${r.createdAt.getTime()}${r.id.replace(/\W/g, '').slice(-4)}`

const mpLostFoundOrderNo = (r: { id: string; orderNo: string | null; createdAt: Date }) =>
  r.orderNo ?? `L${r.createdAt.getTime()}${r.id.replace(/\W/g, '').slice(-4)}`

const readBearerToken = (request: Request) => {
  const value = request.headers.authorization || ''
  return value.startsWith('Bearer ') ? value.slice(7) : ''
}

const serializeAdminUser = (user: {
  id: string
  username: string
  role: string
  name: string
  status: string
  createdAt?: Date
  updatedAt?: Date
}) => ({
  id: user.id,
  username: user.username,
  role: user.role,
  name: user.name,
  status: user.status,
  createdAt: user.createdAt?.toISOString?.(),
  updatedAt: user.updatedAt?.toISOString?.(),
})

const ensureAdminUserRecord = async () => {
  const existing = await prisma.adminUser.findUnique({
    where: { username: 'admin' },
  })
  if (existing) {
    return existing
  }

  return prisma.adminUser.create({
    data: {
      username: 'admin',
      passwordHash: await hashPassword('admin123'),
      role: 'super_admin',
      name: '系统管理员',
      status: 'ACTIVE',
    },
  })
}

const parseVoteOptions = (optionsJson: string) => {
  try {
    return JSON.parse(optionsJson) as Array<{ id: string; title: string; votes: number }>
  } catch {
    return []
  }
}

const parseStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

/** 小程序端展示用昵称：已绑定房屋为「业主用户」，未绑定为「新业主用户」（解绑后若库内仍为「业主用户」也会显示为「新业主用户」） */
const mpWechatDisplayNickname = (user: { nickname: string; boundHouseId: string | null }) => {
  const bound = Boolean(user.boundHouseId && String(user.boundHouseId).trim())
  if (bound) {
    return '业主用户'
  }
  const raw = String(user.nickname || '').trim()
  if (raw === '业主用户') {
    return '新业主用户'
  }
  return raw || '新业主用户'
}

const serializeMpWechatUser = (user: {
  id: string
  openid: string
  nickname: string
  phone: string | null
  boundHouseId: string | null
  createdAt?: Date
  updatedAt?: Date
}) => ({
  ...user,
  nickname: mpWechatDisplayNickname(user),
})

/** 管理端：按 ownerId 附带微信用户昵称、登录手机号、绑定房屋（楼宇+房号）；用于意见反馈、失物招领等 */
const enrichRecordsWithOwnerProfileForAdmin = async <T extends { ownerId: string }>(rows: T[]) => {
  if (!rows.length) {
    return rows.map((r) => ({
      ...r,
      ownerNickname: '—',
      ownerPhone: '—',
      ownerHouseLabel: '—',
    }))
  }
  const ownerIds = [...new Set(rows.map((r) => r.ownerId))]
  const users =
    ownerIds.length > 0
      ? await prisma.wechatUser.findMany({ where: { id: { in: ownerIds } } })
      : []
  const userMap = new Map(users.map((u) => [u.id, u]))
  const houseIds = [
    ...new Set(users.map((u) => u.boundHouseId).filter((id): id is string => Boolean(id))),
  ]
  const houses =
    houseIds.length > 0
      ? await prisma.house.findMany({
          where: { id: { in: houseIds } },
          include: { building: true },
        })
      : []
  const houseRoomLabel = new Map<string, string>()
  for (const h of houses) {
    const bname = h.building?.name || ''
    houseRoomLabel.set(h.id, `${bname} ${h.roomNo}`.trim())
  }
  return rows.map((r) => {
    const u = userMap.get(r.ownerId)
    const hid = u?.boundHouseId
    return {
      ...r,
      ownerNickname: u?.nickname || '—',
      ownerPhone: u?.phone || '—',
      ownerHouseLabel: hid ? (houseRoomLabel.get(hid) || hid) : '—',
    }
  })
}

const parseJsonStringArray = (value: string | null | undefined) => {
  if (!value) {
    return []
  }
  try {
    return parseStringArray(JSON.parse(value))
  } catch {
    return []
  }
}

const sanitizeAnnouncementContent = (value: unknown) =>
  String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n/g, '\n')
    .trim()

const SYSTEM_SETTING_PROPERTY_FEE_BASE_AMOUNT = 'propertyFeeBaseAmount'

const getMonthString = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const readPropertyFeeBaseAmount = async () => {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_PROPERTY_FEE_BASE_AMOUNT },
  })
  const value = Number(setting?.value || '500')
  if (!Number.isFinite(value) || value <= 0) {
    return 500
  }
  return value
}

const calculatePropertyBillAmount = (
  house: { ownerType: { feeRate: number } | null },
  baseAmount: number,
) => {
  const feeRate = house.ownerType?.feeRate || 1
  return Number((baseAmount * feeRate).toFixed(2))
}

const ensureMonthlyBillsForMonth = async (month: string) => {
  const houses = await prisma.house.findMany({
    include: { ownerType: true },
    orderBy: { roomNo: 'asc' },
  })
  if (!houses.length) {
    return { createdCount: 0, skippedCount: 0 }
  }

  const existingBills = await prisma.propertyBill.findMany({
    where: {
      month,
      houseId: { in: houses.map((item) => item.id) },
      title: `${month}物业费`,
    },
    select: { houseId: true },
  })
  const existingHouseIds = new Set(existingBills.map((item) => item.houseId))
  const creatableHouses = houses.filter((item) => !existingHouseIds.has(item.id))
  if (!creatableHouses.length) {
    return { createdCount: 0, skippedCount: houses.length }
  }

  const baseAmount = await readPropertyFeeBaseAmount()
  await Promise.all(
    creatableHouses.map((house) =>
      prisma.propertyBill.create({
        data: {
          month,
          title: `${month}物业费`,
          amount: calculatePropertyBillAmount(house, baseAmount),
          status: 'PENDING',
          houseId: house.id,
        },
      }),
    ),
  )

  return {
    createdCount: creatableHouses.length,
    skippedCount: houses.length - creatableHouses.length,
  }
}

const buildPaymentDescription = (businessType: string) => {
  if (businessType === 'housekeeping_order') {
    return '家政服务预约'
  }
  return '物业费缴纳'
}

const completeSuccessfulPayment = async (orderNo: string, transactionNo: string, paidAt: Date, rawJson: string) => {
  const payment = await prisma.paymentOrder.findUnique({ where: { orderNo } })
  if (!payment) {
    return null
  }
  if (payment.status === 'SUCCESS') {
    return payment
  }

  await prisma.paymentOrder.update({
    where: { orderNo },
    data: {
      status: 'SUCCESS',
      tradeState: 'SUCCESS',
      transactionNo,
      notifyRawJson: rawJson,
      paidAt,
    },
  })

  if (payment.businessType === 'property_bill') {
    const billIds = parseJsonStringArray(payment.billIdsJson)
    if (billIds.length) {
      await prisma.propertyBill.updateMany({
        where: { id: { in: billIds }, status: 'PENDING' },
        data: { status: 'PAID' },
      })
    }
  }
  if (payment.businessType === 'housekeeping_order' && payment.businessId) {
    await prisma.housekeepingOrder.updateMany({
      where: { id: payment.businessId, paymentStatus: { not: 'PAID' } },
      data: { paymentStatus: 'PAID' },
    })
  }

  return prisma.paymentOrder.findUnique({ where: { orderNo } })
}

const allowedAdminRoles = new Set(['super_admin', 'front_desk'])

const requireAdmin = (request: Request, response: Response, next: NextFunction) => {
  const token = readBearerToken(request)
  if (!token) {
    fail(response, 401, '未登录或登录已过期')
    return
  }

  try {
    const payload = decodeAccessToken(token)
    if (payload.scope !== 'admin') {
      fail(response, 403, '无权限访问')
      return
    }
    ;(request as Request & { user: typeof payload }).user = payload
    next()
  } catch {
    fail(response, 401, '登录已过期，请重新登录')
  }
}

const requireMp = async (request: Request, response: Response, next: NextFunction) => {
  const token = readBearerToken(request)
  if (!token) {
    fail(response, 401, '请先登录')
    return
  }

  try {
    const payload = decodeAccessToken(token)
    if (payload.scope !== 'mp') {
      fail(response, 403, '无权限访问')
      return
    }
    const mpUser = await prisma.wechatUser.findUnique({
      where: { id: payload.sub },
    })
    if (!mpUser) {
      fail(response, 401, '用户不存在')
      return
    }
    ;(request as Request & { user: typeof payload & { record: typeof mpUser } }).user = {
      ...payload,
      record: mpUser,
    }
    next()
  } catch {
    fail(response, 401, '登录已失效')
  }
}

const requireAdminRole =
  (...roles: string[]) =>
  (request: Request, response: Response, next: NextFunction) => {
    const payload = (request as Request & { user?: { role?: string } }).user
    if (!payload?.role || !roles.includes(payload.role)) {
      fail(response, 403, '当前账号无权限访问该功能')
      return
    }
    next()
  }

const requireBoundMp = (request: Request, response: Response, next: NextFunction) => {
  void requireMp(request, response, () => {
    const payload = (request as Request & { user: { record: { boundHouseId?: string } } }).user
    const hid = payload.record.boundHouseId
    if (!hid || !String(hid).trim()) {
      fail(response, 403, '请先绑定并审核通过房屋后再使用该功能')
      return
    }
    next()
  })
}

export const createApp = () => {
  const app = express()

  app.use(cors())
  app.use(helmet({ crossOriginResourcePolicy: false }))
  app.post('/api/pay/wechat/notify', express.raw({ type: 'application/json' }), async (request, response) => {
    const body = Buffer.isBuffer(request.body) ? request.body.toString('utf8') : String(request.body || '')
    try {
      const headers = {
        timestamp: String(request.headers['wechatpay-timestamp'] || ''),
        nonce: String(request.headers['wechatpay-nonce'] || ''),
        signature: String(request.headers['wechatpay-signature'] || ''),
        serial: String(request.headers['wechatpay-serial'] || ''),
      }
      if (!headers.timestamp || !headers.nonce || !headers.signature || !headers.serial) {
        response.status(400).json({ code: 'FAIL', message: '缺少微信支付回调签名头' })
        return
      }
      if (!verifyWechatPayNotifySignature({ headers, body })) {
        response.status(401).json({ code: 'FAIL', message: '微信支付回调签名无效' })
        return
      }
      const payload = JSON.parse(body) as WechatPayNotifyPayload
      if (!payload.resource) {
        response.status(400).json({ code: 'FAIL', message: '缺少微信支付回调资源' })
        return
      }
      const transaction = decryptWechatPayNotifyResource(payload.resource)
      if (transaction.trade_state === 'SUCCESS') {
        await completeSuccessfulPayment(
          transaction.out_trade_no,
          transaction.transaction_id || '',
          transaction.success_time ? new Date(transaction.success_time) : new Date(),
          body,
        )
      } else {
        await prisma.paymentOrder.updateMany({
          where: { orderNo: transaction.out_trade_no, status: { not: 'SUCCESS' } },
          data: {
            status: transaction.trade_state || 'FAILED',
            tradeState: transaction.trade_state || null,
            notifyRawJson: body,
          },
        })
      }
      response.json({ code: 'SUCCESS', message: '成功' })
    } catch (error) {
      console.error('[wechat-pay notify]', error)
      response.status(500).json({ code: 'FAIL', message: '微信支付回调处理失败' })
    }
  })
  app.use(express.json({ limit: '2mb' }))
  app.use(morgan('dev'))

  const autoGenerateMonthlyBills = async () => {
    const now = new Date()
    if (now.getDate() !== 1) {
      return
    }
    await ensureMonthlyBillsForMonth(getMonthString(now))
  }
  void autoGenerateMonthlyBills()
  const autoGenerateTimer = setInterval(() => {
    void autoGenerateMonthlyBills()
  }, 60 * 60 * 1000)
  autoGenerateTimer.unref?.()

  app.get('/api/health', (_request, response) =>
    ok(response, {
      service: 'property-service-backend',
      port: env.port,
      now: new Date().toISOString(),
    }),
  )

  app.post('/api/admin/auth/login', async (request, response) => {
    const { username, password } = request.body as { username?: string; password?: string }
    if (!username || !password) {
      fail(response, 400, '请输入账号和密码')
      return
    }

    await ensureAdminUserRecord()
    const targetUser = await prisma.adminUser.findUnique({
      where: { username },
    })

    if (!targetUser?.passwordHash) {
      fail(response, 401, '账号或密码错误')
      return
    }

    const valid = await verifyPassword(password, targetUser.passwordHash)

    if (!valid || targetUser.status !== 'ACTIVE') {
      fail(response, 401, '账号或密码错误')
      return
    }

    const token = createAccessToken({
      subject: targetUser.id,
      role: targetUser.role,
      scope: 'admin',
    })
    await prisma.operationLog.create({
      data: {
        module: 'auth',
        action: 'LOGIN',
        operator: targetUser.username,
        detail: '管理员登录成功',
      },
    })
    ok(response, {
      token,
      user: serializeAdminUser(targetUser),
    }, '登录成功')
  })

  app.get('/api/admin/auth/profile', requireAdmin, async (request, response) => {
    const payload = (request as Request & { user: { sub: string; record: { openid: string } } }).user
    const user = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
    })
    if (!user) {
      fail(response, 404, '用户不存在')
      return
    }
    ok(response, serializeAdminUser(user))
  })

  app.get('/api/admin/dashboard/overview', requireAdmin, requireAdminRole('super_admin'), async (_request, response) => {
    const [owners, repairs, housekeeping, bills, recentOperations] = await Promise.all([
      prisma.wechatUser.count(),
      prisma.repairOrder.count(),
      prisma.housekeepingOrder.count(),
      prisma.propertyBill.count({ where: { status: 'PENDING' } }),
      prisma.operationLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
    ])
    ok(response, {
      cards: [
        { key: 'owners', label: '已绑定住户', value: owners },
        { key: 'repairs', label: '报修工单', value: repairs },
        { key: 'housekeeping', label: '家政预约', value: housekeeping },
        { key: 'bills', label: '待缴账单', value: bills },
      ],
      recentOperations,
    })
  })

  app.post('/api/admin/uploads/policy', requireAdmin, (request, response) => {
    const { directory = 'uploads', filename = 'file.png', mimeType = 'image/png' } = request.body as Record<string, string>
    ok(response, createOssUploadPolicy({ directory, filename, mimeType }))
  })
  app.post('/api/mp/uploads/policy', requireMp, (request, response) => {
    const { directory = 'uploads', filename = 'file.png', mimeType = 'image/png' } = request.body as Record<string, string>
    ok(response, createOssUploadPolicy({ directory, filename, mimeType }))
  })

  app.get('/api/admin/accounts', requireAdmin, requireAdminRole('super_admin'), async (_request, response) => {
    const users = await prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
    })
    ok(response, users.map(serializeAdminUser))
  })
  app.post('/api/admin/accounts', requireAdmin, requireAdminRole('super_admin'), async (request, response) => {
    const { username, name, role, password, status = 'ACTIVE' } = request.body as Record<string, string>
    if (!username || !name || !role || !password) {
      fail(response, 400, '请完整填写账号、姓名、角色和密码')
      return
    }
    if (!allowedAdminRoles.has(role)) {
      fail(response, 400, '仅支持超级管理员和前台账号')
      return
    }
    const exists = await prisma.adminUser.findUnique({
      where: { username },
    })
    if (exists) {
      fail(response, 400, '账号已存在')
      return
    }

    const record = await prisma.adminUser.create({
      data: {
        username,
        name,
        role,
        status,
        passwordHash: await hashPassword(password),
      },
    })
    ok(response, serializeAdminUser(record), '创建成功')
  })
  app.put('/api/admin/accounts/:id', requireAdmin, requireAdminRole('super_admin'), async (request, response) => {
    const target = await prisma.adminUser.findUnique({
      where: { id: String(request.params.id) },
    })
    if (!target) {
      fail(response, 404, '账号不存在')
      return
    }
    const { password, ...rest } = request.body as Record<string, string>
    if (rest.role && !allowedAdminRoles.has(rest.role)) {
      fail(response, 400, '仅支持超级管理员和前台账号')
      return
    }
    const updated = await prisma.adminUser.update({
      where: { id: String(request.params.id) },
      data: {
        ...rest,
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
    })
    ok(response, serializeAdminUser(updated), '更新成功')
  })
  /** 小程序端注册用户（登录手机号来自授权，非绑定申请表单填写） */
  app.get('/api/admin/wechat-users', requireAdmin, async (_request, response) => {
    const users = await prisma.wechatUser.findMany({
      orderBy: { updatedAt: 'desc' },
    })
    const houseIds = [...new Set(users.map((u) => u.boundHouseId).filter((id): id is string => Boolean(id)))]
    const houses = houseIds.length
      ? await prisma.house.findMany({
          where: { id: { in: houseIds } },
          include: { building: true },
        })
      : []
    const houseRoomLabel = new Map<string, string>()
    for (const h of houses) {
      const bname = h.building?.name || ''
      houseRoomLabel.set(h.id, `${bname} ${h.roomNo}`.trim())
    }
    const rows = users.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      phone: u.phone || '',
      boundHouseId: u.boundHouseId || '',
      boundHouseLabel: u.boundHouseId ? (houseRoomLabel.get(u.boundHouseId) || u.boundHouseId) : '—',
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }))
    ok(response, rows)
  })
  app.get('/api/admin/buildings', requireAdmin, async (_request, response) => {
    const buildings = await prisma.building.findMany({
      orderBy: { createdAt: 'desc' },
    })
    ok(response, buildings)
  })
  app.post('/api/admin/buildings', requireAdmin, async (request, response) => {
    const created = await prisma.building.create({
      data: {
        name: String(request.body.name || ''),
        code: String(request.body.code || ''),
        status: String(request.body.status || 'ACTIVE'),
      },
    })
    ok(response, created, '创建成功')
  })
  app.put('/api/admin/buildings/:id', requireAdmin, async (request, response) => {
    const updated = await prisma.building.update({
      where: { id: String(request.params.id) },
      data: {
        name: request.body.name,
        code: request.body.code,
        status: request.body.status,
      },
    })
    ok(response, updated, '更新成功')
  })
  app.get('/api/admin/houses', requireAdmin, async (request, response) => {
    const buildingId = request.query.buildingId ? String(request.query.buildingId) : undefined
    const houses = await prisma.house.findMany({
      where: buildingId ? { buildingId } : undefined,
      include: {
        building: true,
        ownerType: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    ok(
      response,
      houses.map((house) => ({
        id: house.id,
        buildingId: house.buildingId,
        buildingName: house.building.name,
        roomNo: house.roomNo,
        area: house.area,
        ownerTypeId: house.ownerTypeId,
        ownerTypeName: house.ownerType?.name || '',
        status: house.status,
        createdAt: house.createdAt,
        updatedAt: house.updatedAt,
      })),
    )
  })
  app.post('/api/admin/houses', requireAdmin, async (request, response) => {
    const created = await prisma.house.create({
      data: {
        buildingId: String(request.body.buildingId || ''),
        roomNo: String(request.body.roomNo || ''),
        area: request.body.area === undefined ? null : toNumber(request.body.area),
        ownerTypeId: request.body.ownerTypeId ? String(request.body.ownerTypeId) : null,
        status: String(request.body.status || 'IDLE'),
      },
    })
    ok(response, created, '创建成功')
  })
  app.put('/api/admin/houses/:id', requireAdmin, async (request, response) => {
    const updated = await prisma.house.update({
      where: { id: String(request.params.id) },
      data: {
        buildingId: request.body.buildingId,
        roomNo: request.body.roomNo,
        area: request.body.area === undefined ? undefined : toNumber(request.body.area),
        ownerTypeId: request.body.ownerTypeId === undefined ? undefined : (request.body.ownerTypeId ? String(request.body.ownerTypeId) : null),
        status: request.body.status,
      },
    })
    ok(response, updated, '更新成功')
  })
  app.get('/api/admin/owner-types', requireAdmin, async (_request, response) => {
    const ownerTypes = await prisma.ownerType.findMany({
      orderBy: { createdAt: 'desc' },
    })
    ok(response, ownerTypes)
  })
  app.post('/api/admin/owner-types', requireAdmin, async (request, response) => {
    const created = await prisma.ownerType.create({
      data: {
        name: String(request.body.name || ''),
        feeRate: toNumber(request.body.feeRate || 0),
        baseFee: toNumber(request.body.baseFee || 0),
        description: String(request.body.description || ''),
      },
    })
    ok(response, created, '创建成功')
  })
  app.put('/api/admin/owner-types/:id', requireAdmin, async (request, response) => {
    const updated = await prisma.ownerType.update({
      where: { id: String(request.params.id) },
      data: {
        name: request.body.name,
        feeRate: request.body.feeRate === undefined ? undefined : toNumber(request.body.feeRate),
        baseFee: request.body.baseFee === undefined ? undefined : toNumber(request.body.baseFee),
        description: request.body.description,
      },
    })
    ok(response, updated, '更新成功')
  })
  const mapMaintainerToServiceStaff = (item: {
    id: string
    name: string
    phone: string
    type: string
    status: string
  }) => ({
    id: `maintainer:${item.id}`,
    sourceType: 'MAINTAINER',
    sourceId: item.id,
    name: item.name,
    phone: item.phone,
    role: 'REPAIR',
    skill: item.type,
    status: item.status,
  })

  const mapHousekeeperToServiceStaff = (item: {
    id: string
    name: string
    phone: string
    specialty: string
    status: string
  }) => ({
    id: `housekeeper:${item.id}`,
    sourceType: 'HOUSEKEEPER',
    sourceId: item.id,
    name: item.name,
    phone: item.phone,
    role: 'HOUSEKEEPING',
    skill: item.specialty,
    status: item.status,
  })

  app.get('/api/admin/service-staff', requireAdmin, async (request, response) => {
    const role = typeof request.query.role === 'string' ? String(request.query.role).toUpperCase() : ''

    const [maintainers, housekeepers] = await Promise.all([
      role && role !== 'REPAIR' ? Promise.resolve([]) : prisma.maintainer.findMany({ orderBy: { createdAt: 'desc' } }),
      role && role !== 'HOUSEKEEPING' ? Promise.resolve([]) : prisma.housekeeper.findMany({ orderBy: { createdAt: 'desc' } }),
    ])

    const rows = [
      ...maintainers.map(mapMaintainerToServiceStaff),
      ...housekeepers.map(mapHousekeeperToServiceStaff),
    ]
    ok(response, rows)
  })
  app.post('/api/admin/service-staff', requireAdmin, async (request, response) => {
    const role = String(request.body.role || '').toUpperCase()
    const name = String(request.body.name || '')
    const phone = String(request.body.phone || '')
    const skill = String(request.body.skill || '')
    const status = String(request.body.status || 'ACTIVE')

    if (!name || !phone || !skill) {
      fail(response, 400, '姓名、手机号和服务类型不能为空')
      return
    }

    if (role === 'HOUSEKEEPING') {
      const created = await prisma.housekeeper.create({
        data: {
          name,
          phone,
          specialty: skill,
          status,
        },
      })
      ok(response, mapHousekeeperToServiceStaff(created), '创建成功')
      return
    }

    if (role === 'REPAIR') {
      const created = await prisma.maintainer.create({
        data: {
          name,
          phone,
          type: skill,
          status,
        },
      })
      ok(response, mapMaintainerToServiceStaff(created), '创建成功')
      return
    }

    fail(response, 400, '请选择有效角色')
  })
  app.put('/api/admin/service-staff/:id', requireAdmin, async (request, response) => {
    const sourceId = String(request.params.id || '')
    const name = request.body.name
    const phone = request.body.phone
    const skill = request.body.skill
    const status = request.body.status

    if (sourceId.startsWith('maintainer:')) {
      const id = sourceId.replace('maintainer:', '')
      const updated = await prisma.maintainer.update({
        where: { id },
        data: {
          name,
          phone,
          type: skill,
          status,
        },
      })
      ok(response, mapMaintainerToServiceStaff(updated), '更新成功')
      return
    }

    if (sourceId.startsWith('housekeeper:')) {
      const id = sourceId.replace('housekeeper:', '')
      const updated = await prisma.housekeeper.update({
        where: { id },
        data: {
          name,
          phone,
          specialty: skill,
          status,
        },
      })
      ok(response, mapHousekeeperToServiceStaff(updated), '更新成功')
      return
    }

    fail(response, 400, '无效服务人员ID')
  })
  app.get('/api/admin/maintainers', requireAdmin, async (_request, response) => {
    ok(response, await prisma.maintainer.findMany({ orderBy: { createdAt: 'desc' } }))
  })
  app.post('/api/admin/maintainers', requireAdmin, async (request, response) => {
    const created = await prisma.maintainer.create({
      data: {
        name: String(request.body.name || ''),
        phone: String(request.body.phone || ''),
        type: String(request.body.type || ''),
        status: String(request.body.status || 'ACTIVE'),
      },
    })
    ok(response, created, '创建成功')
  })
  app.put('/api/admin/maintainers/:id', requireAdmin, async (request, response) => {
    const updated = await prisma.maintainer.update({
      where: { id: String(request.params.id) },
      data: {
        name: request.body.name,
        phone: request.body.phone,
        type: request.body.type,
        status: request.body.status,
      },
    })
    ok(response, updated, '更新成功')
  })
  app.get('/api/admin/housekeepers', requireAdmin, async (_request, response) => {
    ok(response, await prisma.housekeeper.findMany({ orderBy: { createdAt: 'desc' } }))
  })
  app.post('/api/admin/housekeepers', requireAdmin, async (request, response) => {
    const created = await prisma.housekeeper.create({
      data: {
        name: String(request.body.name || ''),
        phone: String(request.body.phone || ''),
        specialty: String(request.body.specialty || ''),
        status: String(request.body.status || 'ACTIVE'),
      },
    })
    ok(response, created, '创建成功')
  })
  app.put('/api/admin/housekeepers/:id', requireAdmin, async (request, response) => {
    const updated = await prisma.housekeeper.update({
      where: { id: String(request.params.id) },
      data: {
        name: request.body.name,
        phone: request.body.phone,
        specialty: request.body.specialty,
        status: request.body.status,
      },
    })
    ok(response, updated, '更新成功')
  })
  app.get('/api/admin/housekeeping/packages', requireAdmin, async (_request, response) => {
    ok(response, await prisma.housekeepingPackage.findMany({ orderBy: { createdAt: 'desc' } }))
  })
  app.post('/api/admin/housekeeping/packages', requireAdmin, async (request, response) => {
    const created = await prisma.housekeepingPackage.create({
      data: {
        name: String(request.body.name || ''),
        price: toNumber(request.body.price || 0),
        durationHours: toNumber(request.body.durationHours || 0),
        description: String(request.body.description || ''),
      },
    })
    ok(response, created, '创建成功')
  })
  app.put('/api/admin/housekeeping/packages/:id', requireAdmin, async (request, response) => {
    const updated = await prisma.housekeepingPackage.update({
      where: { id: String(request.params.id) },
      data: {
        name: request.body.name,
        price: request.body.price === undefined ? undefined : toNumber(request.body.price),
        durationHours: request.body.durationHours === undefined ? undefined : toNumber(request.body.durationHours),
        description: request.body.description,
      },
    })
    ok(response, updated, '更新成功')
  })
  app.get('/api/admin/announcements', requireAdmin, async (_request, response) => {
    const rows = await prisma.announcement.findMany({
      orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
    })
    ok(response, rows.map((item) => ({
      ...item,
      content: sanitizeAnnouncementContent(item.content),
    })))
  })
  app.post('/api/admin/announcements', requireAdmin, async (request, response) => {
    const created = await prisma.announcement.create({
      data: {
        title: String(request.body.title || ''),
        coverImage: request.body.coverImage ? String(request.body.coverImage) : null,
        content: sanitizeAnnouncementContent(request.body.content),
        status: String(request.body.status || 'DRAFT'),
        sort: toNumber(request.body.sort || 0),
      },
    })
    ok(response, created, '创建成功')
  })
  app.put('/api/admin/announcements/:id', requireAdmin, async (request, response) => {
    const updated = await prisma.announcement.update({
      where: { id: String(request.params.id) },
      data: {
        title: request.body.title,
        coverImage: request.body.coverImage === undefined ? undefined : (request.body.coverImage ? String(request.body.coverImage) : null),
        content: request.body.content === undefined ? undefined : sanitizeAnnouncementContent(request.body.content),
        status: request.body.status,
        sort: request.body.sort === undefined ? undefined : toNumber(request.body.sort),
      },
    })
    ok(response, updated, '更新成功')
  })
  app.get('/api/admin/vote-topics', requireAdmin, async (_request, response) => {
    const rows = await prisma.voteTopic.findMany({
      orderBy: { createdAt: 'desc' },
    })
    ok(response, rows.map((item) => ({ ...item, options: parseVoteOptions(item.optionsJson) })))
  })
  app.post('/api/admin/vote-topics', requireAdmin, async (request, response) => {
    const created = await prisma.voteTopic.create({
      data: {
        announcementId: request.body.announcementId ? String(request.body.announcementId) : null,
        title: String(request.body.title || ''),
        description: String(request.body.description || ''),
        optionsJson: JSON.stringify(Array.isArray(request.body.options) ? request.body.options : []),
        status: String(request.body.status || 'DRAFT'),
      },
    })
    ok(response, { ...created, options: parseVoteOptions(created.optionsJson) }, '创建成功')
  })
  app.put('/api/admin/vote-topics/:id', requireAdmin, async (request, response) => {
    const updated = await prisma.voteTopic.update({
      where: { id: String(request.params.id) },
      data: {
        announcementId: request.body.announcementId === undefined ? undefined : (request.body.announcementId ? String(request.body.announcementId) : null),
        title: request.body.title,
        description: request.body.description,
        optionsJson: request.body.options === undefined ? undefined : JSON.stringify(request.body.options),
        status: request.body.status,
      },
    })
    ok(response, { ...updated, options: parseVoteOptions(updated.optionsJson) }, '更新成功')
  })
  app.get('/api/admin/rentals', requireAdmin, async (_request, response) => {
    const rows = await prisma.rentalListing.findMany({
      orderBy: { createdAt: 'desc' },
    })
    ok(response, rows)
  })
  app.post('/api/admin/rentals', requireAdmin, async (request, response) => {
    const created = await prisma.rentalListing.create({
      data: {
        ownerId: String(request.body.ownerId || 'mp-user-1'),
        title: String(request.body.title || ''),
        coverImage: request.body.coverImage ? String(request.body.coverImage) : null,
        imagesJson: request.body.imagesJson ? String(request.body.imagesJson) : null,
        address: String(request.body.address || ''),
        rent: toNumber(request.body.rent || 0),
        area: toNumber(request.body.area || 0),
        layout: String(request.body.layout || ''),
        phone: String(request.body.phone || ''),
        status: String(request.body.status || 'DRAFT'),
      },
    })
    ok(response, created, '创建成功')
  })
  app.put('/api/admin/rentals/:id', requireAdmin, async (request, response) => {
    const updated = await prisma.rentalListing.update({
      where: { id: String(request.params.id) },
      data: {
        title: request.body.title,
        coverImage: request.body.coverImage === undefined ? undefined : (request.body.coverImage ? String(request.body.coverImage) : null),
        imagesJson: request.body.imagesJson === undefined ? undefined : (request.body.imagesJson ? String(request.body.imagesJson) : null),
        address: request.body.address,
        rent: request.body.rent === undefined ? undefined : toNumber(request.body.rent),
        area: request.body.area === undefined ? undefined : toNumber(request.body.area),
        layout: request.body.layout,
        phone: request.body.phone,
        status: request.body.status,
      },
    })
    ok(response, updated, '更新成功')
  })
  app.post('/api/admin/rentals/:id/publish', requireAdmin, async (request, response) => {
    const target = await prisma.rentalListing.findUnique({
      where: { id: String(request.params.id) },
    })
    if (!target) {
      fail(response, 404, '房源不存在')
      return
    }
    const updated = await prisma.rentalListing.update({
      where: { id: String(request.params.id) },
      data: { status: 'PUBLISHED' },
    })
    ok(response, updated, '上架成功')
  })
  app.post('/api/admin/rentals/:id/unpublish', requireAdmin, async (request, response) => {
    const target = await prisma.rentalListing.findUnique({
      where: { id: String(request.params.id) },
    })
    if (!target) {
      fail(response, 404, '房源不存在')
      return
    }
    const updated = await prisma.rentalListing.update({
      where: { id: String(request.params.id) },
      data: { status: 'OFFLINE' },
    })
    ok(response, updated, '下架成功')
  })
  app.get('/api/admin/feedback', requireAdmin, async (_request, response) => {
    const rows = await prisma.feedbackRecord.findMany({
      orderBy: { createdAt: 'desc' },
    })
    ok(response, await enrichRecordsWithOwnerProfileForAdmin(rows))
  })
  app.post('/api/admin/feedback', requireAdmin, async (request, response) => {
    const created = await prisma.feedbackRecord.create({
      data: {
        orderNo: `F${Date.now()}`,
        ownerId: String(request.body.ownerId || 'mp-user-1'),
        content: String(request.body.content || ''),
        status: String(request.body.status || 'PENDING'),
        reply: request.body.reply ? String(request.body.reply) : null,
      },
    })
    ok(response, created, '创建成功')
  })
  app.put('/api/admin/feedback/:id', requireAdmin, async (request, response) => {
    const updated = await prisma.feedbackRecord.update({
      where: { id: String(request.params.id) },
      data: {
        content: request.body.content,
        status: request.body.status,
        reply: request.body.reply === undefined ? undefined : (request.body.reply ? String(request.body.reply) : null),
      },
    })
    ok(response, updated, '更新成功')
  })
  app.post('/api/admin/feedback/:id/handle', requireAdmin, async (request, response) => {
    const id = String(request.params.id)
    const existing = await prisma.feedbackRecord.findUnique({ where: { id } })
    if (!existing) {
      fail(response, 404, '记录不存在')
      return
    }
    if (existing.status === 'HANDLED') {
      fail(response, 400, '该反馈已处理')
      return
    }
    const updated = await prisma.feedbackRecord.update({
      where: { id },
      data: { status: 'HANDLED' },
    })
    ok(response, updated, '已标记为已处理')
  })
  app.get('/api/admin/lost-found', requireAdmin, async (_request, response) => {
    const rows = await prisma.lostFoundRecord.findMany({
      orderBy: { createdAt: 'desc' },
    })
    ok(response, await enrichRecordsWithOwnerProfileForAdmin(rows))
  })
  app.post('/api/admin/lost-found', requireAdmin, async (request, response) => {
    fail(response, 403, '失物招领请通过小程序端提交，后台不支持创建')
  })
  app.put('/api/admin/lost-found/:id', requireAdmin, async (request, response) => {
    const updated = await prisma.lostFoundRecord.update({
      where: { id: String(request.params.id) },
      data: {
        itemName: request.body.itemName,
        lostAt: request.body.lostAt,
        location: request.body.location,
        phone: request.body.phone,
        status: request.body.status,
      },
    })
    ok(response, updated, '更新成功')
  })
  app.post('/api/admin/lost-found/:id/handle', requireAdmin, async (request, response) => {
    const id = String(request.params.id)
    const existing = await prisma.lostFoundRecord.findUnique({ where: { id } })
    if (!existing) {
      fail(response, 404, '记录不存在')
      return
    }
    if (existing.status === 'HANDLED') {
      fail(response, 400, '该记录已处理')
      return
    }
    const updated = await prisma.lostFoundRecord.update({
      where: { id },
      data: { status: 'HANDLED' },
    })
    ok(response, updated, '已标记为已处理')
  })

  app.get('/api/admin/binding-applications', requireAdmin, async (_request, response) => {
    const records = await prisma.bindingApplication.findMany({
      orderBy: { createdAt: 'desc' },
    })
    ok(response, records)
  })
  app.post('/api/admin/binding-applications/:id/approve', requireAdmin, async (request, response) => {
    const target = await prisma.bindingApplication.findUnique({
      where: { id: String(request.params.id) },
    })
    if (!target) {
      fail(response, 404, '申请不存在')
      return
    }
    const updated = await prisma.bindingApplication.update({
      where: { id: String(request.params.id) },
      data: { status: 'APPROVED' },
    })
    const house = await prisma.house.findFirst({
      where: {
        buildingId: target.buildingId,
        roomNo: target.roomNo,
      },
    })
    if (!house) {
      fail(response, 400, '未找到对应房屋档案，无法通过审核')
      return
    }
    await prisma.wechatUser.update({
      where: { id: target.applicantUserId },
      data: { boundHouseId: house.id, nickname: '业主用户' },
    })
    ok(response, updated, '审核通过')
  })
  app.post('/api/admin/binding-applications/:id/reject', requireAdmin, async (request, response) => {
    const target = await prisma.bindingApplication.findUnique({
      where: { id: String(request.params.id) },
    })
    if (!target) {
      fail(response, 404, '申请不存在')
      return
    }
    const updated = await prisma.bindingApplication.update({
      where: { id: String(request.params.id) },
      data: { status: 'REJECTED' },
    })
    ok(response, updated, '已驳回')
  })

  app.get('/api/admin/repair-orders', requireAdmin, async (_request, response) => {
    const orders = await prisma.repairOrder.findMany({
      orderBy: { createdAt: 'desc' },
    })
    ok(response, orders)
  })
  app.post('/api/admin/repair-orders/:id/assign', requireAdmin, async (request, response) => {
    const target = await prisma.repairOrder.findUnique({
      where: { id: String(request.params.id) },
    })
    if (!target) {
      fail(response, 404, '工单不存在')
      return
    }
    const maintainerId = String(request.body.maintainerId || '')
    if (!maintainerId) {
      fail(response, 400, '请选择服务人员')
      return
    }
    const maintainer = await prisma.maintainer.findUnique({
      where: { id: maintainerId },
    })
    if (!maintainer || maintainer.status !== 'ACTIVE') {
      fail(response, 400, '服务人员不存在或未启用')
      return
    }
    const updated = await prisma.repairOrder.update({
      where: { id: String(request.params.id) },
      data: {
        maintainerId,
        status: 'PROCESSING',
      },
    })
    ok(response, updated, '派单成功')
  })
  app.post('/api/admin/repair-orders/:id/reassign', requireAdmin, async (request, response) => {
    const target = await prisma.repairOrder.findUnique({
      where: { id: String(request.params.id) },
    })
    if (!target) {
      fail(response, 404, '工单不存在')
      return
    }
    const maintainerId = String(request.body.maintainerId || '')
    if (!maintainerId) {
      fail(response, 400, '请选择服务人员')
      return
    }
    const maintainer = await prisma.maintainer.findUnique({
      where: { id: maintainerId },
    })
    if (!maintainer || maintainer.status !== 'ACTIVE') {
      fail(response, 400, '服务人员不存在或未启用')
      return
    }
    const updated = await prisma.repairOrder.update({
      where: { id: String(request.params.id) },
      data: { maintainerId },
    })
    ok(response, updated, '改派成功')
  })
  app.post('/api/admin/repair-orders/:id/complete', requireAdmin, async (request, response) => {
    const target = await prisma.repairOrder.findUnique({
      where: { id: String(request.params.id) },
    })
    if (!target) {
      fail(response, 404, '工单不存在')
      return
    }
    const updated = await prisma.repairOrder.update({
      where: { id: String(request.params.id) },
      data: {
        status: 'COMPLETED',
        completeNote: String(request.body.completeNote || '已完成处理'),
      },
    })
    ok(response, updated, '工单已办结')
  })

  app.get('/api/admin/housekeeping/orders', requireAdmin, async (_request, response) => {
    const orders = await prisma.housekeepingOrder.findMany({
      orderBy: { createdAt: 'desc' },
    })
    ok(response, orders)
  })
  app.post('/api/admin/housekeeping/orders/:id/assign', requireAdmin, async (request, response) => {
    const target = await prisma.housekeepingOrder.findUnique({
      where: { id: String(request.params.id) },
    })
    if (!target) {
      fail(response, 404, '预约不存在')
      return
    }
    const housekeeperId = String(request.body.housekeeperId || '')
    if (!housekeeperId) {
      fail(response, 400, '请选择服务人员')
      return
    }
    const housekeeper = await prisma.housekeeper.findUnique({
      where: { id: housekeeperId },
    })
    if (!housekeeper || housekeeper.status !== 'ACTIVE') {
      fail(response, 400, '服务人员不存在或未启用')
      return
    }
    const updated = await prisma.housekeepingOrder.update({
      where: { id: String(request.params.id) },
      data: {
        housekeeperId,
        status: 'IN_SERVICE',
      },
    })
    ok(response, updated, '家政派单成功')
  })
  app.post('/api/admin/housekeeping/orders/:id/reassign', requireAdmin, async (request, response) => {
    const target = await prisma.housekeepingOrder.findUnique({
      where: { id: String(request.params.id) },
    })
    if (!target) {
      fail(response, 404, '预约不存在')
      return
    }
    const housekeeperId = String(request.body.housekeeperId || '')
    if (!housekeeperId) {
      fail(response, 400, '请选择服务人员')
      return
    }
    const housekeeper = await prisma.housekeeper.findUnique({
      where: { id: housekeeperId },
    })
    if (!housekeeper || housekeeper.status !== 'ACTIVE') {
      fail(response, 400, '服务人员不存在或未启用')
      return
    }
    const updated = await prisma.housekeepingOrder.update({
      where: { id: String(request.params.id) },
      data: { housekeeperId },
    })
    ok(response, updated, '改派成功')
  })
  app.post('/api/admin/housekeeping/orders/:id/complete', requireAdmin, async (request, response) => {
    const target = await prisma.housekeepingOrder.findUnique({
      where: { id: String(request.params.id) },
    })
    if (!target) {
      fail(response, 404, '预约不存在')
      return
    }
    const updated = await prisma.housekeepingOrder.update({
      where: { id: String(request.params.id) },
      data: {
        status: 'COMPLETED',
        completeNote: String(request.body.completeNote || '服务已完成'),
      },
    })
    ok(response, updated, '家政工单已完成')
  })

  app.post('/api/admin/bills/generate', requireAdmin, async (request, response) => {
    const buildingId = String(request.body.buildingId || '')
    const month = String(request.body.month || new Date().toISOString().slice(0, 7))
    if (!buildingId) {
      fail(response, 400, '请选择楼栋')
      return
    }

    const houses = await prisma.house.findMany({
      where: { buildingId },
      include: { ownerType: true },
      orderBy: { roomNo: 'asc' },
    })
    if (!houses.length) {
      fail(response, 400, '该楼栋下暂无房屋档案')
      return
    }

    const existingBills = await prisma.propertyBill.findMany({
      where: {
        month,
        houseId: { in: houses.map((item) => item.id) },
      },
      select: { houseId: true },
    })
    const existingHouseIds = new Set(existingBills.map((item) => item.houseId))
    const creatableHouses = houses.filter((item) => !existingHouseIds.has(item.id))

    const baseAmount = await readPropertyFeeBaseAmount()
    const createdRecords = await Promise.all(
      creatableHouses.map((house) =>
        prisma.propertyBill.create({
          data: {
            month,
            title: `${month}物业费`,
            amount: calculatePropertyBillAmount(house, baseAmount),
            status: 'PENDING',
            houseId: house.id,
          },
        }),
      ),
    )

    ok(
      response,
      {
        createdCount: createdRecords.length,
        skippedCount: houses.length - createdRecords.length,
        items: createdRecords,
      },
      '账单生成成功',
    )
  })
  app.post('/api/admin/bills/import-arrears', requireAdmin, async (request, response) => {
    const buildingId = request.body.buildingId ? String(request.body.buildingId) : ''
    const month = String(request.body.month || '')
    const items = Array.isArray(request.body.items) ? (request.body.items as Array<Record<string, unknown>>) : []
    if (!month || !items.length) {
      fail(response, 400, '请填写欠费明细')
      return
    }

    const houses = await prisma.house.findMany({
      where: buildingId ? { buildingId } : undefined,
      select: { id: true },
    })
    const validHouseIds = new Set(houses.map((item) => item.id))
    const invalidItem = items.find((item) => !validHouseIds.has(String(item.houseId || '')))
    if (invalidItem) {
      fail(response, 400, '存在不属于当前楼栋的房屋欠费记录')
      return
    }

    const createdRecords = await Promise.all(
      items.map((item) =>
        prisma.propertyBill.create({
          data: {
            month,
            title: String(item.title || `${month}历史欠费`),
            amount: toNumber(item.amount || 0),
            status: 'PENDING',
            houseId: String(item.houseId || ''),
          },
        }),
      ),
    )

    ok(
      response,
      {
        createdCount: createdRecords.length,
        items: createdRecords,
      },
      '欠费导入成功',
    )
  })
  app.get('/api/admin/bills', requireAdmin, async (request, response) => {
    if (new Date().getDate() === 1) {
      await ensureMonthlyBillsForMonth(getMonthString(new Date()))
    }
    const buildingId = request.query.buildingId ? String(request.query.buildingId) : undefined
    const month = request.query.month ? String(request.query.month) : undefined
    const bills = await prisma.propertyBill.findMany({
      where: {
        ...(month ? { month } : {}),
        ...(buildingId
          ? {
              house: {
                buildingId,
              },
            }
          : {}),
      },
      include: {
        house: {
          include: {
            building: true,
            ownerType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    const boundUsers = await prisma.wechatUser.findMany({
      where: {
        boundHouseId: {
          in: bills.map((item) => item.houseId),
        },
      },
    })
    const ownerMap = new Map(boundUsers.map((item) => [item.boundHouseId || '', item.nickname]))
    ok(
      response,
      bills.map((bill) => ({
        id: bill.id,
        month: bill.month,
        title: bill.title,
        amount: bill.amount,
        status: bill.status,
        houseId: bill.houseId,
        buildingId: bill.house.buildingId,
        buildingName: bill.house.building.name,
        roomNo: bill.house.roomNo,
        ownerTypeName: bill.house.ownerType?.name || '',
        ownerName: ownerMap.get(bill.houseId) || '',
        createdAt: bill.createdAt,
        updatedAt: bill.updatedAt,
      })),
    )
  })

  app.get('/api/admin/customer-service', requireAdmin, async (_request, response) => {
    let record = await prisma.customerServiceSetting.findFirst({
      orderBy: { createdAt: 'asc' },
    })
    if (!record) {
      record = await prisma.customerServiceSetting.create({
        data: {
          phone: '400-800-1234',
          serviceHours: '09:00-18:00',
          description: '物业客服中心',
        },
      })
    }
    ok(response, record)
  })
  app.put('/api/admin/customer-service', requireAdmin, async (request, response) => {
    const existing = await prisma.customerServiceSetting.findFirst({
      orderBy: { createdAt: 'asc' },
    })
    const updated = existing
      ? await prisma.customerServiceSetting.update({
          where: { id: existing.id },
          data: {
            phone: String(request.body.phone || existing.phone),
            serviceHours: String(request.body.serviceHours || existing.serviceHours),
            description: request.body.description === undefined ? existing.description : String(request.body.description || ''),
          },
        })
      : await prisma.customerServiceSetting.create({
          data: {
            phone: String(request.body.phone || ''),
            serviceHours: String(request.body.serviceHours || ''),
            description: String(request.body.description || ''),
          },
        })
    ok(response, updated, '客服信息更新成功')
  })

  app.get('/api/admin/system-settings', requireAdmin, async (_request, response) => {
    const settings = await prisma.systemSetting.findMany({
      orderBy: { createdAt: 'asc' },
    })
    ok(response, settings)
  })
  app.put('/api/admin/system-settings/:key', requireAdmin, async (request, response) => {
    const target = await prisma.systemSetting.findUnique({
      where: { key: String(request.params.key) },
    })
    if (!target) {
      fail(response, 404, '配置项不存在')
      return
    }
    const updated = await prisma.systemSetting.update({
      where: { key: String(request.params.key) },
      data: { value: String(request.body.value ?? '') },
    })
    ok(response, updated, '配置已更新')
  })

  app.get('/api/admin/property-fee-config', requireAdmin, async (_request, response) => {
    let setting = await prisma.systemSetting.findUnique({
      where: { key: SYSTEM_SETTING_PROPERTY_FEE_BASE_AMOUNT },
    })
    if (!setting) {
      setting = await prisma.systemSetting.create({
        data: {
          key: SYSTEM_SETTING_PROPERTY_FEE_BASE_AMOUNT,
          label: '基础物业费金额',
          value: '500',
        },
      })
    }
    ok(response, {
      baseAmount: Number(setting.value || 500),
    })
  })
  app.put('/api/admin/property-fee-config', requireAdmin, async (request, response) => {
    const baseAmount = Number(request.body.baseAmount)
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      fail(response, 400, '物业费金额必须大于0')
      return
    }
    await prisma.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_PROPERTY_FEE_BASE_AMOUNT },
      update: {
        value: String(baseAmount),
        label: '基础物业费金额',
      },
      create: {
        key: SYSTEM_SETTING_PROPERTY_FEE_BASE_AMOUNT,
        label: '基础物业费金额',
        value: String(baseAmount),
      },
    })
    ok(response, { baseAmount }, '物业费金额已更新')
  })

  app.get('/api/admin/operation-logs', requireAdmin, requireAdminRole('super_admin'), async (_request, response) => {
    const rows = await prisma.operationLog.findMany({
      orderBy: { createdAt: 'desc' },
    })
    ok(response, rows)
  })

  app.post('/api/mp/auth/login', async (request, response) => {
    const code = String(request.body.code || 'demo-code')

    let openid = ''
    if (code === 'demo-code') {
      openid = 'demo-openid'
    } else if (isWechatMiniProgramConfigured()) {
      try {
        const result = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
          params: {
            appid: env.wechatAppId,
            secret: env.wechatAppSecret,
            js_code: code,
            grant_type: 'authorization_code',
          },
        })
        const data = result.data || {}
        if (data.errcode) {
          console.warn('[mp/auth/login] jscode2session', data)
          fail(response, 502, data.errmsg || '微信登录失败，请检查小程序 AppId/AppSecret')
          return
        }
        if (!data.openid) {
          fail(response, 502, '微信登录异常，请稍后重试')
          return
        }
        openid = String(data.openid)
      } catch (error) {
        console.warn('[mp/auth/login] jscode2session request failed', error)
        fail(response, 502, '微信登录失败，请检查网络或小程序配置')
        return
      }
    } else {
      // 未配置有效微信密钥：真机/开发者工具每次 js_code 都不同，绝不能拼进 openid，否则一人多账号、绑定丢失
      openid = 'mp-dev-unconfigured-openid'
    }

    let user = await prisma.wechatUser.findUnique({
      where: { openid },
    })
    if (!user) {
      user = await prisma.wechatUser.create({
        data: {
          openid,
          nickname: '新业主用户',
          phone: '',
          boundHouseId: null,
        },
      })
    }

    const token = createAccessToken({
      subject: user.id,
      role: 'owner',
      scope: 'mp',
    })
    const bound = Boolean(user.boundHouseId && String(user.boundHouseId).trim())
    ok(response, {
      token,
      user: serializeMpWechatUser(user),
      requiresBinding: !bound,
    }, '登录成功')
  })

  // WeChat access_token cache
  let wxAccessToken = ''
  let wxAccessTokenExpiresAt = 0

  const getWxAccessToken = async (): Promise<string> => {
    if (wxAccessToken && Date.now() < wxAccessTokenExpiresAt) {
      return wxAccessToken
    }
    const result = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
      params: {
        grant_type: 'client_credential',
        appid: env.wechatAppId,
        secret: env.wechatAppSecret,
      },
    })
    if (result.data.access_token) {
      wxAccessToken = result.data.access_token
      wxAccessTokenExpiresAt = Date.now() + ((result.data.expires_in || 7200) - 300) * 1000
    }
    return wxAccessToken
  }

  app.post('/api/mp/auth/phone', requireMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const code = String(request.body.code || '')
    const fallbackPhone = String(request.body.phone || '')

    if (!code && !fallbackPhone) {
      fail(response, 400, '缺少手机号授权 code')
      return
    }

    let phoneNumber = ''

    const isDemoMode = !env.wechatAppId || env.wechatAppId === 'demo-wechat-app-id'

    if (isDemoMode) {
      phoneNumber = fallbackPhone || '13800000000'
    } else if (code) {
      try {
        const accessToken = await getWxAccessToken()
        const phoneResult = await axios.post(
          `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`,
          { code },
        )
        if (phoneResult.data.errcode === 0 && phoneResult.data.phone_info) {
          phoneNumber = phoneResult.data.phone_info.purePhoneNumber || phoneResult.data.phone_info.phoneNumber || ''
        } else {
          fail(response, 400, phoneResult.data.errmsg || '获取手机号失败')
          return
        }
      } catch {
        fail(response, 500, '获取手机号失败，请稍后重试')
        return
      }
    }

    if (!phoneNumber) {
      fail(response, 400, '无法获取手机号')
      return
    }

    const user = await prisma.wechatUser.update({
      where: { id: payload.sub },
      data: { phone: phoneNumber },
    })

    ok(response, serializeMpWechatUser(user), '手机号绑定成功')
  })

  app.get('/api/mp/me', requireMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const user = await prisma.wechatUser.findUnique({
      where: { id: payload.sub },
    })
    if (!user) {
      fail(response, 404, '用户不存在')
      return
    }
    ok(response, serializeMpWechatUser(user))
  })

  app.get('/api/mp/me/dashboard', requireMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string; record: { boundHouseId?: string } } }).user
    const [repairOrders, housekeepingOrders, bindings, pendingBills] = await Promise.all([
      prisma.repairOrder.count({ where: { ownerId: payload.sub } }),
      prisma.housekeepingOrder.count({ where: { ownerId: payload.sub } }),
      prisma.bindingApplication.count({ where: { applicantUserId: payload.sub } }),
      prisma.propertyBill.count({ where: { houseId: payload.record.boundHouseId || '', status: 'PENDING' } }),
    ])
    ok(response, {
      pendingBills,
      repairOrders,
      housekeepingOrders,
      bindings,
    })
  })
  app.get('/api/mp/notifications', requireMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const rows = await prisma.mpNotification.findMany({
      where: {
        OR: [{ userId: payload.sub }, { userId: null }],
      },
      orderBy: { createdAt: 'desc' },
    })
    ok(response, rows)
  })
  app.post('/api/mp/notifications/:id/read', requireMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const target = await prisma.mpNotification.findFirst({
      where: {
        id: String(request.params.id),
        OR: [{ userId: payload.sub }, { userId: null }],
      },
    })
    if (!target) {
      fail(response, 404, '消息不存在')
      return
    }
    const updated = await prisma.mpNotification.update({
      where: { id: target.id },
      data: { read: true },
    })
    ok(response, updated, '已标记已读')
  })

  app.get('/api/mp/buildings', async (_request, response) => {
    const buildings = await prisma.building.findMany({
      orderBy: { createdAt: 'desc' },
    })
    ok(response, buildings)
  })
  app.get('/api/mp/houses', async (_request, response) => {
    const buildingId = typeof _request.query.buildingId === 'string' ? _request.query.buildingId : undefined
    const houses = await prisma.house.findMany({
      where: buildingId ? { buildingId } : undefined,
      orderBy: { createdAt: 'desc' },
    })
    ok(response, houses)
  })
  app.get('/api/mp/bindings', requireMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const records = await prisma.bindingApplication.findMany({
      where: { applicantUserId: payload.sub },
      orderBy: { createdAt: 'desc' },
    })
    ok(response, records)
  })
  app.post('/api/mp/binding-applications', requireMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const wxUser = await prisma.wechatUser.findUnique({ where: { id: payload.sub } })
    const phone = String(wxUser?.phone || '').trim()
    if (!phone) {
      fail(response, 400, '请使用手机号快捷登录后再提交绑定申请')
      return
    }
    const record = await prisma.bindingApplication.create({
      data: {
        buildingId: String(request.body.buildingId || ''),
        roomNo: String(request.body.roomNo || ''),
        applicantName: String(request.body.applicantName || ''),
        applicantUserId: payload.sub,
        phone,
        status: 'PENDING',
      },
    })
    ok(response, record, '绑定申请已提交')
  })
  app.get('/api/mp/binding-applications/latest', requireMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const record = await prisma.bindingApplication.findFirst({
      where: { applicantUserId: payload.sub },
      orderBy: { createdAt: 'desc' },
    })
    ok(response, record || null)
  })
  app.post('/api/mp/bindings/:id/unbind', requireMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string; record: { id: string; boundHouseId?: string } } }).user
    const target = await prisma.bindingApplication.findFirst({
      where: {
        id: String(request.params.id),
        applicantUserId: payload.sub,
      },
    })
    if (!target) {
      fail(response, 404, '绑定记录不存在')
      return
    }
    const updated = await prisma.bindingApplication.update({
      where: { id: String(request.params.id) },
      data: { status: 'UNBOUND' },
    })
    await prisma.wechatUser.update({
      where: { id: payload.sub },
      data: { boundHouseId: '', nickname: '新业主用户' },
    })
    payload.record.boundHouseId = ''
    ok(response, updated, '解绑成功')
  })

  app.get('/api/mp/home/banners', async (_request, response) => {
    const rows = await prisma.announcement.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
    })
    ok(response, rows.map((item) => ({
      ...item,
      content: sanitizeAnnouncementContent(item.content),
    })))
  })
  app.get('/api/mp/announcements', async (_request, response) => {
    const rows = await prisma.announcement.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
    })
    ok(response, rows.map((item) => ({
      ...item,
      content: sanitizeAnnouncementContent(item.content),
    })))
  })
  app.get('/api/mp/announcements/:id', async (_request, response) => {
    const announcement = await prisma.announcement.findFirst({
      where: {
        id: String(_request.params.id),
        status: 'PUBLISHED',
      },
    })
    if (!announcement) {
      fail(response, 404, '公告不存在')
      return
    }
    const voteTopic = await prisma.voteTopic.findFirst({
      where: {
        announcementId: announcement.id,
        status: 'ONGOING',
      },
      orderBy: { createdAt: 'desc' },
    })
    ok(response, {
      ...announcement,
      content: sanitizeAnnouncementContent(announcement.content),
      voteTopic: voteTopic ? { ...voteTopic, options: parseVoteOptions(voteTopic.optionsJson) } : null,
    })
  })
  app.get('/api/mp/vote-topics/:id', async (_request, response) => {
    const voteTopic = await prisma.voteTopic.findUnique({
      where: { id: String(_request.params.id) },
    })
    if (!voteTopic) {
      fail(response, 404, '投票不存在')
      return
    }
    ok(response, { ...voteTopic, options: parseVoteOptions(voteTopic.optionsJson) })
  })
  app.post('/api/mp/vote-topics/:id/vote', requireBoundMp, async (request, response) => {
    const voteTopic = await prisma.voteTopic.findUnique({
      where: { id: String(request.params.id) },
    })
    if (!voteTopic) {
      fail(response, 404, '投票不存在')
      return
    }
    const optionId = String(request.body.optionId || '')
    const options = parseVoteOptions(voteTopic.optionsJson)
    const option = options.find((item) => item.id === optionId)
    if (!option) {
      fail(response, 400, '请选择有效选项')
      return
    }
    option.votes += 1
    const updated = await prisma.voteTopic.update({
      where: { id: String(request.params.id) },
      data: { optionsJson: JSON.stringify(options) },
    })
    ok(response, { ...updated, options }, '投票成功')
  })
  app.get('/api/mp/vote-topics/:id/result', async (_request, response) => {
    const voteTopic = await prisma.voteTopic.findUnique({
      where: { id: String(_request.params.id) },
    })
    if (!voteTopic) {
      fail(response, 404, '投票不存在')
      return
    }
    const options = parseVoteOptions(voteTopic.optionsJson)
    const total = options.reduce((sum, item) => sum + item.votes, 0)
    ok(response, options.map((item) => ({
      ...item,
      percent: total ? Number(((item.votes / total) * 100).toFixed(2)) : 0,
    })))
  })

  app.get('/api/mp/repair-orders', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const orders = await prisma.repairOrder.findMany({
      where: { ownerId: payload.sub },
      orderBy: { createdAt: 'desc' },
    })
    ok(response, orders)
  })
  app.get('/api/mp/repair-orders/:id', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const target = await prisma.repairOrder.findFirst({
      where: {
        id: String(request.params.id),
        ownerId: payload.sub,
      },
    })
    if (!target) {
      fail(response, 404, '工单不存在')
      return
    }
    ok(response, {
      ...target,
      imageUrls: parseJsonStringArray(target.imagesJson),
    })
  })
  app.post('/api/mp/repair-orders', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const fromJson = request.body.imagesJson ? parseJsonStringArray(String(request.body.imagesJson)) : []
    const fromArr = parseStringArray(request.body.imageUrls)
    const imageList = fromJson.length ? fromJson : fromArr
    const record = await prisma.repairOrder.create({
      data: {
        orderNo: `R${Date.now()}`,
        address: String(request.body.address || ''),
        description: String(request.body.description || ''),
        imagesJson: JSON.stringify(imageList),
        ownerId: payload.sub,
        phone: String(request.body.phone || ''),
        status: 'PENDING',
      },
    })
    ok(response, record, '报修工单已提交')
  })

  app.get('/api/mp/housekeeping/packages', async (_request, response) => {
    ok(response, await prisma.housekeepingPackage.findMany({ orderBy: { createdAt: 'asc' } }))
  })
  // 小程序端：本地日期 + 固定整点时段；接口保留兼容
  app.get('/api/mp/housekeeping/slots', (_request, response) => ok(response, []))
  app.get('/api/mp/housekeeping/orders', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const orders = await prisma.housekeepingOrder.findMany({
      where: { ownerId: payload.sub },
      orderBy: { createdAt: 'desc' },
    })
    ok(response, orders)
  })
  app.get('/api/mp/housekeeping/orders/:id', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const target = await prisma.housekeepingOrder.findFirst({
      where: {
        id: String(request.params.id),
        ownerId: payload.sub,
      },
    })
    if (!target) {
      fail(response, 404, '订单不存在')
      return
    }
    let housekeeperName: string | null = null
    let housekeeperPhone: string | null = null
    if (target.housekeeperId) {
      const hk = await prisma.housekeeper.findUnique({
        where: { id: target.housekeeperId },
      })
      if (hk) {
        housekeeperName = hk.name
        housekeeperPhone = hk.phone || null
      }
    }
    const pkg = await prisma.housekeepingPackage.findUnique({
      where: { id: target.packageId },
    })
    ok(response, {
      ...target,
      housekeeperName,
      housekeeperPhone,
      packageName: pkg?.name ?? '',
    })
  })
  app.post('/api/mp/housekeeping/orders', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const record = await prisma.housekeepingOrder.create({
      data: {
        orderNo: `H${Date.now()}`,
        packageId: String(request.body.packageId || ''),
        contactPhone: String(request.body.contactPhone || ''),
        serviceAddress: String(request.body.serviceAddress || ''),
        serviceDate: String(request.body.serviceDate || ''),
        serviceTime: String(request.body.serviceTime || ''),
        ownerId: payload.sub,
        amount: toNumber(request.body.amount || 0),
        paymentStatus: 'OFFLINE',
        status: 'WAIT_ASSIGN',
        clientNote: request.body.note ? String(request.body.note).slice(0, 500) : null,
      },
    })
    ok(response, record, '预约已提交，工作人员将尽快与您确认')
  })
  app.post('/api/mp/housekeeping/orders/:id/pay', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string; record: { openid: string } } }).user
    const target = await prisma.housekeepingOrder.findFirst({
      where: {
        id: String(request.params.id),
        ownerId: payload.sub,
      },
    })
    if (!target) {
      fail(response, 404, '订单不存在')
      return
    }
    if (target.paymentStatus === 'PAID') {
      fail(response, 400, '订单已支付')
      return
    }
    if (target.paymentStatus === 'OFFLINE') {
      fail(response, 400, '该预约为前台登记，无需在线支付')
      return
    }
    const orderNo = createPaymentOrderNo('HK')
    if (!isWechatPayConfigured()) {
      const paymentResult = createMockPaymentResult({
        amount: target.amount,
        businessType: 'housekeeping_order',
        orderNo,
      })
      await prisma.housekeepingOrder.update({
        where: { id: target.id },
        data: { paymentStatus: 'PAID' },
      })
      await prisma.paymentOrder.create({
        data: {
          orderNo: paymentResult.orderNo,
          businessType: paymentResult.businessType,
          businessId: target.id,
          openid: payload.sub,
          paidAmount: paymentResult.paidAmount,
          channel: paymentResult.channel,
          status: paymentResult.status,
          tradeState: paymentResult.tradeState,
          transactionNo: paymentResult.transactionNo,
          paidAt: new Date(paymentResult.paidAt),
        },
      })
      ok(response, paymentResult, '支付成功')
      return
    }

    try {
      const paymentResult = await createWechatJsapiPayment({
        openid: payload.record.openid,
        orderNo,
        amount: target.amount,
        description: buildPaymentDescription('housekeeping_order'),
        attach: 'housekeeping_order',
      })
      await prisma.paymentOrder.create({
        data: {
          orderNo: paymentResult.orderNo,
          businessType: 'housekeeping_order',
          businessId: target.id,
          openid: payload.record.openid,
          mchId: env.wechatPayMchId,
          prepayId: paymentResult.prepayId,
          paidAmount: paymentResult.paidAmount,
          channel: paymentResult.channel,
          status: paymentResult.status,
          tradeState: paymentResult.tradeState,
        },
      })
      ok(response, paymentResult, '请完成微信支付')
    } catch (error) {
      fail(response, error instanceof PaymentConfigurationError ? 400 : 502, error instanceof Error ? error.message : '微信支付下单失败')
    }
  })
  app.post('/api/mp/housekeeping/orders/:id/cancel', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const target = await prisma.housekeepingOrder.findFirst({
      where: {
        id: String(request.params.id),
        ownerId: payload.sub,
      },
    })
    if (!target) {
      fail(response, 404, '订单不存在')
      return
    }
    const updated = await prisma.housekeepingOrder.update({
      where: { id: String(request.params.id) },
      data: {
        status: 'CANCELLED',
        completeNote: String(request.body.reason || ''),
      },
    })
    ok(response, updated, '取消成功')
  })
  app.post('/api/mp/housekeeping/orders/:id/reschedule', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const target = await prisma.housekeepingOrder.findFirst({
      where: {
        id: String(request.params.id),
        ownerId: payload.sub,
      },
    })
    if (!target) {
      fail(response, 404, '订单不存在')
      return
    }
    const updated = await prisma.housekeepingOrder.update({
      where: { id: String(request.params.id) },
      data: {
        serviceDate: String(request.body.serviceDate || target.serviceDate),
        serviceTime: String(request.body.serviceTime || target.serviceTime),
      },
    })
    ok(response, updated, '改期成功')
  })
  app.post('/api/mp/housekeeping/orders/:id/review', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const target = await prisma.housekeepingOrder.findFirst({
      where: {
        id: String(request.params.id),
        ownerId: payload.sub,
      },
    })
    if (!target) {
      fail(response, 404, '订单不存在')
      return
    }
    const updated = await prisma.housekeepingOrder.update({
      where: { id: String(request.params.id) },
      data: {
        completeNote: `评分:${toNumber(request.body.rating || 5)} 评价:${String(request.body.content || '')}`,
      },
    })
    ok(response, updated, '评价成功')
  })

  app.get('/api/mp/bills', requireBoundMp, async (request, response) => {
    if (new Date().getDate() === 1) {
      await ensureMonthlyBillsForMonth(getMonthString(new Date()))
    }
    const payload = (request as Request & { user: { record: { boundHouseId?: string } } }).user
    const bills = await prisma.propertyBill.findMany({
      where: { houseId: payload.record.boundHouseId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    })
    ok(response, bills)
  })
  app.get('/api/mp/bills/summary', requireBoundMp, async (request, response) => {
    if (new Date().getDate() === 1) {
      await ensureMonthlyBillsForMonth(getMonthString(new Date()))
    }
    const payload = (request as Request & { user: { record: { boundHouseId?: string } } }).user
    const items = await prisma.propertyBill.findMany({
      where: { houseId: payload.record.boundHouseId, status: 'PENDING' },
    })
    ok(response, {
      totalCount: items.length,
      totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
    })
  })
  /** 当前绑定房屋的已缴费账单（历史记录） */
  app.get('/api/mp/bills/paid-history', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { record: { boundHouseId?: string } } }).user
    const bills = await prisma.propertyBill.findMany({
      where: { houseId: payload.record.boundHouseId, status: 'PAID' },
      orderBy: { updatedAt: 'desc' },
    })
    ok(response, bills)
  })
  app.post('/api/mp/payments/preview', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { record: { boundHouseId?: string } } }).user
    const ids = (request.body.billIds || []) as string[]
    const items = await prisma.propertyBill.findMany({
      where: {
        id: { in: ids },
        houseId: payload.record.boundHouseId,
        status: 'PENDING',
      },
    })
    ok(response, {
      items,
      totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
    })
  })
  app.post('/api/mp/payments/submit', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { record: { boundHouseId?: string; openid: string } } }).user
    const billIds = (request.body.billIds || []) as string[]
    const ownedBills = await prisma.propertyBill.findMany({
      where: {
        id: { in: billIds },
        houseId: payload.record.boundHouseId,
        status: 'PENDING',
      },
    })
    const amount = ownedBills.reduce((sum, item) => sum + item.amount, 0)
    if (!ownedBills.length || amount <= 0) {
      fail(response, 400, '未找到可支付账单')
      return
    }
    const orderNo = createPaymentOrderNo('BILL')
    const businessType = String(request.body.businessType || 'property_bill')
    if (!isWechatPayConfigured()) {
      await prisma.propertyBill.updateMany({
        where: {
          id: { in: billIds },
          houseId: payload.record.boundHouseId,
          status: 'PENDING',
        },
        data: { status: 'PAID' },
      })
      const paymentResult = createMockPaymentResult({
        amount,
        businessType,
        orderNo,
      })
      await prisma.paymentOrder.create({
        data: {
          orderNo: paymentResult.orderNo,
          businessType: paymentResult.businessType,
          billIdsJson: JSON.stringify(ownedBills.map((item) => item.id)),
          openid: payload.record.openid,
          paidAmount: paymentResult.paidAmount,
          channel: paymentResult.channel,
          status: paymentResult.status,
          tradeState: paymentResult.tradeState,
          transactionNo: paymentResult.transactionNo,
          paidAt: new Date(paymentResult.paidAt),
        },
      })
      ok(response, paymentResult, '支付成功')
      return
    }

    try {
      const paymentResult = await createWechatJsapiPayment({
        openid: payload.record.openid,
        orderNo,
        amount,
        description: buildPaymentDescription('property_bill'),
        attach: businessType,
      })
      await prisma.paymentOrder.create({
        data: {
          orderNo: paymentResult.orderNo,
          businessType,
          billIdsJson: JSON.stringify(ownedBills.map((item) => item.id)),
          openid: payload.record.openid,
          mchId: env.wechatPayMchId,
          prepayId: paymentResult.prepayId,
          paidAmount: paymentResult.paidAmount,
          channel: paymentResult.channel,
          status: paymentResult.status,
          tradeState: paymentResult.tradeState,
        },
      })
      ok(response, paymentResult, '请完成微信支付')
    } catch (error) {
      fail(response, error instanceof PaymentConfigurationError ? 400 : 502, error instanceof Error ? error.message : '微信支付下单失败')
    }
  })
  app.get('/api/mp/payments/:id/result', requireMp, async (request, response) => {
    const target = await prisma.paymentOrder.findUnique({
      where: { orderNo: String(request.params.id) },
    })
    if (!target) {
      fail(response, 404, '支付记录不存在')
      return
    }
    ok(response, target)
  })

  app.get('/api/mp/rentals', async (_request, response) => {
    const rows = await prisma.rentalListing.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
    })
    ok(response, rows)
  })
  app.get('/api/mp/rentals/:id', async (_request, response) => {
    const target = await prisma.rentalListing.findFirst({
      where: {
        id: String(_request.params.id),
        status: 'PUBLISHED',
      },
    })
    if (!target) {
      fail(response, 404, '房源不存在')
      return
    }
    ok(response, target)
  })
  app.post('/api/mp/rentals', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const cover = request.body.coverImage ? String(request.body.coverImage) : ''
    const imagesJsonRaw = request.body.imagesJson ? String(request.body.imagesJson) : ''
    const record = await prisma.rentalListing.create({
      data: {
        title: String(request.body.title || ''),
        ownerId: payload.sub,
        coverImage: cover || null,
        imagesJson: imagesJsonRaw || (cover ? JSON.stringify([cover]) : null),
        address: String(request.body.address || ''),
        rent: toNumber(request.body.rent || 0),
        area: toNumber(request.body.area || 0),
        layout: String(request.body.layout || ''),
        phone: String(request.body.phone || ''),
        status: 'DRAFT',
      },
    })
    ok(response, record, '房源已保存')
  })
  app.put('/api/mp/rentals/:id', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const target = await prisma.rentalListing.findFirst({
      where: {
        id: String(request.params.id),
        ownerId: payload.sub,
      },
    })
    if (!target) {
      fail(response, 404, '房源不存在')
      return
    }
    const coverUpd = request.body.coverImage === undefined ? undefined : (request.body.coverImage ? String(request.body.coverImage) : null)
    const imagesJsonUpd = request.body.imagesJson === undefined ? undefined : (request.body.imagesJson ? String(request.body.imagesJson) : null)
    const updated = await prisma.rentalListing.update({
      where: { id: String(request.params.id) },
      data: {
        title: request.body.title,
        coverImage: coverUpd,
        imagesJson: imagesJsonUpd,
        address: request.body.address,
        rent: request.body.rent === undefined ? undefined : toNumber(request.body.rent),
        area: request.body.area === undefined ? undefined : toNumber(request.body.area),
        layout: request.body.layout,
        phone: request.body.phone,
      },
    })
    ok(response, updated, '房源更新成功')
  })
  app.post('/api/mp/rentals/:id/publish', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const target = await prisma.rentalListing.findFirst({
      where: {
        id: String(request.params.id),
        ownerId: payload.sub,
      },
    })
    if (!target) {
      fail(response, 404, '房源不存在')
      return
    }
    const updated = await prisma.rentalListing.update({
      where: { id: String(request.params.id) },
      data: { status: 'PUBLISHED' },
    })
    ok(response, updated, '发布成功')
  })
  app.post('/api/mp/rentals/:id/unpublish', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const target = await prisma.rentalListing.findFirst({
      where: {
        id: String(request.params.id),
        ownerId: payload.sub,
      },
    })
    if (!target) {
      fail(response, 404, '房源不存在')
      return
    }
    const updated = await prisma.rentalListing.update({
      where: { id: String(request.params.id) },
      data: { status: 'OFFLINE' },
    })
    ok(response, updated, '已下架')
  })
  app.delete('/api/mp/rentals/:id', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const target = await prisma.rentalListing.findFirst({
      where: {
        id: String(request.params.id),
        ownerId: payload.sub,
      },
    })
    if (!target) {
      fail(response, 404, '房源不存在')
      return
    }
    await prisma.rentalListing.delete({
      where: { id: String(request.params.id) },
    })
    ok(response, target, '删除成功')
  })
  app.get('/api/mp/my/rentals', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const rows = await prisma.rentalListing.findMany({
      where: { ownerId: payload.sub },
      orderBy: { createdAt: 'desc' },
    })
    ok(response, rows)
  })

  app.get('/api/mp/feedback', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const rows = await prisma.feedbackRecord.findMany({
      where: { ownerId: payload.sub },
      orderBy: { createdAt: 'desc' },
    })
    ok(
      response,
      rows.map((r) => ({ ...r, orderNo: mpFeedbackOrderNo(r) })),
    )
  })
  app.get('/api/mp/feedback/:id', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const record = await prisma.feedbackRecord.findFirst({
      where: {
        id: String(request.params.id),
        ownerId: payload.sub,
      },
    })
    if (!record) {
      fail(response, 404, '记录不存在')
      return
    }
    ok(response, {
      ...record,
      orderNo: mpFeedbackOrderNo(record),
      content: sanitizeAnnouncementContent(record.content),
      reply: record.reply ? sanitizeAnnouncementContent(record.reply) : record.reply,
    })
  })
  app.post('/api/mp/feedback', requireBoundMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const record = await prisma.feedbackRecord.create({
      data: {
        orderNo: `F${Date.now()}`,
        content: String(request.body.content || ''),
        ownerId: payload.sub,
        status: 'PENDING',
        reply: '',
      },
    })
    ok(response, { ...record, orderNo: mpFeedbackOrderNo(record) }, '反馈已提交')
  })

  app.get('/api/mp/lost-found', requireMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const rows = await prisma.lostFoundRecord.findMany({
      where: { ownerId: payload.sub },
      orderBy: { createdAt: 'desc' },
    })
    ok(
      response,
      rows.map((r) => ({ ...r, orderNo: mpLostFoundOrderNo(r) })),
    )
  })
  app.get('/api/mp/lost-found/:id', requireMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const record = await prisma.lostFoundRecord.findFirst({
      where: {
        id: String(request.params.id),
        ownerId: payload.sub,
      },
    })
    if (!record) {
      fail(response, 404, '记录不存在')
      return
    }
    ok(response, { ...record, orderNo: mpLostFoundOrderNo(record) })
  })
  app.post('/api/mp/lost-found', requireMp, async (request, response) => {
    const payload = (request as Request & { user: { sub: string } }).user
    const record = await prisma.lostFoundRecord.create({
      data: {
        orderNo: `L${Date.now()}`,
        ownerId: payload.sub,
        itemName: String(request.body.itemName || ''),
        lostAt: String(request.body.lostAt || ''),
        location: String(request.body.location || ''),
        phone: String(request.body.phone || ''),
        status: 'PENDING',
      },
    })
    ok(response, { ...record, orderNo: mpLostFoundOrderNo(record) }, '登记成功')
  })

  app.get('/api/mp/customer-service', async (_request, response) => {
    const record = await prisma.customerServiceSetting.findFirst({
      orderBy: { createdAt: 'asc' },
    })
    ok(response, record)
  })

  return app
}
