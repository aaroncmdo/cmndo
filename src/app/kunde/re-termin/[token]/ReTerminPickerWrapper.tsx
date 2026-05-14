'use client'

// AAR-900 / CMM-40: Wrapper um den Shared-TerminPicker. Bindet den Token an
// die Server-Action waehleReTerminSlot, damit der Picker selbst kein
// Token-Wissen braucht. Ersetzt den heutigen ReTerminPickerClient.

import { TerminPicker } from '@/components/shared/termin/TerminPicker'
import type { TerminSlot } from '@/lib/termine/slot-grid'

type Props = {
  token: string
  vorname: string | null
  kennzeichen: string | null
  schadensOrt: string | null
  slots: TerminSlot[]
  onSubmit: (token: string, slotStartIso: string) => Promise<{ ok: boolean; error?: string }>
}

export default function ReTerminPickerWrapper({
  token,
  vorname,
  kennzeichen,
  schadensOrt,
  slots,
  onSubmit,
}: Props) {
  return (
    <TerminPicker
      slots={slots}
      mode="verlegung"
      kontext={{ vorname, kennzeichen, schadensOrt }}
      onBooked={(slotStartIso) => onSubmit(token, slotStartIso)}
      successHeading="Vorschlag gesendet"
      successText="Dein Vorschlag ist beim Sachverständigen eingegangen. Du bekommst eine Bestätigung sobald er den Termin annimmt."
    />
  )
}
