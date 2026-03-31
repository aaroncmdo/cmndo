import { createClient } from '@/lib/supabase/server'
import { WalletIcon, PackageIcon, FileTextIcon, DownloadIcon } from 'lucide-react'

const PAKET_LABELS: Record<string, string> = {
  'starter-10': 'Starter (10 Faelle/Monat)',
  'standard-25': 'Standard (25 Faelle/Monat)',
  'premium-50': 'Premium (50 Faelle/Monat)',
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
  const { data: { user } } = await supabase.auth.getUser()

  // Get the SV record
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, paket, offene_faelle, max_faelle_monat, paket_faelle_genutzt, paket_faelle_gesamt, paket_umkreis_km, guthaben, guthaben_initial, anzahlung_betrag, anzahlung_bezahlt, sv_paket')
    .eq('profile_id', user!.id)
    .single()

  if (!sv) {
    return (
      <div className="h-full flex flex-col overflow-hidden px-4 py-2">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
            <p className="text-gray-500">Kein Sachverstaendigen-Profil gefunden.</p>
          </div>
        </div>
      </div>
    )
  }

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

  const paketLabel = PAKET_LABELS[sv.sv_paket ?? sv.paket ?? ''] ?? sv.paket ?? 'Kein Paket'
  const offeneFaelle = sv.paket_faelle_genutzt ?? sv.offene_faelle ?? 0
  const maxFaelle = sv.paket_faelle_gesamt ?? sv.max_faelle_monat ?? 10
  const guthaben = typeof sv.guthaben === 'number' ? sv.guthaben : 0
  const auslastungProzent = maxFaelle > 0 ? Math.min(Math.round((offeneFaelle / maxFaelle) * 100), 100) : 0

  // Progress bar color based on utilization
  let progressColor = 'bg-blue-500'
  if (auslastungProzent >= 90) {
    progressColor = 'bg-red-500'
  } else if (auslastungProzent >= 70) {
    progressColor = 'bg-amber-500'
  }

  return (
    <div className="h-full flex flex-col overflow-hidden px-4 py-2">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Abrechnung</h1>
          <p className="text-gray-500 text-sm mt-0.5">Uebersicht Ihrer Abrechnungen und Pakete</p>
        </div>

        {/* Top cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {/* Guthaben */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <WalletIcon className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-gray-500 text-sm font-medium">Guthaben</p>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 tabular-nums">{guthaben.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR</p>
            {guthaben <= 0 && <p className="text-gray-400 text-xs mt-1">Kein Guthaben vorhanden</p>}
          </div>

          {/* Paket-Auslastung */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <PackageIcon className="w-5 h-5 text-blue-400" />
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

        {/* Abgerechnete Faelle */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <FileTextIcon className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Abgerechnete Faelle</h2>
            <span className="text-gray-400 text-sm ml-auto">{completedFaelle?.length ?? 0} Faelle</span>
          </div>

          {!completedFaelle?.length ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
              <p className="text-gray-500">Noch keine abgerechneten Faelle vorhanden.</p>
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
                        <th className="text-right px-4 py-3 text-gray-500 font-medium whitespace-nowrap">Schadenhoehe</th>
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
                              <span className="text-blue-400 font-mono text-xs">
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
                          <span className="text-blue-400 font-mono text-xs">
                            {fall.fall_nummer ?? fall.id.slice(0, 8)}
                          </span>
                          <p className="text-gray-900 text-sm font-medium mt-0.5">{name}</p>
                        </div>
                        <span className="text-gray-500 text-xs">{datum}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <span className="text-gray-500 text-xs">Schadenhoehe</span>
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
          <p className="text-gray-400 text-xs mt-3">Coming soon - PDF-Abrechnungen werden in Kuerze verfuegbar sein.</p>
        </div>
      </div>
    </div>
  )
}
