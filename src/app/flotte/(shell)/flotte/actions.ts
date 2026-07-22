'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { normalizeWhatsappNummer } from '@/lib/whatsapp/whatsapp-nummer'
import { addFahrzeugToFlotte, removeFahrzeugFromFlotte } from '@/lib/flotte/mutate-flotte'
import { scanZb1FuerFlotte } from '@/lib/flotte/zb1-scan'
import { legeFlottenFahrzeugeAn, type BatchAnlageZeile, type BatchAnlageErgebnis } from '@/lib/flotte/zb1-batch-anlage'
import type { FahrzeugForm } from '@/lib/kunde/firma-flotte'

export async function fuegeFahrzeugHinzu(form: FahrzeugForm): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto.' }
  const res = await addFahrzeugToFlotte(db, firma.id, form, user.id)
  if (res.ok) revalidatePath('/flotte/flotte')
  return res
}

export async function entferneFahrzeug(flottenId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto.' }
  const res = await removeFahrzeugFromFlotte(db, flottenId, firma.id)
  if (res.ok) revalidatePath('/flotte/flotte')
  return res
}

// ZB1-Batch-Anlage (Task 7): scannt EIN ZB1-Bild und legt anschliessend die im Review
// bestaetigten Zeilen an. Firma serverseitig aus dem Flottenmanager-Konto gebunden.
export async function scanZb1Karte(base64: string) {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false as const, error: 'Kein Flotten-Konto.' }
  return scanZb1FuerFlotte(db, base64, firma.id)
}

export async function legeZb1Fahrzeuge(zeilen: BatchAnlageZeile[]): Promise<BatchAnlageErgebnis[]> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) {
    return zeilen.map((z, i) => ({
      zeileIndex: i,
      kennzeichen: z.felder.kennzeichen,
      status: 'fehler' as const,
      error: 'Kein Flotten-Konto.',
    }))
  }
  const res = await legeFlottenFahrzeugeAn(db, zeilen, firma.id, user.id)
  revalidatePath('/flotte/flotte')
  return res
}

// T2 (operativer-schaden-flow): FM setzt/aendert seine eigene WhatsApp-Kontaktnummer
// (Self-Service, kein Onboarding-Flow). Leere Eingabe -> null. Scope: eigenes aktives Konto.
export async function setzeMeineWhatsappNummer(nummerRaw: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const parsed = normalizeWhatsappNummer(nummerRaw)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const db = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('firmen_flotten_konten')
    .update({ whatsapp_nummer: parsed.value })
    .eq('user_id', user.id)
    .eq('status', 'aktiv')
  if (error) return { ok: false, error: error.message }
  revalidatePath('/flotte/flotte')
  return { ok: true }
}
