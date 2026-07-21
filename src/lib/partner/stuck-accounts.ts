// Geteilter Detektor fuer "tote" Partner-Accounts: angelegt, Zugangs-Mail ist raus,
// aber der Partner hat sich NIE eingeloggt (force_password_change steht noch).
//
// Zwei Consumer mit verschiedenen Zwecken teilen sich GENAU EINE Query-Logik:
//   - Health-Check  stuck-partner-accounts         -> BEOBACHTET (crit-Metrik /admin/health)
//   - Cron          partner-aktivierung-nachfassen -> HANDELT    (Vertriebs-Task je Partner)
//
// Result-Object statt nacktem Array: der Health-Check muss einen DB-Fehler als
// status='error' melden koennen — ein leeres Array waere faelschlich "0 stuck = ok".
import type { SupabaseClient } from '@supabase/supabase-js'
import { istInterneEmail } from '@/lib/testdaten/interne-identitaet'

export type StuckPartner = {
  userId: string
  email: string
  rolle: string
  /** [vorname, nachname] gejoint. profiles.vorname traegt bei werkstatt/makler die FIRMA
   *  (nachname null), bei sachverstaendiger den Vornamen. */
  name: string | null
  telefon: string | null
  /** profiles.created_at (ISO) */
  seit: string
}

export type StuckPartnerResult =
  | { ok: true; partner: StuckPartner[] }
  | { ok: false; error: string }

/** Externe Partner-Rollen (Cron-Default). kundenbetreuer = internes Personal -> kein Vertriebs-Task. */
export const EXTERNE_PARTNER_ROLLEN: string[] = ['werkstatt', 'makler', 'sachverstaendiger']

const DEFAULT_ALTER_TAGE = 7

type ProfRow = {
  id: string
  email: string | null
  rolle: string
  vorname: string | null
  nachname: string | null
  telefon: string | null
  created_at: string | null
}

export async function findStuckPartnerAccounts(
  admin: SupabaseClient,
  opts?: { rollen?: string[]; alterTage?: number },
): Promise<StuckPartnerResult> {
  const rollen = opts?.rollen ?? EXTERNE_PARTNER_ROLLEN
  const alterTage = opts?.alterTage ?? DEFAULT_ALTER_TAGE
  const cutoff = new Date(Date.now() - alterTage * 24 * 3600 * 1000).toISOString()

  const { data, error } = await admin
    .from('profiles')
    .select('id, email, rolle, vorname, nachname, telefon, created_at')
    .eq('force_password_change', true)
    .in('rolle', rollen)
    .lt('created_at', cutoff)

  if (error) return { ok: false, error: error.message }

  // Interne/Test-Identitaeten raus (SSoT-Helper): Firmendomain @claimondo.de/.test,
  // example.*, lex-drive.com + test/smoke/e2e-Wortmarker. Verhindert Vertriebs-Tasks
  // auf eigene Accounts (z.B. kb@claimondo.de) und auf Smoke-Fixtures.
  const kandidaten = ((data ?? []) as ProfRow[]).filter((p) => !istInterneEmail(p.email))

  // Nur wer sich NIE eingeloggt hat. getUserById-Fehler -> Kandidat ueberspringen
  // (defensiv: lieber unter- als uebermelden, kein Fehlalarm).
  const partner: StuckPartner[] = []
  for (const p of kandidaten) {
    const { data: udata, error: uErr } = await admin.auth.admin.getUserById(p.id)
    if (uErr) continue
    if (udata?.user && !udata.user.last_sign_in_at) {
      partner.push({
        userId: p.id,
        email: p.email ?? '',
        rolle: p.rolle,
        name: [p.vorname, p.nachname].filter(Boolean).join(' ') || null,
        telefon: p.telefon ?? null,
        seit: p.created_at ?? '',
      })
    }
  }

  return { ok: true, partner }
}
