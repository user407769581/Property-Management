import { describe, expect, it } from 'vitest'

import { createAccessToken, hashPassword, verifyPassword } from '../src/services/auth.service.js'

describe('auth service', () => {
  it('hashes password and verifies the same value', async () => {
    const hash = await hashPassword('admin123')

    expect(hash).not.toBe('admin123')
    await expect(verifyPassword('admin123', hash)).resolves.toBe(true)
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false)
  })

  it('creates a jwt token with role and subject', () => {
    const token = createAccessToken({
      subject: 'admin-1',
      role: 'super_admin',
      scope: 'admin',
    })

    expect(token.split('.')).toHaveLength(3)
  })
})
