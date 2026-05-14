import request from 'supertest'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { hashPassword } from '../src/services/auth.service.js'

describe.sequential('app routes', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret'
    process.env.OSS_ACCESS_KEY_ID = 'test-key'
    process.env.OSS_ACCESS_KEY_SECRET = 'test-secret'
    process.env.OSS_BUCKET = 'test-bucket'
    process.env.OSS_REGION = 'oss-cn-beijing'
    process.env.OSS_ENDPOINT = 'oss-accelerate.aliyuncs.com'
    process.env.OSS_BUCKET_DOMAIN = 'https://test-bucket.oss-accelerate.aliyuncs.com'
    // 避免本机 .env 中真实微信配置导致测试用假 code 走 jscode2session 返回 502
    process.env.WECHAT_APP_ID = 'demo-wechat-app-id'
    process.env.WECHAT_APP_SECRET = 'demo-wechat-app-secret'
  })

  beforeEach(async () => {
    await prisma.paymentOrder.deleteMany()
    await prisma.mpNotification.deleteMany()
    await prisma.operationLog.deleteMany()
    await prisma.wechatUser.deleteMany()
    await prisma.voteTopic.deleteMany()
    await prisma.announcement.deleteMany()
    await prisma.rentalListing.deleteMany()
    await prisma.feedbackRecord.deleteMany()
    await prisma.lostFoundRecord.deleteMany()
    await prisma.customerServiceSetting.deleteMany()
    await prisma.repairOrder.deleteMany()
    await prisma.housekeepingOrder.deleteMany()
    await prisma.propertyBill.deleteMany()
    await prisma.housekeepingPackage.deleteMany()
    await prisma.housekeeper.deleteMany()
    await prisma.maintainer.deleteMany()
    await prisma.bindingApplication.deleteMany()
    await prisma.house.deleteMany()
    await prisma.building.deleteMany()
    await prisma.ownerType.deleteMany()
    await prisma.systemSetting.deleteMany()
    await prisma.adminUser.deleteMany()

    await prisma.adminUser.create({
      data: {
        username: 'admin',
        passwordHash: await hashPassword('admin123'),
        role: 'super_admin',
        name: '系统管理员',
        status: 'ACTIVE',
      },
    })

    await prisma.systemSetting.create({
      data: {
        key: 'communityName',
        label: '小区名称',
        value: '龙江太古城',
      },
    })

    const ownerType = await prisma.ownerType.create({
      data: {
        name: '普通住户',
        feeRate: 1,
        baseFee: 500,
        description: '按标准收费',
      },
    })

    const building = await prisma.building.create({
      data: {
        name: '3号楼',
        code: '3',
        status: 'ACTIVE',
      },
    })

    await prisma.house.create({
      data: {
        id: 'house-1',
        buildingId: building.id,
        roomNo: '1802',
        area: 89,
        ownerTypeId: ownerType.id,
        status: 'BOUND',
      },
    })

    await prisma.maintainer.create({
      data: {
        id: 'seed-maintainer-1',
        name: '张师傅',
        phone: '13800001111',
        type: '综合维修',
        status: 'ACTIVE',
      },
    })

    await prisma.housekeeper.create({
      data: {
        id: 'seed-housekeeper-1',
        name: '李阿姨',
        phone: '13800002222',
        specialty: '全屋保洁',
        status: 'ACTIVE',
      },
    })

    await prisma.housekeepingPackage.create({
      data: {
        id: 'seed-package-1',
        name: '基础打扫',
        price: 100,
        durationHours: 2,
        description: '日常清洁、扫地拖地、整理收纳',
      },
    })

    await prisma.propertyBill.createMany({
      data: [
        {
          id: 'bill-1',
          month: '2026-03',
          title: '2026年03月物业费',
          amount: 500,
          status: 'PENDING',
          houseId: 'house-1',
        },
        {
          id: 'bill-2',
          month: '2026-02',
          title: '2026年02月历史欠费',
          amount: 1000,
          status: 'PENDING',
          houseId: 'house-1',
        },
      ],
    })

    await prisma.customerServiceSetting.create({
      data: {
        id: 'cs-1',
        phone: '400-800-1234',
        serviceHours: '09:00-18:00',
        description: '物业客服中心',
      },
    })

    await prisma.wechatUser.create({
      data: {
        id: 'mp-user-1',
        openid: 'demo-openid',
        nickname: '张三',
        phone: '13800001234',
        boundHouseId: 'house-1',
      },
    })

    await prisma.mpNotification.create({
      data: {
        id: 'notice-1',
        userId: 'mp-user-1',
        title: '报修工单已受理',
        content: '您的报修工单已分配维修人员。',
        read: false,
      },
    })
  })

  it('returns health information', async () => {
    const app = createApp()
    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.service).toBe('property-service-backend')
  })

  it('logs admin user in with default credentials', async () => {
    const app = createApp()
    const response = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.user.username).toBe('admin')
    expect(response.body.data.token).toBeTruthy()
  })

  it('returns upload signature payload', async () => {
    const app = createApp()
    const login = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const response = await request(app)
      .post('/api/admin/uploads/policy')
      .set('Authorization', `Bearer ${login.body.data.token}`)
      .send({ directory: 'announcements', filename: 'cover.png', mimeType: 'image/png' })

    expect(response.status).toBe(200)
    expect(response.body.data.host).toContain('aliyuncs.com')
    expect(response.body.data.key).toContain('announcements/')
  })

  it('rejects anonymous upload policy requests', async () => {
    const app = createApp()
    const response = await request(app)
      .post('/api/admin/uploads/policy')
      .send({ directory: 'announcements', filename: 'cover.png', mimeType: 'image/png' })

    expect(response.status).toBe(401)
  })

  it('returns mini-program upload signature payload for authenticated users', async () => {
    const app = createApp()
    const login = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const response = await request(app)
      .post('/api/mp/uploads/policy')
      .set('Authorization', `Bearer ${login.body.data.token}`)
      .send({ directory: 'repair', filename: 'repair.jpg', mimeType: 'image/jpeg' })

    expect(response.status).toBe(200)
    expect(response.body.data.host).toContain('aliyuncs.com')
    expect(response.body.data.key).toContain('repair/')
  })

  it('creates a front desk account that can log in', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const createResponse = await request(app)
      .post('/api/admin/accounts')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({
        username: 'frontdesk01',
        name: '前台一号',
        role: 'front_desk',
        password: 'front123',
        status: 'ACTIVE',
      })

    expect(createResponse.status).toBe(200)

    const loginResponse = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'frontdesk01', password: 'front123' })

    expect(loginResponse.status).toBe(200)
    expect(loginResponse.body.data.user.role).toBe('front_desk')
    await expect(prisma.adminUser.findUnique({ where: { username: 'frontdesk01' } })).resolves.toMatchObject({
      username: 'frontdesk01',
      role: 'front_desk',
      status: 'ACTIVE',
    })
  })

  it('prevents front desk users from accessing super admin account management', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    await request(app)
      .post('/api/admin/accounts')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({
        username: 'frontdesk02',
        name: '前台二号',
        role: 'front_desk',
        password: 'front123',
        status: 'ACTIVE',
      })

    const frontLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'frontdesk02', password: 'front123' })

    const response = await request(app)
      .get('/api/admin/accounts')
      .set('Authorization', `Bearer ${frontLogin.body.data.token}`)

    expect(response.status).toBe(403)

    const dashboardResponse = await request(app)
      .get('/api/admin/dashboard/overview')
      .set('Authorization', `Bearer ${frontLogin.body.data.token}`)

    expect(dashboardResponse.status).toBe(403)
  })

  it('rejects creating admin accounts with unsupported roles', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const response = await request(app)
      .post('/api/admin/accounts')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({
        username: 'invalid-role',
        name: '错误角色',
        role: 'manager',
        password: 'front123',
        status: 'ACTIVE',
      })

    expect(response.status).toBe(400)
  })

  it('blocks unbound mini-program users from owner-only APIs', async () => {
    const app = createApp()
    const loginResponse = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'new-user-code' })

    const response = await request(app)
      .get('/api/mp/bills')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)

    expect(loginResponse.body.data.requiresBinding).toBe(true)
    expect(response.status).toBe(403)
  })

  it('uses server-calculated bill total for mock payments', async () => {
    const app = createApp()
    const loginResponse = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const response = await request(app)
      .post('/api/mp/payments/submit')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)
      .send({
        businessType: 'property_bill',
        billIds: ['bill-1'],
        amount: 1,
      })

    expect(response.status).toBe(200)
    expect(response.body.data.paidAmount).toBe(500)
  })

  it('persists system setting updates in prisma', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const response = await request(app)
      .put('/api/admin/system-settings/communityName')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({ value: '新物业小区' })

    expect(response.status).toBe(200)
    await expect(prisma.systemSetting.findUnique({ where: { key: 'communityName' } })).resolves.toMatchObject({
      value: '新物业小区',
    })
  })

  it('persists building creation in prisma', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const response = await request(app)
      .post('/api/admin/buildings')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({ name: '5号楼', code: '5', status: 'ACTIVE' })

    expect(response.status).toBe(200)
    await expect(prisma.building.findUnique({ where: { code: '5' } })).resolves.toMatchObject({
      name: '5号楼',
    })
  })

  it('persists owner type and house listing via prisma-backed endpoints', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const ownerTypeResponse = await request(app)
      .post('/api/admin/owner-types')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({ name: '回迁户', feeRate: 0.1, baseFee: 500, description: '优惠计费' })

    expect(ownerTypeResponse.status).toBe(200)
    const ownerType = await prisma.ownerType.findFirst({ where: { name: '回迁户' } })
    expect(ownerType).toBeTruthy()

    const building = await prisma.building.findUnique({ where: { code: '3' } })
    const houseResponse = await request(app)
      .post('/api/admin/houses')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({
        buildingId: building?.id,
        roomNo: '1901',
        area: 96,
        ownerTypeId: ownerType?.id,
        status: 'IDLE',
      })

    expect(houseResponse.status).toBe(200)
    await expect(prisma.house.findFirst({ where: { roomNo: '1901' } })).resolves.toMatchObject({
      roomNo: '1901',
      ownerTypeId: ownerType?.id,
    })
  })

  it('returns houses with building and owner type display fields for admin forms', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const response = await request(app)
      .get('/api/admin/houses')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'house-1',
          buildingName: '3号楼',
          ownerTypeName: '普通住户',
        }),
      ]),
    )
  })

  it('persists binding applications and approval in prisma', async () => {
    const app = createApp()
    const mpLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const building = await prisma.building.findUnique({ where: { code: '3' } })
    const createResponse = await request(app)
      .post('/api/mp/binding-applications')
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)
      .send({
        buildingId: building?.id,
        roomNo: '1802',
        applicantName: '业主甲',
        phone: '13800009999',
      })

    expect(createResponse.status).toBe(200)
    const created = await prisma.bindingApplication.findUnique({ where: { id: createResponse.body.data.id } })
    expect(created?.status).toBe('PENDING')

    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const approveResponse = await request(app)
      .post(`/api/admin/binding-applications/${createResponse.body.data.id}/approve`)
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)

    expect(approveResponse.status).toBe(200)
    await expect(prisma.bindingApplication.findUnique({ where: { id: createResponse.body.data.id } })).resolves.toMatchObject({
      status: 'APPROVED',
    })
  })

  it('rejects approving binding applications when target house does not exist', async () => {
    const app = createApp()
    const mpLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const building = await prisma.building.findUnique({ where: { code: '3' } })
    const createResponse = await request(app)
      .post('/api/mp/binding-applications')
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)
      .send({
        buildingId: building?.id,
        roomNo: '9999',
        applicantName: '业主乙',
        phone: '13800008888',
      })

    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const approveResponse = await request(app)
      .post(`/api/admin/binding-applications/${createResponse.body.data.id}/approve`)
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)

    expect(approveResponse.status).toBe(400)
  })

  it('unbinds approved bindings and clears bound house on user record', async () => {
    const app = createApp()
    const binding = await prisma.bindingApplication.create({
      data: {
        buildingId: 'building-1',
        roomNo: '1802',
        applicantName: '张三',
        applicantUserId: 'mp-user-1',
        phone: '13800001234',
        status: 'APPROVED',
      },
    })
    const mpLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const response = await request(app)
      .post(`/api/mp/bindings/${binding.id}/unbind`)
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)

    expect(response.status).toBe(200)
    await expect(prisma.bindingApplication.findUnique({ where: { id: binding.id } })).resolves.toMatchObject({
      status: 'UNBOUND',
    })
    await expect(prisma.wechatUser.findUnique({ where: { id: 'mp-user-1' } })).resolves.toMatchObject({
      boundHouseId: '',
    })
  })

  it('persists repair orders and assignment in prisma', async () => {
    const app = createApp()
    const mpLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const createResponse = await request(app)
      .post('/api/mp/repair-orders')
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)
      .send({
        address: '3号楼 1802室',
        description: '主卧灯不亮',
        phone: '13800005678',
        imageUrls: ['https://example.com/repair-1.jpg'],
      })

    expect(createResponse.status).toBe(200)
    await expect(prisma.repairOrder.findUnique({ where: { id: createResponse.body.data.id } })).resolves.toMatchObject({
      description: '主卧灯不亮',
      status: 'PENDING',
      imagesJson: '["https://example.com/repair-1.jpg"]',
    })

    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const assignResponse = await request(app)
      .post(`/api/admin/repair-orders/${createResponse.body.data.id}/assign`)
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({ maintainerId: 'seed-maintainer-1' })

    expect(assignResponse.status).toBe(200)
    await expect(prisma.repairOrder.findUnique({ where: { id: createResponse.body.data.id } })).resolves.toMatchObject({
      maintainerId: 'seed-maintainer-1',
      status: 'PROCESSING',
    })
  })

  it('persists housekeeping orders and assignment in prisma', async () => {
    const app = createApp()
    const mpLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const createResponse = await request(app)
      .post('/api/mp/housekeeping/orders')
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)
      .send({
        packageId: 'seed-package-1',
        contactPhone: '13800005678',
        serviceAddress: '3号楼 1802室',
        serviceDate: '2026-03-20',
        serviceTime: '09:00-11:00',
        amount: 100,
      })

    expect(createResponse.status).toBe(200)
    await expect(prisma.housekeepingOrder.findUnique({ where: { id: createResponse.body.data.id } })).resolves.toMatchObject({
      packageId: 'seed-package-1',
      status: 'WAIT_ASSIGN',
      paymentStatus: 'OFFLINE',
    })

    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const assignResponse = await request(app)
      .post(`/api/admin/housekeeping/orders/${createResponse.body.data.id}/assign`)
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({ housekeeperId: 'seed-housekeeper-1' })

    expect(assignResponse.status).toBe(200)
    await expect(prisma.housekeepingOrder.findUnique({ where: { id: createResponse.body.data.id } })).resolves.toMatchObject({
      housekeeperId: 'seed-housekeeper-1',
      status: 'IN_SERVICE',
    })
  })

  it('rejects online pay for offline housekeeping appointments', async () => {
    const app = createApp()
    const mpLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const createResponse = await request(app)
      .post('/api/mp/housekeeping/orders')
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)
      .send({
        packageId: 'seed-package-1',
        contactPhone: '13800005678',
        serviceAddress: '3号楼 1802室',
        serviceDate: '2026-03-20',
        serviceTime: '09:00-11:00',
        amount: 100,
      })

    expect(createResponse.status).toBe(200)
    const payResponse = await request(app)
      .post(`/api/mp/housekeeping/orders/${createResponse.body.data.id}/pay`)
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)

    expect(payResponse.status).toBe(400)
    await expect(prisma.housekeepingOrder.findUnique({ where: { id: createResponse.body.data.id } })).resolves.toMatchObject({
      paymentStatus: 'OFFLINE',
    })
  })

  it('persists generated bills and payment orders in prisma', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })
    const building = await prisma.building.findFirstOrThrow({
      where: { code: '3' },
    })

    const generateResponse = await request(app)
      .post('/api/admin/bills/generate')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({ buildingId: building.id, month: '2026-04' })

    expect(generateResponse.status).toBe(200)
    expect(generateResponse.body.data.createdCount).toBeGreaterThan(0)

    const mpLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const payResponse = await request(app)
      .post('/api/mp/payments/submit')
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)
      .send({
        businessType: 'property_bill',
        billIds: ['bill-1', 'bill-2'],
        amount: 1,
      })

    expect(payResponse.status).toBe(200)
    await expect(prisma.paymentOrder.findUnique({ where: { orderNo: payResponse.body.data.orderNo } })).resolves.toMatchObject({
      paidAmount: 1500,
      status: 'SUCCESS',
    })
    await expect(prisma.propertyBill.findUnique({ where: { id: 'bill-1' } })).resolves.toMatchObject({
      status: 'PAID',
    })
  })

  it('generates monthly bills by building with house-based fee calculation', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const building = await prisma.building.findFirstOrThrow({
      where: { code: '3' },
    })
    const ownerType = await prisma.ownerType.findFirstOrThrow({
      where: { name: '普通住户' },
    })
    await prisma.house.create({
      data: {
        id: 'house-2',
        buildingId: building.id,
        roomNo: '1803',
        area: 100,
        ownerTypeId: ownerType.id,
        status: 'BOUND',
      },
    })
    const otherBuilding = await prisma.building.create({
      data: {
        name: '5号楼',
        code: '5',
        status: 'ACTIVE',
      },
    })
    await prisma.house.create({
      data: {
        id: 'house-3',
        buildingId: otherBuilding.id,
        roomNo: '1001',
        area: 120,
        ownerTypeId: ownerType.id,
        status: 'BOUND',
      },
    })

    const generateResponse = await request(app)
      .post('/api/admin/bills/generate')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({
        buildingId: building.id,
        month: '2026-04',
      })

    expect(generateResponse.status).toBe(200)
    expect(generateResponse.body.data.createdCount).toBe(2)

    const generated = await prisma.propertyBill.findMany({
      where: { month: '2026-04' },
      orderBy: { houseId: 'asc' },
    })
    expect(generated).toHaveLength(2)
    expect(generated.map((item) => ({ houseId: item.houseId, amount: item.amount }))).toEqual([
      { houseId: 'house-1', amount: 500 },
      { houseId: 'house-2', amount: 500 },
    ])
  })

  it('imports arrears by building with multiple house items', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const building = await prisma.building.findFirstOrThrow({
      where: { code: '3' },
    })
    const ownerType = await prisma.ownerType.findFirstOrThrow({
      where: { name: '普通住户' },
    })
    await prisma.house.create({
      data: {
        id: 'house-2',
        buildingId: building.id,
        roomNo: '1803',
        area: 100,
        ownerTypeId: ownerType.id,
        status: 'BOUND',
      },
    })

    const importResponse = await request(app)
      .post('/api/admin/bills/import-arrears')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({
        buildingId: building.id,
        month: '2025-12',
        items: [
          { houseId: 'house-1', title: '2025年12月历史欠费', amount: 200 },
          { houseId: 'house-2', title: '2025年12月历史欠费', amount: 300 },
        ],
      })

    expect(importResponse.status).toBe(200)
    expect(importResponse.body.data.createdCount).toBe(2)

    const imported = await prisma.propertyBill.findMany({
      where: { month: '2025-12' },
      orderBy: { houseId: 'asc' },
    })
    expect(imported.map((item) => ({ houseId: item.houseId, amount: item.amount }))).toEqual([
      { houseId: 'house-1', amount: 200 },
      { houseId: 'house-2', amount: 300 },
    ])
  })

  it('lists admin bills with building room and bound owner information', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const response = await request(app)
      .get('/api/admin/bills')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'bill-1',
          houseId: 'house-1',
          buildingName: '3号楼',
          roomNo: '1802',
          ownerName: '张三',
        }),
      ]),
    )
  })

  it('persists announcements and vote topics in prisma', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const announcementResponse = await request(app)
      .post('/api/admin/announcements')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({
        title: '停水通知',
        coverImage: 'https://example.com/cover.png',
        content: '<p>今晚停水维护</p>',
        status: 'PUBLISHED',
        sort: 1,
      })

    expect(announcementResponse.status).toBe(200)
    await expect(prisma.announcement.findUnique({ where: { id: announcementResponse.body.data.id } })).resolves.toMatchObject({
      title: '停水通知',
    })

    const voteResponse = await request(app)
      .post('/api/admin/vote-topics')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({
        announcementId: announcementResponse.body.data.id,
        title: '是否改造花园',
        description: '请选择方案',
        status: 'ONGOING',
        options: [
          { id: 'opt-a', title: '方案A', votes: 0 },
          { id: 'opt-b', title: '方案B', votes: 0 },
        ],
      })

    expect(voteResponse.status).toBe(200)
    const topic = await prisma.voteTopic.findUnique({ where: { id: voteResponse.body.data.id } })
    expect(topic?.title).toBe('是否改造花园')

    const mpLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const submitVote = await request(app)
      .post(`/api/mp/vote-topics/${voteResponse.body.data.id}/vote`)
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)
      .send({ optionId: 'opt-a' })

    expect(submitVote.status).toBe(200)
    const updatedTopic = await prisma.voteTopic.findUnique({ where: { id: voteResponse.body.data.id } })
    expect(updatedTopic?.optionsJson).toContain('"votes":1')
  })

  it('only exposes published announcements to mini-program endpoints', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const draftResponse = await request(app)
      .post('/api/admin/announcements')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({
        title: '草稿公告',
        coverImage: 'https://example.com/draft.png',
        content: '<p>草稿内容</p>',
        status: 'DRAFT',
        sort: 99,
      })

    const listResponse = await request(app).get('/api/mp/announcements')
    expect(listResponse.status).toBe(200)
    expect(listResponse.body.data.some((item: { id: string }) => item.id === draftResponse.body.data.id)).toBe(false)

    const detailResponse = await request(app).get(`/api/mp/announcements/${draftResponse.body.data.id}`)
    expect(detailResponse.status).toBe(404)
  })

  it('persists rentals in prisma and returns self-owned listings', async () => {
    const app = createApp()
    const mpLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const createResponse = await request(app)
      .post('/api/mp/rentals')
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)
      .send({
        title: '3号楼 1802 出租',
        coverImage: 'https://example.com/rental.png',
        address: '3号楼 1802室',
        rent: 3500,
        area: 89,
        layout: '2室1厅',
        phone: '13800005678',
      })

    expect(createResponse.status).toBe(200)
    await expect(prisma.rentalListing.findUnique({ where: { id: createResponse.body.data.id } })).resolves.toMatchObject({
      ownerId: 'mp-user-1',
      title: '3号楼 1802 出租',
    })

    const myListResponse = await request(app)
      .get('/api/mp/my/rentals')
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)

    expect(myListResponse.status).toBe(200)
    expect(myListResponse.body.data.some((item: { id: string }) => item.id === createResponse.body.data.id)).toBe(true)
  })

  it('only exposes published rental listings to public mini-program endpoints', async () => {
    const app = createApp()
    const mpLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const draftResponse = await request(app)
      .post('/api/mp/rentals')
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)
      .send({
        title: '草稿房源',
        coverImage: '',
        address: '3号楼 1802室',
        rent: 3200,
        area: 89,
        layout: '2室1厅',
        phone: '13800005678',
      })

    const listResponse = await request(app).get('/api/mp/rentals')
    expect(listResponse.status).toBe(200)
    expect(listResponse.body.data.some((item: { id: string }) => item.id === draftResponse.body.data.id)).toBe(false)

    const detailResponse = await request(app).get(`/api/mp/rentals/${draftResponse.body.data.id}`)
    expect(detailResponse.status).toBe(404)
  })

  it('persists feedback, lost-found, and customer service settings in prisma', async () => {
    const app = createApp()
    const mpLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const feedbackResponse = await request(app)
      .post('/api/mp/feedback')
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)
      .send({ content: '希望增加儿童游乐区' })

    expect(feedbackResponse.status).toBe(200)
    await expect(prisma.feedbackRecord.findUnique({ where: { id: feedbackResponse.body.data.id } })).resolves.toMatchObject({
      ownerId: 'mp-user-1',
      content: '希望增加儿童游乐区',
    })

    const lostResponse = await request(app)
      .post('/api/mp/lost-found')
      .set('Authorization', `Bearer ${mpLogin.body.data.token}`)
      .send({
        itemName: '门禁卡',
        lostAt: '2026-03-12 09:30',
        location: '北门',
        phone: '13800005678',
      })

    expect(lostResponse.status).toBe(200)
    await expect(prisma.lostFoundRecord.findUnique({ where: { id: lostResponse.body.data.id } })).resolves.toMatchObject({
      itemName: '门禁卡',
    })

    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const updateCsResponse = await request(app)
      .put('/api/admin/customer-service')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({
        phone: '400-900-1111',
        serviceHours: '08:30-20:00',
        description: '全天候客服',
      })

    expect(updateCsResponse.status).toBe(200)
    await expect(prisma.customerServiceSetting.findUnique({ where: { id: 'cs-1' } })).resolves.toMatchObject({
      phone: '400-900-1111',
    })
  })

  it('only returns current user lost-found records to mini-program users', async () => {
    const app = createApp()
    const firstLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })
    const secondLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'lost-owner-2' })

    await request(app)
      .post('/api/mp/lost-found')
      .set('Authorization', `Bearer ${firstLogin.body.data.token}`)
      .send({
        itemName: '门禁卡',
        lostAt: '2026-03-12 09:30',
        location: '北门',
        phone: '13800005678',
      })

    await request(app)
      .post('/api/mp/lost-found')
      .set('Authorization', `Bearer ${secondLogin.body.data.token}`)
      .send({
        itemName: '钥匙',
        lostAt: '2026-03-13 10:00',
        location: '南门',
        phone: '13800007777',
      })

    const firstList = await request(app)
      .get('/api/mp/lost-found')
      .set('Authorization', `Bearer ${firstLogin.body.data.token}`)

    expect(firstList.status).toBe(200)
    expect(firstList.body.data).toHaveLength(1)
    expect(firstList.body.data[0].itemName).toBe('门禁卡')
  })

  it('persists maintainers, housekeepers, and housekeeping packages in prisma-backed admin endpoints', async () => {
    const app = createApp()
    const adminLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    const maintainerResponse = await request(app)
      .post('/api/admin/maintainers')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({
        name: '王师傅',
        phone: '13811112222',
        type: '水电维修',
        status: 'ACTIVE',
      })

    expect(maintainerResponse.status).toBe(200)
    await expect(prisma.maintainer.findUnique({ where: { id: maintainerResponse.body.data.id } })).resolves.toMatchObject({
      name: '王师傅',
    })

    const housekeeperResponse = await request(app)
      .post('/api/admin/housekeepers')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({
        name: '赵阿姨',
        phone: '13822223333',
        specialty: '深度保洁',
        status: 'ACTIVE',
      })

    expect(housekeeperResponse.status).toBe(200)
    await expect(prisma.housekeeper.findUnique({ where: { id: housekeeperResponse.body.data.id } })).resolves.toMatchObject({
      name: '赵阿姨',
    })

    const packageResponse = await request(app)
      .post('/api/admin/housekeeping/packages')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .send({
        name: '全屋保洁',
        price: 300,
        durationHours: 6,
        description: '全屋深度清洁',
      })

    expect(packageResponse.status).toBe(200)
    await expect(prisma.housekeepingPackage.findUnique({ where: { id: packageResponse.body.data.id } })).resolves.toMatchObject({
      name: '全屋保洁',
    })
  })

  it('persists mini-program users in prisma and reuses the same user on repeated login', async () => {
    const app = createApp()

    const firstLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'persistent-user' })

    expect(firstLogin.status).toBe(200)
    await expect(prisma.wechatUser.findUnique({ where: { id: firstLogin.body.data.user.id } })).resolves.toMatchObject({
      nickname: '新业主用户',
    })

    const secondLogin = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'persistent-user' })

    expect(secondLogin.status).toBe(200)
    expect(secondLogin.body.data.user.id).toBe(firstLogin.body.data.user.id)
  })

  it('writes admin login operation logs into prisma', async () => {
    const app = createApp()

    const loginResponse = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    expect(loginResponse.status).toBe(200)
    const logs = await prisma.operationLog.findMany({
      where: { module: 'auth', operator: 'admin' },
      orderBy: { createdAt: 'desc' },
    })
    expect(logs.length).toBeGreaterThan(0)
  })

  it('reads mini-program notifications from prisma', async () => {
    const app = createApp()
    const loginResponse = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const response = await request(app)
      .get('/api/mp/notifications')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'notice-1',
          title: '报修工单已受理',
        }),
      ]),
    )
  })

  it('marks mini-program notifications as read', async () => {
    const app = createApp()
    const loginResponse = await request(app)
      .post('/api/mp/auth/login')
      .send({ code: 'demo-code' })

    const response = await request(app)
      .post('/api/mp/notifications/notice-1/read')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)

    expect(response.status).toBe(200)
    await expect(prisma.mpNotification.findUnique({ where: { id: 'notice-1' } })).resolves.toMatchObject({
      read: true,
    })
  })
})
