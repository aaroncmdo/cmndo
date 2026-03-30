'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { emailGutachtenEingegangen } from '@/lib/email'
import { sendStatusWhatsApp } from '@/lib/whatsapp'
import { berechneLeadpreis } from '@/lib/leadpreis'

export async function uploadGutachten(fallId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const file = formData.get('datei') as File
  const betrag = parseFloat(formData.get('betrag') as string)

  if (!file || file.size === 0) throw new Error('Bitte eine PDF-Datei auswaehlen')
  if (isNaN(betrag) || betrag <= 0) throw new Error('Bitte einen gueltigen Betrag eingeben')
  if (file.type !== 'application/pdf') throw new Error('Nur PDF-Dateien sind erlaubt')

  // Verify the case belongs to this gutachter
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!sv) throw new Error('Kein Sachverstaendigen-Profil gefunden')

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

  // Update case status and gutachten data
  const { error: updateError } = await supabase
    .from('faelle')
    .update({
      status: 'gutachten-eingegangen',
      gutachten_eingegangen_am: new Date().toISOString(),
      gutachten_betrag: betrag,
    })
    .eq('id', fallId)

  if (updateError) throw new Error(`Status-Update fehlgeschlagen: ${updateError.message}`)

  // Timeline entry
  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'gutachten-eingegangen',
    titel: 'Gutachten eingereicht',
    beschreibung: `Gutachten mit Schadenshoehe ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(betrag)} hochgeladen.`,
    erstellt_von: user.id,
  })

  // ── Automatische Abrechnung ──────────────────────────────────────────────
  const { data: svData } = await supabase
    .from('sachverstaendige')
    .select('id, guthaben, paket_faelle_genutzt, paket_faelle_gesamt')
    .eq('id', sv.id)
    .single()

  if (svData) {
    const hatPaket = (svData.paket_faelle_genutzt ?? 0) < (svData.paket_faelle_gesamt ?? 0)
    const leadpreis = berechneLeadpreis(betrag, hatPaket)
    const guthabenVorher = Number(svData.guthaben ?? 0)
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
  sendStatusWhatsApp(fallId, 'nach_gutachten').catch(() => {})

  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath('/gutachter/faelle')
  revalidatePath('/gutachter')
  revalidatePath('/gutachter/abrechnung')
}

export async function uploadDokument(fallId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const file = formData.get('file') as File
  const pflichtdokumentId = formData.get('pflichtdokument_id') as string | null
  if (!file || file.size === 0) throw new Error('Keine Datei ausgewaehlt')

  // Verify the case belongs to this gutachter
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!sv) throw new Error('Kein Sachverstaendigen-Profil gefunden')

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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  // Verify this gutachter owns the case
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!sv) throw new Error('Kein Sachverstaendigen-Profil gefunden')

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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const file = formData.get('file') as File
  const kategorie = formData.get('kategorie') as string
  if (!file || file.size === 0) throw new Error('Keine Datei ausgewaehlt')
  if (!kategorie) throw new Error('Keine Kategorie angegeben')

  // Verify the case belongs to this gutachter
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!sv) throw new Error('Kein Sachverstaendigen-Profil gefunden')

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

export async function sendChatNachricht(fallId: string, nachricht: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const trimmed = nachricht.trim()
  if (!trimmed) throw new Error('Nachricht darf nicht leer sein')

  // Verify gutachter has SV profile
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!sv) throw new Error('Kein Sachverstaendigen-Profil gefunden')

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
