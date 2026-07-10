'use client'
// Vertrieb-CRM P3: Master-Vorlagen editieren (DB-driven, ohne Deploy). Speichert via
// updateMailVorlage in vertrieb_mail_vorlagen.
import { useState } from 'react'
import { Button } from '@/components/primitives'
import { updateMailVorlage } from '../_actions/mail-vorlagen'
import type { MailVorlage, VorlageTyp } from '../_lib/mail-vorlagen'

const TITEL: Record<VorlageTyp, string> = {
  vorstellung: 'Vorstellungs-Mail',
  terminbestaetigung: 'Terminbestätigung',
}
const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

function VorlageForm({ vorlage }: { vorlage: MailVorlage }) {
  const [betreff, setBetreff] = useState(vorlage.betreff)
  const [body, setBody] = useState(vorlage.body)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const dirty = betreff !== vorlage.betreff || body !== vorlage.body

  async function speichern() {
    setBusy(true)
    setStatus(null)
    const res = await updateMailVorlage(vorlage.typ, { betreff, body })
    setBusy(false)
    setStatus(res.ok ? 'Gespeichert.' : res.error ?? 'Konnte nicht gespeichert werden.')
  }

  return (
    <div className="rounded-ios-md border border-claimondo-border bg-white p-4 space-y-2">
      <h3 className="text-sm font-medium text-claimondo-navy">{TITEL[vorlage.typ]}</h3>
      <input
        value={betreff}
        onChange={(e) => setBetreff(e.target.value)}
        aria-label="Betreff"
        className={`${FELD_CLS} w-full`}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        aria-label="Text"
        className={`${FELD_CLS} w-full resize-y`}
      />
      <div className="flex items-center gap-2">
        <Button variant="navy" size="sm" loading={busy} disabled={!dirty || busy} onClick={speichern}>
          Speichern
        </Button>
        {status && <span className="text-caption text-claimondo-ondo/60">{status}</span>}
      </div>
    </div>
  )
}

export default function MailVorlagenClient({ vorlagen }: { vorlagen: MailVorlage[] }) {
  const sorted = [...vorlagen].sort((a, b) => a.typ.localeCompare(b.typ))
  return (
    <div className="space-y-4">
      {sorted.map((v) => (
        <VorlageForm key={v.typ} vorlage={v} />
      ))}
    </div>
  )
}
