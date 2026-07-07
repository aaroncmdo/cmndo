import { createAdminClient } from '@/lib/supabase/admin'
import { buildWelcomeConfirmLink } from '@/lib/auth/welcome-link'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { resolveGegnerVersicherung } from '@/lib/claims/gegner-versicherung'
import { getStorageUrl, STORAGE_TTL } from '@/lib/storage/url'
import { sendEmail } from './client'
import { render } from '@react-email/render'
// AAR-branding-rest: SV-Whitelabel für Kunden-gerichtete Mails (null = Claimondo)
import { resolveEmailBranding } from '@/lib/branding/token-theme'
// P2: phasenabhängiger Ansprechpartner + Fahrzeug-Render (KundeWelcome-Flagship)
import { resolveKundeBerater } from './kunde-berater'
import { buildImaginUrl, type LackfarbeCode } from '@/lib/fahrzeug/imagin'
// P1b: gebackenes Hero-Bild (sharp + email-hero-Bucket)
import { getOrCreateHeroImageUrl } from '../hero-image/store'

import { KundeWelcomeEmail, subject as kundeWelcomeSubject } from './templates/KundeWelcome'
import { SvAuftragszusammenfassungEmail, subject as svAuftragSubject } from './templates/SvAuftragszusammenfassung'
import { SvAbrechnungEmail, subject as svAbrechnungSubject } from './templates/SvAbrechnung'
import { SvRechnungEmail, subject as svRechnungSubject } from './templates/SvRechnung'
import { KanzleiAuftragszusammenfassungEmail, subject as kanzleiAuftragSubject } from './templates/KanzleiAuftragszusammenfassung'
import { KanzleiAbrechnungRechnungEmail, subject as kanzleiAbrechnungSubject } from './templates/KanzleiAbrechnungRechnung'
import { MarketingAbrechnungEmail, subject as marketingAbrechnungSubject } from './templates/MarketingAbrechnung'
import { SvTerminBestaetigungEmail, subject as svTerminBestaetigungSubject } from './templates/SvTerminBestaetigung'
import { DispatcherTerminAbgelehntEmail, subject as dispatcherAbgelehntSubject } from './templates/DispatcherTerminAbgelehnt'
import { DispatcherGegenvorschlagEmail, subject as dispatcherGegenvorschlagSubject } from './templates/DispatcherGegenvorschlag'
import { KanzleiMonatsAbrechnungEmail, subject as kanzleiMonatsAbrechnungSubject } from './templates/KanzleiMonatsAbrechnung'
import { WillkommenSvEmail, subject as willkommenSvSubject } from './templates/WillkommenSv'
import { WillkommenSvAnBueroEmail, subject as willkommenSvAnBueroSubject } from './templates/WillkommenSvAnBuero'
import { FlowLinkVersandEmail, subject as flowLinkVersandSubject } from './templates/FlowLinkVersand'
import { MiniWizardMagicLinkEmail, subject as miniWizardMagicLinkSubject } from './templates/MiniWizardMagicLink'
import { SvBasicClaimLinkEmail, subject as svBasicClaimLinkSubject } from './templates/SvBasicClaimLink'
import { MaklerWelcomeEmail, subject as maklerWelcomeSubject } from './templates/MaklerWelcome'
import { WillkommenWerkstattEmail, subject as willkommenWerkstattSubject } from './templates/WillkommenWerkstatt'
import { MaklerWochenReportEmail, subject as maklerWochenReportSubject } from './templates/MaklerWochenReport'
import type { MaklerWochenReportData } from '@/lib/makler/wochenreport'
import { wochenreportOptOutUrl } from '@/lib/makler/wochenreport-optout'

const admin = () => createAdminClient()

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
}
function fmtCurrency(val: number | null): string {
  if (val == null) return '0,00 EUR'
  return val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'
}

// ─── 1. Kunde Welcome ──────────────────────────────────────────────────────

// AAR-127: optional loginInfo (Magic-Link + Zugangsdaten) für die Welcome-Mail
// nach createKundeAccount. Bei vorhandenem loginInfo wird die Idempotenz-Sperre
// übergangen — der erste, generische Welcome (BUG-71 vor SA) hatte noch keine
// Login-Daten, der zweite mit loginInfo soll sie nachliefern.
export type KundeWelcomeLoginInfo = {
  magicLink: string | null
  email: string
  password: string
}

export async function sendKundeWelcome(
  fallId: string,
  loginInfo?: KundeWelcomeLoginInfo | null,
): Promise<void> {
  const db = admin()

  // BUG-71: Idempotenz — nur einmal pro Fall.
  // AAR-127: Skip Idempotenz wenn loginInfo gesetzt — Login-Daten sollen sicher raus.
  if (!loginInfo) {
    // CMM-49: email_log claim-gekeyt; interim faelle.claim_id-Lookup fuer Dedup (P4-TODO: threaden).
    const claimId = await resolveClaimId(db, fallId)
    const { data: alreadySent } = await db.from('email_log').select('id').eq('claim_id', claimId ?? '00000000-0000-0000-0000-000000000000').eq('template', 'kunde_welcome').eq('status', 'sent').limit(1).maybeSingle()
    if (alreadySent) { console.log(`[KFZ-137] Welcome-Mail für Fall ${fallId} bereits gesendet, skip`); return }
  }

  // CMM-44 SP-A2 (Cluster 1): schadentag aus claims (SSoT) via claim_id-Embed.
  // CMM-44 SP-D PR2a: besichtigungsort_adresse aus gutachter_termine (SSoT) — via termin-Row weiter unten.
  // CMM-49: v_claim_full (entity-sourced, LOSS=0 verifiziert). Alias claim_id:id erhaelt das
  // faelle-Shape; claim_nummer/schadentag/vehicle_id flach (Embed entfaellt). USE-Read (Email).
  const { data: fall } = await db.from('v_claim_full').select('lead_id, sv_id, kunde_id, claim_id:id, fahrzeug_hersteller, fahrzeug_modell, kennzeichen, lackfarbe_code, claim_nummer, schadentag, vehicle_id').eq('fall_id', fallId).single()
  if (!fall) return
  const fallClaim = fall

  // CMM-50.3b: Fahrzeug vehicles-first (claims.vehicle_id -> vehicles), faelle-Snapshot
  // (fahrzeug_*/kennzeichen/lackfarbe_code) als Fallback. Bis der 50.0-Write-Path vehicles
  // fuellt, greift durchgaengig der Fallback (funktional No-Op).
  let welcomeVeh: { hersteller: string | null; modell_haupttyp: string | null; kennzeichen_aktuell: string | null; farbcode: string | null } | null = null
  const welcomeVehicleId = (fallClaim as { vehicle_id?: string | null } | null)?.vehicle_id ?? null
  if (welcomeVehicleId) {
    const { data: v } = await db.from('vehicles').select('hersteller, modell_haupttyp, kennzeichen_aktuell, farbcode').eq('id', welcomeVehicleId).maybeSingle()
    welcomeVeh = (v as { hersteller: string | null; modell_haupttyp: string | null; kennzeichen_aktuell: string | null; farbcode: string | null } | null)
  }
  const welcomeFzHersteller = welcomeVeh?.hersteller ?? (fall.fahrzeug_hersteller as string | null) ?? null
  const welcomeFzModell = welcomeVeh?.modell_haupttyp ?? (fall.fahrzeug_modell as string | null) ?? null
  const welcomeFzKennzeichen = welcomeVeh?.kennzeichen_aktuell ?? (fall.kennzeichen as string | null) ?? null
  const welcomeFzLackfarbe = welcomeVeh?.farbcode ?? (fall.lackfarbe_code as string | null) ?? null

  // Track B (Doc 48): Empfaenger-Locale aus leads.sprache (kunde-seitiger SSoT).
  let locale = 'de'
  if (fall.lead_id) {
    const { data: leadLoc } = await db.from('leads').select('sprache').eq('id', fall.lead_id).maybeSingle()
    if (leadLoc?.sprache) locale = leadLoc.sprache as string
  }

  // Kunde-Email
  let kundeEmail: string | null = null
  let vorname = 'Kunde'
  if (fall.kunde_id) {
    const { data: p } = await db.from('profiles').select('email, vorname').eq('id', fall.kunde_id).single()
    kundeEmail = p?.email ?? null
    vorname = p?.vorname ?? 'Kunde'
  }
  if (!kundeEmail && fall.lead_id) {
    const { data: l } = await db.from('leads').select('email, vorname').eq('id', fall.lead_id).single()
    kundeEmail = l?.email ?? null
    vorname = l?.vorname ?? 'Kunde'
  }
  if (!kundeEmail) throw new Error('Keine Email-Adresse für Kunden')

  // Versicherung — SSoT: kanonische Gegner-Versicherung aus v_claim_full
  // (loest das tote parteien/rolle='gegner'-Read ab, s. resolveGegnerVersicherung).
  const versicherung = (await resolveGegnerVersicherung(db, { fallId })).name ?? '—'

  // SV-Name
  let svName: string | null = null
  if (fall.sv_id) {
    const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id).single()
    if (sv?.profile_id) {
      const { data: p } = await db.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
      if (p) svName = [p.vorname, p.nachname].filter(Boolean).join(' ') || null
    }
  }

  // BUG-71: Pruefen ob Account schon existiert + FlowLink-Token fuer "Konto erstellen"-Link
  const accountExists = !!fall.kunde_id
  let flowToken: string | null = null
  if (!accountExists && fall.lead_id) {
    const { data: fl } = await db.from('flow_links').select('token').eq('lead_id', fall.lead_id).eq('status', 'abgeschlossen').limit(1).maybeSingle()
    flowToken = fl?.token ?? null
  }

  // BUG-72: Termin-Info laden (naechster zukuenftiger Termin)
  // CMM-44 SP-D PR2a: besichtigungsort_adresse aus gutachter_termine (SSoT).
  let terminInfo: { datum: string; uhrzeit: string; adresse: string; svName: string | null } | null = null
  const { data: termin } = await db.from('gutachter_termine')
    // CMM-49 (sv_id-Drop): assignee_id statt sv_id (value-identisch für SV-Termine).
    .select('start_zeit, assignee_id, fall_id, besichtigungsort_adresse')
    .eq('fall_id', fallId)
    .in('status', ['reserviert', 'bestaetigt'])
    .gte('start_zeit', new Date().toISOString())
    .order('start_zeit', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (termin) {
    const tDate = new Date(termin.start_zeit)
    let terminSvName: string | null = svName
    if (!terminSvName && termin.assignee_id) {
      const { data: sv2 } = await db.from('sachverstaendige').select('profile_id').eq('id', termin.assignee_id).single()
      if (sv2?.profile_id) {
        const { data: p2 } = await db.from('profiles').select('vorname, nachname').eq('id', sv2.profile_id).single()
        if (p2) terminSvName = [p2.vorname, p2.nachname].filter(Boolean).join(' ') || null
      }
    }
    terminInfo = {
      datum: tDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }),
      uhrzeit: tDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
      adresse: (termin.besichtigungsort_adresse as string | null) ?? '—',
      svName: terminSvName,
    }
  }

  // Separate GT-Query fuer besichtigungsort_adresse wenn kein Termin vorhanden
  let fallBesichtigungsortAdresse: string | null = null
  if (termin?.besichtigungsort_adresse) {
    fallBesichtigungsortAdresse = termin.besichtigungsort_adresse as string | null
  } else if ((fall as { claim_id?: string | null }).claim_id) {
    const { data: aktTerminEmail } = await db
      .from('gutachter_termine')
      .select('besichtigungsort_adresse')
      .eq('claim_id', (fall as { claim_id: string }).claim_id)
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    fallBesichtigungsortAdresse = (aktTerminEmail?.besichtigungsort_adresse as string | null) ?? null
  }

  // P2: phasenabhängiger Berater — pre-Termin Dispatcher (leads.zugewiesen_an),
  // post-Termin Kundenbetreuer (claims.kundenbetreuer_id). Welcome ist i.d.R. pre-Termin.
  let terminVergangen = false
  {
    const { data: pastTermin } = await db.from('gutachter_termine')
      .select('id').eq('fall_id', fallId).eq('status', 'bestaetigt')
      .lt('start_zeit', new Date().toISOString()).limit(1).maybeSingle()
    terminVergangen = !!pastTermin
  }
  const berater = await resolveKundeBerater(db, {
    claimId: (fall.claim_id as string | null) ?? null,
    leadId: (fall.lead_id as string | null) ?? null,
    terminVergangen,
  })

  // P1b/P2: Hero-Bild-Kaskade. Bevorzugt der gebackene Hero (composeHero + email-hero-
  // Bucket); fällt er aus → VehicleCard mit direkter imagin-URL; ist imagin nicht live
  // → beides null → flacher Navy-Hero. Jeder Schritt defensiv (Mail darf nie brechen).
  const fahrzeug = {
    hersteller: welcomeFzHersteller,
    modell: welcomeFzModell,
    lackfarbe: (welcomeFzLackfarbe as LackfarbeCode | null) ?? null,
  }
  const heroBildUrl = await getOrCreateHeroImageUrl(db, fahrzeug)
  const imaginLive = (process.env.NEXT_PUBLIC_IMAGIN_CUSTOMER ?? 'demo') !== 'demo'
  const fahrzeugBildUrl = heroBildUrl
    ? null
    : imaginLive
      ? buildImaginUrl({ ...fahrzeug, baujahr: null })
      : null

  const props = {
    locale,
    vorname,
    fallNummer: fallClaim?.claim_nummer ?? fallId.slice(0, 8),
    unfallDatum: fmtDate(fallClaim?.schadentag ?? null),
    adresse: fallBesichtigungsortAdresse ?? '—',
    fahrzeug: [welcomeFzHersteller, welcomeFzModell].filter(Boolean).join(' ') || welcomeFzKennzeichen || '—',
    versicherung,
    svName,
    accountExists,
    flowToken,
    terminInfo,
    // AAR-127: an Template durchreichen — wenn vorhanden, rendert es Magic-Link + Zugangsdaten-Block
    loginInfo: loginInfo ?? null,
    // AAR-branding-rest: SV-Whitelabel wenn der zugewiesene SV verifiziert+branded ist
    brand: await resolveEmailBranding({ svId: (fall.sv_id as string | null) ?? null }),
    // P1b/P2: gebackener Hero (bevorzugt) bzw. VehicleCard-Fallback + Ansprechpartner
    fahrzeugBildUrl,
    heroBildUrl,
    berater,
  }

  const html = await render(KundeWelcomeEmail(props))
  await sendEmail({
    to: kundeEmail,
    subject: kundeWelcomeSubject(props, locale),
    html,
    fallId,
    empfaengerTyp: 'kunde',
    template: 'kunde_welcome',
  })
}

// ─── 2. SV Auftragszusammenfassung ─────────────────────────────────────────

export async function sendSvAuftragszusammenfassung(fallId: string, gutachterId: string): Promise<void> {
  const db = admin()

  // CMM-49: email_log claim-gekeyt; interim faelle.claim_id-Lookup fuer Dedup (P4-TODO: threaden).
  const claimId = await resolveClaimId(db, fallId)
  // Pruefen ob schon gesendet (Duplikat-Schutz)
  const { data: existing } = await db.from('email_log').select('id').eq('claim_id', claimId ?? '00000000-0000-0000-0000-000000000000').eq('template', 'sv_auftrag').eq('status', 'sent').limit(1).maybeSingle()
  if (existing) return

  const { data: fall } = await db.from('v_faelle_mit_aktuellem_termin').select('claim_nummer, lead_id, sv_termin, besichtigungsort_adresse, fahrzeug_hersteller, fahrzeug_modell, kennzeichen').eq('id', fallId).single()
  if (!fall) return

  const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', gutachterId).single()
  if (!sv?.profile_id) return
  const { data: svProfile } = await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
  if (!svProfile?.email) throw new Error('Keine Email-Adresse für SV')

  // Kunde
  let kundeName = '—'
  let kundeTelefon = '—'
  if (fall.lead_id) {
    const { data: lead } = await db.from('leads').select('vorname, nachname, telefon').eq('id', fall.lead_id).single()
    if (lead) {
      kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
      kundeTelefon = lead.telefon || '—'
    }
  }

  // Versicherung — SSoT via v_claim_full (loest totes parteien/rolle='gegner'-Read ab).
  const versicherung = (await resolveGegnerVersicherung(db, { fallId })).name ?? '—'

  const props = {
    svVorname: svProfile.vorname ?? 'Gutachter',
    fallNummer: fall.claim_nummer ?? fallId.slice(0, 8),
    terminDatum: fmtDate(fall.sv_termin),
    terminUhrzeit: fmtTime(fall.sv_termin),
    adresse: fall.besichtigungsort_adresse ?? '—',
    fahrzeug: [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || fall.kennzeichen || '—',
    kundeName,
    kundeTelefon,
    versicherung,
    fallId,
  }

  const html = await render(SvAuftragszusammenfassungEmail(props))
  await sendEmail({
    to: svProfile.email,
    subject: svAuftragSubject(props),
    html,
    fallId,
    empfaengerTyp: 'sv',
    template: 'sv_auftrag',
  })
}

// ─── 3. SV Abrechnung ──────────────────────────────────────────────────────

export async function sendSvAbrechnung(fallId: string): Promise<void> {
  const db = admin()
  // Billing-Konsolidierung 2026-07-01: Leadpreis/Schadenhoehe aus claims-SSoT
  // (processCaseBilling) statt aus der retireten gutachter_abrechnungen-Tabelle.
  const claimId = await resolveClaimId(db, fallId)
  if (!claimId) return
  const { data: claim } = await db.from('claims')
    .select('sv_id, claim_nummer, lead_preis_netto, lead_preis_typ, schadens_hoehe_netto, gutachten(gesamt_schadensbetrag)')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim?.sv_id || claim.lead_preis_netto == null) return

  const g = Array.isArray((claim as { gutachten?: unknown }).gutachten)
    ? ((claim as { gutachten: unknown[] }).gutachten)[0]
    : (claim as { gutachten?: unknown }).gutachten
  const schadenhoehe = Number(
    (g as { gesamt_schadensbetrag?: number | null } | null)?.gesamt_schadensbetrag
      ?? claim.schadens_hoehe_netto
      ?? 0,
  )
  const leadpreis = Number(claim.lead_preis_netto)

  const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', claim.sv_id).single()
  if (!sv?.profile_id) return
  const { data: svProfile } = await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
  if (!svProfile?.email) throw new Error('Keine Email-Adresse für SV')

  const props = {
    svVorname: svProfile.vorname ?? 'Gutachter',
    fallNummer: claim.claim_nummer ?? '—',
    positionen: [
      { bezeichnung: 'Schadenshöhe', betrag: fmtCurrency(schadenhoehe) },
      { bezeichnung: `Leadpreis (${claim.lead_preis_typ ?? 'einzel'})`, betrag: fmtCurrency(leadpreis) },
    ],
    gesamtbetrag: fmtCurrency(leadpreis),
    zahlungsHinweis: 'Der Betrag wird mit Ihrem Guthaben verrechnet. Details finden Sie im Portal.',
    abrechnungId: claimId,
  }

  const html = await render(SvAbrechnungEmail(props))
  await sendEmail({
    to: svProfile.email,
    subject: svAbrechnungSubject(props),
    html,
    fallId,
    empfaengerTyp: 'sv',
    template: 'sv_abrechnung',
  })
}

// ─── 4. SV Rechnung (mit PDF-Anhang) ───────────────────────────────────────

export async function sendSvRechnung(rechnungId: string): Promise<void> {
  const db = admin()
  // Annahme: Es gibt eine Tabelle gutachter_rechnungen oder rechnungen
  // Falls nicht: die Logik ist vorbereitet, greift aber ins Leere
  const { data: rechnung } = await db.from('gutachter_rechnungen').select('sv_id, fall_id, rechnungs_nr, datum, betrag, pdf_url').eq('id', rechnungId).single()
  if (!rechnung) return

  // CMM-49: claim_nummer claims-direkt (faelle-frei).
  const claimId = await resolveClaimId(db, rechnung.fall_id)
  const { data: fallClaim } = claimId
    ? await db.from('claims').select('claim_nummer').eq('id', claimId).maybeSingle()
    : { data: null }

  const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', rechnung.sv_id).single()
  if (!sv?.profile_id) return
  const { data: svProfile } = await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
  if (!svProfile?.email) throw new Error('Keine Email-Adresse für SV')

  const props = {
    svVorname: svProfile.vorname ?? 'Gutachter',
    fallNummer: fallClaim?.claim_nummer ?? '—',
    rechnungsNr: rechnung.rechnungs_nr ?? rechnungId.slice(0, 8),
    rechnungsDatum: fmtDate(rechnung.datum),
    betrag: fmtCurrency(Number(rechnung.betrag)),
    rechnungId,
  }

  // PDF laden falls vorhanden
  const attachments: Array<{ filename: string; content: Buffer | string; contentType: string }> = []
  if (rechnung.pdf_url) {
    try {
      const res = await fetch(rechnung.pdf_url)
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        attachments.push({ filename: `Rechnung_${props.rechnungsNr}.pdf`, content: buf, contentType: 'application/pdf' })
      }
    } catch { console.error('[KFZ-137] PDF-Download fehlgeschlagen:', rechnung.pdf_url) }
  }

  const html = await render(SvRechnungEmail(props))
  await sendEmail({
    to: svProfile.email,
    subject: svRechnungSubject(props),
    html,
    attachments,
    fallId: rechnung.fall_id,
    empfaengerTyp: 'sv',
    template: 'sv_rechnung',
  })
}

// ─── 5. Kanzlei Auftragszusammenfassung ────────────────────────────────────

export async function sendKanzleiAuftragszusammenfassung(fallId: string, kanzleiEmail: string): Promise<void> {
  const db = admin()
  // CMM-44 SP-A2 (Cluster 1): schadentag + schadenort_ort aus claims (SSoT) via claim_id-Embed.
  // CMM-44 SP-D PR2a: besichtigungsort_adresse aus gutachter_termine (SSoT).
  // CMM-49 (Drop-Runway): Anker faelle_claim_bridge (fall_id==faelle.id) + claims-Embed
  // statt .from('faelle'). REGRESSION-FIX: der alte Select las das nicht-existente
  // faelle.kanzlei_uebergabe_am (Tippfehler; echte Spalte = claims.kanzlei_uebergeben_am,
  // s. claim-duplicate-columns.ts) -> die .single()-Query failte IMMER -> diese Kanzlei-
  // Auftragszusammenfassung-Email sendete nie (Phantom-Bug, von CMM-49 in Migration
  // 20260610225410 dokumentiert). lead_id -> claims (SSoT, div=0); fahrzeug_*/kennzeichen-
  // Snapshot war 0-populated -> Drop value-neutral (Quelle = vehicles via claims.vehicle_id).
  type KanzClaim = {
    lead_id: string | null
    claim_nummer: string | null
    schadentag: string | null
    schadenort_ort: string | null
    vehicle_id: string | null
    kanzlei_uebergeben_am: string | null
  }
  const { data: fallBr } = await db
    .from('faelle_claim_bridge')
    .select('claim_id, claims:claim_id(lead_id, claim_nummer, schadentag, schadenort_ort, vehicle_id, kanzlei_uebergeben_am)')
    .eq('fall_id', fallId)
    .maybeSingle()
  if (!fallBr) return
  const fall = fallBr as unknown as { claim_id: string | null; claims?: KanzClaim | KanzClaim[] | null }
  const fallClaim = (Array.isArray(fall.claims) ? fall.claims[0] : fall.claims) as KanzClaim | null | undefined

  // CMM-50.3b: Fahrzeug vehicles-first (claims.vehicle_id -> vehicles), faelle-Snapshot Fallback.
  let kanzVeh: { hersteller: string | null; modell_haupttyp: string | null; kennzeichen_aktuell: string | null } | null = null
  const kanzVehicleId = (fallClaim as { vehicle_id?: string | null } | null)?.vehicle_id ?? null
  if (kanzVehicleId) {
    const { data: v } = await db.from('vehicles').select('hersteller, modell_haupttyp, kennzeichen_aktuell').eq('id', kanzVehicleId).maybeSingle()
    kanzVeh = (v as { hersteller: string | null; modell_haupttyp: string | null; kennzeichen_aktuell: string | null } | null)
  }
  // CMM-49: faelle.fahrzeug_*-Snapshot entfaellt (0-populated, faelle-Drop) -> nur vehicles.
  const kanzFzHersteller = kanzVeh?.hersteller ?? null
  const kanzFzModell = kanzVeh?.modell_haupttyp ?? null
  const kanzFzKennzeichen = kanzVeh?.kennzeichen_aktuell ?? null

  let kanzleiBesichtigungsortAdresse: string | null = null
  if ((fall as { claim_id?: string | null }).claim_id) {
    const { data: aktTerminKanzlei } = await db
      .from('gutachter_termine')
      .select('besichtigungsort_adresse')
      .eq('claim_id', (fall as { claim_id: string }).claim_id)
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    kanzleiBesichtigungsortAdresse = (aktTerminKanzlei?.besichtigungsort_adresse as string | null) ?? null
  }

  // Kunde
  let kundeName = '—'
  if (fallClaim?.lead_id) {
    const { data: lead } = await db.from('leads').select('vorname, nachname').eq('id', fallClaim.lead_id).single()
    if (lead) kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
  }

  // Versicherung + Schadennummer — SSoT via v_claim_full (loest totes parteien-Read ab).
  const gegnerVers = await resolveGegnerVersicherung(db, { fallId })
  const versicherung = gegnerVers.name ?? '—'
  const schadennummer = gegnerVers.nummer ?? '—'

  // AAR-kanzlei-portal PR 5: Fall-Dokumente laden für Attachments + Download-
  // Links. Strategie:
  //   - Kanzlei-Paket (kategorie='kanzlei'|'kanzlei_paket') → Attachment
  //   - Gutachten (dokument_typ='gutachten'|kategorie='gutachten') → Attachment
  //   - Alle anderen → Download-Links in der Email (werden nicht attached,
  //     weil Gmail bei >25 MB Total-Attachments bouncen würde)
  const { data: dokumenteRows } = await db
    .from('fall_dokumente')
    .select('id, dokument_typ, kategorie, storage_path, original_filename, mime_type, groesse_bytes, hochgeladen_am')
    .eq('fall_id', fallId)
    .is('geloescht_am', null)
    .order('hochgeladen_am', { ascending: false })

  type Row = {
    id: string
    dokument_typ: string | null
    kategorie: string | null
    storage_path: string | null
    original_filename: string | null
    mime_type: string | null
    groesse_bytes: number | null
    hochgeladen_am: string | null
  }
  const dokumente = (dokumenteRows ?? []) as unknown as Row[]

  const isKanzleiPaket = (d: Row): boolean => {
    const k = (d.dokument_typ ?? d.kategorie ?? '').toLowerCase()
    return k === 'kanzlei' || k === 'kanzlei_paket'
  }
  const isGutachten = (d: Row): boolean => {
    const k = (d.dokument_typ ?? d.kategorie ?? '').toLowerCase()
    return k === 'gutachten'
  }

  const TYP_LABEL: Record<string, string> = {
    fahrzeugschein: 'Fahrzeugschein (ZB1)',
    polizeibericht: 'Polizeibericht',
    schadensfotos: 'Unfallfoto',
    unfallfoto: 'Unfallfoto',
    sa_pdf: 'Schadenaufnahme (SA)',
    anschlussschreiben: 'Anschlussschreiben',
    vollmacht: 'Vollmacht',
    'kunde-nachreichung': 'Kunden-Nachreichung',
    sonstiges: 'Sonstiges',
  }

  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = []

  async function attachFromStorage(d: Row, wunschdateiname: string): Promise<void> {
    if (!d.storage_path) return
    // Server-Fetch + Buffer-Embedding — URL nicht persistiert, kurze TTL reicht.
    const url = await getStorageUrl(db, 'fall-dokumente', d.storage_path, { ttl: STORAGE_TTL.download })
    if (!url) {
      console.error('[AAR-kanzlei-portal] URL-Generierung fehlgeschlagen für', d.storage_path)
      return
    }
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.error('[AAR-kanzlei-portal] Attachment-Download fehlgeschlagen:', res.status, url)
        return
      }
      const buf = Buffer.from(await res.arrayBuffer())
      // Gmail-Limit beachten: wenn Total > 20 MB, überspringen.
      const gesamt = attachments.reduce((s, a) => s + a.content.length, 0)
      if (gesamt + buf.length > 20 * 1024 * 1024) {
        console.warn('[AAR-kanzlei-portal] Attachment-Total > 20 MB, überspringe', wunschdateiname)
        return
      }
      attachments.push({
        filename: d.original_filename ?? wunschdateiname,
        content: buf,
        contentType: d.mime_type ?? 'application/pdf',
      })
    } catch (err) {
      console.error('[AAR-kanzlei-portal] Attach-Fehler:', err)
    }
  }

  const kanzleiPaket = dokumente.find(isKanzleiPaket)
  const gutachten = dokumente.find(isGutachten)
  if (kanzleiPaket) {
    await attachFromStorage(kanzleiPaket, `Kanzlei_Paket_${fallClaim?.claim_nummer ?? fallId}.pdf`)
  }
  if (gutachten) {
    await attachFromStorage(gutachten, `Gutachten_${fallClaim?.claim_nummer ?? fallId}.pdf`)
  }

  // Download-Links für alle Nicht-Attachment-Dokumente (+ auch die attachments,
  // falls der Empfänger den Link bevorzugt). TTL 7d damit Anwälte/Kanzleien
  // den Link auch nach Tagen noch öffnen können — wenn das in Praxis ein
  // Leak-Risiko ist, ist der Folge-Schritt Auth-Proxy-Route (siehe Plan §C
  // Option 2: /api/file/[token]/...).
  const docsMitPath = dokumente.filter((d) => d.storage_path)
  const dokumenteLinks = (await Promise.all(
    docsMitPath.map(async (d) => {
      const url = await getStorageUrl(db, 'fall-dokumente', d.storage_path as string, {
        ttl: STORAGE_TTL.email,
      })
      if (!url) return null
      const typKey = (d.dokument_typ ?? d.kategorie ?? '').toLowerCase()
      const typLabel = TYP_LABEL[typKey] ?? (typKey || 'Dokument')
      const label = d.original_filename
        ? `${typLabel}: ${d.original_filename}`
        : typLabel
      const sizeMB = d.groesse_bytes ? (d.groesse_bytes / 1024 / 1024).toFixed(1) : null
      const meta = [d.mime_type?.split('/').pop()?.toUpperCase(), sizeMB ? `${sizeMB} MB` : null]
        .filter(Boolean)
        .join(' · ')
      return {
        id: d.id,
        label,
        url,
        meta: meta || undefined,
      }
    }),
  )).filter((x): x is NonNullable<typeof x> => x !== null)

  const props = {
    fallNummer: fallClaim?.claim_nummer ?? fallId.slice(0, 8),
    kundeName,
    unfallDatum: fmtDate(fallClaim?.schadentag ?? null),
    unfallOrt: kanzleiBesichtigungsortAdresse ?? fallClaim?.schadenort_ort ?? '—',
    fahrzeug: [kanzFzHersteller, kanzFzModell].filter(Boolean).join(' ') || kanzFzKennzeichen || '—',
    versicherung,
    schadennummer,
    svBerichtHinweis:
      attachments.length > 0
        ? `Als Anhang erhalten Sie: ${attachments.map((a) => a.filename).join(', ')}.`
        : 'Kanzlei-Paket und Gutachten folgen in Kürze — sie finden sie vorab über den Portal-Link.',
    uebergabeDatum: fmtDate(fallClaim?.kanzlei_uebergeben_am ?? null),
    fallId,
    dokumenteLinks,
  }

  const html = await render(KanzleiAuftragszusammenfassungEmail(props))
  await sendEmail({
    to: kanzleiEmail,
    subject: kanzleiAuftragSubject(props),
    html,
    attachments: attachments.length > 0 ? attachments : undefined,
    fallId,
    empfaengerTyp: 'kanzlei',
    template: 'kanzlei_auftrag',
  })
}

// ─── 6. Kanzlei Abrechnung + Rechnung (mit PDF) ────────────────────────────

export async function sendKanzleiAbrechnungRechnung(abrechnungId: string): Promise<void> {
  const db = admin()
  // Annahme: Tabelle kanzlei_abrechnungen
  const { data: abr } = await db.from('kanzlei_abrechnungen').select('fall_id, kanzlei_email, rechnungs_nr, datum, positionen, gesamtbetrag, pdf_url').eq('id', abrechnungId).single()
  if (!abr) return

  // CMM-49: claim_nummer claims-direkt (faelle-frei).
  const claimId = await resolveClaimId(db, abr.fall_id)
  const { data: fallClaim } = claimId
    ? await db.from('claims').select('claim_nummer').eq('id', claimId).maybeSingle()
    : { data: null }

  const positionen = Array.isArray(abr.positionen)
    ? abr.positionen.map((p: { bezeichnung?: string; betrag?: number }) => ({ bezeichnung: p.bezeichnung ?? '—', betrag: fmtCurrency(p.betrag ?? 0) }))
    : []

  const props = {
    fallNummer: fallClaim?.claim_nummer ?? '—',
    rechnungsNr: abr.rechnungs_nr ?? abrechnungId.slice(0, 8),
    rechnungsDatum: fmtDate(abr.datum),
    positionen,
    gesamtbetrag: fmtCurrency(Number(abr.gesamtbetrag)),
    fallId: abr.fall_id,
  }

  // PDF laden
  const attachments: Array<{ filename: string; content: Buffer | string; contentType: string }> = []
  if (abr.pdf_url) {
    try {
      const res = await fetch(abr.pdf_url)
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        attachments.push({ filename: `Kanzlei_Rechnung_${props.rechnungsNr}.pdf`, content: buf, contentType: 'application/pdf' })
      }
    } catch { console.error('[KFZ-137] Kanzlei PDF-Download fehlgeschlagen:', abr.pdf_url) }
  }

  const html = await render(KanzleiAbrechnungRechnungEmail(props))
  await sendEmail({
    to: abr.kanzlei_email,
    subject: kanzleiAbrechnungSubject(props),
    html,
    attachments,
    fallId: abr.fall_id,
    empfaengerTyp: 'kanzlei',
    template: 'kanzlei_abrechnung',
  })
}

// ─── 7. Marketing Monats-Abrechnung (KFZ-141) ─────────────────────────────

export async function sendMarketingAbrechnung(abrechnungId: string): Promise<void> {
  const db = admin()
  const { data: abr } = await db.from('abrechnungen').select('*').eq('id', abrechnungId).single()
  if (!abr) return

  const monat = abr.abrechnungs_zeitraum_start.slice(0, 7)
  const monatLabel = new Date(abr.abrechnungs_zeitraum_start).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', month: 'long', year: 'numeric' })
  const positionen = abr.positionen as Array<{ beschreibung?: string }>

  const props = {
    empfaengerName: abr.empfaenger_name,
    abrechnungsNr: abr.abrechnungs_nr,
    monat: monatLabel,
    anzahlPositionen: positionen.length,
    summeBrutto: fmtCurrency(Number(abr.summe_brutto)),
    faelligAm: abr.faellig_am ? fmtDate(abr.faellig_am) : '—',
  }

  // PDF laden
  const attachments: Array<{ filename: string; content: Buffer | string; contentType: string }> = []
  if (abr.pdf_path) {
    const { data: pdfData } = await db.storage.from('abrechnungen-pdf').download(abr.pdf_path)
    if (pdfData) {
      const buf = Buffer.from(await pdfData.arrayBuffer())
      attachments.push({ filename: `Abrechnung_${abr.abrechnungs_nr}.pdf`, content: buf, contentType: 'application/pdf' })
    }
  }

  const html = await render(MarketingAbrechnungEmail(props))
  const { messageId } = await sendEmail({
    to: abr.empfaenger_email,
    subject: marketingAbrechnungSubject(props),
    html,
    attachments,
    empfaengerTyp: 'admin',
    template: 'marketing_abrechnung',
  })

  // Status updaten
  const faelligAm = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)
  const { data: logEntry } = await db.from('email_log').select('id').eq('message_id', messageId).limit(1).maybeSingle()

  await db.from('abrechnungen').update({
    versand_datum: new Date().toISOString(),
    faellig_am: faelligAm,
    status: 'versendet',
    email_log_id: logEntry?.id ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', abrechnungId)
}

// ─── ARCH-1 Phase 2: Welcome-Mails fuer Admin-angelegte SVs ────────────────

export type WillkommenSvParams = {
  to: string
  // ARCH-1 POLISH: Anrede + Titel fuer 'Hallo Herr Dr. Mustermann'-Salutation
  anrede?: string
  titel?: string
  vorname: string
  nachname: string
  paket_name: string
  kontingent: number
  radius_km: number
  anzahlung_betrag_eur: number
  /** @deprecated AAR-auth-haertung (F): nicht mehr im Mail-Body — sendWillkommenSv
   * generiert stattdessen einen Recovery-Magic-Link. Param bleibt fuer Caller-Kompat. */
  initial_password: string
  organisation_name?: string | null
  rolle_in_organisation?: string | null
  von_admin_name?: string
}

/**
 * Welcome-Mail an einen vom Admin angelegten SV (ARCH-1).
 * Enthaelt Konditionen-Uebersicht, Login-URL, Initial-Passwort.
 * Caller-Verantwortung: nur einmal pro SV-Anlage aufrufen (kein Dedup hier).
 */
export async function sendWillkommenSv(params: WillkommenSvParams): Promise<void> {
  // AAR-auth-haertung (Befund F): Recovery-Magic-Link statt Klartext-Passwort im
  // Mail-Body. params.initial_password wird NICHT mehr versendet (der Account
  // wird weiterhin damit angelegt + in der Admin-UI angezeigt). Jeder Send
  // generiert einen frischen Link — auch der resend-welcome-Pfad.
  // TOKEN-HASH-FIX (siehe src/lib/auth/welcome-link.ts): admin.generateLink liefert einen
  // IMPLICIT-#access_token-Hash, den /passwort-zuruecksetzen nicht verarbeitet — stattdessen
  // hashed_token + /api/auth/confirm (verifyOtp server-seitig → Cookie).
  const magicLink = await buildWelcomeConfirmLink(params.to, 'recovery', '/passwort-zuruecksetzen')

  const props = {
    anrede: params.anrede,
    titel: params.titel,
    vorname: params.vorname,
    nachname: params.nachname,
    paket_name: params.paket_name,
    kontingent: params.kontingent,
    radius_km: params.radius_km,
    anzahlung_betrag_eur: params.anzahlung_betrag_eur,
    magicLink,
    organisation_name: params.organisation_name ?? null,
    rolle_in_organisation: params.rolle_in_organisation ?? null,
    von_admin_name: params.von_admin_name,
  }

  const html = await render(WillkommenSvEmail(props))
  await sendEmail({
    to: params.to,
    subject: willkommenSvSubject(props),
    html,
    fallId: null,
    empfaengerTyp: 'sv',
    template: 'arch1_willkommen_sv',
  })
}

/**
 * Login-/Willkommens-Mail an eine Werkstatt. Reiner Magic-Link-Weg: der Recovery-Link
 * ("Passwort setzen & einloggen") fuehrt auf /passwort-zuruecksetzen, wo confirmPasswordReset
 * das Passwort setzt, force_password_change raeumt UND beim Onboarding direkt ins Portal
 * einloggt. KEIN Einmalpasswort mehr in der Mail (Klartext-Passwort raus, ein einziger Weg).
 * Ohne erzeugbaren Link hat die Mail keinen Sinn -> hart fehlschlagen (Caller meldet's).
 */
export async function sendWillkommenWerkstatt(params: {
  to: string
  werkstattName: string
}): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'

  // TOKEN-HASH-FIX (siehe src/lib/auth/welcome-link.ts): hashed_token + /api/auth/confirm
  // statt action_link (Implicit-Hash tot). Ohne Link keine sinnvolle Mail -> hart fehlschlagen.
  const magicLink = await buildWelcomeConfirmLink(params.to, 'recovery', '/passwort-zuruecksetzen')
  if (!magicLink) {
    throw new Error('Werkstatt-Magic-Link konnte nicht erzeugt werden')
  }

  const props = {
    werkstattName: params.werkstattName,
    email: params.to,
    loginUrl: `${appUrl}/login`,
    magicLink,
  }
  const html = await render(WillkommenWerkstattEmail(props))
  await sendEmail({
    to: params.to,
    subject: willkommenWerkstattSubject(props),
    html,
    fallId: null,
    empfaengerTyp: 'werkstatt',
    template: 'willkommen_werkstatt',
    // Admin-getriggerte Login-Mail an die Werkstatt selbst -> Send-Isolation umgehen, sonst
    // erreicht der Zugang nie interne/Gruender-Testadressen (@claimondo.de). Der interne
    // Empfaenger ist hier die gewollte Zielperson, kein Bystander-SV.
    allowInternalRecipient: true,
  })
}

export type WillkommenSvAnBueroParams = {
  to: string                       // Inhaber-Email
  inhaber_vorname: string
  buero_name: string
  neuer_sv_vorname: string
  neuer_sv_nachname: string
  neuer_sv_email: string
  paket_name: string
  standort_adresse?: string | null
}

/**
 * Mail-Kopie an Buero-Inhaber wenn ein neuer Sub-SV angelegt wurde.
 * Wird zusaetzlich zur Sub-SV-Welcome-Mail versendet.
 */
export async function sendWillkommenSvAnBuero(params: WillkommenSvAnBueroParams): Promise<void> {
  const props = {
    inhaber_vorname: params.inhaber_vorname,
    buero_name: params.buero_name,
    neuer_sv_vorname: params.neuer_sv_vorname,
    neuer_sv_nachname: params.neuer_sv_nachname,
    neuer_sv_email: params.neuer_sv_email,
    paket_name: params.paket_name,
    standort_adresse: params.standort_adresse ?? null,
  }

  const html = await render(WillkommenSvAnBueroEmail(props))
  await sendEmail({
    to: params.to,
    subject: willkommenSvAnBueroSubject(props),
    html,
    fallId: null,
    empfaengerTyp: 'sv',
    template: 'arch1_willkommen_sv_an_buero',
  })
}

// ─── Makler-Aktivierung: Welcome-Mail an selbst-registrierten Makler ─────────

export type MaklerWelcomeParams = {
  to: string
  firma: string
  vorname: string
  landeseiteUrl: string
}

/**
 * Welcome-Mail an einen selbst-registrierten Makler (Makler-Aktivierung).
 * Enthaelt die Empfehlungs-Landeseite + einen Recovery-Magic-Link zum Passwort-Setzen
 * (AAR-auth-haertung: kein Klartext-Passwort). Best-effort — der Caller wickelt den
 * Aufruf in try/catch, damit ein Mail-Fail die Registrierung nicht bricht.
 */
export async function sendMaklerWelcome(params: MaklerWelcomeParams): Promise<void> {
  // TOKEN-HASH-FIX (siehe src/lib/auth/welcome-link.ts): hashed_token + /api/auth/confirm
  // statt action_link (Implicit-Hash tot).
  const magicLink = await buildWelcomeConfirmLink(params.to, 'recovery', '/passwort-zuruecksetzen')

  const props = {
    firma: params.firma,
    vorname: params.vorname,
    landeseiteUrl: params.landeseiteUrl,
    magicLink,
  }
  const html = await render(MaklerWelcomeEmail(props))
  await sendEmail({
    to: params.to,
    subject: maklerWelcomeSubject(props),
    html,
    fallId: null,
    empfaengerTyp: 'makler',
    template: 'makler_welcome',
  })
}

// ─── Makler Wochenreport ─────────────────────────────────────────────────
// Scheduled Digest (Cron makler-wochenreport), KEIN N5-Event: eine geplante
// Zusammenfassung wie die kanzlei_monats_abrechnung, direkt per E-Mail.
// Opt-in = notification_preferences.woechentlicher_report. Best-effort — der
// Cron wickelt den Aufruf pro Makler in try/catch.

export type MaklerWochenReportParams = {
  to: string
  maklerId: string
  vorname: string
  firma: string
  zeitraumStart: Date
  zeitraumEnde: Date
  data: MaklerWochenReportData
}

export async function sendMaklerWochenReport(params: MaklerWochenReportParams): Promise<void> {
  const { data } = params
  const zeitraumLabel = `${fmtDate(params.zeitraumStart.toISOString())} – ${fmtDate(params.zeitraumEnde.toISOString())}`
  const optOutUrl = wochenreportOptOutUrl(params.maklerId)

  const staffel = data.staffel
    ? {
        settledCount: data.settledCount,
        nochBis: data.staffel.naechste ? data.staffel.naechste.schwelle - data.settledCount : null,
        bonusLabel: data.staffel.naechste ? fmtCurrency(data.staffel.naechste.bonus_betrag_netto) : null,
        alleErreicht: data.staffel.alleErreicht,
      }
    : null

  const props = {
    vorname: params.vorname,
    firma: params.firma,
    zeitraumLabel,
    neueLeads: data.neueLeads,
    neueVermittlungen: data.neueVermittlungen,
    neueVermittlungenSummeLabel: data.neueVermittlungenSumme > 0 ? fmtCurrency(data.neueVermittlungenSumme) : null,
    offeneLeads: data.offeneLeads,
    freigegebenAnzahl: data.freigegebenAnzahl,
    freigegebenSummeLabel: fmtCurrency(data.freigegebenSumme),
    staffel,
    optOutUrl,
  }

  const html = await render(MaklerWochenReportEmail(props))
  await sendEmail({
    to: params.to,
    subject: maklerWochenReportSubject(props),
    html,
    fallId: null,
    empfaengerTyp: 'makler',
    template: 'makler_wochenreport',
    listUnsubscribe: optOutUrl ?? undefined,
  })
}

// ─── 8. Kanzlei Monats-Abrechnung (KFZ-141) ──────────────────────────────

export async function sendKanzleiMonatsAbrechnung(abrechnungId: string): Promise<void> {
  const db = admin()
  const { data: abr } = await db.from('abrechnungen').select('*').eq('id', abrechnungId).single()
  if (!abr) return

  const monatLabel = new Date(abr.abrechnungs_zeitraum_start).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', month: 'long', year: 'numeric' })
  const positionen = abr.positionen as Array<{ beschreibung?: string }>

  const props = {
    kanzleiName: abr.empfaenger_name,
    abrechnungsNr: abr.abrechnungs_nr,
    monat: monatLabel,
    anzahlFaelle: positionen.length,
    summeBrutto: fmtCurrency(Number(abr.summe_brutto)),
    faelligAm: abr.faellig_am ? fmtDate(abr.faellig_am) : '—',
  }

  // PDF laden
  const attachments: Array<{ filename: string; content: Buffer | string; contentType: string }> = []
  if (abr.pdf_path) {
    const { data: pdfData } = await db.storage.from('abrechnungen-pdf').download(abr.pdf_path)
    if (pdfData) {
      const buf = Buffer.from(await pdfData.arrayBuffer())
      attachments.push({ filename: `Abrechnung_${abr.abrechnungs_nr}.pdf`, content: buf, contentType: 'application/pdf' })
    }
  }

  const html = await render(KanzleiMonatsAbrechnungEmail(props))
  const { messageId } = await sendEmail({
    to: abr.empfaenger_email,
    subject: kanzleiMonatsAbrechnungSubject(props),
    html,
    attachments,
    empfaengerTyp: 'kanzlei',
    template: 'kanzlei_monats_abrechnung',
  })

  // Status updaten
  const faelligAm = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)
  const { data: logEntry } = await db.from('email_log').select('id').eq('message_id', messageId).limit(1).maybeSingle()

  await db.from('abrechnungen').update({
    versand_datum: new Date().toISOString(),
    faellig_am: faelligAm,
    status: 'versendet',
    email_log_id: logEntry?.id ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', abrechnungId)
}

// ─── AAR-133: SV Termin-Bestätigung (auch für Pre-FlowLink-Reservierungen) ──

/**
 * Schickt dem SV eine Email mit den Termindaten — funktioniert sowohl für
 * Fall-Termine (klassisch nach SA-Unterschrift) als auch für Pre-FlowLink-
 * Reservierungen via AAR-115 (gutachter_termine.lead_id gesetzt, fall_id null).
 *
 * Bei Pre-FlowLink: rendert das Template mit istVorreservierung=true und
 * weist den SV explizit darauf hin dass der Kunde noch nicht unterschrieben hat.
 */
export async function sendSvTerminBestaetigung(svId: string, terminId: string): Promise<void> {
  const db = admin()

  // SV → profile (Email + Vorname)
  const { data: sv } = await db
    .from('sachverstaendige')
    .select('profile_id')
    .eq('id', svId)
    .single()
  if (!sv?.profile_id) {
    console.warn(`[AAR-133] sendSvTerminBestaetigung: kein profile_id für SV ${svId}`)
    return
  }
  const { data: svProfile } = await db
    .from('profiles')
    .select('email, vorname')
    .eq('id', sv.profile_id)
    .single()
  if (!svProfile?.email) {
    console.warn(`[AAR-133] sendSvTerminBestaetigung: keine Email für SV ${svId}`)
    return
  }

  // Termin laden
  // CMM-44 SP-D PR2a: besichtigungsort_adresse direkt aus gutachter_termine (SSoT).
  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, fall_id, lead_id, start_zeit, end_zeit, ablehnen_token, besichtigungsort_adresse')
    .eq('id', terminId)
    .single()
  if (!termin) {
    console.warn(`[AAR-133] sendSvTerminBestaetigung: Termin ${terminId} nicht gefunden`)
    return
  }

  const tDate = new Date(termin.start_zeit)
  const datum = tDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  const uhrzeit = tDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })

  // Helper — leere Strings → undefined (für saubere ??-Fallbacks)
  // [a, b].filter(Boolean).join(', ') liefert '' wenn alle Felder leer/null,
  // und '' ?? '—' returnt '' (nicht '—'). Also explizit auf undefined casten.
  const joinNonEmpty = (parts: (string | null | undefined)[]): string | undefined => {
    const s = parts.filter(Boolean).join(', ')
    return s || undefined
  }

  let kundenName = '—'
  let adresse = '—'
  let referenz = `Termin ${terminId.slice(0, 8)}`
  let istVorreservierung = false

  if (termin.fall_id) {
    // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
    // CMM-44 SP-D PR2a: besichtigungsort_adresse aus gutachter_termine-Row selbst (SSoT).
    // CMM-49: claims-direkt (faelle-frei). claim_nummer + schadenort_* + lead_id auf claims.
    const claimId = await resolveClaimId(db, termin.fall_id)
    const { data: fallClaim } = claimId
      ? await db
          .from('claims')
          .select('claim_nummer, schadenort_adresse, schadenort_plz, schadenort_ort, lead_id')
          .eq('id', claimId)
          .maybeSingle()
      : { data: null }
    if (fallClaim) {
      referenz = fallClaim.claim_nummer ?? `Fall ${termin.fall_id.slice(0, 8)}`
      adresse =
        (termin.besichtigungsort_adresse as string | null) ??
        joinNonEmpty([fallClaim.schadenort_adresse, fallClaim.schadenort_plz, fallClaim.schadenort_ort]) ??
        '—'
      if (fallClaim.lead_id) {
        const { data: lead } = await db
          .from('leads')
          .select('vorname, nachname')
          .eq('id', fallClaim.lead_id)
          .single()
        if (lead) kundenName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
      }
    }
  } else if (termin.lead_id) {
    istVorreservierung = true
    const { data: lead } = await db
      .from('leads')
      .select('id, vorname, nachname, kunde_strasse, kunde_plz, unfallort')
      .eq('id', termin.lead_id)
      .single()
    if (lead) {
      kundenName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
      adresse = lead.unfallort ?? joinNonEmpty([lead.kunde_strasse, lead.kunde_plz]) ?? '—'
      referenz = `Lead ${lead.id.slice(0, 8)}`
    }
  }

  const props = {
    svVorname: svProfile.vorname ?? 'Sachverständiger',
    fallNummer: referenz,
    terminDatum: datum,
    terminUhrzeit: uhrzeit,
    kundenName,
    adresse,
    istVorreservierung,
    // AAR-702: Link zeigt jetzt auf /sv/termin/<token> — dort hat der SV
    // im selben Flow Bestätigen / Ablehnen / Verschieben (Gegenvorschlag).
    // Vorher (AAR-134) war es nur die /ablehnen-Page.
    ablehnenUrl: termin.ablehnen_token
      ? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'}/sv/termin/${termin.ablehnen_token}`
      : null,
  }

  const html = await render(SvTerminBestaetigungEmail(props))
  await sendEmail({
    to: svProfile.email,
    subject: svTerminBestaetigungSubject(props),
    html,
    fallId: termin.fall_id ?? null,
    empfaengerTyp: 'sv',
    template: 'sv_termin_bestaetigung',
  })
}

// ─── AAR-134: Dispatcher-Email bei SV-Ablehnung ────────────────────────────

async function getDispatcherEmails(): Promise<string[]> {
  const db = admin()
  const { data } = await db
    .from('profiles')
    .select('email')
    .in('rolle', ['dispatch', 'admin'])
    .not('email', 'is', null)
  return ((data ?? []) as { email: string | null }[]).map((p) => p.email).filter((e): e is string => !!e)
}

async function loadTerminContext(terminId: string) {
  const db = admin()
  const { data: termin } = await db
    .from('gutachter_termine')
    // CMM-49 (sv_id-Drop): assignee_id statt sv_id (value-identisch für SV-Termine).
    .select('id, fall_id, lead_id, assignee_id, start_zeit')
    .eq('id', terminId)
    .single()
  if (!termin) return null

  let svName = 'Sachverständiger'
  if (termin.assignee_id) {
    const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', termin.assignee_id).single()
    if (sv?.profile_id) {
      const { data: p } = await db.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
      if (p) svName = [p.vorname, p.nachname].filter(Boolean).join(' ') || svName
    }
  }

  let kundenName = '—'
  if (termin.fall_id) {
    // CMM-49: lead_id claims-direkt (faelle-frei).
    const cId = await resolveClaimId(db, termin.fall_id)
    const { data: cl } = cId
      ? await db.from('claims').select('lead_id').eq('id', cId).maybeSingle()
      : { data: null }
    if (cl?.lead_id) {
      const { data: l } = await db.from('leads').select('vorname, nachname').eq('id', cl.lead_id).single()
      if (l) kundenName = [l.vorname, l.nachname].filter(Boolean).join(' ') || '—'
    }
  } else if (termin.lead_id) {
    const { data: l } = await db.from('leads').select('vorname, nachname').eq('id', termin.lead_id).single()
    if (l) kundenName = [l.vorname, l.nachname].filter(Boolean).join(' ') || '—'
  }

  const tDate = new Date(termin.start_zeit)
  return {
    svName,
    kundenName,
    fallId: termin.fall_id as string | null,
    leadId: termin.lead_id as string | null,
    datum: tDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }),
    uhrzeit: tDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
  }
}

export async function sendDispatcherTerminAbgelehnt(terminId: string, grund: string): Promise<void> {
  const ctx = await loadTerminContext(terminId)
  if (!ctx) return
  const dispatcherEmails = await getDispatcherEmails()
  if (!dispatcherEmails.length) {
    console.warn('[AAR-134] sendDispatcherTerminAbgelehnt: keine Dispatcher-Emails')
    return
  }

  const props = {
    svName: ctx.svName,
    kundenName: ctx.kundenName,
    terminDatum: ctx.datum,
    terminUhrzeit: ctx.uhrzeit,
    grund,
    leadId: ctx.leadId,
    fallId: ctx.fallId,
  }
  const html = await render(DispatcherTerminAbgelehntEmail(props))
  for (const to of dispatcherEmails) {
    await sendEmail({
      to,
      subject: dispatcherAbgelehntSubject(props),
      html,
      fallId: ctx.fallId,
      empfaengerTyp: 'admin',
      template: 'dispatcher_termin_abgelehnt',
    }).catch((err) => console.warn('[AAR-134] Dispatcher-Email an', to, 'fehlgeschlagen:', err))
  }
}

export async function sendDispatcherGegenvorschlag(
  terminId: string,
  slots: { start: string; end: string }[],
  begruendung: string | null,
): Promise<void> {
  const ctx = await loadTerminContext(terminId)
  if (!ctx) return
  const dispatcherEmails = await getDispatcherEmails()
  if (!dispatcherEmails.length) {
    console.warn('[AAR-134] sendDispatcherGegenvorschlag: keine Dispatcher-Emails')
    return
  }

  const slotInfo = slots.map((s) => {
    const d = new Date(s.start)
    return {
      datum: d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit' }),
      uhrzeit: d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
    }
  })

  const props = {
    svName: ctx.svName,
    kundenName: ctx.kundenName,
    originalDatum: ctx.datum,
    originalUhrzeit: ctx.uhrzeit,
    slots: slotInfo,
    begruendung,
    leadId: ctx.leadId,
    fallId: ctx.fallId,
  }
  const html = await render(DispatcherGegenvorschlagEmail(props))
  for (const to of dispatcherEmails) {
    await sendEmail({
      to,
      subject: dispatcherGegenvorschlagSubject(props),
      html,
      fallId: ctx.fallId,
      empfaengerTyp: 'admin',
      template: 'dispatcher_gegenvorschlag',
    }).catch((err) => console.warn('[AAR-134] Dispatcher-Email an', to, 'fehlgeschlagen:', err))
  }
}

// ─── AAR-141 / W7: FlowLink-Versand per Email ────────────────────────────────
// Alternative zum Standard-WA-Versand wenn Kunde Email bevorzugt oder keine
// WA-Nummer hat. Wird aus sendFlowLinkMultiChannel heraus aufgerufen.

export async function sendFlowLinkVersand(
  leadId: string,
  flowUrl: string,
): Promise<{ success: boolean; error?: string }> {
  const db = admin()

  const { data: lead } = await db
    .from('leads')
    .select('email, vorname, sprache')
    .eq('id', leadId)
    .single()

  if (!lead?.email) return { success: false, error: 'Kein Email bei Lead' }
  // Track B (Doc 48): Empfaenger-Locale aus leads.sprache.
  const locale = (lead.sprache as string | null) ?? 'de'

  // Aktiver Termin (reserviert oder bestaetigt) um SV-Name + Datum zu zeigen
  const { data: terminRaw } = await db
    .from('gutachter_termine')
    // AAR-956: Self-Service-Termine sind bezug-nativ (lead_id NULL) -> Dual-Lookup mitfinden
    // (Email-Zwilling von flowlink.ts; FlowLink-Versand laeuft pre-Conversion, #8 greift hier nicht).
    .select('start_zeit, sachverstaendige(profiles!sachverstaendige_profile_id_fkey(vorname, nachname))')
    .or(`lead_id.eq.${leadId},and(bezug_typ.eq.lead,bezug_id.eq.${leadId})`)
    .in('status', ['reserviert', 'bestaetigt'])
    .order('start_zeit', { ascending: true })
    .limit(1)
    .maybeSingle()

  const termin = terminRaw as { start_zeit: string; sachverstaendige: unknown } | null
  const svRel = termin?.sachverstaendige
  const sv = (Array.isArray(svRel) ? svRel[0] : svRel) as { profiles: unknown } | null
  const profileRel = sv?.profiles
  const profile = (Array.isArray(profileRel) ? profileRel[0] : profileRel) as
    | { vorname: string | null; nachname: string | null }
    | null

  const props = {
    locale,
    vorname: lead.vorname ?? 'Kunde',
    svVorname: profile?.vorname ?? '',
    svNachname: profile?.nachname ?? '',
    terminDatum: termin?.start_zeit
      ? new Date(termin.start_zeit).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
      : '—',
    terminUhrzeit: termin?.start_zeit
      ? new Date(termin.start_zeit).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
      : '—',
    flowUrl,
    // AAR-branding-rest: SV-Whitelabel wenn der dem Lead zugeordnete SV verifiziert+branded ist
    brand: await resolveEmailBranding({ leadId }),
  }

  try {
    const html = await render(FlowLinkVersandEmail(props))
    await sendEmail({
      to: lead.email,
      subject: flowLinkVersandSubject(props, locale),
      html,
      empfaengerTyp: 'kunde',
      template: 'flowlink_versand',
    })
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Email-Versand fehlgeschlagen',
    }
  }
}

// ─── AAR-902 Prototyp: Mini-Wizard Magic-Link ────────────────────────────────
// Anders als sendFlowLinkVersand kein SV/Termin-Lookup — beim Mini-Wizard ist
// noch nichts disponiert. Reines vorname + flowUrl Template.

export async function sendMiniWizardMagicLink(
  leadId: string,
  flowUrl: string,
): Promise<{ success: boolean; error?: string }> {
  const db = admin()
  const { data: lead } = await db
    .from('leads')
    .select('email, vorname, sprache')
    .eq('id', leadId)
    .single()
  if (!lead?.email) return { success: false, error: 'Kein Email bei Lead' }

  // Track B (Doc 48): Empfaenger-Locale aus leads.sprache.
  const locale = (lead.sprache as string | null) ?? 'de'
  const props = {
    locale,
    vorname: lead.vorname ?? '',
    flowUrl,
    brand: await resolveEmailBranding({ leadId }),
  }

  try {
    const html = await render(MiniWizardMagicLinkEmail(props))
    await sendEmail({
      to: lead.email,
      subject: miniWizardMagicLinkSubject(props, locale),
      html,
      empfaengerTyp: 'kunde',
      template: 'mini_wizard_magic_link',
    })
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Email-Versand fehlgeschlagen',
    }
  }
}

// ─── SV-Basic-Claim: Passwort-Setzen-Link ────────────────────────────────────
// Eigentumsnachweis-Mail nach erfolgreichem beanspracheSvLead. Der SV erhaelt
// seinen Recovery-Link damit er sein Passwort setzen kann. Kein Branding hier
// (kein SV-Context im Claim-Moment). Non-critical caller (kein throw).

export async function sendSvBasicClaimLink({
  to,
  vorname,
  actionUrl,
}: {
  to: string
  vorname: string | null
  actionUrl: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const props = { vorname, actionUrl }
    const html = await render(SvBasicClaimLinkEmail(props))
    await sendEmail({
      to,
      subject: svBasicClaimLinkSubject(props),
      html,
      fallId: null,
      empfaengerTyp: 'sv',
      template: 'sv_basic_claim_link',
    })
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Email-Versand fehlgeschlagen',
    }
  }
}
