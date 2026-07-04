// Health-Check: Kanzlei-Per-Firma-RLS-Scoping (Multi-Mandanten-Tripwire)
//
// Hintergrund (Bug-Audit 03.07.): Die Kanzlei-Sichtbarkeit ist app-weit ein FLAT
// Gate (rolle='kanzlei' [AND service_typ='komplett']) OHNE Per-Firma-Scoping —
// ~13 RLS-Policies + claim_sichtbar_fuer_aktuellen_user. Bei genau EINER Kanzlei-
// Firma ist das harmlos. Sobald aber eine ZWEITE reale Kanzlei onboardet, sieht
// jede Kanzlei die Mandate/Dokumente/Positionen der anderen = Cross-Tenant-Leak.
//
// Dieser Check ist der TRIPWIRE fuer die bewusst aufgeschobene Per-Firma-Migration
// (SPEC-kanzlei-per-firma-scoping.md): er feuert erst wenn >=2 reale (Nicht-Test)
// Kanzlei-Firmen aktiv sind UND das Per-Firma-Scoping (Funktion is_kanzlei_for_claim)
// noch nicht existiert. Self-resolving: sobald die Spec-Migration is_kanzlei_for_claim
// anlegt, geht der Check auf ok. Heute inert (1 Firma = "Test Kanzlei (Smoke)").

import type { HealthCheck, CheckResult } from '@/lib/health/types'

export const kanzleiTenancyScopingCheck: HealthCheck = {
  id: 'kanzlei-tenancy-scoping',
  category: 'config',
  title: 'Kanzlei-Per-Firma-RLS-Scoping (Multi-Mandanten)',

  async run(ctx): Promise<CheckResult> {
    // 1. Aktive REALE Kanzlei-Firmen zaehlen (Test/Smoke-Fixtures ausschliessen).
    const { data: firmen, error } = await ctx.supabase
      .from('kanzleien')
      .select('id, name')
      .eq('aktiv', true)
      .not('name', 'ilike', '%test%')
      .not('name', 'ilike', '%smoke%')

    if (error) {
      return { status: 'error', detail: `DB-Fehler beim Prüfen der Kanzlei-Firmen: ${error.message}` }
    }
    const realeFirmen = (firmen ?? []) as Array<{ id: string; name: string | null }>

    // Bei <2 realen Firmen ist der Flat-Gate safe (kein Cross-Tenant moeglich).
    if (realeFirmen.length < 2) {
      return {
        status: 'ok',
        metric: realeFirmen.length,
        detail: `${realeFirmen.length} reale Kanzlei-Firma(en) — Flat-Gate ausreichend (Per-Firma-Scoping erst ab 2 Firmen nötig).`,
      }
    }

    // 2. >=2 reale Firmen -> ist das Per-Firma-Scoping schon gebaut?
    //    Probe: existiert die Funktion is_kanzlei_for_claim? (rpc -> PGRST202 wenn nicht).
    const { error: rpcErr } = await ctx.supabase.rpc('is_kanzlei_for_claim', {
      p_claim_id: '00000000-0000-0000-0000-000000000000',
    })
    const scopingFehlt =
      !!rpcErr && /PGRST202|could not find|does not exist|not found|schema cache/i.test(rpcErr.message || '')

    if (scopingFehlt) {
      return {
        status: 'crit',
        metric: realeFirmen.length,
        detail:
          `${realeFirmen.length} reale Kanzlei-Firmen aktiv, aber KEIN Per-Firma-RLS-Scoping ` +
          `(is_kanzlei_for_claim fehlt) → Cross-Tenant-Leak zwischen Kanzleien! ` +
          `SPEC-kanzlei-per-firma-scoping.md ausführen (Mapping + 13 Policies + claim_sichtbar).`,
        sampleIds: realeFirmen.slice(0, 5).map((f) => f.name ?? f.id),
      }
    }

    return {
      status: 'ok',
      metric: realeFirmen.length,
      detail: `${realeFirmen.length} reale Kanzlei-Firmen + Per-Firma-Scoping (is_kanzlei_for_claim) vorhanden.`,
    }
  },
}
