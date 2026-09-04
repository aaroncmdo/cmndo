'use client'

// Kasko-Claim mit Werkstattbindung: Info statt Finder (keine Vermittlung, Spec E2).
// Abnahme 04.09.: "Angaben korrigieren" oeffnet die Tariffrage erneut (KaskoTarifCard); nach dem Speichern laedt
// die Seite neu, die Flags entscheiden dann wieder zwischen Bindungs-Card und Finder.
import { useEffect, useState } from 'react'
import { Card } from '@/components/primitives'
import { KaskoBindungEndansicht } from '@/components/self-service/KaskoBindungEndansicht'
import KaskoTarifCard from '@/components/kunde/KaskoTarifCard'
import type { KaskoBindungsInfo } from '@/lib/kasko-wb/types'
import { ladeKaskoBindungsInfoPortal } from '@/app/kunde/faelle/[id]/kasko-tarif-actions'

export default function KaskoBindungCard({ claimId }: { claimId: string }) {
  const [info, setInfo] = useState<KaskoBindungsInfo | null>(null)
  const [korrigieren, setKorrigieren] = useState(false)
  useEffect(() => {
    let alive = true
    ladeKaskoBindungsInfoPortal(claimId).then((r) => {
      if (alive && r.ok) setInfo(r.info)
    })
    return () => {
      alive = false
    }
  }, [claimId])
  if (korrigieren) return <KaskoTarifCard claimId={claimId} />
  if (!info) return null
  return (
    <Card p={5} radius="lg">
      <KaskoBindungEndansicht info={info} kompakt anrede="du" onKorrigieren={() => setKorrigieren(true)} />
    </Card>
  )
}
