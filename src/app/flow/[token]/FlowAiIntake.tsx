'use client'

// KI-gefuehrtes Intake: dialoggefuehrte Feststellungs-Erfassung. Erbt das
// /flow-Brand-Theme (Wrapper der Seite). Bei Fehler -> onFallback (klassischer Wizard).
import { useRef, useState } from 'react'
import { CameraIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { uploadUnfallfotoFlow } from './self-service-actions'
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

type Turn = { role: 'user' | 'assistant'; content: string }

/** Handyfotos sind gross; base64 blaeht ~33% auf (serverActions-Limit 20mb). */
const MAX_FOTO_BYTES = 8 * 1024 * 1024

/** File -> reines base64 (ohne data:-Praefix), wie uploadZb1Flow es erwartet. */
function fileToBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = typeof reader.result === 'string' ? reader.result : ''
      const komma = r.indexOf(',')
      resolve(komma >= 0 ? r.slice(komma + 1) : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

export default function FlowAiIntake({
  token,
  schema,
  onFertig,
  onFallback,
}: {
  token: string
  schema: IntakeFeld[]
  onFertig: () => void
  onFallback: () => void
}) {
  const [verlauf, setVerlauf] = useState<Turn[]>([
    {
      role: 'assistant',
      content: 'Hallo! Ich helfe Ihnen, Ihren Unfall kurz zu schildern. Was ist passiert?',
    },
  ])
  const [eingabe, setEingabe] = useState('')
  const [busy, setBusy] = useState(false)
  const fotoInput = useRef<HTMLInputElement>(null)

  // Foto-Vision: das Bild geht an appendUnfallfotoAndAnalyze (Bestand) — es haengt an
  // leads.schadensfoto_urls, beschreibt die sichtbaren Schaeden und setzt schaden_sichtbar.
  // Ein Fehlschlag beendet den Dialog NICHT (anders als beim Text-Turn): der Kunde kann
  // weiter erzaehlen, das Foto ist Zusatz, keine Voraussetzung.
  async function fotoWaehlen(file: File | undefined) {
    if (!file || busy) return
    if (file.size > MAX_FOTO_BYTES) {
      setVerlauf((v) => [
        ...v,
        { role: 'assistant', content: 'Das Foto ist leider zu groß (max. 8 MB). Bitte ein kleineres senden.' },
      ])
      return
    }
    setBusy(true)
    setVerlauf((v) => [...v, { role: 'user', content: '📷 Foto gesendet' }])
    try {
      const base64 = await fileToBase64(file)
      if (!base64) {
        setVerlauf((v) => [...v, { role: 'assistant', content: 'Das Foto konnte nicht gelesen werden. Bitte erneut versuchen.' }])
        return
      }
      const res = await uploadUnfallfotoFlow(token, base64, file.type || 'image/jpeg')
      setVerlauf((v) => [
        ...v,
        {
          role: 'assistant',
          content: !res.ok
            ? (res.error ?? 'Das Foto konnte nicht gespeichert werden — erzähl einfach weiter.')
            : res.beschreibung
              ? `Danke! Auf dem Foto erkenne ich: ${res.beschreibung}`
              : 'Danke, das Foto ist gespeichert.',
        },
      ])
    } finally {
      setBusy(false)
      if (fotoInput.current) fotoInput.current.value = ''
    }
  }

  async function senden(text: string) {
    const nachricht = text.trim()
    if (!nachricht || busy) return
    setBusy(true)
    const historie = verlauf
    setVerlauf((v) => [...v, { role: 'user', content: nachricht }])
    setEingabe('')
    try {
      const res = await fetch(`/api/flow/${token}/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nachricht, historie }),
      })
      const json = await res.json()
      if (!json.ok) {
        onFallback()
        return
      }
      setVerlauf((v) => [...v, { role: 'assistant', content: json.naechste_frage }])
      if (json.fertig) onFertig()
    } catch {
      onFallback()
    } finally {
      setBusy(false)
    }
  }

  // Chips: Optionen des ersten offenen Feldes mit Auswahlmoeglichkeiten.
  const chipFeld = schema.find((f) => f.optionen && f.optionen.length > 0)

  return (
    <SectionCard title="Schaden schildern">
      <div className="space-y-3">
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {verlauf.map((t, i) => (
            <div key={i} className={t.role === 'user' ? 'text-right' : 'text-left'}>
              <span
                className={`inline-block rounded-ios-lg px-3 py-2 text-sm ${
                  t.role === 'user'
                    ? 'bg-claimondo-navy text-white'
                    : 'bg-claimondo-bg text-claimondo-navy'
                }`}
              >
                {t.content}
              </span>
            </div>
          ))}
        </div>

        {chipFeld?.optionen && (
          <div className="flex flex-wrap gap-2">
            {chipFeld.optionen.map((o) => (
              <Button
                key={o.wert}
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void senden(o.label)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void senden(eingabe)
          }}
          className="flex gap-2"
        >
          <input
            className="flex-1 rounded-ios-lg border border-claimondo-border px-3 py-2 text-sm"
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            placeholder="Ihre Antwort…"
            disabled={busy}
          />
          {/* Foto-Vision: versteckter File-Input + sichtbarer Kamera-Button (capture=
              Handy oeffnet direkt die Kamera). */}
          <input
            ref={fotoInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void fotoWaehlen(e.target.files?.[0])}
          />
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => fotoInput.current?.click()}
            iconLeft={<CameraIcon style={{ width: 16, height: 16 }} />}
            aria-label="Foto vom Schaden anhängen"
          >
            Foto
          </Button>
          <Button variant="navy" loading={busy} onClick={() => void senden(eingabe)}>
            Senden
          </Button>
        </form>

        <button
          type="button"
          onClick={onFallback}
          className="text-xs text-claimondo-ondo underline underline-offset-2"
        >
          Lieber klassisch ausfüllen
        </button>
      </div>
    </SectionCard>
  )
}
