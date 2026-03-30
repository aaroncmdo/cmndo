import { createClient } from '@/lib/supabase/server'
import FinanceClient from './FinanceClient'

const PAKET_PREIS: Record<string, number> = {
  'starter-10': 500,
  'standard-25': 1000,
  'premium-50': 1800,
}

// ── Gewinnverteilung 75/25 ──

function GewinnverteilungSection({
  gesamtProvision,
  claimondoGewinn,
  kanzleiGewinn,
}: {
  gesamtProvision: number
  claimondoGewinn: number
  kanzleiGewinn: number
}) {
  function eur(val: number) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
  }

  return (
    <div className="px-4 pb-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Gewinnverteilung
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-zinc-500 text-xs mb-1">Gesamt Provision</p>
              <p className="text-white text-xl font-bold tabular-nums">{eur(gesamtProvision)}</p>
            </div>
            <div className="text-center">
              <p className="text-zinc-500 text-xs mb-1">Claimondo (75%)</p>
              <p className="text-emerald-400 text-xl font-bold tabular-nums">{eur(claimondoGewinn)}</p>
            </div>
            <div className="text-center">
              <p className="text-zinc-500 text-xs mb-1">Kanzlei (25%)</p>
              <p className="text-blue-400 text-xl font-bold tabular-nums">{eur(kanzleiGewinn)}</p>
            </div>
          </div>
          {/* Visual bar */}
          <div className="mt-4 flex h-3 rounded-full overflow-hidden">
            <div className="bg-emerald-500" style={{ width: '75%' }} />
            <div className="bg-blue-500" style={{ width: '25%' }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-zinc-600">
            <span>Claimondo 75%</span>
            <span>Kanzlei 25%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Marketing (Maik) ──

type MonatsBericht = {
  id: string
  monat: string
  jahr: number
  maik_google_cpl: number | null
  maik_cpa_fix: number | null
  maik_provision: number | null
  marketing_budget_netto: number | null
  marketing_budget_brutto: number | null
  neue_faelle: number | null
}

function MarketingMaikSection({ monatsberichte }: { monatsberichte: MonatsBericht[] }) {
  function eur(val: number) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
  }

  const letzteMonat = monatsberichte.length > 0 ? monatsberichte[monatsberichte.length - 1] : null
  const cpaFix = 150
  const cpl = Number(letzteMonat?.maik_google_cpl ?? 0)
  const faelle = Number(letzteMonat?.neue_faelle ?? 0)
  const marge = cpaFix - cpl
  const provision = marge > 0 ? marge * faelle : 0

  return (
    <div className="px-4 pb-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Marketing (Maik)
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-zinc-500 text-xs mb-1">CPA fix</p>
              <p className="text-white text-lg font-bold tabular-nums">{eur(cpaFix)}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs mb-1">Google CPL</p>
              <p className={`text-lg font-bold tabular-nums ${cpl > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>
                {cpl > 0 ? eur(cpl) : 'Nicht erfasst'}
              </p>
              <p className="text-zinc-600 text-[10px]">Manuell oder Google Ads API</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs mb-1">Maik Marge/Fall</p>
              <p className={`text-lg font-bold tabular-nums ${marge > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}>
                {cpl > 0 ? eur(marge) : '—'}
              </p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs mb-1">Maik Provision</p>
              <p className={`text-lg font-bold tabular-nums ${provision > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}>
                {provision > 0 ? eur(provision) : '—'}
              </p>
              <p className="text-zinc-600 text-[10px]">Auszahlung Mitte Folgemonat</p>
            </div>
          </div>

          {/* Monatliche CPL-Tabelle */}
          {monatsberichte.length > 0 && (
            <div className="overflow-x-auto border-t border-zinc-800 pt-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-3 py-2 text-zinc-500">Monat</th>
                    <th className="text-right px-3 py-2 text-zinc-500">Google CPL</th>
                    <th className="text-right px-3 py-2 text-zinc-500">Faelle</th>
                    <th className="text-right px-3 py-2 text-zinc-500">Budget netto</th>
                    <th className="text-right px-3 py-2 text-zinc-500">Maik Provision</th>
                  </tr>
                </thead>
                <tbody>
                  {monatsberichte.slice(-6).map(mb => (
                    <tr key={mb.id} className="border-b border-zinc-800/50">
                      <td className="px-3 py-2 text-zinc-300">{mb.monat}/{mb.jahr}</td>
                      <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">
                        {Number(mb.maik_google_cpl ?? 0) > 0 ? eur(Number(mb.maik_google_cpl)) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">{mb.neue_faelle ?? 0}</td>
                      <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">
                        {Number(mb.marketing_budget_netto ?? 0) > 0 ? eur(Number(mb.marketing_budget_netto)) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-400 tabular-nums">
                        {Number(mb.maik_provision ?? 0) > 0 ? eur(Number(mb.maik_provision)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 p-3 bg-zinc-800/50 rounded-xl">
            <p className="text-zinc-500 text-xs">
              Google Ads CPL-Werte koennen manuell in der Datenbank erfasst werden.
              API-Endpoint <code className="text-zinc-400">/api/google-ads/sync</code> ist vorbereitet.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Investition pro Fall ──

function InvestitionProFallSection() {
  return (
    <div className="px-4 pb-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Investition pro Fall
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-zinc-800/50 rounded-xl text-center">
              <p className="text-zinc-500 text-xs mb-2">Marketing-Investition / Fall</p>
              <p className="text-white text-2xl font-bold">150,00 &euro;</p>
              <p className="text-zinc-600 text-xs mt-1">CPA fix an Maik</p>
            </div>
            <div className="p-4 bg-zinc-800/50 rounded-xl text-center">
              <p className="text-zinc-500 text-xs mb-2">Ausloeser</p>
              <p className="text-amber-400 text-sm font-medium">Unterschriebene SA</p>
              <p className="text-zinc-600 text-xs mt-1">Nur Faelle mit Schadensanzeige</p>
            </div>
            <div className="p-4 bg-zinc-800/50 rounded-xl text-center">
              <p className="text-zinc-500 text-xs mb-2">Maik-Provision</p>
              <p className="text-emerald-400 text-sm font-medium">CPA (150&euro;) - Google CPL</p>
              <p className="text-zinc-600 text-xs mt-1">Differenz = seine Marge</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-blue-950/30 border border-blue-800/30 rounded-xl">
            <p className="text-blue-300 text-xs">
              Lexoffice-Abgleich vorbereitet: <code className="text-blue-400">/api/lexoffice/sync</code> —
              Zahlungseingaenge werden spaeter automatisch abgeglichen.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Server-rendered Gutachter-Abrechnungen Section ──

function GutachterAbrechnungen({ svRows, gutachterAnzahlungenGesamt }: {
  svRows: { id: string; name: string; paket: string; guthaben: number; faelleGenutzt: number; faelleGesamt: number; leadkostenMonat: number }[]
  gutachterAnzahlungenGesamt: number
}) {
  function eur(val: number) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
  }

  return (
    <div className="px-4 pb-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Gutachter-Zahlungen
            </h2>
            <span className="text-xs text-zinc-500">
              Anzahlungen gesamt: <span className="text-emerald-400 font-medium">{eur(gutachterAnzahlungenGesamt)}</span>
            </span>
          </div>

          {svRows.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-zinc-600 text-sm">Keine aktiven Gutachter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-5 py-3 text-zinc-500 font-medium">Gutachter</th>
                    <th className="text-left px-5 py-3 text-zinc-500 font-medium">Paket</th>
                    <th className="text-right px-5 py-3 text-zinc-500 font-medium">Guthaben</th>
                    <th className="text-center px-5 py-3 text-zinc-500 font-medium">Faelle</th>
                    <th className="text-right px-5 py-3 text-zinc-500 font-medium">Leadkosten Monat</th>
                  </tr>
                </thead>
                <tbody>
                  {svRows.map(sv => {
                    const guthabenColor = sv.guthaben <= 0 ? 'text-red-400' : sv.guthaben < 500 ? 'text-amber-400' : 'text-emerald-400'
                    return (
                      <tr key={sv.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors">
                        <td className="px-5 py-3 text-zinc-200">{sv.name}</td>
                        <td className="px-5 py-3">
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300">
                            {sv.paket}
                          </span>
                        </td>
                        <td className={`px-5 py-3 text-right tabular-nums font-medium ${guthabenColor}`}>
                          {eur(sv.guthaben)}
                        </td>
                        <td className="px-5 py-3 text-center text-zinc-300 tabular-nums">
                          {sv.faelleGenutzt} / {sv.faelleGesamt}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-zinc-300">
                          {sv.leadkostenMonat > 0 ? eur(sv.leadkostenMonat) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
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

  // ── Gutachter-Abrechnungsübersicht ──
  const { data: svUebersicht } = await supabase
    .from('sachverstaendige')
    .select('id, paket, guthaben, paket_faelle_genutzt, paket_faelle_gesamt, profile_id')
    .eq('ist_aktiv', true)

  // Fetch profile names for SVs
  const svProfileIds = (svUebersicht ?? []).map(s => s.profile_id).filter(Boolean)
  const { data: svProfiles } = svProfileIds.length > 0
    ? await supabase.from('profiles').select('id, vorname, nachname').in('id', svProfileIds)
    : { data: [] }
  const svProfileMap = Object.fromEntries((svProfiles ?? []).map(p => [p.id, p]))

  // Fetch monthly leadkosten per SV
  const currentMonat = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const { data: monatAbrechnungen } = await supabase
    .from('gutachter_abrechnungen')
    .select('sv_id, leadpreis')
    .eq('monat', currentMonat)

  const monatKostenMap: Record<string, number> = {}
  for (const a of monatAbrechnungen ?? []) {
    monatKostenMap[a.sv_id] = (monatKostenMap[a.sv_id] ?? 0) + Number(a.leadpreis)
  }

  const svRows = (svUebersicht ?? []).map(s => {
    const profile = svProfileMap[s.profile_id]
    return {
      id: s.id,
      name: profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() || '—' : '—',
      paket: s.paket ?? '—',
      guthaben: Number(s.guthaben ?? 0),
      faelleGenutzt: s.paket_faelle_genutzt ?? 0,
      faelleGesamt: s.paket_faelle_gesamt ?? 0,
      leadkostenMonat: monatKostenMap[s.id] ?? 0,
    }
  })

  // ── Monatsberichte laden ──
  const { data: monatsberichte } = await supabase
    .from('finance_monatsberichte')
    .select('*')
    .order('jahr', { ascending: true })
    .order('monat', { ascending: true })

  // ── Gewinnverteilung berechnen ──
  const gesamtProvision = (alleAbgeschlossen ?? []).reduce((s, f) => s + Number(f.regulierung_betrag) * 0.1, 0)
  const claimondoGewinn = gesamtProvision * 0.75
  const kanzleiGewinn = gesamtProvision * 0.25

  // ── Gutachter-Anzahlungen Summe ──
  const { data: allEinzahlungen } = await supabase
    .from('gutachter_einzahlungen')
    .select('betrag')
  const gutachterAnzahlungenGesamt = (allEinzahlungen ?? []).reduce((s, e) => s + Number(e.betrag), 0)

  return (
    <>
      <FinanceClient
        mrr={mrr}
        aktiveSvCount={(aktiveSvs ?? []).length}
        aktiveFaelle={aktiveFaelle ?? 0}
        avgFallwert={avgFallwert}
        provisionMonat={provisionMonat}
        chartData={chartData}
        tabellenDaten={tabellenDaten}
      />
      <GewinnverteilungSection
        gesamtProvision={gesamtProvision}
        claimondoGewinn={claimondoGewinn}
        kanzleiGewinn={kanzleiGewinn}
      />
      <MarketingMaikSection monatsberichte={monatsberichte ?? []} />
      <GutachterAbrechnungen svRows={svRows} gutachterAnzahlungenGesamt={gutachterAnzahlungenGesamt} />
      <InvestitionProFallSection />
    </>
  )
}
