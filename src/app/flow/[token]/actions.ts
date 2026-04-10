'use server'

import { emailNeuerFall } from '@/lib/email'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * KFZ-117: Kunde kann Stammdaten korrigieren (Step 1 FlowLink)
 */
export async function updateLeadStammdaten(
  leadId: string,
  data: { vorname?: string; nachname?: string; telefon?: string; email?: string; unfall_konstellation?: string; gegner_anzahl_beteiligte?: string; gegner_fahrzeugtyp?: string },
) {
  const admin = createAdminClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.vorname !== undefined) update.vorname = data.vorname
  if (data.nachname !== undefined) update.nachname = data.nachname
  if (data.telefon !== undefined) update.telefon = data.telefon
  if (data.email !== undefined) update.email = data.email
  // KFZ-153: Unfall + Gegner Daten
  if (data.unfall_konstellation !== undefined) update.unfall_konstellation = data.unfall_konstellation
  if (data.gegner_anzahl_beteiligte !== undefined) update.gegner_anzahl_beteiligte = parseInt(data.gegner_anzahl_beteiligte) || 1
  if (data.gegner_fahrzeugtyp !== undefined) update.gegner_fahrzeugtyp = data.gegner_fahrzeugtyp
  await admin.from('leads').update(update).eq('id', leadId)
}

/**
 * KFZ-117: SA-PDF generieren (Vertragstext + Kundendaten + Unterschrift + Datum)
 */
export async function generateSAPdf(
  fallId: string,
  leadId: string,
  signatureUrl: string,
): Promise<{ pdfUrl: string }> {
  const admin = createAdminClient()

  // Lead-Daten laden
  const { data: lead } = await admin.from('leads').select('vorname, nachname, email, telefon, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_standort_adresse').eq('id', leadId).single()
  const name = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : 'Kunde'
  const datum = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const fahrzeug = lead ? [lead.fahrzeug_hersteller, lead.fahrzeug_modell].filter(Boolean).join(' ') : ''

  // Einfaches SA-Text-Dokument als HTML → in Storage als .html speichern
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Sicherungsabtretung</title>
<style>body{font-family:serif;max-width:700px;margin:40px auto;padding:20px;font-size:14px;color:#222}
h1{font-size:20px;text-align:center;margin-bottom:30px}h2{font-size:15px;margin-top:20px}
.meta{border:1px solid #ccc;padding:12px;margin:20px 0;background:#f9f9f9}
.sig{margin-top:40px;border-top:1px solid #000;padding-top:10px}
.sig img{max-height:80px}</style></head>
<body>
<h1>Sicherungsabtretung und Unterschriftsvollmacht</h1>
<div class="meta">
<p><strong>Auftraggeber:</strong> ${name}</p>
<p><strong>E-Mail:</strong> ${lead?.email ?? '—'} | <strong>Telefon:</strong> ${lead?.telefon ?? '—'}</p>
<p><strong>Fahrzeug:</strong> ${fahrzeug} ${lead?.kennzeichen ? `(${lead.kennzeichen})` : ''}</p>
<p><strong>Datum:</strong> ${datum}</p>
</div>
<h2>1. Abtretungserklärung</h2>
<p>Hiermit trete ich sämtliche mir aus dem nachfolgend bezeichneten Schadensereignis zustehenden
Schadensersatzansprüche — insbesondere die Ansprüche auf Erstattung der Sachverständigenkosten —
erfüllungshalber an die Claimondo GmbH ab.</p>
<p>Die Abtretung umfasst: Sachschadenersatzansprüche, Gutachtervergütung, Nebenkosten,
vorgerichtliche Rechtsanwaltskosten.</p>
<h2>2. Kostenfreiheit</h2>
<p>Dem Auftraggeber entstehen keine Kosten. Die Sachverständigenkosten werden von der gegnerischen
Haftpflichtversicherung getragen.</p>
<h2>3. Vollmacht</h2>
<p>Der Auftraggeber bevollmächtigt die Claimondo GmbH, einen Kfz-Sachverständigen zu beauftragen,
Ansprüche gegenüber der Versicherung geltend zu machen, und Zahlungen entgegenzunehmen.</p>
<h2>4. Widerrufsbelehrung</h2>
<p>Widerrufsfrist: 14 Tage ab Vertragsschluss per Post oder E-Mail an Claimondo GmbH.</p>
<div class="sig">
<p><strong>Ort, Datum:</strong> ${datum}</p>
<p><strong>Unterschrift:</strong></p>
<img src="${signatureUrl}" alt="Unterschrift" />
</div>
</body></html>`

  // Als HTML in Storage speichern
  const path = `sa-dokumente/${fallId}/sicherungsabtretung_${Date.now()}.html`
  const blob = new Blob([html], { type: 'text/html' })
  await admin.storage.from('dokumente').upload(path, blob, { contentType: 'text/html' })
  const { data: { publicUrl } } = admin.storage.from('dokumente').getPublicUrl(path)

  // Fall updaten mit SA-PDF URL
  await admin.from('faelle').update({ abtretung_pdf: publicUrl }).eq('id', fallId)

  // Dokumente-Eintrag
  await admin.from('dokumente').insert({
    fall_id: fallId,
    typ: 'sicherungsabtretung',
    datei_url: publicUrl,
    datei_name: `Sicherungsabtretung_${name.replace(/\s/g, '_')}_${datum}.html`,
    kategorie: 'unterschrift',
    quelle: 'flowlink',
    hochgeladen_von_rolle: 'kunde',
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'kanzlei'],
  })

  return { pdfUrl: publicUrl }
}

export async function notifyNeuerFall(fallId: string) {
  const supabase = await createClient()

  const { data: fall } = await supabase
    .from('faelle')
    .select('fall_nummer, schadens_ursache')
    .eq('id', fallId)
    .single()

  if (!fall) return

  const fallNr = fall.fall_nummer ?? fallId.slice(0, 8)
  const schadensart = fall.schadens_ursache ?? 'Unbekannt'

  const { data: admins } = await supabase
    .from('profiles')
    .select('email')
    .eq('rolle', 'admin')

  for (const admin of admins ?? []) {
    if (admin.email) {
      await emailNeuerFall(admin.email, fallNr, schadensart).catch(() => {})
    }
  }
}

/**
 * Creates a Supabase Auth user for the customer after flow completion.
 * Sets kunde_id on the case and creates default pflichtdokumente.
 * Returns the generated password so the flow can display it.
 */
export async function createKundeAccount(
  fallId: string,
  email: string,
  vorname: string,
  nachname: string,
  telefon: string | null
): Promise<{ password: string }> {
  // BUG-70: Validierung vor signUp
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Bitte geben Sie eine gültige E-Mail-Adresse ein.')
  }
  if (!fallId) throw new Error('Fall-ID fehlt.')

  const admin = createAdminClient()

  // Generate a random password
  const password = generatePassword()

  // Create auth user
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { vorname, nachname },
  })

  if (authError) {
    // If user already exists, that's ok - just get the existing user
    if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
      const { data: existingUsers } = await admin.auth.admin.listUsers()
      const existing = existingUsers?.users?.find(u => u.email === email)
      if (existing) {
        // Update password for the existing user so the flow can show it
        await admin.auth.admin.updateUserById(existing.id, { password })

        // Ensure profile exists with rolle=kunde
        await admin.from('profiles').upsert({
          id: existing.id,
          rolle: 'kunde',
          vorname,
          nachname,
          email,
          telefon: telefon || null,
          force_password_change: true,
          auth_provider: 'email',
        }, { onConflict: 'id' })

        // Set kunde_id on the case
        await admin.from('faelle').update({ kunde_id: existing.id }).eq('id', fallId)

        // Create default pflichtdokumente
        await createDefaultPflichtdokumente(admin, fallId)

        // KFZ-129: Kunde als Chat-Teilnehmer hinzufuegen
        try {
          const { syncChatTeilnehmer } = await import('@/lib/chatGruppe')
          await syncChatTeilnehmer(fallId)
        } catch (e) { console.error('[KFZ-129] syncChatTeilnehmer:', e) }

        // BUG-71: Welcome-Mail geht jetzt nach SA-Unterzeichnung raus, nicht hier

        return { password }
      }
    }
    throw new Error(`Konto konnte nicht erstellt werden: ${authError.message}`)
  }

  const userId = authUser.user.id

  // Create profile
  await admin.from('profiles').upsert({
    id: userId,
    rolle: 'kunde',
    vorname,
    nachname,
    email,
    telefon: telefon || null,
    force_password_change: true,
    auth_provider: 'email',
  }, { onConflict: 'id' })

  // Set kunde_id on the case
  await admin.from('faelle').update({ kunde_id: userId }).eq('id', fallId)

  // Create default pflichtdokumente
  await createDefaultPflichtdokumente(admin, fallId)

  // KFZ-129: Kunde als Chat-Teilnehmer hinzufuegen
  try {
    const { syncChatTeilnehmer } = await import('@/lib/chatGruppe')
    await syncChatTeilnehmer(fallId)
  } catch (e) { console.error('[KFZ-129] syncChatTeilnehmer:', e) }

  // BUG-71: Welcome-Mail geht jetzt nach SA-Unterzeichnung raus, nicht hier

  return { password }
}

/**
 * KFZ-117: SA unterzeichnet → Fall wird SOFORT erstellt.
 * Auch OHNE Account — der Gutachter sieht den Fall sofort.
 */
export async function signSAandCreateFall(
  leadId: string,
  signatureUrl: string,
  flowLinkId: string | null,
): Promise<{ fallId: string }> {
  if (!leadId || !signatureUrl) throw new Error('Fehlende Daten für SA-Unterschrift')

  try {
  const admin = createAdminClient()

  // 1. Lead-Daten laden
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()
  if (leadErr || !lead) throw new Error('Lead nicht gefunden')

  // 2. Fallnummer generieren (CLM-YYYYMMDD-NNN)
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const { count } = await admin
    .from('faelle')
    .select('id', { count: 'exact', head: true })
    .like('fall_nummer', `CLM-${dateStr}-%`)
  const nr = String((count ?? 0) + 1).padStart(3, '0')
  const fallNummer = `CLM-${dateStr}-${nr}`

  // 3. Kundenbetreuer per Round-Robin zuweisen
  let kundenbetreuerId: string | null = null
  const { data: betreuer } = await admin
    .from('profiles')
    .select('id')
    .in('rolle', ['kundenbetreuer', 'admin'])
    .limit(10)
  if (betreuer && betreuer.length > 0) {
    const counts: Record<string, number> = {}
    for (const b of betreuer) {
      const { count: c } = await admin
        .from('faelle')
        .select('id', { count: 'exact', head: true })
        .eq('kundenbetreuer_id', b.id)
        .not('status', 'in', '("abgeschlossen","storniert")')
      counts[b.id] = c ?? 0
    }
    const min = betreuer.reduce((m, b) => (counts[b.id] ?? 0) < (counts[m.id] ?? 0) ? b : m, betreuer[0])
    kundenbetreuerId = min.id
  }

  // 4a. SV-Zuweisung aus gutachter_termine laden (falls Termin vor SA vereinbart wurde)
  let svIdFromTermin: string | null = null
  if (lead.gutachter_termin) {
    const { data: existingTermin } = await admin.from('gutachter_termine')
      .select('sv_id')
      .eq('lead_id', leadId)
      .in('status', ['reserviert', 'bestaetigt'])
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    svIdFromTermin = existingTermin?.sv_id ?? null
  }

  // 4b. Fall erstellen
  const { data: fall, error: fallErr } = await admin
    .from('faelle')
    .insert({
      fall_nummer: fallNummer,
      lead_id: leadId,
      status: svIdFromTermin ? 'sv-termin' : 'ersterfassung',
      sv_id: svIdFromTermin,
      sv_zugewiesen_am: svIdFromTermin ? new Date().toISOString() : null,
      gutachter_termin_status: lead.gutachter_termin ? 'reserviert' : null,
      schadenfall_typ: lead.schadenfall_typ,
      kunden_konstellation: lead.kunden_konstellation,
      // KFZ-154: Spezifikation + Schadenart fuer Dispatcher-Match
      spezifikation: lead.spezifikation ?? null,
      schadenart: lead.schadenart ?? null,
      // KFZ-153: Unfall + Gegner Detaildaten
      unfall_konstellation: lead.unfall_konstellation ?? null,
      gegner_anzahl_beteiligte: lead.gegner_anzahl_beteiligte ?? null,
      gegner_fahrzeugtyp: lead.gegner_fahrzeugtyp ?? null,
      kennzeichen: lead.kennzeichen,
      fahrzeug_hersteller: lead.fahrzeug_hersteller,
      fahrzeug_modell: lead.fahrzeug_modell,
      gegner_bekannt: lead.gegner_bekannt ?? true,
      personenschaden_flag: lead.personenschaden_flag ?? false,
      mietwagen_flag: lead.mietwagen_flag ?? false,
      leasing_flag: lead.leasing_flag ?? false,
      finanzierung_flag: lead.finanzierung_flag ?? false,
      gewerbe_flag: lead.gewerbe_flag ?? false,
      halter_ungleich_fahrer_flag: lead.halter_ungleich_fahrer_flag ?? false,
      polizei_bericht_vorhanden: lead.polizeibericht_pflicht ?? false,
      gegner_name: lead.gegner_name ?? null,
      gegner_versicherung: lead.gegner_versicherung ?? null,
      gegner_kennzeichen: lead.gegner_kennzeichen ?? null,
      polizei_aktenzeichen: lead.polizei_aktenzeichen ?? null,
      // BUG-58: Spalten die in faelle anders heissen oder nicht existieren — korrekt mappen
      versicherung_name: lead.eigene_versicherung ?? null,
      versicherung_schaden_nr: lead.eigene_policennr ?? null,
      leasinggeber_name: lead.leasing_geber ?? null,
      bank_name: lead.finanzierung_bank ?? null,
      ust_id: lead.firma_ustid ?? null,
      unfallhergang: lead.unfallhergang ?? null,
      // BUG-73: Bisher fehlende Lead-Felder mappen
      schadens_datum: lead.unfalldatum ?? null,
      schadens_adresse: lead.fahrzeug_standort_adresse ?? null,
      schadens_plz: lead.fahrzeug_standort_plz ?? null,
      schadens_ort: lead.unfallort ?? null,
      fahrzeug_farbe: lead.fahrzeug_farbe ?? null,
      erstzulassung: lead.erstzulassung ?? null,
      kilometerstand: lead.kilometerstand ? Number(lead.kilometerstand) : null,
      schadensursache: lead.schadensursache ?? null,
      firma_name: lead.firma_name ?? null,
      halter_name: lead.halter_name ?? null,
      polizei_vor_ort: lead.polizei_vor_ort ?? null,
      wunschtermin: lead.wunschtermin ?? null,
      source_channel: lead.source_channel ?? null,
      source_domain: lead.source_domain ?? null,
      fin_vin: lead.fin ?? null,
      kundenbetreuer_id: kundenbetreuerId,
      konvertiert_am: new Date().toISOString(),
      konvertiert_von_lead: leadId,
      sv_termin: lead.gutachter_termin,
      abtretung_pdf: signatureUrl,
      abtretung_signiert_am: new Date().toISOString(),
      sa_unterschrieben: true,
    })
    .select('id')
    .single()
  if (fallErr || !fall) throw new Error(`Fall-Erstellung fehlgeschlagen: ${fallErr?.message}`)

  // 5. Termin von 'reserviert' auf 'bestaetigt' upgraden (SA unterschrieben = bestätigt)
  if (lead.gutachter_termin) {
    // gutachter_termine: reserviert → bestaetigt
    const { data: upgradedTermine } = await admin.from('gutachter_termine')
      .update({ status: 'bestaetigt', fall_id: fall.id })
      .eq('lead_id', leadId)
      .eq('status', 'reserviert')
      .select('id')

    // KFZ-136: Reminder generieren fuer bestaetigen Termin
    try {
      const { generateReminderForTermin } = await import('@/lib/reminders/generate')
      for (const t of upgradedTermine ?? []) { await generateReminderForTermin(t.id) }
    } catch (err) { console.error('[KFZ-136] Reminder-Gen:', err) }

    // Fall: gutachter_termin_status → bestaetigt
    await admin.from('faelle')
      .update({ gutachter_termin_status: 'bestaetigt' })
      .eq('id', fall.id)
  }

  // 6. Lead-Status updaten
  await admin.from('leads').update({
    status: 'umgewandelt',
    qualifizierungs_phase: 'abgeschlossen',
    sa_unterschrieben: true,
    sa_datum: new Date().toISOString(),
    flow_link_abgeschlossen: true,
    konvertiert_zu_fall_id: fall.id,
    updated_at: new Date().toISOString(),
  }).eq('id', leadId)

  // 6b. KFZ-146: Alle Lead-Side-Channel-Daten an den neuen Fall zuordnen
  const { error: linkErr } = await admin.rpc('link_lead_data_to_fall', { p_lead_id: leadId, p_fall_id: fall.id })
  if (linkErr) console.error('[KFZ-146] link_lead_data_to_fall:', linkErr.message)

  // 6c. KFZ-146: Lead-Notiz als Timeline-Eintrag übertragen
  if (lead.notiz && String(lead.notiz).trim()) {
    await admin.from('timeline').insert({
      fall_id: fall.id,
      lead_id: leadId,
      typ: 'notiz',
      titel: 'Notiz aus Lead-Phase',
      beschreibung: String(lead.notiz).trim(),
    })
  }

  // 6d. KFZ-140: Pflichtdokumente erstellen (bisher nur im Dispatch-Pfad)
  try {
    const { createPflichtdokumente } = await import('@/app/admin/dispatch/actions')
    await createPflichtdokumente(admin, fall.id, lead)
  } catch (err) { console.error('[KFZ-140] Pflichtdokumente im FlowLink-Pfad:', err) }

  // 7. FlowLink updaten
  if (flowLinkId) {
    await admin.from('flow_links').update({
      abgeschlossen_am: new Date().toISOString(),
      status: 'abgeschlossen',
      fall_id: fall.id,
    }).eq('id', flowLinkId)
  }

  // 8. Timeline-Eintrag
  await admin.from('timeline').insert({
    fall_id: fall.id,
    lead_id: leadId,
    typ: 'system',
    titel: 'Kunde hat SA unterschrieben — Fall erstellt',
    beschreibung: `Fallnummer ${fallNummer}. SA digital unterschrieben via FlowLink.${lead.gutachter_termin ? ' Termin bestätigt.' : ''}`,
  })

  // 8b. KFZ-129: Chat-Gruppe erstellen + Teilnehmer synchronisieren + System-Nachricht
  try {
    const { syncChatTeilnehmer, sendSystemNachricht } = await import('@/lib/chatGruppe')
    await syncChatTeilnehmer(fall.id)
    await sendSystemNachricht(fall.id, `Fall ${fallNummer} wurde erstellt. Willkommen in Ihrem persönlichen Chat!`)
  } catch (e) { console.error('[KFZ-129] Chat-Gruppe Fehler:', e) }

  // 9. WhatsApp an Admin (non-critical)
  try {
    const { sendStatusWhatsApp } = await import('@/lib/whatsapp')
    await sendStatusWhatsApp(fall.id, 'nach_sa_unterschrift')
  } catch { /* */ }

  // 10. WhatsApp an Gutachter: Termin bestätigt + Ablehnen-Link (KFZ-118)
  if (lead.gutachter_termin) {
    try {
      // Gutachter-Daten laden
      const { data: terminRow } = await admin.from('gutachter_termine')
        .select('id, sv_id, ablehnen_token')
        .eq('fall_id', fall.id)
        .eq('status', 'bestaetigt')
        .limit(1)
        .maybeSingle()

      if (terminRow?.sv_id) {
        const { data: svData } = await admin.from('sachverstaendige')
          .select('profile_id, profiles(telefon, vorname, nachname)')
          .eq('id', terminRow.sv_id)
          .single()

        const svProfile = (Array.isArray(svData?.profiles) ? svData?.profiles[0] : svData?.profiles) as { telefon: string | null; vorname: string | null; nachname: string | null } | null
        const svTelefon = svProfile?.telefon

        if (svTelefon) {
          const terminDate = new Date(lead.gutachter_termin)
          const datum = terminDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
          const uhrzeit = terminDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
          const kundeName = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
          const adresse = lead.fahrzeug_standort_adresse || lead.fahrzeug_standort_plz || 'Adresse folgt'
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'
          const terminLink = terminRow.ablehnen_token
            ? `${baseUrl}/sv/termin/${terminRow.ablehnen_token}`
            : ''

          const { sendWhatsApp } = await import('@/lib/whatsapp')
          await sendWhatsApp(svTelefon,
            `✅ *Neuer Termin bestätigt!*\n\n` +
            `Kunde: ${kundeName}\n` +
            `Kennzeichen: ${lead.kennzeichen || '—'}\n` +
            `Besichtigung: ${datum} um ${uhrzeit}\n` +
            `Adresse: ${adresse}\n\n` +
            `Termin bestätigen, ablehnen oder verschieben:\n${terminLink}\n\n` +
            `Ansonsten steht der Termin. Viel Erfolg!`
          )

          // Mitteilung im Gutachter-Portal
          await admin.from('gutachter_mitteilungen').insert({
            sv_id: terminRow.sv_id,
            typ: 'termin_bestaetigt',
            titel: `Neuer Termin: ${datum} ${uhrzeit}`,
            nachricht: `Besichtigung bei ${kundeName} in ${adresse}. Kennzeichen: ${lead.kennzeichen || '—'}.`,
            dringend: true,
            link: `/gutachter/fall/${fall.id}`,
          })
        }
      }
    } catch { /* WhatsApp an SV ist non-critical */ }
  }

  // 11. Benachrichtigung
  try { await notifyNeuerFall(fall.id) } catch { /* */ }

  // 12. BUG-71: Welcome-Mail nach SA-Unterzeichnung (fire & forget, idempotent)
  import('@/lib/email/google/flows').then(m => m.sendKundeWelcome(fall.id)).catch(err => console.error('[BUG-71] Welcome-Mail nach SA:', err))

  return { fallId: fall.id }

  } catch (err) {
    console.error('[signSAandCreateFall] FEHLER:', err)
    throw err instanceof Error ? err : new Error(String(err))
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pw = ''
  for (let i = 0; i < 12; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)]
  }
  return pw
}

async function createDefaultPflichtdokumente(
  admin: ReturnType<typeof createAdminClient>,
  fallId: string
) {
  const defaults = [
    {
      titel: 'Personalausweis / Reisepass',
      beschreibung: 'Zur Identitätsprüfung benötigen wir eine Kopie Ihres Ausweises.',
      pflicht: true,
    },
    {
      titel: 'Mietvertrag / Eigentumsnachweis',
      beschreibung: 'Nachweis über Ihr Miet- oder Eigentumsverhältnis der betroffenen Immobilie.',
      pflicht: true,
    },
    {
      titel: 'Versicherungspolice',
      beschreibung: 'Ihre aktuelle Versicherungspolice zum betroffenen Objekt.',
      pflicht: true,
    },
    {
      titel: 'Schadenmeldung an Versicherung',
      beschreibung: 'Falls Sie den Schaden bereits bei Ihrer Versicherung gemeldet haben, laden Sie die Bestätigung hoch.',
      pflicht: false,
    },
    {
      titel: 'Kostenvoranschlaege / Rechnungen',
      beschreibung: 'Falls bereits Kostenvoranschläge oder Rechnungen für die Reparatur vorliegen.',
      pflicht: false,
    },
  ]

  // Check if pflichtdokumente already exist for this fall
  const { data: existing } = await admin
    .from('pflichtdokumente')
    .select('id')
    .eq('fall_id', fallId)
    .limit(1)

  if (existing && existing.length > 0) return

  await admin.from('pflichtdokumente').insert(
    defaults.map(d => ({
      fall_id: fallId,
      titel: d.titel,
      beschreibung: d.beschreibung,
      pflicht: d.pflicht,
      status: 'ausstehend',
    }))
  )
}
