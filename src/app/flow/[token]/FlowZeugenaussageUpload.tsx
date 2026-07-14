'use client'

// AAR-956 16.06. (Aaron): Zeugenaussage-Upload im FlowLink — erscheint inline im
// "Polizei & Zeugen"-Schritt, wenn der Kunde Zeugen = Ja angab. Foto ODER PDF, KEIN OCR,
// überspringbar. Spiegelt FlowPolizeiberichtUpload; Titel/Hinweis kommen als Props (der
// Parent hat die flow-i18n), die generischen Button-Labels werden aus selfService.
// polizeibericht.* wiederverwendet (rein generische Texte: Hochladen/Überspringen/…).

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { uploadZeugenaussageFlow } from './self-service-actions'
import { enqueueOp } from '@/lib/offline/enqueue'
import { Button } from '@/components/primitives/Button/Button.web'

export function FlowZeugenaussageUpload({
  token,
  titel,
  hinweis,
  bereitsHochgeladen,
}: {
  token: string
  titel: string
  hinweis: string
  bereitsHochgeladen?: boolean
}) {
  const t = useTranslations('selfService')
  const [status, setStatus] = useState<'idle' | 'laden' | 'bestaetigt' | 'fehler' | 'skip'>(
    bereitsHochgeladen ? 'bestaetigt' : 'idle',
  )
  const [fehler, setFehler] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStatus('laden')
    setFehler(null)
    const base64 = await fileToBase64(file)
    if (!base64) {
      setStatus('fehler')
      setFehler(t('polizeibericht.fehler_lesen'))
      return
    }
    // Slice 2-write-2: offline -> Outbox (class B), optimistisch bestätigt.
    if (!navigator.onLine) {
      void enqueueOp({ kind: 'flow_zeugenaussage_upload', replay_class: 'B', payload: { token, base64, contentType: file.type || 'image/jpeg' } }).catch(() => {})
      setStatus('bestaetigt')
      return
    }
    const r = await uploadZeugenaussageFlow(token, base64, file.type || 'image/jpeg')
    if (!r.ok) {
      setStatus('fehler')
      setFehler(r.error ?? t('polizeibericht.fehler_upload'))
      return
    }
    setStatus('bestaetigt')
  }

  if (status === 'skip') return null

  return (
    <div
      className="rounded-ios-md border border-claimondo-ondo/20 bg-claimondo-ondo/[0.04] p-4"
      data-testid="flow-zeugenaussage-upload"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />
      <p className="text-sm font-semibold text-claimondo-navy mb-1">{titel}</p>
      <p className="text-xs text-claimondo-ondo mb-3">{hinweis}</p>

      {status === 'bestaetigt' ? (
        <div
          className="rounded-ios-sm bg-success-soft border border-success/30 p-3 text-sm text-success-strong"
          data-testid="flow-zeugenaussage-bestaetigt"
        >
          <p className="font-medium">{t('polizeibericht.liegt_vor')} ✓</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-sm text-success-strong/80 underline mt-1"
          >
            {t('polizeibericht.neu_hochladen')}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            variant="ondo"
            size="sm"
            loading={status === 'laden'}
            onClick={() => inputRef.current?.click()}
          >
            {status === 'laden' ? t('polizeibericht.wird_hochgeladen') : t('polizeibericht.hochladen')}
          </Button>
          <button
            type="button"
            onClick={() => setStatus('skip')}
            className="text-sm text-claimondo-ondo/80 underline"
          >
            {t('polizeibericht.ueberspringen')}
          </button>
        </div>
      )}
      {fehler && <p className="mt-2 text-sm text-danger-strong">{fehler}</p>}
    </div>
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
