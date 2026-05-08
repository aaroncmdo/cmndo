// Default-Avatar fuer Kunden ohne hochgeladenes Profilbild.
// Aaron-Spec 2026-05-07: Statt nur Initialen-Fallback zeigen wir das
// Standard-Bild der jeweiligen Anrede (Herr/Frau). Bilder liegen unter
// /public/avatars/default/. Bei `divers`/null bleibt der Initialen-Fallback,
// weil wir kein neutrales Default-Bild haben.

export type KundeAnrede = 'herr' | 'frau' | 'divers' | null | undefined

const DEFAULTS: Record<'herr' | 'frau', string> = {
  herr: '/avatars/default/kunde-herr.png',
  frau: '/avatars/default/kunde-frau.png',
}

/**
 * Liefert die URL des Default-Avatars fuer die gegebene Anrede.
 * `divers`/null → null (Caller fällt auf Initialen zurück).
 */
export function getDefaultKundeAvatarUrl(anrede: KundeAnrede): string | null {
  if (anrede === 'herr' || anrede === 'frau') return DEFAULTS[anrede]
  return null
}

/**
 * Liefert immer eine Avatar-URL: erst der hochgeladene `avatar_url`, sonst
 * der Anrede-spezifische Default. Nur wenn weder noch verfuegbar — null
 * (dann Initialen-Fallback in der UI).
 */
export function resolveKundeAvatarUrl(
  uploadedUrl: string | null | undefined,
  anrede: KundeAnrede,
): string | null {
  if (uploadedUrl) return uploadedUrl
  return getDefaultKundeAvatarUrl(anrede)
}
