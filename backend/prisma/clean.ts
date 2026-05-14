/**
 * 清理业务历史数据（订单、账单、小程序用户、公告等），保留：
 * - 管理员、系统设置、客服设置、业主类型
 * - 楼栋/房屋、维修工/家政员、家政套餐
 *
 * 用法（必须显式确认，防止误删）：
 *   Windows PowerShell:  $env:CONFIRM_CLEAN='1'; npm run db:clean
 *   Windows CMD:        set CONFIRM_CLEAN=1&& npm run db:clean
 *   Linux/macOS:         CONFIRM_CLEAN=1 npm run db:clean
 *
 * 清理后如需演示数据：npm run db:seed
 */
import 'dotenv/config'

import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '@prisma/client'

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
  if (process.env.CONFIRM_CLEAN !== '1') {
    console.error('[db:clean] 未确认：请设置环境变量 CONFIRM_CLEAN=1 后再执行（防止误删生产数据）。')
    console.error('  PowerShell: $env:CONFIRM_CLEAN="1"; npm run db:clean')
    console.error('  清理后恢复演示数据: npm run db:seed')
    process.exit(1)
  }

  console.log('[db:clean] 开始清理业务历史数据…')

  const results = await prisma.$transaction([
    prisma.paymentOrder.deleteMany(),
    prisma.mpNotification.deleteMany(),
    prisma.operationLog.deleteMany(),
    prisma.lostFoundRecord.deleteMany(),
    prisma.feedbackRecord.deleteMany(),
    prisma.rentalListing.deleteMany(),
    prisma.housekeepingOrder.deleteMany(),
    prisma.repairOrder.deleteMany(),
    prisma.propertyBill.deleteMany(),
    prisma.voteTopic.deleteMany(),
    prisma.bindingApplication.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.wechatUser.deleteMany(),
  ])

  const total = results.reduce((sum, r) => sum + r.count, 0)
  console.log(`[db:clean] 完成，共删除 ${total} 条记录（多表合计）。`)
  console.log('[db:clean] 建议执行: npm run db:seed  （恢复演示账号与示例账单/工单等）')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
