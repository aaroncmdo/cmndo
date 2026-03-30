'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckIcon } from 'lucide-react'
import { notifyNeuerFall, createKundeAccount } from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type FlowData = {
  schadens_ursache: string
  beschaedigte_bereiche: string[]
  verursacher: string
  schadens_datum: string
  fotos: File[]
  beweise: string[]
  vorname: string
  nachname: string
  email: string
  telefon: string
  adresse: string
  plz: string
  ort: string
}

const INITIAL: FlowData = {
  schadens_ursache: '',
  beschaedigte_bereiche: [],
  verursacher: '',
  schadens_datum: '',
  fotos: [],
  beweise: [],
  vorname: '',
  nachname: '',
  email: '',
  telefon: '',
  adresse: '',
  plz: '',
  ort: '',
}

// ─── Options ──────────────────────────────────────────────────────────────────

const URSACHE_OPTIONS = [
  { value: 'wasserschaden', label: 'Wasserschaden' },
  { value: 'sachbeschaedigung', label: 'Sachbeschädigung' },
  { value: 'brand', label: 'Brand' },
  { value: 'einbruch', label: 'Einbruch' },
  { value: 'sonstiges', label: 'Sonstiges' },
]

const BEREICH_OPTIONS = [
  { value: 'boden', label: 'Boden' },
  { value: 'wand', label: 'Wand' },
  { value: 'decke', label: 'Decke' },
  { value: 'moebel', label: 'Möbel' },
  { value: 'kueche', label: 'Küche' },
  { value: 'bad', label: 'Bad' },
  { value: 'elektro', label: 'Elektro' },
  { value: 'sanitaer', label: 'Sanitär' },
  { value: 'fenster', label: 'Fenster' },
  { value: 'tuer', label: 'Tür' },
  { value: 'sonstiges', label: 'Sonstiges' },
]

const VERURSACHER_OPTIONS = [
  { value: 'mieter', label: 'Mieter' },
  { value: 'gast_airbnb', label: 'Gast / Airbnb' },
  { value: 'nachbar', label: 'Nachbar' },
  { value: 'handwerker', label: 'Handwerker' },
  { value: 'unbekannt', label: 'Unbekannt' },
]

const BEWEISE_OPTIONS = [
  { value: 'uebergabeprotokoll', label: 'Übergabeprotokoll vorhanden' },
  { value: 'fotos_vorher', label: 'Fotos vom Zustand vorher' },
  { value: 'schaden_anerkannt', label: 'Schädiger hat Schaden anerkannt' },
  { value: 'zeugen', label: 'Zeugen vorhanden' },
  { value: 'buchungsbestaetigung', label: 'Buchungsbestätigung vorhanden' },
]

const BEREICH_LABELS: Record<string, string> = Object.fromEntries(
  BEREICH_OPTIONS.map((o) => [o.value, o.label])
)

type InitialData = {
  vorname: string
  nachname: string
  email: string
  telefon: string
}

const TOTAL_STEPS = 8

// ─── Validation ───────────────────────────────────────────────────────────────

function canProceed(step: number, data: FlowData): boolean {
  switch (step) {
    case 1: return !!data.schadens_ursache
    case 2: return data.beschaedigte_bereiche.length > 0
    case 3: return !!data.verursacher
    case 4: return !!data.schadens_datum
    case 5: return true
    case 6: return true
    case 7: return !!(data.vorname && data.nachname && data.email && data.adresse && data.plz && data.ort)
    default: return true
  }
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export default function FlowWizard({ token, initialData }: { token: string; initialData?: InitialData }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [data, setData] = useState<FlowData>(() => ({
    ...INITIAL,
    ...(initialData ? {
      vorname: initialData.vorname,
      nachname: initialData.nachname,
      email: initialData.email,
      telefon: initialData.telefon,
    } : {}),
  }))
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<{ email: string; password: string; fallId: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const progress = Math.round((step / TOTAL_STEPS) * 100)

  function set<K extends keyof FlowData>(key: K, value: FlowData[K]) {
    setData((d) => ({ ...d, [key]: value }))
  }

  function toggleBereich(value: string) {
    setData((d) => ({
      ...d,
      beschaedigte_bereiche: d.beschaedigte_bereiche.includes(value)
        ? d.beschaedigte_bereiche.filter((v) => v !== value)
        : [...d.beschaedigte_bereiche, value],
    }))
  }

  function toggleBeweis(value: string) {
    setData((d) => ({
      ...d,
      beweise: d.beweise.includes(value)
        ? d.beweise.filter((v) => v !== value)
        : [...d.beweise, value],
    }))
  }

  const addFiles = useCallback((files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'))
    setData((d) => ({ ...d, fotos: [...d.fotos, ...imgs] }))
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const supabase = createClient()

    try {
      let leadId: string

      // Try to update existing lead (admin-sent flow where token = lead.id)
      const { data: existingLead } = await supabase
        .from('leads')
        .update({
          vorname: data.vorname,
          nachname: data.nachname,
          email: data.email,
          telefon: data.telefon || null,
          qualifizierung_data: {
            verursacher: data.verursacher,
            beweise: data.beweise,
          },
        })
        .eq('id', token)
        .select('id')
        .maybeSingle()

      if (existingLead) {
        leadId = existingLead.id
      } else {
        // Create new lead (standalone flow / token is not a lead ID)
        const { data: newLead, error: leadErr } = await supabase
          .from('leads')
          .insert({
            vorname: data.vorname,
            nachname: data.nachname,
            email: data.email,
            telefon: data.telefon || null,
            source_channel: 'flow',
            source_domain: token,
            qualifizierung_data: {
              verursacher: data.verursacher,
              beweise: data.beweise,
            },
          })
          .select('id')
          .single()
        if (leadErr) throw new Error(leadErr.message)
        leadId = newLead.id
      }

      // Fall anlegen
      const { data: fall, error: fallErr } = await supabase
        .from('faelle')
        .insert({
          lead_id: leadId,
          schadens_ursache: data.schadens_ursache || null,
          schadens_entdeckt_am: data.schadens_datum || null,
          schadens_adresse: data.adresse,
          schadens_plz: data.plz,
          schadens_ort: data.ort,
          notizen: [
            data.verursacher ? `Verursacher: ${data.verursacher}` : null,
            data.beweise.length ? `Beweise: ${data.beweise.join(', ')}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
          status: 'ersterfassung',
        })
        .select('id')
        .single()
      if (fallErr) throw new Error(fallErr.message)

      // Schadenspositionen (eine pro Bereich)
      if (data.beschaedigte_bereiche.length > 0) {
        const { error: posErr } = await supabase
          .from('schadenspositionen')
          .insert(
            data.beschaedigte_bereiche.map((kategorie, i) => ({
              fall_id: fall.id,
              kategorie,
              bezeichnung: BEREICH_LABELS[kategorie] ?? kategorie,
              sort_order: i,
            }))
          )
        if (posErr) throw new Error(posErr.message)
      }

      // Fotos hochladen + Dokumente-Einträge
      for (const foto of data.fotos) {
        const ext = foto.name.split('.').pop() ?? 'jpg'
        const path = `flow/${token}/${fall.id}/${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('dokumente')
          .upload(path, foto, { contentType: foto.type })
        if (uploadErr) throw new Error(uploadErr.message)

        const {
          data: { publicUrl },
        } = supabase.storage.from('dokumente').getPublicUrl(path)

        const { error: dokErr } = await supabase.from('dokumente').insert({
          fall_id: fall.id,
          typ: 'foto-schaden',
          datei_url: publicUrl,
          datei_name: foto.name,
          datei_groesse: foto.size,
        })
        if (dokErr) throw new Error(dokErr.message)
      }

      // E-Mail an Admin: Neuer Fall (fire & forget)
      notifyNeuerFall(fall.id).catch(() => {})

      // Create Kunde auth account and show credentials
      try {
        const { password } = await createKundeAccount(
          fall.id,
          data.email,
          data.vorname,
          data.nachname,
          data.telefon || null,
        )
        setCredentials({ email: data.email, password, fallId: fall.id })
      } catch {
        // Even if account creation fails, continue to signature
        router.push(`/flow/signatur/${fall.id}`)
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Credentials Success Screen ────────────────────────────────────────────

  if (credentials) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
        <div className="flex-1 flex flex-col px-5 pt-10 pb-8 max-w-lg mx-auto w-full">
          <div className="flex-1 flex flex-col justify-center py-4">
            <div className="bg-white border border-gray-200 rounded-3xl px-6 py-7 shadow-xl shadow-black/20">
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h1 className="text-2xl font-semibold text-gray-900">Schadensfall gemeldet!</h1>
                <p className="text-gray-500 text-sm mt-2">
                  Ihr Fall wurde erfolgreich aufgenommen. Nutzen Sie die folgenden Zugangsdaten, um den Fortschritt in Ihrem Kundenportal zu verfolgen.
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="bg-gray-100/50 border border-gray-300/50 rounded-xl px-4 py-3">
                  <span className="text-xs text-gray-500 block mb-0.5">E-Mail</span>
                  <span className="text-gray-800 text-sm font-mono">{credentials.email}</span>
                </div>
                <div className="bg-gray-100/50 border border-gray-300/50 rounded-xl px-4 py-3">
                  <span className="text-xs text-gray-500 block mb-0.5">Passwort</span>
                  <span className="text-gray-800 text-sm font-mono">{credentials.password}</span>
                </div>
              </div>

              <p className="text-gray-500 text-xs text-center mb-4">
                Bitte notieren Sie sich Ihre Zugangsdaten. Sie erhalten diese auch per E-Mail.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-4">
            <button
              onClick={() => router.push(`/flow/signatur/${credentials.fallId}`)}
              className="w-full min-h-14 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-base active:scale-[0.98] transition-all"
            >
              Weiter zur Unterschrift
            </button>
            <a
              href="/login"
              className="block w-full py-3 text-center text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              Zum Kundenportal
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ─── Shell ────────────────────────────────────────────────────────────────────

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
        {step}&thinsp;/&thinsp;{TOTAL_STEPS}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-5 pt-10 pb-8 max-w-lg mx-auto w-full">
        <div className="flex-1 flex flex-col justify-center py-4">
          <div className="bg-white border border-gray-200 rounded-3xl px-6 py-7 shadow-xl shadow-black/20">
            {step === 1 && (
              <Step1 value={data.schadens_ursache} onChange={(v) => set('schadens_ursache', v)} />
            )}
            {step === 2 && (
              <Step2 value={data.beschaedigte_bereiche} toggle={toggleBereich} />
            )}
            {step === 3 && (
              <Step3 value={data.verursacher} onChange={(v) => set('verursacher', v)} />
            )}
            {step === 4 && (
              <Step4 value={data.schadens_datum} onChange={(v) => set('schadens_datum', v)} />
            )}
            {step === 5 && (
              <Step5
                fotos={data.fotos}
                dragOver={dragOver}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onFileInput={(e) => e.target.files && addFiles(e.target.files)}
                onRemove={(i) => setData((d) => ({ ...d, fotos: d.fotos.filter((_, idx) => idx !== i) }))}
                fileInputRef={fileInputRef}
              />
            )}
            {step === 6 && <Step6 value={data.beweise} toggle={toggleBeweis} />}
            {step === 7 && <Step7 data={data} onChange={set} />}
            {step === 8 && <Step8 data={data} />}
          </div>
        </div>

        {/* Navigation */}
        <div className="space-y-3 pt-4">
          {error && (
            <p className="text-sm text-red-400 text-center rounded-2xl bg-red-500/10 border border-red-900/50 px-4 py-3">
              {error}
            </p>
          )}
          {step === TOTAL_STEPS ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full min-h-14 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            >
              {submitting ? 'Wird gesendet ...' : 'Schaden melden'}
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed(step, data)}
              className="w-full min-h-14 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-base disabled:opacity-20 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            >
              Weiter
            </button>
          )}
          {step > 1 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Zurück
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function StepHeader({ question, sub }: { question: string; sub?: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-2xl font-semibold text-gray-900 leading-snug">{question}</h1>
      {sub && <p className="mt-2 text-sm text-gray-500">{sub}</p>}
    </div>
  )
}

function SelectButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-4 rounded-2xl border text-sm font-medium transition-all active:scale-[0.98] ${
        selected
          ? 'border-blue-500 bg-blue-500/10 text-blue-400 font-semibold'
          : 'border-gray-300 bg-gray-100/50 text-gray-800 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function Step1({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <StepHeader question="Was ist passiert?" />
      <div className="space-y-2">
        {URSACHE_OPTIONS.map((opt) => (
          <SelectButton key={opt.value} selected={value === opt.value} onClick={() => onChange(opt.value)}>
            {opt.label}
          </SelectButton>
        ))}
      </div>
    </div>
  )
}

function Step2({ value, toggle }: { value: string[]; toggle: (v: string) => void }) {
  return (
    <div>
      <StepHeader question="Was ist beschädigt?" sub="Mehrfachauswahl möglich" />
      <div className="grid grid-cols-2 gap-2">
        {BEREICH_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => toggle(opt.value)}
            className={`text-left px-4 py-4 rounded-2xl border text-sm font-medium transition-all active:scale-[0.97] ${
              value.includes(opt.value)
                ? 'border-blue-500 bg-blue-500/10 text-blue-400 font-semibold'
                : 'border-gray-300 bg-gray-100/50 text-gray-800 hover:border-gray-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Step3({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <StepHeader question="Wer hat den Schaden verursacht?" />
      <div className="space-y-2">
        {VERURSACHER_OPTIONS.map((opt) => (
          <SelectButton key={opt.value} selected={value === opt.value} onClick={() => onChange(opt.value)}>
            {opt.label}
          </SelectButton>
        ))}
      </div>
    </div>
  )
}

function Step4({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <StepHeader
        question="Wann ist der Schaden passiert?"
        sub="Oder: Wann wurde er entdeckt?"
      />
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        max={new Date().toISOString().split('T')[0]}
        className="w-full px-5 py-4 rounded-2xl border border-gray-300 bg-gray-100 text-zinc-100 text-base focus:outline-none focus:border-zinc-500 transition-colors [color-scheme:dark]"
      />
    </div>
  )
}

function Step5({
  fotos,
  dragOver,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileInput,
  onRemove,
  fileInputRef,
}: {
  fotos: File[]
  dragOver: boolean
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: (i: number) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <div>
      <StepHeader question="Fotos hochladen" sub="Optional — lade Bilder des Schadens hoch" />
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-3 px-6 py-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
          dragOver
            ? 'border-blue-500 bg-blue-500/5'
            : 'border-gray-300 bg-gray-100/50 hover:border-gray-300'
        }`}
      >
        <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <div className="text-center">
          <p className="text-sm text-gray-700">Klicken oder Fotos reinziehen</p>
          <p className="text-xs text-gray-500 mt-1">Kamera oder Galerie</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={onFileInput}
          className="hidden"
        />
      </div>
      {fotos.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {fotos.map((f, i) => (
            <div key={i} className="relative group aspect-square">
              <img
                src={URL.createObjectURL(f)}
                alt=""
                className="w-full h-full object-cover rounded-xl"
              />
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(i) }}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 text-gray-700 shadow-sm flex items-center justify-center text-xs leading-none opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Step6({ value, toggle }: { value: string[]; toggle: (v: string) => void }) {
  return (
    <div>
      <StepHeader question="Gibt es Beweise?" sub="Wähle alles Zutreffende aus — optional" />
      <div className="space-y-2">
        {BEWEISE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => toggle(opt.value)}
            className={`w-full flex items-center gap-3 text-left px-5 py-4 rounded-2xl border text-sm font-medium transition-all active:scale-[0.98] ${
              value.includes(opt.value)
                ? 'border-blue-500 bg-blue-500/10 text-blue-400 font-semibold'
                : 'border-gray-300 bg-gray-100/50 text-gray-800 hover:border-gray-300'
            }`}
          >
            <div
              className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-all ${
                value.includes(opt.value) ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
              }`}
            >
              {value.includes(opt.value) && <CheckIcon className="w-3.5 h-3.5 text-gray-900" />}
            </div>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Step7({
  data,
  onChange,
}: {
  data: FlowData
  onChange: <K extends keyof FlowData>(key: K, value: FlowData[K]) => void
}) {
  const inputCls =
    'w-full px-5 py-4 rounded-2xl border border-gray-300 bg-gray-100 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 transition-colors'

  return (
    <div>
      <StepHeader question="Deine Kontaktdaten" />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            value={data.vorname}
            onChange={(e) => onChange('vorname', e.target.value)}
            placeholder="Vorname"
            className={inputCls}
          />
          <input
            value={data.nachname}
            onChange={(e) => onChange('nachname', e.target.value)}
            placeholder="Nachname"
            className={inputCls}
          />
        </div>
        <input
          type="email"
          value={data.email}
          onChange={(e) => onChange('email', e.target.value)}
          placeholder="E-Mail"
          className={inputCls}
        />
        <input
          type="tel"
          value={data.telefon}
          onChange={(e) => onChange('telefon', e.target.value)}
          placeholder="Telefon (optional)"
          className={inputCls}
        />
        <div className="pt-1">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Adresse des Schadens</p>
          <div className="space-y-3">
            <input
              value={data.adresse}
              onChange={(e) => onChange('adresse', e.target.value)}
              placeholder="Straße und Hausnummer"
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={data.plz}
                onChange={(e) => onChange('plz', e.target.value)}
                placeholder="PLZ"
                className={inputCls}
              />
              <input
                value={data.ort}
                onChange={(e) => onChange('ort', e.target.value)}
                placeholder="Ort"
                className={inputCls}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step8({ data }: { data: FlowData }) {
  const ursacheLabel = URSACHE_OPTIONS.find((o) => o.value === data.schadens_ursache)?.label ?? '—'
  const verursacherLabel = VERURSACHER_OPTIONS.find((o) => o.value === data.verursacher)?.label ?? '—'
  const bereicheLabel =
    data.beschaedigte_bereiche.map((b) => BEREICH_LABELS[b] ?? b).join(', ') || '—'
  const beweiseLabel =
    data.beweise.length > 0
      ? data.beweise.map((b) => BEWEISE_OPTIONS.find((o) => o.value === b)?.label ?? b).join(', ')
      : 'Keine'

  return (
    <div>
      <StepHeader question="Zusammenfassung" sub="Bitte prüfe deine Angaben vor dem Absenden" />
      <div className="space-y-2">
        <SummaryRow label="Schadensursache" value={ursacheLabel} />
        <SummaryRow label="Beschädigte Bereiche" value={bereicheLabel} />
        <SummaryRow label="Verursacher" value={verursacherLabel} />
        <SummaryRow label="Datum" value={data.schadens_datum || '—'} />
        <SummaryRow label="Fotos" value={data.fotos.length > 0 ? `${data.fotos.length} Foto(s)` : 'Keine'} />
        <SummaryRow label="Beweise" value={beweiseLabel} />
        <div className="h-px bg-zinc-700/50 my-1" />
        <SummaryRow label="Name" value={`${data.vorname} ${data.nachname}`.trim() || '—'} />
        <SummaryRow label="E-Mail" value={data.email || '—'} />
        <SummaryRow label="Telefon" value={data.telefon || '—'} />
        <SummaryRow
          label="Schadensadresse"
          value={[data.adresse, `${data.plz} ${data.ort}`.trim()].filter(Boolean).join(', ') || '—'}
        />
      </div>
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
