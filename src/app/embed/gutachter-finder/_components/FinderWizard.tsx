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

import { useEffect, useRef, useState, useTransition } from 'react'
import { ChevronRight, ChevronLeft, CheckCircle2, Clock, Phone } from 'lucide-react'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { SvSlotAuswahl } from '@/components/self-service/SvSlotAuswahl'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
import { AufnahmeFlowHinweis } from '@/components/shared/AufnahmeFlowHinweis'
import { MaklerEmpfehlungBadge } from '@/components/shared/MaklerEmpfehlungBadge'
import { Button } from '@/components/primitives'
import { GlassSurface } from './GlassSurface'
import { ladeEmbedMatching, reserviereEmbedTermin, bucheRueckrufBeimDispatcher } from '../actions'
import { track, reservierungConversion, rueckrufConversion } from '../_lib/tracking'
import { DeadPinSlotStep } from './DeadPinSlotStep'
import { WunschterminPicker } from './WunschterminPicker'
import { resolveWerkstattOrt } from './werkstatt-ort'
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

/**
 * Welcher Partner-SV ist nach dem Matching vorausgewaehlt?
 *
 * Default ist der bestgerankte (`svs[0]`) — das war bis hierher die einzige Regel.
 * Kommt der Nutzer ueber einen Deep-Link (`?sv=<id>`, z.B. aus einer KI-Antwort, die
 * zuvor `GET /api/v1/gutachter-termine` gelesen hat), soll GENAU der dort genannte
 * Gutachter vorausgewaehlt sein — sonst landet der Kunde bei einem anderen als dem,
 * der ihm im Chat empfohlen wurde.
 *
 * ⚠ Bewusst nur, wenn die ID im aktuellen Matching-Ergebnis VORKOMMT: Zwischen der
 * KI-Antwort und dem Klick koennen Minuten liegen; der SV kann ausgelastet, deaktiviert
 * oder ausserhalb des eingegebenen Orts sein. Eine ID ins Blaue zu setzen wuerde eine
 * leere Auswahl erzeugen. Faellt sie durch, greift still der normale Default — der
 * Nutzer sieht eine gueltige Liste statt eines Fehlers.
 */
function waehleVorauswahl(
  svs: { svId: string }[],
  gewuenscht: string | null | undefined,
): string | null {
  if (gewuenscht && svs.some((s) => s.svId === gewuenscht)) return gewuenscht
  return svs[0]?.svId ?? null
}

export function FinderWizard({
  forceFallback = false,
  werkstattId,
  werkstattName,
  werkstattGeo,
  promotionCodeId,
  schaetzungSessionId,
  ownerProfilId = null,
  vorauswahlSvId = null,
  vorauswahlSlotStart = null,
}: {
  forceFallback?: boolean
  /** AAR-956 Task 7: opake Werkstatt-ID (aus /start/werkstatt/[id]). Wird 1:1 an
   * reserviereEmbedTermin weitergereicht → landet auf dem Lead/Claim.
   * Task 10 wird werkstattName + werkstattGeo fuer die „Auto bei Werkstatt?"-UI nutzen. */
  werkstattId?: string
  werkstattName?: string
  werkstattGeo?: { lat: number; lng: number; adresse: string }
  /** Makler-Vermittlung: Promo-Code-ID des vermittelnden Maklers → reserviereEmbedTermin → lead.promotion_code_id. */
  promotionCodeId?: string | null
  /** Anspruch-pruefen: Session-Token der Schaetzung → reserviereEmbedTermin → Lead-Verknuepfung. */
  schaetzungSessionId?: string | null
  /** Relationaler Owner-Boost (Ebene 2): profiles.id des attribuierenden Owners (aus dem
   *  Werkstatt-Einstieg resolveVermittlerOwnerProfil). Gesetzt → dessen zahlende Freund-SVs
   *  ranken im Matching oben (imNetzwerk-Badge). null (Default, anon-Embed) = kein Boost. */
  ownerProfilId?: string | null
  /** GEO-Deep-Link (`?sv=<id>`): profiles.id des Gutachters, den eine KI-Antwort
   *  (oder ein Verzeichnis-Link) bereits genannt hat. Ist er im Matching-Ergebnis,
   *  wird er statt des bestgerankten vorausgewaehlt — siehe waehleVorauswahl().
   *  Keine Buchung, kein Write: der Kunde bestaetigt weiterhin selbst. */
  vorauswahlSvId?: string | null
  /** GEO-Deep-Link (`?slot=<ISO-Start>`): der Termin, den die KI-Antwort genannt hat.
   *  Nur zusammen mit vorauswahlSvId wirksam. Trifft er zu, springt der Wizard direkt
   *  zur Schadensangabe — sonst bleibt die normale Terminauswahl stehen. */
  vorauswahlSlotStart?: string | null
} = {}) {
  const [phase, setPhase] = useState<Phase>('ort')
  const [ort, setOrt] = useState<Ort | null>(null)
  // AAR-956 Task 10: Werkstatt-Frage — null=noch nicht beantwortet, 'nein'=eigene Adresse zeigen.
  // 'ja' führt direkt zum Matching-Step (werkstattGeo als Ort), braucht keinen State.
  const [werkstattAntwort, setWerkstattAntwort] = useState<'nein' | null>(null)
  // AAR-956 (Aaron 14.06.): Adress-Eingabe als Vollbild-Overlay auf Mobil (Dropdown-Platz).
  const [ortOverlay, setOrtOverlay] = useState(false)
  // Wunschtermin (Aaron 12.06.: „oben angeben") — Berlin-Wall-Clock aus <input datetime-local>,
  // optional; rankt die Partner-Slots in Schritt 2 (Engine matchType 'wunschtermin').
  const [wunschterminLokal, setWunschterminLokal] = useState('')
  // Step 2: token-loses Engine-Matching (Partner-Slots ODER Dead-Pin-Fallback).
  const [matching, setMatching] = useState<PlaneTerminMitFallbackResult | null>(null)
  const [matchLoading, setMatchLoading] = useState(false)
  // AAR-956 (Aaron 14.06.): monoton steigende Match-Request-ID — nur die jüngste
  // ladeEmbedMatching-Antwort darf den State setzen (Stale-Race-Guard bei schnellem Ort-Wechsel:
  // eine späte Antwort eines früheren Orts überschrieb sonst das aktuelle Matching).
  const matchReqRef = useRef(0)
  // Die Slot-Vorauswahl aus dem Deep-Link darf GENAU EINMAL greifen. Ohne diese Sperre
  // wuerde jeder erneute Matching-Lauf (Ortwechsel, Wunschtermin, "zurueck zur Terminwahl")
  // den Kunden wieder nach vorn katapultieren — er kaeme nie an die Terminliste heran.
  const slotVorauswahlVerbrauchtRef = useRef(false)
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null)
  const [selectedSvId, setSelectedSvId] = useState<string | null>(null)
  const [selectedDeadPinId, setSelectedDeadPinId] = useState<string | null>(null)
  const [schadentyp, setSchadentyp] = useState<string | null>(null)
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [dsgvo, setDsgvo] = useState(false)
  const [gebucht, setGebucht] = useState<{
    /** Ops-Test RC-1: true = Termin steht wirklich in der DB. false = Anfrage, die
     *  Dispatch noch bestaetigen muss. Vorher zeigte die Danke-Seite immer "reserviert". */
    bestaetigt: boolean
    svVorname: string | null
    ortLabel: string | null
    startIso: string | null
    dispatcher: { vorname: string; avatarUrl: string | null; beschreibung: string | null } | null
    gutachter: { vorname: string; avatarUrl: string | null; firma: string | null; googleDurchschnitt: number | null; googleAnzahl: number | null; googleAktualisiertAm: string | null } | null
  } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [slotWeg, setSlotWeg] = useState(false)
  const [pending, startTransition] = useTransition()
  // Rückruf/Beratungsgespräch beim Dispatcher (Danke-Seite, Aaron 12.06.): Token nach der
  // Buchung (Kunde kennt ihn eh per WA), gewählte Wunschzeit, Buchungs-Status.
  const [buchungToken, setBuchungToken] = useState<string | null>(null)
  const [buchungLeadId, setBuchungLeadId] = useState<string | null>(null)
  const [rueckrufZeit, setRueckrufZeit] = useState('')
  const [rueckrufGebucht, setRueckrufGebucht] = useState(false)
  const [rueckrufFehler, setRueckrufFehler] = useState<string | null>(null)
  const [rueckrufPending, startRueckrufTransition] = useTransition()

  // gf_shown einmal feuern — der Wizard rendert 2× (Desktop-Sidebar + Mobile-Sheet), window-Guard
  // verhindert den Doppel-Count.
  useEffect(() => {
    const w = window as Window & { __gfShown?: boolean }
    if (w.__gfShown) return
    w.__gfShown = true
    track('gf_shown')
  }, [])

  // AAR-956 Final-Review: werkstattAntwort bei werkstattId-Prop-Wechsel zuruecksetzen
  // (SPA-Reuse: Werkstatt A→B wuerde sonst das „Nein" von A behalten und B's Frage ueberspringen).
  // embed-Pfad: werkstattId=undefined+stabil → laeuft einmal bei Mount, null→null, no-op.
  useEffect(() => { setWerkstattAntwort(null) }, [werkstattId])

  // AAR-956 Task 10: „Ja, in der Werkstatt" → werkstattGeo als Ort setzen und direkt zu Matching.
  // Nutzt resolveWerkstattOrt('ja', werkstattGeo, null) + ruft denselben Downstream-Pfad wie
  // ortGewaehlt() auf, nur ohne GooglePlace-Overhead (kein onSelect-Callback nötig).
  function ortMitWerkstatt() {
    if (!werkstattGeo) return
    const o = resolveWerkstattOrt('ja', werkstattGeo, null)
    if (!o) return
    setOrt(o)
    track('gf_ort_gewaehlt', { quelle: 'werkstatt' })
    dispatchOrt(o.lat, o.lng)
    setPhase('termin')
    setMatching(null)
    setAuswahl(null)
    setSelectedSvId(null)
    setSelectedDeadPinId(null)
    setMatchLoading(true)
    const req = ++matchReqRef.current
    void ladeEmbedMatching({ lat: o.lat, lng: o.lng, wunschterminLokal: wunschterminLokal || null, forceFallback, ownerProfilId }).then((res) => {
      if (matchReqRef.current !== req) return
      setMatching(res)
      setMatchLoading(false)
      if (res.kind === 'partner') setSelectedSvId(waehleVorauswahl(res.svs, vorauswahlSvId))
      else setSelectedDeadPinId(res.deadPins[0]?.deadPinId ?? null)
      versucheSlotVorauswahl(res)
    })
  }

  // Step 1 → 2: Ort gewählt → Karte informieren + token-loses Matching laden.
  function ortGewaehlt(p: PlaceResult) {
    const o = { adresse: p.adresse, lat: p.lat, lng: p.lng }
    setOrt(o)
    track('gf_ort_gewaehlt')
    dispatchOrt(o.lat, o.lng)
    setPhase('termin')
    setMatching(null)
    setAuswahl(null)
    setSelectedSvId(null)
    setSelectedDeadPinId(null)
    setMatchLoading(true)
    const req = ++matchReqRef.current
    void ladeEmbedMatching({ lat: o.lat, lng: o.lng, wunschterminLokal: wunschterminLokal || null, forceFallback, ownerProfilId }).then((res) => {
      if (matchReqRef.current !== req) return // veraltete Antwort eines früheren Orts ignorieren
      setMatching(res)
      setMatchLoading(false)
      // Default-Hervorhebung = der Top-Treffer (die Karte hat ihn beim Ort-Schritt schon geroutet).
      if (res.kind === 'partner') setSelectedSvId(waehleVorauswahl(res.svs, vorauswahlSvId))
      else setSelectedDeadPinId(res.deadPins[0]?.deadPinId ?? null)
      versucheSlotVorauswahl(res)
    })
  }

  // Step 2: Slot gewählt → merken + weiter zu Schaden (Reservierung erst am Ende).
  /**
   * Deep-Link-Abkuerzung: hat die KI-Antwort einen KONKRETEN Termin genannt
   * (`?sv=…&slot=<ISO>`), diesen direkt uebernehmen und zur Schadensangabe springen.
   *
   * Der Kunde spart damit den Schritt, den Termin erneut aus der Liste zu suchen — obwohl
   * er ihn im Chat schon gewaehlt hat. Er sieht die Auswahl auf den Folgeschritten und
   * kann jederzeit zurueck.
   *
   * ⚠ Drei Bedingungen, sonst passiert NICHTS (und die normale Terminauswahl bleibt
   * stehen): der Deep-Link muss beide Werte tragen, der Gutachter muss im aktuellen
   * Matching sein, und der Slot muss dort noch frei sein. Slots sind fluechtig — zwischen
   * KI-Antwort und Klick koennen Minuten liegen. Ein belegter Slot darf niemals zu einer
   * Fehlerseite fuehren, nur zur normalen Auswahl.
   */
  function versucheSlotVorauswahl(res: PlaneTerminMitFallbackResult) {
    if (slotVorauswahlVerbrauchtRef.current) return
    if (!vorauswahlSvId || !vorauswahlSlotStart) return
    if (res.kind !== 'partner') return
    const sv = res.svs.find((s) => s.svId === vorauswahlSvId)
    if (!sv) return
    // Zeitpunkt-Vergleich statt String-Vergleich: dieselbe Zeit kann als "…T09:00:00+02:00"
    // oder "…T07:00:00Z" geschrieben sein — ein String-Match wuerde sie fuer verschieden
    // halten und die Abkuerzung still verschlucken.
    const ziel = Date.parse(vorauswahlSlotStart)
    const slot = Number.isFinite(ziel)
      ? sv.slots.find((sl) => Date.parse(sl.start) === ziel)
      : undefined
    if (!slot) return
    slotVorauswahlVerbrauchtRef.current = true
    waehleSvSlot(sv, slot)
  }

  function waehleSvSlot(sv: OeffentlichesSvProfil, slot: SlotVorschlag) {
    setAuswahl({ kind: 'partner', sv, slot })
    setSelectedSvId(sv.svId)
    track('gf_termin_gewaehlt', { gutachter: 'partner' })
    setPhase('schaden')
  }
  function waehleDeadPinSlot(dp: DeadPinOeffentlich, slot: SlotVorschlag) {
    setAuswahl({ kind: 'deadpin', dp, slot })
    setSelectedDeadPinId(dp.deadPinId)
    track('gf_termin_gewaehlt', { gutachter: 'deadpin' })
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
      // Makler-Attribution: `m` aus der URL (der Funnel Tool -> Finder reicht ihn via
      // buildFinderHandoffUrl durch); reserviereEmbedTermin loest ihn server-seitig zu
      // promotion_code_id auf -> lead.promotion_code_id -> Provision.
      const maklerCode = new URLSearchParams(window.location.search).get('m')
      const res = await reserviereEmbedTermin({
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        telefon: telefon.trim(),
        email: email.trim(),
        schadentyp: schadentyp ?? 'Sonstiger Schaden',
        ort,
        wunschterminLokal: wunschterminLokal || null,
        werkstatt_id: werkstattId ?? null,
        promotion_code_id: promotionCodeId ?? null,
        maklerCode,
        schaetzungSessionId: schaetzungSessionId ?? null,
        // Herkunft, nicht Ergebnis: gesetzt, sobald der Kunde MIT einem `?sv=` hier
        // ankam — auch wenn er am Ende einen anderen Gutachter waehlt. Gebracht hat
        // ihn der Deeplink. Ohne diesen Marker ist eine KI-vermittelte Buchung im
        // Nachhinein nicht von einem normalen Website-Besuch zu unterscheiden.
        viaDeeplink: !!vorauswahlSvId,
        auswahl: auswahlPayload,
      })
      if (!res.ok) {
        setFehler(res.error || 'Es ist ein Fehler aufgetreten. Bitte erneut versuchen.')
        // Slot zwischenzeitlich vergeben → zurück zur Termin-Wahl (frisch laden).
        if (res.slotWeg && ort) setSlotWeg(true)
        return
      }
      setGebucht({ bestaetigt: res.bestaetigt, svVorname: res.svVorname, ortLabel: res.ortLabel, startIso: res.startIso, dispatcher: res.dispatcher, gutachter: res.gutachter })
      setBuchungToken(res.token)
      setBuchungLeadId(res.leadId)
      // Conversion (value-based, wie Monika): Reservierung = haftpflicht-Lead (100 €) + lead_id-Dedupe
      // + user_data (E-Mail/Telefon/Name → Enhanced Conversions for Leads). Feuert in dataLayer (GTM/
      // GA4/Ads) + Beacon. E-Mail ist das stärkste EC-Signal — alle Felder sind Pflicht im Formular.
      track('gf_anfrage_submit', reservierungConversion({
        leadId: res.leadId,
        telefon: telefon.trim(),
        email: email.trim(),
        vorname: vorname.trim(),
        nachname: nachname.trim(),
      }))
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
      const req = ++matchReqRef.current
      void ladeEmbedMatching({ lat: ort.lat, lng: ort.lng, wunschterminLokal: wunschterminLokal || null, forceFallback, ownerProfilId }).then((res) => {
        if (matchReqRef.current !== req) return // veraltete Antwort eines früheren Orts ignorieren
        setMatching(res)
        setMatchLoading(false)
        if (res.kind === 'partner') setSelectedSvId(waehleVorauswahl(res.svs, vorauswahlSvId))
        else setSelectedDeadPinId(res.deadPins[0]?.deadPinId ?? null)
      })
    }
  }

  // Danke-Seite: Rückruf/Beratungsgespräch beim zugewiesenen Dispatcher buchen (token = aus der
  // Buchung; Lead-Daten kennen wir schon → nur die Wunschzeit).
  function bucheRueckruf() {
    if (!buchungToken || !rueckrufZeit) {
      setRueckrufFehler('Bitte eine Wunschzeit wählen.')
      return
    }
    setRueckrufFehler(null)
    startRueckrufTransition(async () => {
      const r = await bucheRueckrufBeimDispatcher({ token: buchungToken, wunschzeitLokal: rueckrufZeit })
      if (r.ok) {
        setRueckrufGebucht(true)
        // Conversion: Rückruf = Beratungsgespräch (25 €), gleicher Lead (eigene Conversion-Action)
        // + user_data (EC) — Lead-Daten kennen wir aus dem Reservierungs-Step noch im State.
        track('gf_rueckruf', rueckrufConversion({
          leadId: buchungLeadId,
          telefon: telefon.trim(),
          email: email.trim(),
          vorname: vorname.trim(),
          nachname: nachname.trim(),
        }))
      } else setRueckrufFehler(r.error ?? 'Der Rückruf konnte nicht gebucht werden.')
    })
  }

  const stepIdx = phase === 'ort' ? 0 : phase === 'termin' ? 1 : phase === 'schaden' ? 2 : 3

  return (
    // AAR-956 (Aaron 14.06.): sanfter Load-Reveal — die Wizard-Card fährt beim Mount einmal
    // ein (fade + leichter slide-up). GlassSurface persistiert über Phasen → kein Re-Trigger
    // bei Step-Wechseln. Dezent, im Claimondo-Look.
    <GlassSurface className="flex flex-col gap-4 p-5 animate-in fade-in slide-in-from-bottom-3 duration-700 ease-out">
      {/* Makler-Empfehlung: wer ueber /m/<code> kam (URL `m`), sieht „Empfohlen von <Firma>"
          durchgehend bis zur Buchung. Self-contained (liest `m`); mb-0 gegen GlassSurface-gap. */}
      <MaklerEmpfehlungBadge className="mb-0" />
      {/* Kontinuitaets-Klammer: wer aus dem Foto-Tool kommt (schaetzungSessionId gesetzt),
          sieht dass Finder + Anspruchs-Pruefung EIN Vorgang sind (spiegelt den Tool-Banner P2).
          Nur auf dem Einstiegs-Schritt (ort), wie P2 nur auf 'foto'. mb-0: die GlassSurface ist
          flex/gap-4, der Default-mb-4 wuerde doppelt spacen. */}
      {schaetzungSessionId && phase === 'ort' ? (
        <AufnahmeFlowHinweis text="Weiter aus Ihrer Anspruchs-Prüfung: jetzt Gutachter & Termin." className="mb-0" />
      ) : null}
      {phase !== 'gebucht' && (
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-claimondo-ondo' : 'bg-claimondo-border'}`} />
          ))}
        </div>
      )}

      {phase === 'ort' && (
        <div className="flex flex-col gap-4">
          {/* Wunschtermin (optional) — immer oben im Ort-Schritt, VOR der Werkstatt-/Orts-Frage
              (Aaron 12.06. „oben angeben"). Muss AUCH im Werkstatt-„Ja"-Pfad eingebbar sein, sonst
              ginge er verloren — ortMitWerkstatt reicht wunschterminLokal an die Engine (Aaron 23.06.).
              Beeinflusst das Slot-Ranking in Schritt 2; leer = naechste freie Termine. */}
          <div>
            <h3 className="text-body font-bold text-claimondo-navy">Ihr Wunschtermin</h3>
            <p className="mt-0.5 mb-2 text-[0.8125rem] text-claimondo-shield/80">
              Optional — wählen Sie Ihren Wunschtag und die Uhrzeit.
            </p>
            <WunschterminPicker value={wunschterminLokal} onChange={setWunschterminLokal} />
          </div>
          {/* AAR-956 Task 10: Werkstatt-Frage — nur wenn werkstattId+werkstattGeo gesetzt UND
              noch keine Antwort gewählt. „Ja" → werkstattGeo als Besichtigungsort + direkt Matching.
              „Nein" → setzt werkstattAntwort='nein', zeigt danach die normale Orts-Eingabe.
              Ist werkstattId nicht gesetzt (embed-Pfad), rendert dieser Block NIE. */}
          {werkstattId && werkstattGeo && werkstattAntwort === null && (
            <div className="flex flex-col gap-3">
              <h3 className="text-body font-bold text-claimondo-navy">
                Steht das Fahrzeug noch bei {werkstattName ?? 'der Werkstatt'}?
              </h3>
              <p className="text-[0.8125rem] text-claimondo-shield/80">
                Wählen Sie, wo wir das Fahrzeug begutachten sollen.
              </p>
              <div className="flex flex-col gap-2">
                <Button variant="navy" fullWidth onClick={ortMitWerkstatt}>
                  Ja, in der Werkstatt
                </Button>
                <Button variant="ghost" fullWidth onClick={() => setWerkstattAntwort('nein')}>
                  Nein, woanders
                </Button>
              </div>
            </div>
          )}
          {/* Normale Orts-Eingabe: immer sichtbar wenn kein werkstattId-Gate greift ODER
              der Nutzer „Nein, woanders" gewählt hat. */}
          {(!werkstattId || !werkstattGeo || werkstattAntwort === 'nein') && (
          <div>
            <h3 className="text-body font-bold text-claimondo-navy">Wo steht das Fahrzeug?</h3>
            <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
              Wir finden den passenden Gutachter in Ihrer Nähe.
            </p>
            {/* Desktop: inline (Dropdown hat Platz). Mobil: Trigger → Vollbild-Overlay, sonst
                läuft Googles nach unten öffnendes pac-Dropdown aus dem Bottom-Sheet (Aaron 14.06.). */}
            <div className="hidden lg:block">
              <GooglePlaceAutocomplete
                placeholder="Adresse eingeben…"
                className="mt-2 w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy placeholder-claimondo-shield/50 transition-colors focus:border-claimondo-ondo focus:outline-none"
                onSelect={ortGewaehlt}
              />
            </div>
            <button
              type="button"
              onClick={() => setOrtOverlay(true)}
              className="lg:hidden mt-2 flex w-full items-center rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-left text-body-sm transition-colors focus:border-claimondo-ondo focus:outline-none"
            >
              {ort?.adresse ? (
                <span className="text-claimondo-navy">{ort.adresse}</span>
              ) : (
                <span className="text-claimondo-shield/50">Adresse eingeben…</span>
              )}
            </button>
            {ortOverlay && (
              <div className="lg:hidden fixed inset-0 z-[130] flex flex-col bg-white">
                <div className="flex items-center gap-3 border-b border-claimondo-border px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOrtOverlay(false)}
                    aria-label="Zurück"
                    className="-ml-1 flex h-8 w-8 items-center justify-center text-claimondo-navy"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <span className="text-body font-bold text-claimondo-navy">Wo steht das Fahrzeug?</span>
                </div>
                <div className="p-4">
                  <GooglePlaceAutocomplete
                    autoFocus
                    placeholder="Adresse eingeben…"
                    className="w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-3 text-body-sm text-claimondo-navy placeholder-claimondo-shield/50 focus:border-claimondo-ondo focus:outline-none"
                    onSelect={(p) => {
                      setOrtOverlay(false)
                      ortGewaehlt(p)
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          )}
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
          {/* Ein gruener Haken sagt "erledigt" — bei einer unbestaetigten Anfrage waere das
              dieselbe Luege wie der alte Bestaetigungstext (Ops-Test RC-1). */}
          {gebucht.bestaetigt ? (
            <CheckCircle2 className="h-12 w-12 text-success" />
          ) : (
            <Clock className="h-12 w-12 text-claimondo-ondo" />
          )}
          <h3 className="text-body font-bold text-claimondo-navy">
            {!gebucht.startIso
              ? 'Anfrage eingegangen'
              : gebucht.bestaetigt
                ? 'Termin bestätigt'
                : 'Terminanfrage eingegangen'}
          </h3>
          {/* Ops-Test RC-1: Der Text folgt dem tatsaechlichen Buchungs-Ausgang. Vorher stand hier
              immer "reserviert" — auch wenn die Buchung am Kalender des SV gescheitert war und
              gar kein Termin existierte. */}
          <p className="text-[0.8125rem] leading-relaxed text-claimondo-shield/80">
            {!gebucht.startIso ? (
              'Vielen Dank — unser Team meldet sich in Kürze telefonisch für die Terminvereinbarung.'
            ) : gebucht.bestaetigt ? (
              <>
                {gebucht.svVorname
                  ? `${gebucht.svVorname} kommt am`
                  : `Ihr Kfz-Gutachter${gebucht.ortLabel ? ` in ${gebucht.ortLabel}` : ''} kommt am`}{' '}
                {new Date(gebucht.startIso).toLocaleString('de-DE', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                Uhr.
              </>
            ) : (
              <>
                Sie haben{' '}
                {new Date(gebucht.startIso).toLocaleString('de-DE', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                Uhr angefragt
                {gebucht.svVorname ? ` bei ${gebucht.svVorname}` : ''}. Diese Zeit ist noch nicht
                bestätigt — wir prüfen sie und melden uns kurzfristig mit einer festen Zusage.
              </>
            )}
          </p>

          {/* AAR-956 (Aaron 16.06.): gewählter Gutachter als Profil-Card (Foto/Name/Firma + Google-
              Bewertung) — der Kunde sieht direkt, mit wem er den Termin hat (neben dem Ansprechpartner). */}
          {gebucht.gutachter && (
            <div className="mt-4 w-full rounded-ios-lg border border-claimondo-border bg-white/80 p-4 text-left shadow-glass-card">
              <div className="flex items-center gap-3">
                {gebucht.gutachter.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={gebucht.gutachter.avatarUrl}
                    alt={gebucht.gutachter.vorname}
                    className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-ondo text-heading-sm font-extrabold text-white">
                    {gebucht.gutachter.vorname.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/60">
                    Ihr Gutachter
                  </p>
                  <p className="truncate text-body font-bold text-claimondo-navy">{gebucht.gutachter.vorname}</p>
                  {gebucht.gutachter.firma && (
                    <p className="truncate text-[0.75rem] text-claimondo-shield/70">{gebucht.gutachter.firma}</p>
                  )}
                </div>
                {gebucht.gutachter.googleDurchschnitt !== null && gebucht.gutachter.googleAnzahl !== null && (
                  <GoogleBewertungBadge
                    durchschnitt={gebucht.gutachter.googleDurchschnitt}
                    anzahl={gebucht.gutachter.googleAnzahl}
                    zuletztAktualisiert={gebucht.gutachter.googleAktualisiertAm}
                    size="sm"
                  />
                )}
              </div>
            </div>
          )}

          {/* AAR-956 (Aaron 14.06.): Handoff in den Self-Service-Lead — der Kunde vervollständigt den
              Schaden (Hergang/Fahrzeug/Vollmacht) im /flow. target=_top bricht aus dem Embed-iframe
              auf die volle /flow-Seite (app.claimondo.de) aus; die FlowLink-WA ist bewusst aus. */}
          {buchungToken && (
            <div className="mt-4 w-full">
              <a
                href={`/flow/${buchungToken}`}
                target="_top"
                className="inline-flex w-full items-center justify-center gap-2 rounded-ios-md bg-claimondo-navy px-5 py-3 text-body-sm font-semibold text-white transition-colors hover:bg-claimondo-ondo"
              >
                Schaden jetzt vervollständigen
                <ChevronRight className="h-4 w-4" />
              </a>
              <p className="mt-1.5 text-[0.75rem] text-claimondo-shield/60">
                Hergang, Fahrzeugdaten &amp; Vollmacht — dauert nur wenige Minuten.
              </p>
            </div>
          )}

          {/* Ansprechpartner (= dem Lead zugewiesener Dispatcher) als Profil-Card: Foto (avatar_url,
              sonst Initiale) + NUR Vorname öffentlich + Profilbeschreibung (alles im Portal unter
              /mitarbeiter/profil editierbar, in der DB) + Anruf-Button mit der normalen Rufnummer. */}
          {gebucht.dispatcher && (
            <div className="mt-4 w-full rounded-ios-lg border border-claimondo-border bg-white/80 p-4 text-left shadow-glass-card">
              <div className="flex items-center gap-3">
                {gebucht.dispatcher.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={gebucht.dispatcher.avatarUrl}
                    alt={gebucht.dispatcher.vorname}
                    className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-ondo text-heading-sm font-extrabold text-white">
                    {gebucht.dispatcher.vorname.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/60">
                    Ihr persönlicher Ansprechpartner
                  </p>
                  <p className="truncate text-body font-bold text-claimondo-navy">{gebucht.dispatcher.vorname}</p>
                  <p className="text-[0.75rem] text-claimondo-shield/70">Claimondo Schaden-Team</p>
                </div>
              </div>
              {gebucht.dispatcher.beschreibung && (
                <p className="mt-3 text-[0.8125rem] leading-relaxed text-claimondo-shield/80">
                  {gebucht.dispatcher.beschreibung}
                </p>
              )}
              <a
                href="tel:+4922198557270"
                onClick={() => track('phone_click', { context: 'danke_ansprechpartner' })}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-ios-md bg-claimondo-ondo px-4 py-2.5 text-body-sm font-semibold text-white transition-colors hover:bg-claimondo-navy"
              >
                <Phone className="h-4 w-4" /> Jetzt anrufen
              </a>
            </div>
          )}

          {/* Rückruf/Beratungsgespräch beim zugewiesenen Dispatcher buchen (Aaron 12.06.): wir
              kennen den Lead schon → der Kunde wählt NUR die Wunschzeit, der Rückruf landet als
              admin_termine (rueckruf) beim Dispatcher (/dispatch/rueckrufe). */}
          {gebucht.dispatcher && buchungToken && (
            <div className="mt-3 w-full rounded-ios-lg border border-claimondo-border bg-claimondo-bg/50 p-4 text-left">
              {rueckrufGebucht ? (
                <div className="flex items-center gap-2 text-[0.8125rem] font-semibold text-claimondo-navy">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-success" />
                  <span>Beratungsgespräch vereinbart — {gebucht.dispatcher.vorname} ruft Sie zurück.</span>
                </div>
              ) : (
                <>
                  <h4 className="text-body-sm font-bold text-claimondo-navy">Lieber persönlich beraten lassen?</h4>
                  <p className="mt-0.5 mb-2 text-[0.8125rem] text-claimondo-shield/80">
                    Wählen Sie eine Wunschzeit — {gebucht.dispatcher.vorname} ruft Sie für ein kostenloses
                    Beratungsgespräch zurück.
                  </p>
                  <WunschterminPicker value={rueckrufZeit} onChange={setRueckrufZeit} />
                  {rueckrufFehler && (
                    <p className="mt-2 rounded-ios-md bg-danger-soft px-3 py-2 text-[0.8125rem] text-danger-strong">
                      {rueckrufFehler}
                    </p>
                  )}
                  <Button onClick={bucheRueckruf} loading={rueckrufPending} variant="ondo" className="mt-3 w-full">
                    Rückruf vereinbaren
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </GlassSurface>
  )
}
