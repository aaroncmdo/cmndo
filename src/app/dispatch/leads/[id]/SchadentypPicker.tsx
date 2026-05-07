'use client'

// AAR-81 + AAR-83 + AAR-114: Schadentyp-Picker (Notion-Spec 14.04.2026 §3)
// 5 Typen mit icon/beschreibung_ma/kundenbeispiel/dispatch_hinweis/farbe
// Plus Parkplatz-Kamera-Check mit woertlicher italic Frage.

import { useState, useTransition } from 'react'
import { saveSchadentyp, clearSchadentyp } from './actions'
import { XIcon } from 'lucide-react'

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
  blue: { wrap: 'bg-claimondo-bg text-claimondo-navy', label: 'text-claimondo-navy', border: 'border-claimondo-border' },
  green: { wrap: 'bg-green-50 text-green-800', label: 'text-green-900', border: 'border-green-200' },
  amber: { wrap: 'bg-amber-50 text-amber-800', label: 'text-amber-900', border: 'border-amber-200' },
  red: { wrap: 'bg-red-50 text-red-800', label: 'text-red-900', border: 'border-red-200' },
  gray: { wrap: 'bg-claimondo-bg text-claimondo-navy', label: 'text-claimondo-navy', border: 'border-claimondo-border' },
}

export default function SchadentypPicker({ leadId, initialTyp, initialFreitext, gegnerKennzeichen, initialKamera, onSaved }: {
  leadId: string
  initialTyp?: Schadentyp | null
  initialFreitext?: string | null
  gegnerKennzeichen?: string | null
  initialKamera?: boolean | null
  // AAR-268: Callback nach erfolgreichem Save (für Phase3-Wrapper Weiter-Button)
  onSaved?: () => void
}) {
  const [typ, setTyp] = useState<Schadentyp | null>(initialTyp ?? null)
  const [freitext, setFreitext] = useState(initialFreitext ?? '')
  const [kamera, setKamera] = useState<boolean | null>(initialKamera ?? null)
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState('')
  // AAR-215: dedizierter Error-State für DB-Constraint-Violations & Co. —
  // vorher landeten alle Meldungen im selben "toast" und Errors waren visuell
  // kaum von "Gespeichert" zu unterscheiden.
  const [error, setError] = useState<string | null>(null)

  // AAR-83: Parkplatz ohne Kennzeichen → Kamera-Check Pflicht
  const isParkplatzOhneKz = typ === 'parkplatz' && !gegnerKennzeichen?.trim()

  const selected = OPTIONS.find(o => o.value === typ)
  const cls = selected ? FARBE_CLS[selected.farbe] : null

  // AAR-schadentyp-autosave: Auto-Save bei jeder Typ-Auswahl bzw. Kamera-Wahl
  // bzw. Freitext-Blur. Der alte Bottom-Button „Schadentyp speichern" entfällt.
  // save() bekommt die Zielwerte per Argument, damit der React-State-Update
  // nicht erst warten muss (useState ist async — save(typ) aus dem onClick-
  // Handler würde sonst auf den alten Wert zugreifen).
  function save(opts: {
    typ: Schadentyp
    freitext: string | null
    kamera: boolean | null
  }) {
    if (opts.typ === 'sonstiges' && !(opts.freitext ?? '').trim()) {
      // Stillschweigend abbrechen — Freitext wird per onBlur nachgereicht,
      // bis dahin brauchen wir keinen DB-Write.
      return
    }
    if (opts.typ === 'parkplatz' && !gegnerKennzeichen?.trim() && opts.kamera === null) {
      // Gleiches Prinzip: Kamera-Wahl fehlt noch → wartet bis der MA Ja/Nein klickt.
      return
    }
    setError(null)
    startTransition(async () => {
      const r = await saveSchadentyp(
        leadId,
        opts.typ,
        opts.typ === 'sonstiges' ? opts.freitext : null,
        opts.kamera,
      )
      if (!r.success) {
        setError(r.error ?? 'Speichern fehlgeschlagen')
        return
      }
      setToast(r.disqualifiziert ? 'Disqualifiziert — Exit-Skript wird angezeigt' : 'Gespeichert')
      setTimeout(() => setToast(''), 2000)
      if (!r.disqualifiziert) {
        onSaved?.()
      }
    })
  }

  function handleTypClick(next: Schadentyp) {
    setTyp(next)
    // Wenn der neue Typ direkt speicherbar ist (kein Freitext / keine Kamera
    // nötig), sofort persistieren. Sonderfälle speichern später via Blur/Click.
    save({ typ: next, freitext, kamera })
  }

  function handleClear() {
    setTyp(null)
    setFreitext('')
    setKamera(null)
    setError(null)
    startTransition(async () => {
      const r = await clearSchadentyp(leadId)
      if (!r.success) {
        setError(r.error ?? 'Zurücksetzen fehlgeschlagen')
        return
      }
      setToast('Zurückgesetzt')
      setTimeout(() => setToast(''), 1500)
    })
  }

  // Freitext-Blur → speichern, wenn der Typ „sonstiges" ist und mind. 3 Zeichen
  // eingegeben sind. Der Kunde kann im Input weitertippen ohne Re-Save zu triggern.
  function handleFreitextBlur() {
    if (typ === 'sonstiges' && freitext.trim().length >= 3) {
      save({ typ, freitext, kamera })
    }
  }

  function handleKameraClick(value: boolean) {
    setKamera(value)
    if (typ === 'parkplatz') {
      save({ typ, freitext, kamera: value })
    }
  }

  return (
    <div className="bg-white border border-claimondo-border rounded-xl p-4 space-y-3">
      {/* AAR-schadentyp-clear: Header-Row mit Clear-Button oben rechts.
          Ersetzt den alten Bottom-„Schadentyp speichern"-Button — Auswahl
          speichert jetzt sofort per Click. Clear nur sichtbar wenn ein Typ
          gesetzt ist, damit die UI ruhig bleibt solange nichts gewählt wurde. */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-semibold text-claimondo-navy">
          Schadentyp <span className="text-claimondo-ondo/70 font-normal">(MA trägt während Telefonat ein)</span>
        </h3>
        {typ && (
          <button
            type="button"
            onClick={handleClear}
            disabled={pending}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-claimondo-border text-[10px] font-medium text-claimondo-ondo hover:bg-claimondo-bg hover:text-red-700 hover:border-red-200 disabled:opacity-40"
          >
            <XIcon className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {OPTIONS.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => handleTypClick(o.value)}
            disabled={pending}
            className={`px-3 py-2.5 rounded-lg text-xs font-medium text-left transition-colors flex flex-col items-start gap-1 disabled:opacity-60 ${
              typ === o.value ? 'bg-claimondo-navy text-white' : 'bg-claimondo-bg text-claimondo-navy hover:bg-claimondo-border'
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
          onBlur={handleFreitextBlur}
          placeholder="Beschreibung (Pflicht — Kanzlei braucht den genauen Typ für das AS)..."
          className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-xs h-20 resize-none"
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
            <button type="button" onClick={() => handleKameraClick(true)} disabled={pending} className={`flex-1 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-60 ${kamera === true ? 'bg-green-600 text-white' : 'bg-white text-claimondo-navy border border-claimondo-border'}`}>Ja → Fall anlegen</button>
            <button type="button" onClick={() => handleKameraClick(false)} disabled={pending} className={`flex-1 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-60 ${kamera === false ? 'bg-red-600 text-white' : 'bg-white text-claimondo-navy border border-claimondo-border'}`}>Nein → Disqualifizieren</button>
          </div>
          {kamera === true && <p className="text-[10px] text-green-700">Kanzlei/SV kann Betreiber anschreiben. parkplatz_kamera=true wird gesetzt.</p>}
          {kamera === false && <p className="text-[10px] text-red-700">Lead wird disqualifiziert (Parkplatz ohne KZ + ohne Kamera). Exit-Skript wird angezeigt.</p>}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs font-semibold text-red-900">Speichern fehlgeschlagen</p>
            <p className="text-xs text-red-700 mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-700 hover:text-red-900 text-lg leading-none"
            aria-label="Schließen"
          >×</button>
        </div>
      )}
      {toast && <p className={`text-xs ${toast === 'Gespeichert' || toast === 'Zurückgesetzt' ? 'text-green-700' : 'text-amber-800'}`}>{toast}</p>}
    </div>
  )
}
