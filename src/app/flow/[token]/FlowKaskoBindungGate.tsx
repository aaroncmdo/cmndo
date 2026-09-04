'use client'

// Re-Visit eines wegen Kasko-Werkstattbindung disqualifizierten Leads: statt der generischen KaskoEndansicht
// (Gutachter/Haftpflicht-Text) die Bindungs-Endseite mit Info aus der Wissensbasis.
import { useEffect, useState } from 'react'
import { KaskoBindungEndansicht } from '@/components/self-service/KaskoBindungEndansicht'
import type { KaskoBindungsInfo } from '@/lib/kasko-wb/types'
import { fordereRueckrufAn, ladeKaskoBindungsInfoFuerFlow } from './self-service-actions'

export function FlowKaskoBindungGate({ token }: { token: string }) {
  const [info, setInfo] = useState<KaskoBindungsInfo | null>(null)
  useEffect(() => {
    let alive = true
    ladeKaskoBindungsInfoFuerFlow(token).then((r) => {
      if (alive && r.ok) setInfo(r.info)
    })
    return () => {
      alive = false
    }
  }, [token])
  if (!info) return <p className="text-body-sm text-claimondo-navy/60">Wird geladen …</p>
  return <KaskoBindungEndansicht info={info} onRueckruf={() => fordereRueckrufAn(token)} />
}
