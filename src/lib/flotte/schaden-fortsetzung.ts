import 'server-only'

// FM-Schaden lead-first (Aaron 23.07.): „Schaden melden" erzeugt nur einen baren Lead + FlowLink
// (kein Upfront-Claim, kein schuldfrage-Vorsetzen); die Haftpflicht/Kasko-Weiche faellt db-driven
// im /flow (quali-Step). Der fruehere FM-Gutachter-Picker (resolveSchadenFortsetzung/
// waehleGutachterUndStarteFlow/ladeGutachterKandidaten) ist mit dem Umbau retired — das /flow macht
// SV-Matching + Ort + Weiche selbst. Hier bleiben nur: Neu-Meldung (erstelleFlottenSchadenLead),
// Fortsetzen eines bestehenden Claims (flowLinkFuerClaimFortsetzung) + findeErsterfassungClaim
// (auch vom Gegner-Flow genutzt).

import { createAdminClient } from '@/lib/supabase/admin'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { createLead } from '@/lib/leads/create-lead'
import { notifyTeamNeuerLead } from '@/lib/leads/notify-team-lead'
import { DRAFT_STATUSES } from '@/lib/flotte/fahrzeug-schaeden'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

/** Findet den ersterfassung-Claim eines Fahrzeugs. null, wenn keiner existiert.
 *  Genutzt vom Gegner-Flow (schaden/[token]). db = Admin/Service-Role (vom Caller wiederverwendet). */
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

const FLOTTEN_LEAD_DEDUP_MS = 10 * 60_000 // 10 Min — Doppelklick/Re-Submit-Fenster (Muster findRecentGegnerLead)

/**
 * §0-Dedup: frischen flotte-manuell-Lead fuer DIESES Fahrzeug im Fenster finden (Doppelklick/
 * Re-Submit). Ohne Guard erzeugt jeder „Schaden melden"-Klick einen neuen Lead + FlowLink.
 * NUR noch-offene Drafts (DRAFT_STATUSES) werden wiederverwendet: ein zwischenzeitlich
 * stornierter (disqualifiziert) oder bereits konvertierter (umgewandelt) Lead darf NICHT
 * resurrekten — sonst untergraebt das 10-Min-Fenster den Draft-Storno (Zombie-Lead mit
 * frischem FlowLink, im Draft-Grid unsichtbar) bzw. reuse einen schon umgewandelten Lead.
 * Best-effort: bei DB-Fehler null (lieber neu anlegen als den Flow brechen).
 */
async function findRecentFlottenLead(admin: AnyDb, vehicleId: string): Promise<string | null> {
  const sinceIso = new Date(Date.now() - FLOTTEN_LEAD_DEDUP_MS).toISOString()
  const { data, error } = await admin
    .from('leads')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .eq('source_channel', 'flotte-manuell')
    .in('status', [...DRAFT_STATUSES])
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
    // Prefill (Aaron 24.07.): bekannte Fahrzeug-Stammdaten auf den Lead mappen — der FM soll
    // Bekanntes nicht neu eingeben. `kennzeichen` ist zugleich ein erhebt_feld des feststellung-Steps
    // (neben schadentyp/hergang) -> erscheint dort vorbefuellt UND editierbar (der Step faellt NICHT
    // weg). Rest = Downstream-Kontext (Dispatcher-Liste/Briefing/Claim lesen die lead.fahrzeug_*-Spalten).
    // NUR Stammdaten — kein schaden-spezifisches Feld (Spec §2a: der Lead bleibt bar bei schuldfrage etc.).
    const { data: veh } = await admin
      .from('vehicles')
      .select('kennzeichen_aktuell, hersteller, modell_haupttyp, fin, hsn, tsn, farbe_klartext')
      .eq('id', params.vehicleId)
      .maybeSingle()
    const created = await createLead(
      admin,
      { source_channel: 'flotte-manuell', status: 'neu' },
      {
        vehicle_id: params.vehicleId,
        firma_name: firma.name,
        gewerbe_flag: true,
        kennzeichen: veh?.kennzeichen_aktuell ?? null,
        fahrzeug_hersteller: veh?.hersteller ?? null,
        fahrzeug_modell: veh?.modell_haupttyp ?? null,
        fin: veh?.fin ?? null,
        hsn: veh?.hsn ?? null,
        tsn: veh?.tsn ?? null,
        fahrzeug_farbe: veh?.farbe_klartext ?? null,
      },
    )
    if (!created.ok) return { ok: false, error: created.error }
    leadId = created.leadId

    // Team-WA bei NEUEM Flotten-Lead (Audit 23.08.: war stumm). Nur im
    // Neu-Zweig — die Fortsetzung eines bestehenden Entwurfs ist kein neuer Fall.
    await notifyTeamNeuerLead({
      leadId,
      quelle: `Flotte — ${firma.name}`,
      zusatz: [
        veh?.kennzeichen_aktuell ? `🚗 ${veh.kennzeichen_aktuell}` : null,
        [veh?.hersteller, veh?.modell_haupttyp].filter(Boolean).join(' ') || null,
      ],
    })
  }

  const fl = await ensureCanonicalFlowLinkForLead(leadId, { serviceTyp: 'komplett', admin })
  if (!fl.ok) return { ok: false, error: fl.error }
  return { ok: true, token: fl.token }
}

/**
 * §2d „Schaden vervollständigen" (Claim-Detail): setzt einen BESTEHENDEN Claim (Gegner-Tap oder
 * frueher gemeldet) db-driven ueber /flow fort — liefert den FlowLink-Token seines Leads. Auth:
 * FM der Fahrzeug-Firma.
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

// ─── Draft-Entwurf-Lifecycle (Aaron 24.07.) ────────────────────────────────────
// Ein „Schaden-Entwurf" ist ein barer flotte-manuell-Lead (DRAFT_STATUSES) VOR der
// Claim-Konvertierung (FahrzeugSchaedenSection zeigt ihn). Er muss weitermachbar
// (Resume /flow) UND stornierbar (verwerfen) sein; die Claim-Konvertierung selbst
// passiert db-driven am /flow-Ende (convertLeadToClaim), nicht hier.

/** Auth-Gate: gehoert der Lead einem Fahrzeug der Firma des eingeloggten FM?
 *  Liefert vehicleId + aktuellen Lead-Status fuer die Aufrufer. */
async function leadGehoertFmFirma(
  admin: AnyDb,
  leadId: string,
  userId: string,
): Promise<{ ok: true; vehicleId: string; status: string | null } | { ok: false; error: string }> {
  const { data: lead } = await admin
    .from('leads')
    .select('id, vehicle_id, status')
    .eq('id', leadId)
    .maybeSingle()
  const vehicleId = (lead?.vehicle_id as string | null) ?? null
  if (!vehicleId) return { ok: false, error: 'Kein Zugriff auf diesen Entwurf.' }

  const firma = await getFlottenmanagerFirma(admin, userId)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto.' }

  const { data: ff } = await admin
    .from('flotten_fahrzeuge')
    .select('id')
    .eq('firma_id', firma.id)
    .eq('vehicle_id', vehicleId)
    .maybeSingle()
  if (!ff) return { ok: false, error: 'Kein Zugriff auf diesen Entwurf.' }

  return { ok: true, vehicleId, status: (lead?.status as string | null) ?? null }
}

/**
 * Draft-Resume: setzt einen baren Schaden-Entwurf-Lead ueber /flow fort — liefert den
 * FlowLink-Token seines Leads (reuse ensureCanonicalFlowLinkForLead: gueltigen Link
 * wiederverwenden, sonst frisch minten). Auth: FM der Fahrzeug-Firma des Leads.
 */
export async function flowLinkFuerLeadFortsetzung(
  leadId: string,
  userId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const admin = createAdminClient() as AnyDb
  const gate = await leadGehoertFmFirma(admin, leadId, userId)
  if (!gate.ok) return gate
  const fl = await ensureCanonicalFlowLinkForLead(leadId, { serviceTyp: 'komplett', admin })
  if (!fl.ok) return { ok: false, error: fl.error }
  return { ok: true, token: fl.token }
}

/**
 * Draft-Storno: verwirft einen baren Schaden-Entwurf-Lead. Lead → 'disqualifiziert'
 * (grund_key='fm_storniert' ≠ 'timeout' → NICHT winback-eligible, kein Re-Mail) und
 * seine FlowLinks werden abgelaufen gesetzt (→ /flow zeigt „Link abgelaufen"). KEIN
 * Claim involviert (barer Lead vor Konvertierung). Nur ein NOCH offener Draft ist
 * stornierbar (Race-Schutz gegen zwischenzeitliche Konvertierung). Auth: FM der Firma.
 */
export async function storniereFlottenSchadenLead(
  leadId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient() as AnyDb
  const gate = await leadGehoertFmFirma(admin, leadId, userId)
  if (!gate.ok) return gate
  if (!(DRAFT_STATUSES as readonly string[]).includes(gate.status ?? '')) {
    return { ok: false, error: 'Dieser Entwurf ist nicht mehr offen und kann nicht storniert werden.' }
  }

  const { error } = await admin
    .from('leads')
    .update({
      status: 'disqualifiziert',
      disqualifiziert_grund_key: 'fm_storniert',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  // FlowLinks des Leads ablaufen lassen -> „weitermachen" ist danach zu. Best-effort:
  // der Storno bleibt gueltig, auch wenn das Link-Update haengt (Lead-Status ist die Wahrheit).
  const { error: flErr } = await admin
    .from('flow_links')
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq('lead_id', leadId)
  if (flErr) {
    console.error('[storniereFlottenSchadenLead] FlowLink-Ablauf fehlgeschlagen:', leadId, flErr.message)
  }

  return { ok: true }
}
