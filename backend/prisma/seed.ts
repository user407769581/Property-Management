import 'dotenv/config'

import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const databaseUrl = new URL(process.env.DATABASE_URL || 'mysql://zhanghao:root@127.0.0.1:3306/property_service')
const adapter = new PrismaMariaDb({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || '3306'),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: databaseUrl.pathname.replace(/^\//, ''),
})

const prisma = new PrismaClient({ adapter })

const main = async () => {
  const passwordHash = await bcrypt.hash('admin123', 10)

  await prisma.adminUser.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash,
      role: 'super_admin',
      name: '系统管理员',
      status: 'ACTIVE',
    },
    create: {
      username: 'admin',
      passwordHash,
      role: 'super_admin',
      name: '系统管理员',
      status: 'ACTIVE',
    },
  })

  await prisma.systemSetting.upsert({
    where: { key: 'communityName' },
    update: { value: '龙江太古城', label: '小区名称' },
    create: { key: 'communityName', label: '小区名称', value: '龙江太古城' },
  })

  await prisma.systemSetting.upsert({
    where: { key: 'propertyFeeBaseAmount' },
    update: { value: '500', label: '基础物业费金额' },
    create: { key: 'propertyFeeBaseAmount', label: '基础物业费金额', value: '500' },
  })

  await prisma.customerServiceSetting.upsert({
    where: { id: 'cs-1' },
    update: {
      phone: '400-800-1234',
      serviceHours: '09:00-18:00',
      description: '物业客服中心',
    },
    create: {
      id: 'cs-1',
      phone: '400-800-1234',
      serviceHours: '09:00-18:00',
      description: '物业客服中心',
    },
  })

  const ownerType = await prisma.ownerType.upsert({
    where: { id: 'seed-owner-type-normal' },
    update: {
      name: '普通住户',
      feeRate: 1,
      baseFee: 500,
      description: '按标准物业费收取',
    },
    create: {
      id: 'seed-owner-type-normal',
      name: '普通住户',
      feeRate: 1,
      baseFee: 500,
      description: '按标准物业费收取',
    },
  })

  const building = await prisma.building.upsert({
    where: { code: '3' },
    update: {
      name: '3号楼',
      status: 'ACTIVE',
    },
    create: {
      code: '3',
      name: '3号楼',
      status: 'ACTIVE',
    },
  })

  await prisma.house.upsert({
    where: { id: 'house-1' },
    update: {
      buildingId: building.id,
      roomNo: '1802',
      area: 89,
      ownerTypeId: ownerType.id,
      status: 'BOUND',
    },
    create: {
      id: 'house-1',
      buildingId: building.id,
      roomNo: '1802',
      area: 89,
      ownerTypeId: ownerType.id,
      status: 'BOUND',
    },
  })

  await prisma.wechatUser.upsert({
    where: { openid: 'demo-openid' },
    update: {
      nickname: '张三',
      phone: '13800001234',
      boundHouseId: 'house-1',
    },
    create: {
      id: 'mp-user-1',
      openid: 'demo-openid',
      nickname: '张三',
      phone: '13800001234',
      boundHouseId: 'house-1',
    },
  })

  await prisma.maintainer.upsert({
    where: { id: 'seed-maintainer-1' },
    update: {
      name: '张师傅',
      phone: '13800001111',
      type: '综合维修',
      status: 'ACTIVE',
    },
    create: {
      id: 'seed-maintainer-1',
      name: '张师傅',
      phone: '13800001111',
      type: '综合维修',
      status: 'ACTIVE',
    },
  })

  await prisma.housekeeper.upsert({
    where: { id: 'seed-housekeeper-1' },
    update: {
      name: '李阿姨',
      phone: '13800002222',
      specialty: '全屋保洁',
      status: 'ACTIVE',
    },
    create: {
      id: 'seed-housekeeper-1',
      name: '李阿姨',
      phone: '13800002222',
      specialty: '全屋保洁',
      status: 'ACTIVE',
    },
  })

  await prisma.housekeepingPackage.upsert({
    where: { id: 'seed-package-1' },
    update: {
      name: '基础打扫',
      price: 100,
      durationHours: 2,
      description: '日常清洁、扫地拖地、整理收纳',
    },
    create: {
      id: 'seed-package-1',
      name: '基础打扫',
      price: 100,
      durationHours: 2,
      description: '日常清洁、扫地拖地、整理收纳',
    },
  })

  await prisma.mpNotification.upsert({
    where: { id: 'notice-1' },
    update: {
      userId: 'mp-user-1',
      title: '报修工单已受理',
      content: '您的报修工单已分配维修人员。',
      read: false,
    },
    create: {
      id: 'notice-1',
      userId: 'mp-user-1',
      title: '报修工单已受理',
      content: '您的报修工单已分配维修人员。',
      read: false,
    },
  })

  await prisma.operationLog.upsert({
    where: { id: 'seed-log-1' },
    update: {
      module: 'auth',
      action: 'LOGIN',
      operator: 'system',
      detail: '默认超级管理员初始化',
    },
    create: {
      id: 'seed-log-1',
      module: 'auth',
      action: 'LOGIN',
      operator: 'system',
      detail: '默认超级管理员初始化',
    },
  })

  const announcement = await prisma.announcement.upsert({
    where: { id: 'seed-announcement-1' },
    update: {
      title: '关于小区花园景观升级改造的通知',
      coverImage: 'https://placehold.co/600x300',
      content: '中央花园将进行升级改造，请各位业主提前知悉。',
      status: 'PUBLISHED',
      sort: 1,
    },
    create: {
      id: 'seed-announcement-1',
      title: '关于小区花园景观升级改造的通知',
      coverImage: 'https://placehold.co/600x300',
      content: '中央花园将进行升级改造，请各位业主提前知悉。',
      status: 'PUBLISHED',
      sort: 1,
    },
  })

  await prisma.voteTopic.upsert({
    where: { id: 'seed-vote-1' },
    update: {
      announcementId: announcement.id,
      title: '景观改造方案征集',
      description: '请选择您认可的升级方案。',
      optionsJson: JSON.stringify([
        { id: 'vote-opt-1', title: '方案A', votes: 64 },
        { id: 'vote-opt-2', title: '方案B', votes: 60 },
      ]),
      status: 'ONGOING',
    },
    create: {
      id: 'seed-vote-1',
      announcementId: announcement.id,
      title: '景观改造方案征集',
      description: '请选择您认可的升级方案。',
      optionsJson: JSON.stringify([
        { id: 'vote-opt-1', title: '方案A', votes: 64 },
        { id: 'vote-opt-2', title: '方案B', votes: 60 },
      ]),
      status: 'ONGOING',
    },
  })

  const building2 = await prisma.building.upsert({
    where: { code: '5' },
    update: {
      name: '5号楼',
      status: 'ACTIVE',
    },
    create: {
      code: '5',
      name: '5号楼',
      status: 'ACTIVE',
    },
  })

  await prisma.house.upsert({
    where: { id: 'house-2' },
    update: {
      buildingId: building2.id,
      roomNo: '1001',
      area: 102,
      ownerTypeId: ownerType.id,
      status: 'IDLE',
    },
    create: {
      id: 'house-2',
      buildingId: building2.id,
      roomNo: '1001',
      area: 102,
      ownerTypeId: ownerType.id,
      status: 'IDLE',
    },
  })

  await prisma.wechatUser.upsert({
    where: { openid: 'demo-openid-unbound' },
    update: {
      nickname: '李四',
      phone: '13800004321',
      boundHouseId: '',
    },
    create: {
      id: 'mp-user-2',
      openid: 'demo-openid-unbound',
      nickname: '李四',
      phone: '13800004321',
      boundHouseId: '',
    },
  })

  await prisma.bindingApplication.upsert({
    where: { id: 'seed-binding-approved-1' },
    update: {
      buildingId: building.id,
      roomNo: '1802',
      applicantName: '张三',
      applicantUserId: 'mp-user-1',
      phone: '13800001234',
      status: 'APPROVED',
    },
    create: {
      id: 'seed-binding-approved-1',
      buildingId: building.id,
      roomNo: '1802',
      applicantName: '张三',
      applicantUserId: 'mp-user-1',
      phone: '13800001234',
      status: 'APPROVED',
    },
  })

  await prisma.bindingApplication.upsert({
    where: { id: 'seed-binding-pending-2' },
    update: {
      buildingId: building2.id,
      roomNo: '1001',
      applicantName: '李四',
      applicantUserId: 'mp-user-2',
      phone: '13800004321',
      status: 'PENDING',
    },
    create: {
      id: 'seed-binding-pending-2',
      buildingId: building2.id,
      roomNo: '1001',
      applicantName: '李四',
      applicantUserId: 'mp-user-2',
      phone: '13800004321',
      status: 'PENDING',
    },
  })

  await prisma.propertyBill.upsert({
    where: { id: 'seed-bill-2026-01' },
    update: {
      month: '2026-01',
      title: '物业管理费',
      amount: 320,
      status: 'PENDING',
      houseId: 'house-1',
    },
    create: {
      id: 'seed-bill-2026-01',
      month: '2026-01',
      title: '物业管理费',
      amount: 320,
      status: 'PENDING',
      houseId: 'house-1',
    },
  })

  await prisma.propertyBill.upsert({
    where: { id: 'seed-bill-2026-02' },
    update: {
      month: '2026-02',
      title: '水电公摊费',
      amount: 120.5,
      status: 'PENDING',
      houseId: 'house-1',
    },
    create: {
      id: 'seed-bill-2026-02',
      month: '2026-02',
      title: '水电公摊费',
      amount: 120.5,
      status: 'PENDING',
      houseId: 'house-1',
    },
  })

  await prisma.propertyBill.upsert({
    where: { id: 'seed-bill-2025-12' },
    update: {
      month: '2025-12',
      title: '物业管理费',
      amount: 315,
      status: 'PAID',
      houseId: 'house-1',
    },
    create: {
      id: 'seed-bill-2025-12',
      month: '2025-12',
      title: '物业管理费',
      amount: 315,
      status: 'PAID',
      houseId: 'house-1',
    },
  })

  await prisma.repairOrder.upsert({
    where: { id: 'seed-repair-1' },
    update: {
      orderNo: 'R-SEED-001',
      ownerId: 'mp-user-1',
      address: '3号楼 1802',
      description: '厨房水龙头漏水',
      imagesJson: JSON.stringify([]),
      phone: '13800001234',
      status: 'PENDING',
      maintainerId: null,
      completeNote: '',
    },
    create: {
      id: 'seed-repair-1',
      orderNo: 'R-SEED-001',
      ownerId: 'mp-user-1',
      address: '3号楼 1802',
      description: '厨房水龙头漏水',
      imagesJson: JSON.stringify([]),
      phone: '13800001234',
      status: 'PENDING',
      maintainerId: null,
      completeNote: '',
    },
  })

  await prisma.repairOrder.upsert({
    where: { id: 'seed-repair-2' },
    update: {
      orderNo: 'R-SEED-002',
      ownerId: 'mp-user-1',
      address: '3号楼 1802',
      description: '卫生间地漏堵塞',
      imagesJson: JSON.stringify([]),
      phone: '13800001234',
      status: 'PROCESSING',
      maintainerId: 'seed-maintainer-1',
      completeNote: '',
    },
    create: {
      id: 'seed-repair-2',
      orderNo: 'R-SEED-002',
      ownerId: 'mp-user-1',
      address: '3号楼 1802',
      description: '卫生间地漏堵塞',
      imagesJson: JSON.stringify([]),
      phone: '13800001234',
      status: 'PROCESSING',
      maintainerId: 'seed-maintainer-1',
      completeNote: '',
    },
  })

  await prisma.repairOrder.upsert({
    where: { id: 'seed-repair-3' },
    update: {
      orderNo: 'R-SEED-003',
      ownerId: 'mp-user-1',
      address: '3号楼 1802',
      description: '卧室灯泡更换',
      imagesJson: JSON.stringify([]),
      phone: '13800001234',
      status: 'COMPLETED',
      maintainerId: 'seed-maintainer-1',
      completeNote: '已更换灯泡',
    },
    create: {
      id: 'seed-repair-3',
      orderNo: 'R-SEED-003',
      ownerId: 'mp-user-1',
      address: '3号楼 1802',
      description: '卧室灯泡更换',
      imagesJson: JSON.stringify([]),
      phone: '13800001234',
      status: 'COMPLETED',
      maintainerId: 'seed-maintainer-1',
      completeNote: '已更换灯泡',
    },
  })

  await prisma.housekeepingOrder.upsert({
    where: { id: 'seed-housekeeping-1' },
    update: {
      orderNo: 'H-SEED-001',
      ownerId: 'mp-user-1',
      packageId: 'seed-package-1',
      contactPhone: '13800001234',
      serviceAddress: '3号楼 1802',
      serviceDate: '2026-03-20',
      serviceTime: '09:00-11:00',
      amount: 100,
      paymentStatus: 'PAID',
      status: 'WAIT_ASSIGN',
      housekeeperId: null,
      completeNote: '',
    },
    create: {
      id: 'seed-housekeeping-1',
      orderNo: 'H-SEED-001',
      ownerId: 'mp-user-1',
      packageId: 'seed-package-1',
      contactPhone: '13800001234',
      serviceAddress: '3号楼 1802',
      serviceDate: '2026-03-20',
      serviceTime: '09:00-11:00',
      amount: 100,
      paymentStatus: 'PAID',
      status: 'WAIT_ASSIGN',
      housekeeperId: null,
      completeNote: '',
    },
  })

  await prisma.housekeepingOrder.upsert({
    where: { id: 'seed-housekeeping-2' },
    update: {
      orderNo: 'H-SEED-002',
      ownerId: 'mp-user-1',
      packageId: 'seed-package-1',
      contactPhone: '13800001234',
      serviceAddress: '3号楼 1802',
      serviceDate: '2026-03-21',
      serviceTime: '09:00-11:00',
      amount: 100,
      paymentStatus: 'PAID',
      status: 'IN_SERVICE',
      housekeeperId: 'seed-housekeeper-1',
      completeNote: '',
    },
    create: {
      id: 'seed-housekeeping-2',
      orderNo: 'H-SEED-002',
      ownerId: 'mp-user-1',
      packageId: 'seed-package-1',
      contactPhone: '13800001234',
      serviceAddress: '3号楼 1802',
      serviceDate: '2026-03-21',
      serviceTime: '09:00-11:00',
      amount: 100,
      paymentStatus: 'PAID',
      status: 'IN_SERVICE',
      housekeeperId: 'seed-housekeeper-1',
      completeNote: '',
    },
  })

  await prisma.housekeepingOrder.upsert({
    where: { id: 'seed-housekeeping-3' },
    update: {
      orderNo: 'H-SEED-003',
      ownerId: 'mp-user-1',
      packageId: 'seed-package-1',
      contactPhone: '13800001234',
      serviceAddress: '3号楼 1802',
      serviceDate: '2026-03-18',
      serviceTime: '14:00-16:00',
      amount: 100,
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      housekeeperId: 'seed-housekeeper-1',
      completeNote: '服务完成，用户满意',
    },
    create: {
      id: 'seed-housekeeping-3',
      orderNo: 'H-SEED-003',
      ownerId: 'mp-user-1',
      packageId: 'seed-package-1',
      contactPhone: '13800001234',
      serviceAddress: '3号楼 1802',
      serviceDate: '2026-03-18',
      serviceTime: '14:00-16:00',
      amount: 100,
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      housekeeperId: 'seed-housekeeper-1',
      completeNote: '服务完成，用户满意',
    },
  })

  await prisma.paymentOrder.upsert({
    where: { orderNo: 'PAY-SEED-001' },
    update: {
      businessType: 'property_bill',
      paidAmount: 315,
      channel: 'WECHAT',
      status: 'SUCCESS',
      transactionNo: 'WX-SEED-001',
      paidAt: new Date('2026-03-01T10:00:00.000Z'),
    },
    create: {
      orderNo: 'PAY-SEED-001',
      businessType: 'property_bill',
      paidAmount: 315,
      channel: 'WECHAT',
      status: 'SUCCESS',
      transactionNo: 'WX-SEED-001',
      paidAt: new Date('2026-03-01T10:00:00.000Z'),
    },
  })

  await prisma.rentalListing.upsert({
    where: { id: 'seed-rental-1' },
    update: {
      ownerId: 'mp-user-1',
      title: '精装两室一厅 近地铁',
      coverImage: 'https://placehold.co/600x360',
      address: '3号楼 1802',
      rent: 3200,
      area: 89,
      layout: '两室一厅',
      phone: '13800001234',
      status: 'PUBLISHED',
    },
    create: {
      id: 'seed-rental-1',
      ownerId: 'mp-user-1',
      title: '精装两室一厅 近地铁',
      coverImage: 'https://placehold.co/600x360',
      address: '3号楼 1802',
      rent: 3200,
      area: 89,
      layout: '两室一厅',
      phone: '13800001234',
      status: 'PUBLISHED',
    },
  })

  await prisma.rentalListing.upsert({
    where: { id: 'seed-rental-2' },
    update: {
      ownerId: 'mp-user-1',
      title: '南北通透三室两厅',
      coverImage: 'https://placehold.co/600x360',
      address: '3号楼 1802',
      rent: 4200,
      area: 126,
      layout: '三室两厅',
      phone: '13800001234',
      status: 'DRAFT',
    },
    create: {
      id: 'seed-rental-2',
      ownerId: 'mp-user-1',
      title: '南北通透三室两厅',
      coverImage: 'https://placehold.co/600x360',
      address: '3号楼 1802',
      rent: 4200,
      area: 126,
      layout: '三室两厅',
      phone: '13800001234',
      status: 'DRAFT',
    },
  })

  await prisma.feedbackRecord.upsert({
    where: { id: 'seed-feedback-1' },
    update: {
      ownerId: 'mp-user-1',
      content: '希望增加地下车库充电桩数量。',
      status: 'PENDING',
      reply: '',
    },
    create: {
      id: 'seed-feedback-1',
      ownerId: 'mp-user-1',
      content: '希望增加地下车库充电桩数量。',
      status: 'PENDING',
      reply: '',
    },
  })

  await prisma.lostFoundRecord.upsert({
    where: { id: 'seed-lost-1' },
    update: {
      ownerId: 'mp-user-1',
      itemName: '门禁卡',
      lostAt: '2026-03-10',
      location: '3号楼大厅',
      phone: '13800001234',
      status: 'PENDING',
    },
    create: {
      id: 'seed-lost-1',
      ownerId: 'mp-user-1',
      itemName: '门禁卡',
      lostAt: '2026-03-10',
      location: '3号楼大厅',
      phone: '13800001234',
      status: 'PENDING',
    },
  })

  await prisma.mpNotification.upsert({
    where: { id: 'notice-2' },
    update: {
      userId: null,
      title: '停水通知',
      content: '本周三 09:00-12:00 小区临时停水，请提前储水。',
      read: false,
    },
    create: {
      id: 'notice-2',
      userId: null,
      title: '停水通知',
      content: '本周三 09:00-12:00 小区临时停水，请提前储水。',
      read: false,
    },
  })

  await prisma.bindingApplication.deleteMany({
    where: {
      applicantUserId: 'mp-user-1',
      buildingId: '',
      roomNo: '',
      applicantName: '',
      phone: '',
    },
  })
  await prisma.repairOrder.deleteMany({
    where: {
      ownerId: 'mp-user-1',
      address: '',
      description: '',
      phone: '',
      imagesJson: '[]',
    },
  })
  await prisma.lostFoundRecord.deleteMany({
    where: {
      ownerId: 'mp-user-1',
      itemName: '',
      lostAt: '',
      location: '',
      phone: '',
    },
  })
  await prisma.feedbackRecord.deleteMany({
    where: {
      ownerId: 'mp-user-1',
      content: '',
    },
  })

  console.log('seed complete')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
