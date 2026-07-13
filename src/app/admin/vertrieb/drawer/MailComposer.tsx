'use client'
// Vertrieb-CRM P3: Composer — laedt die aktive DB-Vorlage, merged Ansprechpartner/Firma/Termin,
// laesst Betreff + Text VOR dem Senden editieren, sendet via sendeVertriebMail. Vollstaendig
// DB-driven (Vorlagen-Master aus vertrieb_mail_vorlagen).
import { useEffect, useState } from 'react'
import { Button } from '@/components/primitives'
import { getVertriebMailVorlagen } from '../_actions/mail-vorlagen'
import { sendeVertriebMail } from '../_actions/sende-vertrieb-mail'
import { renderVorlage, type VorlageTyp, type MailVorlage } from '../_lib/mail-vorlagen'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'
const TAB_LABEL: Record<VorlageTyp, string> = {
  vorstellung: 'Vorstellungs-Mail',
  terminbestaetigung: 'Terminbestätigung',
}

export default function MailComposer({
  leadId,
  empfaenger,
  merge,
  startTyp,
  onClose,
  onSent,
}: {
  leadId: string
  empfaenger: string | null
  merge: Record<string, string>
  startTyp: VorlageTyp
  onClose: () => void
  onSent: () => void
}) {
  const [vorlagen, setVorlagen] = useState<MailVorlage[] | null>(null)
  const [typ, setTyp] = useState<VorlageTyp>(startTyp)
  const [betreff, setBetreff] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getVertriebMailVorlagen().then((res) => {
      if (!alive) return
      if (!res.ok) setLadeFehler(res.error)
      else setVorlagen(res.data)
    })
    return () => {
      alive = false
    }
  }, [])

  // Bei geladener Vorlage / Tab-Wechsel Betreff+Body neu aus der Vorlage rendern.
  useEffect(() => {
    if (!vorlagen) return
    const v = vorlagen.find((x) => x.typ === typ)
    if (!v) return
    setBetreff(renderVorlage(v.betreff, merge))
    setBody(renderVorlage(v.body, merge))
    // merge bewusst nicht in deps: nur bei Vorlagen-Load / Tab-Wechsel neu befuellen,
    // damit manuelle Edits nicht ueberschrieben werden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vorlagen, typ])

  async function senden() {
    if (!empfaenger) {
      setFehler('Kein Ansprechpartner-/Lead-Kontakt hinterlegt.')
      return
    }
    setBusy(true)
    setFehler(null)
    const res = await sendeVertriebMail({ leadId, to: empfaenger, betreff, body })
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
        <div className="flex flex-wrap gap-1">
          {(['vorstellung', 'terminbestaetigung'] as VorlageTyp[]).map((t) => (
            <Button key={t} variant={typ === t ? 'navy' : 'ghost'} size="sm" onClick={() => setTyp(t)}>
              {TAB_LABEL[t]}
            </Button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} ariaLabel="Schließen">
          ✕
        </Button>
      </div>
      {ladeFehler && <p className="text-sm text-danger">{ladeFehler}</p>}
      <div className="text-caption text-claimondo-ondo/70">An: {empfaenger ?? '— (kein Kontakt hinterlegt)'}</div>
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
        placeholder="Nachricht"
        className={`${FELD_CLS} w-full resize-y`}
      />
      {fehler && <p className="text-sm text-danger">{fehler}</p>}
      <div className="flex items-center gap-2">
        <Button variant="navy" size="sm" loading={busy} onClick={senden}>
          Senden
        </Button>
        <span className="text-caption text-claimondo-ondo/50">Betreff &amp; Text vor dem Senden editierbar.</span>
      </div>
    </div>
  )
}
