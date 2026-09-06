'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { filterByTyp, type TypFilter } from '@/lib/updates/split'
import type { UpdateItem as TUpdateItem } from '@/lib/updates/types'
import { TYP_CHIPS } from '@/components/shared/updates/update-item-shared'
import { UpdateItem } from '@/components/shared/updates/UpdateItem'

// Phase 5 Teil D: interaktive Worklist der /updates-Vollseite (operative Rollen).
// Datenquelle ist die (server-seitig geladene) DB-getriebene Action-/Info-Liste;
// hier nur Typ-Filter + Klick-Navigation.
export function UpdatesWorklist({
  actionItems,
  infoItems,
}: {
  actionItems: TUpdateItem[]
  infoItems: TUpdateItem[]
}) {
  const [typFilter, setTypFilter] = useState<TypFilter>('alle')
  const router = useRouter()
  const fAction = useMemo(() => filterByTyp(actionItems, typFilter), [actionItems, typFilter])
  const fInfo = useMemo(() => filterByTyp(infoItems, typFilter), [infoItems, typFilter])

  const jump = (m: TUpdateItem) => {
    if (m.routeUrl) router.push(m.routeUrl)
  }

  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-white overflow-hidden">
      <div className="flex gap-1 px-3 py-2 border-b border-claimondo-border overflow-x-auto">
        {TYP_CHIPS.map((c) => {
          const active = typFilter === c.key
          return (
            <button
              key={c.key}
              onClick={() => setTypFilter(c.key)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-claimondo-navy text-white'
                  : 'bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy'
              }`}
            >
              <c.icon className="w-3.5 h-3.5" /> {c.label}
            </button>
          )
        })}
      </div>

      <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-danger">Braucht Sie</div>
      {fAction.length === 0 ? (
        <div className="px-4 pb-4 text-sm text-claimondo-ondo/70">Nichts offen — alles erledigt. ✓</div>
      ) : (
        fAction.map((m) => <UpdateItem key={`a-${m.id}`} item={m} variant="action" onClick={jump} />)
      )}

      {fInfo.length > 0 && (
        <>
          <div className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-claimondo-ondo">
            Verlauf ({fInfo.length})
          </div>
          {fInfo.map((m) => (
            <UpdateItem key={`i-${m.id}`} item={m} variant="info" onClick={jump} />
          ))}
        </>
      )}
    </div>
  )
}
