// 2026-05-07 Design-Review Item 5b: Trust-Cards-Strip auf der Fall-Detail-
// Page. Vorher: SaeuleMeinBetreuer existiert seit AAR-369 als Component,
// wird aber nicht gerendert; KB + SV waren unsichtbar trotz Daten-Loading
// auf der Page. Jetzt: 2-Spalten Strip oben auf der Page mit Avatar +
// Name + Rolle + Chat-Button — der Endkunde sieht sofort wer sich um
// seinen Fall kümmert.

import Link from 'next/link'
import { MessageSquareIcon, HardHatIcon, HeadphonesIcon, ShieldCheckIcon } from 'lucide-react'
import Avatar from '@/components/shared/Avatar'

type Props = {
  fallId: string
  kbName: string | null
  kbAvatarUrl?: string | null
  kbBeschreibung?: string | null
  svName: string | null
  svAvatarUrl?: string | null
  svBeschreibung?: string | null
  svVerifiziert?: boolean
}

function Card({
  rolle,
  icon: RolleIcon,
  name,
  avatarUrl,
  beschreibung,
  verifiziert,
  fallId,
}: {
  rolle: 'kundenbetreuer' | 'sachverstaendiger'
  icon: typeof HardHatIcon
  name: string | null
  avatarUrl: string | null
  beschreibung: string | null
  verifiziert?: boolean
  fallId: string
}) {
  const labelMap = {
    kundenbetreuer: 'Ihr Kundenbetreuer',
    sachverstaendiger: 'Ihr Sachverständiger',
  } as const
  const fallbackBeschreibung =
    rolle === 'kundenbetreuer'
      ? 'Persönlicher Ansprechpartner'
      : 'Erstellt Ihr Gutachten'
  const displayName = name ?? (rolle === 'kundenbetreuer' ? 'Claimondo Team' : 'Wird zugewiesen')

  return (
    <div className="bg-white rounded-xl border border-claimondo-border shadow-sm p-4 flex items-center gap-3">
      <Avatar url={avatarUrl ?? null} name={displayName} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-claimondo-ondo">
          <RolleIcon className="w-3 h-3" />
          {labelMap[rolle]}
          {verifiziert && (
            <ShieldCheckIcon className="w-3 h-3 text-emerald-600" />
          )}
        </div>
        <p className="text-sm font-semibold text-claimondo-navy truncate mt-0.5">
          {displayName}
        </p>
        <p className="text-[11px] text-claimondo-ondo truncate">
          {beschreibung ?? fallbackBeschreibung}
        </p>
      </div>
      <Link
        href={`/kunde/faelle/${fallId}#chat`}
        className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-[var(--brand-secondary)] text-white hover:bg-[#3a6290] transition-colors"
        aria-label={`Chat mit ${displayName} öffnen`}
        title="Chat öffnen"
      >
        <MessageSquareIcon className="w-4 h-4" />
      </Link>
    </div>
  )
}

export default function KundeBetreuerStrip(props: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Card
        rolle="kundenbetreuer"
        icon={HeadphonesIcon}
        name={props.kbName}
        avatarUrl={props.kbAvatarUrl ?? null}
        beschreibung={props.kbBeschreibung ?? null}
        fallId={props.fallId}
      />
      <Card
        rolle="sachverstaendiger"
        icon={HardHatIcon}
        name={props.svName}
        avatarUrl={props.svAvatarUrl ?? null}
        beschreibung={props.svBeschreibung ?? null}
        verifiziert={props.svVerifiziert}
        fallId={props.fallId}
      />
    </div>
  )
}
