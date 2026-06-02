'use client'

// Chat-Inbox P2: geteilte Kanal-Tab-Leiste (aus der Registry getChannelDef) +
// Unread-Badges. Ersetzt die handgerollte Tab-Leiste in MultiChannelChat.

import { getChannelDef, type ChatKanal } from '@/lib/communications/channels'
import { DropletBadge } from '@/components/primitives'

export function KanalTabBar({
  kanaele,
  active,
  onSelect,
  unreadByKanal,
}: {
  kanaele: ChatKanal[]
  active: ChatKanal
  onSelect: (k: ChatKanal) => void
  unreadByKanal: Record<string, number>
}) {
  return (
    <div className="flex border-b border-claimondo-border overflow-x-auto">
      {kanaele.map((k) => {
        const def = getChannelDef(k)
        const Icon = def.icon
        const unread = unreadByKanal[k] ?? 0
        const isActive = active === k
        return (
          <button
            key={k}
            onClick={() => onSelect(k)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
              isActive
                ? 'border-claimondo-ondo text-claimondo-navy'
                : 'border-transparent text-claimondo-ondo hover:text-claimondo-navy'
            }`}
          >
            <Icon className="w-4 h-4" style={{ color: def.color }} />
            <span className="text-sm font-medium">{def.label}</span>
            {unread > 0 && <DropletBadge count={unread} tone="danger" />}
          </button>
        )
      })}
    </div>
  )
}
