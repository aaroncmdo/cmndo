'use client'

// AAR-397: Read-only TerminCard in der rechten Spalte der SV-Fallakte.
// Zeigt Datum/Uhrzeit/Adresse/Status des aktiven Termins. Action-CTAs
// (Gegenvorschlag annehmen/ablehnen) leben bewusst in der JetztZuTunCard
// (AAR-395), damit der Haupt-Action-Flow dort konsolidiert bleibt.
// Unten in der Card ein „Termin ändern"-Button als Zweit-Pfad für Power-User
// — öffnet denselben TerminVorschlagModal in Mode 'bearbeiten'.

import { useState } from 'react'
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  NavigationIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  HourglassIcon,
  XCircleIcon,
  PencilIcon,
} from 'lucide-react'
import TerminVorschlagModal from '@/components/fall/TerminVorschlagModal'
import { formatUhrzeit } from '@/lib/format'

export type TerminCardProps = {
  termin: {
    id: string
    status: string
    start_zeit: string | null
    end_zeit: string | null
    vorgeschlagenes_datum: string | null
    gegenvorschlag_von: string | null
    gegenvorschlag_grund: string | null
  } | null
  fall: {
    id: string
    schadens_adresse: string | null
    schadens_plz: string | null
    schadens_ort: string | null
  }
}

type StatusUi = {
  icon: typeof CalendarIcon
  label: string
  hint?: string
  tone: 'emerald' | 'amber' | 'red' | 'gray'
}

function getStatusUi(
  status: string,
  gegenvorschlagVon: string | null,
  gegenvorschlagGrund: string | null,
): StatusUi {
  if (status === 'bestaetigt') {
    return { icon: CheckCircle2Icon, label: 'Bestätigt', tone: 'emerald' }
  }
  if (
    (status === 'gegenvorschlag' || status === 'reserviert') &&
    gegenvorschlagVon === 'kunde'
  ) {
    return {
      icon: AlertCircleIcon,
      label: 'Gegenvorschlag vom Kunden',
      hint: gegenvorschlagGrund
        ? `Grund: ${gegenvorschlagGrund}`
        : 'Bitte in „Jetzt zu tun" entscheiden.',
      tone: 'amber',
    }
  }
  if (status === 'reserviert' || status === 'gegenvorschlag') {
    return {
      icon: HourglassIcon,
      label: 'Vorschlag gesendet',
      hint: 'Wartet auf Bestätigung des Kunden.',
      tone: 'amber',
    }
  }
  if (status === 'abgelehnt' || status === 'storniert') {
    return {
      icon: XCircleIcon,
      label: status === 'storniert' ? 'Storniert' : 'Abgelehnt',
      hint: 'Neuer Termin nötig.',
      tone: 'red',
    }
  }
  return { icon: CalendarIcon, label: status, tone: 'gray' }
}

const TONE_CLASSES: Record<StatusUi['tone'], string> = {
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  red: 'bg-red-50 text-red-800 border-red-200',
  gray: 'bg-gray-50 text-gray-700 border-gray-200',
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

// AAR-411: delegiert an die zentrale Formatter-Bibliothek.
function fmtTime(iso: string | null): string | null {
  return formatUhrzeit(iso) || null
}

export function TerminCard({ termin, fall }: TerminCardProps) {
  const [modalOpen, setModalOpen] = useState(false)

  if (!termin) return null
  // Besichtigungs-/Durchgeführt-Termine müssen hier nicht mehr auftauchen —
  // der Fall-Fortschritt wird über andere Cards dargestellt.
  if (
    termin.status === 'durchgefuehrt' ||
    termin.status === 'abgeschlossen'
  ) {
    return null
  }

  // Primär die bestätigte/vorgeschlagene Start-Zeit anzeigen, Fallback auf
  // vorgeschlagenes_datum (z. B. bei Gegenvorschlag vom Kunden).
  const anzeigeIso =
    termin.gegenvorschlag_von === 'kunde' && termin.vorgeschlagenes_datum
      ? termin.vorgeschlagenes_datum
      : termin.start_zeit ?? termin.vorgeschlagenes_datum

  const datumLabel = fmtDate(anzeigeIso)
  const startLabel = fmtTime(anzeigeIso)
  const endLabel = fmtTime(termin.end_zeit)

  const statusUi = getStatusUi(
    termin.status,
    termin.gegenvorschlag_von,
    termin.gegenvorschlag_grund,
  )
  const StatusIcon = statusUi.icon

  const adressteile = [
    fall.schadens_adresse,
    [fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(' ').trim() ||
      null,
  ].filter(Boolean) as string[]
  const mapsDestination = adressteile.join(', ')

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        Termin
      </h3>

      {datumLabel && (
        <div className="flex items-start gap-3">
          <CalendarIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-sm">
            <p className="text-gray-900 font-medium">{datumLabel}</p>
            {(startLabel || endLabel) && (
              <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1.5">
                <ClockIcon className="w-3.5 h-3.5 text-gray-400" />
                {startLabel}
                {endLabel && startLabel && endLabel !== startLabel
                  ? ` – ${endLabel}`
                  : ''}{' '}
                Uhr
              </p>
            )}
          </div>
        </div>
      )}

      {adressteile.length > 0 && (
        <div className="flex items-start gap-3 pt-3 border-t border-gray-100">
          <MapPinIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            {adressteile.map((zeile, i) => (
              <p
                key={i}
                className={i === 0 ? 'text-gray-900' : 'text-gray-600 mt-0.5'}
              >
                {zeile}
              </p>
            ))}
            {mapsDestination && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsDestination)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-medium text-[var(--brand-secondary)] hover:text-[var(--brand-primary)]"
              >
                <NavigationIcon className="w-3.5 h-3.5" /> Route starten
              </a>
            )}
          </div>
        </div>
      )}

      <div className="pt-3 border-t border-gray-100 space-y-2">
        <div
          className={`inline-flex items-start gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${TONE_CLASSES[statusUi.tone]}`}
        >
          <StatusIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{statusUi.label}</span>
        </div>
        {statusUi.hint && (
          <p className="text-[11px] text-gray-500">{statusUi.hint}</p>
        )}
      </div>

      <div className="pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand-secondary)] hover:text-[var(--brand-primary)]"
        >
          <PencilIcon className="w-3.5 h-3.5" /> Termin ändern
        </button>
      </div>

      <TerminVorschlagModal
        fallId={fall.id}
        mode="bearbeiten"
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        existingTermin={{
          id: termin.id,
          status: termin.status,
          start_zeit: termin.start_zeit,
          vorgeschlagenes_datum: termin.vorgeschlagenes_datum,
          gegenvorschlag_von:
            (termin.gegenvorschlag_von as 'sv' | 'kunde' | null) ?? null,
        }}
      />
    </div>
  )
}
