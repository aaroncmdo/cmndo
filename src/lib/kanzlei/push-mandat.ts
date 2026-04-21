// AAR-kanzlei: Outbound-Push an die Kanzlei-Schnittstelle.
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
// Security: HMAC-SHA256 über den Raw-JSON-Body mit Shared-Secret
// (Env KANZLEI_API_SECRET). Header X-Claimondo-Signature: sha256=<hex>.
// Die Kanzlei verifiziert die Signatur gegen denselben Secret.
//
// Feature-Flag: KANZLEI_API_ENABLED=true. Wenn nicht gesetzt oder
// KANZLEI_API_URL fehlt → skip mit Log. Damit kann das Feature in
// Staging getestet werden ohne Prod-Integration live zu schalten.

import { createHmac, randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export type PushMandatResult =
  | { success: true; kanzlei_mandat_id: string | null }
  | { success: false; error: string; skipped?: boolean }

// Exakt die Felder, die die Kanzlei im ersten Schritt braucht. Der Rest
// (Schadenshergang, Gegner, Versicherung, Dokumente) kommt via Kanzlei-Paket
// aus der Email, die wir weiterhin senden — die Integration hier ersetzt das
// Paket NICHT, sondern legt nur das Mandat an.
interface MandatPayload {
  /** Unsere Canonical-ID. Muss in allen Rück-Events gespiegelt werden. */
  claimondo_fall_nr: string
  kunde: {
    anrede: 'Herr' | 'Frau' | 'Divers' | null
    vorname: string
    nachname: string
    strasse: string | null
    plz: string | null
    stadt: string | null
    email: string | null
  }
  firma: boolean
  vorsteuerabzugsberechtigt: boolean
  fahrzeug: {
    /** Kennzeichen des Fahrzeughalters */
    kennzeichen: string | null
  }
  // Optional — hilft der Kanzlei beim Duplikat-Check ohne Rückfrage an uns
  meta: {
    idempotency_key: string
    created_at: string
  }
}

export async function pushMandatToKanzlei(fallId: string): Promise<PushMandatResult> {
  const apiUrl = process.env.KANZLEI_API_URL
  const apiSecret = process.env.KANZLEI_API_SECRET
  const enabled = process.env.KANZLEI_API_ENABLED === 'true'

  if (!enabled || !apiUrl || !apiSecret) {
    console.info('[AAR-kanzlei] Push übersprungen — API nicht konfiguriert oder disabled')
    return { success: false, skipped: true, error: 'kanzlei_api_not_configured' }
  }

  const db = createAdminClient()

  // Fall + Kunde-Anrede laden. kunde_id → profiles.anrede via JOIN.
  const { data: fall, error: fallErr } = await db
    .from('faelle')
    .select(
      'id, fall_nummer, service_typ, kunde_id, kunde_vorname, kunde_nachname, kunde_email, kunde_strasse, kunde_plz, kunde_stadt, firma_name, vorsteuerabzugsberechtigt, kennzeichen',
    )
    .eq('id', fallId)
    .maybeSingle()
  if (fallErr || !fall) {
    return { success: false, error: `Fall nicht gefunden: ${fallErr?.message ?? fallId}` }
  }

  // Push nur für komplett-Mandat
  if ((fall.service_typ as string | null) !== 'komplett') {
    return { success: false, skipped: true, error: 'service_typ_not_komplett' }
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

  const body = JSON.stringify(payload)
  const signature = createHmac('sha256', apiSecret).update(body).digest('hex')

  let responseJson: { mandat_id?: string } = {}
  try {
    const resp = await fetch(`${apiUrl.replace(/\/$/, '')}/mandate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Claimondo-Signature': `sha256=${signature}`,
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

  // Erfolg: Mandatsnummer (Kanzlei-interne ID) speichern + Timeline
  const kanzleiMandatId = typeof responseJson.mandat_id === 'string' ? responseJson.mandat_id : null
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
      ? `Kanzlei-Mandat-ID: ${kanzleiMandatId}. Kanzlei versendet Vollmacht an Kunden.`
      : 'Mandat an Kanzlei übergeben. Kanzlei versendet Vollmacht an Kunden.',
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
    console.error('[AAR-kanzlei] Timeline-Log fehlgeschlagen:', err)
  }
}
