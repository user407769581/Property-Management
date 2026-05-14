import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { env } from '../config/env.js'

export interface MockPaymentInput {
  orderNo: string
  amount: number
  businessType: string
}

export interface WechatJsapiPaymentInput {
  openid: string
  orderNo: string
  amount: number
  description: string
  attach?: string
}

export interface WechatPayNotifyHeaders {
  timestamp: string
  nonce: string
  signature: string
  serial: string
}

export interface WechatPayNotifyResource {
  algorithm: string
  ciphertext: string
  nonce: string
  associated_data?: string
}

export interface WechatPayNotifyPayload {
  id?: string
  event_type?: string
  resource?: WechatPayNotifyResource
  summary?: string
}

export interface WechatPayTransaction {
  appid?: string
  mchid?: string
  out_trade_no: string
  transaction_id?: string
  trade_state?: string
  attach?: string
  success_time?: string
  amount?: {
    total?: number
    payer_total?: number
  }
  payer?: {
    openid?: string
  }
}

export class PaymentConfigurationError extends Error {
  constructor(message = '微信支付暂未开通') {
    super(message)
    this.name = 'PaymentConfigurationError'
  }
}

const normalizeAmount = (amount: number) => Number(amount.toFixed(2))

const amountToCents = (amount: number) => Math.round(normalizeAmount(amount) * 100)

const createNonce = () => crypto.randomBytes(16).toString('hex')

const readPemFile = (filePath: string) => fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8')

const rsaSha256Sign = (message: string, privateKey: string) =>
  crypto.createSign('RSA-SHA256').update(message).end().sign(privateKey, 'base64')

export const createPaymentOrderNo = (prefix = 'PAY') => `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`

export const isWechatPayConfigured = () =>
  env.wechatPayEnabled &&
  !env.wechatPayMockMode &&
  Boolean(
    env.wechatPayAppId &&
      env.wechatPayMchId &&
      env.wechatPayApiV3Key &&
      env.wechatPayMchSerialNo &&
      env.wechatPayPrivateKeyPath &&
      env.wechatPayNotifyUrl,
  )

const assertWechatPayConfigured = () => {
  if (!isWechatPayConfigured()) {
    throw new PaymentConfigurationError()
  }
  if (Buffer.byteLength(env.wechatPayApiV3Key) !== 32) {
    throw new PaymentConfigurationError('微信支付 API v3 密钥必须是 32 字节')
  }
}

export const createMockPaymentResult = ({ orderNo, amount, businessType }: MockPaymentInput) => ({
  orderNo,
  businessType,
  paidAmount: normalizeAmount(amount),
  channel: 'mock_wechat_pay',
  status: 'SUCCESS',
  tradeState: 'SUCCESS',
  transactionNo: `MOCK-${Date.now()}`,
  paidAt: new Date().toISOString(),
  paymentMode: 'mock',
})

export const createWechatJsapiPayment = async ({
  openid,
  orderNo,
  amount,
  description,
  attach,
}: WechatJsapiPaymentInput) => {
  assertWechatPayConfigured()

  const privateKey = readPemFile(env.wechatPayPrivateKeyPath)
  const body = JSON.stringify({
    appid: env.wechatPayAppId,
    mchid: env.wechatPayMchId,
    description: description.slice(0, 127),
    out_trade_no: orderNo,
    notify_url: env.wechatPayNotifyUrl,
    amount: {
      total: amountToCents(amount),
      currency: 'CNY',
    },
    payer: {
      openid,
    },
    ...(attach ? { attach } : {}),
  })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = createNonce()
  const requestPath = '/v3/pay/transactions/jsapi'
  const message = `POST\n${requestPath}\n${timestamp}\n${nonce}\n${body}\n`
  const signature = rsaSha256Sign(message, privateKey)
  const authorization =
    `WECHATPAY2-SHA256-RSA2048 mchid="${env.wechatPayMchId}",` +
    `nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${env.wechatPayMchSerialNo}"`

  const result = await fetch(`https://api.mch.weixin.qq.com${requestPath}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body,
  })
  const payload = (await result.json().catch(() => ({}))) as { prepay_id?: string; message?: string }
  if (!result.ok || !payload.prepay_id) {
    throw new Error(payload.message || '微信支付下单失败')
  }

  const payNonce = createNonce()
  const payTimestamp = String(Math.floor(Date.now() / 1000))
  const payPackage = `prepay_id=${payload.prepay_id}`
  const paySign = rsaSha256Sign(`${env.wechatPayAppId}\n${payTimestamp}\n${payNonce}\n${payPackage}\n`, privateKey)

  return {
    orderNo,
    businessType: attach || 'property_bill',
    paidAmount: normalizeAmount(amount),
    channel: 'wechat_pay',
    status: 'PENDING',
    tradeState: 'NOTPAY',
    prepayId: payload.prepay_id,
    paymentMode: 'wechat_pay',
    requestPayment: {
      timeStamp: payTimestamp,
      nonceStr: payNonce,
      package: payPackage,
      signType: 'RSA',
      paySign,
    },
  }
}

export const verifyWechatPayNotifySignature = ({
  headers,
  body,
}: {
  headers: WechatPayNotifyHeaders
  body: string
}) => {
  if (!env.wechatPayPlatformCertPath) {
    throw new PaymentConfigurationError('缺少微信支付平台证书')
  }
  const publicCert = readPemFile(env.wechatPayPlatformCertPath)
  const message = `${headers.timestamp}\n${headers.nonce}\n${body}\n`
  return crypto.createVerify('RSA-SHA256').update(message).end().verify(publicCert, headers.signature, 'base64')
}

export const decryptWechatPayNotifyResource = (resource: WechatPayNotifyResource): WechatPayTransaction => {
  if (Buffer.byteLength(env.wechatPayApiV3Key) !== 32) {
    throw new PaymentConfigurationError('微信支付 API v3 密钥必须是 32 字节')
  }
  const encrypted = Buffer.from(resource.ciphertext, 'base64')
  const authTag = encrypted.subarray(encrypted.length - 16)
  const ciphertext = encrypted.subarray(0, encrypted.length - 16)
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(env.wechatPayApiV3Key),
    Buffer.from(resource.nonce),
  )
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data))
  }
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  return JSON.parse(decrypted) as WechatPayTransaction
}
