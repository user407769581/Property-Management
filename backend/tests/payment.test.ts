import { describe, expect, it } from 'vitest'

import { createMockPaymentResult } from '../src/services/payment.service.js'

describe('payment service', () => {
  it('creates a successful mock payment result', () => {
    const result = createMockPaymentResult({
      amount: 300,
      businessType: 'housekeeping',
      orderNo: 'PAY-001',
    })

    expect(result.status).toBe('SUCCESS')
    expect(result.paidAmount).toBe(300)
    expect(result.channel).toBe('mock_wechat_pay')
  })
})
