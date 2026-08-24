/**
 * Deutsche Impressums-Schreibweisen -> E.164 (F-16).
 *
 * Gibt null zurueck statt zu raten (R-B). Kein Vertrauen in die Laenge: unter
 * 8 Ziffern ist keine vollstaendige Rufnummer, ueber 15 keine gueltige E.164 —
 * beides ist eher ein Datum, eine Steuernummer oder Fliesstext.
 */
export function zuE164(roh: string): string | null {
  if (!roh) return null

  let s = roh.replace(/[^\d+]/g, '')
  if (!s) return null

  if (s.startsWith('00')) s = '+' + s.slice(2)
  else if (s.startsWith('0')) s = '+49' + s.slice(1)
  else if (!s.startsWith('+')) s = '+49' + s

  // '+49(0)251...' -> die fuehrende Null nach der Landesvorwahl faellt weg
  s = s.replace(/^\+490+/, '+49')

  const ziffern = s.replace(/\D/g, '')
  if (ziffern.length < 8 || ziffern.length > 15) return null
  return s
}
