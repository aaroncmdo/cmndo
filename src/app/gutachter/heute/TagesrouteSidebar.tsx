'use client'

// Rechte Spalte der Tagesroute: Termin-Liste mit den wichtigsten Infos pro
// Stop. Klick auf eine Card highlighted den Pin auf der Karte.
// Aufgeklappt zeigt die Card: Kunde, Fahrzeug, Schadentyp, Pflichtdokumente,
// Briefing, Telefon-Button + Route-starten.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ClockIcon,
  MapPinIcon,
  PhoneIcon,
  NavigationIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  AlertTriangleIcon,
  FileTextIcon,
  CheckCircle2Icon,
} from 'lucide-react'
import { googleMapsLink } from './googleMapsLink'
import type { HeuteTerminFull } from './page'
import { formatUhrzeit } from '@/lib/format'
import { StatusBadge } from '@/components/shared/StatusBadge'

export type TagesroutePflichtStat = {
  fallId: string
  offen: number
  gesamt: number
}

export type TagesrouteSidebarProps = {
  termine: HeuteTerminFull[]
  pflichtStats: TagesroutePflichtStat[]
  svOrigin: { lat: number | null; lng: number | null } | null
  activeStopId?: string | null
  onStopClick?: (stopId: string) => void
}

function badgeForStatus(status: string): { label: string; cls: string } {
  switch (status) {
    case 'bestaetigt':
      return { label: 'Bestätigt', cls: 'bg-emerald-50 text-emerald-700' }
    case 'abgeschlossen':
      return { label: 'Abgeschlossen', cls: 'bg-[#f8f9fb] text-claimondo-ondo' }
    case 'abgelehnt':
      return { label: 'Abgelehnt', cls: 'bg-red-50 text-red-600' }
    case 'no_show':
      return { label: 'No-Show', cls: 'bg-amber-50 text-amber-700' }
    case 'reserviert':
      return { label: 'Reserviert', cls: 'bg-[#f8f9fb] text-claimondo-ondo' }
    case 'verlegung_pending':
      return { label: 'Verlegung pending', cls: 'bg-amber-50 text-amber-700' }
    case 'verlegt':
      return { label: 'Verlegt', cls: 'bg-claimondo-border/40 text-claimondo-ondo italic' }
    default:
      return { label: 'Offen', cls: 'bg-amber-50 text-amber-700' }
  }
}

export default function TagesrouteSidebar({
  termine,
  pflichtStats,
  svOrigin,
  activeStopId,
  onStopClick,
}: TagesrouteSidebarProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const pflichtMap = useMemo(() => {
    const m = new Map<string, TagesroutePflichtStat>()
    for (const p of pflichtStats) m.set(p.fallId, p)
    return m
  }, [pflichtStats])

  const aktiv = termine.filter((t) => t.status !== 'abgeschlossen' && t.status !== 'abgelehnt')

  return (
    <aside className="bg-white border border-claimondo-border rounded-xl flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-claimondo-border">
        <p className="text-[10px] text-claimondo-ondo uppercase tracking-wider">Termine heute</p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-2xl font-semibold text-claimondo-navy">{aktiv.length}</span>
          <span className="text-[11px] text-claimondo-ondo">{termine.length - aktiv.length > 0 && `(${termine.length - aktiv.length} erledigt)`}</span>
        </div>
      </div>

      <ol className="flex-1 overflow-y-auto divide-y divide-claimondo-border">
        {termine.map((t, idx) => {
          const isActive = activeStopId === t.id
          const isExpanded = expanded === t.id
          const badge = badgeForStatus(t.status)
          const pflicht = pflichtMap.get(t.fall_id)
          const adresse =
            t.besichtigungsort_adresse ||
            [t.schadens_adresse, t.schadens_plz, t.schadens_ort].filter(Boolean).join(', ')
          const briefingKurz = (t.sv_briefing_text ?? '')
            .split(/\n+/)
            .filter(Boolean)
            .slice(0, 3)
            .join(' ')
          const link = googleMapsLink(t, svOrigin)

          return (
            <li
              key={t.id}
              className={`transition-colors ${
                isActive ? 'bg-claimondo-ondo/5' : 'bg-white hover:bg-[#f8f9fb]'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  onStopClick?.(t.id)
                  setExpanded((cur) => (cur === t.id ? null : t.id))
                }}
                className="w-full text-left px-4 py-3 flex items-start gap-3"
              >
                {/* Stop-Nummer */}
                <span
                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${
                    isActive
                      ? 'bg-claimondo-ondo text-white border-claimondo-ondo'
                      : 'bg-white text-claimondo-navy border-claimondo-border'
                  }`}
                >
                  {idx + 1}
                </span>

                <div className="flex-1 min-w-0">
                  {/* Zeile 1: Zeit + Status + Pflicht-Indikator */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-claimondo-navy flex items-center gap-1">
                      <ClockIcon className="w-3 h-3 text-claimondo-ondo" />
                      {formatUhrzeit(t.start_zeit)}
                      {t.end_zeit && (
                        <span className="text-claimondo-ondo">– {formatUhrzeit(t.end_zeit)}</span>
                      )}
                    </span>
                    <StatusBadge colorCls={badge.cls}>{badge.label}</StatusBadge>
                    {pflicht && pflicht.offen > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full border border-amber-200">
                        <AlertTriangleIcon className="w-2.5 h-2.5" />
                        {pflicht.offen} Doku offen
                      </span>
                    )}
                    {pflicht && pflicht.offen === 0 && pflicht.gesamt > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2Icon className="w-2.5 h-2.5" />
                        Doku komplett
                      </span>
                    )}
                  </div>

                  {/* Zeile 2: Kunde / Fahrzeug */}
                  <p className="text-sm text-claimondo-navy mt-1 truncate">
                    {t.kennzeichen && <span className="font-mono mr-2">{t.kennzeichen}</span>}
                    {t.fahrzeug ?? t.kunde_name}
                  </p>
                  {t.kennzeichen && t.fahrzeug && (
                    <p className="text-xs text-claimondo-ondo truncate">{t.kunde_name}</p>
                  )}

                  {/* Zeile 3: Adresse */}
                  <p className="text-xs text-claimondo-ondo mt-1 flex items-start gap-1">
                    <MapPinIcon className="w-3 h-3 mt-0.5 shrink-0" />
                    <span className="truncate">{adresse || '—'}</span>
                  </p>
                </div>

                <span className="text-claimondo-ondo/60 mt-0.5">
                  {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                </span>
              </button>

              {/* Aufgeklappt: Pflichtinfos + Aktionen */}
              {isExpanded && (
                <div className="px-4 pb-3 pt-1 space-y-2 border-t border-claimondo-border/60 bg-[#f8f9fb]">
                  {/* Schadentyp */}
                  {t.schadentyp && (
                    <div className="text-[11px]">
                      <span className="text-claimondo-ondo uppercase tracking-wider mr-1.5">Schadentyp:</span>
                      <span className="font-medium text-claimondo-navy">{t.schadentyp}</span>
                    </div>
                  )}

                  {/* Pflichtdokumente */}
                  {pflicht && pflicht.gesamt > 0 && (
                    <div className="text-[11px] flex items-center gap-2">
                      <FileTextIcon className="w-3 h-3 text-claimondo-ondo" />
                      <span className="text-claimondo-navy">
                        Pflichtdokumente:{' '}
                        <span className={pflicht.offen > 0 ? 'text-amber-700 font-medium' : 'text-emerald-700 font-medium'}>
                          {pflicht.gesamt - pflicht.offen}/{pflicht.gesamt}
                        </span>
                      </span>
                    </div>
                  )}

                  {/* Briefing */}
                  {briefingKurz && (
                    <p className="text-[11px] text-claimondo-ondo bg-white border border-claimondo-border rounded-lg p-2 leading-relaxed">
                      {briefingKurz}
                    </p>
                  )}

                  {/* Aktionen */}
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-white bg-[color:var(--brand-primary,var(--brand-secondary))] hover:bg-[#3a6290] rounded-lg px-2.5 py-1.5 font-medium"
                    >
                      <NavigationIcon className="w-3 h-3" /> Route starten
                    </a>
                    {t.kunde_telefon && (
                      <a
                        href={`tel:${t.kunde_telefon}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-claimondo-navy bg-white hover:bg-[#f8f9fb] border border-claimondo-border rounded-lg px-2.5 py-1.5 font-medium"
                      >
                        <PhoneIcon className="w-3 h-3" /> Anrufen
                      </a>
                    )}
                    {t.fall_id ? (
                      <Link
                        href={`/gutachter/fall/${t.fall_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-claimondo-ondo hover:text-claimondo-navy rounded-lg px-2 py-1 font-medium"
                      >
                        <ExternalLinkIcon className="w-3 h-3" /> Fall öffnen
                      </Link>
                    ) : (
                      <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                        SA ausstehend
                      </span>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
        {termine.length === 0 && (
          <li className="px-4 py-6 text-center text-xs text-claimondo-ondo italic">
            Heute keine Termine geplant.
          </li>
        )}
      </ol>
    </aside>
  )
}
