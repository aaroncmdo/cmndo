# CMM-60 Schritt 2 — RLS-Umstellung auf `claims.sv_id` (Review-Vorlage)

**Stand:** 2026-05-16 · Branch `kitta/cmm-60-claims-sv-id` · Migration `20260516180053_cmm60_schritt2_is_sv_for_claim_claims_native.sql`

**Status: APPLIZIERT 2026-05-16 (Aaron-Freigabe).** Migration `20260516180053` via Targeted-Apply + `migration repair` auf die DB gebracht. Post-Apply + RLS-Impersonation-Smoke grün — siehe §7.

---

## 1 · RLS-Audit — was hängt heute an `faelle.sv_id`?

`scripts/probe-cmm60-rls-audit.sql` gegen die Live-DB:

### `is_sv_for_claim(uuid)` — heutige Definition
```sql
SELECT EXISTS (
  SELECT 1 FROM faelle f
  JOIN sachverstaendige sv ON sv.id = f.sv_id
  WHERE f.claim_id = p_claim_id AND sv.profile_id = auth.uid()
)
```
SQL-Funktion, `STABLE SECURITY DEFINER`, `search_path='public'`.
Grants: `EXECUTE` an `authenticated`, `service_role`, `postgres`.

### Wer ruft `is_sv_for_claim()` auf? — genau 2 Policies
| Tabelle | Policy | Verwendung |
|---|---|---|
| `claims` | `claims_kunde_sv_dispatch_select_consolidated` (SELECT) | `… OR is_sv_for_claim(id)` |
| `claim_parties` | `cp_select_consolidated` (SELECT) | `… OR is_sv_for_claim(claim_id) …` |

→ Beide profitieren **transparent** von einer Funktions-Rewrite — keine Policy-Änderung nötig.

### Eine claim-gekeyte Policy mit eigenem `faelle.sv_id`-Inline-Join
| Tabelle | Policy | Heute |
|---|---|---|
| `claim_parties` | `cp_sv_assigned_insert` (INSERT) | `rolle='zeuge' AND EXISTS(faelle f JOIN sachverstaendige sv ON sv.id=f.sv_id WHERE f.claim_id = claim_parties.claim_id AND sv.profile_id=auth.uid())` |

Der `EXISTS`-Block ist **exakt** `is_sv_for_claim(claim_parties.claim_id)`. Wird in Schritt 2 verhaltensgleich darauf umgestellt.

### Bewusst NICHT in Scope
~45 weitere Policies joinen `faelle … sv_id`, sind aber **`fall_id`-/`vehicle_id`-gekeyt**, nicht claim-gekeyt (`timeline`, `pflichtdokumente`, `nachrichten`, `vehicles`, `qc_checkliste`, `kanzlei_faelle`, `auftraege`, `leads`, …). Sie referenzieren einen *Fall*, keinen *Claim* — sie migrieren erst wenn diese Tabellen `claim_id` bekommen (Phase 2+) bzw. mit dem `faelle`-Drop (Phase 6). Die 4 weiteren SECURITY-DEFINER-Funktionen mit `faelle.sv_id` (`increment_offene_faelle`, `delete_gutachter_komplett`, `apply_gutachten_ocr`, `sync_faelle_sv_id_to_claims`) sind Trigger/Admin-Funktionen — kein RLS-Claim-Scoping, korrekt auf `faelle` (Übergangs-Trigger hält synchron).

---

## 2 · Was die Migration tut

1. **`is_sv_for_claim` rewrite** — `claims c JOIN sachverstaendige sv ON sv.id=c.sv_id` statt `faelle`-Join. Signatur unverändert (`p_claim_id uuid`) → `CREATE OR REPLACE` behält die Grants.
2. **`GRANT EXECUTE` explizit + idempotent** an `authenticated` + `service_role` — Defense-in-Depth gegen das AAR-894-Pattern.
3. **Übergangs-Trigger auf `INSERT OR UPDATE` erweitert** — siehe §3, der kritische Punkt.
4. **Sicherheits-Backfill** — idempotent, fängt faelle die zwischen Schritt-1- und Schritt-2-Apply per INSERT entstanden.
5. **`cp_sv_assigned_insert`** → `is_sv_for_claim(claim_parties.claim_id)`.

---

## 3 · Der kritische Punkt — INSERT-Abdeckung des Übergangs-Triggers

Schritt-1-Trigger war `AFTER UPDATE OF sv_id`. **Das reicht nach der Funktions-Rewrite nicht:**

- `is_sv_for_claim` liest dann `claims.sv_id`.
- `claims.sv_id` ist nur korrekt, wenn **jeder** `faelle.sv_id`-Schreibvorgang gespiegelt wird.
- **Produktions-Pfad `lead-fall-mapping.ts:261`** (`fallComputedFields`) setzt `sv_id` bereits im **`faelle`-INSERT** — und `convert-lead-to-claim.ts:397` setzt `claim_id` im selben INSERT-Objekt.
- Ein reiner UPDATE-Trigger feuert dort **nicht** → `claims.sv_id` bliebe NULL → der zugewiesene SV verlöre den RLS-Zugriff auf seinen Claim (= das AAR-894-Symptom „SV-Plan leer").

**Fix:** Trigger auf `AFTER INSERT OR UPDATE OF sv_id`. Die Trigger-Funktion ist INSERT-tauglich (bei INSERT ist `OLD` NULL → `NEW.sv_id IS DISTINCT FROM OLD.sv_id` greift korrekt). Verifiziert: faelle-INSERT trägt `sv_id` **und** `claim_id` gemeinsam → `AFTER INSERT` sieht beide.

---

## 4 · Dry-Run-Verifikation (transaktional, ROLLBACK)

`scripts/probe-cmm60-schritt2-dryrun.sql` — komplette Migration in einer Transaktion ausgeführt + verifiziert, dann `ROLLBACK`. Keine echte Änderung.

| Check | Ergebnis |
|---|---|
| Migration syntaktisch + ausführbar (kein Fehler bis ROLLBACK) | ✓ |
| Äquivalenz: `claims.sv_id`-Join = `faelle.sv_id`-Join (gleiche Treffermenge) | true |
| Trigger feuert auf INSERT **und** UPDATE | true |
| `cp_sv_assigned_insert` nutzt `is_sv_for_claim` | true |

---

## 5 · Apply-Anleitung (nach Aaron-Freigabe)

```
cd <wt-cmm60>
npx supabase db query --linked --agent yes \
  --file supabase/migrations/20260516180053_cmm60_schritt2_is_sv_for_claim_claims_native.sql
npx supabase migration repair --status applied 20260516180053
```

**Post-Apply-Smoke:**
- `is_sv_for_claim` neu definiert + Grants an `authenticated`/`service_role` vorhanden.
- SV-Login → `/gutachter` Fall-Liste + `/gutachter/fall/[id]` einer zugewiesenen Akte → Daten sichtbar (RLS greift).
- `claim_parties`-Zugriff des SV (Zeugen) intakt.
- Memory `feedback_post_drop_smoke` / `feedback_smoke_screenshot_pflicht`: volle Portal-Smoke mit Screenshots.

## 7 · Apply-Ergebnis (2026-05-16)

Targeted-Apply + `migration repair --status applied 20260516180053`. Kein Drift (Pre-Apply-Check: Migration nicht getrackt, `is_sv_for_claim` noch faelle-basiert, Trigger UPDATE-only, 21 claims befüllt, 0 Mismatches).

**Post-Apply (`scripts/probe-cmm60-s2-postapply.sql`):**

| Check | Ergebnis |
|---|---|
| Migration getrackt | true |
| `is_sv_for_claim` claims.sv_id-basiert (kein faelle-Join) | true |
| `GRANT EXECUTE` an `authenticated` + `service_role` | true |
| Trigger feuert auf INSERT **und** UPDATE | true |
| `cp_sv_assigned_insert` nutzt `is_sv_for_claim` | true |
| claims.sv_id Befüllung / Mismatches | 21 / 0 |

**RLS-Impersonation-Smoke (`scripts/probe-cmm60-s2-rls-impersonation.sql`)** — transaktional, `SET LOCAL ROLE authenticated` + `request.jwt.claims` eines echten SV-Profils:

| Check | Ergebnis |
|---|---|
| `is_sv_for_claim(eigener Claim)` | true |
| `is_sv_for_claim(fremder Claim)` | false (keine Über-Berechtigung) |
| SV sieht eigenen Claim über die `claims`-RLS-Policy | true |

## 6 · Danach — Schritt 3

`sv_id`-Writer (heute `faelle`, u.a. `lead-fall-mapping.ts`) auf `claims` umstellen + Reverse-Sync-Trigger `claims→faelle`. Erst danach kann der Übergangs-Trigger `faelle→claims` (Schritt 1/2) entfallen.
