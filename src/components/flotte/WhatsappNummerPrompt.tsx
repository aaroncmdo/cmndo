'use client'

// T2 (operativer-schaden-flow): FM-Self-Service fuer die eigene WhatsApp-Kontaktnummer.
// Ist keine hinterlegt -> Erst-Login-Prompt (erklaert, warum). Ist eine da -> kompakte
// Anzeige mit "Aendern". Server-Action normalisiert (E.164) + validiert.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircleIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

type Props = {
  nummer: string | null
  onSpeichern: (raw: string) => Promise<{ ok: boolean; error?: string }>
}

export function WhatsappNummerPrompt({ nummer, onSpeichern }: Props) {
  const router = useRouter()
  const [editieren, setEditieren] = useState(nummer === null)
  const [wert, setWert] = useState(nummer ?? '')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function speichern() {
    setBusy(true)
    setFehler(null)
    const res = await onSpeichern(wert)
    setBusy(false)
    if (!res.ok) return setFehler(res.error ?? 'Speichern fehlgeschlagen.')
    setEditieren(false)
    router.refresh()
  }

  // Bereits hinterlegt und nicht im Bearbeiten-Modus -> kompakte Anzeige.
  if (nummer && !editieren) {
    return (
      <SectionCard title="WhatsApp-Benachrichtigung">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body-sm text-claimondo-ondo">
            Schaden-Benachrichtigungen gehen an{' '}
            <span className="font-medium text-claimondo-navy">{nummer}</span>.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setWert(nummer)
              setEditieren(true)
            }}
          >
            Ändern
          </Button>
        </div>
      </SectionCard>
    )
  }

  // Noch nicht hinterlegt (Erst-Login-Prompt) ODER im Bearbeiten-Modus.
  return (
    <SectionCard title="WhatsApp-Benachrichtigung einrichten">
      <div className="space-y-3">
        <p className="text-body-sm text-claimondo-ondo">
          Damit wir Sie bei einem gemeldeten Schaden <strong>sofort per WhatsApp</strong> erreichen,
          hinterlegen Sie hier Ihre WhatsApp-Nummer. Ohne Nummer erhalten Sie keine
          Sofort-Benachrichtigung.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <label className="text-caption text-claimondo-ondo/60">WhatsApp-Nummer</label>
            <input
              value={wert}
              onChange={(e) => setWert(e.target.value)}
              placeholder="z. B. +49 163 3628571"
              inputMode="tel"
              autoComplete="tel"
              className={`${FELD_CLS} mt-0.5 w-full`}
            />
          </div>
          <Button
            variant="navy"
            size="sm"
            iconLeft={<MessageCircleIcon className="h-4 w-4" />}
            loading={busy}
            disabled={busy || wert.trim() === (nummer ?? '')}
            onClick={speichern}
          >
            Speichern
          </Button>
          {nummer !== null && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setWert(nummer)
                setEditieren(false)
                setFehler(null)
              }}
            >
              Abbrechen
            </Button>
          )}
        </div>
        {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
      </div>
    </SectionCard>
  )
}
