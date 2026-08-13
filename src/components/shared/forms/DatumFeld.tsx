'use client'

// Ops-Test 11.08. (#13): Datumsfeld, das IMMER deutsch anzeigt — unabhaengig vom Browser.
//
// Ein natives `<input type="date">` rendert im Browser-/OS-Locale: ein deutscher Nutzer mit
// englischem System sieht MM/DD/YYYY. Das laesst sich nicht erzwingen (Chrome ignoriert
// `lang`, nur Firefox respektiert es) — derselbe Grund, aus dem der WunschterminPicker
// (AAR-956) das native Feld ersetzt hat.
//
// Bewusst KEIN Kalender-Popup: Fuer ein Datum in der VERGANGENHEIT (Unfalldatum,
// Erstzulassung) ist Tippen schneller als Zurueckblaettern. Ein Picker ist bei Termin-WAHL
// richtig (Zukunft) — dafuer gibt es den WunschterminPicker.
//
// Der nach aussen gemeldete Wert bleibt ISO (YYYY-MM-DD), identisch zum nativen Feld —
// damit sind alle bestehenden Schreibpfade unveraendert nutzbar.

import { useState } from 'react'
import { TextField } from './TextField'
import { formatiereDatumEingabe, deZuIso, isoZuDe } from '@/lib/format/datum-de'

export function DatumFeld({
  label,
  valueIso,
  onChangeIso,
  hint,
  required,
  disabled,
}: {
  label: string
  /** ISO YYYY-MM-DD (oder leer). */
  valueIso: string | null | undefined
  /** Meldet ISO zurueck — leer, solange die Eingabe noch kein gueltiges Datum ergibt. */
  onChangeIso: (iso: string) => void
  hint?: string
  required?: boolean
  disabled?: boolean
}) {
  // Die Anzeige lebt lokal, damit Zwischenstaende beim Tippen ("15.03.") stehen bleiben.
  // Nach aussen geht nur, was ein echtes Datum ergibt — sonst schriebe jeder Tastendruck
  // Muell in den Lead.
  const [anzeige, setAnzeige] = useState(() => isoZuDe(valueIso))

  return (
    <TextField
      label={label}
      hint={hint}
      required={required}
      disabled={disabled}
      value={anzeige}
      inputMode="numeric"
      autoComplete="off"
      placeholder="TT.MM.JJJJ"
      maxLength={10}
      onChange={(e) => {
        const formatiert = formatiereDatumEingabe(e.target.value)
        setAnzeige(formatiert)
        onChangeIso(deZuIso(formatiert) ?? '')
      }}
    />
  )
}
