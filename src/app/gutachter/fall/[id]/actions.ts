'use server'

import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { revalidatePath } from 'next/cache'
import { emailGutachtenEingegangen } from '@/lib/email'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { berechneLeadpreis } from '@/lib/leadpreis'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { createNotification } from '@/lib/notifications'

export async function uploadGutachten(fallId: string, formData: FormData) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const file = formData.get('datei') as File
  const betrag = parseFloat(formData.get('betrag') as string)

  if (!file || file.size === 0) throw new Error('Bitte eine PDF-Datei auswählen')
  if (isNaN(betrag) || betrag <= 0) throw new Error('Bitte einen gültigen Betrag eingeben')
  if (file.type !== 'application/pdf') throw new Error('Nur PDF-Dateien sind erlaubt')

  // Verify the case belongs to this gutachter
  const sv = await getGutachterForUser(supabase, user.id, 'id')

  if (!sv) throw new Error('Kein Sachverständigen-Profil gefunden')

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, sv_id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) throw new Error('Fall nicht gefunden')

  // Upload PDF to storage
  const timestamp = Date.now()
  const filePath = `gutachten/${fallId}/${timestamp}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('dokumente')
    .upload(filePath, file)

  if (uploadError) throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`)

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('dokumente')
    .getPublicUrl(filePath)

  // Create document record
  const { error: docError } = await supabase.from('dokumente').insert({
    fall_id: fallId,
    typ: 'gutachten',
    datei_url: urlData.publicUrl,
    datei_name: file.name,
    datei_groesse: file.size,
    kategorie: 'gutachten',
    quelle: 'gutachter',
    hochgeladen_von: user.id,
    hochgeladen_von_rolle: 'sachverstaendiger',
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  })

  if (docError) throw new Error(`Dokument-Eintrag fehlgeschlagen: ${docError.message}`)

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

  // KFZ-204: QC-Task fuer KB "Filmcheck durchfuehren"
  const { data: fallForTask } = await supabase
    .from('faelle')
    .select('fall_nummer, kundenbetreuer_id')
    .eq('id', fallId)
    .single()

  const fallNrForTask = fallForTask?.fall_nummer ?? fallId.slice(0, 8)

  await supabase.from('tasks').insert({
    fall_id: fallId,
    typ: 'filmcheck',
    titel: `Filmcheck durchführen für Fall ${fallNrForTask}`,
    beschreibung: `Gutachten von ${svName} hochgeladen (${betragFmt}). Bitte QC-Prüfung durchführen.`,
    status: 'offen',
    prioritaet: 'dringend',
    zugewiesen_an: fallForTask?.kundenbetreuer_id ?? null,
  })

  // KFZ-204: In-App Notification fuer KB (KEIN Email — R19)
  if (fallForTask?.kundenbetreuer_id) {
    createNotification(
      fallForTask.kundenbetreuer_id,
      'filmcheck',
      `Gutachten bereit: Fall ${fallNrForTask}`,
      `${svName} hat das Gutachten hochgeladen. Filmcheck erforderlich.`,
      `/admin/faelle/${fallId}`,
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

    // Guthaben und Faelle-Zaehler aktualisieren
    await supabase
      .from('sachverstaendige')
      .update({
        guthaben: guthabenNachher,
        paket_faelle_genutzt: (svData.paket_faelle_genutzt ?? 0) + 1,
      })
      .eq('id', sv.id)
  }

  // OCR-Auslesung des Gutachten-PDFs triggern
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  fetch(`${baseUrl}/api/ocr-gutachten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fall_id: fallId, pdf_url: urlData.publicUrl }),
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

  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath('/gutachter/faelle')
  revalidatePath('/gutachter')
  revalidatePath('/gutachter/abrechnung')
}

export async function uploadDokument(fallId: string, formData: FormData) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const file = formData.get('file') as File
  const pflichtdokumentId = formData.get('pflichtdokument_id') as string | null
  if (!file || file.size === 0) throw new Error('Keine Datei ausgewählt')

  // Verify the case belongs to this gutachter
  const sv = await getGutachterForUser(supabase, user.id, 'id')

  if (!sv) throw new Error('Kein Sachverständigen-Profil gefunden')

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, sv_id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) throw new Error('Fall nicht gefunden')

  // Upload file to storage
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `gutachter/${fallId}/${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('dokumente')
    .upload(path, file)

  if (uploadErr) throw new Error(`Upload fehlgeschlagen: ${uploadErr.message}`)

  const { data: urlData } = supabase.storage.from('dokumente').getPublicUrl(path)

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
    fahrzeugschein: 'kundendokument', fuehrerschein: 'kundendokument',
    schadensfotos: 'schadensfoto', schadensfoto: 'schadensfoto',
    polizeibericht: 'kundendokument', leasingvertrag: 'kundendokument',
    finanzierungsvertrag: 'kundendokument', gewerbenachweis: 'kundendokument',
    gutachten: 'gutachten', 'gutachter-foto': 'gutachter-foto',
    'gf-vollmacht': 'unterschrift', 'halter-ausweis': 'kundendokument',
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

  // Create document record with quelle='gutachter'
  const { error: insertErr } = await supabase.from('dokumente').insert({
    fall_id: fallId,
    typ: dokumentTyp,
    datei_url: urlData.publicUrl,
    datei_name: file.name,
    datei_groesse: file.size,
    kategorie: kat,
    quelle: 'gutachter',
    hochgeladen_von: user.id,
    hochgeladen_von_rolle: 'sachverstaendiger',
    sichtbar_fuer: sichtbarMap[kat] ?? ['admin', 'kundenbetreuer'],
  })

  if (insertErr) throw new Error(`Dokument-Eintrag fehlgeschlagen: ${insertErr.message}`)

  // Update pflichtdokumente entry if this was for a specific required doc
  if (pflichtdokumentId) {
    await supabase
      .from('pflichtdokumente')
      .update({
        status: 'hochgeladen',
        quelle: 'gutachter',
        dokument_url: urlData.publicUrl,
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
}

export async function saveFinVinGutachter(fallId: string, finVin: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  // Verify this gutachter owns the case
  const sv = await getGutachterForUser(supabase, user.id, 'id')
  if (!sv) throw new Error('Kein Sachverständigen-Profil gefunden')

  const { data: fall } = await supabase
    .from('faelle')
    .select('id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()
  if (!fall) throw new Error('Fall nicht gefunden')

  const cleaned = finVin.trim().toUpperCase()
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) {
    throw new Error('Ungueltige FIN. Muss 17 alphanumerische Zeichen lang sein.')
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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  fetch(`${baseUrl}/api/cardentity/typ-a`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fall_id: fallId, fin_vin: cleaned }),
  }).catch(() => {})

  revalidatePath(`/gutachter/fall/${fallId}`)
}

export async function uploadDatei(fallId: string, formData: FormData) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const file = formData.get('file') as File
  const kategorie = formData.get('kategorie') as string
  if (!file || file.size === 0) throw new Error('Keine Datei ausgewählt')
  if (!kategorie) throw new Error('Keine Kategorie angegeben')

  // Verify the case belongs to this gutachter
  const sv = await getGutachterForUser(supabase, user.id, 'id')

  if (!sv) throw new Error('Kein Sachverständigen-Profil gefunden')

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, sv_id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) throw new Error('Fall nicht gefunden')

  // Upload file to storage
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `gutachter-dateien/${fallId}/${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('dokumente')
    .upload(path, file)

  if (uploadErr) throw new Error(`Upload fehlgeschlagen: ${uploadErr.message}`)

  const { data: urlData } = supabase.storage.from('dokumente').getPublicUrl(path)

  // Determine sichtbar_fuer based on kategorie
  const sichtbarMap: Record<string, string[]> = {
    'gutachter-foto': ['admin', 'kundenbetreuer', 'sachverstaendiger'],
    'gutachten': ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
    'sonstiges': ['admin', 'kundenbetreuer', 'sachverstaendiger'],
  }
  const sichtbar_fuer = sichtbarMap[kategorie] ?? ['admin', 'kundenbetreuer', 'sachverstaendiger']

  // Insert document record
  const { error: insertErr } = await supabase.from('dokumente').insert({
    fall_id: fallId,
    typ: kategorie,
    datei_url: urlData.publicUrl,
    datei_name: file.name,
    datei_groesse: file.size,
    kategorie,
    quelle: 'gutachter',
    hochgeladen_von: user.id,
    hochgeladen_von_rolle: 'sachverstaendiger',
    sichtbar_fuer,
  })

  if (insertErr) throw new Error(`Dokument-Eintrag fehlgeschlagen: ${insertErr.message}`)

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
}

/**
 * KFZ-118: Gutachter lehnt Termin ab (via Portal-Button)
 */
export async function declineTermin(fallId: string, grund: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const sv = await getGutachterForUser(supabase, user.id, 'id')
  if (!sv) throw new Error('Kein Sachverständigen-Profil gefunden')

  // Verify fall belongs to this gutachter
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, sv_id, fall_nummer')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()
  if (!fall) throw new Error('Fall nicht gefunden')

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

  // 2. Fall: sv_id NULL, gutachter_termin_status = abgelehnt
  await supabase.from('faelle').update({
    sv_id: null,
    gutachter_termin_status: 'abgelehnt',
    updated_at: new Date().toISOString(),
  }).eq('id', fallId)

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
    const { data: fallData } = await supabase.from('faelle').select('kundenbetreuer_id').eq('id', fallId).single()
    const { createLinkedTask } = await import('@/lib/tasks/create-task')
    await createLinkedTask({
      fall_id: fallId,
      titel: `Neuen Gutachter zuweisen für ${fall.fall_nummer ?? 'Fall'}`,
      typ: 'dispatch',
      prioritaet: 'dringend',
      faellig_am: new Date(),
      zugewiesen_an: fallData?.kundenbetreuer_id ?? null,
      entity_type: 'case',
      entity_id: fallId,
    })
  } catch { /* */ }

  // 6. Kapazität zurückgeben
  try {
    await supabase.rpc('increment_field', { row_id: sv.id, table_name: 'sachverstaendige', field_name: 'paket_faelle_genutzt', amount: -1 })
  } catch {
    // RPC may not exist, ignore
  }

  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath('/gutachter/faelle')
  revalidatePath('/gutachter/kalender')
  revalidatePath('/gutachter')
}

export async function sendChatNachricht(fallId: string, nachricht: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const trimmed = nachricht.trim()
  if (!trimmed) throw new Error('Nachricht darf nicht leer sein')

  // Verify gutachter has SV profile
  const sv = await getGutachterForUser(supabase, user.id, 'id')

  if (!sv) throw new Error('Kein Sachverständigen-Profil gefunden')

  // Verify fall belongs to this gutachter
  const { data: fall } = await supabase
    .from('faelle')
    .select('id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) throw new Error('Fall nicht gefunden')

  // Insert message
  const { error: insertErr } = await supabase.from('nachrichten').insert({
    fall_id: fallId,
    kanal: 'portal-kunde-gutachter',
    sender_id: user.id,
    sender_rolle: 'sachverstaendiger',
    nachricht: trimmed,
    hat_anhang: false,
  })

  if (insertErr) throw new Error(`Nachricht konnte nicht gesendet werden: ${insertErr.message}`)

  revalidatePath(`/gutachter/fall/${fallId}`)
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
    const datum = new Date(termin.start_zeit).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    if (lead?.telefon) {
      await sendCommunication('termin_storniert', { telefon: lead.telefon, vorname: lead.vorname ?? 'Kunde', '1': lead.vorname ?? 'Kunde', '2': svName, '3': datum }).catch(() => {})
    }
  }

  // Timeline
  await supabase.from('timeline').insert({
    fall_id: termin.fall_id,
    typ: 'termin',
    titel: 'Termin storniert',
    beschreibung: `Termin am ${new Date(termin.start_zeit).toLocaleDateString('de-DE')} wurde storniert.`,
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
