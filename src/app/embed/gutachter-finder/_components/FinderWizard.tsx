'use client'

// AAR-956 WS4 — Gutachter-Finder-Wizard (location-first, Aaron 11.06.).
// Step 1 Besichtigungsort (wo steht das Auto — die Engine matcht GENAU darauf) →
// Step 2 Schaden → Step 3 Kontakt → Submit (gfa mit Ort+Schaden+Kontakt → Token) →
// Step 4 Slot-Picker (<FlowSlotStep>, echter Engine-Inline-Termin) → Step 5 Bestaetigung.
// Marketing-Look (GlassSurface + claimondo-Tokens), DE-only mit echten Umlauten.
// Reuse: FlowSlotStep (+SvSlotAuswahl) + die /flow-Actions via Token — kein Neubau,
// kein Extraktions-Move (Cross-Import von @/app/flow/[token]/* ist im Repo etabliert).

import { useState, useTransition } from 'react'
import { ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { FlowSlotStep, type GebuchterTermin } from '@/app/flow/[token]/FlowSlotStep'
import { Button } from '@/components/primitives'
import { GlassSurface } from './GlassSurface'
import { starteEmbedBuchung } from '../actions'

type Ort = { adresse: string; lat: number; lng: number }
type Phase = 'ort' | 'schaden' | 'kontakt' | 'slot' | 'gebucht'

// clamp-freundliche Werte (issueCanonical.clampSchadentyp matcht via Substring:
// auffahr/park/spur/vorfahr → sonst sonstiges).
const SCHADEN_OPTIONEN = ['Auffahrunfall', 'Parkschaden', 'Spurwechsel', 'Vorfahrtsverletzung', 'Sonstiger Schaden']

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/70">{label}</span>
      <input
        {...props}
        className="w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none"
      />
    </label>
  )
}

export function FinderWizard() {
  const [phase, setPhase] = useState<Phase>('ort')
  const [ort, setOrt] = useState<Ort | null>(null)
  const [schadentyp, setSchadentyp] = useState<string | null>(null)
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [dsgvo, setDsgvo] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [gebucht, setGebucht] = useState<GebuchterTermin | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function kontaktAbsenden(e: React.FormEvent) {
    e.preventDefault()
    setFehler(null)
    if (!ort || !schadentyp) return
    if (vorname.trim().length < 2 || nachname.trim().length < 2) return setFehler('Bitte Vor- und Nachnamen angeben.')
    if (telefon.trim().length < 5) return setFehler('Bitte eine gültige Telefonnummer angeben.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setFehler('Bitte eine gültige E-Mail-Adresse angeben.')
    if (!dsgvo) return setFehler('Bitte der Datenverarbeitung zustimmen.')
    startTransition(async () => {
      const res = await starteEmbedBuchung({
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        telefon: telefon.trim(),
        email: email.trim(),
        schadentyp,
        ort,
      })
      if (!res.ok) return setFehler(res.error || 'Es ist ein Fehler aufgetreten. Bitte erneut versuchen.')
      setToken(res.token)
      setPhase('slot')
    })
  }

  const stepIdx = phase === 'ort' ? 0 : phase === 'schaden' ? 1 : 2

  return (
    <GlassSurface className="flex flex-col gap-4 p-5">
      {(phase === 'ort' || phase === 'schaden' || phase === 'kontakt') && (
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-claimondo-ondo' : 'bg-claimondo-border'}`} />
          ))}
        </div>
      )}

      {phase === 'ort' && (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-body font-bold text-claimondo-navy">Wo steht das Fahrzeug?</h3>
            <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
              Wir finden den passenden Gutachter in Ihrer Nähe.
            </p>
          </div>
          <GooglePlaceAutocomplete
            placeholder="Adresse eingeben…"
            className="w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy placeholder-claimondo-shield/50 transition-colors focus:border-claimondo-ondo focus:outline-none"
            onSelect={(p: PlaceResult) => {
              setOrt({ adresse: p.adresse, lat: p.lat, lng: p.lng })
              // Auto-Marker + Zoom auf der Karte (FinderMap hört auf das Event).
              if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('claimondo:embed-ort', { detail: { lat: p.lat, lng: p.lng } }))
              }
              setPhase('schaden')
            }}
          />
        </div>
      )}

      {phase === 'schaden' && (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-body font-bold text-claimondo-navy">Was ist passiert?</h3>
            <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">Wählen Sie die Schadenart.</p>
          </div>
          <div className="flex flex-col gap-2">
            {SCHADEN_OPTIONEN.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setSchadentyp(opt)
                  setPhase('kontakt')
                }}
                className="flex items-center justify-between gap-2 rounded-ios-md border border-claimondo-border bg-white/70 px-4 py-3 text-left text-body-sm font-semibold text-claimondo-navy transition-colors hover:border-claimondo-ondo"
              >
                {opt}
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-claimondo-shield/60" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPhase('ort')}
            className="inline-flex items-center gap-1 self-start text-[0.8125rem] font-semibold text-claimondo-shield/70 hover:text-claimondo-ondo"
          >
            <ChevronLeft className="h-4 w-4" /> Zurück
          </button>
        </div>
      )}

      {phase === 'kontakt' && (
        <form onSubmit={kontaktAbsenden} className="flex flex-col gap-3">
          <div>
            <h3 className="text-body font-bold text-claimondo-navy">Ihre Kontaktdaten</h3>
            <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">Damit wir den Termin mit Ihnen bestätigen können.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} autoComplete="given-name" />
            <Field label="Nachname" value={nachname} onChange={(e) => setNachname(e.target.value)} autoComplete="family-name" />
          </div>
          <Field label="Telefon" type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} autoComplete="tel" placeholder="+49 …" />
          <Field label="E-Mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="name@beispiel.de" />
          <label className="flex items-start gap-2 text-[0.75rem] leading-relaxed text-claimondo-shield/80">
            <input
              type="checkbox"
              checked={dsgvo}
              onChange={(e) => setDsgvo(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-claimondo-ondo"
            />
            <span>Ich willige ein, dass Claimondo mich zur Schadenabwicklung kontaktiert.</span>
          </label>
          {fehler && (
            <p className="rounded-ios-md bg-danger-soft px-3 py-2 text-[0.8125rem] text-danger-strong">{fehler}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setPhase('schaden')}
              className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-claimondo-shield/70 hover:text-claimondo-ondo"
            >
              <ChevronLeft className="h-4 w-4" /> Zurück
            </button>
            <Button type="submit" loading={pending} variant="navy">
              Weiter zur Terminbuchung
            </Button>
          </div>
        </form>
      )}

      {phase === 'slot' && token && (
        <FlowSlotStep
          token={token}
          onGebucht={(t) => {
            setGebucht(t)
            setPhase('gebucht')
          }}
        />
      )}

      {phase === 'gebucht' && gebucht && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <h3 className="text-body font-bold text-claimondo-navy">Termin gebucht</h3>
          <p className="text-[0.8125rem] leading-relaxed text-claimondo-shield/80">
            {gebucht.svVorname} kommt am{' '}
            {new Date(gebucht.startIso).toLocaleString('de-DE', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            Uhr zur Begutachtung.
          </p>
        </div>
      )}
    </GlassSurface>
  )
}
