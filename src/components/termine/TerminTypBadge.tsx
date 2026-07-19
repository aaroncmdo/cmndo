'use client'
import { useTranslations } from 'next-intl'
import { HardHatIcon, SearchIcon, WrenchIcon, VideoIcon, UsersIcon } from 'lucide-react'
import { TERMIN_TYP_META, type TerminTyp } from '@/lib/termine/termin-typ'

const ICONS = { hardhat: HardHatIcon, search: SearchIcon, wrench: WrenchIcon, video: VideoIcon, users: UsersIcon } as const

export function TerminTypBadge({ typ }: { typ: TerminTyp }) {
  const t = useTranslations('kunde.termine')
  const meta = TERMIN_TYP_META[typ]
  const Icon = ICONS[meta.icon]
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-claimondo-border bg-claimondo-bg px-2.5 py-1 text-[11px] font-medium text-claimondo-navy">
      <Icon className="w-3 h-3" />
      {t(meta.labelKey)}
    </span>
  )
}
