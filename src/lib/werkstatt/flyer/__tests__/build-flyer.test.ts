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
    // Echtes A5 in pt (148x210mm @ 72dpi = 419,53x595,28 -> gerundet 420x595). build-werkstatt-flyer.ts
    // skaliert die ~2165x3068pt-Vorlage per scaleContent auf A5 herunter (setSize(A5.w, A5.h)), damit sie
    // direkt als A5 druckt statt ~76x108cm. Der Test hielt bis 21.07. die VOR-Skalierung fest.
    expect(Math.round(doc.getPage(0).getWidth())).toBe(420)
    expect(Math.round(doc.getPage(0).getHeight())).toBe(595)
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
