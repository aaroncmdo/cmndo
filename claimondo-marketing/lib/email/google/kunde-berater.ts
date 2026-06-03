// P2: Berater-Auflösung für kundengerichtete Mails (Aaron 2026-05-29).
//   pre-Termin (noch kein Termin stattgefunden)  → zugewiesener Dispatcher:
//     faelle.lead_id → leads.zugewiesen_an → profiles
//   post-Termin (Termin hat stattgefunden)       → Kundenbetreuer:
//     claims.kundenbetreuer_id → profiles
// Kein Treffer → null → Caller/Template lässt den Berater-Block weg (datengetrieben).
import type { SupabaseClient } from '@supabase/supabase-js'

export type KundeBerater = { name: string; photoUrl: string | null; contact: string }

async function dispatcherProfileId(db: SupabaseClient, leadId: string | null): Promise<string | null> {
  if (!leadId) return null
  const { data } = await db.from('leads').select('zugewiesen_an').eq('id', leadId).maybeSingle()
  return (data?.zugewiesen_an as string | null) ?? null
}

async function kundenbetreuerProfileId(db: SupabaseClient, claimId: string | null): Promise<string | null> {
  if (!claimId) return null
  const { data } = await db.from('claims').select('kundenbetreuer_id').eq('id', claimId).maybeSingle()
  return (data?.kundenbetreuer_id as string | null) ?? null
}

export async function resolveKundeBerater(
  db: SupabaseClient,
  opts: { claimId: string | null; leadId: string | null; terminVergangen: boolean },
): Promise<KundeBerater | null> {
  const profileId = opts.terminVergangen
    ? await kundenbetreuerProfileId(db, opts.claimId)
    : await dispatcherProfileId(db, opts.leadId)
  if (!profileId) return null

  const { data: p } = await db
    .from('profiles')
    .select('anzeigename, vorname, nachname, avatar_url, telefon')
    .eq('id', profileId)
    .maybeSingle()
  if (!p) return null

  const name =
    (p.anzeigename as string | null)?.trim() ||
    [p.vorname, p.nachname].filter(Boolean).join(' ').trim()
  if (!name) return null

  const tel = (p.telefon as string | null)?.trim() || null
  return {
    name,
    photoUrl: (p.avatar_url as string | null) ?? null,
    // WhatsApp = Markenbegriff, verbatim über alle Locales.
    contact: tel ? `WhatsApp · ${tel}` : '',
  }
}
