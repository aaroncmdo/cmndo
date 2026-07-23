import 'server-only'

// T5 (operativer-schaden-flow): FM-Schadenmeldung-Fortsetzung → Gutachter-Finder → FlowLink.
// Aaron-Entscheidung: „Finder → bestehender Lead". Der FM waehlt einen Gutachter; die Wahl
// haengt sich per gfa-Back-Reference (konvertiert_zu_lead_id = claim.lead_id, zugeordneter_sv_id)
// an den BESTEHENDEN Lead → ensureCanonicalFlowLinkForLead → /flow. Kein Doppel-Lead, kein /flow-Umbau.
//
// Location = Fahrzeug-Standort/Besichtigungsort (wo der SV besichtigt), NICHT der Unfallort
// (Aaron 22.07.). Default = Firma-Adresse (Depot), FM-editierbar. Wird auf leads.fahrzeug_standort_*
// geschrieben, damit das /flow-Matching (ladeMatchingFlow) die Koordinaten hat.

import { createAdminClient } from '@/lib/supabase/admin'
import { planeTerminMitFallback } from '@/lib/sv-matching-modul'
import { geocodeMitFallback } from '@/lib/termine/engine/geocode'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { createLead } from '@/lib/leads/create-lead'
import type { OeffentlichesSvProfil } from '@/lib/sv-matching-modul/types'

export type Haftungstyp = 'haftpflicht' | 'selbstverschuldet'

/** Kundensichere SV-Projektion fuer den FM-Picker (Teilmenge von OeffentlichesSvProfil, ohne Slots). */
export type GutachterKandidat = {
  svId: string
  vorname: string
  profilbild: string | null
  profilbeschreibung: string | null
  bewertungDurchschnitt: number | null
  bewertungAnzahl: number | null
  distanzGerundet: string
  istTopPartner: boolean
  rang: string | null
  rangSinnsatz: string | null
}

export type SchadenFortsetzungClaim = {
  claimId: string
  leadId: string
  firmaId: string
  kennzeichen: string | null
  /** Default-Besichtigungsort (Firma-Adresse) — FM-editierbar im Picker. */
  defaultAdresse: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

/**
 * Resolved einen Claim für die FM-Fortsetzung MIT Auth-Guard: der eingeloggte User muss ein
 * aktives Flottenmanager-Konto der Firma sein, der das Fahrzeug des Claims gehört.
 * Gibt null zurück, wenn Claim/Fahrzeug/Firma fehlt ODER der User nicht berechtigt ist.
 */
export async function resolveSchadenFortsetzung(
  claimId: string,
  userId: string,
): Promise<SchadenFortsetzungClaim | null> {
  const admin = createAdminClient() as AnyDb
  const { data: claim } = await admin
    .from('claims')
    .select('id, lead_id, vehicle_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim?.lead_id || !claim?.vehicle_id) return null

  const { data: ff } = await admin
    .from('flotten_fahrzeuge')
    .select('firma_id')
    .eq('vehicle_id', claim.vehicle_id)
    .maybeSingle()
  const firmaId = (ff?.firma_id as string | null) ?? null
  if (!firmaId) return null

  // Auth: aktives FM-Konto dieser Firma?
  const { data: konto } = await admin
    .from('firmen_flotten_konten')
    .select('id')
    .eq('firma_id', firmaId)
    .eq('user_id', userId)
    .eq('status', 'aktiv')
    .maybeSingle()
  if (!konto) return null

  const { data: veh } = await admin
    .from('vehicles')
    .select('kennzeichen_aktuell')
    .eq('id', claim.vehicle_id)
    .maybeSingle()
  const { data: firma } = await admin
    .from('firmen')
    .select('adresse_strasse, adresse_plz, adresse_ort')
    .eq('id', firmaId)
    .maybeSingle()

  const defaultAdresse =
    [
      firma?.adresse_strasse,
      [firma?.adresse_plz, firma?.adresse_ort].filter(Boolean).join(' '),
    ]
      .filter((t: string | null | undefined) => t && String(t).trim())
      .join(', ') || null

  return {
    claimId,
    leadId: claim.lead_id as string,
    firmaId,
    kennzeichen: (veh?.kennzeichen_aktuell as string | null) ?? null,
    defaultAdresse,
  }
}

/** Findet den ersterfassung-Claim eines Fahrzeugs — Einstieg für die FM-Fortsetzung (3a/3b).
 *  null, wenn keiner existiert (dann führt „Schaden melden" über den Karten-/Gegner-Weg).
 *  db = Admin/Service-Role (vom Caller wiederverwendet). */
export async function findeErsterfassungClaim(db: AnyDb, vehicleId: string): Promise<string | null> {
  const { data } = await db
    .from('claims')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .eq('operative_status', 'ersterfassung')
    .limit(1)
    .maybeSingle()
  return (data?.id as string | null) ?? null
}

/** Projiziert ein OeffentlichesSvProfil auf die schlanke Picker-Karte (ohne Slots). */
export function projiziereKandidat(s: OeffentlichesSvProfil): GutachterKandidat {
  return {
    svId: s.svId,
    vorname: s.vorname,
    profilbild: s.profilbild,
    profilbeschreibung: s.profilbeschreibung,
    bewertungDurchschnitt: s.bewertungDurchschnitt,
    bewertungAnzahl: s.bewertungAnzahl,
    distanzGerundet: s.distanzGerundet,
    istTopPartner: s.istTopPartner,
    rang: s.rang,
    rangSinnsatz: s.rangSinnsatz,
  }
}

/**
 * Matcht zuständige Gutachter für einen Besichtigungsort (Fahrzeug-Standort). Nutzt die
 * Isochrone-Engine (planeTerminMitFallback) — dieselbe Quelle wie der Embed-Finder. `partner` =
 * buchbare Partner; `fallback` = kein zuständiger Partner (Picker bietet dann „ohne Auswahl"-Weg).
 */
export async function ladeGutachterKandidaten(
  lat: number,
  lng: number,
): Promise<{ kind: 'partner' | 'fallback'; kandidaten: GutachterKandidat[] }> {
  const res = await planeTerminMitFallback({ lat, lng })
  if (res.kind === 'partner') {
    return { kind: 'partner', kandidaten: res.svs.map(projiziereKandidat) }
  }
  return { kind: 'fallback', kandidaten: [] }
}

/** gfa-Pflichtfelder (NOT NULL) aus dem Lead ableiten. Die gfa ist hier NUR ein Back-Ref-Träger
 *  (zugeordneter_sv_id + konvertiert_zu_lead_id) — die Kontaktfelder sind vestigial (Direkt-Insert
 *  via Service-Role, KEIN Dispatch-/Team-Send wie erstelleGutachterFinderAnfrage). */
async function leadGfaPflichtfelder(
  admin: AnyDb,
  leadId: string,
): Promise<{ vorname: string; nachname: string; email: string; schadentyp: string }> {
  const { data: lead } = await admin
    .from('leads')
    .select('vorname, nachname, email, firma_name, gegner_email, schadentyp')
    .eq('id', leadId)
    .maybeSingle()
  const firmaName = (lead?.firma_name as string | null)?.trim()
  return {
    vorname: (lead?.vorname as string | null)?.trim() || firmaName || 'Flotte',
    nachname: (lead?.nachname as string | null)?.trim() || '-',
    email:
      (lead?.email as string | null)?.trim() ||
      (lead?.gegner_email as string | null)?.trim() ||
      'noreply@claimondo.de',
    schadentyp: (lead?.schadentyp as string | null)?.trim() || 'sonstiges',
  }
}

/**
 * Kern: Gutachter-Wahl an den bestehenden Lead hängen + kanonischen FlowLink liefern.
 * 1) Besichtigungsort (Fahrzeug-Standort) geocoden → leads.fahrzeug_standort_* (für /flow-Matching).
 * 2) gfa-Back-Reference upserten (zugeordneter_sv_id + konvertiert_zu_lead_id=claim.lead_id).
 * 3) ensureCanonicalFlowLinkForLead(claim.lead_id) → token → Caller redirected auf /flow/[token].
 * Auth via resolveSchadenFortsetzung. `svId=null` = ohne konkrete Wahl fortfahren (Dispatch weist zu).
 */
export async function waehleGutachterUndStarteFlow(params: {
  claimId: string
  userId: string
  svId: string | null
  adresse: string
  haftungstyp: Haftungstyp
}): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const ctx = await resolveSchadenFortsetzung(params.claimId, params.userId)
  if (!ctx) return { ok: false, error: 'Kein Zugriff auf diesen Schaden.' }
  const admin = createAdminClient() as AnyDb

  // 1) Lead aktualisieren:
  //    a) schuldfrage (FU1) = die Haftpflicht/Kasko-Weiche, die /flow auswertet
  //       ('gegner' = Haftpflicht, 'eigenverantwortung' = selbstverschuldet/Kasko).
  //       NICHT über service_typ (das ist Vollservice-vs-nur-Gutachten, orthogonal zur Schuld).
  //    b) Besichtigungsort (Fahrzeug-Standort) — Aaron 22.07.: NICHT der Unfallort
  //       (den setzt der Gegner-Flow separat auf leads.unfallort_*).
  const adresse = params.adresse.trim()
  const geo = adresse ? await geocodeMitFallback(adresse) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leadPatch: Record<string, any> = {
    schuldfrage: params.haftungstyp === 'haftpflicht' ? 'gegner' : 'eigenverantwortung',
  }
  if (geo) {
    leadPatch.fahrzeug_standort_lat = geo.lat
    leadPatch.fahrzeug_standort_lng = geo.lng
    leadPatch.fahrzeug_standort_adresse = geo.adresse ?? adresse
  }
  {
    const { error } = await admin.from('leads').update(leadPatch).eq('id', ctx.leadId)
    if (error) console.error('[schaden-fortsetzung] Lead-Update fehlgeschlagen:', error.message)
  }

  // 2) gfa-Back-Reference (idempotent: pro Lead genau eine).
  if (params.svId) {
    const { data: bestehend } = await admin
      .from('gutachter_finder_anfragen')
      .select('id')
      .eq('konvertiert_zu_lead_id', ctx.leadId)
      .maybeSingle()
    if (bestehend?.id) {
      const { error } = await admin
        .from('gutachter_finder_anfragen')
        .update({ zugeordneter_sv_id: params.svId, matching_typ: 'partner' })
        .eq('id', bestehend.id)
      if (error) return { ok: false, error: error.message }
    } else {
      const felder = await leadGfaPflichtfelder(admin, ctx.leadId)
      const { error } = await admin.from('gutachter_finder_anfragen').insert({
        vorname: felder.vorname,
        nachname: felder.nachname,
        email: felder.email,
        schadentyp: felder.schadentyp,
        zugeordneter_sv_id: params.svId,
        matching_typ: 'partner',
        konvertiert_zu_lead_id: ctx.leadId,
        konvertiert_am: new Date().toISOString(),
        status: 'konvertiert',
        schadenort_lat: geo?.lat ?? null,
        schadenort_lng: geo?.lng ?? null,
      })
      if (error) return { ok: false, error: error.message }
    }
  }

  // 3) Kanonischer FlowLink (idempotent, lead-gekeyt). service_typ = 'komplett' (Vollservice);
  //    die Haftpflicht/Kasko-Weiche läuft über leads.schuldfrage (Schritt 1a), nicht hier.
  const fl = await ensureCanonicalFlowLinkForLead(ctx.leadId, { serviceTyp: 'komplett' })
  if (!fl.ok) return { ok: false, error: fl.error }
  return { ok: true, token: fl.token }
}

const FLOTTEN_LEAD_DEDUP_MS = 10 * 60_000 // 10 Min — Doppelklick/Re-Submit-Fenster (Muster findRecentGegnerLead)

/**
 * §0-Dedup: frischen flotte-manuell-Lead fuer DIESES Fahrzeug im Fenster finden (Doppelklick/
 * Re-Submit). Ohne Guard erzeugt jeder „Schaden melden"-Klick einen neuen Lead + FlowLink.
 * Best-effort: bei DB-Fehler null (lieber neu anlegen als den Flow brechen).
 */
async function findRecentFlottenLead(admin: AnyDb, vehicleId: string): Promise<string | null> {
  const sinceIso = new Date(Date.now() - FLOTTEN_LEAD_DEDUP_MS).toISOString()
  const { data, error } = await admin
    .from('leads')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .eq('source_channel', 'flotte-manuell')
    .gt('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[schaden-fortsetzung] findRecentFlottenLead fehlgeschlagen:', error.message)
    return null
  }
  return (data?.id as string | null) ?? null
}

/**
 * Lead-first (Aaron 23.07.): Meldet einen NEUEN Flotten-Schaden fuer ein Fahrzeug — erzeugt NUR
 * einen baren Lead (kein schuldfrage-Vorsetzen, KEIN Upfront-Claim) + kanonischen FlowLink. Die
 * Haftpflicht/Kasko-Weiche faellt db-driven im /flow (quali-Step); am /flow-Ende entsteht Claim
 * (Haftpflicht→SV) bzw. Werkstatt-Auftrag (Kasko/Selbstzahler). Auth: FM der Fahrzeug-Firma.
 * Dedup: ein frischer flotte-manuell-Lead desselben Fahrzeugs wird wiederverwendet (§0).
 */
export async function erstelleFlottenSchadenLead(params: {
  vehicleId: string
  userId: string
}): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const admin = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(admin, params.userId)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto.' }

  // Auth: gehört das Fahrzeug der Firma des eingeloggten FM?
  const { data: ff } = await admin
    .from('flotten_fahrzeuge')
    .select('id')
    .eq('firma_id', firma.id)
    .eq('vehicle_id', params.vehicleId)
    .maybeSingle()
  if (!ff) return { ok: false, error: 'Fahrzeug gehört nicht zu Ihrer Flotte.' }

  // §0-Dedup: frischen flotte-manuell-Lead wiederverwenden statt einen zweiten anzulegen.
  let leadId = await findRecentFlottenLead(admin, params.vehicleId)
  if (!leadId) {
    const created = await createLead(
      admin,
      { source_channel: 'flotte-manuell', status: 'neu' },
      { vehicle_id: params.vehicleId, firma_name: firma.name, gewerbe_flag: true },
    )
    if (!created.ok) return { ok: false, error: created.error }
    leadId = created.leadId
  }

  const fl = await ensureCanonicalFlowLinkForLead(leadId, { serviceTyp: 'komplett', admin })
  if (!fl.ok) return { ok: false, error: fl.error }
  return { ok: true, token: fl.token }
}

/**
 * §2d „Schaden vervollständigen" (Claim-Detail): setzt einen BESTEHENDEN Claim (Gegner-Tap oder
 * frueher gemeldet) db-driven ueber /flow fort — liefert den FlowLink-Token seines Leads. Auth:
 * FM der Fahrzeug-Firma (self-contained — damit die picker-`resolveSchadenFortsetzung` in §3
 * geloescht werden kann).
 */
export async function flowLinkFuerClaimFortsetzung(
  claimId: string,
  userId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const admin = createAdminClient() as AnyDb
  const { data: claim } = await admin
    .from('claims')
    .select('lead_id, vehicle_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim?.lead_id || !claim?.vehicle_id) return { ok: false, error: 'Kein Zugriff auf diesen Schaden.' }

  const { data: ff } = await admin
    .from('flotten_fahrzeuge')
    .select('firma_id')
    .eq('vehicle_id', claim.vehicle_id)
    .maybeSingle()
  const firmaId = (ff?.firma_id as string | null) ?? null
  if (!firmaId) return { ok: false, error: 'Kein Zugriff auf diesen Schaden.' }

  const { data: konto } = await admin
    .from('firmen_flotten_konten')
    .select('id')
    .eq('firma_id', firmaId)
    .eq('user_id', userId)
    .eq('status', 'aktiv')
    .maybeSingle()
  if (!konto) return { ok: false, error: 'Kein Zugriff auf diesen Schaden.' }

  const fl = await ensureCanonicalFlowLinkForLead(claim.lead_id as string, { serviceTyp: 'komplett', admin })
  if (!fl.ok) return { ok: false, error: fl.error }
  return { ok: true, token: fl.token }
}
