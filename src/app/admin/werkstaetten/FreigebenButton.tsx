'use client'

// Inline-Freigabe aus der Admin-Uebersicht „Ausstehende Reparaturfreigaben": das Team gibt
// direkt aus der Backlog-Liste frei, statt jede Fallakte einzeln zu oeffnen. Nutzt die
// bestehende reparaturFreigeben-Action (admin/KB-gated, loest den Task + benachrichtigt die
// Werkstatt). Nach Erfolg verschwindet die Zeile via router.refresh() (Task -> erledigt).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2Icon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { reparaturFreigeben } from '@/app/faelle/[id]/_actions/reparatur-freigabe'

export function FreigebenButton({ claimId }: { claimId: string }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function onFreigeben() {
    setSaving(true)
    try {
      const res = await reparaturFreigeben(claimId)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success('Reparatur freigegeben.')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Button
      variant="navy"
      size="sm"
      loading={saving}
      onClick={onFreigeben}
      iconLeft={<CheckCircle2Icon className="w-4 h-4" />}
    >
      Freigeben
    </Button>
  )
}
