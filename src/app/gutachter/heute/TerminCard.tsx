'use client'

// AAR-381: Termin-Card auf dem vertikalen Tageskalender-Rail.
// Positioniert per absolute-top anhand Startzeit, Höhe proportional zur Dauer.

import Link from 'next/link'
import { NavigationIcon, ExternalLinkIcon } from 'lucide-react'
import { googleMapsLink } from './googleMapsLink'
import type { HeuteTerminFull } from './page'
import { formatUhrzeit } from '@/lib/format'

export interface TerminCardProps {
  termin: HeuteTerminFull
  /** Absolute Top-Position in Pixel auf dem Rail. */
  topPx: number
  /** Höhe der Card in Pixel (basiert auf Termin-Dauer, min 80). */
  heightPx: number
  /** Auf null setzen wenn GPS verweigert → Google Maps wählt Standort selbst. */
  svOrigin: { lat: number | null; lng: number | null } | null
  /** Termin in der Vergangenheit (Endzeit < now) → ausgegraut. */
  vergangen: boolean
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'bestaetigt':
      return {
        label: 'Bestätigt',
        className: 'bg-emerald-50 text-emerald-700',
      }
    case 'abgeschlossen':
      return {
        label: 'Abgeschlossen',
        className: 'bg-gray-100 text-gray-500',
      }
    case 'abgelehnt':
      return { label: 'Abgelehnt', className: 'bg-red-50 text-red-600' }
    case 'no_show':
      return { label: 'No-Show', className: 'bg-amber-50 text-amber-700' }
    case 'reserviert':
      return { label: 'Reserviert', className: 'bg-blue-50 text-blue-600' }
    default:
      return { label: 'Offen', className: 'bg-amber-50 text-amber-700' }
  }
}

export default function TerminCard({
  termin,
  topPx,
  heightPx,
  svOrigin,
  vergangen,
}: TerminCardProps) {
  const adresse =
    termin.besichtigungsort_adresse ||
    [termin.schadens_adresse, termin.schadens_plz, termin.schadens_ort]
      .filter(Boolean)
      .join(', ')
  const badge = statusBadge(termin.status)
  const link = googleMapsLink(termin, svOrigin)
  const briefingKurz = (termin.sv_briefing_text ?? '')
    .split(/\n+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')

  return (
    <div
      className={`absolute left-16 right-2 rounded-xl border px-3 py-2 shadow-sm transition-opacity ${
        vergangen
          ? 'bg-gray-50 border-gray-200 opacity-60'
          : 'bg-white border-gray-200 hover:border-[color:var(--brand-primary,var(--brand-secondary))]'
      }`}
      style={{ top: `${topPx}px`, minHeight: `${heightPx}px` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">
              {formatUhrzeit(termin.start_zeit)}
            </span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
            {termin.schadentyp && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-[color:var(--brand-primary,var(--brand-secondary))]/10 text-[color:var(--brand-primary,var(--brand-secondary))] uppercase">
                {termin.schadentyp}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-900 truncate">
            {termin.kennzeichen && (
              <span className="font-mono mr-2">{termin.kennzeichen}</span>
            )}
            {termin.fahrzeug ?? termin.kunde_name}
          </p>
          {termin.kennzeichen && termin.fahrzeug && (
            <p className="text-xs text-gray-500 truncate">{termin.kunde_name}</p>
          )}
          <p className="text-xs text-gray-500 truncate">{adresse || '—'}</p>
          {briefingKurz && (
            <p className="text-[11px] text-gray-600 mt-1 line-clamp-2">
              {briefingKurz}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-white bg-[color:var(--brand-primary,var(--brand-secondary))] hover:bg-[#3a6290] rounded-lg px-2.5 py-1 font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          <NavigationIcon className="w-3 h-3" /> Route starten
        </a>
        {/* AAR-607 B4: Pre-FlowLink-Termine (nur Lead) haben noch keinen Fall —
            „Fall öffnen" würde 404en. Zeigt stattdessen Status-Hinweis. */}
        {termin.fall_id ? (
          <Link
            href={`/gutachter/fall/${termin.fall_id}`}
            className="inline-flex items-center gap-1 text-xs text-[color:var(--brand-primary,var(--brand-secondary))] hover:text-[var(--brand-primary)] rounded-lg px-2 py-1 font-medium"
          >
            <ExternalLinkIcon className="w-3 h-3" /> Fall öffnen
          </Link>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 font-medium"
            title="Termin ist reserviert, aber der Kunde hat die SA noch nicht unterschrieben. Fallakte wird erst danach angelegt."
          >
            SA ausstehend
          </span>
        )}
      </div>
    </div>
  )
}
