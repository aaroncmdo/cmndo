'use client'
// Vertrieb-CRM P2: Profil + Notiz fuer einen aktiven Partner (SV/Makler/Werkstatt).
// Notiz ueber die bestehende updateVertriebFeld-Action (Whitelist pro kind). Login-Mail
// (Makler+Werkstatt) + QR-Codes folgen in P5.
import { useState } from 'react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { updateVertriebFeld } from '../_actions/update-vertrieb-feld'
import { ROLLE_LABEL } from '../_lib/labels'
import type { VertriebKontakt } from '@/lib/vertrieb/vertrieb-kontakt.types'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'
const LABEL_CLS = 'text-caption uppercase tracking-wide text-claimondo-ondo/60'

export default function PartnerCockpit({
  kontakt,
  onChanged,
}: {
  kontakt: VertriebKontakt
  onChanged: () => void
}) {
  const [notiz, setNotiz] = useState(kontakt.notizen ?? '')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function speichereNotiz() {
    if (notiz === (kontakt.notizen ?? '')) return
    setBusy(true)
    setFehler(null)
    const res = await updateVertriebFeld(kontakt.kind, kontakt.id, 'notizen', notiz.trim() || null)
    setBusy(false)
    if (!res.ok) setFehler(res.error ?? 'Konnte nicht gespeichert werden.')
    else onChanged()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <StatusBadge domain="vertrieb-workflow" code={kontakt.stufe} size="sm" />
        <span className="text-caption text-claimondo-ondo/70">{ROLLE_LABEL[kontakt.rolle]} · Partner</span>
      </div>

      <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg/40 p-3 text-sm text-claimondo-navy space-y-1">
        <p>
          <span className="text-claimondo-ondo/60">Ort:</span>{' '}
          {kontakt.plz ? `${kontakt.plz} ${kontakt.ort ?? ''}`.trim() : kontakt.ort ?? '—'}
        </p>
        <p>
          <span className="text-claimondo-ondo/60">Kontakt:</span> {kontakt.email ?? kontakt.telefon ?? '—'}
        </p>
      </div>

      <div>
        <p className={`${LABEL_CLS} mb-1`}>Notiz</p>
        <textarea
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          onBlur={speichereNotiz}
          disabled={busy}
          rows={3}
          placeholder="Interne Notiz…"
          className={`${FELD_CLS} w-full resize-y`}
        />
        {fehler && <p className="text-sm text-danger">{fehler}</p>}
      </div>
    </div>
  )
}
