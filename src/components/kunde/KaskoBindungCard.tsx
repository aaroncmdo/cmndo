'use client'

// Kasko-Claim mit Werkstattbindung: Info statt Finder (keine Vermittlung, Spec E2).
import { useEffect, useState } from 'react'
import { Card } from '@/components/primitives'
import { KaskoBindungEndansicht } from '@/components/self-service/KaskoBindungEndansicht'
import type { KaskoBindungsInfo } from '@/lib/kasko-wb/types'
import { ladeKaskoBindungsInfoPortal } from '@/app/kunde/faelle/[id]/kasko-tarif-actions'

export default function KaskoBindungCard({ claimId }: { claimId: string }) {
  const [info, setInfo] = useState<KaskoBindungsInfo | null>(null)
  useEffect(() => {
    let alive = true
    ladeKaskoBindungsInfoPortal(claimId).then((r) => {
      if (alive && r.ok) setInfo(r.info)
    })
    return () => {
      alive = false
    }
  }, [claimId])
  if (!info) return null
  return (
    <Card p={5} radius="lg">
      <KaskoBindungEndansicht info={info} kompakt />
    </Card>
  )
}
