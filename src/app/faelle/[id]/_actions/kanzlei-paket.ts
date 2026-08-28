'use server'

// AAR-539 (C2): Kanzlei-Paket-Reader Server-Action.
// Nimmt Paket-Typ + Feld-Werte + optional File entgegen,
// lädt die Datei in Supabase Storage hoch und ruft danach
// denselben C3-Webhook-Handler auf wie der echte LexDrive-Webhook.
// Side-Effects (SLA-Start, Mitteilungen, Status-Transition, Timeline)
// entstehen dadurch automatisch in process-event.ts — kein direktes
// UPDATE auf faelle aus dem UI.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { revalidatePath } from 'next/cache'
import { getStorageUrl } from '@/lib/storage/url'
import { splitOrKeepFaelleUpdate } from '@/lib/faelle/claim-duplicate-columns'
import { upsertClaimPayment } from '@/lib/faelle/claim-payments'
import {
  processLexDriveEvent,
  type LexDriveEventPayload,
} from '@/lib/lexdrive/process-event'
import { findPaketById } from '@/lib/fall/kanzlei-paket-config'

export interface ApplyKanzleiPaketInput {
  fallId: string
  paketId: string
  values: Record<string, string | number | boolean | null>
}

export interface ApplyKanzleiPaketResult {
  success: boolean
  error?: string
  eventRecordId?: string
  uploadedFilePath?: string
}

// FormData-Wrapper: Client schickt fields als JSON-String + optional File unter "file"
export async function applyKanzleiPaket(
  formData: FormData,
): Promise<ApplyKanzleiPaketResult> {
  const fallId = String(formData.get('fall_id') ?? '')
  const paketId = String(formData.get('paket_id') ?? '')
  const valuesRaw = String(formData.get('values') ?? '{}')
  const file = formData.get('file')

  if (!fallId) return { success: false, error: 'fall_id fehlt' }
  if (!paketId) return { success: false, error: 'paket_id fehlt' }

  const paket = findPaketById(paketId)
  if (!paket) return { success: false, error: `Paket-Typ "${paketId}" unbekannt` }

  let values: Record<string, unknown>
  try {
    values = JSON.parse(valuesRaw)
  } catch {
    return { success: false, error: 'Ungültige Feld-Werte (JSON-Parse-Fehler)' }
  }

  // Pflichtfeld-Validierung serverseitig
  for (const field of paket.fields) {
    if (field.type === 'computed') continue
    if (field.required) {
      const v = values[field.name]
      if (v === undefined || v === null || v === '') {
        return { success: false, error: `Pflichtfeld „${field.label}" fehlt` }
      }
    }
  }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (!['admin', 'kundenbetreuer'].includes(rolle ?? '')) {
    return {
      success: false,
      error: 'Nur Admin und Kundenbetreuer dürfen Kanzlei-Pakete einlesen',
    }
  }

  // CMM-49: Existenz-Gate + claim_nummer (claims-native) direkt aus claims via resolveClaimId.
  const epClaimId = await resolveClaimId(supabase, fallId)
  const { data: fallClaim } = epClaimId
    ? await supabase.from('claims').select('claim_nummer').eq('id', epClaimId).maybeSingle()
    : { data: null }
  if (!fallClaim) return { success: false, error: 'Fall nicht gefunden' }

  // File-Upload falls konfiguriert und vorhanden
  let uploadedFilePath: string | undefined
  if (paket.file_upload && file instanceof File && file.size > 0) {
    const ext = file.name.split('.').pop() ?? 'pdf'
    const path = `kanzlei-pakete/${fallId}/${paket.id}-${Date.now()}.${ext}`
    const adminStorage = createAdminClient()
    const { error: uploadErr } = await adminStorage.storage
      .from('fall-dokumente')
      .upload(path, file)
    if (uploadErr) {
      return { success: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }
    }
    uploadedFilePath = path
    const url = await getStorageUrl(adminStorage, 'fall-dokumente', path)
    if (!url) return { success: false, error: 'URL-Generierung fehlgeschlagen' }
    // upload_url in den Payload-Shape der C3-Handler spiegeln
    values.upload_url = url

    // Die Datei liegt an dieser Stelle bereits im Storage und ihre URL geht mit dem
    // Paket raus. Ohne diesen Eintrag taucht sie in keiner Akte auf.
    const { error: paketDokFehler } = await supabase.from('fall_dokumente').insert({
      fall_id: fallId,
      dokument_typ: paket.file_upload.slot_id,
      original_filename: file.name,
      storage_path: path,
      groesse_bytes: file.size,
      mime_type: file.type || null,
      hochgeladen_von_user_id: user.id,
      quelle: 'kanzlei-paket',
    })
    if (paketDokFehler) {
      console.error(`[kanzlei-paket] Dokumenteneintrag NICHT erstellt (Fall ${fallId}, ${file.name}):`, paketDokFehler.message)
    }
  }

  // Computed-Felder aus Config auswerten
  for (const field of paket.fields) {
    if (field.type === 'computed' && typeof field.computed === 'function') {
      values[field.name] = field.computed(values)
    }
  }

  const payload: LexDriveEventPayload = values as LexDriveEventPayload

  const result = await processLexDriveEvent({
    fallId,
    fallNr: fallClaim?.claim_nummer ?? fallId.slice(0, 8),
    eventType: paket.endpoint_event,
    payload,
    externalEventId: null,
    source: 'manual',
    triggeredByProfileId: user.id,
  })

  if (!result.success) {
    return { success: false, error: result.error, uploadedFilePath }
  }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath(`/faelle/${fallId}/prozess`)
  revalidatePath(`/faelle/${fallId}/dokumente`)

  return {
    success: true,
    eventRecordId: result.eventRecordId,
    uploadedFilePath,
  }
}

// AAR-684 Phase 2: klassische Kanzlei-Pfad-Actions aus dem Monolith.
// setAnschlussschreibenDatum → Status 'anschlussschreiben' + VS-01 + WA + Mitteilung
// recordZahlung → State-Machine 'zahlung-eingegangen' + Archivierungs-Task + WA
// saveKanzleiAnsprechpartner → stammdaten-Update auf faelle.kanzlei_*
// erfasseZahlungseingang → zahlungseingaenge + Positionen + Timeline + Auto-Phase
// saveRegulierungsKlassifizierung → upsert auf regulierungs_klassifizierung
import { enqueue, buildDedupKey } from '@/lib/notifications/outbox'
import { triggerArchivierungTask, autoCompleteTask } from '@/lib/tasking'
import { createGutachterMitteilung } from '@/lib/mitteilungen'
import { checkFallAutoPhase } from '@/lib/autoPhase'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { upsertKanzleiFall } from '@/lib/kanzlei-fall/upsert-kanzlei-fall'

/**
 * Markiert das Anschlussschreiben als versendet und treibt den Fall nach
 * 'anschlussschreiben'.
 *
 * `sendedatum` (YYYY-MM-DD) ist PFLICHT: Die VS-Frist laeuft ab **Versand** des
 * Schreibens, nicht ab dem Klick hier (Aaron-Entscheid 28.08.2026). Ein Uebergang
 * ohne bekanntes Versanddatum wuerde `vs-timer` einen zu spaeten Anker geben —
 * die Frist liefe zu lange, die Mahnung ginge verspaetet raus. Lieber wartet der
 * Fall, bis jemand das Datum kennt.
 */
export async function setAnschlussschreibenDatum(
  fallId: string,
  sendedatum: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Datum pruefen, bevor irgendetwas geschrieben wird: ein unplausibler Anker
  // ist schlimmer als gar keiner.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sendedatum)) {
    return { success: false, error: 'Sendedatum fehlt oder hat ein unerwartetes Format' }
  }
  // Mittag UTC statt Mitternacht: haelt den Kalendertag in Berlin-Zeit stabil,
  // egal ob Sommer- oder Winterzeit.
  const anker = new Date(`${sendedatum}T12:00:00Z`)
  if (Number.isNaN(anker.getTime())) {
    return { success: false, error: 'Sendedatum ist kein gültiges Datum' }
  }
  if (anker.getTime() > Date.now()) {
    return { success: false, error: 'Das Sendedatum liegt in der Zukunft — bitte prüfen.' }
  }

  // AAR-auth-haertung (Write-Path-IDOR): (1) Rollen-Gate (nur KB/Admin) — vorher
  // konnte JEDER eingeloggte User die Aktion triggern. (2) Ownership: claim_id via
  // RLS-Client + hard-fail VOR transitionFallStatus, sonst forcierte ein Nicht-
  // Eigentuemer den Fall auf 'anschlussschreiben' (+ Notifs/SLA/VS-Mitteilung).
  const { data: rolleRow } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (!['admin', 'kundenbetreuer'].includes((rolleRow?.rolle as string) ?? '')) {
    return { success: false, error: 'Nur KB/Admin dürfen diese Aktion ausführen' }
  }
  const asClaimId = await resolveClaimId(supabase, fallId)
  if (!asClaimId) return { success: false, error: 'Fall nicht gefunden oder kein Zugriff' }

  // Sendedatum mitschreiben: es ist der fachliche Beleg fuer den Frist-Anker und
  // war bisher nur aus dem OCR bekannt (oder gar nicht).
  const kfRes = await upsertKanzleiFall(createAdminClient(), asClaimId, {
    vs_eskalationsstufe: 'vs-01',
    anschlussschreiben_sendedatum: sendedatum,
  })
  if (!kfRes.ok) return { success: false, error: kfRes.error ?? 'kanzlei_faelle Update fehlgeschlagen' }

  // KFZ-202: Status via State-Machine (setzt anschlussschreiben_am + Timeline).
  // Der Anker ist der VERSAND, nicht dieser Moment (s. Doc-Kommentar oben).
  await transitionFallStatus(fallId, 'anschlussschreiben', {
    user_id: user.id,
    anschlussschreiben_am: anker.toISOString(),
  })

  // C3a: durable via Outbox (Dedup: Doppel-Klick = 1 WA; Silent-Fail → Dispatch-Task).
  await enqueue({
    dedupKey: buildDedupKey({ template: 'as_gesendet', claimId: fallId }),
    kanal: 'whatsapp',
    template: 'as_gesendet',
    claimId: fallId,
  }).catch(() => {})
  autoCompleteTask(fallId, 'as_sendedatum_gesetzt').catch(() => {})

  // CMM-49: faelle-frei — sv_id + claim_nummer via claims (sv_id 0-diff). asClaimId von oben (Z.181).
  const { data: fallForAs } = asClaimId
    ? await supabase.from('claims').select('sv_id, claim_nummer').eq('id', asClaimId).maybeSingle()
    : { data: null }
  if (fallForAs?.sv_id) {
    createGutachterMitteilung(fallForAs.sv_id, 'kanzlei_as_gesendet', fallId, {
      claim_nummer: fallForAs.claim_nummer ?? undefined,
    }).catch(() => {})
  }

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}

export async function recordZahlung(
  fallId: string,
  betrag: number,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Write-Path-Audit (28.06.): Rollen-Guard (analog saveKanzleiAnsprechpartner CMM-48 PR-D).
  // Schreibt claims.regulierungs_betrag via admin-client (RLS-Bypass) → nur admin/kb dürfen.
  {
    const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    if (!['admin', 'kundenbetreuer'].includes((profile?.rolle as string) ?? '')) {
      return { success: false, error: 'Nur Admin und Kundenbetreuer dürfen Zahlungen erfassen' }
    }
  }

  // Payment-Ledger Phase 3 (Collapse): der VS-Betrag geht NUR noch in den Ledger — ueber die
  // State-Machine unten (transitionFallStatus 'zahlung-eingegangen' schreibt erhaltener_betrag=betrag
  // auf die (claim,'vs')-Row, s. state-machine.ts:244-248). Kein claims.regulierungs_betrag-Cache mehr.
  // Legacy-Fall ohne claim_id sauber abfangen statt zu werfen (betragClaimId unten weiterverwendet).
  const betragClaimId = await resolveClaimId(supabase, fallId)
  if (!betragClaimId) {
    return { success: false, error: 'Kein Claim mit dem Fall verknüpft' }
  }

  // KFZ-202: State-Machine (setzt zahlung_eingegangen_am + erhaltener_betrag im Ledger + Timeline)
  await transitionFallStatus(fallId, 'zahlung-eingegangen', { betrag, user_id: user.id })

  // C3a: durable via Outbox — gemeinsamer Dedup-Key ueber beide Erfassungswege
  // (einfache Zahlung + Positionen), damit ein Fall genau 1 Regulierungs-WA erhaelt.
  await enqueue({
    dedupKey: buildDedupKey({ template: 'zahlung_eingegangen', claimId: fallId }),
    kanal: 'whatsapp',
    template: 'zahlung_eingegangen',
    claimId: fallId,
  }).catch(() => {})

  // CMM-49: sv_id (0-diff) + kundenbetreuer_id + claim_nummer (claims-native) direkt aus
  // claims via bereits aufgeloestem betragClaimId (oben null-geguarded).
  const { data: fallForArchive } = await supabase
    .from('claims')
    .select('sv_id, kundenbetreuer_id, claim_nummer')
    .eq('id', betragClaimId)
    .maybeSingle()
  triggerArchivierungTask(fallId, (fallForArchive?.kundenbetreuer_id as string | null) ?? null).catch(() => {})

  if (fallForArchive?.sv_id) {
    createGutachterMitteilung(fallForArchive.sv_id, 'kanzlei_zahlung', fallId, {
      betrag,
      claim_nummer: (fallForArchive?.claim_nummer as string | null) ?? undefined,
    }).catch(() => {})
  }

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}

export async function saveKanzleiAnsprechpartner(
  fallId: string,
  data: { name: string; email: string; telefon: string; position: string },
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // CMM-48 PR-D: Rollen-Guard. Bisher fehlte er — die Autorisierung lag allein
  // auf der faelle-RLS. Da der claims-Write jetzt über den Admin-Client läuft
  // (RLS-Bypass), ist ein expliziter Guard nötig (analog applyKanzleiPaket).
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (!['admin', 'kundenbetreuer'].includes((profile?.rolle as string) ?? '')) {
    return {
      success: false,
      error: 'Nur Admin und Kundenbetreuer dürfen den Kanzlei-Ansprechpartner speichern',
    }
  }

  // CMM-48 PR-D: kanzlei_ansprechpartner_name/email/telefon sind Duplikat-Spalten
  // → claims (SSoT). CMM-49 Phase 2b: position ist seit PR2c ebenfalls CLAIM_OWNED
  // (nicht mehr faelle-only) und das SP-A-Sync-Trigger-Paar ist gedroppt → alle 4
  // Felder gehen auf claims, faelleUpdate war immer leer → toter faelle-Write entfernt.
  const claimId = await resolveClaimId(supabase, fallId)
  const { claimsUpdate } = splitOrKeepFaelleUpdate(
    {
      kanzlei_ansprechpartner_name: data.name || null,
      kanzlei_ansprechpartner_email: data.email || null,
      kanzlei_ansprechpartner_telefon: data.telefon || null,
      kanzlei_ansprechpartner_position: data.position || null,
    },
    claimId,
  )

  if (claimId && Object.keys(claimsUpdate).length > 0) {
    const { error: claimErr } = await createAdminClient()
      .from('claims')
      .update(claimsUpdate)
      .eq('id', claimId)
    if (claimErr) return { success: false, error: claimErr.message }
  }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath(`/kunde/faelle/${fallId}`)
  return { success: true }
}

// KFZ-65: Zahlungseingang-Erfassung mit Positionen
export async function erfasseZahlungseingang(
  fallId: string,
  data: { zahlungsdatum: string; gesamtbetrag: number; referenz?: string; positionen: { position: string; gefordert: number; gezahlt: number; notiz?: string }[] },
): Promise<
  | { success: true; kuerzung: number; gekuerztePositionen: number }
  | { success: false; error: string }
> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Write-Path-Audit (28.06.): Rollen-Guard. Schreibt claims.regulierungs_betrag +
  // claim_payments via admin-client (RLS-Bypass) → nur admin/kb.
  {
    const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    if (!['admin', 'kundenbetreuer'].includes((profile?.rolle as string) ?? '')) {
      return { success: false, error: 'Nur Admin und Kundenbetreuer dürfen Zahlungseingänge erfassen' }
    }
  }

  // CMM-49: zahlungseingaenge + zahlungspositionen sind claim-gekeyt; interim
  // faelle.claim_id-Lookup einmal oben (P4-TODO: claimId aus Caller threaden).
  // Wird auch im claims/claim_payments-Reroute-Block unten wiederverwendet.
  const zeClaimId = await resolveClaimId(supabase, fallId)

  const { data: zahlung, error: zErr } = await supabase.from('zahlungseingaenge').insert({
    claim_id: zeClaimId,
    zahlungsdatum: data.zahlungsdatum,
    gesamtbetrag: data.gesamtbetrag,
    referenz: data.referenz || null,
    erfasst_von: user.id,
  }).select('id').single()

  if (zErr || !zahlung) {
    return {
      success: false,
      error: zErr?.message ?? 'Zahlungseingang konnte nicht erstellt werden',
    }
  }

  for (const pos of data.positionen) {
    await supabase.from('zahlungspositionen').insert({
      zahlung_id: zahlung.id,
      claim_id: zeClaimId,
      position: pos.position,
      gefordert: pos.gefordert,
      gezahlt: pos.gezahlt,
      notiz: pos.notiz || null,
    })
  }

  // CMM-44 SP-A2 (Cluster 3): regulierung_betrag → claims.regulierungs_betrag (SSoT).
  // CMM-44 SP-I3: regulierung_am liegt jetzt auf kanzlei_faelle (Reroute unten im zeClaimId-Block).
  // CMM-44 SP-J Bucket A: zahlung_eingegangen_am liegt jetzt auf claim_payments
  // (Reroute unten). Der Betrag selbst bleibt in zahlungseingaenge (oben) — auf
  // claim_payments wird nur der migrierte Eingangs-Zeitpunkt + status gesetzt.
  const zahlungAm = new Date().toISOString()

  if (zeClaimId) {
    const adminZE = createAdminClient()
    // CMM-44 SP-I3: regulierung_am auf kanzlei_faelle (1:1) statt faelle.
    await upsertKanzleiFall(adminZE, zeClaimId, { regulierung_am: zahlungAm })
    // Payment-Ledger Phase 3 (Collapse): VS-Zahlungseingang NUR in den (claim,'vs')-Ledger —
    // erhaltener_betrag=gesamtbetrag (vorher nur claims-Cache, jetzt Ledger-Ist). Der
    // Positions-Detail bleibt in zahlungseingaenge/zahlungspositionen oben.
    await upsertClaimPayment(
      adminZE,
      zeClaimId,
      'vs',
      { erhaltener_betrag: data.gesamtbetrag, zahlungseingang_am: zahlungAm, status: 'erhalten' },
      user.id,
    )
  }

  const gesamtGefordert = data.positionen.reduce((s, p) => s + p.gefordert, 0)
  const gesamtGezahlt = data.positionen.reduce((s, p) => s + p.gezahlt, 0)
  const kuerzung = gesamtGefordert - gesamtGezahlt
  const gekuerztePositionen = data.positionen.filter(p => p.gezahlt < p.gefordert).length

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: `Zahlungseingang: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(data.gesamtbetrag)}`,
    beschreibung: kuerzung > 0
      ? `Kürzung bei ${gekuerztePositionen} Position(en): ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(kuerzung)}`
      : 'Vollständig reguliert',
    erstellt_von: user.id,
  })

  // C3a: durable via Outbox — gemeinsamer Dedup-Key ueber beide Erfassungswege
  // (einfache Zahlung + Positionen), damit ein Fall genau 1 Regulierungs-WA erhaelt.
  await enqueue({
    dedupKey: buildDedupKey({ template: 'zahlung_eingegangen', claimId: fallId }),
    kanal: 'whatsapp',
    template: 'zahlung_eingegangen',
    claimId: fallId,
  }).catch(() => {})
  checkFallAutoPhase(fallId).catch(() => {})

  revalidatePath(`/faelle/${fallId}`)
  return { success: true, kuerzung, gekuerztePositionen }
}

// KFZ-153: Regulierungs-Klassifizierung upsert
export async function saveRegulierungsKlassifizierung(fallId: string, data: {
  regulierungs_status: string
  kuerzungsgrund?: string | null
  kuerzung_betrag_netto?: number | null
  reguliert_betrag_netto?: number | null
  geltend_gemacht_netto?: number | null
  versicherer?: string | null
  begruendung_versicherer?: string | null
  notiz_intern?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Write-Path-Audit (28.06.): Rollen-Guard für die Regulierungs-Klassifizierung (Finanz-
  // Status). RLS-Client, aber defense-in-depth konsistent zu den anderen Zahlungs-Actions.
  {
    const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    if (!['admin', 'kundenbetreuer'].includes((profile?.rolle as string) ?? '')) {
      return { success: false, error: 'Nur Admin und Kundenbetreuer berechtigt' }
    }
  }

  const { error } = await supabase
    .from('regulierungs_klassifizierung')
    .upsert({
      fall_id: fallId,
      regulierungs_status: data.regulierungs_status,
      kuerzungsgrund: data.kuerzungsgrund || null,
      kuerzung_betrag_netto: data.kuerzung_betrag_netto ?? null,
      reguliert_betrag_netto: data.reguliert_betrag_netto ?? null,
      geltend_gemacht_netto: data.geltend_gemacht_netto ?? null,
      versicherer: data.versicherer || null,
      begruendung_versicherer: data.begruendung_versicherer || null,
      notiz_intern: data.notiz_intern || null,
      erfasst_von: user.id,
      updated_am: new Date().toISOString(),
    }, { onConflict: 'fall_id' })

  if (error) return { success: false, error: error.message }

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}
