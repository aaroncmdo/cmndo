// Reine Username-Regeln fuer die Community-Kommentare (Spec §Identitaet).
// Eindeutigkeit (UNIQUE) erzwingt die DB; hier nur Form + reservierte Namen.

export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'claimondo', 'admin', 'administrator', 'team', 'support', 'mod', 'moderator',
  'anwalt', 'kanzlei', 'gutachter', 'sachverstaendiger', 'root', 'system', 'claimondo-team',
])

const USERNAME_RE = /^[a-z0-9_-]{3,24}$/

export function validateUsername(
  raw: string,
): { ok: true; username: string } | { ok: false; error: string } {
  const username = raw.trim().toLowerCase()
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: 'Nutzername: 3–24 Zeichen, nur a–z, 0–9, _ und –.' }
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, error: 'Dieser Nutzername ist reserviert.' }
  }
  return { ok: true, username }
}
