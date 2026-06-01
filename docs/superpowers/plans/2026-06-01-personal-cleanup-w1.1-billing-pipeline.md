# W1.1 — SV-Billing-Pipeline robust machen + System A retiren (AAR-945) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (empfohlen) oder superpowers:executing-plans, task-by-task. Steps nutzen Checkbox (`- [ ]`).

**Goal:** Das kanonische SV-Billing (System B, `abrechnung-erstellen`) rechnet zuverlässig **jeden bepreisten, noch nicht fakturierten** Fall ab — unabhängig vom Erstell-Monat — sodass System A (`monatsabrechnung`) gefahrlos abgeschaltet werden kann.

**Architecture:** Drei Struktur-Fixes am bestehenden Pipeline (billing-window, Kontingent-Monat, SSoT-Lese/Schreib-Konsistenz) + Retire von System A. Kein neues Schema; nutzt vorhandene `processCaseBilling` / `abrechnung-erstellen` / `case-billing-batch`.

**Tech Stack:** Next.js 16 cron-routes, Supabase (claims/faelle SSoT-Split aus CMM-44), VPS-Crontab. DDL (falls nötig) nur via `apply_migration`; `execute_sql` nur READ.

**Wichtige Vorbedingung (Daten):** B produziert heute fast nichts v.a. weil nur **2/76 Claims** eine Schadenhöhe haben (pre-launch). Dieser Plan behebt die **strukturellen** Bugs, die zuschlagen sobald echte Fälle abschließen — er ist **nicht dringend**, aber Voraussetzung für „System A abschalten".

**Branch:** `kitta/personal-cleanup`, pro Task ein PR gegen `staging`.

---

## Pre-Flight V1 — SSoT von `lead_preis_netto` empirisch klären (BLOCKER)

`processCaseBilling` schreibt `lead_preis_*` laut Kommentar „faelle-native" (via `splitOrKeepFaelleUpdate`), aber `abrechnung-erstellen` liest `lead_preis_netto` aus `v_faelle_mit_aktuellem_termin` („via claims"). Wenn Schreib- und Lese-Spalte auseinanderfallen, **sieht B den Preis nie** — das wäre der eigentliche Killer.

- [ ] **V1.1** `execute_sql` (READ): wohin schreibt der Helper?
```sql
-- Hat faelle UND claims eine lead_preis_netto-Spalte?
select table_name, column_name from information_schema.columns
where table_schema='public' and column_name='lead_preis_netto' and table_name in ('faelle','claims');
-- Wie definiert die View lead_preis_netto? (claims vs faelle vs coalesce)
select pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass, true);
```
- [ ] **V1.2** `splitOrKeepFaelleUpdate` lesen (`src/lib/faelle/claim-duplicate-columns.ts`): routet es `lead_preis_netto` nach claims, faelle oder beide? Notieren.
- [ ] **V1.3** Abgleich am 1 echten Fall:
```sql
select c.id claim_id, c.lead_preis_netto claims_preis, f.lead_preis_netto faelle_preis, c.lead_preis_berechnet_am
from claims c join faelle f on f.claim_id=c.id where c.lead_preis_netto is not null or f.lead_preis_netto is not null;
```
**Entscheidung:** Falls Schreibziel ≠ View-Lesequelle → das ist Teil von Task 3 (Konsistenz). Falls identisch (beide claims ODER View coalesct) → V1 nur dokumentieren, weiter mit Task 1.

---

## File Structure

- **Modify:** `src/app/api/cron/abrechnung-erstellen/route.ts` (billing-window, ~Z. 95–101) — Task 1
- **Modify:** `src/lib/abrechnung/calculate-lead-price.ts` (`isCaseInKontingent`, Z. 54–63) — Task 2 (preis-sensitiv)
- **Modify (bedingt):** `splitOrKeepFaelleUpdate` / View / `case-billing-batch` — Task 3 (nur falls V1 Desync zeigt)
- **VPS-Crontab + Migration + `scripts/diff-abrechnung-crons.mjs`** — Task 4 (Retire A)
- **Unverändert:** `process-case-billing.ts` Kernlogik (funktioniert)

---

## Task 1 — Billing-Window-Bug fixen: über `abrechnung_id IS NULL` billen, nicht über Erstell-Monat

**Problem:** `abrechnung-erstellen` filtert Fälle mit `created_at` im Abrechnungsmonat (Z. 98–99). Ein im Mai erstellter, im Juni bepreister Fall wird in keinem Lauf erfasst. Der echte „noch nicht abgerechnet"-Gate ist `abrechnung_id IS NULL`.

**Files:** `src/app/api/cron/abrechnung-erstellen/route.ts`

- [ ] **Step 1: Query umstellen** — `created_at`-Fenster entfernen, `abrechnung_id IS NULL` als alleiniges „offen"-Kriterium behalten. Vorher (Z. 95–101):
```ts
const { data: faelle } = await db.from('v_faelle_mit_aktuellem_termin')
  .select('id, claim_id, created_at, kennzeichen, schadens_hoehe_netto, gutachten_betrag, lead_preis_netto, lead_preis_typ, guthaben_verrechnet_netto, sv_nachzahlung_netto')
  .eq('sv_id', sv.id)
  .gte('created_at', monthStart)
  .lt('created_at', monthEnd)
  .not('lead_preis_netto', 'is', null)
  .is('abrechnung_id', null)
```
Nachher:
```ts
// W1.1/AAR-945: KEIN created_at-Fenster mehr — sonst werden später-abgeschlossene
// Fälle (Mai erstellt, Juni bepreist) nie fakturiert. Der kanonische "offen"-Gate
// ist abrechnung_id IS NULL; gebillt wird alles Bepreiste-aber-nicht-Fakturierte.
const { data: faelle } = await db.from('v_faelle_mit_aktuellem_termin')
  .select('id, claim_id, created_at, kennzeichen, schadens_hoehe_netto, gutachten_betrag, lead_preis_netto, lead_preis_typ, guthaben_verrechnet_netto, sv_nachzahlung_netto')
  .eq('sv_id', sv.id)
  .not('lead_preis_netto', 'is', null)
  .is('abrechnung_id', null)
```
- [ ] **Step 2:** `abrechnungs_zeitraum_start/ende` bleiben = aktueller Monat (Rechnungs-Periode-Label) — das ist OK, da das Fälligkeits-/Versanddatum am Laufmonat hängt. Kommentar ergänzen, dass der Zeitraum jetzt „Fakturierungsmonat" bedeutet, nicht „Fall-Erstellmonat".
- [ ] **Step 3: Build-Gate** — `npm run build` grün (Route geändert → voller Build).
- [ ] **Step 4: Verifikation (dev/staging, read-only Simulation)** — gegen Staging-DB prüfen: vor dem Fix liefert die alte Query 0 für einen later-completed Test-Fall, nach dem Fix ≥1. Falls kein passender Testfall existiert: 1 Claim mit `lead_preis_netto` setzen (nur Staging) und gegenchecken, dann zurückrollen. (Pre-launch → keine echten Rechnungen betroffen.)
- [ ] **Step 5: Commit + PR** — `fix(billing): abrechnung-erstellen billt über abrechnung_id statt created_at-Monat (W1.1/AAR-945)` + Audit-Block.

---

## Task 2 — Kontingent-Monat (preis-sensitiv → Entscheidung + Fix)

**Problem:** `isCaseInKontingent` (calculate-lead-price.ts:54–63) zählt die Fälle des SVs im **Kalendermonat der Claim-Erstellung** und vergleicht mit `paket_faelle_gesamt`, um Paket- vs. Einzelpreis zu wählen. Bei verzögert abgeschlossenen Fällen ist das inkonsistent zum Fakturierungsmonat.

- [ ] **Step 1: Pricing-Entscheidung (Aaron)** — Was definiert das „Kontingent des Monats"?
  - **(a)** Erstell-Monat des Falls (heute) — Kontingent = Fälle die in dem Monat *reinkamen*.
  - **(b)** Abschluss-/Bepreisungs-Monat (`lead_preis_berechnet_am`) — Kontingent = Fälle die in dem Monat *abgerechnet werden*.
  → **Default-Vorschlag (b)** für Konsistenz mit Task 1. **Diese Entscheidung ist preisrelevant — vor Code-Change bestätigen.**
- [ ] **Step 2: Implementieren (Variante b)** — `isCaseInKontingent` einen `stichtag`-Parameter geben (statt `caseCreatedAt`), gefüttert mit dem Bepreisungs-Datum. Vorher:
```ts
export async function isCaseInKontingent(gutachterId: string, caseCreatedAt: Date): Promise<boolean> {
  ...
  const monthStart = new Date(caseCreatedAt.getFullYear(), caseCreatedAt.getMonth(), 1)
  const monthEnd = new Date(caseCreatedAt.getFullYear(), caseCreatedAt.getMonth() + 1, 1)
  const { count } = await db.from('faelle')
    .select('id, claims:claim_id!inner(created_at)', { count: 'exact', head: true })
    .eq('sv_id', gutachterId)
    .gte('claims.created_at', monthStart.toISOString())
    .lt('claims.created_at', caseCreatedAt.toISOString())
  return (count ?? 0) < kontingent
}
```
Nachher (Stichtag = Bepreisungszeitpunkt, i.d.R. `now()`):
```ts
// W1.1/AAR-945: Kontingent wird am FAKTURIERUNGS-Monat gezählt (stichtag), nicht
// am Fall-Erstellmonat — konsistent zur Billing-Window-Logik aus Task 1.
export async function isCaseInKontingent(gutachterId: string, stichtag: Date): Promise<boolean> {
  const db = createAdminClient()
  const { data: sv } = await db.from('sachverstaendige').select('paket_faelle_gesamt').eq('id', gutachterId).single()
  const kontingent = sv?.paket_faelle_gesamt ?? 10
  const monthStart = new Date(stichtag.getFullYear(), stichtag.getMonth(), 1)
  // Zähle bereits in DIESEM Monat bepreiste Fälle des SVs (claims.lead_preis_berechnet_am).
  const { count } = await db.from('claims')
    .select('id', { count: 'exact', head: true })
    .eq('sv_id', gutachterId)
    .gte('lead_preis_berechnet_am', monthStart.toISOString())
    .lt('lead_preis_berechnet_am', stichtag.toISOString())
  return (count ?? 0) < kontingent
}
```
- [ ] **Step 3:** Aufrufer in `process-case-billing.ts:61` anpassen: `isCaseInKontingent(fall.sv_id, new Date())` (Bepreisungszeitpunkt) statt `new Date(claimCreatedAt)`. **Voraussetzung:** `claims.sv_id` + `claims.lead_preis_berechnet_am` existieren (per V1/Schema bestätigen).
- [ ] **Step 4: Build + Commit + PR** — `fix(billing): Kontingent am Fakturierungsmonat statt Erstellmonat (W1.1/AAR-945)` + Audit-Block. **Nur nach Step-1-Freigabe.**

---

## Task 3 — Schreib-/Lese-Konsistenz `lead_preis_netto` (nur falls V1 Desync zeigt)

- [ ] **Step 1:** Falls V1 ergab, dass `processCaseBilling` nach `faelle` schreibt, aber `v_faelle_mit_aktuellem_termin`/`abrechnung-erstellen` aus `claims` lesen (oder umgekehrt): den Schreibpfad in `splitOrKeepFaelleUpdate` so anpassen, dass `lead_preis_netto`/`lead_preis_typ`/`lead_preis_berechnet_am` dort landen, wo die View liest (claims = SSoT-Richtung CMM-44).
- [ ] **Step 2:** Auch `case-billing-batch` (liest `faelle.lead_preis_netto` + `faelle.status`, Z. 51–53) auf dieselbe SSoT-Quelle ausrichten, sonst läuft der Backstop gegen die falsche Spalte.
- [ ] **Step 3:** Verifikation: nach `processCaseBilling` eines Test-Falls erscheint der Preis in der View → `abrechnung-erstellen`-Query findet ihn. Build + Commit + PR.
- [ ] (Falls V1 Konsistenz zeigte: Task 3 entfällt, dokumentieren.)

---

## Task 4 — System A retiren (Gate: Task 1–3 live + verifiziert)

> Erst wenn B nachweislich bepreiste Fälle fakturiert. Pre-launch → kein Zeitdruck.

- [ ] **Step 1: `monats-abrechnungen` charakterisieren** — `src/app/api/cron/monats-abrechnungen/route.ts` lesen: schreibt es `finance_monatsberichte` (P&L, harmlos, behalten) oder ist es SV-Billing-Duplikat? Ergebnis in AAR-945.
- [ ] **Step 2: Stale Diff-Script fixen** — `scripts/diff-abrechnung-crons.mjs`: `brutto_endbetrag`→`gesamtbetrag`, `anzahl_faelle`→`(faelle_im_paket+faelle_einzel)` (Spalten existieren nicht mehr). Dann `node scripts/diff-abrechnung-crons.mjs --monat 2026-06` → muss „Shadow-OK" oder konkreten Drift zeigen.
- [ ] **Step 3: Legacy-Daten** — die 2 `gutachter_monatsabrechnungen`-Zeilen (Mai €400, Juni €200): entweder als „Legacy System A, nicht nachfakturieren" markieren (Status-Kommentar) oder via System B nachholen (falls die Fälle bepreist werden). Entscheidung dokumentieren.
- [ ] **Step 4: Crontab-Zeile entfernen (PROD-Aktion, braucht Go)** — auf dem VPS die Zeile `0 2 1 * * /usr/local/bin/cron-call.sh /api/cron/monatsabrechnung` auskommentieren/entfernen. Read-only-Verify danach: `crontab -l | grep monatsabrechnung` → leer. (Code-Route + `@deprecated`-Header bleiben als Referenz oder werden in separatem PR gelöscht.)
- [ ] **Step 5: AAR-945 schließen** — Diff sauber, A aus Crontab, B fakturiert. Done.

---

## Backfill

`case-billing-batch` (täglich 17:00) bepreist bereits automatisch alle `BILLABLE_STATUSES`-Fälle mit `sv_id` + ohne Preis. Nach Task 1+3 fängt es alle ab → **kein manueller Backfill nötig**, außer man will sofort: einmal `case-billing-batch` manuell triggern und prüfen, dass die bisher übersehenen Fälle (die mit Schadenhöhe) bepreist werden.

## Akzeptanzkriterien

1. Ein bepreister, im Vormonat erstellter Fall wird vom nächsten `abrechnung-erstellen`-Lauf fakturiert (Task 1).
2. Kontingent-Zählung konsistent zum Fakturierungsmonat (Task 2, nach Freigabe).
3. `lead_preis_netto`-Schreibziel == View-Lesequelle, Backstop liest dieselbe Quelle (Task 3 / V1).
4. `monatsabrechnung` aus VPS-Crontab entfernt; Diff-Script grün; Legacy-Zeilen-Entscheidung dokumentiert (Task 4).
5. Keine Doppel-Fakturierung (System A aus, `abrechnung_id`-Gate verhindert Dubletten).

## Self-Review

- **Spec-Coverage:** deckt AAR-945-Fix-Scope (created_at-Gate, Kontingent-Monat, Hook/Backstop-Konsistenz, Retire A) ab. ✅
- **Platzhalter:** Task 1 zeigt exaktes Before/After. Task 2 ebenso, hinter Pricing-Freigabe. Task 3 ist bedingt (V1-Ergebnis) — bewusst, da Schreibziel erst empirisch zu klären ist (kein Raten). Task 4 = geordnete Prod-Schritte.
- **Reihenfolge:** V1 (SSoT klären) → Task 1 → Task 2 (nach Freigabe) → Task 3 (bedingt) → Task 4 (Retire, nach Verify).
- **Risiko:** niedrig (pre-launch, keine echten Rechnungen); jede Prod-Aktion (Crontab) einzeln + read-only-verifiziert.
- **Offen/Annahme:** `claims.sv_id` + `claims.lead_preis_berechnet_am` existieren (V1/Schema bestätigt vor Task 2/3).
