'use client'

// 2026-05-12 Funnel v3: DEPRECATED — wird durch /kunde/onboarding-details
// ersetzt (DynamicWizard mit datenabhaengigem Loader, Plan v2 PR #4).
// Token-only Magic-Link-User landen weiter hier (kein Auth-Cookie da),
// eingeloggte User werden in /flow/[token]/page.tsx zu onboarding-details
// redirected (PR #5).
//
// Geplante Loeschung: nach 2 stabilen Releases ohne Probleme (frueheste
// 2026-05-26). Bis dahin Bug-Fixes only, keine neuen Features.

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { signSAandCreateFall, createKundeAccount, updateLeadStammdaten, generateSAPdf } from './actions'
import { uploadFlowSignatur } from '@/lib/actions/unterschrift-upload'
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
}

// CMM-14: 4-Step Flow. Step 'weitere-angaben' (Werkstatt + Schadenfotos)
// wurde rausgenommen — Foto-Upload + Werkstatt-Erfassung gehören ins
// Onboarding nach Magic-Link-Login, nicht in den FlowLink.
type StepId = 'zusammenfassung' | 'gutachter' | 'sa' | 'account'

const STEPS: { id: StepId; label: string }[] = [
  { id: 'zusammenfassung', label: 'Zusammenfassung' },
  { id: 'gutachter', label: 'Ihr Gutachter' },
  { id: 'sa', label: 'Beauftragung' },
  { id: 'account', label: 'Konto' },
]

// AAR-305: stepIndex-ID-Helper damit hardcodierte Indizes (z.B. account=3
// vor Einfügen, jetzt 4) nicht brechen
function stepIndexById(id: StepId): number {
  return STEPS.findIndex((s) => s.id === id)
}

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
  legalDocs,
}: {
  token: string
  flowLinkId?: string | null
  lead: LeadData
  gutachter?: GutachterInfo | null
  // legalDocs wird serverseitig übergeben — datenschutz + agb mit Titel/Markdown.
  legalDocs?: {
    datenschutz?: { titel: string; markdown: string }
    agb?: { titel: string; markdown: string }
  }
}) {
  const t = useTranslations('flow')
  // t() liefert bei fehlendem Key den Key-Pfad (truthy) statt null — daher has-Guard,
  // damit der Fallback fuer unbekannte/freitext-Codes wirklich greift.
  const tLabel = (key: string, fallback: string) =>
    t.has(key as Parameters<typeof t.has>[0]) ? t(key as Parameters<typeof t>[0]) : fallback
  const [stepIndex, setStepIndex] = useState(0)
  const [datenschutz, setDatenschutz] = useState(false)
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
  const [magicLink, setMagicLink] = useState<string | null>(null)
  // CMM-14: Ref auf das versteckte Login-Form. Wird nach Account-Anlage
  // programmatisch submitted — Form-Submit ist der Cookie-sichere Weg
  // gegen die Race-Condition mit `window.location.assign`.
  const loginFormRef = useRef<HTMLFormElement>(null)

  // CMM-14: Werkstatt + Schadensfotos State entfernt — Step 'weitere-angaben'
  // wurde aus dem Wizard rausgenommen, der Foto-Upload erfolgt jetzt im
  // Onboarding nach Magic-Link-Login.

  const currentStep = STEPS[stepIndex]
  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100)
  const fahrzeug = [lead.fahrzeug_hersteller, lead.fahrzeug_modell].filter(Boolean).join(' ')
  const kundenName = [editVorname, editNachname].filter(Boolean).join(' ')

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
      const result = await signSAandCreateFall(lead.id, publicUrl, flowLinkId ?? null)
      if (!result.ok) throw new Error(result.error ?? 'Fehler bei der Beauftragung')
      setFallId(result.fallId)

      // 3. SA-PDF generieren (Background, non-blocking)
      generateSAPdf(result.fallId, lead.id, publicUrl).catch(() => {})

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
      const result = await createKundeAccount(fallId, accountEmail, editVorname || lead.vorname, editNachname || lead.nachname, editTelefon || lead.telefon || null)
      if (!result.success) {
        // CMM-14 Debug: alert damit der User die Meldung sicher sieht.
        if (typeof window !== 'undefined') {
          window.alert(`Account-Anlage fehlgeschlagen: ${result.error}`)
        }
        setError(result.error)
        return
      }
      setAccountPassword(result.password)
      setMagicLink(result.magicLink)
      setAccountCreated(true)

      // CMM-14: Form-Submit zur loginAfterFlowFormAction. Das ist der einzige
      // zuverlässige Weg gegen den Cookie-Race — Next.js handled die
      // Set-Cookie-Header der Server-Action-Response korrekt VOR dem
      // redirect(), beim window.location.assign nach manuell-await ist der
      // Cookie noch nicht persistiert wenn der nächste Request rausgeht.
      // Das Form ist im JSX gerendert und wird hier programmatisch submitted.
      const form = loginFormRef.current
      if (form) {
        const emailInput = form.elements.namedItem('email') as HTMLInputElement | null
        const passwordInput = form.elements.namedItem('password') as HTMLInputElement | null
        if (emailInput) emailInput.value = accountEmail
        if (passwordInput) passwordInput.value = result.password
        form.requestSubmit()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('step_account.error_fallback'))
    } finally {
      setCreatingAccount(false)
    }
  }

  // CMM-14: Account-Anlage automatisch beim Erreichen des Account-Steps,
  // damit der Kunde keinen weiteren Klick mehr macht und direkt im Onboarding
  // landet (Auto-Login + Redirect zu /kunde/onboarding).
  useEffect(() => {
    if (currentStep.id === 'account' && fallId && !accountCreated && !creatingAccount && !error) {
      handleCreateAccount()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep.id, fallId])

  // AAR-99: Kein Skip-Button mehr — Account ist Pflicht

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-claimondo-bg flex flex-col">
      {/* Ambient-Gradient nach Brief §5 */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(60% 50% at 80% 0%, rgba(123,163,204,0.18), transparent 60%)',
            'radial-gradient(50% 50% at 0% 100%, rgba(69,115,162,0.08), transparent 70%)',
          ].join(', '),
        }}
      />
      {/* CMM-14: Verstecktes Login-Form für den Auto-Login nach Account-
          Anlage. Submit zu Route-Handler /api/auth/login-after-flow — der
          macht signInWithPassword + Set-Cookie + 303-Redirect. Browser
          folgt mit einer echten Hard-Navigation, kein RSC-Stream. */}
      <form
        ref={loginFormRef}
        method="POST"
        action="/api/auth/login-after-flow"
        style={{ display: 'none' }}
      >
        <input type="hidden" name="email" defaultValue="" />
        <input type="hidden" name="password" defaultValue="" />
      </form>

      {/* Sticky-Glass-Step-Indicator (iOS Brief §8.6) */}
      <div className="sticky top-0 z-20 border-b border-claimondo-navy/[0.06] bg-white/[0.78] backdrop-blur-[22px] backdrop-saturate-150">
        <div className="h-1 w-full bg-claimondo-navy/[0.06]">
          <div className="h-full bg-gradient-to-r from-claimondo-navy to-claimondo-ondo transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)]" style={{ width: `${progress}%` }} />
        </div>
        <div className="mx-auto flex max-w-lg items-center justify-center gap-2 px-5 py-3">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-semibold tracking-[-.01em] transition-all duration-300 ease-[cubic-bezier(.32,.72,0,1)] ${
                i < stepIndex
                  ? 'bg-claimondo-navy border-claimondo-navy text-white scale-[1.04]'
                  : i === stepIndex
                    ? 'bg-claimondo-ondo border-claimondo-ondo text-white scale-[1.06] shadow-[0_0_0_5px_rgba(69,115,162,.16)]'
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
                <div className="border-t border-claimondo-border pt-5">
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
                      {t('step_summary.datenschutz_text_suffix')} <span className="text-red-400">*</span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* ═══ SCHRITT 2: GUTACHTER-ANZEIGE (AAR-99) ═══ */}
            {currentStep.id === 'gutachter' && (
              <div>
                <StepHeader
                  question={t('step_gutachter.heading')}
                  sub={t('step_gutachter.sub')}
                  icon={<UserIcon className="w-8 h-8 text-claimondo-ondo" />}
                />

                {gutachter ? (
                  <div className="bg-gradient-to-br from-claimondo-ondo/10 to-claimondo-shield/5 border border-claimondo-ondo/20 rounded-ios-lg p-7 text-center mb-6">
                    {gutachter.avatarUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={gutachter.avatarUrl}
                        alt={gutachter.vorname}
                        className="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-4 border-white shadow-claimondo-md"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-claimondo-ondo flex items-center justify-center mx-auto mb-4 text-white text-3xl font-bold">
                        {gutachter.vorname.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <p className="text-xs uppercase tracking-wider text-claimondo-ondo mb-1">{t('step_gutachter.sv_label')}</p>
                    <h2 className="text-2xl font-bold text-claimondo-navy mb-2">{gutachter.vorname}</h2>
                    <p className="text-sm text-claimondo-ondo">{t('step_gutachter.kontakt_hinweis')}</p>
                    {gutachter.terminDatum && (
                      <div className="mt-4 pt-4 border-t border-claimondo-ondo/20">
                        <p className="text-xs text-claimondo-ondo mb-1">{t('step_gutachter.termin_label')}</p>
                        <p className="text-sm font-semibold text-claimondo-navy">
                          {new Date(gutachter.terminDatum).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                        <p className="text-sm text-claimondo-ondo">
                          {new Date(gutachter.terminDatum).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                        </p>
                        {/* Besichtigungsort prominent — NICHT der Unfallort */}
                        {gutachter.besichtigungsAdresse && (
                          <div className="mt-3 pt-3 border-t border-claimondo-ondo/10">
                            <p className="text-xs text-claimondo-ondo mb-0.5">{t('step_gutachter.besichtigungsort_label')}</p>
                            <p className="text-sm text-claimondo-navy">{gutachter.besichtigungsAdresse}</p>
                            {gutachter.svTreffpunkt && (
                              <p className="text-xs text-claimondo-ondo mt-0.5">
                                {t('step_gutachter.treffpunkt_label', { treffpunkt: gutachter.svTreffpunkt })}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-ios-md p-5 mb-6 text-sm text-amber-800">
                    {t('step_gutachter.kein_gutachter')}
                  </div>
                )}

                <button
                  onClick={() => setStepIndex(stepIndexById('sa'))}
                  className="w-full inline-flex items-center justify-center gap-2 min-h-12 px-6 py-3.5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] active:translate-y-0 transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)]"
                >
                  {t('common.weiter')}
                </button>

              </div>
            )}
            {/* CMM-14: Step 'weitere-angaben' (Werkstatt + Fotos) entfernt —
                Foto-Upload + Werkstatt-Erfassung gehören ins Onboarding nach
                Magic-Link-Login, nicht in den FlowLink. */}

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
                    <div className="relative z-10 w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-ios-md shadow-claimondo-lg flex flex-col max-h-[90dvh]">
                      {/* Header */}
                      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-claimondo-border flex-shrink-0">
                        <h2 className="text-sm font-semibold text-claimondo-navy">{t('step_sa.popover_titel')}</h2>
                        <button type="button" onClick={() => setSaVolltextOffen(false)} className="p-1.5 rounded-ios-sm hover:bg-claimondo-bg">
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
                        <p className="text-xs text-claimondo-ondo/70 pt-2 border-t border-claimondo-border">{t('step_sa.volltext.footer_note')}</p>
                      </div>
                      {/* Footer */}
                      <div className="px-5 py-4 border-t border-claimondo-border flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => { setSaAccepted(true); setSaVolltextOffen(false) }}
                          className="w-full py-3.5 rounded-ios-md bg-claimondo-shield hover:bg-claimondo-ondo text-white font-semibold text-sm transition-all active:scale-[0.98]"
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
                    {t('step_sa.widerruf_link')} <span className="text-red-400">*</span>
                  </span>
                </label>

                {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-ios-md px-4 py-3 mb-4">{error}</p>}

                <button
                  onClick={handleSignSA}
                  disabled={!signatureBlob || !saAccepted || submittingSA}
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

                <div className="bg-emerald-50 border border-emerald-100 rounded-ios-md px-4 py-3 mb-5 flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-emerald-500 shrink-0" />
                  <p className="text-sm text-emerald-700">
                    {t('step_account.success_text')}
                  </p>
                </div>

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

                {(creatingAccount || (accountCreated && !error)) && (
                  <div className="rounded-ios-md border border-claimondo-border bg-white p-6 text-center">
                    <div className="inline-block w-6 h-6 border-2 border-claimondo-ondo border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-sm text-claimondo-ondo">
                      {creatingAccount
                        ? t('step_account.creating')
                        : t('step_account.logging_in')}
                    </p>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-ios-md px-4 py-3 mb-4">
                    {error}
                  </p>
                )}

                {/* Fallback: Wenn Account angelegt ist aber das Auto-Login
                    nicht weitergeleitet hat (z.B. Browser-Block), bietet der
                    Button einen manuellen Eintritt — Magic-Link primär,
                    /kunde als letzter Fallback. */}
                {accountCreated && error && (
                  <div className="space-y-4 mt-4">
                    <div className="rounded-ios-md bg-claimondo-bg border border-claimondo-border p-4 text-sm text-claimondo-ondo">
                      {t('step_account.fallback_email_hint', { email: accountEmail })}
                    </div>
                    <a
                      href={magicLink ?? '/kunde/onboarding'}
                      className="block w-full text-center min-h-12 px-6 py-3.5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] active:translate-y-0 transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)]"
                    >
                      {t('step_account.fallback_cta')}
                    </a>
                  </div>
                )}
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
                // Korrigierte Stammdaten speichern
                if (editVorname !== lead.vorname || editNachname !== lead.nachname || editTelefon !== lead.telefon || editEmail !== lead.email) {
                  try {
                    await updateLeadStammdaten(lead.id, { vorname: editVorname, nachname: editNachname, telefon: editTelefon, email: editEmail })
                    setAccountEmail(editEmail)
                  } catch { /* weiter trotzdem */ }
                }
                setStepIndex(1) // → gutachter
              }}
              disabled={!datenschutz || !editVorname || !editNachname}
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
        className={`w-full px-4 py-3.5 rounded-claimondo-md text-base ${liquidFieldBase}`}
      />
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 rounded-ios-md bg-claimondo-navy/[0.03] border border-claimondo-navy/[0.06]">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-claimondo-ondo/60">{label}</span>
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
