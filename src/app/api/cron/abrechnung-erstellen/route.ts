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

  // KFZ-152 Phase 2+3: Alle aktiven SVs MIT Org-Info fuer die Sammelabrechnungs-
  // Logik. Buero+Akademie werden zur EINEN Sammelrechnung pro Org gruppiert,
  // Solo + Community + null-Org bekommen weiterhin individuelle Rechnungen.
  const { data: svs } = await db.from('sachverstaendige')
    .select('id, profile_id, werbebudget_guthaben_netto, organisation_id, rolle_in_organisation')
    .eq('ist_aktiv', true)

  // Org-Typ-Lookup vor dem SV-Loop (1 Query statt 1-pro-SV)
  const orgIds = Array.from(new Set((svs ?? []).map(s => s.organisation_id).filter(Boolean) as string[]))
  const orgTypMap = new Map<string, { typ: string | null; name: string; hauptansprechpartner_user_id: string | null }>()
  if (orgIds.length) {
    const { data: orgs } = await db.from('organisationen')
      .select('id, typ, name, hauptansprechpartner_user_id')
      .in('id', orgIds)
    for (const o of orgs ?? []) {
      orgTypMap.set(o.id, { typ: o.typ, name: o.name, hauptansprechpartner_user_id: o.hauptansprechpartner_user_id })
    }
  }

  // Akkumulator fuer Buero/Akademie Sammelrechnungen
  type OrgPosition = {
    fall_id: string
    fall_datum: string
    kennzeichen: string | null
    schadenhoehe_netto: number
    lead_preis_netto: number
    lead_preis_typ: string
    guthaben_verrechnet_netto: number
    sv_nachzahlung_netto: number
    sub_sv_id: string  // KFZ-152: Sub-SV Zuordnung pro Position
    sub_sv_name: string | null
  }
  const orgAccumulator = new Map<string, {
    org_typ: string
    org_name: string
    org_id: string
    positions: OrgPosition[]
    fall_ids: string[]
  }>()

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

    // KFZ-152 Phase 2+3: Sammelabrechnungs-Routing
    // Wenn der SV Teil einer Buero- oder Akademie-Org ist, sammeln wir die
    // Positionen pro Org statt einzeln zu inserten. Eine Sammelrechnung pro
    // Org wird nach dem Loop am Ende erstellt.
    const orgInfo = sv.organisation_id ? orgTypMap.get(sv.organisation_id) : null
    if (orgInfo && (orgInfo.typ === 'buero' || orgInfo.typ === 'akademie')) {
      const acc: { org_typ: string; org_name: string; org_id: string; positions: OrgPosition[]; fall_ids: string[] } = orgAccumulator.get(sv.organisation_id!) ?? {
        org_typ: orgInfo.typ,
        org_name: orgInfo.name,
        org_id: sv.organisation_id!,
        positions: [] as OrgPosition[],
        fall_ids: [] as string[],
      }
      for (const f of faelle) {
        acc.positions.push({
          fall_id: f.id,
          fall_datum: new Date(f.created_at).toISOString().slice(0, 10),
          kennzeichen: f.kennzeichen ?? null,
          schadenhoehe_netto: Number(f.schadenhoehe_netto ?? f.gutachten_betrag ?? 0),
          lead_preis_netto: Number(f.lead_preis_netto),
          lead_preis_typ: f.lead_preis_typ ?? 'paket',
          guthaben_verrechnet_netto: Number(f.guthaben_verrechnet_netto ?? 0),
          sv_nachzahlung_netto: Number(f.sv_nachzahlung_netto ?? 0),
          sub_sv_id: sv.id,
          sub_sv_name: empfaengerName,
        })
        acc.fall_ids.push(f.id)
      }
      orgAccumulator.set(sv.organisation_id!, acc)
      continue // Skip individual insert
    }

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
      const { render } = await import('@react-email/render')
      const { SvMonatsabrechnungVersandEmail, subject: svAbrSubject } = await import('@/lib/email/google/templates/SvMonatsabrechnungVersand')
      const { sendCommunication } = await import('@/lib/communications/send')
      const abrProps = {
        vorname: profile.vorname ?? null,
        abrechnungsNr,
        monat: `${String(monat).padStart(2, '0')}/${jahr}`,
        betragBrutto: endbetragBrutto,
        faelligAm: faellig.toLocaleDateString('de-DE'),
      }
      const html = await render(SvMonatsabrechnungVersandEmail(abrProps))
      await sendCommunication('sv_monatsabrechnung', {
        email: profile.email,
        vorname: profile.vorname ?? '',
        subject: svAbrSubject(abrProps),
        html,
      })
    } catch (err) { console.error('[KFZ-149] Abrechnungs-Email:', err) }

    created++
  }

  // ─── KFZ-152 Phase 2+3: Sammelrechnungen pro Buero/Akademie-Org ─────────
  for (const [orgId, acc] of orgAccumulator.entries()) {
    const totalNetto = acc.positions.reduce((s, p) => s + p.sv_nachzahlung_netto, 0)
    const mwst = Math.round(totalNetto * 0.19 * 100) / 100
    const totalBrutto = Math.round((totalNetto + mwst) * 100) / 100
    if (totalNetto <= 0) continue

    // Verwalter-Email aus Org laden
    const orgInfo = orgTypMap.get(orgId)
    let verwalterEmail = ''
    let verwalterName = orgInfo?.name ?? ''
    if (orgInfo?.hauptansprechpartner_user_id) {
      const { data: p } = await db.from('profiles')
        .select('email, vorname, nachname')
        .eq('id', orgInfo.hauptansprechpartner_user_id)
        .maybeSingle()
      if (p?.email) verwalterEmail = p.email
      if (p?.vorname || p?.nachname) verwalterName = [p?.vorname, p?.nachname].filter(Boolean).join(' ')
    }
    if (!verwalterEmail) {
      console.error(`[KFZ-152] Sammelrechnung Org ${orgId}: kein Verwalter-Email`)
      continue
    }

    // Rechnungsnummer
    const { count: existing } = await db.from('abrechnungen').select('id', { count: 'exact', head: true })
      .eq('empfaenger_typ', 'sv')
      .gte('abrechnungs_zeitraum_start', monthStartDate)
      .lte('abrechnungs_zeitraum_ende', monthEndDate)
    const nr = String((existing ?? 0) + 1).padStart(4, '0')
    const abrechnungsNr = `CMNDO-${jahr}-${String(monat).padStart(2, '0')}-${nr}`

    const faellig = new Date(jahr, monat, 14)
    const faelligIso = faellig.toISOString().slice(0, 10)

    // Positionen mit Sub-SV-Sektionen (jede Position trackt ihren sub_sv_id)
    const positionenJson = acc.positions.map((p, i) => ({ position_nr: i + 1, ...p }))

    const { data: abr, error: abrErr } = await db.from('abrechnungen').insert({
      empfaenger_typ: 'sv',
      empfaenger_id: orgId, // Die ORG ist Empfaenger der Sammelrechnung
      empfaenger_email: verwalterEmail,
      empfaenger_name: `${verwalterName} (${acc.org_typ === 'buero' ? 'Büro' : 'Akademie'} ${acc.org_name})`,
      abrechnungs_nr: abrechnungsNr,
      abrechnungs_zeitraum_start: monthStartDate,
      abrechnungs_zeitraum_ende: monthEndDate,
      positionen: positionenJson,
      summe_netto: totalNetto,
      ust_satz: 19.00,
      ust_betrag: mwst,
      summe_brutto: totalBrutto,
      faellig_am: faelligIso,
      status: 'versendet',
      versand_datum: new Date().toISOString(),
      notiz: `Sammelrechnung für ${acc.org_typ === 'buero' ? 'Büro' : 'Akademie'} ${acc.org_name}. ${acc.positions.length} Positionen aus ${new Set(acc.positions.map(p => p.sub_sv_id)).size} Sub-SVs. Wird gegen ${acc.org_typ === 'buero' ? 'parent_stripe_customer_id' : 'Akademie-Customer'} eingezogen.`,
    }).select('id').single()

    if (abrErr || !abr) {
      console.error(`[KFZ-152] Sammelrechnung ${orgId}:`, abrErr?.message)
      continue
    }

    // Faelle markieren
    await db.from('faelle').update({ abrechnung_id: abr.id }).in('id', acc.fall_ids)

    // Welcome-Mail an Verwalter
    try {
      const { render } = await import('@react-email/render')
      const { BueroVerwalterAbrechnungInfoEmail, subject: bueroAbrSubject } = await import('@/lib/email/google/templates/BueroVerwalterAbrechnungInfo')
      const { sendCommunication } = await import('@/lib/communications/send')
      const subSvCount = new Set(acc.positions.map(p => p.sub_sv_id)).size
      const orgAbrProps = {
        verwalterVorname: verwalterName.split(' ')[0] || null,
        bueroName: acc.org_name,
        svName: verwalterName,
        abrechnungsNr,
        betragBrutto: totalBrutto,
        faelligAm: faellig.toLocaleDateString('de-DE'),
        anzahlPositionen: acc.positions.length,
        anzahlSubSvs: subSvCount,
        orgTyp: acc.org_typ as 'buero' | 'akademie',
      }
      const html = await render(BueroVerwalterAbrechnungInfoEmail(orgAbrProps))
      await sendCommunication('sv_monatsabrechnung', {
        email: verwalterEmail,
        vorname: verwalterName.split(' ')[0] || '',
        subject: bueroAbrSubject(orgAbrProps),
        html,
      })
    } catch (err) { console.error('[KFZ-152] Sammelrechnungs-Email:', err) }

    created++
  }

  return NextResponse.json({ ok: true, created, sammelrechnungen: orgAccumulator.size })
}
