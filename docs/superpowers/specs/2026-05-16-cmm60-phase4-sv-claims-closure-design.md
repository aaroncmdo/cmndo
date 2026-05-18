# CMM-60 Phase 4 — SV-`claims`-Closure (Design)

**Datum:** 2026-05-16 · **Ticket:** CMM-60 · **Branch:** `kitta/cmm-60-phase4-sv-claims-closure`
**Vorgänger:** Schritt 1 (#1391), Schritt 2 (#1393), Schritt 2b `v_claim_sv` (#1395), Schritt 3 (#1398)

---

## 1 · Ziel & Scope

Schritt 2b hat `v_claim_sv` als spalten-gescopete SV-Projektion gebaut — als Phase-4-Ziel, mit der Closure ausdrücklich vertagt. Phase 4 vollzieht die **Closure**: der SV verliert den direkten Lesezugriff auf die `claims`-Tabelle (inkl. der Kanzleifall-/Regulierungs-Spalten); `v_claim_sv` bleibt sein einziges Claim-Lese-Fenster.

**Reader-Audit-Befund (2026-05-16):** Es gibt **keinen** SV-`claims`-Tabellen-Reader. Das SV-Portal liest `faelle`, `v_faelle_mit_aktuellem_termin`, `v_gutachten_werte` — nie `claims` direkt. Alle `from('claims')`-SELECTs liegen in Admin-/Kunde-/Kanzlei-/lib-Code. → **Keine Reader-Migration nötig.** Phase 4 ist eine reine RLS-/View-Härtung.

**In Scope:**
- `v_claim_sv` von `security_invoker=true` auf `security_definer` umstellen.
- `is_sv_for_claim(id)` aus der `claims`-SELECT-Policy entfernen.

**NICHT in Scope:** `faelle`-Drop + `faelle→claims`-Trigger-Drop (Phase 6). Die `is_sv_for_claim`-**Funktion** bleibt.

**Erfolgskriterium:** Ein authentifizierter SV bekommt aus `v_claim_sv` weiter genau seine Claims; ein direkter `SELECT … FROM claims` als SV liefert **0 Zeilen**. SV-Portal funktioniert ohne Regress.

---

## 2 · Das Kernproblem — `security_invoker`

`v_claim_sv` ist (Schritt 2b) `security_invoker=true`: der View läuft mit den Rechten des abfragenden SV, die `claims`-RLS (`is_sv_for_claim`) erledigt das Row-Scoping. Wenn Phase 4 `is_sv_for_claim` aus der `claims`-SELECT-Policy entfernt, hätte der SV keinen `claims`-Zugriff mehr — und `v_claim_sv` (security_invoker) liefert dann **0 Zeilen**. Der View hängt an genau der Berechtigung, die die Closure entzieht.

**Lösung:** `v_claim_sv` auf `security_definer` umstellen (`security_invoker=false`). Der View läuft dann mit den Rechten seines Owners (`postgres`, RLS-exempt), umgeht die `claims`-RLS, und sein eigenes `WHERE public.is_sv_for_claim(c.id)` ist der alleinige — selbsttragende — Row-Filter. Standard-Muster für eine gescopte Projektion, deren Konsument keinen Basis-Tabellen-Zugriff hat.

Damit der Definer garantiert RLS-exempt ist, setzt die Migration den View-Owner explizit auf `postgres`.

---

## 3 · Design — drei Änderungen

1. **`v_claim_sv` → `security_definer` + Owner `postgres`.**
   `ALTER VIEW public.v_claim_sv SET (security_invoker = false);`
   `ALTER VIEW public.v_claim_sv OWNER TO postgres;`
   Spalten-Whitelist + `WHERE is_sv_for_claim` bleiben unverändert. Column-Scoping (61 Spalten) und Row-Scoping (`is_sv_for_claim`) sind danach beide vom View selbst getragen.

2. **`is_sv_for_claim(id)` aus `claims_kunde_sv_dispatch_select_consolidated` entfernen.**
   Heutige `USING`:
   `(is_dispatcher() AND dispatcher_owns_lead(lead_id)) OR (geschaedigter_user_id = (SELECT auth.uid())) OR is_claim_user_party(id) OR is_sv_for_claim(id)`
   Neue `USING` (SV-Zweig raus):
   `(is_dispatcher() AND dispatcher_owns_lead(lead_id)) OR (geschaedigter_user_id = (SELECT auth.uid())) OR is_claim_user_party(id)`
   Per `ALTER POLICY … USING (…)`.

3. **Kein Code-Change.** Reader-Audit: 0 SV-`claims`-Reader. `v_claim_sv` hat keinen Consumer (Phase-4-Ziel, wird genutzt wenn `faelle`-Spalten in Phase 6 wegfallen).

**Was unangetastet bleibt:**
- `is_sv_for_claim` (Funktion) — `claim_parties.cp_select_consolidated` nutzt sie weiter für SV-Zugriff auf Parties.
- `claims_staff_all_consolidated` (ALL-Policy) — Admin/Staff-Schreibzugriff.
- Die Kunde-/Dispatch-Zweige der SELECT-Policy.

---

## 4 · Migration

`supabase/migrations/<ts>_cmm60_phase4_sv_claims_closure.sql`:

```sql
BEGIN;

-- 1. v_claim_sv auf security_definer: nach der Closure hat der SV keinen
--    claims-Tabellen-Zugriff mehr; ein security_invoker-View liefere dann
--    0 Zeilen. Definer + Owner postgres -> RLS-exempt, das View-eigene
--    WHERE is_sv_for_claim ist der alleinige Row-Filter.
ALTER VIEW public.v_claim_sv SET (security_invoker = false);
ALTER VIEW public.v_claim_sv OWNER TO postgres;

-- 2. is_sv_for_claim aus der claims-SELECT-Policy entfernen — der SV liest
--    Claims kuenftig ausschliesslich ueber v_claim_sv.
ALTER POLICY claims_kunde_sv_dispatch_select_consolidated ON public.claims
  USING (
    (is_dispatcher() AND dispatcher_owns_lead(lead_id))
    OR (geschaedigter_user_id = (SELECT auth.uid()))
    OR is_claim_user_party(id)
  );

COMMIT;
```

Apply: Targeted-Apply (`db query --file` + `migration repair`). Vor dem Apply die aktuelle `USING`-Expression live gegenprüfen (`pg_policies`), damit ausser dem `is_sv_for_claim`-Zweig nichts abweicht.

---

## 5 · Verifikation / Smoke

1. **RLS-Impersonation** (transaktional, `SET LOCAL ROLE authenticated` + echtes SV-JWT):
   - `SELECT count(*) FROM v_claim_sv` > 0 und = `claims WHERE sv_id = eigene sv_id` → View trägt sich selbst.
   - `SELECT count(*) FROM claims` als SV = **0** → Closure bewiesen.
   - `claim_parties`-Zugriff des SV intakt (`is_sv_for_claim` via `cp_select_consolidated`).
2. **Struktur:** `v_claim_sv` `security_invoker` nicht mehr gesetzt / false; Owner `postgres`.
3. **SV-Portal-UI-Smoke** gegen staging (Login `test-sv`): `/gutachter`, `/gutachter/heute`, `/gutachter/fall/[id]`, `/gutachter/kalender` — kein Regress, keine leeren Listen, kein 403. Screenshots (Memory `feedback_post_drop_smoke`).
4. Kein `tsc`/Build nötig — reine SQL-Migration.

---

## 6 · Danach

- **Phase 6:** `faelle`-Drop. Dann müssen SV-Reader, die heute `faelle` lesen, auf `v_claim_sv` umziehen (das ist die eigentliche Reader-Migration — sie passiert mit dem `faelle`-Wegfall, nicht hier). `faelle→claims`-Trigger + `fallComputedFields.sv_id` fallen weg.
