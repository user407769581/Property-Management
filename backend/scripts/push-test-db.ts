/**
 * 根据 .env 中的 DATABASE_URL 推导 <库名>_test，并对该库执行 prisma db push。
 * 供 Vitest 使用独立测试库前，一次性初始化表结构。
 */
import 'dotenv/config'
import { execSync } from 'node:child_process'

const dev = process.env.DATABASE_URL?.trim()
if (!dev) {
  console.error('缺少 DATABASE_URL，请在 backend/.env 中配置')
  process.exit(1)
}

const url = new URL(dev)
const rawName = url.pathname.replace(/^\//, '')
const baseName = rawName || 'property_service'
const testName = baseName.endsWith('_test') ? baseName : `${baseName}_test`
url.pathname = `/${testName}`

process.env.DATABASE_URL = url.toString()
console.log(`[push-test-db] 目标库: ${testName}`)
execSync('npx prisma db push', { stdio: 'inherit', env: process.env })
