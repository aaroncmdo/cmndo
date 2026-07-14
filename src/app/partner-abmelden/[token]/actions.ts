'use server'
// Cold-Mailer S0: schreibt die Opt-out-Suppression. Service-Client, weil der
// Empfaenger nicht eingeloggt ist (Token IST das Geheimnis) und cold_mail_suppression
// staff-only RLS hat.
import { verifyOptoutToken } from '@/lib/cold-mail/optout-token'
import { createAdminClient } from '@/lib/supabase/admin'

export async function bestaetigeAbmeldung(token: string): Promise<{ ok: boolean; error?: string }> {
  // verifyOptoutToken wirft, wenn das HMAC-Secret fehlt — hier zu einem Result
  // degradieren, damit die Action dem {ok,error}-Kontrakt treu bleibt (AGENTS.md).
  let email: string | null = null
  try {
    email = verifyOptoutToken(token)
  } catch (err) {
    console.error('[bestaetigeAbmeldung] Token-Verify fehlgeschlagen:', err)
    return { ok: false, error: 'Abmeldung derzeit nicht möglich. Bitte kontaktieren Sie kontakt@claimondo.de.' }
  }
  if (!email) return { ok: false, error: 'Ungültiger oder abgelaufener Abmelde-Link.' }

  const admin = createAdminClient()
  // Idempotent: erneutes Klicken desselben Links darf nicht fehlschlagen.
  const { error } = await admin
    .from('cold_mail_suppression')
    .upsert({ email, grund: 'opt_out' }, { onConflict: 'email' })
  if (error) {
    // createAdminClient ist ungetypt -> PostgREST-Fehler kommen still als error-Objekt
    // zurueck (kein throw). Loggen, sonst waere ein Schema-Fehler unsichtbar.
    console.error('[bestaetigeAbmeldung] Suppression-Upsert fehlgeschlagen:', error)
    return { ok: false, error: 'Abmeldung fehlgeschlagen. Bitte versuchen Sie es später erneut.' }
  }
  return { ok: true }
}
