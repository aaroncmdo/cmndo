// Uebersetzt Supabase-Auth-Fehler beim Passwort-Setzen ins Deutsche.
//
// ⚠ WARUM ES DAS GIBT — Prod-Vorfall 23.08.2026: Ein frisch registrierter
// Sachverstaendiger kam bis auf /passwort-aendern, konnte dort aber kein
// Passwort setzen und blieb mit `force_password_change = true` haengen. Vier
// Stellen reichten `updateError.message` ROH an die Oberflaeche durch — der
// Nutzer bekam eine englische Supabase-Meldung zu sehen und wusste nicht, was
// zu tun ist.
//
// ⭐ Der eigentliche Grund, warum die Meldung ueberhaupt kam: Supabase prueft
// SELBST gegen Have-I-Been-Pwned (`password_hibp_enabled = true` in der
// Auth-Config) — zusaetzlich zu unserer eigenen Pruefung in `password-policy.ts`.
// Und die beiden verhalten sich bei einem HIBP-Ausfall GEGENSAETZLICH:
//
//   unsere Policy  → fail-OPEN  (laesst durch, "Verfuegbarkeit vor Zusatz-Check")
//   Supabase       → fail-CLOSED (lehnt ab)
//
// Ist api.pwnedpasswords.com kurz nicht erreichbar, sagt unsere Pruefung "in
// Ordnung" und reicht das Passwort an Supabase weiter, das es dann ablehnt.
// Genau dieser Pfad erzeugt eine Meldung, mit der niemand rechnet.
//
// ⚠ Diese Datei ist bewusst KEIN 'use server'-Modul: dort sind nur async
// Exports erlaubt, und alle vier Aufrufer brauchen die Funktion synchron.

/** Was Supabase je nach Fehlerklasse sinngemaess zurueckgibt. */
type Regel = { treffer: (m: string) => boolean; text: string }

const REGELN: Regel[] = [
  {
    // Supabases eigener HIBP-Check. Die Meldung lautet sinngemaess
    // "Password is known to be weak and easy to guess".
    treffer: (m) =>
      (m.includes('weak') || m.includes('pwned') || m.includes('breach') || m.includes('leak')) &&
      !m.includes('short'),
    text: 'Dieses Passwort taucht in bekannten Daten-Leaks auf. Bitte ein anderes wählen.',
  },
  {
    treffer: (m) => m.includes('should be different') || m.includes('same as the old'),
    text: 'Das neue Passwort muss sich vom bisherigen unterscheiden.',
  },
  {
    treffer: (m) => m.includes('at least') || m.includes('too short') || m.includes('minimum'),
    text: 'Das Passwort ist zu kurz — bitte mindestens 12 Zeichen verwenden.',
  },
  {
    // Session fehlt/abgelaufen. ⚠ Kommt auch, wenn ein Magic-Link-Token bereits
    // verbraucht ist — deshalb der Hinweis auf den Neustart, nicht nur "Fehler".
    treffer: (m) =>
      m.includes('session') || m.includes('not authenticated') || m.includes('jwt') ||
      m.includes('token') && m.includes('expired'),
    text: 'Die Sitzung ist abgelaufen. Bitte den Link erneut anfordern oder neu anmelden.',
  },
  {
    treffer: (m) => m.includes('rate') || m.includes('too many') || m.includes('for security purposes'),
    text: 'Zu viele Versuche. Bitte einen Moment warten und erneut versuchen.',
  },
  {
    treffer: (m) => m.includes('user not found') || m.includes('no user'),
    text: 'Zu dieser Anmeldung wurde kein Konto gefunden. Bitte den Support kontaktieren.',
  },
]

/**
 * Macht aus einer rohen Supabase-Fehlermeldung einen deutschen Satz, der sagt,
 * was zu tun ist.
 *
 * ⚠ Unbekannte Fehler werden NICHT durchgereicht — der Aufrufer soll den
 * Originaltext stattdessen loggen. Eine englische Bibliotheksmeldung in der
 * Oberflaeche hilft niemandem und sieht aus wie ein Absturz.
 */
export function uebersetzePasswortFehler(message: string | null | undefined): string {
  const m = (message ?? '').toLowerCase()
  for (const regel of REGELN) {
    if (regel.treffer(m)) return regel.text
  }
  return 'Das Passwort konnte nicht gesetzt werden. Bitte erneut versuchen.'
}

/**
 * True, wenn die Meldung KEINE der bekannten Klassen trifft — dann lohnt ein
 * `console.error` mit dem Originaltext, damit der Fall auffaellt und hier
 * ergaenzt werden kann.
 */
export function istUnbekannterPasswortFehler(message: string | null | undefined): boolean {
  const m = (message ?? '').toLowerCase()
  return !REGELN.some((r) => r.treffer(m))
}
