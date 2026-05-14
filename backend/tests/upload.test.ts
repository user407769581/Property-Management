import { describe, expect, it } from 'vitest'

import { createOssUploadPolicy } from '../src/services/upload.service.js'

describe('upload service', () => {
  it('creates a direct-upload payload with required fields', () => {
    const policy = createOssUploadPolicy({
      directory: 'announcements',
      filename: 'cover.png',
      mimeType: 'image/png',
    })

    expect(policy.host).toContain('aliyuncs.com')
    expect(policy.key).toContain('announcements/')
    expect(policy.accessId).toBeTruthy()
    expect(policy.policy).toBeTruthy()
    expect(policy.signature).toBeTruthy()
  })
})
