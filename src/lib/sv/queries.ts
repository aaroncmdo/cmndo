// AAR-SV-Audit: Shared Query-Library für sachverstaendige-Zugriffe.
//
// Begründung aus Audit:
// 60+ Dateien lesen direkt `.from('sachverstaendige').select(...)`. Filter
// driften auseinander (findBestSV vs. gutachter-matching, Karten-Tab vs.
// Dispatch-Liste). Diese Library definiert EINE Wahrheit pro Use-Case:
//
//   getDispatchableSvs()  → SVs die einen Fall bekommen dürfen
//   getAdminVisibleSvs()  → SVs die Admin im Portal sehen soll (inkl. Onboarding)
//   getSvStatusBucket()   → Pure-Helper für UI-Filter (aktiv/onboarding/gesperrt)
//
// Harte Regeln (abgesprochen):
//   - Ein SV darf Fälle bekommen erst wenn portal_zugang_freigeschaltet=true.
//     Grund: Anzahlung muss durch sein — Basis des Geschäftsmodells.
//   - Admin-manuelle Sperre läuft über `gesperrt_seit` / `gesperrt_grund`.
//     `ist_aktiv` ist reserviert für den automatischen Onboarding-Flow
//     (false beim Anlegen, true wenn Stripe-Webhook + Willkommen-Flow durch).
//   - Soft-Delete: `geloescht_am IS NOT NULL`.

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Filter-Klauseln (deklarativ) ────────────────────────────────────────

/**
 * Filter für SVs die Fälle bekommen dürfen.
 *   - portal_zugang_freigeschaltet=true (Anzahlung durch, Portal offen)
 *   - ist_aktiv=true (technisch aktiv — wird vom Stripe-Webhook zusammen mit
 *     portal_zugang_freigeschaltet gesetzt, siehe /api/stripe/webhook/route.ts)
 *   - gesperrt_seit IS NULL (kein Admin-Block)
 *   - geloescht_am IS NULL (nicht gelöscht)
 *
 * Wird in findBestSV + gutachter-matching + sv-zuweisung genutzt.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
// Generic-Signatur: nimmt einen PostgrestFilterBuilder + returnt ihn. Nicht
// typsicher (any), aber Supabase's generierte Builder-Typen sind zu komplex
// für ein brauchbares Generic-Constraint — der Consumer castet selbst.
export function applyDispatchableFilter(q: any): any {
  return q
    .eq('ist_aktiv', true)
    .eq('portal_zugang_freigeschaltet', true)
    .is('gesperrt_seit', null)
    .is('geloescht_am', null)
}

/**
 * Filter für Admin-Listing: alle sichtbaren SVs inkl. Onboarding + Gesperrt.
 * NUR gelöschte werden ausgeblendet. Die Unterscheidung aktiv/onboarding/gesperrt
 * erfolgt clientseitig über Status-Buckets (siehe getSvStatusBucket).
 */
export function applyAdminVisibleFilter(q: any): any {
  return q.is('geloescht_am', null)
}

// ─── Convenience-Queries ────────────────────────────────────────────────

export type SvStatusFields = {
  ist_aktiv: boolean | null
  portal_zugang_freigeschaltet: boolean | null
  gesperrt_seit: string | null
  geloescht_am: string | null
}

/**
 * Pure Helper — bestimmt den Status-Bucket eines SV für UI-Filter.
 * Priorisierung: geloescht > gesperrt > onboarding > aktiv.
 */
export type SvStatusBucket = 'aktiv' | 'onboarding' | 'gesperrt' | 'geloescht'

export function getSvStatusBucket(sv: SvStatusFields): SvStatusBucket {
  if (sv.geloescht_am) return 'geloescht'
  if (sv.gesperrt_seit) return 'gesperrt'
  // Onboarding = Portal noch nicht freigeschaltet ODER technisch nicht aktiv.
  // Beides wird vom Stripe-Webhook gleichzeitig auf true gesetzt — in der
  // Übergangsphase (zwischen Wizard-Insert und Stripe-Callback) kann beides
  // noch false sein. Wir akzeptieren beide als Onboarding-Signal.
  if (!sv.portal_zugang_freigeschaltet || !sv.ist_aktiv) return 'onboarding'
  return 'aktiv'
}

/**
 * Zählt SVs pro Bucket — für Banner im Admin-Portal.
 */
export type SvBucketCounts = Record<SvStatusBucket, number>

export function countSvsByBucket(svs: SvStatusFields[]): SvBucketCounts {
  const counts: SvBucketCounts = { aktiv: 0, onboarding: 0, gesperrt: 0, geloescht: 0 }
  for (const sv of svs) {
    counts[getSvStatusBucket(sv)]++
  }
  return counts
}

/**
 * Shortcut: lädt alle dispatchbaren SVs mit dem übergebenen Select.
 * Nutzt applyDispatchableFilter — die eine Wahrheit für Matching.
 */
export async function getDispatchableSvs<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  select: string,
): Promise<T[]> {
  const q = supabase.from('sachverstaendige').select(select)
  const { data, error } = await applyDispatchableFilter(q)
  if (error) {
    console.error('[sv-queries] getDispatchableSvs:', error.message)
    return []
  }
  return (data as unknown as T[]) ?? []
}
