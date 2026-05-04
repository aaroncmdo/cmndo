'use client'

// CMM-43: Einmaliger Bewertungs-Prompt nach abgeschlossenem SV-Termin.
// Öffnet den Google-Review-Deep-Link in einem neuen Tab.
// Verschwindet nach Klick auf "Jetzt bewerten" oder "Später" (optimistisch).

import { useState, useTransition } from 'react'
import { StarIcon, ExternalLinkIcon, XIcon } from 'lucide-react'
import { markReviewPromptGezeigt } from '@/app/kunde/faelle/[id]/google-review-actions'

type Props = {
  fallId: string
  svName: string
  googlePlaceId: string
}

export default function GoogleReviewPrompt({ fallId, svName, googlePlaceId }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [, startTransition] = useTransition()

  if (dismissed) return null

  function dismiss() {
    setDismissed(true)
    startTransition(async () => {
      await markReviewPromptGezeigt(fallId)
    })
  }

  function handleBewerten() {
    window.open(
      `https://search.google.com/local/writereview?placeid=${encodeURIComponent(googlePlaceId)}`,
      '_blank',
      'noopener,noreferrer',
    )
    dismiss()
  }

  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center mt-0.5">
          <StarIcon className="w-4 h-4 fill-amber-400 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900 leading-tight">
            Wie war Ihr Termin mit {svName}?
          </p>
          <p className="text-xs text-amber-700/80 mt-0.5 leading-snug">
            Helfen Sie anderen Kunden mit einer kurzen Google-Bewertung.
          </p>
          <div className="flex items-center gap-2 mt-2.5">
            <button
              onClick={handleBewerten}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
            >
              <ExternalLinkIcon className="w-3 h-3" />
              Jetzt bewerten
            </button>
            <button
              onClick={dismiss}
              className="text-xs text-amber-600/70 hover:text-amber-800 transition-colors"
            >
              Später
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 text-amber-400 hover:text-amber-600 transition-colors mt-0.5"
          aria-label="Schließen"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
