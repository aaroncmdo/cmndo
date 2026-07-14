'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getRenderStatus } from './actions'
import { renderPhaseLabel } from '@/lib/marketing/render-progress'

// Live-Fortschrittsbalken fuer den Render. Pollt den read-only Server-Action alle 2.5s,
// zeigt bei render_queued „wartet auf Kapazitaet", sonst den Phasen-Balken mit Live-%.
// Bei video_fertig/fehler -> router.refresh() (Video bzw. Fehlermeldung nachladen).
export function RenderProgress({ jobId, initialStatus }: { jobId: string; initialStatus: string }) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [pct, setPct] = useState<number | null>(null)
  const [phase, setPhase] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const poll = async () => {
      const r = await getRenderStatus(jobId)
      if (!active || !r.ok) return
      setStatus(r.status ?? initialStatus)
      setPct(r.fortschritt ?? null)
      setPhase(r.phase ?? null)
      if (r.status === 'video_fertig' || r.status === 'fehler') {
        router.refresh()
      }
    }
    void poll()
    const iv = setInterval(poll, 2500)
    return () => {
      active = false
      clearInterval(iv)
    }
  }, [jobId, initialStatus, router])

  const queued = status === 'render_queued'
  const width = queued ? 20 : (pct ?? 0)
  const label = queued ? 'In Warteschlange · wartet auf Render-Kapazität' : renderPhaseLabel(phase)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-body-xs text-claimondo-shield">
        <span>{label}</span>
        {!queued && pct !== null ? <span className="tabular-nums">{pct}%</span> : null}
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-ios-sm bg-claimondo-bg"
        role="progressbar"
        aria-valuenow={queued ? undefined : (pct ?? 0)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Render-Fortschritt"
      >
        <div
          className={`h-full rounded-ios-sm bg-claimondo-ondo transition-all duration-500 ${queued ? 'animate-pulse' : ''}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}
