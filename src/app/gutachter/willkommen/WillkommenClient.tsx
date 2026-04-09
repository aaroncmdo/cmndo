'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  PackageIcon,
  FileSignatureIcon,
  CreditCardIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  MapPinIcon,
  UserIcon,
  Building2Icon,
  AlertTriangleIcon,
  ClockIcon,
} from 'lucide-react'
import { signSvVertrag, startStripeCheckout } from '@/lib/actions/sv-onboarding-actions'
import { signBueroVertrag, startBueroStripeCheckout } from '@/app/gutachter/onboarding/buero/actions'
import { akzeptiereAgbSubSv } from './actions'
import SignaturePadInput from '@/components/SignaturePadInput'

// ARCH-1: Willkommen-Wizard mit drei Rollen-Varianten:
//   - solo            : 3-Step Wizard (Konditionen → Vertrag+Sig → Stripe)
//   - buero_inhaber   : 3-Step Wizard mit Sub-Tabelle + Buero-Vertrag +
//                       Buero-Sammel-Anzahlung
//   - sub_mitarbeiter : 2-Step Light-Flow (Paket-Hinweis → Checkbox-AGB +
//                       Name) → Warte-Page oder direkt /gutachter

type Rolle = 'solo' | 'buero_inhaber' | 'sub_mitarbeiter'

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
}

const STEPS_3: { key: string; label: string; icon: typeof PackageIcon }[] = [
  { key: 'konditionen', label: 'Konditionen', icon: PackageIcon },
  { key: 'vertrag', label: 'Vertrag', icon: FileSignatureIcon },
  { key: 'anzahlung', label: 'Anzahlung', icon: CreditCardIcon },
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
}) {
  const router = useRouter()
  const STEPS = rolle === 'sub_mitarbeiter' ? STEPS_2_SUB : STEPS_3

  // Initial-Step basierend auf Status (reload-sicher):
  // - Solo: sv.vertrag_unterschrieben → Step 2 (Stripe)
  // - Inhaber: signBueroVertrag setzt nur organisationen.onboarding_status,
  //   nicht sv.vertrag_unterschrieben — also Org-Status als Quelle nehmen.
  //   'vertrag_unterzeichnet' und 'anzahlung_offen' bedeuten beide:
  //   Vertrag durch, jetzt Stripe.
  // - Sub-Mitarbeiter: bleibt initial bei Step 0 (falls neu) oder landet
  //   ueber den separaten warteAufInhaber-Branch auf der Warte-Page.
  let initialStep = 0
  if (rolle === 'solo' && sv.vertrag_unterschrieben) {
    initialStep = 2
  } else if (rolle === 'buero_inhaber') {
    const orgStatus = organisation?.onboarding_status ?? ''
    if (orgStatus === 'vertrag_unterzeichnet' || orgStatus === 'anzahlung_offen') {
      initialStep = 2
    }
  }
  if (typeof stepOverride === 'number') initialStep = stepOverride

  const [step, setStep] = useState(initialStep)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warteAufInhaber, setWarteAufInhaber] = useState(
    rolle === 'sub_mitarbeiter' && sv.vertrag_unterschrieben && !sv.portal_zugang_freigeschaltet,
  )

  // Vertrag-Form (Solo + Inhaber)
  const [unterschriftName, setUnterschriftName] = useState(
    [profile.vorname, profile.nachname].filter(Boolean).join(' '),
  )
  const [agbAccepted, setAgbAccepted] = useState(false)
  const [signaturePng, setSignaturePng] = useState<string | null>(null)
  const [scrolled80, setScrolled80] = useState(false)
  const [kvOpen, setKvOpen] = useState(false)
  const nbScrollRef = useRef<HTMLDivElement>(null)

  // 80% Scroll-Lock fuer Nutzungsbedingungen (Solo + Inhaber)
  useEffect(() => {
    if (rolle === 'sub_mitarbeiter') return
    const el = nbScrollRef.current
    if (!el) return
    function handleScroll() {
      if (!el) return
      const total = el.scrollHeight - el.clientHeight
      if (total <= 0) { setScrolled80(true); return }
      const ratio = el.scrollTop / total
      if (ratio >= 0.8) setScrolled80(true)
    }
    el.addEventListener('scroll', handleScroll)
    handleScroll() // Initial check fuer kurze Vertraege
    return () => el.removeEventListener('scroll', handleScroll)
  }, [step, rolle])

  const paketLabel = PAKET_LABELS[sv.paket] ?? sv.paket
  const fullName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || '—'

  // FR-2: Banner sichtbar fuer Solo + Inhaber, NICHT fuer Sub-Mitarbeiter,
  // und nur solange portal_zugang_freigeschaltet=false ist.
  const showAnzahlungBanner =
    (rolle === 'solo' || rolle === 'buero_inhaber') && !sv.portal_zugang_freigeschaltet

  // ── Solo-Handler (existing) ────────────────────────────────────────────
  async function handleSoloVertragSubmit() {
    setError(null)
    if (!agbAccepted) { setError('Bitte akzeptiere die AGB/NB/DS'); return }
    if (!unterschriftName.trim()) { setError('Bitte gib deinen Namen ein'); return }
    if (!signaturePng) { setError('Bitte unterschreibe im Feld unten'); return }
    if (!scrolled80) { setError('Bitte lies die Nutzungsbedingungen vollstaendig (80% gescrollt)'); return }

    setSaving(true)
    const result = await signSvVertrag({
      signaturePngDataUri: signaturePng,
      unterschriftName,
    })
    setSaving(false)

    if (!result.success) { setError(result.error ?? 'Vertrag fehlgeschlagen'); return }
    setStep(2)
  }

  async function handleSoloCheckout() {
    setError(null)
    setSaving(true)
    const result = await startStripeCheckout()
    setSaving(false)

    if ('error' in result) { setError(result.error); return }
    window.location.href = result.checkoutUrl
  }

  // ── Inhaber-Handler ────────────────────────────────────────────────────
  async function handleInhaberVertragSubmit() {
    setError(null)
    if (!organisation) { setError('Keine Organisation zugeordnet'); return }
    if (!agbAccepted) { setError('Bitte akzeptiere die AGB/NB/DS'); return }
    if (!unterschriftName.trim()) { setError('Bitte gib deinen Namen ein'); return }
    if (!signaturePng) { setError('Bitte unterschreibe im Feld unten'); return }
    if (!scrolled80) { setError('Bitte lies die Nutzungsbedingungen vollstaendig (80% gescrollt)'); return }

    setSaving(true)
    const result = await signBueroVertrag({
      organisation_id: organisation.id,
      signaturePngDataUri: signaturePng,
      unterschriftName,
    })
    setSaving(false)

    if (!result.success) { setError(result.error ?? 'Buero-Vertrag fehlgeschlagen'); return }
    setStep(2)
  }

  async function handleInhaberCheckout() {
    setError(null)
    if (!organisation) { setError('Keine Organisation zugeordnet'); return }

    // FR-6: 0-EUR-Schutz — Inhaber selbst hat onboarding_anzahlung_betrag=0,
    // Stripe-Aufruf darf nur passieren wenn Sub-Standorte tatsaechlich
    // einen Anzahlungsbetrag haben. Defensive Pruefung VOR dem Server-Call.
    if (gesamtAnzahlung <= 0) {
      setError('Keine Sub-Standorte mit Anzahlungsbetrag gefunden — bitte support@claimondo.de kontaktieren')
      return
    }

    setSaving(true)
    const result = await startBueroStripeCheckout(organisation.id)
    setSaving(false)

    if ('error' in result) { setError(result.error); return }
    window.location.href = result.checkoutUrl
  }

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
        <div className="w-full max-w-2xl">
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
                  die ersten Faelle erhalten kannst.
                </p>
                {organisation && (
                  <p className="mt-2 text-xs text-amber-700">
                    Organisation: <strong>{organisation.name}</strong>
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 text-xs text-gray-500 text-center">
              Du kannst dieses Fenster schliessen. Bei Fragen erreichst du uns unter{' '}
              <a href="mailto:support@claimondo.de" className="text-[#1E3A5F] underline">
                support@claimondo.de
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fb] flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
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
              <strong>Sie erhalten erst Faelle von uns, sobald Sie angezahlt haben!</strong>
              <p className="text-xs text-amber-700 mt-1">
                {rolle === 'buero_inhaber'
                  ? 'Sobald die Buero-Anzahlung eingegangen ist, werden alle Sub-Standorte gleichzeitig freigeschaltet.'
                  : 'Sobald die Anzahlung eingegangen ist, ist dein Portal-Zugang sofort freigeschaltet.'}
              </p>
            </div>
          </div>
        )}

        {/* Stepper */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={s.key} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  i < step ? 'bg-green-600' : i === step ? 'bg-[#1E3A5F]' : 'bg-gray-100'
                }`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 ${i < step ? 'bg-green-600' : 'bg-gray-100'}`} />
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
          {step === 0 && rolle === 'solo' && (
            <div className="space-y-5">
              {/* Konditionen-Card */}
              <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Deine Konditionen</p>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                  <Kondition label="Paket" value={paketLabel} />
                  <Kondition label="Faelle / Monat" value={String(sv.max_faelle_monat)} />
                  <Kondition label="Radius" value={`${sv.paket_umkreis_km} km`} />
                  <Kondition label="Anzahlung" value={fmtEur(sv.onboarding_anzahlung_betrag)} highlight />
                </div>
                <div className="mt-4 pt-4 border-t border-[#1E3A5F]/10">
                  <Link
                    href="/gutachter/leadpreise"
                    className="text-xs text-[#1E3A5F] underline hover:text-[#4573A2]"
                  >
                    → Lead-Preis-Tabelle einsehen
                  </Link>
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
          {step === 0 && rolle === 'buero_inhaber' && (
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
                  Es sind noch keine Sub-Standorte angelegt. Bitte support@claimondo.de kontaktieren.
                </div>
              )}

              {/* Gesamt-Anzahlung gross hervorgehoben */}
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
          {step === 0 && rolle === 'sub_mitarbeiter' && (
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
                  <Kondition label="Faelle / Monat" value={String(sv.max_faelle_monat)} />
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
             ═══════════════════════════════════════════════════════════════ */}
          {step === 1 && rolle !== 'sub_mitarbeiter' && (
            <div className="space-y-4">
              {!nbVorlage ? (
                <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                  Keine aktive Nutzungsbedingungen-Vorlage hinterlegt. Bitte support@claimondo.de kontaktieren.
                </div>
              ) : (
                <>
                  {/* Nutzungsbedingungen mit 80% Scroll-Lock */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-gray-500 uppercase tracking-wide">
                        {nbVorlage.titel} <span className="text-red-400">*</span>
                      </label>
                      <span className={`text-[10px] ${scrolled80 ? 'text-green-600' : 'text-gray-400'}`}>
                        {scrolled80 ? '✓ vollstaendig gelesen' : 'bitte vollstaendig scrollen'}
                      </span>
                    </div>
                    <div
                      ref={nbScrollRef}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-64 overflow-y-auto text-xs text-gray-600 leading-relaxed prose prose-sm max-w-none"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: nbVorlage.inhalt_html }}
                    />
                  </div>

                  {/* Kooperationsvertrag-Muster aufklappbar */}
                  {kvVorlage && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setKvOpen(!kvOpen)}
                        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-900">{kvVorlage.titel}</span>
                        {kvOpen ? <ChevronUpIcon className="w-4 h-4 text-gray-400" /> : <ChevronDownIcon className="w-4 h-4 text-gray-400" />}
                      </button>
                      {kvOpen && (
                        <div
                          className="px-4 pb-4 text-xs text-gray-600 leading-relaxed max-h-64 overflow-y-auto prose prose-sm max-w-none"
                          // eslint-disable-next-line react/no-danger
                          dangerouslySetInnerHTML={{ __html: kvVorlage.inhalt_html }}
                        />
                      )}
                    </div>
                  )}

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

                  {/* Signature Pad */}
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

                  {/* AGB-Checkbox */}
                  <label className="flex items-start gap-2.5 cursor-pointer text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={agbAccepted}
                      onChange={e => setAgbAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300"
                    />
                    <span>
                      Ich akzeptiere die <strong>Nutzungsbedingungen</strong>, die <strong>AGB</strong> und die <strong>Datenschutzerklaerung</strong>.
                      Mit meiner Unterschrift bestaetige ich rechtsverbindlich die Annahme
                      {rolle === 'buero_inhaber' && organisation
                        ? ` stellvertretend fuer ${organisation.name} und alle Sub-Standorte.`
                        : '.'}
                    </span>
                  </label>
                </>
              )}
            </div>
          )}

          {/* SCHRITT 1 — Sub-Mitarbeiter: nur Checkbox + Name (kein PDF, keine Sig) */}
          {step === 1 && rolle === 'sub_mitarbeiter' && (
            <div className="space-y-5">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 leading-relaxed">
                Bitte bestaetige unsere{' '}
                <Link href="/nutzungsbedingungen" target="_blank" className="text-[#1E3A5F] underline">Nutzungsbedingungen</Link>,
                die <Link href="/agb" target="_blank" className="text-[#1E3A5F] underline">AGB</Link>{' '}
                und die <Link href="/datenschutz" target="_blank" className="text-[#1E3A5F] underline">Datenschutzerklaerung</Link>.
                <br /><br />
                Den vollstaendigen Vertrag inkl. Anzahlung schliesst dein
                {organisation?.typ === 'akademie' ? ' Verwalter' : ' Inhaber'} fuer dich ab — du musst
                hier nur einmal die Bedingungen akzeptieren.
              </div>

              {/* Name-Bestaetigung */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">
                  Dein Name (zur Bestaetigung) <span className="text-red-400">*</span>
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
                  Ich akzeptiere die <strong>Nutzungsbedingungen</strong>, die <strong>AGB</strong> und die <strong>Datenschutzerklaerung</strong>.
                </span>
              </label>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              SCHRITT 2: Stripe Checkout (Solo + Inhaber)
             ═══════════════════════════════════════════════════════════════ */}
          {step === 2 && rolle === 'solo' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2Icon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-700">
                  <strong>Vertrag unterzeichnet.</strong> Letzter Schritt: Anzahlung leisten.
                  Du wirst zu Stripe weitergeleitet — bezahle dort sicher per Karte oder SEPA.
                </div>
              </div>

              <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Zu zahlender Betrag</p>
                <p className="text-2xl font-bold text-[#1E3A5F] mt-1">{fmtEur(sv.onboarding_anzahlung_betrag)}</p>
                <p className="text-[11px] text-gray-500 mt-2">
                  Wird mit den ersten Lead-Gebuehren verrechnet. Sobald die Zahlung eingegangen ist, ist dein Portal-Zugang freigeschaltet.
                </p>
              </div>
            </div>
          )}

          {step === 2 && rolle === 'buero_inhaber' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2Icon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-700">
                  <strong>Buero-Vertrag unterzeichnet.</strong> Letzter Schritt: zentrale Anzahlung
                  fuer alle Sub-Standorte leisten. Du wirst zu Stripe weitergeleitet.
                </div>
              </div>

              <div className="bg-[#1E3A5F] text-white rounded-xl p-5">
                <p className="text-xs text-white/70 uppercase tracking-wide">Gesamt-Anzahlung</p>
                <p className="text-3xl font-bold mt-1">{fmtEur(gesamtAnzahlung)} <span className="text-sm font-normal text-white/70">netto</span></p>
                <p className="text-[11px] text-white/70 mt-2">
                  Sammelbetrag fuer {subSvs.length} Sub-Standort(e). Wird mit den ersten
                  Lead-Gebuehren der jeweiligen Standorte verrechnet.
                </p>
              </div>

              {gesamtAnzahlung <= 0 && (
                <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                  Es sind keine Sub-Standorte mit Anzahlungsbetrag vorhanden. Bitte support@claimondo.de kontaktieren.
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-3 mt-6">
            {step > 0 && step !== 2 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-40"
              >
                Zurueck
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (rolle === 'sub_mitarbeiter') {
                  if (step === 0) setStep(1)
                  else handleSubAgbSubmit()
                } else if (rolle === 'buero_inhaber') {
                  if (step === 0) setStep(1)
                  else if (step === 1) handleInhaberVertragSubmit()
                  else handleInhaberCheckout()
                } else {
                  if (step === 0) setStep(1)
                  else if (step === 1) handleSoloVertragSubmit()
                  else handleSoloCheckout()
                }
              }}
              disabled={
                saving ||
                (step === 1 && rolle !== 'sub_mitarbeiter' && !nbVorlage) ||
                (step === 2 && rolle === 'buero_inhaber' && gesamtAnzahlung <= 0) ||
                (step === 0 && rolle === 'buero_inhaber' && subSvs.length === 0)
              }
              className="flex-1 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold transition-colors disabled:opacity-40"
            >
              {saving
                ? 'Wird verarbeitet...'
                : rolle === 'sub_mitarbeiter'
                ? step === 0
                  ? 'Weiter zur Bestaetigung'
                  : 'Bedingungen akzeptieren'
                : step === 0
                ? rolle === 'buero_inhaber'
                  ? 'Weiter zum Buero-Vertrag'
                  : 'Weiter zum Vertrag'
                : step === 1
                ? rolle === 'buero_inhaber'
                  ? 'Buero-Vertrag unterzeichnen'
                  : 'Vertrag unterzeichnen'
                : rolle === 'buero_inhaber'
                ? `Jetzt ${fmtEur(gesamtAnzahlung)} zahlen`
                : `Jetzt ${fmtEur(sv.onboarding_anzahlung_betrag)} zahlen`}
            </button>
          </div>
        </div>
      </div>
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

function KontaktHinweis() {
  return (
    <div className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <strong>Stimmt etwas nicht?</strong> Schreib uns an{' '}
      <a href="mailto:support@claimondo.de" className="text-[#1E3A5F] underline">
        support@claimondo.de
      </a>
      {' '}— wir korrigieren deine Stammdaten bevor du den Vertrag unterzeichnest.
    </div>
  )
}
