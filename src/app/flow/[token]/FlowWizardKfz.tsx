'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { signSAandCreateFall, createKundeAccount, updateLeadStammdaten, generateSAPdf } from './actions'
// AAR-305: Werkstatt-Angaben + Schadensfotos-Upload
import { saveWerkstattAngaben, saveSchadensfotoUrls } from './onboarding-extra-actions'
import {
  CheckIcon,
  FileTextIcon,
  CarIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  UserPlusIcon,
  UserIcon,
  MailIcon,
  PenToolIcon,
  Trash2Icon,
  LoaderIcon,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeadData = {
  id: string
  vorname: string
  nachname: string
  email: string
  telefon: string
  schadenfall_typ: string
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
}

export type GutachterInfo = {
  vorname: string
  avatarUrl: string | null
  terminDatum: string | null
  // AAR-341: Besichtigungsort + SV-Treffpunkt für Schritt 2
  besichtigungsAdresse: string | null
  svTreffpunkt: string | null
}

// AAR-99 + AAR-305: 5-Step Flow (+ weitere-angaben zwischen gutachter und sa)
type StepId = 'zusammenfassung' | 'gutachter' | 'weitere-angaben' | 'sa' | 'account'

const STEPS: { id: StepId; label: string }[] = [
  { id: 'zusammenfassung', label: 'Zusammenfassung' },
  { id: 'gutachter', label: 'Ihr Gutachter' },
  // AAR-305: Werkstatt-Frage + Schadensfotos-Upload vor der Signatur
  { id: 'weitere-angaben', label: 'Weitere Angaben' },
  { id: 'sa', label: 'Beauftragung' },
  { id: 'account', label: 'Konto' },
]

// AAR-305: stepIndex-ID-Helper damit hardcodierte Indizes (z.B. account=3
// vor Einfügen, jetzt 4) nicht brechen
function stepIndexById(id: StepId): number {
  return STEPS.findIndex((s) => s.id === id)
}

// ─── Schadentyp Labels (AAR-99: neue ENUM) ──────────────────────────────────

const SCHADENTYP_LABELS: Record<string, string> = {
  spurwechsel: 'Spurwechsel-Unfall',
  auffahrunfall: 'Auffahrunfall',
  vorfahrtsverletzung: 'Vorfahrtsverletzung',
  parkplatz: 'Parkplatz-Schaden',
  sonstiges: 'Sonstiger Verkehrsunfall',
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

export default function FlowWizardKfz({
  token,
  flowLinkId,
  lead,
  gutachter,
}: {
  token: string
  flowLinkId?: string | null
  lead: LeadData
  gutachter?: GutachterInfo | null
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [datenschutz, setDatenschutz] = useState(false)
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [saAccepted, setSaAccepted] = useState(false)
  const [submittingSA, setSubmittingSA] = useState(false)
  const [fallId, setFallId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Editierbare Stammdaten (KFZ-117: Kunde kann korrigieren)
  const [editVorname, setEditVorname] = useState(lead.vorname)
  const [editNachname, setEditNachname] = useState(lead.nachname)
  const [editTelefon, setEditTelefon] = useState(lead.telefon)
  const [editEmail, setEditEmail] = useState(lead.email)

  // Account step
  const [accountPassword, setAccountPassword] = useState('')
  const [accountEmail, setAccountEmail] = useState(editEmail)
  const [showPw, setShowPw] = useState(false)
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [accountCreated, setAccountCreated] = useState(false)

  // AAR-305: Weitere-Angaben-Step — Werkstatt-Frage + Schadensfotos-Upload
  const [werkstattJa, setWerkstattJa] = useState<boolean | null>(null)
  const [werkstattDatum, setWerkstattDatum] = useState('')
  const [schadensfotos, setSchadensfotos] = useState<string[]>([])
  const [uploadingFotos, setUploadingFotos] = useState(false)
  const [fotoError, setFotoError] = useState<string | null>(null)
  const [savingWeitere, setSavingWeitere] = useState(false)

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

      // 3. SA-PDF generieren (Background, non-blocking)
      generateSAPdf(result.fallId, lead.id, publicUrl).catch(() => {})

      // AAR-99 + AAR-305: Nach SA → Account-Step (dynamisch per ID)
      setStepIndex(stepIndexById('account'))
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
      // AAR-308/309: createKundeAccount wirft NIE — sauberes Result-Object.
      const result = await createKundeAccount(fallId, accountEmail, editVorname || lead.vorname, editNachname || lead.nachname, editTelefon || lead.telefon || null)
      if (!result.success) {
        setError(result.error)
        return
      }
      setAccountPassword(result.password)
      setAccountCreated(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Konto konnte nicht erstellt werden')
    } finally {
      setCreatingAccount(false)
    }
  }

  // AAR-99: Kein Skip-Button mehr — Account ist Pflicht

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

            {/* ═══ SCHRITT 1: ZUSAMMENFASSUNG + DATENSCHUTZ ═══ */}
            {currentStep.id === 'zusammenfassung' && (
              <div>
                <StepHeader
                  question={`Hallo ${editVorname || 'dort'}!`}
                  sub="Bitte prüfen und korrigieren Sie Ihre Daten."
                  icon={<CarIcon className="w-8 h-8 text-[#4573A2]" />}
                />

                {/* Editierbare Kontaktdaten */}
                <div className="space-y-3 mb-5">
                  <div className="grid grid-cols-2 gap-3">
                    <EditableInput label="Vorname" value={editVorname} onChange={setEditVorname} />
                    <EditableInput label="Nachname" value={editNachname} onChange={setEditNachname} />
                  </div>
                  <EditableInput label="Telefon" value={editTelefon} onChange={setEditTelefon} type="tel" />
                  <EditableInput label="E-Mail" value={editEmail} onChange={setEditEmail} type="email" />
                </div>

                {/* Nicht-editierbare Infos (aus Qualifizierung) */}
                <div className="space-y-2 mb-6">
                  {(lead.fahrzeug_standort_adresse || lead.fahrzeug_standort_plz) && (
                    <SummaryRow label="Standort" value={[lead.fahrzeug_standort_adresse, lead.fahrzeug_standort_plz].filter(Boolean).join(', ')} />
                  )}
                  {fahrzeug && <SummaryRow label="Fahrzeug" value={`${fahrzeug}${lead.kennzeichen ? ` (${lead.kennzeichen})` : ''}`} />}
                  {lead.schadentyp && <SummaryRow label="Schadentyp" value={SCHADENTYP_LABELS[lead.schadentyp] ?? lead.schadentyp_freitext ?? lead.schadentyp} />}
                  {lead.gegner_name && <SummaryRow label="Unfallgegner" value={`${lead.gegner_name}${lead.gegner_versicherung ? ` — ${lead.gegner_versicherung}` : ''}`} />}
                  {lead.unfallhergang && <SummaryRow label="Unfallhergang" value={lead.unfallhergang} />}
                </div>

                {/* KFZ-153: Unfall-Konstellation + Gegner-Daten Dropdowns */}
                <div className="space-y-3 mb-6 border-t border-gray-100 pt-5">
                  <p className="text-sm font-medium text-gray-700">Angaben zum Unfall (optional)</p>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Art des Unfalls</label>
                    <select defaultValue="" className="w-full bg-white border border-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#4573A2]"
                      onChange={e => { const v = e.target.value; if (v) updateLeadStammdaten(lead.id, { unfall_konstellation: v } as Record<string, string>) }}>
                      <option value="">-- Bitte wählen --</option>
                      <option value="auffahrunfall">Auffahrunfall</option>
                      <option value="spurwechsel">Spurwechsel</option>
                      <option value="parkschaden">Parkschaden</option>
                      <option value="vorfahrt">Vorfahrt</option>
                      <option value="tueroeffnung">Türöffnung</option>
                      <option value="wildunfall">Wildunfall</option>
                      <option value="glatteis">Glatteis</option>
                      <option value="sonstiges">Sonstiges</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Anzahl Beteiligte</label>
                      <select defaultValue="2" className="w-full bg-white border border-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#4573A2]"
                        onChange={e => updateLeadStammdaten(lead.id, { gegner_anzahl_beteiligte: e.target.value } as Record<string, string>)}>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3+</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Fahrzeugtyp Gegner</label>
                      <select defaultValue="" className="w-full bg-white border border-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#4573A2]"
                        onChange={e => { const v = e.target.value; if (v) updateLeadStammdaten(lead.id, { gegner_fahrzeugtyp: v } as Record<string, string>) }}>
                        <option value="">-- Bitte wählen --</option>
                        <option value="pkw">PKW</option>
                        <option value="lkw">LKW</option>
                        <option value="transporter">Transporter</option>
                        <option value="motorrad">Motorrad</option>
                        <option value="fahrrad">Fahrrad</option>
                        <option value="bus">Bus</option>
                        <option value="sonstiges">Sonstiges</option>
                      </select>
                    </div>
                  </div>
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
                      <a href="/datenschutz" target="_blank" className="text-[#4573A2] underline">Datenschutzerklärung</a>{' '}
                      gelesen und stimme der Verarbeitung meiner Daten zu. <span className="text-red-400">*</span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* ═══ SCHRITT 2: GUTACHTER-ANZEIGE (AAR-99) ═══ */}
            {currentStep.id === 'gutachter' && (
              <div>
                <StepHeader
                  question="Ihr persoenlicher Gutachter"
                  sub="Dieser Sachverstaendige wird Ihren Schaden begutachten."
                  icon={<UserIcon className="w-8 h-8 text-[#4573A2]" />}
                />

                {gutachter ? (
                  <div className="bg-gradient-to-br from-[#4573A2]/10 to-[#1E3A5F]/5 border border-[#4573A2]/20 rounded-3xl p-7 text-center mb-6">
                    {gutachter.avatarUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={gutachter.avatarUrl}
                        alt={gutachter.vorname}
                        className="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-4 border-white shadow-lg"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-[#4573A2] flex items-center justify-center mx-auto mb-4 text-white text-3xl font-bold">
                        {gutachter.vorname.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <p className="text-xs uppercase tracking-wider text-[#4573A2] mb-1">Ihr Sachverstaendiger</p>
                    <h2 className="text-2xl font-bold text-[#0D1B3E] mb-2">{gutachter.vorname}</h2>
                    <p className="text-sm text-gray-600">Wird sich bei Ihnen melden</p>
                    {gutachter.terminDatum && (
                      <div className="mt-4 pt-4 border-t border-[#4573A2]/20">
                        <p className="text-xs text-gray-500 mb-1">Termin reserviert</p>
                        <p className="text-sm font-semibold text-[#0D1B3E]">
                          {new Date(gutachter.terminDatum).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(gutachter.terminDatum).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                        </p>
                        {/* AAR-341: Besichtigungsort + optional Treffpunkt */}
                        {gutachter.besichtigungsAdresse && (
                          <div className="mt-3 pt-3 border-t border-[#4573A2]/10">
                            <p className="text-xs text-gray-500 mb-0.5">Besichtigungsort</p>
                            <p className="text-sm text-[#0D1B3E]">{gutachter.besichtigungsAdresse}</p>
                            {gutachter.svTreffpunkt && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                Treffpunkt: {gutachter.svTreffpunkt}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 text-sm text-amber-800">
                    Wir suchen gerade einen passenden Sachverstaendigen fuer Sie. Sie erhalten in Kuerze eine Bestaetigung.
                  </div>
                )}

                <button
                  onClick={() => setStepIndex(stepIndex + 1)}
                  className="w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base active:scale-[0.98] transition-all"
                >
                  Weiter
                </button>
              </div>
            )}

            {/* ═══ AAR-305: SCHRITT 3 — WEITERE ANGABEN (Werkstatt + Fotos) ═══ */}
            {currentStep.id === 'weitere-angaben' && (
              <div>
                <StepHeader
                  question="Weitere Angaben"
                  sub="Nur zwei kurze Fragen — diese helfen uns dein Anliegen besser einzuschätzen."
                  icon={<FileTextIcon className="w-8 h-8 text-[#4573A2]" />}
                />

                {/* Hinweis-Box: Mietwagen-Empfehlung wenn Fahrzeug nicht fahrbereit */}
                {lead.fahrzeug_fahrbereit === false && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 mb-5 text-sm text-amber-900">
                    <p className="font-medium mb-1">🚗💥 Mietwagen-Empfehlung</p>
                    <p className="text-xs">
                      Da dein Auto nicht fahrbereit ist, ist ein Mietwagen oft sinnvoll.
                      Fotos vom Schaden helfen uns dir konkret zu empfehlen welchen
                      Mietwagen du buchen solltest.
                    </p>
                  </div>
                )}

                {/* Werkstatt-Frage */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 space-y-3">
                  <p className="text-sm font-medium text-gray-900">
                    Steht dein Auto gerade in einer Werkstatt?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setWerkstattJa(true)}
                      className={`flex-1 min-h-12 rounded-xl text-sm font-medium border ${
                        werkstattJa === true
                          ? 'bg-[#4573A2] text-white border-[#4573A2]'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      Ja
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWerkstattJa(false)
                        setWerkstattDatum('')
                      }}
                      className={`flex-1 min-h-12 rounded-xl text-sm font-medium border ${
                        werkstattJa === false
                          ? 'bg-[#4573A2] text-white border-[#4573A2]'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      Nein
                    </button>
                  </div>
                  {werkstattJa === true && (
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
                        Seit wann? (optional)
                      </label>
                      <input
                        type="date"
                        value={werkstattDatum}
                        onChange={(e) => setWerkstattDatum(e.target.value)}
                        className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-[#4573A2]"
                      />
                    </div>
                  )}
                </div>

                {/* Schadensfotos-Upload */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Hast du Fotos vom Schaden?
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Optional. Max. 10 Fotos, je max. 10 MB. JPEG/PNG/HEIC/WebP.
                    </p>
                  </div>
                  <label className="block cursor-pointer">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/heic,image/webp"
                      multiple
                      disabled={uploadingFotos || schadensfotos.length >= 10}
                      onChange={async (e) => {
                        const files = Array.from(e.target.files ?? [])
                        if (!files.length) return
                        const remaining = 10 - schadensfotos.length
                        const toUpload = files.slice(0, remaining)
                        setUploadingFotos(true)
                        setFotoError(null)
                        try {
                          const supabase = createClient()
                          const uploaded: string[] = []
                          for (const file of toUpload) {
                            if (file.size > 10 * 1024 * 1024) {
                              setFotoError(`„${file.name}" ist größer als 10 MB — übersprungen`)
                              continue
                            }
                            const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
                            // AAR-305/Audit-M1: Pfad-Prefix `flow/` ist Pflicht
                            // damit Storage-Policy „Flow anon upload" greift —
                            // der Kunde ist in diesem Step noch nicht auth'd.
                            const path = `flow/schadensfotos-lead/${lead.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`
                            const { error: upErr } = await supabase.storage
                              .from('dokumente')
                              .upload(path, file, { contentType: file.type })
                            if (upErr) {
                              setFotoError(`Upload „${file.name}" fehlgeschlagen: ${upErr.message}`)
                              continue
                            }
                            const { data } = supabase.storage.from('dokumente').getPublicUrl(path)
                            uploaded.push(data.publicUrl)
                          }
                          const next = [...schadensfotos, ...uploaded].slice(0, 10)
                          setSchadensfotos(next)
                          // persistieren damit ein Browser-Close die URLs nicht verliert
                          await saveSchadensfotoUrls(lead.id, next).catch(() => {})
                        } finally {
                          setUploadingFotos(false)
                          e.target.value = ''
                        }
                      }}
                      className="hidden"
                    />
                    <div className="rounded-xl border-2 border-dashed border-gray-300 px-4 py-6 text-center hover:border-[#4573A2] bg-gray-50 hover:bg-gray-100 transition-colors">
                      {uploadingFotos ? (
                        <p className="text-sm text-gray-500 flex items-center justify-center gap-2">
                          <LoaderIcon className="w-4 h-4 animate-spin" /> Lade hoch …
                        </p>
                      ) : (
                        <>
                          <p className="text-sm text-gray-700">📷 Fotos auswählen</p>
                          <p className="text-[11px] text-gray-500 mt-1">
                            {schadensfotos.length}/10 hochgeladen
                          </p>
                        </>
                      )}
                    </div>
                  </label>
                  {schadensfotos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {schadensfotos.map((url, i) => (
                        <div
                          key={url}
                          className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={async () => {
                              const next = schadensfotos.filter((_, idx) => idx !== i)
                              setSchadensfotos(next)
                              await saveSchadensfotoUrls(lead.id, next).catch(() => {})
                            }}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs hover:bg-black/80"
                            aria-label="Entfernen"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {fotoError && <p className="text-xs text-red-600">{fotoError}</p>}
                </div>

                <button
                  onClick={async () => {
                    setSavingWeitere(true)
                    try {
                      // Werkstatt-Antwort persistieren (nur bei „Ja" + Datum sinnvoll
                      // zu speichern; „Nein" speichert NULL damit die Frage als
                      // beantwortet gilt)
                      await saveWerkstattAngaben(
                        lead.id,
                        werkstattJa === true ? werkstattDatum || null : null,
                      )
                      // Fotos wurden bereits bei jedem Upload persistiert —
                      // Safety-Net für den Fall dass ein Upload vor persist abgebrochen wurde
                      await saveSchadensfotoUrls(lead.id, schadensfotos)
                    } finally {
                      setSavingWeitere(false)
                      setStepIndex(stepIndex + 1)
                    }
                  }}
                  disabled={savingWeitere || uploadingFotos}
                  className="w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base disabled:opacity-50 active:scale-[0.98] transition-all"
                >
                  {savingWeitere
                    ? 'Speichert …'
                    : schadensfotos.length === 0 && werkstattJa == null
                      ? 'Weiter ohne Angaben'
                      : 'Weiter'}
                </button>
              </div>
            )}

            {/* ═══ SCHRITT 4: SA UNTERSCHREIBEN ═══ */}
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
                  der Sicherungsabtretung an den Sachverständigen abgetreten und von der gegnerischen
                  Versicherung getragen.</p>
                </div>

                <a
                  href="/sa-volltext"
                  target="_blank"
                  className="flex items-center gap-2 text-sm text-[#4573A2] hover:underline mb-5"
                >
                  <FileTextIcon className="w-4 h-4" />
                  Vollständige Sicherungsabtretung lesen
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
                    Ja, ich möchte den kostenlosen Service nutzen. Alle Kosten trägt die gegnerische Versicherung.
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

            {/* ═══ SCHRITT 4: ACCOUNT ERSTELLEN (AAR-99: Pflicht, kein Skip) ═══ */}
            {currentStep.id === 'account' && (
              <div>
                <StepHeader
                  question="Kundenportal-Zugang"
                  sub="Erstellen Sie Ihr Konto, um Ihren Fall online zu verfolgen."
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
                      onClick={() => { window.location.href = '/kunde' }}
                      className="w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base active:scale-[0.98] transition-all"
                    >
                      Weiter zum Portal
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
                  </div>
                )}
              </div>
            )}

            {/* KFZ-125: Onboarding/Uploads ins Kunden-Portal verschoben */}
          </div>
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
              className="w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base disabled:opacity-20 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            >
              Weiter
            </button>
          </div>
        )}

        {/* Zurück-Button (auf Schritt 2, 3 und 4) */}
        {(currentStep.id === 'gutachter' ||
          currentStep.id === 'weitere-angaben' ||
          currentStep.id === 'sa') && (
          <div className="pt-2">
            <button
              onClick={() => setStepIndex(stepIndex - 1)}
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

function EditableInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:border-[#4573A2] focus:bg-white transition-colors"
      />
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

// ─── Signature Canvas (using signature_pad library) ──────────────────────────

function SignatureCanvas({ onSignature }: { onSignature: (blob: Blob | null) => void }) {
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
          <Trash2Icon className="w-3 h-3" /> Unterschrift löschen
        </button>
      )}
    </div>
  )
}
