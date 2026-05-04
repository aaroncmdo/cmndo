'use server'

// AAR-539 (C2): Kanzlei-Paket-Reader Server-Action.
// Nimmt Paket-Typ + Feld-Werte + optional File entgegen,
// lädt die Datei in Supabase Storage hoch und ruft danach
// denselben C3-Webhook-Handler auf wie der echte LexDrive-Webhook.
// Side-Effects (SLA-Start, Mitteilungen, Status-Transition, Timeline)
// entstehen dadurch automatisch in process-event.ts — kein direktes
// UPDATE auf faelle aus dem UI.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
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
    .select('id, fall_nummer')
    .eq('id', fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

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
    const { data: urlData } = supabase.storage.from('fall-dokumente').getPublicUrl(path)
    // upload_url in den Payload-Shape der C3-Handler spiegeln
    values.upload_url = urlData.publicUrl

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
    fallNr: fall.fall_nummer ?? fallId.slice(0, 8),
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

export async function setAnschlussschreibenDatum(fallId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('faelle')
    .update({ vs_eskalationsstufe: 'vs-01' })
    .eq('id', fallId)

  if (error) throw new Error(error.message)

  // KFZ-202: Status via State-Machine (setzt anschlussschreiben_am + Timeline)
  await transitionFallStatus(fallId, 'anschlussschreiben', { user_id: user.id })

  sendFallCommunication(fallId, 'as_gesendet').catch(() => {})
  autoCompleteTask(fallId, 'as_sendedatum_gesetzt').catch(() => {})

  const { data: fallForAs } = await supabase.from('faelle').select('sv_id, fall_nummer').eq('id', fallId).single()
  if (fallForAs?.sv_id) {
    createGutachterMitteilung(fallForAs.sv_id, 'kanzlei_as_gesendet', fallId, {
      fall_nummer: fallForAs.fall_nummer ?? undefined,
    }).catch(() => {})
  }

  revalidatePath(`/faelle/${fallId}`)
}

export async function recordZahlung(fallId: string, betrag: number) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('faelle')
    .update({ regulierung_betrag: betrag })
    .eq('id', fallId)

  if (error) throw new Error(error.message)

  // KFZ-202: State-Machine (setzt zahlung_eingegangen_am + Timeline)
  await transitionFallStatus(fallId, 'zahlung-eingegangen', { betrag, user_id: user.id })

  sendFallCommunication(fallId, 'zahlung_eingegangen').catch(() => {})

  const { data: fallForArchive } = await supabase.from('faelle').select('kundenbetreuer_id, sv_id, fall_nummer').eq('id', fallId).single()
  triggerArchivierungTask(fallId, fallForArchive?.kundenbetreuer_id ?? null).catch(() => {})

  if (fallForArchive?.sv_id) {
    createGutachterMitteilung(fallForArchive.sv_id, 'kanzlei_zahlung', fallId, {
      betrag,
      fall_nummer: fallForArchive.fall_nummer ?? undefined,
    }).catch(() => {})
  }

  revalidatePath(`/faelle/${fallId}`)
}

export async function saveKanzleiAnsprechpartner(
  fallId: string,
  data: { name: string; email: string; telefon: string; position: string },
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('faelle')
    .update({
      kanzlei_ansprechpartner_name: data.name || null,
      kanzlei_ansprechpartner_email: data.email || null,
      kanzlei_ansprechpartner_telefon: data.telefon || null,
      kanzlei_ansprechpartner_position: data.position || null,
    })
    .eq('id', fallId)

  if (error) throw new Error(error.message)

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath(`/kunde/faelle/${fallId}`)
}

// KFZ-65: Zahlungseingang-Erfassung mit Positionen
export async function erfasseZahlungseingang(
  fallId: string,
  data: { zahlungsdatum: string; gesamtbetrag: number; referenz?: string; positionen: { position: string; gefordert: number; gezahlt: number; notiz?: string }[] },
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { data: zahlung, error: zErr } = await supabase.from('zahlungseingaenge').insert({
    fall_id: fallId,
    zahlungsdatum: data.zahlungsdatum,
    gesamtbetrag: data.gesamtbetrag,
    referenz: data.referenz || null,
    erfasst_von: user.id,
  }).select('id').single()

  if (zErr || !zahlung) throw new Error(zErr?.message ?? 'Zahlungseingang konnte nicht erstellt werden')

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

  await supabase.from('faelle').update({
    regulierung_betrag: data.gesamtbetrag,
    regulierung_am: new Date().toISOString(),
    zahlung_eingegangen_am: new Date().toISOString(),
  }).eq('id', fallId)

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
  return { kuerzung, gekuerztePositionen }
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
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

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

  if (error) throw new Error(error.message)

  revalidatePath(`/faelle/${fallId}`)
}
