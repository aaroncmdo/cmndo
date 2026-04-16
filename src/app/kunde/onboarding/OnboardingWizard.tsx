'use client'

// AAR-100: 5-Step Onboarding Wizard
// AAR-125: Deep-Link via ?step=dokumente springt direkt in Step 3 (Dokumente)
import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CheckIcon, UploadCloudIcon, CalendarIcon, FileTextIcon, SparklesIcon, FolderOpenIcon,
} from 'lucide-react'
import { completeOnboarding, uploadPflichtdokument } from './actions'

type Fall = { id: string; fall_nummer: string | null; kennzeichen: string | null; fahrzeug: string }
type Termin = { datum: string; svName: string | null }
type PflichtDoc = {
  id: string
  dokument_typ: string
  status: string | null
  pflicht: boolean
  dokument_url: string | null
  hochgeladen_am: string | null
}

const STEPS = [
  { id: 'welcome', label: 'Willkommen' },
  { id: 'fall', label: 'Ihr Fall' },
  { id: 'termin', label: 'Termin' },
  { id: 'dokumente', label: 'Dokumente' },
  { id: 'fertig', label: 'Fertig' },
] as const

// Konsistent zu admin/dispatch/actions.ts createPflichtdokumente — alle dort
// per add() erzeugten dokument_typ-Werte müssen hier ein schönes Label haben,
// sonst fällt der Wizard auf den raw dokument_typ zurück (z.B. "schadensfotos"
// statt "Schadensfotos"). Tippfehler aus der Vorversion korrigiert (schadenfotos
// → schadensfotos, atteste → aerztliches_attest) + Umlaute eingebaut (AAR-105).
const DOKTYP_LABELS: Record<string, string> = {
  // Identität
  personalausweis: 'Personalausweis',
  fuehrerschein: 'Führerschein',
  fahrzeugschein: 'Fahrzeugschein',
  // Schaden
  schadensfotos: 'Schadensfotos (mind. 4)',
  polizeibericht: 'Polizeibericht',
  // Medizin
  aerztliches_attest: 'Ärztliches Attest',
  krankenhausbericht: 'Krankenhausbericht',
  au_bescheinigung: 'AU-Bescheinigung',
  // Versicherung & Gegner
  eigene_versicherung: 'Eigene Versicherungspolice',
  versicherungspolice: 'Versicherungspolice',
  gegner_daten: 'Daten des Unfallgegners',
  // Halter / Geschäft
  leasingvertrag: 'Leasingvertrag',
  finanzierungsvertrag: 'Finanzierungsvertrag',
  gewerbenachweis: 'Gewerbenachweis',
  gf_vollmacht: 'Geschäftsführer-Vollmacht',
  halter_vollmacht: 'Halter-Vollmacht',
  halter_ausweis: 'Halter-Ausweis',
  // AAR-228: Vorschäden-Dokumentation
  reparaturrechnungen_vorschaeden: 'Reparaturrechnungen (Vorschäden)',
  // Allgemein
  vollmacht: 'Vollmacht',
  sicherungsabtretung: 'Sicherungsabtretung',
  mietvertrag: 'Mietvertrag / Eigentumsnachweis',
  kostenvoranschlag: 'Kostenvoranschlag',
  sonstiges: 'Sonstiges',
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
  vorname, fall, termin, pflichtDocs, vorbereitung,
}: {
  vorname: string
  fall: Fall | null
  termin: Termin | null
  pflichtDocs: PflichtDoc[]
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
  const [uploadedIds, setUploadedIds] = useState<Set<string>>(
    new Set(pflichtDocs.filter(d => d.dokument_url).map(d => d.id)),
  )

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
    const istFahrzeugschein = doc?.dokument_typ === 'fahrzeugschein'
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = typeof reader.result === 'string' ? reader.result : ''
      startTransition(async () => {
        const res = await uploadPflichtdokument(dokId, fall.id, base64, file.name, file.type)
        if (res.success) setUploadedIds((prev) => new Set(prev).add(dokId))
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

  function handleFinish() {
    startTransition(async () => {
      await completeOnboarding()
      router.push('/kunde')
      router.refresh()
    })
  }

  const pflichtBlocked = pflichtDocs.filter(d => d.pflicht && !uploadedIds.has(d.id))

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

            {/* Dokumente */}
            {currentStep.id === 'dokumente' && (
              <div>
                <div className="mb-4"><FileTextIcon className="w-10 h-10 text-[#4573A2]" /></div>
                <h1 className="text-2xl font-semibold text-gray-900">Dokumente</h1>
                <p className="mt-2 text-sm text-gray-500">
                  Laden Sie jetzt die benoetigten Unterlagen hoch. Sie koennen das auch spaeter im Dashboard nachholen.
                </p>
                <div className="mt-5 space-y-3">
                  {pflichtDocs.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">Keine Pflichtdokumente erforderlich.</p>
                  )}
                  {pflichtDocs.map(doc => {
                    const done = uploadedIds.has(doc.id)
                    const loading = uploadingId === doc.id
                    const label = DOKTYP_LABELS[doc.dokument_typ] ?? doc.dokument_typ
                    return (
                      <div key={doc.id} className={`flex items-center gap-3 p-3 rounded-xl border ${done ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}`}>
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                          {done ? <CheckIcon className="w-4 h-4" /> : <UploadCloudIcon className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{label}</p>
                          <p className="text-xs text-gray-500">{doc.pflicht ? 'Pflicht' : 'Optional'}</p>
                        </div>
                        {!done && (
                          <div className="flex flex-col gap-1.5 flex-shrink-0">
                            {/* AAR-303: Kamera-Direkt-Button (capture=environment)
                                + getrennter Datei-Wahl-Button. Mobile öffnet sofort
                                die Rückkamera; Desktop fällt auf normalen Picker. */}
                            <label className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-[#0D1B3E] text-white hover:bg-[#1E3A5F] cursor-pointer text-center">
                              {loading ? 'Lade...' : '📷 Foto'}
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
                            <label className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white border border-[#0D1B3E] text-[#0D1B3E] hover:bg-blue-50 cursor-pointer text-center">
                              📁 Datei
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                disabled={loading}
                                onChange={e => {
                                  const f = e.target.files?.[0]
                                  if (f) handleFileUpload(doc.id, f)
                                }}
                              />
                            </label>
                          </div>
                        )}
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
