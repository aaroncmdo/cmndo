import { createAdminClient } from '@/lib/supabase/admin'

function fmtCurrency(val: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €'
}

// ─── Abrechnungsnummer ─────────────────────────────────────────────────────

async function naechsteNummer(
  supabase: ReturnType<typeof createAdminClient>,
  monat: string, // YYYY-MM
  typ: 'MARKETING' | 'KANZLEI',
): Promise<string> {
  const prefix = `CL-${monat.replace('-', '-')}-${typ}`
  const { data } = await supabase
    .from('abrechnungen')
    .select('abrechnungs_nr')
    .like('abrechnungs_nr', `${prefix}-%`)
    .order('abrechnungs_nr', { ascending: false })
    .limit(1)

  let nr = 1
  if (data?.[0]?.abrechnungs_nr) {
    const parts = data[0].abrechnungs_nr.split('-')
    nr = parseInt(parts[parts.length - 1]) + 1
  }
  return `${prefix}-${String(nr).padStart(3, '0')}`
}

// ─── Zeitraum Helpers ──────────────────────────────────────────────────────

function monatRange(monat: string): { start: string; ende: string } {
  const [y, m] = monat.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const ende = new Date(y, m, 0) // letzter Tag
  return {
    start: start.toISOString().slice(0, 10),
    ende: ende.toISOString().slice(0, 10),
  }
}

// ─── Marketing-Abrechnung (Maik) ──────────────────────────────────────────

type Position = {
  fall_id: string | null
  beschreibung: string
  betrag_netto: number
  betrag_brutto: number
}

export async function generiereMarketingAbrechnung(monat: string): Promise<{ abrechnungId: string } | null> {
  const supabase = createAdminClient()
  const { start, ende } = monatRange(monat)

  const maikEmail = process.env.MARKETING_MAIK_EMAIL
  const maikName = process.env.MARKETING_MAIK_NAME || 'Maik (Marketing)'

  if (!maikEmail) {
    console.warn('[abrechnungen] MARKETING_MAIK_EMAIL nicht gesetzt — Marketing-Abrechnung übersprungen')
    return null
  }

  // Idempotenz: schon eine Abrechnung für diesen Monat?
  const { data: existing } = await supabase
    .from('abrechnungen')
    .select('id')
    .eq('empfaenger_typ', 'marketing')
    .eq('abrechnungs_zeitraum_start', start)
    .eq('abrechnungs_zeitraum_ende', ende)
    .neq('status', 'storniert')
    .limit(1)
    .maybeSingle()

  if (existing) {
    console.log(`[abrechnungen] Marketing-Abrechnung für ${monat} existiert bereits: ${existing.id}`)
    return { abrechnungId: existing.id }
  }

  // Alle Leads mit unterschriebener Vollmacht im Monat
  const { data: leads } = await supabase
    .from('leads')
    .select('id, vorname, nachname, vollmacht_datum')
    .eq('vollmacht_unterschrieben', true)
    .gte('vollmacht_datum', `${start}T00:00:00`)
    .lte('vollmacht_datum', `${ende}T23:59:59`)

  if (!leads?.length) {
    console.log(`[abrechnungen] Keine signierten SAs im Monat ${monat} — keine Marketing-Abrechnung`)
    return null
  }

  // Für jeden Lead: Fall laden und prüfen ob marketing_quelle gesetzt
  const positionen: Position[] = []
  const { FINANCE } = await import('@/lib/finance/constants')
  const CPA = FINANCE.CPA_MARKETING_NETTO

  for (const lead of leads) {
    const { data: fall } = await supabase
      .from('faelle')
      .select('id, fall_nummer, marketing_quelle')
      .eq('lead_id', lead.id)
      .limit(1)
      .maybeSingle()

    // Wenn kein Fall oder keine marketing_quelle → trotzdem zählen (alle SAs für Maik)
    const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Unbekannt'
    const fallNr = fall?.fall_nummer || '—'

    positionen.push({
      fall_id: fall?.id ?? null,
      beschreibung: `CPA für Fall ${fallNr} — ${name} (SA ${new Date(lead.vollmacht_datum!).toLocaleDateString('de-DE')})`,
      betrag_netto: CPA,
      betrag_brutto: Math.round(CPA * (1 + FINANCE.MWST_PROZENT / 100) * 100) / 100,
    })
  }

  if (positionen.length === 0) return null

  const summeNetto = positionen.reduce((s, p) => s + p.betrag_netto, 0)
  const ustSatz = 19
  const ustBetrag = Math.round(summeNetto * ustSatz / 100 * 100) / 100
  const summeBrutto = Math.round((summeNetto + ustBetrag) * 100) / 100

  const abrechnungsNr = await naechsteNummer(supabase, monat, 'MARKETING')

  const { data: abr, error } = await supabase
    .from('abrechnungen')
    .insert({
      empfaenger_typ: 'marketing',
      empfaenger_email: maikEmail,
      empfaenger_name: maikName,
      abrechnungs_nr: abrechnungsNr,
      abrechnungs_zeitraum_start: start,
      abrechnungs_zeitraum_ende: ende,
      positionen,
      summe_netto: summeNetto,
      ust_satz: ustSatz,
      ust_betrag: ustBetrag,
      summe_brutto: summeBrutto,
      status: 'entwurf',
    })
    .select('id')
    .single()

  if (error || !abr) {
    console.error('[abrechnungen] Marketing-Insert fehlgeschlagen:', error?.message)
    return null
  }

  console.log(`[abrechnungen] Marketing-Abrechnung ${abrechnungsNr} generiert: ${positionen.length} Positionen, ${fmtCurrency(summeBrutto)} brutto`)
  return { abrechnungId: abr.id }
}

// ─── Kanzlei-Abrechnungen ─────────────────────────────────────────────────

export async function generiereKanzleiAbrechnungen(monat: string): Promise<Array<{ kanzleiId: string; abrechnungId: string }>> {
  const { FINANCE } = await import('@/lib/finance/constants')
  const supabase = createAdminClient()
  const { start, ende } = monatRange(monat)
  const results: Array<{ kanzleiId: string; abrechnungId: string }> = []

  // Alle im Monat abgeschlossenen Fälle mit Kanzlei
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, regulierung_betrag, regulierung_am, kanzlei_ansprechpartner_name, kanzlei_ansprechpartner_email, kanzlei_honorar, lead_id')
    .eq('status', 'abgeschlossen')
    .not('kanzlei_ansprechpartner_email', 'is', null)
    .gte('regulierung_am', `${start}T00:00:00`)
    .lte('regulierung_am', `${ende}T23:59:59`)

  if (!faelle?.length) {
    console.log(`[abrechnungen] Keine abgeschlossenen Kanzlei-Fälle im Monat ${monat}`)
    return results
  }

  // Gruppieren nach Kanzlei-Email
  const grouped = new Map<string, typeof faelle>()
  for (const fall of faelle) {
    const email = fall.kanzlei_ansprechpartner_email!
    if (!grouped.has(email)) grouped.set(email, [])
    grouped.get(email)!.push(fall)
  }

  for (const [kanzleiEmail, kanzleiFaelle] of grouped) {
    const kanzleiName = kanzleiFaelle[0].kanzlei_ansprechpartner_name || 'Kanzlei'

    // Idempotenz
    const { data: existing } = await supabase
      .from('abrechnungen')
      .select('id')
      .eq('empfaenger_typ', 'kanzlei')
      .eq('empfaenger_email', kanzleiEmail)
      .eq('abrechnungs_zeitraum_start', start)
      .eq('abrechnungs_zeitraum_ende', ende)
      .neq('status', 'storniert')
      .limit(1)
      .maybeSingle()

    if (existing) {
      results.push({ kanzleiId: kanzleiEmail, abrechnungId: existing.id })
      continue
    }

    const positionen: Position[] = []
    for (const fall of kanzleiFaelle) {
      const honorar = Number(fall.kanzlei_honorar ?? FINANCE.KANZLEI_PROVISION_NETTO)

      // Kundenname laden
      let kundeName = '—'
      if (fall.lead_id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('vorname, nachname')
          .eq('id', fall.lead_id)
          .single()
        if (lead) kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
      }

      positionen.push({
        fall_id: fall.id,
        beschreibung: `Honorar Fall ${fall.fall_nummer ?? fall.id.slice(0, 8)} — ${kundeName}`,
        betrag_netto: honorar,
        betrag_brutto: Math.round(honorar * (1 + FINANCE.MWST_PROZENT / 100) * 100) / 100,
      })
    }

    const summeNetto = positionen.reduce((s, p) => s + p.betrag_netto, 0)
    const ustSatz = 19
    const ustBetrag = Math.round(summeNetto * ustSatz / 100 * 100) / 100
    const summeBrutto = Math.round((summeNetto + ustBetrag) * 100) / 100

    const abrechnungsNr = await naechsteNummer(supabase, monat, 'KANZLEI')

    const { data: abr, error } = await supabase
      .from('abrechnungen')
      .insert({
        empfaenger_typ: 'kanzlei',
        empfaenger_email: kanzleiEmail,
        empfaenger_name: kanzleiName,
        abrechnungs_nr: abrechnungsNr,
        abrechnungs_zeitraum_start: start,
        abrechnungs_zeitraum_ende: ende,
        positionen,
        summe_netto: summeNetto,
        ust_satz: ustSatz,
        ust_betrag: ustBetrag,
        summe_brutto: summeBrutto,
        status: 'entwurf',
      })
      .select('id')
      .single()

    if (error || !abr) {
      console.error(`[abrechnungen] Kanzlei-Insert fehlgeschlagen für ${kanzleiEmail}:`, error?.message)
      continue
    }

    console.log(`[abrechnungen] Kanzlei-Abrechnung ${abrechnungsNr} für ${kanzleiName}: ${positionen.length} Positionen, ${fmtCurrency(summeBrutto)} brutto`)
    results.push({ kanzleiId: kanzleiEmail, abrechnungId: abr.id })
  }

  return results
}
