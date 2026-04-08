import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from './client'
import { render } from '@react-email/render'

import { KundeWelcomeEmail, subject as kundeWelcomeSubject } from './templates/KundeWelcome'
import { SvAuftragszusammenfassungEmail, subject as svAuftragSubject } from './templates/SvAuftragszusammenfassung'
import { SvAbrechnungEmail, subject as svAbrechnungSubject } from './templates/SvAbrechnung'
import { SvRechnungEmail, subject as svRechnungSubject } from './templates/SvRechnung'
import { KanzleiAuftragszusammenfassungEmail, subject as kanzleiAuftragSubject } from './templates/KanzleiAuftragszusammenfassung'
import { KanzleiAbrechnungRechnungEmail, subject as kanzleiAbrechnungSubject } from './templates/KanzleiAbrechnungRechnung'

const admin = () => createAdminClient()

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}
function fmtCurrency(val: number | null): string {
  if (val == null) return '0,00 EUR'
  return val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'
}

// ─── 1. Kunde Welcome ──────────────────────────────────────────────────────

export async function sendKundeWelcome(fallId: string): Promise<void> {
  const db = admin()

  // BUG-71: Idempotenz — nur einmal pro Fall
  const { data: alreadySent } = await db.from('email_log').select('id').eq('fall_id', fallId).eq('template', 'kunde_welcome').eq('status', 'sent').limit(1).maybeSingle()
  if (alreadySent) { console.log(`[KFZ-137] Welcome-Mail fuer Fall ${fallId} bereits gesendet, skip`); return }

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
  if (!kundeEmail) throw new Error('Keine Email-Adresse fuer Kunden')

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

  const { data: fall } = await db.from('faelle').select('fall_nummer, lead_id, sv_termin, besichtigungsort_adresse, fahrzeug_hersteller, fahrzeug_modell, kennzeichen').eq('id', fallId).single()
  if (!fall) return

  const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', gutachterId).single()
  if (!sv?.profile_id) return
  const { data: svProfile } = await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
  if (!svProfile?.email) throw new Error('Keine Email-Adresse fuer SV')

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
  if (!svProfile?.email) throw new Error('Keine Email-Adresse fuer SV')

  const props = {
    svVorname: svProfile.vorname ?? 'Gutachter',
    fallNummer: fall?.fall_nummer ?? '—',
    positionen: [
      { bezeichnung: 'Schadenshoehe', betrag: fmtCurrency(Number(abr.schadenhoehe)) },
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
  if (!svProfile?.email) throw new Error('Keine Email-Adresse fuer SV')

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

  const props = {
    fallNummer: fall.fall_nummer ?? fallId.slice(0, 8),
    kundeName,
    unfallDatum: fmtDate(fall.schadens_datum),
    unfallOrt: fall.besichtigungsort_adresse ?? fall.schadens_ort ?? '—',
    fahrzeug: [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || fall.kennzeichen || '—',
    versicherung,
    schadennummer,
    svBerichtHinweis: 'Das Gutachten und alle relevanten Dokumente finden Sie in der digitalen Fallakte.',
    uebergabeDatum: fmtDate(fall.kanzlei_uebergabe_am),
    fallId,
  }

  const html = await render(KanzleiAuftragszusammenfassungEmail(props))
  await sendEmail({
    to: kanzleiEmail,
    subject: kanzleiAuftragSubject(props),
    html,
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
