import { config } from 'dotenv'
import { defineConfig } from 'vitest/config'

/**
 * 测试会清空数据库中的业务表（见 tests/app.test.ts 的 beforeEach）。
 * 若与开发共用同一个 DATABASE_URL，每次跑 npm test 都会删掉你在后台/小程序里产生的真实数据。
 *
 * 因此在加载任何用 Prisma 的模块之前，把连接改到独立库：<原库名>_test（也可用环境变量 TEST_DATABASE_URL 完全指定）。
 * 首次请在本机 MySQL 创建空库（库名 = 你的开发库名 + _test），然后执行：
 *   CREATE DATABASE property_service_test;
 *   npm run db:push:test
 */
config()

function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL?.trim()
  if (explicit) {
    return explicit
  }

  const dev = process.env.DATABASE_URL?.trim()
  if (dev) {
    try {
      const url = new URL(dev)
      const rawName = url.pathname.replace(/^\//, '')
      const baseName = rawName || 'property_service'
      const testName = baseName.endsWith('_test') ? baseName : `${baseName}_test`
      url.pathname = `/${testName}`
      return url.toString()
    } catch {
      /* 非法 URL 则走下方默认 */
    }
  }

  return 'mysql://user:password@127.0.0.1:3306/property_service_test'
}

process.env.DATABASE_URL = resolveTestDatabaseUrl()

export default defineConfig({
  test: {
    exclude: ['dist/**', 'node_modules/**'],
    /** 避免多个测试文件并行连同一测试库时互相踩数据 */
    fileParallelism: false,
  },
})
