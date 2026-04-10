import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { WalletIcon, PackageIcon, FileTextIcon, DownloadIcon, InfoIcon } from 'lucide-react'

const PAKET_LABELS: Record<string, string> = {
  standard: 'Standard (10 Fälle/Monat)', 'starter-10': 'Standard (10 Fälle/Monat)',
  pro: 'Pro (25 Fälle/Monat)', 'standard-25': 'Pro (25 Fälle/Monat)',
  premium: 'Premium (50 Fälle/Monat)', 'premium-50': 'Premium (50 Fälle/Monat)',
}

const COMPLETED_STATUSES = [
  'gutachten-eingegangen',
  'filmcheck',
  'kanzlei-uebergeben',
  'regulierung',
  'abgeschlossen',
]

export default async function AbrechnungPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null

  // Get the SV record
  const sv = await getGutachterForUser<{
    id: string
    paket: string | null
    offene_faelle: number | null
    max_faelle_monat: number | null
    paket_faelle_genutzt: number | null
    paket_faelle_gesamt: number | null
    paket_umkreis_km: number | null
    anzahlung_betrag: number | null
    anzahlung_bezahlt_am: string | null
  }>(supabase, user!.id, 'id, paket, offene_faelle, max_faelle_monat, paket_faelle_genutzt, paket_faelle_gesamt, paket_umkreis_km, anzahlung_betrag, anzahlung_bezahlt_am')

  if (!sv) {
    return (
      <div className="h-full flex flex-col">
        <div className="w-full">
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
            <p className="text-gray-500">Kein Sachverständigen-Profil gefunden.</p>
          </div>
        </div>
      </div>
    )
  }

  // ARCH-1 POLISH Befund 2: SV sieht NICHT mehr seinen Live-Werbebudget-Stand,
  // sondern lediglich die einmalig geleistete Anzahlung als Info.
  const anzahlungBetrag = typeof sv.anzahlung_betrag === 'number'
    ? sv.anzahlung_betrag
    : Number(sv.anzahlung_betrag ?? 0)
  const anzahlungBezahlt = !!sv.anzahlung_bezahlt_am

  // Fetch abrechnungen from the real billing table
  const { data: abrechnungen } = await supabase
    .from('gutachter_abrechnungen')
    .select('id, fall_id, schadenhoehe, leadpreis, preistyp, abgerechnet_am')
    .eq('sv_id', sv.id)
    .order('abgerechnet_am', { ascending: false })

  // Build a lookup: fall_id → abrechnung
  const abrMap: Record<string, { leadpreis: number; preistyp: string }> = {}
  for (const a of abrechnungen ?? []) {
    if (a.fall_id) abrMap[a.fall_id] = { leadpreis: Number(a.leadpreis), preistyp: a.preistyp ?? '' }
  }

  // Fetch completed cases with gutachten_betrag
  const { data: completedFaelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, gutachten_betrag, gutachten_eingegangen_am, created_at, lead_id')
    .eq('sv_id', sv.id)
    .in('status', COMPLETED_STATUSES)
    .order('gutachten_eingegangen_am', { ascending: false })

  // Fetch einzahlungen
  const { data: einzahlungen } = await supabase
    .from('gutachter_einzahlungen')
    .select('id, betrag, typ, beschreibung, eingezahlt_am')
    .eq('sv_id', sv.id)
    .order('eingezahlt_am', { ascending: false })

  // Fetch lead names
  const leadIds = [...new Set((completedFaelle ?? []).map((f) => f.lead_id).filter(Boolean))] as string[]
  const { data: leads } = leadIds.length > 0
    ? await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] }

  const leadMap: Record<string, { vorname: string | null; nachname: string | null }> = {}
  for (const l of leads ?? []) {
    leadMap[l.id] = l
  }

  const paketLabel = PAKET_LABELS[sv.paket ?? ''] ?? sv.paket ?? 'Kein Paket'
  const offeneFaelle = sv.paket_faelle_genutzt ?? sv.offene_faelle ?? 0
  const maxFaelle = sv.paket_faelle_gesamt ?? sv.max_faelle_monat ?? 10
  const auslastungProzent = maxFaelle > 0 ? Math.min(Math.round((offeneFaelle / maxFaelle) * 100), 100) : 0

  // Progress bar color based on utilization
  let progressColor = 'bg-[#4573A2]'
  if (auslastungProzent >= 90) {
    progressColor = 'bg-red-500'
  } else if (auslastungProzent >= 70) {
    progressColor = 'bg-amber-500'
  }

  // Einnahmen-Dashboard Daten (KFZ-88)
  const totalLeadpreise = (abrechnungen ?? []).reduce((s, a) => s + Number(a.leadpreis ?? 0), 0)
  const faelleAbgerechnet = (completedFaelle ?? []).filter(f => f.gutachten_betrag).length
  const totalEingegangen = (completedFaelle ?? []).filter(f => ['abgeschlossen', 'regulierung'].includes(f.status)).reduce((s, f) => s + Number(f.gutachten_betrag ?? 0) * 0.12, 0) // ~12% Gutachterhonorar
  const totalOffen = (completedFaelle ?? []).filter(f => !['abgeschlossen', 'storniert'].includes(f.status) && f.gutachten_betrag).reduce((s, f) => s + Number(f.gutachten_betrag ?? 0) * 0.12, 0)
  const faelleOffen = (completedFaelle ?? []).filter(f => !['abgeschlossen', 'storniert'].includes(f.status) && f.gutachten_betrag).length

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Abrechnung</h1>
          <p className="text-gray-500 text-xs">Übersicht Ihrer Abrechnungen und Pakete</p>
        </div>
        <Link
          href="/gutachter/leadpreise"
          className="text-xs font-medium text-[#4573A2] hover:text-[#1E3A5F] underline underline-offset-2 whitespace-nowrap"
        >
          Aktuelle Lead-Preis-Tabelle einsehen
        </Link>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {/* Einnahmen-Dashboard (KFZ-88) */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white border border-green-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totalEingegangen)}</p>
            <p className="text-[10px] text-gray-500 mt-1">Eingegangen</p>
            <p className="text-[9px] text-gray-400">{faelleAbgerechnet} Fälle</p>
          </div>
          <div className="bg-white border border-amber-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totalOffen)}</p>
            <p className="text-[10px] text-gray-500 mt-1">Offen</p>
            <p className="text-[9px] text-gray-400">{faelleOffen} Fälle in Regulierung</p>
          </div>
          <div className="bg-white border border-[#4573A2]/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-[#4573A2]">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totalEingegangen - totalLeadpreise)}</p>
            <p className="text-[10px] text-gray-500 mt-1">Netto-Verdienst</p>
            <p className="text-[9px] text-gray-400">Ø {faelleAbgerechnet > 0 ? Math.round(totalEingegangen / faelleAbgerechnet) : 0}€/Fall</p>
          </div>
        </div>

        {/* Top cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {/* Anzahlung (Initial-Wert, KEIN Live-Stand) — ARCH-1 POLISH Befund 2 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <WalletIcon className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-gray-500 text-sm font-medium">Anzahlung</p>
                <p className="text-gray-400 text-[11px]">Einmalig geleistet</p>
              </div>
            </div>
            {anzahlungBezahlt && anzahlungBetrag > 0 ? (
              <>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">
                  {anzahlungBetrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                </p>
                <p className="text-gray-500 text-xs mt-1">Du hast einmalig diesen Betrag als Anzahlung geleistet.</p>
              </>
            ) : (
              <>
                <p className="text-3xl font-bold text-gray-400 tabular-nums">— EUR</p>
                <p className="text-gray-400 text-xs mt-1">Noch keine Anzahlung eingegangen.</p>
              </>
            )}
            <p className="text-gray-400 text-[10px] mt-3 flex items-start gap-1">
              <InfoIcon className="w-3 h-3 mt-0.5 shrink-0" />
              <span>Die Verrechnung deiner Lead-Preise findest du in der Monatsabrechnung.</span>
            </p>
          </div>

          {/* Paket-Auslastung */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#4573A2]/5 flex items-center justify-center">
                <PackageIcon className="w-5 h-5 text-[#7BA3CC]" />
              </div>
              <div>
                <p className="text-gray-500 text-sm font-medium">Paket-Auslastung</p>
                <p className="text-gray-400 text-xs">{paketLabel}</p>
              </div>
            </div>
            <div className="flex items-end justify-between mb-2">
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {offeneFaelle} / {maxFaelle}
              </p>
              <p className="text-gray-500 text-sm tabular-nums">{auslastungProzent}%</p>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${progressColor}`}
                style={{ width: `${auslastungProzent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Abgerechnete Fälle */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <FileTextIcon className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Abgerechnete Fälle</h2>
            <span className="text-gray-400 text-sm ml-auto">{completedFaelle?.length ?? 0} Fälle</span>
          </div>

          {!completedFaelle?.length ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
              <p className="text-gray-500">Noch keine abgerechneten Fälle vorhanden.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block bg-white rounded-2xl overflow-hidden border border-gray-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-4 py-3 text-gray-500 font-medium whitespace-nowrap">Fall-Nr.</th>
                        <th className="text-left px-4 py-3 text-gray-500 font-medium">Kunde</th>
                        <th className="text-right px-4 py-3 text-gray-500 font-medium whitespace-nowrap">Schadenhöhe</th>
                        <th className="text-right px-4 py-3 text-gray-500 font-medium whitespace-nowrap">Leadpreis</th>
                        <th className="text-left px-4 py-3 text-gray-500 font-medium">Datum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedFaelle.map((fall) => {
                        const lead = fall.lead_id ? leadMap[fall.lead_id] : null
                        const name = lead
                          ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
                          : '—'
                        const betrag = fall.gutachten_betrag != null
                          ? Number(fall.gutachten_betrag).toLocaleString('de-DE', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }) + ' EUR'
                          : '—'
                        const abr = abrMap[fall.id]
                        const leadpreisStr = abr
                          ? abr.leadpreis.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'
                          : '—'
                        const datum = fall.gutachten_eingegangen_am
                          ? new Date(fall.gutachten_eingegangen_am).toLocaleDateString('de-DE', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                          : fall.created_at
                            ? new Date(fall.created_at).toLocaleDateString('de-DE', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })
                            : '—'

                        return (
                          <tr
                            key={fall.id}
                            className="border-b border-gray-200/50 hover:bg-gray-100/40 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <span className="text-[#7BA3CC] font-mono text-xs">
                                {fall.fall_nummer ?? fall.id.slice(0, 8)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-800">{name}</td>
                            <td className="px-4 py-3 text-gray-800 text-right tabular-nums">{betrag}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {abr ? (
                                <span className={abr.preistyp === 'einzel' ? 'text-amber-400' : 'text-gray-800'}>
                                  {leadpreisStr}
                                  {abr.preistyp === 'einzel' && <span className="text-amber-500 text-[10px] ml-1">Einzel</span>}
                                </span>
                              ) : (
                                <span className="text-gray-500 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{datum}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-3">
                {completedFaelle.map((fall) => {
                  const lead = fall.lead_id ? leadMap[fall.lead_id] : null
                  const name = lead
                    ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
                    : '—'
                  const betrag = fall.gutachten_betrag != null
                    ? Number(fall.gutachten_betrag).toLocaleString('de-DE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }) + ' EUR'
                    : '—'
                  const abr = abrMap[fall.id]
                  const leadpreisStr = abr
                    ? abr.leadpreis.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'
                    : '—'
                  const datum = fall.gutachten_eingegangen_am
                    ? new Date(fall.gutachten_eingegangen_am).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : fall.created_at
                      ? new Date(fall.created_at).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '—'

                  return (
                    <div
                      key={fall.id}
                      className="bg-white rounded-2xl p-4 border border-gray-200"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="text-[#7BA3CC] font-mono text-xs">
                            {fall.fall_nummer ?? fall.id.slice(0, 8)}
                          </span>
                          <p className="text-gray-900 text-sm font-medium mt-0.5">{name}</p>
                        </div>
                        <span className="text-gray-500 text-xs">{datum}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <span className="text-gray-500 text-xs">Schadenhöhe</span>
                          <p className="text-gray-800 tabular-nums">{betrag}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-gray-500 text-xs">Leadpreis</span>
                          <p className={abr ? (abr.preistyp === 'einzel' ? 'text-amber-400' : 'text-gray-800') : 'text-gray-500'}>
                            {leadpreisStr}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Einzahlungen */}
        {(einzahlungen?.length ?? 0) > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Einzahlungen</h2>
            <div className="bg-white rounded-2xl overflow-hidden border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Typ</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Betrag</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Beschreibung</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Datum</th>
                  </tr>
                </thead>
                <tbody>
                  {einzahlungen!.map(e => (
                    <tr key={e.id} className="border-b border-gray-200/50">
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-400">
                          {e.typ === 'anzahlung' ? 'Anzahlung' : e.typ === 'nachzahlung' ? 'Nachzahlung' : 'Paketwechsel'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-emerald-400 text-right tabular-nums font-medium">
                        +{Number(e.betrag).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{e.beschreibung ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(e.eingezahlt_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Monatsabrechnung */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-gray-900 font-semibold">Monatsabrechnung</h2>
              <p className="text-gray-500 text-sm mt-0.5">PDF-Export Ihrer monatlichen Abrechnung</p>
            </div>
            <button
              disabled
              className="flex items-center gap-2 bg-gray-100 text-gray-500 text-sm font-medium py-2.5 px-4 rounded-xl cursor-not-allowed opacity-50"
            >
              <DownloadIcon className="w-4 h-4" />
              PDF Download
            </button>
          </div>
          <p className="text-gray-400 text-xs mt-3">Coming soon — PDF-Abrechnungen werden in Kürze verfügbar sein.</p>
        </div>
      </div>
    </div>
  )
}
