// P1/P2 (Kunde-Detail-Rebuild): TeamZone — dein Betreuer (KB) + dein Gutachter (SV).
// Sichtbar, wenn mindestens einer existiert. Token-clean (primitives Card, claimondo-Tokens),
// ersetzt die handgerollten Teile des alten KundeBetreuerStrip/SaeuleMeinBetreuer.

import { Card } from '@/components/primitives'
import { PhoneIcon } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'

type KontaktProps = {
  name: string | null
  rolle: string
  telefon: string | null
  avatarUrl: string | null
  verifiziert?: boolean
  beschreibung?: string | null
}

function KontaktRow({ name, rolle, telefon, avatarUrl, verifiziert, beschreibung }: KontaktProps) {
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <div className="flex items-start gap-3">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-claimondo-bg flex items-center justify-center text-claimondo-navy font-semibold shrink-0">
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-body-xs text-claimondo-ondo">{rolle}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-body-sm font-medium text-claimondo-navy truncate">{name ?? '—'}</p>
          {verifiziert && <StatusBadge tone="success" size="sm">Verifiziert</StatusBadge>}
        </div>
        {beschreibung && <p className="text-body-xs text-claimondo-ondo/80 mt-0.5 line-clamp-2">{beschreibung}</p>}
      </div>
      {telefon && (
        <a
          href={`tel:${telefon}`}
          aria-label={`${rolle} anrufen`}
          className="flex items-center gap-1.5 rounded-ios-sm border border-claimondo-border text-claimondo-navy px-3 py-1.5 text-body-xs font-medium shrink-0 hover:bg-claimondo-bg transition-colors"
        >
          <PhoneIcon className="w-3.5 h-3.5" />
          Anrufen
        </a>
      )}
    </div>
  )
}

export function TeamZone({ vm }: { vm: KundeClaimViewModel }) {
  const { kb, sv } = vm.team
  const werkstatt = vm.werkstatt.data
  if (!kb && !sv && !werkstatt) return null

  // #4b: vermittelte Werkstatt-Adresse als Kontakt-Beschreibung (analog SV-Profilbeschreibung).
  const werkstattAdresse = werkstatt
    ? [werkstatt.adresse_strasse, [werkstatt.adresse_plz, werkstatt.adresse_ort].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ') || null
    : null

  return (
    <Card p={4} className="space-y-3">
      <h2 className="text-body-sm font-semibold text-claimondo-navy">Dein Team</h2>
      {kb && (
        <KontaktRow
          name={kb.anzeigename || kb.name}
          rolle="Dein Betreuer"
          telefon={kb.telefon}
          avatarUrl={kb.avatarUrl}
          beschreibung={kb.profilbeschreibung}
        />
      )}
      {sv && (
        <KontaktRow
          name={sv.anzeigename || sv.name}
          rolle="Dein Gutachter"
          telefon={sv.telefon}
          avatarUrl={sv.avatarUrl}
          verifiziert={sv.verifiziert}
          beschreibung={sv.profilbeschreibung}
        />
      )}
      {/* #4b: vermittelte Werkstatt als Team-Kontakt (analog SV, Aaron 13.07.). */}
      {werkstatt && (
        <KontaktRow
          name={werkstatt.name}
          rolle="Deine Werkstatt"
          telefon={werkstatt.telefon}
          avatarUrl={null}
          beschreibung={werkstattAdresse}
        />
      )}
    </Card>
  )
}
