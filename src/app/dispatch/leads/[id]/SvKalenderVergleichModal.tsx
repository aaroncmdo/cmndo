'use client'

// SV-Kalender-Vergleichsmodal — pro SV ein Tab mit Tagesliste seiner Termine,
// Mapbox-ETAs vom Lead-Besichtigungsort, damit der Dispatcher am Telefon mit
// dem Kunden eine sinnvolle Slot-Empfehlung machen kann.

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/primitives/Modal'
import { CalendarIcon, MapPinIcon, ClockIcon, NavigationIcon, XIcon, RefreshCwIcon } from 'lucide-react'
import { getSvKalenderVergleich, type SvKalenderResult, type SvKalenderTermin } from './_actions/sv-kalender'

type Props = {
  open: boolean
  onClose: () => void
  leadId: string
  svIds: string[]
  /** Optional: Wunschtermin als visueller Marker im Kalender. */
  wunschterminIso?: string | null
}

const STATUS_COLOR: Record<string, string> = {
  reserviert: 'bg-amber-100 text-amber-800 border-amber-200',
  bestaetigt: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  offen: 'bg-[#f8f9fb] text-claimondo-navy border-claimondo-border',
  gegenvorschlag: 'bg-amber-50 text-amber-700 border-amber-200',
  erledigt: 'bg-[#f8f9fb] text-claimondo-ondo/70 border-claimondo-border',
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  })
}
function dayKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function SvKalenderVergleichModal({
  open,
  onClose,
  leadId,
  svIds,
  wunschterminIso,
}: Props) {
  const [data, setData] = useState<SvKalenderResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeSvId, setActiveSvId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!open || svIds.length === 0) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getSvKalenderVergleich(leadId, svIds, 14)
      .then((r) => {
        if (cancelled) return
        if (r.ok) {
          setData(r)
          setActiveSvId((cur) => cur && svIds.includes(cur) ? cur : (svIds[0] ?? null))
        } else {
          setError(r.error ?? 'Kalender konnte nicht geladen werden')
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Fehler')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, leadId, svIds, reloadKey])

  const activeTab = useMemo(
    () => data?.tabs.find((t) => t.svId === activeSvId) ?? data?.tabs[0] ?? null,
    [data, activeSvId],
  )

  // Tage-Bucket fürs aktive SV: 14 Tage ab heute, leere Tage explizit zeigen
  const tageMitTerminen = useMemo(() => {
    if (!data || !activeTab) return [] as Array<{ key: string; tagIso: string; termine: SvKalenderTermin[] }>
    const buckets = new Map<string, SvKalenderTermin[]>()
    for (const t of activeTab.termine) {
      const k = dayKey(t.startIso)
      if (!buckets.has(k)) buckets.set(k, [])
      buckets.get(k)!.push(t)
    }
    const start = new Date(data.fromIso)
    const out: Array<{ key: string; tagIso: string; termine: SvKalenderTermin[] }> = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(start.getTime() + i * 24 * 3600_000)
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      out.push({ key: k, tagIso: d.toISOString(), termine: buckets.get(k) ?? [] })
    }
    return out
  }, [data, activeTab])

  const wunschKey = wunschterminIso ? dayKey(wunschterminIso) : null

  return (
    <Modal open={open} onClose={onClose} maxWidth={920} hideCloseButton noPadding ariaLabel="SV-Kalender vergleichen">
      <div className="flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-claimondo-border">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarIcon className="w-4 h-4 text-claimondo-ondo shrink-0" />
            <h3 className="text-sm font-semibold text-claimondo-navy">SV-Kalender vergleichen</h3>
            {data?.leadAdresse && (
              <span className="hidden sm:flex items-center gap-1 text-[11px] text-claimondo-ondo truncate">
                <MapPinIcon className="w-3 h-3 shrink-0" />
                Bezugspunkt: {data.leadAdresse}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={loading}
              className="text-[11px] text-claimondo-ondo hover:text-claimondo-navy flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCwIcon className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Neu laden
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-claimondo-ondo/70 hover:text-claimondo-ondo"
              aria-label="Schließen"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        {data && data.tabs.length > 0 && (
          <div className="flex items-center gap-1 px-3 pt-2 border-b border-claimondo-border overflow-x-auto">
            {data.tabs.map((tab) => {
              const isActive = activeTab?.svId === tab.svId
              return (
                <button
                  key={tab.svId}
                  type="button"
                  onClick={() => setActiveSvId(tab.svId)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-claimondo-ondo text-claimondo-navy bg-white'
                      : 'border-transparent text-claimondo-ondo hover:text-claimondo-navy hover:bg-[#f8f9fb]'
                  }`}
                >
                  <span>{tab.name}</span>
                  <span className="text-[10px] bg-[#f8f9fb] text-claimondo-ondo px-1.5 py-0.5 rounded-full border border-claimondo-border">
                    {tab.termine.length} Termine
                  </span>
                  {tab.etaLeadZuBueroMin != null && (
                    <span className="text-[10px] text-claimondo-ondo/70 flex items-center gap-0.5">
                      <NavigationIcon className="w-2.5 h-2.5" />
                      {tab.etaLeadZuBueroMin} min
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <p className="text-xs text-claimondo-ondo flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-claimondo-ondo animate-pulse" />
              Lade Kalender + Routen …
            </p>
          )}
          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
          )}
          {!loading && !error && data && !data.leadLat && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
              Lead hat keinen Besichtigungsort mit Koordinaten — ETAs können nicht berechnet werden.
            </p>
          )}

          {!loading && !error && activeTab && (
            <div className="space-y-3">
              {/* SV-Header: Büro-Distanz */}
              {activeTab.etaLeadZuBueroMin != null && (
                <div className="flex items-center gap-2 text-xs text-claimondo-ondo bg-[#f8f9fb] rounded-lg px-3 py-2 border border-claimondo-border">
                  <NavigationIcon className="w-3.5 h-3.5" />
                  <span>
                    Vom Besichtigungsort zum SV-Büro: <span className="font-medium text-claimondo-navy">{activeTab.etaLeadZuBueroMin} min</span>
                  </span>
                </div>
              )}

              {/* Tagesliste */}
              <ul className="space-y-2">
                {tageMitTerminen.map((tag) => {
                  const istWunschTag = wunschKey === tag.key
                  return (
                    <li
                      key={tag.key}
                      className={`rounded-xl border ${
                        istWunschTag
                          ? 'border-claimondo-ondo bg-claimondo-ondo/5'
                          : 'border-claimondo-border bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-claimondo-border">
                        <span className="text-xs font-semibold text-claimondo-navy">
                          {fmtDay(tag.tagIso)}
                          {istWunschTag && (
                            <span className="ml-2 text-[10px] font-medium bg-claimondo-ondo text-white px-1.5 py-0.5 rounded-full">
                              Wunschtag
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-claimondo-ondo">
                          {tag.termine.length === 0
                            ? 'frei'
                            : `${tag.termine.length} Termin${tag.termine.length === 1 ? '' : 'e'}`}
                        </span>
                      </div>
                      {tag.termine.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-claimondo-ondo/60 italic">
                          Keine Termine — ganzer Tag verfügbar
                        </div>
                      ) : (
                        <ul className="divide-y divide-claimondo-border">
                          {tag.termine.map((t) => {
                            const statusCls = STATUS_COLOR[t.status] ?? STATUS_COLOR.offen
                            return (
                              <li key={t.id} className="px-3 py-2 flex items-start gap-3">
                                <span className="flex items-center gap-1 text-xs font-medium text-claimondo-navy w-28 shrink-0">
                                  <ClockIcon className="w-3 h-3 text-claimondo-ondo" />
                                  {fmtTime(t.startIso)} – {fmtTime(t.endIso)}
                                </span>
                                <div className="flex-1 min-w-0">
                                  {t.ortAdresse ? (
                                    <p className="text-[11px] text-claimondo-navy flex items-center gap-1">
                                      <MapPinIcon className="w-3 h-3 text-claimondo-ondo/70 shrink-0" />
                                      <span className="truncate">{t.ortAdresse}</span>
                                    </p>
                                  ) : (
                                    <p className="text-[11px] text-claimondo-ondo/50 italic">Ort unbekannt</p>
                                  )}
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${statusCls}`}>
                                      {t.status}
                                    </span>
                                    {t.typ && (
                                      <span className="text-[9px] text-claimondo-ondo/70">
                                        {t.typ}
                                      </span>
                                    )}
                                    {t.etaVomLeadMin != null && (
                                      <span className="text-[10px] text-claimondo-ondo flex items-center gap-0.5">
                                        <NavigationIcon className="w-2.5 h-2.5" />
                                        {t.etaVomLeadMin} min ab Besichtigungsort
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
