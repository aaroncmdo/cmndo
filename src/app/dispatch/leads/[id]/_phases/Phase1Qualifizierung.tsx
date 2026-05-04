'use client'

// AAR-138 / W4: Phase 1 Qualifizierung. Ersetzt Schritt0HardGate.tsx.
// Basiert auf der alten Hard-Gate-Form, erweitert um:
//  - Q2: fahrzeug_fahrbereit-Toggle + Mietwagen-Hinweis bei Nicht-Fahrbereit
//  - Q2: Personenschaden-Checkbox auch bei sichtbarem Schaden (Auto-Hervorheben
//    bei schadentyp=auffahrunfall)
//  - Q3 KOMPLETT NEU: Polizei-vor-Ort Toggle → Polizeibericht-Frage →
//    Aktenzeichen-Freitext; rote Pflicht-Hervorhebung bei fahrerflucht=true
// Hat_haftpflicht bleibt im saveHardGate-Disqualifier für Legacy-Leads, wird
// aber in der neuen UI nicht mehr aktiv abgefragt — Q3 ist jetzt Polizei.

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
// AAR-176 P2-B: UnfallortKategorie-Import raus — die Spalte wird jetzt auto
// aus schadentyp abgeleitet (saveSchadentyp setzt kategorie mit, Dropdown
// ist in der UI weg).
import { saveHardGate, type HardGateData } from '../actions'
// AAR-316: Sprache wird separat via saveStammdaten persistiert (nicht HardGateData)
import { saveStammdaten } from '../actions'
import { useDispatchPhase } from '../_lib/phase-context'
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  MapPinIcon,
  ShieldAlertIcon,
  CarFrontIcon,
  UserPlusIcon,
  PackageIcon,
} from 'lucide-react'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
// AAR-175 P1-B: ExitSkript inline rendern sobald die MA Eigenverantwortung
// auswählt — vorher nur roter Einzeiler ohne konkrete Ausstiegsschritte,
// jetzt das volle 4-Punkte-Skript mit Copy-Button (Notion-Spec §2.Q1).
import ExitSkript from '../ExitSkript'
// AAR-358: Personenschäden-Detail-Formular (erscheint wenn personenschaden_flag=true)
import Phase1PersonenForm from './Phase1PersonenForm'

// AAR-179 Redundanz-Fix: EIN Array für Hergang-Buttons + Checkliste — vorher
// zwei parallele Arrays (prompts + matches) mit Drift-Risiko.
// `prompt` = was ins Textarea eingefügt wird, `match` = was die Checkliste
// als Substring sucht (ohne abschließendes „?"), `label` = kurzer Button-Text.
const HERGANG_BAUSTEINE = [
  { label: 'Wann?',      prompt: 'Wann ist es passiert? ',                            match: 'Wann ist es passiert' },
  { label: 'Wo?',        prompt: 'Wo ist es passiert (Straße/Ort)? ',                 match: 'Wo ist es passiert' },
  { label: 'Gegner?',    prompt: 'Wer war der Unfallgegner (Fahrzeug/Richtung)? ',    match: 'Wer war der Unfallgegner' },
  { label: 'Situation?', prompt: 'In welcher Situation — Ampel/Kreuzung/Parkplatz? ', match: 'In welcher Situation' },
  { label: 'Zeugen?',    prompt: 'Gab es Zeugen oder Dashcam-Aufnahmen? ',            match: 'Gab es Zeugen' },
] as const

type LeadFields = {
  id: string
  vorname?: string | null
  nachname?: string | null
  telefon?: string | null
  email?: string | null
  kunde_plz?: string | null
  kunde_strasse?: string | null
  kunde_stadt?: string | null
  notiz?: string | null
  unfallhergang?: string | null
  schuldfrage?: 'gegner' | 'unklar' | 'eigenverantwortung' | string | null
  aufklaerung_teilschuld_bestaetigt?: boolean | null
  schaden_sichtbar?: boolean | null
  personenschaden_flag?: boolean | null
  // AAR-357: Sachschäden an Dritten (Leitplanke, Zaun, Handy etc.)
  sachschaden_flag?: boolean | null
  sachschaden_beschreibung?: string | null
  mietwagen_flag?: boolean | null
  nutzungsausfall?: boolean | null
  unfallort?: string | null
  unfallort_lat?: number | null
  unfallort_lng?: number | null
  // CMM-26: Datum + Uhrzeit aus Phase 4 nach Phase 1 gezogen — sie gehören
  // zum Erstkontakt, nicht zu den Stammdaten.
  unfalldatum?: string | null
  unfall_uhrzeit?: string | null
  polizei_vor_ort?: boolean | null
  polizei_aktenzeichen?: string | null
  polizeibericht_pflicht?: boolean | null
  fahrzeug_fahrbereit?: boolean | null
  schadentyp?: string | null
  fahrerflucht?: boolean | null
  // AAR-316: Sprache des Kunden (ISO-Code)
  sprache?: string | null
  // Besichtigungsort — wird hier aus Phase 2 gezogen (sichtbar wenn nicht fahrbereit)
  besichtigungsort_adresse?: string | null
  besichtigungsort_lat?: number | null
  besichtigungsort_lng?: number | null
  besichtigungsort_place_id?: string | null
}

// AAR-316: Dropdown-Optionen — nur die 7 CHECK-Constraint-erlaubten Werte.
// Flags sind Unicode-Regional-Indicators (rendern als Flaggen-Emoji in allen
// aktuellen Browsern — ohne extra Asset-Load).
const SPRACHEN = [
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'tr', flag: '🇹🇷', label: 'Türkisch' },
  { code: 'ar', flag: '🇸🇦', label: 'Arabisch' },
  { code: 'ru', flag: '🇷🇺', label: 'Russisch' },
  { code: 'pl', flag: '🇵🇱', label: 'Polnisch' },
  { code: 'en', flag: '🇬🇧', label: 'Englisch' },
  { code: 'other', flag: '🌐', label: 'Andere' },
] as const

function KundendatenEditBlock({
  leadId,
  l,
  saveStammdaten: save,
  patchLead,
}: {
  leadId: string
  l: LeadFields
  saveStammdaten: typeof saveStammdaten
  patchLead: (patch: Record<string, unknown>) => void
}) {
  const [, startT] = useTransition()
  function field(name: keyof LeadFields, initial: string | null | undefined) {
    return {
      defaultValue: initial ?? '',
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const val = e.target.value.trim() || null
        if (val === (initial ?? null)) return
        // AAR-realtime: Provider-State patchen damit Qualification + Phase-
        // Gate den gerade eingegebenen Wert bei einem Phase-Wechsel sehen.
        patchLead({ [name]: val })
        startT(async () => { await save(leadId, { [name]: val }) })
      },
    }
  }
  return (
    <details className="group border border-claimondo-border rounded-lg" open>
      <summary className="flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-claimondo-ondo cursor-pointer list-none select-none hover:bg-[#f8f9fb] rounded-lg">
        Kundendaten bearbeiten
      </summary>
      <div className="px-3 pb-3 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-0.5">
          <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider block">Vorname</label>
          <input type="text" className="w-full text-sm px-2 py-1.5 border border-claimondo-border rounded-lg focus:outline-none focus:border-claimondo-ondo" {...field('vorname', l.vorname)} />
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider block">Nachname</label>
          <input type="text" className="w-full text-sm px-2 py-1.5 border border-claimondo-border rounded-lg focus:outline-none focus:border-claimondo-ondo" {...field('nachname', l.nachname)} />
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider block">Telefon</label>
          <input type="tel" className="w-full text-sm px-2 py-1.5 border border-claimondo-border rounded-lg focus:outline-none focus:border-claimondo-ondo" {...field('telefon', l.telefon)} />
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider block">E-Mail</label>
          <input type="email" className="w-full text-sm px-2 py-1.5 border border-claimondo-border rounded-lg focus:outline-none focus:border-claimondo-ondo" {...field('email', l.email)} />
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider block">Straße</label>
          <input type="text" className="w-full text-sm px-2 py-1.5 border border-claimondo-border rounded-lg focus:outline-none focus:border-claimondo-ondo" {...field('kunde_strasse', l.kunde_strasse)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-0.5">
            <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider block">PLZ</label>
            <input type="text" className="w-full text-sm px-2 py-1.5 border border-claimondo-border rounded-lg focus:outline-none focus:border-claimondo-ondo" {...field('kunde_plz', l.kunde_plz)} />
          </div>
          <div className="space-y-0.5">
            <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider block">Stadt</label>
            <input type="text" className="w-full text-sm px-2 py-1.5 border border-claimondo-border rounded-lg focus:outline-none focus:border-claimondo-ondo" {...field('kunde_stadt', l.kunde_stadt)} />
          </div>
        </div>
        <div className="sm:col-span-2 space-y-0.5">
          <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider block">Notiz (intern)</label>
          <textarea rows={2} className="w-full text-sm px-2 py-1.5 border border-claimondo-border rounded-lg focus:outline-none focus:border-claimondo-ondo resize-none" {...field('notiz', l.notiz)} />
        </div>
      </div>
    </details>
  )
}

export default function Phase1Qualifizierung() {
  const router = useRouter()
  const { lead, qualification, setPhase, patchLead } = useDispatchPhase()
  const l = lead as unknown as LeadFields
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<HardGateData & { polizeibericht_vorhanden?: boolean | null }>({
    unfallhergang: l.unfallhergang ?? '',
    schuldfrage: (l.schuldfrage as HardGateData['schuldfrage']) ?? undefined,
    aufklaerung_teilschuld_bestaetigt: l.aufklaerung_teilschuld_bestaetigt ?? false,
    schaden_sichtbar: l.schaden_sichtbar ?? undefined,
    personenschaden_flag: l.personenschaden_flag ?? false,
    sachschaden_flag: l.sachschaden_flag ?? false,
    sachschaden_beschreibung: l.sachschaden_beschreibung ?? '',
    mietwagen_flag: l.mietwagen_flag ?? false,
    nutzungsausfall: l.nutzungsausfall ?? false,
    unfallort: l.unfallort ?? '',
    unfallort_lat: l.unfallort_lat ?? null,
    unfallort_lng: l.unfallort_lng ?? null,
    unfalldatum: l.unfalldatum ?? '',
    unfall_uhrzeit: l.unfall_uhrzeit ?? '',
    polizei_vor_ort: l.polizei_vor_ort ?? undefined,
    polizei_aktenzeichen: l.polizei_aktenzeichen ?? '',
    polizeibericht_pflicht: l.polizeibericht_pflicht ?? undefined,
    fahrzeug_fahrbereit: l.fahrzeug_fahrbereit ?? undefined,
    polizeibericht_vorhanden:
      l.polizei_vor_ort === true ? (l.polizeibericht_pflicht ?? null) : null,
  })
  const [toast, setToast] = useState('')
  const [besichtigungsortAdresse, setBesichtigungsortAdresse] = useState(
    l.besichtigungsort_adresse ?? ''
  )
  const [besichtigungsortNotiz, setBesichtigungsortNotiz] = useState(
    (l as { besichtigungsort_notiz?: string | null }).besichtigungsort_notiz ?? ''
  )

  function saveBesichtigungsort(place: PlaceResult) {
    setBesichtigungsortAdresse(place.adresse)
    patchLead({
      besichtigungsort_adresse: place.adresse,
      besichtigungsort_lat: place.lat,
      besichtigungsort_lng: place.lng,
      besichtigungsort_place_id: place.place_id || null,
    } as Partial<typeof lead>)
    startTransition(async () => {
      await saveStammdaten(lead.id, {
        besichtigungsort_adresse: place.adresse,
        besichtigungsort_lat: place.lat,
        besichtigungsort_lng: place.lng,
        besichtigungsort_place_id: place.place_id || null,
      })
    })
  }

  function clearBesichtigungsort() {
    if (!besichtigungsortAdresse) return
    setBesichtigungsortAdresse('')
    patchLead({
      besichtigungsort_adresse: null,
      besichtigungsort_lat: null,
      besichtigungsort_lng: null,
      besichtigungsort_place_id: null,
    } as Partial<typeof lead>)
    startTransition(async () => {
      await saveStammdaten(lead.id, {
        besichtigungsort_adresse: null,
        besichtigungsort_lat: null,
        besichtigungsort_lng: null,
        besichtigungsort_place_id: null,
      })
    })
  }

  const q1Complete =
    !!draft.unfallhergang?.trim() &&
    !!draft.schuldfrage &&
    draft.schuldfrage !== 'eigenverantwortung' &&
    (draft.schuldfrage !== 'unklar' || draft.aufklaerung_teilschuld_bestaetigt === true)
  const q2Complete =
    draft.schaden_sichtbar === true ||
    draft.personenschaden_flag === true ||
    draft.mietwagen_flag === true ||
    draft.nutzungsausfall === true
  const q3Complete = draft.polizei_vor_ort === true || draft.polizei_vor_ort === false
  const allComplete = q1Complete && q2Complete && q3Complete

  async function save() {
    startTransition(async () => {
      const { polizeibericht_vorhanden, ...toSave } = draft
      // Wenn Polizei=Ja + Bericht vorhanden=Ja → pflicht=true, Aktenzeichen wird nicht
      // gebraucht. Wenn Bericht vorhanden=Nein → pflicht=false, Aktenzeichen bleibt
      // erhalten (Dispatcher kann Nummer notieren).
      if (toSave.polizei_vor_ort === true) {
        if (polizeibericht_vorhanden === true) {
          toSave.polizeibericht_pflicht = true
        } else if (polizeibericht_vorhanden === false) {
          toSave.polizeibericht_pflicht = false
        }
      }
      // AAR-realtime: Provider-State SOFORT patchen, damit die Qualification-
      // Engine + Phase-Gate bei einem Phase-Wechsel mit den frischen Werten
      // rechnen. router.refresh() danach bringt nur die Server-Props auf
      // Stand — die werden wegen Provider-useState nicht automatisch
      // übernommen, deshalb ist dieser optimistic patch kritisch.
      patchLead(toSave as Partial<typeof lead>)
      const r = await saveHardGate(lead.id, toSave)
      if (r.success) {
        setToast(r.disqualifiziert ? 'Disqualifiziert — Exit-Skript wird angezeigt' : 'Gespeichert')
        // AAR-268: Auto-Advance entfernt — MA muss explizit „Weiter zu Phase 2"
        // klicken (Kontrolle vor Sprung). Auto-Save bleibt im Hintergrund.
        router.refresh()
      } else {
        setToast(r.error ?? 'Fehler')
      }
      setTimeout(() => setToast(''), 3000)
    })
  }

  // AAR-192: Auto-Save mit 800ms Debounce bei jeder Änderung.
  // AAR-624: Frühere Version saved erst bei allComplete — Teileingaben gingen
  // verloren beim Phase-Wechsel. Jetzt speichern wir jedes Feld sofort mit
  // 800ms Debounce, damit der MA jederzeit zwischen Phasen wechseln kann.
  // autoSavedHash verhindert identische Re-Saves, initial = aktueller Hash
  // damit der Mount-Effekt keinen unnötigen Save triggert.
  const draftHash = JSON.stringify({
    unfallhergang: draft.unfallhergang,
    schuldfrage: draft.schuldfrage,
    aufklaerung_teilschuld_bestaetigt: draft.aufklaerung_teilschuld_bestaetigt,
    schaden_sichtbar: draft.schaden_sichtbar,
    personenschaden_flag: draft.personenschaden_flag,
    sachschaden_flag: draft.sachschaden_flag,
    sachschaden_beschreibung: draft.sachschaden_beschreibung,
    mietwagen_flag: draft.mietwagen_flag,
    nutzungsausfall: draft.nutzungsausfall,
    fahrzeug_fahrbereit: draft.fahrzeug_fahrbereit,
    polizei_vor_ort: draft.polizei_vor_ort,
    polizei_aktenzeichen: draft.polizei_aktenzeichen,
    polizeibericht_vorhanden: draft.polizeibericht_vorhanden,
    // unfallort bewusst NICHT im Hash — Phase 2 ist Owner des Unfallorts.
    // Beide Phases zu includen führte zu Überschreib-Race wenn Phase1 Unmount-
    // Flush feuert nachdem Phase2 bereits eine neue Adresse gespeichert hat.
    // CMM-26: Datum + Uhrzeit hingegen sind reine Phase-1-Felder.
    unfalldatum: draft.unfalldatum,
    unfall_uhrzeit: draft.unfall_uhrzeit,
  })
  const autoSavedHashRef = useRef<string>(draftHash)
  const draftRef = useRef(draft)
  useEffect(() => { draftRef.current = draft }, [draft])
  useEffect(() => {
    // AAR-203: NIE auto-speichern bei Eigenverantwortung — saveHardGate
    // würde den Lead sofort disqualifizieren bevor der MA das Exit-Skript
    // vorlesen konnte. MA muss manuell via Sidebar-Button „Disqualifizieren".
    if (draft.schuldfrage === 'eigenverantwortung') return
    if (autoSavedHashRef.current === draftHash) return
    const t = setTimeout(() => {
      autoSavedHashRef.current = draftHash
      save()
    }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftHash])

  // AAR-624: Unmount-Flush — falls MA innerhalb der 800ms-Debounce die Phase
  // wechselt, würde der Save-Timer gecleared und die Eingabe ginge verloren.
  // Beim Unmount den aktuellen Draft direkt in die DB schieben (fire-and-forget).
  useEffect(() => {
    return () => {
      const currentDraft = draftRef.current
      if (currentDraft.schuldfrage === 'eigenverantwortung') return
      const currentHash = JSON.stringify({
        unfallhergang: currentDraft.unfallhergang,
        schuldfrage: currentDraft.schuldfrage,
        aufklaerung_teilschuld_bestaetigt: currentDraft.aufklaerung_teilschuld_bestaetigt,
        schaden_sichtbar: currentDraft.schaden_sichtbar,
        personenschaden_flag: currentDraft.personenschaden_flag,
        sachschaden_flag: currentDraft.sachschaden_flag,
        sachschaden_beschreibung: currentDraft.sachschaden_beschreibung,
        mietwagen_flag: currentDraft.mietwagen_flag,
        nutzungsausfall: currentDraft.nutzungsausfall,
        fahrzeug_fahrbereit: currentDraft.fahrzeug_fahrbereit,
        polizei_vor_ort: currentDraft.polizei_vor_ort,
        polizei_aktenzeichen: currentDraft.polizei_aktenzeichen,
        polizeibericht_vorhanden: currentDraft.polizeibericht_vorhanden,
        // CMM-26: Datum + Uhrzeit auch im Unmount-Flush mitschreiben.
        unfalldatum: currentDraft.unfalldatum,
        unfall_uhrzeit: currentDraft.unfall_uhrzeit,
      })
      if (autoSavedHashRef.current === currentHash) return
      const { polizeibericht_vorhanden, ...toSave } = currentDraft
      if (toSave.polizei_vor_ort === true) {
        if (polizeibericht_vorhanden === true) toSave.polizeibericht_pflicht = true
        else if (polizeibericht_vorhanden === false) toSave.polizeibericht_pflicht = false
      }
      // AAR-realtime: Provider-State vor dem DB-Write patchen damit die
      // nächste Phase den aktuellen Stand sieht — der Provider lebt weiter
      // auch wenn Phase 1 unmountet.
      patchLead(toSave as Partial<typeof lead>)
      saveHardGate(lead.id, toSave).catch(err =>
        console.error('[AAR-624] unmount-flush saveHardGate failed:', err),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (qualification.disqualifiziert) {
    // Overlay kommt über DispatchShell → PhaseContent → DisqualifiziertOverlay;
    // hier bleiben wir defensiv still.
    return null
  }

  const isAuffahrunfall = l.schadentyp === 'auffahrunfall'
  const fahrerflucht = l.fahrerflucht === true

  return (
    <div className="glass-light border border-claimondo-border rounded-ios-md p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-claimondo-navy">Phase 1: Qualifizierung</h2>
        {allComplete ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
            <CheckCircleIcon className="w-3 h-3" /> Komplett
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
            {[q1Complete, q2Complete, q3Complete].filter(Boolean).length}/3
          </span>
        )}
      </div>

      {/* Kundendaten — Name, Kontakt, Adresse. onBlur-Save via saveStammdaten. */}
      <KundendatenEditBlock leadId={l.id} l={l} saveStammdaten={saveStammdaten} patchLead={patchLead as (p: Record<string, unknown>) => void} />

      {/* AAR-316: Sprache des Kunden. Steuert später FlowLink + Portal-Übersetzungen.
          Standard = Deutsch. Auto-Save on-change via saveStammdaten. */}
      <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-claimondo-border">
        <span className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70">
          Sprache des Kunden
        </span>
        <div className="flex gap-1 flex-wrap">
          {SPRACHEN.map((s) => {
            // `selected` aus Context-lead — patchLead() aktualisiert ihn
            // sofort optimistisch und überlebt Phase-Wechsel (kein Re-Init
            // beim Zurücknavigieren wie bei lokalem useState).
            const selected = (l.sprache ?? 'de') === s.code
            return (
              <button
                key={s.code}
                type="button"
                onClick={() => {
                  patchLead({ sprache: s.code } as Partial<typeof lead>)
                  startTransition(async () => {
                    const r = await saveStammdaten(l.id, { sprache: s.code })
                    if (r.success) {
                      router.refresh()
                    } else {
                      // Bei DB-Fehler: Revert im Context
                      patchLead({ sprache: l.sprache ?? 'de' } as Partial<typeof lead>)
                      setToast(r.error ?? 'Sprache konnte nicht gespeichert werden')
                      setTimeout(() => setToast(''), 3000)
                    }
                  })
                }}
                disabled={pending}
                className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                  selected
                    ? 'bg-claimondo-ondo text-white border-claimondo-ondo'
                    : 'bg-white text-claimondo-navy border-claimondo-border hover:bg-[#f8f9fb]'
                } disabled:opacity-60`}
                title={s.label}
              >
                <span className="mr-1">{s.flag}</span>
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Q1 — Unfallhergang + Verantwortlichkeit */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${q1Complete ? 'bg-green-500 text-white' : 'bg-claimondo-border text-claimondo-ondo'}`}>1</span>
          <h3 className="text-xs font-semibold text-claimondo-navy">Unfallhergang &amp; Verantwortlichkeit</h3>
        </div>
        {/* AAR-179 P3-G: Guided Bausteine — 5 Klick-Buttons erzeugen Prompt-
            Satzanfänge die der MA im Gespräch konkret abfragt. Die Checkliste
            darunter zeigt welche Bausteine schon im Text stehen.
            Redundanz-Fix: prompt + match kommen aus EINER Quelle (HERGANG_BAUSTEINE).
            `match` = `prompt.replace(/\s*[?:]?\s*$/, '')` — sprich der Prompt
            ohne abschließendes „?" und Leerzeichen. Drift ausgeschlossen. */}
        <div className="flex flex-wrap gap-1.5">
          {HERGANG_BAUSTEINE.map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={() =>
                setDraft((d) => {
                  const existing = d.unfallhergang ?? ''
                  if (existing.includes(b.match)) return d
                  return {
                    ...d,
                    unfallhergang: (existing ? existing + '\n' : '') + b.prompt,
                  }
                })
              }
              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#f8f9fb] text-claimondo-ondo border border-claimondo-border hover:bg-[#f8f9fb]"
              title={`„${b.prompt.trim()}" ans Textfeld anhängen`}
            >
              + {b.label}
            </button>
          ))}
        </div>
        <textarea
          value={draft.unfallhergang ?? ''}
          onChange={e => setDraft(d => ({ ...d, unfallhergang: e.target.value }))}
          className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm h-28 resize-none font-mono"
          placeholder={'Wie ist es passiert? (offene Beschreibung — Sprachregel: niemals „Schuld")'}
        />
        {/* AAR-261: Checkliste-Labels darunter entfernt — die Chips oben
            erfüllen beide Funktionen (Klick + Visual). Die Dopplung war
            visuell verwirrend. */}
        <div className="flex gap-2">
          {([
            { v: 'gegner', label: 'Gegner hat verursacht' },
            { v: 'unklar', label: 'Unklar / Teilbeteiligung' },
            { v: 'eigenverantwortung', label: 'Eigenverantwortung' },
          ] as const).map(o => (
            <button
              key={o.v}
              type="button"
              onClick={() => setDraft(d => ({ ...d, schuldfrage: o.v }))}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                draft.schuldfrage === o.v ? 'bg-claimondo-navy text-white' : 'bg-[#f8f9fb] text-claimondo-ondo hover:bg-claimondo-border'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {draft.schuldfrage === 'unklar' && (
          <label className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.aufklaerung_teilschuld_bestaetigt ?? false}
              onChange={e => setDraft(d => ({ ...d, aufklaerung_teilschuld_bestaetigt: e.target.checked }))}
              className="mt-0.5"
            />
            <span>
              <strong>Aufklärung Teilschuld:</strong> Ich habe den Kunden wörtlich aufgeklärt:
              <span className="block italic mt-1">
                „Wichtig: Wenn sich herausstellt, dass Sie eine Teilschuld hatten und das jetzt nicht erwähnen,
                kann das den Prozess erheblich verlängern — oder zu einer Kürzung der Versicherungsleistung führen.
                Deswegen ist es wichtig, dass wir den Hergang so genau wie möglich aufnehmen."
              </span>
            </span>
          </label>
        )}
        {draft.schuldfrage === 'eigenverantwortung' && (
          <>
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
              <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Eigenverantwortung = Kasko-Fall. Lead wird nach Speichern disqualifiziert.</span>
            </p>
            <ExitSkript grund="eigenverantwortung" />
          </>
        )}
      </div>

      {/* Q2 — Sichtbarer Schaden (+ Fahrbereit + Personenschaden) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${q2Complete ? 'bg-green-500 text-white' : 'bg-claimondo-border text-claimondo-ondo'}`}>2</span>
          <h3 className="text-xs font-semibold text-claimondo-navy">Wie sieht es mit Ihrem Auto aus — hat es was abgekriegt?</h3>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft(d => ({ ...d, schaden_sichtbar: true }))} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.schaden_sichtbar === true ? 'bg-claimondo-navy text-white' : 'bg-[#f8f9fb] text-claimondo-ondo'}`}>Ja — sichtbarer Schaden</button>
          <button type="button" onClick={() => setDraft(d => ({ ...d, schaden_sichtbar: false }))} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.schaden_sichtbar === false ? 'bg-claimondo-navy text-white' : 'bg-[#f8f9fb] text-claimondo-ondo'}`}>Nein / unklar</button>
        </div>

        {/* Bei Ja: Fahrbereit-Toggle (Spec §3 Q2 Unterfeld) */}
        {draft.schaden_sichtbar === true && (
          <div className="bg-[#f8f9fb] border border-claimondo-border rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <CarFrontIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
              <span className="text-[11px] font-semibold text-claimondo-navy">Fahrzeug noch fahrbereit?</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDraft(d => ({ ...d, fahrzeug_fahrbereit: true }))} className={`flex-1 px-3 py-1 rounded-lg text-[11px] font-medium ${draft.fahrzeug_fahrbereit === true ? 'bg-claimondo-ondo text-white' : 'bg-white border border-claimondo-border text-claimondo-ondo'}`}>Ja, fahrbereit</button>
              <button type="button" onClick={() => setDraft(d => ({ ...d, fahrzeug_fahrbereit: false }))} className={`flex-1 px-3 py-1 rounded-lg text-[11px] font-medium ${draft.fahrzeug_fahrbereit === false ? 'bg-claimondo-ondo text-white' : 'bg-white border border-claimondo-border text-claimondo-ondo'}`}>Nein</button>
            </div>
            {draft.fahrzeug_fahrbereit === false && (
              <>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
                  <p className="text-[11px] text-orange-800 font-medium">Mietwagen jetzt ansprechen — Anspruch gilt ab Unfalltag!</p>
                  <label className="flex items-center gap-1.5 text-[11px] text-orange-900 cursor-pointer mt-1.5">
                    <input type="checkbox" checked={draft.mietwagen_flag ?? false} onChange={e => setDraft(d => ({ ...d, mietwagen_flag: e.target.checked }))} className="w-3.5 h-3.5" />
                    Kunde will Mietwagen
                  </label>
                </div>
                {/* Besichtigungsadresse: Fahrzeug steht irgendwo — SV muss hinfahren */}
                <div className="bg-[#f8f9fb] border border-claimondo-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPinIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                    <span className="text-[11px] font-semibold text-claimondo-navy">Wo steht das Fahrzeug?</span>
                    {besichtigungsortAdresse && (
                      <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 ml-auto shrink-0" />
                    )}
                  </div>
                  <p className="text-[10px] text-claimondo-ondo">
                    Adresse wo der Gutachter das Fahrzeug besichtigen soll (Werkstatt, Stellplatz …).
                    Leer lassen = SV fährt zum Unfallort.
                  </p>
                  <GooglePlaceAutocomplete
                    defaultValue={besichtigungsortAdresse}
                    placeholder="Werkstatt / Stellplatz-Adresse"
                    onSelect={saveBesichtigungsort}
                    onBlur={(current) => { if (!current.trim()) clearBesichtigungsort() }}
                    className="w-full px-2 py-1.5 border border-claimondo-border rounded-lg text-xs"
                  />
                  <textarea
                    value={besichtigungsortNotiz}
                    onChange={e => setBesichtigungsortNotiz(e.target.value)}
                    onBlur={() => {
                      const notiz = besichtigungsortNotiz.trim() || null
                      startTransition(async () => {
                        await saveStammdaten(lead.id, { besichtigungsort_notiz: notiz })
                      })
                    }}
                    rows={2}
                    placeholder="Treffpunkt-Notiz (z.B. Hintereingang, Schlüssel bei Werkstatt …)"
                    className="w-full px-2 py-1.5 border border-claimondo-border rounded-lg text-xs resize-none mt-1"
                  />
                </div>
              </>
            )}
            <label className={`flex items-center gap-1.5 text-[11px] cursor-pointer rounded-lg p-1.5 ${
              isAuffahrunfall ? 'bg-rose-50 border border-rose-200 text-rose-900' : 'text-claimondo-navy'
            }`}>
              <input type="checkbox" checked={draft.personenschaden_flag ?? false} onChange={e => setDraft(d => ({ ...d, personenschaden_flag: e.target.checked }))} className="w-3.5 h-3.5" />
              <UserPlusIcon className="w-3.5 h-3.5" />
              Personenschaden vorhanden
              {isAuffahrunfall && <span className="ml-auto text-[10px] italic">Auffahrunfall — unbedingt prüfen!</span>}
            </label>
          </div>
        )}

        {/* Bei Nein: Nachfrage-Block (wie bisher) */}
        {draft.schaden_sichtbar === false && (
          <div className="bg-[#f8f9fb] border border-claimondo-border rounded-lg p-3 space-y-2">
            <p className="text-[11px] font-semibold text-claimondo-navy">Nachfrage (wörtlich stellen):</p>
            <p className="text-xs text-claimondo-navy italic">
              „Wie geht es Ihnen — haben Sie sich verletzt oder spüren Sie körperliche Beschwerden?"
            </p>
            <p className="text-xs text-claimondo-navy italic">
              „Konnten Sie Ihr Auto danach noch normal nutzen, oder mussten Sie auf ein Ersatzfahrzeug zurückgreifen?"
            </p>
            <p className="text-[10px] text-claimondo-ondo pt-1 border-t border-claimondo-border">
              Mindestens eine der 3 Optionen muss angehakt werden — sonst wird disqualifiziert (kein_schaden).
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <label className="flex items-center gap-1.5 text-[10px] text-claimondo-navy cursor-pointer">
                <input type="checkbox" checked={draft.personenschaden_flag ?? false} onChange={e => setDraft(d => ({ ...d, personenschaden_flag: e.target.checked }))} className="w-3.5 h-3.5" />
                Personenschaden
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-claimondo-navy cursor-pointer">
                <input type="checkbox" checked={draft.mietwagen_flag ?? false} onChange={e => setDraft(d => ({ ...d, mietwagen_flag: e.target.checked }))} className="w-3.5 h-3.5" />
                Mietwagen
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-claimondo-navy cursor-pointer">
                <input type="checkbox" checked={draft.nutzungsausfall ?? false} onChange={e => setDraft(d => ({ ...d, nutzungsausfall: e.target.checked }))} className="w-3.5 h-3.5" />
                Nutzungsausfall
              </label>
            </div>
          </div>
        )}
      </div>

      {/* AAR-358: Personenschaden-Detail-Erfassung (wenn Flag=true). Lebt außerhalb
          der Q2-Zweige, damit es sowohl bei sichtbarem Schaden als auch bei
          „nur Personenschaden"-Fällen (schaden_sichtbar=false + personenschaden_flag)
          erscheint. */}
      {draft.personenschaden_flag === true && (
        <div className="space-y-2 border-t border-claimondo-border pt-4">
          <div className="flex items-center gap-2">
            <UserPlusIcon className="w-4 h-4 text-rose-600" />
            <h3 className="text-xs font-semibold text-claimondo-navy">
              Verletzte Personen
            </h3>
            <span className="text-[10px] text-claimondo-ondo/70">
              Name, Geburtsdatum, Verletzungsart
            </span>
          </div>
          <Phase1PersonenForm leadId={lead.id} />
        </div>
      )}

      {/* AAR-357: Sachschäden an Dritten — unabhängig vom KFZ-Schaden.
          Leitplanke, Zaun, Handy, Brille etc. Schaltet zwei Katalog-Slots
          (sachschaden_rechnung, sachschaden_foto) frei. */}
      <div className="space-y-2 border-t border-claimondo-border pt-4">
        <div className="flex items-center gap-2">
          <PackageIcon className="w-4 h-4 text-claimondo-ondo" />
          <h3 className="text-xs font-semibold text-claimondo-navy">
            Sachschäden an Dritten?
          </h3>
          <span className="text-[10px] text-claimondo-ondo/70">
            (Leitplanke, Zaun, Handy, Brille …)
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, sachschaden_flag: true }))}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
              draft.sachschaden_flag === true
                ? 'bg-claimondo-navy text-white'
                : 'bg-[#f8f9fb] text-claimondo-ondo'
            }`}
          >
            Ja — Sachschaden vorhanden
          </button>
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                sachschaden_flag: false,
                sachschaden_beschreibung: '',
              }))
            }
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
              draft.sachschaden_flag === false
                ? 'bg-claimondo-navy text-white'
                : 'bg-[#f8f9fb] text-claimondo-ondo'
            }`}
          >
            Nein
          </button>
        </div>
        {draft.sachschaden_flag === true && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <textarea
              value={draft.sachschaden_beschreibung ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, sachschaden_beschreibung: e.target.value }))
              }
              placeholder="Was wurde beschädigt? (z.B. Leitplanke Höhe km 42, iPhone des Beifahrers …)"
              className="w-full px-3 py-2 border border-amber-300 rounded-lg text-xs bg-white h-20 resize-none"
            />
            <p className="text-[10px] text-amber-800 flex items-start gap-1">
              <InfoIcon className="w-3 h-3 mt-0.5 shrink-0" />
              Portal fordert zwei Pflicht-Dokumente an: Rechnung/KV + Foto des Schadens.
            </p>
          </div>
        )}
      </div>

      {/* Unfallort (zwischen Q2 und Q3, wie in Schritt0HardGate) */}
      <div className="space-y-3 border-t border-claimondo-border pt-4">
        <div className="flex items-center gap-2">
          <MapPinIcon className="w-4 h-4 text-claimondo-ondo" />
          <h3 className="text-xs font-semibold text-claimondo-navy">Unfallort</h3>
        </div>
        {/* AAR-176 P2-B: Kategorie-Dropdown entfernt — wird automatisch aus
            schadentyp abgeleitet (saveSchadentyp schreibt unfallort_kategorie
            mit). Der MA muss die Location-Kategorie nicht mehr doppelt pflegen. */}
        <GooglePlaceAutocomplete
          defaultValue={draft.unfallort ?? ''}
          placeholder="Wo ist es passiert? (Adresse wählen)"
          onSelect={(r) =>
            setDraft((d) => ({
              ...d,
              unfallort: r.adresse,
              unfallort_lat: r.lat,
              unfallort_lng: r.lng,
            }))
          }
          className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm"
        />
        {draft.unfallort && (draft.unfallort_lat == null || draft.unfallort_lng == null) && (
          <p className="text-[10px] text-amber-700 flex items-start gap-1">
            <InfoIcon className="w-3 h-3 mt-0.5 shrink-0" />
            Koordinaten fehlen — SV-Dispatch nutzt Kunden-Adresse als Fallback. Bitte einen Autocomplete-Vorschlag wählen.
          </p>
        )}

        {/* CMM-26: Datum + Uhrzeit gehören zum Erstkontakt — wandern aus
            Phase 4 hier hin. Uhrzeit ist Freitext (Dispatcher tippt mit, was
            der Kunde sagt: „14 Uhr", „ca. 14:30"); die Normalisierung zu
            HH:MM:SS passiert in saveHardGate / convertLeadToClaim. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-0.5">
            <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider block">
              Unfalldatum
            </label>
            <input
              type="date"
              value={(draft.unfalldatum ?? '').slice(0, 10)}
              onChange={(e) => setDraft((d) => ({ ...d, unfalldatum: e.target.value || null }))}
              className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm focus:outline-none focus:border-claimondo-ondo"
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider block">
              Unfall-Uhrzeit (ca.)
            </label>
            <input
              type="text"
              value={draft.unfall_uhrzeit ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, unfall_uhrzeit: e.target.value }))}
              placeholder="z.B. 14:30, 14 Uhr, ca. 8:15"
              className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm focus:outline-none focus:border-claimondo-ondo"
            />
          </div>
        </div>
      </div>

      {/* Q3 — Polizei vor Ort (KOMPLETT NEU, Spec §3 Q3) */}
      <div className={`space-y-2 border-t border-claimondo-border pt-4 ${fahrerflucht ? 'bg-red-50 -mx-5 px-5 py-3 border-t-2 border-red-200' : ''}`}>
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${q3Complete ? 'bg-green-500 text-white' : 'bg-claimondo-border text-claimondo-ondo'}`}>3</span>
          <ShieldAlertIcon className={`w-3.5 h-3.5 ${fahrerflucht ? 'text-red-600' : 'text-claimondo-ondo'}`} />
          <h3 className="text-xs font-semibold text-claimondo-navy">War die Polizei vor Ort?</h3>
          {fahrerflucht && (
            <span className="ml-auto text-[10px] font-bold text-red-700 uppercase">
              Fahrerflucht → Polizei Pflicht!
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDraft(d => ({ ...d, polizei_vor_ort: true }))}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.polizei_vor_ort === true ? 'bg-claimondo-navy text-white' : 'bg-[#f8f9fb] text-claimondo-ondo'}`}
          >
            Ja — Polizei war da
          </button>
          <button
            type="button"
            onClick={() =>
              setDraft(d => ({
                ...d,
                polizei_vor_ort: false,
                polizeibericht_vorhanden: null,
                polizeibericht_pflicht: false,
                polizei_aktenzeichen: '',
              }))
            }
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.polizei_vor_ort === false ? 'bg-claimondo-navy text-white' : 'bg-[#f8f9fb] text-claimondo-ondo'}`}
          >
            Nein
          </button>
        </div>

        {draft.polizei_vor_ort === true && (
          <div className="bg-[#f8f9fb] border border-claimondo-border rounded-lg p-3 space-y-2">
            <p className="text-[11px] font-semibold text-claimondo-navy">Polizeibericht bereits vorhanden?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setDraft(d => ({
                    ...d,
                    polizeibericht_vorhanden: true,
                    polizeibericht_pflicht: true,
                  }))
                }
                className={`flex-1 px-3 py-1 rounded-lg text-[11px] font-medium ${draft.polizeibericht_vorhanden === true ? 'bg-claimondo-ondo text-white' : 'bg-white border border-claimondo-border text-claimondo-navy'}`}
              >
                Ja — Kunde hat Bericht
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraft(d => ({
                    ...d,
                    polizeibericht_vorhanden: false,
                    polizeibericht_pflicht: false,
                  }))
                }
                className={`flex-1 px-3 py-1 rounded-lg text-[11px] font-medium ${draft.polizeibericht_vorhanden === false ? 'bg-claimondo-ondo text-white' : 'bg-white border border-claimondo-border text-claimondo-navy'}`}
              >
                Nein — nur Aktenzeichen
              </button>
            </div>
            {draft.polizeibericht_vorhanden === true && (
              <p className="text-[11px] text-claimondo-navy italic">
                Portal zeigt Polizeibericht-Upload als Pflichtfeld im FlowLink.
              </p>
            )}
            {draft.polizeibericht_vorhanden === false && (
              <input
                type="text"
                value={draft.polizei_aktenzeichen ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, polizei_aktenzeichen: e.target.value }))}
                placeholder="Aktenzeichen (wenn bekannt)"
                className="w-full px-3 py-1.5 border border-claimondo-border rounded-lg text-xs bg-white"
              />
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className={`text-xs px-3 py-2 rounded-lg ${toast === 'Gespeichert' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>{toast}</div>
      )}

      {/* AAR-192: Speichern-Button entfernt — Auto-Save mit 800ms Debounce
          speichert sobald alle 3 Pflichtfelder beantwortet sind.
          AAR-203: Bei Eigenverantwortung wird Auto-Save ausgesetzt damit
          der MA das Exit-Skript in Ruhe vorlesen kann — Disqualifikation
          erst manuell via Sidebar-Button. */}
      {!allComplete ? (
        <p className="text-[10px] text-claimondo-ondo flex items-center gap-1">
          <InfoIcon className="w-3 h-3" /> Alle 3 Bereiche müssen beantwortet sein bevor Phase 2 freigeschaltet wird.
        </p>
      ) : draft.schuldfrage === 'eigenverantwortung' ? (
        <p className="text-[10px] text-amber-700 flex items-center gap-1">
          <InfoIcon className="w-3 h-3" />
          Auto-Save ausgesetzt — erst Exit-Skript vorlesen, dann manuell in der Sidebar „Disqualifizieren".
        </p>
      ) : (
        <p className="text-[10px] text-claimondo-ondo flex items-center gap-1">
          {pending
            ? <><span className="inline-block w-2 h-2 rounded-full bg-claimondo-ondo animate-pulse" /> Auto-Save läuft ...</>
            : <><CheckCircleIcon className="w-3 h-3 text-green-600" /> Änderungen werden automatisch gespeichert.</>}
        </p>
      )}

      {/* AAR-268: Expliziter „Weiter zu Phase 2"-Button statt Auto-Advance */}
      {allComplete && !qualification.disqualifiziert && draft.schuldfrage !== 'eigenverantwortung' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => setPhase(2)}
          className="w-full mt-2 px-4 py-2.5 rounded-xl bg-claimondo-navy text-white text-sm font-semibold hover:bg-claimondo-navy disabled:opacity-50 flex items-center justify-center gap-2"
        >
          Weiter zu Phase 2 →
        </button>
      )}
    </div>
  )
}
