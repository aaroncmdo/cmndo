# RLS-Härtung: Claim-Read-Views + 3 sekundäre Lecks — Design

**Datum:** 2026-06-27
**Branch:** `kitta/rls-haertung-claim-views` (off staging)
**Status:** Design (brainstorming-Output, vor writing-plans)

## Problem (verifiziert, live)

Der „wer sieht was"-Audit (27.06.) fand: **alle 7 Claim-Read-Views umgehen die claims-RLS komplett.**

Alle Views (`v_claim_base`, `v_claim_full`, `v_faelle_mit_aktuellem_termin`, `faelle_sv_view`, `faelle_kunde_view`, `v_claim_phase`, `v_claim_listing`) sind:
- `owner = postgres` mit `rolbypassrls = true` → RLS auf claims/claim_parties/personen wird im View-Body umgangen,
- SECURITY DEFINER (`security_invoker = false`),
- an `authenticated` granted (alle 7) + `anon` (war: `v_claim_base`),
- ohne internen `auth.uid()`-Filter.

**Live-Beweis (count-only):** `set role authenticated; select count(*) from v_claim_full` → 89 (alle Claims); `set role anon; select count(*) from v_claim_base` → 89. Exponiert: `iban`, `bic`, `kontoinhaber`, `kunde_email`, `regulierung_betrag`, `halter_geburtsdatum`, `kanzlei_honorar`, `lead_preis_netto`, `marketing_provision`.

**Sofort-Fix bereits gelandet (PR #3237, Mig 20260626225905):** `REVOKE SELECT ON v_claim_base FROM anon, authenticated` — schließt den anon-Pfad komplett (anon hatte keinen anderen). Verifiziert: anon/auth-Grant = false; Layer-Views unberührt (v_claim_full auth weiter 89). **Der authenticated-Pfad über die 6 Consumer-Views ist offen** — dieses Design schließt ihn.

Drei kleinere, unabhängige Lecks aus demselben Audit werden mitgenommen:
- **anon-Leads:** Policy `Flow anon select leads` filtert nur `status='flow-gesendet'`, nicht Token/Ownership → anon kann alle Flow-Leads enumerieren (heute 132 Rows / 0 echte Emails = latent).
- **fall_dokumente:** SV- + Kanzlei-SELECT-Policies prüfen `sichtbar_fuer` NICHT (kunde-Policy schon) → SV/Kanzlei lesen mandats-interne Docs (`sa_vollmacht`, `ki_kalkulation`, `abrechnung_intern`) ihrer eigenen Fälle per Direct-Call.
- **KB-Beratungstermine:** keine `gutachter_termine`-Policy für `assignee_typ='kundenbetreuer'` + `claim_id IS NULL` → KB sieht eigene `kb_beratung`-Termine nicht via Normal-Client.

## Ziel

Jede Rolle sieht über die Views nur die Claims, die sie sehen darf (Row-Level), und sensible Vermittler-Rollen sehen keine Finanz-/Bankdaten (Column-Level) — **ohne die 122 Consumer-Files (182 Usages) anzufassen** und **ohne die Joins (`personen` hat 0 RLS-Policies) zu brechen.**

## Gewählter Ansatz: B — SECURITY DEFINER behalten + interner Gate

Verworfen:
- **A (`security_invoker=true`):** Views joinen `personen` (0 Policies), `claim_parties`, `vehicles`, `gutachter_termine` → RLS müsste auf all diesen Tabellen für alle 9 Rollen nachgezogen werden; `personen` würde sonst für jeden 0 Rows liefern (Name/Adresse null). Zu große Fläche, Column-Level nur über Pro-Rolle-Views.
- **C (RPC-Refactor):** 122 Files von `.from(view)` auf `.rpc()` umstellen → massiver Refactor, hohes Regressionsrisiko.

**B** ist chirurgisch: Joins bleiben als owner gelesen (kein `personen`-Bruch), Consumer-Vertrag (View-Namen) unverändert, Row + Column in einem.

## Zugriffs-Matrizen (Aaron-approved 27.06.)

### Row-Visibility — `claim_sichtbar_fuer_aktuellen_user(claim_id)`

| Rolle | Sieht Claims |
|---|---|
| admin | alle |
| dispatch | alle (interne Ops-Rolle) |
| kundenbetreuer | eigene (`kundenbetreuer_id`) + Pool (`NULL`) |
| kunde | eigene (`geschaedigter_user_id` oder aktive `claim_party`) |
| sachverstaendiger | zugewiesene (`sv_id`) |
| makler | eigene vermittelte (`makler_id`) |
| werkstatt | eigene (`werkstatt_id`) |
| kanzlei | `service_typ='komplett'` (flach; kein `claims.kanzlei_id` vorhanden → Mandanten-Scoping separat) |
| service_role / Cron | alle (`auth.role()='service_role'`) |
| anon | nichts (kein Grant) |

### Column-Visibility — rollenbasierte Nuller

Gruppen: **Bank/PII** (`iban`,`bic`,`kontoinhaber`,`halter_geburtsdatum`) · **Interne Margen** (`lead_preis_netto`,`marketing_provision`,`kanzlei_honorar`) · **Regulierung/Gutachten-Werte** (`regulierung_betrag` + Gutachten-Wertfelder)

| Rolle | Bank/PII | Interne Margen | Regulierung | Gutachten-Werte |
|---|---|---|---|---|
| admin, kb, dispatch | ✓ | ✓ | ✓ | ✓ |
| kunde | ✓ (eigene) | ✗ | ✓ | ✓ |
| sachverstaendiger | ✗ | ✗ | ✗ | ✓ |
| makler | ✗ | ✗ | ✗ | ✗ |
| werkstatt | ✗ | ✗ | ✗ | ✗ |
| kanzlei | ✓ | ✗ | ✓ | ✓ |

## Architektur / Komponenten

### 1. Row-Gate-Funktion
`public.claim_sichtbar_fuer_aktuellen_user(p_claim_id uuid) returns boolean`
- LANGUAGE **sql** (inline-fähig durch den Planner → kein Per-Row-Overhead), **STABLE**, **SECURITY DEFINER**, `SET search_path = public`.
- Logik:
  ```
  auth.role() = 'service_role'
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch'))
  OR EXISTS (
       SELECT 1 FROM claims c WHERE c.id = p_claim_id AND (
            c.geschaedigter_user_id = auth.uid()
         OR is_claim_user_party(c.id)
         OR c.sv_id        IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid())
         OR c.makler_id    IN (SELECT id FROM makler          WHERE profile_id = auth.uid())
         OR c.werkstatt_id IN (SELECT id FROM werkstaetten    WHERE profile_id = auth.uid())
         OR (EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND rolle='kundenbetreuer')
             AND (c.kundenbetreuer_id = auth.uid() OR c.kundenbetreuer_id IS NULL))
         OR (EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND rolle='kanzlei')
             AND c.service_typ = 'komplett')
       ));
  ```
- **`auth.role()='service_role'`** (nicht `auth.uid() IS NULL`) für den Server-Bypass: anon (role='anon') rutscht selbst bei versehentlichem Grant nie durch.

### 2. Column-Nuller-Funktionen
Vier SQL-STABLE-SECURITY-DEFINER-Funktionen, jeweils `returns boolean` aus der Rolle des Aufrufers (`auth.role()='service_role'` → true):
- `rolle_sieht_bankdaten()` → admin/kb/dispatch/kunde/kanzlei
- `rolle_sieht_margen()` → admin/kb/dispatch
- `rolle_sieht_regulierung()` → admin/kb/dispatch/kunde/kanzlei
- `rolle_sieht_gutachtenwerte()` → admin/kb/dispatch/kunde/sv/kanzlei

### 3. View-Anpassung (7 Consumer-Views via CREATE OR REPLACE)
Pro View: (a) `WHERE claim_sichtbar_fuer_aktuellen_user(<claim_id_spalte>)` anhängen, (b) sensible Spalten via `CASE WHEN rolle_sieht_X() THEN spalte ELSE null END` — **nur wo die View die Spalte führt** (faelle_sv_view/faelle_kunde_view sind teils schon projiziert; Pro-View-Inventar im Plan). `v_claim_base` bleibt roh (revoked, nicht direkt lesbar). Output-Shapes (Spaltennamen/-typen/-reihenfolge) bleiben identisch → 0 Consumer-Rewrites.

**+ `v_claim_parties_safe` (7. View, 27.06. Nachprüfung gefunden):** SECURITY DEFINER (`reloptions=null`) + anon-granted + **kein WHERE** (nur Spalten-Masking via `auth.uid()`-CASE auf nachname/VSNR) → **LIVE-Leak verifiziert: `set role anon` → 91 Party-Rows / 88 Claims** (vorname + claim↔user_id-Mapping exponiert; nachname/firma/VSNR maskiert). Fix = **gleicher Row-Gate** `WHERE claim_sichtbar_fuer_aktuellen_user(claim_id)` (View ist claim_id-keyed). **NICHT** `security_invoker=true` flippen — sie joint `personen` (0 RLS) → würde vorname/nachname für alle nullen (gleiches personen-Problem). Definer behalten + Gate; Spalten-Masking bleibt Bonus.

### 4. Sekundäre Edits
- **anon-Leads:** RPC `public.get_lead_for_flow(p_token text) returns leads` (SECURITY DEFINER, gibt nur die Zeile zum Token zurück), `GRANT EXECUTE TO anon`. Breite Policy `Flow anon select leads` entfernen / auf token-gebunden umstellen. `/flow/[token]`-Lead-Read auf die RPC umstellen. *(Flow-Domäne → Koordination.)*
- **fall_dokumente:** „SV eigene Fall-Dokumente" (cmd=ALL) splitten: SELECT-Policy mit `… AND sichtbar_fuer @> ARRAY['sachverstaendiger']`; INSERT/UPDATE/DELETE-Policy case-scoped ohne sichtbar_fuer (SV setzt sichtbar_fuer beim Upload). Analog „Kanzlei liest fall_dokumente" → `sichtbar_fuer @> ARRAY['kanzlei']`.
- **KB-Termine:** neue `gutachter_termine`-SELECT-Policy: `assignee_typ='kundenbetreuer' AND assignee_id = auth.uid()` (assignee_id-Semantik im Plan verifizieren).

## Verifikation

- **Pro-Rolle Row-Diff-Harness** (SQL): je Rolle ein realer Sample-User; `set local role authenticated; set local request.jwt.claims = '{"sub":"<uid>","role":"authenticated"}'`; Sichtbarkeits-Set (`count` + `array_agg(claim id)`) vorher (alle 89) vs. nachher. Assertions: (1) **Over-Exposure** = 0 (keine Rolle sieht fremde Claims), (2) **Under-Exposure** = 0 (jede Rolle sieht ihre legit Claims weiter — gegen die je Rolle erwartete Menge). Column-Check: pro Rolle die genullten Spalten = erwartet.
- **EXPLAIN-Perf-Gate** (Pattern aus View-Kanonisierung): `v_claim_full` Single-Row (`?id=eq.x`) + List, vor/nach — keine Regression (Gate-Funktion muss inlinen / Index-Lookups).
- **Bestehende Prod-Smokes** (FlowLink→Gutachten→Kanzlei je Rolle).

## Rollout

- **Migrations-Reihenfolge:** (1) Gate- + Nuller-Funktionen, (2) 6 Views CREATE OR REPLACE (Gate+Nuller), (3) sekundäre Policies/RPC. Jede via `apply_migration`; File-Name = getrackte Version (Regel 2); **jede Prod-DDL gated auf Aaron-Go.**
- **Rollback:** alte View-Defs (aus git/v_claim_base-Layer) per CREATE OR REPLACE zurück; Funktionen droppen.
- **Reihenfolge-Safety:** Views referenzieren die Funktionen → Funktionen zuerst.

## Tests

- SQL-Tests Gate-Funktion (jede Rolle → korrektes Boolean gegen Fixtures) + Column-Nuller (jede Rolle → korrekte Maske).
- Row-Diff-Harness als wiederholbarer Check (Kandidat für `scripts/check-claim-view-rls.mjs`, service-role, PR-Gate wie check:rls-grants).
- App-Layer unverändert → keine neuen vitest-Suites für Consumer.

## Im Plan zu verifizieren (Exploration)

- `makler.profile_id` / `werkstaetten.profile_id` (User→Entity-Linkage) — exakte Spalten/Tabellennamen.
- `auth.role()` in diesem Projekt verfügbar (Supabase-Standard, aber bestätigen).
- Pro-View-Inventar welcher der 6 Views welche sensiblen Spalten führt (Column-Nuller nur dort).
- `gutachter_termine.assignee_id`-Semantik für KB (profile-id vs. kb-spezifische id) + ob `kb_id`-Spalte existiert.
- `fall_dokumente` Policy-Split: existierende INSERT/UPDATE-Pfade der SV nicht brechen.
- Welche der 6 Views haben `security_invoker=false` vs. explizit gesetzt (v_claim_listing hatte `{security_invoker=false}`) — CREATE OR REPLACE erhält reloptions, ggf. explizit mitsetzen.

## Erweiterte anon-Surface-Nachprüfung (27.06., auf Aaron-Nachfrage „auftrag + kanzlei fall")

Vollständiger Sweep aller public-Tabellen/Views mit anon-SELECT-Grant:
- **`auftraege`:** RLS sound (Policies admin/dispatch/kb/kanzlei via `auth.uid()`); anon-Grant **latent** (kein anon-Policy → RLS denied; fail-closed auch weil anon kein EXECUTE auf `is_claim_user_party`). **Kein Leck.**
- **Kanzlei-Fall:** kanzlei liest `kanzlei_faelle` + `forderungspositionen` (flach via `is_kanzlei()`, konsistent mit kanzlei=flach). `abrechnungen` (Policy admin/makler/sv, **nicht** kanzlei) + `kanzlei_pakete` (admin/kb/kunde, **nicht** kanzlei) = **Under-Exposure** (Funktionalität, gehört zum Kanzlei-Fall-Workstream [[audit-kanzlei-fall-komplett]] mit tieferen Issues LexDrive/push-mandat). **Kein Leck** — separates Ticket.
- **4 anon-Views safe:** `v_claim_for_gast`/`v_embed_billing_faellig`/`v_offene_anfragen`/`v_sv_inbox` = alle `security_invoker=true` → laufen als Aufrufer, RLS greift, anon=0 (verifiziert).
- **`v_claim_parties_safe` = der eine echte Fund** → in Scope (Architektur §3, 7. View).
- **`gfa_anon_select_recent_window`** (gutachter_finder_anfragen): anon-SELECT auf `source IS NULL AND erstellt_am > now()-5min` → narrow 5-Min-Fenster (PII kürzlicher GFA-Anfragen) — wohl gewollt fürs Embed/Native-GFA-Flow, aber nicht own-/token-scoped. **Flag (Review-Item, eigenes Ticket):** token-scopen analog anon-Leads; braucht Embed-Flow-Verständnis → NICHT in dieser Hardening.
- **~90 Tabellen** mit anon-Grant + **0 anon-Policy** (Supabase-Default `GRANT SELECT ON ALL TABLES` + RLS-on) = fail-closed, **safe** → **NICHT** mass-revoked (Churn/Risiko ohne Sicherheitsgewinn; RLS ist der echte Gate).

## Scope-Grenze & Koordination

- **In Scope:** die 6 Claim-Views (Row+Column-Gate) + die 3 sekundären RLS-Edits.
- **Nicht in Scope:** kanzlei-Mandanten-Scoping (separates Projekt, braucht `kanzlei_faelle`-Join); die minor/by-design-Befunde (personen-0-Policy, 21× raw `auth.uid()`-Perf, makler/werkstatt im `Rolle`-Type von sichtbarkeit.ts).
- ⚠️ **Parallel-Session `kitta/werkstatt-vermittlungen-freigabe`** fasst Werkstatt-Logik an; mein Gate referenziert `werkstatt_id` + ggf. `werkstaetten`-Tabelle. Beim Bauen Merge-Reihenfolge + ggf. RLS-Overlap abstimmen.
