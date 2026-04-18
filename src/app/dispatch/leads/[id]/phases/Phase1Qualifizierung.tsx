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
// AAR-176 P2-B: UnfallortKategorie-Import raus — die Spalte wird jetzt auto
// aus schadentyp abgeleitet (saveSchadentyp setzt kategorie mit, Dropdown
// ist in der UI weg).
import { saveHardGate, type HardGateData } from '../actions'
// AAR-316: Sprache wird separat via saveStammdaten persistiert (nicht HardGateData)
import { saveStammdaten } from '../actions'
import { useDispatchPhase } from '../lib/phase-context'
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
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
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
  polizei_vor_ort?: boolean | null
  polizei_aktenzeichen?: string | null
  polizeibericht_pflicht?: boolean | null
  fahrzeug_fahrbereit?: boolean | null
  schadentyp?: string | null
  fahrerflucht?: boolean | null
  // AAR-316: Sprache des Kunden (ISO-Code)
  sprache?: string | null
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

export default function Phase1Qualifizierung() {
  const { lead, qualification, setPhase } = useDispatchPhase()
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
    polizei_vor_ort: l.polizei_vor_ort ?? undefined,
    polizei_aktenzeichen: l.polizei_aktenzeichen ?? '',
    polizeibericht_pflicht: l.polizeibericht_pflicht ?? undefined,
    fahrzeug_fahrbereit: l.fahrzeug_fahrbereit ?? undefined,
    polizeibericht_vorhanden:
      l.polizei_vor_ort === true ? (l.polizeibericht_pflicht ?? null) : null,
  })
  const [toast, setToast] = useState('')

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
      const r = await saveHardGate(lead.id, toSave)
      if (r.success) {
        setToast(r.disqualifiziert ? 'Disqualifiziert — Exit-Skript wird angezeigt' : 'Gespeichert')
        // AAR-268: Auto-Advance entfernt — MA muss explizit „Weiter zu Phase 2"
        // klicken (Kontrolle vor Sprung). Auto-Save bleibt im Hintergrund.
      } else {
        setToast(r.error ?? 'Fehler')
      }
      setTimeout(() => setToast(''), 3000)
    })
  }

  // AAR-192: Auto-Save mit 800ms Debounce sobald Phase komplett.
  // Der Speichern-Button fliegt raus — MA füllt die Felder, nach kurzem
  // Nichtstun wird automatisch gespeichert und zu Phase 2 weitergeschickt.
  // autoSavedHash verhindert dass identische drafts mehrfach gespeichert
  // werden (z.B. wenn nur nicht-relevante Felder sich ändern).
  const autoSavedHashRef = useRef<string>('')
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
    unfallort: draft.unfallort,
  })
  useEffect(() => {
    if (!allComplete) return
    // AAR-203: NIE auto-speichern bei Eigenverantwortung — saveHardGate
    // würde den Lead sofort disqualifizieren bevor der MA das Exit-Skript
    // vorlesen konnte. MA muss manuell via Sidebar-Button „Disqualifizieren"
    // speichern wenn er das Skript verlesen hat.
    if (draft.schuldfrage === 'eigenverantwortung') return
    if (autoSavedHashRef.current === draftHash) return
    const t = setTimeout(() => {
      autoSavedHashRef.current = draftHash
      save()
    }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allComplete, draftHash])

  if (qualification.disqualifiziert) {
    // Overlay kommt über DispatchShell → PhaseContent → DisqualifiziertOverlay;
    // hier bleiben wir defensiv still.
    return null
  }

  const isAuffahrunfall = l.schadentyp === 'auffahrunfall'
  const fahrerflucht = l.fahrerflucht === true

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Phase 1: Qualifizierung</h2>
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

      {/* AAR-316: Sprache des Kunden. Steuert später FlowLink + Portal-Übersetzungen.
          Standard = Deutsch. Auto-Save on-change via saveStammdaten. */}
      <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-gray-100">
        <span className="text-[10px] uppercase tracking-wider text-gray-400">
          Sprache des Kunden
        </span>
        <div className="flex gap-1 flex-wrap">
          {SPRACHEN.map((s) => {
            const selected = (l.sprache ?? 'de') === s.code
            return (
              <button
                key={s.code}
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await saveStammdaten(l.id, { sprache: s.code })
                  })
                }
                className={`px-2 py-1 rounded-md text-[11px] font-medium border ${
                  selected
                    ? 'bg-[#4573A2] text-white border-[#4573A2]'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
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
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${q1Complete ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>1</span>
          <h3 className="text-xs font-semibold text-gray-700">Unfallhergang &amp; Verantwortlichkeit</h3>
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
              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
              title={`„${b.prompt.trim()}" ans Textfeld anhängen`}
            >
              + {b.label}
            </button>
          ))}
        </div>
        <textarea
          value={draft.unfallhergang ?? ''}
          onChange={e => setDraft(d => ({ ...d, unfallhergang: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm h-28 resize-none font-mono"
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
                draft.schuldfrage === o.v ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${q2Complete ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>2</span>
          <h3 className="text-xs font-semibold text-gray-700">Wie sieht es mit Ihrem Auto aus — hat es was abgekriegt?</h3>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft(d => ({ ...d, schaden_sichtbar: true }))} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.schaden_sichtbar === true ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600'}`}>Ja — sichtbarer Schaden</button>
          <button type="button" onClick={() => setDraft(d => ({ ...d, schaden_sichtbar: false }))} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.schaden_sichtbar === false ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600'}`}>Nein / unklar</button>
        </div>

        {/* Bei Ja: Fahrbereit-Toggle (Spec §3 Q2 Unterfeld) */}
        {draft.schaden_sichtbar === true && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <CarFrontIcon className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[11px] font-semibold text-gray-700">Fahrzeug noch fahrbereit?</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDraft(d => ({ ...d, fahrzeug_fahrbereit: true }))} className={`flex-1 px-3 py-1 rounded-lg text-[11px] font-medium ${draft.fahrzeug_fahrbereit === true ? 'bg-[#4573A2] text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Ja, fahrbereit</button>
              <button type="button" onClick={() => setDraft(d => ({ ...d, fahrzeug_fahrbereit: false }))} className={`flex-1 px-3 py-1 rounded-lg text-[11px] font-medium ${draft.fahrzeug_fahrbereit === false ? 'bg-[#4573A2] text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Nein</button>
            </div>
            {draft.fahrzeug_fahrbereit === false && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
                <p className="text-[11px] text-orange-800 font-medium">Mietwagen jetzt ansprechen — Anspruch gilt ab Unfalltag!</p>
                <label className="flex items-center gap-1.5 text-[11px] text-orange-900 cursor-pointer mt-1.5">
                  <input type="checkbox" checked={draft.mietwagen_flag ?? false} onChange={e => setDraft(d => ({ ...d, mietwagen_flag: e.target.checked }))} className="w-3.5 h-3.5" />
                  Kunde will Mietwagen
                </label>
              </div>
            )}
            <label className={`flex items-center gap-1.5 text-[11px] cursor-pointer rounded-lg p-1.5 ${
              isAuffahrunfall ? 'bg-rose-50 border border-rose-200 text-rose-900' : 'text-gray-700'
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
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
            <p className="text-[11px] font-semibold text-blue-900">Nachfrage (wörtlich stellen):</p>
            <p className="text-xs text-blue-800 italic">
              „Wie geht es Ihnen — haben Sie sich verletzt oder spüren Sie körperliche Beschwerden?"
            </p>
            <p className="text-xs text-blue-800 italic">
              „Konnten Sie Ihr Auto danach noch normal nutzen, oder mussten Sie auf ein Ersatzfahrzeug zurückgreifen?"
            </p>
            <p className="text-[10px] text-blue-700 pt-1 border-t border-blue-200">
              Mindestens eine der 3 Optionen muss angehakt werden — sonst wird disqualifiziert (kein_schaden).
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <label className="flex items-center gap-1.5 text-[10px] text-gray-700 cursor-pointer">
                <input type="checkbox" checked={draft.personenschaden_flag ?? false} onChange={e => setDraft(d => ({ ...d, personenschaden_flag: e.target.checked }))} className="w-3.5 h-3.5" />
                Personenschaden
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-gray-700 cursor-pointer">
                <input type="checkbox" checked={draft.mietwagen_flag ?? false} onChange={e => setDraft(d => ({ ...d, mietwagen_flag: e.target.checked }))} className="w-3.5 h-3.5" />
                Mietwagen
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-gray-700 cursor-pointer">
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
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2">
            <UserPlusIcon className="w-4 h-4 text-rose-600" />
            <h3 className="text-xs font-semibold text-gray-700">
              Verletzte Personen
            </h3>
            <span className="text-[10px] text-gray-400">
              Name, Geburtsdatum, Verletzungsart
            </span>
          </div>
          <Phase1PersonenForm leadId={lead.id} />
        </div>
      )}

      {/* AAR-357: Sachschäden an Dritten — unabhängig vom KFZ-Schaden.
          Leitplanke, Zaun, Handy, Brille etc. Schaltet zwei Katalog-Slots
          (sachschaden_rechnung, sachschaden_foto) frei. */}
      <div className="space-y-2 border-t border-gray-100 pt-4">
        <div className="flex items-center gap-2">
          <PackageIcon className="w-4 h-4 text-[#4573A2]" />
          <h3 className="text-xs font-semibold text-gray-700">
            Sachschäden an Dritten?
          </h3>
          <span className="text-[10px] text-gray-400">
            (Leitplanke, Zaun, Handy, Brille …)
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, sachschaden_flag: true }))}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
              draft.sachschaden_flag === true
                ? 'bg-[#0D1B3E] text-white'
                : 'bg-gray-100 text-gray-600'
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
                ? 'bg-[#0D1B3E] text-white'
                : 'bg-gray-100 text-gray-600'
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
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <div className="flex items-center gap-2">
          <MapPinIcon className="w-4 h-4 text-[#4573A2]" />
          <h3 className="text-xs font-semibold text-gray-700">Unfallort</h3>
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
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        {draft.unfallort && (draft.unfallort_lat == null || draft.unfallort_lng == null) && (
          <p className="text-[10px] text-amber-700 flex items-start gap-1">
            <InfoIcon className="w-3 h-3 mt-0.5 shrink-0" />
            Koordinaten fehlen — SV-Dispatch nutzt Kunden-Adresse als Fallback. Bitte einen Autocomplete-Vorschlag wählen.
          </p>
        )}
      </div>

      {/* Q3 — Polizei vor Ort (KOMPLETT NEU, Spec §3 Q3) */}
      <div className={`space-y-2 border-t border-gray-100 pt-4 ${fahrerflucht ? 'bg-red-50 -mx-5 px-5 py-3 border-t-2 border-red-200' : ''}`}>
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${q3Complete ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>3</span>
          <ShieldAlertIcon className={`w-3.5 h-3.5 ${fahrerflucht ? 'text-red-600' : 'text-gray-500'}`} />
          <h3 className="text-xs font-semibold text-gray-700">War die Polizei vor Ort?</h3>
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
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.polizei_vor_ort === true ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600'}`}
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
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.polizei_vor_ort === false ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            Nein
          </button>
        </div>

        {draft.polizei_vor_ort === true && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
            <p className="text-[11px] font-semibold text-blue-900">Polizeibericht bereits vorhanden?</p>
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
                className={`flex-1 px-3 py-1 rounded-lg text-[11px] font-medium ${draft.polizeibericht_vorhanden === true ? 'bg-[#4573A2] text-white' : 'bg-white border border-blue-200 text-blue-800'}`}
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
                className={`flex-1 px-3 py-1 rounded-lg text-[11px] font-medium ${draft.polizeibericht_vorhanden === false ? 'bg-[#4573A2] text-white' : 'bg-white border border-blue-200 text-blue-800'}`}
              >
                Nein — nur Aktenzeichen
              </button>
            </div>
            {draft.polizeibericht_vorhanden === true && (
              <p className="text-[11px] text-blue-800 italic">
                Portal zeigt Polizeibericht-Upload als Pflichtfeld im FlowLink.
              </p>
            )}
            {draft.polizeibericht_vorhanden === false && (
              <input
                type="text"
                value={draft.polizei_aktenzeichen ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, polizei_aktenzeichen: e.target.value }))}
                placeholder="Aktenzeichen (wenn bekannt)"
                className="w-full px-3 py-1.5 border border-blue-200 rounded-lg text-xs bg-white"
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
        <p className="text-[10px] text-gray-500 flex items-center gap-1">
          <InfoIcon className="w-3 h-3" /> Alle 3 Bereiche müssen beantwortet sein bevor Phase 2 freigeschaltet wird.
        </p>
      ) : draft.schuldfrage === 'eigenverantwortung' ? (
        <p className="text-[10px] text-amber-700 flex items-center gap-1">
          <InfoIcon className="w-3 h-3" />
          Auto-Save ausgesetzt — erst Exit-Skript vorlesen, dann manuell in der Sidebar „Disqualifizieren".
        </p>
      ) : (
        <p className="text-[10px] text-gray-500 flex items-center gap-1">
          {pending
            ? <><span className="inline-block w-2 h-2 rounded-full bg-[#4573A2] animate-pulse" /> Auto-Save läuft ...</>
            : <><CheckCircleIcon className="w-3 h-3 text-green-600" /> Änderungen werden automatisch gespeichert.</>}
        </p>
      )}

      {/* AAR-268: Expliziter „Weiter zu Phase 2"-Button statt Auto-Advance */}
      {allComplete && !qualification.disqualifiziert && draft.schuldfrage !== 'eigenverantwortung' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => setPhase(2)}
          className="w-full mt-2 px-4 py-2.5 rounded-xl bg-[#0D1B3E] text-white text-sm font-semibold hover:bg-[#1E3A5F] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          Weiter zu Phase 2 →
        </button>
      )}
    </div>
  )
}
