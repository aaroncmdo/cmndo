'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { resolveSchadenkarteToFahrzeug, getKartenFuerFirma } from '@/lib/schadenkarte/schadenkarte'
import { buildQrGridPdf } from '@/lib/werkstatt/flyer/build-qr-grid'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

/**
 * Reverse-Lookup: Welches Fahrzeug gehört zu diesem Karten-Token?
 * Firma-scoped — gibt nur Treffer zurück wenn die Karte zur eigenen Firma gehört.
 */
export async function identifiziereKarte(
  token: string,
): Promise<{ ok: true; vehicleId: string } | { ok: false; error: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  const karte = await resolveSchadenkarteToFahrzeug(db, token)
  if (!karte) return { ok: false, error: 'Karte gehört zu keinem Ihrer Fahrzeuge.' }

  if (karte.firmaId !== firma.id) {
    return { ok: false, error: 'Karte gehört zu keinem Ihrer Fahrzeuge.' }
  }

  if (!karte.fahrzeugId) {
    return { ok: false, error: 'Karte ist noch keinem Fahrzeug zugewiesen.' }
  }

  return { ok: true, vehicleId: karte.fahrzeugId }
}

/**
 * Alle QR-Codes der Firma als A4-Grid-PDF (zum Ausdrucken + Aufkleben).
 * Spiegelt das Muster aus src/app/admin/werkstaetten/qr-pool/flyer-actions.ts#generateQrGridPdf.
 */
export async function baueKartenQrPdf(): Promise<
  { ok: true; base64: string } | { ok: false; error: string }
> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  const karten = await getKartenFuerFirma(db, firma.id)
  if (karten.length === 0) return { ok: false, error: 'Keine Karten vorhanden.' }

  try {
    const entries = karten.map((k) => ({
      token: k.token,
      url: `https://claimondo.de/schaden/${k.token}`,
    }))
    const bytes = await buildQrGridPdf(entries)
    return { ok: true, base64: Buffer.from(bytes).toString('base64') }
  } catch (err) {
    console.error('[baueKartenQrPdf]', err)
    return { ok: false, error: 'QR-PDF-Erzeugung fehlgeschlagen.' }
  }
}
