// Bulk-QR-PNGs als Multi-Page-PDF: Raster nackter QR-Codes (je mit Token darunter,
// Ondo-Farbe) im A4-Hochformat, Schnitt-tauglich. Fuer den Sammel-Download aller
// freien / einer Charge, wenn nicht der ganze Flyer gebraucht wird.
//
// Token-Audit-Skip: QR-Generierung braucht konkrete Hex-Werte (kein CSS-Kontext).
//   Siehe AGENTS.md §branding-rules + src/lib/kanzlei/qr-code.ts.
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import QRCode from 'qrcode'
import type { FlyerEntry } from './build-werkstatt-flyer'

const A4 = { w: 595.28, h: 841.89 }
const COLS = 3, ROWS = 4, MARGIN = 36, LABEL_H = 22
const ONDO = rgb(69 / 255, 115 / 255, 162 / 255)

/** Baut ein A4-Grid-PDF mit den QR-Codes (+ Token) aller Eintraege. */
export async function buildQrGridPdf(entries: FlyerEntry[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const font = await out.embedFont(StandardFonts.Helvetica)
  const cellW = (A4.w - 2 * MARGIN) / COLS
  const cellH = (A4.h - 2 * MARGIN) / ROWS
  const qr = Math.min(cellW, cellH) - LABEL_H - 12
  const perPage = COLS * ROWS

  let page: Awaited<ReturnType<PDFDocument['addPage']>> | null = null
  for (let idx = 0; idx < entries.length; idx++) {
    const { token, url } = entries[idx]
    const slot = idx % perPage
    if (slot === 0) page = out.addPage([A4.w, A4.h])
    const col = slot % COLS
    const row = Math.floor(slot / COLS)
    const cellLeft = MARGIN + col * cellW
    const cellTop = A4.h - MARGIN - row * cellH
    const qx = cellLeft + (cellW - qr) / 2
    const qy = cellTop - qr - 6

    const pngBuf = await QRCode.toBuffer(url, {
      type: 'png',
      width: 420,
      margin: 1,
      color: { dark: '#0D1B3E', light: '#ffffff' },
    })
    const png = await out.embedPng(pngBuf)
    page!.drawImage(png, { x: qx, y: qy, width: qr, height: qr })

    const size = 9
    const tw = font.widthOfTextAtSize(token, size)
    page!.drawText(token, { x: cellLeft + (cellW - tw) / 2, y: qy - 14, size, font, color: ONDO })
  }

  return out.save()
}
