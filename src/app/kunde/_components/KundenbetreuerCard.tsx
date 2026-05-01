// Kunde-Sidebar-Card: zeigt zugewiesenen Kundenbetreuer + Quick-Actions
// (Anrufen, Chat). Wird in der Sidebar oberhalb der Profil-Zeile gerendert,
// damit der Kunde seinen festen Ansprechpartner immer sichtbar hat.

import Link from 'next/link'
import Image from 'next/image'
import { PhoneIcon, MessageSquareIcon } from 'lucide-react'

type Props = {
  vorname: string | null
  nachname: string | null
  telefon: string | null
  avatarUrl: string | null
  /** Pfad zur Chat-Page für den Kunden (idR /kunde/chat oder Fall-Chat-Tab) */
  chatHref: string
  /** Akzent-Farbe (Brand-Primary mit Fallback) */
  accentBg: string
}

export default function KundenbetreuerCard({
  vorname,
  nachname,
  telefon,
  avatarUrl,
  chatHref,
  accentBg,
}: Props) {
  const name = [vorname, nachname].filter(Boolean).join(' ') || 'Ihr Betreuer'
  const initials =
    [vorname?.[0], nachname?.[0]].filter(Boolean).join('').toUpperCase() || '?'

  return (
    <div className="mx-3 mb-3 rounded-xl bg-white/5 border border-white/10 p-3">
      <p className="text-[10px] uppercase tracking-wider text-[#7BA3CC] mb-2">
        Ihr Betreuer
      </p>
      <div className="flex items-center gap-2.5">
        <div
          className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold text-white shrink-0"
          style={{ backgroundColor: accentBg }}
        >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={name}
              width={40}
              height={40}
              className="w-full h-full object-cover"
              unoptimized
            />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{name}</p>
          <p className="text-[10px] text-[#7BA3CC]">Kundenbetreuer</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mt-3">
        {telefon ? (
          <a
            href={`tel:${telefon}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium py-2 transition-colors"
            aria-label={`${name} anrufen`}
          >
            <PhoneIcon className="w-3.5 h-3.5" />
            Anrufen
          </a>
        ) : (
          <span className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/5 text-[#7BA3CC]/60 text-xs py-2 cursor-not-allowed">
            <PhoneIcon className="w-3.5 h-3.5" />
            Anrufen
          </span>
        )}
        <Link
          href={chatHref}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium py-2 transition-colors"
        >
          <MessageSquareIcon className="w-3.5 h-3.5" />
          Chat
        </Link>
      </div>
    </div>
  )
}
