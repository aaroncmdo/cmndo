import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// Tier-2-Verifizierungs-Dokumente (haftungskritisch) — beide gemeinsam bilden den
// EINEN verifizierung_status (geprueft/ausstehend/frist_ueberschritten). Enforcement:
// docs/superpowers/specs/2026-08-08-tier2-dokumente-enforcement-design.md.
export const TIER2_SLOTS = ['sv_berufshaftpflicht', 'sv_gewerbeanmeldung'] as const

/**
 * True nur wenn BEIDE Tier-2-Slots (Berufshaftpflicht + Gewerbeanmeldung) in
 * pflichtdokumente den Status 'geprueft' tragen. Grundlage fuer die entkoppelte
 * Freischaltung (freigebeBasicSvCore setzt 'geprueft' nur noch wenn das hier true ist).
 */
export async function sindTier2DocsGeprueft(db: AdminClient, svId: string): Promise<boolean> {
  const { data } = await db
    .from('pflichtdokumente')
    .select('dokument_typ')
    .eq('sv_id', svId)
    .eq('status', 'geprueft')
    .in('dokument_typ', TIER2_SLOTS as unknown as string[])
  const geprueft = new Set((data ?? []).map((r) => r.dokument_typ as string))
  return TIER2_SLOTS.every((slot) => geprueft.has(slot))
}

export const TIER2_FRIST_TAGE = 14

/**
 * Patch fuer die ZWEITE, nutzersichtbare Verifizierungs-Achse `sachverstaendige.verifiziert`.
 *
 * Warum es die zweite Achse ueberhaupt gibt: `verifizierung_status` steuert intern den
 * Dispatch (FG3-Gate, Reminder-Cron), `verifiziert` steuert das, was der KUNDE sieht —
 * das gruene "Verifiziert"-Badge in der Fallakte (kunde/claim-view/TeamZone.tsx) und das
 * Whitelabel-Gate (branding/token-theme.ts: `verifiziert && use_custom_branding`).
 *
 * Der Enforcement-Fix vom 08.08. hat NUR `verifizierung_status` an die Doc-Pruefung
 * gebunden. `verifiziert` blieb blind auf true — auf prod am 31.08. gemessen: 4 SVs mit
 * `verifiziert=true`, `verifizierung_status='ausstehend'` und `verifiziert_von=NULL`,
 * zwei davon zusaetzlich mit `use_custom_branding=true`. Ein Vertrauens-Siegel gegenueber
 * Endkunden, das nie jemand geprueft hat.
 *
 * ⚠ Bewusst nur SETZEN, nie zuruecksetzen: die Freigabe laeuft auch erneut (Admin-Knopf
 * `gibBasicSvFrei`), und sie darf einem echt verifizierten SV das Flag nicht entziehen.
 * Entzogen wird ausschliesslich ueber den Admin-Pfad (setzeSvVerifiziert / Tier-2-Widerruf).
 */
export function berechneVerifiziertPatch(
  tier2Geprueft: boolean,
  jetztIso: string,
): Record<string, unknown> {
  return tier2Geprueft ? { verifiziert: true, verifiziert_am: jetztIso } : {}
}

/**
 * Bestimmt, welchen verifizierung_status/-frist-Patch die Freischaltung schreibt.
 * Kern des Enforcements (Spec 2026-08-08): NICHT mehr blind 'geprueft'.
 *  - Docs beide geprueft            → 'geprueft'
 *  - bereits 'frist_ueberschritten' → {} (nicht zuruecksetzen, bleibt dispatch-geblockt)
 *  - sonst                          → 'ausstehend' (+ neue Frist NUR wenn noch keine gesetzt)
 */
export function berechneTier2Patch(
  tier2Geprueft: boolean,
  aktuellerStatus: string | null,
  aktuelleFrist: string | null,
  jetztMs: number,
  fristTage: number = TIER2_FRIST_TAGE,
): Record<string, unknown> {
  if (tier2Geprueft) return { verifizierung_status: 'geprueft' }
  if (aktuellerStatus === 'frist_ueberschritten') return {}
  const patch: Record<string, unknown> = { verifizierung_status: 'ausstehend' }
  if (aktuelleFrist == null) {
    patch.verifizierung_frist_bis = new Date(jetztMs + fristTage * 864e5).toISOString()
  }
  return patch
}

/**
 * Anti-Bypass-Guard fuer tier2Freigeben (Admin-„geprueft"-Knopf): der Admin darf
 * erst freigeben, wenn beide Tier-2-Slots mindestens hochgeladen sind — sonst reisst
 * man dasselbe Loch wieder auf, das freigebeBasicSvCore alt hatte (blind geprueft).
 */
export function tier2FreigabeErlaubt(
  docs: Array<{ dokument_typ: string; status: string }>,
): boolean {
  const vorhanden = new Set(
    docs
      .filter((d) => d.status === 'hochgeladen' || d.status === 'geprueft')
      .map((d) => d.dokument_typ),
  )
  return TIER2_SLOTS.every((slot) => vorhanden.has(slot))
}
