import type { SupabaseClient } from '@supabase/supabase-js'
import { telefonSuffix } from '@/lib/auth/lead-kontakt'

// Stufe 2 "Konto nur mit Telefon" (Soll-Blatt 2026-09-20-kunde-konto-nur-telefon-stufe-2.md, 6b):
// Vier Stellen pruefte den Besitz eines Leads per `lead?.email !== user.email`. Sobald Konten ohne
// E-Mail existieren, ist NULL === NULL dort ein TREFFER — jeder Kunde ohne E-Mail "besitzt" jeden
// Lead ohne E-Mail. Dieser Helfer ist die eine Stelle, an der der Vergleich lebt: E-Mail ODER
// Telefon-Suffix, und NULL/leer ist auf keiner Seite je gleich.

export type KontaktUser = { id: string; email?: string | null; phone?: string | null }
export type LeadKontakt = { email?: string | null; telefon?: string | null; telefon_ziffern?: string | null }

/** Reiner Vergleich, testbar. */
export function passtKontaktZuLead(user: KontaktUser, lead: LeadKontakt): boolean {
  const userEmail = user.email?.trim().toLowerCase()
  const leadEmail = lead.email?.trim().toLowerCase()
  if (userEmail && leadEmail && userEmail === leadEmail) return true

  // 9-Ziffern-Suffix wie in lead-kontakt.ts / match-fall.ts — Formate in leads.telefon sind uneinheitlich.
  const userSuffix = telefonSuffix(user.phone ?? null)
  const leadSuffix = telefonSuffix(lead.telefon_ziffern ?? lead.telefon ?? null)
  if (userSuffix && leadSuffix && userSuffix === leadSuffix) return true

  return false
}

/**
 * Gehoert der Lead diesem Kunden? Liest den Lead ueber den Admin-Client — die leads-Policy hat
 * keinen Kunden-Zweig (Soll-Blatt Stufe 1, 6b). admin = createAdminClient().
 */
export async function kundeBesitztLead(admin: SupabaseClient, user: KontaktUser, leadId: string): Promise<boolean> {
  const { data: lead } = await admin.from('leads').select('email, telefon, telefon_ziffern').eq('id', leadId).maybeSingle()
  if (!lead) return false
  return passtKontaktZuLead(user, lead as LeadKontakt)
}
