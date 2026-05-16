# CMM-60 Schritt 2b — SV-Claim-Projektion `v_claim_sv` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen spalten-gewhitelisteten, SV-gescopeten Read-Only-View `v_claim_sv` über `claims` anlegen — als Phase-4-fertiges Lese-Ziel ohne Kanzleifall-/Regulierungs-Spalten.

**Architecture:** Eine SQL-Migration legt `v_claim_sv` an (`security_invoker=true`, 61-Spalten-Whitelist, Row-Filter `is_sv_for_claim`). Verifikation per DB-Probes (Struktur + RLS-Impersonation + Negativ-Probe). Kein App-Code, kein UI-Consumer (Phase-4-Ziel).

**Tech Stack:** PostgreSQL/Supabase, supabase-CLI (Targeted-Apply wegen isochrone-Drift), `database.types.ts`-Regen.

**Spec:** `docs/superpowers/specs/2026-05-16-cmm60-schritt2b-sv-claim-projektion-design.md`

**Branch:** `kitta/cmm-60-schritt2b-sv-projektion` (existiert, Spec ist committed). Worktree: `wt-cmm60`.

---

## File Structure

- **Create:** `supabase/migrations/<ts>_cmm60_schritt2b_v_claim_sv.sql` — die Migration (View + Grant + Comment).
- **Create:** `scripts/probe-cmm60-s2b-struktur.sql` — Struktur-Verifikation (Spalten-Set, security_invoker).
- **Create:** `scripts/probe-cmm60-s2b-rls.sql` — RLS-Impersonation + Negativ-Probe.
- **Modify:** `src/lib/supabase/database.types.ts` — Regen, `v_claim_sv` taucht unter `Views` auf.

---

## Task 1: Migration `v_claim_sv` schreiben

**Files:**
- Create: `supabase/migrations/<ts>_cmm60_schritt2b_v_claim_sv.sql`

- [ ] **Step 1: Migrationsdatei generieren**

Run (im Worktree `wt-cmm60`):
```bash
npx supabase migration new cmm60_schritt2b_v_claim_sv
```
Expected: neue leere Datei `supabase/migrations/<ts>_cmm60_schritt2b_v_claim_sv.sql`. Den `<ts>`-Dateinamen merken.

- [ ] **Step 2: Migration-SQL schreiben**

Inhalt der generierten Datei (komplett ersetzen):

```sql
-- CMM-60 Schritt 2b — SV-Claim-Projektion v_claim_sv.
--
-- Der SV bearbeitet den Auftrag-Lifecycle eines Claims, nicht den
-- Kanzleifall-LC. Die claims-SELECT-Policy gibt ihm heute die ganze Zeile
-- inkl. kanzlei_*/regulierungs_betrag. Dieser View ist das spalten-
-- gescopete Phase-4-Lese-Ziel: 61-Spalten-Whitelist (Auftrag-LC + neutrale
-- Stammdaten), Row-Filter is_sv_for_claim, security_invoker.
--
-- Spec: docs/superpowers/specs/2026-05-16-cmm60-schritt2b-sv-claim-projektion-design.md
-- NICHT in Scope: Entzug der direkten claims-SELECT des SV + Reader-
-- Umstellung — das ist Phase 4.

BEGIN;

CREATE OR REPLACE VIEW public.v_claim_sv
WITH (security_invoker = true)
AS
  SELECT
    c.id, c.claim_nummer, c.status, c.phase, c.fall_typ,
    c.abgeschlossen_am, c.anzahl_beteiligte_total, c.auslandskennzeichen,
    c.brn, c.created_at, c.entdeckt_am, c.fahrerflucht,
    c.finanzierung_leasing, c.gegner_aktenzeichen, c.gegner_bekannt,
    c.gegner_versicherung_id, c.gegner_versicherungsnummer,
    c.gegnerisches_vehicle_id, c.gewerbe_flag, c.halter_ungleich_fahrer,
    c.hat_abschleppung, c.hat_mietwagen, c.hat_nutzungsausfall,
    c.hat_personenschaden, c.hat_sachschaden, c.hergang_kunde_text,
    c.hergang_sv_text, c.kunde_no_show_count, c.kunden_konstellation,
    c.kundenbetreuer_id, c.letzter_no_show_am, c.letzter_sv_no_show_am,
    c.polizei_aktenzeichen, c.polizei_bericht_vorhanden, c.polizei_vor_ort,
    c.polizeibericht_status, c.sachschaden_beschreibung, c.schadenart,
    c.schadenort_adresse, c.schadenort_kategorie, c.schadenort_land,
    c.schadenort_lat, c.schadenort_lng, c.schadenort_ort, c.schadenort_plz,
    c.schadentag, c.schadenzeit, c.spezifikation, c.sv_id,
    c.sv_no_show_count, c.unfall_konstellation,
    c.unfallskizze_ablehnung_grund, c.unfallskizze_bestaetigt,
    c.unfallskizze_generiert_am, c.unfallskizze_svg, c.unfallskizze_url,
    c.updated_at, c.vehicle_id, c.vorschaden_mit_vs_abgerechnet,
    c.vorsteuerabzugsberechtigt, c.zeugen_kontakte
  FROM public.claims c
  WHERE public.is_sv_for_claim(c.id);

COMMENT ON VIEW public.v_claim_sv IS
  'CMM-60 Schritt 2b: SV-gescopete Claim-Projektion. Spalten-Whitelist auf Auftrag-Lifecycle + neutrale Stammdaten — ohne Kanzleifall-LC, Regulierung, internen Audit, kunde_email. Row-Filter is_sv_for_claim. Phase-4-Ziel der SV-Reader-Migration.';

GRANT SELECT ON public.v_claim_sv TO authenticated;

COMMIT;
```

Hinweis: Das `SELECT` listet exakt 61 Spalten (zähle nach: 5 in Zeile 1 + die folgenden Blöcke = 61). Keine der 21 ausgeschlossenen Spalten (`kanzlei_*`, `regulierungs_betrag`, `created_by_user_id`, `created_via`, `endzustand_*`, `verjaehrt_am`, `vs_ablehnungs_grund`, `lead_id`, `geschaedigter_user_id`, `kunde_email`, `finanzierungsgeber_*`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/*_cmm60_schritt2b_v_claim_sv.sql
git commit -m "feat(CMM-60): Schritt-2b Migration — v_claim_sv View

61-Spalten-Whitelist-Projektion von claims fuer den SV, security_invoker,
Row-Filter is_sv_for_claim. Noch nicht appliziert.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
(Echte Umlaute im Commit — der Pre-Commit-Hook blockt ASCII-Ersatz.)

---

## Task 2: Struktur-Probe schreiben

**Files:**
- Create: `scripts/probe-cmm60-s2b-struktur.sql`

- [ ] **Step 1: Probe-Skript schreiben**

Inhalt von `scripts/probe-cmm60-s2b-struktur.sql`:

```sql
-- CMM-60 Schritt-2b Struktur-Verifikation von v_claim_sv.
SELECT chk, result FROM (
  SELECT 1 AS ord, 'v_claim_sv existiert' AS chk,
         EXISTS (SELECT 1 FROM information_schema.views
                 WHERE table_schema='public' AND table_name='v_claim_sv')::text AS result
  UNION ALL
  SELECT 2, 'security_invoker=true',
         (SELECT (reloptions @> ARRAY['security_invoker=true'])::text
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='v_claim_sv')
  UNION ALL
  SELECT 3, 'Spaltenzahl = 61',
         ((SELECT count(*) FROM information_schema.columns
           WHERE table_schema='public' AND table_name='v_claim_sv') = 61)::text
  UNION ALL
  SELECT 4, 'keine der 21 ausgeschlossenen Spalten im View',
         ((SELECT count(*) FROM information_schema.columns
           WHERE table_schema='public' AND table_name='v_claim_sv'
             AND column_name IN (
               'kanzlei_ansprechpartner_email','kanzlei_ansprechpartner_name',
               'kanzlei_ansprechpartner_telefon','kanzlei_uebergeben_am',
               'kanzlei_wunsch','kanzlei_wunsch_gefragt_am',
               'kanzlei_wunsch_gefragt_in_phase','regulierungs_betrag',
               'created_by_user_id','created_via','endzustand_gesetzt_am',
               'endzustand_gesetzt_durch_user_id','endzustand_grund',
               'verjaehrt_am','vs_ablehnungs_grund','lead_id',
               'geschaedigter_user_id','kunde_email','finanzierungsgeber_name',
               'finanzierungsgeber_adresse','finanzierungsgeber_vertragsnr'
             )) = 0)::text
) q ORDER BY ord;
```

- [ ] **Step 2: Commit**

```bash
git add scripts/probe-cmm60-s2b-struktur.sql
git commit -m "test(CMM-60): Schritt-2b Struktur-Probe fuer v_claim_sv

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: RLS-Impersonation- + Negativ-Probe schreiben

**Files:**
- Create: `scripts/probe-cmm60-s2b-rls.sql`

- [ ] **Step 1: Probe-Skript schreiben**

Inhalt von `scripts/probe-cmm60-s2b-rls.sql`. Die Platzhalter `<SV_PROFILE_ID>` / `<SV_ID>` werden in Task 4 Step 3 mit echten Werten ersetzt:

```sql
-- CMM-60 Schritt-2b RLS-Impersonation: v_claim_sv unter echtem SV-Auth-Kontext.
-- Transaktional, ROLLBACK.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','<SV_PROFILE_ID>','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

SELECT chk, result FROM (
  SELECT 1 AS ord, 'SV sieht im View nur eigene Claims' AS chk,
    ((SELECT count(*) FROM public.v_claim_sv)
     = (SELECT count(*) FROM public.claims WHERE sv_id='<SV_ID>'))::text AS result
  UNION ALL
  SELECT 2, 'View liefert >0 Zeilen fuer diesen SV',
    ((SELECT count(*) FROM public.v_claim_sv) > 0)::text
) q ORDER BY ord;

ROLLBACK;
```

- [ ] **Step 2: Commit**

```bash
git add scripts/probe-cmm60-s2b-rls.sql
git commit -m "test(CMM-60): Schritt-2b RLS-Impersonation-Probe fuer v_claim_sv

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Migration applizieren + verifizieren

**Files:**
- (keine neuen — appliziert Task-1-Migration, nutzt Task-2/3-Probes)

- [ ] **Step 1: Worktree-Supabase-Link sicherstellen**

```bash
cp -r "/c/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/supabase/.temp/." supabase/.temp/
```
Expected: `.temp/linked-project.json` etc. vorhanden.

- [ ] **Step 2: Migration applizieren (Targeted-Apply)**

```bash
npx supabase db query --linked --agent yes --file supabase/migrations/<ts>_cmm60_schritt2b_v_claim_sv.sql
npx supabase migration repair --status applied <ts>
```
Expected: erste Query `"rows": []` (kein Fehler); repair meldet `Finished supabase migration repair.`

- [ ] **Step 3: SV-Testdaten für die RLS-Probe holen + Platzhalter ersetzen**

```bash
printf "%s" "SELECT sv.profile_id, sv.id AS sv_id FROM sachverstaendige sv JOIN claims c ON c.sv_id=sv.id WHERE sv.profile_id IS NOT NULL LIMIT 1;" > scripts/_t.sql
npx supabase db query --linked --agent yes --file scripts/_t.sql
rm -f scripts/_t.sql
```
Die zurückgegebenen `profile_id` + `sv_id` in `scripts/probe-cmm60-s2b-rls.sql` für `<SV_PROFILE_ID>` bzw. `<SV_ID>` einsetzen.

- [ ] **Step 4: Struktur-Probe ausführen**

```bash
npx supabase db query --linked --agent yes --file scripts/probe-cmm60-s2b-struktur.sql
```
Expected: alle 4 Checks `"result": "true"` (existiert, security_invoker, 61 Spalten, 0 ausgeschlossene).

- [ ] **Step 5: RLS-Impersonation-Probe ausführen**

```bash
npx supabase db query --linked --agent yes --file scripts/probe-cmm60-s2b-rls.sql
```
Expected: beide Checks `"result": "true"` (View-Zeilen = claims des SV, >0 Zeilen).

- [ ] **Step 6: Negativ-Probe — ausgeschlossene Spalte ist nicht abfragbar**

```bash
printf "%s" "SELECT regulierungs_betrag FROM public.v_claim_sv LIMIT 1;" > scripts/_neg.sql
npx supabase db query --linked --agent yes --file scripts/_neg.sql
rm -f scripts/_neg.sql
```
Expected: Fehler `column "regulierungs_betrag" does not exist` — beweist das Column-Scoping. (Erwarteter Fehler, kein Plan-Fehler.)

- [ ] **Step 7: Commit der finalisierten RLS-Probe**

```bash
git add scripts/probe-cmm60-s2b-rls.sql
git commit -m "test(CMM-60): Schritt-2b RLS-Probe mit echten SV-IDs befuellt

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Types regenerieren + PR

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Types regenerieren**

```bash
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```
Expected: Diff zeigt einen neuen `v_claim_sv`-Eintrag unter `Views` (rein additiv).

- [ ] **Step 2: Typecheck**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "feat(CMM-60): Schritt-2b appliziert — v_claim_sv live + Types

Migration via Targeted-Apply + migration repair. Struktur-Probe (61 Spalten,
security_invoker, 0 ausgeschlossene), RLS-Impersonation (SV sieht nur eigene
Claims) und Negativ-Probe (regulierungs_betrag nicht abfragbar) gruen.

Audit:
- Build: gruen (tsc --noEmit exit 0)
- UI: n/a — View ohne Consumer (Phase-4-Ziel)
- Redundanz: nutzt bestehendes is_sv_for_claim + v_claim_for_gast-Muster
- Dead-Code: nichts entfernt
- Spec: Schritt-2b-Spec vollstaendig; Closure = Phase 4
- Inkonsistenz: Spaltennamen via information_schema verifiziert; Umlaute ok
- Regression: View additiv, kein bestehender Pfad beruehrt

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Push + PR gegen staging**

```bash
git push
gh pr create --base staging --head kitta/cmm-60-schritt2b-sv-projektion \
  --title "feat(CMM-60): Schritt 2b — SV-Claim-Projektion v_claim_sv" \
  --body "CMM-60 Schritt 2b: View v_claim_sv (61-Spalten-Whitelist, security_invoker, Row-Filter is_sv_for_claim) als Phase-4-fertiges SV-Lese-Ziel. Migration appliziert; Struktur- + RLS-Impersonation- + Negativ-Probe gruen. Closure (SV-claims-SELECT-Entzug) ist Phase 4. Spec: docs/superpowers/specs/2026-05-16-cmm60-schritt2b-sv-claim-projektion-design.md"
```
Expected: PR-URL.

- [ ] **Step 5: Linear CMM-60 Kommentar**

Kommentar an CMM-60: Schritt 2b appliziert, v_claim_sv live, PR-Link, Probes grün, Closure = Phase 4.

---

## Verifikation gesamt

Nach Task 5 gilt der Plan als erfüllt wenn:
- `v_claim_sv` existiert mit exakt 61 Spalten, `security_invoker=true`, keiner der 21 ausgeschlossenen Spalten.
- Ein authentifizierter SV sieht im View genau seine zugewiesenen Claims (= `claims WHERE sv_id = eigene sv_id`), keine fremden.
- `SELECT regulierungs_betrag FROM v_claim_sv` schlägt fehl.
- `tsc --noEmit` grün, `database.types.ts` kennt den View.
- PR gegen `staging` offen, Linear aktualisiert.
