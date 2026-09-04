'use client'

// Werkstatt-Finder-Wizard (Phase 2) — 4-Schritt Glass-Card analog gutachter-finder/FinderWizard.
// Standort → Fahrzeug → Schaden → Kontakt. Jede such-relevante Änderung ruft onSuche (Live-Re-Rank);
// die Ergebnisse (rows) kommen als Props zurück und werden im Schaden-/Kontakt-Schritt als
// WerkstattFinder-Liste (mit Begründungs-Chips) gezeigt. Submit nutzt die bestehende Lead-Action
// (Phase 3 erweitert sie um die db-driven Übergabe der neuen Felder).
import { useEffect, useRef, useState, useTransition } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/primitives'
import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'
import type { EmbedFoto } from '@/lib/werkstatt/bedarf/embed-foto-guard'
import { GlassSurface } from './GlassSurface'
import { StandortStep } from './StandortStep'
import { FahrzeugStep } from './FahrzeugStep'
import { SchadenStep } from './SchadenStep'
import { AbrechnungStep } from './AbrechnungStep'
import { erstelleWerkstattFinderLead } from '../actions'
import {
  WIZARD_INITIAL,
  WIZARD_STEPS,
  type WizardStep,
  type WerkstattWizardState,
  kannWeiter,
  wizardStateZuSuche,
  zeigeUmkreisLeerHinweis,
  fahrzeugtypZuEuKlasse,
  abrechnungZuLeadFelder,
} from './wizard-logic'

// D1: Hinweis, wenn die Suche lief und im Umkreis nichts gefunden wurde — der Funnel traegt
// auch ohne Werkstatt-Wahl (Lead + FlowLink entstehen trotzdem).
function UmkreisLeerHinweis() {
  return (
    <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3 text-body-sm text-claimondo-navy">
      Noch keine Partner-Werkstatt in Ihrer Nähe — senden Sie Ihre Anfrage trotzdem ab, wir
      kümmern uns um Gutachten und Abwicklung.
    </div>
  )
}

export type WerkstattWizardProps = {
  rows: WerkstattVorschlag[]
  selectedId: string | null
  loading: boolean
  /** D1: true nach der ersten abgeschlossenen Suche — Gate fuer den Umkreis-Leer-Hinweis. */
  hatGesucht?: boolean
  keineSpezialisierte: boolean
  onSelectWerkstatt: (id: string) => void
  // Vom Root: führt die Suche aus + hebt center; Wizard ruft es bei Standort/Marke/Typ/Bedarf-Änderung.
  onSuche: (input: ReturnType<typeof wizardStateZuSuche>) => void
  // §10 Doppel-Lead-Falle: Re-Entry-Token (aus ?token=) — absenden UPDATED dann den bestehenden Lead.
  flowToken?: string
  // E1.1: Makler-/Partner-Promo-Code (aus ?promo=) — absenden attribuiert ihn am Lead.
  promoCode?: string
  /** OpenAI-Ads-Kennung aus der Parent-URL — nur durchgereicht. */
  oppref?: string
}

export function WerkstattWizard({
  rows,
  selectedId,
  loading,
  hatGesucht = false,
  keineSpezialisierte,
  onSelectWerkstatt,
  onSuche,
  flowToken,
  promoCode,
  oppref,
}: WerkstattWizardProps) {
  const [state, setState] = useState<WerkstattWizardState>(WIZARD_INITIAL)
  const [stepIdx, setStepIdx] = useState(0)
  const [email, setEmail] = useState('')
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [fotos, setFotos] = useState<EmbedFoto[]>([])
  const [beschreibung, setBeschreibung] = useState('')
  const [pending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSucheRef = useRef<string>('')
  const step: WizardStep = WIZARD_STEPS[stepIdx]

  // Debounce-Timer beim Unmount räumen.
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  // State ändern + Suche NUR neu auslösen, wenn sich die Engine-Projektion (Standort/Marke/Klasse/
  // Bedarf) ändert (Modell/gewerbe fließen NICHT in die Suche → keine Redundanz-Calls), debounced
  // (Hersteller-Tastatureingabe). onSuche läuft AUSSERHALB des setState-Updaters (kein Cross-Component-
  // setState-im-Render / StrictMode-Doppelfeuer — I1/I2 aus dem Whole-Branch-Review).
  function patch(p: Partial<WerkstattWizardState>) {
    const next = { ...state, ...p }
    setState(next)
    const proj = wizardStateZuSuche(next)
    const key = JSON.stringify([
      proj.lat ?? null,
      proj.lng ?? null,
      proj.marke,
      proj.fahrzeugklasse,
      proj.bedarf?.kategorien ?? null,
      proj.bedarf?.confidence ?? null,
    ])
    if (key === lastSucheRef.current) return
    lastSucheRef.current = key
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onSuche(proj), 350)
  }

  function weiter() {
    if (!kannWeiter(step, state)) return
    setStepIdx((i) => Math.min(i + 1, WIZARD_STEPS.length - 1))
  }
  function zurueck() {
    setStepIdx((i) => Math.max(i - 1, 0))
  }

  function absenden() {
    setFehler(null)
    if (!email.trim()) {
      setFehler('Bitte E-Mail angeben.')
      return
    }
    startTransition(async () => {
      // Abrechnungswahl -> schuldfrage (+ eigene_versicherung bei kasko/selbstzahler). Der /flow matcht
      // damit direkt haftpflicht/kasko/selbstzahler statt den vollen Schuldfrage-Quali zu zeigen.
      const abr = state.abrechnung ? abrechnungZuLeadFelder(state.abrechnung) : null
      const res = await erstelleWerkstattFinderLead({
        vorname: vorname || null,
        nachname: nachname || null,
        email,
        telefon: telefon || null,
        werkstattId: state.kaskoWb?.freieWerkstattwahl === false ? null : selectedId,
        kaskoWb: state.kaskoWb,
        lat: state.standort?.lat ?? null,
        lng: state.standort?.lng ?? null,
        ort: state.standort?.adresse ?? null,
        bedarf: state.bedarf ?? undefined,
        fotos: fotos.length > 0 ? fotos : undefined,
        // Phase 3: db-driven Übergabe der gesammelten Wizard-Felder
        hersteller: state.hersteller.trim() || null,
        fahrzeugklasse: fahrzeugtypZuEuKlasse(state.fahrzeugtyp),
        gewerbe: state.gewerbe,
        modell: state.modell.trim() || null,
        beschreibung: beschreibung.trim() || null,
        // F1: Abrechnungsweg (Kasko/Selbstzahler) -> Lead-Szenario-Weiche
        schuldfrage: abr?.schuldfrage ?? null,
        eigeneVersicherung: abr?.eigeneVersicherung ?? null,
        flowToken: flowToken ?? null,
        promoCode: promoCode ?? null,
        oppref: oppref ?? null,
      })
      if (res.ok) window.location.href = `/flow/${res.token}`
      else setFehler(res.error)
    })
  }

  return (
    <GlassSurface className="flex flex-col gap-4 p-5 animate-in fade-in slide-in-from-bottom-3 duration-700 ease-out">
      {/* Fortschritt (4 Segmente, wie FinderWizard) */}
      <div className="flex items-center gap-1.5">
        {WIZARD_STEPS.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-claimondo-ondo' : 'bg-claimondo-border'}`} />
        ))}
      </div>

      {step === 'standort' && (
        <StandortStep standort={state.standort} onStandort={(s) => patch({ standort: s })} />
      )}
      {step === 'fahrzeug' && (
        <FahrzeugStep
          hersteller={state.hersteller}
          fahrzeugtyp={state.fahrzeugtyp}
          gewerbe={state.gewerbe}
          modell={state.modell}
          onChange={patch}
        />
      )}
      {step === 'schaden' && (
        <>
          <SchadenStep
            bedarf={state.bedarf}
            onBedarf={(b) => patch({ bedarf: b })}
            onFotos={setFotos}
            onBeschreibung={setBeschreibung}
          />
          {/* Live-Ergebnisse mit Begründungs-Chips (gruende), sobald es Treffer gibt. */}
          {(loading || rows.length > 0) && (
            <WerkstattFinder
              werkstaetten={rows}
              onSelect={onSelectWerkstatt}
              selectedId={selectedId}
              loading={loading}
              keineSpezialisierte={keineSpezialisierte}
              scrollToSelected
            />
          )}
          {zeigeUmkreisLeerHinweis({ hatGesucht, loading, anzahlTreffer: rows.length }) && (
            <UmkreisLeerHinweis />
          )}
        </>
      )}
      {step === 'abrechnung' && (
        <AbrechnungStep
          abrechnung={state.abrechnung}
          onChange={(w) => patch({ abrechnung: w })}
          kaskoWb={state.kaskoWb}
          onKaskoWb={(w) => patch({ kaskoWb: w })}
        />
      )}
      {step === 'kontakt' && (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-body font-bold text-claimondo-navy">Ihre Kontaktdaten</h3>
            <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
              {state.kaskoWb?.freieWerkstattwahl === false
                ? 'Wir vermitteln in diesem Fall keine Werkstatt. Hinterlassen Sie Ihre Kontaktdaten für einen Rückruf und eine Zusammenfassung per E-Mail.'
                : 'Damit wir Ihre Werkstatt-Anfrage bestätigen können.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={vorname}
              onChange={(e) => setVorname(e.target.value)}
              placeholder="Vorname"
              autoComplete="given-name"
              className="rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none"
            />
            <input
              value={nachname}
              onChange={(e) => setNachname(e.target.value)}
              placeholder="Nachname"
              autoComplete="family-name"
              className="rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none"
            />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-Mail"
            autoComplete="email"
            className="rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none"
          />
          <input
            type="tel"
            value={telefon}
            onChange={(e) => setTelefon(e.target.value)}
            placeholder="Telefon (optional)"
            autoComplete="tel"
            className="rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none"
          />
          {rows.length > 0 && (
            <WerkstattFinder
              werkstaetten={rows}
              onSelect={onSelectWerkstatt}
              selectedId={selectedId}
              loading={loading}
              keineSpezialisierte={keineSpezialisierte}
              scrollToSelected
            />
          )}
          {zeigeUmkreisLeerHinweis({ hatGesucht, loading, anzahlTreffer: rows.length }) && (
            <UmkreisLeerHinweis />
          )}
          {fehler && <p className="text-body-sm text-danger-strong">{fehler}</p>}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-1 flex items-center justify-between gap-2">
        {stepIdx > 0 ? (
          <button
            type="button"
            onClick={zurueck}
            className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-claimondo-shield/70 hover:text-claimondo-ondo"
          >
            <ChevronLeft className="h-4 w-4" /> Zurück
          </button>
        ) : (
          <span />
        )}
        {step === 'kontakt' ? (
          <Button onClick={absenden} loading={pending} variant="navy">
            {selectedId ? 'Werkstatt anfragen' : 'Anfrage absenden'}
          </Button>
        ) : (
          <Button onClick={weiter} disabled={!kannWeiter(step, state)} variant="navy">
            Weiter <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </GlassSurface>
  )
}
