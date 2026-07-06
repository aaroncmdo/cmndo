'use server'

// Sub-Projekt 1 (Kunde-Portal 1+): In-Portal-Schadenmeldung.
// Blaupause: src/app/admin/faelle/anlegen/actions.ts (anlegeFall) — aber mit
// Kunde-Auth statt Admin-Guard und kunde_id = user.id, damit der eingeloggte
// Kunde als geschaedigter gesetzt wird (sonst findet getKundeFaelle den Fall nicht).
// Reine Feld-Logik in src/lib/kunde/schaden-melden.ts (golden-getestet).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createLead } from '@/lib/leads/create-lead'
import { convertLeadToFall } from '@/lib/leads/convert-lead-to-fall'
import { ensureVehicleForClaim } from '@/lib/vehicles/ensure-vehicle'
import { buildSchadenLeadInput, type SchadenMeldenForm } from '@/lib/kunde/schaden-melden'

export async function meldeNeuenSchaden(
  form: SchadenMeldenForm,
): Promise<{ ok: true; fallId: string } | { ok: false; error: string }> {
  const { user } = await requirePortalAccess(['kunde'])
  const db = createAdminClient()

  // Kundendaten vorbefuellen (Name/Telefon/Sprache aus dem Profil, Email aus Auth).
  const { data: prof } = await db
    .from('profiles')
    .select('vorname, nachname, telefon, sprache')
    .eq('id', user.id)
    .maybeSingle()

  const built = buildSchadenLeadInput(form, {
    userId: user.id,
    vorname: (prof?.vorname as string | null) ?? null,
    nachname: (prof?.nachname as string | null) ?? null,
    telefon: (prof?.telefon as string | null) ?? null,
    email: user.email ?? null,
    sprache: (prof?.sprache as string | null) ?? null,
  })
  if (!built.ok) return { ok: false, error: built.error }

  const created = await createLead(db, built.base, built.extra)
  if (!created.ok) return { ok: false, error: created.error }

  // convertLeadToFall WIRFT (kein Result-Object) + macht die volle Behandlung:
  // KB-Zuweisung (sticky), Pflichtdokumente, WhatsApp "fall_eroeffnet" (fire-and-forget),
  // Auto-Tasks. Bei Fehler NICHT den Lead loeschen — der Converter ist idempotent und
  // ein Delete wuerde einen evtl. schon erstellten Claim verwaisen. Der Lead bleibt fuer
  // manuelle Dispatch-Uebernahme erhalten.
  let fallId: string
  try {
    const conv = await convertLeadToFall(db, created.leadId, user.id)
    fallId = conv.fallId
  } catch (err) {
    console.error('[meldeNeuenSchaden] convertLeadToFall:', err)
    return { ok: false, error: 'Beim Anlegen des Schadens ist etwas schiefgelaufen. Bitte versuche es erneut.' }
  }

  // Fahrzeug ohne FIN -> Stub, setzt claims.vehicle_id. Non-critical (Fall steht bereits).
  if (built.extra.kennzeichen) {
    try {
      await ensureVehicleForClaim({ claimId: fallId, snapshot: { kennzeichen: built.extra.kennzeichen }, db })
    } catch (err) {
      console.error('[meldeNeuenSchaden] ensureVehicleForClaim:', err)
    }
  }

  revalidatePath('/kunde')
  return { ok: true, fallId }
}
