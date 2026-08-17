import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { FINANCE } from '@/lib/finance/constants'
import { eurToCent } from '@/lib/billing/calculate-ust'
import { createAbrechnung } from '@/lib/abrechnung/create-abrechnung'
import { SV_MONAT_DESCRIPTOR } from '@/lib/abrechnung/descriptors/sv-monat'

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
 *
 * Refactored (Task 4): beide Sub-Pfade (Individual-SV + Org-Sammelrechnung)
 * nutzen createAbrechnung() + SV_MONAT_DESCRIPTOR. Orphan-Relink liegt im
 * Caller (hier), nicht im Descriptor (erstellt:false => relink im Route).
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Ist heute der letzte Tag des Monats?
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  if (tomorrow.getMonth() === now.getMonth()) {
    return NextResponse.json({ ok: true, skipped: 'Nicht der letzte Tag des Monats' })
  }

  const db = createAdminClient()
  const monat = now.getMonth() + 1
  const jahr = now.getFullYear()
  // W1.1/AAR-945: Diese Monatsgrenzen sind jetzt NUR noch das Rechnungs-/
  // Fakturierungsmonat-Label (abrechnungs_zeitraum_*, Rechnungsnummer-Counter) —
  // NICHT mehr ein Filter auf das Fall-Erstelldatum (created_at-Fenster entfernt).
  const monthStartDate = new Date(jahr, monat - 1, 1).toISOString().slice(0, 10)
  const monthEndDate = new Date(jahr, monat, 0).toISOString().slice(0, 10)
  const monatPad = String(monat).padStart(2, '0')

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
    // CMM-44 SP-J Bucket B: claim_ids fuer den abrechnung_id-Write auf claims.
    claim_ids: string[]
  }>()

  let created = 0

  for (const sv of svs ?? []) {
    // W1.1/AAR-945: Alle bepreisten, noch nicht fakturierten Fälle des SVs —
    // KEIN created_at-Fenster mehr. Ein im Vormonat erstellter, erst jetzt
    // bepreister Fall (z. B. CLM-2026-00222: created 2026-05-31, bepreist
    // 2026-06-01) fiel sonst durch JEDES Monatsfenster und wurde nie fakturiert.
    // Der kanonische "offen"-Gate ist abrechnung_id IS NULL.
    // Voraussetzung: System A (monatsabrechnung) ist retiret (Task 4) — sonst
    // kann B einen bereits von A bepreisten Fall zusätzlich fakturieren.
    // CMM-44 SP-B PR2c: schadens_hoehe_netto lebt auf claims (SSoT).
    // CMM-44 SP-G PR2: gutachten_betrag → gutachten.gesamt_schadensbetrag (SSoT).
    // CMM-44 SP-J Bucket B: guthaben_verrechnet_netto/sv_nachzahlung_netto sowie
    // der Filter .is(abrechnung_id, null) liegen auf claims (SSoT). Ueber die
    // repointete View lesen, die alles flach exponiert (schadens_hoehe_netto via
    // claims, gutachten_betrag via gutachten); claim_id fuer den Write unten.
    const { data: faelle } = await db.from('v_faelle_mit_aktuellem_termin')
      .select('id, claim_id, created_at, kennzeichen, schadens_hoehe_netto, gutachten_betrag, lead_preis_netto, lead_preis_typ, guthaben_verrechnet_netto, sv_nachzahlung_netto')
      .eq('sv_id', sv.id)
      .not('lead_preis_netto', 'is', null)
      .is('abrechnung_id', null)

    if (!faelle?.length) continue

    // Per-case Summen (schon pro Fall berechnet!) — fuer Notiz-Text
    const bruttoNetto = faelle.reduce((s, f) => s + (Number(f.lead_preis_netto) || 0), 0)
    const guthabenVerrechnet = faelle.reduce((s, f) => s + (Number(f.guthaben_verrechnet_netto) || 0), 0)

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
      const acc = orgAccumulator.get(sv.organisation_id!) ?? {
        org_typ: orgInfo.typ,
        org_name: orgInfo.name,
        org_id: sv.organisation_id!,
        positions: [] as OrgPosition[],
        fall_ids: [] as string[],
        claim_ids: [] as string[],
      }
      for (const f of faelle) {
        acc.positions.push({
          fall_id: f.id,
          fall_datum: new Date(f.created_at).toISOString().slice(0, 10),
          kennzeichen: f.kennzeichen ?? null,
          // CMM-44 SP-J: schadens_hoehe_netto (claims) + gutachten_betrag (gutachten) flach aus der View.
          schadenhoehe_netto: Number(f.schadens_hoehe_netto ?? f.gutachten_betrag ?? 0),
          lead_preis_netto: Number(f.lead_preis_netto),
          lead_preis_typ: f.lead_preis_typ ?? 'paket',
          guthaben_verrechnet_netto: Number(f.guthaben_verrechnet_netto ?? 0),
          sv_nachzahlung_netto: Number(f.sv_nachzahlung_netto ?? 0),
          sub_sv_id: sv.id,
          sub_sv_name: empfaengerName,
        })
        acc.fall_ids.push(f.id)
        if (f.claim_id) acc.claim_ids.push(f.claim_id)
      }
      orgAccumulator.set(sv.organisation_id!, acc)
      continue // Skip individual insert
    }

    const abrClaimIds = faelle.map(f => f.claim_id).filter((id): id is string => !!id)

    // Faelligkeitsdatum: 14. des Folgemonats
    const faellig = new Date(jahr, monat, 14)
    const faelligIso = faellig.toISOString().slice(0, 10)

    // Positionen fuer createAbrechnung (betrag_netto_cent = sv_nachzahlung_netto in Cent)
    const positionen = faelle.map((f, i) => ({
      betrag_netto_cent: eurToCent(Number(f.sv_nachzahlung_netto ?? 0)),
      position_nr: i + 1,
      fall_id: f.id,
      fall_datum: new Date(f.created_at).toISOString().slice(0, 10),
      kennzeichen: f.kennzeichen ?? null,
      schadenhoehe_netto: Number(f.schadens_hoehe_netto ?? f.gutachten_betrag ?? 0),
      lead_preis_netto: Number(f.lead_preis_netto),
      lead_preis_typ: f.lead_preis_typ ?? 'paket',
      guthaben_verrechnet_netto: Number(f.guthaben_verrechnet_netto ?? 0),
      sv_nachzahlung_netto: Number(f.sv_nachzahlung_netto ?? 0),
    }))

    const kontext = {
      empfaenger_id: sv.id,
      empfaenger_email: profile.email,
      empfaenger_name: empfaengerName,
      jahr,
      monatPad,
      abrechnungs_zeitraum_start: monthStartDate,
      abrechnungs_zeitraum_ende: monthEndDate,
      faellig_am: faelligIso,
      versand_datum: now.toISOString(),
      notiz: `Brutto-Lead-Preise: ${bruttoNetto.toFixed(2)} EUR. Verrechnet aus Werbebudget: ${guthabenVerrechnet.toFixed(2)} EUR. Restguthaben: ${Number(sv.werbebudget_guthaben_netto ?? 0).toFixed(2)} EUR.`,
      claim_ids: abrClaimIds,
    }

    const result = await createAbrechnung(db, SV_MONAT_DESCRIPTOR, { positionen, kontext })

    if (!result.ok) {
      console.error(`[KFZ-149] Abrechnung SV ${sv.id}:`, result.error)
      continue
    }

    if (!result.erstellt) {
      // Doppel-Rechnungs-Schutz: bestehende Rechnung gefunden (pruefeBestehend).
      // Orphan-Relink: Claims an die bestehende Rechnung haengen (crash-recovery).
      if (abrClaimIds.length > 0) {
        // Orphan-Relink: schlaegt er still fehl, bleiben die Claims OHNE Rechnungs-
        // verknuepfung — und der naechste Lauf erzeugt genau die zweite Rechnung,
        // die dieser Zweig verhindern soll.
        const { error: relinkFehler } = await db
          .from('claims')
          .update({ abrechnung_id: result.bestehendeId })
          .in('id', abrClaimIds)
        if (relinkFehler) {
          console.error(`[KFZ-149] Orphan-Relink fehlgeschlagen (SV ${sv.id}) — Doppel-Rechnung moeglich:`, relinkFehler.message)
        }
      }
      console.warn(`[KFZ-149] SV ${sv.id}: bestehende Monatsrechnung gefunden — ${abrClaimIds.length} Claim(s) nachverknuepft (keine 2. Rechnung).`)
      continue
    }

    if (!result.markiertOk) {
      console.error(`[KFZ-149] SV ${sv.id}: claims.abrechnung_id-Markierung fehlgeschlagen (Rechnung ${result.id})`)
    }

    const abrechnungsNr = result.nummer
    const endbetragBrutto = result.betraege.bruttoCent / 100

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
        faelligAm: faellig.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
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

    const faellig = new Date(jahr, monat, 14)
    const faelligIso = faellig.toISOString().slice(0, 10)

    // Positionen fuer createAbrechnung (betrag_netto_cent pro Sub-SV-Fall)
    const positionen = acc.positions.map((p, i) => ({
      betrag_netto_cent: eurToCent(p.sv_nachzahlung_netto),
      position_nr: i + 1,
      fall_id: p.fall_id,
      fall_datum: p.fall_datum,
      kennzeichen: p.kennzeichen,
      schadenhoehe_netto: p.schadenhoehe_netto,
      lead_preis_netto: p.lead_preis_netto,
      lead_preis_typ: p.lead_preis_typ,
      guthaben_verrechnet_netto: p.guthaben_verrechnet_netto,
      sv_nachzahlung_netto: p.sv_nachzahlung_netto,
      sub_sv_id: p.sub_sv_id,
      sub_sv_name: p.sub_sv_name,
    }))

    const orgTypLabel = acc.org_typ === 'buero' ? 'Büro' : 'Akademie'
    const subSvCount = new Set(acc.positions.map(p => p.sub_sv_id)).size

    const kontext = {
      empfaenger_id: orgId,
      empfaenger_email: verwalterEmail,
      empfaenger_name: `${verwalterName} (${orgTypLabel} ${acc.org_name})`,
      jahr,
      monatPad,
      abrechnungs_zeitraum_start: monthStartDate,
      abrechnungs_zeitraum_ende: monthEndDate,
      faellig_am: faelligIso,
      versand_datum: now.toISOString(),
      notiz: `Sammelrechnung für ${orgTypLabel} ${acc.org_name}. ${acc.positions.length} Positionen aus ${subSvCount} Sub-SVs. Wird gegen ${acc.org_typ === 'buero' ? 'parent_stripe_customer_id' : 'Akademie-Customer'} eingezogen.`,
      claim_ids: acc.claim_ids,
    }

    const result = await createAbrechnung(db, SV_MONAT_DESCRIPTOR, { positionen, kontext })

    if (!result.ok) {
      console.error(`[KFZ-152] Sammelrechnung ${orgId}:`, result.error)
      continue
    }

    if (!result.erstellt) {
      // Doppel-Rechnungs-Schutz: bestehende Org-Sammelrechnung gefunden.
      // Orphan-Relink: Claims an die bestehende Rechnung haengen (crash-recovery).
      if (acc.claim_ids.length > 0) {
        // Siehe KFZ-149 oben: ohne Relink erzeugt der naechste Lauf eine zweite Rechnung.
        const { error: orgRelinkFehler } = await db
          .from('claims')
          .update({ abrechnung_id: result.bestehendeId })
          .in('id', acc.claim_ids)
        if (orgRelinkFehler) {
          console.error(`[KFZ-152] Org-Relink fehlgeschlagen (org ${orgId}) — Doppel-Sammelrechnung moeglich:`, orgRelinkFehler.message)
        }
      }
      console.warn(`[KFZ-152] Org ${orgId}: bestehende Sammelrechnung gefunden — ${acc.claim_ids.length} Claim(s) nachverknuepft (keine 2. Rechnung).`)
      continue
    }

    if (!result.markiertOk) {
      console.error(`[KFZ-152] Org ${orgId}: claims.abrechnung_id-Markierung fehlgeschlagen (Rechnung ${result.id})`)
    }

    const abrechnungsNr = result.nummer
    const totalBrutto = result.betraege.bruttoCent / 100

    // Welcome-Mail an Verwalter
    try {
      const { render } = await import('@react-email/render')
      const { BueroVerwalterAbrechnungInfoEmail, subject: bueroAbrSubject } = await import('@/lib/email/google/templates/BueroVerwalterAbrechnungInfo')
      const { sendCommunication } = await import('@/lib/communications/send')
      const orgAbrProps = {
        verwalterVorname: verwalterName.split(' ')[0] || null,
        bueroName: acc.org_name,
        svName: verwalterName,
        abrechnungsNr,
        betragBrutto: totalBrutto,
        faelligAm: faellig.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
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
