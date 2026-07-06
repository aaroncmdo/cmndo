import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { buildWerkstattFlyerPdf } from '../build-werkstatt-flyer'
import { buildQrGridPdf } from '../build-qr-grid'

const TEMPLATE = 'public/flyer-templates/werkstatt-partner-a5.pdf'
const entry = (n: string) => ({ token: `WQR-${n}`, url: `https://app.claimondo.de/start/werkstatt-qr/WQR-${n}` })

describe('buildWerkstattFlyerPdf', () => {
  it('erzeugt 1 A5-Seite je Eintrag (Multi-Page)', async () => {
    const tpl = new Uint8Array(await readFile(TEMPLATE))
    const bytes = await buildWerkstattFlyerPdf(tpl, [entry('AAAA1111'), entry('BBBB2222')])
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(2)
    // A5-Export-Groesse (2165x3068pt) bleibt erhalten
    expect(Math.round(doc.getPage(0).getWidth())).toBe(2165)
    expect(Math.round(doc.getPage(0).getHeight())).toBe(3068)
  })

  it('dedupliziert das Vorlagen-Bild -> Bulk bleibt klein', async () => {
    const tpl = new Uint8Array(await readFile(TEMPLATE))
    const entries = Array.from({ length: 12 }, (_, i) => entry(`X${i}`))
    const bytes = await buildWerkstattFlyerPdf(tpl, entries)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(12)
    // 12 Flyer duerfen NICHT 12x das ~1MB-Vorlagenbild enthalten (Dedup greift).
    expect(bytes.length).toBeLessThan(5_000_000)
  }, 20000)
})

describe('buildQrGridPdf', () => {
  it('legt ein A4-Grid an (12 pro Seite)', async () => {
    const bytes = await buildQrGridPdf(Array.from({ length: 15 }, (_, i) => entry(`G${i}`)))
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(2) // 15 / 12 = 2 Seiten
    expect(Math.round(doc.getPage(0).getWidth())).toBe(595) // A4
  }, 20000)
})
