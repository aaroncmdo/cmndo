// Win-back-Reaktivierung: einmalige Mail an erreichbare TOTE Leads, die den
// Self-Service-/mini_wizard-Flow begonnen, aber nie abgeschlossen haben.
//
// Befund (Prod 03.07.2026): der größte Lead-Kanal mini_wizard (61% aller Leads)
// bekam nie Nurture (Reminder-Cron filtert nur source_channel='self_service')
// → 96% starben. Alle haben Email + reminder_token → reaktivierbar über den
// bestehenden Resume-Pfad /schaden-melden/fortsetzen/[token].
//
// Kohorte bewusst eng + rechtssicher: kalt (kalt geworden) + disqualifiziert-
// wegen-timeout (nur Zeit gerissen). NICHT 'eigenverantwortung' (Eigenverschulden
// = kein Anspruch gegen die Gegenseite). Opt-out + Idempotenz Pflicht.
import type { SupabaseClient } from '@supabase/supabase-js'

export type WinbackLead = {
  status: string | null
  disqualifiziert_grund_key: string | null
  email: string | null
  reminder_token: string | null
  winback_opt_out: boolean | null
  winback_sent_at: string | null
}

export type WinbackCandidate = {
  id: string
  email: string
  vorname: string | null
  reminder_token: string
}

/**
 * Reine Prädikat-Logik — welche Leads dürfen eine Reaktivierungs-Mail bekommen.
 * Erholbar = kalt ODER disqualifiziert-wegen-timeout; niemals eigenverantwortung.
 * Zusätzlich: Email + Token vorhanden, nicht abgemeldet, noch nicht gesendet.
 */
export function isWinbackEligible(lead: WinbackLead): boolean {
  if (!lead.email?.trim() || !lead.reminder_token) return false
  if (lead.winback_opt_out) return false
  if (lead.winback_sent_at) return false // Idempotenz — kein Doppel-Blast

  if (lead.status === 'kalt') return true
  if (lead.status === 'disqualifiziert' && lead.disqualifiziert_grund_key === 'timeout') return true
  return false
}

/** Resume-Link — identisch zum bestehenden Lead-Reminder-Pfad (bewährt). */
export function winbackResumeUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || 'https://claimondo.de'
  return `${base.replace(/\/$/, '')}/schaden-melden/fortsetzen/${token}`
}

/** Abmelde-Link (Opt-out) — setzt winback_opt_out über /abmelden/[token]. */
export function winbackOptOutUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || 'https://claimondo.de'
  return `${base.replace(/\/$/, '')}/abmelden/${token}`
}

/**
 * Lädt die reaktivierbaren Leads. Status-Filter deckt die Konvertierten (status
 * 'umgewandelt') implizit ab — die sind nie kalt/disqualifiziert. Prädikat läuft
 * zusätzlich als Sicherheitsnetz über jede Zeile.
 */
export async function getWinbackCandidates(
  db: SupabaseClient,
  limit = 500,
): Promise<WinbackCandidate[]> {
  const { data, error } = await db
    .from('leads')
    .select('id, email, vorname, reminder_token, status, disqualifiziert_grund_key, winback_opt_out, winback_sent_at')
    .or('status.eq.kalt,and(status.eq.disqualifiziert,disqualifiziert_grund_key.eq.timeout)')
    .is('winback_sent_at', null)
    .eq('winback_opt_out', false)
    .not('email', 'is', null)
    .not('reminder_token', 'is', null)
    .limit(limit)
  if (error) {
    console.error('[winback] Kandidaten-Query fehlgeschlagen:', error.message)
    return []
  }
  return (data ?? [])
    .filter((l) => isWinbackEligible(l as WinbackLead))
    .map((l) => ({
      id: l.id as string,
      email: l.email as string,
      vorname: (l.vorname as string | null) ?? null,
      reminder_token: l.reminder_token as string,
    }))
}

/** Markiert Leads als win-back-gesendet (Idempotenz). */
export async function markWinbackSent(db: SupabaseClient, leadId: string): Promise<boolean> {
  const { error } = await db
    .from('leads')
    .update({ winback_sent_at: new Date().toISOString() })
    .eq('id', leadId)
  if (error) {
    console.error('[winback] markSent fehlgeschlagen:', leadId, error.message)
    return false
  }
  return true
}
