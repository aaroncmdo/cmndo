// Read-only-Card fuer eskalierte Admins. Erscheint nur wenn ein KB einen
// Fall an einen Admin eskaliert hat. Kein Anrufen, kein direkter Chat —
// der Admin nimmt am gruppenchat + chat_kb_kunde teil und erscheint dort
// als zusaetzlicher Sender.

import Image from 'next/image'
import { ShieldAlertIcon } from 'lucide-react'

type Props = {
  vorname: string | null
  nachname: string | null
  avatarUrl: string | null
  accentBg: string
}

export default function EskalierterAdminCard({ vorname, nachname, avatarUrl, accentBg }: Props) {
  const name = [vorname, nachname].filter(Boolean).join(' ') || 'Admin'
  const initials =
    [vorname?.[0], nachname?.[0]].filter(Boolean).join('').toUpperCase() || '?'

  return (
    <div className="mx-3 mb-2 rounded-xl border bg-amber-500/10 border-amber-500/30 px-3 py-2.5 relative z-[1102]">
      <p className="text-[9px] uppercase tracking-wider text-amber-200 leading-tight flex items-center gap-1">
        <ShieldAlertIcon className="w-2.5 h-2.5" />
        Mit-betreut von
      </p>
      <div className="flex items-center gap-2.5 mt-1.5">
        <div
          className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ backgroundColor: accentBg }}
        >
          {avatarUrl ? (
            <Image src={avatarUrl} alt={name} width={36} height={36} className="w-full h-full object-cover" unoptimized />
          ) : (
            initials
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate leading-tight">{name}</p>
          <p className="text-[10px] text-claimondo-light-blue leading-tight mt-0.5">Admin · liest mit</p>
        </div>
      </div>
    </div>
  )
}
