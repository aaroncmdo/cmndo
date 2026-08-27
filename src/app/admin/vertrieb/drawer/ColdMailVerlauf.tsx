'use client'
// Cold-Mailer S3: Sende-Verlauf im Lead-Drawer. Zeigt, was rausging UND was daraus
// wurde (zugestellt/geoeffnet/geklickt/bounced) — der Status kommt vom Resend-Webhook.
import { useEffect, useState } from 'react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ladeColdMailVerlauf, type ColdMailVerlaufEintrag } from '../_actions/cold-mail-verlauf'

const LABEL_CLS = 'text-caption uppercase tracking-wide text-claimondo-ondo/60'

function datum(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ColdMailVerlauf({ leadId, reloadToken }: { leadId: string; reloadToken?: number }) {
  const [eintraege, setEintraege] = useState<ColdMailVerlaufEintrag[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ladeColdMailVerlauf(leadId).then((res) => {
      if (!alive) return
      if (!res.ok) setFehler(res.error)
      else setEintraege(res.data)
    })
    return () => {
      alive = false
    }
  }, [leadId, reloadToken])

  // Nichts gesendet -> die Sektion gar nicht zeigen (kein leerer Block im Drawer).
  if (fehler) return <p className="text-caption text-danger">{fehler}</p>
  if (!eintraege || eintraege.length === 0) return null

  return (
    <div>
      <p className={`${LABEL_CLS} mb-2`}>Cold-Mails ({eintraege.length})</p>
      <ul className="space-y-2">
        {eintraege.map((e) => (
          <li key={e.id} className="rounded-ios-md border border-claimondo-border bg-claimondo-bg/40 p-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-body-sm text-claimondo-navy">{e.betreff}</p>
              <StatusBadge domain="cold-mail" code={e.status} size="sm" />
            </div>
            <p className="mt-1 text-caption text-claimondo-ondo/60">
              {datum(e.gesendet_am)}
              {e.geoeffnet_am ? ` · geöffnet ${datum(e.geoeffnet_am)}` : ''}
              {e.geklickt_am ? ` · geklickt ${datum(e.geklickt_am)}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
