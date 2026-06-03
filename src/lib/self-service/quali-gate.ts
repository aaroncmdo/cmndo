// AAR-940 Phase 3: Selbst-Quali-Gate (rein, deterministisch).
//
// Policy (Aaron 31.05., gelockt): NUR Eigenverschulden disqualifiziert.
//   eigenverantwortung -> abbruch (kein Termin, fairer Hinweis, Lead disqualifiziert)
//   gegner             -> weiter (sauberer Fall)
//   unklar / sonstiges -> weiter_mit_flag (Termin erlaubt, intern fuer Dispatcher geflaggt)
// "nur Eigenverschulden blockt" => alles ausser eigenverantwortung fuehrt weiter.

export type QualiErgebnis = 'weiter' | 'weiter_mit_flag' | 'abbruch'

export function bewerteSchuldfrage(schuldfrage: string | null | undefined): QualiErgebnis {
  if (schuldfrage === 'eigenverantwortung') return 'abbruch'
  if (schuldfrage === 'gegner') return 'weiter'
  // unklar + jeder andere/leere Wert: nicht Eigenverschulden => kein harter Block,
  // aber fuer den Dispatcher flaggen (Termin trotzdem buchbar).
  return 'weiter_mit_flag'
}
