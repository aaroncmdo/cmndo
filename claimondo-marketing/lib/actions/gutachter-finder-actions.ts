'use server'

import { randomBytes } from 'node:crypto'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { checkAndCacheAvailability } from '@/lib/whatsapp/availability'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { sendEmail } from '@/lib/email/google/client'
import { getConsentedGaClientId, trackServerConversion, SA_SIGNED_VALUE_EUR } from '@/lib/analytics/ga4-conversions'

// Privacy-by-default: nur Geokoordinaten + ID. Tier-3 sv_leads (Excel-Import,
// keine Pakete, keine Reviews) sind auf der Marketing-Karte komplett
// anonymisierte Dead-Pins — keine Firma, keine Adresse, keine Kontaktdaten,
// kein Vorname dürfen auf den anonymen Client.
export type SvLeadPublic = {
  id: string
  lat: number
  lng: number
}

// Tier-1 SVs (sachverstaendige). 2026-06-02 (Aaron "die Profile sollen public
// sein"): JEDER verifizierte, aktive SV (RLS-gegated auf verifiziert+map_ready)
// bekommt ein klickbares anonymes Profil-Popup (Sterne, Specs, Region, Initiale)
// — nicht mehr nur paket='standard'. `paket` bleibt im Typ für künftige
// Differenzierung. Felder werden für alle zurückgegebenen Zeilen befüllt.
export type AktiverSVPublic = {
  id: string
  standort_lat: number
  standort_lng: number
  isochrone_polygon: unknown
  paket: string
  vorname_initiale: string | null
  stadt: string | null
  spezifikationen_top3: string[]
  bewertungs_durchschnitt: number | null
  bewertungs_anzahl: number | null
}

export type GutachterFinderPayload = {
  vorname: string
  nachname: string
  email: string
  telefon?: string
  kennzeichen?: string
  fahrzeug_beschreibung?: string
  schadentyp: string
  schadenort?: string
  schadenort_lat?: number
  schadenort_lng?: number
  wunschtermin?: string
  zugeordneter_sv_id?: string
  zugeordneter_sv_lead_id?: string
  matching_typ?: string
  sa_signatur_data_url?: string
  // Z35-Wahl: vollstaendig (Anwalt + alle Positionen) vs. nur_gutachten (Selbst-Regulierung)
  regulierungs_modus?: 'vollstaendig' | 'nur_gutachten'
  // Aaron 10.05.: Vor-Ort-Routing am Funnel-Anfang. JA-Pfad fuehrt in Foto-Wizard
  // statt klassischer Termin-Buchung.
  am_unfallort_flag?: boolean
  aufnahme_fotos?: string[] // Base64-Data-URLs aus dem Foto-Wizard
}

// Extrahiert die Stadt aus einer typischen Adresse:
//   "Schützenstraße 68-70, 42853 Remscheid" → "Remscheid"
//   "Mediapark 5, 50670 Köln" → "Köln"
// Privacy-Note: Stadt ist anonym genug (Köln hat 200+ Gutachter). Straße +
// Hausnummer kämen NICHT zum Client — die liegen nur in der Server-Action.
function extractStadt(adresse: string | null | undefined): string | null {
  if (!adresse) return null
  const match = adresse.match(/,\s*\d{5}\s+(.+?)$/)
  if (match?.[1]) return match[1].trim()
  // Fallback: letzter Komma-Teil, PLZ-Prefix abschneiden
  const parts = adresse.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 0) return parts[parts.length - 1].replace(/^\d{5}\s+/, '')
  return null
}

function firstInitial(name: string | null | undefined): string | null {
  if (!name) return null
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : null
}

// Aaron-Smoke 14.05.2026: "Test Aaron Gutachter GmbH" + "Smoke SV" sind
// interne Demo-Accounts die NICHT auf der Marketing-Karte erscheinen sollen
// (Customer sieht sonst "Sachverständiger in Köln Test" o.ä. — peinlich +
// verfälscht den Marker-Count). Heuristik: Firmenname enthält Test/Smoke/Demo
// als Wort-Token. Kein DB-Flag (yet) — wenn ein echter SV namens "Testfeld
// Gutachter GmbH" reinkommt, müssen wir auf ist_test-Spalte upgraden.
function isTestAccount(firmenname: string | null | undefined): boolean {
  if (!firmenname) return false
  return /\b(test|smoke|demo)\b/i.test(firmenname)
}

export async function ladeSvLeads(): Promise<{ ok: true; data: SvLeadPublic[] } | { ok: false; error: string }> {
  // Privacy: sv_leads sind Tier-3 Excel-Importe ohne Pakete. Auf der Karte
  // erscheinen sie als Dead-Pins ohne Popup — wir reichen daher KEINE
  // identifizierenden Felder raus (kein name, firma, adresse, telefon, email).
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sv_leads')
    .select('id,lat,lng')
    .eq('ist_aktiv', true)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as SvLeadPublic[] }
}

export async function ladeAktiveSVs(): Promise<{ ok: true; data: AktiverSVPublic[] } | { ok: false; error: string }> {
  // Read 1 (anon-RLS): Geo + paket + spezifikationen + firmenname (NUR für
  // Test-Account-Filter — wird NICHT in den Public-Typ weitergereicht).
  //
  // KEIN .eq('ist_aktiv', true): `ist_aktiv` ist NICHT in den anon-Spalten-Grants
  // (anon-Leak-Fix granted nur 9 Map-Spalten). Ein Filter darauf wirft als anon
  // "permission denied for table sachverstaendige" und killt den GESAMTEN Read
  // → 0 SVs auf der Marketing-Karte (nur sv_lead-Dead-Pins). Die anon-RLS-Policy
  // `sachverstaendige_anon_select_map_ready` erzwingt ist_aktiv=true +
  // verifiziert=true + geloescht_am IS NULL ohnehin server-seitig — der App-Filter
  // war redundant. isochrone_polygon + standort_lat SIND granted → Filter ok.
  const supabase = await createClient()
  const { data: allRows, error } = await supabase
    .from('sachverstaendige')
    .select('id,paket,profile_id,firmenname,standort_lat,standort_lng,standort_adresse,spezifikationen,isochrone_polygon')
    .not('isochrone_polygon', 'is', null)
    .not('standort_lat', 'is', null)
  if (error) return { ok: false, error: error.message }
  // Test-Accounts ("Test Aaron Gutachter GmbH", "Smoke SV") server-side filtern
  // — firmenname verlässt diese Function nie.
  const rows = (allRows ?? []).filter((r) => !isTestAccount(r.firmenname as string | null))
  if (rows.length === 0) return { ok: true, data: [] }

  // Read 2 (Service-Role): Vorname-Initiale + Reviews für ALLE verifizierten SVs
  // (2026-06-02, Aaron: "die Profile sollen public sein" — nicht mehr nur
  // paket='standard'). profiles + google_bewertungen_cache sind anon-RLS-blocked
  // — wir lesen sie intern via Service-Role und reichen nur die anonymisierten
  // Aggregate raus (Vorname-Initiale, Review-Schnitt+Anzahl).
  const profilRows = rows.filter((r) => r.profile_id)
  const profileIds = Array.from(new Set(profilRows.map((r) => r.profile_id as string)))

  const vornameByProfileId = new Map<string, string | null>()
  const bewertungByProfileId = new Map<string, { durchschnitt: number; anzahl: number }>()

  if (profileIds.length > 0) {
    const admin = createAdminClient()
    const [profilesRes, bewRes] = await Promise.all([
      admin.from('profiles').select('id,vorname').in('id', profileIds),
      admin
        .from('google_bewertungen_cache')
        .select('profile_id,durchschnitt,anzahl_bewertungen')
        .in('profile_id', profileIds),
    ])
    if (profilesRes.data) {
      for (const p of profilesRes.data) vornameByProfileId.set(p.id, p.vorname)
    }
    if (bewRes.data) {
      for (const b of bewRes.data) {
        bewertungByProfileId.set(b.profile_id, {
          durchschnitt: Number(b.durchschnitt),
          anzahl: b.anzahl_bewertungen ?? 0,
        })
      }
    }
  }

  const mapped: AktiverSVPublic[] = rows.map((r) => {
    const profileId = r.profile_id as string | null
    const vorname = profileId ? vornameByProfileId.get(profileId) ?? null : null
    const bew = profileId ? bewertungByProfileId.get(profileId) : undefined
    const specsAll = Array.isArray(r.spezifikationen) ? (r.spezifikationen as string[]) : []
    return {
      id: r.id,
      standort_lat: Number(r.standort_lat),
      standort_lng: Number(r.standort_lng),
      isochrone_polygon: r.isochrone_polygon,
      paket: r.paket,
      vorname_initiale: firstInitial(vorname),
      stadt: extractStadt(r.standort_adresse as string | null),
      spezifikationen_top3: specsAll.slice(0, 3),
      bewertungs_durchschnitt: bew ? bew.durchschnitt : null,
      bewertungs_anzahl: bew ? bew.anzahl : null,
    }
  })

  return { ok: true, data: mapped }
}

export async function erstelleGutachterFinderAnfrage(
  payload: GutachterFinderPayload,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient()

  // GA4-Conversion-Attribution: client_id aus _ga-Cookie (nur bei Consent).
  const gaClientId = await getConsentedGaClientId()

  const { data, error } = await supabase
    .from('gutachter_finder_anfragen')
    .insert({
      ga_client_id: gaClientId,
      vorname: payload.vorname,
      nachname: payload.nachname,
      email: payload.email,
      telefon: payload.telefon ?? null,
      kennzeichen: payload.kennzeichen ?? null,
      fahrzeug_beschreibung: payload.fahrzeug_beschreibung ?? null,
      schadentyp: payload.schadentyp,
      schadenort: payload.schadenort ?? null,
      schadenort_lat: payload.schadenort_lat ?? null,
      schadenort_lng: payload.schadenort_lng ?? null,
      wunschtermin: payload.wunschtermin ?? null,
      zugeordneter_sv_id: payload.zugeordneter_sv_id ?? null,
      zugeordneter_sv_lead_id: payload.zugeordneter_sv_lead_id ?? null,
      matching_typ: payload.matching_typ ?? null,
      sa_signatur_data_url: payload.sa_signatur_data_url ?? null,
      sa_unterzeichnet_am: payload.sa_signatur_data_url ? new Date().toISOString() : null,
      regulierungs_modus: payload.regulierungs_modus ?? null,
      am_unfallort_flag: payload.am_unfallort_flag ?? false,
      aufnahme_fotos: payload.aufnahme_fotos && payload.aufnahme_fotos.length > 0
        ? payload.aufnahme_fotos
        : null,
      aufgenommen_am: payload.aufnahme_fotos && payload.aufnahme_fotos.length > 0
        ? new Date().toISOString()
        : null,
      status: 'neu',
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  const anfrageId = data.id

  // GA4-Conversions (fire-and-forget, consent-respektierend via gaClientId).
  // generate_lead immer; sa_signed wenn die SA direkt im Wizard unterzeichnet wurde.
  void trackServerConversion(gaClientId, { name: 'generate_lead', params: { source: 'gutachter_finder' } })
  if (payload.sa_signatur_data_url) {
    void trackServerConversion(gaClientId, { name: 'sa_signed', params: { source: 'gutachter_finder', value: SA_SIGNED_VALUE_EUR, currency: 'EUR' } })
  }

  // WhatsApp-Verfügbarkeit prüfen + cachen (fire-and-forget — VPS-PM2,
  // kein Vercel-Cold-Kill-Risiko). Ergebnis landet in
  // gutachter_finder_anfragen.whatsapp_* — Dispatch sieht im Detail-View
  // ob WA-Send möglich ist bevor er den SV anruft.
  if (payload.telefon) {
    void checkAndCacheAvailability('gfa', anfrageId, payload.telefon).catch((err) => {
      console.error('[whatsapp-check] gfa failed:', err)
    })
  }

  // Dispatch-Task: alle dispatch/admin-User informieren dass ein SV angerufen werden muss
  try {
    const admin = createAdminClient()

    // SV-Name ermitteln für den Task-Text
    let svName = 'Unbekannt'
    let svTelefon: string | null = null

    if (payload.zugeordneter_sv_id) {
      const { data: sv } = await admin
        .from('sachverstaendige')
        .select('firmenname, profiles(anzeigename, telefon)')
        .eq('id', payload.zugeordneter_sv_id)
        .single()
      if (sv) {
        const profil = Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles
        svName = sv.firmenname ?? (profil as { anzeigename?: string } | null)?.anzeigename ?? 'SV'
        svTelefon = (profil as { telefon?: string } | null)?.telefon ?? null
      }
    } else if (payload.zugeordneter_sv_lead_id) {
      const { data: lead } = await admin
        .from('sv_leads')
        .select('name, telefon')
        .eq('id', payload.zugeordneter_sv_lead_id)
        .single()
      if (lead) {
        svName = lead.name
        svTelefon = lead.telefon
      }
    }

    const wunschterminText = payload.wunschtermin
      ? new Date(payload.wunschtermin).toLocaleString('de-DE', {
          weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        })
      : 'kein Termin'

    const taskInhalt = [
      `Kunde: ${payload.vorname} ${payload.nachname}`,
      `Schaden: ${payload.schadentyp}`,
      `Wunschtermin: ${wunschterminText}`,
      svTelefon ? `SV-Tel.: ${svTelefon}` : null,
      payload.sa_signatur_data_url ? '✓ SA unterzeichnet' : '⚠ SA noch nicht unterzeichnet',
    ]
      .filter(Boolean)
      .join(' · ')

    // Alle Dispatch-User laden und Task-Mitteilung senden
    const { data: dispatchUser } = await admin
      .from('profiles')
      .select('id')
      .eq('rolle', 'dispatch')

    const mitteilungen = (dispatchUser ?? []).map((u: { id: string }) => ({
      empfaenger_id: u.id,
      empfaenger_rolle: 'dispatch' as const,
      kategorie: 'anruf' as const,
      titel: `SV anrufen: ${svName} — Gutachter-Finder Buchung`,
      inhalt: taskInhalt,
      kontext_typ: null,
      kontext_id: null,
      route_url: `/dispatch/gutachter-finder/${anfrageId}`,
      prioritaet: 'hoch' as const,
      icon: '📞',
    }))

    if (mitteilungen.length > 0) {
      await admin.from('mitteilungen').insert(mitteilungen)
    }
  } catch (taskErr) {
    console.error('[GutachterFinder] Dispatch-Task fehlgeschlagen:', taskErr)
  }

  revalidatePath('/admin/faelle')
  revalidatePath('/dispatch/dashboard')
  return { ok: true, id: anfrageId }
}

// AAR-955: Live-Buchung aus dem Marketing-Finder. Erzeugt eine self-service-
// eligible Anfrage (source NULL) mit dem karten-gewählten SV + mintet direkt
// einen self_service_token, damit der Wizard den User INLINE in den bestehenden
// Self-Service-Flow /anfrage/[token] (Haupt-App: SelbstQuali → SA → TerminBuchung
// mit der fixerSvId-SV-Weiche, verifiziert von der Termin-Engine) leiten kann.
//
// Bewusst NICHT issueSelfServiceFlowLink: das liegt main-app-only (Cross-App-
// Grenze, src/lib/self-service/) + sendet WA/Email (hier inline, kein Send nötig).
// /anfrage/[token] validiert NUR self_service_token + Expiry (verifiziert,
// actions.ts:42-48) — gleiches AAR-940-Sicherheitsmodell. Interim-Issuer; später
// auf einen gemeinsamen Issuer umstellbar (Owner Self-Service/Termin-Engine,
// AAR-955). KEIN Dispatch-"SV-anrufen"-Task (Kunde bucht selbst), anders als
// erstelleGutachterFinderAnfrage (Rückruf-Pfad).
const APP_PORTAL_URL = 'https://app.claimondo.de'
const SELF_SERVICE_TOKEN_TTL_MS = 72 * 60 * 60 * 1000

export async function starteLiveBuchung(payload: {
  vorname: string
  nachname: string
  email: string
  telefon: string
  schadentyp: string
  zugeordneter_sv_id?: string
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const vorname = payload.vorname?.trim() ?? ''
  const nachname = payload.nachname?.trim() ?? ''
  const email = payload.email?.trim() ?? ''
  const telefon = payload.telefon?.trim() ?? ''
  if (vorname.length < 2 || nachname.length < 2) return { ok: false, error: 'Bitte Vor- und Nachnamen angeben.' }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' }
  if (!/[\+0-9\s\-()]{8,}/.test(telefon)) return { ok: false, error: 'Bitte eine gültige Telefonnummer angeben.' }
  if (!payload.schadentyp) return { ok: false, error: 'Bitte den Schadentyp wählen.' }

  const admin = createAdminClient()
  const token = randomBytes(16).toString('hex')

  // self_service_token-Spalten sind (noch) nicht in den generierten Types -> Cast (wie issue-flowlink.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anfrage, error } = await (admin as any)
    .from('gutachter_finder_anfragen')
    .insert({
      vorname,
      nachname,
      email,
      telefon,
      schadentyp: payload.schadentyp,
      zugeordneter_sv_id: payload.zugeordneter_sv_id ?? null,
      matching_typ: payload.zugeordneter_sv_id ? 'karte-klick-live' : 'live',
      status: 'neu',
      self_service_token: token,
      self_service_token_expires_at: new Date(Date.now() + SELF_SERVICE_TOKEN_TTL_MS).toISOString(),
    })
    .select('id')
    .single()
  if (error || !anfrage) {
    console.error('[starteLiveBuchung] Insert fehlgeschlagen:', error?.message)
    return { ok: false, error: 'Konfigurationsfehler — bitte rufen Sie an: +49 221 25 906 530' }
  }

  // GA4-Conversion (fire-and-forget, consent-respektierend).
  try {
    const gaClientId = await getConsentedGaClientId()
    void trackServerConversion(gaClientId, { name: 'generate_lead', params: { source: 'gutachter_finder_live' } })
  } catch {
    /* nicht kritisch */
  }

  const url = `${APP_PORTAL_URL}/anfrage/${token}`

  // FlowLink zusätzlich an den Kunden senden (WA bevorzugt, Email-Fallback) — Backup,
  // falls der User den Inline-Flow verlässt + Bestätigung "auf dem Handy". Non-blocking
  // via after() (Baileys/Email darf den Redirect nie verzögern/brechen). Spiegelt
  // issueSelfServiceFlowLink (gfa-Ebene) mit den Marketing-App-Bausteinen.
  const anfrageId = (anfrage as { id: string }).id
  after(async () => {
    try {
      await sendeFlowLinkAnAnfrage({ anfrageId, telefon, email, vorname, url })
    } catch (err) {
      console.error('[starteLiveBuchung] FlowLink-Versand fehlgeschlagen (nicht kritisch):', (err as Error).message)
    }
  })

  return { ok: true, url }
}

// FlowLink an die Anfrage senden (WA bevorzugt via 'gfa'-Verfügbarkeit, sonst
// Email). Spiegelt sendeLink aus src/lib/self-service/issue-flowlink.ts — hier
// repliziert, weil issue-flowlink main-app-only ist (Cross-App-Grenze). Kein
// neuer anon-Schreibpfad: der Token steht schon auf der Anfrage.
function flowLinkText(vorname: string, url: string): string {
  const greet = vorname ? `Hallo ${vorname}` : 'Hallo'
  return [
    `${greet}, hier geht es zu Ihrer Terminbuchung bei Claimondo.`,
    '',
    'Ihr persönlicher Link (gültig 72 Stunden):',
    url,
    '',
    'Mit wenigen Klicks prüfen wir Ihren Fall, Sie unterschreiben die Vollmacht und buchen Ihren Gutachter-Termin.',
  ].join('\n')
}

function flowLinkHtml(vorname: string, url: string): string {
  const greet = vorname ? `Hallo ${vorname}` : 'Hallo'
  return (
    `<p>${greet},</p>` +
    `<p>hier geht es zu Ihrer Terminbuchung bei Claimondo. Mit wenigen Klicks prüfen wir Ihren Fall, Sie unterschreiben die Vollmacht und buchen Ihren Gutachter-Termin.</p>` +
    `<p><a href="${url}">Jetzt Termin buchen</a> (Link gültig 72 Stunden)</p>` +
    `<p style="color:#888;font-size:12px">${url}</p>`
  )
}

async function sendeFlowLinkAnAnfrage(opts: {
  anfrageId: string
  telefon: string
  email: string
  vorname: string
  url: string
}): Promise<void> {
  const { anfrageId, telefon, email, vorname, url } = opts
  // WhatsApp bevorzugt — nur wenn laut 'gfa'-Cache/Lookup verfügbar.
  if (telefon && telefon.trim().length >= 6) {
    try {
      const wa = await checkAndCacheAvailability('gfa', anfrageId, telefon)
      if (wa.verfuegbar === true) {
        const sent = await sendWhatsAppText(telefon, flowLinkText(vorname, url))
        if (sent.ok) return
      }
    } catch (err) {
      console.error('[sendeFlowLinkAnAnfrage] WA-Send fehlgeschlagen:', (err as Error).message)
    }
  }
  // Email-Fallback.
  if (email && email.includes('@')) {
    await sendEmail({
      to: email,
      subject: 'Ihre Terminbuchung bei Claimondo',
      html: flowLinkHtml(vorname, url),
      empfaengerTyp: 'kunde',
      template: 'self_service_flowlink',
    })
  }
}
