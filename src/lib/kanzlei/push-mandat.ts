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
  const { data: fall, error: fallErr } = await db
    .from('faelle')
    .select(
      'id, claim_id, fall_nummer, service_typ, kunde_id, kunde_vorname, kunde_nachname, kunde_email, kunde_telefon, kunde_strasse, kunde_plz, kunde_stadt, firma_name, vorsteuerabzugsberechtigt, kennzeichen, mandatsnummer',
    )
    .eq('id', fallId)
    .maybeSingle()
  if (fallErr || !fall) {
    return { success: false, error: `Fall nicht gefunden: ${fallErr?.message ?? fallId}` }
  }

  // Push-Berechtigung: komplett-Paket ODER kunde hat post-hoc partnerkanzlei
  // gewaehlt (nur_gutachter-Pfad mit nachtraeglicher Wahl). Beide Pfade
  // brauchen die Kanzlei.
  let kanzleiWunsch: string | null = null
  if (fall.claim_id) {
    const { data: claim } = await db
      .from('claims')
      .select('kanzlei_wunsch')
      .eq('id', fall.claim_id)
      .maybeSingle()
    kanzleiWunsch = (claim?.kanzlei_wunsch as string | null) ?? null
  }
  const istKomplett = (fall.service_typ as string | null) === 'komplett'
  const istPartnerkanzlei = kanzleiWunsch === 'partnerkanzlei'
  if (!istKomplett && !istPartnerkanzlei) {
    return { success: false, skipped: true, error: 'kein_komplett_oder_partnerkanzlei' }
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
  const email = (fall.kunde_email as string | null) ?? ''
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

  const payload: MandatPayload = {
    claimondo_fall_nr: (fall.fall_nummer as string | null) ?? fall.id,
    kunde: {
      anrede,
      vorname: (fall.kunde_vorname as string | null) ?? '',
      nachname: (fall.kunde_nachname as string | null) ?? '',
      strasse: (fall.kunde_strasse as string | null) ?? null,
      plz: (fall.kunde_plz as string | null) ?? null,
      stadt: (fall.kunde_stadt as string | null) ?? null,
      email: (fall.kunde_email as string | null) ?? null,
      telefon: (fall.kunde_telefon as string | null) ?? null,
      // Claimondo kommuniziert vor SA-Signatur per WA mit dem Kunden
      // (FlowLink + Reminder), daher ist die Nummer effektiv WA-verifiziert.
      wa_faehig: true,
    },
    firma: !!(fall.firma_name as string | null),
    vorsteuerabzugsberechtigt: !!(fall.vorsteuerabzugsberechtigt as boolean | null),
    fahrzeug: {
      kennzeichen: (fall.kennzeichen as string | null) ?? null,
    },
    meta: {
      idempotency_key: `${fall.fall_nummer ?? fall.id}-mandat-${randomUUID()}`,
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
    await db
      .from('faelle')
      .update({ mandatsnummer: kanzleiMandatId, updated_at: new Date().toISOString() })
      .eq('id', fallId)
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
}
