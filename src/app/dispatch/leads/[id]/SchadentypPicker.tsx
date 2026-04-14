'use client'

// AAR-81 + AAR-83 + AAR-114: Schadentyp-Picker (Notion-Spec 14.04.2026 §3)
// 5 Typen mit icon/beschreibung_ma/kundenbeispiel/dispatch_hinweis/farbe
// Plus Parkplatz-Kamera-Check mit woertlicher italic Frage.

import { useState, useTransition } from 'react'
import { saveSchadentyp } from './actions'

type Schadentyp = 'spurwechsel' | 'auffahrunfall' | 'vorfahrtsverletzung' | 'parkplatz' | 'sonstiges'

type TypDef = {
  value: Schadentyp
  icon: string
  label: string
  beschreibung_ma: string
  kundenbeispiel: string
  dispatch_hinweis: string
  farbe: 'blue' | 'green' | 'amber' | 'red' | 'gray'
}

const OPTIONS: TypDef[] = [
  {
    value: 'spurwechsel',
    icon: '🔄',
    label: 'Spurwechsel',
    beschreibung_ma: 'Gegner wechselt die Spur ohne Blinken / ohne ausreichend Abstand.',
    kundenbeispiel: 'Ein Auto ist auf meiner Fahrspur eingefädelt und hat dabei mein Fahrzeug gestreift.',
    dispatch_hinweis: 'Haftung wird häufig bestritten → Zeugen aktiv abfragen + Dashcam ansprechen. Polizei-AZ besonders wertvoll.',
    farbe: 'amber',
  },
  {
    value: 'auffahrunfall',
    icon: '🚗',
    label: 'Auffahrunfall',
    beschreibung_ma: 'Gegner fährt von hinten auf das stehende oder langsamere Fahrzeug des Kunden auf.',
    kundenbeispiel: 'Ich stand an einer Ampel und das Fahrzeug hinter mir ist aufgefahren.',
    dispatch_hinweis: 'Klarster Haftungsfall. Standard-Flow. Personenschaden aktiv ansprechen (Schleudertrauma oft erst Stunden später spürbar): „Haben Sie sich verletzt oder spüren Sie körperliche Beschwerden?"',
    farbe: 'green',
  },
  {
    value: 'vorfahrtsverletzung',
    icon: '🛑',
    label: 'Vorfahrtsverletzung',
    beschreibung_ma: 'Gegner missachtet Vorfahrt an Kreuzung, Einmündung oder beim Abbiegen.',
    kundenbeispiel: 'Ein Auto ist an der Kreuzung rausgefahren und mir in die Seite gefahren.',
    dispatch_hinweis: 'Höheres Risiko Haftungsstreit → Polizeibericht quasi-Pflicht, Zeugen dringend abfragen. Unfallskizze (Phase 2) hier besonders wertvoll.',
    farbe: 'amber',
  },
  {
    value: 'parkplatz',
    icon: '🅿️',
    label: 'Parkplatz',
    beschreibung_ma: 'Schaden auf einem Parkplatz — beim Ein-/Ausparken oder am geparkten Fahrzeug.',
    kundenbeispiel: 'Mein Auto stand geparkt und jemand hat es beim Einparken beschädigt.',
    dispatch_hinweis: 'Fahrerflucht-Rate am höchsten → sofort fragen: Kennzeichen vorhanden? Kein Kennzeichen → Überwachungskamera-Check. Dashcam und Zeugen aktiv abfragen.',
    farbe: 'red',
  },
  {
    value: 'sonstiges',
    icon: '❓',
    label: 'Sonstiges',
    beschreibung_ma: 'Alle Fälle die nicht in die 4 Kategorien passen — Motorrad/Zweirad als Gegner, Fahrradfahrer, Rückspiegel auf engem Weg, etc.',
    kundenbeispiel: '(MA dokumentiert im Freitextfeld)',
    dispatch_hinweis: 'Freitext pflichtmäßig ausfüllen. Kanzlei braucht den genauen Typ für das AS.',
    farbe: 'gray',
  },
]

const FARBE_CLS: Record<TypDef['farbe'], { wrap: string; label: string; border: string }> = {
  blue: { wrap: 'bg-blue-50 text-blue-800', label: 'text-blue-900', border: 'border-blue-200' },
  green: { wrap: 'bg-green-50 text-green-800', label: 'text-green-900', border: 'border-green-200' },
  amber: { wrap: 'bg-amber-50 text-amber-800', label: 'text-amber-900', border: 'border-amber-200' },
  red: { wrap: 'bg-red-50 text-red-800', label: 'text-red-900', border: 'border-red-200' },
  gray: { wrap: 'bg-gray-50 text-gray-800', label: 'text-gray-900', border: 'border-gray-200' },
}

export default function SchadentypPicker({ leadId, initialTyp, initialFreitext, gegnerKennzeichen, initialKamera }: {
  leadId: string
  initialTyp?: Schadentyp | null
  initialFreitext?: string | null
  gegnerKennzeichen?: string | null
  initialKamera?: boolean | null
}) {
  const [typ, setTyp] = useState<Schadentyp | null>(initialTyp ?? null)
  const [freitext, setFreitext] = useState(initialFreitext ?? '')
  const [kamera, setKamera] = useState<boolean | null>(initialKamera ?? null)
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState('')

  // AAR-83: Parkplatz ohne Kennzeichen → Kamera-Check Pflicht
  const isParkplatzOhneKz = typ === 'parkplatz' && !gegnerKennzeichen?.trim()

  const selected = OPTIONS.find(o => o.value === typ)
  const cls = selected ? FARBE_CLS[selected.farbe] : null

  function save() {
    if (!typ) return
    if (typ === 'sonstiges' && !freitext.trim()) {
      setToast('Freitext bei „Sonstiges" ist Pflicht')
      setTimeout(() => setToast(''), 2500)
      return
    }
    if (isParkplatzOhneKz && kamera === null) {
      setToast('Kamera-Check ist Pflicht (kein Kennzeichen)')
      setTimeout(() => setToast(''), 2500)
      return
    }
    startTransition(async () => {
      const r = await saveSchadentyp(leadId, typ, typ === 'sonstiges' ? freitext : null, kamera)
      setToast(r.success ? (r.disqualifiziert ? 'Disqualifiziert — Exit-Skript wird angezeigt' : 'Gespeichert') : (r.error ?? 'Fehler'))
      setTimeout(() => setToast(''), 3000)
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <h3 className="text-xs font-semibold text-gray-700">Schadentyp (MA trägt während Telefonat ein)</h3>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {OPTIONS.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => setTyp(o.value)}
            className={`px-3 py-2.5 rounded-lg text-xs font-medium text-left transition-colors flex flex-col items-start gap-1 ${
              typ === o.value ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <span className="text-lg leading-none">{o.icon}</span>
            <span>{o.label}</span>
          </button>
        ))}
      </div>

      {selected && cls && (
        <div className={`border rounded-lg p-3 space-y-2 ${cls.wrap} ${cls.border}`}>
          <div>
            <p className={`text-[10px] uppercase tracking-wider font-semibold ${cls.label} opacity-70`}>Für den MA</p>
            <p className="text-xs mt-0.5">{selected.beschreibung_ma}</p>
          </div>
          <div>
            <p className={`text-[10px] uppercase tracking-wider font-semibold ${cls.label} opacity-70`}>Kundenbeispiel</p>
            <p className="text-xs italic mt-0.5">„{selected.kundenbeispiel}"</p>
          </div>
          <div>
            <p className={`text-[10px] uppercase tracking-wider font-semibold ${cls.label} opacity-70`}>Dispatch-Hinweis</p>
            <p className="text-xs mt-0.5">{selected.dispatch_hinweis}</p>
          </div>
        </div>
      )}

      {typ === 'sonstiges' && (
        <textarea
          value={freitext}
          onChange={e => setFreitext(e.target.value)}
          placeholder="Beschreibung (Pflicht — Kanzlei braucht den genauen Typ für das AS)..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs h-20 resize-none"
        />
      )}

      {/* AAR-83 + AAR-114: Kamera-Check bei Parkplatz ohne Kennzeichen */}
      {isParkplatzOhneKz && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800">Kein Kennzeichen — Kamera-Check Pflicht</p>
          <p className="text-xs italic text-amber-800">
            „War auf dem Parkplatz eine Überwachungskamera vorhanden?"
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setKamera(true)} className={`flex-1 px-3 py-1.5 rounded text-xs font-medium ${kamera === true ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-300'}`}>Ja → Fall anlegen</button>
            <button type="button" onClick={() => setKamera(false)} className={`flex-1 px-3 py-1.5 rounded text-xs font-medium ${kamera === false ? 'bg-red-600 text-white' : 'bg-white text-gray-700 border border-gray-300'}`}>Nein → Disqualifizieren</button>
          </div>
          {kamera === true && <p className="text-[10px] text-green-700">Kanzlei/SV kann Betreiber anschreiben. parkplatz_kamera=true wird gesetzt.</p>}
          {kamera === false && <p className="text-[10px] text-red-700">Lead wird disqualifiziert (Parkplatz ohne KZ + ohne Kamera). Exit-Skript wird angezeigt.</p>}
        </div>
      )}

      {toast && <p className={`text-xs ${toast === 'Gespeichert' ? 'text-green-700' : 'text-amber-800'}`}>{toast}</p>}

      <button
        disabled={pending || !typ}
        onClick={save}
        className="w-full px-3 py-2 rounded-lg bg-[#4573A2] text-white text-xs font-medium hover:bg-[#3a6290] disabled:opacity-50"
      >
        {pending ? '...' : 'Schadentyp speichern'}
      </button>
    </div>
  )
}
