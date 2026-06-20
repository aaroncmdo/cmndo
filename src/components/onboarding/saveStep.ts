'use server'

import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { buildVerursacherPartyUpdates } from '@/lib/onboarding/verursacher-party-facts'
import type { OnboardingFeld, SaveOnboardingResult } from './types'

const ALLOWED_TABLES = new Set<string>(['gutachter_finder_anfragen'])

// CMM-49 Feststellung-doppelt: claims-Felder (db_target.tabelle='claims') aus dem
// kunde-onboarding schreiben den EXISTIERENDEN Claim (ownership-gated), NICHT eine gfa.
// Harte Allowlist der schreibbaren claim-Fakten (Defense-in-Depth ZUSAETZLICH zur
// onboarding_felder-Config) + Bool-Subset fuer Typ-Coercion (segmented liefert String).
const CLAIMS_ONBOARDING_WRITABLE = new Set<string>([
  'hergang_kunde_text', 'schadenart', 'spezifikation',
  'hat_personenschaden', 'hat_sachschaden', 'sachschaden_beschreibung',
  'polizei_vor_ort', 'polizei_aktenzeichen',
  'zeugen_vorhanden', 'zeugen_kontakte',
])
const CLAIMS_ONBOARDING_BOOL = new Set<string>([
  'hat_personenschaden', 'hat_sachschaden', 'polizei_vor_ort', 'zeugen_vorhanden',
])

async function getClientIpHash(): Promise<string | null> {
  const h = await headers()
  const xff = h.get('x-forwarded-for')
  const realIp = h.get('x-real-ip')
  const raw = xff?.split(',')[0]?.trim() || realIp?.trim() || null
  if (!raw) return null
  return createHash('sha256').update(raw).digest('hex')
}

export async function saveOnboardingStep(
  anfrageId: string | null,
  _phaseKey: string,
  values: Record<string, unknown>,
  felder: OnboardingFeld[],
  fallId?: string | null,
): Promise<SaveOnboardingResult> {
  const supabase = await createClient()

  // CMM-49 Feststellung-doppelt: claims-Fakten (db_target.tabelle='claims') gehen
  // ownership-gated auf den existierenden Claim des Kunden, NICHT in die gfa-Gruppierung.
  const claimsFelder = felder.filter(f => f.db_target?.tabelle === 'claims')
  if (claimsFelder.length > 0) {
    const r = await saveClaimsOnboardingFacts(supabase, fallId ?? null, values, claimsFelder)
    if (!r.ok) return r
  }

  // CMM-49 Feststellung-doppelt (Increment 3): Gegner-Fakten (db_target.tabelle='claim_parties')
  // gehen ownership-gated auf die verursacher-claim_party (SSoT) — wie die claims-Fakten, NICHT
  // in die gfa-Gruppierung. Inert solange keine 'claim_parties'-Felder geseedet sind.
  const partyFelder = felder.filter(f => f.db_target?.tabelle === 'claim_parties')
  if (partyFelder.length > 0) {
    const r = await saveVerursacherPartyOnboardingFacts(supabase, fallId ?? null, values, partyFelder)
    if (!r.ok) return r
  }

  // Group field updates by target table
  const updatesByTable = new Map<string, Record<string, unknown>>()
  for (const feld of felder) {
    const { tabelle, spalte } = feld.db_target
    if (!ALLOWED_TABLES.has(tabelle)) continue
    if (!(feld.feld_key in values)) continue
    let val = values[feld.feld_key]
    if (val === undefined) continue

    // checkbox → TIMESTAMPTZ: true = jetzt, false = null
    if (feld.typ === 'checkbox') {
      val = val === true ? new Date().toISOString() : null
    }

    if (!updatesByTable.has(tabelle)) updatesByTable.set(tabelle, {})
    updatesByTable.get(tabelle)![spalte] = val

    // 2026-05-13: Signatur-Felder setzen zusätzlich sa_unterzeichnet_am, damit
    // konvertiere-anfrage-zu-fall.ts (Pflicht-Check auf sa_unterzeichnet_am)
    // nicht blockiert wird. Vorher landeten alle GFAs auf status='entwurf'.
    if (feld.typ === 'signature' && typeof val === 'string' && val.length > 100 && tabelle === 'gutachter_finder_anfragen') {
      updatesByTable.get(tabelle)!['sa_unterzeichnet_am'] = new Date().toISOString()
    }
  }

  // Nur claims-Fakten in dieser Phase (keine gfa-Felder) -> kein gfa-INSERT/UPDATE noetig
  // (claims sind oben schon geschrieben). Verhindert eine Wegwerf-gfa bei claims-only-Phasen.
  if (updatesByTable.size === 0) {
    return { ok: true, anfrageId: anfrageId ?? fallId ?? '' }
  }

  const id = anfrageId

  if (!id) {
    // AAR-915: Rate-Limit für anonyme Neu-Anfragen (max 5 / 1h pro IP).
    // Greift nur beim INSERT — UPDATE-Pfad (Wizard-Weiterklicken auf
    // bestehende Anfrage) bleibt unbegrenzt, sonst würde der Flow brechen.
    const ipHash = await getClientIpHash()
    if (ipHash) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: allowed, error: rlErr } = await (supabase as any).rpc(
        'check_gfa_rate_limit',
        { p_ip_hash: ipHash },
      )
      if (rlErr) {
        console.error('[gfa-rate-limit] rpc failed', rlErr.message)
        // Fail-open bei RPC-Fehler — Verfügbarkeit > Rate-Limit-Strenge
      } else if (allowed === false) {
        return {
          ok: false,
          error: 'Zu viele Anfragen von dieser Verbindung. Bitte später erneut versuchen.',
          reason: 'rate_limited',
        }
      }
    }

    // Shell-Datensatz anlegen — wird durch spätere Phase-Updates befüllt.
    // vorname/nachname/email sind NOT NULL → leere Strings als Platzhalter,
    // status='entwurf' signalisiert unvollständige Anfrage.
    const payload = {
      vorname: '',
      nachname: '',
      email: '',
      schadentyp: 'unbekannt',
      status: 'entwurf',
      ...(updatesByTable.get('gutachter_finder_anfragen') ?? {}),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('gutachter_finder_anfragen')
      .insert(payload)
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: error?.message ?? 'Insert fehlgeschlagen' }
    return { ok: true, anfrageId: (data as { id: string }).id }
  }

  // Bestehenden Datensatz pro Tabelle updaten. AAR-890: .select('id') damit
  // wir erkennen wenn die Zeile nicht (mehr) existiert — RLS-Block oder DSGVO-
  // Hard-Delete liefern beide 0 affected rows ohne SQL-Error. Vorher silent
  // ok → Wizard klickt weiter ohne dass irgendwas in DB landet.
  for (const [tabelle, updates] of updatesByTable) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from(tabelle)
      .update(updates)
      .eq('id', id)
      .select('id')
    if (error) return { ok: false, error: error.message }
    if (!Array.isArray(data) || data.length === 0) {
      return { ok: false, error: 'Anfrage nicht gefunden', reason: 'anfrage_not_found' }
    }
  }

  return { ok: true, anfrageId: id }
}

// CMM-49 Feststellung-doppelt: ownership-gated claims-Fakten-Writer fuer das
// kunde-onboarding. Schreibt den EXISTIERENDEN Claim (nicht eine gfa). Der eingeloggte
// Kunde MUSS der Geschaedigte sein (geschaedigter_user_id == auth.uid()) — scoped
// Permission, weil die kunde-Rolle stammdaten=read hat (canEditField=false). Admin-
// Client erst fuer den Ownership-Read, dann fuer den Write NACH bestandenem Check.
// Harte Allowlist (CLAIMS_ONBOARDING_WRITABLE) als Defense-in-Depth gegen Fehl-Config.
async function saveClaimsOnboardingFacts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fallId: string | null,
  values: Record<string, unknown>,
  claimsFelder: OnboardingFeld[],
): Promise<SaveOnboardingResult> {
  // Ownership-gate + fall_id->claim_id-Bridge (geteilt mit saveVerursacherPartyOnboardingFacts).
  const gate = await resolveOwnedClaimId(supabase, fallId)
  if (!gate.ok) return gate
  const { claimId } = gate

  // Update bauen — harte Allowlist (Defense-in-Depth) + Typ-Coercion (segmented->bool, leer->null).
  const updates: Record<string, unknown> = {}
  for (const feld of claimsFelder) {
    const spalte = feld.db_target?.spalte
    if (!spalte || !CLAIMS_ONBOARDING_WRITABLE.has(spalte)) {
      if (spalte) console.warn('[saveOnboardingStep] claims-Spalte nicht in Allowlist, uebersprungen:', spalte)
      continue
    }
    if (!(feld.feld_key in values)) continue
    let val = values[feld.feld_key]
    if (val === undefined) continue
    if (CLAIMS_ONBOARDING_BOOL.has(spalte)) {
      val = val === true || val === 'true' || val === 'ja' || val === '1'
    } else if (typeof val === 'string' && val.trim() === '') {
      val = null
    }
    updates[spalte] = val
  }
  if (Object.keys(updates).length === 0) return { ok: true, anfrageId: claimId }

  const admin = createAdminClient()
  const { error } = await admin.from('claims').update(updates).eq('id', claimId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, anfrageId: claimId }
}

// CMM-49 Feststellung-doppelt: ownership-gate + fall_id->claim_id-Bridge, geteilt von
// saveClaimsOnboardingFacts und saveVerursacherPartyOnboardingFacts. Der eingeloggte Kunde
// MUSS der Geschaedigte des Claims sein (geschaedigter_user_id == auth.uid()) — scoped
// Permission, weil die kunde-Rolle stammdaten=read hat (canEditField=false). Admin-Read fuer
// den Vergleich; der jeweilige Write passiert NACH bestandenem Check.
async function resolveOwnedClaimId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fallId: string | null,
): Promise<{ ok: true; claimId: string } | { ok: false; error: string }> {
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  if (!fallId) return { ok: false, error: 'Kein Fall-Kontext fuer die Fakten-Speicherung' }

  // fall_id -> claim_id (Bridge; fall_id != claim_id, MP-8b-Invariante)
  const claimId = await resolveClaimId(supabase, fallId)
  if (!claimId) return { ok: false, error: 'Kein Claim zu diesem Fall gefunden' }

  const admin = createAdminClient()
  const { data: claimRow, error: ownErr } = await admin
    .from('claims')
    .select('geschaedigter_user_id')
    .eq('id', claimId)
    .maybeSingle()
  if (ownErr) return { ok: false, error: ownErr.message }
  const ownerId = ((claimRow as { geschaedigter_user_id?: string | null } | null)?.geschaedigter_user_id) ?? null
  if (!ownerId || ownerId !== user.id) {
    return { ok: false, error: 'Keine Berechtigung fuer diesen Fall' }
  }
  return { ok: true, claimId }
}

// CMM-49 Feststellung-doppelt (Increment 3): Gegner-Fakten aus dem kunde-onboarding auf die
// verursacher-claim_party (kanonisches SSoT). v_claim_full liest die Gegner-Felder bereits von
// der Party (gp-LATERAL: kennzeichen / versicherung_klartext / versicherungsnummer) -> kein
// v_claim_full-Change noetig, keine Kollision mit der gegner-Cutover-Lane. Selektion ==
// v_claim_full.gp (rolle='verursacher', reihenfolge, created_at); existiert keine verursacher-
// Party (meist der Fall, 1/84) -> on-demand anlegen (Option A, quelle='kunde_self' per
// claim_parties_quelle_check). Ownership-gated wie der claims-Writer.
async function saveVerursacherPartyOnboardingFacts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fallId: string | null,
  values: Record<string, unknown>,
  partyFelder: OnboardingFeld[],
): Promise<SaveOnboardingResult> {
  const gate = await resolveOwnedClaimId(supabase, fallId)
  if (!gate.ok) return gate
  const { claimId } = gate

  const updates = buildVerursacherPartyUpdates(partyFelder, values)
  if (Object.keys(updates).length === 0) return { ok: true, anfrageId: claimId }

  const admin = createAdminClient()
  const { data: party, error: selErr } = await admin
    .from('claim_parties')
    .select('id')
    .eq('claim_id', claimId)
    .eq('rolle', 'verursacher')
    .order('reihenfolge', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (selErr) return { ok: false, error: selErr.message }

  const partyId = ((party as { id?: string } | null)?.id) ?? null
  if (partyId) {
    const { error: upErr } = await admin.from('claim_parties').update(updates).eq('id', partyId)
    if (upErr) return { ok: false, error: upErr.message }
    return { ok: true, anfrageId: claimId }
  }

  // Keine verursacher-Party: nur anlegen wenn mind. ein echter Wert kommt (kein leeres Insert).
  const hasValue = Object.values(updates).some(v => v != null)
  if (hasValue) {
    const { error: insErr } = await admin
      .from('claim_parties')
      .insert({ claim_id: claimId, rolle: 'verursacher', reihenfolge: 2, quelle: 'kunde_self', ...updates })
    if (insErr) return { ok: false, error: insErr.message }
  }
  return { ok: true, anfrageId: claimId }
}
