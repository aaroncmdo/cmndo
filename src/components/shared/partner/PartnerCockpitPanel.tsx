'use client'

import { useCallback, useEffect, useState } from 'react'
import { getPartnerAktivitaeten } from '@/app/admin/vertrieb/_actions/partner-aktivitaet-actions'
import type { PartnerAktivitaetRow, PartnerTyp } from '@/lib/partner/aktivitaet-types'
import { PartnerActionBar } from './PartnerActionBar'
import { PartnerAktivitaetModal } from './PartnerAktivitaetModal'
import { PartnerAktivitaetsFeed } from './PartnerAktivitaetsFeed'

export function PartnerCockpitPanel({
  partnerTyp,
  partnerId,
  compact = false,
}: {
  partnerTyp: PartnerTyp
  partnerId: string
  compact?: boolean
}) {
  const [rows, setRows] = useState<PartnerAktivitaetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalTyp, setModalTyp] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const res = await getPartnerAktivitaeten(partnerTyp, partnerId)
    if (res.ok) setRows(res.data)
    setLoading(false)
  }, [partnerTyp, partnerId])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <div className="space-y-3">
      <PartnerActionBar partnerTyp={partnerTyp} partnerId={partnerId} onCrmAction={setModalTyp} />
      <PartnerAktivitaetsFeed rows={rows} loading={loading} compact={compact} />
      {modalTyp && (
        <PartnerAktivitaetModal
          partnerTyp={partnerTyp}
          partnerId={partnerId}
          presetTyp={modalTyp}
          onClose={() => setModalTyp(null)}
          onLogged={() => {
            setModalTyp(null)
            void reload()
          }}
        />
      )}
    </div>
  )
}
