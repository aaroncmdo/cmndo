'use client'
// Cold-Mailer S0: manueller Cold-Mail-Composer im Lead-Drawer. Bewusst neben dem
// MailComposer (Vorlagen/transaktional, Klartext via sendEmail) statt darin: Cold-Mail
// laeuft ueber eine eigene Sende-Subdomain, mit Suppression-Gate + Pflicht-Abmeldelink.
// Platzhalter-Syntax ist identisch ({{Feld}}) — bewusst, damit im selben Drawer nicht
// zwei Schreibweisen nebeneinander stehen.
import { useState } from 'react'
import { Button } from '@/components/primitives'
import { textToHtml } from '@/lib/cold-mail/text-to-html'
import { sendeColdMailAnLead } from '../_actions/cold-mail-send'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

export default function ColdMailComposer({
  leadId,
  empfaenger,
  onClose,
  onSent,
}: {
  leadId: string
  empfaenger: string | null
  onClose: () => void
  onSent: () => void
}) {
  const [betreff, setBetreff] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function senden() {
    if (!empfaenger) {
      setFehler('Kein Empfänger hinterlegt.')
      return
    }
    setBusy(true)
    setFehler(null)
    const res = await sendeColdMailAnLead(leadId, { betreff, bodyHtml: textToHtml(body) })
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error ?? 'Versand fehlgeschlagen.')
      return
    }
    onSent()
    onClose()
  }

  return (
    <div className="rounded-ios-md border border-claimondo-border bg-white p-3 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-claimondo-navy">Cold-Mail</p>
        <Button variant="ghost" size="sm" onClick={onClose} ariaLabel="Schließen">
          ✕
        </Button>
      </div>
      <div className="text-caption text-claimondo-ondo/70">
        An: {empfaenger ?? '— (kein Kontakt hinterlegt)'} · über die Partner-Sendedomain
      </div>
      <input
        value={betreff}
        onChange={(e) => setBetreff(e.target.value)}
        aria-label="Betreff"
        placeholder="Betreff"
        className={`${FELD_CLS} w-full`}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        aria-label="Nachricht"
        placeholder="Guten Tag {{Ansprechpartner}}, …"
        className={`${FELD_CLS} w-full resize-y`}
      />
      <p className="text-caption text-claimondo-ondo/50">
        Platzhalter: {'{{Ansprechpartner}}'} · {'{{Firma}}'} · {'{{Ort}}'} · {'{{Vorname}}'} — Abmeldelink wird
        automatisch angehängt.
      </p>
      {fehler && <p className="text-sm text-danger">{fehler}</p>}
      <Button variant="navy" size="sm" loading={busy} onClick={senden}>
        Cold-Mail senden
      </Button>
    </div>
  )
}
