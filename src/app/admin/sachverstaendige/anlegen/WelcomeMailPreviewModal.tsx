'use client'

import { useEffect, useState } from 'react'
import { XIcon, MailIcon, LoaderIcon } from 'lucide-react'
import { renderWillkommenSvPreview, type WelcomeMailPreviewInput } from './actions'
import { LoadingButton } from '@/components/ui/loading-button'

// AAR-364 SUB-2: Vorab-Preview der Willkommens-Mail. Rendered den echten
// WillkommenSv-Email-Inhalt in einem iframe — der Admin sieht exakt was
// beim Anlegen verschickt wird und bestaetigt oder bricht ab. Das
// Initial-Passwort ist ein Platzhalter, das echte wird beim tatsaechlichen
// anlegeSv() Aufruf generiert.

type Props = {
  open: boolean
  input: WelcomeMailPreviewInput
  onConfirm: () => void
  onCancel: () => void
  saving?: boolean
}

export default function WelcomeMailPreviewModal({ open, input, onConfirm, onCancel, saving }: Props) {
  const [html, setHtml] = useState<string | null>(null)
  const [subject, setSubject] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setHtml(null)
    renderWillkommenSvPreview(input).then(r => {
      setLoading(false)
      if (!r.success) {
        setError(r.error ?? 'Preview konnte nicht geladen werden')
        return
      }
      setHtml(r.html ?? null)
      setSubject(r.subject ?? '')
    }).catch(err => {
      setLoading(false)
      setError(err instanceof Error ? err.message : 'Preview-Fehler')
    })
  }, [open, input])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#4573A2]/10 flex items-center justify-center flex-shrink-0">
              <MailIcon className="w-5 h-5 text-[#4573A2]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Willkommens-Mail Vorschau</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Empfänger: <strong>{input.email}</strong>
              </p>
              {subject && (
                <p className="text-[11px] text-gray-400 mt-0.5">Betreff: {subject}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-40"
            aria-label="Schließen"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden bg-gray-50 min-h-[300px]">
          {loading && (
            <div className="h-full flex items-center justify-center text-xs text-gray-500">
              <LoaderIcon className="w-4 h-4 mr-2 animate-spin" />
              Lade Vorschau…
            </div>
          )}
          {error && (
            <div className="p-4">
              <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                {error}
              </div>
            </div>
          )}
          {!loading && !error && html && (
            <iframe
              title="Willkommens-Mail Vorschau"
              srcDoc={html}
              className="w-full h-full min-h-[400px] bg-white"
              sandbox=""
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-200 flex-shrink-0 bg-white">
          <p className="text-[11px] text-gray-400 flex-1">
            Das Initial-Passwort wird erst beim Anlegen generiert und sicher in der Mail versendet.
          </p>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            Abbrechen
          </button>
          <LoadingButton
            type="button"
            onClick={onConfirm}
            isLoading={!!saving}
            loadingText="Wird angelegt…"
            disabled={loading || !!error}
            className="px-5 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold disabled:opacity-40"
          >
            Bestätigen + SV anlegen
          </LoadingButton>
        </div>
      </div>
    </div>
  )
}
