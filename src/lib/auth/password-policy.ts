import { createHash } from 'crypto'

// AAR-auth-haertung (Befund J): Zentrale Passwort-Policy fuer alle Set-Passwort-
// Pfade (Reset, Passwort-Wechsel, …).
//
//  - Mindestlaenge (ASVS L1: >= 12).
//  - HIBP-Breach-Check via k-anonymity: SHA-1 des Passworts, nur die ersten 5
//    Hex-Zeichen gehen an api.pwnedpasswords.com/range/<prefix>; die Antwort
//    listet Suffixe + Trefferzahlen, der Abgleich passiert lokal. Das Passwort
//    UND der volle Hash verlassen uns NIE.
//
// FAIL-OPEN: ist HIBP nicht erreichbar / antwortet fehlerhaft, blockiert der
// Breach-Check das Passwort-Setzen NICHT (Verfuegbarkeit vor Zusatz-Check).

export const MIN_PASSWORT_LAENGE = 12

export async function pruefePasswortStaerke(
  passwort: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!passwort || passwort.length < MIN_PASSWORT_LAENGE) {
    return {
      ok: false,
      error: `Passwort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen lang sein.`,
    }
  }
  if (await istPasswortGeleakt(passwort, fetchImpl)) {
    return {
      ok: false,
      error: 'Dieses Passwort taucht in bekannten Daten-Leaks auf. Bitte wähle ein anderes.',
    }
  }
  return { ok: true }
}

async function istPasswortGeleakt(passwort: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const hash = createHash('sha1').update(passwort).digest('hex').toUpperCase()
    const prefix = hash.slice(0, 5)
    const suffix = hash.slice(5)
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // Padding verschleiert die Popularitaet des Praefix zusaetzlich.
      headers: { 'Add-Padding': 'true' },
    })
    if (!res.ok) return false // fail-open
    const body = await res.text()
    return body.split('\n').some((zeile) => {
      const [suf, count] = zeile.trim().split(':')
      return suf === suffix && Number(count) > 0
    })
  } catch {
    return false // fail-open
  }
}
