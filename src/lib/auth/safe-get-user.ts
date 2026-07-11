// CMM-14 Root-Crash-Fix.
//
// Portal-Layouts (via requirePortalAccess) riefen supabase.auth.getUser() OHNE
// try/catch auf. Ein transientes Reject (Netzfehler / "context canceled" am
// Post-Login-Navigations-Uebergang — in Prod-Auth-Logs belegt: 500 "context
// canceled" auf /user) warf IM Layout. Da eine Segment-error.tsx nur Page+
// Kinder faengt, NICHT das layout.tsx desselben Segments, eskalierte der Throw
// zur lila Root-Boundary (app/error.tsx) = der wiederkehrende "CMM-14"-Crash.
//
// Die Middleware (src/lib/supabase/middleware.ts, AAR-622) kapselt denselben
// Call bereits in try/catch. safeGetUser zieht diese Sicherung in eine pure,
// dependency-injizierte Funktion — dadurch unit-testbar ohne Next-/Supabase-
// Mock und an allen unguarded getUser-Render-Stellen wiederverwendbar.

/** Minimale strukturelle Form der supabase.auth.getUser()-Antwort. */
export type GetUserResultLike<U> = { data?: { user?: U | null } | null } | null

/**
 * Loest den Auth-User sicher auf: ein Reject (transienter Netz-/Abort-Fehler)
 * wird zu `null` degradiert statt geworfen. Ein aufgeloestes `user: null`
 * (regulaerer Auth-Fehler) bleibt `null`. Der Caller behandelt `null` wie
 * "nicht eingeloggt" (→ redirect('/login')) — nie mehr ein Layout-Throw.
 */
export async function safeGetUser<U>(
  getUser: () => Promise<GetUserResultLike<U>>,
): Promise<U | null> {
  try {
    const res = await getUser()
    return res?.data?.user ?? null
  } catch {
    // Transientes Reject (z.B. "context canceled"): wie die Middleware als
    // "nicht authentifiziert" behandeln statt in die Root-Boundary zu werfen.
    return null
  }
}
