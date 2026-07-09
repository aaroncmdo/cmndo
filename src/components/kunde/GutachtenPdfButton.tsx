'use client'

// AV7: Kunde laedt sein Gutachten-PDF direkt herunter (signed URL via oeffneGutachtenPdfKunde).
// Oeffnet einen Tab VOR dem await (Popup-Blocker-safe), spiegelt die werkstattseitige
// GutachtenSektion-Logik.

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { oeffneGutachtenPdfKunde } from '@/app/kunde/faelle/[id]/gutachten-actions'

export default function GutachtenPdfButton({ claimId }: { claimId: string }) {
  const [laden, setLaden] = useState(false)

  async function handle() {
    setLaden(true)
    const win = window.open('', '_blank')
    const r = await oeffneGutachtenPdfKunde(claimId)
    setLaden(false)
    if (!r.ok) {
      win?.close()
      toast.error(r.error ?? 'Gutachten konnte nicht geöffnet werden')
      return
    }
    if (win) win.location.href = r.url
    else window.open(r.url, '_blank')
  }

  return (
    <Button variant="ghost" size="sm" loading={laden} onClick={handle}>
      Gutachten herunterladen
    </Button>
  )
}
