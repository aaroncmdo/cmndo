'use server'

// Self-Print-Aufsteller fuer Werkstaetten (Task #5): die Werkstatt laedt ihr
// druckfertiges A5-Aufsteller-PDF direkt auf der QR-Seite herunter — gleiche
// Vorlage + Builder wie der Admin-QR-Pool (/admin/werkstaetten/qr-pool), aber
// self-scoped statt admin-gated.
//
// QR-Ziel: bevorzugt der ZUGEWIESENE Pool-Token der Werkstatt
// (/start/werkstatt-qr/<token>, konsistent mit vorgedruckten Flyern; lesbare
// QR-Nummer wird mitgedruckt). Ohne zugewiesenen Token: direkter Einstieg
// /start/werkstatt/<id> (gleiche Attribution via leads.werkstatt_id), Token-
// Zeile bleibt leer (Builder zeichnet '' schadlos).

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWerkstattByUserId } from '@/lib/werkstatt/queries'
import { werkstattStartUrl } from '@/lib/start-link/werkstatt-start-url'
import { buildWerkstattFlyerPdf } from '@/lib/werkstatt/flyer/build-werkstatt-flyer'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
const TEMPLATE_PATH = join(process.cwd(), 'public', 'flyer-templates', 'werkstatt-partner-a5.pdf')

export async function generiereMeinAufstellerPdf(): Promise<
  { ok: true; base64: string; filename: string } | { ok: false; error: string }
> {
  // Self-Scope: die eigene Werkstatt des eingeloggten Users (kein Admin noetig).
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) return { ok: false, error: 'Keine Werkstatt zum Konto gefunden.' }

  // Pool-Token der Werkstatt aufloesen. werkstatt_qr_pool ist RLS-admin-only ->
  // Admin-Client, aber hart auf die EIGENE werkstatt_id gefiltert (einzige Grenze).
  let token = ''
  let url = werkstattStartUrl(werkstatt.id)
  try {
    const admin = createAdminClient()
    const { data: pool } = await admin
      .from('werkstatt_qr_pool')
      .select('token')
      .eq('werkstatt_id', werkstatt.id)
      .eq('status', 'zugewiesen')
      .order('zugewiesen_am', { ascending: false })
      .limit(1)
      .maybeSingle()
    const t = (pool as { token: string } | null)?.token
    if (t) {
      token = t
      url = `${APP_URL}/start/werkstatt-qr/${t}`
    }
  } catch (err) {
    // non-critical: Fallback auf den direkten Start-Link (gleiche Attribution).
    console.error('[generiereMeinAufstellerPdf] Pool-Lookup fehlgeschlagen (Fallback direkt):', err)
  }

  try {
    const template = new Uint8Array(await readFile(TEMPLATE_PATH))
    const bytes = await buildWerkstattFlyerPdf(template, [{ token, url }])
    return {
      ok: true,
      base64: Buffer.from(bytes).toString('base64'),
      filename: 'claimondo-aufsteller-a5.pdf',
    }
  } catch (err) {
    console.error('[generiereMeinAufstellerPdf] PDF-Erzeugung fehlgeschlagen:', err)
    return { ok: false, error: 'Aufsteller konnte nicht erzeugt werden. Bitte später erneut versuchen.' }
  }
}
