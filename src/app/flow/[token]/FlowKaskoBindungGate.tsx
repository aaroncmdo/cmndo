'use client'

// Re-Visit eines wegen Kasko-Werkstattbindung disqualifizierten Leads: statt der generischen KaskoEndansicht
// (Gutachter/Haftpflicht-Text) die Bindungs-Endseite mit Info aus der Wissensbasis.
import { useEffect, useState } from 'react'
import { KaskoBindungEndansicht } from '@/components/self-service/KaskoBindungEndansicht'
import { KaskoEndansicht } from '@/components/self-service/KaskoEndansicht'
import type { KaskoBindungsInfo } from '@/lib/kasko-wb/types'
import { fordereRueckrufAn, ladeKaskoBindungsInfoFuerFlow } from './self-service-actions'

export function FlowKaskoBindungGate({ token }: { token: string }) {
  const [info, setInfo] = useState<KaskoBindungsInfo | null>(null)
  const [fehler, setFehler] = useState(false)
  useEffect(() => {
    let alive = true
    ladeKaskoBindungsInfoFuerFlow(token).then((r) => {
      if (!alive) return
      if (r.ok) setInfo(r.info)
      else setFehler(true)
    })
    return () => {
      alive = false
    }
  }, [token])
  // Ladefehler -> generische Endseite statt endlosem Laden.
  if (fehler) return <KaskoEndansicht />
  if (!info) return <p className="text-body-sm text-claimondo-navy/60">Wird geladen …</p>
  return <KaskoBindungEndansicht info={info} onRueckruf={() => fordereRueckrufAn(token)} />
}
