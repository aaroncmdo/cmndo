// AAR-kanzlei-oauth: Outbound-Push an die Salesforce-Apex-REST-Schnittstelle
// der Kanzlei (LexDrive).
//
// Stand 2026-04-21 nach Meeting mit LexDrive-Dev:
//   - Auth: Salesforce OAuth2 Password-Grant (siehe lib/kanzlei/sf-auth.ts),
//     KEIN HMAC. Token-Cache 4 Min TTL pro Lambda-Instanz.
//   - Request: Bearer-Token-Header, JSON-Body.
//   - Erwartete Response: 201 Created + { mandat_id } bei Erstanlage,
//     200 OK bei Duplicate (gleicher claimondo_fall_nr).
//
// Trigger: signSAandCreateFall (src/app/flow/[token]/actions.ts) ruft diese
// Funktion nach erfolgreichem Fall-Insert, sobald der Kunde die SA
// unterschrieben hat. Nur für service_typ='komplett' — 'nur_gutachter'
// braucht keine Kanzlei.
//
// Fire-and-forget: Fehler dürfen den SA-Flow NICHT blockieren. Ein
// fehlgeschlagener Push landet als Timeline-Warnung + Notification beim KB,
// damit der Mandat manuell nachgezogen werden kann.
//
// Feature-Flag: KANZLEI_API_ENABLED=true. Wenn nicht gesetzt → skip mit Log.

import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSfAccessToken } from '@/lib/kanzlei/sf-auth'
import { upsertKanzleiFall } from '@/lib/kanzlei-fall/upsert-kanzlei-fall'
import { touchClaimRecency } from '@/lib/claims/touch-recency'
import { createMitteilungMulti } from '@/lib/mitteilungen/create-mitteilung'

export type PushMandatResult =
  | { success: true; kanzlei_mandat_id: string | null }
  | { success: false; error: string; skipped?: boolean }

// Minimal-Payload laut Meeting-Vorgabe + Nachtrag Telefon.
// Alles andere zieht die Kanzlei aus dem Kanzlei-Paket (Email + Portal).
interface MandatPayload {
  /** Unsere Canonical-ID. Kanzlei spiegelt sie in allen Rück-Events. */
  claimondo_fall_nr: string
  kunde: {
    anrede: 'Herr' | 'Frau' | 'Divers' | null
    vorname: string
    nachname: string
    strasse: string | null
    plz: string | null
    stadt: string | null
    email: string | null
    /** Telefonnummer des Kunden. Wird für WA-Vollmacht-Versand durch die Kanzlei benötigt. */
    telefon: string | null
    /** Ob diese Nummer WA-fähig ist — wir setzen true default, da Claimondo
     *  bereits per WA mit dem Kunden kommuniziert hat (Signatur-Flow).
     */
    wa_faehig: boolean
  }
  firma: boolean
  vorsteuerabzugsberechtigt: boolean
  fahrzeug: {
    /** Kennzeichen des Fahrzeughalters */
    kennzeichen: string | null
  }
  meta: {
    idempotency_key: string
    created_at: string
  }
}

export async function pushMandatToKanzlei(fallId: string): Promise<PushMandatResult> {
  const enabled = process.env.KANZLEI_API_ENABLED === 'true'
  const apiUrl = process.env.KANZLEI_SF_API_URL

  if (!enabled || !apiUrl) {
    console.info('[AAR-kanzlei-oauth] Push übersprungen — API nicht aktiviert oder URL fehlt')
    return { success: false, skipped: true, error: 'kanzlei_api_not_configured' }
  }

  const db = createAdminClient()

  // Fall + Kunde-Anrede laden. Telefon wird aus faelle.kunde_telefon (Fall-
  // Snapshot aus convertLeadToFall) genommen. Anrede via profiles (kunde_id).
  // claim_id mitladen — kanzlei_wunsch liegt am Claim, nicht am Fall.
  // CMM-44 SP-A: kunde_email + vorsteuerabzugsberechtigt liegen auf claims
  // (SSoT) — werden zusammen mit kanzlei_wunsch aus der claims-Query unten geladen.
  // CMM-44 SP-B PR2a: service_typ liegt auf claims (SSoT) — in den claims-Embed
  // aufgenommen (claim_id ist ohnehin schon Teil des Selects).
  // CMM-49: faelle->v_claim_full (claim-anchored SSoT). kunde_*/firma_name via
  // geschaedigter-Party->personen (Plan 4.1b), kennzeichen via vehicles, claim_nummer/
  // service_typ flach. claim_id:id-Alias erhaelt den Schluessel fuer die claims-Query unten.
  const { data: fall, error: fallErr } = await db
    .from('v_claim_full')
    .select(
      // C5 (Doktrin §5): kanzlei_wunsch/vorsteuerabzugsberechtigt/vehicle_id/sa_unterschrieben
      // kommen aus DIESEM Read mit — sie standen frueher in einem zweiten Roundtrip auf
      // `claims` fuer denselben Claim. Alle vier traegt v_claim_full selbst.
      'claim_id:id, kunde_id, kunde_vorname, kunde_nachname, kunde_telefon, kunde_strasse, kunde_plz, kunde_stadt, firma_name, kennzeichen, claim_nummer, service_typ, kunde_email, kanzlei_wunsch, vorsteuerabzugsberechtigt, vehicle_id, sa_unterschrieben',
    )
    .eq('fall_id', fallId)
    .maybeSingle()
  if (fallErr || !fall) {
    return { success: false, error: `Fall nicht gefunden: ${fallErr?.message ?? fallId}` }
  }
  const fallClaim = fall

  // Push-Berechtigung: komplett-Paket ODER kunde hat post-hoc partnerkanzlei
  // gewaehlt (nur_gutachter-Pfad mit nachtraeglicher Wahl). Beide Pfade
  // brauchen die Kanzlei.
  let kanzleiWunsch: string | null = null
  // CMM-49: kunde_email entity-sourced via v_claim_full (geschaedigter-Party->personen),
  // nicht mehr aus claims.kunde_email direkt (Vorbereitung des claims.kunde_email-Drops).
  const claimKundeEmail: string | null = (fall.kunde_email as string | null) ?? null
  let claimVorsteuer: boolean | null = null
  // CMM-50.3b: Kennzeichen vehicles-first (claims.vehicle_id -> vehicles), faelle-Snapshot
  // als Fallback. Bis der 50.0-Write-Path vehicles fuellt, greift der Fallback (No-Op).
  let vehicleKennzeichen: string | null = null
  let claimSaUnterschrieben: boolean | null = null
  if (fall.claim_id) {
    kanzleiWunsch = (fall.kanzlei_wunsch as string | null) ?? null
    claimVorsteuer = (fall.vorsteuerabzugsberechtigt as boolean | null) ?? null
    claimSaUnterschrieben = (fall.sa_unterschrieben as boolean | null) ?? null
    const vehId = (fall.vehicle_id as string | null) ?? null
    if (vehId) {
      const { data: veh } = await db.from('vehicles').select('kennzeichen_aktuell').eq('id', vehId).maybeSingle()
      vehicleKennzeichen = (veh?.kennzeichen_aktuell as string | null) ?? null
    }
  }
  const istKomplett = (fallClaim?.service_typ as string | null) === 'komplett'
  const istPartnerkanzlei = kanzleiWunsch === 'partnerkanzlei'
  if (!istKomplett && !istPartnerkanzlei) {
    return { success: false, skipped: true, error: 'kein_komplett_oder_partnerkanzlei' }
  }

  // P4 (Review-Fund LOW-2, Defense-in-Depth): KEIN Mandats-Push ohne Kunden-SA — das Mandat
  // IST die signierte Abtretung. Alle heutigen Caller pushen post-SA (signSAandCreateFall,
  // Vollmacht-Reminder-Cron verlangt Termin), aber dieser single-point-Guard haelt die
  // Invariante auch fuer kuenftige Caller (z.B. den un-signierten SV-Sofort-Claim, P4).
  if (fall.claim_id && claimSaUnterschrieben !== true) {
    return { success: false, skipped: true, error: 'sa_nicht_unterschrieben' }
  }

  // Safety-Net 2026-05-15: Smoke-/Test-Daten dürfen NIE an LexDrive gehen.
  // Aaron-Incident: 7 Test-Mandate landeten heute fast in LexDrive weil
  // service_typ-Mapping-Bug (CLM-2026-00121..126) + KANZLEI_API_ENABLED=true.
  // Pattern-Match auf Email/Telefon. Hard-Skip wenn irgendein Test-Marker.
  const testEmailPatterns = [
    /smoke-/i,
    /^test-/i,
    /@claimondo\.test$/i,
    /\+kunde-/i,
    /\+smoke/i,
  ]
  const testTelefonPatterns = [
    /^017632851069$/, // Miljkovic-PDF
    /^\+49163362857[01]$/, // Aarons Test-Nummer
  ]
  const email = claimKundeEmail ?? ''
  const telefon = (fall.kunde_telefon as string | null) ?? ''
  const istTestEmail = testEmailPatterns.some((re) => re.test(email))
  const istTestTelefon = testTelefonPatterns.some((re) => re.test(telefon))
  if (istTestEmail || istTestTelefon) {
    console.warn(
      '[AAR-kanzlei-safety] Test-Daten erkannt — Push übersprungen.',
      { email, telefon, fallId },
    )
    return { success: false, skipped: true, error: 'test_daten_skip' }
  }

  let anrede: 'Herr' | 'Frau' | 'Divers' | null = null
  if (fall.kunde_id) {
    const { data: profile } = await db
      .from('profiles')
      .select('anrede')
      .eq('id', fall.kunde_id)
      .maybeSingle()
    const raw = (profile?.anrede as string | null) ?? null
    if (raw === 'Herr' || raw === 'Frau' || raw === 'Divers') anrede = raw
  }

  const fallClaimNummer = (fallClaim?.claim_nummer as string | null) ?? null
  const payload: MandatPayload = {
    claimondo_fall_nr: fallClaimNummer ?? fallId,
    kunde: {
      anrede,
      vorname: (fall.kunde_vorname as string | null) ?? '',
      nachname: (fall.kunde_nachname as string | null) ?? '',
      strasse: (fall.kunde_strasse as string | null) ?? null,
      plz: (fall.kunde_plz as string | null) ?? null,
      stadt: (fall.kunde_stadt as string | null) ?? null,
      email: claimKundeEmail,
      telefon: (fall.kunde_telefon as string | null) ?? null,
      // Claimondo kommuniziert vor SA-Signatur per WA mit dem Kunden
      // (FlowLink + Reminder), daher ist die Nummer effektiv WA-verifiziert.
      wa_faehig: true,
    },
    firma: !!(fall.firma_name as string | null),
    vorsteuerabzugsberechtigt: !!claimVorsteuer,
    fahrzeug: {
      // CMM-50.3b: vehicles-SSoT bevorzugt, faelle.kennzeichen als Fallback.
      kennzeichen: vehicleKennzeichen ?? (fall.kennzeichen as string | null) ?? null,
    },
    meta: {
      idempotency_key: `${fallClaimNummer ?? fallId}-mandat-${randomUUID()}`,
      created_at: new Date().toISOString(),
    },
  }

  // Access-Token holen (Cache-Hit bei 4 Min TTL)
  const auth = await getSfAccessToken()
  if (!auth.ok) {
    await logFailureToTimeline(db, fallId, 0, `Auth: ${auth.error}`)
    return { success: false, error: auth.error }
  }

  const body = JSON.stringify(payload)
  const instanceUrl = auth.instanceUrl ?? apiUrl.replace(/\/$/, '')
  const endpoint = `${instanceUrl.replace(/\/$/, '')}/services/apexrest/mandate`

  let responseJson: { mandat_id?: string; mandatId?: string } = {}
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
        'X-Claimondo-Event-Id': payload.meta.idempotency_key,
      },
      body,
    })
    const text = await resp.text()
    try {
      responseJson = text ? JSON.parse(text) : {}
    } catch {
      responseJson = {}
    }
    if (!resp.ok) {
      await logFailureToTimeline(db, fallId, resp.status, text.slice(0, 500))
      return { success: false, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logFailureToTimeline(db, fallId, 0, msg)
    return { success: false, error: `Netzwerk-Fehler: ${msg}` }
  }

  const kanzleiMandatId =
    typeof responseJson.mandat_id === 'string'
      ? responseJson.mandat_id
      : typeof responseJson.mandatId === 'string'
        ? responseJson.mandatId
        : null
  if (kanzleiMandatId) {
    // CMM-44 SP-I2 PR2: mandatsnummer lebt jetzt auf kanzlei_faelle (1:1 per Claim).
    // claim_id aus fall.claim_id (oben bereits geladen). updated_at auf faelle anziehen.
    const kfRes = await upsertKanzleiFall(db, (fall.claim_id as string | null) ?? null, { mandatsnummer: kanzleiMandatId })
    if (!kfRes.ok) console.error('[CMM-44 SP-I2] push-mandat kanzlei_faelle upsert fehlgeschlagen:', kfRes.error)
    // CMM-65: Recency-Bump auf claims (SSoT) statt faelle.updated_at.
    await touchClaimRecency(db, (fall.claim_id as string | null) ?? null)
  }
  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'webhook',
    titel: 'Mandat an Kanzlei übergeben',
    beschreibung: kanzleiMandatId
      ? `Salesforce-Mandat-ID: ${kanzleiMandatId}. Kanzlei versendet Vollmacht per WhatsApp an den Kunden.`
      : 'Mandat an Kanzlei übergeben. Kanzlei versendet Vollmacht per WhatsApp an den Kunden.',
  })

  return { success: true, kanzlei_mandat_id: kanzleiMandatId }
}

async function logFailureToTimeline(
  db: ReturnType<typeof createAdminClient>,
  fallId: string,
  status: number,
  detail: string,
): Promise<void> {
  try {
    await db.from('timeline').insert({
      fall_id: fallId,
      typ: 'webhook',
      titel: 'Mandat-Push an Kanzlei fehlgeschlagen',
      beschreibung: `Status ${status || '—'}. Bitte manuell nachziehen. Detail: ${detail}`,
    })
  } catch (err) {
    console.error('[AAR-kanzlei-oauth] Timeline-Log fehlgeschlagen:', err)
  }

  // Aktive KB/Admin-Benachrichtigung. Der File-Header verspricht "+ Notification
  // beim KB", bisher lief aber NUR der Timeline-Insert -> fehlgeschlagene Pushes
  // verwaisten still (Audit 27.06.: 13 Faelle, Salesforce-Auth-Domain-Fehler,
  // 0 recovered/kein Retry). Direkt-Mitteilung (in-app, dringend) wie die
  // KB-Ops-Alerts (vs-korrespondenz-review / re-termin-eskalation). Best-effort,
  // blockiert den (ohnehin fire-and-forget) Push nie.
  try {
    const { data: bridge } = await db
      .from('faelle_claim_bridge')
      .select('claim_id')
      .eq('fall_id', fallId)
      .maybeSingle()
    const claimId = (bridge as { claim_id?: string | null } | null)?.claim_id ?? null
    const { data: claim } = claimId
      ? await db.from('claims').select('kundenbetreuer_id, claim_nummer').eq('id', claimId).maybeSingle()
      : { data: null }
    const kbId = (claim?.kundenbetreuer_id as string | null) ?? null
    const { data: admins } = await db.from('profiles').select('id').eq('rolle', 'admin')
    const empfaenger: { id: string; rolle: 'kundenbetreuer' | 'admin' }[] = []
    if (kbId) empfaenger.push({ id: kbId, rolle: 'kundenbetreuer' })
    for (const a of admins ?? []) {
      const aId = a.id as string
      if (aId && aId !== kbId) empfaenger.push({ id: aId, rolle: 'admin' })
    }
    if (empfaenger.length > 0) {
      await createMitteilungMulti(empfaenger, {
        kategorie: 'update',
        titel: 'Mandat-Übergabe an Kanzlei fehlgeschlagen',
        inhalt: `Fall ${(claim?.claim_nummer as string | null) ?? fallId.slice(0, 8)}: Das Mandat konnte nicht an die Kanzlei übergeben werden. Bitte manuell nachziehen. (${detail.slice(0, 120)})`,
        kontext_typ: 'fall',
        kontext_id: fallId,
        prioritaet: 'dringend',
      })
    }
  } catch (err) {
    console.error('[AAR-kanzlei-oauth] KB/Admin-Benachrichtigung fehlgeschlagen:', err)
  }
}
