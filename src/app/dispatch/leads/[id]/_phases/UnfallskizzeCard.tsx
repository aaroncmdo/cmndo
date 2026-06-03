'use client'

// AAR-317 MVP: Unfallskizze-Card in Phase 5. MA kann die Skizze generieren,
// prüfen und freigeben. Re-Generate via „Neu generieren"-Button. Kunden-
// Bestätigung im FlowLink ist Follow-up.

import { useState, useTransition } from 'react'
import { SparklesIcon, CheckCircle2Icon, RefreshCwIcon, XIcon, MoveIcon } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  generateAndSaveUnfallskizze,
  approveUnfallskizze,
  clearUnfallskizze,
} from '../_actions/unfallskizze'
import { Button } from '@/components/primitives/Button/Button.web'
import { UnfallskizzeEditor } from './UnfallskizzeEditor'

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
  // AAR-skizze-editor: Toggle für Drag-and-Drop-Modus
  const [editing, setEditing] = useState(false)
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
        <span title={!hatHergang ? 'Erst Unfallhergang in Phase 1 eintragen' : undefined} className="inline-block">
          <Button
            variant="ondo"
            size="sm"
            type="button"
            onClick={generate}
            disabled={pending || !hatHergang}
            loading={pending}
            iconLeft={<SparklesIcon className="w-3.5 h-3.5" />}
          >
            Skizze generieren
          </Button>
        </span>
      )}

      {svg && editing && (
        <UnfallskizzeEditor
          leadId={leadId}
          initialSvg={svg}
          onSaved={(newSvg) => {
            setSvg(newSvg)
            setBestaetigt(false)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {svg && !editing && (
        <div className="space-y-2">
          <div
            className="rounded-ios-xl border border-claimondo-border bg-white overflow-hidden"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          {generiertAm && (
            <p className="text-[10px] text-claimondo-ondo/70">
              Generiert am {new Date(generiertAm).toLocaleString('de-DE')}
            </p>
          )}
          {!bestaetigt && (
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="success"
                size="sm"
                type="button"
                onClick={approve}
                disabled={pending}
                iconLeft={<CheckCircle2Icon className="w-3.5 h-3.5" />}
              >
                Freigeben
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setEditing(true)}
                disabled={pending}
                iconLeft={<MoveIcon className="w-3.5 h-3.5" />}
              >
                Bearbeiten
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={generate}
                disabled={pending}
                iconLeft={<RefreshCwIcon className="w-3.5 h-3.5" />}
              >
                Neu generieren
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={clear}
                disabled={pending}
                iconLeft={<XIcon className="w-3.5 h-3.5" />}
              >
                Verwerfen
              </Button>
            </div>
          )}
          {bestaetigt && (
            <Button
              variant="bare"
              size="sm"
              type="button"
              onClick={clear}
              disabled={pending}
              className="text-[11px]"
              iconLeft={<XIcon className="w-3 h-3" />}
            >
              Freigabe zurückziehen + neu generieren
            </Button>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-ios-md p-2">
          {error}
        </p>
      )}
    </div>
  )
}
