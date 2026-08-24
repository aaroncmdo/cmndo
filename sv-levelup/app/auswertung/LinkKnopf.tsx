'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { linkHolen } from './actions'

/**
 * Oeffnet die Auswertung eines Checks — und legt den Link an, falls es noch
 * keinen gibt. Fuer den Nutzer ist das ein Knopf, kein zweistufiger Vorgang.
 */
export function LinkKnopf({ checkId }: { checkId: string }) {
  const router = useRouter()
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function oeffnen() {
    setLaeuft(true)
    setFehler(null)
    const r = await linkHolen(checkId)
    if (!r.ok) {
      setLaeuft(false)
      setFehler(r.error)
      return
    }
    router.push(`/auswertung/${r.token}`)
  }

  return (
    <span className="inline-flex items-center gap-2">
      {fehler && <span className="text-xs text-critical">{fehler}</span>}
      <button
        type="button"
        onClick={oeffnen}
        disabled={laeuft}
        className="rounded-[10px] border border-white/20 px-3 py-1.5 text-xs text-white transition hover:border-signal disabled:opacity-50"
      >
        {laeuft ? 'Öffnet …' : 'Auswertung'}
      </button>
    </span>
  )
}
