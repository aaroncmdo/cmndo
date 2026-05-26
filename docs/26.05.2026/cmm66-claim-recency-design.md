# CMM-66 + SV-Realtime — `claim_recency` als Recency-SSoT (Design, 2026-05-26)

**Branch:** `kitta/cmm66-claim-recency` (off staging). **Teil von:** CMM-44 Reststrecke.
**Ersetzt:** die zuvor erwogene `claims.last_activity_at`-Spalte (die Tabelle subsumiert sie)
**und** den naiven SV-RLS-Fix (der das CMM-60-Spalten-Leck wieder öffnen würde).

## Problem

Zwei Konsumenten brauchen ein **Claim-Aktivitäts-/Recency-Signal**:
1. **Views (CMM-66):** `v_claim_full.fall_updated_at` (→ pflichtdokumente-reminder Idle-Gating
   `< 24h`) und `v_faelle_mit_aktuellem_termin.updated_at` (→ makler-Akten-Order) zeigen
   heute auf `f.updated_at`. Nach Phase-6 ist `faelle` weg → muss claims-seitig kommen.
2. **Realtime (`FallRealtimeRefresh` 3. Leg):** Kunde (läuft auf `claims`, 2026-05-26
   verifiziert), Admin (`is_admin()`), **SV blockiert**.

Zwei Sackgassen:
- `claims.updated_at` ist **backfill-geclobbert** (12 distinct/60 live; jede SP-`UPDATE`
  setzt es via moddatetime neu) → untauglich als Recency.
- SV darf `claims` **nicht** lesen: CMM-60 Phase-4 (`20260516193332`) hat
  `is_sv_for_claim` aus der claims-SELECT-Policy **bewusst entfernt**, weil die
  Tabellen-Policy „die ganze Zeile inkl. kanzlei_*/regulierungs_betrag/kunde_email"
  gab. SV liest Claims nur noch spalten-gescopet über `v_claim_sv`. Ein RLS-Re-Add
  würde via `REPLICA IDENTITY FULL`-Realtime-Payload genau dieses Leck wieder öffnen.

## Entscheidung: dedizierte Tabelle `claim_recency`

Eine Mini-Tabelle ohne sensible Spalten ist **ein** Mechanismus für **beide** Bedarfe:

```sql
CREATE TABLE public.claim_recency (
  claim_id uuid PRIMARY KEY REFERENCES public.claims(id) ON DELETE CASCADE,
  last_activity_at timestamptz NOT NULL DEFAULT now()
);
```

- **Leak-frei:** nur `claim_id` + Timestamp → alle Rollen dürfen lesen, ohne CMM-60 zu
  verletzen. Realtime wird **uniform** (alle Portale auf derselben Surface).
- **Backfill-resistent:** nur `touchClaimRecency` + echte Aktivität schreiben rein,
  **kein moddatetime** → SP-Backfills clobbern es nicht.
- **Phase-6-fest:** claims-seitig, unabhängig von `faelle`.

### RLS (SELECT für alle relevanten Rollen; keine sensiblen Spalten → safe)
```sql
ALTER TABLE public.claim_recency ENABLE ROW LEVEL SECURITY;
CREATE POLICY claim_recency_select ON public.claim_recency FOR SELECT TO authenticated
USING (
  is_admin()
  OR is_sv_for_claim(claim_id)
  OR is_claim_user_party(claim_id)
  OR EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_id
             AND (c.geschaedigter_user_id = (SELECT auth.uid())
                  OR (is_dispatcher() AND dispatcher_owns_lead(c.lead_id))))
);
-- kein INSERT/UPDATE-Grant fuer authenticated: Schreiben nur via SECURITY-DEFINER-RPC
-- touch_claim_recency(uuid) bzw. service-role (touchClaimRecency).
```

### Realtime
`ALTER PUBLICATION supabase_realtime ADD TABLE public.claim_recency;` (REPLICA IDENTITY
DEFAULT reicht — Filter `claim_id=eq.<id>` ist PK).

### Schreibpfad
`touch_claim_recency(p_claim_id uuid)` SECURITY DEFINER:
`INSERT … (claim_id, now()) ON CONFLICT (claim_id) DO UPDATE SET last_activity_at = now()`.
`lib/claims/touch-recency.ts` ruft die RPC (statt `claims.update({updated_at})`).

### Backfill (einmalig)
`INSERT INTO claim_recency SELECT id, GREATEST(updated_at, created_at) FROM claims
 ON CONFLICT DO NOTHING;` (Seed; divergiert mit echter Aktivität. Alternativ besseres
 Seed via max(termin/auftrag/nachricht-Timestamps) — TBD, minor.)

### View-Repoints (PR2)
- `v_claim_full.fall_updated_at` → `cr.last_activity_at` (LEFT JOIN claim_recency cr ON cr.claim_id = c.id)
- `v_faelle_mit_aktuellem_termin.updated_at` → `cr.last_activity_at`
- `v_faelle_mit_aktuellem_termin.created_at` → `c.created_at` (sauber, unabhängig)

### FallRealtimeRefresh (PR2)
3. Leg aller Portale: `table:'claim_recency'`, `filter: claim_id=eq.<claimId>` (statt
`claims`/`id`). 3 Caller (FallakteShell, FallDetailClient, kunde/faelle/[id]/page) +
Feldmodus `SvFallakteView`. **SV bekommt dadurch endlich Live-Refresh** (leak-frei).

## Rollout (gestaffelt, Kunde-Pfad ist grün-verifiziert)

- **PR1 (rein additiv, kein Verhaltensbruch):** Tabelle + RLS + Publication + Backfill +
  `touch_claim_recency`-RPC + `touchClaimRecency` schreibt `claim_recency` **zusätzlich**
  zu `claims.update({updated_at})` (Dual-Write). Realtime/Views unverändert.
- **PR2 (Repoint):** Views + `FallRealtimeRefresh` (alle Portale) auf `claim_recency`;
  `created_at`-Repoint. Dann **Kunde-Re-Smoke (RUN_CMM65_SMOKE-Harness) + SV-Smoke**.
- **PR3 (optional, später):** `claims.update({updated_at})`-Dual-Write aus
  `touchClaimRecency` entfernen (claim_recency ist dann alleinige Recency-Quelle).

## Regression / Konsumenten
- `cron/pflichtdokumente-reminder` (liest `fall_updated_at` Idle-Gating) — JOIN-Quelle wechselt, Semantik = „letzte Aktivität".
- makler-Akten-Order (`v_faelle…updated_at`) — dito.
- 11 `touchClaimRecency`-MOVE-Sites (Writer-Sweep) — unverändert im Call, neuer Schreibpfad intern.
- `FallRealtimeRefresh` 3 Caller + Feldmodus — Leg-Target wechselt.
- `gutachter_termine`/`auftraege`-Legs unberührt.

## Offene Detailfragen (vor PR2)
1. Backfill-Seed: `GREATEST(updated_at,created_at)` vs echtes Aktivitäts-Max?
2. `touch_claim_recency` als RPC (SECURITY DEFINER) vs. weiter admin-client-Write in `touchClaimRecency`?
3. Sollen **echte Status-/Phasen-Writes** (transitionFallStatus etc.) `claim_recency` auch bumpen, oder reicht der bisherige `touchClaimRecency`-Scope?
