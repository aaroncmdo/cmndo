'use client'

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import Image from 'next/image'
import {
  Car,
  Bike,
  Phone,
  MapPin,
  LocateFixed,
  ArrowLeft,
  ArrowRight,
  X,
  CheckCircle2,
  Loader2,
  Users,
  AlertCircle,
  Star,
  type LucideIcon,
} from 'lucide-react'
import { trackLpEvent } from './track'
import { TEL_HREF, TEL_DISPLAY } from './constants'
import { submitKfzgutachterLead } from './actions'

// Scroll-Triggered Popover-Stepper. Aaron-Wunsch 2026-05-19:
//   - Bei 26 % scroll-depth einmalig aufpoppen (sessionStorage)
//   - Full-bleed Backdrop: Claimondo-Navy/65 + backdrop-blur-md
//   - 3 Steps: Fahrzeug → Standort → Kontakt-Decision (Call vs Callback)
//
// Phase-1-Skelett: Step-Inhalt iterieren wir nach diesem Initial-Drop.
// Tracking: GA4-Standard-Events (view_promotion, select_promotion,
// phone_call, generate_lead) via trackLpEvent — lp_variant + source
// werden zentral injiziert.

const SCROLL_TRIGGER_PCT = 0.26
const SESSION_FLAG_KEY = 'kfz-lp-popover-seen'
const ARM_DELAY_MS = 800 // verhindert Anchor-Deeplink-Sofort-Trigger

// Aaron 2026-05-19: Step 1 reduziert auf zwei Optionen (Auto + Motorrad/
// Roller) — alle anderen Fahrzeugarten kommen ueber den Callback-Pfad.
// Klick wird in Step 1 als implizites "Weiter" interpretiert (kein
// separater Weiter-Button mehr).
const FAHRZEUG_LABEL = {
  pkw: 'Auto',
  motorrad_roller: 'Motorrad / Roller',
} as const
type FahrzeugArt = keyof typeof FAHRZEUG_LABEL

const FAHRZEUG_TYPEN: { id: FahrzeugArt; Icon: LucideIcon }[] = [
  { id: 'pkw', Icon: Car },
  { id: 'motorrad_roller', Icon: Bike },
]

type Step = 1 | 2 | 3
type Step3Mode = 'choice' | 'callback'

type Place = {
  placeId: string
  description: string
}

type GutachterProfil = {
  id: string
  vorname_initiale: string | null
  stadt: string | null
  avatar_url: string | null
  bewertungs_durchschnitt: number | null
  bewertungs_anzahl: number | null
}

type VerfuegbarkeitState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; count: number; gutachter: GutachterProfil[] }
  | { kind: 'err' }

export function ScrollPopoverClient({
  presetStadt = null,
}: {
  /** Vor-ausgefüllter Standort aus Google-Ads-`?cid=`-Param (siehe
   *  resolveStadt → cid-staedte.ts). Wenn gesetzt: Step 2 Standort-Input
   *  ist vorbefüllt + Button-Label zeigt "Übernehmen" statt "Weiter",
   *  Click triggert sofort einen Reverse-Geocode-Lookup gegen die Stadt. */
  presetStadt?: string | null
} = {}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [fahrzeug, setFahrzeug] = useState<FahrzeugArt | null>(null)
  const [standort, setStandort] = useState(presetStadt ?? '')
  // True solange der User die Preset-Stadt nicht überschrieben hat. Wenn
  // er anfängt zu tippen, flippt's auf false → normaler Autocomplete-Flow.
  const [presetActive, setPresetActive] = useState(Boolean(presetStadt))
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const [verfuegbarkeit, setVerfuegbarkeit] = useState<VerfuegbarkeitState>({
    kind: 'idle',
  })
  const verfuegbarkeitReqRef = useRef<AbortController | null>(null)
  const [mode, setMode] = useState<Step3Mode>('choice')
  const [cbName, setCbName] = useState('')
  const [cbPhone, setCbPhone] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Scroll-Trigger — einmalig pro Session, kurze Arm-Karenz damit
  // Anchor-Deeplinks (Page lädt schon mitten in der Seite) nicht
  // sofort triggern.
  //
  // Debug-Helfer für Aaron: ?popover_force=1 in der URL öffnet das
  // Modal sofort und ignoriert das sessionStorage-Flag (z. B. nach
  // mehrfachem Testen ohne DevTools-Storage-Reset). ?popover_debug=1
  // loggt die Scroll-Prozente in die Konsole — damit man sieht ob
  // der Trigger Events bekommt aber die Schwelle noch nicht erreicht
  // ist.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const force = params.get('popover_force') === '1'
    const debug = params.get('popover_debug') === '1'

    if (force) {
      setOpen(true)
      trackLpEvent('view_promotion', {
        event_label: 'scroll-popover-force-param',
      })
      return
    }

    if (sessionStorage.getItem(SESSION_FLAG_KEY) === '1') {
      if (debug) {
        console.log(
          '[popover] sessionStorage-Flag gesetzt → kein Auto-Trigger. Lösche Session-Storage oder hänge ?popover_force=1 an.',
        )
      }
      return
    }

    let armed = false
    function evaluateScroll() {
      const total =
        document.documentElement.scrollHeight - window.innerHeight
      if (total <= 0) {
        if (debug)
          console.log(
            '[popover] scrollHeight <= viewport — Page hat keinen Scroll-Raum, Trigger inaktiv',
          )
        return
      }
      const pct = window.scrollY / total
      if (debug && armed) {
        console.log(
          `[popover] scroll ${(pct * 100).toFixed(1)} % / target ${(SCROLL_TRIGGER_PCT * 100).toFixed(0)} %`,
        )
      }
      if (!armed) return
      if (pct >= SCROLL_TRIGGER_PCT) {
        try {
          sessionStorage.setItem(SESSION_FLAG_KEY, '1')
        } catch {
          // Storage gesperrt (Privatmodus) — wir geben auf, kein
          // Spam-Risiko weil der Listener nach Open weg ist.
        }
        setOpen(true)
        trackLpEvent('view_promotion', {
          event_label: 'scroll-popover-26pct',
        })
        window.removeEventListener('scroll', evaluateScroll)
      }
    }

    const armTimer = window.setTimeout(() => {
      armed = true
      if (debug) console.log('[popover] armed nach', ARM_DELAY_MS, 'ms')
      // Race-Fix: Wenn der User waehrend der Arm-Karenz bereits ueber
      // die Schwelle gescrollt hat und danach stoppt, kommt kein scroll-
      // Event mehr — Trigger wuerde nie feuern. Daher direkt nach dem
      // Flip die aktuelle Position auswerten.
      evaluateScroll()
    }, ARM_DELAY_MS)

    window.addEventListener('scroll', evaluateScroll, { passive: true })
    return () => {
      window.clearTimeout(armTimer)
      window.removeEventListener('scroll', evaluateScroll)
    }
  }, [])

  // Custom-Event-Listener fuer programmatisches Oeffnen des Popovers — z. B.
  // aus den Warum-Cards-CTAs (WarumCardsClient). Event traegt optional step
  // (1/2/3) und source (slug der ausloesenden Card), damit das Popover direkt
  // auf den passenden Step springt und das Tracking sauber annotiert ist.
  useEffect(() => {
    if (typeof window === 'undefined') return

    function onOpenRequest(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { step?: 1 | 2 | 3; source?: string }
        | undefined
      setOpen(true)
      if (detail?.step === 2) setStep(2)
      else if (detail?.step === 3) setStep(3)
      else setStep(1)
      trackLpEvent('view_promotion', {
        event_label: `popover-open-via-${detail?.source ?? 'event'}`,
      })
    }

    window.addEventListener('claimondo:open-popover', onOpenRequest as EventListener)
    return () => {
      window.removeEventListener('claimondo:open-popover', onOpenRequest as EventListener)
    }
  }, [])

  // "Übernehmen"-Flow: Stadt-Name aus presetStadt via google.maps.Geocoder
  // in eine place_id + formatted_address auflösen, dann den gleichen Pfad
  // wie ein Autocomplete-Pick fahren — onSelectPlace würde aber dem
  // StandortStep-Child gehören; einfacher ist hier direkt die State-Updates
  // wie im onSelectPlace-Handler. Wir refaktorieren in eine kleine Helper-
  // Function, damit beide Pfade exakt das gleiche tun.
  function triggerVerfuegbarkeitFor(p: Place) {
    setStandort(p.description)
    setSelectedPlace(p)
    setPresetActive(false)
    verfuegbarkeitReqRef.current?.abort()
    const ac = new AbortController()
    verfuegbarkeitReqRef.current = ac
    setVerfuegbarkeit({ kind: 'loading' })
    fetch('/api/kfzgutachter-lp/gutachter-verfuegbar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeId: p.placeId }),
      signal: ac.signal,
    })
      .then(async (r) => {
        const data = (await r.json()) as
          | { ok: true; count: number; gutachter: GutachterProfil[] }
          | { ok: false; error: string }
        if (!data.ok) {
          setVerfuegbarkeit({ kind: 'err' })
          return
        }
        setVerfuegbarkeit({
          kind: 'ok',
          count: data.count,
          gutachter: data.gutachter ?? [],
        })
        trackLpEvent('select_promotion', {
          event_label: `popover-verfuegbar-${data.count}`,
        })
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return
        setVerfuegbarkeit({ kind: 'err' })
      })
  }

  function uebernehmen() {
    if (!presetStadt) return
    if (typeof window === 'undefined' || !window.google?.maps) {
      // Maps-Script noch nicht da — als Fallback weiterklicken, der
      // Server-Submit nimmt die Stadt als Plain-Text-City entgegen.
      trackLpEvent('select_promotion', {
        event_label: 'popover-standort-uebernehmen-no-maps',
      })
      setPresetActive(false)
      next()
      return
    }
    trackLpEvent('select_promotion', {
      event_label: `popover-standort-uebernehmen-${presetStadt}`,
    })
    const geocoder = new window.google.maps.Geocoder()
    geocoder.geocode(
      { address: `${presetStadt}, Deutschland`, region: 'de' },
      (results, status) => {
        if (
          status === window.google.maps.GeocoderStatus.OK &&
          results &&
          results[0]
        ) {
          const r = results[0]
          triggerVerfuegbarkeitFor({
            placeId: r.place_id,
            description: r.formatted_address,
          })
        } else {
          // Geocoder-Fail: Preset-Modus verlassen, User kann manuell
          // weiter eingeben oder direkt Weiter klicken.
          setPresetActive(false)
          trackLpEvent('select_promotion', {
            event_label: `popover-standort-uebernehmen-geocode-fail-${status}`,
          })
        }
      },
    )
  }

  function pickFahrzeug(id: FahrzeugArt) {
    setFahrzeug(id)
    trackLpEvent('select_promotion', {
      event_label: `popover-fahrzeug-${id}`,
    })
    // Aaron 2026-05-19: Step 1 hat nur noch 2 Optionen → Auto-Advance auf
    // Step 2 sofort beim Klick, kein "Weiter"-Button mehr.
    setStep(2)
  }

  function next() {
    if (step === 1 && !fahrzeug) return
    if (step === 2 && !standort.trim()) return
    if (step === 2) {
      trackLpEvent('select_promotion', {
        event_label: 'popover-standort-set',
      })
    }
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s))
  }

  function back() {
    // Step-3 mit ausgeklapptem Callback-Form: erst zurück zur Choice
    if (step === 3 && mode === 'callback') {
      setMode('choice')
      return
    }
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s))
  }

  function callNow() {
    trackLpEvent('phone_call', { event_label: 'popover-step3-call' })
  }

  function chooseCallback() {
    setMode('callback')
    trackLpEvent('select_promotion', {
      event_label: 'popover-step3-callback-chosen',
    })
  }

  function submitCallback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!cbName.trim() || !cbPhone.trim()) {
      setError('Bitte Name und Telefonnummer angeben')
      return
    }
    const fd = new FormData()
    fd.set('name', cbName)
    fd.set('phone', cbPhone)
    fd.set('city', standort || 'NRW')
    fd.set('fahrzeug', fahrzeug ?? 'sonstiges')
    if (selectedPlace) fd.set('place_id', selectedPlace.placeId)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      for (const k of [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
      ]) {
        const v = params.get(k)
        if (v) fd.set(k, v)
      }
    }
    startTransition(async () => {
      const r = await submitKfzgutachterLead(fd)
      if (r.ok) {
        setSubmitted(true)
        trackLpEvent('generate_lead', {
          event_label: 'popover-step3-callback',
        })
      } else {
        setError(r.error ?? 'Übermittlung fehlgeschlagen')
      }
    })
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o && !submitted) {
          trackLpEvent('select_promotion', {
            event_label: `popover-dismiss-step${step}`,
          })
        }
      }}
    >
      <DialogPrimitive.Portal>
        {/* Full-bleed Backdrop: Navy-Tint + Blur — zieht den Fokus auf das Modal */}
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-claimondo-navy/65 duration-200 backdrop-blur-md data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />

        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-ios-lg border border-white/60 bg-white/95 p-5 shadow-glass-card outline-none backdrop-blur-md duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 sm:max-w-md sm:p-7">
          <DialogPrimitive.Close
            aria-label="Schließen"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-claimondo-shield/60 transition-colors hover:bg-claimondo-bg hover:text-claimondo-navy"
          >
            <X className="h-4 w-4" aria-hidden />
          </DialogPrimitive.Close>

          {submitted ? (
            <SuccessView name={cbName} onClose={() => setOpen(false)} />
          ) : (
            <>
              <StepIndicator current={step} />
              <DialogPrimitive.Title
                className="mt-3 text-xl font-bold leading-tight text-claimondo-navy sm:text-2xl"
                style={{
                  fontFamily: 'Montserrat, system-ui, sans-serif',
                }}
              >
                {step === 1 && 'Welches Fahrzeug ist betroffen?'}
                {step === 2 && 'Wo steht das Fahrzeug?'}
                {step === 3 && 'Wie sollen wir Sie kontaktieren?'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-claimondo-shield/80">
                {step === 1 &&
                  'Damit wir den passenden Gutachter zuweisen.'}
                {step === 2 && 'PLZ oder Adresse — wir kommen NRW-weit.'}
                {step === 3 &&
                  'Anruf in 15 Minuten oder lieber wir melden uns?'}
              </DialogPrimitive.Description>

              <div className="mt-5">
                {step === 1 && (
                  <FahrzeugStep
                    selected={fahrzeug}
                    onPick={pickFahrzeug}
                  />
                )}
                {step === 2 && (
                  <StandortStep
                    value={standort}
                    onChange={(v) => {
                      setStandort(v)
                      setSelectedPlace(null)
                      setVerfuegbarkeit({ kind: 'idle' })
                      // User hat angefangen zu tippen → Preset-Modus
                      // verlassen, Button-Label wechselt auf "Weiter".
                      if (presetActive) setPresetActive(false)
                    }}
                    onSelectPlace={(p) => {
                      setStandort(p.description)
                      setSelectedPlace(p)
                      trackLpEvent('select_promotion', {
                        event_label: 'popover-standort-place-picked',
                      })
                      // Verfügbarkeits-Lookup feuern. Vorherigen Request
                      // abbrechen falls der User schnell mehrere Picks macht.
                      verfuegbarkeitReqRef.current?.abort()
                      const ac = new AbortController()
                      verfuegbarkeitReqRef.current = ac
                      setVerfuegbarkeit({ kind: 'loading' })
                      fetch('/api/kfzgutachter-lp/gutachter-verfuegbar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ placeId: p.placeId }),
                        signal: ac.signal,
                      })
                        .then(async (r) => {
                          const data = (await r.json()) as
                            | {
                                ok: true
                                count: number
                                gutachter: GutachterProfil[]
                              }
                            | { ok: false; error: string }
                          if (!data.ok) {
                            setVerfuegbarkeit({ kind: 'err' })
                            return
                          }
                          setVerfuegbarkeit({
                            kind: 'ok',
                            count: data.count,
                            gutachter: data.gutachter ?? [],
                          })
                          trackLpEvent('select_promotion', {
                            event_label: `popover-verfuegbar-${data.count}`,
                          })
                        })
                        .catch((e) => {
                          if ((e as Error).name === 'AbortError') return
                          setVerfuegbarkeit({ kind: 'err' })
                        })
                    }}
                    onEnterSubmit={next}
                    verfuegbarkeit={verfuegbarkeit}
                  />
                )}
                {step === 3 && (
                  <KontaktStep
                    mode={mode}
                    onCall={callNow}
                    onChooseCallback={chooseCallback}
                    cbName={cbName}
                    setCbName={setCbName}
                    cbPhone={cbPhone}
                    setCbPhone={setCbPhone}
                    onSubmit={submitCallback}
                    pending={pending}
                    error={error}
                  />
                )}
              </div>

              {/* Nav-Buttons — versteckt im Callback-Sub-Form, weil das eine eigene Submit-CTA hat */}
              {/* Nav-Buttons:
                  - Step 1: keine — Klick auf Fahrzeug-Karte advanced direkt
                  - Step 3 mit Callback-Form: eigene Submit-CTA
                  - sonst Zurück + Weiter */}
              {!(step === 3 && mode === 'callback') && step !== 1 && (
                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={back}
                    className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-claimondo-shield transition-colors hover:bg-claimondo-bg hover:text-claimondo-navy"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Zurück
                  </button>

                  {step < 3 && (() => {
                    // Step 2 mit Preset-Stadt aus ?cid=: solange der User
                    // sie nicht ueberschrieben hat und noch kein Place
                    // ausgewaehlt wurde, zeigt der Button "Uebernehmen"
                    // und triggert Geocoder + Verfuegbarkeits-Check.
                    const isUebernehmen =
                      step === 2 && presetActive && !selectedPlace
                    return (
                      <button
                        type="button"
                        onClick={isUebernehmen ? uebernehmen : next}
                        disabled={step === 2 && !standort.trim()}
                        className="inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy px-6 py-2.5 text-sm font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isUebernehmen ? 'Übernehmen' : 'Weiter'}
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </button>
                    )
                  })()}
                </div>
              )}
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── Step-Indicator ────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`Schritt ${current} von 3`}
    >
      {([1, 2, 3] as const).map((n) => (
        <div
          key={n}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            n <= current ? 'bg-claimondo-navy' : 'bg-claimondo-border'
          }`}
        />
      ))}
    </div>
  )
}

// ─── Step 1: Fahrzeug ──────────────────────────────────────────────

function FahrzeugStep({
  selected,
  onPick,
}: {
  selected: FahrzeugArt | null
  onPick: (id: FahrzeugArt) => void
}) {
  // Aaron 2026-05-19: nur noch 2 Optionen (Auto + Motorrad/Roller),
  // grid-cols-2 statt 3, groessere Card-Flaeche fuer leichteren Mobile-Tap.
  // Klick advanced direkt zu Step 2 (pickFahrzeug → setStep(2) im Parent).
  return (
    <div className="grid grid-cols-2 gap-3">
      {FAHRZEUG_TYPEN.map(({ id, Icon }) => {
        const active = selected === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onPick(id)}
            aria-pressed={active}
            className={`flex flex-col items-center justify-center gap-2 rounded-ios-md border-2 p-5 text-sm font-semibold transition-all hover:-translate-y-0.5 active:scale-[0.97] ${
              active
                ? 'border-claimondo-navy bg-claimondo-navy text-white shadow-claimondo-md'
                : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo hover:shadow-claimondo-md'
            }`}
          >
            <Icon className="h-8 w-8" aria-hidden />
            {FAHRZEUG_LABEL[id]}
          </button>
        )
      })}
    </div>
  )
}

// ─── Step 2: Standort mit Google Places Autocomplete ──────────────
//
// Eigenes Dropdown im Claimondo-Glass-Design statt des Google-Default-
// Widgets — Aaron-Wunsch "in unserem Design". Suggestions kommen aus
// AutocompleteService.getPlacePredictions (legacy aber stabil), pro
// Keystroke 200 ms debounced, country=DE, types=geocode (PLZ + Adressen
// abdecken).
//
// Wenn Maps-Script nicht laedt (kein Key, Network-Failure, gesperrte
// Domain): Fallback auf reines Textinput — Wizard bleibt funktional.

function useGooglePlacesScript(): boolean {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.google?.maps?.places) {
      setLoaded(true)
      return
    }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!key) {
      console.warn('[popover] NEXT_PUBLIC_GOOGLE_MAPS_KEY fehlt — Autocomplete fällt auf Plain-Input zurück')
      return
    }

    const SCRIPT_ID = 'kfz-lp-google-maps-places'
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      // Script wird gerade von anderer Instanz geladen — pollen
      const poll = window.setInterval(() => {
        if (window.google?.maps?.places) {
          setLoaded(true)
          window.clearInterval(poll)
        }
      }, 100)
      return () => window.clearInterval(poll)
    }

    const s = document.createElement('script')
    s.id = SCRIPT_ID
    s.async = true
    s.defer = true
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=de&region=DE`
    s.onload = () => setLoaded(true)
    s.onerror = () => console.warn('[popover] google-maps-places script load failed')
    document.head.appendChild(s)
  }, [])

  return loaded
}

function StandortStep({
  value,
  onChange,
  onSelectPlace,
  onEnterSubmit,
  verfuegbarkeit,
}: {
  value: string
  onChange: (v: string) => void
  onSelectPlace: (place: Place) => void
  onEnterSubmit: () => void
  verfuegbarkeit: VerfuegbarkeitState
}) {
  const mapsLoaded = useGooglePlacesScript()
  const [suggestions, setSuggestions] = useState<Place[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const debounceRef = useRef<number | null>(null)
  // Cache für die zweizeilige Darstellung (main + secondary) — wird beim
  // Predictions-Callback befüllt, beim Render verbraucht.
  const structuredCacheRef = useRef<
    Map<string, { main: string; secondary: string }>
  >(new Map())
  // Suppress: nach pick() schreibt onSelectPlace die description in den
  // Input — der nachfolgende value-Change würde sonst sofort eine neue
  // Predictions-Query feuern und das Dropdown wieder öffnen.
  const suppressNextQueryRef = useRef(false)

  // AutocompleteService initialisieren sobald Maps-Script geladen ist.
  useEffect(() => {
    if (!mapsLoaded || !window.google?.maps?.places) return
    serviceRef.current = new window.google.maps.places.AutocompleteService()
    sessionTokenRef.current =
      new window.google.maps.places.AutocompleteSessionToken()
  }, [mapsLoaded])

  // Suggestion-Query bei jedem Tastenanschlag, debounced.
  useEffect(() => {
    if (suppressNextQueryRef.current) {
      suppressNextQueryRef.current = false
      return
    }
    if (!serviceRef.current) {
      setSuggestions([])
      return
    }
    const q = value.trim()
    if (q.length < 2) {
      setSuggestions([])
      setDropdownOpen(false)
      return
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      serviceRef.current!.getPlacePredictions(
        {
          input: q,
          componentRestrictions: { country: 'de' },
          types: ['geocode'],
          language: 'de',
          sessionToken: sessionTokenRef.current ?? undefined,
        },
        (preds, status) => {
          if (
            status !== window.google.maps.places.PlacesServiceStatus.OK ||
            !preds
          ) {
            setSuggestions([])
            setDropdownOpen(false)
            return
          }
          const next = preds.slice(0, 5).map((p) => ({
            placeId: p.place_id,
            description: p.description,
            main: p.structured_formatting?.main_text ?? p.description,
            secondary: p.structured_formatting?.secondary_text ?? '',
          }))
          setSuggestions(next.map(({ placeId, description }) => ({ placeId, description })))
          // Cache structured texts via state-local map — siehe rendering.
          structuredCacheRef.current = new Map(next.map((n) => [n.placeId, n]))
          setDropdownOpen(true)
          setHighlighted(0)
        },
      )
    }, 200)

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [value])

  function pick(p: Place) {
    suppressNextQueryRef.current = true
    onSelectPlace(p)
    setDropdownOpen(false)
    setSuggestions([])
    // Session-Token rotiert nach Auswahl (Google billing-best-practice)
    sessionTokenRef.current = window.google?.maps?.places
      ? new window.google.maps.places.AutocompleteSessionToken()
      : null
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (dropdownOpen && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlighted((i) => Math.min(i + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlighted((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const choice = suggestions[highlighted]
        if (choice) pick(choice)
        return
      }
      if (e.key === 'Escape') {
        setDropdownOpen(false)
        return
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      onEnterSubmit()
    }
  }

  const listboxId = 'popover-standort-listbox'

  // Aaron 2026-05-19: "Genauen Standort verwenden" — Browser-Geolocation
  // + Reverse-Geocode via google.maps.Geocoder (Maps-Script ist eh
  // schon geladen fuer das Autocomplete). Bei Success: setzt die
  // gleiche Place-Struktur wie ein Autocomplete-Pick (placeId +
  // description), sodass die Verfuegbarkeits-Pipeline transparent
  // weiterläuft (kein API-Schema-Change noetig).
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'denied' | 'unavailable'>('idle')

  function useMyLocation() {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGeoState('unavailable')
      return
    }
    if (!window.google?.maps) {
      // Maps-Script noch nicht geladen — Edge-Case wenn der User
      // sofort tippt+klickt bevor das Script ankommt. Fallback: einfach
      // den Plain-Standort-String setzen.
      setGeoState('unavailable')
      return
    }
    setGeoState('loading')
    trackLpEvent('select_promotion', {
      event_label: 'popover-standort-geo-request',
    })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        const geocoder = new window.google.maps.Geocoder()
        geocoder.geocode(
          { location: { lat, lng } },
          (results, status) => {
            if (
              status === window.google.maps.GeocoderStatus.OK &&
              results &&
              results[0]
            ) {
              const r = results[0]
              const placeId = r.place_id
              const description = r.formatted_address
              setGeoState('idle')
              if (placeId) {
                onSelectPlace({ placeId, description })
              } else {
                // Sehr selten: Geocode-Result ohne place_id → wenigstens
                // den Text setzen, damit der User weiterklicken kann.
                onChange(description)
              }
            } else {
              setGeoState('unavailable')
              trackLpEvent('select_promotion', {
                event_label: `popover-standort-geo-geocode-fail-${status}`,
              })
            }
          },
        )
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoState('denied')
          trackLpEvent('select_promotion', {
            event_label: 'popover-standort-geo-denied',
          })
        } else {
          setGeoState('unavailable')
          trackLpEvent('select_promotion', {
            event_label: `popover-standort-geo-error-${err.code}`,
          })
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor="popover-standort"
        className="text-xs font-semibold text-claimondo-shield"
      >
        Standort des Fahrzeugs
      </label>
      <div className="relative">
        <MapPin
          className="pointer-events-none absolute left-3 top-[1.1rem] h-4 w-4 -translate-y-1/2 text-claimondo-shield/60"
          aria-hidden
        />
        <input
          id="popover-standort"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setDropdownOpen(true)}
          onBlur={() => {
            // Delay, damit ein Klick auf eine Suggestion noch durchgeht
            window.setTimeout(() => setDropdownOpen(false), 150)
          }}
          placeholder={mapsLoaded ? 'z. B. Hauptstraße 1, 50667 Köln' : 'z. B. 50667 Köln'}
          autoComplete="off"
          autoFocus
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={dropdownOpen && suggestions.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={
            dropdownOpen && suggestions[highlighted]
              ? `${listboxId}-${highlighted}`
              : undefined
          }
          className="w-full rounded-ios-md border border-claimondo-border bg-white py-3 pl-9 pr-4 text-base text-claimondo-navy transition-all focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/20"
        />
        {dropdownOpen && suggestions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-10 mt-1.5 overflow-hidden rounded-ios-md border border-white/60 bg-white/95 shadow-glass-card backdrop-blur-md"
          >
            {suggestions.map((s, i) => {
              const struct = structuredCacheRef.current.get(s.placeId)
              const main = struct?.main ?? s.description
              const secondary = struct?.secondary ?? ''
              const active = i === highlighted
              return (
                <li
                  key={s.placeId}
                  id={`${listboxId}-${i}`}
                  role="option"
                  aria-selected={active}
                  // onMouseDown statt onClick, damit das Blur nicht
                  // zuerst feuert und das Dropdown schließt
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(s)
                  }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`cursor-pointer border-b border-claimondo-border/60 px-3.5 py-2.5 last:border-b-0 transition-colors ${
                    active ? 'bg-claimondo-bg' : 'bg-transparent'
                  }`}
                >
                  <div className="truncate text-sm font-semibold text-claimondo-navy">
                    {main}
                  </div>
                  {secondary && (
                    <div className="truncate text-xs text-claimondo-shield/70">
                      {secondary}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {/* Geo-Button — alternative zum Tippen, ein-Klick-Pfad fuer Mobile-User */}
      <button
        type="button"
        onClick={useMyLocation}
        disabled={geoState === 'loading'}
        className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-claimondo-ondo transition-colors hover:text-claimondo-navy disabled:opacity-60"
      >
        {geoState === 'loading' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <LocateFixed className="h-3.5 w-3.5" aria-hidden />
        )}
        {geoState === 'loading'
          ? 'Standort wird abgerufen …'
          : 'Genauen Standort verwenden'}
      </button>
      {geoState === 'denied' && (
        <p className="text-[11px] text-claimondo-shield/70">
          Standort-Zugriff abgelehnt — bitte oben manuell eingeben.
        </p>
      )}
      {geoState === 'unavailable' && (
        <p className="text-[11px] text-claimondo-shield/70">
          Standort konnte nicht ermittelt werden — bitte oben manuell
          eingeben.
        </p>
      )}
      <VerfuegbarkeitCard state={verfuegbarkeit} />
      <p className="text-[11px] leading-relaxed text-claimondo-shield/70">
        Wir kommen NRW-weit. Mobile Besichtigung kostenfrei.
      </p>
    </div>
  )
}

// ─── Verfügbarkeits-Indikator ────────────────────────────────────
//
// Wird angezeigt sobald der User eine Adresse aus dem Autocomplete
// picked — feuert /api/kfzgutachter-lp/gutachter-verfuegbar mit der
// place_id, der Endpoint löst lat/lng und zählt SVs deren Isochrone
// den Punkt umfasst. State-Maschine: idle → loading → ok|err.
// Wahrnehmungs-Effekt: bei loading wird mindestens 600 ms gewartet,
// damit der User die Berechnung sieht ("System sucht aktiv").

function VerfuegbarkeitCard({ state }: { state: VerfuegbarkeitState }) {
  if (state.kind === 'idle') return null

  if (state.kind === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2.5 rounded-ios-md border border-claimondo-border bg-claimondo-bg px-3.5 py-2.5"
      >
        <Loader2
          className="h-4 w-4 flex-shrink-0 animate-spin text-claimondo-ondo"
          aria-hidden
        />
        <span className="text-sm font-semibold text-claimondo-navy">
          Sachverständige in Ihrer Region werden gesucht …
        </span>
      </div>
    )
  }

  if (state.kind === 'err') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2.5 rounded-ios-md border border-amber-200 bg-amber-50 px-3.5 py-2.5"
      >
        <AlertCircle
          className="h-4 w-4 flex-shrink-0 text-amber-600"
          aria-hidden
        />
        <span className="text-xs leading-snug text-amber-900">
          Verfügbarkeit wird im nächsten Schritt geprüft.
        </span>
      </div>
    )
  }

  // Ok-Fall
  const count = state.count
  const gutachter = state.gutachter
  if (count === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2.5 rounded-ios-md border border-claimondo-border bg-claimondo-bg px-3.5 py-2.5"
      >
        <Users
          className="h-4 w-4 flex-shrink-0 text-claimondo-shield"
          aria-hidden
        />
        <span className="text-xs leading-snug text-claimondo-shield">
          Wir vermitteln Sie an einen Partner-Gutachter in Ihrer Region.
        </span>
      </div>
    )
  }

  // Aggregat-Rating über die zurueckgelieferten Profile: nur die mit Reviews
  // einbeziehen, gewichtet nach Anzahl Bewertungen.
  const reviewed = gutachter.filter(
    (g) =>
      g.bewertungs_durchschnitt != null && (g.bewertungs_anzahl ?? 0) > 0,
  )
  const totalReviews = reviewed.reduce(
    (s, g) => s + (g.bewertungs_anzahl ?? 0),
    0,
  )
  const aggRating =
    totalReviews > 0
      ? reviewed.reduce(
          (s, g) =>
            s + (g.bewertungs_durchschnitt ?? 0) * (g.bewertungs_anzahl ?? 0),
          0,
        ) / totalReviews
      : null

  // Stadt-Hint: wenn alle gesampleten SVs aus derselben Stadt kommen,
  // konkretisieren wir "in Ihrer Region" → "im Großraum {Stadt}".
  // Sonst neutral lassen.
  const distinctStaedte = new Set(
    gutachter.map((g) => g.stadt).filter((s): s is string => Boolean(s)),
  )
  const regionLabel =
    distinctStaedte.size === 1
      ? `im Großraum ${[...distinctStaedte][0]}`
      : 'in Ihrer Region'

  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-2.5 rounded-ios-md border border-emerald-200 bg-emerald-50/80 px-3.5 py-3"
    >
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-4 w-4 flex-shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <CheckCircle2
            className="relative h-4 w-4 text-emerald-600"
            aria-hidden
          />
        </span>
        <span className="text-sm font-semibold leading-snug text-emerald-900">
          {count === 1 ? (
            <>
              <strong>1 Sachverständiger</strong> {regionLabel} verfügbar
            </>
          ) : (
            <>
              <strong>{count} Sachverständige</strong> {regionLabel} verfügbar
            </>
          )}
        </span>
      </div>

      {gutachter.length > 0 && (
        <div className="flex items-center justify-between gap-3 pt-0.5">
          <GutachterAvatarStack gutachter={gutachter} extraCount={Math.max(0, count - gutachter.length)} />
          {aggRating != null && (
            <RatingPill rating={aggRating} total={totalReviews} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Avatar-Stack + Rating ─────────────────────────────────────────

function GutachterAvatarStack({
  gutachter,
  extraCount,
}: {
  gutachter: GutachterProfil[]
  extraCount: number
}) {
  return (
    <div className="flex items-center gap-2">
      <ul className="flex items-center -space-x-2.5">
        {gutachter.map((g, i) => (
          <li
            key={g.id}
            className="relative h-9 w-9 overflow-hidden rounded-full border-2 border-emerald-50 bg-claimondo-bg ring-1 ring-emerald-200"
            style={{ zIndex: gutachter.length - i }}
            title={
              [
                g.vorname_initiale ?? null,
                g.stadt ?? null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Sachverständiger'
            }
          >
            {g.avatar_url ? (
              <Image
                src={g.avatar_url}
                alt={`Sachverständige(r) ${g.vorname_initiale ?? ''} ${g.stadt ?? ''}`.trim()}
                fill
                sizes="36px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm font-bold text-claimondo-navy">
                {g.vorname_initiale ?? '?'}
              </span>
            )}
          </li>
        ))}
        {extraCount > 0 && (
          <li
            className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-emerald-50 bg-claimondo-navy text-[10px] font-bold text-white ring-1 ring-emerald-200"
            style={{ zIndex: 0 }}
            title={`und ${extraCount} weitere`}
          >
            +{extraCount}
          </li>
        )}
      </ul>
      <div className="flex flex-col leading-tight">
        {gutachter[0]?.vorname_initiale && (
          <span className="text-xs font-semibold text-claimondo-navy">
            {gutachter
              .map((g) => g.vorname_initiale)
              .filter(Boolean)
              .slice(0, 2)
              .join(', ')}
            {gutachter.length > 2 ? ' …' : ''}
          </span>
        )}
        {gutachter[0]?.stadt && (
          <span className="text-[11px] text-claimondo-shield/70">
            {[
              ...new Set(
                gutachter.map((g) => g.stadt).filter(Boolean) as string[],
              ),
            ]
              .slice(0, 2)
              .join(' · ')}
          </span>
        )}
      </div>
    </div>
  )
}

function RatingPill({ rating, total }: { rating: number; total: number }) {
  return (
    <div
      className="flex flex-shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-white/90 px-2 py-1"
      title={`Google-Bewertungen: Ø ${rating.toFixed(1)} aus ${total} Rezensionen`}
    >
      <Star
        className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
        aria-hidden
      />
      <span className="text-[11px] font-bold leading-none text-claimondo-navy">
        {rating.toFixed(1)}
      </span>
      <span className="text-[10px] leading-none text-claimondo-shield/70">
        ({total})
      </span>
    </div>
  )
}

// ─── Step 3: Kontakt-Decision ─────────────────────────────────────

function KontaktStep({
  mode,
  onCall,
  onChooseCallback,
  cbName,
  setCbName,
  cbPhone,
  setCbPhone,
  onSubmit,
  pending,
  error,
}: {
  mode: Step3Mode
  onCall: () => void
  onChooseCallback: () => void
  cbName: string
  setCbName: (v: string) => void
  cbPhone: string
  setCbPhone: (v: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  pending: boolean
  error: string | null
}) {
  if (mode === 'choice') {
    return (
      <div className="space-y-3">
        <a
          href={TEL_HREF}
          onClick={onCall}
          data-tracking="popover-call"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-claimondo-navy px-5 py-3.5 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98]"
        >
          <Phone className="h-5 w-5" aria-hidden />
          Jetzt anrufen — {TEL_DISPLAY}
        </a>
        <button
          type="button"
          onClick={onChooseCallback}
          className="w-full rounded-full border border-claimondo-border bg-white px-5 py-3 text-sm font-semibold text-claimondo-navy transition-colors hover:bg-claimondo-bg"
        >
          Lieber Rückruf erhalten
        </button>
        <p className="pt-1 text-center text-[11px] text-claimondo-shield/70">
          Rückruf in unter 15 Minuten. 0 € für Unverschuldete.
        </p>
      </div>
    )
  }
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-2.5">
      <div>
        <label
          htmlFor="popover-cb-name"
          className="mb-1 block text-xs font-semibold text-claimondo-shield"
        >
          Ihr Name
        </label>
        <input
          id="popover-cb-name"
          type="text"
          value={cbName}
          onChange={(e) => setCbName(e.target.value)}
          autoComplete="name"
          autoFocus
          required
          placeholder="Max Mustermann"
          className="w-full rounded-ios-md border border-claimondo-border bg-white px-3.5 py-2.5 text-base text-claimondo-navy focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/20"
        />
      </div>
      <div>
        <label
          htmlFor="popover-cb-phone"
          className="mb-1 block text-xs font-semibold text-claimondo-shield"
        >
          Telefonnummer
        </label>
        <input
          id="popover-cb-phone"
          type="tel"
          value={cbPhone}
          onChange={(e) => setCbPhone(e.target.value)}
          autoComplete="tel"
          inputMode="tel"
          required
          placeholder="0151 12345678"
          className="w-full rounded-ios-md border border-claimondo-border bg-white px-3.5 py-2.5 text-base text-claimondo-navy focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/20"
        />
      </div>
      {error && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="mt-2 w-full rounded-full bg-claimondo-navy px-5 py-3 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98] disabled:opacity-70"
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Senden …
          </span>
        ) : (
          'Rückruf anfordern'
        )}
      </button>
    </form>
  )
}

// ─── Success ───────────────────────────────────────────────────────

function SuccessView({
  name,
  onClose,
}: {
  name: string
  onClose: () => void
}) {
  const firstName = name.split(/\s+/)[0]
  return (
    <div className="py-4 text-center">
      <CheckCircle2
        className="mx-auto h-12 w-12 text-emerald-500"
        aria-hidden
      />
      <h2
        className="mt-3 text-xl font-bold text-claimondo-navy"
        style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
      >
        Danke{firstName ? `, ${firstName}` : ''}!
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-claimondo-shield">
        Ein Berater ruft Sie in <strong>unter 15 Minuten</strong> zurück.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-5 inline-flex items-center justify-center rounded-full bg-claimondo-navy px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-claimondo-shield"
      >
        Schließen
      </button>
    </div>
  )
}
