'use client'

// P2a/P2b (dispatch-config-unify): flacher, config-getriebener Dispatcher-Renderer.
// Liest die lead-erfassung-Felder (audience dispatcher/beide, vom Loader gefiltert)
// und rendert sie nach `sektion` gruppiert — ALLE Sektionen sichtbar, kein Phasen-
// Lock. Wiederverwendet den geteilten FieldRenderer (eine Render-Quelle).
//
// P2b: debounced Autosave pro Bearbeitung -> saveDispatchLeadFelder (Boolean-/Number-
// Coercion + server-seitige Allowlist). Rich-Sektionen (SvDispatchPanel, Unfallskizze,
// Zeugen-Editor) + Gates->Flags folgen in P2c/P2d.

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { FieldRenderer } from '@/components/onboarding/FieldRenderer'
import type { OnboardingPhase, OnboardingFeld } from '@/components/onboarding/types'
import { saveDispatchLeadFelder } from './_actions/dispatch-lead-felder'

type LeadRow = Record<string, unknown> & { id: string }
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// Lead-Spaltenwert -> Initialwert fuer das jeweilige Feld-Render-Modell.
// segmented Ja/Nein liegt als boolean in der DB -> 'true'/'false'-String fuers Render.
function initialValue(feld: OnboardingFeld, lead: LeadRow): unknown {
  const raw = lead[feld.feld_key]
  if (feld.typ === 'file') return Array.isArray(raw) ? raw : []
  if (feld.typ === 'checkbox') return raw === true
  if (typeof raw === 'boolean') return String(raw)
  return raw ?? ''
}

const DEBOUNCE_MS = 700

export default function DispatchLeadForm({
  lead,
  phasen,
}: {
  lead: LeadRow
  phasen: OnboardingPhase[]
}) {
  const leadId = lead.id
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    for (const phase of phasen) {
      for (const feld of phase.felder) init[feld.feld_key] = initialValue(feld, lead)
    }
    return init
  })
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Refs fuer den debounced Save-Closure (immer aktuelle Werte + dirty-Set).
  const valuesRef = useRef(values)
  valuesRef.current = values
  const dirtyRef = useRef<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(async () => {
    if (dirtyRef.current.size === 0) return
    const keys = Array.from(dirtyRef.current)
    dirtyRef.current = new Set()
    const payload: Record<string, unknown> = {}
    for (const k of keys) payload[k] = valuesRef.current[k]
    setStatus('saving')
    setErrorMsg(null)
    const r = await saveDispatchLeadFelder(leadId, payload)
    if (r.ok) {
      setStatus('saved')
    } else {
      // fehlgeschlagene Keys zuruecklegen, damit der naechste Flush sie erneut versucht
      for (const k of keys) dirtyRef.current.add(k)
      setStatus('error')
      setErrorMsg(r.error ?? 'Speichern fehlgeschlagen')
    }
  }, [leadId])

  const setField = useCallback(
    (key: string, val: unknown) => {
      setValues((prev) => ({ ...prev, [key]: val }))
      dirtyRef.current.add(key)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => { void flush() }, DEBOUNCE_MS)
    },
    [flush],
  )

  // Letzten Stand beim Unmount sichern (fire-and-forget).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      void flush()
    }
  }, [flush])

  const titel = `${(lead.vorname as string) ?? ''} ${(lead.nachname as string) ?? ''}`.trim() || 'Lead'

  return (
    <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-claimondo-navy">{titel}</h1>
          <p className="text-sm text-claimondo-ondo/70 mt-0.5">Lead-Erfassung — config-getrieben (v2)</p>
        </div>
        <SaveIndicator status={status} errorMsg={errorMsg} />
      </div>

      <div className="flex flex-col gap-3 max-w-3xl">
        {phasen.map((phase) => (
          <details
            key={phase.id}
            open
            className="group rounded-ios-xl border border-claimondo-border bg-white"
          >
            <summary className="flex items-center justify-between cursor-pointer select-none px-4 py-3 text-sm font-semibold text-claimondo-navy">
              <span>
                {phase.titel}
                <span className="ml-2 text-xs font-normal text-claimondo-ondo/50">
                  {phase.felder.length} Feld{phase.felder.length === 1 ? '' : 'er'}
                </span>
              </span>
              <ChevronDown className="w-4 h-4 text-claimondo-ondo/50 transition-transform group-open:rotate-180" />
            </summary>
            <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
              {phase.felder.map((feld) => (
                <FieldRenderer
                  key={feld.id}
                  feld={feld}
                  value={values[feld.feld_key]}
                  onChange={(val) => setField(feld.feld_key, val)}
                  disabled={false}
                />
              ))}
            </div>
          </details>
        ))}
      </div>
    </main>
  )
}

function SaveIndicator({ status, errorMsg }: { status: SaveStatus; errorMsg: string | null }) {
  if (status === 'saving')
    return <span className="text-xs font-medium text-claimondo-ondo shrink-0 mt-1">Speichert …</span>
  if (status === 'saved')
    return <span className="text-xs font-medium text-emerald-600 shrink-0 mt-1">Gespeichert ✓</span>
  if (status === 'error')
    return (
      <span className="text-xs font-medium text-red-600 shrink-0 mt-1" title={errorMsg ?? undefined}>
        Fehler beim Speichern
      </span>
    )
  return <span className="text-xs font-medium text-claimondo-ondo/40 shrink-0 mt-1">Autosave aktiv</span>
}
