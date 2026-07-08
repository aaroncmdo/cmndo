'use server'

// Admin-Server-Actions fuer QR-Pool-Downloads: Werkstatt-Flyer-PDF (einzeln/bulk)
// + QR-Codes-Grid-PDF (Bulk). Laden die A5-Vorlage von der Platte, bauen das PDF
// und liefern es base64-kodiert zum Client-Download.
import { createClient } from '@/lib/supabase/server'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import QRCode from 'qrcode'
import { buildWerkstattFlyerPdf } from '@/lib/werkstatt/flyer/build-werkstatt-flyer'
import { buildQrGridPdf } from '@/lib/werkstatt/flyer/build-qr-grid'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
const TEMPLATE_PATH = join(process.cwd(), 'public', 'flyer-templates', 'werkstatt-partner-a5.pdf')

async function istAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  return profile?.rolle === 'admin'
}

const entriesFor = (tokens: string[]) =>
  tokens.map((token) => ({ token, url: `${APP_URL}/start/werkstatt-qr/${token}` }))

type PdfResult = { ok: true; base64: string; filename: string } | { ok: false; error: string }

/** Einzelner QR-Code als PNG (server-seitig erzeugt -> kein qrcode-Client-Bundle). */
export async function generateQrPng(token: string): Promise<PdfResult> {
  if (!(await istAdmin())) return { ok: false, error: 'Nicht autorisiert.' }
  if (!token) return { ok: false, error: 'Kein Code.' }
  try {
    const buf = await QRCode.toBuffer(`${APP_URL}/start/werkstatt-qr/${token}`, {
      type: 'png',
      width: 600,
      margin: 1,
      color: { dark: '#0D1B3E', light: '#ffffff' },
    })
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `${token}.png` }
  } catch (err) {
    console.error('[generateQrPng]', err)
    return { ok: false, error: 'QR-Erzeugung fehlgeschlagen.' }
  }
}

/** Werkstatt-Flyer als PDF (1 Seite je Token, direkt druckbar). Einzeln oder Bulk. */
export async function generateFlyerPdf(tokens: string[]): Promise<PdfResult> {
  if (!(await istAdmin())) return { ok: false, error: 'Nicht autorisiert.' }
  const clean = (tokens ?? []).filter((t) => typeof t === 'string' && t.length > 0)
  if (clean.length === 0) return { ok: false, error: 'Keine Codes ausgewählt.' }
  try {
    const template = new Uint8Array(await readFile(TEMPLATE_PATH))
    const bytes = await buildWerkstattFlyerPdf(template, entriesFor(clean))
    const filename = clean.length === 1 ? `flyer-${clean[0]}.pdf` : `flyer-werkstatt-${clean.length}.pdf`
    return { ok: true, base64: Buffer.from(bytes).toString('base64'), filename }
  } catch (err) {
    console.error('[generateFlyerPdf]', err)
    return { ok: false, error: 'Flyer-Erzeugung fehlgeschlagen.' }
  }
}

/** Nackte QR-Codes als A4-Grid-PDF (Sammel-Download, Schnitt-tauglich). */
export async function generateQrGridPdf(tokens: string[]): Promise<PdfResult> {
  if (!(await istAdmin())) return { ok: false, error: 'Nicht autorisiert.' }
  const clean = (tokens ?? []).filter((t) => typeof t === 'string' && t.length > 0)
  if (clean.length === 0) return { ok: false, error: 'Keine Codes ausgewählt.' }
  try {
    const bytes = await buildQrGridPdf(entriesFor(clean))
    return { ok: true, base64: Buffer.from(bytes).toString('base64'), filename: `qr-codes-${clean.length}.pdf` }
  } catch (err) {
    console.error('[generateQrGridPdf]', err)
    return { ok: false, error: 'QR-PDF-Erzeugung fehlgeschlagen.' }
  }
}
