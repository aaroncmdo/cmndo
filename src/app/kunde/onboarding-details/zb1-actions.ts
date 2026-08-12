'use server'

// AAR-zb1-wizard: Server-Actions für das Zb1UploadField im Wizard.
//
// confirmZb1Korrekturen — wenn der Kunde im Preview Werte editiert hat,
//   schreibt diese Action die korrigierten Werte als Force-Update auf
//   leads (H6-Regel des OCR-Endpoints wird hier bewusst umgangen).
//
// clearZb1Felder — wird vor "Neu fotografieren" gerufen, damit die
//   H6-Regel im OCR-Endpoint die neuen Werte tatsächlich schreiben kann
//   (sie überschreibt nur null/leere Felder).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { ziehVehicleNach } from '@/lib/vehicles/snapshot-update'

/**
 * Ops-Test 11.08. (RC-3): Der ZB1-Parser extrahiert 15 Felder, korrigierbar waren
 * nur 4 — Halteradresse, FIN, HSN/TSN, Erstzulassung und Farbe konnte niemand
 * richtigstellen. Das ist doppelt kritisch, weil der Parser nachweislich falsche
 * Werte liefert (im Testfall stand als halter_strasse das Formular-Label
 * "C1.3 Anschnitt" statt der Adresse, und der Vorname landete im Nachname-Feld).
 * Die Halteradresse geht in Sicherungsabtretung und Gutachten ein.
 */
export type Zb1Korrekturen = {
  kennzeichen?: string | null
  fahrzeug_hersteller?: string | null
  fahrzeug_modell?: string | null
  // halter_name = "Vorname Nachname" — wird beim Schreiben gesplittet
  halter_name?: string | null
  halter_strasse?: string | null
  halter_plz?: string | null
  halter_stadt?: string | null
  fin?: string | null
  erstzulassung?: string | null
  hsn?: string | null
  tsn?: string | null
  fahrzeug_farbe?: string | null
}

/** Felder, die 1:1 (ohne Transformation) auf die gleichnamige leads-Spalte gehen. */
const DIREKTE_FELDER = [
  'kennzeichen',
  'fahrzeug_hersteller',
  'fahrzeug_modell',
  'halter_strasse',
  'halter_plz',
  'halter_stadt',
  'fin',
  'erstzulassung',
  'hsn',
  'tsn',
  'fahrzeug_farbe',
] as const satisfies ReadonlyArray<keyof Zb1Korrekturen>

export type Zb1ActionResult = { ok: true } | { ok: false; error: string }

export async function confirmZb1Korrekturen(
  fallId: string,
  corrections: Zb1Korrekturen,
): Promise<Zb1ActionResult> {
  if (!fallId) return { ok: false, error: 'fallId fehlt' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const leadId = await resolveLeadIdForKunde(admin, fallId, user.id, user.email)
  if (!leadId) return { ok: false, error: 'Kein Zugriff auf diesen Fall' }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  for (const feld of DIREKTE_FELDER) {
    if (corrections[feld] !== undefined) update[feld] = corrections[feld]
  }
  if (corrections.halter_name !== undefined) {
    const split = splitHalterName(corrections.halter_name)
    update.halter_vorname = split.vorname
    update.halter_nachname = split.nachname
  }

  if (Object.keys(update).length === 1) {
    // Nur updated_at — keine Korrekturen vorhanden, früher Exit
    return { ok: true }
  }

  const { error } = await admin.from('leads').update(update).eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  // Ops-Test 11.08. (RC-2): Diese Action schreibt in den LEAD — der Claim liest seine
  // Fahrzeugdaten aber aus vehicles (v_claim_full). Ohne Nachzug landete jede Korrektur
  // des Kunden in einer Sackgasse: der Claim, das Gutachten und die SA zeigten weiter
  // die alten (womoeglich falschen) OCR-Werte. Anders als saveStammdaten hat dieser
  // Pfad KEINE SA-Sperre, laeuft also auch nach der Konversion.
  // Messung prod 12.08.: 7 von 16 konvertierten Leads trugen bereits ein anderes
  // Kennzeichen als ihr Claim-Fahrzeug.
  // Non-critical: ein fehlgeschlagener Nachzug darf die Korrektur nicht zuruecknehmen.
  const nachzug = await ziehVehicleNach({
    leadId,
    snapshot: {
      kennzeichen: (update.kennzeichen as string | null) ?? null,
      hersteller: (update.fahrzeug_hersteller as string | null) ?? null,
      modell: (update.fahrzeug_modell as string | null) ?? null,
      hsn: (update.hsn as string | null) ?? null,
      tsn: (update.tsn as string | null) ?? null,
      farbe: (update.fahrzeug_farbe as string | null) ?? null,
      erstzulassung: (update.erstzulassung as string | null) ?? null,
    },
    db: admin,
  })
  if (!nachzug.ok) {
    console.error('[zb1-korrektur] vehicles-Nachzug fehlgeschlagen (nicht kritisch):', nachzug.error)
  }

  revalidatePath(`/kunde/onboarding-details`)
  revalidatePath(`/kunde/faelle/${fallId}`)
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { ok: true }
}

export async function clearZb1Felder(fallId: string): Promise<Zb1ActionResult> {
  if (!fallId) return { ok: false, error: 'fallId fehlt' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const leadId = await resolveLeadIdForKunde(admin, fallId, user.id, user.email)
  if (!leadId) return { ok: false, error: 'Kein Zugriff auf diesen Fall' }

  const { error } = await admin.from('leads').update({
    kennzeichen: null,
    fin: null,
    fahrzeug_hersteller: null,
    fahrzeug_modell: null,
    fahrzeug_baujahr: null,
    erstzulassung: null,
    hsn: null,
    tsn: null,
    halter_vorname: null,
    halter_nachname: null,
    halter_strasse: null,
    halter_plz: null,
    halter_stadt: null,
    // fahrzeug_farbe fehlte hier — ohne Reset haette die H6-Regel (setIfEmpty)
    // beim zweiten OCR-Lauf die alte Farbe stehen lassen.
    fahrzeug_farbe: null,
    zb1_status: null,
    updated_at: new Date().toISOString(),
  }).eq('id', leadId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── Helpers ────────────────────────────────────────────────────────

type AdminDb = ReturnType<typeof createAdminClient>

async function resolveLeadIdForKunde(
  admin: AdminDb,
  fallId: string,
  userId: string,
  userEmail: string | undefined,
): Promise<string | null> {
  // CMM-49: faelle-frei — claims = SSoT. lead_id (Backfill 20260604225709 vollstaendig)
  // + geschaedigter_user_id (==kunde_id, 0-diff) direkt aus claims. Das app-seitige
  // kunde_id-Ownership-Gate wird value-preserving zu geschaedigter_user_id; die tiefere
  // claim_parties-Semantik bleibt CMM-63.
  const claimId = await resolveClaimId(admin, fallId)
  if (!claimId) return null
  const { data: claim } = await admin
    .from('claims')
    .select('lead_id, geschaedigter_user_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return null
  const leadId = (claim.lead_id as string | null) ?? null
  if (!leadId) return null

  // Primär: geschaedigter_user_id-Match (== frueheres faelle.kunde_id, 0-diff)
  if ((claim.geschaedigter_user_id as string | null) === userId) {
    return leadId
  }

  // Fallback: Email-Match auf leads (für Pre-Auth-Konvertierungen, wenn
  // kunde_id noch nicht gesetzt wurde aber der eingeloggte User dieselbe
  // Email hat wie der Lead).
  if (userEmail) {
    const { data: lead } = await admin
      .from('leads')
      .select('id, email')
      .eq('id', leadId)
      .maybeSingle()
    if (lead && (lead as { email?: string | null }).email?.toLowerCase() === userEmail.toLowerCase()) {
      return leadId
    }
  }

  return null
}

function splitHalterName(name: string | null | undefined): { vorname: string | null; nachname: string | null } {
  if (!name) return { vorname: null, nachname: null }
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { vorname: null, nachname: null }
  if (parts.length === 1) return { vorname: null, nachname: parts[0] }
  return { vorname: parts[0], nachname: parts.slice(1).join(' ') }
}
