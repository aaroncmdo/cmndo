'use client'

// AAR-317 MVP: Unfallskizze-Card in Phase 5. MA kann die Skizze generieren,
// prüfen und freigeben. Re-Generate via „Neu generieren"-Button. Kunden-
// Bestätigung im FlowLink ist Follow-up.

import { useState, useTransition } from 'react'
import { SparklesIcon, CheckCircle2Icon, RefreshCwIcon, LoaderIcon, XIcon } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  generateAndSaveUnfallskizze,
  approveUnfallskizze,
  clearUnfallskizze,
} from '../_actions/unfallskizze'

export function UnfallskizzeCard({
  leadId,
  unfallhergang,
  initialSvg,
  initialBestaetigt,
  initialGeneriertAm,
}: {
  leadId: string
  unfallhergang: string | null
  initialSvg: string | null
  initialBestaetigt: boolean
  initialGeneriertAm: string | null
}) {
  const [svg, setSvg] = useState<string | null>(initialSvg)
  const [bestaetigt, setBestaetigt] = useState(initialBestaetigt)
  const [generiertAm, setGeneriertAm] = useState<string | null>(initialGeneriertAm)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const hatHergang = !!unfallhergang?.trim()

  function generate() {
    setError(null)
    startTransition(async () => {
      const r = await generateAndSaveUnfallskizze(leadId)
      if (!r.success) {
        setError(r.error ?? 'Skizze konnte nicht generiert werden')
        return
      }
      setSvg(r.svg ?? null)
      setBestaetigt(false)
      setGeneriertAm(new Date().toISOString())
    })
  }

  function approve() {
    startTransition(async () => {
      const r = await approveUnfallskizze(leadId)
      if (!r.success) {
        setError(r.error ?? 'Freigabe fehlgeschlagen')
        return
      }
      setBestaetigt(true)
    })
  }

  function clear() {
    startTransition(async () => {
      const r = await clearUnfallskizze(leadId)
      if (!r.success) {
        setError(r.error ?? 'Zurücksetzen fehlgeschlagen')
        return
      }
      setSvg(null)
      setBestaetigt(false)
    })
  }

  return (
    <div className="bg-white border border-claimondo-border rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <SparklesIcon className="w-4 h-4 text-claimondo-ondo" />
        <h3 className="text-sm font-semibold text-claimondo-navy">Unfallskizze (KI-generiert)</h3>
        {bestaetigt && (
          <span className="ml-auto">
            <StatusBadge tone="success">
              <CheckCircle2Icon className="w-3 h-3" />
              Freigegeben
            </StatusBadge>
          </span>
        )}
      </div>
      <p className="text-xs text-claimondo-ondo">
        Claude-API erzeugt eine einfache SVG-Darstellung auf Basis von Unfallhergang + Schadentyp.
        Prüfe vor der Freigabe ob sie den Unfall korrekt darstellt.
      </p>

      {!svg && (
        <button
          type="button"
          onClick={generate}
          disabled={pending || !hatHergang}
          title={!hatHergang ? 'Erst Unfallhergang in Phase 1 eintragen' : ''}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-navy disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? (
            <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <SparklesIcon className="w-3.5 h-3.5" />
          )}
          Skizze generieren
        </button>
      )}

      {svg && (
        <div className="space-y-2">
          <div
            className="rounded-xl border border-claimondo-border bg-white overflow-hidden"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          {generiertAm && (
            <p className="text-[10px] text-claimondo-ondo/70">
              Generiert am {new Date(generiertAm).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}
            </p>
          )}
          {!bestaetigt && (
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={approve}
                disabled={pending}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2Icon className="w-3.5 h-3.5" />
                Freigeben
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={pending}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-claimondo-border text-claimondo-navy text-xs font-medium hover:bg-[#f8f9fb] disabled:opacity-50"
              >
                <RefreshCwIcon className="w-3.5 h-3.5" />
                Neu generieren
              </button>
              <button
                type="button"
                onClick={clear}
                disabled={pending}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-claimondo-border text-claimondo-ondo text-xs font-medium hover:bg-[#f8f9fb] disabled:opacity-50"
              >
                <XIcon className="w-3.5 h-3.5" />
                Verwerfen
              </button>
            </div>
          )}
          {bestaetigt && (
            <button
              type="button"
              onClick={clear}
              disabled={pending}
              className="inline-flex items-center gap-1 text-[11px] text-claimondo-ondo hover:text-claimondo-navy"
            >
              <XIcon className="w-3 h-3" />
              Freigabe zurückziehen + neu generieren
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          {error}
        </p>
      )}
    </div>
  )
}
