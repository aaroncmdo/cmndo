'use client'

// AAR-100: 5-Step Onboarding Wizard
// AAR-125: Deep-Link via ?step=dokumente springt direkt in Step 3 (Dokumente)
import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CheckIcon, UploadCloudIcon, CalendarIcon, FileTextIcon, SparklesIcon, FolderOpenIcon,
  AlertCircleIcon, ClockIcon, RefreshCwIcon,
} from 'lucide-react'
import {
  completeOnboarding,
  uploadPflichtdokument,
  uploadKundenDokument,
  type PflichtdokumentStand,
  type FreierSlot,
} from './actions'

type Fall = { id: string; fall_nummer: string | null; kennzeichen: string | null; fahrzeug: string }
type Termin = { datum: string; svName: string | null }
// AAR-323: PflichtDoc ist jetzt der Katalog-angereicherte Stand (siehe actions.ts).
type PflichtDoc = PflichtdokumentStand

// AAR-324: Schritt 'weitere-dokumente' kommt NACH dem Pflicht-Step. Zeigt
// alle katalog-gefilterten, conditional freigeschalteten Slots (Attest bei
// Personenschaden, Zeugenbericht bei zeugen_vorhanden, Mietwagenrechnung bei
// mietwagen_flag etc.) — alle optional.
const STEPS = [
  { id: 'welcome', label: 'Willkommen' },
  { id: 'fall', label: 'Ihr Fall' },
  { id: 'termin', label: 'Termin' },
  { id: 'dokumente', label: 'Dokumente' },
  { id: 'weitere-dokumente', label: 'Weitere Dokumente' },
  { id: 'fertig', label: 'Fertig' },
] as const

// AAR-324: Gruppen-Labels für die Kategorie-Überschriften in Step 4.
// Reihenfolge = Render-Reihenfolge im UI (orientiert an dokument_katalog.sort_order).
const KATEGORIE_LABELS: Record<string, { label: string; emoji: string }> = {
  stammdaten: { label: 'Stammdaten', emoji: '📌' },
  unfall: { label: 'Unfall', emoji: '🚗' },
  personenschaden: { label: 'Personenschaden', emoji: '🏥' },
  fahrzeug: { label: 'Fahrzeug', emoji: '🔧' },
  kosten: { label: 'Kosten', emoji: '💶' },
  gutachten: { label: 'Gutachten', emoji: '📄' },
  kanzlei: { label: 'Kanzlei', emoji: '⚖️' },
  sonstiges: { label: 'Sonstiges', emoji: '📎' },
}
const KATEGORIE_REIHENFOLGE = [
  'stammdaten',
  'unfall',
  'personenschaden',
  'fahrzeug',
  'kosten',
  'gutachten',
  'kanzlei',
  'sonstiges',
] as const

// AAR-323: Labels kommen jetzt aus dokument_katalog.label (via
// getPflichtdokumenteStand). Fallback-Labels nur noch für Slots, die nicht
// im Katalog sind. AAR-353: leasingvertrag/finanzierungsvertrag durch Katalog-
// Slot freigabe_bank ersetzt; Gewerbe/Halter bleiben supplementär.
const LEGACY_DOKTYP_LABELS: Record<string, string> = {
  gewerbenachweis: 'Gewerbenachweis',
  gf_vollmacht: 'Geschäftsführer-Vollmacht',
  halter_vollmacht: 'Halter-Vollmacht',
  halter_ausweis: 'Halter-Ausweis',
}

const STATUS_PHASES = [
  { key: 'ersterfassung', label: 'Aufgenommen', description: 'Ihr Fall wird vorbereitet' },
  { key: 'sv-termin', label: 'Gutachter-Termin', description: 'Termin wurde reserviert' },
  { key: 'begutachtung', label: 'Begutachtung', description: 'Gutachter erstellt das Gutachten' },
  { key: 'kanzlei', label: 'Kanzlei', description: 'Anwalt uebernimmt die Abwicklung' },
  { key: 'regulierung', label: 'Regulierung', description: 'Versicherung zahlt' },
]

// AAR-231: Vorbereitungs-Flags für Termin-Step
type VorbereitungsInfo = {
  zb1Hochgeladen: boolean
  polizeiVorOrt: boolean
  polizeiberichtHochgeladen: boolean
  personenschaden: boolean
  attestHochgeladen: boolean
  hatVorschaeden: boolean
}

export default function OnboardingWizard({
  vorname, fall, termin, pflichtDocs, freieSlots, vorbereitung,
}: {
  vorname: string
  fall: Fall | null
  termin: Termin | null
  pflichtDocs: PflichtDoc[]
  freieSlots: FreierSlot[]
  vorbereitung?: VorbereitungsInfo
}) {
  const router = useRouter()
  // AAR-125: Deep-Link aus Banner ("Polizeibericht hochladen") springt direkt in Step 3
  const searchParams = useSearchParams()
  const stepParam = searchParams.get('step')
  const initialStepIndex = (() => {
    if (!stepParam) return 0
    const idx = STEPS.findIndex((s) => s.id === stepParam)
    return idx >= 0 ? idx : 0
  })()
  const [stepIndex, setStepIndex] = useState(initialStepIndex)
  const [pending, startTransition] = useTransition()
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  // AAR-323: Per-Doc-Status als lokaler State, initialisiert aus Server-Daten.
  // Wird nach erfolgreichem Upload auf 'hochgeladen' gesetzt, damit das UI sofort
  // reagiert ohne Reload.
  const [docStatus, setDocStatus] = useState<Record<string, string>>(
    Object.fromEntries(pflichtDocs.map(d => [d.id, d.status])),
  )
  // AAR-324: Lokale Counts pro Slot im Optional-Step — wird bei Upload inkrementiert,
  // damit der Kunde ohne Reload sieht "Hochgeladen (2)" bei multi_file-Slots.
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>(
    Object.fromEntries(freieSlots.map(s => [s.slot_id, s.hochgeladene_anzahl])),
  )
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const [sonstigesBeschreibung, setSonstigesBeschreibung] = useState('')
  const [sonstigesCount, setSonstigesCount] = useState(0)
  const [sonstigesError, setSonstigesError] = useState<string | null>(null)

  const currentStep = STEPS[stepIndex]
  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100)

  // AAR-166: ZB1-OCR-Ergebnis pro Dokument anzeigen (derzeit nur fahrzeugschein)
  const [zb1Result, setZb1Result] = useState<{
    extracted: Record<string, string | null>
    message: string
    fieldsFound: number
  } | null>(null)

  function handleFileUpload(dokId: string, file: File) {
    if (!fall?.id) return
    setUploadingId(dokId)
    const doc = pflichtDocs.find((d) => d.id === dokId)
    const istFahrzeugschein = doc?.slot_id === 'fahrzeugschein'
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = typeof reader.result === 'string' ? reader.result : ''
      startTransition(async () => {
        const res = await uploadPflichtdokument(dokId, fall.id, base64, file.name, file.type)
        if (res.success) setDocStatus((prev) => ({ ...prev, [dokId]: 'hochgeladen' }))
        // AAR-166: wenn ZB1 → OCR triggern und Ergebnis inline anzeigen
        if (res.success && istFahrzeugschein) {
          setZb1Result(null)
          try {
            const ocr = await fetch('/api/ocr-fahrzeugschein', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fall_id: fall.id, image_base64: base64 }),
            }).then((r) => r.json())
            if (ocr?.success && ocr.extracted) {
              setZb1Result({
                extracted: ocr.extracted,
                message: ocr.message ?? 'Fahrzeugschein gelesen',
                fieldsFound: ocr.fields_found ?? 0,
              })
            }
          } catch (err) {
            console.warn('[Onboarding ZB1-OCR]', err)
          }
        }
        setUploadingId(null)
      })
    }
    reader.readAsDataURL(file)
  }

  // AAR-324: Upload in einen freien (optionalen) Katalog-Slot.
  // slotId=null → 'kunde-nachreichung' mit Freitext-Beschreibung.
  function handleFreiUpload(slotId: string | null, file: File, beschreibung?: string) {
    if (!fall?.id) return
    const loadingKey = slotId ?? '__sonstiges__'
    setUploadingSlot(loadingKey)
    if (slotId === null) setSonstigesError(null)
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = typeof reader.result === 'string' ? reader.result : ''
      startTransition(async () => {
        const res = await uploadKundenDokument(
          fall.id,
          slotId,
          base64,
          file.name,
          file.type,
          beschreibung,
        )
        if (res.success) {
          if (slotId) {
            setSlotCounts(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 1 }))
          } else {
            setSonstigesCount(prev => prev + 1)
            setSonstigesBeschreibung('')
          }
        } else if (slotId === null) {
          setSonstigesError(res.error ?? 'Upload fehlgeschlagen')
        }
        setUploadingSlot(null)
      })
    }
    reader.readAsDataURL(file)
  }

  function handleFinish() {
    startTransition(async () => {
      await completeOnboarding()
      router.push('/kunde')
      router.refresh()
    })
  }

  const pflichtBlocked = pflichtDocs.filter(d => d.pflicht && docStatus[d.id] !== 'hochgeladen')

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      {/* Progress */}
      <div className="fixed top-0 inset-x-0 z-10 h-1.5 bg-gray-100">
        <div className="h-full bg-[#4573A2] transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {/* Step Indicator */}
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

      <div className="flex-1 flex flex-col px-5 pt-16 pb-8 max-w-lg mx-auto w-full">
        <div className="flex-1 flex flex-col justify-center py-4">
          <div className="bg-white border border-gray-200 rounded-3xl px-6 py-7 shadow-xl shadow-black/5">
            {/* Welcome */}
            {currentStep.id === 'welcome' && (
              <div>
                <div className="mb-4"><SparklesIcon className="w-10 h-10 text-[#4573A2]" /></div>
                <h1 className="text-2xl font-semibold text-gray-900 leading-snug">Willkommen bei Claimondo, {vorname}!</h1>
                <p className="mt-3 text-sm text-gray-500 leading-relaxed">
                  Wir kuemmern uns ab jetzt um die komplette Abwicklung Ihres Schadens.
                  Dieser kurze Einstieg zeigt Ihnen Ihre naechsten Schritte — dauert ca. 3 Minuten.
                </p>
                <button
                  onClick={() => setStepIndex(1)}
                  className="mt-6 w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base active:scale-[0.98] transition-all"
                >Los geht&apos;s</button>
              </div>
            )}

            {/* Fall */}
            {currentStep.id === 'fall' && (
              <div>
                <div className="mb-4"><FolderOpenIcon className="w-10 h-10 text-[#4573A2]" /></div>
                <h1 className="text-2xl font-semibold text-gray-900">Ihr Fall</h1>
                {fall ? (
                  <div className="mt-4 bg-gradient-to-br from-[#4573A2]/10 to-[#1E3A5F]/5 border border-[#4573A2]/20 rounded-2xl p-5">
                    <p className="text-xs uppercase tracking-wider text-[#4573A2] mb-1">Fall-Nummer</p>
                    <p className="text-xl font-bold text-[#0D1B3E]">{fall.fall_nummer ?? fall.id.slice(0, 8)}</p>
                    {fall.kennzeichen && <p className="text-sm text-gray-600 mt-1">{fall.kennzeichen}</p>}
                    {fall.fahrzeug && <p className="text-xs text-gray-500">{fall.fahrzeug}</p>}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-gray-500">Ihr Fall wird gerade angelegt — Sie sehen ihn in wenigen Minuten.</p>
                )}
                <div className="mt-6 space-y-2">
                  <p className="text-sm font-medium text-gray-700">So laeuft es weiter:</p>
                  {STATUS_PHASES.map((phase, i) => (
                    <div key={phase.key} className="flex items-start gap-3 py-2">
                      <div className="w-6 h-6 rounded-full bg-[#4573A2]/10 text-[#4573A2] flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{phase.label}</p>
                        <p className="text-xs text-gray-500">{phase.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setStepIndex(2)}
                  className="mt-6 w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base active:scale-[0.98] transition-all"
                >Weiter</button>
              </div>
            )}

            {/* Termin + AAR-231: Vorbereitungs-Checkliste */}
            {currentStep.id === 'termin' && (
              <div>
                <div className="mb-4"><CalendarIcon className="w-10 h-10 text-[#4573A2]" /></div>
                <h1 className="text-2xl font-semibold text-gray-900">Ihr Termin</h1>
                {termin ? (
                  <>
                    <div className="mt-4 bg-gradient-to-br from-emerald-50 to-emerald-50/50 border border-emerald-200 rounded-2xl p-5">
                      <p className="text-xs uppercase tracking-wider text-emerald-700 mb-1">Termin reserviert</p>
                      <p className="text-lg font-bold text-gray-900">
                        {new Date(termin.datum).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                      <p className="text-sm text-gray-700">
                        {new Date(termin.datum).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                      </p>
                      {termin.svName && <p className="mt-3 text-sm text-gray-600">Sachverständiger: <strong>{termin.svName}</strong></p>}
                      <p className="mt-3 text-xs text-gray-500">Wir erinnern Sie 24h vorher per WhatsApp.</p>
                    </div>

                    {/* AAR-231: Vorbereitungs-Checkliste */}
                    <div className="mt-5 bg-[#4573A2]/5 border border-[#4573A2]/20 rounded-2xl p-5 space-y-3">
                      <p className="text-sm font-semibold text-[#0D1B3E]">Bitte vor dem Termin vorbereiten:</p>
                      <CheckItem emoji="📍" text="Fahrzeug an der Besichtigungsadresse bereitstellen" done />
                      <CheckItem emoji="🔑" text="Fahrzeugschlüssel + Fahrzeugpapiere bereithalten" done />
                      <CheckItem emoji="📞" text="Unter Ihrer Telefonnummer erreichbar sein" done />

                      {vorbereitung && !vorbereitung.zb1Hochgeladen && (
                        <CheckItem
                          emoji="📄"
                          text="Fahrzeugschein noch nicht hochgeladen — bitte vor dem Termin hochladen."
                          done={false}
                          action={() => setStepIndex(3)}
                        />
                      )}
                      {vorbereitung?.polizeiVorOrt && !vorbereitung.polizeiberichtHochgeladen && (
                        <CheckItem
                          emoji="🚔"
                          text="Polizeibericht hochladen (falls schon vorhanden)."
                          done={false}
                          action={() => setStepIndex(3)}
                        />
                      )}
                      {vorbereitung?.personenschaden && !vorbereitung.attestHochgeladen && (
                        <CheckItem
                          emoji="🏥"
                          text="Ärztliches Attest hochladen (falls vorhanden)."
                          done={false}
                          action={() => setStepIndex(3)}
                        />
                      )}
                      {vorbereitung?.hatVorschaeden && (
                        <CheckItem
                          emoji="⚠️"
                          text="Reparaturrechnungen für Vorschäden bereithalten."
                          done={false}
                          action={() => setStepIndex(3)}
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-gray-500">Wir suchen gerade einen passenden Sachverständigen für Sie. Sobald wir einen Termin haben, melden wir uns per WhatsApp.</p>
                )}
                <button
                  onClick={() => setStepIndex(3)}
                  className="mt-6 w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base active:scale-[0.98] transition-all"
                >Weiter</button>
              </div>
            )}

            {/* Dokumente — AAR-323: Katalog-driven Status-Übersicht */}
            {currentStep.id === 'dokumente' && (
              <div>
                <div className="mb-4"><FileTextIcon className="w-10 h-10 text-[#4573A2]" /></div>
                <h1 className="text-2xl font-semibold text-gray-900">Pflichtdokumente</h1>
                <p className="mt-2 text-sm text-gray-500">
                  Laden Sie Ihre Unterlagen hoch. Sie können das auch später im Dashboard nachholen.
                </p>
                <div className="mt-5 space-y-3">
                  {pflichtDocs.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">Keine Pflichtdokumente erforderlich.</p>
                  )}
                  {pflichtDocs.map(doc => {
                    const status = docStatus[doc.id] ?? 'ausstehend'
                    const istHochgeladen = status === 'hochgeladen'
                    const istAbgelehnt = status === 'abgelehnt'
                    const loading = uploadingId === doc.id
                    const label = doc.label || LEGACY_DOKTYP_LABELS[doc.slot_id] || doc.slot_id
                    const acceptString = doc.akzeptierte_mime_types.join(',')
                    const fristText = doc.frist ? new Date(doc.frist).toLocaleDateString('de-DE', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                    }) : null
                    return (
                      <div
                        key={doc.id}
                        className={`rounded-xl border p-3 ${
                          istHochgeladen ? 'bg-emerald-50 border-emerald-200'
                          : istAbgelehnt ? 'bg-rose-50 border-rose-200'
                          : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                            istHochgeladen ? 'bg-emerald-500 text-white'
                            : istAbgelehnt ? 'bg-rose-500 text-white'
                            : 'bg-gray-100 text-gray-400'
                          }`}>
                            {istHochgeladen ? <CheckIcon className="w-4 h-4" />
                              : istAbgelehnt ? <AlertCircleIcon className="w-4 h-4" />
                              : <UploadCloudIcon className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-gray-900">{label}</p>
                              {doc.pflicht && !istHochgeladen && (
                                <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Pflicht</span>
                              )}
                              {istHochgeladen && (
                                <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Hochgeladen</span>
                              )}
                              {istAbgelehnt && (
                                <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">Abgelehnt</span>
                              )}
                            </div>
                            {doc.beschreibung && (
                              <p className="text-xs text-gray-500 mt-0.5">{doc.beschreibung}</p>
                            )}
                            {doc.begruendung && (
                              <p className="text-xs text-gray-700 mt-1 italic">„{doc.begruendung}"</p>
                            )}
                            {fristText && (
                              <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                                <ClockIcon className="w-3 h-3" /> Frist: {fristText}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action-Buttons — ausstehend/abgelehnt: Upload; hochgeladen: Ersetzen */}
                        <div className="mt-2.5 flex gap-2">
                          {!istHochgeladen && (
                            <>
                              <label className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-[#0D1B3E] text-white hover:bg-[#1E3A5F] cursor-pointer text-center">
                                {loading ? 'Lädt...' : '📷 Foto aufnehmen'}
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  disabled={loading}
                                  onChange={e => {
                                    const f = e.target.files?.[0]
                                    if (f) handleFileUpload(doc.id, f)
                                  }}
                                />
                              </label>
                              <label className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-white border border-[#0D1B3E] text-[#0D1B3E] hover:bg-blue-50 cursor-pointer text-center">
                                📁 Datei wählen
                                <input
                                  type="file"
                                  accept={acceptString}
                                  className="hidden"
                                  disabled={loading}
                                  onChange={e => {
                                    const f = e.target.files?.[0]
                                    if (f) handleFileUpload(doc.id, f)
                                  }}
                                />
                              </label>
                            </>
                          )}
                          {istHochgeladen && (
                            <label className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 cursor-pointer inline-flex items-center gap-1.5">
                              <RefreshCwIcon className="w-3 h-3" />
                              {loading ? 'Lädt...' : 'Ersetzen'}
                              <input
                                type="file"
                                accept={acceptString}
                                className="hidden"
                                disabled={loading}
                                onChange={e => {
                                  const f = e.target.files?.[0]
                                  if (f) handleFileUpload(doc.id, f)
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* AAR-166: ZB1-OCR-Ergebnis inline anzeigen nach Fahrzeugschein-Upload */}
                {zb1Result && (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-center gap-2">
                      <SparklesIcon className="w-4 h-4 text-emerald-600" />
                      <p className="text-sm font-semibold text-emerald-900">
                        Fahrzeugschein automatisch ausgelesen
                      </p>
                    </div>
                    <p className="text-[11px] text-emerald-800 mt-1">
                      {zb1Result.fieldsFound} Felder erkannt
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                      {zb1Result.extracted.kennzeichen && (
                        <div><span className="text-emerald-700 block">Kennzeichen</span><span className="font-medium text-gray-900">{zb1Result.extracted.kennzeichen}</span></div>
                      )}
                      {zb1Result.extracted.fin_vin && (
                        <div><span className="text-emerald-700 block">FIN</span><span className="font-mono font-medium text-gray-900">{zb1Result.extracted.fin_vin}</span></div>
                      )}
                      {zb1Result.extracted.fahrzeug_hersteller && (
                        <div><span className="text-emerald-700 block">Marke</span><span className="font-medium text-gray-900">{zb1Result.extracted.fahrzeug_hersteller}</span></div>
                      )}
                      {zb1Result.extracted.fahrzeug_modell && (
                        <div><span className="text-emerald-700 block">Modell</span><span className="font-medium text-gray-900">{zb1Result.extracted.fahrzeug_modell}</span></div>
                      )}
                      {zb1Result.extracted.halter_nachname && (
                        <div className="col-span-2"><span className="text-emerald-700 block">Halter</span><span className="font-medium text-gray-900">{zb1Result.extracted.halter_vorname} {zb1Result.extracted.halter_nachname}</span></div>
                      )}
                    </div>
                    <p className="text-[10px] text-emerald-700 mt-3 italic">
                      Daten wurden gespeichert. Falsche Werte? Einfach über die Betreuung melden.
                    </p>
                  </div>
                )}
                {pflichtBlocked.length > 0 && (
                  <p className="mt-4 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    Sie koennen jetzt fortfahren — fehlende Pflicht-Dokumente ({pflichtBlocked.length}) koennen Sie im Dashboard nachreichen.
                  </p>
                )}
                <button
                  onClick={() => setStepIndex(4)}
                  className="mt-4 w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base active:scale-[0.98] transition-all"
                >Weiter</button>
              </div>
            )}

            {/* Weitere Dokumente — AAR-324: conditional Slots aus dokument_katalog */}
            {currentStep.id === 'weitere-dokumente' && (
              <div>
                <div className="mb-4"><FolderOpenIcon className="w-10 h-10 text-[#4573A2]" /></div>
                <h1 className="text-2xl font-semibold text-gray-900">Weitere Dokumente</h1>
                <p className="mt-2 text-sm text-gray-500">
                  Optional — laden Sie weitere Dokumente oder Fotos hoch, die zu Ihrem Fall passen.
                  Sie können diesen Schritt auch überspringen und später im Dashboard nachreichen.
                </p>

                {/* Katalog-Slots nach Kategorie gruppiert */}
                <div className="mt-5 space-y-5">
                  {KATEGORIE_REIHENFOLGE.map(kat => {
                    const slotsInKat = freieSlots.filter(s => s.kategorie === kat)
                    if (slotsInKat.length === 0) return null
                    const katMeta = KATEGORIE_LABELS[kat]
                    return (
                      <div key={kat}>
                        <p className="text-xs font-semibold text-[#0D1B3E] uppercase tracking-wider mb-2">
                          {katMeta.emoji} {katMeta.label}
                        </p>
                        <div className="space-y-2.5">
                          {slotsInKat.map(slot => {
                            const count = slotCounts[slot.slot_id] ?? 0
                            const hochgeladen = count > 0
                            const loading = uploadingSlot === slot.slot_id
                            // multi_file=false + bereits 1 hochgeladen → Upload-Button wird zu "Ersetzen"
                            const kannMehr = slot.multi_file || count === 0
                            const acceptString = slot.akzeptierte_mime_types.join(',')
                            return (
                              <div
                                key={slot.slot_id}
                                className={`rounded-xl border p-3 ${
                                  hochgeladen ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                                    hochgeladen ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'
                                  }`}>
                                    {hochgeladen ? <CheckIcon className="w-4 h-4" /> : <UploadCloudIcon className="w-4 h-4" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-sm font-medium text-gray-900">{slot.label}</p>
                                      {hochgeladen && (
                                        <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                          {slot.multi_file ? `${count} hochgeladen` : 'Hochgeladen'}
                                        </span>
                                      )}
                                    </div>
                                    {slot.beschreibung && (
                                      <p className="text-xs text-gray-500 mt-0.5">{slot.beschreibung}</p>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-2.5 flex gap-2">
                                  {kannMehr && (
                                    <>
                                      <label className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-[#0D1B3E] text-white hover:bg-[#1E3A5F] cursor-pointer text-center">
                                        {loading ? 'Lädt...' : '📷 Foto aufnehmen'}
                                        <input
                                          type="file"
                                          accept="image/*"
                                          capture="environment"
                                          className="hidden"
                                          disabled={loading}
                                          onChange={e => {
                                            const f = e.target.files?.[0]
                                            if (f) handleFreiUpload(slot.slot_id, f)
                                            e.target.value = ''
                                          }}
                                        />
                                      </label>
                                      <label className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-white border border-[#0D1B3E] text-[#0D1B3E] hover:bg-blue-50 cursor-pointer text-center">
                                        {loading ? 'Lädt...' : '📁 Datei wählen'}
                                        <input
                                          type="file"
                                          accept={acceptString}
                                          className="hidden"
                                          disabled={loading}
                                          onChange={e => {
                                            const f = e.target.files?.[0]
                                            if (f) handleFreiUpload(slot.slot_id, f)
                                            e.target.value = ''
                                          }}
                                        />
                                      </label>
                                    </>
                                  )}
                                  {!kannMehr && (
                                    <label className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 cursor-pointer inline-flex items-center gap-1.5">
                                      <RefreshCwIcon className="w-3 h-3" />
                                      {loading ? 'Lädt...' : 'Ersetzen'}
                                      <input
                                        type="file"
                                        accept={acceptString}
                                        className="hidden"
                                        disabled={loading}
                                        onChange={e => {
                                          const f = e.target.files?.[0]
                                          if (f) handleFreiUpload(slot.slot_id, f)
                                          e.target.value = ''
                                        }}
                                      />
                                    </label>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}

                  {/* Sonstiges — immer sichtbar, nutzt kunde-nachreichung Slot */}
                  <div>
                    <p className="text-xs font-semibold text-[#0D1B3E] uppercase tracking-wider mb-2">
                      📎 Sonstiges
                    </p>
                    <div className="rounded-xl border border-gray-200 bg-white p-3">
                      <p className="text-sm font-medium text-gray-900">Andere Datei hochladen</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Alles was zu Ihrem Fall gehört und oben nicht auftaucht — z.B. Rechnungen, Berichte, Fotos.
                        Ihr Betreuer ordnet die Datei anschließend zu.
                      </p>
                      <div className="mt-2.5">
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">
                          Worum geht es? (optional)
                        </label>
                        <textarea
                          value={sonstigesBeschreibung}
                          onChange={e => setSonstigesBeschreibung(e.target.value)}
                          rows={2}
                          placeholder="z.B. 'Attest vom Hausarzt, erhalten am 15.04.'"
                          className="w-full text-xs rounded-md border border-gray-200 px-2 py-1.5 outline-none focus:border-[#4573A2]"
                          maxLength={500}
                        />
                      </div>
                      {sonstigesCount > 0 && (
                        <p className="mt-2 text-[11px] text-emerald-700 flex items-center gap-1">
                          <CheckIcon className="w-3 h-3" /> {sonstigesCount} Datei{sonstigesCount === 1 ? '' : 'en'} hochgeladen
                        </p>
                      )}
                      {sonstigesError && (
                        <p className="mt-2 text-[11px] text-rose-700 flex items-center gap-1">
                          <AlertCircleIcon className="w-3 h-3" /> {sonstigesError}
                        </p>
                      )}
                      <div className="mt-2.5 flex gap-2">
                        <label className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-[#0D1B3E] text-white hover:bg-[#1E3A5F] cursor-pointer text-center">
                          {uploadingSlot === '__sonstiges__' ? 'Lädt...' : '📷 Foto aufnehmen'}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            disabled={uploadingSlot === '__sonstiges__'}
                            onChange={e => {
                              const f = e.target.files?.[0]
                              if (f) handleFreiUpload(null, f, sonstigesBeschreibung)
                              e.target.value = ''
                            }}
                          />
                        </label>
                        <label className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-white border border-[#0D1B3E] text-[#0D1B3E] hover:bg-blue-50 cursor-pointer text-center">
                          {uploadingSlot === '__sonstiges__' ? 'Lädt...' : '📁 Datei wählen'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/heic,application/pdf"
                            className="hidden"
                            disabled={uploadingSlot === '__sonstiges__'}
                            onChange={e => {
                              const f = e.target.files?.[0]
                              if (f) handleFreiUpload(null, f, sonstigesBeschreibung)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setStepIndex(5)}
                  className="mt-5 w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base active:scale-[0.98] transition-all"
                >Weiter</button>
                <button
                  onClick={() => setStepIndex(5)}
                  className="mt-2 w-full py-3 text-xs text-gray-500 hover:text-gray-700"
                >Überspringen</button>
              </div>
            )}

            {/* Fertig */}
            {currentStep.id === 'fertig' && (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                  <CheckIcon className="w-8 h-8 text-emerald-500" />
                </div>
                <h1 className="text-2xl font-semibold text-gray-900">Sie sind startklar!</h1>
                <p className="mt-3 text-sm text-gray-500">
                  Im Dashboard sehen Sie Ihren Fall-Status, Nachrichten und Termine.
                  Wir melden uns bei wichtigen Updates per WhatsApp.
                </p>
                <button
                  onClick={handleFinish}
                  disabled={pending}
                  className="mt-6 w-full min-h-14 py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base disabled:opacity-50 active:scale-[0.98] transition-all"
                >
                  {pending ? 'Moment...' : 'Zum Dashboard'}
                </button>
              </div>
            )}
          </div>
        </div>

        {stepIndex > 0 && stepIndex < STEPS.length - 1 && (
          <div className="pt-2">
            <button
              onClick={() => setStepIndex(stepIndex - 1)}
              className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >Zurück</button>
          </div>
        )}
      </div>
    </div>
  )
}

// AAR-231: Checkliste-Item im Termin-Step.
// done=true → grüner Haken, done=false → oranges Icon + optionaler action-Button.
function CheckItem({
  emoji, text, done, action,
}: {
  emoji: string
  text: string
  done: boolean
  action?: () => void
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-base shrink-0 mt-0.5">{done ? '✅' : emoji}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${done ? 'text-gray-600' : 'text-gray-800 font-medium'}`}>{text}</p>
        {!done && action && (
          <button
            type="button"
            onClick={action}
            className="mt-1 text-xs text-[#4573A2] underline hover:text-[#1E3A5F]"
          >
            Jetzt hochladen →
          </button>
        )}
      </div>
    </div>
  )
}
