'use client'

import { useCallback, useEffect, useState } from 'react'
import MaklerAnlegenForm from '@/app/admin/makler/MaklerAnlegenForm'
import { getMaklerAnlegenOptionen } from '../_actions/makler-anlegen-optionen'

type Optionen = {
  versicherungen: { id: string; name: string }[]
  maklerpools: { id: string; name: string }[]
}

export default function MaklerAnlegenDrawerContent({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [optionen, setOptionen] = useState<Optionen | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const laden = useCallback(async () => {
    const res = await getMaklerAnlegenOptionen()
    if (res.ok) {
      setOptionen({ versicherungen: res.versicherungen, maklerpools: res.maklerpools })
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

  if (!optionen) {
    return <p className="p-6 text-body-sm text-claimondo-ondo/60">Optionen werden geladen…</p>
  }

  return (
    <MaklerAnlegenForm
      versicherungen={optionen.versicherungen}
      maklerpools={optionen.maklerpools}
      onClose={onClose}
      onCreated={onCreated}
    />
  )
}
