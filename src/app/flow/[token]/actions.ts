'use server'

import { emailNeuerFall } from '@/lib/email'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildFallInsertFromLead, resolveFallEntityFks } from '@/lib/lead-fall-mapping'

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
          .from('faelle').select('lead_id, leads(polizei_vor_ort, polizeibericht_pflicht, polizeibericht_status, personenschaden_flag, hat_vorschaeden, zb1_status, service_typ, wa_gesendet, mietwagen_flag, nutzungsausfall)').eq('id', fallId).single()
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
    .from('faelle').select('lead_id, leads(polizei_vor_ort, polizeibericht_pflicht, polizeibericht_status, personenschaden_flag, hat_vorschaeden, zb1_status, service_typ, wa_gesendet, mietwagen_flag, nutzungsausfall)').eq('id', fallId).single()
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

  // 4aa. AAR-155: Entity-FKs auflösen (versicherung/kanzlei/organisation/
  // leadbearbeiter) — siehe resolveFallEntityFks JSDoc. Non-blocking:
  // Misses landen als NULL in faelle, kein Fehler.
  const entityFks = await resolveFallEntityFks(admin, lead, svIdFromTermin)

  // 4b. Fall erstellen
  // AAR-128: ~80-Zeilen Inline-Mapping ersetzt durch zentrale buildFallInsertFromLead.
  // Single Source of Truth für Lead→Fall-Field-Kopie liegt jetzt in
  // src/lib/lead-fall-mapping.ts — neue Felder dort hinzufügen, nicht hier.
  const fallInsert = buildFallInsertFromLead(lead, {
    fallNummer,
    kundenbetreuerId,
    svIdFromTermin,
    signatureUrl,
    ...entityFks,
  })
  const { data: fall, error: fallErr } = await admin
    .from('faelle')
    .insert(fallInsert)
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

  // AAR-229 W4: SA-Unterschrift Mitteilung an Admin + SV
  try {
    const { createMitteilungMulti } = await import('@/lib/mitteilungen/create-mitteilung')
    const empfaenger: Array<{ id: string; rolle: 'admin' | 'sachverstaendiger' }> = []
    if (lead.zugewiesen_an) empfaenger.push({ id: lead.zugewiesen_an as string, rolle: 'admin' })
    const { data: fallSv } = await admin.from('faelle').select('sv_id').eq('id', fall.id).single()
    if (fallSv?.sv_id) {
      const { data: svP } = await admin.from('sachverstaendige').select('profile_id').eq('id', fallSv.sv_id).single()
      if (svP?.profile_id) empfaenger.push({ id: svP.profile_id, rolle: 'sachverstaendiger' })
    }
    const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Kunde'
    if (empfaenger.length) {
      await createMitteilungMulti(empfaenger, {
        kategorie: 'update', titel: 'Schadensaufnahme unterschrieben',
        inhalt: `${name} hat die SA unterschrieben.`,
        kontext_typ: 'fall', kontext_id: fall.id,
      })
    }
  } catch { /* non-critical */ }

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

  // 6e. AAR-263 + AAR-182: Dispatch-Uploads (ZB1 + Polizeibericht) als
  // Dokumente am Fall verfügbar machen — sonst sieht die Kanzlei sie nicht.
  // Idempotent via datei_url-Check.
  try {
    const leadAny = lead as Record<string, unknown>
    const zb1Url = (leadAny.zb1_url as string | null) ?? null
    const polizeiberichtUrl = (leadAny.polizeibericht_url as string | null) ?? null

    const docInserts: Record<string, unknown>[] = []
    if (zb1Url) {
      docInserts.push({
        fall_id: fall.id,
        typ: 'fahrzeugschein',
        kategorie: 'zulassung',
        quelle: 'dispatch-wa-upload',
        datei_url: zb1Url,
        datei_name: `Fahrzeugschein_${(leadAny.nachname as string) ?? 'unbekannt'}.jpg`,
        hochgeladen_von_rolle: 'kunde',
        sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'kunde'],
        beschreibung: 'Fahrzeugschein-Foto via WhatsApp eingegangen (Dispatch-Phase 4)',
      })
    }
    if (polizeiberichtUrl) {
      const aktz = leadAny.polizei_aktenzeichen as string | null
      docInserts.push({
        fall_id: fall.id,
        typ: 'polizeiliche_unfallmitteilung',
        kategorie: 'polizeibericht',
        quelle: 'dispatch-wa-upload',
        datei_url: polizeiberichtUrl,
        datei_name: `Polizeibericht_${(leadAny.nachname as string) ?? 'unbekannt'}_${aktz ?? 'ohne-aktz'}.jpg`,
        hochgeladen_von_rolle: 'kunde',
        sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'kunde'],
        beschreibung: 'Polizeiliche Unfallmitteilung via WhatsApp eingegangen (Dispatch-Phase 4)',
      })
    }

    if (docInserts.length > 0) {
      // Duplikate vermeiden: bestehende dokumente.datei_url für diesen Fall laden
      const { data: existing } = await admin
        .from('dokumente')
        .select('datei_url')
        .eq('fall_id', fall.id)
      const existingUrls = new Set((existing ?? []).map((d) => d.datei_url as string))
      const fresh = docInserts.filter((d) => !existingUrls.has(d.datei_url as string))
      if (fresh.length > 0) {
        await admin.from('dokumente').insert(fresh)
      }
    }
  } catch (err) {
    console.error('[AAR-263] Dispatch-Uploads in dokumente:', err)
  }

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

  // 8a. AAR-306: Auto-Task „Bei Versicherung anrufen" für Kundenbetreuer
  // Idempotent — bei wiederholten Calls (sollte nicht passieren, aber safe)
  // wird kein zweiter Task angelegt.
  try {
    const { count: existingTaskCount } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('fall_id', fall.id)
      .eq('task_typ', 'versicherung-anrufen')
    if (!existingTaskCount || existingTaskCount === 0) {
      const leadAny = lead as Record<string, unknown>
      const kundenName = [leadAny.vorname, leadAny.nachname].filter(Boolean).join(' ') || '—'
      const telefon = (leadAny.telefon as string) ?? '—'
      const gegnerVS = (leadAny.gegner_versicherung as string) ?? '—'
      const schadensDatum = leadAny.unfalldatum ? String(leadAny.unfalldatum).slice(0, 10) : '—'
      await admin.from('tasks').insert({
        fall_id: fall.id,
        typ: 'system',
        task_typ: 'versicherung-anrufen',
        titel: 'Bei Versicherung anrufen und Schadennummer holen',
        beschreibung: [
          `Gegnerische Versicherung: ${gegnerVS}`,
          `Kunde: ${kundenName}, Tel: ${telefon}`,
          `Schadensdatum: ${schadensDatum}`,
        ].join('\n'),
        status: 'offen',
        empfaenger_rolle: 'kundenbetreuer',
        empfaenger_user_id: kundenbetreuerId,
        auto_erstellt: true,
        prioritaet: 'hoch',
        phase: 'fallakten-start',
      })
    }
  } catch (err) {
    console.error('[AAR-306] Auto-Task versicherung-anrufen fehlgeschlagen:', err)
  }

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

  // 10b. AAR-142 / W8 (Spec FEHLER 6) + AAR-193: T4 termin_bestaetigt an
  // Kunden nach SA. Die SA-Unterschrift fixiert den Termin — dem Kunden wird
  // das per T4 bestätigt. Gleichzeitig Termin-Status reserviert → bestaetigt.
  // Non-critical (fall bleibt auch bei Twilio-Fehler erstellt).
  if (lead.gutachter_termin && lead.telefon) {
    try {
      const { data: terminRow } = await admin.from('gutachter_termine')
        .select('id, sv_id, sachverstaendige(profiles(vorname, nachname))')
        .eq('fall_id', fall.id)
        .in('status', ['bestaetigt', 'reserviert'])
        .limit(1)
        .maybeSingle()

      // AAR-193: Termin-Status von reserviert auf bestaetigt heben — ein
      // reservierter Termin wird durch die SA verbindlich.
      if (terminRow?.id) {
        await admin.from('gutachter_termine')
          .update({ status: 'bestaetigt' })
          .eq('id', terminRow.id)
          .eq('status', 'reserviert')
      }

      const svRel = (terminRow as { sachverstaendige: unknown } | null)?.sachverstaendige
      const sv = (Array.isArray(svRel) ? svRel[0] : svRel) as { profiles: unknown } | null
      const profileRel = sv?.profiles
      const profile = (Array.isArray(profileRel) ? profileRel[0] : profileRel) as
        | { vorname: string | null; nachname: string | null }
        | null
      const svName = `${profile?.vorname ?? ''} ${profile?.nachname ?? ''}`.trim() || 'Ihrem Gutachter'
      const terminDate = new Date(lead.gutachter_termin)
      const datumUhrzeit = `${terminDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} um ${terminDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
      const { sendCommunication } = await import('@/lib/communications/send')
      // AAR-193: vorname-Key entfernt (Redundanz wie in AAR-175 P0-C — das
      // Template nutzt nur die nummerierten Placeholder, der vorname-Key
      // wurde stillschweigend ignoriert).
      await sendCommunication('termin_bestaetigt', {
        telefon: lead.telefon,
        '1': lead.vorname ?? '',
        '2': svName,
        '3': datumUhrzeit,
      })
    } catch (err) {
      console.warn('[AAR-142] T4 termin_bestaetigt an Kunde fehlgeschlagen:', err)
    }
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
  // AAR-228 Bug 3 + 4: Conditional-Matrix für Pflichtdokumente.
  // fuehrerschein + schadensfotos wurden entfernt:
  // - fuehrerschein: LexDrive fordert ihn selbst per WA-Bot an
  // - schadensfotos: SV macht Fotos vor Ort (kein Kunden-Upload nötig)
  const defaults: { dokument_typ: string; pflicht: boolean }[] = []

  // 1. Fahrzeugschein (ZB1) — Pflicht solange weder 'bestätigt' noch 'hochgeladen'.
  // AAR-263 Audit: Drift-Fix — admin/dispatch nutzt die strengere Variante,
  // flow akzeptierte vorher 'gesendet'/'geoeffnet' fälschlich als „erfasst".
  const zb1Status = lead?.zb1_status as string | null ?? null
  if (zb1Status !== 'bestaetigt' && zb1Status !== 'hochgeladen') {
    defaults.push({ dokument_typ: 'fahrzeugschein', pflicht: true })
  }

  // 2. AAR-263: Polizeibericht-Logik nach Dispatch-Status:
  // - status=hochgeladen → Doku ist schon da, kein Pflichtdokument-Eintrag nötig
  // - status=abgelehnt + polizeibericht_pflicht=true → Kunde muss nachreichen (PFLICHT)
  // - polizei_vor_ort=true ohne Status-Kontext → optionales Nachreichen
  const pbStatus = lead?.polizeibericht_status as string | null ?? null
  const polizeiVorOrt = lead?.polizei_vor_ort === true
  const pbPflicht = lead?.polizeibericht_pflicht === true
  if (pbStatus !== 'hochgeladen' && (polizeiVorOrt || pbPflicht)) {
    const istPflicht = pbStatus === 'abgelehnt' && pbPflicht
    defaults.push({ dokument_typ: 'polizeibericht', pflicht: istPflicht })
  }

  // 3. Personenschaden-Dokumente — ärztliches Attest als Pflicht für
  // Schmerzensgeld-Geltendmachung; Krankenhausbericht + AU optional
  if (lead?.personenschaden_flag === true) {
    defaults.push({ dokument_typ: 'aerztliches_attest', pflicht: true })
    defaults.push({ dokument_typ: 'krankenhausbericht', pflicht: false })
    defaults.push({ dokument_typ: 'au_bescheinigung', pflicht: false })
  }

  // 3b. AAR-299: Schadensfotos vom Kunden (optional, parallel zu SV-Fotos)
  defaults.push({ dokument_typ: 'schadensfotos', pflicht: false })

  // 3c. AAR-300: Mietwagenrechnung — optional Pflichtdoc bei mietwagen_flag
  if (lead?.mietwagen_flag === true || lead?.nutzungsausfall === true) {
    defaults.push({ dokument_typ: 'mietwagenrechnung', pflicht: false })
  }

  // 4. Vorschäden-Dokumentation für Regulierung
  if (lead?.hat_vorschaeden === true) {
    defaults.push({ dokument_typ: 'reparaturrechnungen_vorschaeden', pflicht: true })
  }

  // 4b. AAR-301: Führerschein-Fallback wenn Pfad A ohne WhatsApp-Versand.
  // LexDrive holt Führerschein normalerweise per WA-Bot — bei Email/SMS-
  // Versand greift der Bot nicht → Pflicht-Upload via Onboarding.
  const istKomplett = (lead?.service_typ ?? 'komplett') === 'komplett'
  const hatWhatsApp = lead?.wa_gesendet === true
  if (istKomplett && !hatWhatsApp) {
    defaults.push({ dokument_typ: 'fuehrerschein', pflicht: true })
  } else if (istKomplett) {
    defaults.push({ dokument_typ: 'fuehrerschein', pflicht: false })
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
