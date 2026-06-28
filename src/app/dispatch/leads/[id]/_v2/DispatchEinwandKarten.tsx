'use client'
import { MessageSquareWarningIcon, ChevronDownIcon } from 'lucide-react'
import { EINWAENDE } from '../_lib/gespraech-content'

export function DispatchEinwandKarten() {
  return (
    <details className="bg-white rounded-ios-xl border border-claimondo-border p-3 group">
      <summary className="text-xs font-semibold text-claimondo-navy flex items-center gap-2 cursor-pointer list-none">
        <MessageSquareWarningIcon className="w-4 h-4 text-warning" />
        <span>Einwand-Karten</span>
        <ChevronDownIcon className="w-3.5 h-3.5 ml-auto text-claimondo-ondo/70 group-open:rotate-180 transition-transform" />
      </summary>
      <div className="mt-2 space-y-1">
        {EINWAENDE.map((e, i) => (
          <details key={i} className="group/item rounded-ios-lg border border-claimondo-border p-2 hover:border-warning/30">
            <summary className="text-[11px] font-medium text-claimondo-navy cursor-pointer list-none flex items-start gap-1">
              <ChevronDownIcon className="w-3 h-3 mt-0.5 text-claimondo-ondo/70 group-open/item:rotate-180 transition-transform shrink-0" />
              <span className="flex-1">{e.einwand}</span>
            </summary>
            <p className="text-[10px] text-claimondo-ondo mt-1.5 pl-4 italic leading-relaxed">{e.antwort}</p>
          </details>
        ))}
      </div>
    </details>
  )
}
