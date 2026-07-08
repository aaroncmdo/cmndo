# Provisions-Ledger-Unifikation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `makler_provisionen`+`werkstatt_provisionen` → EIN `partner_provisionen(partner_typ)` und `makler_staffel_bonus`+`werkstatt_staffel_bonus` → EIN `partner_staffel_bonus(partner_typ)`; `partner_gutschriften.ledger_tabelle` von rohem String auf eine typsichere Konstante härten (schließt die T6b-Bug-Klasse). `provisionen_maik` + `gutschriften` (SV) bleiben separat.

**Architecture:** Additive Migration (neue Union-Tabellen), dann Writer→Reader-Umstieg mit `partner_typ`-Diskriminator (EIN Code-Pfad statt zwei parallelen), dann Backfill der wenigen Bestandszeilen + Drop der Alt-Tabellen. DRY-Refactor, **kein** Korrektheits-Bug — die Tabellen halten verschiedene Zeilen, keine redundanten Caches.

**Tech Stack:** Postgres (Supabase), TypeScript, Next.js 15, vitest. DDL ausschließlich via `apply_migration` (Regel 2).

**Design-Quelle:** `docs/superpowers/specs/2026-07-08-provision-gutschrift-ledger-assessment.md` (Session 6f60c510, §3 Ziel-Modell + §4 Migrations-Ansatz). Diese Lane = 457ab612; 6f60c510 liefert das Modell, führt selbst nichts in diesen Files aus.

## Global Constraints
- **DDL nur via `mcp__plugin_supabase_supabase__apply_migration`** (Regel 2); danach `list_migrations` → File `supabase/migrations/<V>_<name>.sql` == recorded version committen. **Nie** raw `execute_sql`-DDL / CLI.
- **Money-kritisch:** je Phase die Finance-Tests grün halten (`npx vitest run src/lib/finance`), keine Beträge/USt-Logik ändern (nur Tabellen-Ziel).
- **RLS wie `partner_gutschriften`:** admin-all + partner-self-read (makler/werkstatt via user_id-Kette), **REVOKE ALL FROM anon**. Neue Tabellen sofort gaten.
- **Prod ist NICHT leer:** `makler_provisionen`=2, `werkstatt_provisionen`=7 (Test-Account-Zeilen aus Smokes), Rest 0. → **Backfill dieser 9 Zeilen** vor dem Drop (nicht droppen ohne Migration; Test-Accounts könnten von anderen Smoke-Sessions gebraucht werden).
- **tsc-Verifikation lokal mit `NODE_OPTIONS=--max-old-space-size=8192`** (Default-Heap OOM't → false „clean"), CI autoritativ.
- **Koordination:** Provisions-Tabellen sind Hot-Files mehrerer Sessions (makler/werkstatt/leads/cron). Vor jeder Phase `git fetch` + Marker prüfen; PR-je-Phase gegen `staging`.

## File Structure (Blast-Radius, prod-verifiziert 17 Files + DB)

**DB:** neu `partner_provisionen`, `partner_staffel_bonus`; geändert View `v_partner_billing` (UNIONt die Provisions-Tabellen), RLS-Policies, `partner_gutschriften.ledger_tabelle`-Werte; gedroppt `makler_provisionen`/`werkstatt_provisionen`/`makler_staffel_bonus`/`werkstatt_staffel_bonus`.

**Writer (Provisions-Insert):** `src/lib/makler/pipeline.ts`, `src/lib/makler/erstelle-anfrage.ts`, `src/lib/leads/convert-lead-to-claim.ts`, `src/lib/werkstatt/queries.ts` (+ Staffel-Bonus-Erzeuger — bei Umsetzung per `grep -rn "staffel_bonus" src/` final tracen).
**Status-/Payout-Logik:** `src/lib/finance/provision-status.ts` (META + `PROVISION_TABELLEN` + freigeben/auszahlen/storniere — 14 Refs, der zentrale Umbau).
**Reader:** `src/lib/makler/queries.ts`, `src/lib/werkstatt/queries.ts`, `src/lib/makler/wochenreport.ts`, `src/lib/finance/partner-billing.ts`, `src/app/makler/(shell)/abrechnungen/page.tsx`, `src/app/werkstatt/(shell)/abrechnungen/page.tsx`.
**Cron:** `src/app/api/cron/release-makler-provisionen/route.ts`, `src/app/api/cron/release-werkstatt-provisionen/route.ts` (hold_until→freigegeben; werden nach der Union EIN Cron ODER beide auf die Union-Tabelle mit partner_typ-Filter).
**Sonstige:** `src/lib/permissions/matrix.ts` (Rollen-Refs), `src/lib/supabase/database.types.ts` (Regen), `partner-gutschrift.ts`/`partner-billing-actions.ts` (ledger_tabelle-Konstante), + Tests.

---

### Phase 0: Additive Union-Tabellen (`partner_provisionen` + `partner_staffel_bonus`) + RLS

**Files:** DDL via apply_migration; Migration-File `supabase/migrations/<V>_partner_provisionen_union.sql`. Kein App-Code.

**Interfaces — Produces:** die Ziel-Tabellen, auf die Phase 1 schreibt.

- [ ] **Step 1: Staffel-Schema bestätigen (READ)** — `execute_sql`: `select column_name, data_type from information_schema.columns where table_name in ('makler_staffel_bonus','werkstatt_staffel_bonus') order by table_name, ordinal_position` → die 10 Spalten je Tabelle verifizieren (Assessment: identisch). Union-Spalten daraus ableiten.

- [ ] **Step 2: `apply_migration` — `partner_provisionen`** (Union aus prod-verifiziertem Schema):
```sql
CREATE TABLE public.partner_provisionen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_typ text NOT NULL CHECK (partner_typ IN ('makler','werkstatt')),
  partner_id uuid NOT NULL,
  claim_id uuid, fall_id uuid,
  lead_id uuid, promotion_code_id uuid, service_typ text, abrechnung_id uuid,  -- makler-spezifisch (nullable)
  claim_nummer text, ausgezahlt_am timestamptz,                                -- werkstatt-spezifisch (nullable)
  betrag_netto_eur numeric, ust_satz numeric, ust_betrag numeric, betrag_brutto numeric,
  trigger_event text, trigger_at timestamptz, hold_until timestamptz,
  status text, storniert_am timestamptz, storno_grund text,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_provisionen ENABLE ROW LEVEL SECURITY;
CREATE POLICY pp_admin_all ON public.partner_provisionen FOR ALL USING (is_admin()) WITH CHECK (is_admin());
-- Partner-self-read: makler via makler.user_id, werkstatt via werkstaetten.user_id
CREATE POLICY pp_partner_self_read ON public.partner_provisionen FOR SELECT USING (
  (partner_typ='makler'    AND EXISTS (SELECT 1 FROM makler m       WHERE m.id=partner_id AND m.user_id=auth.uid())) OR
  (partner_typ='werkstatt' AND EXISTS (SELECT 1 FROM werkstaetten w WHERE w.id=partner_id AND w.user_id=auth.uid()))
);
REVOKE ALL ON public.partner_provisionen FROM anon;
```
> `is_admin()` + die makler/werkstatt `user_id`-Spalten beim Umsetzen gegen prod verifizieren (die bestehenden `makler_provisionen`-Policies als Vorlage per `execute_sql: select polname, pg_get_expr(polqual,polrelid) from pg_policy where polrelid='makler_provisionen'::regclass` lesen und 1:1 auf `partner_typ` übertragen).

- [ ] **Step 3: `apply_migration` — `partner_staffel_bonus`** (analog, Spalten aus Step 1; `partner_typ`+`partner_id` statt makler_id/werkstatt_id, identischer RLS-Block).

- [ ] **Step 4: Verify (READ)** — `execute_sql`: beide Tabellen existieren, anon-Grants=0, RLS enabled. `list_migrations` → recorded Versionen ablesen, Migration-Files exakt danach benennen + committen (Regel 2 Schritt 3+4).

- [ ] **Step 5: Commit** die 2 Migration-Files. Phase-0-PR gegen staging (rein additiv → verhaltensneutral, keine App-Änderung).

---

> **⚠️ KOPPLUNG — Phase 1 + Phase 2 deployen ZUSAMMEN.** Sie sind Schreib- und Lese-Hälfte EINER Umstellung: Phase 1 verschiebt die *Entstehung* neuer Provisions-/Bonus-Rows nach `partner_provisionen`; Phase 2 zieht die *Reader* (View + Cockpit + Portal + Gutschrift-Ledger) nach. Phase 1 allein → neue Rows unsichtbar/unauszahlbar. Phase 2 allein → View liest leere Union-Tabelle → Cockpit zeigt nichts. **Ein kombinierter PR gegen `staging` (oder derselbe Deploy-Zyklus); nie eine Hälfte allein nach `main`.** Da `apply_migration` sofort auf prod wirkt und prod-Provisionen rein Test-Account-getrieben sind (2+7 Zeilen), ist das Fenster real unkritisch — aber die Kopplung MUSS im PR-Body stehen.

### Phase 1: DB-Trigger-Rewrite — neue Provisionen/Boni entstehen in `partner_provisionen` (mit `partner_typ`)

> **Detail-Plan (TDD-ready, prod-gegroundet):** `docs/superpowers/plans/2026-07-08-provision-ledger-unifikation-phase1-detail.md`. Der folgende Absatz ist die Zusammenfassung; die Line-by-Line-Payloads stehen dort.

**Prämissen-Korrektur (Code-Discovery 2026-07-08):** Der ursprüngliche „TS-Write-Seam `insertPartnerProvision`, durch den alle Writer routen"-Ansatz trifft die Realität NICHT: `grep .from('*_provisionen').insert` = 0 — **alle Provisions-/Bonus-INSERTs sind DB-Trigger** (`create_makler_provision()` auf `faelle_claim_bridge`, `create_werkstatt_provision()` auf `claims`; Staffel-Boni via Trigger AUF den Provisions-Tabellen). Der Phase-1-Write-Seam ist also **DDL (Trigger-Rewrites)**, nicht TS.

**Files:** apply_migration (3 money-kritische Trigger-Umzüge + front-loaded partielle Unique-Indizes), `src/lib/leads/convert-lead-to-claim.ts` (der eine makler-Provisions-READ), beide `release-*-provisionen/route.ts` (Cron), `src/lib/supabase/database.types.ts` (chirurgisch, kein Full-Regen), optional `src/lib/finance/insert-partner-provision.ts` (Referenz-Seam für den Phase-4-Smoke, nicht im kritischen Pfad).

**Ansatz:** `create_makler_provision`/`create_werkstatt_provision` INSERTen ab jetzt `partner_provisionen` (partner_typ='makler'/'werkstatt'); die Staffel-Bonus-Trigger-Kette re-ankert auf `partner_provisionen` → `partner_staffel_bonus`. **Front-loaded Unique-Indizes** `(partner_typ, claim_id) WHERE claim_id IS NOT NULL` bzw. `(partner_typ, partner_id, schwelle)` (Phase-0-Tabellen erbten die Alt-Uniques NICHT → ohne sie wirft `ON CONFLICT` → AFTER-INSERT-Exception → **Claim-Insert rollt zurück = Prod-Breaker**). **`makler_fall_consent`-INSERT im makler-Trigger verbatim erhalten** (Sichtbarkeit != Eligibility). **Die `provision-status.ts`-META-Kollapse 5→3 ist NICHT hier — sie ist Phase 2** (gekoppelt an den View + `ledger_tabelle`, sonst bräche der `PROVISION_TABELLEN`-Contract mit dem noch-alten View → Bestands-Payout kaputt).

**Deliverable:** neue Provisionen/Boni entstehen in `partner_provisionen`/`partner_staffel_bonus`; `npx vitest run src/lib/finance` grün; tsc(8GB) grün; DB-Trigger-Inventar-Recheck.

---

### Phase 2: Reader auf `partner_provisionen` + META-Kollapse 5→3 + `ledger_tabelle`-Konstante

> **Detail-Plan (TDD-ready, prod-gegroundet):** `docs/superpowers/plans/2026-07-08-provision-ledger-unifikation-phase2-detail.md`. Enthält den vollständigen `v_partner_billing`-Before/After (viewdef-verbatim) + die money-kritische META-5→3-Kollapse.

**Files:** `v_partner_billing`-View (`CREATE OR REPLACE VIEW`: die 4 Provisions-/Bonus-Branches → 2 auf `partner_provisionen`/`partner_staffel_bonus` mit `partner_typ`-Filter; die sv/kanzlei/onboarding/maik-Branches unverändert; Output-Signatur Before==After), **`provision-status.ts` META 5→3** (aus Phase 1 hierher — nach dem View-Umbau emittiert `quelle_tabelle` nur noch `'partner_provisionen'`/`'partner_staffel_bonus'`, ein Wert trägt makler+werkstatt → die Payout-/Storno-/Gutschrift-Logik verzweigt zur Laufzeit auf `row.partner_typ` für die richtige Partner-Tabelle + Steuerdaten), makler/werkstatt `queries.ts` + `wochenreport.ts` + `pipeline.ts` + Abrechnungs-Pages (Reader → `.from('partner_provisionen').eq('partner_typ',…)`), `partner-gutschrift.ts`/`partner-billing-actions.ts` für die **typsichere `LEDGER_TABELLEN`-Konstante** (`{PARTNER_PROVISIONEN, PARTNER_STAFFEL_BONUS, PROVISIONEN_MAIK}` in einer nicht-'use server'-lib → schließt die T6b-Bug-Klasse). Die 2 Cron-Routes sind bereits in Phase 1 umgezogen.

**Deliverable:** Cockpit + Portal + Gutschrift-Ledger lesen ausschließlich die Union-Tabelle über die Konstante; `v_partner_billing` liefert identische Zeilen (Before/After-Signatur-verifiziert); `npx vitest run src/lib/finance` grün. **0 Gutschriften auf prod → kein `ledger_tabelle`-Backfill (sauberer Schnitt).** Kombinierter Phase-1+2-PR (s. Kopplungs-Banner oben).

---

### Phase 3: Backfill Bestand + Drop der Alt-Tabellen

**Files:** DDL via apply_migration.

- [ ] **Step 1: Backfill (READ→apply_migration)** — die 9 Bestandszeilen (`makler_provisionen`=2, `werkstatt_provisionen`=7) in `partner_provisionen` kopieren (`INSERT INTO partner_provisionen (partner_typ, partner_id, …) SELECT 'makler', makler_id, … FROM makler_provisionen` + analog werkstatt). Staffel-Tabellen 0 rows → kein Backfill. Vorher `execute_sql`-Count re-verifizieren (könnte sich geändert haben).
- [ ] **Step 2: `grep -rn "makler_provisionen\|werkstatt_provisionen\|makler_staffel_bonus\|werkstatt_staffel_bonus" src/`** → 0 App-Refs (nur database.types + Kommentare) bestätigen, sonst Phase 1/2 unvollständig.
- [ ] **Step 3: `apply_migration` DROP** der 4 Alt-Tabellen (0-rows-drop nach Backfill safe). `database.types.ts` via `generate_typescript_types` regenerieren.
- [ ] **Step 4: Commit** Migration-Files (Regel 2 File==version).

---

### Phase 4: Prod-Smoke

**Files:** keine.

- [ ] Provisions-Trigger makler + werkstatt (je ein Test-Provision-Insert über den echten Writer-Pfad gg prod, wie der Storno-Smoke: tsx-Direktcall des Seams) → landet in `partner_provisionen` mit korrektem partner_typ. Payout→Gutschrift (ledger_tabelle='partner_provisionen'). Staffel-Bonus-Pfad. **Prod danach pristine zurückbauen** (Test-Zeilen löschen, Counter zurücksetzen). Cockpit-Reader (`v_partner_billing`) zeigt beide Partner-Typen.

---

## Self-Review (gegen die Assessment-Spec)
- **§3 Ziel-Modell** (partner_provisionen + partner_staffel_bonus, maik/gutschriften separat): Phase 0 (DDL) + Phase 1/2 (Writer/Reader). ✓
- **§4 Migrations-Ansatz** (5 Phasen additiv→writer→reader→drop→smoke): Phase 0–4 1:1. ✓ (Backfill in Phase 3 ergänzt wegen der 9 Nicht-0-Zeilen — Abweichung vom „0 rows"-Assessment, prod-verifiziert.)
- **ledger_tabelle typsicher** (T6b-Bug-Hebel): Phase 2. ✓
- **`gutschriften` (SV) separat lassen** (§5): nicht angefasst. ✓
- **Scope-Ehrlichkeit:** Phase 0 ist vollständig konkret (DDL aus prod-Schema); Phase 1–4 sind pro Phase strukturiert + die exakten Per-File-Diffs werden bei Phase-Start finalisiert (17-File-Blast-Radius zu groß + zu volatil für korrektes Vorab-Line-by-Line; jede Phase = eigener PR + Review-Gate). **Kein Platzhalter für Phase 0.**
- **Koordination:** 6f60c510 (Assessment-Owner) + makler/werkstatt/leads/cron-Sessions berühren dieselben Tabellen → PR-je-Phase + Marker + git-fetch-vor-Phase.
