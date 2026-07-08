'use client'

// Claim-Chat-Panel (Phase 2c): Thread-Liste (Gruppe / Team-intern / DMs) links, gewaehlter Thread
// rechts via ClaimThreadChat. Reiner Consumer des Thread-Service — der Ziel-Ersatz fuer
// MultiChannelChat in den Portalen (Cutover portalweise/koordiniert). Erster Einsatz: Admin-
// Pilot-Route /admin/chat/[claimId] (null Kollision, statt ein bestehendes Portal-File zu wiren).

import { useEffect, useState } from 'react'
import { Button } from '@/components/primitives'
import { ladeClaimThreads, holeOderErstelleGruppenThread, type ClaimThreadInfo } from '@/lib/chat/thread-actions'
import { ClaimThreadChat } from './ClaimThreadChat'

export function ClaimChatPanel({ claimId, currentUserId }: { claimId: string; currentUserId: string }) {
  const [threads, setThreads] = useState<ClaimThreadInfo[]>([])
  const [aktiv, setAktiv] = useState<string | null>(null)
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    let ok = true
    void (async () => {
      // Kunde-Gruppe lazy sicherstellen, damit auch Claims ohne Backfill-Thread sofort einen Chat haben.
      await holeOderErstelleGruppenThread(claimId, 'kunde_gruppe')
      const res = await ladeClaimThreads(claimId)
      if (ok && res.ok) {
        setThreads(res.data)
        setAktiv((a) => a ?? res.data[0]?.id ?? null)
      }
      if (ok) setLaden(false)
    })()
    return () => {
      ok = false
    }
  }, [claimId])

  return (
    <div className="flex h-full min-h-0">
      <div className="w-44 shrink-0 space-y-1 overflow-y-auto border-r border-claimondo-border p-2">
        {laden ? (
          <p className="px-1 py-2 text-body-xs text-claimondo-ondo">Lädt…</p>
        ) : threads.length === 0 ? (
          <p className="px-1 py-2 text-body-xs text-claimondo-ondo">Noch keine Threads für diesen Claim.</p>
        ) : (
          threads.map((t) => (
            <Button key={t.id} variant={aktiv === t.id ? 'navy' : 'ghost'} size="sm" fullWidth onClick={() => setAktiv(t.id)}>
              {t.label}
            </Button>
          ))
        )}
      </div>
      <div className="min-h-0 flex-1">
        {aktiv ? (
          <ClaimThreadChat threadId={aktiv} currentUserId={currentUserId} />
        ) : (
          <p className="py-8 text-center text-body-sm text-claimondo-ondo">Thread wählen.</p>
        )}
      </div>
    </div>
  )
}
