import Avatar from '@/components/shared/Avatar'

// AAR-423: Claimondo-Header für Kunden-Seiten. Claimondo-Logo + Name bleibt
// immer dominant; der SV erscheint nur als Avatar + Name + „im Auftrag von
// Claimondo"-Attribution. KEIN SV-Logo hier — Retention-kritisch.

type Props = {
  svAnzeigename: string
  svAvatarUrl: string | null
  // Optional: wenn der SV nicht verifiziert ist, rendern wir keine Attribution
  // (null/undefined = Attribution weglassen).
  showAttribution?: boolean
}

export default function ClaimondoKundenHeader({
  svAnzeigename,
  svAvatarUrl,
  showAttribution = true,
}: Props) {
  return (
    <header className="bg-white border-b border-claimondo-border px-5 py-3 flex-shrink-0">
      <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
        {/* Claimondo-Logo: IMMER sichtbar, links-oben, dominant. */}
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-[#0D1B3E]">Claim</span>
            <span className="text-[#4573A2]">ondo</span>
          </span>
        </div>

        {/* SV-Attribution: klein, rechts, mit Avatar. */}
        {showAttribution && (
          <div className="flex items-center gap-2.5">
            <Avatar url={svAvatarUrl} name={svAnzeigename} size="xs" />
            <div className="text-right">
              <p className="text-xs font-medium text-[#0D1B3E] leading-tight">{svAnzeigename}</p>
              <p className="text-[10px] text-claimondo-ondo leading-tight">im Auftrag von Claimondo</p>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
