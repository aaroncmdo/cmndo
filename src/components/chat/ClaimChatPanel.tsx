'use client'

// Claim-Chat-Panel (Phase 2c): Thread-Liste (Gruppe / Team-intern / DMs) links, gewaehlter Thread
// rechts via ClaimThreadChat. Reiner Consumer des Thread-Service — der Ziel-Ersatz fuer
// MultiChannelChat in den Portalen (Cutover portalweise/koordiniert). Erster Einsatz: Admin-
// Pilot-Route /admin/chat/[claimId] (null Kollision, statt ein bestehendes Portal-File zu wiren).

import { useEffect, useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import {
  ladeClaimThreads,
  ladeClaimBeteiligte,
  holeOderErstelleGruppenThread,
  holeOderErstelleDirektThread,
  type ClaimThreadInfo,
  type ClaimBeteiligter,
} from '@/lib/chat/thread-actions'
import { ClaimThreadChat } from './ClaimThreadChat'

export function ClaimChatPanel({
  claimId,
  currentUserId,
  istStaff = false,
}: {
  claimId: string
  currentUserId: string
  istStaff?: boolean
}) {
  const [threads, setThreads] = useState<ClaimThreadInfo[]>([])
  const [kandidaten, setKandidaten] = useState<ClaimBeteiligter[]>([])
  const [aktiv, setAktiv] = useState<string | null>(null)
  const [laden, setLaden] = useState(true)
  const [showNeu, setShowNeu] = useState(false)
  const [dmBusy, setDmBusy] = useState<string | null>(null)

  useEffect(() => {
    let ok = true
    void (async () => {
      // Kunde-Gruppe lazy sicherstellen, damit auch Claims ohne Backfill-Thread sofort einen Chat haben.
      await holeOderErstelleGruppenThread(claimId, 'kunde_gruppe')
      // Staff bekommen zusaetzlich den team-internen Thread (Ersatz fuer chat_kb_sv, kunde-unsichtbar via RLS).
      if (istStaff) await holeOderErstelleGruppenThread(claimId, 'team_intern')
      const res = await ladeClaimThreads(claimId)
      if (ok && res.ok) {
        setThreads(res.data)
        setAktiv((a) => a ?? res.data[0]?.id ?? null)
      }
      const kres = await ladeClaimBeteiligte(claimId)
      if (ok && kres.ok) setKandidaten(kres.data)
      if (ok) setLaden(false)
    })()
    return () => {
      ok = false
    }
  }, [claimId, istStaff])

  async function starteDm(userId: string) {
    setDmBusy(userId)
    try {
      const res = await holeOderErstelleDirektThread(claimId, userId)
      if (!res.ok) return
      const tres = await ladeClaimThreads(claimId)
      if (tres.ok) setThreads(tres.data)
      setAktiv(res.data)
      setShowNeu(false)
    } finally {
      setDmBusy(null)
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="w-44 shrink-0 space-y-1 overflow-y-auto border-r border-claimondo-border p-2">
        <Button variant="ghost" size="sm" fullWidth onClick={() => setShowNeu((s) => !s)} iconLeft={<PlusIcon className="w-4 h-4" />}>
          Neue Nachricht
        </Button>
        {showNeu && (
          <div className="space-y-1 rounded-ios-md bg-claimondo-bg p-1">
            {kandidaten.length === 0 ? (
              <p className="px-1 py-1 text-body-xs text-claimondo-ondo">Keine weiteren Beteiligten.</p>
            ) : (
              kandidaten.map((k) => (
                <Button
                  key={k.userId}
                  variant="ghost"
                  size="sm"
                  fullWidth
                  loading={dmBusy === k.userId}
                  onClick={() => starteDm(k.userId)}
                >
                  {k.label}
                </Button>
              ))
            )}
          </div>
        )}
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
