'use client'

// AAR-382: Kompakte Liste-Item-Darstellung für nicht-aktive Stops
// (kommende + erledigte). Zeigt Index, Uhrzeit, Adresse und Status-Icon.
// Klick auf Item ist Placeholder für spätere Navigation (z. B. Stop-Details).

import { CheckCircle2Icon, CircleIcon, ClockIcon } from 'lucide-react'
import { formatUhrzeit } from '@/lib/format'
import type { FeldmodusStop } from './page'

export interface StopListItemProps {
  stop: FeldmodusStop
  variant: 'kommend' | 'erledigt'
}

export default function StopListItem({ stop, variant }: StopListItemProps) {
  const erledigt = variant === 'erledigt'

  return (
    <div
      className={
        erledigt
          ? 'rounded-lg bg-white/5 p-3 text-xs text-claimondo-ondo/70 flex items-start gap-2'
          : 'rounded-lg bg-white/10 p-3 text-xs text-white/80 flex items-start gap-2'
      }
    >
      <div className="flex flex-col items-center pt-0.5">
        {erledigt ? (
          <CheckCircle2Icon className="w-4 h-4 text-emerald-400" />
        ) : (
          <CircleIcon className="w-4 h-4 text-claimondo-ondo/70" />
        )}
        <span className="text-[9px] mt-1 text-claimondo-ondo/70">
          #{stop.index + 1}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-[10px] text-claimondo-ondo/70">
          <ClockIcon className="w-3 h-3" />
          {formatUhrzeit(stop.start_zeit)}
          {stop.kennzeichen && (
            <span className="font-mono ml-1">{stop.kennzeichen}</span>
          )}
        </div>
        <p className={erledigt ? 'line-through truncate' : 'truncate font-medium'}>
          {stop.kunde_name}
        </p>
        <p className="text-[10px] text-claimondo-ondo/70 truncate">{stop.adresse}</p>
      </div>
    </div>
  )
}
