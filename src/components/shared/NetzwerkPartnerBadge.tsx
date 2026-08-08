// Netzwerkpartner-Status-Badge fuer die Admin-Uebersicht. Liegt in shared/* (bewusst ausserhalb
// des status-registry-Ratchets — die zentralen Badge-Komponenten leben hier). Semantische Tokens
// (success/warning/claimondo-*), kein raw-Hex. Ein abgelaufenes comped/aktiv wird als "abgelaufen"
// markiert (Status-kind bleibt, istAktiv=false).
import type { NetzwerkPartnerStatus } from '@/lib/netzwerk/partner-uebersicht'

const VIEW: Record<NetzwerkPartnerStatus['kind'], { label: string; cls: string }> = {
  comped: { label: 'Netzwerkpartner (comped)', cls: 'bg-success-soft text-success-strong' },
  aktiv: { label: 'Netzwerkpartner (Abo)', cls: 'bg-success-soft text-success-strong' },
  ueberfaellig: { label: 'Abo überfällig', cls: 'bg-warning-soft text-warning-strong' },
  gekuendigt: { label: 'Abo gekündigt', cls: 'bg-claimondo-bg text-claimondo-ondo' },
  inaktiv: { label: 'Abo inaktiv', cls: 'bg-claimondo-bg text-claimondo-ondo' },
  kein_abo: { label: 'Kein Netzwerk-Abo', cls: 'bg-claimondo-bg text-claimondo-ondo/70' },
}

export function NetzwerkPartnerBadge({ status }: { status: NetzwerkPartnerStatus }) {
  const v = VIEW[status.kind]
  const abgelaufen = !status.istAktiv && (status.kind === 'comped' || status.kind === 'aktiv')
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
          abgelaufen ? 'bg-warning-soft text-warning-strong' : v.cls
        }`}
      >
        {v.label}
      </span>
      {abgelaufen && <span className="text-[10px] font-medium text-warning-strong">abgelaufen</span>}
    </span>
  )
}
