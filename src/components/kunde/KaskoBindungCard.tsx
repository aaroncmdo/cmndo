'use client'

// Kasko-Claim mit Werkstattbindung: Info statt Finder (keine Vermittlung, Spec E2).
// Abnahme 04.09.: "Angaben korrigieren" oeffnet die Tariffrage erneut (KaskoTarifCard). Review #5864 (Befund 2):
// router.refresh() erhaelt Client-State — der Korrekturmodus muss aktiv verlassen werden, sonst bleibt die Frage
// stehen, wenn die Flags die Card weiter zeigen (gebunden -> anderer gebundener Tarif). Bei frei/unbekannt blendet
// GeldZone die Card nach dem Refresh aus; bis dahin rendert sie nichts (kein Aufblitzen der alten Endansicht).
import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/primitives'
import { KaskoBindungEndansicht } from '@/components/self-service/KaskoBindungEndansicht'
import KaskoTarifCard from '@/components/kunde/KaskoTarifCard'
import type { KaskoBindungsInfo } from '@/lib/kasko-wb/types'
import { ladeKaskoBindungsInfoPortal } from '@/app/kunde/faelle/[id]/kasko-tarif-actions'

export default function KaskoBindungCard({ claimId }: { claimId: string }) {
  const [info, setInfo] = useState<KaskoBindungsInfo | null>(null)
  const [korrigieren, setKorrigieren] = useState(false)
  const ladeInfo = useCallback(() => {
    let alive = true
    ladeKaskoBindungsInfoPortal(claimId).then((r) => {
      if (alive && r.ok) setInfo(r.info)
    })
    return () => {
      alive = false
    }
  }, [claimId])
  useEffect(() => ladeInfo(), [ladeInfo])

  if (korrigieren) {
    return (
      <KaskoTarifCard
        claimId={claimId}
        onGespeichert={(frei) => {
          setKorrigieren(false)
          setInfo(null)
          if (frei === false) ladeInfo()
        }}
      />
    )
  }
  if (!info) return null
  return (
    <Card p={5} radius="lg">
      <KaskoBindungEndansicht info={info} kompakt anrede="Sie" onKorrigieren={() => setKorrigieren(true)} />
    </Card>
  )
}
