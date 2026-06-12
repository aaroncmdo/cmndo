'use client'

// AAR-956 WS4 + Reorder (Aaron 12.06.) — Gutachter-Finder-Wizard, location-first.
// Reihenfolge GEDREHT: Step 1 Besichtigungsort → Step 2 TERMIN direkt wählen → Step 3 Schaden
// → Step 4 Kontakt (zuletzt) → Submit reserviert den gewählten Termin → Step 5 Bestätigung.
//
// Der Clou: die Termin-Wahl (Step 2) ist TOKEN-LOS — `ladeEmbedMatching({lat,lng})` liefert
// das diskriminierte Engine-Matching nur aus dem Ort (Partner-Slots ODER Dead-Pin-Fallback).
// Der Nutzer wählt einen Slot (gemerkt, NICHT gebucht); die echte Reservierung passiert erst
// beim Kontakt-Submit (`reserviereEmbedTermin`: Lead anlegen → buchen → Kunde+Team-Bestätigung).
// Lead-Erstellung bleibt damit exakt wo sie war (Kontakt-Submit), nur die UI-Reihenfolge dreht sich.
//
// Marketing-Look (GlassSurface + claimondo-Tokens), DE-only mit echten Umlauten. Reuse:
// SvSlotAuswahl (Partner-Karten, geteilt mit /flow) + DeadPinSlotStep (Lite, Select-Mode).

import { useState, useTransition } from 'react'
import { ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { SvSlotAuswahl } from '@/components/self-service/SvSlotAuswahl'
import { Button } from '@/components/primitives'
import { GlassSurface } from './GlassSurface'
import { ladeEmbedMatching, reserviereEmbedTermin } from '../actions'
import { DeadPinSlotStep } from './DeadPinSlotStep'
import { WunschterminPicker } from './WunschterminPicker'
import type {
  DeadPinOeffentlich,
  OeffentlichesSvProfil,
  SlotVorschlag,
  PlaneTerminMitFallbackResult,
} from '@/lib/sv-matching-modul'

type Ort = { adresse: string; lat: number; lng: number }
type Phase = 'ort' | 'termin' | 'schaden' | 'kontakt' | 'gebucht'
type Auswahl =
  | { kind: 'partner'; sv: OeffentlichesSvProfil; slot: SlotVorschlag }
  | { kind: 'deadpin'; dp: DeadPinOeffentlich; slot: SlotVorschlag }

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

// Karte über das Event informieren: Ort gewählt (Auto-Pin + Route + Highlight nächster Treffer).
function dispatchOrt(lat: number, lng: number) {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('claimondo:embed-ort', { detail: { lat, lng } }))
  }
}
// Karte: der Nutzer hat einen Gutachter gewählt → dorthin routen + hervorheben.
function dispatchGutachterWahl(detail: Record<string, unknown>) {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('claimondo:embed-sv-selected', { detail }))
  }
}
// „YYYY-MM-DDTHH:MM" (Berlin-Wall-Clock) → deutsche Anzeige „Mo., 16.06., 14:00 Uhr".
function fmtWunsch(lokal: string): string {
  const d = new Date(lokal)
  if (Number.isNaN(d.getTime())) return ''
  return (
    d.toLocaleString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' Uhr'
  )
}

export function FinderWizard({ forceFallback = false }: { forceFallback?: boolean } = {}) {
  const [phase, setPhase] = useState<Phase>('ort')
  const [ort, setOrt] = useState<Ort | null>(null)
  // Wunschtermin (Aaron 12.06.: „oben angeben") — Berlin-Wall-Clock aus <input datetime-local>,
  // optional; rankt die Partner-Slots in Schritt 2 (Engine matchType 'wunschtermin').
  const [wunschterminLokal, setWunschterminLokal] = useState('')
  // Step 2: token-loses Engine-Matching (Partner-Slots ODER Dead-Pin-Fallback).
  const [matching, setMatching] = useState<PlaneTerminMitFallbackResult | null>(null)
  const [matchLoading, setMatchLoading] = useState(false)
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null)
  const [selectedSvId, setSelectedSvId] = useState<string | null>(null)
  const [selectedDeadPinId, setSelectedDeadPinId] = useState<string | null>(null)
  const [schadentyp, setSchadentyp] = useState<string | null>(null)
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [dsgvo, setDsgvo] = useState(false)
  const [gebucht, setGebucht] = useState<{ svVorname: string | null; ortLabel: string | null; startIso: string | null } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [slotWeg, setSlotWeg] = useState(false)
  const [pending, startTransition] = useTransition()

  // Step 1 → 2: Ort gewählt → Karte informieren + token-loses Matching laden.
  function ortGewaehlt(p: PlaceResult) {
    const o = { adresse: p.adresse, lat: p.lat, lng: p.lng }
    setOrt(o)
    dispatchOrt(o.lat, o.lng)
    setPhase('termin')
    setMatching(null)
    setAuswahl(null)
    setSelectedSvId(null)
    setSelectedDeadPinId(null)
    setMatchLoading(true)
    void ladeEmbedMatching({ lat: o.lat, lng: o.lng, wunschterminLokal: wunschterminLokal || null, forceFallback }).then((res) => {
      setMatching(res)
      setMatchLoading(false)
      // Default-Hervorhebung = der Top-Treffer (die Karte hat ihn beim Ort-Schritt schon geroutet).
      if (res.kind === 'partner') setSelectedSvId(res.svs[0]?.svId ?? null)
      else setSelectedDeadPinId(res.deadPins[0]?.deadPinId ?? null)
    })
  }

  // Step 2: Slot gewählt → merken + weiter zu Schaden (Reservierung erst am Ende).
  function waehleSvSlot(sv: OeffentlichesSvProfil, slot: SlotVorschlag) {
    setAuswahl({ kind: 'partner', sv, slot })
    setSelectedSvId(sv.svId)
    setPhase('schaden')
  }
  function waehleDeadPinSlot(dp: DeadPinOeffentlich, slot: SlotVorschlag) {
    setAuswahl({ kind: 'deadpin', dp, slot })
    setSelectedDeadPinId(dp.deadPinId)
    setPhase('schaden')
  }
  // 0 Verfügbarkeit → ohne Termin weiter (Team koordiniert telefonisch).
  function ohneTerminWeiter() {
    setAuswahl(null)
    setPhase('schaden')
  }

  // Step 4: Kontakt-Submit → Lead anlegen + gewählten Slot reservieren + Bestätigung.
  function kontaktAbsenden(e: React.FormEvent) {
    e.preventDefault()
    setFehler(null)
    setSlotWeg(false)
    if (!ort) return
    if (vorname.trim().length < 2 || nachname.trim().length < 2) return setFehler('Bitte Vor- und Nachnamen angeben.')
    if (telefon.trim().length < 5) return setFehler('Bitte eine gültige Telefonnummer angeben.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setFehler('Bitte eine gültige E-Mail-Adresse angeben.')
    if (!dsgvo) return setFehler('Bitte der Datenverarbeitung zustimmen.')

    const auswahlPayload =
      auswahl == null
        ? null
        : auswahl.kind === 'partner'
          ? {
              kind: 'partner' as const,
              svId: auswahl.sv.svId,
              svVorname: auswahl.sv.vorname,
              start: auswahl.slot.start,
              end: auswahl.slot.end,
            }
          : { kind: 'deadpin' as const, deadPinId: auswahl.dp.deadPinId, ort: auswahl.dp.ort, start: auswahl.slot.start }

    startTransition(async () => {
      const res = await reserviereEmbedTermin({
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        telefon: telefon.trim(),
        email: email.trim(),
        schadentyp: schadentyp ?? 'Sonstiger Schaden',
        ort,
        auswahl: auswahlPayload,
      })
      if (!res.ok) {
        setFehler(res.error || 'Es ist ein Fehler aufgetreten. Bitte erneut versuchen.')
        // Slot zwischenzeitlich vergeben → zurück zur Termin-Wahl (frisch laden).
        if (res.slotWeg && ort) setSlotWeg(true)
        return
      }
      setGebucht({ svVorname: res.svVorname, ortLabel: res.ortLabel, startIso: res.startIso })
      setPhase('gebucht')
    })
  }

  // zurück zur Termin-Wahl (z.B. Slot war weg) → frisch matchen.
  function zurueckZuTermin() {
    setFehler(null)
    setSlotWeg(false)
    setPhase('termin')
    if (ort) {
      setMatchLoading(true)
      void ladeEmbedMatching({ lat: ort.lat, lng: ort.lng, wunschterminLokal: wunschterminLokal || null, forceFallback }).then((res) => {
        setMatching(res)
        setMatchLoading(false)
        if (res.kind === 'partner') setSelectedSvId(res.svs[0]?.svId ?? null)
        else setSelectedDeadPinId(res.deadPins[0]?.deadPinId ?? null)
      })
    }
  }

  const stepIdx = phase === 'ort' ? 0 : phase === 'termin' ? 1 : phase === 'schaden' ? 2 : 3

  return (
    <GlassSurface className="flex flex-col gap-4 p-5">
      {phase !== 'gebucht' && (
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-claimondo-ondo' : 'bg-claimondo-border'}`} />
          ))}
        </div>
      )}

      {phase === 'ort' && (
        <div className="flex flex-col gap-4">
          {/* Wunschtermin (optional) — oben, vor dem Ort (Aaron 12.06.). Beeinflusst das
              Slot-Ranking in Schritt 2; leer = nächste freie Termine. */}
          <div>
            <h3 className="text-body font-bold text-claimondo-navy">Ihr Wunschtermin</h3>
            <p className="mt-0.5 mb-2 text-[0.8125rem] text-claimondo-shield/80">
              Optional — wählen Sie Ihren Wunschtag und die Uhrzeit.
            </p>
            <WunschterminPicker value={wunschterminLokal} onChange={setWunschterminLokal} />
          </div>
          <div>
            <h3 className="text-body font-bold text-claimondo-navy">Wo steht das Fahrzeug?</h3>
            <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
              Wir finden den passenden Gutachter in Ihrer Nähe.
            </p>
            <GooglePlaceAutocomplete
              placeholder="Adresse eingeben…"
              className="mt-2 w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy placeholder-claimondo-shield/50 transition-colors focus:border-claimondo-ondo focus:outline-none"
              onSelect={ortGewaehlt}
            />
          </div>
        </div>
      )}

      {phase === 'termin' && (
        <div className="flex flex-col gap-3">
          {/* Wunschtermin oben anzeigen (Aaron 12.06.) — sobald gesetzt. */}
          {wunschterminLokal && (
            <div className="flex items-center gap-2 rounded-ios-md bg-claimondo-bg px-3 py-2 text-[0.8125rem]">
              <span className="text-claimondo-shield/70">Ihr Wunschtermin:</span>
              <span className="font-semibold text-claimondo-navy">{fmtWunsch(wunschterminLokal)}</span>
            </div>
          )}
          {matchLoading || matching === null ? (
            <p className="py-6 text-center text-[0.8125rem] text-claimondo-shield/80">
              Wir suchen verfügbare Gutachter in Ihrer Nähe…
            </p>
          ) : matching.kind === 'partner' ? (
            <SvSlotAuswahl
              svs={matching.svs}
              fehler={null}
              onSlot={waehleSvSlot}
              onSvSelect={(sv) => {
                setSelectedSvId(sv.svId)
                dispatchGutachterWahl({ kind: 'partner', svId: sv.svId })
              }}
              selectedSvId={selectedSvId}
            />
          ) : matching.deadPins.length > 0 ? (
            <DeadPinSlotStep
              deadPins={matching.deadPins}
              onSelectSlot={waehleDeadPinSlot}
              selectedDeadPinId={selectedDeadPinId}
              onSelect={(dp) => {
                setSelectedDeadPinId(dp.deadPinId)
                dispatchGutachterWahl({ kind: 'deadpin', deadPinId: dp.deadPinId, lat: dp.lat, lng: dp.lng, ort: dp.ort })
              }}
            />
          ) : (
            <div className="py-3 text-center">
              <h3 className="text-body font-bold text-claimondo-navy">Wir melden uns telefonisch</h3>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-claimondo-shield/80">
                In Ihrer Nähe ist gerade kein Gutachter online verfügbar. Hinterlassen Sie Ihre Daten —
                unser Team meldet sich für die Terminvereinbarung.
              </p>
              <Button onClick={ohneTerminWeiter} variant="ondo" className="mt-4">
                Anfrage absenden
              </Button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setPhase('ort')}
            className="inline-flex items-center gap-1 self-start text-[0.8125rem] font-semibold text-claimondo-shield/70 hover:text-claimondo-ondo"
          >
            <ChevronLeft className="h-4 w-4" /> Anderer Ort
          </button>
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
            onClick={() => setPhase('termin')}
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
            <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
              {auswahl ? 'Damit wir Ihren Termin bestätigen können.' : 'Damit wir uns für die Terminvereinbarung melden können.'}
            </p>
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
            <div className="rounded-ios-md bg-danger-soft px-3 py-2 text-[0.8125rem] text-danger-strong">
              {fehler}
              {slotWeg && (
                <button type="button" onClick={zurueckZuTermin} className="ml-1 font-semibold underline">
                  Anderen Termin wählen
                </button>
              )}
            </div>
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
              {auswahl ? 'Termin reservieren' : 'Anfrage absenden'}
            </Button>
          </div>
        </form>
      )}

      {phase === 'gebucht' && gebucht && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <h3 className="text-body font-bold text-claimondo-navy">
            {gebucht.startIso ? 'Termin reserviert' : 'Anfrage eingegangen'}
          </h3>
          <p className="text-[0.8125rem] leading-relaxed text-claimondo-shield/80">
            {gebucht.startIso ? (
              <>
                {gebucht.svVorname
                  ? `${gebucht.svVorname} ist`
                  : `Ihr Kfz-Gutachter${gebucht.ortLabel ? ` in ${gebucht.ortLabel}` : ''} ist`}{' '}
                für{' '}
                {new Date(gebucht.startIso).toLocaleString('de-DE', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                Uhr reserviert. Wir bestätigen Ihren Termin in Kürze.
              </>
            ) : (
              'Vielen Dank — unser Team meldet sich in Kürze telefonisch für die Terminvereinbarung.'
            )}
          </p>
        </div>
      )}
    </GlassSurface>
  )
}
