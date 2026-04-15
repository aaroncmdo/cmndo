'use client'

// AAR-80 + AAR-114: Schritt 0 Hard Gate (Notion-Spec 14.04.2026 §2)
// Sprachregel: niemals "Schuld" — immer "verursacht" / "wie es passiert ist"
// Aufklaerungstext: Prozess-Verlaengerung/Kuerzung (NICHT Strafanzeige)

import { useState, useTransition } from 'react'
import { saveHardGate, type HardGateData, type UnfallortKategorie } from './actions'
import { computeHardGateStatus } from './hard-gate-utils'
import { CheckCircleIcon, AlertTriangleIcon, XCircleIcon, InfoIcon, MapPinIcon, ShieldAlertIcon } from 'lucide-react'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'

type Lead = {
  id: string
  unfallhergang?: string | null
  schuldfrage?: 'gegner' | 'unklar' | 'eigenverantwortung' | null
  aufklaerung_teilschuld_bestaetigt?: boolean | null
  schaden_sichtbar?: boolean | null
  personenschaden_flag?: boolean | null
  mietwagen_flag?: boolean | null
  nutzungsausfall?: boolean | null
  hat_haftpflicht?: boolean | null
  qualifizierungs_phase?: string | null
  disqualifikations_grund?: string | null
  // AAR-124: Unfallort + Polizei
  unfallort?: string | null
  unfallort_kategorie?: UnfallortKategorie | null
  unfallort_lat?: number | null
  unfallort_lng?: number | null
  polizei_vor_ort?: boolean | null
  polizei_aktenzeichen?: string | null
  polizeibericht_pflicht?: boolean | null
}

const UNFALLORT_KATEGORIEN: { value: UnfallortKategorie; label: string }[] = [
  { value: 'parkplatz', label: 'Parkplatz' },
  { value: 'strasse', label: 'Straße' },
  { value: 'autobahn', label: 'Autobahn' },
  { value: 'kreuzung', label: 'Kreuzung' },
  { value: 'tankstelle', label: 'Tankstelle' },
  { value: 'innenstadt', label: 'Innenstadt' },
  { value: 'sonstiges', label: 'Sonstiges' },
]

export default function Schritt0HardGate({ lead }: { lead: Lead }) {
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<HardGateData>({
    unfallhergang: lead.unfallhergang ?? '',
    schuldfrage: lead.schuldfrage ?? undefined,
    aufklaerung_teilschuld_bestaetigt: lead.aufklaerung_teilschuld_bestaetigt ?? false,
    schaden_sichtbar: lead.schaden_sichtbar ?? undefined,
    personenschaden_flag: lead.personenschaden_flag ?? false,
    mietwagen_flag: lead.mietwagen_flag ?? false,
    nutzungsausfall: lead.nutzungsausfall ?? false,
    hat_haftpflicht: lead.hat_haftpflicht ?? undefined,
    // AAR-124: Unfallort + Polizei
    unfallort: lead.unfallort ?? '',
    unfallort_kategorie: lead.unfallort_kategorie ?? undefined,
    unfallort_lat: lead.unfallort_lat ?? null,
    unfallort_lng: lead.unfallort_lng ?? null,
    polizei_vor_ort: lead.polizei_vor_ort ?? false,
    polizei_aktenzeichen: lead.polizei_aktenzeichen ?? '',
  })
  const [toast, setToast] = useState('')

  const status = computeHardGateStatus({ ...lead, ...draft })

  function save() {
    startTransition(async () => {
      const r = await saveHardGate(lead.id, draft)
      if (r.success) {
        setToast(r.disqualifiziert ? 'Disqualifiziert — Exit-Skript wird angezeigt' : 'Gespeichert')
      } else {
        setToast(r.error ?? 'Fehler')
      }
      setTimeout(() => setToast(''), 3000)
    })
  }

  if (status.disqualifiziert) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
        <XCircleIcon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-800">Lead disqualifiziert</p>
          <p className="text-xs text-red-700 mt-0.5">{lead.disqualifikations_grund ?? 'Hard-Gate-Check fehlgeschlagen'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Schritt 0: Hard Gate</h2>
        {status.allComplete ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
            <CheckCircleIcon className="w-3 h-3" /> Freigegeben
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
            {[status.q1Complete, status.q2Complete, status.q3Complete].filter(Boolean).length}/3
          </span>
        )}
      </div>

      {/* Q1: Hergang + Aufklaerung Teilschuld (Spec §2.Q1) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${status.q1Complete ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>1</span>
          <h3 className="text-xs font-semibold text-gray-700">Unfallhergang &amp; Aufklärung</h3>
        </div>
        <textarea
          value={draft.unfallhergang ?? ''}
          onChange={e => setDraft(d => ({ ...d, unfallhergang: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm h-20 resize-none"
          placeholder={'Wie ist es passiert? (offene Beschreibung — Sprachregel: niemals „Schuld")'}
        />
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
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
            <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Eigenverantwortung = Kasko-Fall. Lead wird disqualifiziert und Exit-Skript angezeigt.</span>
          </p>
        )}
      </div>

      {/* Q2: Schaden (Spec §2.Q2) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${status.q2Complete ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>2</span>
          <h3 className="text-xs font-semibold text-gray-700">Wie sieht es mit Ihrem Auto aus — hat es was abgekriegt?</h3>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft(d => ({ ...d, schaden_sichtbar: true }))} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.schaden_sichtbar === true ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600'}`}>Ja — sichtbarer Schaden</button>
          <button type="button" onClick={() => setDraft(d => ({ ...d, schaden_sichtbar: false }))} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.schaden_sichtbar === false ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600'}`}>Nein / unklar</button>
        </div>

        {/* Nachfrage-Dialog bei Nein (Spec §2.Q2) */}
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

      {/* AAR-124: Unfallort & Polizei (zwischen Q2 und Q3) */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <div className="flex items-center gap-2">
          <MapPinIcon className="w-4 h-4 text-[#4573A2]" />
          <h3 className="text-xs font-semibold text-gray-700">Unfallort &amp; Polizei</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-2">
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
          <select
            value={draft.unfallort_kategorie ?? ''}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                unfallort_kategorie: (e.target.value || undefined) as UnfallortKategorie | undefined,
              }))
            }
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="">Kategorie ...</option>
            {UNFALLORT_KATEGORIEN.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>
        {draft.unfallort && (draft.unfallort_lat == null || draft.unfallort_lng == null) && (
          <p className="text-[10px] text-amber-700 flex items-start gap-1">
            <InfoIcon className="w-3 h-3 mt-0.5 shrink-0" />
            Koordinaten fehlen — SV-Dispatch nutzt Kunden-Adresse als Fallback. Bitte einen Autocomplete-Vorschlag wählen.
          </p>
        )}

        {/* Polizei-vor-Ort Toggle */}
        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={draft.polizei_vor_ort ?? false}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                polizei_vor_ort: e.target.checked,
                // Server-Action ist die Authority (siehe saveHardGate), aber UI-Konsistenz hier:
                // checked → pflicht=true, unchecked → pflicht+aktenzeichen löschen
                polizeibericht_pflicht: e.target.checked ? true : false,
                polizei_aktenzeichen: e.target.checked ? d.polizei_aktenzeichen : '',
              }))
            }
            className="w-4 h-4"
          />
          <ShieldAlertIcon className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-medium text-gray-700">Polizei war vor Ort</span>
        </label>
        {draft.polizei_vor_ort && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 space-y-2">
            <input
              type="text"
              value={draft.polizei_aktenzeichen ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, polizei_aktenzeichen: e.target.value }))}
              placeholder="Aktenzeichen (optional)"
              className="w-full px-3 py-1.5 border border-blue-200 rounded-lg text-xs bg-white"
            />
            <p className="text-[10px] text-blue-800 italic">
              Falls ja, muss der Kunde im Onboarding den Polizeibericht nachreichen. Falls er es nicht bis zum Termin schafft, holt der Gutachter die Info vor Ort ein.
            </p>
          </div>
        )}
      </div>

      {/* Q3: Haftpflicht (Spec §2.Q3) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${status.q3Complete ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>3</span>
          <h3 className="text-xs font-semibold text-gray-700">
            Und das ist der Schaden an Ihrem eigenen Fahrzeug — also die andere Seite soll das übernehmen?
          </h3>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft(d => ({ ...d, hat_haftpflicht: true }))} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.hat_haftpflicht === true ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600'}`}>Ja — KFZ-Haftpflichtschaden</button>
          <button type="button" onClick={() => setDraft(d => ({ ...d, hat_haftpflicht: false }))} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.hat_haftpflicht === false ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600'}`}>Nein — Kasko / eigene VS</button>
        </div>
        {draft.hat_haftpflicht === false && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
            <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Kasko / eigene Versicherung = nicht unser Fall. Lead wird disqualifiziert und Exit-Skript angezeigt.</span>
          </p>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`text-xs px-3 py-2 rounded-lg ${toast === 'Gespeichert' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>{toast}</div>
      )}

      <button
        disabled={pending}
        onClick={save}
        className="w-full px-4 py-2.5 rounded-xl bg-[#4573A2] text-white text-sm font-medium hover:bg-[#3a6290] disabled:opacity-50"
      >
        {pending ? 'Speichern...' : 'Speichern'}
      </button>

      {!status.allComplete && (
        <p className="text-[10px] text-gray-500 flex items-center gap-1">
          <InfoIcon className="w-3 h-3" /> Alle 3 Fragen müssen beantwortet sein bevor Schritt 1 freigeschaltet wird.
        </p>
      )}
    </div>
  )
}
