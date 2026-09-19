// Reine Suche "Kontakt -> Vorgaenge" fuer den Login ohne Link (Soll-Blatt
// 2026-09-19-kunde-kommt-ohne-link-ins-konto, 1c Weg 2 Schritt 3).
//
// Telefon wird NIE gegen leads.telefon verglichen, sondern gegen die generierte
// Nur-Ziffern-Spalte telefon_ziffern per 9-Ziffern-Suffix — dasselbe Muster wie
// match-fall.ts:38-53: die Spalte traegt beide Formate ('4917…' und '0177…'),
// Gleichheit wuerde die Haelfte verfehlen. Kein Write, kein Auth: der Aufrufer
// entscheidet, was mit dem Ergebnis passiert.
import type { SupabaseClient } from '@supabase/supabase-js'

export type KontaktEingabe = { telefon?: string | null; email?: string | null }
export type VorgaengeZuKontakt = {
  leadIds: string[]
  claimIds: string[]
  /** E-Mail des juengsten passenden Leads — Stufe 1 braucht sie fuer profiles.email (NOT NULL). */
  leadEmail: string | null
  leadVorname: string | null
}

const MIN_ZIFFERN = 6
const SUFFIX_LAENGE = 9

export function telefonSuffix(raw: string | null | undefined): string | null {
  const ziffern = (raw ?? '').replace(/\D/g, '')
  if (ziffern.length < MIN_ZIFFERN) return null
  return ziffern.slice(-SUFFIX_LAENGE)
}

type LeadRow = { id: string; email: string | null; vorname: string | null }

export async function findeVorgaengeZuKontakt(
  admin: SupabaseClient,
  eingabe: KontaktEingabe,
): Promise<VorgaengeZuKontakt> {
  const leer: VorgaengeZuKontakt = { leadIds: [], claimIds: [], leadEmail: null, leadVorname: null }
  const suffix = telefonSuffix(eingabe.telefon)
  const email = (eingabe.email ?? '').trim().toLowerCase() || null
  if (!suffix && !email) return leer

  let q = admin.from('leads').select('id, email, vorname')
  q = suffix ? q.like('telefon_ziffern', `%${suffix}%`) : q.eq('email', email as string)
  const { data: leads, error } = await q.order('created_at', { ascending: false }).limit(10)
  if (error) {
    console.error('[lead-kontakt] leads-Suche fehlgeschlagen:', error.message)
    return leer
  }
  const rows = (leads ?? []) as LeadRow[]
  if (rows.length === 0) return leer

  const leadIds = rows.map((l) => l.id)
  const { data: claims, error: claimErr } = await admin.from('claims').select('id').in('lead_id', leadIds)
  if (claimErr) console.error('[lead-kontakt] claims-Suche fehlgeschlagen:', claimErr.message)

  const mitEmail = rows.find((l) => l.email && l.email.includes('@')) ?? rows[0]
  return {
    leadIds,
    claimIds: ((claims ?? []) as Array<{ id: string }>).map((c) => c.id),
    leadEmail: mitEmail.email ? mitEmail.email.trim().toLowerCase() : null,
    leadVorname: mitEmail.vorname ?? null,
  }
}
