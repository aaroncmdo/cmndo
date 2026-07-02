'use client'

import type { UpdateItem as TUpdateItem } from '@/lib/updates/types'
import { fmtRelative, typIcon } from './update-item-shared'

// #updates-rebuild: ein einzelnes Update-Item (Action- oder Info-Variante).
// Geteilt zwischen Popover (UpdatesNav) und /updates-Vollseite (Phase 5 Teil D).
export function UpdateItem({
  item,
  variant,
  onClick,
}: {
  item: TUpdateItem
  variant: 'action' | 'info'
  onClick: (item: TUpdateItem) => void
}) {
  const isAction = variant === 'action'
  return (
    <button
      onClick={() => onClick(item)}
      className={`w-full text-left border-b border-claimondo-border px-4 py-2.5 transition-colors ${
        isAction ? 'hover:bg-claimondo-ondo/5' : 'bg-white hover:bg-claimondo-bg'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`text-base shrink-0${isAction ? '' : ' opacity-70'}`}>{typIcon(item.typ)}</span>
        <div className="flex-1 min-w-0">
          <p
            className={
              isAction
                ? 'text-xs leading-snug text-claimondo-navy font-semibold truncate'
                : 'text-xs leading-snug text-claimondo-ondo truncate'
            }
          >
            {isAction && item.prioritaet === 'dringend' && (
              <span className="inline-block mr-1 text-danger" aria-label="Kritisch">
                ●
              </span>
            )}
            {item.titel}
          </p>
          {item.inhalt && (
            <p className={`text-[11px] line-clamp-2 mt-0.5 ${isAction ? 'text-claimondo-ondo' : 'text-claimondo-ondo/80'}`}>
              {item.inhalt}
            </p>
          )}
          <p className={`text-[10px] mt-1 ${isAction ? 'text-claimondo-ondo/70' : 'text-claimondo-ondo/60'}`}>
            {fmtRelative(item.createdAt)}
          </p>
        </div>
      </div>
    </button>
  )
}
