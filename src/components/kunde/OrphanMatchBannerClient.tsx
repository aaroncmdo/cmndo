'use client'

// Identitaets-Engine §12 Login-Tor — Slice B Self-Confirm Banner (Client-Teil).
//
// Dezenter, schliessbarer Hinweis. §13-A: KEIN PII-Detail vor Confirm — nur die generische
// Frage, ob ein gefundener frueherer Vorgang zum User gehoert. "Ja, das bin ich" ruft
// confirmOrphanMatchAction (Re-Point + Tombstone, Identitaets-Dedup) und danach router.refresh
// — der server-seitige Match filtert die getombstonte Person ab dann raus, der Banner ist weg.
//
// Buttons aus primitives.Button (variant 'success'/'ghost' = semantisch/brand-getoent ->
// kein Whitelabel-Regress); Tailwind claimondo-* Klassen branden automatisch.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { UserCheckIcon, CheckCircle2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { confirmOrphanMatchAction } from '@/app/kunde/actions'

export default function OrphanMatchBannerClient({ orphanPersonId }: { orphanPersonId: string }) {
  const router = useRouter()
  const t = useTranslations('orphanMatch')
  const [pending, setPending] = useState(false)
  const [erledigt, setErledigt] = useState(false)
  const [geschlossen, setGeschlossen] = useState(false)

  if (geschlossen) return null

  if (erledigt) {
    return (
      <div className="mx-4 md:mx-8 mt-4 rounded-ios-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
        <CheckCircle2Icon className="w-5 h-5 shrink-0 text-emerald-600" />
        <p className="text-sm font-medium text-emerald-900">
          {t('erledigt')}
        </p>
      </div>
    )
  }

  async function handleConfirm() {
    setPending(true)
    const res = await confirmOrphanMatchAction(orphanPersonId)
    setPending(false)
    if (!res.ok) {
      toast.error(res.error ?? t('fehler'))
      return
    }
    setErledigt(true)
    router.refresh()
  }

  return (
    <div className="mx-4 md:mx-8 mt-4 rounded-ios-xl bg-claimondo-ondo/[0.06] border border-claimondo-ondo/30 px-4 py-4">
      <div className="flex items-start gap-3">
        <UserCheckIcon className="w-5 h-5 shrink-0 text-claimondo-navy mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-claimondo-navy">
            {t('frage')}
          </p>
          <p className="text-xs text-claimondo-ondo mt-0.5">
            {t('text')}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button
          variant="success"
          size="sm"
          onClick={handleConfirm}
          loading={pending}
          disabled={pending}
        >
          {t('jaDasBinIch')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setGeschlossen(true)} disabled={pending}>
          {t('schliessen')}
        </Button>
      </div>
    </div>
  )
}
