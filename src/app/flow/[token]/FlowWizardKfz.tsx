'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import Script from 'next/script'
import { createClient } from '@/lib/supabase/client'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import {
  CheckIcon,
  CameraIcon,
  UploadIcon,
  FileTextIcon,
  CarIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  CalendarIcon,
  DownloadIcon,
  ExternalLinkIcon,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeadData = {
  vorname: string
  nachname: string
  email: string
  telefon: string
  schadenfall_typ: string   // SF-01..SF-04
  kunden_konstellation: string // KK-01..KK-05
  personenschaden_flag: boolean
  mietwagen_flag: boolean
  polizeibericht_pflicht: boolean
  gutachter_termin: string | null
  kennzeichen: string
  fahrzeug_hersteller: string
  fahrzeug_modell: string
}

type UploadedFile = {
  file: File
  category: string
}

type FlowState = {
  // Seite 2: Basis-Dokumente
  fahrzeugschein: File | null
  fuehrerschein: File | null
  schadensfotos: File[]
  // Seite 3: Schadenfall-Spezifisch
  gegner_name: string
  gegner_versicherung: string
  gegner_kennzeichen: string
  eigene_versicherung: string
  eigene_versicherungsnr: string
  polizeibericht: File | null
  unfall_ort: string
  unfall_lat: number | null
  unfall_lng: number | null
  unfall_place_id: string
  unfall_zeit: string
  // Seite 4: Konstellations-Spezifisch
  leasingvertrag: File | null
  finanzierungsvertrag: File | null
  gewerbenachweis: File | null
  gf_vollmacht: File | null
  ust_id: string
  halter_ausweis: File | null
  // Seite 5: Zusatz-Infos
  aerztliches_attest: File | null
  hat_mietwagen: boolean | null
  mietwagenvertrag: File | null
}

const INITIAL_STATE: FlowState = {
  fahrzeugschein: null,
  fuehrerschein: null,
  schadensfotos: [],
  gegner_name: '',
  gegner_versicherung: '',
  gegner_kennzeichen: '',
  eigene_versicherung: '',
  eigene_versicherungsnr: '',
  polizeibericht: null,
  unfall_ort: '',
  unfall_lat: null,
  unfall_lng: null,
  unfall_place_id: '',
  unfall_zeit: '',
  leasingvertrag: null,
  finanzierungsvertrag: null,
  gewerbenachweis: null,
  gf_vollmacht: null,
  ust_id: '',
  halter_ausweis: null,
  aerztliches_attest: null,
  hat_mietwagen: null,
  mietwagenvertrag: null,
}

// ─── Step definitions ─────────────────────────────────────────────────────────

type StepId = 'willkommen' | 'basis' | 'schadenfall' | 'konstellation' | 'zusatz' | 'zusammenfassung'

function getActiveSteps(lead: LeadData): StepId[] {
  const steps: StepId[] = ['willkommen', 'basis', 'schadenfall']

  if (lead.kunden_konstellation !== 'KK-01') {
    steps.push('konstellation')
  }

  if (lead.personenschaden_flag || lead.mietwagen_flag) {
    steps.push('zusatz')
  }

  steps.push('zusammenfassung')
  return steps
}

// ─── Checklist helper ─────────────────────────────────────────────────────────

function getChecklist(lead: LeadData): string[] {
  const items: string[] = [
    'Fahrzeugschein',
    'Fuehrerschein',
    'Schadensfotos (mind. 4 Perspektiven)',
  ]

  const typ = lead.schadenfall_typ
  if (typ === 'SF-01' || typ === 'SF-02') {
    items.push('Daten des Unfallgegners')
  }
  if (typ === 'SF-02') {
    items.push('Eigene Versicherungsdaten')
  }
  if (typ === 'SF-03') {
    items.push('Polizeibericht')
  }
  if (typ === 'SF-04') {
    items.push('Eigene Versicherungspolice')
  }
  if (lead.polizeibericht_pflicht && typ !== 'SF-03') {
    items.push('Polizeibericht')
  }

  const kk = lead.kunden_konstellation
  if (kk === 'KK-02') items.push('Leasingvertrag')
  if (kk === 'KK-03') items.push('Finanzierungsvertrag')
  if (kk === 'KK-04') items.push('Gewerbenachweis', 'GF-Vollmacht')
  if (kk === 'KK-05') items.push('Ausweiskopie Halter')

  if (lead.personenschaden_flag) items.push('Aerztliches Attest (falls vorhanden)')
  if (lead.mietwagen_flag) items.push('Mietwagenvertrag (falls vorhanden)')

  return items
}

// ─── Pflichtdokumente mapping ─────────────────────────────────────────────────

function getPflichtdokumente(lead: LeadData): { typ: string; pflicht: boolean }[] {
  const docs: { typ: string; pflicht: boolean }[] = [
    { typ: 'fahrzeugschein', pflicht: true },
    { typ: 'fuehrerschein', pflicht: true },
    { typ: 'schadensfotos', pflicht: true },
  ]

  const sf = lead.schadenfall_typ
  if (sf === 'SF-01' || sf === 'SF-02') {
    docs.push({ typ: 'gegner-daten', pflicht: true })
  }
  if (sf === 'SF-02') {
    docs.push({ typ: 'eigene-versicherung', pflicht: true })
  }
  if (sf === 'SF-03') {
    docs.push({ typ: 'polizeibericht', pflicht: true })
  }
  if (sf === 'SF-04') {
    docs.push({ typ: 'eigene-versicherungspolice', pflicht: true })
  }
  if (lead.polizeibericht_pflicht && sf !== 'SF-03') {
    docs.push({ typ: 'polizeibericht', pflicht: true })
  }

  const kk = lead.kunden_konstellation
  if (kk === 'KK-02') {
    docs.push({ typ: 'leasingvertrag', pflicht: true })
  }
  if (kk === 'KK-03') {
    docs.push({ typ: 'finanzierungsvertrag', pflicht: true })
  }
  if (kk === 'KK-04') {
    docs.push({ typ: 'gewerbenachweis', pflicht: true })
    docs.push({ typ: 'gf-vollmacht', pflicht: true })
  }
  if (kk === 'KK-05') {
    docs.push({ typ: 'halter-ausweis', pflicht: true })
  }

  if (lead.personenschaden_flag) {
    docs.push({ typ: 'aerztliches-attest', pflicht: false })
  }
  if (lead.mietwagen_flag) {
    docs.push({ typ: 'mietwagenvertrag', pflicht: false })
  }

  return docs
}

// ─── Validation ───────────────────────────────────────────────────────────────

function canProceed(stepId: StepId, state: FlowState, lead: LeadData): boolean {
  switch (stepId) {
    case 'willkommen':
      return true
    case 'basis':
      return !!(state.fahrzeugschein && state.fuehrerschein && state.schadensfotos.length >= 4)
    case 'schadenfall': {
      const sf = lead.schadenfall_typ
      if (sf === 'SF-01') return !!(state.gegner_name && state.gegner_versicherung && state.gegner_kennzeichen)
      if (sf === 'SF-02') return !!(state.gegner_name && state.gegner_versicherung && state.gegner_kennzeichen && state.eigene_versicherung)
      if (sf === 'SF-03') return !!(state.polizeibericht && state.unfall_ort && state.unfall_zeit)
      if (sf === 'SF-04') return !!(state.schadensfotos.length >= 4)
      if (lead.polizeibericht_pflicht) return !!state.polizeibericht
      return true
    }
    case 'konstellation': {
      const kk = lead.kunden_konstellation
      if (kk === 'KK-02') return !!state.leasingvertrag
      if (kk === 'KK-03') return !!state.finanzierungsvertrag
      if (kk === 'KK-04') return !!(state.gewerbenachweis && state.gf_vollmacht && state.ust_id)
      if (kk === 'KK-05') return !!state.halter_ausweis
      return true
    }
    case 'zusatz':
      return true
    case 'zusammenfassung':
      return true
    default:
      return true
  }
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export default function FlowWizardKfz({ token, lead }: { token: string; lead: LeadData }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [state, setState] = useState<FlowState>(INITIAL_STATE)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [portalUrl, setPortalUrl] = useState<string | null>(null)

  const activeSteps = useMemo(() => getActiveSteps(lead), [lead])
  const currentStep = activeSteps[stepIndex]
  const totalSteps = activeSteps.length
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100)

  function set<K extends keyof FlowState>(key: K, value: FlowState[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  // ─── Upload helper ────────────────────────────────────────────────────────

  async function uploadFile(
    supabase: ReturnType<typeof createClient>,
    file: File,
    fallId: string,
    category: string,
  ): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `flow/${token}/${fallId}/${category}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from('dokumente')
      .upload(path, file, { contentType: file.type })
    if (uploadErr) throw new Error(uploadErr.message)
    const { data: { publicUrl } } = supabase.storage.from('dokumente').getPublicUrl(path)
    return publicUrl
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const supabase = createClient()

    try {
      // 1. Fall anlegen
      const { data: fall, error: fallErr } = await supabase
        .from('faelle')
        .insert({
          lead_id: token,
          schadens_ursache: `kfz-${lead.schadenfall_typ.toLowerCase()}`,
          status: 'ersterfassung',
          notizen: [
            `Schadenfall-Typ: ${lead.schadenfall_typ}`,
            `Konstellation: ${lead.kunden_konstellation}`,
            lead.personenschaden_flag ? 'Personenschaden: Ja' : null,
            lead.mietwagen_flag ? 'Mietwagen: Ja' : null,
            state.gegner_name ? `Gegner: ${state.gegner_name}` : null,
            state.gegner_versicherung ? `Gegner-Vers.: ${state.gegner_versicherung}` : null,
            state.gegner_kennzeichen ? `Gegner-Kz.: ${state.gegner_kennzeichen}` : null,
            state.eigene_versicherung ? `Eigene Vers.: ${state.eigene_versicherung}` : null,
            state.unfall_ort ? `Unfallort: ${state.unfall_ort}` : null,
            state.unfall_lat != null && state.unfall_lng != null ? `Koordinaten: ${state.unfall_lat}, ${state.unfall_lng}` : null,
            state.unfall_zeit ? `Unfallzeit: ${state.unfall_zeit}` : null,
            state.ust_id ? `USt-IdNr: ${state.ust_id}` : null,
          ].filter(Boolean).join('\n'),
        })
        .select('id')
        .single()
      if (fallErr) throw new Error(fallErr.message)

      // 2. Upload all files + create dokumente entries
      const uploads: { file: File; category: string }[] = []
      if (state.fahrzeugschein) uploads.push({ file: state.fahrzeugschein, category: 'fahrzeugschein' })
      if (state.fuehrerschein) uploads.push({ file: state.fuehrerschein, category: 'fuehrerschein' })
      for (const foto of state.schadensfotos) {
        uploads.push({ file: foto, category: 'schadensfoto' })
      }
      if (state.polizeibericht) uploads.push({ file: state.polizeibericht, category: 'polizeibericht' })
      if (state.leasingvertrag) uploads.push({ file: state.leasingvertrag, category: 'leasingvertrag' })
      if (state.finanzierungsvertrag) uploads.push({ file: state.finanzierungsvertrag, category: 'finanzierungsvertrag' })
      if (state.gewerbenachweis) uploads.push({ file: state.gewerbenachweis, category: 'gewerbenachweis' })
      if (state.gf_vollmacht) uploads.push({ file: state.gf_vollmacht, category: 'gf-vollmacht' })
      if (state.halter_ausweis) uploads.push({ file: state.halter_ausweis, category: 'halter-ausweis' })
      if (state.aerztliches_attest) uploads.push({ file: state.aerztliches_attest, category: 'aerztliches-attest' })
      if (state.mietwagenvertrag) uploads.push({ file: state.mietwagenvertrag, category: 'mietwagenvertrag' })

      const uploadedCategories = new Set<string>()

      // Map flow categories to dokumente kategorie + sichtbar_fuer
      const kategorieMap: Record<string, string> = {
        fahrzeugschein: 'kundendokument',
        fuehrerschein: 'kundendokument',
        schadensfoto: 'schadensfoto',
        polizeibericht: 'kundendokument',
        leasingvertrag: 'kundendokument',
        finanzierungsvertrag: 'kundendokument',
        gewerbenachweis: 'kundendokument',
        'gf-vollmacht': 'unterschrift',
        'halter-ausweis': 'kundendokument',
        'aerztliches-attest': 'kundendokument',
        mietwagenvertrag: 'kundendokument',
      }
      const sichtbarMap: Record<string, string[]> = {
        kundendokument: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
        schadensfoto: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
        unterschrift: ['admin', 'kundenbetreuer', 'kanzlei'],
      }

      for (const { file, category } of uploads) {
        const url = await uploadFile(supabase, file, fall.id, category)
        uploadedCategories.add(category)

        const kat = kategorieMap[category] ?? 'sonstiges'
        await supabase.from('dokumente').insert({
          fall_id: fall.id,
          typ: category,
          datei_url: url,
          datei_name: file.name,
          datei_groesse: file.size,
          kategorie: kat,
          quelle: 'flowlink',
          hochgeladen_von_rolle: 'kunde',
          sichtbar_fuer: sichtbarMap[kat] ?? ['admin', 'kundenbetreuer'],
        })
      }

      // 3. Pflichtdokumente erstellen
      const pflichtdoks = getPflichtdokumente(lead)
      const pflichtInserts = pflichtdoks.map((d) => {
        const isUploaded = uploadedCategories.has(d.typ) ||
          (d.typ === 'schadensfotos' && state.schadensfotos.length >= 4) ||
          (d.typ === 'gegner-daten' && state.gegner_name) ||
          (d.typ === 'eigene-versicherung' && state.eigene_versicherung)

        return {
          fall_id: fall.id,
          dokument_typ: d.typ,
          status: isUploaded ? 'hochgeladen' : 'ausstehend',
          pflicht: d.pflicht,
          quelle: 'flowlink',
        }
      })

      if (pflichtInserts.length > 0) {
        const { error: pflichtErr } = await supabase
          .from('pflichtdokumente')
          .insert(pflichtInserts)
        if (pflichtErr) throw new Error(pflichtErr.message)
      }

      // 4. Lead-Status + Qualifizierungs-Phase updaten
      await supabase
        .from('leads')
        .update({
          status: 'umgewandelt',
          qualifizierungs_phase: 'abgeschlossen',
          updated_at: new Date().toISOString(),
        })
        .eq('id', token)

      // 5. Kundenbetreuer zuweisen (Load Balancing: wer hat am wenigsten aktive Faelle)
      const { data: betreuer } = await supabase
        .from('profiles')
        .select('id')
        .in('rolle', ['kundenbetreuer', 'admin'])
        .limit(10)

      if (betreuer && betreuer.length > 0) {
        // Count active cases per betreuer
        const counts: Record<string, number> = {}
        for (const b of betreuer) {
          const { count } = await supabase
            .from('faelle')
            .select('id', { count: 'exact', head: true })
            .eq('kundenbetreuer_id', b.id)
            .not('status', 'in', '("abgeschlossen","storniert")')
          counts[b.id] = count ?? 0
        }
        const minBetreuer = betreuer.reduce((min, b) =>
          (counts[b.id] ?? 0) < (counts[min.id] ?? 0) ? b : min
        , betreuer[0])

        await supabase
          .from('faelle')
          .update({ kundenbetreuer_id: minBetreuer.id })
          .eq('id', fall.id)
      }

      // 6. Kunden-Account erstellen (wenn E-Mail vorhanden)
      if (lead.email) {
        try {
          const { createKundeAccount } = await import('./actions')
          await createKundeAccount(
            fall.id,
            lead.email,
            lead.vorname ?? '',
            lead.nachname ?? '',
            lead.telefon ?? null,
          )
        } catch {
          // Non-critical: account creation may fail if user already exists
        }
      }

      // 7. Benachrichtigung + Timeline
      try {
        const { notifyNeuerFall } = await import('./actions')
        await notifyNeuerFall(fall.id)
      } catch { /* */ }

      // Timeline-Eintrag
      await supabase.from('timeline').insert({
        fall_id: fall.id,
        typ: 'system',
        titel: 'FlowLink abgeschlossen - Lead konvertiert',
        beschreibung: `Kunde hat alle Dokumente hochgeladen. Fall automatisch erstellt.`,
      })

      setPortalUrl(`/portal/${token}`)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Done screen ──────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-5">
        <div className="max-w-lg w-full bg-white border border-gray-200 rounded-3xl px-6 py-10 shadow-xl shadow-black/20 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500 flex items-center justify-center mx-auto mb-6">
            <CheckIcon className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-3">Vielen Dank!</h1>
          <p className="text-gray-500 text-sm mb-8">
            Ihre Unterlagen wurden erfolgreich uebermittelt. Falls noch Dokumente fehlen, koennen Sie diese ueber Ihr Kundenportal nachreichen.
          </p>
          {portalUrl && (
            <a
              href={portalUrl}
              className="inline-flex items-center gap-2 w-full justify-center min-h-14 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-base active:scale-[0.98] transition-all"
            >
              <ExternalLinkIcon className="w-5 h-5" />
              Zum Kundenportal
            </a>
          )}
        </div>
      </div>
    )
  }

  // ─── Shell ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 inset-x-0 z-10 h-1.5 bg-gray-100">
        <div
          className="h-full bg-blue-500 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step counter */}
      <div className="fixed top-4 right-4 z-10 text-xs text-gray-500 tabular-nums">
        {stepIndex + 1}&thinsp;/&thinsp;{totalSteps}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-5 pt-10 pb-8 max-w-lg mx-auto w-full">
        <div className="flex-1 flex flex-col justify-center py-4">
          <div className="bg-white border border-gray-200 rounded-3xl px-6 py-7 shadow-xl shadow-black/20">
            {currentStep === 'willkommen' && (
              <PageWillkommen lead={lead} />
            )}
            {currentStep === 'basis' && (
              <PageBasis state={state} setState={set} />
            )}
            {currentStep === 'schadenfall' && (
              <PageSchadenfall lead={lead} state={state} setState={set} />
            )}
            {currentStep === 'konstellation' && (
              <PageKonstellation lead={lead} state={state} setState={set} />
            )}
            {currentStep === 'zusatz' && (
              <PageZusatz lead={lead} state={state} setState={set} />
            )}
            {currentStep === 'zusammenfassung' && (
              <PageZusammenfassung lead={lead} state={state} />
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="space-y-3 pt-4">
          {error && (
            <p className="text-sm text-red-400 text-center rounded-2xl bg-red-500/10 border border-red-900/50 px-4 py-3">
              {error}
            </p>
          )}
          {currentStep === 'zusammenfassung' ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full min-h-14 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            >
              {submitting ? 'Wird gesendet ...' : 'Absenden'}
            </button>
          ) : (
            <button
              onClick={() => setStepIndex((s) => s + 1)}
              disabled={!canProceed(currentStep, state, lead)}
              className="w-full min-h-14 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-base disabled:opacity-20 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            >
              Weiter
            </button>
          )}
          {stepIndex > 0 && (
            <button
              onClick={() => setStepIndex((s) => s - 1)}
              className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Zurueck
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function StepHeader({ question, sub, icon }: { question: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="mb-7">
      {icon && <div className="mb-3">{icon}</div>}
      <h1 className="text-2xl font-semibold text-gray-900 leading-snug">{question}</h1>
      {sub && <p className="mt-2 text-sm text-gray-500">{sub}</p>}
    </div>
  )
}

function FileUploadField({
  label,
  accept,
  file,
  onFile,
  required,
  capture,
}: {
  label: string
  accept: string
  file: File | null
  onFile: (f: File | null) => void
  required?: boolean
  capture?: 'environment' | 'user'
}) {
  const ref = useRef<HTMLInputElement>(null)

  return (
    <div>
      <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {file ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-green-800/50 bg-green-500/5">
          <CheckIcon className="w-5 h-5 text-green-400 flex-shrink-0" />
          <span className="text-sm text-green-300 truncate flex-1">{file.name}</span>
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
          className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-100/50 hover:border-gray-300 transition-all active:scale-[0.98]"
        >
          <UploadIcon className="w-5 h-5 text-gray-500" />
          <span className="text-sm text-gray-700">Datei auswaehlen</span>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={capture}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
        className="hidden"
      />
    </div>
  )
}

function InfoBox({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'info' | 'warning' }) {
  const colors = variant === 'warning'
    ? 'border-amber-800/50 bg-amber-500/5 text-amber-300'
    : 'border-blue-800/50 bg-blue-500/5 text-blue-300'
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl border text-sm ${colors}`}>
      {variant === 'warning'
        ? <AlertTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
        : <ShieldCheckIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      }
      <div>{children}</div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 rounded-xl bg-gray-100/50 border border-gray-300/50">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 break-words">{value}</span>
    </div>
  )
}

const inputCls =
  'w-full px-5 py-4 rounded-2xl border border-gray-300 bg-gray-100 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 transition-colors'

// ─── SEITE 1: Willkommen ──────────────────────────────────────────────────────

function PageWillkommen({ lead }: { lead: LeadData }) {
  const checklist = getChecklist(lead)
  const termin = lead.gutachter_termin
    ? new Date(lead.gutachter_termin).toLocaleDateString('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const fahrzeug = [lead.fahrzeug_hersteller, lead.fahrzeug_modell].filter(Boolean).join(' ')

  return (
    <div>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`}
        strategy="lazyOnload"
      />
      <StepHeader
        question={`Hallo ${lead.vorname}!`}
        sub="Wir benoetigen einige Unterlagen, um Ihren Schadensfall schnellstmoeglich zu bearbeiten."
        icon={<CarIcon className="w-8 h-8 text-blue-400" />}
      />

      {(fahrzeug || lead.kennzeichen) && (
        <div className="mb-5 px-4 py-3 rounded-2xl border border-gray-300/50 bg-gray-100/30">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Ihr Fahrzeug</p>
          {fahrzeug && <p className="text-sm text-gray-800">{fahrzeug}</p>}
          {lead.kennzeichen && <p className="text-sm text-gray-500">{lead.kennzeichen}</p>}
        </div>
      )}

      {termin && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-2xl border border-blue-800/50 bg-blue-500/5">
          <CalendarIcon className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <div>
            <p className="text-xs text-blue-400">Gutachtertermin</p>
            <p className="text-sm text-blue-200">{termin}</p>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Das wird benoetigt:</p>
        {checklist.map((item, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl">
            <div className="w-5 h-5 rounded border border-gray-300 flex items-center justify-center flex-shrink-0">
              <FileTextIcon className="w-3 h-3 text-gray-500" />
            </div>
            <span className="text-sm text-gray-700">{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── SEITE 2: Basis-Dokumente ─────────────────────────────────────────────────

function PageBasis({
  state,
  setState,
}: {
  state: FlowState
  setState: <K extends keyof FlowState>(key: K, value: FlowState[K]) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const addPhotos = useCallback((files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'))
    setState('schadensfotos', [...state.schadensfotos, ...imgs])
  }, [state.schadensfotos, setState])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addPhotos(e.dataTransfer.files)
  }, [addPhotos])

  return (
    <div>
      <StepHeader
        question="Basis-Dokumente"
        sub="Bitte laden Sie Fahrzeugschein, Fuehrerschein und Schadensfotos hoch."
      />

      <div className="space-y-5">
        <FileUploadField
          label="Fahrzeugschein"
          accept="image/*,.pdf"
          file={state.fahrzeugschein}
          onFile={(f) => setState('fahrzeugschein', f)}
          required
        />

        <FileUploadField
          label="Fuehrerschein"
          accept="image/*,.pdf"
          file={state.fuehrerschein}
          onFile={(f) => setState('fuehrerschein', f)}
          required
        />

        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
            Schadensfotos <span className="text-red-400">*</span>
            <span className="text-gray-400 normal-case ml-1">(min. 4 Perspektiven)</span>
          </label>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 px-6 py-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
              dragOver
                ? 'border-blue-500 bg-blue-500/5'
                : 'border-gray-300 bg-gray-100/50 hover:border-gray-300'
            }`}
          >
            <CameraIcon className="w-8 h-8 text-gray-500" />
            <div className="text-center">
              <p className="text-sm text-gray-700">Fotos aufnehmen oder hochladen</p>
              <p className="text-xs text-gray-500 mt-1">Vorne, hinten, links, rechts + Detailaufnahmen</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={(e) => e.target.files && addPhotos(e.target.files)}
              className="hidden"
            />
          </div>

          {state.schadensfotos.length > 0 && (
            <div className="mt-3">
              <p className={`text-xs mb-2 ${state.schadensfotos.length >= 4 ? 'text-green-400' : 'text-amber-400'}`}>
                {state.schadensfotos.length} / 4 Fotos {state.schadensfotos.length >= 4 ? <CheckIcon className="inline w-3 h-3" /> : ''}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {state.schadensfotos.map((f, i) => (
                  <div key={i} className="relative group aspect-square">
                    <img
                      src={URL.createObjectURL(f)}
                      alt=""
                      className="w-full h-full object-cover rounded-xl"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setState('schadensfotos', state.schadensfotos.filter((_, idx) => idx !== i))
                      }}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 text-gray-700 shadow-sm flex items-center justify-center text-xs leading-none opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── SEITE 3: Schadenfall-Spezifisch ──────────────────────────────────────────

function PageSchadenfall({
  lead,
  state,
  setState,
}: {
  lead: LeadData
  state: FlowState
  setState: <K extends keyof FlowState>(key: K, value: FlowState[K]) => void
}) {
  const sf = lead.schadenfall_typ

  return (
    <div>
      <StepHeader
        question="Angaben zum Schadenfall"
        sub={
          sf === 'SF-01' ? 'Unfall mit Gegner — bitte geben Sie die Daten des Unfallgegners an.' :
          sf === 'SF-02' ? 'Teilschuld-Unfall — bitte geben Sie die Daten beider Parteien an.' :
          sf === 'SF-03' ? 'Unfallflucht / Vandalismus — wir benoetigen den Polizeibericht.' :
          sf === 'SF-04' ? 'Selbstverschuldeter Unfall — bitte laden Sie Ihre Versicherungspolice hoch.' :
          'Bitte vervollstaendigen Sie die Angaben.'
        }
      />

      <div className="space-y-4">
        {/* SF-01 / SF-02: Gegner-Daten */}
        {(sf === 'SF-01' || sf === 'SF-02') && (
          <>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Unfallgegner</p>
              <div className="space-y-3">
                <input
                  value={state.gegner_name}
                  onChange={(e) => setState('gegner_name', e.target.value)}
                  placeholder="Name des Unfallgegners"
                  className={inputCls}
                />
                <input
                  value={state.gegner_versicherung}
                  onChange={(e) => setState('gegner_versicherung', e.target.value)}
                  placeholder="Versicherung des Gegners"
                  className={inputCls}
                />
                <input
                  value={state.gegner_kennzeichen}
                  onChange={(e) => setState('gegner_kennzeichen', e.target.value)}
                  placeholder="Kennzeichen des Gegners"
                  className={inputCls}
                />
              </div>
            </div>
          </>
        )}

        {/* SF-02: Zusaetzlich eigene Versicherung */}
        {sf === 'SF-02' && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Ihre Versicherung</p>
            <div className="space-y-3">
              <input
                value={state.eigene_versicherung}
                onChange={(e) => setState('eigene_versicherung', e.target.value)}
                placeholder="Ihre KFZ-Versicherung"
                className={inputCls}
              />
              <input
                value={state.eigene_versicherungsnr}
                onChange={(e) => setState('eigene_versicherungsnr', e.target.value)}
                placeholder="Versicherungsnummer (optional)"
                className={inputCls}
              />
            </div>
          </div>
        )}

        {/* SF-03: Polizeibericht + Ort/Zeit */}
        {sf === 'SF-03' && (
          <>
            <FileUploadField
              label="Polizeibericht"
              accept="image/*,.pdf"
              file={state.polizeibericht}
              onFile={(f) => setState('polizeibericht', f)}
              required
            />
            <div className="space-y-3">
              <GooglePlaceAutocomplete
                defaultValue={state.unfall_ort}
                placeholder="Unfallort / Tatort"
                className={inputCls}
                onSelect={(place: PlaceResult) => {
                  setState('unfall_ort', place.adresse)
                  setState('unfall_lat', place.lat)
                  setState('unfall_lng', place.lng)
                  setState('unfall_place_id', place.place_id)
                }}
              />
              <input
                type="datetime-local"
                value={state.unfall_zeit}
                onChange={(e) => setState('unfall_zeit', e.target.value)}
                className={`${inputCls} [color-scheme:dark]`}
              />
            </div>
          </>
        )}

        {/* SF-04: Eigene Police */}
        {sf === 'SF-04' && (
          <>
            <InfoBox>
              Bei einem selbstverschuldeten Unfall benoetigen wir Ihre Versicherungspolice, um den Anspruch zu pruefen.
            </InfoBox>
            <FileUploadField
              label="Versicherungspolice"
              accept="image/*,.pdf"
              file={state.polizeibericht} // Reuse field for SF-04 police doc
              onFile={(f) => setState('polizeibericht', f)}
              required
            />
          </>
        )}

        {/* Polizeibericht-Pflicht (wenn nicht schon durch SF-03 abgedeckt) */}
        {lead.polizeibericht_pflicht && sf !== 'SF-03' && (
          <FileUploadField
            label="Polizeibericht"
            accept="image/*,.pdf"
            file={state.polizeibericht}
            onFile={(f) => setState('polizeibericht', f)}
            required
          />
        )}
      </div>
    </div>
  )
}

// ─── SEITE 4: Konstellations-Spezifisch ───────────────────────────────────────

function PageKonstellation({
  lead,
  state,
  setState,
}: {
  lead: LeadData
  state: FlowState
  setState: <K extends keyof FlowState>(key: K, value: FlowState[K]) => void
}) {
  const kk = lead.kunden_konstellation

  return (
    <div>
      <StepHeader
        question={
          kk === 'KK-02' ? 'Leasing-Fahrzeug' :
          kk === 'KK-03' ? 'Finanziertes Fahrzeug' :
          kk === 'KK-04' ? 'Firmenfahrzeug' :
          kk === 'KK-05' ? 'Halter / Fahrer' :
          'Zusaetzliche Angaben'
        }
        sub={
          kk === 'KK-02' ? 'Bitte laden Sie Ihren Leasingvertrag hoch.' :
          kk === 'KK-03' ? 'Bitte laden Sie Ihren Finanzierungsvertrag hoch.' :
          kk === 'KK-04' ? 'Wir benoetigen einige Firmendokumente.' :
          kk === 'KK-05' ? 'Fahrzeughalter und Fahrer sind unterschiedliche Personen.' :
          ''
        }
      />

      <div className="space-y-4">
        {/* KK-02: Leasing */}
        {kk === 'KK-02' && (
          <>
            <FileUploadField
              label="Leasingvertrag"
              accept="image/*,.pdf"
              file={state.leasingvertrag}
              onFile={(f) => setState('leasingvertrag', f)}
              required
            />
            <InfoBox variant="warning">
              Bitte informieren Sie Ihren Leasinggeber ueber den Schadensfall.
            </InfoBox>
          </>
        )}

        {/* KK-03: Finanzierung */}
        {kk === 'KK-03' && (
          <FileUploadField
            label="Finanzierungsvertrag"
            accept="image/*,.pdf"
            file={state.finanzierungsvertrag}
            onFile={(f) => setState('finanzierungsvertrag', f)}
            required
          />
        )}

        {/* KK-04: Firma */}
        {kk === 'KK-04' && (
          <>
            <FileUploadField
              label="Gewerbenachweis"
              accept="image/*,.pdf"
              file={state.gewerbenachweis}
              onFile={(f) => setState('gewerbenachweis', f)}
              required
            />
            <FileUploadField
              label="GF-Vollmacht"
              accept="image/*,.pdf"
              file={state.gf_vollmacht}
              onFile={(f) => setState('gf_vollmacht', f)}
              required
            />
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
                USt-IdNr <span className="text-red-400">*</span>
              </label>
              <input
                value={state.ust_id}
                onChange={(e) => setState('ust_id', e.target.value)}
                placeholder="DE123456789"
                className={inputCls}
              />
            </div>
          </>
        )}

        {/* KK-05: Halter != Fahrer */}
        {kk === 'KK-05' && (
          <>
            <FileUploadField
              label="Ausweiskopie Halter"
              accept="image/*,.pdf"
              file={state.halter_ausweis}
              onFile={(f) => setState('halter_ausweis', f)}
              required
            />
            <InfoBox>
              Wir benoetigen eine Kopie des Ausweises des Fahrzeughalters, da Halter und Fahrer nicht identisch sind.
            </InfoBox>
          </>
        )}
      </div>
    </div>
  )
}

// ─── SEITE 5: Zusatz-Infos ───────────────────────────────────────────────────

function PageZusatz({
  lead,
  state,
  setState,
}: {
  lead: LeadData
  state: FlowState
  setState: <K extends keyof FlowState>(key: K, value: FlowState[K]) => void
}) {
  return (
    <div>
      <StepHeader
        question="Zusaetzliche Informationen"
        sub="Basierend auf Ihren Angaben benoetigen wir noch einige Details."
      />

      <div className="space-y-5">
        {/* Personenschaden */}
        {lead.personenschaden_flag && (
          <div className="space-y-4">
            <div className="px-4 py-3 rounded-2xl border border-red-800/50 bg-red-500/5">
              <p className="text-sm text-red-300 font-medium mb-1">Personenschaden</p>
              <p className="text-xs text-red-400/70">
                Bitte dokumentieren Sie Ihre Verletzungen. Falls vorhanden, laden Sie ein aerztliches Attest hoch.
                Ein Anwalt wird sich bei Ihnen melden.
              </p>
            </div>

            <FileUploadField
              label="Aerztliches Attest (falls vorhanden)"
              accept="image/*,.pdf"
              file={state.aerztliches_attest}
              onFile={(f) => setState('aerztliches_attest', f)}
            />

            <a
              href="/downloads/schmerzenstagebuch.pdf"
              target="_blank"
              className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-gray-300 bg-gray-100/50 hover:border-gray-300 transition-all active:scale-[0.98]"
            >
              <DownloadIcon className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-sm text-gray-800">Schmerzenstagebuch-Vorlage</p>
                <p className="text-xs text-gray-500">PDF herunterladen</p>
              </div>
            </a>
          </div>
        )}

        {/* Mietwagen */}
        {lead.mietwagen_flag && (
          <div className="space-y-4">
            <InfoBox>
              Sie haben Anspruch auf einen Mietwagen. Wir koennen dies fuer Sie organisieren.
            </InfoBox>

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Haben Sie bereits einen Mietwagen?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setState('hat_mietwagen', true)}
                  className={`px-5 py-4 rounded-2xl border text-sm font-medium transition-all active:scale-[0.98] ${
                    state.hat_mietwagen === true
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400 font-semibold'
                      : 'border-gray-300 bg-gray-100/50 text-gray-800 hover:border-gray-300'
                  }`}
                >
                  Ja
                </button>
                <button
                  onClick={() => { setState('hat_mietwagen', false); setState('mietwagenvertrag', null) }}
                  className={`px-5 py-4 rounded-2xl border text-sm font-medium transition-all active:scale-[0.98] ${
                    state.hat_mietwagen === false
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400 font-semibold'
                      : 'border-gray-300 bg-gray-100/50 text-gray-800 hover:border-gray-300'
                  }`}
                >
                  Nein
                </button>
              </div>
            </div>

            {state.hat_mietwagen === true && (
              <FileUploadField
                label="Mietwagenvertrag"
                accept="image/*,.pdf"
                file={state.mietwagenvertrag}
                onFile={(f) => setState('mietwagenvertrag', f)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── SEITE 6: Zusammenfassung ─────────────────────────────────────────────────

function PageZusammenfassung({ lead, state }: { lead: LeadData; state: FlowState }) {
  const pflichtdoks = getPflichtdokumente(lead)

  // Determine which are uploaded
  const uploadStatus: { typ: string; uploaded: boolean; pflicht: boolean }[] = pflichtdoks.map((d) => {
    let uploaded = false
    switch (d.typ) {
      case 'fahrzeugschein': uploaded = !!state.fahrzeugschein; break
      case 'fuehrerschein': uploaded = !!state.fuehrerschein; break
      case 'schadensfotos': uploaded = state.schadensfotos.length >= 4; break
      case 'gegner-daten': uploaded = !!(state.gegner_name && state.gegner_versicherung); break
      case 'eigene-versicherung': uploaded = !!state.eigene_versicherung; break
      case 'polizeibericht': uploaded = !!state.polizeibericht; break
      case 'eigene-versicherungspolice': uploaded = !!state.polizeibericht; break
      case 'leasingvertrag': uploaded = !!state.leasingvertrag; break
      case 'finanzierungsvertrag': uploaded = !!state.finanzierungsvertrag; break
      case 'gewerbenachweis': uploaded = !!state.gewerbenachweis; break
      case 'gf-vollmacht': uploaded = !!state.gf_vollmacht; break
      case 'halter-ausweis': uploaded = !!state.halter_ausweis; break
      case 'aerztliches-attest': uploaded = !!state.aerztliches_attest; break
      case 'mietwagenvertrag': uploaded = !!state.mietwagenvertrag; break
    }
    return { typ: d.typ, uploaded, pflicht: d.pflicht }
  })

  const uploadedDocs = uploadStatus.filter((d) => d.uploaded)
  const missingDocs = uploadStatus.filter((d) => !d.uploaded && d.pflicht)
  const optionalMissing = uploadStatus.filter((d) => !d.uploaded && !d.pflicht)

  const LABELS: Record<string, string> = {
    'fahrzeugschein': 'Fahrzeugschein',
    'fuehrerschein': 'Fuehrerschein',
    'schadensfotos': 'Schadensfotos',
    'gegner-daten': 'Gegner-Daten',
    'eigene-versicherung': 'Eigene Versicherung',
    'polizeibericht': 'Polizeibericht',
    'eigene-versicherungspolice': 'Versicherungspolice',
    'leasingvertrag': 'Leasingvertrag',
    'finanzierungsvertrag': 'Finanzierungsvertrag',
    'gewerbenachweis': 'Gewerbenachweis',
    'gf-vollmacht': 'GF-Vollmacht',
    'halter-ausweis': 'Ausweis Halter',
    'aerztliches-attest': 'Aerztliches Attest',
    'mietwagenvertrag': 'Mietwagenvertrag',
  }

  return (
    <div>
      <StepHeader
        question="Zusammenfassung"
        sub="Pruefen Sie Ihre Angaben vor dem Absenden."
      />

      <div className="space-y-4">
        {/* Uploaded */}
        {uploadedDocs.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Hochgeladen</p>
            <div className="space-y-1.5">
              {uploadedDocs.map((d) => (
                <div key={d.typ} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-green-500/5 border border-green-800/30">
                  <CheckIcon className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <span className="text-sm text-green-300">{LABELS[d.typ] ?? d.typ}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missing pflicht */}
        {missingDocs.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Noch ausstehend (Pflicht)</p>
            <div className="space-y-1.5">
              {missingDocs.map((d) => (
                <div key={d.typ} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-500/5 border border-amber-800/30">
                  <AlertTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="text-sm text-amber-300">{LABELS[d.typ] ?? d.typ}</span>
                  <span className="text-xs text-gray-500 ml-auto">im Portal nachreichen</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Optional missing */}
        {optionalMissing.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Optional (nicht hochgeladen)</p>
            <div className="space-y-1.5">
              {optionalMissing.map((d) => (
                <div key={d.typ} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gray-100/50 border border-gray-300/50">
                  <div className="w-4 h-4 rounded border border-gray-300 flex-shrink-0" />
                  <span className="text-sm text-gray-500">{LABELS[d.typ] ?? d.typ}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gegner-Daten Summary */}
        {state.gegner_name && (
          <div className="space-y-1.5 pt-2">
            <SummaryRow label="Unfallgegner" value={state.gegner_name} />
            {state.gegner_versicherung && <SummaryRow label="Gegner-Versicherung" value={state.gegner_versicherung} />}
            {state.gegner_kennzeichen && <SummaryRow label="Gegner-Kennzeichen" value={state.gegner_kennzeichen} />}
          </div>
        )}
        {state.eigene_versicherung && (
          <SummaryRow label="Eigene Versicherung" value={state.eigene_versicherung} />
        )}
        {state.unfall_ort && (
          <SummaryRow label="Unfallort" value={state.unfall_ort} />
        )}
        {state.ust_id && (
          <SummaryRow label="USt-IdNr" value={state.ust_id} />
        )}

        {/* Portal-Info */}
        <InfoBox>
          Nach dem Absenden erhalten Sie Zugang zum Kundenportal, in dem Sie fehlende Dokumente nachreichen und den Status Ihres Falls verfolgen koennen.
        </InfoBox>
      </div>
    </div>
  )
}
