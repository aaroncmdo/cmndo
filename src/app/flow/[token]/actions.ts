'use server'

import { emailNeuerFall } from '@/lib/email'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * AAR-90: FIN im Flow setzen + Cardentity-Anreicherung triggern.
 * Wird vom FlowWizard onBlur des FIN-Felds aufgerufen (UI-Wiring folgt bei
 * naechstem FlowWizard-Refactor). Idempotent.
 */
export async function enrichFlowLeadByFin(token: string, fin: string): Promise<{ success: boolean; updatedFields?: string[]; error?: string }> {
  const admin = createAdminClient()
  const cleaned = fin.trim().toUpperCase()
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) {
    return { success: false, error: 'FIN-Format ungueltig (17 alphanumerische Zeichen)' }
  }

  const { data: flow } = await admin.from('flow_links').select('lead_id').eq('token', token).single()
  if (!flow?.lead_id) return { success: false, error: 'Flow-Link ungueltig' }

  await admin.from('leads').update({ fin: cleaned }).eq('id', flow.lead_id)

  const { enrichLeadByFin } = await import('@/lib/cardentity/enrich-fahrzeug')
  const result = await enrichLeadByFin(flow.lead_id)
  if (!result.success) return { success: false, error: result.error }
  return { success: true, updatedFields: result.updatedFields }
}

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

        // AAR-125: Lead laden für conditional Polizeibericht
        const { data: leadForDocs } = await admin
          .from('faelle').select('lead_id, leads(polizei_vor_ort, polizeibericht_pflicht)').eq('id', fallId).single()
        const lRaw = (leadForDocs as { leads: unknown } | null)?.leads
        const leadDocs = (Array.isArray(lRaw) ? lRaw[0] : lRaw) as Record<string, unknown> | null
        await createDefaultPflichtdokumente(admin, fallId, leadDocs)

        // KFZ-129: Kunde als Chat-Teilnehmer hinzufuegen
        try {
          const { syncChatTeilnehmer } = await import('@/lib/chatGruppe')
          await syncChatTeilnehmer(fallId)
        } catch (e) { console.error('[KFZ-129] syncChatTeilnehmer:', e) }

        // AAR-127: Welcome-Mail mit Magic-Link + Zugangsdaten
        await sendWelcomeWithLogin(admin, fallId, email, password)

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

  // AAR-125: Lead laden für conditional Polizeibericht (auch im new-user-Pfad)
  const { data: leadForDocsNew } = await admin
    .from('faelle').select('lead_id, leads(polizei_vor_ort, polizeibericht_pflicht)').eq('id', fallId).single()
  const lRawNew = (leadForDocsNew as { leads: unknown } | null)?.leads
  const leadDocsNew = (Array.isArray(lRawNew) ? lRawNew[0] : lRawNew) as Record<string, unknown> | null
  await createDefaultPflichtdokumente(admin, fallId, leadDocsNew)

  // KFZ-129: Kunde als Chat-Teilnehmer hinzufuegen
  try {
    const { syncChatTeilnehmer } = await import('@/lib/chatGruppe')
    await syncChatTeilnehmer(fallId)
  } catch (e) { console.error('[KFZ-129] syncChatTeilnehmer:', e) }

  // AAR-127: Welcome-Mail mit Magic-Link + Zugangsdaten
  await sendWelcomeWithLogin(admin, fallId, email, password)

  return { password }
}

// AAR-127: Helper — generiert Magic-Link via Supabase Auth Admin API
// und schickt die Welcome-Mail mit Magic-Link + Zugangsdaten als Fallback.
// Magic-Link-Generierung ist non-fatal: bei Fehler geht die Mail trotzdem
// raus, nur ohne Button (Template rendert dann nur den Zugangsdaten-Block).
async function sendWelcomeWithLogin(
  adminDb: ReturnType<typeof createAdminClient>,
  fallId: string,
  email: string,
  password: string,
): Promise<void> {
  let magicLink: string | null = null
  try {
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'}/kunde/onboarding`
    const { data, error } = await adminDb.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    })
    if (error) {
      console.error('[AAR-127] Magic-Link-Generierung fehlgeschlagen:', error)
    } else {
      magicLink = data?.properties?.action_link ?? null
    }
  } catch (err) {
    console.error('[AAR-127] Magic-Link-Generierung fehlgeschlagen (Exception):', err)
  }

  try {
    const { sendKundeWelcome } = await import('@/lib/email/google/flows')
    await sendKundeWelcome(fallId, { magicLink, email, password })
  } catch (err) {
    console.error('[AAR-127] Welcome-Mail-Versand fehlgeschlagen:', err)
  }
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
      // KFZ-192: service_typ aus Lead kopieren
      service_typ: lead.service_typ ?? 'komplett',
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
      // KFZ-208: Mandantenfragebogen-Felder
      ist_fahrzeughalter: lead.ist_fahrzeughalter ?? true,
      finanzierung_leasing: lead.finanzierung_leasing ?? 'keine',
      vorsteuerabzugsberechtigt: lead.vorsteuerabzugsberechtigt ?? false,
      schadenhergang: lead.schadenhergang ?? null,
      halter_vorname: lead.halter_vorname ?? null,
      halter_nachname: lead.halter_nachname ?? null,
      halter_strasse: lead.halter_strasse ?? null,
      halter_plz: lead.halter_plz ?? null,
      halter_stadt: lead.halter_stadt ?? null,
      halter_telefon: lead.halter_telefon ?? null,
      halter_email: lead.halter_email ?? null,
      finanzierungsgeber_name: lead.finanzierungsgeber_name ?? null,
      finanzierungsgeber_adresse: lead.finanzierungsgeber_adresse ?? null,
      finanzierungsgeber_vertragsnr: lead.finanzierungsgeber_vertragsnr ?? null,
      // KFZ-202: Vorschaeden
      hat_vorschaeden: lead.hat_vorschaeden ?? false,
      vorschaeden_beschreibung: lead.vorschaeden_beschreibung ?? null,
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

  // 5. KFZ-192: Termin-State-Machine basierend auf service_typ
  if (lead.gutachter_termin) {
    const serviceTyp = lead.service_typ ?? 'komplett'

    if (serviceTyp === 'nur_gutachter') {
      // nur_gutachter: SA unterschrieben = sofort verbindlich bestätigt (keine Vollmacht nötig)
      const { data: upgradedTermine, error: upErr } = await admin.from('gutachter_termine')
        .update({ status: 'bestaetigt', fall_id: fall.id })
        .eq('lead_id', leadId)
        .eq('status', 'reserviert')
        .select('id')

      if (upErr) console.error('[KFZ-192] Termin-Upgrade (nur_gutachter):', upErr.message)

      // KFZ-192: bestaetigeTermin aufrufen (setzt final_verbindlich_ab + Timeline)
      try {
        const { bestaetigeTermin } = await import('@/lib/termine/bestaetigung')
        for (const t of upgradedTermine ?? []) { await bestaetigeTermin(t.id) }
      } catch (err) { console.error('[KFZ-192] bestaetigeTermin:', err) }

      // KFZ-136: Reminder generieren
      try {
        const { generateReminderForTermin } = await import('@/lib/reminders/generate')
        for (const t of upgradedTermine ?? []) { await generateReminderForTermin(t.id) }
      } catch (err) { console.error('[KFZ-136] Reminder-Gen:', err) }

      await admin.from('faelle')
        .update({ gutachter_termin_status: 'bestaetigt' })
        .eq('id', fall.id)
    } else {
      // komplett: SA unterschrieben → Termin bleibt 'reserviert', wartet auf Vollmacht
      await admin.from('gutachter_termine')
        .update({ fall_id: fall.id })
        .eq('lead_id', leadId)
        .eq('status', 'reserviert')

      // Fall: gutachter_termin_status bleibt reserviert
      await admin.from('faelle')
        .update({ gutachter_termin_status: 'reserviert' })
        .eq('id', fall.id)
    }
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

  // 9. WhatsApp an Kunde: Fall eröffnet (non-critical)
  try {
    const { sendFallCommunication } = await import('@/lib/communications/send-fall')
    await sendFallCommunication(fall.id, 'fall_eroeffnet')
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

          const { sendCommunication } = await import('@/lib/communications/send')
          await sendCommunication('sv_tagesroute', {
            telefon: svTelefon,
            vorname: svProfile?.vorname ?? '',
            '1': kundeName,
            '2': lead.kennzeichen || '—',
            '3': datum,
            '4': uhrzeit,
            '5': adresse,
            '6': terminLink,
          })

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

  // 12. AAR-127: Welcome-Mail wird jetzt aus createKundeAccount mit Magic-Link
  // + Zugangsdaten verschickt, nicht mehr hier. Der SA-Step und createKundeAccount
  // laufen back-to-back im FlowWizard — wenn der Kunde nach SA abbricht (kein
  // Account), bekommt er keine Welcome-Mail. Das ist gewollt: ohne Account kann
  // er sich eh nicht einloggen.

  // 13. AAR-85: SLA-Tracking starten (Prozessstart = SA unterschrieben)
  // Simultan-Trigger: alle Pipelines parallel via Promise.allSettled
  const slaPromises: Promise<unknown>[] = []
  try {
    const { startSla } = await import('@/lib/sla/tracker')
    if (!svIdFromTermin) slaPromises.push(startSla(fall.id, 'gutachter_zuweisung'))
    slaPromises.push(startSla(fall.id, 'termin_bestaetigung'))
    slaPromises.push(startSla(fall.id, 'besichtigung'))
  } catch (err) { console.error('[AAR-85] SLA-Start Fehler:', err) }

  // Dispatch-Matching (best SV finden) parallel — falls noch kein SV
  const fallLat = (lead.unfallort_lat ?? lead.kunde_lat) as number | null
  const fallLng = (lead.unfallort_lng ?? lead.kunde_lng) as number | null
  if (!svIdFromTermin && fallLat != null && fallLng != null) {
    slaPromises.push(
      (async () => {
        try {
          const { findBestSV } = await import('@/lib/dispatch/findBestSV')
          await findBestSV({
            fallLat: Number(fallLat),
            fallLng: Number(fallLng),
            terminDatum: (lead.gutachter_termin as string | undefined) ?? undefined,
          })
        } catch (err) { console.error('[AAR-85] Dispatch-Matching:', err) }
      })()
    )
  }

  // Alle Trigger parallel ausfuehren — Fehler einzelner Trigger blockieren nicht
  await Promise.allSettled(slaPromises)

  return { fallId: fall.id }

  } catch (err) {
    console.error('[signSAandCreateFall] FEHLER:', err)
    throw err instanceof Error ? err : new Error(String(err))
  }
}

/**
 * KFZ-192: Vollmacht unterschrieben → Termin bestätigen (nur für service_typ='komplett').
 * Wird aufgerufen nachdem Kunde Vollmacht unterschrieben hat.
 */
export async function confirmVollmacht(fallId: string): Promise<void> {
  const admin = createAdminClient()

  // Fall laden, um service_typ zu prüfen
  const { data: fall, error: fallErr } = await admin
    .from('faelle')
    .select('id, service_typ')
    .eq('id', fallId)
    .single()

  if (fallErr || !fall) throw new Error('Fall nicht gefunden')

  // Nur für 'komplett' — bei 'nur_gutachter' wurde Termin bereits bei SA bestätigt
  if ((fall.service_typ ?? 'komplett') !== 'komplett') return

  // Aktiven Termin finden (status='reserviert')
  const { data: termin, error: terminErr } = await admin
    .from('gutachter_termine')
    .select('id')
    .eq('fall_id', fallId)
    .eq('status', 'reserviert')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (terminErr) {
    console.error('[confirmVollmacht] Termin-Query:', terminErr.message)
    return
  }
  if (!termin) return // Kein Termin vorhanden

  // Termin bestätigen
  const { bestaetigeTermin } = await import('@/lib/termine/bestaetigung')
  await bestaetigeTermin(termin.id)

  // Fall: gutachter_termin_status → bestaetigt
  await admin.from('faelle')
    .update({ gutachter_termin_status: 'bestaetigt', vollmacht_unterschrieben: true, vollmacht_datum: new Date().toISOString() })
    .eq('id', fallId)

  // KFZ-136: Reminder generieren
  try {
    const { generateReminderForTermin } = await import('@/lib/reminders/generate')
    await generateReminderForTermin(termin.id)
  } catch (err) { console.error('[KFZ-136] Reminder-Gen nach Vollmacht:', err) }
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
  fallId: string,
  lead?: Record<string, unknown> | null,
) {
  // AAR-125: pflichtdokumente Schema hat NUR (id, fall_id, dokument_typ, status,
  // pflicht, quelle, dokument_url, hochgeladen_am, created_at). Die alten
  // titel/beschreibung-Inserts hätten geworfen — wurden nur deshalb nicht
  // bemerkt weil createPflichtdokumente (admin/dispatch) im SA-Flow zuerst läuft
  // und dann die Idempotenz-Prüfung hier den Insert verhindert hat.
  // Defaults sind hier deshalb minimaler Safety-Net (KundeAccount-Pfad ohne SA).
  const defaults: { dokument_typ: string; pflicht: boolean }[] = [
    { dokument_typ: 'fahrzeugschein', pflicht: true },
    { dokument_typ: 'fuehrerschein', pflicht: true },
    { dokument_typ: 'schadensfotos', pflicht: true },
  ]

  // AAR-125: Polizeibericht conditional wenn Polizei vor Ort war (siehe AAR-124)
  if (lead?.polizei_vor_ort === true || lead?.polizeibericht_pflicht === true) {
    defaults.push({ dokument_typ: 'polizeibericht', pflicht: true })
  }

  // Idempotenz: keine Defaults wenn schon was existiert (z.B. nach
  // createPflichtdokumente in signSAandCreateFall)
  const { data: existing } = await admin
    .from('pflichtdokumente')
    .select('id')
    .eq('fall_id', fallId)
    .limit(1)

  if (existing && existing.length > 0) return

  await admin.from('pflichtdokumente').insert(
    defaults.map((d) => ({
      fall_id: fallId,
      dokument_typ: d.dokument_typ,
      pflicht: d.pflicht,
      status: 'ausstehend',
      quelle: 'system',
    })),
  )
}
