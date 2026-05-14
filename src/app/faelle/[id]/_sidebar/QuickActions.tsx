'use client'

// AAR-162 / W2 + AAR-163 / W3: Quick-Actions-Sidebar — phase-abhängige Buttons.
// AAR-756 (Phase E): Rule-Logic nach `@/lib/admin/jetzt-zu-tun` ausgelagert.
// Diese Datei ist jetzt reiner Renderer + FIN-Call-Handler.

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useFall } from '../FallContext'
import { triggerFinCallForFall } from '../_actions/dokumente'
import { getAdminJetztZuTun, type AdminAktion } from '@/lib/admin/jetzt-zu-tun'

export default function QuickActions() {
  const { fall, phase } = useFall()
  const [pending, startTransition] = useTransition()

  const fin = (fall.fin_vin as string | null) ?? (fall.fin as string | null)
  const sv_termin = fall.sv_termin as string | null
  const cardentity_abfrage_am =
    (fall.cardentity_abfrage_am as string | null) ??
    (fall.cardentity_enriched_at as string | null)

  const actions = getAdminJetztZuTun({
    phase,
    fin,
    sv_termin,
    cardentity_abfrage_am,
  })

  function triggerFinCall() {
    startTransition(async () => {
      const r = await triggerFinCallForFall(fall.id)
      if (r.success) {
        toast.success(
          r.updatedFields?.length
            ? `FIN-Call erfolgreich — ${r.updatedFields.length} Felder aktualisiert`
            : 'FIN-Call ausgeführt (keine neuen Daten)',
        )
      } else {
        toast.error(r.error ?? 'FIN-Call fehlgeschlagen')
      }
    })
  }

  if (actions.length === 0) return null

  return (
    <div className="bg-white rounded-ios-md border border-claimondo-border p-3 space-y-2">
      <p className="text-[9px] font-semibold text-claimondo-ondo uppercase">Quick Actions</p>
      <div className="space-y-1.5">
        {actions.map((a) => (
          <ActionButton
            key={a.key}
            action={a}
            pending={pending}
            onTriggerFinCall={triggerFinCall}
          />
        ))}
      </div>
    </div>
  )
}

function ActionButton({
  action,
  pending,
  onTriggerFinCall,
}: {
  action: AdminAktion
  pending: boolean
  onTriggerFinCall: () => void
}) {
  const disabled = !action.enabled || (action.key === 'fin_call' && pending)
  const label =
    action.key === 'fin_call' && pending ? 'FIN-Call läuft …' : action.label
  const title = action.enabled ? undefined : 'Wird in einem späteren Sprint aktiviert'
  const onClick = action.key === 'fin_call' ? onTriggerFinCall : undefined

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="w-full text-left px-2 py-1.5 rounded-ios-md border border-claimondo-border hover:bg-claimondo-bg disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <p className="text-xs font-medium text-claimondo-navy">{label}</p>
      {action.description && (
        <p className="text-[10px] text-claimondo-ondo mt-0.5">{action.description}</p>
      )}
    </button>
  )
}
