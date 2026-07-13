'use client'

import { useCallback, useEffect, useState } from 'react'
import { QrPoolClient, type PoolCode } from '@/app/admin/werkstaetten/qr-pool/QrPoolClient'
import { getQrPoolDaten } from '../_actions/qr-pool-daten'

type QrPoolDaten = {
  codes: PoolCode[]
  werkstaetten: { id: string; name: string }[]
}

export default function QrPoolDrawerContent() {
  const [daten, setDaten] = useState<QrPoolDaten | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const laden = useCallback(async () => {
    const res = await getQrPoolDaten()
    if (res.ok) {
      setDaten({ codes: res.codes, werkstaetten: res.werkstaetten })
      setFehler(null)
    } else {
      setFehler(res.error)
    }
  }, [])

  useEffect(() => {
    void laden()
  }, [laden])

  if (fehler) {
    return <p className="p-6 text-body-sm text-danger">{fehler}</p>
  }

  if (!daten) {
    return <p className="p-6 text-body-sm text-claimondo-ondo/60">QR-Pool wird geladen…</p>
  }

  return (
    <QrPoolClient
      codes={daten.codes}
      werkstaetten={daten.werkstaetten}
      onDataChange={laden}
    />
  )
}
