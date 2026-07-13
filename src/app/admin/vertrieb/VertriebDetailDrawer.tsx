'use client'
// Vertrieb-CRM P2: Detail-Drawer = CRM-Cockpit. Klick auf eine Roster-Zeile öffnet je nach
// Lifecycle: Lead -> LeadCockpit (Ansprechpartner, Stufe, Einstufung, Anruf-Log, Convert),
// Partner -> PartnerCockpit (Profil + Notiz + Deep-Link). Lead-Detail wird on-demand geladen.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Drawer } from '@/components/primitives'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { KIND_LABEL } from './_lib/labels'
import LeadCockpit from './drawer/LeadCockpit'
import PartnerCockpit from './drawer/PartnerCockpit'
import { getVertriebLeadDetail } from './_actions/get-vertrieb-lead-detail'
import type { VertriebKontakt } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebLeadDetail } from './_lib/lead-detail'

export default function VertriebDetailDrawer({
  kontakt,
  onClose,
}: {
  kontakt: VertriebKontakt | null
  onClose: () => void
}) {
  const router = useRouter()
  const istLead = kontakt?.kind === 'partner-lead'
  const [detail, setDetail] = useState<VertriebLeadDetail | null>(null)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [lade, setLade] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!kontakt || kontakt.kind !== 'partner-lead') {
      setDetail(null)
      return
    }
    let alive = true
    setLade(true)
    setLadeFehler(null)
    getVertriebLeadDetail(kontakt.id).then((res) => {
      if (!alive) return
      setLade(false)
      if (!res.ok) {
        setLadeFehler(res.error)
        setDetail(null)
      } else {
        setDetail(res.data)
      }
    })
    return () => {
      alive = false
    }
  }, [kontakt, reloadToken])

  function onChanged() {
    setReloadToken((t) => t + 1)
    router.refresh()
  }

  return (
    <Drawer open={!!kontakt} onClose={onClose} width={460} ariaLabel="Partner-Detail">
      {kontakt && (
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-caption text-claimondo-ondo/60">{KIND_LABEL[kontakt.kind]}</p>
            <h2 className="text-heading-md text-claimondo-navy">{kontakt.name ?? '—'}</h2>
            <StatusBadge domain="vertrieb-workflow" code={kontakt.stufe} size="sm" />
          </div>

          {istLead ? (
            lade ? (
              <p className="text-sm text-claimondo-ondo/60">Lädt…</p>
            ) : ladeFehler ? (
              <p className="text-sm text-danger">{ladeFehler}</p>
            ) : detail ? (
              <LeadCockpit kontakt={kontakt} detail={detail} onChanged={onChanged} />
            ) : null
          ) : (
            <PartnerCockpit kontakt={kontakt} onChanged={onChanged} />
          )}
        </div>
      )}
    </Drawer>
  )
}
