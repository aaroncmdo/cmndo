// AAR-628: Single-Source-of-Truth für Fallakte-URLs.
//
// Bis AAR-628 war die URL /admin/faelle/[id] an 189 Stellen in 82 Files
// hardcoded — jede Änderung hätte einen Grep-Sweep bedeutet. Dieser
// Helper konsolidiert das auf einen einzigen Aufruf fallakteUrl(id).
//
// Die URL ist bewusst rollen-agnostisch: Admin, KB und Kanzlei teilen
// sich dieselbe Route. Die Rolle steuert innerhalb der Route welche
// Shell/Sidebar und welche Actions sichtbar sind (siehe
// src/app/faelle/layout.tsx + _lib/permissions.ts).

/** Interne URL zur Fallakte-Detail-Seite. */
export function fallakteUrl(fallId: string): string {
  return `/faelle/${fallId}`
}

/** Absolute URL zur Fallakte — für E-Mail-Templates und Notifications
 *  die außerhalb des App-Containers rausgehen. */
export function fallakteAbsoluteUrl(fallId: string, appUrl?: string): string {
  const base = appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${base}${fallakteUrl(fallId)}`
}
