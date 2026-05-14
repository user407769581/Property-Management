import crypto from 'node:crypto'

import { env } from '../config/env.js'

interface UploadOptions {
  directory: string
  filename: string
  mimeType: string
}

export const createOssUploadPolicy = ({ directory, filename, mimeType }: UploadOptions) => {
  const safeDirectory = directory.replace(/[^a-zA-Z0-9/_-]/g, '') || 'uploads'
  const suffix = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : ''
  const key = `${safeDirectory}/${Date.now()}-${crypto.randomUUID()}${suffix}`
  const expiration = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const policyText = JSON.stringify({
    expiration,
    conditions: [
      ['content-length-range', 0, 10 * 1024 * 1024],
      ['starts-with', '$key', `${safeDirectory}/`],
      ['eq', '$content-type', mimeType],
    ],
  })
  const policy = Buffer.from(policyText).toString('base64')
  const signature = crypto.createHmac('sha1', env.ossAccessKeySecret || 'mock-secret').update(policy).digest('base64')

  return {
    host: env.ossBucketDomain || `https://${env.ossBucket}.${env.ossEndpoint}`,
    key,
    policy,
    signature,
    accessId: env.ossAccessKeyId || 'mock-access-key',
    expire: Math.floor(Date.now() / 1000) + 3600,
    mimeType,
  }
}
