import type { SupabaseClient } from '@supabase/supabase-js'

// AAR-auth-haertung (Befund H): App-seitiges Lockout fuer 2FA-Verify.
//
// Defense-in-depth ueber GoTrues Provider-seitiges Rate-Limit. Zaehlt
// FEHLversuche pro User in einem gleitenden Fenster; ab der Schwelle wird der
// User kurz gesperrt. Erfolgreicher Verify resettet. Eigene Tabelle
// auth_2fa_attempts (RLS: nur service-role).
//
// WICHTIG: Der Caller (mfa.ts) ruft diese Funktionen FAIL-OPEN auf — ein Fehler
// des Limiters (DB weg o.ae.) darf den Login NIE blockieren. Darum hier kein
// throw-Schlucken; das macht der Caller.

const TABLE = 'auth_2fa_attempts'
export const MAX_2FA_FEHLVERSUCHE = 5
export const FENSTER_MS = 15 * 60 * 1000 // Zaehlfenster
export const SPERRE_MS = 15 * 60 * 1000 // Sperrdauer nach Erreichen der Schwelle

type Db = Pick<SupabaseClient, 'from'>

/** Read-only: ist der User aktuell gesperrt (locked_until in der Zukunft)? */
export async function pruefe2faSperre(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<{ gesperrt: boolean; bis: Date | null }> {
  const { data } = await db
    .from(TABLE)
    .select('locked_until')
    .eq('user_id', userId)
    .maybeSingle()
  const lockedUntilRaw = (data as { locked_until?: string | null } | null)?.locked_until ?? null
  if (!lockedUntilRaw) return { gesperrt: false, bis: null }
  const bis = new Date(lockedUntilRaw)
  return bis > now ? { gesperrt: true, bis } : { gesperrt: false, bis: null }
}

/** Verbucht das Verify-Ergebnis: Erfolg -> reset; Fehler -> hochzaehlen + ggf. sperren. */
export async function registriere2faVerify(
  db: Db,
  userId: string,
  erfolg: boolean,
  now: Date = new Date(),
): Promise<void> {
  if (erfolg) {
    await db.from(TABLE).delete().eq('user_id', userId)
    return
  }

  const { data } = await db
    .from(TABLE)
    .select('failed_count, window_started_at')
    .eq('user_id', userId)
    .maybeSingle()
  const row = data as { failed_count?: number; window_started_at?: string } | null

  // Innerhalb des Fensters weiterzaehlen, sonst Fenster neu starten.
  const fensterAktiv =
    !!row?.window_started_at &&
    now.getTime() - new Date(row.window_started_at).getTime() <= FENSTER_MS

  const failedCount = fensterAktiv ? (row?.failed_count ?? 0) + 1 : 1
  const windowStartedAt = fensterAktiv ? row!.window_started_at! : now.toISOString()
  const lockedUntil =
    failedCount >= MAX_2FA_FEHLVERSUCHE ? new Date(now.getTime() + SPERRE_MS).toISOString() : null

  await db.from(TABLE).upsert({
    user_id: userId,
    failed_count: failedCount,
    window_started_at: windowStartedAt,
    locked_until: lockedUntil,
    updated_at: now.toISOString(),
  })
}
