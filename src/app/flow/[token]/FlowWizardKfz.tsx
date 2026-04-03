'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { signSAandCreateFall, createKundeAccount } from './actions'
import {
  CheckIcon,
  CameraIcon,
  UploadIcon,
  FileTextIcon,
  CarIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  UserPlusIcon,
  MailIcon,
  EyeIcon,
  EyeOffIcon,
  SkipForwardIcon,
  PenToolIcon,
  Trash2Icon,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeadData = {
  id: string
  vorname: string
  nachname: string
  email: string
  telefon: string
  schadenfall_typ: string
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
}

type StepId = 'stammdaten' | 'sa' | 'account' | 'onboarding'

const STEPS: { id: StepId; label: string }[] = [
  { id: 'stammdaten', label: 'Stammdaten' },
  { id: 'sa', label: 'Beauftragung' },
  { id: 'account', label: 'Konto' },
  { id: 'onboarding', label: 'Dokumente' },
]

// ─── SF Labels ───────────────────────────────────────────────────────────────

const SF_LABELS: Record<string, string> = {
  'sf-01': 'Unverschuldeter Unfall',
  'sf-02': 'Teilschuld-Unfall',
  'sf-03': 'Parkschaden / Fahrerflucht',
  'sf-04': 'Selbstverschuldeter Unfall',
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

export default function FlowWizardKfz({
  token,
  flowLinkId,
  lead,
}: {
  token: string
  flowLinkId?: string | null
  lead: LeadData
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [datenschutz, setDatenschutz] = useState(false)
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [saAccepted, setSaAccepted] = useState(false)
  const [submittingSA, setSubmittingSA] = useState(false)
  const [fallId, setFallId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Account step
  const [accountPassword, setAccountPassword] = useState('')
  const [accountEmail, setAccountEmail] = useState(lead.email)
  const [showPw, setShowPw] = useState(false)
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [accountCreated, setAccountCreated] = useState(false)

  // Onboarding step
  const [fahrzeugschein, setFahrzeugschein] = useState<File | null>(null)
  const [unfallmitteilung, setUnfallmitteilung] = useState<File | null>(null)
  const [fuehrerschein, setFuehrerschein] = useState<File | null>(null)
  const [schadensfotos, setSchadensfotos] = useState<File[]>([])
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const [skipDocs, setSkipDocs] = useState(false)

  const currentStep = STEPS[stepIndex]
  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100)
  const fahrzeug = [lead.fahrzeug_hersteller, lead.fahrzeug_modell].filter(Boolean).join(' ')
  const kundenName = [lead.vorname, lead.nachname].filter(Boolean).join(' ')

  // ─── SA unterzeichnen + Fall erstellen ─────────────────────────────────────

  async function handleSignSA() {
    if (!signatureBlob) return
    setSubmittingSA(true)
    setError(null)
    try {
      const supabase = createClient()

      // 1. Unterschrift als PNG hochladen
      const ts = Date.now()
      const path = `flow/${token}/sa_${ts}.png`
      const { error: upErr } = await supabase.storage
        .from('unterschriften')
        .upload(path, signatureBlob, { contentType: 'image/png' })
      if (upErr) throw new Error(upErr.message)
      const { data: { publicUrl } } = supabase.storage.from('unterschriften').getPublicUrl(path)

      // 2. Server Action: Fall erstellen
      const result = await signSAandCreateFall(lead.id, publicUrl, flowLinkId ?? null)
      setFallId(result.fallId)
      setStepIndex(2) // → Account step
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler bei der Beauftragung')
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
      const result = await createKundeAccount(fallId, accountEmail, lead.vorname, lead.nachname, lead.telefon || null)
      setAccountPassword(result.password)
      setAccountCreated(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Konto konnte nicht erstellt werden')
    } finally {
      setCreatingAccount(false)
    }
  }

  // ─── Dokumente hochladen ───────────────────────────────────────────────────

  async function handleUploadDocs() {
    if (!fallId) return
    setUploadingDocs(true)
    setError(null)
    try {
      const supabase = createClient()
      const uploads: { file: File; category: string }[] = []
      if (fahrzeugschein) uploads.push({ file: fahrzeugschein, category: 'fahrzeugschein' })
      if (unfallmitteilung) uploads.push({ file: unfallmitteilung, category: 'unfallmitteilung' })
      if (fuehrerschein) uploads.push({ file: fuehrerschein, category: 'fuehrerschein' })
      for (const f of schadensfotos) uploads.push({ file: f, category: 'schadensfoto' })

      for (const { file, category } of uploads) {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `flow/${token}/${fallId}/${category}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage.from('dokumente').upload(path, file, { contentType: file.type })
        if (upErr) throw new Error(upErr.message)
        const { data: { publicUrl } } = supabase.storage.from('dokumente').getPublicUrl(path)

        const kat = category === 'schadensfoto' ? 'schadensfoto' : 'kundendokument'
        await supabase.from('dokumente').insert({
          fall_id: fallId,
          typ: category,
          datei_url: publicUrl,
          datei_name: file.name,
          datei_groesse: file.size,
          kategorie: kat,
          quelle: 'flowlink',
          hochgeladen_von_rolle: 'kunde',
          sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
        })
      }

      // Timeline
      await supabase.from('timeline').insert({
        fall_id: fallId,
        typ: 'system',
        titel: 'Onboarding-Dokumente hochgeladen',
        beschreibung: `${uploads.length} Dokument(e) via FlowLink hochgeladen.`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Hochladen')
      setUploadingDocs(false)
      return
    }
    setUploadingDocs(false)
    // Redirect to Fallakte
    window.location.href = `/kunde/fall/${fallId}`
  }

  // ─── Done: Redirect after skip ─────────────────────────────────────────────

  function handleSkipDocs() {
    if (fallId) window.location.href = `/kunde/fall/${fallId}`
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 inset-x-0 z-10 h-1.5 bg-gray-100">
        <div className="h-full bg-[#4573A2] transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
      </div>

      {/* Step indicator */}
      <div className="fixed top-4 left-0 right-0 z-10 flex justify-center">
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                i < stepIndex ? 'bg-emerald-500 text-white' :
                i === stepIndex ? 'bg-[#4573A2] text-white' :
                'bg-gray-200 text-gray-400'
              }`}>
                {i < stepIndex ? <CheckIcon className="w-3.5 h-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`w-6 h-0.5 rounded ${i < stepIndex ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-5 pt-16 pb-8 max-w-lg mx-auto w-full">
        <div className="flex-1 flex flex-col justify-center py-4">
          <div className="bg-white border border-gray-200 rounded-3xl px-6 py-7 shadow-xl shadow-black/5">

            {/* ═══ SCHRITT 1: STAMMDATEN + DATENSCHUTZ ═══ */}
            {currentStep.id === 'stammdaten' && (
              <div>
                <StepHeader
                  question={`Hallo ${lead.vorname}!`}
                  sub="Bitte pruefen Sie Ihre Daten. Falls etwas nicht stimmt, kontaktieren Sie uns."
                  icon={<CarIcon className="w-8 h-8 text-[#4573A2]" />}
                />

                <div className="space-y-2 mb-6">
                  <SummaryRow label="Name" value={kundenName} />
                  {lead.telefon && <SummaryRow label="Telefon" value={lead.telefon} />}
                  {lead.email && <SummaryRow label="E-Mail" value={lead.email} />}
                  {(lead.fahrzeug_standort_adresse || lead.fahrzeug_standort_plz) && (
                    <SummaryRow label="Standort" value={[lead.fahrzeug_standort_adresse, lead.fahrzeug_standort_plz].filter(Boolean).join(', ')} />
                  )}
                  {fahrzeug && <SummaryRow label="Fahrzeug" value={`${fahrzeug}${lead.kennzeichen ? ` (${lead.kennzeichen})` : ''}`} />}
                  {lead.schadenfall_typ && <SummaryRow label="Schadentyp" value={SF_LABELS[lead.schadenfall_typ] ?? lead.schadenfall_typ} />}
                  {lead.gegner_name && <SummaryRow label="Unfallgegner" value={`${lead.gegner_name}${lead.gegner_versicherung ? ` — ${lead.gegner_versicherung}` : ''}`} />}
                  {lead.unfallhergang && <SummaryRow label="Unfallhergang" value={lead.unfallhergang} />}
                </div>

                {/* Datenschutz */}
                <div className="border-t border-gray-100 pt-5">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={datenschutz}
                      onChange={e => setDatenschutz(e.target.checked)}
                      className="mt-0.5 w-5 h-5 rounded border-gray-300 accent-[#4573A2] shrink-0"
                    />
                    <span className="text-sm text-gray-600 leading-relaxed">
                      Ich habe die{' '}
                      <a href="/datenschutz" target="_blank" className="text-[#4573A2] underline">Datenschutzerklaerung</a>{' '}
                      gelesen und stimme der Verarbeitung meiner Daten zu. <span className="text-red-400">*</span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* ═══ SCHRITT 2: SA UNTERSCHREIBEN ═══ */}
            {currentStep.id === 'sa' && (
              <div>
                <StepHeader
                  question="Beauftragung unterzeichnen"
                  sub="Mit Ihrer Unterschrift beauftragen Sie Claimondo mit der kostenlosen Abwicklung Ihres Schadens."
                  icon={<PenToolIcon className="w-8 h-8 text-[#4573A2]" />}
                />

                <div className="bg-[#4573A2]/5 border border-[#4573A2]/20 rounded-2xl px-4 py-4 mb-5 text-sm text-gray-700 leading-relaxed">
                  <p className="font-medium text-gray-900 mb-2">Zusammenfassung:</p>
                  <p>Ich beauftrage die Claimondo GmbH mit der Koordination meines KFZ-Schadens.
                  Mir entstehen <strong>keine Kosten</strong>. Die Gutachterkosten werden im Rahmen
                  der Sicherungsabtretung an den Sachverstaendigen abgetreten und von der gegnerischen
                  Versicherung getragen.</p>
                </div>

                <a
                  href="/sa-volltext"
                  target="_blank"
                  className="flex items-center gap-2 text-sm text-[#4573A2] hover:underline mb-5"
                >
                  <FileTextIcon className="w-4 h-4" />
                  Vollstaendige Sicherungsabtretung lesen
                </a>

                {/* Unterschrifts-Canvas */}
                <div className="mb-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Ihre Unterschrift</p>
                  <SignatureCanvas onSignature={setSignatureBlob} />
                </div>

                {/* Checkbox */}
                <label className="flex items-start gap-3 cursor-pointer mb-5">
                  <input
                    type="checkbox"
                    checked={saAccepted}
                    onChange={e => setSaAccepted(e.target.checked)}
                    className="mt-0.5 w-5 h-5 rounded border-gray-300 accent-[#4573A2] shrink-0"
                  />
                  <span className="text-sm text-gray-600 leading-relaxed">
                    Ja, ich moechte den kostenlosen Service nutzen. Alle Kosten traegt die gegnerische Versicherung.
                    Ich stimme den Vertragsbedingungen und der Widerrufsbelehrung zu. <span className="text-red-400">*</span>
                  </span>
                </label>

                {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">{error}</p>}

                <button
                  onClick={handleSignSA}
                  disabled={!signatureBlob || !saAccepted || submittingSA}
                  className="w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base disabled:opacity-20 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                >
                  {submittingSA ? 'Wird verarbeitet ...' : 'SA unterzeichnen'}
                </button>
              </div>
            )}

            {/* ═══ SCHRITT 3: ACCOUNT ERSTELLEN ═══ */}
            {currentStep.id === 'account' && (
              <div>
                <StepHeader
                  question="Kundenportal-Zugang"
                  sub="Erstellen Sie ein Konto, um Ihren Fall online zu verfolgen."
                  icon={<UserPlusIcon className="w-8 h-8 text-[#4573A2]" />}
                />

                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 mb-5 flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-emerald-500 shrink-0" />
                  <p className="text-sm text-emerald-700">Ihr Fall wurde erfolgreich erstellt! Der Gutachter wurde bereits informiert.</p>
                </div>

                {accountCreated ? (
                  <div className="space-y-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 text-center">
                      <p className="text-sm text-gray-500 mb-2">Ihre Zugangsdaten:</p>
                      <p className="text-sm text-gray-700"><strong>E-Mail:</strong> {accountEmail}</p>
                      <p className="text-sm text-gray-700"><strong>Passwort:</strong> {accountPassword}</p>
                      <p className="text-xs text-gray-400 mt-3">Bitte aendern Sie Ihr Passwort nach dem ersten Login.</p>
                    </div>
                    <button
                      onClick={() => setStepIndex(3)}
                      className="w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base active:scale-[0.98] transition-all"
                    >
                      Weiter zu Dokumenten
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">E-Mail</label>
                      <div className="relative">
                        <MailIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="email"
                          value={accountEmail}
                          onChange={e => setAccountEmail(e.target.value)}
                          className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:border-[#4573A2]"
                        />
                      </div>
                    </div>

                    {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

                    <button
                      onClick={handleCreateAccount}
                      disabled={!accountEmail || creatingAccount}
                      className="w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                    >
                      {creatingAccount ? 'Wird erstellt ...' : 'Konto erstellen'}
                    </button>

                    <div className="border-t border-gray-100 pt-4">
                      <button
                        onClick={() => setStepIndex(3)}
                        className="w-full flex items-center justify-center gap-2 py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        <SkipForwardIcon className="w-4 h-4" />
                        Ueberspringen
                      </button>
                      <p className="text-xs text-gray-400 text-center mt-1">
                        Wir informieren Sie per WhatsApp. Ohne Account koennen Sie Ihren Fall nicht online verfolgen.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ SCHRITT 4: ONBOARDING (Dokumente hochladen) ═══ */}
            {currentStep.id === 'onboarding' && (
              <div>
                <StepHeader
                  question="Dokumente hochladen"
                  sub="Laden Sie bitte Ihre Fahrzeugdokumente hoch, damit der Gutachter starten kann."
                />

                <div className="space-y-4 mb-5">
                  <FileUploadField
                    label="Fahrzeugschein"
                    accept="image/*,.pdf"
                    file={fahrzeugschein}
                    onFile={setFahrzeugschein}
                    required
                  />

                  {lead.polizei_vor_ort && (
                    <FileUploadField
                      label="Unfallmitteilung"
                      accept="image/*,.pdf"
                      file={unfallmitteilung}
                      onFile={setUnfallmitteilung}
                      required
                    />
                  )}

                  <FileUploadField
                    label="Fuehrerschein"
                    accept="image/*,.pdf"
                    file={fuehrerschein}
                    onFile={setFuehrerschein}
                  />

                  {/* Schadensfotos */}
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
                      Schadensfotos <span className="text-gray-400 normal-case ml-1">(optional)</span>
                    </label>
                    <MultiPhotoUpload photos={schadensfotos} onChange={setSchadensfotos} />
                  </div>
                </div>

                {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">{error}</p>}

                <button
                  onClick={handleUploadDocs}
                  disabled={!fahrzeugschein || uploadingDocs || (lead.polizei_vor_ort && !unfallmitteilung)}
                  className="w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base disabled:opacity-20 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                >
                  {uploadingDocs ? 'Wird hochgeladen ...' : 'Dokumente senden & zur Fallakte'}
                </button>

                <div className="border-t border-gray-100 mt-4 pt-4">
                  <button
                    onClick={handleSkipDocs}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <SkipForwardIcon className="w-4 h-4" />
                    Ich lade spaeter hoch
                  </button>
                  <p className="text-xs text-gray-400 text-center mt-1">
                    Sie erhalten in 3 Tagen eine Erinnerung.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation — nur Schritt 1 hat Weiter-Button */}
        {currentStep.id === 'stammdaten' && (
          <div className="pt-4">
            <button
              onClick={() => setStepIndex(1)}
              disabled={!datenschutz}
              className="w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base disabled:opacity-20 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            >
              Weiter zur Beauftragung
            </button>
          </div>
        )}

        {/* Zurueck-Button (nur Schritt 1→2) */}
        {stepIndex === 1 && (
          <div className="pt-2">
            <button
              onClick={() => setStepIndex(0)}
              className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Zurueck
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
      <h1 className="text-2xl font-semibold text-gray-900 leading-snug">{question}</h1>
      {sub && <p className="mt-2 text-sm text-gray-500">{sub}</p>}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 break-words">{value}</span>
    </div>
  )
}

function FileUploadField({
  label,
  accept,
  file,
  onFile,
  required,
}: {
  label: string
  accept: string
  file: File | null
  onFile: (f: File | null) => void
  required?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)

  return (
    <div>
      <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {file ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-emerald-200 bg-emerald-50">
          <CheckIcon className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <span className="text-sm text-emerald-700 truncate flex-1">{file.name}</span>
          <button
            onClick={() => { onFile(null); if (ref.current) ref.current.value = '' }}
            className="text-xs text-gray-500 hover:text-gray-700 flex-shrink-0"
          >
            Entfernen
          </button>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 hover:border-gray-300 transition-all active:scale-[0.98]"
        >
          <UploadIcon className="w-5 h-5 text-gray-400" />
          <span className="text-sm text-gray-600">Datei auswaehlen</span>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept={accept}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
        className="hidden"
      />
    </div>
  )
}

function MultiPhotoUpload({ photos, onChange }: { photos: File[]; onChange: (f: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <button
        onClick={() => ref.current?.click()}
        className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 hover:border-gray-300 transition-all active:scale-[0.98]"
      >
        <CameraIcon className="w-5 h-5 text-gray-400" />
        <span className="text-sm text-gray-600">Fotos aufnehmen oder hochladen</span>
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={(e) => { if (e.target.files) onChange([...photos, ...Array.from(e.target.files).filter(f => f.type.startsWith('image/'))]) }}
        className="hidden"
      />
      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {photos.map((f, i) => (
            <div key={i} className="relative group aspect-square">
              <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover rounded-xl" />
              <button
                onClick={() => onChange(photos.filter((_, idx) => idx !== i))}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 text-gray-700 shadow-sm flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
              >
                <Trash2Icon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Signature Canvas (using signature_pad library) ──────────────────────────

function SignatureCanvas({ onSignature }: { onSignature: (blob: Blob | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<any>(null)
  const [isEmpty, setIsEmpty] = useState(true)

  useEffect(() => {
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
      <div className="relative border-2 border-gray-200 rounded-2xl overflow-hidden bg-white">
        <canvas ref={canvasRef} className="w-full h-44 touch-none" />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-300 text-sm">Hier unterschreiben</p>
          </div>
        )}
      </div>
      {!isEmpty && (
        <button onClick={clearSignature} className="mt-2 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <Trash2Icon className="w-3 h-3" /> Unterschrift loeschen
        </button>
      )}
    </div>
  )
}
