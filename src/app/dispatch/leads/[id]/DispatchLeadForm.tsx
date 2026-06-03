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
import DispatchGatesPanel from './DispatchGatesPanel'
import type { AktiverTermin } from './SvDispatchPanel'
import { hasDispatchFieldOverride } from './_v2/dispatch-field-override-keys'
import { renderDispatchFieldOverride } from './_v2/dispatch-field-overrides'
import { hasDispatchSectionPanels } from './_v2/dispatch-section-panel-keys'
import { renderDispatchSectionPanels } from './_v2/dispatch-section-panels'
import { DispatchChecklistPanel } from './_v2/DispatchChecklistPanel'
import DokumenteAnfordernCard from './_phases/DokumenteAnfordernCard'
import { DispatchFlowlinkPanel, type DispatchFlowLink } from './_v2/DispatchFlowlinkPanel'
import { DispatchStatusPanel } from './_v2/DispatchStatusPanel'
import { DispatchSaBanner } from './_v2/DispatchSaBanner'
import { DispatchSidebar } from './_v2/DispatchSidebar'

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
  aktiverTermin,
  hardGateOk,
  hardGateDetails,
  wunschterminIso,
  wunschterminWochentage,
  flowLinks,
  fallId,
}: {
  lead: LeadRow
  phasen: OnboardingPhase[]
  // P2d-1: Kontext fuer Dispatcher-Rich-Felder (termin -> SvDispatchPanel).
  aktiverTermin: AktiverTermin | null
  hardGateOk: boolean
  hardGateDetails: { q1: boolean; q2: boolean; q3: boolean } | null
  wunschterminIso: string | null
  wunschterminWochentage: number[] | null
  // P2g (Versand-Parität): jüngste FlowLinks für das Versand-Panel.
  flowLinks: DispatchFlowLink[]
  // 3a (Parität 3/3): Fall-ID fürs SA-Konversions-Banner (null = kein Fall geladen).
  fallId: string | null
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
    // P2d-4 Task 8: 2-Spalten-Layout. Scroll laeuft im dispatch/layout.tsx-Container
    // (flex-1 min-h-0 overflow-y-auto). Sidebar: lg:sticky lg:top-0 / lg:max-h-screen —
    // gegen tatsaechliche Header-Hoehe im Task-11-Smoke verifizieren (ggf. top-[56px]).
    <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-6">
      <main className="flex-1 min-w-0 max-w-3xl px-4 sm:px-6 py-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-claimondo-navy">{titel}</h1>
          <p className="text-sm text-claimondo-ondo/70 mt-0.5">Lead-Erfassung — config-getrieben (v2)</p>
        </div>
        <SaveIndicator status={status} errorMsg={errorMsg} />
      </div>

      {/* 3a (Parität 3/3): SA-Konversions-Banner — sobald sa_unterschrieben ist der
          Lead-Edit serverseitig gesperrt (AAR-631); Banner erklärt das + verlinkt die
          Fallakte. Portiert aus der Legacy-DispatchShell, ganz oben vor den Gates. */}
      <DispatchSaBanner saUnterschrieben={!!lead.sa_unterschrieben} fallId={fallId} />

      <DispatchGatesPanel values={values} lead={lead} />

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
              {phase.felder.map((feld) => {
                // P2d-1: Dispatcher-Override (z.B. termin -> SvDispatchPanel) vor
                // dem generischen FieldRenderer. Override-Felder schreiben NICHT
                // ueber den Autosave — sie haben eigene Server-Actions + revalidate.
                if (hasDispatchFieldOverride(feld.feld_key)) {
                  return (
                    <div key={feld.id}>
                      {renderDispatchFieldOverride(feld, {
                        leadId,
                        lead,
                        hardGateOk,
                        hardGateDetails,
                        aktiverTermin,
                        wunschterminIso,
                        wunschterminWochentage,
                      })}
                    </div>
                  )
                }
                return (
                  <FieldRenderer
                    key={feld.id}
                    feld={feld}
                    value={values[feld.feld_key]}
                    onChange={(val) => setField(feld.feld_key, val)}
                    disabled={false}
                  />
                )
              })}
              {/* P2d-3: Sektion-Panels (Unfallskizze / Zeugen / Wunschtag-Pills)
                  NACH den Feldern dieser Sektion (Mechanismus B). */}
              {hasDispatchSectionPanels(phase.phase_key) &&
                renderDispatchSectionPanels(phase.phase_key, { leadId, lead, values })}
            </div>
          </details>
        ))}
      </div>

      {/* P2f / §8c Teil 1: nicht-blockierende Erfassungs-Checkliste (erfasst/offen). */}
      <DispatchChecklistPanel phasen={phasen} values={values} />

      {/* P2f / §8c Teil 2: Anforder-Buttons — Dokumente beim Kunden anfordern.
          Wiederverwendung der bestehenden DokumenteAnfordernCard (war repo-weit
          dormant). id-Wrapper = Scroll-Target (z.B. „Kunde hat Unfallfotos"). */}
      <div id="dokumente-anfordern-card" className="mt-3 max-w-3xl">
        <DokumenteAnfordernCard
          leadId={leadId}
          lead={lead}
          zb1HochgeladenAm={(lead.zb1_hochgeladen_am as string | null) ?? null}
          polizeiberichtHochgeladenAm={(lead.polizeibericht_hochgeladen_am as string | null) ?? null}
          telefon={(lead.telefon as string | null) ?? null}
          email={(lead.email as string | null) ?? null}
          unfallfotosVorhanden={Array.isArray(lead.schadensfoto_urls) && lead.schadensfoto_urls.length > 0}
          schadensfotoUrls={(lead.schadensfoto_urls as string[] | null) ?? null}
          sachschadenBeschreibung={(lead.fahrzeugschaden_beschreibung as string | null) ?? null}
        />
      </div>

      {/* P2g (Versand-Parität): FlowLink an den Kunden versenden — portiert aus
          Phase5Zusammenfassung, entkoppelt vom Phasen-Provider, nicht-blockierend. */}
      <DispatchFlowlinkPanel leadId={leadId} lead={lead} flowLinks={flowLinks} />

      {/* P2h (Versand-Parität 2/3): Status-Tracking (FlowLink-Stepper + Inaktiv-Alarm),
          portiert aus Phase6, liest lead + flowLinks. */}
      <DispatchStatusPanel leadId={leadId} lead={lead} flowLinks={flowLinks} />
      </main>

      <aside className="w-full lg:w-[340px] shrink-0 bg-claimondo-bg lg:border-l border-claimondo-border lg:sticky lg:top-0 lg:max-h-screen overflow-y-auto p-4">
        <DispatchSidebar lead={lead} leadId={leadId} values={values} />
      </aside>
    </div>
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
