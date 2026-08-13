'use client'

// Ops-Test #13 (Aaron-Entscheid 13.08.: „mach den date picker"): das NACKTE Gegenstueck
// zu `DatumFeld` — nur das Eingabefeld, ohne Label/Box, mit frei setzbarer className.
//
// Warum daneben statt darin: `DatumFeld` bringt Label + TextField-Rahmen mit und passt
// damit nicht in Masken, die ihr eigenes Layout setzen (Inline-Tabellenzeilen, kompakte
// Modals mit `text-[11px]`). Die eigentliche LOGIK ist nicht dupliziert — beide nutzen
// dieselben Helfer aus `@/lib/format/datum-de`.
//
// Wie das native Feld meldet es ISO (YYYY-MM-DD) nach aussen; alle bestehenden
// Schreibpfade bleiben unveraendert. Bewusst kein Kalender-Popup: hier werden
// VERGANGENE Daten erfasst (Geburtsdatum, Eingangsdatum) — Tippen schlaegt Blaettern.
// Fuer Termin-WAHL (Zukunft) bleibt das native Feld bzw. der WunschterminPicker richtig.

import { useState } from 'react'
import { formatiereDatumEingabe, deZuIso, isoZuDe, istUnvollstaendigeEingabe } from '@/lib/format/datum-de'

export function DatumInput({
  valueIso,
  onChangeIso,
  className,
  disabled,
  required,
  placeholder = 'TT.MM.JJJJ',
  'aria-label': ariaLabel,
}: {
  /** ISO YYYY-MM-DD (oder leer). */
  valueIso: string | null | undefined
  /** Meldet ISO zurueck — leer, solange die Eingabe noch kein vollstaendiges Datum ergibt. */
  onChangeIso: (iso: string) => void
  className?: string
  disabled?: boolean
  required?: boolean
  placeholder?: string
  'aria-label'?: string
}) {
  // Die Anzeige lebt lokal, damit Zwischenstaende beim Tippen ("15.03.") stehen bleiben.
  const [anzeige, setAnzeige] = useState(() => isoZuDe(valueIso))

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      maxLength={10}
      className={className}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      value={anzeige}
      onChange={(e) => {
        const formatiert = formatiereDatumEingabe(e.target.value)
        setAnzeige(formatiert)
        onChangeIso(deZuIso(formatiert) ?? '')
      }}
      onBlur={() => {
        // Beim Verlassen einen Zwischenstand ("15.03.") sichtbar zuruecksetzen. Sonst
        // steht Text im Feld, der nirgends gespeichert ist — der Nutzer haelt sein
        // Datum fuer erfasst und merkt den Verlust erst nach dem Neuladen.
        if (istUnvollstaendigeEingabe(anzeige)) setAnzeige(isoZuDe(valueIso))
      }}
    />
  )
}
