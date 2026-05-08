'use client'

// Rechte Spalte der Tagesroute: Termin-Liste mit den wichtigsten Infos pro
// Stop. Klick auf eine Card highlighted den Pin auf der Karte.
// Aufgeklappt zeigt die Card: Kunde, Fahrzeug, Schadentyp, Pflichtdokumente,
// Briefing, Telefon-Button + Route-starten.

import { useEffect, useMemo, useState } from 'react'
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
  PlusCircleIcon,
  CalendarClockIcon,
  XIcon,
} from 'lucide-react'
import type { PrivatStopRow } from './private-stops-actions'
import { googleMapsLink } from './googleMapsLink'
import type { HeuteTerminFull } from './page'
import { formatUhrzeit } from '@/lib/format'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { resolveKundeAvatarUrl } from '@/lib/avatars/default-kunde-avatar'

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
  /** AAR-872: Privat-Stops aus GCal/CalDAV. */
  privatStops?: PrivatStopRow[]
  onAddPrivatStop?: () => void
  onRemovePrivatStop?: (id: string) => void
}

// 2026-05-06: „Jetzt"-Indikator — zeigt zeitliche Nähe zum Start-Zeit.
// Aktualisiert sich automatisch alle 30 Sek.
function useJetztRelative(startIso: string, endIso: string | null): string {
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const i = setInterval(() => setTick(Date.now()), 30_000)
    return () => clearInterval(i)
  }, [])
  return useMemo(() => {
    const startMs = new Date(startIso).getTime()
    const endMs = endIso ? new Date(endIso).getTime() : startMs + 60 * 60_000
    const diffStartMin = Math.round((startMs - tick) / 60_000)
    if (tick >= startMs && tick < endMs) return 'läuft jetzt'
    if (diffStartMin === 0) return 'jetzt'
    if (diffStartMin > 0 && diffStartMin < 60) return `in ${diffStartMin} Min`
    if (diffStartMin >= 60 && diffStartMin < 24 * 60) {
      const h = Math.floor(diffStartMin / 60)
      const m = diffStartMin % 60
      return m === 0 ? `in ${h}h` : `in ${h}h ${m}min`
    }
    if (diffStartMin < 0) {
      const past = Math.abs(diffStartMin)
      if (past < 60) return `vor ${past} Min`
      const h = Math.floor(past / 60)
      return `vor ${h}h`
    }
    return ''
  }, [startIso, endIso, tick])
}

function JetztPill({ startIso, endIso }: { startIso: string; endIso: string | null }) {
  const label = useJetztRelative(startIso, endIso)
  if (!label) return null
  const isJetzt = label === 'läuft jetzt' || label === 'jetzt'
  const isPast = label.startsWith('vor ')
  const cls = isJetzt
    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 animate-pulse'
    : isPast
    ? 'bg-claimondo-border/40 text-claimondo-ondo/70 border-claimondo-border/60'
    : 'bg-claimondo-ondo/10 text-claimondo-navy border-claimondo-ondo/20'
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  )
}

function badgeForStatus(status: string): { label: string; cls: string } {
  switch (status) {
    case 'bestaetigt':
      return { label: 'Bestätigt', cls: 'bg-emerald-50 text-emerald-700' }
    case 'abgeschlossen':
      return { label: 'Abgeschlossen', cls: 'bg-claimondo-bg text-claimondo-ondo' }
    case 'abgelehnt':
      return { label: 'Abgelehnt', cls: 'bg-red-50 text-red-600' }
    case 'no_show':
      return { label: 'No-Show', cls: 'bg-amber-50 text-amber-700' }
    case 'reserviert':
      return { label: 'Reserviert', cls: 'bg-claimondo-bg text-claimondo-ondo' }
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
  privatStops = [],
  onAddPrivatStop,
  onRemovePrivatStop,
}: TagesrouteSidebarProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const pflichtMap = useMemo(() => {
    const m = new Map<string, TagesroutePflichtStat>()
    for (const p of pflichtStats) m.set(p.fallId, p)
    return m
  }, [pflichtStats])

  const aktiv = termine.filter((t) => t.status !== 'abgeschlossen' && t.status !== 'abgelehnt')
  const erledigt = termine.length - aktiv.length

  // Tages-Stats — auf einen Blick: Termine + Pflicht-Dokumente offen
  const offeneDokuTotal = useMemo(
    () => pflichtStats.reduce((acc, p) => acc + p.offen, 0),
    [pflichtStats],
  )

  return (
    <aside className="flex flex-col flex-1 min-h-0">
      {/* Stats-Header */}
      <div className="px-4 py-3 border-b border-claimondo-border shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] text-claimondo-ondo uppercase tracking-wider">Termine heute</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-semibold text-claimondo-navy">{aktiv.length}</span>
              {erledigt > 0 && (
                <span className="text-[11px] text-claimondo-ondo">({erledigt} erledigt)</span>
              )}
            </div>
          </div>
          {/* AAR-872: Stop hinzufügen — Privat-Termin aus GCal/CalDAV */}
          {onAddPrivatStop && (
            <button
              type="button"
              onClick={onAddPrivatStop}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-claimondo-navy bg-white hover:bg-claimondo-bg border border-claimondo-border rounded-lg px-2 py-1.5"
              title="Privat-Termin als Tagesroute-Stop hinzufügen"
            >
              {/* 2026-05-08 Aaron-UI-Audit: Label „Stop" kollidierte
                  visuell mit der „Stop 1/1"-Counter-Notation oben.
                  „Privat" als kurzer Action-Begriff — der Tooltip
                  erklärt was es macht. */}
              <PlusCircleIcon className="w-3.5 h-3.5" />
              Privat
            </button>
          )}
        </div>
        {/* Quick-Stats — Pflicht-Dokumente offen, Anzahl Stops mit Adresse */}
        {offeneDokuTotal > 0 && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-full">
            <AlertTriangleIcon className="w-3 h-3" />
            <span>{offeneDokuTotal} {offeneDokuTotal === 1 ? 'Pflichtdokument' : 'Pflichtdokumente'} offen</span>
          </div>
        )}
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
          const avatarUrl = resolveKundeAvatarUrl(t.kunde_avatar_url, t.kunde_anrede)

          // 2026-05-06: Verlegte Termine werden visuell durchgestrichen +
          // gedimmt. Route ignoriert sie zusätzlich (HeuteClient filtert
          // sie aus den Map-Stops raus).
          const istVerlegt = t.status === 'verlegt' || t.status === 'verlegung_pending'
          const verlegtTextClass = istVerlegt ? 'line-through opacity-60' : ''
          return (
            <li
              key={t.id}
              className={`transition-colors ${
                isActive
                  ? 'bg-claimondo-ondo/20'
                  : istVerlegt
                  ? 'bg-slate-400/20 hover:bg-slate-400/30'
                  : 'hover:bg-white/30'
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
                {/* 2026-05-06: Avatar mit eingebackener Stop-Nummer.
                    2026-05-07: Hat der Kunde kein Profilbild, zeigen wir das
                    Anrede-spezifische Default (Herr/Frau, Aaron-Standard).
                    Bleibt Anrede null oder „divers" → Initialen-Fallback. */}
                <div className="relative shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={t.kunde_name}
                      className={`w-11 h-11 rounded-full object-cover border-2 ${
                        isActive ? 'border-claimondo-ondo' : 'border-claimondo-border'
                      }`}
                    />
                  ) : (
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold border-2 bg-claimondo-ondo/10 text-claimondo-navy ${
                        isActive ? 'border-claimondo-ondo' : 'border-claimondo-border'
                      }`}
                    >
                      {(t.kunde_name || '?')
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((n) => n[0]?.toUpperCase())
                        .join('') || '?'}
                    </div>
                  )}
                  <span
                    className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-white ${
                      isActive
                        ? 'bg-claimondo-ondo text-white'
                        : 'bg-claimondo-navy text-white'
                    }`}
                  >
                    {idx + 1}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  {/* Zeile 1: Zeit + Status + Pflicht-Indikator */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold text-claimondo-navy flex items-center gap-1 ${verlegtTextClass}`}>
                      <ClockIcon className="w-3 h-3 text-claimondo-ondo" />
                      {formatUhrzeit(t.start_zeit)}
                      {t.end_zeit && (
                        <span className="text-claimondo-ondo">– {formatUhrzeit(t.end_zeit)}</span>
                      )}
                    </span>
                    {!istVerlegt && <JetztPill startIso={t.start_zeit} endIso={t.end_zeit} />}
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

                  {/* Zeile 2: Kundenname (mit Anrede) — prominent, das wichtigste */}
                  <p className={`text-sm font-semibold text-claimondo-navy mt-1 truncate ${verlegtTextClass}`}>
                    {t.kunde_anrede === 'herr' && 'Herr '}
                    {t.kunde_anrede === 'frau' && 'Frau '}
                    {t.kunde_name}
                  </p>

                  {/* Zeile 3: Kennzeichen + Fahrzeug */}
                  {(t.kennzeichen || t.fahrzeug) && (
                    <p className={`text-xs text-claimondo-ondo mt-0.5 truncate ${verlegtTextClass}`}>
                      {t.kennzeichen && <span className="font-mono mr-2">{t.kennzeichen}</span>}
                      {t.fahrzeug}
                    </p>
                  )}

                  {/* Zeile 3: Adresse + Wetter */}
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className={`text-xs text-claimondo-ondo flex items-start gap-1 min-w-0 flex-1 ${verlegtTextClass}`}>
                      <MapPinIcon className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="truncate">{adresse || '—'}</span>
                    </p>
                    {t.stop_weather && !istVerlegt && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[11px] text-claimondo-ondo shrink-0"
                        title={t.stop_weather.description}
                      >
                        <span>{t.stop_weather.emoji}</span>
                        <span className="font-medium tabular-nums">{t.stop_weather.temp}°</span>
                      </span>
                    )}
                  </div>
                </div>

                <span className="text-claimondo-ondo/60 mt-0.5">
                  {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                </span>
              </button>

              {/* Aufgeklappt: Pflichtinfos + Aktionen */}
              {isExpanded && (
                <div className="px-4 pb-3 pt-1 space-y-2 border-t border-claimondo-border/60">
                  {/* Schadentyp + Auftrag-Typ */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    {t.schadentyp && (
                      <span>
                        <span className="text-claimondo-ondo uppercase tracking-wider mr-1.5">Schadentyp:</span>
                        <span className="font-medium text-claimondo-navy">{t.schadentyp}</span>
                      </span>
                    )}
                    {t.auftrag_typ && t.auftrag_typ !== 'erstgutachten' && (
                      <span>
                        <span className="text-claimondo-ondo uppercase tracking-wider mr-1.5">Auftrag:</span>
                        <span className="font-medium text-claimondo-navy uppercase">
                          {t.auftrag_typ === 'nachbesichtigung' ? 'Nachbesichtigung' : t.auftrag_typ === 'stellungnahme' ? 'Stellungnahme' : t.auftrag_typ}
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Vorschäden (Cardentity) */}
                  {t.hat_vorschaeden && (t.vorschaden_anzahl ?? 0) > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] flex items-start gap-1.5">
                      <AlertTriangleIcon className="w-3 h-3 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-amber-900">
                          {t.vorschaden_anzahl} Vorschaden{t.vorschaden_anzahl === 1 ? '' : '-Einträge'} (Cardentity)
                        </p>
                        {t.vorschaden_letzter_datum && (
                          <p className="text-amber-800/80">
                            Letzter: {new Date(t.vorschaden_letzter_datum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Einzusammelnde Pflichtdokumente */}
                  {t.einzusammelnde_dokumente.length > 0 && (
                    <div className="rounded-md border border-claimondo-border bg-white px-2 py-1.5 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-claimondo-navy">
                        <FileTextIcon className="w-3 h-3" />
                        Einzusammeln vor Ort ({t.einzusammelnde_dokumente.length})
                      </div>
                      <ul className="space-y-0.5 text-[11px] text-claimondo-navy">
                        {t.einzusammelnde_dokumente.map((d) => (
                          <li key={d.slot_id} className="flex items-start gap-1.5">
                            <span className="text-claimondo-ondo mt-0.5">•</span>
                            <span>{d.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Counter-Pflichtdokumente (zusätzlich zur Liste —
                      schneller Überblick wenn viele Slots vorhanden sind) */}
                  {pflicht && pflicht.gesamt > 0 && t.einzusammelnde_dokumente.length === 0 && (
                    <div className="text-[11px] flex items-center gap-2">
                      <CheckCircle2Icon className="w-3 h-3 text-emerald-700" />
                      <span className="text-emerald-700 font-medium">
                        Alle {pflicht.gesamt} Pflichtdokumente erfüllt
                      </span>
                    </div>
                  )}

                  {/* Briefing */}
                  {briefingKurz && (
                    <div className="bg-white border border-claimondo-border rounded-lg p-2">
                      <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo mb-0.5">
                        Briefing
                      </p>
                      <p className="text-[11px] text-claimondo-navy leading-relaxed">
                        {briefingKurz}
                      </p>
                    </div>
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
                        className="inline-flex items-center gap-1 text-xs text-claimondo-navy bg-white hover:bg-claimondo-bg border border-claimondo-border rounded-lg px-2.5 py-1.5 font-medium"
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

      {/* AAR-872: Privat-Stops Sektion — visuell vom SV-Termin-Block getrennt */}
      {privatStops.length > 0 && (
        <div className="border-t border-claimondo-border bg-claimondo-ondo/5">
          <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-claimondo-ondo">
            Privat-Stops ({privatStops.length})
          </p>
          <ul className="divide-y divide-claimondo-border/60">
            {privatStops
              .slice()
              .sort((a, b) => new Date(a.start_zeit).getTime() - new Date(b.start_zeit).getTime())
              .map((p) => (
                <li key={p.id} className="px-4 py-2.5 flex items-start gap-3">
                  <CalendarClockIcon className="w-4 h-4 text-claimondo-ondo shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-claimondo-navy truncate">
                      {p.titel ?? 'Privat-Termin'}
                    </p>
                    <p className="text-[11px] text-claimondo-ondo">
                      {formatUhrzeit(p.start_zeit)}
                      {p.end_zeit ? `–${formatUhrzeit(p.end_zeit)}` : ''}
                      <span className="mx-1">·</span>
                      <span className="uppercase tracking-wider text-[9px]">{p.source}</span>
                    </p>
                    <p className="text-[11px] text-claimondo-ondo flex items-start gap-1 mt-0.5">
                      <MapPinIcon className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="truncate">{p.address}</span>
                    </p>
                  </div>
                  {onRemovePrivatStop && (
                    <button
                      type="button"
                      onClick={() => onRemovePrivatStop(p.id)}
                      className="text-claimondo-ondo/60 hover:text-red-600 p-1"
                      title="Privat-Stop entfernen"
                      aria-label="Privat-Stop entfernen"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
