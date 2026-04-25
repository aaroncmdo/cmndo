'use client'

// AAR-100: 5-Step Onboarding Wizard
// AAR-125: Deep-Link via ?step=dokumente springt direkt in Step 3 (Dokumente)
import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CheckIcon, UploadCloudIcon, CalendarIcon, FileTextIcon, SparklesIcon, FolderOpenIcon,
  AlertCircleIcon, ClockIcon, RefreshCwIcon, InfoIcon, XIcon,
} from 'lucide-react'
import {
  completeOnboarding,
  uploadPflichtdokument,
  uploadKundenDokument,
  markiereSpaeterNachreichen,
  markiereAlleSpaeterNachreichen,
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

// AAR-365: Erklärungs-Texte pro Dokument-Slot für das ⓘ Info-Overlay.
// "warum" = was wird damit gemacht, "wo" = praktischer Hinweis zur Beschaffung.
// Keys MÜSSEN exakt den slot_ids aus dokument_katalog (AAR-321 Seed +
// AAR-353 Korrektur) entsprechen — sonst greift nur der Fallback.
const DOC_INFO: Record<string, { warum: string; wo: string }> = {
  fahrzeugschein: {
    warum: 'Wir benötigen die Zulassungsbescheinigung Teil I (ZB1), um Halter, Kennzeichen und Fahrzeugdaten für das Gutachten und die Versicherung zu verifizieren.',
    wo: 'Den Fahrzeugschein finden Sie im Fahrzeug (oft im Handschuhfach) oder bei Ihren persönlichen Unterlagen. Beide Seiten als Foto reichen.',
  },
  fuehrerschein: {
    warum: 'Wir benötigen den Führerschein zur Identifikation des Fahrers zum Unfallzeitpunkt.',
    wo: 'Ihren Führerschein haben Sie in der Regel bei sich — Vorder- und Rückseite als Foto reichen.',
  },
  polizeibericht: {
    warum: 'Der Polizeibericht belegt den Unfallhergang gegenüber der gegnerischen Versicherung und beschleunigt die Regulierung erheblich.',
    wo: 'Die polizeiliche Unfallmitteilung erhalten Sie direkt am Unfallort von der Polizei oder nachträglich bei der zuständigen Dienststelle (oft online anforderbar).',
  },
  schadensfotos: {
    warum: 'Fotos aller Schadenstellen dokumentieren Ausmaß und Position — Grundlage für Kalkulation und spätere Beweisführung.',
    wo: 'Machen Sie Fotos aus mehreren Perspektiven direkt am Fahrzeug — Nah- und Übersichtsaufnahmen helfen besonders.',
  },
  zeugenbericht: {
    warum: 'Zeugenaussagen stärken Ihre Position bei strittiger Haftung und können die Regulierung deutlich beschleunigen.',
    wo: 'Der Zeuge kann den Bericht formlos schreiben oder unser Formular nutzen — wichtig sind Name, Adresse und Schilderung des Ablaufs.',
  },
  aerztliches_attest: {
    warum: 'Ein ärztliches Attest dokumentiert Ihre Verletzungen und ist Grundlage für Schmerzensgeld und Heilbehandlungskosten.',
    wo: 'Lassen Sie sich von Ihrem Hausarzt oder der behandelnden Klinik ein Attest über Art und Dauer der Verletzungen ausstellen.',
  },
  diagnosebericht: {
    warum: 'Die ärztliche Diagnose konkretisiert Verletzungsart und Heilungsdauer — wichtig für Schmerzensgeld-Bemessung.',
    wo: 'Den Bericht erhalten Sie von dem Arzt, der Sie nach dem Unfall untersucht hat.',
  },
  krankenhausbericht: {
    warum: 'Bei stationärer Behandlung belegt der Krankenhausbericht Schwere und Dauer der Verletzung.',
    wo: 'Den Entlassungsbericht erhalten Sie vom Krankenhaus — oft auch nachträglich anforderbar.',
  },
  au_bescheinigung: {
    warum: 'Die Arbeitsunfähigkeitsbescheinigung belegt Verdienstausfall durch den Unfall.',
    wo: 'Die AU-Bescheinigung bekommen Sie von Ihrem behandelnden Arzt — bei längerer AU mehrere Nachweise.',
  },
  reparaturrechnungen_vorschaeden: {
    warum: 'Vorschäden müssen dokumentiert sein, damit der Gutachter den neuen Schaden korrekt bewerten kann. Ohne Nachweis können Vorschäden vom aktuellen Schaden abgezogen werden.',
    wo: 'Die Rechnungen bekommen Sie von der Werkstatt, die den früheren Schaden repariert hat — oft auch nachträglich als Duplikat per E-Mail.',
  },
  vorschaden_bericht: {
    warum: 'Der SV-Bericht zu früheren Schäden grenzt Alt- von Neuschaden ab — schützt vor Kürzungen durch die Versicherung.',
    wo: 'Falls Sie damals ein Gutachten hatten, liegt der Bericht bei Ihren Unterlagen — oder anfordern beim damaligen Sachverständigen.',
  },
  mietwagenrechnung: {
    warum: 'Die Mietwagenkosten werden von der gegnerischen Versicherung erstattet, wenn der Zeitraum und die Klasse nachgewiesen sind.',
    wo: 'Die Rechnung erhalten Sie von der Mietwagenfirma — meist am Ende der Mietdauer per E-Mail.',
  },
  freigabe_bank: {
    warum: 'Bei finanzierten oder geleasten Fahrzeugen muss die Bank der Abrechnung zustimmen — ohne Freigabe darf die Versicherung nicht direkt an Sie zahlen.',
    wo: 'Die Freigabe erhalten Sie von Ihrer finanzierenden Bank oder Leasinggesellschaft — oft per Online-Formular oder E-Mail anforderbar.',
  },
  sa_vollmacht: {
    warum: 'Mit der Sicherungsabtretung treten Sie Ihre Ansprüche an Claimondo ab, damit wir die Regulierung direkt für Sie führen können.',
    wo: 'Das Dokument bekommen Sie von uns per E-Mail oder im Portal — Sie müssen nur unterschreiben und hochladen.',
  },
}
const DOC_INFO_DEFAULT = {
  warum: 'Dieses Dokument hilft uns, Ihren Schaden schneller und vollständiger zu regulieren.',
  wo: 'Bei Fragen wo Sie das Dokument herbekommen, wenden Sie sich an Ihren Betreuer — wir helfen gerne.',
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
  // AAR-365: Aktuell offenes Info-Overlay — { slotId, label } oder null.
  const [infoOverlay, setInfoOverlay] = useState<{ slotId: string; label: string } | null>(null)
  // AAR-390: Slot-IDs die der Kunde auf „später nachreichen" gesetzt hat.
  // Server-Action setzt spaeter_nachreichen_markiert_am; UI markiert sie
  // lokal sofort, damit der Kunde visuell Feedback bekommt ohne Reload.
  const [spaeterSlots, setSpaeterSlots] = useState<Set<string>>(new Set())
  const [spaeterLoading, setSpaeterLoading] = useState<string | null>(null)
  const [spaeterAlleLoading, setSpaeterAlleLoading] = useState(false)

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

  // AAR-390: Kunde verschiebt einen einzelnen Pflicht-Slot auf später.
  // Status bleibt 'ausstehend' (pflichtBlocked bleibt gesetzt), Reminder-Crons
  // überspringen den Slot aber für 48h.
  function handleSpaeterNachreichen(pflichtdokumentId: string) {
    if (!fall?.id) return
    setSpaeterLoading(pflichtdokumentId)
    startTransition(async () => {
      const res = await markiereSpaeterNachreichen(fall.id, pflichtdokumentId)
      if (res.success) {
        setSpaeterSlots(prev => new Set(prev).add(pflichtdokumentId))
      }
      setSpaeterLoading(null)
    })
  }

  function handleAlleSpaeterNachreichen() {
    if (!fall?.id) return
    setSpaeterAlleLoading(true)
    startTransition(async () => {
      const res = await markiereAlleSpaeterNachreichen(fall.id)
      if (res.success) {
        const next = new Set<string>(spaeterSlots)
        for (const d of pflichtDocs) {
          if (docStatus[d.id] !== 'hochgeladen') next.add(d.id)
        }
        setSpaeterSlots(next)
        setStepIndex(4)
      }
      setSpaeterAlleLoading(false)
    })
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
      <div className="fixed top-0 inset-x-0 z-10 h-1.5 bg-[#f8f9fb]">
        <div className="h-full bg-claimondo-ondo transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {/* Step Indicator */}
      <div className="fixed top-4 left-0 right-0 z-10 flex justify-center">
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                i < stepIndex ? 'bg-emerald-500 text-white' :
                i === stepIndex ? 'bg-claimondo-ondo text-white' :
                'bg-claimondo-border text-claimondo-ondo/70'
              }`}>
                {i < stepIndex ? <CheckIcon className="w-3.5 h-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`w-6 h-0.5 rounded ${i < stepIndex ? 'bg-emerald-400' : 'bg-claimondo-border'}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col px-5 pt-16 pb-8 max-w-lg mx-auto w-full">
        <div className="flex-1 flex flex-col justify-center py-4">
          <div className="bg-white border border-claimondo-border rounded-3xl px-6 py-7 shadow-xl shadow-black/5">
            {/* Welcome */}
            {currentStep.id === 'welcome' && (
              <div>
                <div className="mb-4"><SparklesIcon className="w-10 h-10 text-claimondo-ondo" /></div>
                <h1 className="text-2xl font-semibold text-claimondo-navy leading-snug">Willkommen bei Claimondo, {vorname}!</h1>
                <p className="mt-3 text-sm text-claimondo-ondo leading-relaxed">
                  Wir kuemmern uns ab jetzt um die komplette Abwicklung Ihres Schadens.
                  Dieser kurze Einstieg zeigt Ihnen Ihre naechsten Schritte — dauert ca. 3 Minuten.
                </p>
                <button
                  onClick={() => setStepIndex(1)}
                  className="mt-6 w-full min-h-14 py-4 rounded-2xl bg-claimondo-shield hover:bg-claimondo-ondo text-white font-semibold text-base active:scale-[0.98] transition-all"
                >Los geht&apos;s</button>
              </div>
            )}

            {/* Fall */}
            {currentStep.id === 'fall' && (
              <div>
                <div className="mb-4"><FolderOpenIcon className="w-10 h-10 text-claimondo-ondo" /></div>
                <h1 className="text-2xl font-semibold text-claimondo-navy">Ihr Fall</h1>
                {fall ? (
                  <div className="mt-4 bg-gradient-to-br from-claimondo-ondo/10 to-claimondo-shield/5 border border-claimondo-ondo/20 rounded-2xl p-5">
                    <p className="text-xs uppercase tracking-wider text-claimondo-ondo mb-1">Fall-Nummer</p>
                    <p className="text-xl font-bold text-claimondo-navy">{fall.fall_nummer ?? fall.id.slice(0, 8)}</p>
                    {fall.kennzeichen && <p className="text-sm text-claimondo-ondo mt-1">{fall.kennzeichen}</p>}
                    {fall.fahrzeug && <p className="text-xs text-claimondo-ondo">{fall.fahrzeug}</p>}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-claimondo-ondo">Ihr Fall wird gerade angelegt — Sie sehen ihn in wenigen Minuten.</p>
                )}
                <div className="mt-6 space-y-2">
                  <p className="text-sm font-medium text-claimondo-navy">So laeuft es weiter:</p>
                  {STATUS_PHASES.map((phase, i) => (
                    <div key={phase.key} className="flex items-start gap-3 py-2">
                      <div className="w-6 h-6 rounded-full bg-claimondo-ondo/10 text-claimondo-ondo flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</div>
                      <div>
                        <p className="text-sm font-medium text-claimondo-navy">{phase.label}</p>
                        <p className="text-xs text-claimondo-ondo">{phase.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setStepIndex(2)}
                  className="mt-6 w-full min-h-14 py-4 rounded-2xl bg-claimondo-shield hover:bg-claimondo-ondo text-white font-semibold text-base active:scale-[0.98] transition-all"
                >Weiter</button>
              </div>
            )}

            {/* Termin + AAR-231: Vorbereitungs-Checkliste */}
            {currentStep.id === 'termin' && (
              <div>
                <div className="mb-4"><CalendarIcon className="w-10 h-10 text-claimondo-ondo" /></div>
                <h1 className="text-2xl font-semibold text-claimondo-navy">Ihr Termin</h1>
                {termin ? (
                  <>
                    <div className="mt-4 bg-gradient-to-br from-emerald-50 to-emerald-50/50 border border-emerald-200 rounded-2xl p-5">
                      <p className="text-xs uppercase tracking-wider text-emerald-700 mb-1">Termin reserviert</p>
                      <p className="text-lg font-bold text-claimondo-navy">
                        {new Date(termin.datum).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                      <p className="text-sm text-claimondo-navy">
                        {new Date(termin.datum).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                      </p>
                      {termin.svName && <p className="mt-3 text-sm text-claimondo-ondo">Sachverständiger: <strong>{termin.svName}</strong></p>}
                      <p className="mt-3 text-xs text-claimondo-ondo">Wir erinnern Sie 24h vorher per WhatsApp.</p>
                    </div>

                    {/* AAR-231: Vorbereitungs-Checkliste
                        AAR-390: Auf kleinen Screens kann der Block durch die
                        conditional CheckItems (Vorschaeden/Polizei/Attest)
                        schnell länger werden als der Viewport und den Weiter-
                        Button nach unten drücken. max-h + overflow-y + Sticky-
                        Header sorgen für einen stabilen, scrollbaren Block
                        ohne die Step-Höhe zu sprengen. */}
                    <div className="mt-5 bg-claimondo-ondo/5 border border-claimondo-ondo/20 rounded-2xl p-5 space-y-3 max-h-[60vh] overflow-y-auto">
                      <p className="sticky top-0 -mx-5 -mt-5 px-5 pt-5 pb-2 bg-[#eef2f8] text-sm font-semibold text-claimondo-navy z-10">
                        Bitte vor dem Termin vorbereiten:
                      </p>
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
                  <p className="mt-4 text-sm text-claimondo-ondo">Wir suchen gerade einen passenden Sachverständigen für Sie. Sobald wir einen Termin haben, melden wir uns per WhatsApp.</p>
                )}
                <button
                  onClick={() => setStepIndex(3)}
                  className="mt-6 w-full min-h-14 py-4 rounded-2xl bg-claimondo-shield hover:bg-claimondo-ondo text-white font-semibold text-base active:scale-[0.98] transition-all"
                >Weiter</button>
              </div>
            )}

            {/* Dokumente — AAR-323: Katalog-driven Status-Übersicht */}
            {currentStep.id === 'dokumente' && (
              <div>
                <div className="mb-4"><FileTextIcon className="w-10 h-10 text-claimondo-ondo" /></div>
                <h1 className="text-2xl font-semibold text-claimondo-navy">Pflichtdokumente</h1>
                <p className="mt-2 text-sm text-claimondo-ondo">
                  Laden Sie Ihre Unterlagen hoch. Sie können das auch später im Dashboard nachholen.
                </p>
                <div className="mt-5 space-y-3">
                  {pflichtDocs.length === 0 && (
                    <p className="text-sm text-claimondo-ondo/70 text-center py-4">Keine Pflichtdokumente erforderlich.</p>
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
                    // AAR-365: Card-Style prominenter — Amber-Border wenn offen,
                    // Grün wenn hochgeladen, Rose wenn abgelehnt. ⓘ oben rechts
                    // öffnet Info-Overlay mit "Warum?" + "Wo finde ich das?".
                    return (
                      <div
                        key={doc.id}
                        className={`relative rounded-2xl border-2 p-4 transition-colors ${
                          istHochgeladen ? 'bg-emerald-50 border-emerald-300'
                          : istAbgelehnt ? 'bg-rose-50 border-rose-300'
                          : 'bg-amber-50/60 border-amber-300'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setInfoOverlay({ slotId: doc.slot_id, label })}
                          aria-label={`Info zu ${label}`}
                          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/80 border border-claimondo-border text-claimondo-ondo hover:text-claimondo-navy hover:border-claimondo-ondo flex items-center justify-center transition-colors"
                        >
                          <InfoIcon className="w-4 h-4" />
                        </button>
                        <div className="flex items-start gap-3 pr-9">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            istHochgeladen ? 'bg-emerald-500 text-white'
                            : istAbgelehnt ? 'bg-rose-500 text-white'
                            : 'bg-amber-500 text-white'
                          }`}>
                            {istHochgeladen ? <CheckIcon className="w-5 h-5" />
                              : istAbgelehnt ? <AlertCircleIcon className="w-5 h-5" />
                              : <UploadCloudIcon className="w-5 h-5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-base font-semibold text-claimondo-navy">{label}</p>
                              {doc.pflicht && !istHochgeladen && (
                                <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">Pflicht</span>
                              )}
                            </div>
                            <p className={`text-xs mt-0.5 font-medium ${
                              istHochgeladen ? 'text-emerald-700'
                              : istAbgelehnt ? 'text-rose-700'
                              : 'text-amber-700'
                            }`}>
                              {istHochgeladen ? '✓ Hochgeladen'
                                : istAbgelehnt ? '✗ Abgelehnt — bitte neu hochladen'
                                : 'Noch nicht hochgeladen'}
                            </p>
                            {doc.beschreibung && (
                              <p className="text-xs text-claimondo-ondo mt-1">{doc.beschreibung}</p>
                            )}
                            {doc.begruendung && (
                              <p className="text-xs text-claimondo-navy mt-1 italic">„{doc.begruendung}"</p>
                            )}
                            {fristText && (
                              <p className="text-xs text-amber-800 mt-1 flex items-center gap-1 font-medium">
                                <ClockIcon className="w-3 h-3" /> Frist: {fristText}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action-Buttons — ausstehend/abgelehnt: Upload; hochgeladen: Ersetzen */}
                        <div className="mt-3 flex gap-2">
                          {!istHochgeladen && (
                            <>
                              <label className="flex-1 min-h-11 text-sm font-semibold px-3 py-2.5 rounded-xl bg-claimondo-navy text-white hover:bg-claimondo-shield active:scale-[0.98] cursor-pointer text-center flex items-center justify-center gap-1.5 transition-all">
                                {loading ? 'Lädt...' : <><span>📷</span> Foto aufnehmen</>}
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
                              <label className="flex-1 min-h-11 text-sm font-semibold px-3 py-2.5 rounded-xl bg-white border-2 border-claimondo-navy text-claimondo-navy hover:bg-[#f8f9fb] active:scale-[0.98] cursor-pointer text-center flex items-center justify-center gap-1.5 transition-all">
                                <span>📁</span> Datei wählen
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
                            <label className="text-xs font-medium px-3 py-2 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 cursor-pointer inline-flex items-center gap-1.5">
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

                        {/* AAR-390: „Später nachreichen"-Link pro offenem Pflicht-Slot.
                            Nicht bei hochgeladenen Slots — und Text wechselt sobald markiert. */}
                        {!istHochgeladen && (
                          <div className="mt-2.5 text-right">
                            {spaeterSlots.has(doc.id) ? (
                              <span className="text-[11px] text-claimondo-ondo italic">
                                ✓ Auf später verschoben — wir erinnern Sie später.
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSpaeterNachreichen(doc.id)}
                                disabled={spaeterLoading === doc.id}
                                className="text-[11px] text-claimondo-ondo hover:text-claimondo-navy underline decoration-dotted underline-offset-2 disabled:opacity-50"
                              >
                                {spaeterLoading === doc.id ? 'Wird gespeichert…' : 'Später nachreichen'}
                              </button>
                            )}
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
                        <div><span className="text-emerald-700 block">Kennzeichen</span><span className="font-medium text-claimondo-navy">{zb1Result.extracted.kennzeichen}</span></div>
                      )}
                      {zb1Result.extracted.fin_vin && (
                        <div><span className="text-emerald-700 block">FIN</span><span className="font-mono font-medium text-claimondo-navy">{zb1Result.extracted.fin_vin}</span></div>
                      )}
                      {zb1Result.extracted.fahrzeug_hersteller && (
                        <div><span className="text-emerald-700 block">Marke</span><span className="font-medium text-claimondo-navy">{zb1Result.extracted.fahrzeug_hersteller}</span></div>
                      )}
                      {zb1Result.extracted.fahrzeug_modell && (
                        <div><span className="text-emerald-700 block">Modell</span><span className="font-medium text-claimondo-navy">{zb1Result.extracted.fahrzeug_modell}</span></div>
                      )}
                      {zb1Result.extracted.halter_nachname && (
                        <div className="col-span-2"><span className="text-emerald-700 block">Halter</span><span className="font-medium text-claimondo-navy">{zb1Result.extracted.halter_vorname} {zb1Result.extracted.halter_nachname}</span></div>
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
                  className="mt-4 w-full min-h-14 py-4 rounded-2xl bg-claimondo-shield hover:bg-claimondo-ondo text-white font-semibold text-base active:scale-[0.98] transition-all"
                >Weiter</button>
                {/* AAR-390: Shortcut für Kunden ohne Dokumente zur Hand — markiert
                    alle offenen Pflicht-Slots als „später nachreichen" und springt
                    direkt in den optionalen Step 4. pflicht bleibt pflicht, W2-Gate
                    bleibt zu — wir dedupe nur die Reminder-Welle für 48h. */}
                {pflichtBlocked.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAlleSpaeterNachreichen}
                    disabled={spaeterAlleLoading}
                    className="mt-2 w-full min-h-11 py-3 rounded-xl bg-white border border-claimondo-border text-claimondo-navy hover:border-claimondo-ondo hover:text-claimondo-navy text-sm font-medium active:scale-[0.98] transition-all disabled:opacity-60"
                  >
                    {spaeterAlleLoading
                      ? 'Wird gespeichert…'
                      : `Alle Pflichtdokumente (${pflichtBlocked.length}) später nachreichen`}
                  </button>
                )}
              </div>
            )}

            {/* Weitere Dokumente — AAR-324: conditional Slots aus dokument_katalog */}
            {currentStep.id === 'weitere-dokumente' && (
              <div>
                <div className="mb-4"><FolderOpenIcon className="w-10 h-10 text-claimondo-ondo" /></div>
                <h1 className="text-2xl font-semibold text-claimondo-navy">Weitere Dokumente</h1>
                <p className="mt-2 text-sm text-claimondo-ondo">
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
                        <p className="text-xs font-semibold text-claimondo-navy uppercase tracking-wider mb-2">
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
                            // AAR-365: Auch Optional-Slots mit ⓘ Info-Button ausstatten.
                            const hasInfo = !!DOC_INFO[slot.slot_id]
                            return (
                              <div
                                key={slot.slot_id}
                                className={`relative rounded-xl border p-3 ${
                                  hochgeladen ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-claimondo-border'
                                }`}
                              >
                                {hasInfo && (
                                  <button
                                    type="button"
                                    onClick={() => setInfoOverlay({ slotId: slot.slot_id, label: slot.label })}
                                    aria-label={`Info zu ${slot.label}`}
                                    className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-white/80 border border-claimondo-border text-claimondo-ondo hover:text-claimondo-navy hover:border-claimondo-ondo flex items-center justify-center transition-colors"
                                  >
                                    <InfoIcon className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <div className={`flex items-start gap-3 ${hasInfo ? 'pr-8' : ''}`}>
                                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                                    hochgeladen ? 'bg-emerald-500 text-white' : 'bg-[#f8f9fb] text-claimondo-ondo/70'
                                  }`}>
                                    {hochgeladen ? <CheckIcon className="w-4 h-4" /> : <UploadCloudIcon className="w-4 h-4" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-sm font-medium text-claimondo-navy">{slot.label}</p>
                                      {hochgeladen && (
                                        <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                          {slot.multi_file ? `${count} hochgeladen` : 'Hochgeladen'}
                                        </span>
                                      )}
                                    </div>
                                    {slot.beschreibung && (
                                      <p className="text-xs text-claimondo-ondo mt-0.5">{slot.beschreibung}</p>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-2.5 flex gap-2">
                                  {kannMehr && (
                                    <>
                                      <label className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-claimondo-navy text-white hover:bg-claimondo-shield cursor-pointer text-center">
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
                                      <label className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-white border border-claimondo-navy text-claimondo-navy hover:bg-[#f8f9fb] cursor-pointer text-center">
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
                    <p className="text-xs font-semibold text-claimondo-navy uppercase tracking-wider mb-2">
                      📎 Sonstiges
                    </p>
                    <div className="rounded-xl border border-claimondo-border bg-white p-3">
                      <p className="text-sm font-medium text-claimondo-navy">Andere Datei hochladen</p>
                      <p className="text-xs text-claimondo-ondo mt-0.5">
                        Alles was zu Ihrem Fall gehört und oben nicht auftaucht — z.B. Rechnungen, Berichte, Fotos.
                        Ihr Betreuer ordnet die Datei anschließend zu.
                      </p>
                      <div className="mt-2.5">
                        <label className="block text-[11px] font-medium text-claimondo-ondo mb-1">
                          Worum geht es? (optional)
                        </label>
                        <textarea
                          value={sonstigesBeschreibung}
                          onChange={e => setSonstigesBeschreibung(e.target.value)}
                          rows={2}
                          placeholder="z.B. 'Attest vom Hausarzt, erhalten am 15.04.'"
                          className="w-full text-xs rounded-md border border-claimondo-border px-2 py-1.5 outline-none focus:border-claimondo-ondo"
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
                        <label className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-claimondo-navy text-white hover:bg-claimondo-shield cursor-pointer text-center">
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
                        <label className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-white border border-claimondo-navy text-claimondo-navy hover:bg-[#f8f9fb] cursor-pointer text-center">
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
                  className="mt-5 w-full min-h-14 py-4 rounded-2xl bg-claimondo-shield hover:bg-claimondo-ondo text-white font-semibold text-base active:scale-[0.98] transition-all"
                >Weiter</button>
                <button
                  onClick={() => setStepIndex(5)}
                  className="mt-2 w-full py-3 text-xs text-claimondo-ondo hover:text-claimondo-navy"
                >Überspringen</button>
              </div>
            )}

            {/* Fertig */}
            {currentStep.id === 'fertig' && (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                  <CheckIcon className="w-8 h-8 text-emerald-500" />
                </div>
                <h1 className="text-2xl font-semibold text-claimondo-navy">Sie sind startklar!</h1>
                <p className="mt-3 text-sm text-claimondo-ondo">
                  Im Dashboard sehen Sie Ihren Fall-Status, Nachrichten und Termine.
                  Wir melden uns bei wichtigen Updates per WhatsApp.
                </p>
                <button
                  onClick={handleFinish}
                  disabled={pending}
                  className="mt-6 w-full min-h-14 py-4 rounded-2xl bg-claimondo-shield hover:bg-claimondo-ondo text-white font-semibold text-base disabled:opacity-50 active:scale-[0.98] transition-all"
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
              className="w-full py-3 text-sm text-claimondo-ondo hover:text-claimondo-navy transition-colors"
            >Zurück</button>
          </div>
        )}
      </div>

      {/* AAR-365: Info-Overlay pro Dokument — Bottomsheet auf Mobile,
          zentriertes Modal auf Desktop. Schließt über Backdrop-Klick oder X. */}
      {infoOverlay && (
        <DokumentInfoOverlay
          slotId={infoOverlay.slotId}
          label={infoOverlay.label}
          onClose={() => setInfoOverlay(null)}
        />
      )}
    </div>
  )
}

// AAR-365: Info-Overlay für Upload-Slots. Zeigt "Warum?" + "Wo finde ich das?".
// Texte kommen aus DOC_INFO; unbekannte Slot-IDs nutzen DOC_INFO_DEFAULT.
function DokumentInfoOverlay({
  slotId, label, onClose,
}: {
  slotId: string
  label: string
  onClose: () => void
}) {
  const info = DOC_INFO[slotId] ?? DOC_INFO_DEFAULT
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Hinweise zu ${label}`}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 pb-8 sm:pb-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-claimondo-ondo/10 flex items-center justify-center">
              <InfoIcon className="w-5 h-5 text-claimondo-ondo" />
            </div>
            <p className="text-base font-semibold text-claimondo-navy">{label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="w-8 h-8 rounded-full hover:bg-[#f8f9fb] flex items-center justify-center text-claimondo-ondo"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo mb-1">
              Warum benötigen wir das?
            </p>
            <p className="text-sm text-claimondo-navy leading-relaxed">{info.warum}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo mb-1">
              Wo finde ich das?
            </p>
            <p className="text-sm text-claimondo-navy leading-relaxed">{info.wo}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full py-3 rounded-xl bg-claimondo-navy hover:bg-claimondo-shield text-white font-semibold text-sm active:scale-[0.98] transition-all"
        >
          Verstanden
        </button>
      </div>
    </div>
  )
}

// AAR-231 / AAR-365: Checkliste-Item im Termin-Step.
// done=true → grüner Haken, done=false → Warn-Variante mit prominentem
// Upload-Button statt dem alten kleinen blauen Textlink (Nicolas-Feedback).
function CheckItem({
  emoji, text, done, action,
}: {
  emoji: string
  text: string
  done: boolean
  action?: () => void
}) {
  if (done) {
    return (
      <div className="flex items-start gap-2.5">
        <span className="text-base shrink-0 mt-0.5">✅</span>
        <p className="text-sm text-claimondo-ondo flex-1 min-w-0">{text}</p>
      </div>
    )
  }
  // Offener Punkt mit Action → hervorgehobene Zeile mit CTA-Button
  if (action) {
    return (
      <div className="flex items-start gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
        <span className="text-lg shrink-0 mt-0.5">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">{text}</p>
          <button
            type="button"
            onClick={action}
            className="mt-2 inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 active:scale-[0.98] transition-all"
          >
            Jetzt hochladen
          </button>
        </div>
      </div>
    )
  }
  // Offener Punkt ohne Action (z. B. „bereithalten")
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-base shrink-0 mt-0.5">{emoji}</span>
      <p className="text-sm text-claimondo-navy font-medium flex-1 min-w-0">{text}</p>
    </div>
  )
}
