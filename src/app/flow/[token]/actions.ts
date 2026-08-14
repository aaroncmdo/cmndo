'use server'

import { emailNeuerFall } from '@/lib/email'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enablePhoneLogin } from '@/lib/auth/phone-login'
import { assertLeadBoundToToken } from '@/lib/flow/assert-lead-bound'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { findeTerminFuerLead } from '@/lib/termine/finde-termin-fuer-lead'
import { bezugOrExpr, bezugOrExprKonversion } from '@/lib/termine/bezug-filter'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
// Portal-i18n F-11: stille Sprach-Vorbelegung des neuen Kunden-Accounts.
import { normalizeToLocale } from '@/i18n/locale-source'
import { createPflichtdokumenteFromKatalog } from '@/lib/dokumente/create-pflicht'
import { generateInitialPassword } from '@/lib/auth/generate-initial-password'
import { emitEvent } from '@/lib/notifications/emit'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getStorageUrl } from '@/lib/storage/url'
import { trackServerConversion, buildSaSignedEvent } from '@/lib/analytics/ga4-conversions'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { notifyTeamWhatsApp } from '@/lib/whatsapp/team-notify'
import { istInterneIdentitaet } from '@/lib/testdaten/interne-identitaet'

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

  // Audit-Fix #3: Token-Status + Expiry pruefen — vorher konnte mit einem
  // bereits abgeschlossenen oder abgelaufenen Token weiter die FIN-Anreicherung
  // getriggert werden, was Leads-Daten ueberschreibt.
  const { data: flow } = await admin
    .from('flow_links')
    .select('lead_id, status, expires_at')
    .eq('token', token)
    .single()
  if (!flow?.lead_id) return { success: false, error: 'Flow-Link ungueltig' }
  if (flow.status === 'abgeschlossen') return { success: false, error: 'Flow-Link bereits abgeschlossen' }
  if (flow.expires_at && new Date(flow.expires_at) < new Date()) {
    return { success: false, error: 'Flow-Link abgelaufen' }
  }

  await admin.from('leads').update({ fin: cleaned }).eq('id', flow.lead_id)

  // FIN wird gespeichert; die kostenpflichtige Cardentity-Abfrage (Vorschaden +
  // Fahrzeugdaten) feuert NICHT automatisch — Staff ruft sie manuell ueber den
  // Cardentity-Button ab (2026-05-31, Aaron-Entscheidung). vehicles-Anlage
  // (idempotent, gratis) aus der FIN:
  try {
    const { ensureVehicleFromFin } = await import('@/lib/vehicles/ensure-vehicle')
    const veh = await ensureVehicleFromFin({ fin: cleaned, snapshot: { finQuelle: 'kunde_flow', finExtrahiertAm: new Date().toISOString() }, db: admin })
    if (veh.ok) await admin.from('leads').update({ vehicle_id: veh.vehicleId }).eq('id', flow.lead_id)
  } catch (err) {
    console.warn('[saveFinFromFlow] vehicles-Anlage (non-fatal):', err)
  }

  return { success: true, updatedFields: [] }
}

/**
 * KFZ-117: Kunde kann Stammdaten korrigieren (Step 1 FlowLink)
 */
export async function updateLeadStammdaten(
  leadId: string,
  data: {
    vorname?: string; nachname?: string; telefon?: string; email?: string
    unfall_konstellation?: string; gegner_anzahl_beteiligte?: string; gegner_fahrzeugtyp?: string
    // AAR-956: Kunde bestaetigt/korrigiert den vom Makler vorausgefuellten Besichtigungsort
    // (Place-Picker). Koordinaten nur als Paar (lat+lng) schreiben.
    fahrzeug_standort_adresse?: string | null
    fahrzeug_standort_plz?: string | null
    fahrzeug_standort_lat?: number | null
    fahrzeug_standort_lng?: number | null
    fahrzeug_standort_place_id?: string | null
  },
  // IDOR-Guard: der Flow-Token, gegen den die leadId gebunden wird (sonst koennte ein
  // Caller mit fremder leadId beliebige Lead-PII ueberschreiben).
  token: string | null,
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient()
  if (!(await assertLeadBoundToToken(admin, token, leadId))) return { success: false, error: 'Nicht autorisiert' }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.vorname !== undefined) update.vorname = data.vorname
  if (data.nachname !== undefined) update.nachname = data.nachname
  if (data.telefon !== undefined) update.telefon = data.telefon
  if (data.email !== undefined) update.email = data.email
  // KFZ-153: Unfall + Gegner Daten
  if (data.unfall_konstellation !== undefined) update.unfall_konstellation = data.unfall_konstellation
  if (data.gegner_anzahl_beteiligte !== undefined) update.gegner_anzahl_beteiligte = parseInt(data.gegner_anzahl_beteiligte) || 1
  if (data.gegner_fahrzeugtyp !== undefined) update.gegner_fahrzeugtyp = data.gegner_fahrzeugtyp
  // AAR-956: Besichtigungsort-Korrektur durch den Kunden (Place-Picker im Flow).
  if (data.fahrzeug_standort_adresse !== undefined) update.fahrzeug_standort_adresse = data.fahrzeug_standort_adresse
  if (data.fahrzeug_standort_plz !== undefined) update.fahrzeug_standort_plz = data.fahrzeug_standort_plz
  if (data.fahrzeug_standort_lat !== undefined) update.fahrzeug_standort_lat = data.fahrzeug_standort_lat
  if (data.fahrzeug_standort_lng !== undefined) update.fahrzeug_standort_lng = data.fahrzeug_standort_lng
  if (data.fahrzeug_standort_place_id !== undefined) update.fahrzeug_standort_place_id = data.fahrzeug_standort_place_id
  const { error } = await admin.from('leads').update(update).eq('id', leadId)
  return error ? { success: false, error: error.message } : { success: true }
}

/**
 * KFZ-117: SA-PDF generieren (Vertragstext + Kundendaten + Unterschrift + Datum)
 */
export async function generateSAPdf(
  fallId: string,
  leadId: string,
  signatureUrl: string,
  // IDOR-Guard: Flow-Token zum Binden der leadId (sonst Info-Disclosure fremder Lead-PII).
  token: string | null,
): Promise<{ pdfUrl: string }> {
  const admin = createAdminClient()
  if (!(await assertLeadBoundToToken(admin, token, leadId))) return { pdfUrl: '' }

  // Lead-Daten laden
  const { data: lead } = await admin.from('leads').select('vorname, nachname, email, telefon, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_standort_adresse').eq('id', leadId).single()
  const name = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : 'Kunde'
  const datum = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
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

  // claim_id laden damit signiertes Dokument in den Claim-Ordner geht
  // CMM-49 PURE_BRIDGE: via resolveClaimId (bridge-basiert, faelle-Drop-sicher).
  const claimId = await resolveClaimId(admin, fallId)

  // AAR-862: claim-zentrierter Pfad (claims/{claim_id}/sa/...).
  // Legacy-Fallback bleibt für Faelle ohne claim_id (sollte 0 sein — CMM-Migration ist durch).
  const path = claimId
    ? `claims/${claimId}/sa/sicherungsabtretung_${Date.now()}.html`
    : `sa-dokumente/${fallId}/sicherungsabtretung_${Date.now()}.html`
  const blob = new Blob([html], { type: 'text/html' })
  await admin.storage.from('fall-dokumente').upload(path, blob, { contentType: 'text/html' })
  const publicUrl = await getStorageUrl(admin, 'fall-dokumente', path)
  if (!publicUrl) throw new Error('URL-Generierung für Sicherungsabtretung fehlgeschlagen')

  // CMM-44 SP-B PR2b: abtretung_pdf lebt auf claims (SSoT) — Write nach claims
  // verschoben (kein faelle-Write mehr, faelle-Spalte wird in Phase 6 gedroppt).
  if (claimId) {
    await admin.from('claims').update({ abtretung_pdf: publicUrl }).eq('id', claimId)
  }

  // AAR-553: fall_dokumente-Eintrag (dokumente-Tabelle gedroppt)
  await admin.from('fall_dokumente').insert({
    fall_id: fallId,
    dokument_typ: 'sicherungsabtretung',
    storage_path: path,
    original_filename: `Sicherungsabtretung_${name.replace(/\s/g, '_')}_${datum}.html`,
    mime_type: 'text/html',
    kategorie: 'unterschrift',
    quelle: 'flowlink',
    uploaded_by_kunde: true,
    // AAR-956 Task C1 (11.07.): sachverstaendiger hinzugefuegt (volle Transparenz-Entscheid Aaron).
    // BACKFILL: aeltere Rows ohne 'sachverstaendiger' muessen per Data-Update nachgezogen werden.
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'kunde'],
  })

  return { pdfUrl: publicUrl }
}

export async function notifyNeuerFall(fallId: string) {
  const supabase = await createClient()

  // CMM-44 SP-B PR2c: schadens_ursache lebt auf claims (SSoT) — ins Embed.
  // CMM-49 (faelle-Drop-Runway): claim_nummer/schadens_ursache flach aus v_claim_full (faelle-frei).
  const { data: fall } = await supabase
    .from('v_claim_full')
    .select('claim_nummer, schadens_ursache')
    .eq('fall_id', fallId)
    .maybeSingle()

  if (!fall) return

  const fallNr = fall.claim_nummer ?? fallId.slice(0, 8)
  const schadensart = (fall.schadens_ursache as string | null) ?? 'Unbekannt'

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

// AAR-308/309: Anzeigenamen für Account-Hijack-Fehlermeldung
const ROLLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  dispatch: 'Dispatcher',
  kundenbetreuer: 'Kundenbetreuer',
  sachverstaendiger: 'Sachverständigen',
  kanzlei: 'Kanzlei',
}

// Audit-Fix #9: Type bleibt intern — Export aus 'use server'-Datei macht
// das Type-Objekt zur Runtime im Client-Bundle zu `undefined`. Siehe
// AAR-664-Pattern. Wenn dieser Type extern gebraucht wird → in eine
// separate types.ts-Datei verschieben und dort exportieren.
type CreateKundeAccountResult =
  | { success: true; password: string; magicLink: string | null }
  | { success: false; error: string }

/**
 * CMM-14: Post-Flow-Login.
 *
 * Browser-side `signInWithPassword` schreibt die Auth-Cookies nicht
 * zuverlässig auf Vercel-Preview-Domains — ein anschließender Server-
 * Component-Render (`/kunde/onboarding`) sieht keine Session und der
 * Middleware-Guard schickt den Kunden nach `/login`.
 *
 * Diese Server-Action nutzt `createClient` von `@/lib/supabase/server`,
 * der via `@supabase/ssr` HttpOnly-Cookies in der Action-Response setzt.
 * Browser muss danach nur noch `window.location.replace(redirectTo)`
 * machen — die Cookies sind sicher gesetzt.
 */
/**
 * CMM-14: Form-Action für Auto-Login nach SA-Unterschrift.
 * Wird via Form-Submit aufgerufen — Next.js setzt die Auth-Cookies aus der
 * Server-Action-Response korrekt vor dem `redirect()`. Das vermeidet die
 * Cookie-Race-Condition die mit `await action() + window.location.assign`
 * auftritt (Set-Cookie-Header ist im Response, Browser folgt aber sofort
 * mit einem GET der die noch nicht persistierten Cookies nicht enthält).
 */
export async function loginAfterFlowFormAction(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    redirect('/login?error=Login-Daten+fehlen')
  }

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError) {
    redirect(`/login?error=${encodeURIComponent(signInError.message)}`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=Auth-User+nicht+gefunden')

  const { data: profile } = await supabase
    .from('profiles')
    .select('force_password_change, auth_provider')
    .eq('id', user.id)
    .maybeSingle()

  const authProvider = (profile?.auth_provider as string | null) ?? 'email'
  if (profile?.force_password_change && authProvider === 'email') {
    redirect('/passwort-aendern')
  }
  redirect('/kunde/onboarding')
}

/**
 * AAR-308/309: Erstellt einen Supabase-Auth-Account für den Kunden nach
 * Flow-Abschluss, setzt kunde_id auf den Fall und legt Pflichtdokumente an.
 *
 * Bricht NIE mit `throw` ab — Server-Actions die throwen lösen den generischen
 * "Server Components render"-Fehler aus. Stattdessen sauberes Result-Object,
 * der FlowWizard rendert die Fehlermeldung.
 *
 * Pflichten:
 * - Idempotent: Refresh nach Browser-Reload kollidiert nicht mit "User exists".
 * - Profile-Lookup VOR createUser (statt brüchigem Error-Message-Matching).
 * - Account-Hijack-Schutz: existierende Nicht-Kunden-Accounts dürfen NICHT
 *   still zu rolle='kunde' herabgesetzt werden.
 */
export async function createKundeAccount(
  fallId: string,
  // F1 (Account-Hijack-Schutz): Flow-Token der [token]-Route. MUSS zu diesem Fall gehoeren.
  flowToken: string,
  email: string,
  vorname: string,
  nachname: string,
  telefon: string | null
): Promise<CreateKundeAccountResult> {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' }
  }
  if (!fallId) return { success: false, error: 'Fall-ID fehlt.' }
  if (!flowToken) return { success: false, error: 'Nicht autorisiert.' }

  try {
    const admin = createAdminClient()
    const password = generateInitialPassword(16)
    const normalizedEmail = email.trim().toLowerCase()

    // F1 (Account-Hijack-Schutz): der Flow-Token MUSS zu diesem Fall gehoeren —
    // sonst koennte ein Angreifer mit fremder fallId sich zum Geschaedigten machen
    // oder via Idempotenz-Pfad unten ein fremdes Kunden-Passwort resetten. Bindung
    // ueber den Lead: token -> flow_links.lead_id (Backward-Compat: token IST die
    // lead_id, kein flow_link) -> muss claims.lead_id (v_claim_full) des Falls matchen.
    // Prod-verifiziert 02.07.: 25/25 konvertierte flow_links haben lead_id == claims.lead_id.
    const { data: flowBind } = await admin
      .from('flow_links').select('lead_id').eq('token', flowToken).maybeSingle()
    const boundLeadId = flowBind?.lead_id ?? flowToken
    // Idempotenz-Read (zugleich Binding-Quelle): kunde_id + lead_id des Falls.
    const { data: existingFall } = await admin
      .from('v_claim_full').select('kunde_id, lead_id').eq('fall_id', fallId).maybeSingle()
    if (!existingFall || existingFall.lead_id !== boundLeadId) {
      return { success: false, error: 'Konto konnte nicht erstellt werden (nicht autorisiert).' }
    }
    // 1. Idempotenz: Falls der Fall schon mit einem Kunden verknüpft ist
    //    (Browser-Reload nach SA-Unterschrift), nur Passwort refreshen.
    //    Defensive Check: kunde_id muss tatsächlich auf einen rolle='kunde'-
    //    Account zeigen, sonst nicht anfassen.
    if (existingFall?.kunde_id) {
      const { data: linkedProfile } = await admin
        .from('profiles').select('rolle').eq('id', existingFall.kunde_id).maybeSingle()
      if (linkedProfile?.rolle === 'kunde' || linkedProfile?.rolle == null) {
        await admin.auth.admin.updateUserById(existingFall.kunde_id, { password })
        // CMM-14: Browser-Reload-Pfad — neuen Magic-Link generieren damit der
        // Kunde auch beim 2. Aufruf direkt ins Portal kann.
        const { magicLink } = await sendWelcomeWithLogin(admin, fallId, normalizedEmail, password)
        return { success: true, password, magicLink }
      }
      // kunde_id zeigt auf einen Nicht-Kunden — Account-Hijack-Verdacht, abbrechen
      return {
        success: false,
        error: 'Konto konnte nicht erstellt werden (interner Konflikt). Bitte kontaktieren Sie uns.',
      }
    }

    // 2. profiles-Lookup VOR createUser — statt brüchigem Error-Message-Matching.
    const { data: existingProfile } = await admin
      .from('profiles').select('id, rolle').eq('email', normalizedEmail).maybeSingle()

    if (existingProfile) {
      // 2a. Account-Hijack-Schutz: Existierender Nicht-Kunden-Account
      if (existingProfile.rolle && existingProfile.rolle !== 'kunde') {
        const rolleLabel = ROLLE_LABEL[existingProfile.rolle] ?? existingProfile.rolle
        return {
          success: false,
          error: `Diese E-Mail wird bereits für einen ${rolleLabel}-Account verwendet. Bitte verwenden Sie eine andere E-Mail-Adresse.`,
        }
      }
      // 2b. Existierender Kunden-Account (oder Profile ohne Rolle): verknüpfen + Passwort refreshen
      await admin.auth.admin.updateUserById(existingProfile.id, { password })
      const finRes = await finalizeKundeSetup(admin, fallId, existingProfile.id, normalizedEmail, vorname, nachname, telefon, password)
      return { success: true, password, magicLink: finRes.magicLink }
    }

    // 3. Neuer User
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { vorname, nachname },
    })

    if (authError || !authUser?.user) {
      console.error('[createKundeAccount] createUser fehlgeschlagen:', authError)
      return {
        success: false,
        error: 'Konto konnte nicht erstellt werden. Bitte versuchen Sie es erneut oder kontaktieren Sie uns.',
      }
    }

    // AAR-phone-login: passwordless Telefon-Login fuer NEUE Kunden aktivieren
    // (auth.users.phone = Flow-Nummer). NUR hier im Neu-Zweig -> kein Lazy-Backfill
    // auf dem Relink-Pfad. Best-effort/kollisionssicher (siehe enablePhoneLogin).
    const phoneLoginAktiviert = await enablePhoneLogin(admin, authUser.user.id, telefon)
    const finRes = await finalizeKundeSetup(admin, fallId, authUser.user.id, normalizedEmail, vorname, nachname, telefon, password, phoneLoginAktiviert)
    return { success: true, password, magicLink: finRes.magicLink }
  } catch (err) {
    console.error('[createKundeAccount] unerwarteter Fehler:', err)
    return {
      success: false,
      error: 'Konto konnte nicht erstellt werden. Bitte versuchen Sie es erneut oder kontaktieren Sie uns.',
    }
  }
}

/**
 * AAR-308/309: Shared Setup nach Account-Erstellung/-Verknüpfung.
 * Profile, kunde_id, Pflichtdokumente, Chat-Teilnehmer, Welcome-Mail.
 */
async function finalizeKundeSetup(
  admin: ReturnType<typeof createAdminClient>,
  fallId: string,
  userId: string,
  email: string,
  vorname: string,
  nachname: string,
  telefon: string | null,
  password: string,
  // AAR-phone-login: nur im Neu-Zweig true; Default false = Relink-Pfad unveraendert.
  phoneLoginAktiviert: boolean = false,
): Promise<{ magicLink: string | null }> {
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

  // D (Aaron 27.07.): Login-Daten EINMAL per WhatsApp (zusaetzlich zur Willkommens-Email). Nach dem
  // /flow-Auto-Login hat der Kunde zwar schon eine Session, braucht Email+Passwort aber fuer spaetere
  // Logins. Non-fatal: ein Baileys-Fail darf die Account-Anlage nie brechen.
  if (telefon && telefon.trim().length >= 5) {
    try {
      const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
      const credsText = [
        '🔐 Ihre Claimondo-Zugangsdaten',
        '',
        `E-Mail: ${email}`,
        `Passwort: ${password}`,
        '',
        `Login: ${base}/login`,
        '',
        'Bitte ändern Sie Ihr Passwort beim ersten Login. Ihr Claimondo-Team',
      ].join('\n')
      const r = await sendWhatsAppText(telefon, credsText)
      if (!r.ok) console.error('[D] Login-Daten-WA fehlgeschlagen:', r.code, r.error)
    } catch (err) {
      console.error('[D] Login-Daten-WA Fehler:', err)
    }
  }

  // Portal-i18n F-11: Sprache aus dem Lead (faelle.lead_id → leads.sprache)
  // still VORBELEGEN — aber nur wenn profiles.sprache noch leer ist. Der
  // IS-NULL-Guard schützt eine explizite F-12-Wahl: finalizeKundeSetup läuft
  // auch auf dem Relink-Pfad (createKundeAccount 2b, existierender Kunde
  // unterschreibt eine zweite SA), wo ein onConflict-Upsert sonst eine frühere
  // de→en-Wahl des Kunden auf den neuen Lead-Wert zurücksetzen würde.
  // Non-fatal: ein Fehler hier darf die Account-Erstellung nicht brechen.
  try {
    // CMM-49 (faelle-Drop-Runway): lead_id via v_claim_full (faelle-frei), dann leads.sprache.
    const { data: spracheRow } = await admin
      .from('v_claim_full')
      .select('lead_id')
      .eq('fall_id', fallId)
      .maybeSingle()
    let leadRow: { sprache?: string | null } | null = null
    if (spracheRow?.lead_id) {
      const { data: lr } = await admin.from('leads').select('sprache').eq('id', spracheRow.lead_id).maybeSingle()
      leadRow = lr as { sprache?: string | null } | null
    }
    const leadSprache = normalizeToLocale(leadRow?.sprache)
    if (leadSprache) {
      await admin
        .from('profiles')
        .update({ sprache: leadSprache })
        .eq('id', userId)
        .is('sprache', null)
    }
  } catch (err) {
    console.warn('[Portal-i18n F-11] Lead-Sprache-Vorbelegung fehlgeschlagen:', err)
  }

  // AAR-607 A4: force_password_change auch in user_metadata spiegeln —
  // Supabase-Standard-Pattern; Integrations lesen aus user_metadata,
  // nicht aus der profiles-Tabelle.
  try {
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { force_password_change: true },
    })
  } catch (err) {
    console.warn('[finalizeKundeSetup] user_metadata.force_password_change Update fehlgeschlagen:', err)
  }

  // CMM-49 (faelle-Drop-Runway): faelle.kunde_id-Spiegel-Write entfernt — faelle.kunde_id
  // ist prod-reader-frei (copilot #2915, makler/queries=claims-View); die Ownership lebt
  // claims-nativ (geschaedigter_user_id + claim_parties, unten).
  // CMM-19: claims.geschaedigter_user_id nachziehen — beim Initial-
  // Convert via signSAandCreateFall ist lead.kunde_id noch null (Account
  // wird ja erst HIER nach SA angelegt). Ohne dieses Update bleibt
  // claims.geschaedigter_user_id null und die RLS-Policy lässt den Kunden
  // seinen eigenen Claim nicht sehen.
  try {
    // CMM-49 PURE_BRIDGE: via resolveClaimId (bridge-basiert, faelle-Drop-sicher).
    const claimId = await resolveClaimId(admin, fallId)
    if (claimId) {
      await admin
        .from('claims')
        .update({ geschaedigter_user_id: userId })
        .eq('id', claimId)

      // CMM-19: claim_parties.user_id der Geschädigter-Party nachziehen
      // damit der Kunde via cp_co_party_select / cp_user_own_select RLS-
      // Zugriff hat. Ohne diesen Fix bleibt parties-Array bei v_claim_full
      // leer für den Kunden.
      const { data: gesParties } = await admin
        .from('claim_parties')
        .update({ user_id: userId })
        .eq('claim_id', claimId)
        .eq('rolle', 'geschaedigter')
        .select('id')

      // CMM Entity-Model Phase 3: person_id auf die Account-Person nachziehen.
      // Bei anonymem Flow legte convertLeadToClaim eine No-Account-Person an;
      // jetzt (Account existiert) -> auf die Account-Person re-pointen bzw. die
      // No-Account-Person promoten. Idempotent + non-fatal.
      if (gesParties && gesParties.length > 0) {
        const { relinkPartyPersonOnAccount } = await import('@/lib/personen/ensure-person')
        for (const gp of gesParties) {
          const rl = await relinkPartyPersonOnAccount({ db: admin, partyId: gp.id as string, userId })
          if (!rl.ok) console.warn('[CMM-entity P3] person relink (finalizeKundeSetup) non-fatal:', rl.error)
        }
      }
    }
  } catch (err) {
    console.warn('[CMM-19] claims/claim_parties user_id Update fehlgeschlagen:', err)
  }

  // C3-Kundenlücke (12.08.): `fall.created` + `sa.signed` feuern in signSAandCreateFall —
  // dort ist claims.geschaedigter_user_id noch NULL (der Account entsteht ja erst HIER,
  // s. CMM-19-Block oben). Der Fan-out adressiert den Kunden ausschliesslich ueber diese
  // Spalte -> er findet keinen Empfaenger und erzeugt nicht mal eine `skipped`-Zeile.
  // Prod-Messung 12.08. (60 T): Neukunden 0/9, Wiederkehrer 1/15 Kunden-Deliveries, waehrend
  // Staff 312 bekam. JETZT ist der Kunde erreichbar UND seine Identitaet bestaetigt (eigene
  // E-Mail im Account-Schritt) -> Willkommens-Benachrichtigung nachziehen.
  // Eigenes Event statt `fall.created`-Repeat: die Matrix traegt fuer `kunde.account_bereit`
  // NUR kunde-Kanaele -> Staff bekommt kein Doppel. Non-fatal (Account-Anlage darf nie brechen).
  try {
    const claimIdFuerEvent = await resolveClaimId(admin, fallId)
    if (claimIdFuerEvent) {
      const { emitEvent } = await import('@/lib/notifications/emit')
      await emitEvent('kunde.account_bereit', { fallId }, { fallId })
    }
  } catch (err) {
    console.warn('[C3-Kundenluecke] kunde.account_bereit emit fehlgeschlagen (non-fatal):', err)
  }

  // P6 / K8: das Fall-Fahrzeug an den frischen Kunden-Account binden (vehicles.current_owner_id).
  // IS-NULL-Guard im Setter — ein bestehender Owner (Flotte/frueherer Kunde) wird nie ueberschrieben.
  // Non-fatal: Owner-Bindung darf die Account-Anlage nie brechen.
  try {
    const { setVehicleOwnerFuerFall } = await import('@/lib/vehicles/owner')
    const ownerRes = await setVehicleOwnerFuerFall(admin, fallId, userId)
    if (!ownerRes.ok) console.warn('[P6 vehicle-owner] Bindung fehlgeschlagen:', ownerRes.error)
  } catch (err) {
    console.warn('[P6 vehicle-owner] Bindung warf:', err)
  }

  // AAR-125: Lead laden für conditional Polizeibericht
  // AAR-607 A3: .single() throwed bei 0 Rows + leadDocs=null Propagation zu
  // createPflichtdokumenteFromKatalog war Silent-Fail-Pfad.
  // CMM-49 (faelle-Drop-Runway): lead_id via v_claim_full (faelle-frei), dann Lead-Doc-Flags via leads.
  const { data: docsFallRow } = await admin.from('v_claim_full').select('lead_id').eq('fall_id', fallId).maybeSingle()
  const docsLeadId = (docsFallRow?.lead_id as string | null) ?? null
  let leadDocs: Record<string, unknown> | null = null
  if (docsLeadId) {
    const { data: ld } = await admin
      .from('leads')
      .select('polizei_vor_ort, polizeibericht_pflicht, polizeibericht_status, personenschaden_flag, hat_vorschaeden, zb1_status, service_typ, wa_gesendet, mietwagen_flag, nutzungsausfall')
      .eq('id', docsLeadId)
      .maybeSingle()
    leadDocs = ld as Record<string, unknown> | null
  }
  if (!leadDocs) {
    console.warn('[finalizeKundeSetup] Lead-Relation für Fall', fallId, 'nicht gefunden — Pflichtdokumente-Katalog übersprungen')
  } else {
    await createPflichtdokumenteFromKatalog(admin, fallId, leadDocs)
    // AAR-pflicht-sync: bereits vorhandene Lead-URLs auf pflichtdokumente
    // anwenden — Kunde soll nicht „X fehlen" sehen für Dokumente die schon
    // im Lead waren.
    try {
      const leadId = docsLeadId
      if (leadId) {
        const { syncLeadDokumenteAnPflicht } = await import('@/lib/dokumente/sync-lead-zu-pflicht')
        const { data: leadFull } = await admin
          .from('leads')
          .select('zb1_url, polizeibericht_url, unfallskizze_url, schadensfoto_urls')
          .eq('id', leadId)
          .maybeSingle()
        if (leadFull) await syncLeadDokumenteAnPflicht(admin, fallId, leadFull)
      }
    } catch (err) {
      console.warn('[AAR-pflicht-sync] finalizeKundeSetup:', err instanceof Error ? err.message : err)
    }
  }

  // KFZ-129 / AAR-310: Chat-Teilnehmer werden seit AAR-102 aus faelle abgeleitet
  // (kein chat_teilnehmer-Sync mehr nötig — siehe lib/chatGruppe.ts).

  // AAR-127: Welcome-Mail mit Magic-Link + Zugangsdaten
  // CMM-14: Magic-Link weiterreichen damit der Wizard direkt einen
  // "Zu meinem Portal"-Button anbieten kann.
  return await sendWelcomeWithLogin(admin, fallId, email, password, phoneLoginAktiviert)
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
  phoneLoginAktiviert: boolean = false,
): Promise<{ magicLink: string | null }> {
  let magicLink: string | null = null
  try {
    // TOKEN-HASH-FIX: admin.generateLink liefert inzwischen einen IMPLICIT-#access_token-Hash
    // im action_link, den /api/auth/callback (erwartet ?code) NICHT einloesen kann ("OAuth
    // fehlgeschlagen" → /login). Wir nutzen daher data.properties.hashed_token + die
    // /api/auth/confirm-Route (verifyOtp server-seitig → Cookie → Redirect auf next).
    // Siehe src/app/api/auth/confirm/route.ts.
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
    const { data, error } = await adminDb.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (error) {
      console.error('[AAR-127] Magic-Link-Generierung fehlgeschlagen:', error)
    } else {
      const tokenHash = data?.properties?.hashed_token
      magicLink = tokenHash
        ? `${base}/api/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/kunde/onboarding')}`
        : null
    }
  } catch (err) {
    console.error('[AAR-127] Magic-Link-Generierung fehlgeschlagen (Exception):', err)
  }

  try {
    const { sendKundeWelcome } = await import('@/lib/email/google/flows')
    await sendKundeWelcome(fallId, { magicLink, email, password, phoneLoginAktiviert })
  } catch (err) {
    console.error('[AAR-127] Welcome-Mail-Versand fehlgeschlagen:', err)
  }

  return { magicLink }
}

/**
 * KFZ-117: SA unterzeichnet → Fall wird SOFORT erstellt.
 * Auch OHNE Account — der Gutachter sieht den Fall sofort.
 */
export async function signSAandCreateFall(
  leadId: string,
  signatureUrl: string,
  flowLinkId: string | null,
  // AAR-360 Follow-up: Zustimmung zu Datenschutz + Widerrufsbelehrung des zugewiesenen Gutachters
  // (FlowLink-Häkchen, entkoppelt von der SA-Signatur). Default false = kein SV zugewiesen.
  svDsWiderrufZugestimmt: boolean = false,
  // IDOR-Guard: Flow-Token zum Binden der leadId (schliesst den flowLinkId=null-Bypass).
  token: string | null = null,
): Promise<{ ok: true; fallId: string } | { ok: false; error: string }> {
  if (!leadId || !signatureUrl) return { ok: false, error: 'Fehlende Daten für SA-Unterschrift' }

  try {
  const admin = createAdminClient()

  // 1. Lead minimal laden — wir brauchen ihn für die Termin-/Pflichtdoc-/
  // Mitteilungs-Logik unten. Der eigentliche Schadens-Daten-Übertrag in
  // den Claim macht convertLeadToClaim.
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()
  if (leadErr || !lead) return { ok: false, error: 'Lead nicht gefunden' }

  // F1 (IDOR-Guard, jetzt token-basiert): die leadId MUSS zum Flow-Token gehoeren — sonst
  // konvertiert ein Angreifer fremde Leads bzw. stempelt einen fremden flow_link (Update
  // unten ~:1118) mit dieser fallId. Frueher nur `if (flowLinkId)` -> der Backward-Compat-
  // Pfad (flowLinkId=null) uebersprang die Bindung = Bypass. assertLeadBoundToToken deckt
  // beide Pfade ab (canonical via flow_links.token, backward-compat via token==lead_id).
  if (!(await assertLeadBoundToToken(admin, token, leadId))) return { ok: false, error: 'Nicht autorisiert' }

  // Re-Entry-Dedup: `lead` ist der Pre-Conversion-Snapshot (select('*') oben, VOR
  // convertLeadToClaim). War die SA schon unterschrieben, ist dies ein Re-Entry
  // (Reload/Retry/Doppel-Submit/erneuter Aufruf) → kein zweites sa_signed (sonst
  // Wertinflation im value-based Bidding) und keine doppelte Willkommens-WhatsApp.
  // convertLeadToClaim selbst ist idempotent (kein zweiter Fall), deckt diese
  // Side-Effects in signSAandCreateFall aber NICHT ab.
  const saWasAlreadySigned = lead.sa_unterschrieben === true

  // 2. AAR-345: SV-Zuweisung aus gutachter_termine laden — direkt über
  // gutachter_termine.lead_id statt via Legacy-Feld leads.gutachter_termin
  // (der Dispatcher kann den Termin-Eintrag anlegen ohne das Timestamp-Feld
  // auf leads zu pflegen). Vorher wurde in diesem Fall sv_id=NULL gesetzt
  // und der Status blieb auf „ersterfassung".
  let svIdFromTermin: string | null = null
  let aktiverTerminId: string | null = null
  {
    // AAR-956 Booking-Repoint: bezug-nativer Dual-Lookup (Engine #2576) statt
    // .eq('lead_id') — findet Legacy- (lead_id) UND engine-reservierte (bezug_typ='lead')
    // Termine, sodass der Auto-Confirm bei SA beide Welten abdeckt.
    const existingTermin = await findeTerminFuerLead(admin, leadId)
    svIdFromTermin = existingTermin?.sv_id ?? null
    aktiverTerminId = existingTermin?.id ?? null
  }

  // P4 (Netzwerk): sign-into-existing-claim — SCOPE: NUR der SV-Vermittlungs-Sofort-Claim.
  // Doppelt gescoped (Review-Fund MEDIUM-1): (1) am URSPRUNG lead.source_channel=
  // 'gutachter-vermittlung' (exklusiv von vermittlePartnerWerkstatt gesetzt — dispatch/admin-
  // erstellte komplett-Claims werden ebenfalls sa=false geboren und duerfen NICHT hierher),
  // (2) am Zustand operative_status='gutachten-eingegangen' + un-signiert. Er braucht das
  // UPDATE (abtretung_pdf + onboarding_complete + resume der aufgeschobenen Funnel-Effekte) —
  // convertLeadToClaim verwuerfe die signatureUrl idempotent still, und der generische
  // claimsSaUpdate unten setzt nur sa_unterschrieben(_am). NICHT fuer Kasko/Selbstzahler-
  // Partial-Claims (ersterfassung, Quali-Step): deren Onboarding kommt regulaer NACH der SA
  // (Portal-Wizard) — onboarding_complete=true hier wuerde ihn ueberspringen. Der convert-Call
  // unten liefert idempotent dieselben Ids (kein Doppel-Claim).
  let istVermittlungsSignIn = false
  if (
    lead.konvertiert_zu_claim_id &&
    lead.konvertiert_zu_fall_id &&
    lead.source_channel === 'gutachter-vermittlung'
  ) {
    const { data: existingClaim } = await admin
      .from('claims')
      .select('operative_status, sa_unterschrieben')
      .eq('id', lead.konvertiert_zu_claim_id as string)
      .maybeSingle()
    const ec = existingClaim as { operative_status?: string | null; sa_unterschrieben?: boolean | null } | null
    if (ec && ec.operative_status === 'gutachten-eingegangen' && ec.sa_unterschrieben !== true) {
      const { applySAToExistingClaim } = await import('@/lib/faelle/apply-sa-to-existing-claim')
      const applied = await applySAToExistingClaim(admin, {
        claimId: lead.konvertiert_zu_claim_id as string,
        fallId: lead.konvertiert_zu_fall_id as string,
        signatureUrl,
      })
      if (!applied.ok) return { ok: false, error: `SA-Update fehlgeschlagen: ${applied.error}` }
      istVermittlungsSignIn = true
    }
  }

  // 3. CMM-3: Lead → Claim direkt konvertieren. convertLeadToClaim macht
  // claims insert + claim_parties + claim_vehicle_involvements + faelle
  // (vollständig, bis Phase 6 frontend-relevant) + leads-Status auf
  // "umgewandelt" + alle Konvertierungs-Tags.
  const { convertLeadToClaim } = await import('@/lib/leads/convert-lead-to-claim')
  const conv = await convertLeadToClaim({
    leadId,
    svIdFromTermin,
    signatureUrl,
  })
  if (!conv.ok) {
    return { ok: false, error: `Konvertierung fehlgeschlagen: ${conv.error}` }
  }
  const fall: { id: string } = { id: conv.fallId }
  const convClaimId = conv.claimId
  const fallNummer = conv.claimNummer ?? ''
  const kundenbetreuerId = conv.kundenbetreuerId

  // AAR-956 16.06. (Aaron): Self-Service abgeschlossen -> Willkommens-WhatsApp an den
  // Kunden + "Flow abgeschlossen"-WA ans Team (Baileys). Fire-and-forget (VPS-PM2, kein
  // Cold-Kill); ein Baileys-Fail darf die Konversion nie brechen.
  void (async () => {
    if (saWasAlreadySigned) return // Re-Entry (Reload/Retry): keine doppelte Willkommens-/Team-WA
    // Send-Isolation (interne-identitaet.ts): interne/Test-Bucher (@claimondo.de, Test-Marker)
    // loesen KEINE Kunde-/Team-WhatsApp aus — dieselbe Isolation, die reserviereEmbedTermin
    // schon fuer seine Reservierungs-Sends hat. Verhindert das "kein Termin gebucht"-Rauschen
    // aus Team-Funnel-Smokes: deren Partner-Buchung blockt der Test-SV-Guard (intern->echt) ->
    // aktiverTerminId NULL -> Team-WA "⚠ kein Termin gebucht". Echte Kunden (extern) loesen den
    // Dispatch-Alarm weiter aus.
    if (
      istInterneIdentitaet(
        (lead.email as string | null) ?? null,
        [((lead.vorname as string | null) ?? '').trim(), ((lead.nachname as string | null) ?? '').trim()]
          .filter(Boolean)
          .join(' ') || null,
      )
    ) {
      return
    }
    try {
      const vorname = ((lead.vorname as string | null) ?? '').trim()
      const nachname = ((lead.nachname as string | null) ?? '').trim()
      const name = [vorname, nachname].filter(Boolean).join(' ').trim() || 'Kunde'
      const telefon = ((lead.telefon as string | null) ?? '').trim()
      const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
      const hatTermin = !!aktiverTerminId

      // H2 (Aaron-Entscheid 12.08.): Die handgeschriebene Willkommens-WA stand hier —
      // sie sagte dasselbe wie das Template `fall_eroeffnet`, das wenige Zeilen spaeter
      // ohnehin rausging (bis hin zum woertlich identischen Schlusssatz „Bei Fragen
      // antworten Sie einfach auf diese Nachricht"). Sie ist jetzt IN `fall_eroeffnet`
      // gebuendelt und hier entfernt.
      //
      // Nebenwirkung, die dabei mitverschwindet: dieser Text existierte nur auf DEUTSCH
      // (inline, keine i18n) und ging so auch an fremdsprachige Kunden. Das Template
      // liegt in 6 Sprachen vor und folgt der Sprache des Falls.
      //
      // Die Team-Nachricht unten bleibt unveraendert — sie geht nicht an den Kunden.

      const teamText = [
        '✅ Self-Service abgeschlossen (Flow)',
        '',
        `👤 ${name}`,
        telefon ? `📞 ${telefon}` : null,
        `📦 Service: ${(lead.service_typ as string | null) ?? '—'}`,
        hatTermin ? '🕐 Termin reserviert' : '⚠ kein Termin gebucht',
        '',
        `${base}/dispatch/leads/${leadId}`,
      ]
        .filter(Boolean)
        .join('\n')
      await notifyTeamWhatsApp(teamText)
    } catch (err) {
      console.error('[AAR-956] Flow-Abschluss-Notify fehlgeschlagen:', err)
    }
  })()

  // 5. KFZ-192 + AAR-345: Termin-State-Machine basierend auf service_typ.
  // Guard auf aktiverTerminId statt Legacy-Feld lead.gutachter_termin —
  // damit auch Dispatcher-Termine ohne lead.gutachter_termin-Timestamp
  // beim Fall-Anlegen sauber verknüpft werden.
  if (aktiverTerminId) {
    const serviceTyp = lead.service_typ ?? 'komplett'

    if (serviceTyp === 'nur_gutachter') {
      // nur_gutachter: SA unterschrieben = sofort verbindlich bestätigt (keine Vollmacht nötig)
      const { data: upgradedTermine, error: upErr } = await admin.from('gutachter_termine')
        .update({ status: 'bestaetigt', fall_id: fall.id, claim_id: convClaimId })
        // AAR-956 #8 (Linchpin): Engine-reservierte Termine sind bezug-nativ (lead_id NULL,
        // bezug_typ='lead'). Der Filter muss BEIDE Seiten der Konversion matchen:
        // convertLeadToClaim (uebernehmeLeadTermine, T1 #5012) hat den Termin hier bereits
        // auf bezug ('fall', claimId) umgehaengt + lead_id genullt — ein reiner lead-Anker
        // fand ihn nicht mehr (Prod-Regression 07.08.: Termin blieb 'reserviert' -> TTL-Storno).
        .or(bezugOrExprKonversion(leadId, convClaimId))
        .eq('status', 'reserviert')
        .select('id')

      if (upErr) console.error('[KFZ-192] Termin-Upgrade (nur_gutachter):', upErr.message)

      // CMM-32d / CMM-32i: Auftrag anlegen — robust gegen den Fall, dass der
      // Termin schon vor SA-Signatur auf bestaetigt stand (UPDATE liefert dann
      // 0 Rows, ohne Härtung würde kein Auftrag entstehen).
      if (svIdFromTermin) {
        try {
          let terminIdsForAuftrag = (upgradedTermine ?? []).map((t) => t.id as string)
          if (terminIdsForAuftrag.length === 0) {
            const { data: existingTermine } = await admin
              .from('gutachter_termine')
              .select('id')
              // bezug-aware statt .eq('fall_id'): umgehaengte Engine-Termine tragen NUR
              // bezug ('fall', claimId), fall_id bleibt NULL wenn das Confirm-UPDATE oben
              // 0 Rows traf (z.B. Termin stand schon auf 'bestaetigt').
              .or(bezugOrExpr('fall', fall.id))
              // CMM-49 (sv_id-Drop): assignee_id+typ statt sv_id (value-identisch; svIdFromTermin ist eine SV-id).
              .eq('assignee_id', svIdFromTermin)
              .eq('assignee_typ', 'sachverstaendiger')
              .in('status', ['bestaetigt', 'reserviert'])
            terminIdsForAuftrag = (existingTermine ?? []).map((t) => t.id as string)
          }
          const { createErstgutachtenAuftragWennNoetig } = await import('@/lib/auftrag/create')
          await createErstgutachtenAuftragWennNoetig(
            admin, fall.id as string, svIdFromTermin, terminIdsForAuftrag,
          )
        } catch (err) { console.error('[CMM-32d] Auftrag-Anlage fehlgeschlagen:', err) }
      }

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

      // Fall-Status spiegelt die View aus gutachter_termine
    } else {
      // CMM-21: komplett — SA unterschrieben = Termin verbindlich bestätigt.
      // Vorher blieb der Termin auf 'reserviert' bis zur Vollmacht; das hat
      // dazu geführt dass der Kunde im Onboarding nichts Verbindliches sah.
      // Aaron-Spec: SA-Unterschrift ist die Termin-Bestätigung, Vollmacht ist
      // davon entkoppelt. fall_id muss in jedem Fall gesetzt werden.
      const { data: updatedTermine, error: upErr } = await admin.from('gutachter_termine')
        .update({ status: 'bestaetigt', fall_id: fall.id, claim_id: convClaimId })
        // AAR-956 #8 (Linchpin): bezug-nativen Self-Service-Termin mit-relinken — inkl. der
        // von convertLeadToClaim bereits auf bezug ('fall', claimId) umgehaengten Termine
        // (s. Kommentar im nur_gutachter-Branch; Prod-Regression 07.08.).
        .or(bezugOrExprKonversion(leadId, convClaimId))
        .eq('status', 'reserviert')
        .select('id')

      if (upErr) console.error('[CMM-21] Termin-Upgrade (komplett):', upErr.message)

      // CMM-32d / CMM-32i: Erstgutachten-Auftrag anlegen. Auch wenn das obige
      // UPDATE 0 Rows liefert (Termin war bereits bestaetigt), müssen wir den
      // Auftrag anlegen — sonst hängt der Fall ohne Sub-Entity-Eintrag und
      // der Kunde sieht keine Status-Bar. Termine fresh aus der DB lesen
      // damit auftrag_id zugeordnet werden kann.
      if (svIdFromTermin) {
        try {
          let terminIdsForAuftrag = (updatedTermine ?? []).map((t) => t.id as string)
          if (terminIdsForAuftrag.length === 0) {
            const { data: existingTermine } = await admin
              .from('gutachter_termine')
              .select('id')
              // bezug-aware statt .eq('fall_id') — s. Kommentar im nur_gutachter-Branch.
              .or(bezugOrExpr('fall', fall.id))
              // CMM-49 (sv_id-Drop): assignee_id+typ statt sv_id (value-identisch; svIdFromTermin ist eine SV-id).
              .eq('assignee_id', svIdFromTermin)
              .eq('assignee_typ', 'sachverstaendiger')
              .in('status', ['bestaetigt', 'reserviert'])
            terminIdsForAuftrag = (existingTermine ?? []).map((t) => t.id as string)
          }
          const { createErstgutachtenAuftragWennNoetig } = await import('@/lib/auftrag/create')
          await createErstgutachtenAuftragWennNoetig(
            admin, fall.id as string, svIdFromTermin, terminIdsForAuftrag,
          )
        } catch (err) { console.error('[CMM-32d] Auftrag-Anlage fehlgeschlagen:', err) }
      }

      // bestaetigeTermin setzt final_verbindlich_ab + Timeline-Eintrag
      try {
        const { bestaetigeTermin } = await import('@/lib/termine/bestaetigung')
        for (const t of updatedTermine ?? []) { await bestaetigeTermin(t.id) }
      } catch (err) { console.error('[CMM-21] bestaetigeTermin (komplett):', err) }

      // Reminder generieren (24h vorher Push/WhatsApp)
      try {
        const { generateReminderForTermin } = await import('@/lib/reminders/generate')
        for (const t of updatedTermine ?? []) { await generateReminderForTermin(t.id) }
      } catch (err) { console.error('[CMM-21] Reminder-Gen (komplett):', err) }

      // AAR-713: SV-Bestätigungs-Email feuert jetzt erst hier (vorher schon
      // bei der Dispatcher-Vorreservierung — das war die verwirrende
      // „Vorreservierung"-Mail). nur_gutachter triggert die Email automatisch
      // via bestaetigeTermin oben; komplett wartet auf Vollmacht und braucht
      // einen separaten Trigger nach SA, damit der SV überhaupt eine Mail mit
      // Termindaten bekommt sobald die SA unterschrieben ist.
      try {
        const { sendSvTerminBestaetigung } = await import('@/lib/email/google/flows')
        for (const t of updatedTermine ?? []) {
          if (svIdFromTermin) await sendSvTerminBestaetigung(svIdFromTermin, t.id)
        }
      } catch (err) {
        console.warn('[AAR-713] SV-Email nach SA fehlgeschlagen:', err instanceof Error ? err.message : err)
      }
    }

    // Ticket 3 (15.05.2026): Zweite SV-WhatsApp nach SA-Unterschrift — der
    // Auftrag ist jetzt verbindlich. Aaron-Spec: der SV plant seinen Tag
    // nach bestaetigten (nicht reservierten) Terminen. Die initiale WA bei
    // Dispatcher-Reservierung (PR #1352) markiert nur "reserviert". Greift
    // fuer beide service_typ-Branches (nur_gutachter + komplett).
    // Kein Email-Fallback: der SV bekommt nach SA ohnehin eine Bestaetigungs-
    // Email (bestaetigeTermin bzw. sendSvTerminBestaetigung) — WhatsApp ist
    // reiner Zusatz-Kanal. Non-blocking: kein WhatsApp / Baileys down bricht
    // den Onboarding-Flow nicht.
    if (svIdFromTermin) {
      try {
        const { data: svRow } = await admin
          .from('sachverstaendige')
          .select('profile_id, profiles!sachverstaendige_profile_id_fkey(telefon)')
          .eq('id', svIdFromTermin)
          .single()
        const svProfile = Array.isArray(svRow?.profiles) ? svRow?.profiles[0] : svRow?.profiles
        const svPhone = (svProfile as { telefon: string | null } | null)?.telefon ?? null
        const svProfileId = (svRow?.profile_id as string | null) ?? null
        if (svPhone && svProfileId) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
          const link = `${baseUrl}/gutachter/fall/${fall.id}`
          const kundeName = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || 'Kunde'
          const text =
            `✅ Auftrag verbindlich — Claimondo\n\n` +
            `Der Kunde hat die Schadensanzeige unterschrieben — der Termin ist jetzt verbindlich.\n\n` +
            `Kunde: ${kundeName}\n` +
            `Fall-Nr.: ${fallNummer}\n\n` +
            `Details + Navigation:\n${link}`
          const { sendNachricht } = await import('@/lib/whatsapp/send')
          await sendNachricht({
            entity: 'profile',
            entityId: svProfileId,
            phone: svPhone,
            text,
            templateKey: 'sv_auftrag_verbindlich',
            empfaengerRolle: 'sachverstaendiger',
            fallId: fall.id,
          })
        }
      } catch (err) {
        console.warn('[Ticket3] SV-WhatsApp nach SA fehlgeschlagen:', err instanceof Error ? err.message : err)
      }
    }
  }

  // AAR-358: Personenschaden-Personen vom Lead auf den Fall upgraden.
  // Rows wurden im Dispatch mit lead_id angelegt; fall_id ist zu dem Zeitpunkt
  // noch NULL. Nach dem Fall-Insert ziehen wir fall_id nach, damit die Daten
  // in der Fallakte sichtbar werden und RLS-Policies für den Kunden greifen.
  try {
    await admin
      .from('personenschaden_personen')
      .update({ fall_id: fall.id })
      .eq('lead_id', leadId)
      .is('fall_id', null)
  } catch (err) {
    console.error('[AAR-358] Personen-Upgrade fehlgeschlagen:', err)
  }

  // 6. Lead-Status updaten
  // AAR-702: qualifizierungs_phase auf 'konvertiert' (statt 'abgeschlossen')
  // sobald die SA unterschrieben ist — der Lead ist damit faktisch zum Fall
  // konvertiert, egal ob noch ein offener Rückruf existiert.
  const nowIsoSa = new Date().toISOString()
  await admin.from('leads').update({
    status: 'umgewandelt',
    qualifizierungs_phase: 'konvertiert',
    sa_unterschrieben: true,
    // FG6: sa_datum retired (redundant twin von sa_unterschrieben_am; zero readers grep-verifiziert).
    sa_unterschrieben_am: nowIsoSa,
    flow_link_abgeschlossen: true,
    konvertiert_zu_fall_id: fall.id,
    updated_at: nowIsoSa,
  }).eq('id', leadId)

  // GA4 sa_signed-Conversion (fire-and-forget). client_id aus dem gespeicherten
  // leads.ga_client_id — /flow laeuft auf app.* (host-gated, kein gtag/_ga live).
  // Dedup via buildSaSignedEvent: nur beim Uebergang false->true (saWasAlreadySigned)
  // + transaction_id=leadId — sa_signed ist das primaere value-based Bidding-Signal.
  void (async () => {
    try {
      const saEvent = buildSaSignedEvent({ alreadySigned: saWasAlreadySigned, leadId, source: 'flow' })
      if (!saEvent) return
      const { data: gaRow } = await admin
        .from('leads')
        .select('ga_client_id')
        .eq('id', leadId)
        .maybeSingle()
      await trackServerConversion(gaRow?.ga_client_id ?? null, saEvent)
    } catch {
      /* fire-and-forget */
    }
  })()

  // AAR-702: Offene Rückrufe des Leads zum Fall mitnehmen — fall_id setzen,
  // damit der Vereinbarende den Termin weiterhin in seinem Kalender + im
  // Fall-Kontext sieht. Status bleibt 'offen' (nicht erledigt) — der
  // Rückruf-Anlass kann auch nach SA-Unterschrift noch existieren.
  await admin.from('admin_termine')
    .update({ fall_id: fall.id, updated_at: nowIsoSa })
    .eq('lead_id', leadId)
    .eq('typ', 'rueckruf')
    .eq('status', 'offen')

  // AAR-694b: SA-Status propagieren — `syncSvCalendarEvent` liest
  // sa_unterschrieben + vollmacht_signiert_am für die Entscheidung ob ein
  // Event in den SV-Google-Kalender geschrieben wird.
  // CMM-44 SP-B PR2b: sa_unterschrieben + sa_unterschrieben_am leben auf claims
  // (SSoT) — Write nach claims verschoben (kein faelle-Write mehr).
  if (convClaimId) {
    // AAR-360 Follow-up: Gutachter-Datenschutz/Widerruf-Zustimmung mitschreiben (entkoppelt von der
    // SA-Signatur). Record-Cast: die Spalte hinkt den generierten Types hinterher (wie operative_status).
    const claimsSaUpdate: Record<string, unknown> = {
      sa_unterschrieben: true,
      sa_unterschrieben_am: nowIsoSa,
    }
    if (svDsWiderrufZugestimmt) claimsSaUpdate.sv_datenschutz_widerruf_zugestimmt_am = nowIsoSa
    await admin.from('claims').update(claimsSaUpdate).eq('id', convClaimId)
  }

  // AAR-694b: SV-Google-Kalender-Events für alle aktiven Termine syncen.
  // Bei service_typ='nur_gutachter' reicht SA → Event entsteht jetzt.
  // Bei 'komplett' wartet syncSvCalendarEvent intern auf vollmacht_signiert_am.
  import('@/lib/google-calendar/sv-event-sync').then(({ syncSvCalendarEventsForFall }) =>
    syncSvCalendarEventsForFall(fall.id).catch((err) =>
      console.warn('[signSAandCreateFall] syncSvCalendarEventsForFall:', err instanceof Error ? err.message : err),
    ),
  )

  // CalDAV-Paritaet zum gegateten Google-Sync oben: der /flow-Confirm schrieb bisher NUR
  // Google, CalDAV (Apple/Fastmail) fehlte. Das Datenschutz-Gate MUSS mit — bei 'nur_gutachter'
  // ist die SA verbindlich (jetzt syncen); 'komplett' erst in confirmVollmacht (vor Vollmacht
  // KEIN externer Event, sonst pre-Mandat-Leak). Non-critical, fire-and-forget.
  if ((lead.service_typ ?? 'komplett') === 'nur_gutachter') {
    void (async () => {
      const { data: caldavTermine } = await admin
        .from('gutachter_termine')
        .select('id')
        // bezug-aware: umgehaengte Engine-Termine koennen fall_id NULL tragen (s.o.).
        .or(bezugOrExpr('fall', fall.id))
        .eq('assignee_typ', 'sachverstaendiger')
        .in('status', ['bestaetigt', 'reserviert'])
      const { syncSvTerminToCalDav } = await import('@/lib/kalender/caldav/sv-termin-sync')
      for (const t of caldavTermine ?? []) {
        await syncSvTerminToCalDav(t.id as string).catch((err) =>
          console.warn('[signSAandCreateFall] syncSvTerminToCalDav:', err instanceof Error ? err.message : err),
        )
      }
      // SP5b: Outlook (Graph) parallel — no-op ohne MS-Verbindung/dormant.
      const { syncSvTerminToOutlook } = await import('@/lib/microsoft/sv-termin-sync')
      for (const t of caldavTermine ?? []) {
        await syncSvTerminToOutlook(t.id as string).catch((err) =>
          console.warn('[signSAandCreateFall] syncSvTerminToOutlook:', err instanceof Error ? err.message : err),
        )
      }
    })().catch((err) =>
      console.warn('[signSAandCreateFall] CalDAV-Sync:', err instanceof Error ? err.message : err),
    )
  }

  // AAR-229 W4: SA-Unterschrift Mitteilung an Admin + SV
  try {
    const { createMitteilungMulti } = await import('@/lib/mitteilungen/create-mitteilung')
    const empfaenger: Array<{ id: string; rolle: 'admin' | 'sachverstaendiger' }> = []
    if (lead.zugewiesen_an) empfaenger.push({ id: lead.zugewiesen_an as string, rolle: 'admin' })
    const { data: fallSv } = await admin.from('v_claim_full').select('sv_id').eq('fall_id', fall.id).single()
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

  // 6d. KFZ-140 / AAR-322: Pflichtdokumente Katalog-driven erstellen
  try {
    await createPflichtdokumenteFromKatalog(admin, fall.id, lead as Record<string, unknown>)
    // AAR-pflicht-sync: Lead-URLs sofort auf die frisch angelegten
    // pflicht-Slots anwenden — der Lead hat zu diesem Zeitpunkt das volle
    // Objekt, also können wir direkt durchreichen.
    const { syncLeadDokumenteAnPflicht } = await import('@/lib/dokumente/sync-lead-zu-pflicht')
    await syncLeadDokumenteAnPflicht(admin, fall.id, lead as Record<string, unknown>)
  } catch (err) { console.error('[KFZ-140] Pflichtdokumente im FlowLink-Pfad:', err) }

  // 6e. AAR-263 + AAR-182 + AAR-553: Dispatch-Uploads (ZB1 + Polizeibericht)
  // als Dokumente am Fall verfügbar machen — sonst sieht die Kanzlei sie
  // nicht. URLs zeigen auf den (ehemaligen) `dokumente`-Bucket, die Files
  // wurden von AAR-553 G1.5 nach `fall-dokumente` kopiert — daher denselben
  // internen Pfad verwenden. Idempotent via storage_path-Check.
  const urlToPath = (url: string): string | null => {
    const m = url.match(/\/storage\/v1\/object\/public\/(?:dokumente|fall-dokumente)\/(.+)$/)
    return m ? decodeURIComponent(m[1]) : null
  }
  try {
    const leadAny = lead as Record<string, unknown>
    const zb1Url = (leadAny.zb1_url as string | null) ?? null
    const polizeiberichtUrl = (leadAny.polizeibericht_url as string | null) ?? null

    const docInserts: Record<string, unknown>[] = []
    if (zb1Url) {
      const sp = urlToPath(zb1Url)
      if (sp) {
        docInserts.push({
          fall_id: fall.id,
          dokument_typ: 'fahrzeugschein',
          kategorie: 'zulassung',
          quelle: 'dispatch-wa-upload',
          storage_path: sp,
          original_filename: `Fahrzeugschein_${(leadAny.nachname as string) ?? 'unbekannt'}.jpg`,
          mime_type: 'image/jpeg',
          uploaded_by_kunde: true,
          sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'kunde'],
          beschreibung: 'Fahrzeugschein-Foto via WhatsApp eingegangen (Dispatch-Phase 4)',
        })
      }
    }
    if (polizeiberichtUrl) {
      const sp = urlToPath(polizeiberichtUrl)
      if (sp) {
        const aktz = leadAny.polizei_aktenzeichen as string | null
        docInserts.push({
          fall_id: fall.id,
          dokument_typ: 'polizeiliche_unfallmitteilung',
          kategorie: 'polizeibericht',
          quelle: 'dispatch-wa-upload',
          storage_path: sp,
          original_filename: `Polizeibericht_${(leadAny.nachname as string) ?? 'unbekannt'}_${aktz ?? 'ohne-aktz'}.jpg`,
          mime_type: 'image/jpeg',
          uploaded_by_kunde: true,
          sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'kunde'],
          beschreibung: 'Polizeiliche Unfallmitteilung via WhatsApp eingegangen (Dispatch-Phase 4)',
        })
      }
    }

    if (docInserts.length > 0) {
      const { data: existing } = await admin
        .from('fall_dokumente')
        .select('storage_path')
        .eq('fall_id', fall.id)
      const existingPaths = new Set((existing ?? []).map((d) => d.storage_path as string))
      const fresh = docInserts.filter((d) => !existingPaths.has(d.storage_path as string))
      if (fresh.length > 0) {
        await admin.from('fall_dokumente').insert(fresh)
      }
    }
  } catch (err) {
    console.error('[AAR-263] Dispatch-Uploads in fall_dokumente:', err)
  }

  // 6b. AAR-305 / AAR-553 / AAR-577: Schadensfotos aus dem Onboarding-Step
  // in fall_dokumente übertragen. Bis AAR-577 lag eine regressive urlToPath-
  // Regex hier im Einsatz, die nur den `dokumente`/`fall-dokumente`-Bucket
  // erkannte — Schadensfotos leben aber im `schadensfotos`-Bucket, ihre URLs
  // wurden still zu null gemappt und gar nicht in fall_dokumente eingetragen.
  // Fix: Pfad aus schadensfotos-URL ziehen, Datei server-seitig nach
  // `fall-dokumente` kopieren (Supabase storage.copy mit destinationBucket —
  // kein Bandbreiten-Roundtrip), dann mit dem neuen Pfad inserten. Downstream
  // getPublicUrl('fall-dokumente') erzeugt jetzt valide Preview-URLs.
  const schadensfotoPath = (url: string): string | null => {
    const m = url.match(/\/storage\/v1\/object\/public\/schadensfotos\/(.+)$/)
    return m ? decodeURIComponent(m[1]) : null
  }
  try {
    const fotoUrls = Array.isArray(lead.schadensfoto_urls)
      ? (lead.schadensfoto_urls as string[])
      : []
    if (fotoUrls.length > 0) {
      const { data: bestehendeFotos } = await admin
        .from('fall_dokumente')
        .select('storage_path')
        .eq('fall_id', fall.id)
        .eq('dokument_typ', 'schadensfotos')
      const bestehendePaths = new Set((bestehendeFotos ?? []).map((d) => d.storage_path as string))
      const neueFotos: Record<string, unknown>[] = []
      for (let i = 0; i < fotoUrls.length; i++) {
        const url = fotoUrls[i]
        const srcPath = typeof url === 'string' ? schadensfotoPath(url) : null
        if (!srcPath) continue
        const basename = srcPath.split('/').pop() ?? `schadensfoto-${i + 1}.jpg`
        const destPath = `fall/${fall.id}/schadensfotos/${basename}`
        if (bestehendePaths.has(destPath)) continue
        const copy = await admin.storage
          .from('schadensfotos')
          .copy(srcPath, destPath, { destinationBucket: 'fall-dokumente' })
        if (copy.error && !/resource already exists/i.test(copy.error.message)) {
          console.error('[AAR-577] Schadensfoto-Copy:', copy.error.message, { srcPath, destPath })
          continue
        }
        neueFotos.push({
          fall_id: fall.id,
          dokument_typ: 'schadensfotos',
          kategorie: 'schadensfotos',
          storage_path: destPath,
          original_filename: `schadensfoto-${i + 1}.jpg`,
          mime_type: 'image/jpeg',
          quelle: 'flowlink',
          uploaded_by_kunde: true,
          sichtbar_fuer: [
            'admin',
            'dispatch',
            'kundenbetreuer',
            'sachverstaendiger',
            'kanzlei',
          ],
        })
      }
      if (neueFotos.length > 0) await admin.from('fall_dokumente').insert(neueFotos)
    }
  } catch (err) {
    console.error('[AAR-305] Schadensfotos in fall_dokumente:', err)
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
        // tasks_prioritaet_check erlaubt nur normal|dringend|kritisch — 'hoch' liess den Insert
        // still scheitern (der Versicherung-anrufen-Task wurde NIE erstellt; Prod-Log 16.07.).
        prioritaet: 'dringend',
        phase: 'fallakten-start',
      })
    }
  } catch (err) {
    console.error('[AAR-306] Auto-Task versicherung-anrufen fehlgeschlagen:', err)
  }

  // 8b. KFZ-129 / AAR-310: Welcome-System-Message im Gruppenchat.
  // Teilnehmer-Sync entfällt seit AAR-102 (Teilnehmer werden aus faelle
  // abgeleitet). Getrenntes Logging pro Stage zur besseren Diagnose.
  try {
    const { sendSystemNachricht } = await import('@/lib/chatGruppe')
    await sendSystemNachricht(
      fall.id,
      `Fall ${fallNummer} wurde erstellt. Willkommen in Ihrem persönlichen Chat!`,
      { templateKey: 'welcome', templateParams: { fallNummer } },
    )
  } catch (e) {
    console.error('[KFZ-129] sendSystemNachricht (Welcome) fehlgeschlagen:', e)
  }

  // 9. WhatsApp an Kunde: EINE Nachricht zum Fall-Start (non-critical)
  //
  // H2 (Aaron-Entscheid 12.08. „drei nach Zweck"): Hier gingen bisher DREI Nachrichten
  // unmittelbar nacheinander an denselben Kunden —
  //   (a) eine handgeschriebene „👋 Willkommen … Schadenmeldung eingegangen" (weiter oben),
  //   (b) `fall_eroeffnet`: „Ihr Fall … wurde eröffnet. Wir kümmern uns um alles Weitere.",
  //   (c) `info_nach_sa`: keine Kosten / Zwei-Stufen-Zahlung / Gutachter kommt.
  // (a) und (b) sagten dasselbe, der Schlusssatz stand sogar wörtlich zweimal drin.
  // Alle drei sind jetzt in `fall_eroeffnet` gebündelt (6 Sprachen), (a) ist entfernt.
  //
  // Die Zugangsdaten-Nachricht aus createKundeAccount bleibt BEWUSST getrennt: ein
  // Passwort muss wiederauffindbar sein, nicht in einem Fließtext stehen.
  //
  // Der Termin bleibt ein eigener Zweck (T4 `termin_bestaetigt`) — hier steht nur der
  // neutrale Satz „Zu Ihrem Gutachter-Termin melden wir uns", der in beiden Fällen
  // stimmt (reserviert wie noch offen) und keine Fallunterscheidung braucht.
  try {
    const { sendFallCommunication } = await import('@/lib/communications/send-fall')
    // '2' würde sonst auf regulierung_betrag zeigen; '3' ist der Portal-Link.
    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'}/kunde/faelle/${fall.id}`
    await sendFallCommunication(fall.id, 'fall_eroeffnet', {
      '2': fallNummer,
      '3': portalUrl,
    })
  } catch { /* */ }

  // 10. WhatsApp an Gutachter: Termin bestätigt + Ablehnen-Link (KFZ-118)
  if (lead.gutachter_termin) {
    try {
      // Gutachter-Daten laden
      const { data: terminRow } = await admin.from('gutachter_termine')
        // CMM-49 (sv_id-Drop): assignee_id statt sv_id (value-identisch für SV-Termine).
        .select('id, assignee_id, ablehnen_token')
        // bezug-aware: umgehaengte Engine-Termine koennen fall_id NULL tragen (s.o.).
        .or(bezugOrExpr('fall', fall.id))
        .eq('status', 'bestaetigt')
        .limit(1)
        .maybeSingle()

      if (terminRow?.assignee_id) {
        const { data: svData } = await admin.from('sachverstaendige')
          .select('profile_id, profiles!sachverstaendige_profile_id_fkey(telefon, vorname, nachname)')
          .eq('id', terminRow.assignee_id)
          .single()

        const svProfile = (Array.isArray(svData?.profiles) ? svData?.profiles[0] : svData?.profiles) as { telefon: string | null; vorname: string | null; nachname: string | null } | null
        const svTelefon = svProfile?.telefon

        if (svTelefon) {
          const terminDate = new Date(lead.gutachter_termin)
          const datum = terminDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
          const uhrzeit = terminDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
          const kundeName = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
          const adresse = lead.fahrzeug_standort_adresse || lead.fahrzeug_standort_plz || 'Adresse folgt'
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'
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

          // Mitteilung im Gutachter-Portal (Phase 5: kanonische mitteilungen via
          // Helper. Der fruehere Raw-Insert mit `dringend` failte silent — 42703
          // keine Spalte — die SV-Termin-Notif kam also nie an; jetzt repariert.)
          const { createGutachterMitteilung } = await import('@/lib/mitteilungen')
          await createGutachterMitteilung(terminRow.assignee_id, 'termin_bestaetigt', fall.id, {
            datum,
            uhrzeit,
            kunde_name: kundeName,
            adresse,
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
        // CMM-49 (sv_id-Drop): der sachverstaendige-Embed lief über die gutachter_termine.sv_id-FK
        // (bricht beim DROP) → assignee_id + separater Lookup unten (nur vorname an Kunde, AAR-941).
        .select('id, assignee_id, assignee_typ')
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

      // CMM-21: nur Vorname an den Kunden — Vor-/Nachname zusammen würde
      // dem Kunden ermöglichen den Sachverständigen direkt zu identifizieren
      // und an Claimondo vorbei zu beauftragen.
      // CMM-49 (sv_id-Drop): SV-Vorname separat laden (assignee_id, kein FK-Embed).
      // Nur vorname an den Kunden (AAR-941, wie bisher).
      let profile: { vorname: string | null } | null = null
      if (terminRow?.assignee_id && terminRow.assignee_typ === 'sachverstaendiger') {
        const { data: svRow } = await admin.from('sachverstaendige')
          .select('profiles!sachverstaendige_profile_id_fkey(vorname)')
          .eq('id', terminRow.assignee_id)
          .maybeSingle()
        const profileRel = (svRow as { profiles: unknown } | null)?.profiles
        profile = (Array.isArray(profileRel) ? profileRel[0] : profileRel) as
          | { vorname: string | null }
          | null
      }
      const svName = (profile?.vorname ?? '').trim() || 'Ihrem Gutachter'
      const terminDate = new Date(lead.gutachter_termin)
      const datumUhrzeit = `${terminDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} um ${terminDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })}`
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
  // P4 (Review-Fund MEDIUM-2): fuer den Vermittlungs-sign-in KEINE Fresh-Fall-SLAs —
  // der Sofort-Claim steht bereits bei filmcheck mit SV + fertigem Gutachten; die
  // Zuweisungs-/Termin-/Besichtigungs-SLAs wuerden sofort breachen (spurious KB-Reminder).
  // Kasko/Selbstzahler (DIRECT_REPARATUR_WEGE): kein Gegner-VS-Prozess → weder SV-Dispatch noch
  // Zuweisungs-/Termin-/Besichtigungs-SLAs (Aaron 08.08.). Defense-in-Depth zum Client-Guard
  // (FlowWizardKfz istDirectReparatur laesst den sa-Step bei Kasko weg → signSAandCreateFall feuert
  // dort normal gar nicht; dieser Guard greift, falls es doch fuer einen Direct-Weg laeuft).
  const istDirectReparaturWeg = lead.abrechnungsweg === 'kasko' || lead.abrechnungsweg === 'selbstzahler'
  const slaPromises: Promise<unknown>[] = []
  if (!istVermittlungsSignIn && !istDirectReparaturWeg) {
    try {
      const { startSla } = await import('@/lib/sla/tracker')
      if (!svIdFromTermin) slaPromises.push(startSla(fall.id, 'gutachter_zuweisung'))
      slaPromises.push(startSla(fall.id, 'termin_bestaetigung'))
      slaPromises.push(startSla(fall.id, 'besichtigung'))
    } catch (err) { console.error('[AAR-85] SLA-Start Fehler:', err) }
  }

  // Dispatch-Matching (best SV finden) parallel — falls noch kein SV
  // AAR-663: fahrzeug_standort_lat/lng aus Self-Service-Schritt 1 priorisieren.
  // P4: nicht fuer den Vermittlungs-sign-in — der Claim HAT seinen SV (den Vermittler);
  // findBestSV waere ein nutzloser Lauf (der sv_id-Guard unten verhindert das Overwrite eh).
  const fallLat = (lead.besichtigungsort_lat ?? lead.fahrzeug_standort_lat ?? lead.unfallort_lat ?? lead.kunde_lat) as number | null
  const fallLng = (lead.besichtigungsort_lng ?? lead.fahrzeug_standort_lng ?? lead.unfallort_lng ?? lead.kunde_lng) as number | null
  if (!istVermittlungsSignIn && !svIdFromTermin && !istDirectReparaturWeg && fallLat != null && fallLng != null) {
    slaPromises.push(
      (async () => {
        try {
          const { findBestSV } = await import('@/lib/dispatch/findBestSV')
          const candidates = await findBestSV({
            fallLat: Number(fallLat),
            fallLng: Number(fallLng),
            terminDatum: (lead.gutachter_termin as string | undefined) ?? undefined,
          })
          // AAR-908 Gap 2: wenn ein Best-SV-Match vorliegt und der Fall noch
          // keinen SV hat, weisen wir den Top-Candidate direkt zu. Dadurch
          // sieht der Kunde im /flow/[token] Step 2 nicht "wir suchen einen
          // SV" sondern den realen SV. SLA-Reminder + sv_termin-Insert
          // bleibt Dispatcher-Sache (manueller Termin-Vorschlag).
          const topSv = candidates?.[0]
          if (topSv?.svId) {
            const { data: currentFall } = await admin
              .from('v_claim_full')
              .select('sv_id')
              .eq('fall_id', fall.id)
              .single()
            if (!currentFall?.sv_id) {
              // CMM-49 (faelle-Drop-Runway): sv_id claims-direkt (SSoT) statt faelle.sv_id;
              // claims.id == fall_id. claims.updated_at bumpt automatisch (+ claims-Realtime).
              await admin
                .from('claims')
                .update({ sv_id: topSv.svId, sv_zugewiesen_am: new Date().toISOString() })
                .eq('id', fall.id)
              // Engine-Funnel (Diagnose 05.08.): der sv_id-Direkt-Write allein liess den
              // operative_status auf 'ersterfassung' einfrieren (Prod: 6 Claims mit sv_id,
              // trans_n=0, Stepper dauerhaft "Erfassung" trotz zugewiesenem SV). Den Uebergang
              // durch die State-Machine funneln -> sv-zugewiesen + Event/Timeline/phase_transitions
              // (Muster wie sv-zuweisung/route.ts:307-319). Non-fatal: steht der Claim schon
              // weiter, wirft der Rueckwaerts-Uebergang -> geschluckt, sv_id bleibt gesetzt.
              try {
                await transitionFallStatus(fall.id, 'sv-zugewiesen', { grund: 'flow_findbestsv' })
              } catch (err) {
                console.warn('[flow findBestSV] transitionFallStatus(sv-zugewiesen) non-fatal:', err instanceof Error ? err.message : err)
              }
            }
          }
        } catch (err) { console.error('[AAR-85/908] Dispatch-Matching:', err) }
      })()
    )
  }

  // AAR-360 Follow-up (24.06.): Das frühere generateGutachterSA (System 1: Kunden-Unterschrift auf
  // sachverstaendige.sa_vorlage) ist entfernt — seit AAR-714 vestigial (0 SVs mit sa_vorlage;
  // Onboarding nutzt DokumenteUploadStep -> pflichtdokumente). Die Gutachter-SA kommt jetzt allein
  // aus generateGutachterPflichtdokumente (Slot sv_sicherungsabtretung, unten) und ist kundensichtbar.
  if (svIdFromTermin) {
    // Aaron 2026-04-30: Multi-Doc-Signatur — alle SV-Pflichtdokumente
    // (Sicherungsabtretung / Honorarvereinbarung / Datenschutz / Widerruf)
    // mit Kunden-Unterschrift versehen + claim-zentriert ablegen.
    // Sichtbar im SV-Auftrag, NICHT im Kunden-Portal.
    slaPromises.push(
      (async () => {
        try {
          // CMM-49 PURE_BRIDGE: via resolveClaimId (bridge-basiert, faelle-Drop-sicher).
          const claimId = await resolveClaimId(admin, fall.id)

          const { generateGutachterPflichtdokumente } = await import(
            '@/lib/sa-tool/generate-pflichtdokumente'
          )
          const results = await generateGutachterPflichtdokumente({
            admin,
            fallId: fall.id,
            claimId,
            svId: svIdFromTermin!,
            kundenVorname: (lead.vorname as string | null) ?? null,
            kundenNachname: (lead.nachname as string | null) ?? null,
            kundenSignaturUrl: signatureUrl,
          })
          for (const r of results) {
            if (!r.success) {
              const tag = r.skipped ? 'übersprungen' : 'Fehler'
              console.warn(`[Pflichtdok-Merge] ${r.slotId} ${tag}:`, r.error)
            }
          }
        } catch (err) {
          console.error('[Pflichtdok-Merge] unerwartet:', err)
        }
      })(),
    )
  }

  // AAR-377: SV-Briefing asynchron generieren. Der Fall ist bereits angelegt —
  // wenn die Claude-API Probleme macht, bleibt das Briefing NULL und kann
  // jederzeit manuell via Regenerate-Button nachgeholt werden.
  slaPromises.push(
    (async () => {
      try {
        const { generateSvBriefing } = await import('@/lib/ai/briefing')
        const result = await generateSvBriefing(fall.id)
        if (!result.success) {
          console.warn('[AAR-377] Briefing-Generierung nicht erfolgreich:', result.error)
        }
      } catch (err) {
        console.error('[AAR-377] Briefing-Generierung unerwartet:', err)
      }
    })(),
  )

  // Alle Trigger parallel ausfuehren — Fehler einzelner Trigger blockieren nicht
  await Promise.allSettled(slaPromises)

  // AAR-501 N6: fall.created + sa.signed Events (parallel, fire-and-forget)
  try {
    await Promise.allSettled([
      emitEvent('fall.created', { fallId: fall.id, leadId }, { fallId: fall.id }),
      emitEvent('sa.signed', { fallId: fall.id }, { fallId: fall.id }),
    ])
  } catch (err) {
    console.error('[AAR-501] emitEvent fall.created/sa.signed failed:', err)
  }

  // AAR-kanzlei: Outbound-Push an Kanzlei-API + Email-Fallback PARALLEL.
  // Beide nur für service_typ='komplett' (Gatekeeping in den Sub-Modulen).
  // Fire-and-forget — Fehler hier blockieren den SA-Flow NICHT.
  //
  // Warum beide parallel:
  //   - API-Push kann per KANZLEI_API_ENABLED-Flag deaktiviert sein (während
  //     Integration noch nicht live ist)
  //   - Email läuft IMMER → Audit-Trail für die Kanzlei ab Tag 1, Backup
  //     falls API-Push 500 oder HMAC-Fehler wirft
  //   - Nach API-Go-Live bleibt Email als Double-Send erhalten: Duplicate-
  //     Detection auf Kanzlei-Seite via fall_nr-external-ID
  try {
    const [{ pushMandatToKanzlei }, { sendMandatEmailToKanzlei }] = await Promise.all([
      import('@/lib/kanzlei/push-mandat'),
      import('@/lib/kanzlei/email-fallback'),
    ])
    pushMandatToKanzlei(fall.id).catch((err) =>
      console.error('[AAR-kanzlei] pushMandatToKanzlei unerwartet:', err),
    )
    sendMandatEmailToKanzlei(fall.id).catch((err) =>
      console.error('[AAR-kanzlei] sendMandatEmailToKanzlei unerwartet:', err),
    )
  } catch (err) {
    console.error('[AAR-kanzlei] Kanzlei-Modul-Load-Fehler:', err)
  }

  // AAR-802: Cache-Invalidation der UIs die den neuen Fall + Lead-Update sehen
  revalidatePath('/admin/faelle')
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/dashboard')
  revalidatePath(`/dispatch/leads/${leadId}`)

  return { ok: true, fallId: fall.id }

  } catch (err) {
    console.error('[signSAandCreateFall] FEHLER:', err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * KFZ-192: Vollmacht unterschrieben → Termin bestätigen (nur für service_typ='komplett').
 * Wird aufgerufen nachdem Kunde Vollmacht unterschrieben hat.
 */
// confirmVollmacht wurde nach @/lib/vollmacht/confirm-vollmacht verschoben (Security-
// Relocation, Route-Audit-Handoff): raus aus dieser 'use server'-Action-Datei -> keine
// latente IDOR-Endpoint-Surface mehr (die Funktion nahm rohe fallId + admin-Client ohne
// Ownership-Bindung). Beide Caller (kanzlei-wunsch/actions + lexdrive/process-event) sind
// server-intern und importieren jetzt aus dem Lib-Modul.

// Initial-Passwort-Generator: siehe @/lib/auth/generate-initial-password
// (CSPRNG, bias-frei) — ersetzt die fruehere Math.random()-Variante.

