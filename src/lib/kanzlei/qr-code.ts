// AAR-842: QR-Code-Generierung server-seitig als inline SVG.
//
// qrcode-Lib (1.5.4) ist installiert. type='svg' liefert SVG-String der
// direkt in dangerouslySetInnerHTML kann. Determministisch, kein Caching nötig.

import QRCode from 'qrcode'

export async function generateQrCodeSvg(
  data: string,
  size = 120,
): Promise<string> {
  if (!data) return ''
  try {
    return await QRCode.toString(data, {
      type:   'svg',
      width:  size,
      margin: 1,
      color: {
        dark:  '#0D1B3E',
        light: '#ffffff',
      },
    })
  } catch (err) {
    console.error('[AAR-842] generateQrCodeSvg failed:', err)
    return ''
  }
}
