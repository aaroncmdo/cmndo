'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { emailFilmcheckBestanden } from '@/lib/email'
import { sendStatusWhatsApp } from '@/lib/whatsapp'
import { triggerKanzleiPaketTask, triggerAsSendedatumTask, triggerArchivierungTask } from '@/lib/tasking'
import { createGutachterMitteilung } from '@/lib/mitteilungen'

export async function saveFilmcheck(fallId: string, notizen: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('faelle')
    .update({
      filmcheck_ok: true,
      filmcheck_am: new Date().toISOString(),
      filmcheck_notizen: notizen || null,
      status: 'kanzlei-uebergeben',
    })
    .eq('id', fallId)

  if (error) throw new Error(error.message)

  const { data: fallInfo } = await supabase.from('faelle').select('fall_nummer').eq('id', fallId).single()
  const fallNr = fallInfo?.fall_nummer ?? fallId.slice(0, 8)
  const { data: kanzleiUsers } = await supabase.from('profiles').select('email').eq('rolle', 'kanzlei')
  for (const k of kanzleiUsers ?? []) {
    if (k.email) emailFilmcheckBestanden(k.email, fallNr).catch(() => {})
  }

  await supabase.from('tasks').insert({
    fall_id: fallId,
    typ: 'kanzlei-anschlussschreiben',
    titel: 'Anschlussschreiben an Kanzlei senden',
    beschreibung: 'Automatisch erstellt nach abgeschlossenem Filmcheck.',
    status: 'offen',
  })

  // WhatsApp: Akte an Partnerkanzlei uebergeben
  sendStatusWhatsApp(fallId, 'nach_qc_freigabe').catch(() => {})

  // Gutachter-Mitteilung: QC bestanden
  const { data: fallForSv } = await supabase.from('faelle').select('sv_id, fall_nummer').eq('id', fallId).single()
  if (fallForSv?.sv_id) {
    createGutachterMitteilung(fallForSv.sv_id, 'qc_bestanden', fallId, {
      fall_nummer: fallForSv.fall_nummer ?? undefined,
    }).catch(() => {})
  }

  revalidatePath(`/admin/faelle/${fallId}`)
  revalidatePath('/admin/faelle')
  revalidatePath('/admin/tasks')
}

export async function addTimelineEntry(
  fallId: string,
  data: { typ: string; titel: string; beschreibung?: string; kanal?: string },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: data.typ,
    titel: data.titel,
    beschreibung: data.beschreibung || null,
    erstellt_von: user.id,
    metadata: data.kanal ? { kanal: data.kanal } : {},
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function uploadPflichtdokument(
  fallId: string,
  pflichtdokumentId: string,
  url: string,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('pflichtdokumente')
    .update({
      status: 'hochgeladen',
      dokument_url: url,
      hochgeladen_am: new Date().toISOString(),
    })
    .eq('id', pflichtdokumentId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function setAnschlussschreibenDatum(fallId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('faelle')
    .update({
      anschlussschreiben_am: now,
      vs_eskalationsstufe: 'vs-01',
      status: 'anschlussschreiben',
    })
    .eq('id', fallId)

  if (error) throw new Error(error.message)

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'status-change',
    titel: 'Anschlussschreiben gesendet',
    beschreibung: 'VS-Frist gestartet (14 Tage).',
    erstellt_von: user.id,
  })

  // WhatsApp: Anspruchsschreiben gesendet, 14 Tage Frist
  sendStatusWhatsApp(fallId, 'nach_anspruchsschreiben').catch(() => {})

  // Gutachter-Mitteilung: AS gesendet
  const { data: fallForAs } = await supabase.from('faelle').select('sv_id, fall_nummer').eq('id', fallId).single()
  if (fallForAs?.sv_id) {
    createGutachterMitteilung(fallForAs.sv_id, 'kanzlei_as_gesendet', fallId, {
      fall_nummer: fallForAs.fall_nummer ?? undefined,
    }).catch(() => {})
  }

  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function recordZahlung(fallId: string, betrag: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('faelle')
    .update({
      regulierung_betrag: betrag,
      regulierung_am: now,
      zahlung_eingegangen_am: now,
      status: 'regulierung',
    })
    .eq('id', fallId)

  if (error) throw new Error(error.message)

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'status-change',
    titel: 'Zahlungseingang',
    beschreibung: `Regulierungsbetrag: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(betrag)}`,
    erstellt_von: user.id,
  })

  // WhatsApp: Zahlung eingegangen
  sendStatusWhatsApp(fallId, 'nach_zahlung').catch(() => {})

  // Auto-Task: Fall archivieren nach Auszahlung
  const { data: fallForArchive } = await supabase.from('faelle').select('kundenbetreuer_id, sv_id, fall_nummer').eq('id', fallId).single()
  triggerArchivierungTask(fallId, fallForArchive?.kundenbetreuer_id ?? null).catch(() => {})

  // Gutachter-Mitteilung: Zahlung eingegangen
  if (fallForArchive?.sv_id) {
    createGutachterMitteilung(fallForArchive.sv_id, 'kanzlei_zahlung', fallId, {
      betrag,
      fall_nummer: fallForArchive.fall_nummer ?? undefined,
    }).catch(() => {})
  }

  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function updateSchadensAdresse(
  fallId: string,
  data: { adresse: string; plz: string; ort?: string },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('faelle')
    .update({
      schadens_adresse: data.adresse || null,
      schadens_plz: data.plz || null,
      schadens_ort: data.ort || null,
    })
    .eq('id', fallId)

  if (error) throw new Error(error.message)

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'Schadensadresse aktualisiert',
    beschreibung: [data.adresse, data.plz, data.ort].filter(Boolean).join(', '),
    erstellt_von: user.id,
  })

  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function saveFinVin(fallId: string, finVin: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  // Validate FIN format (17 alphanumeric, no I/O/Q)
  const cleaned = finVin.trim().toUpperCase()
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) {
    throw new Error('Ungueltige FIN. Muss 17 alphanumerische Zeichen lang sein.')
  }

  const { error } = await supabase
    .from('faelle')
    .update({
      fin_vin: cleaned,
      fin_quelle: 'manuell',
      fin_extrahiert_am: new Date().toISOString(),
    })
    .eq('id', fallId)

  if (error) throw new Error(error.message)

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'FIN manuell eingegeben',
    beschreibung: `FIN/VIN: ${cleaned}`,
    erstellt_von: user.id,
  })

  // Trigger CarDentity Typ-A check
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  fetch(`${baseUrl}/api/cardentity/typ-a`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fall_id: fallId, fin_vin: cleaned }),
  }).catch(() => {})

  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function sendChatNachricht(fallId: string, kanal: string, nachricht: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  const { error } = await supabase.from('nachrichten').insert({
    fall_id: fallId,
    kanal,
    sender_id: user.id,
    sender_rolle: profile?.rolle ?? 'admin',
    nachricht,
    hat_anhang: false,
  })

  if (error) throw new Error(error.message)

  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function eskalation(fallId: string, stufe: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  // Update vs_eskalationsstufe on the case
  const stufeKey = stufe.toLowerCase()
  await supabase
    .from('faelle')
    .update({ vs_eskalationsstufe: stufeKey })
    .eq('id', fallId)

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: `Eskalation ${stufe}`,
    beschreibung: `Eskalationsstufe ${stufe} manuell eingeleitet.`,
    erstellt_von: user.id,
  })

  revalidatePath(`/admin/faelle/${fallId}`)
}

// ─── QC Checkliste ───────────────────────────────────────────────────────────

export async function upsertQcCheckliste(
  fallId: string,
  checks: Record<string, boolean | null>,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { data: existing } = await supabase
    .from('qc_checkliste')
    .select('id')
    .eq('fall_id', fallId)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('qc_checkliste')
      .update(checks)
      .eq('fall_id', fallId)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('qc_checkliste')
      .insert({ fall_id: fallId, ...checks })
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function qcBestanden(fallId: string, kommentar: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date().toISOString()

  // Update QC checkliste
  const { data: existing } = await supabase
    .from('qc_checkliste')
    .select('id')
    .eq('fall_id', fallId)
    .single()

  const qcData = {
    status: 'bestanden',
    kommentar: kommentar || null,
    geprueft_von: user.id,
    geprueft_am: now,
  }

  if (existing) {
    await supabase.from('qc_checkliste').update(qcData).eq('fall_id', fallId)
  } else {
    await supabase.from('qc_checkliste').insert({ fall_id: fallId, ...qcData })
  }

  // Trigger existing filmcheck flow (status → kanzlei-uebergeben, email, task)
  await saveFilmcheck(fallId, kommentar)

  // Auto-Tasks: Kanzlei-Paket uebergeben + AS-Sendedatum eintragen
  const { data: fallForTask } = await supabase.from('faelle').select('kundenbetreuer_id').eq('id', fallId).single()
  triggerKanzleiPaketTask(fallId, fallForTask?.kundenbetreuer_id ?? null).catch(() => {})
  triggerAsSendedatumTask(fallId, fallForTask?.kundenbetreuer_id ?? null).catch(() => {})
}

export async function qcNachbesserung(fallId: string, kommentar: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date().toISOString()

  // Update QC checkliste
  const { data: existing } = await supabase
    .from('qc_checkliste')
    .select('id')
    .eq('fall_id', fallId)
    .single()

  const qcData = {
    status: 'nachbesserung',
    kommentar: kommentar || null,
    geprueft_von: user.id,
    geprueft_am: now,
  }

  if (existing) {
    await supabase.from('qc_checkliste').update(qcData).eq('fall_id', fallId)
  } else {
    await supabase.from('qc_checkliste').insert({ fall_id: fallId, ...qcData })
  }

  // Create task for Gutachter
  const { data: fallInfo } = await supabase
    .from('faelle')
    .select('fall_nummer, sv_id')
    .eq('id', fallId)
    .single()

  await supabase.from('tasks').insert({
    fall_id: fallId,
    typ: 'filmcheck',
    titel: 'QC Nachbesserung erforderlich',
    beschreibung: kommentar || 'Bitte Unterlagen nachbessern.',
    status: 'offen',
    zugewiesen_an: fallInfo?.sv_id ? fallInfo.sv_id : null,
  })

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'QC-Pruefung: Nachbesserung angefordert',
    beschreibung: kommentar || null,
    erstellt_von: user.id,
  })

  // Gutachter-Mitteilung: Nachbesserung erforderlich
  if (fallInfo?.sv_id) {
    createGutachterMitteilung(fallInfo.sv_id, 'qc_nachbesserung', fallId, {
      kommentar: kommentar || undefined,
      fall_nummer: fallInfo.fall_nummer ?? undefined,
    }).catch(() => {})
  }

  revalidatePath(`/admin/faelle/${fallId}`)
  revalidatePath('/admin/tasks')
}

const KATEGORIE_SICHTBARKEIT: Record<string, string[]> = {
  kundendokument: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
  schadensfoto: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
  gutachten: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  'gutachter-foto': ['admin', 'kundenbetreuer', 'sachverstaendiger'],
  kanzlei: ['admin', 'kundenbetreuer', 'kunde', 'kanzlei'],
  unterschrift: ['admin', 'kundenbetreuer', 'kanzlei'],
  sonstiges: ['admin', 'kundenbetreuer'],
  'whatsapp-foto': ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
}

export async function uploadDatei(fallId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const file = formData.get('file') as File | null
  if (!file || !(file instanceof File)) throw new Error('Keine Datei ausgewaehlt')

  const kategorie = (formData.get('kategorie') as string) || 'sonstiges'

  // Get user's rolle from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const hochgeladen_von_rolle = profile?.rolle ?? 'admin'

  // Determine sichtbar_fuer based on kategorie
  const sichtbar_fuer = KATEGORIE_SICHTBARKEIT[kategorie] ?? ['admin', 'kundenbetreuer']

  // Upload file to Supabase Storage
  const ext = file.name.split('.').pop() ?? 'bin'
  const timestamp = Date.now()
  const storagePath = `admin/${fallId}/${timestamp}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('dokumente')
    .upload(storagePath, file, { contentType: file.type })
  if (uploadErr) throw new Error(uploadErr.message)

  const { data: { publicUrl } } = supabase.storage.from('dokumente').getPublicUrl(storagePath)

  // Insert into dokumente table
  const { error: insertErr } = await supabase.from('dokumente').insert({
    fall_id: fallId,
    typ: kategorie,
    datei_url: publicUrl,
    datei_name: file.name,
    datei_groesse: file.size,
    kategorie,
    hochgeladen_von: user.id,
    hochgeladen_von_rolle,
    quelle: 'admin',
    sichtbar_fuer,
  })

  if (insertErr) throw new Error(insertErr.message)

  revalidatePath(`/admin/faelle/${fallId}`)
  revalidatePath('/admin/faelle')
}
