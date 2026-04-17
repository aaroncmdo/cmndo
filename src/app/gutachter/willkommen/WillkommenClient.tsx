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
} from 'lucide-react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { signSvVertrag, startStripeCheckout } from '@/lib/actions/sv-onboarding-actions'
import { signBueroVertrag, startBueroStripeCheckout } from '@/app/gutachter/onboarding/buero/actions'
import { signAkademieVertrag, startAkademieStripeCheckout } from '@/app/gutachter/onboarding/akademie/actions'
import { akzeptiereAgbSubSv } from './actions'
import SignaturePadInput from '@/components/SignaturePadInput'
import StripeBrandingFooter from '@/components/StripeBrandingFooter'
import LogoUploadStep from '@/components/LogoUploadStep'
import SaVorlageUploadStep from '@/components/SaVorlageUploadStep'
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
  max_faelle_monat: number
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
  steuernummer: string | null
  // AAR-359 W3: SA-Vorlage-Status für Step 5
  sa_vorlage_status: 'ausstehend' | 'geprueft' | 'zurueckgewiesen' | null
  sa_vorlage_admin_notiz: string | null
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
// AAR-359 W3: Neuer Step 'sa_vorlage' zwischen Anzahlung und Kalender — der
// SV lädt seine Schadenaufnahme-Vorlage hoch. Admin-Freigabe öffnet später
// das Dispatch-Gate. Der Flow hat jetzt 6 Steps für Solo/Inhaber/Akademie.
const STEPS_4: { key: string; label: string; icon: typeof PackageIcon }[] = [
  { key: 'konditionen', label: 'Konditionen', icon: PackageIcon },
  { key: 'branding', label: 'Logo', icon: ImageIcon },
  { key: 'vertrag', label: 'Vertrag', icon: FileSignatureIcon },
  { key: 'anzahlung', label: 'Anzahlung', icon: CreditCardIcon },
  { key: 'sa_vorlage', label: 'SA-Vorlage', icon: FileTextIcon },
  { key: 'kalender', label: 'Kalender', icon: CalendarIcon },
]

const STEPS_2_SUB: { key: string; label: string; icon: typeof PackageIcon }[] = [
  { key: 'konditionen', label: 'Dein Paket', icon: PackageIcon },
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
  // AAR-359 W3: SA-Vorlage noch nicht hochgeladen oder zurückgewiesen
  // → Step 4 (SA-Vorlage). Geht VOR dem Kalender-Gate, damit der SV auch
  // bei vorhandenem Kalender noch die SA nachreicht.
  if (
    r !== 'sub_mitarbeiter'
    && sv.portal_zugang_freigeschaltet
    && (sv.sa_vorlage_status === null || sv.sa_vorlage_status === 'zurueckgewiesen')
  ) {
    initialStep = 4
  }
  // AAR-242: Kalender noch nicht verbunden → Kalender-Step (AAR-359 W3:
  // Index ist jetzt 5 weil SA-Vorlage dazugekommen ist).
  if (
    r !== 'sub_mitarbeiter'
    && sv.portal_zugang_freigeschaltet
    && sv.sa_vorlage_status !== null
    && sv.sa_vorlage_status !== 'zurueckgewiesen'
    && !sv.gcal_connected
  ) {
    initialStep = 5
  }
  if (typeof stepOverride === 'number') initialStep = stepOverride

  const [step, setStep] = useState(initialStep)
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

  // Beim Wechsel auf Step 2 ein client_secret holen damit der Provider mounten kann.
  useEffect(() => {
    if (step !== 2 || r === 'sub_mitarbeiter') return
    if (clientSecret) return
    let cancelled = false
    setSaving(true)
    setError(null)
    fetchClientSecret()
      .then(secret => { if (!cancelled) setClientSecret(secret) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Stripe-Fehler') })
      .finally(() => { if (!cancelled) setSaving(false) })
    return () => { cancelled = true }
  }, [step, rolle, clientSecret, fetchClientSecret])

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

  // FR-2: Banner sichtbar fuer Solo + Inhaber, NICHT fuer Sub-Mitarbeiter,
  // und nur solange portal_zugang_freigeschaltet=false ist.
  const showAnzahlungBanner =
    (r === 'solo' || r === 'buero_inhaber') && !sv.portal_zugang_freigeschaltet

  // ── Solo-Handler (existing) ────────────────────────────────────────────
  async function handleSoloVertragSubmit() {
    setError(null)
    if (!agbAccepted) { setError('Bitte akzeptiere die AGB/NB/DS'); return }
    if (!unterschriftName.trim()) { setError('Bitte gib deinen Namen ein'); return }
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
    if (!unterschriftName.trim()) { setError('Bitte gib deinen Namen ein'); return }
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
    if (!unterschriftName.trim()) { setError('Bitte gib deinen Namen ein'); return }

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
      <div className="h-full overflow-y-auto bg-[#f8f9fb] flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-gray-900">
              Bedingungen akzeptiert{profile.vorname ? `, ${profile.vorname}` : ''}!
            </h1>
            <p className="text-gray-500 text-sm mt-1">Letzter Schritt liegt jetzt bei deinem Inhaber</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
              <ClockIcon className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold mb-1">Dein Inhaber muss noch die Anzahlung leisten.</p>
                <p>
                  Du wirst per Email benachrichtigt sobald dein Account freigeschaltet ist und du
                  die ersten Fälle erhalten kannst.
                </p>
                {organisation && (
                  <p className="mt-2 text-xs text-amber-700">
                    Organisation: <strong>{organisation.name}</strong>
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 text-xs text-gray-500 text-center">
              Du kannst dieses Fenster schließen. Bei Fragen erreichst du uns unter{' '}
              <a href="mailto:aaron.sprafke@claimondo.de" className="text-[#1E3A5F] underline">
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
  // AAR-233: Key-basierter Step-Content statt Index — unabhängig von
  // Reihenfolge-Changes in STEPS_4.
  const currentKey = STEPS[step]?.key ?? ''
  const wrapperWidth = currentKey === 'anzahlung' && r !== 'sub_mitarbeiter' ? 'max-w-5xl' : 'max-w-4xl'

  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fb] flex items-start justify-center px-4 py-10">
      <div className={`w-full ${wrapperWidth}`}>
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            Willkommen bei Claimondo{profile.vorname ? `, ${profile.vorname}` : ''}!
          </h1>
          <p className="text-gray-500 text-sm mt-1">Schritt {step + 1} von {STEPS.length}</p>
        </div>

        {/* FR-2: Anzahlung-Warn-Banner (Solo + Inhaber, vor Anzahlung) */}
        {showAnzahlungBanner && (
          <div className="mb-5 bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <strong>Sie erhalten erst Fälle von uns, sobald Sie angezahlt haben!</strong>
              <p className="text-xs text-amber-700 mt-1">
                {r === 'buero_inhaber'
                  ? 'Sobald die Büro-Anzahlung eingegangen ist, werden alle Sub-Standorte gleichzeitig freigeschaltet.'
                  : 'Sobald die Anzahlung eingegangen ist, ist dein Portal-Zugang sofort freigeschaltet.'}
              </p>
            </div>
          </div>
        )}

        {/* BUG-95 KORREKTUR: Stepper in Claimondo-CI ohne Grün.
            done   → #4573A2 (Ondo Blue) + Checkmark, weiß
            aktiv  → #0D1B3E (Navy Primary) + Step-Nummer, weiß
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
                      ? 'bg-[#4573A2] text-white'
                      : isActive
                      ? 'bg-[#0D1B3E] text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={s.label}
                >
                  {isDone ? <CheckIcon className="w-4 h-4" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-10 h-0.5 transition-colors ${isDone ? 'bg-[#4573A2]' : 'bg-gray-300'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Content Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">{STEPS[step].label}</h2>

          {/* ═══════════════════════════════════════════════════════════════
              SCHRITT 0: Konditionen
             ═══════════════════════════════════════════════════════════════ */}
          {currentKey === 'konditionen' && r === 'solo' && (
            <div className="space-y-5">
              {/* KFZ-152 Phase 3: Community-Banner wenn der User Mitglied einer Community ist */}
              {rolle === 'community_member' && organisation && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <Building2Icon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Du bist Mitglied der Community <strong>{organisation.name}</strong>.</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Du zahlst deine Anzahlung selbst und unterzeichnest deinen eigenen Vertrag.
                      Der Unterschied zur Solo-Mitgliedschaft: dein Lead-Pool ist mit anderen Community-Mitgliedern geteilt.
                    </p>
                  </div>
                </div>
              )}

              {/* Konditionen-Card */}
              <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Deine Konditionen</p>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                  <Kondition label="Paket" value={paketLabel} />
                  <Kondition label="Fälle / Monat" value={String(sv.max_faelle_monat)} />
                  <Kondition label="Radius" value={`${sv.paket_umkreis_km} km`} />
                  <Kondition label="Anzahlung" value={fmtEur(sv.onboarding_anzahlung_betrag)} highlight />
                </div>
                <div className="mt-4 pt-4 border-t border-[#1E3A5F]/10">
                  <button
                    type="button"
                    onClick={() => setShowLeadPreisOverlay(true)}
                    className="text-xs text-[#1E3A5F] underline hover:text-[#4573A2]"
                  >
                    → Lead-Preis-Tabelle + ROI-Rechner
                  </button>
                </div>
              </div>

              {/* Stammdaten-Card (read-only) */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Deine Stammdaten</p>
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
              <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Du verwaltest</p>
                <p className="text-base font-semibold text-gray-900">
                  {organisation?.name ?? '—'} <span className="text-sm text-gray-500 font-normal">mit {subSvs.length} {subSvs.length === 1 ? 'Standort' : 'Standorten'}</span>
                </p>
              </div>

              {/* Sub-Standort-Tabelle */}
              {subSvs.length > 0 ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Sub-Standorte ({subSvs.length})
                    </p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {subSvs.map((sub, idx) => (
                      <div key={sub.id} className="px-4 py-3 grid grid-cols-12 gap-3 text-sm">
                        <div className="col-span-12 sm:col-span-5">
                          <p className="text-[10px] text-gray-400 uppercase">Standort {idx + 1}</p>
                          <p className="text-gray-900 break-words">
                            {[sub.standort_adresse, sub.standort_plz].filter(Boolean).join(', ') || '—'}
                          </p>
                          {sub.profile_email && (
                            <p className="text-[11px] text-gray-500 mt-0.5">{sub.profile_email}</p>
                          )}
                        </div>
                        <div className="col-span-6 sm:col-span-3">
                          <p className="text-[10px] text-gray-400 uppercase">Paket</p>
                          <p className="text-gray-700">{PAKET_LABELS[sub.paket] ?? sub.paket}</p>
                        </div>
                        <div className="col-span-6 sm:col-span-4 sm:text-right">
                          <p className="text-[10px] text-gray-400 uppercase">Anzahlung</p>
                          <p className="text-gray-900 font-medium">{fmtEur(sub.onboarding_anzahlung_betrag)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                  Es sind noch keine Sub-Standorte angelegt. Bitte aaron.sprafke@claimondo.de kontaktieren.
                </div>
              )}

              {/* Gesamt-Anzahlung groß hervorgehoben */}
              <div className="bg-[#1E3A5F] text-white rounded-xl p-5">
                <p className="text-xs text-white/70 uppercase tracking-wide">Gesamt-Anzahlung (alle Sub-Standorte)</p>
                <p className="text-3xl font-bold mt-1">{fmtEur(gesamtAnzahlung)} <span className="text-sm font-normal text-white/70">netto</span></p>
                <p className="text-[11px] text-white/70 mt-2">
                  Wird in Schritt 3 zentral via Stripe eingezogen. Sobald die Zahlung eingeht, sind alle
                  Sub-Standorte gleichzeitig freigeschaltet.
                </p>
              </div>

              {/* Inhaber-Stammdaten */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Deine Inhaber-Stammdaten</p>
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
                <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-5 flex items-start gap-3">
                  <Building2Icon className="w-5 h-5 text-[#1E3A5F] flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-gray-700">
                    <p>
                      Du gehoerst zu <strong>{organisation.name}</strong>. Dein{' '}
                      {organisation.typ === 'akademie' ? 'Verwalter' : 'Inhaber'} kuemmert sich
                      um Vertrag und Zahlung. Du musst hier nur einmal die Bedingungen bestaetigen.
                    </p>
                  </div>
                </div>
              )}

              {/* Eigenes Paket */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Dein Paket</p>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                  <Kondition label="Paket" value={paketLabel} />
                  <Kondition label="Fälle / Monat" value={String(sv.max_faelle_monat)} />
                  <Kondition label="Radius" value={`${sv.paket_umkreis_km} km`} />
                  <Kondition
                    label="Standort"
                    value={[sv.standort_adresse, sv.standort_plz].filter(Boolean).join(', ') || '—'}
                  />
                </div>
              </div>

              {/* Stammdaten */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Deine Stammdaten</p>
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
                kontingent={sv.max_faelle_monat}
                radiusKm={sv.paket_umkreis_km}
                anzahlungBetrag={r === 'buero_inhaber' ? gesamtAnzahlung : sv.onboarding_anzahlung_betrag}
                organisationName={r !== 'buero_inhaber' && organisation ? organisation.name : null}
                onShowLeadPreise={() => setShowLeadPreisOverlay(true)}
              />

              {/* Hinweis fuer Buero-Inhaber: stellvertretend fuer alle Sub-Standorte */}
              {r === 'buero_inhaber' && organisation && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-start gap-3">
                  <Building2Icon className="w-5 h-5 text-[#4573A2] flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-700">
                    Du unterzeichnest stellvertretend fuer <strong>{organisation.name}</strong> und alle{' '}
                    {subSvs.length} {subSvs.length === 1 ? 'Sub-Standort' : 'Sub-Standorte'}.
                  </div>
                </div>
              )}

              {/* Stammdaten kompakt — BUG-96: Firma + Steuernummer ergaenzt */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-2">
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
                <label className="text-xs text-gray-500 mb-1.5 block">
                  Dein Name (juristisch verbindlich) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={unterschriftName}
                  onChange={e => setUnterschriftName(e.target.value)}
                  className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                />
              </div>

              {/* Signature Pad — BUG-81 controlled component bleibt */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">
                  Unterschrift <span className="text-red-400">*</span>
                </label>
                <SignaturePadInput
                  value={signaturePng}
                  onChange={setSignaturePng}
                  height="h-44"
                  placeholder="Hier mit Maus oder Finger unterschreiben"
                />
              </div>

              {/* AGB-Checkbox mit Modal-Links */}
              <label className="flex items-start gap-2.5 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={agbAccepted}
                  onChange={e => setAgbAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300"
                />
                <span>
                  Ich akzeptiere die{' '}
                  {nbVorlage ? (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setVertragModal('nb') }}
                      className="font-semibold text-[#1E3A5F] underline hover:text-[#4573A2]"
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
                      className="font-semibold text-[#1E3A5F] underline hover:text-[#4573A2]"
                    >
                      den Kooperationsvertrag
                    </button>
                  ) : (
                    <strong>den Kooperationsvertrag</strong>
                  )}
                  {' '}und die{' '}
                  <Link href="/datenschutz" target="_blank" className="font-semibold text-[#1E3A5F] underline hover:text-[#4573A2]">
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
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 leading-relaxed">
                Bitte bestätige unsere{' '}
                <Link href="/nutzungsbedingungen" target="_blank" className="text-[#1E3A5F] underline">Nutzungsbedingungen</Link>,
                die <Link href="/agb" target="_blank" className="text-[#1E3A5F] underline">AGB</Link>{' '}
                und die <Link href="/datenschutz" target="_blank" className="text-[#1E3A5F] underline">Datenschutzerklärung</Link>.
                <br /><br />
                Den vollständigen Vertrag inkl. Anzahlung schließt dein
                {organisation?.typ === 'akademie' ? ' Verwalter' : ' Inhaber'} für dich ab — du musst
                hier nur einmal die Bedingungen akzeptieren.
              </div>

              {/* Name-Bestätigung */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">
                  Dein Name (zur Bestätigung) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={unterschriftName}
                  onChange={e => setUnterschriftName(e.target.value)}
                  className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                />
              </div>

              {/* AGB-Checkbox */}
              <label className="flex items-start gap-2.5 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={agbAccepted}
                  onChange={e => setAgbAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300"
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
              <div className="bg-[#4573A2]/5 border border-[#4573A2]/20 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2Icon className="w-5 h-5 text-[#4573A2] flex-shrink-0 mt-0.5" />
                <div className="text-sm text-[#0D1B3E]">
                  {r === 'buero_inhaber' ? (
                    <><strong>Buero-Vertrag unterzeichnet.</strong> Bitte schliesse jetzt die zentrale Anzahlung fuer alle Sub-Standorte ab.</>
                  ) : (
                    <><strong>Vertrag unterzeichnet.</strong> Bitte schliesse jetzt die Anzahlung ab.</>
                  )}
                </div>
              </div>

              {r === 'buero_inhaber' && gesamtAnzahlung <= 0 && (
                <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
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
                  kontingent={sv.max_faelle_monat}
                  radiusKm={sv.paket_umkreis_km}
                  anzahlungBetrag={r === 'buero_inhaber' ? gesamtAnzahlung : sv.onboarding_anzahlung_betrag}
                  subBueros={r === 'buero_inhaber' ? subSvs : undefined}
                  onShowLeadPreise={() => setShowLeadPreisOverlay(true)}
                />

                {/* Rechte Spalte: Embedded Stripe Checkout + Branding-Footer */}
                <div className="space-y-3">
                  {!stripePublishableKey ? (
                    <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                      Stripe-Konfiguration fehlt (STRIPE_PUBLISHABLE_KEY). Bitte aaron.sprafke@claimondo.de kontaktieren.
                    </div>
                  ) : !clientSecret ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
                      Checkout wird geladen ...
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                      <EmbeddedCheckoutProvider stripe={stripePromise} options={checkoutOptions}>
                        <EmbeddedCheckout />
                      </EmbeddedCheckoutProvider>
                    </div>
                  )}

                  <StripeBrandingFooter />
                </div>
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
              // AAR-359 W3: Wenn freigeschaltet + SA noch offen → zu
              // SA-Vorlage-Step; wenn SA auch durch → Dashboard.
              onDone={() => {
                if (sv.portal_zugang_freigeschaltet) {
                  const saOffen =
                    sv.sa_vorlage_status === null
                    || sv.sa_vorlage_status === 'zurueckgewiesen'
                  if (saOffen) {
                    goToStep('sa_vorlage')
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

          {/* AAR-359 W3: SA-Vorlage-Step zwischen Anzahlung und Kalender.
              Sub-Mitarbeiter sehen diesen Step NICHT — sie uploaden die
              SA später in /gutachter/verifizierung (W5). */}
          {currentKey === 'sa_vorlage' && r !== 'sub_mitarbeiter' && (
            <SaVorlageUploadStep
              svId={sv.id}
              initialStatus={sv.sa_vorlage_status}
              adminNotiz={sv.sa_vorlage_admin_notiz}
              onDone={() => goToStep('kalender')}
            />
          )}

          {/* AAR-242: Kalender-Step nach Stripe-Anzahlung */}
          {currentKey === 'kalender' && r !== 'sub_mitarbeiter' && (
            <KalenderConnectStep
              svId={sv.id}
              gcalConnected={sv.gcal_connected}
              onDone={() => {
                router.push('/gutachter')
                router.refresh()
              }}
            />
          )}

          {error && (
            <div className="mt-4 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* AAR-233 + AAR-242 + AAR-359 W3: Buttons nur auf Konditionen +
              Vertrag + Sub-AGB. Branding (LogoUploadStep), Anzahlung (Stripe),
              SA-Vorlage (SaVorlageUploadStep) und Kalender (KalenderConnectStep)
              haben eigene Buttons. */}
          {currentKey !== 'branding' && currentKey !== 'anzahlung' && currentKey !== 'sa_vorlage' && currentKey !== 'kalender' && (
            <div className="flex items-center gap-3 mt-6">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-40"
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
                className="flex-1 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
            className="flex-1 overflow-y-auto text-xs text-gray-700 leading-relaxed prose prose-sm max-w-none pr-2"
             
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
        maxFaelleMonat={sv.max_faelle_monat}
        paketLabel={paketLabel}
      />
    </div>
  )
}

function ReadRow({ icon: Icon, label, value }: { icon: typeof UserIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-500 uppercase">{label}</p>
        <p className="text-sm text-gray-800 break-words">{value}</p>
      </div>
    </div>
  )
}

function Kondition({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${highlight ? 'text-[#1E3A5F]' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

// BUG-96: Helper fuer die kompakte Stammdaten-Card im Vertrag-Step
function StammRow({ label, value, breakAll }: { label: string; value: string; breakAll?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className={`text-gray-900 text-right ${breakAll ? 'break-all' : ''}`}>{value}</span>
    </div>
  )
}

function KontaktHinweis() {
  return (
    <div className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <strong>Stimmt etwas nicht?</strong> Schreib uns an{' '}
      <a href="mailto:aaron.sprafke@claimondo.de" className="text-[#1E3A5F] underline">
        aaron.sprafke@claimondo.de
      </a>
      {' '}— wir korrigieren deine Stammdaten bevor du den Vertrag unterzeichnest.
    </div>
  )
}
