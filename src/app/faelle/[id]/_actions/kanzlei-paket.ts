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
import { revalidatePath } from 'next/cache'
import { getStorageUrl } from '@/lib/storage/url'
import { splitOrKeepFaelleUpdate } from '@/lib/faelle/claim-duplicate-columns'
import { upsertCurrentClaimPayment } from '@/lib/faelle/claim-payments'
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

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, claims:claim_id(claim_nummer)')
    .eq('id', fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }
  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims

  // File-Upload falls konfiguriert und vorhanden
  let uploadedFilePath: string | undefined
  if (paket.file_upload && file instanceof File && file.size > 0) {
    const ext = file.name.split('.').pop() ?? 'pdf'
    const path = `kanzlei-pakete/${fallId}/${paket.id}-${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from('fall-dokumente')
      .upload(path, file)
    if (uploadErr) {
      return { success: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }
    }
    uploadedFilePath = path
    const url = await getStorageUrl(supabase, 'fall-dokumente', path)
    if (!url) return { success: false, error: 'URL-Generierung fehlgeschlagen' }
    // upload_url in den Payload-Shape der C3-Handler spiegeln
    values.upload_url = url

    await supabase.from('fall_dokumente').insert({
      fall_id: fallId,
      dokument_typ: paket.file_upload.slot_id,
      original_filename: file.name,
      storage_path: path,
      groesse_bytes: file.size,
      mime_type: file.type || null,
      hochgeladen_von_user_id: user.id,
      quelle: 'kanzlei-paket',
    })
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
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { triggerArchivierungTask, autoCompleteTask } from '@/lib/tasking'
import { createGutachterMitteilung } from '@/lib/mitteilungen'
import { checkFallAutoPhase } from '@/lib/autoPhase'
import { transitionFallStatus } from '@/lib/faelle/state-machine'

export async function setAnschlussschreibenDatum(
  fallId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('faelle')
    .update({ vs_eskalationsstufe: 'vs-01' })
    .eq('id', fallId)

  if (error) return { success: false, error: error.message }

  // KFZ-202: Status via State-Machine (setzt anschlussschreiben_am + Timeline)
  await transitionFallStatus(fallId, 'anschlussschreiben', { user_id: user.id })

  sendFallCommunication(fallId, 'as_gesendet').catch(() => {})
  autoCompleteTask(fallId, 'as_sendedatum_gesetzt').catch(() => {})

  const { data: fallForAs } = await supabase.from('faelle').select('sv_id, claims:claim_id(claim_nummer)').eq('id', fallId).single()
  const fallForAsClaim = fallForAs ? (Array.isArray(fallForAs.claims) ? fallForAs.claims[0] : fallForAs.claims) : null
  if (fallForAs?.sv_id) {
    createGutachterMitteilung(fallForAs.sv_id, 'kanzlei_as_gesendet', fallId, {
      claim_nummer: fallForAsClaim?.claim_nummer ?? undefined,
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

  // CMM-44 SP-A2 (Cluster 3): regulierung_betrag → claims.regulierungs_betrag
  // (SSoT). Legacy-Fall ohne claim_id sauber abfangen statt zu werfen.
  const { data: fallForBetrag } = await supabase
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .maybeSingle()
  const betragClaimId = (fallForBetrag?.claim_id as string | null) ?? null
  if (!betragClaimId) {
    return { success: false, error: 'Kein Claim mit dem Fall verknüpft' }
  }
  const { error } = await createAdminClient()
    .from('claims')
    .update({ regulierungs_betrag: betrag })
    .eq('id', betragClaimId)

  if (error) return { success: false, error: error.message }

  // KFZ-202: State-Machine (setzt zahlung_eingegangen_am + Timeline)
  await transitionFallStatus(fallId, 'zahlung-eingegangen', { betrag, user_id: user.id })

  sendFallCommunication(fallId, 'zahlung_eingegangen').catch(() => {})

  // CMM-44 SP-A: kundenbetreuer_id ist claims-Duplikat-Spalte (claims = SSoT)
  // -> via claim_id aus claims nested embed laden statt aus faelle.
  const { data: fallForArchive } = await supabase
    .from('faelle')
    .select('sv_id, claims:claim_id(kundenbetreuer_id, claim_nummer)')
    .eq('id', fallId)
    .single()
  const fallForArchiveClaim = Array.isArray(fallForArchive?.claims) ? fallForArchive.claims[0] : fallForArchive?.claims
  triggerArchivierungTask(fallId, (fallForArchiveClaim?.kundenbetreuer_id as string | null) ?? null).catch(() => {})

  if (fallForArchive?.sv_id) {
    createGutachterMitteilung(fallForArchive.sv_id, 'kanzlei_zahlung', fallId, {
      betrag,
      claim_nummer: (fallForArchiveClaim?.claim_nummer as string | null) ?? undefined,
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

  // CMM-48 PR-D: kanzlei_ansprechpartner_name/email/telefon sind Duplikat-
  // Spalten → claims (Single Source of Truth). position bleibt faelle-only.
  // Sync-Trigger spiegelt zurück. Legacy-Fall ohne claim_id: alles auf faelle.
  const { data: fall } = await supabase
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .maybeSingle()
  const claimId = (fall?.claim_id as string | null) ?? null
  const { faelleUpdate, claimsUpdate } = splitOrKeepFaelleUpdate(
    {
      kanzlei_ansprechpartner_name: data.name || null,
      kanzlei_ansprechpartner_email: data.email || null,
      kanzlei_ansprechpartner_telefon: data.telefon || null,
      kanzlei_ansprechpartner_position: data.position || null,
    },
    claimId,
  )

  if (Object.keys(faelleUpdate).length > 0) {
    const { error } = await supabase.from('faelle').update(faelleUpdate).eq('id', fallId)
    if (error) return { success: false, error: error.message }
  }

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

  const { data: zahlung, error: zErr } = await supabase.from('zahlungseingaenge').insert({
    fall_id: fallId,
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
      fall_id: fallId,
      position: pos.position,
      gefordert: pos.gefordert,
      gezahlt: pos.gezahlt,
      notiz: pos.notiz || null,
    })
  }

  // CMM-44 SP-A2 (Cluster 3): regulierung_betrag → claims.regulierungs_betrag
  // (SSoT). regulierung_am bleibt faelle-only.
  // CMM-44 SP-J Bucket A: zahlung_eingegangen_am liegt jetzt auf claim_payments
  // (Reroute unten). Der Betrag selbst bleibt in zahlungseingaenge (oben) — auf
  // claim_payments wird nur der migrierte Eingangs-Zeitpunkt + status gesetzt.
  const zahlungAm = new Date().toISOString()
  await supabase.from('faelle').update({
    regulierung_am: zahlungAm,
  }).eq('id', fallId)

  const { data: fallForZE } = await supabase
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .maybeSingle()
  const zeClaimId = (fallForZE?.claim_id as string | null) ?? null
  if (zeClaimId) {
    const adminZE = createAdminClient()
    await adminZE
      .from('claims')
      .update({ regulierungs_betrag: data.gesamtbetrag })
      .eq('id', zeClaimId)
    await upsertCurrentClaimPayment(
      adminZE,
      zeClaimId,
      { zahlungseingang_am: zahlungAm, status: 'erhalten' },
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

  sendFallCommunication(fallId, 'zahlung_eingegangen').catch(() => {})
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
