'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  PackageIcon,
  FileSignatureIcon,
  CreditCardIcon,
  ImageIcon,
  CalendarIcon,
  CheckCircle2Icon,
  MapPinIcon,
  UserIcon,
  Building2Icon,
  AlertTriangleIcon,
  ClockIcon,
  CheckIcon,
  FileTextIcon,
  NetworkIcon,
} from 'lucide-react'
// P5 T8: Netzwerkpartner-Abo-Ask als optionaler Abschluss-Step (skippbar).
import { NetzwerkpartnerCta } from '@/components/netzwerk/NetzwerkpartnerCta'
import { starteNetzwerkAboCheckout } from '@/app/gutachter/einstellungen/netzwerk-abo/actions'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { signSvVertrag, startStripeCheckout, einloeseGutscheincode } from '@/lib/actions/sv-onboarding-actions'
import { signBueroVertrag, startBueroStripeCheckout } from '@/app/gutachter/onboarding/buero/actions'
import { signAkademieVertrag, startAkademieStripeCheckout } from '@/app/gutachter/onboarding/_akademie/actions'
import { akzeptiereAgbSubSv } from './actions'
import SignaturePadInput from '@/components/SignaturePadInput'
import { Button } from '@/components/primitives/Button/Button.web'
import StripeBrandingFooter from '@/components/StripeBrandingFooter'
import LogoUploadStep from '@/components/LogoUploadStep'
import DokumenteUploadStep, { type DokumentSlotState } from '@/components/DokumenteUploadStep'
import KalenderConnectStep from '@/components/KalenderConnectStep'
import OrderSummaryCard from './OrderSummaryCard'
import LeadPreisOverlay, { type LeadpreisRow } from './LeadPreisOverlay'
import { LoadingButton } from '@/components/ui/loading-button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ARCH-1: Willkommen-Wizard mit drei Rollen-Varianten:
//   - solo            : 3-Step Wizard (Konditionen → Vertrag+Sig → Stripe)
//   - buero_inhaber   : 3-Step Wizard mit Sub-Tabelle + Buero-Vertrag +
//                       Buero-Sammel-Anzahlung
//   - sub_mitarbeiter : 2-Step Light-Flow (Paket-Hinweis → Checkbox-AGB +
//                       Name) → Warte-Page oder direkt /gutachter

// KFZ-152 Phase 2+3: 5 Rollen-Varianten:
//   - solo            : klassischer Solo-SV
//   - buero_inhaber   : Buero-Inhaber, zentrale Anzahlung fuer alle Standorte
//   - akademie_verwalter : Akademie-Verwalter, individuelle Erst-Anzahlung
//   - sub_mitarbeiter : Sub-SV (Buero oder Akademie), nur AGB-Checkbox
//   - community_member : Community-Mitglied, technisch wie Solo aber mit Banner
type Rolle = 'solo' | 'buero_inhaber' | 'akademie_verwalter' | 'sub_mitarbeiter' | 'community_member'

const PAKET_LABELS: Record<string, string> = {
  standard: 'Standard',
  pro: 'Pro',
  premium: 'Premium',
  individuell: 'Individuell',
}

type SvData = {
  id: string
  paket: string
  paket_faelle_gesamt: number
  paket_umkreis_km: number
  onboarding_anzahlung_betrag: number
  onboarding_status: string | null
  vertrag_unterschrieben: boolean
  standort_adresse: string | null
  standort_plz: string | null
  rolle_in_organisation: string | null
  portal_zugang_freigeschaltet: boolean
  logo_url: string | null
  // BUG-96: fuer die Stammdaten-Card im Vertrag-Step
  firmenname: string | null
  gcal_connected: boolean
  // AAR-717: alternativer Kalender-Connect via CalDAV (iCloud etc.)
  caldav_connected: boolean
  steuernummer: string | null
  // AAR-714: Pflichtdokumente-States für den Dokumente-Step
  dokumenteSlots: DokumentSlotState[]
  dokumenteKomplett: boolean
}

type Vorlage = {
  id: string
  typ: string
  titel: string
  version: string
  inhalt_html: string
  pflicht_unterschrift: boolean
}

type SubSvRow = {
  id: string
  name: string | null
  standort_adresse: string | null
  standort_plz: string | null
  paket: string
  onboarding_anzahlung_betrag: number
  profile_email: string | null
}

type Organisation = {
  id: string
  name: string
  typ: string | null
  onboarding_status: string | null
  // BUG-96: rechtsform + steuernummer fuer die Stammdaten-Card
  rechtsform: string | null
  steuernummer: string | null
}

// KFZ-157: Solo + Buero-Inhaber haben jetzt 4 Steps (Konditionen → Vertrag
// → Anzahlung → Logo). Sub-Mitarbeiter behalten ihren 2-Step Light-Flow.
// AAR-233: Logo-Upload von Step 4 auf Step 2 verschoben — SV sieht sein
// Branding früh im Prozess, Vertrag + Zahlung in seinen Farben.
// AAR-242: Kalender-Connect-Step nach Anzahlung ergänzt (Google OAuth oder
// Opt-Out) — Pflicht für Terminvorschläge.
// AAR-714: Step 'sa_vorlage' → 'dokumente'. Statt einer SA-PDF werden hier
// drei Pflichtdokumente (Sicherungsabtretung|Honorarvereinbarung +
// Datenschutzerklärung + Widerrufsbelehrung) eingesammelt. Nach Admin-
// Freigabe aller drei setzt dokumenteFreigeben() sachverstaendige.
// verifiziert=true.
const STEPS_4: { key: string; label: string; icon: typeof PackageIcon }[] = [
  { key: 'konditionen', label: 'Konditionen', icon: PackageIcon },
  { key: 'branding', label: 'Logo', icon: ImageIcon },
  { key: 'vertrag', label: 'Vertrag', icon: FileSignatureIcon },
  { key: 'anzahlung', label: 'Anzahlung', icon: CreditCardIcon },
  { key: 'dokumente', label: 'Dokumente', icon: FileTextIcon },
  { key: 'kalender', label: 'Kalender', icon: CalendarIcon },
  // P5 T8: optionaler Abschluss-Ask (skippbar) — kein Pflicht-Schritt, der Skip
  // schliesst das Onboarding unveraendert ab.
  { key: 'netzwerk', label: 'Netzwerk', icon: NetworkIcon },
]

const STEPS_2_SUB: { key: string; label: string; icon: typeof PackageIcon }[] = [
  { key: 'konditionen', label: 'Ihr Paket', icon: PackageIcon },
  { key: 'agb', label: 'Bedingungen', icon: FileSignatureIcon },
]

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })
}

export default function WillkommenClient({
  rolle,
  sv,
  profile,
  organisation,
  subSvs,
  gesamtAnzahlung,
  nbVorlage,
  kvVorlage,
  stepOverride,
  stripePublishableKey,
  leadpreise,
  netzwerkMonatEuro = '',
  netzwerkSetupEuro = '',
}: {
  rolle: Rolle
  sv: SvData
  profile: { vorname: string | null; nachname: string | null; email: string | null; telefon: string | null }
  organisation: Organisation | null
  subSvs: SubSvRow[]
  gesamtAnzahlung: number
  nbVorlage: Vorlage | null
  kvVorlage: Vorlage | null
  stepOverride?: number
  stripePublishableKey: string
  leadpreise: LeadpreisRow[]
  /** P5 T8: formatierte Netzwerkpartner-Preise (leer = Config fehlt -> Step wird uebersprungen). */
  netzwerkMonatEuro?: string
  netzwerkSetupEuro?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // AAR-214: Nach Stripe-Success-Redirect (?stripe_success=1) sind die
  // Server-Props veraltet (portal_zugang_freigeschaltet=true, anzahlung_status=bezahlt
  // wurden vom Webhook erst NACH dem Server-Fetch gesetzt). router.refresh()
  // lädt Server-Props neu, danach entfernen wir das Query-Flag per
  // router.replace, damit ein weiterer Navigation-Event nicht erneut
  // refresht (Loop-Schutz).
  useEffect(() => {
    if (searchParams?.get('stripe_success') === '1') {
      router.refresh()
      const url = new URL(window.location.href)
      url.searchParams.delete('stripe_success')
      url.searchParams.delete('session_id')
      router.replace(url.pathname + url.search, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // KFZ-152 Phase 2+3: Wir behandeln intern nur die 3 Render-Kategorien
  // (solo/buero_inhaber/sub_mitarbeiter). Akademie-Verwalter rendert wie
  // buero_inhaber, Community-Member wie solo. Spezifische Dispatches
  // (signAkademieVertrag, startAkademieStripeCheckout) benutzen die
  // 5-wertige `rolle` prop direkt.
  const r: 'solo' | 'buero_inhaber' | 'sub_mitarbeiter' =
    rolle === 'akademie_verwalter' ? 'buero_inhaber'
    : rolle === 'community_member' ? 'solo'
    : rolle
  // KFZ-157: Sub-Mitarbeiter behalten 2-Step Flow, alle anderen jetzt 4-Step.
  const STEPS = r === 'sub_mitarbeiter' ? STEPS_2_SUB : STEPS_4

  // Initial-Step basierend auf Status (reload-sicher):
  // - Solo: sv.vertrag_unterschrieben → Step 2 (Stripe)
  // - Inhaber: signBueroVertrag setzt nur organisationen.onboarding_status,
  //   nicht sv.vertrag_unterschrieben — also Org-Status als Quelle nehmen.
  //   'vertrag_unterzeichnet' und 'anzahlung_offen' bedeuten beide:
  //   Vertrag durch, jetzt Stripe.
  // - KFZ-157: portal_zugang_freigeschaltet aber kein Logo → Step 3 (Branding)
  // - Sub-Mitarbeiter: bleibt initial bei Step 0 (falls neu) oder landet
  //   ueber den separaten warteAufInhaber-Branch auf der Warte-Page.
  // AAR-233: Step-Reihenfolge: 0=Konditionen, 1=Logo, 2=Vertrag, 3=Stripe
  let initialStep = 0
  if (r === 'solo' && sv.vertrag_unterschrieben) {
    initialStep = 3 // Vertrag durch → Stripe (Index 3)
  } else if (r === 'buero_inhaber') {
    const orgStatus = organisation?.onboarding_status ?? ''
    if (orgStatus === 'vertrag_unterzeichnet' || orgStatus === 'anzahlung_offen') {
      initialStep = 3 // → Stripe
    }
  }
  // Logo noch nicht hochgeladen → Step 1 (Branding)
  if (r !== 'sub_mitarbeiter' && sv.portal_zugang_freigeschaltet && !sv.logo_url) {
    initialStep = 1
  }
  // AAR-714: Pflichtdokumente noch nicht vollständig → Step 4 (Dokumente).
  // Geht VOR dem Kalender-Gate, damit der SV auch bei vorhandenem Kalender
  // noch die Dokumente nachreicht.
  if (r !== 'sub_mitarbeiter' && sv.portal_zugang_freigeschaltet && !sv.dokumenteKomplett) {
    initialStep = 4
  }
  // AAR-242: Kalender noch nicht verbunden → Kalender-Step (Index 5).
  if (
    r !== 'sub_mitarbeiter'
    && sv.portal_zugang_freigeschaltet
    && sv.dokumenteKomplett
    && !sv.gcal_connected
    && !sv.caldav_connected
  ) {
    initialStep = 5
  }
  if (typeof stepOverride === 'number') initialStep = stepOverride

  const [step, setStep] = useState(initialStep)
  // P5 T8: Netzwerkpartner-Ask (embedded Checkout im Abschluss-Step).
  const [netzwerkClientSecret, setNetzwerkClientSecret] = useState<string | null>(null)
  const [netzwerkLoading, setNetzwerkLoading] = useState(false)
  const [netzwerkFehler, setNetzwerkFehler] = useState<string | null>(null)
  // AAR-509: currentKey vor die Stripe-Effects gezogen damit der Anzahlung-
  // Trigger keybasiert statt index-basiert prüfen kann — sonst hängt der
  // Checkout, weil `anzahlung` nach Einführung von `branding`/`dokumente`
  // nicht mehr Index 2 ist.
  const currentKey = STEPS[step]?.key ?? ''
  // AAR-233: Key-basierter Step-Navigation-Helper.
  const goToStep = (key: string) => {
    const idx = STEPS.findIndex(s => s.key === key)
    if (idx >= 0) setStep(idx)
  }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // AAR-213: Overlay-State für Lead-Preis-Tabelle + ROI-Rechner
  const [showLeadPreisOverlay, setShowLeadPreisOverlay] = useState(false)
  const [warteAufInhaber, setWarteAufInhaber] = useState(
    r === 'sub_mitarbeiter' && sv.vertrag_unterschrieben && !sv.portal_zugang_freigeschaltet,
  )

  // KFZ-156: Embedded Checkout state — clientSecret wird beim Eintritt in
  // Step 2 vom Server geholt und an EmbeddedCheckoutProvider uebergeben.
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  // Gutscheincode-Einloesung (Alternative zur Stripe-Anzahlung): schaltet den
  // SV frei und springt zum Dokumente-Schritt weiter (spiegelt Stripe-Success).
  const [gutscheinCode, setGutscheinCode] = useState('')
  const [gutscheinBusy, setGutscheinBusy] = useState(false)
  const [gutscheinError, setGutscheinError] = useState<string | null>(null)
  const handleGutschein = async () => {
    setGutscheinError(null)
    if (!gutscheinCode.trim()) { setGutscheinError('Bitte Code eingeben'); return }
    setGutscheinBusy(true)
    try {
      const res = await einloeseGutscheincode(gutscheinCode.trim())
      if (!res.ok) { setGutscheinError(res.error ?? 'Code ungültig'); return }
      goToStep('dokumente')
      router.refresh()
    } catch {
      setGutscheinError('Einlösen fehlgeschlagen')
    } finally {
      setGutscheinBusy(false)
    }
  }
  const [stripePromise] = useState<Promise<Stripe | null>>(() =>
    stripePublishableKey ? loadStripe(stripePublishableKey) : Promise.resolve(null),
  )

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    // KFZ-152 Phase 2: Akademie-Verwalter triggert createAkademieCheckoutSession
    // (eigene erst_anzahlung_eur), Buero-Inhaber sammelt aller Sub-Anzahlungen,
    // Solo + Community-Member zahlen ihre eigene Anzahlung.
    const result = rolle === 'akademie_verwalter' && organisation
      ? await startAkademieStripeCheckout(organisation.id)
      : rolle === 'buero_inhaber' && organisation
      ? await startBueroStripeCheckout(organisation.id)
      : await startStripeCheckout()
    if ('error' in result) throw new Error(result.error)
    return result.clientSecret
  }, [rolle, organisation])

  const checkoutOptions = useMemo(() => ({ fetchClientSecret }), [fetchClientSecret])

  // AAR-509: Beim Betreten des Anzahlung-Steps ein client_secret holen damit der
  // Provider mounten kann. Vorher wurde hart auf `step === 2` geprüft — seit
  // AAR-233/AAR-242/AAR-359 ist `anzahlung` aber Index 3 (nicht 2), wodurch
  // der Checkout nie initialisiert wurde und auf "wird geladen..." hängen blieb.
  useEffect(() => {
    if (currentKey !== 'anzahlung' || r === 'sub_mitarbeiter') return
    if (clientSecret) return
    let cancelled = false
    setSaving(true)
    setError(null)
    fetchClientSecret()
      .then(secret => { if (!cancelled) setClientSecret(secret) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Stripe-Fehler') })
      .finally(() => { if (!cancelled) setSaving(false) })
    return () => { cancelled = true }
  }, [currentKey, r, clientSecret, fetchClientSecret])

  // AAR-509: Retry-Handler für den Fall, dass die Session-Creation fehlschlägt
  // (z.B. 401 beim Session-Refresh, transiente Stripe-API-Fehler). Statt
  // Endlos-Spinner kann der User die Initialisierung mit einem Klick neu anstoßen.
  const retryCheckout = useCallback(() => {
    setError(null)
    setClientSecret(null)
  }, [])

  // Vertrag-Form (Solo + Inhaber)
  const [unterschriftName, setUnterschriftName] = useState(
    [profile.vorname, profile.nachname].filter(Boolean).join(' '),
  )
  const [agbAccepted, setAgbAccepted] = useState(false)
  const [signaturePng, setSignaturePng] = useState<string | null>(null)

  // BUG-96: Modal-State fuer NB / KV Anzeige. Aaron-Wunsch: 'wenn die das
  // lesen wollen, sollen die auf den dafuer vorgesehenen link klicken.'
  // Statt Scroll-Lock + Inline-Box → Click-Trigger fuer Modal mit dem
  // jeweiligen Vertragstext.
  const [vertragModal, setVertragModal] = useState<'nb' | 'kv' | null>(null)

  const paketLabel = PAKET_LABELS[sv.paket] ?? sv.paket
  const fullName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || '—'

  // AAR-512: showAnzahlungBanner entfernt — der globale Onboarding-Banner im
  // Layout (`src/app/gutachter/layout.tsx`) rendert denselben Hinweis, nur
  // generalisiert + klickbar. Inline-Duplikat an dieser Stelle war redundant.

  // ── Solo-Handler (existing) ────────────────────────────────────────────
  async function handleSoloVertragSubmit() {
    setError(null)
    if (!agbAccepted) { setError('Bitte akzeptiere die AGB/NB/DS'); return }
    if (!unterschriftName.trim()) { setError('Bitte geben Sie Ihren Namen ein'); return }
    if (!signaturePng) { setError('Bitte unterschreibe im Feld unten'); return }
    // BUG-96: Scroll-Lock raus — der User entscheidet ueber die Modal-Links
    // ob er die Vertragstexte vor der Akzeptanz lesen will.

    setSaving(true)
    const result = await signSvVertrag({
      signaturePngDataUri: signaturePng,
      unterschriftName,
    })
    setSaving(false)

    if (!result.success) { setError(result.error ?? 'Vertrag fehlgeschlagen'); return }
    goToStep('anzahlung')
  }

  // KFZ-156: handleSoloCheckout entfaellt — der Embedded Checkout uebernimmt
  // den Stripe-Flow inline in Step 2 (siehe useEffect/fetchClientSecret oben).

  // ── Inhaber-Handler ────────────────────────────────────────────────────
  // KFZ-152 Phase 2: Bei Akademie-Verwalter wird signAkademieVertrag statt
  // signBueroVertrag aufgerufen (anderer vorlage_typ + andere Org-Pruefung).
  async function handleInhaberVertragSubmit() {
    setError(null)
    if (!organisation) { setError('Keine Organisation zugeordnet'); return }
    if (!agbAccepted) { setError('Bitte akzeptiere die AGB/NB/DS'); return }
    if (!unterschriftName.trim()) { setError('Bitte geben Sie Ihren Namen ein'); return }
    if (!signaturePng) { setError('Bitte unterschreibe im Feld unten'); return }

    setSaving(true)
    const result = rolle === 'akademie_verwalter'
      ? await signAkademieVertrag({
          organisation_id: organisation.id,
          signaturePngDataUri: signaturePng,
          unterschriftName,
        })
      : await signBueroVertrag({
          organisation_id: organisation.id,
          signaturePngDataUri: signaturePng,
          unterschriftName,
        })
    setSaving(false)

    if (!result.success) { setError(result.error ?? 'Vertrag fehlgeschlagen'); return }
    goToStep('anzahlung')
  }

  // KFZ-156: handleInhaberCheckout entfaellt ebenfalls — Embedded Checkout
  // mountet inline in Step 2. Die FR-6 0-EUR-Pruefung bleibt im Render-Pfad
  // (Disable des Step-2-Buttons + Fehlermeldung) erhalten.

  // ── Sub-Mitarbeiter-Handler ────────────────────────────────────────────
  async function handleSubAgbSubmit() {
    setError(null)
    if (!agbAccepted) { setError('Bitte bestaetige die Bedingungen'); return }
    if (!unterschriftName.trim()) { setError('Bitte geben Sie Ihren Namen ein'); return }

    setSaving(true)
    const result = await akzeptiereAgbSubSv(sv.id, unterschriftName)
    setSaving(false)

    if (!result.success) { setError(result.error ?? 'Speichern fehlgeschlagen'); return }

    if (result.freigeschaltet) {
      // Inhaber hat schon bezahlt → direkt ins Dashboard
      router.push('/gutachter')
      router.refresh()
    } else {
      // Inhaber muss noch zahlen → Warte-Page
      setWarteAufInhaber(true)
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Sub-Mitarbeiter Warte-Page (volle Page, kein Stepper)
  // ────────────────────────────────────────────────────────────────────────
  if (warteAufInhaber) {
    return (
      <div className="h-full overflow-y-auto bg-claimondo-bg flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-claimondo-navy">
              Bedingungen akzeptiert{profile.vorname ? `, ${profile.vorname}` : ''}!
            </h1>
            <p className="text-claimondo-ondo text-sm mt-1">Letzter Schritt liegt jetzt bei Ihrem Inhaber</p>
          </div>

          <div className="bg-white border border-claimondo-border rounded-2xl p-6">
            <div className="bg-warning-soft border border-warning/30 rounded-ios-xl p-5 flex items-start gap-3">
              <ClockIcon className="w-6 h-6 text-warning flex-shrink-0 mt-0.5" />
              <div className="text-sm text-warning-strong">
                <p className="font-semibold mb-1">Ihr Inhaber muss noch die Anzahlung leisten.</p>
                <p>
                  Sie werden per Email benachrichtigt sobald Ihr Account freigeschaltet ist und Sie
                  die ersten Fälle erhalten kannst.
                </p>
                {organisation && (
                  <p className="mt-2 text-xs text-warning-strong">
                    Organisation: <strong>{organisation.name}</strong>
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 text-xs text-claimondo-ondo text-center">
              Du kannst dieses Fenster schließen. Bei Fragen erreichst du uns unter{' '}
              <a href="mailto:aaron.sprafke@claimondo.de" className="text-[var(--brand-primary)] underline">
                aaron.sprafke@claimondo.de
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // BUG-97: Step 2 (Stripe-Anzahlung) braucht ein 2-Spalten-Layout — daher
  // breiterer Wrapper auf diesem Step.
  // BUG-98 Folge-Cleanup: Andere Steps von max-w-2xl auf max-w-4xl
  // angehoben — der Wizard war auf 1920px Desktop / Tablet quer zu klein.
  // 4xl (~896px) bleibt für Forms gut lesbar, nutzt aber Desktop ordentlich aus.
  // AAR-509: `currentKey` wird oben für den Stripe-Effect gebraucht — hier
  // nur noch die wrapperWidth-Zuordnung.
  const wrapperWidth = currentKey === 'anzahlung' && r !== 'sub_mitarbeiter' ? 'max-w-5xl' : 'max-w-4xl'

  return (
    <div className="h-full overflow-y-auto bg-claimondo-bg flex items-start justify-center px-4 py-10">
      <div className={`w-full ${wrapperWidth}`}>
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-claimondo-navy">
            Willkommen bei Claimondo{profile.vorname ? `, ${profile.vorname}` : ''}!
          </h1>
          <p className="text-claimondo-ondo text-sm mt-1">Schritt {step + 1} von {STEPS.length}</p>
        </div>

        {/* AAR-512: Inline-Anzahlung-Banner entfernt — der globale Onboarding-
            Banner im Layout deckt den Hinweis ab, klickbar + generalisiert. */}

        {/* BUG-95 KORREKTUR: Stepper in Claimondo-CI ohne Grün.
            done   → var(--brand-secondary) (Ondo Blue) + Checkmark, weiß
            aktiv  → var(--brand-primary) (Navy Primary) + Step-Nummer, weiß
            naechst → gray-200 + Step-Nummer, gray-500
            Connector zwischen done Steps Ondo-Blue, sonst gray-300 */}
        <div className="flex items-center justify-center gap-0 mb-8 font-[Montserrat]">
          {STEPS.map((s, i) => {
            const isDone = i < step
            const isActive = i === step
            return (
              <div key={s.key} className="flex items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors text-xs font-semibold ${
                    isDone
                      ? 'bg-[var(--brand-secondary)] text-white'
                      : isActive
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'bg-claimondo-border text-claimondo-ondo'
                  }`}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={s.label}
                >
                  {isDone ? <CheckIcon className="w-4 h-4" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-10 h-0.5 transition-colors ${isDone ? 'bg-[var(--brand-secondary)]' : 'bg-claimondo-border'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Content Card */}
        <div className="bg-white border border-claimondo-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-claimondo-navy">{STEPS[step].label}</h2>
            {/* AAR-513: Globaler Zurück-Button — funktioniert auf allen Steps
                (Branding/Anzahlung/SA-Vorlage/Kalender haben keine eigenen
                Navigations-Buttons weil ihre Sub-Components sie übernehmen).
                Disabled wenn der vorherige Step bereits committed ist
                (Vertrag unterschrieben → Vertrag-Step locked, Anzahlung bezahlt
                → Anzahlung-Step locked, etc.). Auf Step 0 + Sub-Mitarbeiter-
                Warte-Branch wird die Leiste ausgeblendet. */}
            {step > 0 && r !== 'sub_mitarbeiter' && (() => {
              const prevKey = STEPS[step - 1]?.key ?? ''
              const prevCommitted =
                (prevKey === 'vertrag' && sv.vertrag_unterschrieben) ||
                (prevKey === 'anzahlung' && sv.portal_zugang_freigeschaltet) ||
                (prevKey === 'dokumente' && sv.dokumenteKomplett)
              const tooltip = prevCommitted
                ? 'Dieser Schritt ist bereits abgeschlossen und kann nicht mehr bearbeitet werden'
                : `Zurück zu „${STEPS[step - 1].label}"`
              return (
                <button
                  type="button"
                  onClick={() => !prevCommitted && setStep(step - 1)}
                  disabled={saving || prevCommitted}
                  title={tooltip}
                  className="inline-flex items-center gap-1.5 text-xs text-claimondo-ondo hover:text-claimondo-navy disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label={tooltip}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                  Zurück
                </button>
              )
            })()}
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SCHRITT 0: Konditionen
             ═══════════════════════════════════════════════════════════════ */}
          {currentKey === 'konditionen' && r === 'solo' && (
            <div className="space-y-5">
              {/* KFZ-152 Phase 3: Community-Banner wenn der User Mitglied einer Community ist */}
              {rolle === 'community_member' && organisation && (
                <div className="bg-warning-soft border border-warning/30 rounded-ios-xl p-4 flex items-start gap-3">
                  <Building2Icon className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-warning-strong">
                    <p className="font-medium">Sie sind Mitglied der Community <strong>{organisation.name}</strong>.</p>
                    <p className="text-xs text-warning-strong mt-1">
                      Sie zahlen Ihre Anzahlung selbst und unterzeichnest Ihren eigenen Vertrag.
                      Der Unterschied zur Solo-Mitgliedschaft: Ihr Lead-Pool ist mit anderen Community-Mitgliedern geteilt.
                    </p>
                  </div>
                </div>
              )}

              {/* Konditionen-Card */}
              <div className="bg-[var(--brand-primary)]/5 border border-[var(--brand-primary)]/10 rounded-ios-xl p-5">
                <p className="text-xs text-claimondo-ondo uppercase tracking-wide mb-3">Ihre Konditionen</p>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                  <Kondition label="Paket" value={paketLabel} />
                  <Kondition label="Fälle / Monat" value={String(sv.paket_faelle_gesamt)} />
                  <Kondition label="Radius" value={`${sv.paket_umkreis_km} km`} />
                  <Kondition label="Anzahlung" value={fmtEur(sv.onboarding_anzahlung_betrag)} highlight />
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--brand-primary)]/10">
                  <button
                    type="button"
                    onClick={() => setShowLeadPreisOverlay(true)}
                    className="text-xs text-[var(--brand-primary)] underline hover:text-[var(--brand-secondary)]"
                  >
                    → Lead-Preis-Tabelle + ROI-Rechner
                  </button>
                </div>
              </div>

              {/* Stammdaten-Card (read-only) */}
              <div className="bg-claimondo-bg border border-claimondo-border rounded-ios-xl p-5">
                <p className="text-xs text-claimondo-ondo uppercase tracking-wide mb-3">Ihre Stammdaten</p>
                <div className="space-y-2.5 text-sm">
                  <ReadRow icon={UserIcon} label="Name" value={fullName} />
                  <ReadRow icon={UserIcon} label="Email" value={profile.email ?? '—'} />
                  {profile.telefon && <ReadRow icon={UserIcon} label="Telefon" value={profile.telefon} />}
                  <ReadRow
                    icon={MapPinIcon}
                    label="Standort"
                    value={[sv.standort_adresse, sv.standort_plz].filter(Boolean).join(', ') || '—'}
                  />
                </div>
              </div>

              <KontaktHinweis />
            </div>
          )}

          {/* SCHRITT 0 — Buero-Inhaber: Sub-Tabelle + Stammdaten */}
          {currentKey === 'konditionen' && r === 'buero_inhaber' && (
            <div className="space-y-5">
              {/* Buero-Header */}
              <div className="bg-[var(--brand-primary)]/5 border border-[var(--brand-primary)]/10 rounded-ios-xl p-5">
                <p className="text-xs text-claimondo-ondo uppercase tracking-wide mb-1">Sie verwalten</p>
                <p className="text-base font-semibold text-claimondo-navy">
                  {organisation?.name ?? '—'} <span className="text-sm text-claimondo-ondo font-normal">mit {subSvs.length} {subSvs.length === 1 ? 'Standort' : 'Standorten'}</span>
                </p>
              </div>

              {/* Sub-Standort-Tabelle */}
              {subSvs.length > 0 ? (
                <div className="border border-claimondo-border rounded-ios-xl overflow-hidden">
                  <div className="bg-claimondo-bg px-4 py-2.5 border-b border-claimondo-border">
                    <p className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wide">
                      Sub-Standorte ({subSvs.length})
                    </p>
                  </div>
                  <div className="divide-y divide-claimondo-border">
                    {subSvs.map((sub, idx) => (
                      <div key={sub.id} className="px-4 py-3 grid grid-cols-12 gap-3 text-sm">
                        <div className="col-span-12 sm:col-span-5">
                          <p className="text-[10px] text-claimondo-ondo/70 uppercase">Standort {idx + 1}</p>
                          <p className="text-claimondo-navy break-words">
                            {[sub.standort_adresse, sub.standort_plz].filter(Boolean).join(', ') || '—'}
                          </p>
                          {sub.profile_email && (
                            <p className="text-[11px] text-claimondo-ondo mt-0.5">{sub.profile_email}</p>
                          )}
                        </div>
                        <div className="col-span-6 sm:col-span-3">
                          <p className="text-[10px] text-claimondo-ondo/70 uppercase">Paket</p>
                          <p className="text-claimondo-navy">{PAKET_LABELS[sub.paket] ?? sub.paket}</p>
                        </div>
                        <div className="col-span-6 sm:col-span-4 sm:text-right">
                          <p className="text-[10px] text-claimondo-ondo/70 uppercase">Anzahlung</p>
                          <p className="text-claimondo-navy font-medium">{fmtEur(sub.onboarding_anzahlung_betrag)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 rounded-ios-xl bg-warning-soft border border-warning/30 text-warning-strong text-sm">
                  Es sind noch keine Sub-Standorte angelegt. Bitte aaron.sprafke@claimondo.de kontaktieren.
                </div>
              )}

              {/* Gesamt-Anzahlung groß hervorgehoben */}
              <div className="bg-[var(--brand-primary)] text-white rounded-ios-xl p-5">
                <p className="text-xs text-white/70 uppercase tracking-wide">Gesamt-Anzahlung (alle Sub-Standorte)</p>
                <p className="text-3xl font-bold mt-1">{fmtEur(gesamtAnzahlung)} <span className="text-sm font-normal text-white/70">netto</span></p>
                <p className="text-[11px] text-white/70 mt-2">
                  Wird in Schritt 3 zentral via Stripe eingezogen. Sobald die Zahlung eingeht, sind alle
                  Sub-Standorte gleichzeitig freigeschaltet.
                </p>
              </div>

              {/* Inhaber-Stammdaten */}
              <div className="bg-claimondo-bg border border-claimondo-border rounded-ios-xl p-5">
                <p className="text-xs text-claimondo-ondo uppercase tracking-wide mb-3">Ihre Inhaber-Stammdaten</p>
                <div className="space-y-2.5 text-sm">
                  <ReadRow icon={UserIcon} label="Name" value={fullName} />
                  <ReadRow icon={UserIcon} label="Email" value={profile.email ?? '—'} />
                  {profile.telefon && <ReadRow icon={UserIcon} label="Telefon" value={profile.telefon} />}
                  {organisation && (
                    <ReadRow icon={Building2Icon} label="Buero" value={organisation.name} />
                  )}
                </div>
              </div>

              <KontaktHinweis />
            </div>
          )}

          {/* SCHRITT 0 — Sub-Mitarbeiter: eigenes Paket + Org-Hinweis */}
          {currentKey === 'konditionen' && r === 'sub_mitarbeiter' && (
            <div className="space-y-5">
              {/* Org-Hinweis */}
              {organisation && (
                <div className="bg-[var(--brand-primary)]/5 border border-[var(--brand-primary)]/10 rounded-ios-xl p-5 flex items-start gap-3">
                  <Building2Icon className="w-5 h-5 text-[var(--brand-primary)] flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-claimondo-navy">
                    <p>
                      Sie gehoeren zu <strong>{organisation.name}</strong>. Dein{' '}
                      {organisation.typ === 'akademie' ? 'Verwalter' : 'Inhaber'} kuemmert sich
                      um Vertrag und Zahlung. Du musst hier nur einmal die Bedingungen bestaetigen.
                    </p>
                  </div>
                </div>
              )}

              {/* Eigenes Paket */}
              <div className="bg-claimondo-bg border border-claimondo-border rounded-ios-xl p-5">
                <p className="text-xs text-claimondo-ondo uppercase tracking-wide mb-3">Ihr Paket</p>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                  <Kondition label="Paket" value={paketLabel} />
                  <Kondition label="Fälle / Monat" value={String(sv.paket_faelle_gesamt)} />
                  <Kondition label="Radius" value={`${sv.paket_umkreis_km} km`} />
                  <Kondition
                    label="Standort"
                    value={[sv.standort_adresse, sv.standort_plz].filter(Boolean).join(', ') || '—'}
                  />
                </div>
              </div>

              {/* Stammdaten */}
              <div className="bg-claimondo-bg border border-claimondo-border rounded-ios-xl p-5">
                <p className="text-xs text-claimondo-ondo uppercase tracking-wide mb-3">Ihre Stammdaten</p>
                <div className="space-y-2.5 text-sm">
                  <ReadRow icon={UserIcon} label="Name" value={fullName} />
                  <ReadRow icon={UserIcon} label="Email" value={profile.email ?? '—'} />
                  {profile.telefon && <ReadRow icon={UserIcon} label="Telefon" value={profile.telefon} />}
                </div>
              </div>

              <KontaktHinweis />
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              SCHRITT 1: Vertrag (Solo + Inhaber) bzw. AGB-Checkbox (Sub)
              BUG-96: Scroll-Lock + Inline-Vertragstexte raus → kompakte
              Auftragszusammenfassung + Modal-Links fuer NB / KV.
             ═══════════════════════════════════════════════════════════════ */}
          {currentKey === 'vertrag' && r !== 'sub_mitarbeiter' && (
            <div className="space-y-5">
              {/* BUG-96 + BUG-97: Auftragszusammenfassung als geteilte
                  OrderSummaryCard (compact-Variante). Gleiches Component
                  wird in Step 2 als xl-Variante wiederverwendet. */}
              <OrderSummaryCard
                variant="compact"
                paketLabel={paketLabel}
                kontingent={sv.paket_faelle_gesamt}
                radiusKm={sv.paket_umkreis_km}
                anzahlungBetrag={r === 'buero_inhaber' ? gesamtAnzahlung : sv.onboarding_anzahlung_betrag}
                organisationName={r !== 'buero_inhaber' && organisation ? organisation.name : null}
                onShowLeadPreise={() => setShowLeadPreisOverlay(true)}
              />

              {/* Hinweis fuer Buero-Inhaber: stellvertretend fuer alle Sub-Standorte */}
              {r === 'buero_inhaber' && organisation && (
                <div className="bg-claimondo-bg border border-claimondo-border rounded-ios-xl p-4 flex items-start gap-3">
                  <Building2Icon className="w-5 h-5 text-[var(--brand-secondary)] flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-claimondo-navy">
                    Sie unterzeichnen stellvertretend fuer <strong>{organisation.name}</strong> und alle{' '}
                    {subSvs.length} {subSvs.length === 1 ? 'Sub-Standort' : 'Sub-Standorte'}.
                  </div>
                </div>
              )}

              {/* Stammdaten kompakt — BUG-96: Firma + Steuernummer ergaenzt */}
              <div className="bg-claimondo-bg border border-claimondo-border rounded-ios-xl p-4">
                <p className="text-[10px] text-claimondo-ondo uppercase tracking-wide font-semibold mb-2">
                  Stammdaten
                </p>
                <div className="space-y-1.5 text-xs">
                  <StammRow label="Name" value={fullName} />
                  {/* Firma: Buero-Name fuer Inhaber, sonst sv.firmenname */}
                  {(r === 'buero_inhaber' && organisation
                    ? `${organisation.name}${organisation.rechtsform ? ` (${organisation.rechtsform})` : ''}`
                    : sv.firmenname
                  ) && (
                    <StammRow
                      label="Firma"
                      value={
                        r === 'buero_inhaber' && organisation
                          ? `${organisation.name}${organisation.rechtsform ? ` (${organisation.rechtsform})` : ''}`
                          : (sv.firmenname ?? '—')
                      }
                    />
                  )}
                  <StammRow label="Email" value={profile.email ?? '—'} breakAll />
                  <StammRow
                    label="Anschrift"
                    value={[sv.standort_adresse, sv.standort_plz].filter(Boolean).join(', ') || '—'}
                  />
                  {/* Steuernummer: Org-Steuernummer fuer Inhaber, sonst sv.steuernummer */}
                  {(r === 'buero_inhaber' && organisation?.steuernummer
                    ? organisation.steuernummer
                    : sv.steuernummer) && (
                    <StammRow
                      label="Steuernummer"
                      value={
                        r === 'buero_inhaber' && organisation?.steuernummer
                          ? organisation.steuernummer
                          : (sv.steuernummer ?? '—')
                      }
                    />
                  )}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="text-xs text-claimondo-ondo mb-1.5 block">
                  Ihr Name (juristisch verbindlich) <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={unterschriftName}
                  onChange={e => setUnterschriftName(e.target.value)}
                  className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-xl px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                />
              </div>

              {/* Signature Pad — BUG-81 controlled component bleibt */}
              <div>
                <label className="text-xs text-claimondo-ondo mb-1.5 block">
                  Unterschrift <span className="text-danger">*</span>
                </label>
                <SignaturePadInput
                  value={signaturePng}
                  onChange={setSignaturePng}
                  height="h-44"
                  placeholder="Hier mit Maus oder Finger unterschreiben"
                />
              </div>

              {/* AGB-Checkbox mit Modal-Links */}
              <label className="flex items-start gap-2.5 cursor-pointer text-sm text-claimondo-navy">
                <input
                  type="checkbox"
                  checked={agbAccepted}
                  onChange={e => setAgbAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-claimondo-border"
                />
                <span>
                  Ich akzeptiere die{' '}
                  {nbVorlage ? (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setVertragModal('nb') }}
                      className="font-semibold text-[var(--brand-primary)] underline hover:text-[var(--brand-secondary)]"
                    >
                      Nutzungsbedingungen
                    </button>
                  ) : (
                    <strong>Nutzungsbedingungen</strong>
                  )}
                  ,{' '}
                  {kvVorlage ? (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setVertragModal('kv') }}
                      className="font-semibold text-[var(--brand-primary)] underline hover:text-[var(--brand-secondary)]"
                    >
                      den Kooperationsvertrag
                    </button>
                  ) : (
                    <strong>den Kooperationsvertrag</strong>
                  )}
                  {' '}und die{' '}
                  <Link href="/datenschutz" target="_blank" className="font-semibold text-[var(--brand-primary)] underline hover:text-[var(--brand-secondary)]">
                    Datenschutzerklaerung
                  </Link>
                  . Mit meiner Unterschrift bestaetige ich rechtsverbindlich die Annahme
                  {r === 'buero_inhaber' && organisation
                    ? ` stellvertretend fuer ${organisation.name} und alle Sub-Standorte.`
                    : '.'}
                </span>
              </label>
            </div>
          )}

          {/* SCHRITT 1 — Sub-Mitarbeiter: nur Checkbox + Name (kein PDF, keine Sig) */}
          {currentKey === 'agb' && r === 'sub_mitarbeiter' && (
            <div className="space-y-5">
              <div className="bg-claimondo-bg border border-claimondo-border rounded-ios-xl p-4 text-xs text-claimondo-ondo leading-relaxed">
                Bitte bestätige unsere{' '}
                <Link href="/nutzungsbedingungen" target="_blank" className="text-[var(--brand-primary)] underline">Nutzungsbedingungen</Link>,
                die <Link href="/agb" target="_blank" className="text-[var(--brand-primary)] underline">AGB</Link>{' '}
                und die <Link href="/datenschutz" target="_blank" className="text-[var(--brand-primary)] underline">Datenschutzerklärung</Link>.
                <br /><br />
                Den vollständigen Vertrag inkl. Anzahlung schließt dein
                {organisation?.typ === 'akademie' ? ' Verwalter' : ' Inhaber'} für dich ab — du musst
                hier nur einmal die Bedingungen akzeptieren.
              </div>

              {/* Name-Bestätigung */}
              <div>
                <label className="text-xs text-claimondo-ondo mb-1.5 block">
                  Ihr Name (zur Bestätigung) <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={unterschriftName}
                  onChange={e => setUnterschriftName(e.target.value)}
                  className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-xl px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                />
              </div>

              {/* AGB-Checkbox */}
              <label className="flex items-start gap-2.5 cursor-pointer text-sm text-claimondo-navy">
                <input
                  type="checkbox"
                  checked={agbAccepted}
                  onChange={e => setAgbAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-claimondo-border"
                />
                <span>
                  Ich akzeptiere die <strong>Nutzungsbedingungen</strong>, die <strong>AGB</strong> und die <strong>Datenschutzerklärung</strong>.
                </span>
              </label>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              SCHRITT 2: Stripe Embedded Checkout (Solo + Inhaber)
              KFZ-156: Inline iframe via @stripe/react-stripe-js statt
              hosted Stripe-Page. clientSecret wird in useEffect geholt
              sobald der User Step 2 betritt.
             ═══════════════════════════════════════════════════════════════ */}
          {currentKey === 'anzahlung' && r !== 'sub_mitarbeiter' && (
            <div className="space-y-4">
              <div className="bg-[var(--brand-secondary)]/5 border border-[var(--brand-secondary)]/20 rounded-ios-xl p-4 flex items-start gap-3">
                <CheckCircle2Icon className="w-5 h-5 text-[var(--brand-secondary)] flex-shrink-0 mt-0.5" />
                <div className="text-sm text-[var(--brand-primary)]">
                  {r === 'buero_inhaber' ? (
                    <><strong>Buero-Vertrag unterzeichnet.</strong> Bitte schliesse jetzt die zentrale Anzahlung fuer alle Sub-Standorte ab.</>
                  ) : (
                    <><strong>Vertrag unterzeichnet.</strong> Bitte schliesse jetzt die Anzahlung ab.</>
                  )}
                </div>
              </div>

              {r === 'buero_inhaber' && gesamtAnzahlung <= 0 && (
                <div className="px-3 py-2.5 rounded-ios-xl bg-danger-soft border border-danger/30 text-danger text-sm">
                  Es sind keine Sub-Standorte mit Anzahlungsbetrag vorhanden. Bitte aaron.sprafke@claimondo.de kontaktieren.
                </div>
              )}

              {/* BUG-97: 2-Spalten-Layout. Mobile = 1 Spalte (stacked).
                  Links: OrderSummaryCard xl mit grossem Anzahlungs-Betrag.
                  Rechts: Embedded Stripe Checkout + StripeBrandingFooter. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                {/* Linke Spalte: Auftragszusammenfassung */}
                <OrderSummaryCard
                  variant="xl"
                  paketLabel={paketLabel}
                  kontingent={sv.paket_faelle_gesamt}
                  radiusKm={sv.paket_umkreis_km}
                  anzahlungBetrag={r === 'buero_inhaber' ? gesamtAnzahlung : sv.onboarding_anzahlung_betrag}
                  subBueros={r === 'buero_inhaber' ? subSvs : undefined}
                  onShowLeadPreise={() => setShowLeadPreisOverlay(true)}
                />

                {/* Rechte Spalte: Embedded Stripe Checkout + Branding-Footer */}
                <div className="space-y-3">
                  {!stripePublishableKey ? (
                    <div className="px-4 py-3 rounded-ios-xl bg-warning-soft border border-warning/30 text-warning-strong text-sm">
                      Stripe-Konfiguration fehlt (STRIPE_PUBLISHABLE_KEY). Bitte aaron.sprafke@claimondo.de kontaktieren.
                    </div>
                  ) : error ? (
                    // AAR-509: Sichtbare Fehlermeldung + Retry-Button statt
                    // Endlos-Spinner, falls startStripeCheckout fehlschlägt.
                    <div className="rounded-ios-xl border border-danger/30 bg-danger-soft p-5 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangleIcon className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-danger-strong">
                          <p className="font-semibold mb-1">Checkout konnte nicht initialisiert werden.</p>
                          <p className="text-xs text-danger-strong">{error}</p>
                          <p className="text-[11px] text-danger-strong mt-2">
                            Falls der Fehler anhält, schreib uns an{' '}
                            <a href="mailto:aaron.sprafke@claimondo.de" className="underline">
                              aaron.sprafke@claimondo.de
                            </a>.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={retryCheckout}
                        disabled={saving}
                        className="w-full py-2 rounded-ios-xl bg-danger hover:bg-danger-strong text-white text-sm font-semibold disabled:opacity-50"
                      >
                        {saving ? 'Wird geladen ...' : 'Erneut versuchen'}
                      </button>
                    </div>
                  ) : !clientSecret ? (
                    <div className="rounded-ios-xl border border-claimondo-border bg-claimondo-bg p-8 text-center text-sm text-claimondo-ondo">
                      Checkout wird geladen ...
                    </div>
                  ) : (
                    <div className="rounded-ios-xl border border-claimondo-border overflow-hidden bg-white">
                      <EmbeddedCheckoutProvider stripe={stripePromise} options={checkoutOptions}>
                        <EmbeddedCheckout />
                      </EmbeddedCheckoutProvider>
                    </div>
                  )}

                  <StripeBrandingFooter />
                </div>
              </div>

              {/* Gutscheincode einloesen — Alternative zur Anzahlung. Ein
                  gueltiger Code schaltet frei und springt zum Dokumente-Schritt. */}
              <div className="rounded-ios-xl border border-claimondo-border bg-claimondo-bg p-4 space-y-2">
                <p className="text-sm font-semibold text-claimondo-navy">Gutscheincode</p>
                <p className="text-xs text-claimondo-ondo">
                  Sie haben einen Gutscheincode? Dann können Sie die Anzahlung überspringen.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={gutscheinCode}
                    onChange={(e) => setGutscheinCode(e.target.value)}
                    placeholder="Code eingeben"
                    disabled={gutscheinBusy}
                    className="flex-1 px-3 py-2 rounded-ios-lg border border-claimondo-border text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-shield/30 disabled:opacity-60"
                  />
                  <Button
                    variant="ondo"
                    onClick={handleGutschein}
                    disabled={!gutscheinCode.trim()}
                    loading={gutscheinBusy}
                  >
                    Einlösen
                  </Button>
                </div>
                {gutscheinError && <p className="text-xs text-danger">{gutscheinError}</p>}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              SCHRITT 3: Logo-Upload + Branding (KFZ-157)
              Nur fuer Solo + Buero-Inhaber. Sub-Mitarbeiter erben die
              Org-Farben automatisch sobald der Inhaber ein Logo hochlaedt.
             ═══════════════════════════════════════════════════════════════ */}
          {currentKey === 'branding' && r !== 'sub_mitarbeiter' && (
            <LogoUploadStep
              variant={r === 'buero_inhaber' ? 'buero_inhaber' : 'solo'}
              organisationId={organisation?.id ?? null}
              // AAR-233: Logo ist jetzt Step 2 (nicht mehr letzter Step).
              // onDone leitet zu Vertrag weiter — außer User ist schon
              // portal_zugang_freigeschaltet (kam via ?stripe_success zurück
              // und hatte noch kein Logo).
              // AAR-714: Wenn freigeschaltet + Dokumente noch offen → zu
              // Dokumente-Step; wenn alles durch → Dashboard.
              onDone={() => {
                if (sv.portal_zugang_freigeschaltet) {
                  if (!sv.dokumenteKomplett) {
                    goToStep('dokumente')
                  } else {
                    router.push('/gutachter')
                    router.refresh()
                  }
                } else {
                  goToStep('vertrag')
                }
              }}
            />
          )}

          {/* AAR-714: Dokumente-Step (Sicherungsabtretung|Honorarvereinbarung
              + Datenschutzerklärung + Widerrufsbelehrung). Sub-Mitarbeiter
              sehen diesen Step NICHT — sie laden Pflichtdokumente später in
              /gutachter/verifizierung hoch. */}
          {currentKey === 'dokumente' && r !== 'sub_mitarbeiter' && (
            <DokumenteUploadStep
              initialSlots={sv.dokumenteSlots}
              onDone={() => goToStep('kalender')}
            />
          )}

          {/* AAR-242: Kalender-Step nach Stripe-Anzahlung */}
          {currentKey === 'kalender' && r !== 'sub_mitarbeiter' && (
            <KalenderConnectStep
              gcalConnected={sv.gcal_connected}
              caldavConnected={sv.caldav_connected}
              onDone={() => {
                // P5 T8: optionaler Netzwerkpartner-Ask als Abschluss — nur wenn die
                // Preis-Config da ist (leer = Step ueberspringen, Verhalten wie vorher).
                if (netzwerkMonatEuro) {
                  goToStep('netzwerk')
                } else {
                  router.push('/gutachter')
                  router.refresh()
                }
              }}
            />
          )}

          {/* P5 T8: Netzwerkpartner-Ask (skippbar) — Upgrade mountet den embedded
              Checkout (KFZ-156-Muster wie der Anzahlungs-Step); Skip schliesst das
              Onboarding unveraendert ab. Nach Zahlung leitet Stripe auf
              /gutachter/einstellungen?netzwerk_abo=success (T9-Erfolgs-Banner). */}
          {currentKey === 'netzwerk' && r !== 'sub_mitarbeiter' && (
            netzwerkClientSecret && stripePublishableKey ? (
              <EmbeddedCheckoutProvider
                stripe={loadStripe(stripePublishableKey)}
                options={{ clientSecret: netzwerkClientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            ) : (
              <>
                <NetzwerkpartnerCta
                  monatEuro={netzwerkMonatEuro}
                  setupEuro={netzwerkSetupEuro}
                  loading={netzwerkLoading}
                  onUpgrade={async () => {
                    setNetzwerkLoading(true)
                    setNetzwerkFehler(null)
                    const res = await starteNetzwerkAboCheckout()
                    setNetzwerkLoading(false)
                    if (!res.ok) { setNetzwerkFehler(res.error); return }
                    setNetzwerkClientSecret(res.clientSecret)
                  }}
                  onSkip={() => {
                    router.push('/gutachter')
                    router.refresh()
                  }}
                />
                {netzwerkFehler && (
                  <p className="mt-2 text-body-xs text-danger">{netzwerkFehler}</p>
                )}
              </>
            )
          )}

          {/* AAR-509: Anzahlungs-Step hat eigenes Error-UI mit Retry — sonst
              würde der Fehler doppelt erscheinen. */}
          {error && currentKey !== 'anzahlung' && (
            <div className="mt-4 px-3 py-2.5 rounded-ios-xl bg-danger-soft border border-danger/30 text-danger text-sm">
              {error}
            </div>
          )}

          {/* AAR-233 + AAR-242 + AAR-714: Buttons nur auf Konditionen +
              Vertrag + Sub-AGB. Branding (LogoUploadStep), Anzahlung (Stripe),
              Dokumente (DokumenteUploadStep) und Kalender (KalenderConnectStep)
              haben eigene Buttons. */}
          {currentKey !== 'branding' && currentKey !== 'anzahlung' && currentKey !== 'dokumente' && currentKey !== 'kalender' && currentKey !== 'netzwerk' && (
            <div className="flex items-center gap-3 mt-6">
              {/* AAR-513: Bottom-Zurück nur noch für sub_mitarbeiter — alle
                  anderen Rollen nutzen den globalen Zurück-Pfeil oben rechts. */}
              {step > 0 && r === 'sub_mitarbeiter' && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-ios-xl border border-claimondo-border text-claimondo-ondo text-sm hover:bg-claimondo-bg disabled:opacity-40"
                >
                  Zurück
                </button>
              )}
              <LoadingButton
                isLoading={saving}
                loadingText="Wird verarbeitet..."
                onClick={() => {
                  // AAR-233: Key-basierte Navigation
                  if (r === 'sub_mitarbeiter') {
                    if (currentKey === 'konditionen') goToStep('agb')
                    else handleSubAgbSubmit()
                  } else if (currentKey === 'konditionen') {
                    goToStep('branding')
                  } else if (currentKey === 'vertrag') {
                    r === 'buero_inhaber' ? handleInhaberVertragSubmit() : handleSoloVertragSubmit()
                  }
                }}
                disabled={
                  (currentKey === 'vertrag' && r !== 'sub_mitarbeiter' && !nbVorlage) ||
                  (currentKey === 'vertrag' && r !== 'sub_mitarbeiter' && (!agbAccepted || !unterschriftName.trim() || !signaturePng)) ||
                  (currentKey === 'konditionen' && r === 'buero_inhaber' && subSvs.length === 0)
                }
                className="flex-1 py-2.5 rounded-ios-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {r === 'sub_mitarbeiter'
                  ? currentKey === 'konditionen'
                    ? 'Weiter zur Bestätigung'
                    : 'Bedingungen akzeptieren'
                  : currentKey === 'konditionen'
                  ? 'Weiter zum Logo-Upload'
                  : currentKey === 'vertrag'
                  ? r === 'buero_inhaber'
                    ? 'Büro-Vertrag unterzeichnen'
                    : 'Vertrag unterzeichnen'
                  : 'Weiter'}
              </LoadingButton>
            </div>
          )}
        </div>
      </div>

      {/* BUG-96: Modal fuer Nutzungsbedingungen / Kooperationsvertrag.
          Aaron-Wunsch: User klickt auf den Link in der Checkbox und bekommt
          den Vertragstext im Modal — kein Scroll-Lock mehr. */}
      <Dialog open={vertragModal !== null} onOpenChange={(open) => { if (!open) setVertragModal(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {vertragModal === 'nb' ? (nbVorlage?.titel ?? 'Nutzungsbedingungen') : (kvVorlage?.titel ?? 'Kooperationsvertrag')}
            </DialogTitle>
          </DialogHeader>
          <div
            className="flex-1 overflow-y-auto text-xs text-claimondo-navy leading-relaxed prose prose-sm max-w-none pr-2"
             
            dangerouslySetInnerHTML={{
              __html: (vertragModal === 'nb' ? nbVorlage?.inhalt_html : kvVorlage?.inhalt_html) ?? '',
            }}
          />
        </DialogContent>
      </Dialog>

      {/* AAR-213: Lead-Preis-Tabelle + ROI-Rechner als Overlay (kein Tab-Switch) */}
      <LeadPreisOverlay
        open={showLeadPreisOverlay}
        onClose={() => setShowLeadPreisOverlay(false)}
        rows={leadpreise}
        maxFaelleMonat={sv.paket_faelle_gesamt}
        paketLabel={paketLabel}
      />
    </div>
  )
}

function ReadRow({ icon: Icon, label, value }: { icon: typeof UserIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-claimondo-ondo/70 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-claimondo-ondo uppercase">{label}</p>
        <p className="text-sm text-claimondo-navy break-words">{value}</p>
      </div>
    </div>
  )
}

function Kondition({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-claimondo-ondo uppercase">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${highlight ? 'text-[var(--brand-primary)]' : 'text-claimondo-navy'}`}>{value}</p>
    </div>
  )
}

// BUG-96: Helper fuer die kompakte Stammdaten-Card im Vertrag-Step
function StammRow({ label, value, breakAll }: { label: string; value: string; breakAll?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-claimondo-ondo">{label}</span>
      <span className={`text-claimondo-navy text-right ${breakAll ? 'break-all' : ''}`}>{value}</span>
    </div>
  )
}

function KontaktHinweis() {
  return (
    <div className="text-xs text-claimondo-ondo bg-warning-soft border border-warning/30 rounded-ios-xl p-4">
      <strong>Stimmt etwas nicht?</strong> Schreib uns an{' '}
      <a href="mailto:aaron.sprafke@claimondo.de" className="text-[var(--brand-primary)] underline">
        aaron.sprafke@claimondo.de
      </a>
      {' '}— wir korrigieren deine Stammdaten bevor du den Vertrag unterzeichnest.
    </div>
  )
}
