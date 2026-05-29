// Portal-i18n Welle 1 (F-02/F-03): server-seitige Locale-Auflösung aus den
// nutzerbasierten Quellen — profiles.sprache (auth) und Token→leads.sprache
// (Magic-Link). Wird ausschließlich aus request.ts (getRequestConfig) aufgerufen.
//
// Beide Funktionen sind in React cache() gewrappt → ein DB-Read pro Request,
// auch wenn Layout + request.ts mehrfach auflösen. Jeder Fehlerpfad → null,
// damit request.ts auf Cookie/DEFAULT_LOCALE zurückfällt (kritischer Pfad,
// nie crashen — CONTEXT §8 B3).

import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Locale } from './locales'
import { extractTokenFromPath, normalizeToLocale } from './locale-source'

/**
 * Locale des eingeloggten Nutzers aus profiles.sprache (eigene Zeile, RLS-gedeckt).
 * null → kein User / keine/ungültige Sprache → Caller fällt auf Cookie zurück.
 */
export const resolveUserLocale = cache(async (): Promise<Locale | null> => {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase
      .from('profiles')
      .select('sprache')
      .eq('id', user.id)
      .maybeSingle()
    return normalizeToLocale((profile as { sprache?: string | null } | null)?.sprache)
  } catch {
    return null
  }
})

/** leads.sprache zu einer Lead-ID (service-role, anon-Routen). */
async function localeFromLeadId(db: SupabaseClient, leadId: string): Promise<Locale | null> {
  const { data: lead } = await db.from('leads').select('sprache').eq('id', leadId).maybeSingle()
  return normalizeToLocale((lead as { sprache?: string | null } | null)?.sprache)
}

/**
 * Locale aus einem Magic-Link-Token. Spiegelt die FK-Trace-Pfade des
 * Branding-Resolvers (src/lib/branding/token-theme.ts). Token-Routen sind
 * anonym → service-role-Client (createAdminClient), kein RLS-Block.
 * null → Cookie/DEFAULT_LOCALE-Fallback.
 */
export const resolveLocaleFromToken = cache(async (pathname: string): Promise<Locale | null> => {
  try {
    const parsed = extractTokenFromPath(pathname)
    if (!parsed) return null
    const { kind, token } = parsed
    if (!token || token.length < 16) return null
    const db = createAdminClient()

    switch (kind) {
      case 'flow': {
        // flow_links.sprache ist direkt gesetzt; Fallback auf den Lead.
        const { data: fl } = await db
          .from('flow_links')
          .select('sprache, lead_id')
          .eq('token', token)
          .maybeSingle()
        if (!fl) return null
        const direct = normalizeToLocale((fl as { sprache?: string | null }).sprache)
        if (direct) return direct
        const leadId = (fl as { lead_id?: string | null }).lead_id
        return leadId ? localeFromLeadId(db, leadId) : null
      }
      case 'upload-dokumente': {
        const { data: anfrage } = await db
          .from('dokument_upload_anfragen')
          .select('lead_id')
          .eq('token', token)
          .maybeSingle()
        const leadId = (anfrage as { lead_id?: string | null } | null)?.lead_id
        return leadId ? localeFromLeadId(db, leadId) : null
      }
      case 'upload-zb1': {
        const { data: lead } = await db
          .from('leads')
          .select('sprache')
          .eq('zb1_token', token)
          .maybeSingle()
        return normalizeToLocale((lead as { sprache?: string | null } | null)?.sprache)
      }
      // re-termin / ablehnen: faelle.re_termin_token bzw. SV-Token — Welle 4.
      // Bis dahin Cookie-Fallback (heute ohnehin nur 'de' im Bestand).
      default:
        return null
    }
  } catch {
    return null
  }
})
