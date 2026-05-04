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
  markiereAlleSpaeterNachreichen,
  type PflichtdokumentStand,
  type FreierSlot,
} from './actions'
import type { ClaimFull } from '@/lib/claims/types'
import { getOffeneDokumentAnforderungen } from '@/lib/claims/data-requirements'
// CMM-33: Zentrale PflichtdokumenteSection — gleicher Bucket / Component
// wie Detail-Page + Banner. Ersetzt die alte Per-Slot-Upload-UI im
// Wizard-Step.
import PflichtdokumenteSection, { type PflichtSlotForView } from '@/components/fall/PflichtdokumenteSection'

type Fall = { id: string; fall_nummer: string | null; kennzeichen: string | null; fahrzeug: string }
type Termin = { datum: string; svName: string | null; ort: string | null }
// AAR-323: PflichtDoc ist jetzt der Katalog-angereicherte Stand (siehe actions.ts).
type PflichtDoc = PflichtdokumentStand

// AAR-324: Schritt 'weitere-dokumente' kommt NACH dem Pflicht-Step. Zeigt
// alle katalog-gefilterten, conditional freigeschalteten Slots (Attest bei
// Personenschaden, Zeugenbericht bei zeugen_vorhanden, Mietwagenrechnung bei
// mietwagen_flag etc.) — alle optional.
// CMM-21: Step 'weitere-dokumente' entfernt — alle Dokumenten-Anforderungen
// (Pflicht + optional) sammeln wir in einem Pop-over auf dem 'dokumente'-Step.
const STEPS = [
  { id: 'welcome', label: 'Willkommen' },
  { id: 'fall', label: 'Ihr Fall' },
  { id: 'termin', label: 'Termin' },
  { id: 'dokumente', label: 'Dokumente' },
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

export default function OnboardingWizard({
  vorname, fall, claim, termin, pflichtDocs, pflichtSlots = [], freieSlots,
}: {
  vorname: string
  fall: Fall | null
  claim: ClaimFull | null
  termin: Termin | null
  pflichtDocs: PflichtDoc[]
  /** CMM-33: Slot-Sicht (PflichtSlotForView[]) — wird für die zentrale
   *  PflichtdokumenteSection genutzt. */
  pflichtSlots?: PflichtSlotForView[]
  freieSlots: FreierSlot[]
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
  const [spaeterAlleLoading, setSpaeterAlleLoading] = useState(false)

  const currentStep = STEPS[stepIndex]

  // CMM-21: Smart-Filter — Pflichtdokumente nur zeigen wenn die Bedingung
  // im Claim erfüllt ist (Polizeibericht nur wenn polizei_vor_ort=true,
  // Attest nur bei Personenschaden, etc.). Die Anforderungs-Liste mappt
  // 1:1 auf bestehende pflichtDocs — Slots die nicht relevant sind werden
  // nicht angezeigt.
  const dokAnforderungen = claim
    ? getOffeneDokumentAnforderungen(claim, pflichtDocs)
    : []
  const relevanteSlotIds = new Set(dokAnforderungen.map((a) => a.slot_id))
  const relevantePflichtDocs = claim
    ? pflichtDocs.filter((d) => relevanteSlotIds.has(d.slot_id))
    : pflichtDocs
  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100)

  // AAR-166: ZB1-OCR-Ergebnis pro Dokument anzeigen (derzeit nur fahrzeugschein)
  const [zb1Result, setZb1Result] = useState<{
    extracted: Record<string, string | null>
    message: string
    fieldsFound: number
  } | null>(null)

  // CMM-21: lokaler File-Counter pro Slot — wird optimistisch nach jedem
  // erfolgreichen Upload hochgezählt damit der Kunde direktes Feedback hat,
  // ohne page-refresh zu brauchen.
  const [fileCountOverride, setFileCountOverride] = useState<Record<string, number>>({})

  // CMM-21: Multi-File-Upload — Datei-Picker erlaubt jetzt N Files,
  // wir loopen sequentiell durch die FileList und feuern handleFileUpload
  // pro Datei. Bei multi_file=false greift nur die erste Datei (Replace-
  // Semantik bleibt für Slots wie Fahrzeugschein erhalten).
  function handleFilesUpload(dokId: string, files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    const doc = pflichtDocs.find((d) => d.id === dokId)
    const isMulti = !!doc?.multi_file
    const toUpload = isMulti ? list : list.slice(0, 1)
    for (const f of toUpload) handleFileUpload(dokId, f)
  }

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
        if (res.success) {
          setDocStatus((prev) => ({ ...prev, [dokId]: 'hochgeladen' }))
          // CMM-21: optimistisch File-Counter hochzählen
          setFileCountOverride((prev) => ({
            ...prev,
            [dokId]: (prev[dokId] ?? pflichtDocs.find((d) => d.id === dokId)?.hochgeladene_anzahl ?? 0) + 1,
          }))
        }
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

  function handleAlleSpaeterNachreichen() {
    if (!fall?.id) return
    setSpaeterAlleLoading(true)
    startTransition(async () => {
      const res = await markiereAlleSpaeterNachreichen(fall.id)
      if (res.success) setStepIndex(4)
      setSpaeterAlleLoading(false)
    })
  }

  function handleFinish() {
    startTransition(async () => {
      await completeOnboarding(fall?.id)
      router.push('/kunde')
      router.refresh()
    })
  }

  // CMM-21: Block-Logik nutzt nur die für den Claim relevanten Slots —
  // ein Polizeibericht ist kein Blocker wenn polizei_vor_ort=false.
  const pflichtBlocked = relevantePflichtDocs.filter(d => d.pflicht && docStatus[d.id] !== 'hochgeladen')

  // CMM-33: Block-Logik auf Basis der zentralen Slot-Sicht (PflichtSlotForView).
  // Wird parallel zur alten relevantePflichtDocs-Logik geführt; sobald CMM-35
  // den Wizard komplett auf die Section migriert, fällt die alte Berechnung weg.
  const pflichtBlockedSlots = pflichtSlots.filter((s) => s.pflicht && s.status !== 'erfuellt')

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
                <h1 className="text-2xl font-semibold text-claimondo-navy">Ihr Schadenfall</h1>
                <p className="mt-2 text-sm text-claimondo-ondo">
                  Wir haben Ihre Daten aus dem Telefonat bereits aufgenommen. Bitte prüfen Sie kurz und bestätigen Sie unten.
                </p>

                {/* CMM-19: Fall-Header mit Fall-Nummer + Kennzeichen + Fahrzeug */}
                {fall && (
                  <div className="mt-5 rounded-2xl bg-claimondo-navy text-white p-5">
                    <p className="text-[11px] uppercase tracking-wider text-white/60 mb-1">Fall-Nummer</p>
                    <p className="text-xl font-bold">{fall.fall_nummer ?? fall.id.slice(0, 8)}</p>
                    {(fall.kennzeichen || fall.fahrzeug) && (
                      <p className="text-sm text-white/80 mt-2">
                        {[fall.fahrzeug, fall.kennzeichen].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                )}

                {/* CMM-19: Navy-Cards mit Schadensdaten aus Claim-SSoT */}
                {claim && (
                  <div className="mt-4 space-y-3">
                    <ClaimDataCard title="Schadensereignis">
                      {claim.schadentag && (
                        <DataRow label="Datum" value={new Date(claim.schadentag).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: 'long', year: 'numeric' })} />
                      )}
                      {claim.schadenzeit && <DataRow label="Uhrzeit" value={String(claim.schadenzeit).slice(0, 5)} />}
                      {claim.schadenort_adresse && (
                        <DataRow label="Ort" value={formatOrt(claim.schadenort_adresse, claim.schadenort_plz, claim.schadenort_ort)} />
                      )}
                      {claim.schadenart && <DataRow label="Schadenart" value={prettyEnum(String(claim.schadenart))} />}
                      {claim.unfall_konstellation && <DataRow label="Konstellation" value={prettyEnum(String(claim.unfall_konstellation))} />}
                      {claim.hergang_kunde_text && <DataRow label="Hergang" value={String(claim.hergang_kunde_text)} multiline />}
                    </ClaimDataCard>

                    {(claim.hat_personenschaden || claim.hat_sachschaden || claim.hat_mietwagen || claim.hat_nutzungsausfall) && (
                      <ClaimDataCard title="Schadens-Umfang">
                        {claim.hat_personenschaden && <DataRow label="Personenschaden" value="ja" />}
                        {claim.hat_sachschaden && <DataRow label="Sachschaden" value="ja" />}
                        {claim.hat_mietwagen && <DataRow label="Mietwagen-Bedarf" value="ja" />}
                        {claim.hat_nutzungsausfall && <DataRow label="Nutzungsausfall" value="ja" />}
                        {claim.sachschaden_beschreibung && <DataRow label="Sachschaden-Detail" value={String(claim.sachschaden_beschreibung)} multiline />}
                      </ClaimDataCard>
                    )}

                    {claim.gegner_bekannt && (() => {
                      const verursacher = (claim.parties ?? []).find(p => p.rolle === 'verursacher')
                      const gegnerName = verursacher
                        ? [verursacher.vorname, verursacher.nachname].filter(Boolean).join(' ').trim() || verursacher.nachname
                        : null
                      const gegnerVs = verursacher?.versicherung_klartext ?? null
                      const gegnerKz = verursacher?.kennzeichen ?? null
                      return (
                        <ClaimDataCard title="Unfallgegner">
                          {gegnerName && <DataRow label="Name" value={gegnerName} />}
                          {gegnerVs && <DataRow label="Versicherung" value={gegnerVs} />}
                          {gegnerKz && <DataRow label="Kennzeichen" value={gegnerKz} />}
                          {claim.gegner_versicherungsnummer && <DataRow label="VS-Nummer" value={String(claim.gegner_versicherungsnummer)} />}
                          {claim.gegner_aktenzeichen && <DataRow label="Schaden-Nr (Gegner)" value={String(claim.gegner_aktenzeichen)} />}
                          {claim.anzahl_beteiligte_total > 1 && (
                            <DataRow label="Beteiligte" value={String(claim.anzahl_beteiligte_total)} />
                          )}
                        </ClaimDataCard>
                      )
                    })()}

                    {(claim.polizei_vor_ort || claim.polizei_aktenzeichen) && (
                      <ClaimDataCard title="Polizei">
                        {claim.polizei_vor_ort && <DataRow label="Vor Ort gewesen" value="ja" />}
                        {claim.polizei_aktenzeichen && <DataRow label="Aktenzeichen" value={String(claim.polizei_aktenzeichen)} />}
                      </ClaimDataCard>
                    )}
                  </div>
                )}

                {/* Korrekturhinweis */}
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                  Sind Daten oben nicht korrekt? Bitte rufen Sie Ihren Kundenbetreuer
                  zurück — wir tragen Korrekturen für Sie ein.
                </div>

                <button
                  onClick={() => setStepIndex(2)}
                  className="mt-6 w-full min-h-14 py-4 rounded-2xl bg-claimondo-navy hover:bg-claimondo-ondo text-white font-semibold text-base active:scale-[0.98] transition-all"
                >
                  Daten bestätigen und weiter
                </button>
              </div>
            )}

            {/* Termin + AAR-231: Vorbereitungs-Checkliste */}
            {currentStep.id === 'termin' && (
              <div>
                <div className="mb-4"><CalendarIcon className="w-10 h-10 text-claimondo-ondo" /></div>
                <h1 className="text-2xl font-semibold text-claimondo-navy">Ihr Termin</h1>
                {termin ? (
                  <div className="mt-4 bg-gradient-to-br from-emerald-50 to-emerald-50/50 border border-emerald-200 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                        <CheckIcon className="w-4 h-4" />
                      </div>
                      <p className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">Termin verbindlich bestätigt</p>
                    </div>
                    <p className="text-lg font-bold text-claimondo-navy">
                      {new Date(termin.datum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-sm font-medium text-claimondo-navy">
                      {new Date(termin.datum).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })} Uhr
                    </p>
                    {termin.ort && (
                      <p className="mt-3 text-sm text-claimondo-navy flex items-start gap-1.5">
                        <span className="mt-0.5">📍</span>
                        <span>{termin.ort}</span>
                      </p>
                    )}
                    {termin.svName && (
                      <p className="mt-2 text-sm text-claimondo-navy flex items-center gap-1.5">
                        <span>👤</span>
                        <span>Sachverständiger: <strong>{termin.svName}</strong></span>
                      </p>
                    )}
                    <div className="mt-4 pt-4 border-t border-emerald-200">
                      <p className="text-xs text-claimondo-ondo leading-relaxed">
                        💡 Bitte tragen Sie sich den Termin in Ihren Kalender ein. Wir erinnern Sie zusätzlich 24 Stunden vorher per WhatsApp.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-claimondo-ondo">Wir suchen gerade einen passenden Sachverständigen für Sie. Sobald wir einen Termin haben, melden wir uns per WhatsApp.</p>
                )}
                <button
                  onClick={() => setStepIndex(3)}
                  className="mt-6 w-full min-h-14 py-4 rounded-2xl bg-claimondo-shield hover:bg-claimondo-ondo text-white font-semibold text-base active:scale-[0.98] transition-all"
                >Weiter</button>
              </div>
            )}

            {/* Dokumente — CMM-21: Smart-gefilterte Pflicht-Cards */}
            {currentStep.id === 'dokumente' && (
              <div>
                <div className="mb-4"><FileTextIcon className="w-10 h-10 text-claimondo-ondo" /></div>
                <h1 className="text-2xl font-semibold text-claimondo-navy">Dokumente</h1>
                <p className="mt-2 text-sm text-claimondo-ondo">
                  Aus Ihrem Schadenfall haben wir die folgenden Unterlagen vorbereitet.
                  Sie können jetzt hochladen oder den Schritt überspringen und alles
                  später im Portal nachreichen.
                </p>

                {/* CMM-33: Zentrale PflichtdokumenteSection — gleiche
                    Drag&Drop-Slot-Cards wie Detail-Page und Banner-Pop-over.
                    Liest und schreibt aus dem gleichen Bucket. */}
                <div className="mt-5">
                  {fall?.id ? (
                    pflichtSlots.length === 0 ? (
                      <p className="text-sm text-claimondo-ondo/70 text-center py-4 rounded-xl bg-claimondo-border/30">
                        Keine Dokumente erforderlich — Sie sind fertig.
                      </p>
                    ) : (
                      <PflichtdokumenteSection
                        slots={pflichtSlots}
                        fallId={fall.id}
                        rolle="kunde"
                        variant="card"
                      />
                    )
                  ) : (
                    <p className="text-sm text-amber-700 text-center py-4 rounded-xl bg-amber-50 border border-amber-200">
                      Fall wird vorbereitet — bitte einen Moment.
                    </p>
                  )}
                </div>

                {/* CMM-35: Reste der alten Per-Slot-UI (ZB1-OCR-Result,
                    Foto-Aufnehmen, Info-Overlay, Optional-Slots-Section,
                    Sonstiges-Upload, später-nachreichen pro Slot) ist
                    auskommentiert in dieser Welle und kommt mit dem
                    vollständigen Wizard-Refactor zurück. */}
                {false && relevantePflichtDocs.length === 0 && null}

                {/* CMM-21: zwei gleichwertige Buttons — Weiter, oder den Step
                    skippen. handleAlleSpaeterNachreichen markiert alle offenen
                    Pflicht-Slots als "später nachreichen" (dedupe Reminder-Welle
                    48h) UND springt nach fertig. Wenn nichts offen ist, reicht
                    "Weiter". */}
                <button
                  onClick={() => setStepIndex(4)}
                  className="mt-5 w-full min-h-14 py-4 rounded-2xl bg-claimondo-shield hover:bg-claimondo-ondo text-white font-semibold text-base active:scale-[0.98] transition-all"
                >Weiter</button>
                {pflichtBlocked.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAlleSpaeterNachreichen}
                    disabled={spaeterAlleLoading}
                    className="mt-2 w-full min-h-12 py-3 rounded-xl bg-white border border-claimondo-border text-claimondo-navy hover:border-claimondo-ondo hover:text-claimondo-navy text-sm font-medium active:scale-[0.98] transition-all disabled:opacity-60"
                  >
                    {spaeterAlleLoading ? 'Wird gespeichert…' : 'Alle später nachreichen'}
                  </button>
                )}
              </div>
            )}

            {/* CMM-21: weitere-dokumente-Step entfernt — Optional-Slots wandern in das Pop-over auf dem dokumente-Step. */}

            {/* Fertig */}
            {currentStep.id === 'fertig' && (() => {
              // CMM-22: zwei Endings basierend auf offenen Pflicht-Slots.
              // Grün = alles erfüllt; Gelb = der Kunde hat geskippt (oder
              // Pflicht-Slots existieren noch). Im gelben Fall schiebt der
              // Banner im Layout das Re-Engagement.
              //
              // CMM-33 Fix: pflichtSlots nutzen statt pflichtDocs + docStatus.
              // PflichtdokumenteSection-Uploads aktualisieren docStatus nicht —
              // sie rufen router.refresh(), wodurch pflichtSlots als Prop neu
              // vom Server kommt. d.status via ?? war nie erreichbar weil
              // docStatus[d.id] immer defined ist (initialisiert als 'ausstehend').
              const offenePflicht = pflichtSlots.filter(
                (s) => s.pflicht && s.status !== 'erfuellt',
              ).length
              const allesErfuellt = offenePflicht === 0
              return (
                <div className="text-center">
                  {allesErfuellt ? (
                    <>
                      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                        <CheckIcon className="w-8 h-8 text-emerald-500" />
                      </div>
                      <h1 className="text-2xl font-semibold text-claimondo-navy">Sie sind startklar!</h1>
                      <p className="mt-3 text-sm text-claimondo-ondo">
                        Im Dashboard sehen Sie Ihren Fall-Status, Nachrichten und Termine.
                        Wir melden uns bei wichtigen Updates per WhatsApp.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
                        <AlertCircleIcon className="w-8 h-8 text-amber-500" />
                      </div>
                      <h1 className="text-2xl font-semibold text-claimondo-navy">Alles klar</h1>
                      <p className="mt-3 text-sm text-claimondo-ondo">
                        Bitte reichen Sie schnellstmöglich die noch fehlenden{' '}
                        <span className="font-semibold text-claimondo-navy">
                          {offenePflicht}{' '}
                          {offenePflicht === 1 ? 'Unterlage' : 'Unterlagen'}
                        </span>{' '}
                        nach. Sie sehen den Hinweis oben in Ihrem Portal — ein Klick
                        bringt Sie direkt zurück in den Upload-Bereich.
                      </p>
                    </>
                  )}
                  <button
                    onClick={handleFinish}
                    disabled={pending}
                    className={`mt-6 w-full min-h-14 py-4 rounded-2xl text-white font-semibold text-base disabled:opacity-50 active:scale-[0.98] transition-all ${
                      allesErfuellt
                        ? 'bg-claimondo-shield hover:bg-claimondo-ondo'
                        : 'bg-amber-500 hover:bg-amber-600'
                    }`}
                  >
                    {pending ? 'Moment...' : 'Zum Dashboard'}
                  </button>
                </div>
              )
            })()}
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
// CMM-19: Pretty-Format für Enum-Werte (auffahrunfall → Auffahrunfall, haftpflicht → Haftpflicht)
function prettyEnum(value: string): string {
  if (!value) return value
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// CMM-19: Schadensort-Format ohne doppelte PLZ (Lead-Free-Text enthält oft schon PLZ)
function formatOrt(adresse: string | null, plz: string | null, ort: string | null): string {
  const parts: string[] = []
  if (adresse) parts.push(adresse)
  // PLZ + Ort nur wenn die Adresse die PLZ nicht schon enthält
  const plzOrt = [plz, ort].filter(Boolean).join(' ').trim()
  if (plzOrt && !(plz && adresse?.includes(plz))) parts.push(plzOrt)
  return parts.join(', ')
}

// CMM-19: Navy-Card für Step 1 — pre-filled Claim-Daten Read-only.
function ClaimDataCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-claimondo-navy/5 border border-claimondo-navy/20 p-4">
      <p className="text-[11px] uppercase tracking-wider text-claimondo-navy/70 font-semibold mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function DataRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className={multiline ? 'flex flex-col gap-0.5' : 'flex items-baseline gap-2'}>
      <span className="text-[11px] text-claimondo-ondo">{label}:</span>
      <span className={`text-sm text-claimondo-navy ${multiline ? 'leading-snug' : 'font-medium'}`}>{value}</span>
    </div>
  )
}

