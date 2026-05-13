import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from './client'
import { render } from '@react-email/render'
// AAR-branding-rest: SV-Whitelabel für Kunden-gerichtete Mails (null = Claimondo)
import { resolveEmailBranding } from '@/lib/branding/token-theme'

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
    const { data: alreadySent } = await db.from('email_log').select('id').eq('fall_id', fallId).eq('template', 'kunde_welcome').eq('status', 'sent').limit(1).maybeSingle()
    if (alreadySent) { console.log(`[KFZ-137] Welcome-Mail für Fall ${fallId} bereits gesendet, skip`); return }
  }

  const { data: fall } = await db.from('faelle').select('fall_nummer, lead_id, sv_id, kunde_id, schadens_datum, besichtigungsort_adresse, fahrzeug_hersteller, fahrzeug_modell, kennzeichen').eq('id', fallId).single()
  if (!fall) return

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

  // Versicherung
  let versicherung = '—'
  const { data: partei } = await db.from('parteien').select('versicherung_name').eq('fall_id', fallId).eq('rolle', 'gegner').limit(1).maybeSingle()
  if (partei?.versicherung_name) versicherung = partei.versicherung_name

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
  let terminInfo: { datum: string; uhrzeit: string; adresse: string; svName: string | null } | null = null
  const { data: termin } = await db.from('gutachter_termine')
    .select('start_zeit, sv_id, fall_id')
    .eq('fall_id', fallId)
    .in('status', ['reserviert', 'bestaetigt'])
    .gte('start_zeit', new Date().toISOString())
    .order('start_zeit', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (termin) {
    const tDate = new Date(termin.start_zeit)
    let terminSvName: string | null = svName
    if (!terminSvName && termin.sv_id) {
      const { data: sv2 } = await db.from('sachverstaendige').select('profile_id').eq('id', termin.sv_id).single()
      if (sv2?.profile_id) {
        const { data: p2 } = await db.from('profiles').select('vorname, nachname').eq('id', sv2.profile_id).single()
        if (p2) terminSvName = [p2.vorname, p2.nachname].filter(Boolean).join(' ') || null
      }
    }
    terminInfo = {
      datum: tDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }),
      uhrzeit: tDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
      adresse: fall.besichtigungsort_adresse ?? '—',
      svName: terminSvName,
    }
  }

  const props = {
    vorname,
    fallNummer: fall.fall_nummer ?? fallId.slice(0, 8),
    unfallDatum: fmtDate(fall.schadens_datum),
    adresse: fall.besichtigungsort_adresse ?? '—',
    fahrzeug: [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || fall.kennzeichen || '—',
    versicherung,
    svName,
    accountExists,
    flowToken,
    terminInfo,
    // AAR-127: an Template durchreichen — wenn vorhanden, rendert es Magic-Link + Zugangsdaten-Block
    loginInfo: loginInfo ?? null,
    // AAR-branding-rest: SV-Whitelabel wenn der zugewiesene SV verifiziert+branded ist
    brand: await resolveEmailBranding({ svId: (fall.sv_id as string | null) ?? null }),
  }

  const html = await render(KundeWelcomeEmail(props))
  await sendEmail({
    to: kundeEmail,
    subject: kundeWelcomeSubject(props),
    html,
    fallId,
    empfaengerTyp: 'kunde',
    template: 'kunde_welcome',
  })
}

// ─── 2. SV Auftragszusammenfassung ─────────────────────────────────────────

export async function sendSvAuftragszusammenfassung(fallId: string, gutachterId: string): Promise<void> {
  const db = admin()

  // Pruefen ob schon gesendet (Duplikat-Schutz)
  const { data: existing } = await db.from('email_log').select('id').eq('fall_id', fallId).eq('template', 'sv_auftrag').eq('status', 'sent').limit(1).maybeSingle()
  if (existing) return

  const { data: fall } = await db.from('v_faelle_mit_aktuellem_termin').select('fall_nummer, lead_id, sv_termin, besichtigungsort_adresse, fahrzeug_hersteller, fahrzeug_modell, kennzeichen').eq('id', fallId).single()
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

  // Versicherung
  let versicherung = '—'
  const { data: partei } = await db.from('parteien').select('versicherung_name').eq('fall_id', fallId).eq('rolle', 'gegner').limit(1).maybeSingle()
  if (partei?.versicherung_name) versicherung = partei.versicherung_name

  const props = {
    svVorname: svProfile.vorname ?? 'Gutachter',
    fallNummer: fall.fall_nummer ?? fallId.slice(0, 8),
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

export async function sendSvAbrechnung(abrechnungId: string): Promise<void> {
  const db = admin()
  const { data: abr } = await db.from('gutachter_abrechnungen').select('sv_id, fall_id, schadenhoehe, leadpreis, preistyp').eq('id', abrechnungId).single()
  if (!abr) return

  const { data: fall } = await db.from('faelle').select('fall_nummer').eq('id', abr.fall_id).single()

  const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', abr.sv_id).single()
  if (!sv?.profile_id) return
  const { data: svProfile } = await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
  if (!svProfile?.email) throw new Error('Keine Email-Adresse für SV')

  const props = {
    svVorname: svProfile.vorname ?? 'Gutachter',
    fallNummer: fall?.fall_nummer ?? '—',
    positionen: [
      { bezeichnung: 'Schadenshöhe', betrag: fmtCurrency(Number(abr.schadenhoehe)) },
      { bezeichnung: `Leadpreis (${abr.preistyp ?? 'einzel'})`, betrag: fmtCurrency(Number(abr.leadpreis)) },
    ],
    gesamtbetrag: fmtCurrency(Number(abr.leadpreis)),
    zahlungsHinweis: 'Der Betrag wird mit Ihrem Guthaben verrechnet. Details finden Sie im Portal.',
    abrechnungId,
  }

  const html = await render(SvAbrechnungEmail(props))
  await sendEmail({
    to: svProfile.email,
    subject: svAbrechnungSubject(props),
    html,
    fallId: abr.fall_id,
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

  const { data: fall } = await db.from('faelle').select('fall_nummer').eq('id', rechnung.fall_id).single()

  const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', rechnung.sv_id).single()
  if (!sv?.profile_id) return
  const { data: svProfile } = await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
  if (!svProfile?.email) throw new Error('Keine Email-Adresse für SV')

  const props = {
    svVorname: svProfile.vorname ?? 'Gutachter',
    fallNummer: fall?.fall_nummer ?? '—',
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
  const { data: fall } = await db.from('faelle').select('fall_nummer, lead_id, sv_id, schadens_datum, besichtigungsort_adresse, schadens_ort, fahrzeug_hersteller, fahrzeug_modell, kennzeichen, kanzlei_uebergabe_am').eq('id', fallId).single()
  if (!fall) return

  // Kunde
  let kundeName = '—'
  if (fall.lead_id) {
    const { data: lead } = await db.from('leads').select('vorname, nachname').eq('id', fall.lead_id).single()
    if (lead) kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
  }

  // Versicherung + Schadennummer
  let versicherung = '—'
  let schadennummer = '—'
  const { data: partei } = await db.from('parteien').select('versicherung_name, versicherung_nr').eq('fall_id', fallId).eq('rolle', 'gegner').limit(1).maybeSingle()
  if (partei) {
    versicherung = partei.versicherung_name ?? '—'
    schadennummer = partei.versicherung_nr ?? '—'
  }

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
    const { data: pub } = db.storage.from('fall-dokumente').getPublicUrl(d.storage_path)
    const url = pub.publicUrl
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
    await attachFromStorage(kanzleiPaket, `Kanzlei_Paket_${fall.fall_nummer ?? fallId}.pdf`)
  }
  if (gutachten) {
    await attachFromStorage(gutachten, `Gutachten_${fall.fall_nummer ?? fallId}.pdf`)
  }

  // Download-Links für alle Nicht-Attachment-Dokumente (+ auch die attachments,
  // falls der Empfänger den Link bevorzugt)
  const dokumenteLinks = dokumente
    .filter((d) => d.storage_path)
    .map((d) => {
      const { data: pub } = db.storage.from('fall-dokumente').getPublicUrl(d.storage_path as string)
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
        url: pub.publicUrl,
        meta: meta || undefined,
      }
    })

  const props = {
    fallNummer: fall.fall_nummer ?? fallId.slice(0, 8),
    kundeName,
    unfallDatum: fmtDate(fall.schadens_datum),
    unfallOrt: fall.besichtigungsort_adresse ?? fall.schadens_ort ?? '—',
    fahrzeug: [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || fall.kennzeichen || '—',
    versicherung,
    schadennummer,
    svBerichtHinweis:
      attachments.length > 0
        ? `Als Anhang erhalten Sie: ${attachments.map((a) => a.filename).join(', ')}.`
        : 'Kanzlei-Paket und Gutachten folgen in Kürze — sie finden sie vorab über den Portal-Link.',
    uebergabeDatum: fmtDate(fall.kanzlei_uebergabe_am),
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

  const { data: fall } = await db.from('faelle').select('fall_nummer').eq('id', abr.fall_id).single()

  const positionen = Array.isArray(abr.positionen)
    ? abr.positionen.map((p: { bezeichnung?: string; betrag?: number }) => ({ bezeichnung: p.bezeichnung ?? '—', betrag: fmtCurrency(p.betrag ?? 0) }))
    : []

  const props = {
    fallNummer: fall?.fall_nummer ?? '—',
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
  const props = {
    anrede: params.anrede,
    titel: params.titel,
    vorname: params.vorname,
    nachname: params.nachname,
    paket_name: params.paket_name,
    kontingent: params.kontingent,
    radius_km: params.radius_km,
    anzahlung_betrag_eur: params.anzahlung_betrag_eur,
    initial_password: params.initial_password,
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
  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, fall_id, lead_id, start_zeit, end_zeit, ablehnen_token')
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
    const { data: fall } = await db
      .from('faelle')
      .select('id, fall_nummer, lead_id, besichtigungsort_adresse, schadens_adresse, schadens_plz, schadens_ort')
      .eq('id', termin.fall_id)
      .single()
    if (fall) {
      referenz = fall.fall_nummer ?? `Fall ${fall.id.slice(0, 8)}`
      adresse =
        fall.besichtigungsort_adresse ??
        joinNonEmpty([fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort]) ??
        '—'
      if (fall.lead_id) {
        const { data: lead } = await db
          .from('leads')
          .select('vorname, nachname')
          .eq('id', fall.lead_id)
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
    .select('id, fall_id, lead_id, sv_id, start_zeit')
    .eq('id', terminId)
    .single()
  if (!termin) return null

  let svName = 'Sachverständiger'
  if (termin.sv_id) {
    const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', termin.sv_id).single()
    if (sv?.profile_id) {
      const { data: p } = await db.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
      if (p) svName = [p.vorname, p.nachname].filter(Boolean).join(' ') || svName
    }
  }

  let kundenName = '—'
  if (termin.fall_id) {
    const { data: fall } = await db.from('faelle').select('lead_id').eq('id', termin.fall_id).single()
    if (fall?.lead_id) {
      const { data: l } = await db.from('leads').select('vorname, nachname').eq('id', fall.lead_id).single()
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
    .select('email, vorname')
    .eq('id', leadId)
    .single()

  if (!lead?.email) return { success: false, error: 'Kein Email bei Lead' }

  // Aktiver Termin (reserviert oder bestaetigt) um SV-Name + Datum zu zeigen
  const { data: terminRaw } = await db
    .from('gutachter_termine')
    .select('start_zeit, sachverstaendige(profiles!sachverstaendige_profile_id_fkey(vorname, nachname))')
    .eq('lead_id', leadId)
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
      subject: flowLinkVersandSubject(props),
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
