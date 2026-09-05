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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FieldRenderer } from '@/components/onboarding/FieldRenderer'
import type { OnboardingPhase, OnboardingFeld } from '@/components/onboarding/types'
import { saveDispatchLeadFelder } from './_actions/dispatch-lead-felder'
import DispatchGatesPanel from './DispatchGatesPanel'
import DispatchAnspruchspruefungHinweis from './_v2/DispatchAnspruchspruefungHinweis'
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

// Kurze Tab-Labels je Phase (sonst sprengen "Unfallhergang"/"Fahrzeug & Halter" die Leiste).
const TAB_LABELS: Record<string, string> = {
  kontakt: 'Kontakt',
  schaden: 'Schaden',
  unfall: 'Unfall',
  fahrzeug: 'Fahrzeug',
  schuld: 'Schuld',
  service_kanzlei: 'Service',
  termin_sv: 'Termin',
  vollmacht: 'Vollmacht',
  status: 'Status',
}

// Feld-Typen, die im 2-Spalten-Grid die volle Breite brauchen (mehrzeilig/Rich).
const FULL_WIDTH_TYPEN = new Set<string>([
  'textarea', 'toggle-cards', 'file', 'signature', 'zb1-upload', 'slot', 'termin',
  'phone-verify', 'avatar-upload', 'calendar-connect', 'embed-site-create',
])

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
  freigeschalteteSlotIds,
  currentWerkstatt,
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
  // Pflichtdok-Kanonisierung: server-seitig aus dokument_katalog berechnete
  // freigeschaltete Slot-IDs (ersetzt client-seitiges berechneErwartung).
  freigeschalteteSlotIds: string[]
  // Task 5: aktuell zugewiesene Reparatur-Werkstatt fuers WerkstattVermittlungPanel.
  currentWerkstatt: { id: string; name: string } | null
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

  // Phase 1c/1d: kontrollierter aktiver Tab + Scroll-Fokus, damit die Workflow-
  // Kopfzone (page.tsx, <LeadWorkflowPanel>) per Event springen kann: `tab` schaltet
  // den relevanten Tab, `scrollTo` scrollt zu einem Panel UNTER den Tabs (z.B. dem
  // FlowLink-Versand). Default = 1. Phase.
  const [activeTab, setActiveTab] = useState<string | undefined>(phasen[0]?.phase_key)
  // Phase 1d: kurzer Fokus-Ring aufs FlowLink-Panel nach dem Scroll-Sprung.
  const [flowlinkHighlight, setFlowlinkHighlight] = useState(false)
  useEffect(() => {
    const gueltig = new Set(phasen.map((p) => p.phase_key))
    const onJump = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: string; scrollTo?: string }>).detail
      if (detail?.tab && gueltig.has(detail.tab)) {
        setActiveTab(detail.tab)
        document.getElementById('lead-detail-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (detail?.scrollTo) {
        document.getElementById(detail.scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        if (detail.scrollTo === 'flowlink-panel') {
          setFlowlinkHighlight(true)
          setTimeout(() => setFlowlinkHighlight(false), 2000)
        }
      }
    }
    document.addEventListener('claimondo:lead-workflow-jump', onJump)
    return () => document.removeEventListener('claimondo:lead-workflow-jump', onJump)
  }, [phasen])

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

  // AAR-956 Realtime: nach router.refresh (LeadRealtimeRefresh bei leads-UPDATE) kommt
  // ein frischer `lead`-Prop. Wir mergen die neuen Werte fuer Felder, die der Dispatcher
  // NICHT gerade bearbeitet (nicht in dirtyRef) — so erscheint die Kunde-Live-Eingabe aus
  // dem /flow, ohne die laufende Eingabe des Dispatchers zu ueberschreiben.
  useEffect(() => {
    setValues((prev) => {
      const next = { ...prev }
      for (const phase of phasen) {
        for (const feld of phase.felder) {
          if (dirtyRef.current.has(feld.feld_key)) continue
          next[feld.feld_key] = initialValue(feld, lead)
        }
      }
      return next
    })
  }, [lead, phasen])

  const titel = `${(lead.vorname as string) ?? ''} ${(lead.nachname as string) ?? ''}`.trim() || 'Lead'

  return (
    // P2d-4 Task 8: 2-Spalten-Layout. Scroll laeuft im dispatch/layout.tsx-Container
    // (flex-1 min-h-0 overflow-y-auto). Sidebar: lg:sticky lg:top-0 / lg:max-h-screen —
    // gegen tatsaechliche Header-Hoehe im Task-11-Smoke verifizieren (ggf. top-[56px]).
    <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-6">
      <main className="flex-1 min-w-0 px-4 sm:px-6 py-6">
      {/* md:pr-36 lg:pr-0 — dieser Header ist ein eigenes div (kein PageHeader), die
          #3320-Regel `.has-corner-pill [data-page-header]` greift hier also nicht. Bei
          md..lg ist <main> volle Breite (flex-col) -> SaveIndicator laege sonst unter
          der fixen UpdatesNav-Pill; ab lg ist main die linke Spalte und klart die Pill. */}
      <div className="mb-4 flex items-start justify-between gap-3 md:pr-36 lg:pr-0">
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
      {/* Kasko-WB Phase 2 (D2): was der Kunde im /check-Quiz angeklickt hat — unverbindlich, nur Anzeige. */}
      <DispatchAnspruchspruefungHinweis auswertung={(lead as Record<string, unknown>).auswertung_unverbindlich} />

      {/* AAR-956 15.06. (Aaron): Sektionen als Tabs (Desktop-Power-User) statt
          gestapeltem Akkordeon; Felder im 2-Spalten-Grid (mehrzeilig/Rich = volle
          Breite) — keine lange Einspalter-Kolonne mobile-first Felder mehr. */}
      <Tabs id="lead-detail-tabs" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList variant="default" className="w-full overflow-x-auto bg-claimondo-navy/[0.06]">
          {phasen.map((phase) => (
            <TabsTrigger key={phase.id} value={phase.phase_key}>
              {TAB_LABELS[phase.phase_key] ?? phase.titel.split('&')[0].trim()}
            </TabsTrigger>
          ))}
        </TabsList>
        {phasen.map((phase) => (
          <TabsContent key={phase.id} value={phase.phase_key} className="pt-5">
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
              {phase.felder.map((feld) => {
                // P2d-1: Dispatcher-Override (z.B. termin -> SvDispatchPanel) vor dem
                // generischen FieldRenderer. Override-Felder schreiben NICHT ueber den
                // Autosave — eigene Server-Actions + revalidate. Rich/mehrzeilig = voll.
                const istVollbreit =
                  FULL_WIDTH_TYPEN.has(feld.typ) || hasDispatchFieldOverride(feld.feld_key)
                return (
                  <div key={feld.id} className={istVollbreit ? 'col-span-full' : 'min-w-0'}>
                    {hasDispatchFieldOverride(feld.feld_key) ? (
                      renderDispatchFieldOverride(feld, {
                        leadId,
                        lead,
                        hardGateOk,
                        hardGateDetails,
                        aktiverTermin,
                        wunschterminIso,
                        wunschterminWochentage,
                        currentWerkstatt,
                      })
                    ) : (
                      <FieldRenderer
                        feld={feld}
                        value={values[feld.feld_key]}
                        onChange={(val) => setField(feld.feld_key, val)}
                        disabled={false}
                      />
                    )}
                  </div>
                )
              })}
              {/* P2d-3: Sektion-Panels (Unfallskizze / Zeugen / Wunschtag-Pills) nach
                  den Feldern dieser Sektion (Mechanismus B). */}
              {hasDispatchSectionPanels(phase.phase_key) && (
                <div className="col-span-full">
                  {renderDispatchSectionPanels(phase.phase_key, { leadId, lead, values })}
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* P2f / §8c Teil 1: nicht-blockierende Erfassungs-Checkliste (erfasst/offen). */}
      <DispatchChecklistPanel phasen={phasen} values={values} />

      {/* P2f / §8c Teil 2: Anforder-Buttons — Dokumente beim Kunden anfordern.
          Wiederverwendung der bestehenden DokumenteAnfordernCard (war repo-weit
          dormant). id-Wrapper = Scroll-Target (z.B. „Kunde hat Unfallfotos"). */}
      <div id="dokumente-anfordern-card" className="mt-3">
        <DokumenteAnfordernCard
          leadId={leadId}
          freigeschalteteSlotIds={freigeschalteteSlotIds}
          zb1Status={(lead.zb1_status as string | null) ?? null}
          polizeiberichtStatus={(lead.polizeibericht_status as string | null) ?? null}
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
          Phase5Zusammenfassung, entkoppelt vom Phasen-Provider, nicht-blockierend.
          Phase 1d: id-Wrapper = Scroll-Target der Workflow-CTA (flowlink_senden/
          nachfassen/warten) + kurzer Fokus-Ring nach dem Sprung. */}
      <div
        id="flowlink-panel"
        className={`transition-shadow ${flowlinkHighlight ? 'rounded-ios-xl ring-2 ring-claimondo-ondo ring-offset-2' : ''}`}
      >
        <DispatchFlowlinkPanel leadId={leadId} lead={lead} flowLinks={flowLinks} />
      </div>

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
    return <span className="text-xs font-medium text-success shrink-0 mt-1">Gespeichert ✓</span>
  if (status === 'error')
    return (
      <span className="text-xs font-medium text-danger shrink-0 mt-1" title={errorMsg ?? undefined}>
        Fehler beim Speichern
      </span>
    )
  return <span className="text-xs font-medium text-claimondo-ondo/40 shrink-0 mt-1">Autosave aktiv</span>
}
