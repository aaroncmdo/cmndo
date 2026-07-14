'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { EmailOtpType } from '@supabase/supabase-js'

// Prefetch-Haertung: verifyOtp laeuft NUR hier (POST aus der /auth/bestaetigen-Seite,
// ausgeloest durch einen echten Nutzer-Klick). Ein Mail-Scanner/Prefetcher macht GET,
// nie POST -> der Einmal-Token wird nicht mehr vorab verbrannt.
//
// Bewusst KEIN Result-Object-Pattern: dieser Endpunkt endet IMMER in einem redirect()
// (Erfolg -> `next`, Fehler -> /login mit Hinweis) — es gibt keinen Wert fuer einen Caller.

// verifyOtp-Typen, die wir ueber Magic-Links/Reset ausstellen (buildWelcomeConfirmLink).
const ERLAUBTE_TYPEN = new Set<EmailOtpType>(['recovery', 'magiclink', 'email', 'invite'])

function sichererNext(raw: string | null): string {
  // Open-Redirect-Schutz: nur interne absolute Pfade (kein //host, kein http://…).
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

export async function bestaetigeMagicLink(formData: FormData): Promise<void> {
  const tokenHash = (formData.get('token_hash') as string | null)?.trim() || null
  const typeRaw = (formData.get('type') as string | null)?.trim() || null
  const next = sichererNext(formData.get('next') as string | null)

  const type = typeRaw && ERLAUBTE_TYPEN.has(typeRaw as EmailOtpType) ? (typeRaw as EmailOtpType) : null

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      // Session sitzt jetzt als Cookie (Server-Action darf Cookies setzen) -> weiter zum Ziel.
      redirect(next)
    }
    console.error('[auth/bestaetigen] verifyOtp fehlgeschlagen:', error.message)
  }

  redirect('/login?error=' + encodeURIComponent('Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.'))
}
