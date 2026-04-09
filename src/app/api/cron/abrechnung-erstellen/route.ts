import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * KFZ-149 Block E: Monatsend-Abrechnung (per-case, kein Pool).
 * Cron: 0 18 28-31 * * (mit Self-Check ob letzter Tag des Monats)
 *
 * Hund-D Korrektur: schreibt jetzt in das LIVE kfz141-abrechnungen-Schema
 * (empfaenger_typ='sv', empfaenger_id, empfaenger_email/name, abrechnungs_nr,
 * positionen JSONB, summe_netto, ust_satz, ust_betrag, summe_brutto, faellig_am,
 * status, versand_datum). Die ehemaligen kfz149-Spalten (gutachter_id,
 * abrechnungsmonat/jahr, bruttoabrechnung_netto, endbetrag_*, mwst_betrag,
 * guthaben_neu, rechnungsnummer, faelligkeitsdatum) existierten nie in der DB
 * weil die kfz141-Migration die Tabelle zuerst angelegt hat (CREATE TABLE
 * IF NOT EXISTS in kfz149 war ein No-op).
 *
 * abrechnung_positionen-Tabelle existiert weiterhin (aus kfz149 angelegt) und
 * dient als Audit-Trail mit FK auf abrechnungen(id).
 */
export async function GET() {
  // Ist heute der letzte Tag des Monats?
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  if (tomorrow.getMonth() === now.getMonth()) {
    return NextResponse.json({ ok: true, skipped: 'Nicht der letzte Tag des Monats' })
  }

  const db = createAdminClient()
  const monat = now.getMonth() + 1
  const jahr = now.getFullYear()
  const monthStart = new Date(jahr, monat - 1, 1).toISOString()
  const monthEnd = new Date(jahr, monat, 1).toISOString()
  const monthStartDate = new Date(jahr, monat - 1, 1).toISOString().slice(0, 10)
  const monthEndDate = new Date(jahr, monat, 0).toISOString().slice(0, 10)

  // Alle aktiven SVs
  const { data: svs } = await db.from('sachverstaendige')
    .select('id, profile_id, werbebudget_guthaben_netto')
    .eq('ist_aktiv', true)

  let created = 0

  for (const sv of svs ?? []) {
    // Fälle dieses Monats mit Lead-Preis, noch nicht abgerechnet
    const { data: faelle } = await db.from('faelle')
      .select('id, created_at, kennzeichen, gutachten_betrag, schadenhoehe_netto, lead_preis_netto, lead_preis_typ, guthaben_verrechnet_netto, sv_nachzahlung_netto')
      .eq('sv_id', sv.id)
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd)
      .not('lead_preis_netto', 'is', null)
      .is('abrechnung_id', null)

    if (!faelle?.length) continue

    // Per-case Summen (schon pro Fall berechnet!)
    const bruttoNetto = faelle.reduce((s, f) => s + (Number(f.lead_preis_netto) || 0), 0)
    const guthabenVerrechnet = faelle.reduce((s, f) => s + (Number(f.guthaben_verrechnet_netto) || 0), 0)
    const endbetragNetto = faelle.reduce((s, f) => s + (Number(f.sv_nachzahlung_netto) || 0), 0)
    const mwst = Math.round(endbetragNetto * 0.19 * 100) / 100
    const endbetragBrutto = Math.round((endbetragNetto + mwst) * 100) / 100

    // Empfaenger-Daten aus profiles laden
    const { data: profile } = await db.from('profiles')
      .select('email, vorname, nachname')
      .eq('id', sv.profile_id)
      .maybeSingle()
    if (!profile?.email) {
      console.error(`[KFZ-149] SV ${sv.id} hat kein Profil/Email — Abrechnung uebersprungen`)
      continue
    }
    const empfaengerName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || 'Sachverstaendiger'

    // Rechnungsnummer: CMNDO-YYYY-MM-NNNN
    // Wir zaehlen aller existierenden SV-Abrechnungen im Monat mit dem
    // empfaenger_typ='sv' Filter (kfz141-Schema, nicht abrechnungsmonat).
    const { count: existing } = await db.from('abrechnungen').select('id', { count: 'exact', head: true })
      .eq('empfaenger_typ', 'sv')
      .gte('abrechnungs_zeitraum_start', monthStartDate)
      .lte('abrechnungs_zeitraum_ende', monthEndDate)
    const nr = String((existing ?? 0) + 1).padStart(4, '0')
    const abrechnungsNr = `CMNDO-${jahr}-${String(monat).padStart(2, '0')}-${nr}`

    // Faelligkeitsdatum: 14. des Folgemonats
    const faellig = new Date(jahr, monat, 14)
    const faelligIso = faellig.toISOString().slice(0, 10)

    // Positionen als JSONB-Array fuer die kfz141-Spalte
    const positionenJson = faelle.map((f, i) => ({
      position_nr: i + 1,
      fall_id: f.id,
      fall_datum: new Date(f.created_at).toISOString().slice(0, 10),
      kennzeichen: f.kennzeichen ?? null,
      schadenhoehe_netto: Number(f.schadenhoehe_netto ?? f.gutachten_betrag ?? 0),
      lead_preis_netto: Number(f.lead_preis_netto),
      lead_preis_typ: f.lead_preis_typ ?? 'paket',
      guthaben_verrechnet_netto: Number(f.guthaben_verrechnet_netto ?? 0),
      sv_nachzahlung_netto: Number(f.sv_nachzahlung_netto ?? 0),
    }))

    // Insert Abrechnung im kfz141-Schema
    const { data: abr, error: abrErr } = await db.from('abrechnungen').insert({
      empfaenger_typ: 'sv',
      empfaenger_id: sv.id,
      empfaenger_email: profile.email,
      empfaenger_name: empfaengerName,
      abrechnungs_nr: abrechnungsNr,
      abrechnungs_zeitraum_start: monthStartDate,
      abrechnungs_zeitraum_ende: monthEndDate,
      positionen: positionenJson,
      summe_netto: endbetragNetto,
      ust_satz: 19.00,
      ust_betrag: mwst,
      summe_brutto: endbetragBrutto,
      faellig_am: faelligIso,
      status: 'versendet',
      versand_datum: new Date().toISOString(),
      notiz: `Brutto-Lead-Preise: ${bruttoNetto.toFixed(2)} EUR. Verrechnet aus Werbebudget: ${guthabenVerrechnet.toFixed(2)} EUR. Restguthaben: ${Number(sv.werbebudget_guthaben_netto ?? 0).toFixed(2)} EUR.`,
    }).select('id').single()

    if (abrErr || !abr) {
      console.error(`[KFZ-149] Abrechnung ${sv.id}:`, abrErr?.message)
      continue
    }

    // Audit-Trail: Positionen zusaetzlich in abrechnung_positionen
    // (dient als zweite Quelle der Wahrheit + erlaubt joined queries).
    for (let i = 0; i < faelle.length; i++) {
      const f = faelle[i]
      await db.from('abrechnung_positionen').insert({
        abrechnung_id: abr.id,
        fall_id: f.id,
        fall_datum: new Date(f.created_at).toISOString().slice(0, 10),
        kennzeichen: f.kennzeichen ?? null,
        schadenhoehe_netto: Number(f.schadenhoehe_netto ?? f.gutachten_betrag ?? 0),
        lead_preis_netto: Number(f.lead_preis_netto),
        lead_preis_typ: f.lead_preis_typ ?? 'paket',
        guthaben_verrechnet_netto: Number(f.guthaben_verrechnet_netto ?? 0),
        sv_nachzahlung_netto: Number(f.sv_nachzahlung_netto ?? 0),
        position_nr: i + 1,
      })
    }

    // Faelle markieren als abgerechnet
    const fallIds = faelle.map(f => f.id)
    await db.from('faelle').update({ abrechnung_id: abr.id }).in('id', fallIds)

    // Email an SV
    try {
      const { sendEmail } = await import('@/lib/email/google/client')
      await sendEmail({
        to: profile.email,
        subject: `Claimondo Monatsabrechnung ${String(monat).padStart(2, '0')}/${jahr} — ${abrechnungsNr}`,
        html: `<p>Hallo ${profile.vorname ?? 'Partner'},</p>
<p>deine Monatsabrechnung für ${String(monat).padStart(2, '0')}/${jahr} ist erstellt:</p>
<ul>
<li><strong>Rechnungsnummer:</strong> ${abrechnungsNr}</li>
<li><strong>Lead-Preise gesamt:</strong> ${bruttoNetto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR netto</li>
<li><strong>Verrechnet (Werbebudget):</strong> -${guthabenVerrechnet.toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR</li>
<li><strong>Endbetrag:</strong> ${endbetragBrutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR brutto</li>
<li><strong>Fällig am:</strong> ${faellig.toLocaleDateString('de-DE')}</li>
</ul>
<p>Der Betrag wird am ${faellig.toLocaleDateString('de-DE')} automatisch von deinem hinterlegten Zahlungsmittel eingezogen.</p>`,
        empfaengerTyp: 'sv',
        template: 'sv_monatsabrechnung',
      })
    } catch (err) { console.error('[KFZ-149] Abrechnungs-Email:', err) }

    created++
  }

  return NextResponse.json({ ok: true, created })
}
