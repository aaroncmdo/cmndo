'use client'

// AAR-956 §4 / Part 2: ZB1-Foto-Upload im FlowLink. Drei Wege:
//   1. Foto hochladen → uploadZb1Flow (OCR, H6 = nur leere Felder füllen)
//   2. ausgelesene Werte manuell prüfen/korrigieren → speichereZb1KorrekturFlow (überschreibt bewusst)
//   3. überspringen
// „nur Lücken": liegen die Fahrzeugdaten schon vor (bereitsErfasst), ist der Upload nur
// optional (ergänzt Fehlendes). Reuse runZB1Ocr serverseitig — keine neue OCR-Quelle.
// Flow-eigen, weil das geteilte Zb1UploadField an dokument_upload_anfragen-Token + fallId hängt.

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { uploadZb1Flow, speichereZb1KorrekturFlow } from './self-service-actions'
import { enqueueOp } from '@/lib/offline/enqueue'
import { Button } from '@/components/primitives/Button/Button.web'

export type Zb1FlowExtracted = {
  kennzeichen: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  halter_name: string | null
  // AAR-956 15.06.: strukturierte Halter-Felder fürs Vorausfüllen des Halter-
  // Steps + ist_fahrzeughalter Name-Match (Spiegel der uploadZb1Flow-Shape).
  halter_vorname: string | null
  halter_nachname: string | null
  halter_strasse: string | null
  halter_plz: string | null
  halter_stadt: string | null
}

export function FlowZb1Upload({
  token,
  bereitsErfasst,
  onExtracted,
  onSkip,
}: {
  token: string
  bereitsErfasst?: boolean
  // AAR-956 15.06.: OCR-Ergebnis in den Eltern-Stepper hochreichen (Halter/Fahrzeug
  // in die Formular-values mergen) — statt der bisherigen Nur-Anzeige.
  onExtracted?: (ex: Zb1FlowExtracted) => void
  // AAR-956 17.07. (Smoke-Befund 1, werkstatt-embed-E2E): „überspringen" heißt
  // „ohne Foto weiter zur nächsten Frage" — NICHT „Box einklappen". Ohne onSkip
  // kollabierte die Box zu null und ließ einen leeren Schritt zurück, auf dem
  // manuell_toggle und der Skip-ALL-Link („vorerst überspringen") zum Verwechseln
  // beieinander lagen → Kunde beendete versehentlich die GANZE Feststellung bei
  // 7/10 (Kennzeichen/Halter/Vorschäden nie gestellt). Der Parent reicht hier
  // sein „Weiter" rein; der null-Kollaps bleibt nur als Fallback ohne Prop.
  onSkip?: () => void
}) {
  const t = useTranslations('selfService')
  const [status, setStatus] = useState<
    'idle' | 'laden' | 'fertig' | 'bestaetigt' | 'fehler' | 'skip' | 'gespeichert'
  >('idle')
  const [extracted, setExtracted] = useState<Zb1FlowExtracted | null>(null)
  const [edit, setEdit] = useState({ kennzeichen: '', fahrzeug_hersteller: '', fahrzeug_modell: '' })
  const [fehler, setFehler] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStatus('laden')
    setFehler(null)
    const base64 = await fileToBase64(file)
    if (!base64) {
      setStatus('fehler')
      setFehler(t('zb1.fehler_lesen'))
      return
    }
    // Slice 2-write-2: offline -> Foto in die Outbox (class B). KEIN Live-OCR offline —
    // der Replay ruft uploadZb1Flow (Server-OCR + H6-Fill der leeren Lead-Felder). Nur
    // die synchrone Prefill-UX degradiert; das ZB1-Foto ist erfasst.
    if (!navigator.onLine) {
      void enqueueOp({ kind: 'flow_zb1_upload', replay_class: 'B', payload: { token, base64, contentType: file.type || 'image/jpeg' } }).catch(() => {})
      setStatus('gespeichert')
      return
    }
    const r = await uploadZb1Flow(token, base64, file.type || 'image/jpeg')
    if (!r.ok) {
      setStatus('fehler')
      setFehler(r.error ?? t('zb1.fehler_auslesen'))
      return
    }
    const ex: Zb1FlowExtracted = r.extracted ?? {
      kennzeichen: null,
      fahrzeug_hersteller: null,
      fahrzeug_modell: null,
      halter_name: null,
      halter_vorname: null,
      halter_nachname: null,
      halter_strasse: null,
      halter_plz: null,
      halter_stadt: null,
    }
    setExtracted(ex)
    setEdit({
      kennzeichen: ex.kennzeichen ?? '',
      fahrzeug_hersteller: ex.fahrzeug_hersteller ?? '',
      fahrzeug_modell: ex.fahrzeug_modell ?? '',
    })
    // AAR-956: OCR-Werte in den Stepper mergen (Halter/Kennzeichen vorausfüllen).
    onExtracted?.(ex)
    setStatus('fertig')
  }

  async function handleUebernehmen() {
    setSaving(true)
    setFehler(null)
    const r = await speichereZb1KorrekturFlow(token, edit)
    setSaving(false)
    if (!r.ok) {
      setFehler(r.error ?? t('zb1.fehler_speichern'))
      return
    }
    setStatus('bestaetigt')
  }

  function neuFotografieren() {
    setExtracted(null)
    setFehler(null)
    setStatus('idle')
    inputRef.current?.click()
  }

  if (status === 'skip') return null

  return (
    <div
      className="rounded-ios-md border border-claimondo-ondo/20 bg-claimondo-ondo/[0.04] p-4 mb-5"
      data-testid="flow-zb1-upload"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />
      <p className="text-sm font-semibold text-claimondo-navy mb-1">{t('zb1.titel')}</p>
      <p className="text-xs text-claimondo-ondo mb-3">
        {bereitsErfasst ? t('zb1.hinweis_bereits') : t('zb1.hinweis_neu')}
      </p>

      {status === 'bestaetigt' ? (
        <div
          className="rounded-ios-sm bg-success-soft border border-success/30 p-3 text-sm text-success-strong"
          data-testid="flow-zb1-bestaetigt"
        >
          <p className="font-medium">{t('zb1.uebernommen')} ✓</p>
        </div>
      ) : status === 'gespeichert' ? (
        <div
          className="rounded-ios-sm bg-success-soft border border-success/30 p-3 text-sm text-success-strong"
          data-testid="flow-zb1-gespeichert"
        >
          <p className="font-medium">Foto gespeichert ✓</p>
          <p className="text-xs mt-1">Es wird automatisch ausgelesen, sobald Sie wieder online bist.</p>
        </div>
      ) : status === 'fertig' && extracted ? (
        <div
          className="rounded-ios-sm bg-success-soft/60 border border-success/30 p-3"
          data-testid="flow-zb1-fertig"
        >
          <p className="text-sm font-medium text-success-strong mb-2">{t('zb1.pruefen')}</p>
          <div className="flex flex-col gap-2">
            <KorrField label={t('zb1.feld_kennzeichen')} value={edit.kennzeichen} onChange={(v) => setEdit({ ...edit, kennzeichen: v })} />
            <KorrField label={t('zb1.feld_hersteller')} value={edit.fahrzeug_hersteller} onChange={(v) => setEdit({ ...edit, fahrzeug_hersteller: v })} />
            <KorrField label={t('zb1.feld_modell')} value={edit.fahrzeug_modell} onChange={(v) => setEdit({ ...edit, fahrzeug_modell: v })} />
            {extracted.halter_name && (
              <p className="text-xs text-claimondo-ondo">{t('zb1.halter', { name: extracted.halter_name })}</p>
            )}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Button variant="ondo" size="sm" loading={saving} onClick={handleUebernehmen}>
              {t('zb1.uebernehmen')}
            </Button>
            <button type="button" onClick={neuFotografieren} className="text-sm text-claimondo-ondo underline">
              {t('zb1.neu_foto')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            variant="ondo"
            size="sm"
            loading={status === 'laden'}
            onClick={() => inputRef.current?.click()}
          >
            {status === 'laden' ? t('zb1.wird_ausgelesen') : t('zb1.aufnehmen')}
          </Button>
          <button
            type="button"
            onClick={() => (onSkip ? onSkip() : setStatus('skip'))}
            className="text-sm text-claimondo-ondo/80 underline"
            data-testid="flow-zb1-skip"
          >
            {t('zb1.ueberspringen')}
          </button>
        </div>
      )}
      {fehler && <p className="mt-2 text-sm text-danger-strong">{fehler}</p>}
    </div>
  )
}

function KorrField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-claimondo-ondo">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-ios-sm border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy"
      />
    </label>
  )
}

async function fileToBase64(file: File): Promise<string | null> {
  try {
    const reader = new FileReader()
    return await new Promise((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string
        const idx = result.indexOf(',')
        resolve(idx >= 0 ? result.slice(idx + 1) : result)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  } catch {
    return null
  }
}
