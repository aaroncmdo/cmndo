import { createAdminClient } from '@/lib/supabase/admin'
import { eurToCent } from '@/lib/billing/calculate-ust'
import { createAbrechnung } from '@/lib/abrechnung/create-abrechnung'
import { KANZLEI_A_DESCRIPTOR } from '@/lib/abrechnung/descriptors/marketing'

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

// ─── Position (shared: Kanzlei-Abrechnung) ────────────────────────────────

type Position = {
  fall_id: string | null
  beschreibung: string
  betrag_netto: number
  betrag_brutto: number
}

// ─── Kanzlei-Abrechnungen ─────────────────────────────────────────────────

export async function generiereKanzleiAbrechnungen(monat: string): Promise<Array<{ kanzleiId: string; abrechnungId: string }>> {
  const { FINANCE } = await import('@/lib/finance/constants')
  const supabase = createAdminClient()
  const { start, ende } = monatRange(monat)
  const results: Array<{ kanzleiId: string; abrechnungId: string }> = []

  // Alle im Monat abgeschlossenen Faelle mit Kanzlei.
  // CMM-44 SP-A: kanzlei_ansprechpartner_name/email liegen auf claims (SSoT).
  // CMM-44 SP-A2 (Cluster 3): regulierung_betrag -> claims.regulierungs_betrag (SSoT).
  // CMM-44 SP-I3: regulierung_am lebt auf kanzlei_faelle (1:1) — Filter auf
  // regulierung_am ist via Embed nicht moeglich, daher liest die Query aus
  // v_faelle_mit_aktuellem_termin. Die View hat alle gebrauchten Felder flach
  // (regulierung_am, kanzlei_honorar, lead_id, claim_nummer, kanzlei_ansprechpartner_
  // name/email, regulierung_betrag). !inner-Embed entfaellt (View ist gejoined).
  const { data: faelleRaw } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select('id, regulierung_am, kanzlei_honorar, lead_id, claim_nummer, kanzlei_ansprechpartner_name, kanzlei_ansprechpartner_email, regulierung_betrag')
    .eq('status', 'abgeschlossen')
    .not('kanzlei_ansprechpartner_email', 'is', null)
    .gte('regulierung_am', `${start}T00:00:00`)
    .lte('regulierung_am', `${ende}T23:59:59`)

  if (!faelleRaw?.length) {
    console.log(`[abrechnungen] Keine abgeschlossenen Kanzlei-Faelle im Monat ${monat}`)
    return results
  }

  // CMM-44 SP-I3: View liefert die Felder flach — kein Nested-Embed mehr.
  const faelle = faelleRaw.map((f) => ({
    id: f.id as string,
    claim_nummer: f.claim_nummer ?? null,
    // CMM-44 SP-A2 (Cluster 3): regulierung_betrag aus View (= claims.regulierungs_betrag).
    regulierung_betrag: f.regulierung_betrag ?? null,
    regulierung_am: f.regulierung_am,
    kanzlei_honorar: f.kanzlei_honorar,
    lead_id: f.lead_id,
    kanzlei_ansprechpartner_name: f.kanzlei_ansprechpartner_name ?? null,
    kanzlei_ansprechpartner_email: f.kanzlei_ansprechpartner_email ?? null,
  }))

  // Gruppieren nach Kanzlei-Email
  const grouped = new Map<string, typeof faelle>()
  for (const fall of faelle) {
    const email = fall.kanzlei_ansprechpartner_email!
    if (!grouped.has(email)) grouped.set(email, [])
    grouped.get(email)!.push(fall)
  }

  for (const [kanzleiEmail, kanzleiFaelle] of grouped) {
    const kanzleiName = kanzleiFaelle[0].kanzlei_ansprechpartner_name || 'Kanzlei'

    // JSONB Position-Objekte (Display-Detail, unveraendert)
    const positionen_jsonb: Position[] = []
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

      positionen_jsonb.push({
        fall_id: fall.id,
        beschreibung: `Honorar Fall ${fall.claim_nummer ?? fall.id.slice(0, 8)} — ${kundeName}`,
        betrag_netto: honorar,
        betrag_brutto: Math.round(honorar * (1 + FINANCE.MWST_PROZENT / 100) * 100) / 100,
      })
    }

    // createAbrechnung-Positionen: betrag_netto_cent pro Position (Cent-Pfad)
    const positionen = kanzleiFaelle.map((fall) => ({
      betrag_netto_cent: eurToCent(Number(fall.kanzlei_honorar ?? FINANCE.KANZLEI_PROVISION_NETTO)),
    }))

    const kontext: Record<string, unknown> = {
      monat,
      empfaenger_email: kanzleiEmail,
      empfaenger_name: kanzleiName,
      abrechnungs_zeitraum_start: start,
      abrechnungs_zeitraum_ende: ende,
      // JSONB Display-Detail unveraendert mitgeben
      positionen_jsonb,
    }

    const result = await createAbrechnung(supabase, KANZLEI_A_DESCRIPTOR, { positionen, kontext })

    if (!result.ok) {
      console.error(`[abrechnungen] Kanzlei-Insert fehlgeschlagen fuer ${kanzleiEmail}:`, result.error)
      continue
    }

    if (!result.erstellt) {
      results.push({ kanzleiId: kanzleiEmail, abrechnungId: result.bestehendeId })
      continue
    }

    console.log(`[abrechnungen] Kanzlei-Abrechnung ${result.nummer} fuer ${kanzleiName}: ${positionen.length} Positionen`)
    results.push({ kanzleiId: kanzleiEmail, abrechnungId: result.id })
  }

  return results
}
