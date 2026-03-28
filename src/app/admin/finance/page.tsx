import { createClient } from '@/lib/supabase/server'
import FinanceClient from './FinanceClient'

const PAKET_PREIS: Record<string, number> = {
  'starter-10': 500,
  'standard-25': 1000,
  'premium-50': 1800,
}

export default async function FinancePage() {
  const supabase = await createClient()

  const now = new Date()
  const monatStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monatEnde = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

  const [
    { data: aktiveSvs },
    { count: aktiveFaelle },
    { data: abgeschlossenMonat },
    { data: alleAbgeschlossen },
    faelleProMonatResult,
    { data: letzteAbgeschlossen },
  ] = await Promise.all([
    // 1. Aktive SVs mit Paket → MRR
    supabase
      .from('sachverstaendige')
      .select('paket')
      .eq('ist_aktiv', true),

    // 2. Aktive Fälle diesen Monat
    supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monatStart)
      .lte('created_at', monatEnde)
      .not('status', 'in', '("abgeschlossen","storniert")'),

    // 3. Abgeschlossene Fälle diesen Monat (für Provision)
    supabase
      .from('faelle')
      .select('regulierung_betrag')
      .eq('status', 'abgeschlossen')
      .gte('regulierung_am', monatStart)
      .lte('regulierung_am', monatEnde)
      .not('regulierung_betrag', 'is', null),

    // 4. Alle abgeschlossenen Fälle mit Betrag (für Durchschnitt)
    supabase
      .from('faelle')
      .select('regulierung_betrag')
      .eq('status', 'abgeschlossen')
      .not('regulierung_betrag', 'is', null),

    // 5. Fälle pro Monat (letzte 6 Monate) – alle Fälle nach created_at
    (async () => {
      const sechsMonateZurueck = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()
      const { data } = await supabase
        .from('faelle')
        .select('created_at')
        .gte('created_at', sechsMonateZurueck)
        .order('created_at')
      return data ?? []
    })(),

    // 6. Letzte abgeschlossene Fälle für Tabelle
    supabase
      .from('faelle')
      .select('id, fall_nummer, regulierung_betrag, regulierung_am, lead_id')
      .eq('status', 'abgeschlossen')
      .not('regulierung_betrag', 'is', null)
      .order('regulierung_am', { ascending: false })
      .limit(15),
  ])

  // ── MRR berechnen ──
  const mrr = (aktiveSvs ?? []).reduce((sum, sv) => {
    return sum + (PAKET_PREIS[sv.paket] ?? 0)
  }, 0)

  // ── Durchschnittlicher Fallwert ──
  const alleBetraege = (alleAbgeschlossen ?? []).map(f => Number(f.regulierung_betrag))
  const avgFallwert = alleBetraege.length > 0
    ? alleBetraege.reduce((a, b) => a + b, 0) / alleBetraege.length
    : 0

  // ── Provision diesen Monat (10%) ──
  const provisionMonat = (abgeschlossenMonat ?? []).reduce((sum, f) => {
    return sum + Number(f.regulierung_betrag) * 0.1
  }, 0)

  // ── Fälle pro Monat Chart-Daten ──
  const monatLabels = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  const chartData: { monat: string; faelle: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const count = (faelleProMonatResult as { created_at: string }[]).filter(f => {
      const fc = new Date(f.created_at)
      return fc.getFullYear() === d.getFullYear() && fc.getMonth() === d.getMonth()
    }).length
    chartData.push({ monat: `${monatLabels[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, faelle: count })
  }

  // ── Lead-Namen für Tabelle laden ──
  const leadIds = (letzteAbgeschlossen ?? [])
    .map(f => f.lead_id)
    .filter((id): id is string => !!id)

  const { data: leads } = leadIds.length > 0
    ? await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] }
  const leadMap = Object.fromEntries((leads ?? []).map(l => [l.id, l]))

  const tabellenDaten = (letzteAbgeschlossen ?? []).map(f => {
    const lead = f.lead_id ? leadMap[f.lead_id] : null
    const betrag = Number(f.regulierung_betrag)
    return {
      id: f.id,
      fall_nummer: f.fall_nummer,
      kunde: lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '—' : '—',
      betrag,
      provision: betrag * 0.1,
      datum: f.regulierung_am,
    }
  })

  return (
    <FinanceClient
      mrr={mrr}
      aktiveSvCount={(aktiveSvs ?? []).length}
      aktiveFaelle={aktiveFaelle ?? 0}
      avgFallwert={avgFallwert}
      provisionMonat={provisionMonat}
      chartData={chartData}
      tabellenDaten={tabellenDaten}
    />
  )
}
