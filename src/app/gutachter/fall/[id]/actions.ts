'use server'

import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { revalidatePath } from 'next/cache'
import { emailGutachtenEingegangen } from '@/lib/email'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { berechneLeadpreis } from '@/lib/leadpreis'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { createNotification } from '@/lib/notifications'
import { emitEvent } from '@/lib/notifications/emit'
import { getStorageUrl } from '@/lib/storage/url'
import { setSvIdForFall } from '@/lib/faelle/sv-assignment'

type ActionResult = { success?: boolean; error?: string }

export async function uploadGutachten(
  fallId: string,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  const file = formData.get('datei') as File
  const betrag = parseFloat(formData.get('betrag') as string)

  if (!file || file.size === 0) return { error: 'Bitte eine PDF-Datei auswählen' }
  if (isNaN(betrag) || betrag <= 0) return { error: 'Bitte einen gültigen Betrag eingeben' }
  if (file.type !== 'application/pdf') return { error: 'Nur PDF-Dateien sind erlaubt' }

  // Verify the case belongs to this gutachter
  const sv = await getGutachterForUser(supabase, user.id, 'id')

  if (!sv) return { error: 'Kein Sachverständigen-Profil gefunden' }

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, sv_id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) return { error: 'Fall nicht gefunden' }

  // Upload PDF to storage
  const timestamp = Date.now()
  const filePath = `gutachten/${fallId}/${timestamp}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('fall-dokumente')
    .upload(filePath, file)

  if (uploadError) return { error: `Upload fehlgeschlagen: ${uploadError.message}` }

  const pdfUrl = await getStorageUrl(supabase, 'fall-dokumente', filePath)
  if (!pdfUrl) return { error: 'URL-Generierung fehlgeschlagen' }

  // AAR-553: fall_dokumente statt dokumente
  const { data: insertedDoc, error: docError } = await supabase.from('fall_dokumente').insert({
    fall_id: fallId,
    dokument_typ: 'gutachten',
    storage_path: filePath,
    original_filename: file.name,
    groesse_bytes: file.size,
    mime_type: file.type || null,
    kategorie: 'gutachten',
    quelle: 'gutachter',
    hochgeladen_von_user_id: user.id,
    uploaded_by_sv: true,
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  }).select('id').single()

  if (docError) return { error: `Dokument-Eintrag fehlgeschlagen: ${docError.message}` }

  // Update gutachten data (status via state-machine separat)
  await supabase
    .from('faelle')
    .update({
      gutachten_eingegangen_am: new Date().toISOString(),
      gutachten_betrag: betrag,
    })
    .eq('id', fallId)

  // KFZ-204: Status via State-Machine
  try {
    await transitionFallStatus(fallId, 'gutachten-eingegangen', { user_id: user.id })
  } catch { /* Transition evtl. nicht erlaubt wenn Status schon weiter */ }

  // SV-Name fuer Timeline + Task
  const { data: svProfile } = await supabase.from('profiles').select('vorname, nachname').eq('id', user.id).single()
  const svName = svProfile ? `${svProfile.vorname ?? ''} ${svProfile.nachname ?? ''}`.trim() : 'Gutachter'
  const betragFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(betrag)

  // Timeline: SV-Name + Betrag
  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'gutachten-eingegangen',
    titel: `Gutachten hochgeladen von ${svName}`,
    beschreibung: `Schadenshöhe: ${betragFmt}`,
    erstellt_von: user.id,
  })

  // AAR-229 W4: Mitteilung an Admin (Kundenbetreuer) bei Gutachten-Upload.
  // Kanzlei-Empfänger bewusst weggelassen: faelle.kanzlei_id referenziert
  // die kanzleien-Tabelle, nicht profiles — mitteilungen.empfaenger_id
  // hat aber FK auf profiles.id. Kanzlei-Benachrichtigung läuft via Email
  // separat (send-gutachten-an-kanzlei).
  try {
    const { createMitteilung } = await import('@/lib/mitteilungen/create-mitteilung')
    // CMM-44 SP-A: kundenbetreuer_id ist eine faelle<->claims-Duplikat-Spalte
    // → aus dem claims-Embed lesen (SSoT).
    const { data: fallForMitteilung } = await supabase
      .from('faelle')
      .select('claims:claim_id(kundenbetreuer_id)')
      .eq('id', fallId)
      .single()
    const claimForMitteilung = Array.isArray(fallForMitteilung?.claims)
      ? fallForMitteilung.claims[0]
      : fallForMitteilung?.claims
    if (claimForMitteilung?.kundenbetreuer_id) {
      await createMitteilung({
        empfaenger_id: claimForMitteilung.kundenbetreuer_id,
        empfaenger_rolle: 'admin',
        kategorie: 'update', titel: 'Gutachten fertiggestellt',
        inhalt: `${svName} — ${betragFmt}`,
        kontext_typ: 'fall', kontext_id: fallId,
      })
    }
  } catch { /* non-critical */ }

  // KFZ-204: QC-Task fuer KB "Filmcheck durchfuehren"
  // CMM-44 SP-A: kundenbetreuer_id aus claims-Embed (SSoT), fall_nummer
  // bleibt faelle-only.
  const { data: fallForTask } = await supabase
    .from('faelle')
    .select('fall_nummer, claims:claim_id(kundenbetreuer_id)')
    .eq('id', fallId)
    .single()
  const claimForTask = Array.isArray(fallForTask?.claims)
    ? fallForTask.claims[0]
    : fallForTask?.claims

  const fallNrForTask = fallForTask?.fall_nummer ?? fallId.slice(0, 8)

  await supabase.from('tasks').insert({
    fall_id: fallId,
    typ: 'filmcheck',
    titel: `Filmcheck durchführen für Fall ${fallNrForTask}`,
    beschreibung: `Gutachten von ${svName} hochgeladen (${betragFmt}). Bitte QC-Prüfung durchführen.`,
    status: 'offen',
    prioritaet: 'dringend',
    zugewiesen_an: claimForTask?.kundenbetreuer_id ?? null,
  })

  // KFZ-204: In-App Notification fuer KB (KEIN Email — R19)
  if (claimForTask?.kundenbetreuer_id) {
    createNotification(
      claimForTask.kundenbetreuer_id,
      'filmcheck',
      `Gutachten bereit: Fall ${fallNrForTask}`,
      `${svName} hat das Gutachten hochgeladen. Filmcheck erforderlich.`,
      `/faelle/${fallId}`,
    ).catch(() => {})
  }

  // ── Automatische Abrechnung ──────────────────────────────────────────────
  const { data: svData } = await supabase
    .from('sachverstaendige')
    .select('id, werbebudget_guthaben_netto, paket_faelle_genutzt, paket_faelle_gesamt')
    .eq('id', sv.id)
    .single()

  if (svData) {
    const hatPaket = (svData.paket_faelle_genutzt ?? 0) < (svData.paket_faelle_gesamt ?? 0)
    const leadpreis = berechneLeadpreis(betrag, hatPaket)
    const guthabenVorher = Number(svData.werbebudget_guthaben_netto ?? 0)
    const guthabenNachher = guthabenVorher - leadpreis
    const monat = new Date().toISOString().slice(0, 7) // YYYY-MM

    // Abrechnungseintrag erstellen
    await supabase.from('gutachter_abrechnungen').insert({
      sv_id: sv.id,
      fall_id: fallId,
      schadenhoehe: betrag,
      leadpreis,
      preistyp: hatPaket ? 'paket' : 'einzel',
      guthaben_vorher: guthabenVorher,
      guthaben_nachher: guthabenNachher,
      monat,
    })

    // AAR-239: Guthaben-Spalte heißt werbebudget_guthaben_netto (nicht
    // 'guthaben') — der SELECT oben liest korrekt, aber das UPDATE
    // schrieb auf die nicht-existierende 'guthaben'-Spalte → silent fail,
    // SV-Abrechnung zeigte immer Ursprungs-Guthaben.
    await supabase
      .from('sachverstaendige')
      .update({
        werbebudget_guthaben_netto: guthabenNachher,
        paket_faelle_genutzt: (svData.paket_faelle_genutzt ?? 0) + 1,
      })
      .eq('id', sv.id)
  }

  // OCR-Auslesung des Gutachten-PDFs triggern
  // AAR-240: Production-Fallback cmndo.vercel.app statt localhost — in
  // Serverless-Functions ohne NEXT_PUBLIC_APP_URL würde localhost einen
  // ECONNREFUSED geben.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cmndo.vercel.app'
  fetch(`${baseUrl}/api/ocr-gutachten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fall_id: fallId, pdf_url: pdfUrl }),
  }).catch(() => {})

  // E-Mail an Admin: Gutachten eingegangen
  const { data: fallInfo } = await supabase.from('faelle').select('fall_nummer').eq('id', fallId).single()
  const { data: admins } = await supabase.from('profiles').select('email').eq('rolle', 'admin')
  const fallNr = fallInfo?.fall_nummer ?? fallId.slice(0, 8)
  for (const admin of admins ?? []) {
    if (admin.email) emailGutachtenEingegangen(admin.email, fallNr).catch(() => {})
  }

  // WhatsApp: Gutachten erstellt, wird an Kanzlei uebergeben
  sendFallCommunication(fallId, 'gutachten_fertig').catch(() => {})

  // AAR-501 N6: gutachten.fertig + dokument.hochgeladen Events
  try {
    const gutachtenId = (insertedDoc?.id as string) ?? ''
    await Promise.allSettled([
      emitEvent(
        'gutachten.fertig',
        { fallId, gutachtenId, pdfUrl: pdfUrl },
        { fallId, triggeredBy: user.id },
      ),
      emitEvent(
        'dokument.hochgeladen',
        { fallId, dokumentId: gutachtenId, typ: 'gutachten', uploadedByUserId: user.id },
        { fallId, triggeredBy: user.id },
      ),
    ])
  } catch (err) {
    console.error('[AAR-501] emitEvent gutachten.fertig failed:', err)
  }

  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath('/gutachter/faelle')
  revalidatePath('/gutachter')
  revalidatePath('/gutachter/abrechnung')
  return { success: true }
}

export async function uploadDokument(
  fallId: string,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  const file = formData.get('file') as File
  const pflichtdokumentId = formData.get('pflichtdokument_id') as string | null
  if (!file || file.size === 0) return { error: 'Keine Datei ausgewählt' }

  // Verify the case belongs to this gutachter
  const sv = await getGutachterForUser(supabase, user.id, 'id')

  if (!sv) return { error: 'Kein Sachverständigen-Profil gefunden' }

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, sv_id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) return { error: 'Fall nicht gefunden' }

  // Upload file to storage (AAR-553: fall-dokumente-Bucket)
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `gutachter/${fallId}/${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('fall-dokumente')
    .upload(path, file)

  if (uploadErr) return { error: `Upload fehlgeschlagen: ${uploadErr.message}` }

  const dokUrl = await getStorageUrl(supabase, 'fall-dokumente', path)
  if (!dokUrl) return { error: 'URL-Generierung fehlgeschlagen' }

  // Determine document type from pflichtdokument if provided
  let dokumentTyp = 'gutachter-dokument'
  if (pflichtdokumentId) {
    const { data: pd } = await supabase
      .from('pflichtdokumente')
      .select('dokument_typ')
      .eq('id', pflichtdokumentId)
      .single()
    if (pd) dokumentTyp = pd.dokument_typ
  }

  // Determine kategorie and sichtbarkeit from typ
  const typToKat: Record<string, string> = {
    fahrzeugschein: 'kundendokument',
    schadensfotos: 'schadensfoto', schadensfoto: 'schadensfoto',
    polizeibericht: 'kundendokument',
    gewerbenachweis: 'kundendokument',
    gutachten: 'gutachten', 'gutachter-foto': 'gutachter-foto',
    'gf-vollmacht': 'unterschrift', 'halter-ausweis': 'kundendokument',
    // AAR-353
    reparaturrechnung_vorschaden: 'kundendokument',
    kaufvertrag: 'kundendokument',
    freigabe_bank: 'kundendokument',
  }
  const kat = typToKat[dokumentTyp] ?? 'sonstiges'
  const sichtbarMap: Record<string, string[]> = {
    kundendokument: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
    schadensfoto: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
    gutachten: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
    'gutachter-foto': ['admin', 'kundenbetreuer', 'sachverstaendiger'],
    unterschrift: ['admin', 'kundenbetreuer', 'kanzlei'],
    sonstiges: ['admin', 'kundenbetreuer'],
  }

  // AAR-553: fall_dokumente statt dokumente
  const { data: insertedUpload, error: insertErr } = await supabase.from('fall_dokumente').insert({
    fall_id: fallId,
    dokument_typ: dokumentTyp,
    storage_path: path,
    original_filename: file.name,
    groesse_bytes: file.size,
    mime_type: file.type || null,
    kategorie: kat,
    quelle: 'gutachter',
    hochgeladen_von_user_id: user.id,
    uploaded_by_sv: true,
    sichtbar_fuer: sichtbarMap[kat] ?? ['admin', 'kundenbetreuer'],
  }).select('id').single()

  if (insertErr) return { error: `Dokument-Eintrag fehlgeschlagen: ${insertErr.message}` }

  // AAR-501 N6: dokument.hochgeladen Event
  try {
    await emitEvent(
      'dokument.hochgeladen',
      {
        fallId,
        dokumentId: (insertedUpload?.id as string) ?? '',
        typ: dokumentTyp,
        uploadedByUserId: user.id,
      },
      { fallId, triggeredBy: user.id },
    )
  } catch (err) {
    console.error('[AAR-501] emitEvent dokument.hochgeladen failed:', err)
  }

  // Update pflichtdokumente entry if this was for a specific required doc
  if (pflichtdokumentId) {
    await supabase
      .from('pflichtdokumente')
      .update({
        status: 'hochgeladen',
        quelle: 'gutachter',
        dokument_url: dokUrl,
        hochgeladen_am: new Date().toISOString(),
      })
      .eq('id', pflichtdokumentId)
  }

  // Timeline entry
  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'dokument-hochgeladen',
    titel: 'Dokument vom Gutachter hochgeladen',
    beschreibung: `Datei "${file.name}" wurde vom Gutachter vor Ort eingesammelt und hochgeladen.`,
    erstellt_von: user.id,
  })

  revalidatePath(`/gutachter/fall/${fallId}`)
  return { success: true }
}

export async function saveFinVinGutachter(
  fallId: string,
  finVin: string,
): Promise<ActionResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  // Verify this gutachter owns the case
  const sv = await getGutachterForUser(supabase, user.id, 'id')
  if (!sv) return { error: 'Kein Sachverständigen-Profil gefunden' }

  const { data: fall } = await supabase
    .from('faelle')
    .select('id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()
  if (!fall) return { error: 'Fall nicht gefunden' }

  const cleaned = finVin.trim().toUpperCase()
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) {
    return { error: 'Ungültige FIN. Muss 17 alphanumerische Zeichen lang sein.' }
  }

  await supabase
    .from('faelle')
    .update({
      fin_vin: cleaned,
      fin_quelle: 'gutachter_manuell',
      fin_extrahiert_am: new Date().toISOString(),
    })
    .eq('id', fallId)

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'FIN vom Gutachter eingegeben',
    beschreibung: `FIN/VIN: ${cleaned}`,
    erstellt_von: user.id,
  })

  // Trigger CarDentity
  // AAR-240: Production-Fallback cmndo.vercel.app statt localhost — in
  // Serverless-Functions ohne NEXT_PUBLIC_APP_URL würde localhost einen
  // ECONNREFUSED geben.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cmndo.vercel.app'
  fetch(`${baseUrl}/api/cardentity/typ-a`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fall_id: fallId, fin_vin: cleaned }),
  }).catch(() => {})

  revalidatePath(`/gutachter/fall/${fallId}`)
  return { success: true }
}

export async function uploadDatei(
  fallId: string,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  const file = formData.get('file') as File
  const kategorie = formData.get('kategorie') as string
  if (!file || file.size === 0) return { error: 'Keine Datei ausgewählt' }
  if (!kategorie) return { error: 'Keine Kategorie angegeben' }

  // Verify the case belongs to this gutachter
  const sv = await getGutachterForUser(supabase, user.id, 'id')

  if (!sv) return { error: 'Kein Sachverständigen-Profil gefunden' }

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, sv_id, claim_id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) return { error: 'Fall nicht gefunden' }
  // AAR-862: claim-zentrierter Pfad
  const claimId = fall.claim_id as string

  // Upload file to storage (AAR-553/AAR-862: claims/{claim_id}/<segment>/...)
  const ext = file.name.split('.').pop() ?? 'bin'
  const segment = kategorie === 'gutachten' ? 'gutachten' : 'sv'
  const path = `claims/${claimId}/${segment}/${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('fall-dokumente')
    .upload(path, file)

  if (uploadErr) return { error: `Upload fehlgeschlagen: ${uploadErr.message}` }

  // CMM-23 Aaron-Spec: ein Doku-Pool für alle Akten-Beteiligten. SV-Uploads
  // sind standardmäßig auch für den Kunden sichtbar — er soll an gleicher
  // Stelle konsumieren wo der SV hochlädt. Internal-only-Kategorien gibt es
  // beim SV ohnehin nicht; Filmcheck-Notizen / KI-Kalkulation kommen über
  // andere Server-Actions.
  const sichtbarMap: Record<string, string[]> = {
    'gutachter-foto': ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
    'gutachten': ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
    'sonstiges': ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  }
  const sichtbar_fuer = sichtbarMap[kategorie] ?? ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei']

  // AAR-553: fall_dokumente statt dokumente
  const { error: insertErr } = await supabase.from('fall_dokumente').insert({
    fall_id: fallId,
    dokument_typ: kategorie,
    storage_path: path,
    original_filename: file.name,
    groesse_bytes: file.size,
    mime_type: file.type || null,
    kategorie,
    quelle: 'gutachter',
    hochgeladen_von_user_id: user.id,
    uploaded_by_sv: true,
    sichtbar_fuer,
  })

  if (insertErr) return { error: `Dokument-Eintrag fehlgeschlagen: ${insertErr.message}` }

  // Timeline entry
  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'dokument-hochgeladen',
    titel: 'Datei vom Gutachter hochgeladen',
    beschreibung: `Datei "${file.name}" (${kategorie}) wurde vom Gutachter hochgeladen.`,
    erstellt_von: user.id,
  })

  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath('/gutachter/faelle')
  revalidatePath('/gutachter')
  return { success: true }
}

/**
 * KFZ-118: Gutachter lehnt Termin ab (via Portal-Button)
 */
export async function declineTermin(
  fallId: string,
  grund: string,
): Promise<ActionResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser(supabase, user.id, 'id')
  if (!sv) return { error: 'Kein Sachverständigen-Profil gefunden' }

  // Verify fall belongs to this gutachter
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, sv_id, fall_nummer')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()
  if (!fall) return { error: 'Fall nicht gefunden' }

  // 1. gutachter_termine → abgelehnt
  // KFZ-136: Termin-IDs vor dem Update holen fuer Reminder-Cancel
  const { data: activeTermine } = await supabase.from('gutachter_termine')
    .select('id').eq('fall_id', fallId).eq('sv_id', sv.id).in('status', ['reserviert', 'bestaetigt'])

  await supabase.from('gutachter_termine')
    .update({ status: 'abgelehnt', abgelehnt_am: new Date().toISOString(), abgelehnt_grund: grund || 'Im Portal abgelehnt' })
    .eq('fall_id', fallId)
    .eq('sv_id', sv.id)
    .in('status', ['reserviert', 'bestaetigt'])

  // KFZ-136: Reminder stornieren
  try {
    const { cancelRemindersForTermin } = await import('@/lib/reminders/generate')
    for (const t of activeTermine ?? []) { await cancelRemindersForTermin(t.id) }
  } catch (err) { console.error('[KFZ-136] Reminder-Cancel:', err) }

  // 2. Fall: sv_id freigeben — Termin-Status spiegelt die View aus gutachter_termine
  await supabase.from('faelle').update({
    updated_at: new Date().toISOString(),
  }).eq('id', fallId)
  // CMM-60 Schritt 3: sv_id-Freigabe auf der SSoT claims.sv_id.
  await setSvIdForFall(supabase, fallId, null)

  // 3. Timeline
  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'Gutachter hat Termin abgelehnt',
    beschreibung: `Grund: ${grund || 'Nicht angegeben'}. Neuer Gutachter wird gesucht.`,
    erstellt_von: user.id,
  })

  // 4. WhatsApp an Admin (non-critical)
  try {
    const { data: svProfile } = await supabase.from('profiles').select('vorname, nachname').eq('id', user.id).single()
    const svName = svProfile ? `${svProfile.vorname ?? ''} ${svProfile.nachname ?? ''}`.trim() : 'Gutachter'
    const { sendManualWhatsApp } = await import('@/lib/whatsapp')
    const { data: admins } = await supabase.from('profiles').select('telefon').eq('rolle', 'admin')
    for (const a of admins ?? []) {
      if (a.telefon) {
        await sendManualWhatsApp(a.telefon,
          `⚠️ Gutachter ${svName} hat den Termin für ${fall.fall_nummer ?? 'Fall'} ABGELEHNT. Grund: ${grund || '—'}. Bitte neuen Gutachter zuweisen.`,
          fallId,
        )
      }
    }
  } catch { /* */ }

  // 5. Task: Neuen Gutachter zuweisen (KFZ-151: verknuepft mit case)
  try {
    // CMM-44 SP-A: kundenbetreuer_id aus claims-Embed (SSoT).
    const { data: fallData } = await supabase
      .from('faelle')
      .select('claims:claim_id(kundenbetreuer_id)')
      .eq('id', fallId)
      .single()
    const claimData = Array.isArray(fallData?.claims) ? fallData.claims[0] : fallData?.claims
    const { createLinkedTask } = await import('@/lib/tasks/create-task')
    await createLinkedTask({
      fall_id: fallId,
      titel: `Neuen Gutachter zuweisen für ${fall.fall_nummer ?? 'Fall'}`,
      typ: 'dispatch',
      prioritaet: 'dringend',
      faellig_am: new Date(),
      zugewiesen_an: claimData?.kundenbetreuer_id ?? null,
      entity_type: 'case',
      entity_id: fallId,
    })
  } catch { /* */ }

  // 6. Kapazität zurückgeben — AAR-240: increment_field RPC existiert nicht
  // in der DB. Direktes SELECT + UPDATE mit -1 statt non-existing RPC.
  try {
    const { data: svForDecrement } = await supabase
      .from('sachverstaendige')
      .select('paket_faelle_genutzt')
      .eq('id', sv.id)
      .single()
    const currentValue = Number(svForDecrement?.paket_faelle_genutzt ?? 0)
    const newValue = Math.max(0, currentValue - 1)
    await supabase
      .from('sachverstaendige')
      .update({ paket_faelle_genutzt: newValue })
      .eq('id', sv.id)
  } catch (err) {
    console.error('[AAR-240] Kapazität-Decrement fehlgeschlagen:', err)
  }

  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath('/gutachter/faelle')
  revalidatePath('/gutachter/kalender')
  revalidatePath('/gutachter')
  return { success: true }
}

export async function sendChatNachricht(
  fallId: string,
  nachricht: string,
): Promise<ActionResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  const trimmed = nachricht.trim()
  if (!trimmed) return { error: 'Nachricht darf nicht leer sein' }

  // Verify gutachter has SV profile
  const sv = await getGutachterForUser(supabase, user.id, 'id')

  if (!sv) return { error: 'Kein Sachverständigen-Profil gefunden' }

  // Verify fall belongs to this gutachter
  const { data: fall } = await supabase
    .from('faelle')
    .select('id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) return { error: 'Fall nicht gefunden' }

  // Insert message
  const { error: insertErr } = await supabase.from('nachrichten').insert({
    fall_id: fallId,
    // AAR-102/AAR-310: Kanal-CHECK erlaubt nur die 5 neuen Werte
    kanal: 'chat_kunde_sv',
    sender_id: user.id,
    sender_rolle: 'sachverstaendiger',
    nachricht: trimmed,
    hat_anhang: false,
  })

  if (insertErr) return { error: `Nachricht konnte nicht gesendet werden: ${insertErr.message}` }

  revalidatePath(`/gutachter/fall/${fallId}`)
  return { success: true }
}

// ─── KFZ-181 Trigger 24: Termin stornieren ─────────────────────────────────

export async function storniereTermin(
  terminId: string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  const { data: termin } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, start_zeit, sv_id')
    .eq('id', terminId)
    .single()
  if (!termin) return { error: 'Termin nicht gefunden' }

  // Status auf storniert setzen
  await supabase
    .from('gutachter_termine')
    .update({ status: 'storniert' })
    .eq('id', terminId)

  // WhatsApp an Kunden
  const { sendCommunication } = await import('@/lib/communications/send')
  const { data: fall } = await supabase
    .from('faelle')
    .select('lead_id, fall_nummer')
    .eq('id', termin.fall_id)
    .single()
  if (fall?.lead_id) {
    const { data: lead } = await supabase.from('leads').select('vorname, telefon').eq('id', fall.lead_id).single()
    const { data: svProf } = await supabase.from('sachverstaendige').select('profile_id').eq('id', termin.sv_id).single()
    let svName = 'Gutachter'
    if (svProf?.profile_id) {
      const { data: p } = await supabase.from('profiles').select('vorname, nachname').eq('id', svProf.profile_id).single()
      if (p) svName = [p.vorname, p.nachname].filter(Boolean).join(' ')
    }
    const datum = new Date(termin.start_zeit).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    if (lead?.telefon) {
      await sendCommunication('termin_storniert', { telefon: lead.telefon, vorname: lead.vorname ?? 'Kunde', '1': lead.vorname ?? 'Kunde', '2': svName, '3': datum }).catch(() => {})
    }
  }

  // Timeline
  await supabase.from('timeline').insert({
    fall_id: termin.fall_id,
    typ: 'termin',
    titel: 'Termin storniert',
    beschreibung: `Termin am ${new Date(termin.start_zeit).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} wurde storniert.`,
  })

  revalidatePath(`/gutachter/fall/${termin.fall_id}`)
  return { success: true }
}

// ─── KFZ-181 Trigger 25: Verspätung melden ─────────────────────────────────

export async function meldeVerspaetung(
  terminId: string,
  minuten: number,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  const { data: termin } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, sv_id')
    .eq('id', terminId)
    .single()
  if (!termin) return { error: 'Termin nicht gefunden' }

  // Update verspaetung
  await supabase
    .from('gutachter_termine')
    .update({ verspaetung_minuten: minuten })
    .eq('id', terminId)

  // WhatsApp an Kunden
  const { sendCommunication } = await import('@/lib/communications/send')
  const { data: fall } = await supabase.from('faelle').select('lead_id').eq('id', termin.fall_id).single()
  if (fall?.lead_id) {
    const { data: lead } = await supabase.from('leads').select('vorname, telefon').eq('id', fall.lead_id).single()
    const { data: svProf } = await supabase.from('sachverstaendige').select('profile_id').eq('id', termin.sv_id).single()
    let svName = 'Gutachter'
    if (svProf?.profile_id) {
      const { data: p } = await supabase.from('profiles').select('vorname, nachname').eq('id', svProf.profile_id).single()
      if (p) svName = [p.vorname, p.nachname].filter(Boolean).join(' ')
    }
    if (lead?.telefon) {
      await sendCommunication('sv_verspaetet', { telefon: lead.telefon, vorname: lead.vorname ?? 'Kunde', '1': lead.vorname ?? 'Kunde', '2': svName, '3': String(minuten) }).catch(() => {})
    }
  }

  // Timeline
  await supabase.from('timeline').insert({
    fall_id: termin.fall_id,
    typ: 'termin',
    titel: `Verspätung gemeldet (${minuten} Min)`,
    beschreibung: `Gutachter verspätet sich um ca. ${minuten} Minuten. Kunde wurde via WhatsApp informiert.`,
  })

  revalidatePath(`/gutachter/fall/${termin.fall_id}`)
  return { success: true }
}
