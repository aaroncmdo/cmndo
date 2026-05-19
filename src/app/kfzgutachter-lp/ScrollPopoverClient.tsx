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
import {
  Car,
  Truck,
  Bike,
  Caravan,
  HelpCircle,
  Phone,
  MapPin,
  ArrowLeft,
  ArrowRight,
  X,
  CheckCircle2,
  Loader2,
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

const FAHRZEUG_LABEL = {
  pkw: 'PKW',
  transporter: 'Transporter',
  lkw: 'LKW',
  motorrad: 'Motorrad',
  wohnmobil: 'Wohnmobil',
  sonstiges: 'Sonstiges',
} as const
type FahrzeugArt = keyof typeof FAHRZEUG_LABEL

const FAHRZEUG_TYPEN: { id: FahrzeugArt; Icon: LucideIcon }[] = [
  { id: 'pkw', Icon: Car },
  { id: 'transporter', Icon: Truck },
  { id: 'lkw', Icon: Truck },
  { id: 'motorrad', Icon: Bike },
  { id: 'wohnmobil', Icon: Caravan },
  { id: 'sonstiges', Icon: HelpCircle },
]

type Step = 1 | 2 | 3
type Step3Mode = 'choice' | 'callback'

type Place = {
  placeId: string
  description: string
}

export function ScrollPopoverClient() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [fahrzeug, setFahrzeug] = useState<FahrzeugArt | null>(null)
  const [standort, setStandort] = useState('')
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const [mode, setMode] = useState<Step3Mode>('choice')
  const [cbName, setCbName] = useState('')
  const [cbPhone, setCbPhone] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Scroll-Trigger — einmalig pro Session, kurze Arm-Karenz damit
  // Anchor-Deeplinks (Page lädt schon mitten in der Seite) nicht
  // sofort triggern.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem(SESSION_FLAG_KEY) === '1') return

    let armed = false
    const armTimer = window.setTimeout(() => {
      armed = true
    }, ARM_DELAY_MS)

    function onScroll() {
      if (!armed) return
      const total =
        document.documentElement.scrollHeight - window.innerHeight
      if (total <= 0) return
      const pct = window.scrollY / total
      if (pct >= SCROLL_TRIGGER_PCT) {
        try {
          sessionStorage.setItem(SESSION_FLAG_KEY, '1')
        } catch {
          // Storage gesperrt (Privatmodus) — wir geben auf, kein
          // Spam-Risiko weil onScroll nach Open weg ist.
        }
        setOpen(true)
        trackLpEvent('view_promotion', {
          event_label: 'scroll-popover-26pct',
        })
        window.removeEventListener('scroll', onScroll)
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(armTimer)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  function pickFahrzeug(id: FahrzeugArt) {
    setFahrzeug(id)
    trackLpEvent('select_promotion', {
      event_label: `popover-fahrzeug-${id}`,
    })
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
                    }}
                    onSelectPlace={(p) => {
                      setStandort(p.description)
                      setSelectedPlace(p)
                      trackLpEvent('select_promotion', {
                        event_label: 'popover-standort-place-picked',
                      })
                    }}
                    onEnterSubmit={next}
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
              {!(step === 3 && mode === 'callback') && (
                <div className="mt-6 flex items-center justify-between gap-3">
                  {step > 1 ? (
                    <button
                      type="button"
                      onClick={back}
                      className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-claimondo-shield transition-colors hover:bg-claimondo-bg hover:text-claimondo-navy"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                      Zurück
                    </button>
                  ) : (
                    <span />
                  )}

                  {step < 3 && (
                    <button
                      type="button"
                      onClick={next}
                      disabled={
                        (step === 1 && !fahrzeug) ||
                        (step === 2 && !standort.trim())
                      }
                      className="inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy px-6 py-2.5 text-sm font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Weiter
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  )}
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
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {FAHRZEUG_TYPEN.map(({ id, Icon }) => {
        const active = selected === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onPick(id)}
            aria-pressed={active}
            className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-ios-md border-2 p-2 text-xs font-semibold transition-all active:scale-[0.97] ${
              active
                ? 'border-claimondo-navy bg-claimondo-navy text-white shadow-claimondo-md'
                : 'border-claimondo-border bg-white text-claimondo-shield hover:border-claimondo-ondo hover:text-claimondo-navy'
            }`}
          >
            <Icon className="h-6 w-6" aria-hidden />
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
}: {
  value: string
  onChange: (v: string) => void
  onSelectPlace: (place: Place) => void
  onEnterSubmit: () => void
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

  // AutocompleteService initialisieren sobald Maps-Script geladen ist.
  useEffect(() => {
    if (!mapsLoaded || !window.google?.maps?.places) return
    serviceRef.current = new window.google.maps.places.AutocompleteService()
    sessionTokenRef.current =
      new window.google.maps.places.AutocompleteSessionToken()
  }, [mapsLoaded])

  // Suggestion-Query bei jedem Tastenanschlag, debounced.
  useEffect(() => {
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
      <p className="text-[11px] leading-relaxed text-claimondo-shield/70">
        Wir kommen NRW-weit. Mobile Besichtigung kostenfrei.
      </p>
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
