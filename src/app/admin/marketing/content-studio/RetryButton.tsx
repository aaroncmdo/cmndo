'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'
import { wiederholeJob } from './actions'

/** Startet einen fehlgeschlagenen/haengenden Job erneut (siehe actions.ts:wiederholeJob). */
export function RetryButton({ jobId, label = 'Erneut versuchen' }: { jobId: string; label?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="navy"
        loading={pending}
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const r = await wiederholeJob(jobId)
            if (!r.ok) setError(r.error ?? 'Erneuter Versuch fehlgeschlagen.')
            else router.refresh()
          })
        }}
      >
        {label}
      </Button>
      {error ? <span className="text-body-sm text-danger-strong">{error}</span> : null}
    </div>
  )
}
