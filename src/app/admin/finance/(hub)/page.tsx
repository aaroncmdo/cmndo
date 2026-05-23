import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FINANCE } from '@/lib/finance/constants'
import PageHeader from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import FinanceClient from './FinanceClient'
import AbrechnungenSection from './AbrechnungenSection'
import AusstehendeZahlungenTable from '../../_components/AusstehendeZahlungenTable'
import StripeConnectStatusWidget from '../../_components/StripeConnectStatusWidget'
import LeadPreiseVerteilungWidget from '../../_components/LeadPreiseVerteilungWidget'
import WerbebudgetAggregatWidget from '../../_components/WerbebudgetAggregatWidget'
import MonatsUmsatzForecast from '../../_components/MonatsUmsatzForecast'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

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
      <div>
        <div className="bg-white border border-claimondo-border rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider mb-4">
            Gewinnverteilung
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-claimondo-ondo text-xs mb-1">Gesamt Provision</p>
              <p className="text-claimondo-navy text-xl font-bold tabular-nums">{eur(gesamtProvision)}</p>
            </div>
            <div className="text-center">
              <p className="text-claimondo-ondo text-xs mb-1">Claimondo (75%)</p>
              <p className="text-emerald-400 text-xl font-bold tabular-nums">{eur(claimondoGewinn)}</p>
            </div>
            <div className="text-center">
              <p className="text-claimondo-ondo text-xs mb-1">Kanzlei (25%)</p>
              <p className="text-claimondo-light-blue text-xl font-bold tabular-nums">{eur(kanzleiGewinn)}</p>
            </div>
          </div>
          {/* Visual bar */}
          <div className="mt-4 flex h-3 rounded-full overflow-hidden">
            <div className="bg-emerald-500" style={{ width: '75%' }} />
            <div className="bg-claimondo-ondo" style={{ width: '25%' }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-claimondo-ondo/70">
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
  const cpaFix = FINANCE.CPA_MARKETING_NETTO
  const cpl = Number(letzteMonat?.maik_google_cpl ?? 0)
  const faelle = Number(letzteMonat?.neue_faelle ?? 0)
  const marge = cpaFix - cpl
  const provision = marge > 0 ? marge * faelle : 0

  return (
    <div className="px-4 pb-8">
      <div>
        <div className="bg-white border border-claimondo-border rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider mb-4">
            Marketing (Maik)
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-claimondo-ondo text-xs mb-1">CPA fix</p>
              <p className="text-claimondo-navy text-lg font-bold tabular-nums">{eur(cpaFix)}</p>
            </div>
            <div>
              <p className="text-claimondo-ondo text-xs mb-1">Google CPL</p>
              <p className={`text-lg font-bold tabular-nums ${cpl > 0 ? 'text-amber-400' : 'text-claimondo-ondo/70'}`}>
                {cpl > 0 ? eur(cpl) : 'Nicht erfasst'}
              </p>
              <p className="text-claimondo-ondo/70 text-[10px]">Manuell oder Google Ads API</p>
            </div>
            <div>
              <p className="text-claimondo-ondo text-xs mb-1">Maik Marge/Fall</p>
              <p className={`text-lg font-bold tabular-nums ${marge > 0 ? 'text-emerald-400' : 'text-claimondo-ondo/70'}`}>
                {cpl > 0 ? eur(marge) : '—'}
              </p>
            </div>
            <div>
              <p className="text-claimondo-ondo text-xs mb-1">Maik Provision</p>
              <p className={`text-lg font-bold tabular-nums ${provision > 0 ? 'text-emerald-400' : 'text-claimondo-ondo/70'}`}>
                {provision > 0 ? eur(provision) : '—'}
              </p>
              <p className="text-claimondo-ondo/70 text-[10px]">Auszahlung Mitte Folgemonat</p>
            </div>
          </div>

          {/* Monatliche CPL-Tabelle */}
          {monatsberichte.length > 0 && (
            <DataTableContainer variant="plain" className="border-t border-claimondo-border pt-4">
              <Table className="!text-xs">
                <Thead className="!bg-transparent border-b border-claimondo-border">
                  <Tr>
                    <Th className="text-left !px-3 !py-2 font-bold !text-claimondo-ondo">Monat</Th>
                    <Th className="text-right !px-3 !py-2 font-bold !text-claimondo-ondo">Google CPL</Th>
                    <Th className="text-right !px-3 !py-2 font-bold !text-claimondo-ondo">Faelle</Th>
                    <Th className="text-right !px-3 !py-2 font-bold !text-claimondo-ondo">Budget netto</Th>
                    <Th className="text-right !px-3 !py-2 font-bold !text-claimondo-ondo">Maik Provision</Th>
                  </Tr>
                </Thead>
                <Tbody className="!divide-y-0">
                  {monatsberichte.slice(-6).map(mb => (
                    <Tr key={mb.id} className="border-b border-claimondo-border/50">
                      <Td className="!px-3 !py-2">{mb.monat}/{mb.jahr}</Td>
                      <Td className="!px-3 !py-2 text-right tabular-nums">
                        {Number(mb.maik_google_cpl ?? 0) > 0 ? eur(Number(mb.maik_google_cpl)) : '—'}
                      </Td>
                      <Td className="!px-3 !py-2 text-right tabular-nums">{mb.neue_faelle ?? 0}</Td>
                      <Td className="!px-3 !py-2 text-right tabular-nums">
                        {Number(mb.marketing_budget_netto ?? 0) > 0 ? eur(Number(mb.marketing_budget_netto)) : '—'}
                      </Td>
                      <Td className="!px-3 !py-2 text-right !text-emerald-400 tabular-nums">
                        {Number(mb.maik_provision ?? 0) > 0 ? eur(Number(mb.maik_provision)) : '—'}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </DataTableContainer>
          )}

          <div className="mt-4 p-3 bg-claimondo-bg/50 rounded-ios-xl">
            <p className="text-claimondo-ondo text-xs">
              Google Ads CPL-Werte können manuell in der Datenbank erfasst werden.
              API-Endpoint <code className="text-claimondo-ondo">/api/google-ads/sync</code> ist vorbereitet.
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
    neu: 'bg-claimondo-ondo/5 text-claimondo-ondo',
    'in-bearbeitung': 'bg-amber-50 text-amber-600',
    angeboten: 'bg-claimondo-ondo/[0.06] text-claimondo-navy',
    angenommen: 'bg-emerald-50 text-emerald-600',
    abgelehnt: 'bg-red-50 text-red-600',
  }

  return (
    <div className="px-4 pb-8">
      <div>
        <div className="bg-white border border-claimondo-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-claimondo-border">
            <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider">
              Individuelle Anfragen
            </h2>
          </div>
          {anfragen.length === 0 ? (
            <div className="p-8 text-center"><p className="text-claimondo-ondo/70 text-sm">Keine Anfragen vorhanden.</p></div>
          ) : (
            <DataTableContainer variant="plain">
              <Table>
                <Thead className="!bg-transparent border-b border-claimondo-border">
                  <Tr>
                    <Th className="text-left px-5 !text-claimondo-ondo">Gutachter</Th>
                    <Th className="text-center px-5 !text-claimondo-ondo">Fälle</Th>
                    <Th className="text-center px-5 !text-claimondo-ondo">Radius</Th>
                    <Th className="text-left px-5 !text-claimondo-ondo">Nachricht</Th>
                    <Th className="text-center px-5 !text-claimondo-ondo">Status</Th>
                    <Th className="text-right px-5 !text-claimondo-ondo">Datum</Th>
                  </Tr>
                </Thead>
                <Tbody className="!divide-y-0">
                  {anfragen.map(a => (
                    <Tr key={a.id} className="border-b border-claimondo-border/50 hover:bg-claimondo-bg transition-colors">
                      <Td className="px-5">{a.sv_name}</Td>
                      <Td className="px-5 text-center">{a.gewuenschte_faelle ?? '—'}/Mo</Td>
                      <Td className="px-5 text-center">{a.gewuenschter_radius_km ?? '—'}km</Td>
                      <Td className="px-5 !text-claimondo-ondo text-xs max-w-[200px] truncate">{a.nachricht ?? '—'}</Td>
                      <Td className="px-5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[a.status] ?? 'bg-claimondo-bg text-claimondo-ondo'}`}>
                          {a.status}
                        </span>
                      </Td>
                      <Td className="px-5 text-right !text-claimondo-ondo text-xs tabular-nums">
                        {new Date(a.erstellt_am).toLocaleDateString('de-DE')}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </DataTableContainer>
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
      <div>
        <div className="bg-white border border-claimondo-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-claimondo-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider">
              Kanzlei-Provision (150&euro; / Vollmacht)
            </h2>
            <StatusBadge colorCls="text-claimondo-navy bg-claimondo-ondo/[0.06]">
              Nur mandatstyp: kanzlei-claimondo
            </StatusBadge>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-3 bg-claimondo-bg rounded-ios-xl">
                <p className="text-claimondo-ondo text-xs mb-1">Vollmachten gesamt</p>
                <p className="text-claimondo-navy text-2xl font-bold tabular-nums">{vollmachtenGesamt}</p>
              </div>
              <div className="text-center p-3 bg-claimondo-bg rounded-ios-xl">
                <p className="text-claimondo-ondo text-xs mb-1">Provision gesamt</p>
                <p className="text-claimondo-navy text-2xl font-bold tabular-nums">{eur(provisionGesamt)}</p>
              </div>
              <div className="text-center p-3 bg-claimondo-ondo/[0.06] rounded-ios-xl">
                <p className="text-claimondo-ondo text-xs mb-1">Dieser Monat</p>
                <p className="text-claimondo-navy text-2xl font-bold tabular-nums">{vollmachtenMonat}</p>
              </div>
              <div className="text-center p-3 bg-claimondo-ondo/[0.06] rounded-ios-xl">
                <p className="text-claimondo-ondo text-xs mb-1">Provision Monat</p>
                <p className="text-claimondo-navy text-2xl font-bold tabular-nums">{eur(provisionMonat)}</p>
              </div>
            </div>

            {letzteVollmachten.length > 0 && (
              <div className="border-t border-claimondo-border pt-4">
                <p className="text-xs text-claimondo-ondo font-medium mb-2">Letzte Vollmachten (Kanzlei)</p>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {letzteVollmachten.map(v => (
                    <div key={v.id} className="flex items-center justify-between px-3 py-2 bg-claimondo-bg rounded-ios-lg text-xs">
                      <span className="text-claimondo-navy font-medium">{v.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-claimondo-navy font-semibold tabular-nums">150,00 &euro;</span>
                        <span className="text-claimondo-ondo/70 tabular-nums">{v.datum}</span>
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
      <div>
        <div className="bg-white border border-claimondo-border rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider mb-4">
            Investition pro Fall
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-claimondo-bg/50 rounded-ios-xl text-center">
              <p className="text-claimondo-ondo text-xs mb-2">Marketing-Investition / Fall</p>
              <p className="text-claimondo-navy text-2xl font-bold">150,00 &euro;</p>
              <p className="text-claimondo-ondo/70 text-xs mt-1">CPA fix an Maik</p>
            </div>
            <div className="p-4 bg-claimondo-bg/50 rounded-ios-xl text-center">
              <p className="text-claimondo-ondo text-xs mb-2">Ausloeser</p>
              <p className="text-amber-400 text-sm font-medium">Unterschriebene SA</p>
              <p className="text-claimondo-ondo/70 text-xs mt-1">Nur Faelle mit Schadensanzeige</p>
            </div>
            <div className="p-4 bg-claimondo-bg/50 rounded-ios-xl text-center">
              <p className="text-claimondo-ondo text-xs mb-2">Maik-Provision</p>
              <p className="text-emerald-400 text-sm font-medium">CPA (150&euro;) - Google CPL</p>
              <p className="text-claimondo-ondo/70 text-xs mt-1">Differenz = seine Marge</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-claimondo-ondo/10 border border-claimondo-shield/30 rounded-ios-xl">
            <p className="text-claimondo-light-blue text-xs">
              Lexoffice-Abgleich vorbereitet: <code className="text-claimondo-light-blue">/api/lexoffice/sync</code> —
              Zahlungseingänge werden später automatisch abgeglichen.
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
      <div>
        <div className="bg-white border border-claimondo-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-claimondo-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider">
              Gutachter-Zahlungen
            </h2>
            <span className="text-xs text-claimondo-ondo">
              Anzahlungen gesamt: <span className="text-emerald-400 font-medium">{eur(gutachterAnzahlungenGesamt)}</span>
            </span>
          </div>

          {svRows.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-claimondo-ondo/70 text-sm">Keine aktiven Gutachter.</p>
            </div>
          ) : (
            <DataTableContainer variant="plain">
              <Table>
                <Thead className="!bg-transparent border-b border-claimondo-border">
                  <Tr>
                    <Th className="text-left px-5 !text-claimondo-ondo">Gutachter</Th>
                    <Th className="text-left px-5 !text-claimondo-ondo">Paket</Th>
                    <Th className="text-right px-5 !text-claimondo-ondo">Guthaben</Th>
                    <Th className="text-center px-5 !text-claimondo-ondo">Faelle</Th>
                    <Th className="text-right px-5 !text-claimondo-ondo">Leadkosten Monat</Th>
                  </Tr>
                </Thead>
                <Tbody className="!divide-y-0">
                  {svRows.map(sv => {
                    const guthabenColor = sv.guthaben <= 0 ? 'text-red-400' : sv.guthaben < 500 ? 'text-amber-400' : 'text-emerald-400'
                    return (
                      <Tr key={sv.id} className="border-b border-claimondo-border/50 hover:bg-claimondo-bg/40 transition-colors">
                        <Td className="px-5">{sv.name}</Td>
                        <Td className="px-5">
                          <span className="px-2 py-0.5 rounded-ios-md text-xs font-medium bg-claimondo-bg text-claimondo-navy">
                            {sv.paket}
                          </span>
                        </Td>
                        <Td className={`px-5 text-right tabular-nums font-medium !${guthabenColor}`}>
                          {eur(sv.guthaben)}
                        </Td>
                        <Td className="px-5 text-center tabular-nums">
                          {sv.faelleGenutzt} / {sv.faelleGesamt}
                        </Td>
                        <Td className="px-5 text-right tabular-nums">
                          {sv.leadkostenMonat > 0 ? eur(sv.leadkostenMonat) : '—'}
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            </DataTableContainer>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Abrechnungen (KFZ-141) ──

async function AbrechnungenSectionWrapper() {
  const supabase = await createClient()

  let abrechnungen: Array<{
    id: string; empfaenger_typ: string; empfaenger_name: string; abrechnungs_nr: string
    abrechnungs_zeitraum_start: string; abrechnungs_zeitraum_ende: string
    summe_brutto: number; versand_datum: string | null; faellig_am: string | null
    status: string; pdf_path: string | null; pdf_url: string | null
  }> = []

  try {
    const { data } = await supabase
      .from('abrechnungen')
      .select('id, empfaenger_typ, empfaenger_name, abrechnungs_nr, abrechnungs_zeitraum_start, abrechnungs_zeitraum_ende, summe_brutto, versand_datum, faellig_am, status, pdf_path')
      .order('created_at', { ascending: false })
      .limit(100)

    // Signed-URL pro Abrechnung erzeugen — abrechnungen-pdf-Bucket ist
    // public=false (laut Storage-Audit), daher liefert eine raw
    // `/storage/v1/object/public/...`-URL 400. createSignedUrl mit
    // 1h TTL (admin-View, browser-cachebar binnen Page-Render).
    abrechnungen = await Promise.all(
      (data ?? []).map(async d => {
        let pdf_url: string | null = null
        if (d.pdf_path) {
          const { data: signed } = await supabase.storage
            .from('abrechnungen-pdf')
            .createSignedUrl(d.pdf_path as string, 60 * 60)
          pdf_url = signed?.signedUrl ?? null
        }
        return { ...d, summe_brutto: Number(d.summe_brutto), pdf_url }
      }),
    )
  } catch { /* table may not exist yet */ }

  return <AbrechnungenSection abrechnungen={abrechnungen} />
}

export default async function FinancePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/admin')

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
    // CMM-44 SP-A2 (Cluster 3): regulierung_betrag → claims.regulierungs_betrag (SSoT).
    // CMM-44 SP-I3: regulierung_am lebt auf kanzlei_faelle (1:1) — Filter auf
    // regulierung_am ist via Embed nicht moeglich, daher aus
    // v_faelle_mit_aktuellem_termin (regulierung_am + regulierung_betrag flach).
    supabase
      .from('v_faelle_mit_aktuellem_termin')
      .select('regulierung_betrag')
      .eq('status', 'abgeschlossen')
      .gte('regulierung_am', monatStart)
      .lte('regulierung_am', monatEnde)
      .not('regulierung_betrag', 'is', null),

    // 4. Alle abgeschlossenen Fälle mit Betrag (für Durchschnitt)
    supabase
      .from('faelle')
      .select('claims:claim_id!inner(regulierungs_betrag)')
      .eq('status', 'abgeschlossen')
      .not('claims.regulierungs_betrag', 'is', null),

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
    // CMM-44 SP-A2 (Cluster 3): regulierung_betrag → claims.regulierungs_betrag.
    // CMM-44 SP-I3: regulierung_am lebt auf kanzlei_faelle (1:1) — Sort auf
    // regulierung_am ist via Embed nicht moeglich, daher aus
    // v_faelle_mit_aktuellem_termin (alle Felder flach).
    supabase
      .from('v_faelle_mit_aktuellem_termin')
      .select('id, regulierung_am, lead_id, claim_nummer, regulierung_betrag')
      .eq('status', 'abgeschlossen')
      .not('regulierung_betrag', 'is', null)
      .order('regulierung_am', { ascending: false })
      .limit(15),
  ])

  // ── MRR berechnen ──
  const mrr = (aktiveSvs ?? []).reduce((sum, sv) => {
    return sum + (PAKET_PREIS[sv.paket] ?? 0)
  }, 0)

  // CMM-44 SP-A2 (Cluster 3): regulierungs_betrag aus dem claims-Embed ziehen
  // (Array|Objekt normalisieren). Wird nur noch von Query #4 (alleAbgeschlossen)
  // genutzt, das weiter den claims-Embed liest (kein regulierung_am-Bezug).
  const claimRegBetrag = (f: { claims: unknown }): number => {
    const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
    return Number((c as { regulierungs_betrag?: number | null } | null)?.regulierungs_betrag) || 0
  }
  // CMM-44 SP-I3: Query #3/#6 lesen jetzt aus v_faelle_mit_aktuellem_termin —
  // regulierung_betrag ist dort flach.
  const viewRegBetrag = (f: { regulierung_betrag: number | null }): number =>
    Number(f.regulierung_betrag) || 0

  // ── Durchschnittlicher Fallwert ──
  const alleBetraege = (alleAbgeschlossen ?? []).map(claimRegBetrag)
  const avgFallwert = alleBetraege.length > 0
    ? alleBetraege.reduce((a, b) => a + b, 0) / alleBetraege.length
    : 0

  // ── Provision diesen Monat (10%) ──
  const provisionMonat = (abgeschlossenMonat ?? []).reduce((sum, f) => {
    return sum + viewRegBetrag(f) * 0.1
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
    // CMM-44 SP-I3: regulierung_betrag + claim_nummer flach aus der View (s.o.).
    // View-Spalten sind nullable getypt; id (= faelle.id) ist faktisch immer
    // gesetzt — auf string normalisieren fuer den FinanceClient-Prop.
    const betrag = viewRegBetrag(f)
    return {
      id: (f.id ?? '') as string,
      claim_nummer: f.claim_nummer ?? null,
      kunde: lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '—' : '—',
      betrag,
      provision: betrag * 0.1,
      datum: f.regulierung_am,
    }
  })

  // ── Gutachter-Abrechnungsübersicht ──
  const { data: svUebersicht } = await supabase
    .from('sachverstaendige')
    .select('id, paket, werbebudget_guthaben_netto, paket_faelle_genutzt, paket_faelle_gesamt, profile_id')
    .eq('ist_aktiv', true)

  // Fetch profile names for SVs
  const svProfileIds = (svUebersicht ?? []).map(s => s.profile_id).filter(Boolean)
  const { data: svProfiles } = svProfileIds.length > 0
    ? await supabase.from('profiles').select('id, vorname, nachname').in('id', svProfileIds)
    : { data: [] }
  const svProfileMap = Object.fromEntries((svProfiles ?? []).map(p => [p.id, p]))

  // AAR-928: Leadkosten-Monat aus faelle.lead_preis_netto (laufender Monat)
  // statt aus alter `gutachter_abrechnungen`-Tabelle (war immer leer, Bug aus
  // dem Abrechnungs-Audit 12.05.2026). Zeigt erwartete Leadkosten waehrend
  // des Monats, nicht erst nach Monatsend-Cron.
  const leadkostenMonatStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const leadkostenMonatEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
  const { data: monatFaelle } = await supabase
    .from('faelle')
    .select('sv_id, lead_preis_netto')
    .not('sv_id', 'is', null)
    .not('lead_preis_netto', 'is', null)
    .gte('created_at', leadkostenMonatStart)
    .lt('created_at', leadkostenMonatEnd)

  const monatKostenMap: Record<string, number> = {}
  for (const f of monatFaelle ?? []) {
    if (!f.sv_id) continue
    monatKostenMap[f.sv_id] = (monatKostenMap[f.sv_id] ?? 0) + Number(f.lead_preis_netto ?? 0)
  }

  const svRows = (svUebersicht ?? []).map(s => {
    const profile = svProfileMap[s.profile_id]
    return {
      id: s.id,
      name: profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() || '—' : '—',
      paket: s.paket ?? '—',
      guthaben: Number(s.werbebudget_guthaben_netto ?? 0),
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
  const gesamtProvision = (alleAbgeschlossen ?? []).reduce((s, f) => s + claimRegBetrag(f) * 0.1, 0)
  const claimondoGewinn = gesamtProvision * FINANCE.SPLIT_CLAIMONDO
  const kanzleiGewinn = gesamtProvision * FINANCE.SPLIT_KANZLEI

  // ── Gutachter-Anzahlungen Summe ──
  const { data: allEinzahlungen } = await supabase
    .from('gutachter_einzahlungen')
    .select('betrag')
  const gutachterAnzahlungenGesamt = (allEinzahlungen ?? []).reduce((s, e) => s + Number(e.betrag), 0)

  // ── Kanzlei-Provision: 150€ pro unterschriebene Vollmacht (mandatstyp=kanzlei-claimondo) ──
  // AAR-583 (N6): leads.vollmacht_unterschrieben gedroppt — Filter auf vollmacht_signiert_am IS NOT NULL.
  const [{ data: kanzleiVollmachtenGesamt }, { data: kanzleiVollmachtenMonat }] = await Promise.all([
    supabase
      .from('leads')
      .select('id, vorname, nachname, vollmacht_datum, created_at')
      .not('vollmacht_signiert_am', 'is', null)
      .eq('mandatstyp', 'kanzlei-claimondo')
      .order('vollmacht_datum', { ascending: false }),
    supabase
      .from('leads')
      .select('id')
      .not('vollmacht_signiert_am', 'is', null)
      .eq('mandatstyp', 'kanzlei-claimondo')
      .gte('vollmacht_datum', monatStart)
      .lte('vollmacht_datum', monatEnde),
  ])

  const kanzleiVollmachtenTotal = (kanzleiVollmachtenGesamt ?? []).length
  const kanzleiVollmachtenDiesenMonat = (kanzleiVollmachtenMonat ?? []).length
  const kanzleiProvisionGesamt = kanzleiVollmachtenTotal * FINANCE.KANZLEI_PROVISION_NETTO
  const kanzleiProvisionMonat = kanzleiVollmachtenDiesenMonat * FINANCE.KANZLEI_PROVISION_NETTO

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
      <div className="px-4 py-3 bg-white border-b border-claimondo-border flex-shrink-0">
        <PageHeader
          title="Finanzen"
          description="Umsatz, Provision & Kennzahlen"
          actions={
            <div className="flex items-center gap-2 text-[10px] font-medium">
              <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">MRR {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(mrr)}</span>
              <span className="bg-claimondo-ondo/5 text-claimondo-ondo px-2 py-0.5 rounded-full">{(aktiveSvs ?? []).length} SVs</span>
              {kanzleiVollmachtenDiesenMonat > 0 && (
                <span className="bg-claimondo-ondo/[0.06] text-claimondo-navy px-2 py-0.5 rounded-full">{kanzleiVollmachtenDiesenMonat} Vollmachten</span>
              )}
            </div>
          }
        />
      </div>
      {/* Scrollbarer Content */}
      <div className="flex-1 overflow-y-auto">
      {/* KFZ-155: Ausstehende Zahlungen — volle Tabelle ganz oben im Finance-Tab */}
      <div className="px-4 pt-6 pb-2">
        <div>
          <Suspense fallback={<LoadingSkeleton variant="block" />}>
            <AusstehendeZahlungenTable />
          </Suspense>
        </div>
      </div>
      {/* KFZ-155: Monats-Umsatz laufend + geplant Forecast */}
      <Suspense fallback={<div className="pb-8"><LoadingSkeleton variant="block" /></div>}>
        <MonatsUmsatzForecast />
      </Suspense>
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
          datum: l.vollmacht_datum ? new Date(l.vollmacht_datum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : l.created_at ? new Date(l.created_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '\u2014',
        }))}
      />
      <GutachterAbrechnungen svRows={svRows} gutachterAnzahlungenGesamt={gutachterAnzahlungenGesamt} />
      <AbrechnungenSectionWrapper />
      {/* KFZ-155: Stripe-Connect Health, Lead-Preise Verteilung, Werbebudget */}
      <Suspense fallback={<div className="pb-8"><LoadingSkeleton variant="block" /></div>}>
        <StripeConnectStatusWidget />
      </Suspense>
      <Suspense fallback={<div className="pb-8"><LoadingSkeleton variant="block" /></div>}>
        <LeadPreiseVerteilungWidget />
      </Suspense>
      <Suspense fallback={<div className="pb-8"><LoadingSkeleton variant="block" /></div>}>
        <WerbebudgetAggregatWidget />
      </Suspense>
      <IndividuelleAnfragenSection anfragen={individuelleAnfragen} />
      <InvestitionProFallSection />
      </div>
    </div>
  )
}
