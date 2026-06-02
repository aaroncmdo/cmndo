import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../baileys-client', () => ({
  sendWhatsAppText: vi.fn(),
}))

import { sendWhatsApp } from '../../whatsapp'
import { sendWhatsAppText } from '../baileys-client'

const mockedSendWhatsAppText = vi.mocked(sendWhatsAppText)

describe('sendWhatsApp (Baileys leaf)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes 0151... → +4915123456789 and calls sendWhatsAppText', async () => {
    mockedSendWhatsAppText.mockResolvedValue({
      ok: true,
      messageId: 'm1',
      jid: 'j',
      timestamp: 't',
    })

    await sendWhatsApp('0151 23456789', 'hi')

    expect(mockedSendWhatsAppText).toHaveBeenCalledWith('+4915123456789', 'hi')
  })

  it('returns {success:true, sid} when Baileys responds ok', async () => {
    mockedSendWhatsAppText.mockResolvedValue({
      ok: true,
      messageId: 'm1',
      jid: 'j',
      timestamp: 't',
    })

    const result = await sendWhatsApp('0151 23456789', 'hi')

    expect(result).toEqual({ success: true, sid: 'm1' })
  })

  it('returns {success:false, error} when Baileys fails', async () => {
    mockedSendWhatsAppText.mockResolvedValue({
      ok: false,
      code: 'baileys_not_connected',
      error: 'x',
    })

    const result = await sendWhatsApp('0151 23456789', 'hi')

    expect(result).toEqual({ success: false, error: 'x' })
  })
})
