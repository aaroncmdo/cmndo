import { describe, it, expect } from 'vitest'
import { urlBase64ToUint8Array, serializeSubscription } from './push-encoding'

describe('urlBase64ToUint8Array', () => {
  it('dekodiert Standard-base64url (AQAB -> [1,0,1])', () => {
    expect(Array.from(urlBase64ToUint8Array('AQAB'))).toEqual([1, 0, 1])
  })

  it('ergaenzt fehlendes Padding (AQ -> [1])', () => {
    expect(Array.from(urlBase64ToUint8Array('AQ'))).toEqual([1])
  })

  it('mappt die base64url-Sonderzeichen - und _ (=> + und /)', () => {
    // bytes [0xFB,0xFF] -> base64 "+/8=" -> base64url "-_8"
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255])
  })

  it('ein echter VAPID-Public-Key dekodiert zu 65 Bytes mit Uncompressed-Marker 0x04', () => {
    const key = 'BFdQv_KYE-kq1qNX2iPJGvFwnteJ9-xI6FX0Cb0Q9PHp_DW7g4V-QiSyUAkBahJKG8GLa6pZyYNuLKaVdxhTGhM'
    const bytes = urlBase64ToUint8Array(key)
    expect(bytes.length).toBe(65)
    expect(bytes[0]).toBe(0x04)
  })
})

describe('serializeSubscription', () => {
  it('extrahiert endpoint + keys aus PushSubscription.toJSON()', () => {
    const sub = {
      endpoint: 'https://fcm.example/abc',
      toJSON: () => ({
        endpoint: 'https://fcm.example/abc',
        keys: { p256dh: 'PPP', auth: 'AAA' },
      }),
    } as unknown as PushSubscription
    expect(serializeSubscription(sub)).toEqual({
      endpoint: 'https://fcm.example/abc',
      keys: { p256dh: 'PPP', auth: 'AAA' },
    })
  })

  it('faellt auf leere Keys zurueck wenn toJSON keine keys liefert', () => {
    const sub = {
      endpoint: 'https://fcm.example/xyz',
      toJSON: () => ({ endpoint: 'https://fcm.example/xyz' }),
    } as unknown as PushSubscription
    expect(serializeSubscription(sub)).toEqual({
      endpoint: 'https://fcm.example/xyz',
      keys: { p256dh: '', auth: '' },
    })
  })
})
