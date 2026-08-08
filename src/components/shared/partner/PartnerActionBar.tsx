'use client'
// Config-getriebene Aktions-Leiste (Spec §6). CRM-Keys oeffnen das Modal (onCrmAction);
// operative Keys sind Deep-Links in den bestehenden Tab/Flow (keine Re-Implementierung).
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'
import { aktionenFuer, AKTION_LABEL, CRM_ACTIONS, type PartnerActionKey } from './partner-actions'
import type { PartnerTyp } from '@/lib/partner/aktivitaet-types'

// Deep-Link-Ziel je operativer Aktion + Partner-Typ. SV -> Verifizierungs-Tab (real).
// Werkstatt -> Werkstatt-Detail (Verifizieren/Sperren leben dort; kanonische Tab-/Anchor-
// Navigation = F2-Route-Konsolidierung, Folge-Schritt). Flotte -> Konto/Karten.
function deepLink(key: PartnerActionKey, partnerTyp: PartnerTyp, partnerId: string): string | null {
  if (key === 'verifizieren' || key === 'freischalten' || key === 'sperren') {
    if (partnerTyp === 'sv') return `/admin/vertrieb/sachverstaendige/${partnerId}?tab=verifizierung`
    if (partnerTyp === 'werkstatt') return `/admin/vertrieb/werkstaetten/${partnerId}`
  }
  if (key === 'deeplinks' && partnerTyp === 'flotte') return `/admin/vertrieb/firmen-flotte/${partnerId}`
  return null
}

export function PartnerActionBar({
  partnerTyp,
  partnerId,
  onCrmAction,
}: {
  partnerTyp: PartnerTyp
  partnerId: string
  onCrmAction: (typ: string) => void
}) {
  const router = useRouter()
  const keys = aktionenFuer(partnerTyp)
  const istCrm = (k: PartnerActionKey) => (CRM_ACTIONS as readonly string[]).includes(k)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {keys.map((k) => {
        if (istCrm(k)) {
          return (
            <Button key={k} variant={k === 'notiz' ? 'navy' : 'ghost'} size="sm" onClick={() => onCrmAction(k)}>
              {AKTION_LABEL[k]}
            </Button>
          )
        }
        const href = deepLink(k, partnerTyp, partnerId)
        if (!href) return null
        return (
          <Button key={k} variant="ghost" size="sm" onClick={() => router.push(href)}>
            {AKTION_LABEL[k]}
          </Button>
        )
      })}
    </div>
  )
}
