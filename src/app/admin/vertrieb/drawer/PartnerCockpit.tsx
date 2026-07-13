'use client'
// Vertrieb-CRM P2: vollstaendige Partner-Detailflaeche (SV/Makler/Werkstatt) — Naechster-
// Schritt-Hinweis, Felder, editierbare Notiz (updateVertriebFeld, Whitelist pro kind), Deep-
// Link in die tiefe Akte. Login-Mail (Makler+Werkstatt) + QR-Codes folgen in P5.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Button } from '@/components/primitives'
import { STUFE_HINT } from '../_lib/labels'
import { detailLink } from '../_lib/detail-link'
import { updateVertriebFeld } from '../_actions/update-vertrieb-feld'
import { resendWerkstattWelcome } from '../_actions/resend-werkstatt-welcome'
import { resendMaklerWelcome } from '@/app/admin/makler/actions'
import type { VertriebKontakt } from '@/lib/vertrieb/vertrieb-kontakt.types'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

function Feld({ label, wert }: { label: string; wert: string | null }) {
  return (
    <div>
      <p className="text-caption text-claimondo-ondo/60">{label}</p>
      <p className="text-sm text-claimondo-navy break-words">{wert && wert.trim() ? wert : '—'}</p>
    </div>
  )
}

export default function PartnerCockpit({
  kontakt,
  onChanged,
}: {
  kontakt: VertriebKontakt
  onChanged: () => void
}) {
  const router = useRouter()
  const [notiz, setNotiz] = useState(kontakt.notizen ?? '')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const dirty = notiz !== (kontakt.notizen ?? '')
  const link = detailLink(kontakt.kind, kontakt.id)
  const [mailBusy, setMailBusy] = useState(false)
  const [mailStatus, setMailStatus] = useState<string | null>(null)

  async function sendeLoginMail() {
    setMailBusy(true)
    setMailStatus(null)
    const res =
      kontakt.rolle === 'makler'
        ? await resendMaklerWelcome(kontakt.id)
        : await resendWerkstattWelcome(kontakt.id)
    setMailBusy(false)
    setMailStatus(res.ok ? 'Login-Mail gesendet.' : res.error ?? 'Konnte nicht gesendet werden.')
  }

  async function speichern() {
    setBusy(true)
    setFehler(null)
    const res = await updateVertriebFeld(kontakt.kind, kontakt.id, 'notizen', notiz.trim() || null)
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error)
      return
    }
    onChanged()
  }

  return (
    <div className="space-y-5">
      <Card p={4} radius="lg">
        <p className="text-caption text-claimondo-ondo/60 mb-1">Nächster Schritt</p>
        <p className="text-sm text-claimondo-navy">{STUFE_HINT[kontakt.stufe]}</p>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Feld label="E-Mail" wert={kontakt.email} />
        <Feld label="Telefon" wert={kontakt.telefon} />
        <Feld label="PLZ" wert={kontakt.plz} />
        <Feld label="Ort" wert={kontakt.ort} />
        <Feld label="Quelle" wert={kontakt.quelle} />
        <Feld
          label="Angelegt"
          wert={kontakt.erstellt_am ? new Date(kontakt.erstellt_am).toLocaleDateString('de-DE') : null}
        />
      </div>

      {(kontakt.rolle === 'makler' || kontakt.rolle === 'werkstatt') && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" loading={mailBusy} onClick={sendeLoginMail}>
            ✉️ Login-Mail neu senden
          </Button>
          {kontakt.rolle === 'werkstatt' && (
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/vertrieb/werkstaetten/qr-pool')}>
              🔳 QR-Codes
            </Button>
          )}
          {mailStatus && <span className="text-caption text-claimondo-ondo/60">{mailStatus}</span>}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-caption text-claimondo-ondo/60">Notizen (intern)</p>
        <textarea
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          rows={3}
          placeholder="Interne Notiz zu diesem Partner…"
          className={`${FELD_CLS} w-full resize-y`}
        />
        {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
        <Button variant="navy" size="sm" onClick={speichern} loading={busy} disabled={!dirty || busy}>
          Speichern
        </Button>
      </div>

      <Button variant="navy" fullWidth onClick={() => router.push(link.href)}>
        {link.label}
      </Button>
    </div>
  )
}
