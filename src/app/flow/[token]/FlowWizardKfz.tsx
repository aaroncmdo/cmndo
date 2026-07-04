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
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { signSAandCreateFall, createKundeAccount, updateLeadStammdaten, generateSAPdf } from './actions'
import { uploadFlowSignatur } from '@/lib/actions/unterschrift-upload'
import { formatBerlin } from '@/lib/google-calendar/timezone'
// AAR-956 §3a: datengetriebener incomplete-Pfad (termin-loser Self-Service-Lead).
import { FlowQualiStep } from './FlowQualiStep'
import { FlowSlotStep, type GebuchterTermin } from './FlowSlotStep'
import { aendereTerminFlow } from './self-service-actions'
import { BeratungsterminCard } from './BeratungsterminCard'
import { KaskoEndansicht } from '@/components/self-service/KaskoEndansicht'
import { FlowFeststellungStep } from './FlowFeststellungStep'
import { FlowWerkstattStep } from './FlowWerkstattStep'
import { istFeststellungsFeld } from '@/lib/self-service/feststellung-felder'
import type { OnboardingPhase, OnboardingFeld } from '@/components/onboarding/types'
import { FieldRenderer } from '@/components/onboarding/FieldRenderer'
import { meetsCondition } from './feststellung-steps'
import { speichereFeststellungFlow } from './self-service-feststellung-actions'
import {
  CheckIcon,
  FileTextIcon,
  CarIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  UserPlusIcon,
  UserIcon,
  PenToolIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import LegalDocPopover from '@/components/legal/LegalDocPopover'
import { SheetCard } from '@/components/shared/SheetCard'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
import { liquidFieldBase } from '@/lib/styles/liquid-field'

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
type StepId = 'zusammenfassung' | 'quali' | 'feststellung' | 'werkstatt' | 'termin' | 'gutachter' | 'sa' | 'account'

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
  terminPending,
  besichtigungsAdresse,
  feststellungPhasen,
  feststellungWerte,
  serviceFelder,
  serviceWerte,
  legalDocs,
  beratungstermin,
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
  // AAR-956 16.06. (Aaron Wunschtermin-Modell): kein harter Termin, aber gewählter SV +
  // Wunschtermin → Gutachter-Step zeigt den Wunschtermin als "wird bestätigt" (kein Re-Pick).
  terminPending?: boolean
  besichtigungsAdresse?: string | null
  // AAR-956 P4-A: ① Feststellung — lead-erfassung(kunde)-Phasen + Initialwerte (server).
  feststellungPhasen?: OnboardingPhase[]
  feststellungWerte?: Record<string, unknown>
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
  // SV-Schritt: Akzeptanz Widerrufsbelehrung + Datenschutz des SVs (Pflicht
  // bevor „Weiter" zum SA-Step). Modale für die zwei Texte.
  const [svRechtsakzeptanz, setSvRechtsakzeptanz] = useState(false)
  const [svWiderrufOffen, setSvWiderrufOffen] = useState(false)
  const [svDatenschutzOffen, setSvDatenschutzOffen] = useState(false)
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [saAccepted, setSaAccepted] = useState(false)
  const [saVolltextOffen, setSaVolltextOffen] = useState(false)
  const [submittingSA, setSubmittingSA] = useState(false)
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
  // Autosave bei jeder Aenderung (speichereFeststellungFlow), damit signSAandCreateFall den
  // gewaehlten Service/Kanzlei vom Lead liest.
  const [serviceValues, setServiceValues] = useState<Record<string, unknown>>(serviceWerte ?? {})
  function setServiceFeld(key: string, val: unknown) {
    setServiceValues((v) => {
      const next = { ...v, [key]: val }
      void speichereFeststellungFlow(token, next).catch(() => {})
      return next
    })
  }

  // Editierbare Stammdaten (KFZ-117: Kunde kann korrigieren)
  const [editVorname, setEditVorname] = useState(lead.vorname)
  const [editNachname, setEditNachname] = useState(lead.nachname)
  const [editTelefon, setEditTelefon] = useState(lead.telefon)
  const [editEmail, setEditEmail] = useState(lead.email)

  // Account step — CMM-14: Account-Anlage läuft automatisch direkt nach SA.
  // Kein Edit-Form mehr — der Kunde sieht nur das Erfolgsergebnis.
  const [accountPassword, setAccountPassword] = useState('')
  const [accountEmail, setAccountEmail] = useState(editEmail)
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [accountCreated, setAccountCreated] = useState(false)
  // A11y: Ref auf den SA-Volltext-Modal-Container fuer den Focus-Trap.
  const saModalRef = useRef<HTMLDivElement>(null)

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
  const istIncomplete = initialNeedsBooking
  const qualiPending = istIncomplete && !lead.disqualifiziert && !initialSchuldfrage
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
  const STEPS: { id: StepId; label: string }[] = istIncomplete
    ? [
        { id: 'zusammenfassung', label: 'Zusammenfassung' },
        ...(qualiPending ? [{ id: 'quali' as StepId, label: 'Schuldfrage' }] : []),
        ...(initialHatFeststellung ? [{ id: 'feststellung' as StepId, label: 'Angaben' }] : []),
        ...(initialNeedsWerkstatt ? [{ id: 'werkstatt' as StepId, label: 'Werkstatt' }] : []),
        { id: 'termin', label: 'Termin' },
        { id: 'gutachter', label: 'Ihr Gutachter' },
        { id: 'sa', label: 'Beauftragung' },
        { id: 'account', label: 'Konto' },
      ]
    : [
        // AAR-956 self-service (Aaron 14.06.): Embed-Lead hat einen Termin, ① Feststellung muss
        // aber trotzdem laufen (Hergang/Fahrzeug/Gegner) — wenn die Config sie liefert (s. page.tsx
        // feststellungNeeded). ②Quali+③Slot bleiben weg (Termin steht).
        { id: 'zusammenfassung', label: 'Zusammenfassung' },
        ...(initialHatFeststellung ? [{ id: 'feststellung' as StepId, label: 'Angaben' }] : []),
        ...(initialNeedsWerkstatt ? [{ id: 'werkstatt' as StepId, label: 'Werkstatt' }] : []),
        { id: 'gutachter', label: 'Ihr Gutachter' },
        { id: 'sa', label: 'Beauftragung' },
        { id: 'account', label: 'Konto' },
      ]
  const stepIndexById = (id: StepId): number => STEPS.findIndex((s) => s.id === id)

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

  // A11y: SA-Volltext-Modal — Esc-schliessen, Focus-Trap (Tab-Wrap) + Focus-Restore
  // beim Schliessen. Backdrop-Klick-schliessen existiert separat im JSX.
  useEffect(() => {
    if (!saVolltextOffen) return
    const prevFocus = document.activeElement as HTMLElement | null
    const focusables = () =>
      saModalRef.current
        ? Array.from(
            saModalRef.current.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => !el.hasAttribute('disabled'))
        : []
    focusables()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSaVolltextOffen(false); return }
      if (e.key !== 'Tab') return
      const f = focusables()
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prevFocus?.focus?.()
    }
  }, [saVolltextOffen])

  // AAR-956 Task 1: Im gutachter-Step ohne zugeordneten SV/Termin NICHT passiv
  // "wir suchen ..." zeigen, sondern aktiv weiterleiten. Gibt es einen Buchungs-Step
  // (kanonischer Pfad) -> dorthin (Kunde bucht selbst); sonst direkt zur Beauftragung
  // (Dispatcher-/Flag-off-Pfad ohne Slot-Picker: AAR-908 ordnet bei SA den Top-SV zu).
  // Kein telefonischer Wartezustand mehr.
  const gutachterWeiterZiel: StepId =
    !gutachterAnzeige && stepIndexById('termin') >= 0 ? 'termin' : 'sa'

  // ─── SA unterzeichnen + Fall erstellen ─────────────────────────────────────

  async function handleSignSA() {
    if (!signatureBlob) return
    setSubmittingSA(true)
    setError(null)
    try {
      // 1. Unterschrift als PNG → DataURL → Server-Action mit service_role
      //    (Batch 4: Anon-Write auf `unterschriften` fällt mit Schritt D)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Bild-Encoding fehlgeschlagen'))
        reader.readAsDataURL(signatureBlob)
      })
      const uploadRes = await uploadFlowSignatur(token, dataUrl)
      if (!uploadRes.ok) throw new Error(uploadRes.error)
      const publicUrl = uploadRes.url

      // 2. Server Action: Fall erstellen
      // AAR-360 Follow-up: SV-Datenschutz/Widerruf-Zustimmung (nur relevant wenn ein SV zugewiesen ist).
      const result = await signSAandCreateFall(lead.id, publicUrl, flowLinkId ?? null, gutachterAnzeige ? svRechtsakzeptanz : false, token)
      if (!result.ok) throw new Error(result.error ?? 'Fehler bei der Beauftragung')
      setFallId(result.fallId)

      // 3. SA-PDF generieren (Background, non-blocking)
      generateSAPdf(result.fallId, lead.id, publicUrl, token).catch(() => {})

      // AAR-99 + AAR-305: Nach SA → Account-Step (dynamisch per ID)
      setStepIndex(stepIndexById('account'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('step_sa.error_fallback'))
    } finally {
      setSubmittingSA(false)
    }
  }

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
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-4 sm:px-5 pt-5 pb-32 max-w-lg mx-auto w-full">
        <div className="flex-1 flex flex-col justify-center py-4">
          <SheetCard key={currentStep.id} size="full" padding="none" className="px-6 py-7">

            {/* ═══ SCHRITT 1: ZUSAMMENFASSUNG + DATENSCHUTZ ═══ */}
            {currentStep.id === 'zusammenfassung' && (
              <div>
                <StepHeader
                  question={t('step_summary.heading', { name: editVorname || 'dort' })}
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
                </div>

                {/* AAR-336: Nicht-editierbare Infos (aus Dispatch-Qualifizierung) —
                    Review-Ansicht. Alle Felder readonly, leere Felder werden
                    unterdrückt. Korrekturen laufen über Telefonat zum KB.
                    Vorher hatte dieser Schritt leere Dropdowns die den Kunden
                    zur Neu-Eingabe bereits erfasster Werte zwangen. */}
                <div className="space-y-2 mb-6">
                  {(lead.fahrzeug_standort_adresse || lead.fahrzeug_standort_plz) && (
                    <SummaryRow label={t('step_summary.labels.standort')} value={[lead.fahrzeug_standort_adresse, lead.fahrzeug_standort_plz].filter(Boolean).join(', ')} />
                  )}
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
                onWeiter={() => setStepIndex(stepIndex + 1)}
              />
            )}

            {/* ═══ AAR-956 P4-A: FESTSTELLUNG (deklarative Fakten, nur incomplete-Pfad) ═══ */}
            {currentStep.id === 'feststellung' && (
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
              <FlowSlotStep
                token={token}
                onGebucht={(t) => {
                  setGebuchterTermin(t)
                  setStepIndex(stepIndexById('gutachter'))
                }}
                onOhneTermin={() => {
                  setOhneTermin(true)
                  setStepIndex(stepIndexById('sa'))
                }}
              />
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
                        setStepIndex(stepIndexById('sa'))
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
                    onClick={() => setStepIndex(stepIndexById(gutachterWeiterZiel))}
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

            {/* Reparaturwunsch/Werkstatt: Kunde waehlt eine Partner-Werkstatt (5 naechste).
                Ueberspringbar; onWeiter -> naechster Step (termin/gutachter/sa je nach Pfad). */}
            {currentStep.id === 'werkstatt' && (
              <FlowWerkstattStep token={token} onWeiter={() => setStepIndex(stepIndex + 1)} />
            )}

            {/* ═══ SCHRITT 4: SA UNTERSCHREIBEN ═══ */}
            {currentStep.id === 'sa' && (
              <div>
                <StepHeader
                  question={t('step_sa.heading')}
                  sub={t('step_sa.sub')}
                  icon={<PenToolIcon className="w-8 h-8 text-claimondo-ondo" />}
                />

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
                          disabled={submittingSA}
                        />
                      ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setSaVolltextOffen(true)}
                  className="flex items-center gap-2 text-sm text-claimondo-ondo hover:underline mb-5"
                >
                  <FileTextIcon className="w-4 h-4" />
                  {t('step_sa.volltext_link')}
                </button>

                {/* SA-Volltext-Popover */}
                {saVolltextOffen && (
                  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setSaVolltextOffen(false)} />
                    <div ref={saModalRef} role="dialog" aria-modal="true" aria-labelledby="sa-volltext-title" className="relative z-10 w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-ios-md shadow-claimondo-lg flex flex-col max-h-[90dvh]">
                      {/* Header */}
                      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-claimondo-border flex-shrink-0">
                        <h2 id="sa-volltext-title" className="text-sm font-semibold text-claimondo-navy">{t('step_sa.popover_titel')}</h2>
                        <button type="button" aria-label="Schließen" onClick={() => setSaVolltextOffen(false)} className="p-1.5 rounded-ios-sm hover:bg-claimondo-bg">
                          <XIcon className="w-4 h-4 text-claimondo-ondo" />
                        </button>
                      </div>
                      {/* Scrollbarer Text */}
                      <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-claimondo-navy space-y-4 leading-relaxed">
                        <h3 className="font-semibold">{t('step_sa.volltext.s1_titel')}</h3>
                        <p>{t.rich('step_sa.volltext.s1_text', { strong: (chunks) => <strong>{chunks}</strong> })}</p>
                        <ul className="list-disc pl-5 space-y-1 text-sm">
                          <li>{t('step_sa.volltext.s1_li1')}</li>
                          <li>{t('step_sa.volltext.s1_li2')}</li>
                          <li>{t('step_sa.volltext.s1_li3')}</li>
                          <li>{t('step_sa.volltext.s1_li4')}</li>
                        </ul>
                        <h3 className="font-semibold">{t('step_sa.volltext.s2_titel')}</h3>
                        <p>{t.rich('step_sa.volltext.s2_text', { strong: (chunks) => <strong>{chunks}</strong> })}</p>
                        <h3 className="font-semibold">{t('step_sa.volltext.s3_titel')}</h3>
                        <p>{t('step_sa.volltext.s3_intro')}</p>
                        <ul className="list-disc pl-5 space-y-1 text-sm">
                          <li>{t('step_sa.volltext.s3_li1')}</li>
                          <li>{t('step_sa.volltext.s3_li2')}</li>
                          <li>{t('step_sa.volltext.s3_li3')}</li>
                          <li>{t('step_sa.volltext.s3_li4')}</li>
                        </ul>
                        <h3 className="font-semibold">{t('step_sa.volltext.s4_titel')}</h3>
                        <p>{t('step_sa.volltext.s4_text')}</p>
                        <h3 className="font-semibold">{t('step_sa.volltext.s5_titel')}</h3>
                        <p>{t('step_sa.volltext.s5_text')}</p>
                        <p className="text-xs text-claimondo-ondo pt-2 border-t border-claimondo-border">{t('step_sa.volltext.footer_note')}</p>
                      </div>
                      {/* Footer */}
                      <div className="px-5 py-4 border-t border-claimondo-border flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => { setSaAccepted(true); setSaVolltextOffen(false) }}
                          className="w-full py-3.5 rounded-ios-md bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm transition-all active:scale-[0.98]"
                        >
                          {t('step_sa.volltext.cta_accept')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Unterschrifts-Canvas */}
                <div className="mb-4">
                  <p className="text-xs text-claimondo-ondo uppercase tracking-wider mb-2">{t('step_sa.unterschrift_label')}</p>
                  <SignatureCanvas
                    onSignature={setSignatureBlob}
                    placeholder={t('step_sa.unterschrift_placeholder')}
                    clearLabel={t('step_sa.unterschrift_loeschen')}
                  />
                </div>

                {/* Checkbox */}
                <label className="flex items-start gap-3 cursor-pointer mb-5">
                  <input
                    type="checkbox"
                    checked={saAccepted}
                    onChange={e => setSaAccepted(e.target.checked)}
                    className="mt-0.5 w-5 h-5 rounded border-claimondo-border accent-claimondo-ondo shrink-0"
                  />
                  <span className="text-sm text-claimondo-ondo leading-relaxed">
                    {t('step_sa.checkbox_text')}{' '}
                    <LegalDocPopover titel={legalDocs?.agb?.titel ?? 'AGB'} markdown={legalDocs?.agb?.markdown ?? ''}>
                      {t('step_sa.agb_link')}
                    </LegalDocPopover>{' '}
                    {t('step_sa.widerruf_link')} <span className="text-danger">*</span>
                  </span>
                </label>

                {/* AAR-360 Follow-up: separates Pflicht-Häkchen für Datenschutz + Widerrufsbelehrung
                    des zugewiesenen Gutachters (entkoppelt von der SA-Signatur). Nur wenn ein SV
                    zugewiesen ist. Datenschutz/Widerruf des SV als Links (falls hochgeladen). */}
                {gutachterAnzeige && (
                  <label className="flex items-start gap-3 cursor-pointer mb-5">
                    <input
                      type="checkbox"
                      checked={svRechtsakzeptanz}
                      onChange={e => setSvRechtsakzeptanz(e.target.checked)}
                      className="mt-0.5 w-5 h-5 rounded border-claimondo-border accent-claimondo-ondo shrink-0"
                    />
                    <span className="text-sm text-claimondo-ondo leading-relaxed">
                      {t('step_sa.sv_consent_text', { firma: gutachterAnzeige.firma ?? gutachterAnzeige.vorname })}
                      <span className="text-danger"> *</span>
                      {(gutachterAnzeige.datenschutzUrl || gutachterAnzeige.widerrufUrl) && (
                        <span className="block text-xs mt-1">
                          {gutachterAnzeige.datenschutzUrl && (
                            <a href={gutachterAnzeige.datenschutzUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-claimondo-navy">
                              {t('step_sa.sv_consent_datenschutz_link')}
                            </a>
                          )}
                          {gutachterAnzeige.datenschutzUrl && gutachterAnzeige.widerrufUrl && ' · '}
                          {gutachterAnzeige.widerrufUrl && (
                            <a href={gutachterAnzeige.widerrufUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-claimondo-navy">
                              {t('step_sa.sv_consent_widerruf_link')}
                            </a>
                          )}
                        </span>
                      )}
                    </span>
                  </label>
                )}

                {error && <p className="text-sm text-danger-strong bg-danger-soft border border-danger/30 rounded-ios-md px-4 py-3 mb-4">{error}</p>}

                <button
                  onClick={handleSignSA}
                  disabled={!signatureBlob || !saAccepted || (!!gutachterAnzeige && !svRechtsakzeptanz) || submittingSA}
                  className="w-full inline-flex items-center justify-center gap-2 min-h-12 px-6 py-3.5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0 transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)]"
                >
                  {submittingSA ? t('step_sa.submitting') : t('step_sa.cta_sign')}
                </button>
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
                    Edge-Function — hier nur die Visitenkarte. */}
                {lead.service_typ === 'komplett' && (
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
                if (editVorname !== lead.vorname || editNachname !== lead.nachname || editTelefon !== lead.telefon || editEmail !== lead.email) {
                  try {
                    await updateLeadStammdaten(lead.id, { vorname: editVorname, nachname: editNachname, telefon: editTelefon, email: editEmail }, token)
                    setAccountEmail(editEmail)
                  } catch { /* weiter trotzdem */ }
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

// ─── Signature Canvas (using signature_pad library) ──────────────────────────

function SignatureCanvas({ onSignature, placeholder, clearLabel }: { onSignature: (blob: Blob | null) => void; placeholder?: string; clearLabel?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const padRef = useRef<any>(null)
  const [isEmpty, setIsEmpty] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pad: any = null
    import('signature_pad').then(({ default: SignaturePad }) => {
      if (!canvasRef.current) return
      const canvas = canvasRef.current
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(ratio, ratio)

      pad = new SignaturePad(canvas, {
        penColor: '#1E3A5F',
        minWidth: 1.5,
        maxWidth: 3,
        backgroundColor: 'rgb(255, 255, 255)',
      })
      pad.addEventListener('endStroke', () => {
        setIsEmpty(pad.isEmpty())
        if (!pad.isEmpty()) {
          canvas.toBlob(blob => onSignature(blob), 'image/png')
        }
      })
      padRef.current = pad
    })

    return () => { if (pad) pad.off() }
  }, [])

  function clearSignature() {
    padRef.current?.clear()
    setIsEmpty(true)
    onSignature(null)
  }

  return (
    <div>
      <div className="relative border-2 border-claimondo-border rounded-ios-md overflow-hidden bg-white">
        <canvas ref={canvasRef} className="w-full h-44 touch-none" />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-claimondo-ondo/50 text-sm">{placeholder ?? 'Hier unterschreiben'}</p>
          </div>
        )}
      </div>
      {!isEmpty && (
        <button onClick={clearSignature} className="mt-2 text-xs text-claimondo-ondo hover:text-claimondo-navy flex items-center gap-1">
          <Trash2Icon className="w-3 h-3" /> {clearLabel ?? 'Unterschrift löschen'}
        </button>
      )}
    </div>
  )
}
