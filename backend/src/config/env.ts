import 'dotenv/config'

const read = (key: string, fallback = '') => process.env[key]?.trim() || fallback

export const env = {
  nodeEnv: read('NODE_ENV', 'development'),
  port: Number(read('PORT', '3000')),
  jwtSecret: read('JWT_SECRET', 'property-service-secret'),
  adminApiBaseUrl: read('ADMIN_API_BASE_URL', 'https://6sr8wc135175.vicp.fun'),
  databaseUrl: read('DATABASE_URL', 'mysql://user:password@127.0.0.1:3306/property_service'),
  wechatAppId: read('WECHAT_APP_ID', 'demo-wechat-app-id'),
  wechatAppSecret: read('WECHAT_APP_SECRET', 'demo-wechat-app-secret'),
  ossAccessKeyId: read('OSS_ACCESS_KEY_ID', 'demo-oss-access-key'),
  ossAccessKeySecret: read('OSS_ACCESS_KEY_SECRET', 'demo-oss-access-secret'),
  ossBucket: read('OSS_BUCKET', 'demo-bucket'),
  ossRegion: read('OSS_REGION', 'oss-cn-beijing'),
  ossEndpoint: read('OSS_ENDPOINT', 'oss-accelerate.aliyuncs.com'),
  ossBucketDomain: read('OSS_BUCKET_DOMAIN', 'https://demo-bucket.oss-accelerate.aliyuncs.com'),
  wechatPayEnabled: read('WECHAT_PAY_ENABLED', 'false') === 'true',
  wechatPayMockMode: read('WECHAT_PAY_MOCK_MODE', 'true') !== 'false',
  wechatPayAppId: read('WECHAT_PAY_APP_ID', read('WECHAT_APP_ID', 'demo-wechat-app-id')),
  wechatPayMchId: read('WECHAT_PAY_MCH_ID'),
  wechatPayApiV3Key: read('WECHAT_PAY_API_V3_KEY'),
  wechatPayMchSerialNo: read('WECHAT_PAY_MCH_SERIAL_NO'),
  wechatPayPrivateKeyPath: read('WECHAT_PAY_PRIVATE_KEY_PATH'),
  wechatPayPlatformCertPath: read('WECHAT_PAY_PLATFORM_CERT_PATH'),
  wechatPayNotifyUrl: read('WECHAT_PAY_NOTIFY_URL'),
}

/** 是否走真实 jscode2session（每次读取 process.env，便于测试覆盖 .env） */
export const isWechatMiniProgramConfigured = () => {
  const id = read('WECHAT_APP_ID', 'demo-wechat-app-id')
  const secret = read('WECHAT_APP_SECRET', 'demo-wechat-app-secret')
  return (
    Boolean(id) &&
    Boolean(secret) &&
    id !== 'demo-wechat-app-id' &&
    secret !== 'demo-wechat-app-secret'
  )
}
