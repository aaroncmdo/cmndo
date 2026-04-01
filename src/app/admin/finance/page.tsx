import { createClient } from '@/lib/supabase/server'
import FinanceClient from './FinanceClient'

const PAKET_PREIS: Record<string, number> = {
  standard: 750, 'starter-10': 750,
  pro: 1875, 'standard-25': 1875,
  premium: 3750, 'premium-50': 3750,
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
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Gewinnverteilung
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-gray-500 text-xs mb-1">Gesamt Provision</p>
              <p className="text-gray-900 text-xl font-bold tabular-nums">{eur(gesamtProvision)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-xs mb-1">Claimondo (75%)</p>
              <p className="text-emerald-400 text-xl font-bold tabular-nums">{eur(claimondoGewinn)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-xs mb-1">Kanzlei (25%)</p>
              <p className="text-[#7BA3CC] text-xl font-bold tabular-nums">{eur(kanzleiGewinn)}</p>
            </div>
          </div>
          {/* Visual bar */}
          <div className="mt-4 flex h-3 rounded-full overflow-hidden">
            <div className="bg-emerald-500" style={{ width: '75%' }} />
            <div className="bg-[#4573A2]" style={{ width: '25%' }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-gray-400">
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
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Marketing (Maik)
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-gray-500 text-xs mb-1">CPA fix</p>
              <p className="text-gray-900 text-lg font-bold tabular-nums">{eur(cpaFix)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Google CPL</p>
              <p className={`text-lg font-bold tabular-nums ${cpl > 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                {cpl > 0 ? eur(cpl) : 'Nicht erfasst'}
              </p>
              <p className="text-gray-400 text-[10px]">Manuell oder Google Ads API</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Maik Marge/Fall</p>
              <p className={`text-lg font-bold tabular-nums ${marge > 0 ? 'text-emerald-400' : 'text-gray-400'}`}>
                {cpl > 0 ? eur(marge) : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Maik Provision</p>
              <p className={`text-lg font-bold tabular-nums ${provision > 0 ? 'text-emerald-400' : 'text-gray-400'}`}>
                {provision > 0 ? eur(provision) : '—'}
              </p>
              <p className="text-gray-400 text-[10px]">Auszahlung Mitte Folgemonat</p>
            </div>
          </div>

          {/* Monatliche CPL-Tabelle */}
          {monatsberichte.length > 0 && (
            <div className="overflow-x-auto border-t border-gray-200 pt-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-3 py-2 text-gray-500">Monat</th>
                    <th className="text-right px-3 py-2 text-gray-500">Google CPL</th>
                    <th className="text-right px-3 py-2 text-gray-500">Faelle</th>
                    <th className="text-right px-3 py-2 text-gray-500">Budget netto</th>
                    <th className="text-right px-3 py-2 text-gray-500">Maik Provision</th>
                  </tr>
                </thead>
                <tbody>
                  {monatsberichte.slice(-6).map(mb => (
                    <tr key={mb.id} className="border-b border-gray-200/50">
                      <td className="px-3 py-2 text-gray-700">{mb.monat}/{mb.jahr}</td>
                      <td className="px-3 py-2 text-right text-gray-700 tabular-nums">
                        {Number(mb.maik_google_cpl ?? 0) > 0 ? eur(Number(mb.maik_google_cpl)) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{mb.neue_faelle ?? 0}</td>
                      <td className="px-3 py-2 text-right text-gray-700 tabular-nums">
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

          <div className="mt-4 p-3 bg-gray-100/50 rounded-xl">
            <p className="text-gray-500 text-xs">
              Google Ads CPL-Werte koennen manuell in der Datenbank erfasst werden.
              API-Endpoint <code className="text-gray-500">/api/google-ads/sync</code> ist vorbereitet.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Individuelle Anfragen (KFZ-94) ──

type IndividuelleAnfrage = {
  id: string
  sv_id: string
  sv_name: string
  gewuenschte_faelle: number | null
  gewuenschter_radius_km: number | null
  nachricht: string | null
  status: string
  erstellt_am: string
}

function IndividuelleAnfragenSection({ anfragen }: { anfragen: IndividuelleAnfrage[] }) {
  const statusColors: Record<string, string> = {
    neu: 'bg-[#4573A2]/5 text-[#4573A2]',
    'in-bearbeitung': 'bg-amber-50 text-amber-600',
    angeboten: 'bg-purple-50 text-purple-600',
    angenommen: 'bg-emerald-50 text-emerald-600',
    abgelehnt: 'bg-red-50 text-red-600',
  }

  return (
    <div className="px-4 pb-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Individuelle Anfragen
            </h2>
          </div>
          {anfragen.length === 0 ? (
            <div className="p-8 text-center"><p className="text-gray-400 text-sm">Keine Anfragen vorhanden.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-5 py-3 text-gray-500 font-medium">Gutachter</th>
                    <th className="text-center px-5 py-3 text-gray-500 font-medium">Fälle</th>
                    <th className="text-center px-5 py-3 text-gray-500 font-medium">Radius</th>
                    <th className="text-left px-5 py-3 text-gray-500 font-medium">Nachricht</th>
                    <th className="text-center px-5 py-3 text-gray-500 font-medium">Status</th>
                    <th className="text-right px-5 py-3 text-gray-500 font-medium">Datum</th>
                  </tr>
                </thead>
                <tbody>
                  {anfragen.map(a => (
                    <tr key={a.id} className="border-b border-gray-200/50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-gray-800">{a.sv_name}</td>
                      <td className="px-5 py-3 text-center text-gray-700">{a.gewuenschte_faelle ?? '—'}/Mo</td>
                      <td className="px-5 py-3 text-center text-gray-700">{a.gewuenschter_radius_km ?? '—'}km</td>
                      <td className="px-5 py-3 text-gray-600 text-xs max-w-[200px] truncate">{a.nachricht ?? '—'}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[a.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-gray-500 text-xs tabular-nums">
                        {new Date(a.erstellt_am).toLocaleDateString('de-DE')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Kanzlei-Provision (150€ pro Vollmacht) ──

function KanzleiProvisionSection({
  vollmachtenGesamt,
  vollmachtenMonat,
  provisionGesamt,
  provisionMonat,
  letzteVollmachten,
}: {
  vollmachtenGesamt: number
  vollmachtenMonat: number
  provisionGesamt: number
  provisionMonat: number
  letzteVollmachten: { id: string; name: string; datum: string }[]
}) {
  function eur(val: number) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
  }

  return (
    <div className="px-4 pb-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Kanzlei-Provision (150&euro; / Vollmacht)
            </h2>
            <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full font-medium">
              Nur mandatstyp: kanzlei-claimondo
            </span>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-3 bg-gray-50 rounded-xl">
                <p className="text-gray-500 text-xs mb-1">Vollmachten gesamt</p>
                <p className="text-gray-900 text-2xl font-bold tabular-nums">{vollmachtenGesamt}</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-xl">
                <p className="text-gray-500 text-xs mb-1">Provision gesamt</p>
                <p className="text-purple-600 text-2xl font-bold tabular-nums">{eur(provisionGesamt)}</p>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-xl">
                <p className="text-gray-500 text-xs mb-1">Dieser Monat</p>
                <p className="text-gray-900 text-2xl font-bold tabular-nums">{vollmachtenMonat}</p>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-xl">
                <p className="text-gray-500 text-xs mb-1">Provision Monat</p>
                <p className="text-purple-600 text-2xl font-bold tabular-nums">{eur(provisionMonat)}</p>
              </div>
            </div>

            {letzteVollmachten.length > 0 && (
              <div className="border-t border-gray-200 pt-4">
                <p className="text-xs text-gray-500 font-medium mb-2">Letzte Vollmachten (Kanzlei)</p>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {letzteVollmachten.map(v => (
                    <div key={v.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-xs">
                      <span className="text-gray-800 font-medium">{v.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-purple-600 font-semibold tabular-nums">150,00 &euro;</span>
                        <span className="text-gray-400 tabular-nums">{v.datum}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Investition pro Fall
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-100/50 rounded-xl text-center">
              <p className="text-gray-500 text-xs mb-2">Marketing-Investition / Fall</p>
              <p className="text-gray-900 text-2xl font-bold">150,00 &euro;</p>
              <p className="text-gray-400 text-xs mt-1">CPA fix an Maik</p>
            </div>
            <div className="p-4 bg-gray-100/50 rounded-xl text-center">
              <p className="text-gray-500 text-xs mb-2">Ausloeser</p>
              <p className="text-amber-400 text-sm font-medium">Unterschriebene SA</p>
              <p className="text-gray-400 text-xs mt-1">Nur Faelle mit Schadensanzeige</p>
            </div>
            <div className="p-4 bg-gray-100/50 rounded-xl text-center">
              <p className="text-gray-500 text-xs mb-2">Maik-Provision</p>
              <p className="text-emerald-400 text-sm font-medium">CPA (150&euro;) - Google CPL</p>
              <p className="text-gray-400 text-xs mt-1">Differenz = seine Marge</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-[#4573A2]/10 border border-[#1E3A5F]/30 rounded-xl">
            <p className="text-[#7BA3CC] text-xs">
              Lexoffice-Abgleich vorbereitet: <code className="text-[#7BA3CC]">/api/lexoffice/sync</code> —
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
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Gutachter-Zahlungen
            </h2>
            <span className="text-xs text-gray-500">
              Anzahlungen gesamt: <span className="text-emerald-400 font-medium">{eur(gutachterAnzahlungenGesamt)}</span>
            </span>
          </div>

          {svRows.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-400 text-sm">Keine aktiven Gutachter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-5 py-3 text-gray-500 font-medium">Gutachter</th>
                    <th className="text-left px-5 py-3 text-gray-500 font-medium">Paket</th>
                    <th className="text-right px-5 py-3 text-gray-500 font-medium">Guthaben</th>
                    <th className="text-center px-5 py-3 text-gray-500 font-medium">Faelle</th>
                    <th className="text-right px-5 py-3 text-gray-500 font-medium">Leadkosten Monat</th>
                  </tr>
                </thead>
                <tbody>
                  {svRows.map(sv => {
                    const guthabenColor = sv.guthaben <= 0 ? 'text-red-400' : sv.guthaben < 500 ? 'text-amber-400' : 'text-emerald-400'
                    return (
                      <tr key={sv.id} className="border-b border-gray-200/50 hover:bg-gray-100/40 transition-colors">
                        <td className="px-5 py-3 text-gray-800">{sv.name}</td>
                        <td className="px-5 py-3">
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                            {sv.paket}
                          </span>
                        </td>
                        <td className={`px-5 py-3 text-right tabular-nums font-medium ${guthabenColor}`}>
                          {eur(sv.guthaben)}
                        </td>
                        <td className="px-5 py-3 text-center text-gray-700 tabular-nums">
                          {sv.faelleGenutzt} / {sv.faelleGesamt}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-700">
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

  // ── Kanzlei-Provision: 150€ pro unterschriebene Vollmacht (mandatstyp=kanzlei-claimondo) ──
  const [{ data: kanzleiVollmachtenGesamt }, { data: kanzleiVollmachtenMonat }] = await Promise.all([
    supabase
      .from('leads')
      .select('id, vorname, nachname, vollmacht_datum, created_at')
      .eq('vollmacht_unterschrieben', true)
      .eq('mandatstyp', 'kanzlei-claimondo')
      .order('vollmacht_datum', { ascending: false }),
    supabase
      .from('leads')
      .select('id')
      .eq('vollmacht_unterschrieben', true)
      .eq('mandatstyp', 'kanzlei-claimondo')
      .gte('vollmacht_datum', monatStart)
      .lte('vollmacht_datum', monatEnde),
  ])

  const kanzleiVollmachtenTotal = (kanzleiVollmachtenGesamt ?? []).length
  const kanzleiVollmachtenDiesenMonat = (kanzleiVollmachtenMonat ?? []).length
  const kanzleiProvisionGesamt = kanzleiVollmachtenTotal * 150
  const kanzleiProvisionMonat = kanzleiVollmachtenDiesenMonat * 150

  // ── Individuelle Anfragen ──
  let individuelleAnfragen: IndividuelleAnfrage[] = []
  try {
    const { data: anfragen } = await supabase
      .from('individuelle_anfragen')
      .select('id, sv_id, gewuenschte_faelle, gewuenschter_radius_km, nachricht, status, erstellt_am')
      .order('erstellt_am', { ascending: false })
      .limit(50)
    if (anfragen && anfragen.length > 0) {
      const anfSvIds = [...new Set(anfragen.map(a => a.sv_id))]
      const { data: anfSvs } = await supabase.from('sachverstaendige').select('id, profile_id').in('id', anfSvIds)
      const anfProfileIds = (anfSvs ?? []).map(s => s.profile_id).filter(Boolean)
      const { data: anfProfiles } = anfProfileIds.length > 0
        ? await supabase.from('profiles').select('id, vorname, nachname').in('id', anfProfileIds)
        : { data: [] }
      const anfSvMap = Object.fromEntries((anfSvs ?? []).map(s => [s.id, s]))
      const anfProfileMap = Object.fromEntries((anfProfiles ?? []).map(p => [p.id, p]))
      individuelleAnfragen = anfragen.map(a => {
        const sv = anfSvMap[a.sv_id]
        const profile = sv ? anfProfileMap[sv.profile_id] : null
        return { ...a, sv_name: profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() || '—' : '—' }
      })
    }
  } catch { /* table may not exist yet */ }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sticky Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Finanzen</h1>
          <p className="text-xs text-gray-500">Umsatz, Provision & Kennzahlen</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-medium">
          <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">MRR {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(mrr)}</span>
          <span className="bg-[#4573A2]/5 text-[#4573A2] px-2 py-0.5 rounded-full">{(aktiveSvs ?? []).length} SVs</span>
          {kanzleiVollmachtenDiesenMonat > 0 && (
            <span className="bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{kanzleiVollmachtenDiesenMonat} Vollmachten</span>
          )}
        </div>
      </div>
      {/* Scrollbarer Content */}
      <div className="flex-1 overflow-y-auto">
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
      <KanzleiProvisionSection
        vollmachtenGesamt={kanzleiVollmachtenTotal}
        vollmachtenMonat={kanzleiVollmachtenDiesenMonat}
        provisionGesamt={kanzleiProvisionGesamt}
        provisionMonat={kanzleiProvisionMonat}
        letzteVollmachten={(kanzleiVollmachtenGesamt ?? []).slice(0, 20).map(l => ({
          id: l.id,
          name: `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || '\u2014',
          datum: l.vollmacht_datum ? new Date(l.vollmacht_datum).toLocaleDateString('de-DE') : l.created_at ? new Date(l.created_at).toLocaleDateString('de-DE') : '\u2014',
        }))}
      />
      <GutachterAbrechnungen svRows={svRows} gutachterAnzahlungenGesamt={gutachterAnzahlungenGesamt} />
      <IndividuelleAnfragenSection anfragen={individuelleAnfragen} />
      <InvestitionProFallSection />
      </div>
    </div>
  )
}
