'use client'

// /flow/[token] — der KANONISCHE Anon-Flow-Wizard (Token-Magic-Link, kein Auth-Cookie).
// AAR-956: §3a ergänzte den datengetriebenen incomplete-Pfad (Quali+Slot für termin-
// lose Self-Service-Leads), P4-A die Feststellung (deklarative Erfassung vor der SA).
// Eingeloggte User mit Fall werden in page.tsx zu /kunde/onboarding-details redirected
// (der DynamicWizard-Pfad); der Token-Anon-User läuft hier durch.
//
// HINWEIS: Der frühere "DEPRECATED / geplante Löschung 2026-05-26 / nur Bug-Fixes"-
// Vermerk ist ÜBERHOLT — dies ist der aktive, kanonische FlowLink-Renderer
// (server-flag-gegatet via CANONICAL_FLOWLINK_ENABLED). Neue Features sind hier ok.

import { useState, useRef, useEffect } from 'react'
import { autosaveFeststellung } from './autosave-feststellung'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createKundeAccount, updateLeadStammdaten, loginAfterFlowFormAction } from './actions'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { formatBerlin } from '@/lib/google-calendar/timezone'
// AAR-956 §3a: datengetriebener incomplete-Pfad (termin-loser Self-Service-Lead).
import { FlowQualiStep } from './FlowQualiStep'
import { FlowSlotStep, type GebuchterTermin } from './FlowSlotStep'
import TerminOfflineHinweis from './TerminOfflineHinweis'
import { aendereTerminFlow } from './self-service-actions'
import { BeratungsterminCard } from './BeratungsterminCard'
import { KaskoEndansicht } from '@/components/self-service/KaskoEndansicht'
import { FlowFeststellungStep } from './FlowFeststellungStep'
import { FlowWerkstattStep } from './FlowWerkstattStep'
import { istFeststellungsFeld } from '@/lib/self-service/feststellung-felder'
import FlowAiIntake from './FlowAiIntake'
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'
import type { OnboardingPhase, OnboardingFeld } from '@/components/onboarding/types'
import { FieldRenderer } from '@/components/onboarding/FieldRenderer'
import { meetsCondition } from './feststellung-steps'
import { useOnlineStatus } from '@/lib/offline/use-online-status'
import { enqueueOp } from '@/lib/offline/enqueue'
import {
  CheckIcon,
  CarIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  UserPlusIcon,
  UserIcon,
  PenToolIcon,
} from 'lucide-react'
import LegalDocPopover from '@/components/legal/LegalDocPopover'
import { SheetCard } from '@/components/shared/SheetCard'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
// FlowLink-Review C: fiktiv-Szenario-Badge im Sticky-Header.
import { FiktivAbrechnungBadge } from '@/components/shared/FiktivAbrechnungBadge'
import SaSignaturStep from './SaSignaturStep'
import SaOfflineHinweis from './SaOfflineHinweis'
import { liquidFieldBase } from '@/lib/styles/liquid-field'
import { FlowWerkstattHinweisHaftpflicht } from './FlowWerkstattHinweisHaftpflicht'
import { resolveFlowWeichen, type FlowWeichen } from '@/lib/self-service/flow-weichen'
import { bauFlowKontext, type LeadFuerKontext } from '@/lib/self-service/flow-kontext'
import type { FlowConfig } from '@/lib/self-service/lade-flow-szenarien'
import { FlowOrtStep } from './FlowOrtStep'
import { FlowWerkstattbindungStep } from './FlowWerkstattbindungStep'
import { FlowWerkstattAnzeige } from './FlowWerkstattAnzeige'
import { FlowRueckrufStep } from './FlowRueckrufStep'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeadData = {
  id: string
  vorname: string
  nachname: string
  email: string
  telefon: string
  schadens_fall_typ: string
  schadentyp: string | null
  schadentyp_freitext: string | null
  kunden_konstellation: string
  personenschaden_flag: boolean
  mietwagen_flag: boolean
  polizeibericht_pflicht: boolean
  polizei_vor_ort: boolean
  gutachter_termin: string | null
  kennzeichen: string
  fahrzeug_hersteller: string
  fahrzeug_modell: string
  fahrzeug_standort_adresse: string
  fahrzeug_standort_plz: string
  gegner_name: string
  gegner_versicherung: string
  unfallhergang: string
  // AAR-305: Fahrbereit-Flag (aus Dispatch Phase 1) entscheidet ob die
  // Mietwagen-Empfehlungs-Box im Weitere-Angaben-Step erscheint
  fahrzeug_fahrbereit?: boolean | null
  // AAR-336: bereits im Dispatch erfasst — readonly im FlowLink anzeigen
  unfall_konstellation?: string | null
  gegner_anzahl_beteiligte?: number | string | null
  gegner_fahrzeugtyp?: string | null
  // CMM-14: Service-Typ entscheidet ob auf der Erfolgsseite die LexDrive-
  // Visitenkarte erscheint (komplett) oder nicht (nur_gutachter).
  service_typ?: string | null
  // AAR-956 §3a: Self-Service-Quali-State (steuert den incomplete-Pfad).
  schuldfrage?: string | null
  disqualifiziert?: boolean | null
  // P4 UX: Vermittlung -> Logistik-Steps per Config-Bedingung ausgeblendet
  source_channel?: string | null
  // FlowLink-Review C: fiktiv-Szenario-Badge im Sticky-Header (Lead kommt via
  // select('*') aus page.tsx → alle Felder liegen vor).
  reparaturwunsch?: string | null
}

// AAR-336: Label-Maps wurden in next-intl Translations migriert (flow.step_summary.*).
// Lookup erfolgt jetzt via t('step_summary.unfall_konstellation.' + code) etc.

export type GutachterInfo = {
  vorname: string
  avatarUrl: string | null
  firma: string | null
  terminDatum: string | null
  // AAR-341: Besichtigungsort + SV-Treffpunkt für Schritt 2
  besichtigungsAdresse: string | null
  svTreffpunkt: string | null
  // CMM: Google-Bewertungs-Cache für Trust-Signal
  googleDurchschnitt: number | null
  googleAnzahl: number | null
  googleAktualisiertAm: string | null
  // AAR-956 18.06. (Aaron): Termin-Status fürs Card-Label (reserviert vs. bestätigt).
  terminStatus: string | null
  // AAR-360 Follow-up: Signed-URLs der SV-Datenschutz/Widerruf-PDFs für das Consent-Häkchen.
  datenschutzUrl: string | null
  widerrufUrl: string | null
}

// CMM-14: 4-Step Flow. Step 'weitere-angaben' (Werkstatt + Schadenfotos)
// wurde rausgenommen — Foto-Upload + Werkstatt-Erfassung gehören ins
// Onboarding nach Magic-Link-Login, nicht in den FlowLink.
// AAR-956 §3a: quali + termin nur im incomplete-Pfad (termin-loser Lead).
// Aaron 14.07.: Die Step-Sequenz kommt jetzt aus der DB (flow_szenario_steps) — diese Union ist nur
// noch der Vertrag darueber, welche step_id die UI rendern KANN. Ein neuer Step braucht damit genau
// zwei Dinge: eine Zeile in der Config und einen Render-Block hier.
type StepId =
  | 'zusammenfassung'
  | 'quali'
  | 'feststellung'
  | 'ort_besichtigung'
  | 'ort_fahrzeug'
  | 'werkstattbindung_check'
  | 'werkstatt'
  | 'werkstatt_anzeige'
  | 'termin'
  | 'gutachter'
  | 'rueckruf'
  | 'sa'
  | 'account'

const STEP_LABELS: Record<StepId, string> = {
  zusammenfassung: 'Zusammenfassung',
  quali: 'Schuldfrage',
  feststellung: 'Angaben',
  ort_besichtigung: 'Besichtigungsort',
  ort_fahrzeug: 'Fahrzeugstandort',
  werkstattbindung_check: 'Werkstattwahl',
  werkstatt: 'Werkstatt',
  werkstatt_anzeige: 'Ihre Werkstatt',
  termin: 'Termin',
  gutachter: 'Ihr Gutachter',
  rueckruf: 'Rückruf',
  sa: 'Beauftragung',
  account: 'Konto',
}

// STEPS + stepIndexById sind jetzt komponenten-lokal (dynamisch je needsBooking).

// ─── Schadentyp Labels migriert zu flow.step_summary.schadentyp.* in next-intl ──

// ─── Wizard ──────────────────────────────────────────────────────────────────

type LegalDoc = { slug: string; titel: string; markdown: string }
type LegalDocsProp = {
  agb: LegalDoc
  datenschutz: LegalDoc
  impressum: LegalDoc
  nutzungsbedingungen: LegalDoc
}

export default function FlowWizardKfz({
  token,
  flowLinkId,
  lead,
  gutachter,
  needsBooking,
  needsWerkstatt,
  weichen,
  flowConfig,
  hatSvTermin,
  terminPending,
  besichtigungsAdresse,
  feststellungPhasen,
  feststellungWerte,
  serviceFelder,
  serviceWerte,
  legalDocs,
  beratungstermin,
  kiIntakeAktiv = false,
  schemaIntake,
}: {
  token: string
  flowLinkId?: string | null
  lead: LeadData
  gutachter?: GutachterInfo | null
  // AAR-956 §3a: termin-loser Self-Service-Lead (server-seitig flag-gegatet
  // via CANONICAL_FLOWLINK_ENABLED). besichtigungsAdresse speist die gutachter-
  // Anzeige nach Client-seitiger Reservierung.
  needsBooking?: boolean
  // Reparaturwunsch/Werkstatt: server-gegated (CANONICAL_FLOWLINK_ENABLED + brauchtWerkstatt-
  // Vermittlung am Lead). Beim Mount gecappt (initialNeedsWerkstatt) wie needsBooking/hatFeststellung.
  needsWerkstatt?: boolean
  // Spec A (Aaron 14.07.): die EINE DB-getriebene Weiche, SERVERSEITIG aufgeloest — sie kennt
  // eigene_versicherung/freie_werkstattwahl, die der Client nie zu sehen bekam. Ersetzt die frueher
  // lossy Client-Rekonstruktion des Abrechnungswegs.
  weichen: FlowWeichen
  // Die Szenario-Matrix (flow_szenarien + flow_szenario_steps). Waehlt der Kunde die Schuldfrage erst
  // im Quali-Step, wechselt das Szenario — dann berechnet der Wizard die Step-Sequenz hiermit neu,
  // ohne Server-Roundtrip.
  flowConfig?: FlowConfig
  /** Ist bereits ein SV/Termin zugeordnet? (fuer die Neuberechnung nach dem Quali) */
  hatSvTermin?: boolean
  // AAR-956 16.06. (Aaron Wunschtermin-Modell): kein harter Termin, aber gewählter SV +
  // Wunschtermin → Gutachter-Step zeigt den Wunschtermin als "wird bestätigt" (kein Re-Pick).
  terminPending?: boolean
  besichtigungsAdresse?: string | null
  // AAR-956 P4-A: ① Feststellung — lead-erfassung(kunde)-Phasen + Initialwerte (server).
  feststellungPhasen?: OnboardingPhase[]
  feststellungWerte?: Record<string, unknown>
  /** KI-gefuehrtes Intake statt Formular am feststellung-Step (Rollout-Gate am SV,
   *  Default aus). Faellt bei Fehler/auf Wunsch auf den Formular-Step zurueck. */
  kiIntakeAktiv?: boolean
  /** Feld-Schema fuer das KI-Intake (dieselbe Quelle wie das Formular). */
  schemaIntake?: IntakeFeld[]
  // AAR-956 16.06. (Aaron): Service-/Kanzlei-Felder (service_typ + kanzlei_wunsch) + Werte —
  // gerendert im SA-/POS-Step (Kanzlei-Frage am Conversion-Punkt, nicht am Feststellung-Ende).
  serviceFelder?: OnboardingFeld[]
  serviceWerte?: Record<string, unknown>
  // legalDocs wird serverseitig übergeben — datenschutz + agb mit Titel/Markdown.
  legalDocs?: {
    datenschutz?: { titel: string; markdown: string }
    agb?: { titel: string; markdown: string }
  }
  // Auto-Beratungstermin (AAR-956): kb_beratung-Termin des Leads, gerendert als Karte im Abschluss-Step.
  beratungstermin?: { id: string; startZeit: string; status: string; kbVorname: string | null } | null
}) {
  const t = useTranslations('flow')
  // t() liefert bei fehlendem Key den Key-Pfad (truthy) statt null — daher has-Guard,
  // damit der Fallback fuer unbekannte/freitext-Codes wirklich greift.
  const tLabel = (key: string, fallback: string) =>
    t.has(key as Parameters<typeof t.has>[0]) ? t(key as Parameters<typeof t>[0]) : fallback
  const [stepIndex, setStepIndex] = useState(0)
  const [datenschutz, setDatenschutz] = useState(false)
  // Zusammenfassung-Weiter: statt disabled (toter Button ohne Grund) -> bei offenem
  // Pflichtpunkt aktiv hinweisen (Highlight + Scroll auf den Datenschutz-Block).
  const [zeigeWeiterHinweis, setZeigeWeiterHinweis] = useState(false)
  const datenschutzRef = useRef<HTMLDivElement>(null)
  const [svWiderrufOffen, setSvWiderrufOffen] = useState(false)
  const [svDatenschutzOffen, setSvDatenschutzOffen] = useState(false)
  // SA-Signatur-State lebt jetzt in <SaSignaturStep>. saSubmitting spiegelt dessen
  // submittingSA (onSubmittingChange) nur, um das service_typ-Feld während des
  // SA-Submits zu sperren (Parität zum früheren disabled={submittingSA}).
  const [saSubmitting, setSaSubmitting] = useState(false)
  const [fallId, setFallId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // AAR-956 §3a: frisch gebuchter Termin (incomplete-Pfad) — speist gutachter-Anzeige.
  const [gebuchterTermin, setGebuchterTermin] = useState<GebuchterTermin | null>(null)
  // AAR-956: Kunde hat den Termin-Step ohne Buchung übersprungen (kein_match/Skip) →
  // Erfolgsseite zeigt einen "Termin folgt"-Hinweis (SV wird via AAR-908 bei der SA zugeordnet).
  const [ohneTermin, setOhneTermin] = useState(false)
  // AAR-956 18.06. (Aaron): Termin/Gutachter im FlowLink ändern (kein read-only-Lock mehr).
  // umbuchen → Inline-Slot-Step (neuer SV+Termin); umgebucht → die frische Auswahl vor dem
  // (kurz stale) Server-Pick bevorzugen; dispatchAnfrage → bestätigter Termin geht an
  // Dispatch (Rückruf) statt Self-Service-Storno.
  const router = useRouter()
  const [umbuchen, setUmbuchen] = useState(false)
  const [umbuchenConfirm, setUmbuchenConfirm] = useState(false)
  const [umbuchenLoading, setUmbuchenLoading] = useState(false)
  const [umbuchenError, setUmbuchenError] = useState<string | null>(null)
  const [dispatchAnfrage, setDispatchAnfrage] = useState(false)
  const [umgebucht, setUmgebucht] = useState(false)

  async function handleUmbuchen() {
    setUmbuchenLoading(true)
    setUmbuchenError(null)
    const r = await aendereTerminFlow(token)
    setUmbuchenLoading(false)
    if (!r.ok) {
      setUmbuchenError(r.error ?? t('step_gutachter.aendern_fehler'))
      return
    }
    setUmbuchenConfirm(false)
    if (r.modus === 'dispatch_anfrage') setDispatchAnfrage(true)
    else setUmbuchen(true)
  }
  // AAR-956 16.06. (Aaron): Service-/Kanzlei-Wahl im SA-/POS-Step. Init aus dem Lead-Stand;
  // Autosave bei jeder Aenderung (autosaveFeststellung — mit Outbox-Rueckfall), damit signSAandCreateFall den
  // gewaehlten Service/Kanzlei vom Lead liest.
  const [serviceValues, setServiceValues] = useState<Record<string, unknown>>(serviceWerte ?? {})
  // Slice 2-write-1: debounced Online-Status fuer den Termin-Gate (Task 3) + die
  // Offline-Enqueue-Zweige. Enqueue-Entscheidung nutzt raw navigator.onLine (instant).
  const isOnline = useOnlineStatus()
  function setServiceFeld(key: string, val: unknown) {
    // ⚠ Der Save stand frueher IM State-Updater. Die Funktion in `setServiceValues(v => …)`
    // muss pur sein — React darf sie mehrfach aufrufen (StrictMode, Concurrent), was zu
    // doppelten Saves in unbestimmter Reihenfolge fuehrt. Jetzt: Wert aus dem aktuellen
    // State ableiten, State setzen, DANN den Nebeneffekt ausloesen.
    const next = { ...serviceValues, [key]: val }
    setServiceValues(next)
    // Nicht blockierend, aber bei Fehlschlag ueber die Outbox — das fruehere
    // `.catch(() => {})` fing nichts, weil die Action ein Result-Object liefert.
    autosaveFeststellung(token, next)
  }

  // Editierbare Stammdaten (KFZ-117: Kunde kann korrigieren)
  const [editVorname, setEditVorname] = useState(lead.vorname)
  const [editNachname, setEditNachname] = useState(lead.nachname)
  const [editTelefon, setEditTelefon] = useState(lead.telefon)
  const [editEmail, setEditEmail] = useState(lead.email)
  // AAR-956: Vom Makler vorausgefuellter Besichtigungsort — Kunde kann bestaetigen
  // oder via Place-Picker aendern. editStandortPlace ist gesetzt sobald eine
  // Dropdown-Auswahl getroffen wurde (liefert neue Koordinaten); reiner Freitext
  // laesst es null (dann nur Adress-Text, Makler-Koordinaten bleiben).
  // Die PLZ nur anhaengen, wenn sie nicht ohnehin in der Adresse steht.
  //
  // Gemessen am 27.08.2026: im Feld stand „Wiesenstraße, 27570 Bremerhaven, Deutschland,
  // 27570" — die Adresse aus dem Geocoder traegt die PLZ bereits, das blosse Anhaengen
  // verdoppelt sie. Der Kunde soll seine Daten hier BESTAETIGEN; ein sichtbar falscher
  // Wert kostet genau das Vertrauen, das der Schritt herstellen soll. Zusaetzlich lief die
  // Adresssuche mit dem verdoppelten String und lieferte dadurch fremde Orte.
  const standortPrefill = (() => {
    const adresse = lead.fahrzeug_standort_adresse?.trim() ?? ''
    const plz = lead.fahrzeug_standort_plz?.trim() ?? ''
    if (!plz) return adresse
    if (!adresse) return plz
    return adresse.includes(plz) ? adresse : `${adresse}, ${plz}`
  })()
  const [editStandortText, setEditStandortText] = useState(standortPrefill)
  const [editStandortPlace, setEditStandortPlace] = useState<PlaceResult | null>(null)

  // Account step — CMM-14: Account-Anlage läuft automatisch direkt nach SA.
  // Kein Edit-Form mehr — der Kunde sieht nur das Erfolgsergebnis.
  const [accountPassword, setAccountPassword] = useState('')
  const [accountEmail, setAccountEmail] = useState(editEmail)
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [accountCreated, setAccountCreated] = useState(false)
  // C (Aaron 27.07.): Hidden-Form fuer den Cookie-safen Auto-Login nach der Account-Anlage.
  const loginFormRef = useRef<HTMLFormElement>(null)

  // CMM-14: Werkstatt + Schadensfotos State entfernt — Step 'weitere-angaben'
  // wurde aus dem Wizard rausgenommen, der Foto-Upload erfolgt jetzt im
  // Onboarding nach Magic-Link-Login.

  // AAR-956 §3a: termin-loser Self-Service-Lead → Quali (falls offen) + Slot vor
  // gutachterAnzeige. needsBooking ist server-seitig flag-gegatet (CANONICAL_FLOWLINK_ENABLED);
  // Dispatcher-Leads (Termin vorhanden) → unveränderter Pfad.
  // AAR-956 §3a-Fix (Stale-STEPS-Indizes, Go-Live-Blocker): needsBooking UND
  // schuldfrage beim Mount cappen (useState). Sonst flippen sie mid-flow, weil die
  // Server-Actions (speichereQualiFlow/bucheTerminFlow) ein /flow-RSC-Re-Render
  // triggern:
  //  - nach Quali-Submit: lead.schuldfrage gesetzt → qualiPending false → quali fällt
  //    aus STEPS (6→5) → der für 'termin' gesetzte numerische stepIndex zeigt auf
  //    'gutachter' → Slot-Step übersprungen. (initialSchuldfrage — #2328, bereits live.)
  //  - nach Slot-Buchung: terminMitSv jetzt da → needsBooking false → STEPS schrumpft
  //    auf den 4-Step-Dispatcher-Pfad → der für 'gutachter' gesetzte Index (3) zeigt
  //    auf 'account' → gutachter+SA übersprungen. (initialNeedsBooking — DIESER Fix.)
  // Beide Inputs beim Mount fixieren → STEPS bleibt session-stabil → Indizes gültig.
  const [initialNeedsBooking] = useState(needsBooking === true)
  const [initialSchuldfrage] = useState<string | null>(lead.schuldfrage ?? null)
  // AAR-956 gegner-conditional: aktuelle Schuldfrage-Wahl (der Quali-Step setzt sie in-session).
  // Gespeist in die feststellung-initialValues, damit conditional_on={schuldfrage:gegner} fuer die
  // gegner-Felder dort greift — sonst stuende nur der page-load-Wert (Quali-Wahl im selben /flow waere stale).
  const [schuldfrageWahl, setSchuldfrageWahl] = useState<string | null>(initialSchuldfrage)
  // KI-Intake: einmal auf das Formular zurueckgefallen (Fehler oder Kundenwunsch),
  // bleibt es fuer diese Sitzung beim Formular.
  const [kiFallback, setKiFallback] = useState(false)
  const istIncomplete = initialNeedsBooking
  const qualiPending = istIncomplete && !lead.disqualifiziert && !initialSchuldfrage
  // Task 12: Haftpflicht (schuldfrage='gegner') erreicht den Werkstatt-Step nie
  // (quali-flow-outcome: reparaturwunsch=null) — read-only Reparatur-nach-Gutachten-Hinweis am SA-Step.
  //
  // Spec A (14.07.): die SERVER-Weiche hat Vorrang — sie kennt eigene_versicherung, der Client nicht.
  // Vorher stand hier resolveAbrechnungsweg({ …, ueberEigeneVersicherung: null }) mit HARDCODIERTEM
  // null: der Client konnte kasko/selbstzahler gar nicht unterscheiden. Waehlt der Kunde die
  // Schuldfrage erst jetzt im Quali-Step, faellt er auf die lokale Wahl zurueck — bei 'gegner' ist
  // das eindeutig (die Versicherungsfrage ist dann irrelevant, 'gegner' dominiert).
  const istHaftpflicht = weichen.abrechnungsweg === 'haftpflicht' || schuldfrageWahl === 'gegner'
  // Kasko/Selbstzahler (DIRECT_REPARATUR_WEGE, siehe lib/claims/lifecycle.ts): eigene VS oder Kunde
  // zahlt die Reparatur → KEIN Gegner-VS-Prozess → KEINE SA-Unterschrift, kein Gutachter, kein
  // SV-Termin (Aaron 08.08.: "bei Kasko soll nichts unterzeichnet werden"). Positiv-Erkennung analog
  // istHaftpflicht: Server-Weiche (kennt eigene_versicherung) hat Vorrang, sonst die lokale Quali-Wahl
  // ('eigenverantwortung' deckt kasko+selbstzahler — beide brauchen kein 'sa').
  const istDirectReparatur =
    weichen.abrechnungsweg === 'kasko' ||
    weichen.abrechnungsweg === 'selbstzahler' ||
    schuldfrageWahl === 'eigenverantwortung'
  // AAR-956 P4-A: ① Feststellung-Step nur wenn die Config sichtbare ①-Felder liefert.
  // feststellungPhasen ist ein Server-Prop (session-stabil) → kein Stale-Index-Risiko.
  const hatFeststellung = (feststellungPhasen ?? []).some((p) => p.felder.some(istFeststellungsFeld))
  // AAR-956 self-service (Aaron 14.06.): hatFeststellung beim Mount cappen (wie initialNeedsBooking)
  // — sonst fällt der ①-Step aus STEPS, sobald der Kunde den Hergang submittet (feststellungPhasen→[]
  // beim RSC-Re-Render, da unfallhergang dann gefüllt) → Stale-Step-Index. Session-stabil halten.
  const [initialHatFeststellung] = useState(hatFeststellung)
  // Werkstatt-Step-Praesenz beim Mount cappen (wie initialNeedsBooking/initialHatFeststellung),
  // damit STEPS mid-Flow nicht schrumpft/waechst -> keine Stale-Step-Index-Spruenge.
  const [initialNeedsWerkstatt] = useState(needsWerkstatt === true)
  // ─── Die Step-Sequenz kommt aus der DB-Config (Aaron 14.07.) ───────────────────────────────────
  // flow_szenario_steps liefert sie inklusive Bedingungen ({"sv_id": null}, {"reparatur_werkstatt_id":
  // null}, ...). Ein neuer Weg oder eine neue Weiche ist damit eine ZEILE in der DB, kein Deploy.
  //
  // Fallback (legacySteps): greift nur, wenn die Config leer ist (Flag aus / Matrix nicht geseedet).
  const legacySteps: StepId[] = istIncomplete
    ? [
        'zusammenfassung',
        ...(qualiPending ? (['quali'] as StepId[]) : []),
        ...(initialHatFeststellung ? (['feststellung'] as StepId[]) : []),
        ...(initialNeedsWerkstatt ? (['werkstatt'] as StepId[]) : []),
        'termin',
        'gutachter',
        'sa',
        'account',
      ]
    : [
        'zusammenfassung',
        ...(initialHatFeststellung ? (['feststellung'] as StepId[]) : []),
        ...(initialNeedsWerkstatt ? (['werkstatt'] as StepId[]) : []),
        'gutachter',
        'sa',
        'account',
      ]

  // Die Config-Bedingung kennt die Feststellungs-FELDER nicht (die kommen aus onboarding_felder) —
  // liefert die Config dort nichts Sichtbares, faellt der Step raus.
  const nurVorhandeneFeststellung = (ids: StepId[]) =>
    ids.filter((id) => id !== 'feststellung' || initialHatFeststellung)

  // Defense-in-Depth (Aaron 08.08.): SA/Gutachter/Termin sind Haftpflicht-Schritte (Gegner-VS-Prozess).
  // Bei kasko/selbstzahler NIE in die Sequenz — auch wenn der legacySteps-Fallback greift (Config leer
  // resolved, ladeFlowConfig schluckt Fehler still zu []) oder eine Config-Regression sie wieder
  // einschleust. Die korrekte DB-Config laesst sie bei Kasko eh weg → dieser Filter ist idempotent,
  // wenn die Config stimmt, und ein Netz, wenn nicht. `direct` explizit uebergebbar, weil
  // uebernimmSzenario die frische Quali-Wahl kennt (der Closure-Wert kann dort noch stale sein).
  const ohneHaftpflichtSteps = (ids: StepId[], direct: boolean = istDirectReparatur): StepId[] =>
    direct ? ids.filter((id) => id !== 'sa' && id !== 'gutachter' && id !== 'termin') : ids

  // Beim Mount fixiert: sonst schrumpft/waechst die Sequenz mid-flow durch einen RSC-Re-Render
  // (LeadRealtimeRefresh) und der numerische stepIndex zeigt auf den falschen Step.
  const [steps, setSteps] = useState<StepId[]>(() => {
    const ausConfig = ohneHaftpflichtSteps(nurVorhandeneFeststellung((weichen.steps ?? []) as StepId[]))
    return ausConfig.length > 0 ? ausConfig : ohneHaftpflichtSteps(legacySteps)
  })

  const STEPS: { id: StepId; label: string }[] = steps.map((id) => ({ id, label: STEP_LABELS[id] }))
  const stepIndexById = (id: StepId): number => STEPS.findIndex((s) => s.id === id)

  /**
   * Nach dem Quali-Step wechselt das Szenario (unqualifiziert -> haftpflicht / kasko / selbstzahler /
   * teilschuld). Die Sequenz wird dann NEU aus der Config berechnet — Steps UND Index zusammen, nie
   * einzeln: ein alter numerischer Index in einer neuen Sequenz ueberspringt oder wiederholt Steps
   * (die Stale-Index-Falle, die hier schon zweimal zugeschlagen hat).
   */
  function uebernimmSzenario(schuldfrage: string, ueberEigeneVersicherung: boolean | null) {
    if (!flowConfig || flowConfig.szenarien.length === 0) {
      setStepIndex((i) => i + 1) // ohne Config: Legacy-Pfad, einfach weiter
      return
    }
    const kontext = bauFlowKontext(
      {
        ...(lead as unknown as LeadFuerKontext),
        schuldfrage,
        eigene_versicherung:
          ueberEigeneVersicherung === true ? 'ja' : ueberEigeneVersicherung === false ? 'nein' : null,
      },
      hatSvTermin === true,
    )
    const neu = resolveFlowWeichen(flowConfig.szenarien, flowConfig.steps, kontext)
    // Frische Quali-Wahl (schuldfrage-Argument), nicht der evtl. stale Closure-Wert: 'eigenverantwortung'
    // = kasko/selbstzahler → SA/Gutachter/Termin raus.
    const neueSteps = ohneHaftpflichtSteps(
      nurVorhandeneFeststellung(neu.steps as StepId[]),
      schuldfrage === 'eigenverantwortung',
    )
    if (neueSteps.length === 0) {
      setStepIndex((i) => i + 1)
      return
    }
    setSteps(neueSteps)
    setStepIndex(1) // direkt hinter die Zusammenfassung — der Quali ist beantwortet
  }

  // gutachter-Anzeige: server-Prop (Dispatcher-Pfad) ODER die frisch gebuchte
  // Auswahl (incomplete-Pfad, vor Page-Reload).
  const gutachterAnzeige: GutachterInfo | null =
    // Nach Self-Service-Umbuchung den (kurz stale) Server-Pick ignorieren → frische Auswahl.
    (umgebucht ? null : gutachter) ??
    (gebuchterTermin
      ? {
          vorname: gebuchterTermin.svVorname,
          avatarUrl: gebuchterTermin.svAvatar,
          firma: null,
          terminDatum: gebuchterTermin.startIso,
          besichtigungsAdresse: gebuchterTermin.besichtigungsAdresse ?? besichtigungsAdresse ?? null,
          svTreffpunkt: null,
          googleDurchschnitt: null,
          googleAnzahl: null,
          googleAktualisiertAm: null,
          terminStatus: 'reserviert', // frisch gebucht (bucheTerminFlow) → immer reserviert
          // AAR-360 Follow-up: frische Client-Auswahl hat (noch) keine SV-Doc-URLs → Häkchen ohne Links.
          datenschutzUrl: null,
          widerrufUrl: null,
        }
      : null)

  const currentStep = STEPS[stepIndex]
  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100)
  const fahrzeug = [lead.fahrzeug_hersteller, lead.fahrzeug_modell].filter(Boolean).join(' ')
  const kundenName = [editVorname, editNachname].filter(Boolean).join(' ')

  // AAR-956 Task 1: Im gutachter-Step ohne zugeordneten SV/Termin NICHT passiv
  // "wir suchen ..." zeigen, sondern aktiv weiterleiten. Gibt es einen Buchungs-Step
  // (kanonischer Pfad) -> dorthin (Kunde bucht selbst); sonst direkt zur Beauftragung
  // (Dispatcher-/Flag-off-Pfad ohne Slot-Picker: AAR-908 ordnet bei SA den Top-SV zu).
  // Kein telefonischer Wartezustand mehr.
  // Gutachter da → sequenziell weiter (stepIndex+1), damit die Config-Steps zwischen gutachter
  // und sa (ort_fahrzeug/werkstatt) NICHT uebersprungen werden. Der frueher hardcodierte Sprung
  // auf 'sa' driftete gegen die DB-Step-Sequenz (Config-Code-Drift) → "springt ans Ende".
  // Kein Gutachter → aktiv weiterleiten: zum Buchungs-Step, sonst 'sa' (Dispatcher-/Embed-Pfad
  // ohne Slot-Picker, AAR-908 ordnet bei SA den Top-SV zu).
  // Re-Smoke #4943 (03.08.): hat der Kunde EXPLIZIT "Termin lieber spaeter vereinbaren"
  // gewaehlt (ohneTermin), darf das Rueck-Routing NICHT greifen — sonst Endlos-Loop
  // termin -> gutachter -> termin, der ort_fahrzeug/werkstatt/sa unerreichbar macht.
  // Sequenziell weiter (null -> stepIndex + 1) ist dann der korrekte Pfad.
  const gutachterWeiterZiel: StepId | null = gutachterAnzeige || ohneTermin
    ? null
    : stepIndexById('termin') >= 0
      ? 'termin'
      : 'sa'

  // ─── SA unterzeichnen + Fall erstellen → <SaSignaturStep> (extrahiert, Approach C).
  //     onSigned setzt fallId + geht zum Account-Step (der Account-Step-Effect unten
  //     triggert auf fallId); onSubmittingChange spiegelt submittingSA für das
  //     service_typ-Feld-Lock (Parität). ──────────────────────────────────────────

  // ─── Account erstellen ─────────────────────────────────────────────────────

  async function handleCreateAccount() {
    if (!fallId || !accountEmail) return
    setCreatingAccount(true)
    setError(null)
    try {
      // AAR-308/309: createKundeAccount wirft NIE — sauberes Result-Object.
      const result = await createKundeAccount(fallId, token, accountEmail, editVorname || lead.vorname, editNachname || lead.nachname, editTelefon || lead.telefon || null)
      if (!result.success) {
        // CMM-14 Debug: alert damit der User die Meldung sicher sieht.
        if (typeof window !== 'undefined') {
          window.alert(`Account-Anlage fehlgeschlagen: ${result.error}`)
        }
        setError(result.error)
        return
      }
      setAccountPassword(result.password)
      setAccountCreated(true)
      // AAR-956 16.06. (Aaron): kein Auto-Login/Redirect mehr. Account + Fall +
      // Magic-Link werden weiter angelegt (Magic-Link geht per Email raus), aber
      // der Kunde bleibt auf dem Flow-Abschluss-Screen ("wir melden uns"). Das
      // Claim-/Onboarding-Portal wird separat nachgezogen.
    } catch (err) {
      setError(err instanceof Error ? err.message : t('step_account.error_fallback'))
    } finally {
      setCreatingAccount(false)
    }
  }

  // CMM-14: Account-Anlage automatisch beim Erreichen des Account-Steps, damit
  // der Kunde keinen weiteren Klick mehr macht. AAR-956: KEIN Redirect mehr —
  // danach folgt direkt der Abschluss-Screen ("wir melden uns").
  useEffect(() => {
    if (currentStep.id === 'account' && fallId && !accountCreated && !creatingAccount && !error) {
      handleCreateAccount()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep.id, fallId])

  // C (Aaron 27.07.): Nach der Account-Anlage AUTOMATISCH ins Portal. Auto-Login mit dem Temp-Passwort
  // (loginAfterFlowFormAction = Cookie-safer Form-Submit-Pfad, CMM-14) -> force_password_change=true ->
  // /passwort-aendern -> danach im Portal. Restauriert den 16.06. entfernten Portal-Redirect.
  useEffect(() => {
    if (accountCreated && accountPassword) loginFormRef.current?.requestSubmit()
  }, [accountCreated, accountPassword])

  // AAR-99: Kein Skip-Button mehr — Account ist Pflicht

  // ─── Render ────────────────────────────────────────────────────────────────

  // AAR-956 §3a: bereits disqualifizierter Lead (Eigenverschulden) → Kasko-
  // Endansicht, kein Termin, kein Crash (auch bei Re-Visit des /flow-Links).
  if (istIncomplete && lead.disqualifiziert) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <KaskoEndansicht />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-claimondo-bg flex flex-col">
      {/* Ambient-Gradient nach Brief §5 */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(60% 50% at 80% 0%, color-mix(in srgb, var(--brand-accent, #7BA3CC) 18%, transparent), transparent 60%)',
            'radial-gradient(50% 50% at 0% 100%, color-mix(in srgb, var(--brand-secondary, #4573A2) 8%, transparent), transparent 70%)',
          ].join(', '),
        }}
      />
      {/* Sticky-Glass-Step-Indicator (iOS Brief §8.6) */}
      <div className="sticky top-0 z-20 border-b border-claimondo-navy/[0.06] bg-white/[0.78] backdrop-blur-[22px] backdrop-saturate-150">
        <div className="h-1 w-full bg-claimondo-navy/[0.06]">
          <div className="h-full bg-gradient-to-r from-claimondo-navy to-claimondo-ondo transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)]" style={{ width: `${progress}%` }} />
        </div>
        <div className="mx-auto flex max-w-lg items-center justify-center gap-2 px-5 py-3">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                style={i === stepIndex ? { boxShadow: '0 0 0 5px color-mix(in srgb, var(--brand-secondary, #4573A2) 16%, transparent)' } : undefined}
                className={`grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-semibold tracking-[-.01em] transition-all duration-300 ease-[cubic-bezier(.32,.72,0,1)] ${
                i < stepIndex
                  ? 'bg-claimondo-navy border-claimondo-navy text-white scale-[1.04]'
                  : i === stepIndex
                    ? 'bg-claimondo-ondo border-claimondo-ondo text-white scale-[1.06]'
                    : 'bg-white border-claimondo-navy/[0.10] text-claimondo-ondo/60'
              }`}>
                {i < stepIndex ? <CheckIcon className="w-3.5 h-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`h-0.5 w-6 rounded-full transition-colors ${i < stepIndex ? 'bg-claimondo-ondo' : 'bg-claimondo-navy/[0.06]'}`} />}
            </div>
          ))}
        </div>
        {/* FlowLink-Review C: fiktiv-Szenario-Badge im Sticky-Header, sobald der
            Kunde die fiktive Abrechnung gewaehlt hat. Die Werkstatt-Vermittlung
            bleibt angeboten — das Badge macht nur das Abrechnungs-Szenario sichtbar. */}
        {lead.reparaturwunsch === 'fiktiv' && (
          <div className="mx-auto flex max-w-lg justify-center px-5 pb-2.5">
            <FiktivAbrechnungBadge reparaturwunsch={lead.reparaturwunsch} size="xs" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-4 sm:px-5 pt-5 pb-32 max-w-lg mx-auto w-full">
        <div className="flex-1 flex flex-col justify-center py-4">
          <SheetCard key={currentStep.id} size="full" padding="none" className="px-6 py-7">

            {/* ═══ SCHRITT 1: ZUSAMMENFASSUNG + DATENSCHUTZ ═══ */}
            {currentStep.id === 'zusammenfassung' && (
              <div>
                {/* AAR-956 17.07. (Smoke-Befund 3): vorname=NULL hieß „Hallo dort!" —
                    wörtliches „Hello there". Ohne Namen den namenlosen Gruß-Key nutzen. */}
                <StepHeader
                  question={editVorname ? t('step_summary.heading', { name: editVorname }) : t('step_summary.heading_ohne_name')}
                  sub={t('step_summary.sub')}
                  icon={<CarIcon className="w-8 h-8 text-claimondo-ondo" />}
                />

                {/* Editierbare Kontaktdaten */}
                <div className="space-y-3 mb-5">
                  <div className="grid grid-cols-2 gap-3">
                    <EditableInput label={t('step_summary.fields.vorname')} value={editVorname} onChange={setEditVorname} />
                    <EditableInput label={t('step_summary.fields.nachname')} value={editNachname} onChange={setEditNachname} />
                  </div>
                  <EditableInput label={t('step_summary.fields.telefon')} value={editTelefon} onChange={setEditTelefon} type="tel" />
                  <EditableInput label={t('step_summary.fields.email')} value={editEmail} onChange={setEditEmail} type="email" />
                  {/* AAR-956: Besichtigungsort — vom Makler vorausgefuellt, vom Kunden bestaetig-/aenderbar. */}
                  {(lead.fahrzeug_standort_adresse || lead.fahrzeug_standort_plz) && (
                    <div>
                      {/* `htmlFor` + `id` verknuepfen Beschriftung und Feld. Ohne das ist das
                          Feld fuer Hilfstechnik NAMENLOS: ein Screenreader liest es ohne
                          Beschriftung vor, und ein Tippen auf die Beschriftung fokussiert es
                          nicht — auf dem Handy der haeufigere Weg. Die Beschriftung stand hier
                          nur DANEBEN.

                          Dieselbe Luecke steckt in 19 Stellen (Marker
                          `COORDINATION-adressfelder-ohne-label-verknuepfung`); dies ist die
                          EINZIGE mit Endkunden-Kontakt — der FlowLink ist der Kundenkanal.

                          Belegt am 30.08. auf prod per Playwright an der Schwester-Stelle
                          /sv/registrieren, mit Positivkontrolle:
                            Beschriftung sichtbar : true
                            Kontrollfeld "PLZ"    : 1   <- Instrument lebt
                            Adressfeld            : 0   -> nach dem Fix 1 */}
                      <label htmlFor="flow-standort-adresse" className="block text-xs font-medium text-claimondo-ondo mb-1">{t('step_summary.labels.standort')}</label>
                      <GooglePlaceAutocomplete
                        id="flow-standort-adresse"
                        types={['address']}
                        defaultValue={standortPrefill}
                        onSelect={(p) => { setEditStandortText(p.adresse); setEditStandortPlace(p) }}
                        onChange={(v) => { setEditStandortText(v); setEditStandortPlace(null) }}
                        scrollIntoViewOnFocus
                      />
                    </div>
                  )}
                </div>

                {/* AAR-336: Nicht-editierbare Infos (aus Dispatch-Qualifizierung) —
                    Review-Ansicht. Alle Felder readonly, leere Felder werden
                    unterdrückt. Korrekturen laufen über Telefonat zum KB.
                    Vorher hatte dieser Schritt leere Dropdowns die den Kunden
                    zur Neu-Eingabe bereits erfasster Werte zwangen. */}
                <div className="space-y-2 mb-6">
                  {fahrzeug && <SummaryRow label={t('step_summary.labels.fahrzeug')} value={`${fahrzeug}${lead.kennzeichen ? ` (${lead.kennzeichen})` : ''}`} />}
                  {lead.schadentyp && <SummaryRow label={t('step_summary.labels.schadentyp')} value={tLabel(`step_summary.schadentyp.${lead.schadentyp}`, lead.schadentyp_freitext ?? lead.schadentyp ?? '')} />}
                  {lead.unfall_konstellation && (
                    <SummaryRow
                      label={t('step_summary.labels.art_des_unfalls')}
                      value={tLabel(`step_summary.unfall_konstellation.${lead.unfall_konstellation}`, lead.unfall_konstellation ?? '')}
                    />
                  )}
                  {lead.gegner_name && <SummaryRow label={t('step_summary.labels.unfallgegner')} value={`${lead.gegner_name}${lead.gegner_versicherung ? ` — ${lead.gegner_versicherung}` : ''}`} />}
                  {lead.gegner_fahrzeugtyp && (
                    <SummaryRow
                      label={t('step_summary.labels.fahrzeugtyp_gegner')}
                      value={tLabel(`step_summary.gegner_fahrzeugtyp.${lead.gegner_fahrzeugtyp}`, lead.gegner_fahrzeugtyp ?? '')}
                    />
                  )}
                  {lead.gegner_anzahl_beteiligte != null && (
                    <SummaryRow
                      label={t('step_summary.labels.anzahl_beteiligte')}
                      value={String(lead.gegner_anzahl_beteiligte)}
                    />
                  )}
                  {lead.unfallhergang && <SummaryRow label={t('step_summary.labels.unfallhergang')} value={lead.unfallhergang} />}
                </div>

                {/* Datenschutz */}
                <div
                  ref={datenschutzRef}
                  className={`border-t border-claimondo-border pt-5 transition-all duration-200 ${
                    zeigeWeiterHinweis && !datenschutz
                      ? 'ring-2 ring-danger ring-offset-2 bg-danger-soft rounded-ios-md'
                      : ''
                  }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={datenschutz}
                      onChange={e => setDatenschutz(e.target.checked)}
                      className="mt-0.5 w-5 h-5 rounded border-claimondo-border accent-claimondo-ondo shrink-0"
                    />
                    <span className="text-sm text-claimondo-ondo leading-relaxed">
                      {t('step_summary.datenschutz_text')}{' '}
                      <LegalDocPopover titel={legalDocs?.datenschutz?.titel ?? 'Datenschutzerklärung'} markdown={legalDocs?.datenschutz?.markdown ?? ''}>
                        {t('step_summary.datenschutz_link')}
                      </LegalDocPopover>{' '}
                      {t('step_summary.datenschutz_text_suffix')} <span className="text-danger">*</span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* ═══ AAR-956 §3a: QUALI (Schuldfrage, nur incomplete-Pfad) ═══ */}
            {currentStep.id === 'quali' && (
              <FlowQualiStep
                token={token}
                vorname={editVorname || lead.vorname || null}
                onSchuldfrage={setSchuldfrageWahl}
                // Aaron 14.07.: Nach der Quali wechselt das Szenario -> die Step-Sequenz wird aus der
                // DB-Config NEU berechnet. Frueher sprang Kasko/Selbstzahler hier direkt auf 'account'
                // und sah damit WEDER Feststellung NOCH Werkstatt — genau das soll jetzt laufen.
                onSzenario={uebernimmSzenario}
                onWeiter={() => setStepIndex(stepIndex + 1)}
                onSelbstzahler={(claimId) => {
                  // SP-B2: der partielle Selbstzahler-Claim wird weiterhin angelegt (das Portal braucht
                  // ihn) — aber wir springen NICHT mehr weg; uebernimmSzenario routet weiter.
                  setFallId(claimId)
                }}
              />
            )}

            {/* ═══ KI-Intake: dialoggefuehrte Feststellung (gegated, Fallback aufs Formular) ═══
                Bewusst NUR der feststellung-Step: 'quali' traegt die Szenario-Weiche
                (onSzenario -> Step-Sequenz-Neuberechnung) und bleibt Formular. */}
            {currentStep.id === 'feststellung' && kiIntakeAktiv && !kiFallback && schemaIntake?.length ? (
              <FlowAiIntake
                token={token}
                schema={schemaIntake}
                onFertig={() => setStepIndex(stepIndex + 1)}
                onFallback={() => setKiFallback(true)}
              />
            ) : null}

            {/* ═══ AAR-956 P4-A: FESTSTELLUNG (deklarative Fakten, nur incomplete-Pfad) ═══ */}
            {currentStep.id === 'feststellung' && !(kiIntakeAktiv && !kiFallback && schemaIntake?.length) && (
              <FlowFeststellungStep
                token={token}
                phasen={feststellungPhasen ?? []}
                initialValues={{ ...(feststellungWerte ?? {}), schuldfrage: schuldfrageWahl }}
                // AAR-956 16.06. (Aaron-Bug "etwas ist schiefgelaufen"): nächster Step
                // statt hardcoded 'termin'. Die Feststellung läuft auch im Embed-Pfad
                // (needsBooking=false) — dort gibt es KEINEN 'termin'-Step →
                // stepIndexById('termin')=-1 → setStepIndex(-1) → currentStep undefined
                // → Error-Boundary. stepIndex+1 trifft den jeweils nächsten Step
                // (termin im incomplete-, gutachter im embed-Pfad), wie quali-onWeiter.
                onWeiter={() => setStepIndex(stepIndex + 1)}
              />
            )}

            {/* ═══ AAR-956 §3a: TERMIN (Slot-Picker, nur incomplete-Pfad) ═══ */}
            {currentStep.id === 'termin' && (
              !isOnline ? (
                <TerminOfflineHinweis
                  onSkip={() => {
                    setOhneTermin(true)
                    // Aaron-Incident 03.08.: kein harter 'sa'-Sprung mehr — der uebersprang die
                    // NACH termin liegenden Sequenz-Steps (gutachter/ort_fahrzeug/werkstatt,
                    // Spec 2026-07-21) -> Werkstatt-Vermittlung war im FlowLink unerreichbar.
                    // +1 laesst die (Config-)Sequenz entscheiden.
                    setStepIndex((i) => i + 1)
                  }}
                />
              ) : (
                <FlowSlotStep
                  token={token}
                  onGebucht={(t) => {
                    setGebuchterTermin(t)
                    setStepIndex(stepIndexById('gutachter'))
                  }}
                  onOhneTermin={() => {
                    setOhneTermin(true)
                    // s. Kommentar oben (Aaron-Incident 03.08.): Sequenz statt Hard-Jump.
                    setStepIndex((i) => i + 1)
                  }}
                />
              )
            )}

            {/* ═══ SCHRITT 2: GUTACHTER-ANZEIGE (AAR-99) ═══ */}
            {currentStep.id === 'gutachter' && (
              <div>
                <StepHeader
                  question={t('step_gutachter.heading')}
                  sub={t('step_gutachter.sub')}
                  icon={<UserIcon className="w-8 h-8 text-claimondo-ondo" />}
                />

                {!umbuchen && (gutachterAnzeige ? (
                  <div className="bg-gradient-to-br from-claimondo-ondo/10 to-claimondo-shield/5 border border-claimondo-ondo/20 rounded-ios-lg p-7 text-center mb-6">
                    {gutachterAnzeige.avatarUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={gutachterAnzeige.avatarUrl}
                        alt={gutachterAnzeige.vorname}
                        className="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-4 border-white shadow-claimondo-md"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-claimondo-ondo flex items-center justify-center mx-auto mb-4 text-white text-3xl font-bold">
                        {gutachterAnzeige.vorname.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <p className="text-xs uppercase tracking-wider text-claimondo-ondo mb-1">{t('step_gutachter.sv_label')}</p>
                    <h2 className="text-2xl font-bold text-claimondo-navy mb-2">{gutachterAnzeige.vorname}</h2>
                    {gutachterAnzeige.firma && (
                      <p className="text-sm text-claimondo-ondo mb-2">{gutachterAnzeige.firma}</p>
                    )}
                    {gutachterAnzeige.googleDurchschnitt !== null && gutachterAnzeige.googleAnzahl !== null && (
                      <div className="flex justify-center mb-3">
                        <GoogleBewertungBadge
                          durchschnitt={gutachterAnzeige.googleDurchschnitt}
                          anzahl={gutachterAnzeige.googleAnzahl}
                          zuletztAktualisiert={gutachterAnzeige.googleAktualisiertAm}
                          size="md"
                        />
                      </div>
                    )}
                    <p className="text-sm text-claimondo-ondo">{t('step_gutachter.kontakt_hinweis')}</p>
                    {gutachterAnzeige.terminDatum && (
                      <div className="mt-4 pt-4 border-t border-claimondo-ondo/20">
                        <p className="text-xs text-claimondo-ondo mb-1">
                          {terminPending
                            ? t('step_gutachter.wunschtermin_label')
                            : gutachterAnzeige.terminStatus === 'bestaetigt'
                              ? t('step_gutachter.termin_bestaetigt_label')
                              : t('step_gutachter.termin_label')}
                        </p>
                        <p className="text-sm font-semibold text-claimondo-navy">
                          {formatBerlin(gutachterAnzeige.terminDatum, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                        <p className="text-sm text-claimondo-ondo">
                          {formatBerlin(gutachterAnzeige.terminDatum, { hour: '2-digit', minute: '2-digit' })} Uhr
                        </p>
                        {terminPending && (
                          <p className="mt-1 text-xs italic text-claimondo-ondo/80">{t('step_gutachter.wunschtermin_pending')}</p>
                        )}
                        {/* Besichtigungsort prominent — NICHT der Unfallort */}
                        {gutachterAnzeige.besichtigungsAdresse && (
                          <div className="mt-3 pt-3 border-t border-claimondo-ondo/10">
                            <p className="text-xs text-claimondo-ondo mb-0.5">{t('step_gutachter.besichtigungsort_label')}</p>
                            <p className="text-sm text-claimondo-navy">{gutachterAnzeige.besichtigungsAdresse}</p>
                            {gutachterAnzeige.svTreffpunkt && (
                              <p className="text-xs text-claimondo-ondo mt-0.5">
                                {t('step_gutachter.treffpunkt_label', { treffpunkt: gutachterAnzeige.svTreffpunkt })}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-claimondo-ondo/5 border border-claimondo-ondo/20 rounded-ios-md p-5 mb-6 text-sm text-claimondo-navy">
                    {t('step_gutachter.kein_gutachter')}
                  </div>
                ))}

                {/* AAR-956 18.06. (Aaron): Inline Termin/Gutachter neu wählen (Slot-Step).
                    onGebucht → bucheTerminFlow swappt die alte Reservierung atomar. */}
                {umbuchen && (
                  <div className="mb-6">
                    <FlowSlotStep
                      token={token}
                      onGebucht={(gt) => {
                        setGebuchterTermin(gt)
                        setUmgebucht(true)
                        setUmbuchen(false)
                        router.refresh()
                      }}
                      onOhneTermin={() => {
                        setOhneTermin(true)
                        setUmbuchen(false)
                        // s. Kommentar am termin-Step (Aaron-Incident 03.08.).
                        setStepIndex((i) => i + 1)
                      }}
                    />
                    <div className="mt-4 text-center">
                      <button
                        type="button"
                        onClick={() => setUmbuchen(false)}
                        className="text-sm text-claimondo-ondo underline"
                      >
                        {t('step_gutachter.aendern_zurueck')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Termin/Gutachter ändern — Self-Service. Bestätigte Termine gehen an Dispatch. */}
                {!umbuchen &&
                  gutachterAnzeige &&
                  !dispatchAnfrage &&
                  (umbuchenConfirm ? (
                    <div className="mb-6 rounded-ios-md border border-claimondo-ondo/20 bg-claimondo-ondo/5 p-4">
                      <p className="text-sm text-claimondo-navy mb-3">{t('step_gutachter.aendern_confirm')}</p>
                      {umbuchenError && <p className="text-sm text-danger-strong mb-2">{umbuchenError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleUmbuchen}
                          disabled={umbuchenLoading}
                          className="inline-flex items-center justify-center min-h-10 px-4 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white text-sm font-semibold disabled:opacity-60 transition-colors"
                        >
                          {umbuchenLoading ? t('step_gutachter.aendern_laeuft') : t('step_gutachter.aendern_ja')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUmbuchenConfirm(false)
                            setUmbuchenError(null)
                          }}
                          className="inline-flex items-center justify-center min-h-10 px-4 rounded-full border border-claimondo-border text-claimondo-ondo text-sm font-medium hover:bg-claimondo-bg transition-colors"
                        >
                          {t('step_gutachter.aendern_zurueck')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-6 text-center">
                      <button
                        type="button"
                        onClick={() => setUmbuchenConfirm(true)}
                        className="text-sm text-claimondo-ondo underline"
                      >
                        {t('step_gutachter.aendern_cta')}
                      </button>
                    </div>
                  ))}

                {!umbuchen && dispatchAnfrage && (
                  <div className="mb-6 rounded-ios-md bg-warning-soft p-4 text-sm text-warning-strong">
                    {t('step_gutachter.aendern_dispatch_hinweis')}
                  </div>
                )}

                {!umbuchen && (
                  <button
                    onClick={() =>
                      setStepIndex(gutachterWeiterZiel ? stepIndexById(gutachterWeiterZiel) : stepIndex + 1)
                    }
                    className="w-full inline-flex items-center justify-center gap-2 min-h-12 px-6 py-3.5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] active:translate-y-0 transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)]"
                  >
                    {t('common.weiter')}
                  </button>
                )}

              </div>
            )}
            {/* CMM-14: Step 'weitere-angaben' (Werkstatt + Fotos) entfernt —
                Foto-Upload + Werkstatt-Erfassung gehören ins Onboarding nach
                Magic-Link-Login, nicht in den FlowLink. */}

            {/* Kasko-Werkstattbindungs-Gate (Spec 2026-07-21): der Kasko-Kunde bestaetigt aktiv die
                freie Werkstattwahl, bevor die Werkstatt-Strecke laeuft (Config {"freie_werkstattwahl": null}).
                Nur Kasko (Selbstzahler hat keine Police). "gebunden" bricht in die KaskoEndansicht ab. */}
            {currentStep.id === 'werkstattbindung_check' && (
              <FlowWerkstattbindungStep token={token} onWeiter={() => setStepIndex(stepIndex + 1)} />
            )}

            {/* Reparaturwunsch/Werkstatt: Kunde waehlt eine Partner-Werkstatt (5 naechste).
                Ueberspringbar; onWeiter -> naechster Step (termin/gutachter/sa je nach Pfad). */}
            {currentStep.id === 'werkstatt' && (
              <FlowWerkstattStep token={token} onWeiter={() => setStepIndex(stepIndex + 1)} />
            )}

            {/* Werkstatt-ANZEIGE (Spec 2026-07-21): steht eine Werkstatt fest, zeigt dieser Step sie
                an (Config {"reparatur_werkstatt_id": "$gesetzt"}), statt dass der Picker verschwindet
                — Muster wie der gutachter-Anzeige-Step. */}
            {currentStep.id === 'werkstatt_anzeige' && (
              <FlowWerkstattAnzeige token={token} onWeiter={() => setStepIndex(stepIndex + 1)} />
            )}

            {/* ═══ ORT-ABFRAGEN (Aaron 14.07.) — zwei VERSCHIEDENE Orte ═══════════════════════
                besichtigungsort = wo der SV besichtigt  -> Anker fuer den GUTACHTER-Finder
                fahrzeug_standort = wo das Auto steht    -> Anker fuer den WERKSTATT-Finder
                Jeder Step erscheint nur, wenn sein Ort in der DB fehlt (Bedingung in der Config). */}
            {currentStep.id === 'ort_besichtigung' && (
              <FlowOrtStep
                token={token}
                art="besichtigung"
                onWeiter={() => setStepIndex(stepIndex + 1)}
                initialAdresse={besichtigungsAdresse}
              />
            )}

            {currentStep.id === 'ort_fahrzeug' && (
              <FlowOrtStep
                token={token}
                art="fahrzeug"
                onWeiter={() => setStepIndex(stepIndex + 1)}
                // Vorbefuellung: bereits erfasster Fahrzeugstandort, sonst der effektive Ort
                // (Besichtigungsort/Unfallort — "der SV kommt zum Auto"). Kunde bestaetigt/korrigiert.
                initialAdresse={standortPrefill || besichtigungsAdresse}
              />
            )}

            {/* ═══ TEILSCHULD: Rueckruf beim Dispatch statt Gutachter-Buchung ══════════════════ */}
            {currentStep.id === 'rueckruf' && (
              <FlowRueckrufStep token={token} vorname={editVorname || lead.vorname || null} />
            )}

            {/* ═══ SCHRITT 4: SA UNTERSCHREIBEN ═══ */}
            {currentStep.id === 'sa' && (
              <div>
                <StepHeader
                  question={t('step_sa.heading')}
                  sub={t('step_sa.sub')}
                  icon={<PenToolIcon className="w-8 h-8 text-claimondo-ondo" />}
                />

                {/* Task 12: Haftpflicht — Reparatur-nach-Gutachten-Hinweis vor der Beauftragung. */}
                {istHaftpflicht && <FlowWerkstattHinweisHaftpflicht />}

                <div className="bg-claimondo-ondo/5 border border-claimondo-ondo/20 rounded-ios-md px-4 py-4 mb-5 text-sm text-claimondo-navy leading-relaxed">
                  <p className="font-medium text-claimondo-navy mb-2">{t('step_sa.summary_label')}</p>
                  <p>{t.rich('step_sa.summary_text', { strong: (chunks) => <strong>{chunks}</strong> })}</p>
                </div>

                {/* AAR-956 16.06. (Aaron): Service-/Kanzlei-Wahl am POS (statt am Feststellung-Ende).
                    Config-getrieben via serviceFelder; kanzlei_wunsch nur bei service_typ='komplett'
                    (meetsCondition). Autosave → der Lead hat die Wahl, wenn signSAandCreateFall feuert. */}
                {serviceFelder && serviceFelder.length > 0 && (
                  <div className="flex flex-col gap-5 mb-6">
                    {serviceFelder
                      .filter((feld) => meetsCondition(feld.conditional_on, serviceValues))
                      .map((feld) => (
                        <FieldRenderer
                          key={feld.id}
                          feld={feld}
                          value={serviceValues[feld.feld_key]}
                          onChange={(val) => setServiceFeld(feld.feld_key, val)}
                          disabled={saSubmitting}
                        />
                      ))}
                  </div>
                )}

                {/* SA-Signatur-Block extrahiert (Approach C): Volltext-Modal +
                    Unterschrift-Canvas + AGB-Checkbox + SV-Consent + Sign-Button.
                    onSubmittingChange spiegelt submittingSA für das service_typ-Feld-Lock
                    (Parität zum früheren disabled={submittingSA} oben). onSigned setzt fallId +
                    springt zum Account-Step. */}
                {/* Slice 2-write-3: SA-Beauftragung ist online-only (FENCE) — offline
                    ein Hinweis statt des Sign-Formulars. Summary + Service-Wahl bleiben
                    sichtbar (offline via write-1-Autosave erfasst). */}
                {!isOnline ? (
                  <SaOfflineHinweis />
                ) : (
                  <SaSignaturStep
                    token={token}
                    leadId={lead.id}
                    flowLinkId={flowLinkId ?? null}
                    gutachterAnzeige={gutachterAnzeige}
                    legalDocs={legalDocs}
                    onSubmittingChange={setSaSubmitting}
                    onSigned={(fid) => {
                      setFallId(fid)
                      setStepIndex(stepIndexById('account'))
                    }}
                  />
                )}
              </div>
            )}

            {/* ═══ SCHRITT 4: ABSCHLUSS — Account-Anlage läuft automatisch,
                Magic-Link führt direkt ins Onboarding (CMM-14) ═══ */}
            {currentStep.id === 'account' && (
              <div>
                <StepHeader
                  question={t('step_account.heading')}
                  sub={t('step_account.sub')}
                  icon={<UserPlusIcon className="w-8 h-8 text-claimondo-ondo" />}
                />

                <div className="bg-success-soft border border-success/30 rounded-ios-md px-4 py-3 mb-5 flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-success shrink-0" />
                  <p className="text-sm text-success-strong">
                    {t('step_account.success_text')}
                  </p>
                </div>

                {/* C (Aaron 27.07.): Auto-Login ins Portal (Passwort-Change) direkt nach der Account-Anlage. */}
                {accountCreated && accountPassword && (
                  <>
                    <div className="rounded-ios-md border border-claimondo-border bg-white px-4 py-3 mb-5 flex items-center gap-3">
                      <div className="inline-block w-5 h-5 border-2 border-claimondo-ondo border-t-transparent rounded-full animate-spin shrink-0" />
                      <p className="text-sm text-claimondo-ondo">Sie werden sicher in Ihr Portal weitergeleitet …</p>
                    </div>
                    <form ref={loginFormRef} action={loginAfterFlowFormAction} className="hidden">
                      <input type="hidden" name="email" value={accountEmail} />
                      <input type="hidden" name="password" value={accountPassword} />
                    </form>
                  </>
                )}

                {beratungstermin && (
                  <BeratungsterminCard token={token} termin={beratungstermin} />
                )}

                {/* AAR-956: Kunde ist ohne Termin-Buchung weiter (kein_match/Skip) —
                    Erwartung setzen, dass der Termin nachgelagert vereinbart wird. */}
                {ohneTermin && (
                  <div className="bg-claimondo-ondo/[0.06] border border-claimondo-ondo/20 rounded-ios-md px-4 py-3 mb-5">
                    <p className="text-sm text-claimondo-ondo">
                      {t('step_account.termin_folgt')}
                    </p>
                  </div>
                )}

                {/* CMM-14: Bei Komplett-Mandat juristischen Ansprechpartner
                    anzeigen. LexDrive meldet sich proaktiv beim Kunden via
                    Edge-Function — hier nur die Visitenkarte.
                    Prod-Incident 29.07. (Aaron, "nur Gutachten" -> LexDrive-Karte): das Gate darf
                    nicht an der SSR-Prop lead.service_typ haengen — die ist zum Zeitpunkt des
                    client-seitigen Sprungs auf den account-Step potenziell stale (Autosave der
                    Service-Wahl + LeadRealtimeRefresh-Race). Die frische Wahl aus dem SA-/POS-Step
                    (serviceValues) gewinnt; die Prop bleibt Fallback fuer Dispatcher-vorbereitete
                    Leads ohne Service-Feld im Flow. Soll (Aaron): nur_gutachter = KEIN juristischer
                    Ansprechpartner. */}
                {((serviceValues['service_typ'] as string | undefined) ?? lead.service_typ) === 'komplett' && (
                  <div className="mb-5 rounded-ios-md border border-claimondo-ondo/20 bg-gradient-to-br from-claimondo-ondo/10 to-claimondo-shield/5 p-5">
                    <p className="text-xs uppercase tracking-wider text-claimondo-ondo mb-1">
                      {t('step_account.lexdrive.label')}
                    </p>
                    <p className="text-base font-semibold text-claimondo-navy mb-1">
                      LexDrive
                    </p>
                    <p className="text-xs text-claimondo-ondo">
                      {t('step_account.lexdrive.hinweis')}
                    </p>
                  </div>
                )}

                {creatingAccount && (
                  <div className="rounded-ios-md border border-claimondo-border bg-white p-6 text-center">
                    <div className="inline-block w-6 h-6 border-2 border-claimondo-ondo border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-sm text-claimondo-ondo">{t('step_account.creating')}</p>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-danger-strong bg-danger-soft border border-danger/30 rounded-ios-md px-4 py-3 mb-4">
                    {error}
                  </p>
                )}

                {/* AAR-956: Account-Fehler ist non-kritisch — der Fall/Claim
                    ist bei SA-Unterschrift bereits angelegt. Kunde sieht nur den
                    Abschluss-Screen, das Team legt den Account bei Bedarf nach. */}
              </div>
            )}

            {/* KFZ-125: Onboarding/Uploads ins Kunden-Portal verschoben */}
          </SheetCard>
        </div>

        {/* Navigation — Schritt 1 (Zusammenfassung) hat Weiter-Button */}
        {currentStep.id === 'zusammenfassung' && (
          <div className="pt-4">
            <button
              onClick={async () => {
                // Pflichtpunkt offen -> nicht still als toter Button blockieren, sondern aktiv
                // hinweisen: Highlight + Scroll auf den Datenschutz-Block (Conversion-Fix).
                if (!datenschutz || !editVorname || !editNachname) {
                  setZeigeWeiterHinweis(true)
                  datenschutzRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  return
                }
                // Korrigierte Stammdaten speichern
                const stammChanged = editVorname !== lead.vorname || editNachname !== lead.nachname || editTelefon !== lead.telefon || editEmail !== lead.email
                // AAR-956: Besichtigungsort geaendert? Neue Place-Auswahl ODER Adress-Text abweichend vom Prefill.
                const standortChanged = editStandortPlace != null || editStandortText !== standortPrefill
                if (stammChanged || standortChanged) {
                  // Ein Payload fuer beide Pfade: was online geschrieben wird, replayed offline identisch
                  // (sonst verlöre der Outbox-Replay den Besichtigungsort aus AAR-956).
                  const data = {
                    vorname: editVorname, nachname: editNachname, telefon: editTelefon, email: editEmail,
                    // Koordinaten NUR bei Dropdown-Auswahl (editStandortPlace) schreiben — reiner
                    // Freitext aktualisiert nur die Adresse, die Makler-Koordinaten bleiben erhalten.
                    ...(standortChanged ? {
                      fahrzeug_standort_adresse: editStandortPlace?.adresse ?? editStandortText,
                      ...(editStandortPlace ? {
                        fahrzeug_standort_plz: editStandortPlace.plz,
                        fahrzeug_standort_lat: editStandortPlace.lat,
                        fahrzeug_standort_lng: editStandortPlace.lng,
                        fahrzeug_standort_place_id: editStandortPlace.place_id,
                      } : {}),
                    } : {}),
                  }
                  // Slice 2-write-1: offline -> Stammdaten in die Outbox (class B, LWW),
                  // Wizard schaltet optimistisch weiter. Der Handler replayed bei Reconnect.
                  if (!navigator.onLine) {
                    void enqueueOp({ kind: 'flow_stammdaten', replay_class: 'B', payload: { leadId: lead.id, data, token }, entity_ref: { scope: 'lead', id: lead.id } }).catch(() => {})
                    setAccountEmail(editEmail)
                  } else {
                    try {
                      await updateLeadStammdaten(lead.id, data, token)
                      setAccountEmail(editEmail)
                    } catch { /* weiter trotzdem */ }
                  }
                }
                setStepIndex(stepIndex + 1) // → nächster Step (quali/termin/gutachter je nach Pfad)
              }}
              className="w-full inline-flex items-center justify-center gap-2 min-h-12 px-6 py-3.5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0 transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)]"
            >
              {t('common.weiter')}
            </button>
          </div>
        )}

        {/* Zurück-Button (auf Schritt 2 und 3) */}
        {(currentStep.id === 'gutachter' ||
          currentStep.id === 'sa') && (
          <div className="pt-3 flex justify-center">
            <button
              onClick={() => setStepIndex(stepIndex - 1)}
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-navy/[0.06] hover:bg-claimondo-navy/[0.10] text-claimondo-navy text-sm font-semibold tracking-[-.01em] px-5 py-3 min-h-11 transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:-translate-y-[1px]"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              {t('common.zurueck')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function StepHeader({ question, sub, icon }: { question: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="mb-7">
      {icon && <div className="mb-3">{icon}</div>}
      <h1 className="text-2xl font-semibold text-claimondo-navy leading-snug">{question}</h1>
      {sub && <p className="mt-2 text-sm text-claimondo-ondo">{sub}</p>}
    </div>
  )
}

function EditableInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="block text-sm font-semibold text-claimondo-navy tracking-[-.01em]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full px-4 py-3.5 rounded-ios-md text-base ${liquidFieldBase}`}
      />
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 rounded-ios-md bg-claimondo-navy/[0.03] border border-claimondo-navy/[0.06]">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-claimondo-ondo">{label}</span>
      <span className="text-sm text-claimondo-navy break-words tracking-[-.005em]">{value}</span>
    </div>
  )
}
