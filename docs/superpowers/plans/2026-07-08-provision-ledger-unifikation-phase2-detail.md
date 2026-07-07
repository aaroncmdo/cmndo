# Provisions-Ledger-Unifikation — Phase 2 (Detail-Plan, TDD-ready)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development (RED→GREEN je Task) + superpowers:subagent-driven-development. Jeder Task = eigener Commit mit 7-Punkte-Audit-Trailer. DDL AUSSCHLIESSLICH via `mcp__plugin_supabase_supabase__apply_migration` (Regel 2); READ via `execute_sql`. **PLANNING-Artefakt — die Ausführung folgt später.**

**Parent-Plan:** `docs/superpowers/plans/2026-07-08-provision-ledger-unifikation.md` (Phase 2 dort ist ein Struktur-Stub — DIESER File ist die Line-by-Line-Ausarbeitung der Reader-Hälfte).
**Phase-1-Detail (die Write-Hälfte):** `docs/superpowers/plans/2026-07-08-provision-ledger-unifikation-phase1-detail.md`. **Phase 2 MUSS mit Phase 1 zusammen ausgeliefert werden — siehe §KOPPLUNG unten.**
**Design-Quelle:** `docs/superpowers/specs/2026-07-08-provision-gutschrift-ledger-assessment.md`.
**Projekt-Ref (prod):** `paizkjajbuxxksdoycev`.

---

## 0 · Was Phase 2 IST

Phase 1 hat die DB-Trigger umgehängt: NEUE Provisionen/Boni entstehen in `partner_provisionen` / `partner_staffel_bonus` (mit `partner_typ`-Diskriminator). **Phase 2 zieht ALLE READER nach**, damit Admin-Cockpit, Partner-Portale und der Gutschrift-Ledger die Union-Tabellen lesen:

1. **`v_partner_billing`-View** umschreiben (4 Provisions-/Bonus-Branches lesen die Union statt der 4 Alt-Tabellen). — Task **P2-2** (MONEY)
2. **Jeden direkten TS-Reader** repointen (makler/werkstatt `queries.ts`, `wochenreport.ts`, `pipeline.ts`). — Tasks **P2-4/5/6**
3. **`provision-status.ts` META 5→3 kollabieren** (bewusst OUT von Phase 1 verschoben — s. Crux §P2-3). — Task **P2-3** (MONEY, härtester)
4. **Typsichere `LEDGER_TABELLEN`-Konstante** einführen + alle rohen `ledger_tabelle`-Strings darauf umstellen (schließt die T6b-Bug-Klasse). — Tasks **P2-1** + **P2-7** (MONEY)

**Prod-Fakten (re-verifiziert 2026-07-08 via `execute_sql`):**
- `makler_provisionen`=2, `werkstatt_provisionen`=7 (Test-Account-Zeilen, bleiben bis Phase 3 in den Alt-Tabellen), beide `*_staffel_bonus`=0, `partner_provisionen`=0, `partner_staffel_bonus`=0, **`partner_gutschriften`=0** → **KEIN `ledger_tabelle`-Backfill in Phase 2** (sauberer Schnitt: es existiert keine Gutschrift, deren `ledger_tabelle` von einem Alt- auf einen Union-Wert migriert werden müsste).
- `partner_provisionen` HAT sowohl `abrechnung_id` (makler-spezifisch) als auch `ausgezahlt_am` (werkstatt-spezifisch) als Spalten → die `status_norm`-CASE-Ausdrücke des Views portieren 1:1.
- `partner_provisionen` hat **KEINE Foreign Keys** (nur PK + 5 CHECKs) und **NUR den PK-Index** — das ist der Kern der zwei harten Contradictions unten (§P2-3, §P2-4).

---

## ⛓ KOPPLUNG — Phase 1 + Phase 2 sind die Write- und Read-Hälfte EINES Schalters (eigener Abschnitt, verbindlich)

**Phase 1 und Phase 2 MÜSSEN zusammen ausgeliefert werden — idealerweise als EIN kombinierter PR gegen `staging`, mindestens im selben Deploy-Zyklus.** Der Grund ist der Geld-Pfad:

- **Phase 1 allein deployt** → neue Provisionen entstehen in `partner_provisionen`, aber `v_partner_billing` (noch alt) liest sie NICHT → sie sind im Admin-Cockpit + Partner-Portal **unsichtbar und nicht auszahlbar** (fail-safe, aber Business-blind).
- **Phase 2 allein deployt** → `v_partner_billing` liest jetzt `partner_provisionen`, aber die Trigger schreiben noch in die Alt-Tabellen → der View liest eine **leere** `partner_provisionen` → **Cockpit zeigt nichts** (die 9 Bestands-Zeilen aus den Alt-Tabellen verschwinden aus der Sicht). Das ist eine sichtbare Regression für Admin.

**Der kombinierte PR-Body MUSS diese Kopplung dokumentieren und das Alleine-Deployen einer Hälfte nach `main` verbieten.** Da prod-Provisionen aktuell rein Test-Account-getrieben sind (2+7 Zeilen, sonst 0) und 0 Gutschriften existieren, ist das reale Fenster unkritisch — aber die Kopplung ist strukturell und darf nicht dem Idle-Merge-Scan überlassen werden. Falls (gegen die Empfehlung) getrennt: beide PR-Titel `[DO NOT DEPLOY ALONE — Phase 1/2 coupled]` + Idle-Merge-Ausschluss.

**Migrations-Reihenfolge im kombinierten PR (verbindlich):** Phase-1-Migs (Trigger-Switch + die zwei partiellen Unique-Indizes `partner_provisionen_typ_claim_uniq` / `partner_staffel_bonus_typ_partner_schwelle_uniq`) laufen VOR den Phase-2-Migs. Task **P2-2** (View) und **P2-4-FK** (siehe §P2-4) setzen den Unique-Index aus Phase-1-Task-2 NICHT voraus, aber der kombinierte Deploy muss die Phase-1-DDL zuerst applizieren, damit die recorded-Version-Reihenfolge der Migration-Files monoton bleibt (Regel 2).

---

## 1 · Global Constraints (die bindenden verbatim aus AGENTS.md + Parent-Plan)

- **DDL nur via `mcp__plugin_supabase_supabase__apply_migration`** (Regel 2). `execute_sql` ist **READ-only** — nie DDL-Payload, nie CLI (`db push`). Ablauf je Migration:
  1. DDL schreiben.
  2. `apply_migration({ name, query })` → wendet an UND trackt in `supabase_migrations.schema_migrations`.
  3. `list_migrations` → die vom Plugin vergebene Version `<V>` ablesen (eigener Timestamp — nicht raten).
  4. Migration-File committen als `supabase/migrations/<V>_<name>.sql` — Dateiname == getrackte Version `<V>` (Twin-Drift-Falle: Schritt 3+4 Pflicht).
  5. `execute_sql` (READ) zum Verifizieren.
- **`v_partner_billing`-Output-Signatur Before==After** — Task **P2-0** snapshottet sie, Task **P2-2** assertet Unverändertheit (Spaltennamen/Reihenfolge/Typen). Nur Quell-Tabellen + der `quelle_tabelle`-String-Literal ändern sich.
- **Money-kritisch:** `NODE_OPTIONS=--max-old-space-size=8192 npx vitest run src/lib/finance` nach JEDEM TS-Task grün. **Nie** Beträge/USt-Logik ändern — nur das Tabellen-Ziel + der `partner_typ`-Branch.
- **tsc lokal mit** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (Default-Heap OOM't → false „clean"). CI autoritativ.
- **Jeder Task = eigener Commit** mit dem 7-Punkte-Audit-Trailer (AGENTS.md §Post-Task-Audit). Co-Authored-By-Line exakt: `Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **RLS:** `partner_provisionen` / `partner_staffel_bonus` sind bereits gegatet (Phase 0, prod-verifiziert: `pp_admin_all` admin+KB-für-makler, `pp_partner_read` typ-verzweigt via makler/werkstaetten `user_id`). Keine neuen Grants in Phase 2. Die neuen FKs aus §P2-4 ändern RLS nicht.
- **Koordination:** Provisions-Tabellen sind Hot-Files (makler/werkstatt/leads/cron-Sessions). Vor Phase-Start `git fetch` + Marker prüfen. Lane = `kitta/provision-ledger-unifikation`.

---

## 2 · Zwei harte Contradictions gegen die Task-Vorgaben (LAUT — vor Ausführung reconcilen)

Die Grounding-Recherche (Code + prod-DB gelesen) hat zwei Stellen gefunden, an denen der **naive Transformations-Ansatz der Task-Beschreibung nicht funktioniert**. Beide sind money-relevant. Sie sind unten in den jeweiligen Tasks ausgearbeitet; hier die Kurzform, damit sie nicht übersehen werden:

### Contradiction A (Task P2-3, MONEY) — `auszahlenProvision` liest Partner-Steuerdaten per PostgREST-**Embed**, den `partner_provisionen` nicht kann
`auszahlenProvision` (`provision-status.ts:223`) baut den Select-String `` `${meta.betrag}, ${meta.fk}, ${meta.partner}(${meta.partnerFlag}), ${meta.leistungDatumCol}` `` — also z.B. `betrag_netto_eur, makler_id, makler(ist_kleinunternehmer), trigger_at`. Der Teil `makler(ist_kleinunternehmer)` ist ein **PostgREST-Foreign-Table-Embed**, der die FK `makler_provisionen_makler_id_fkey → makler` folgt. **`partner_provisionen` hat KEINE Foreign Keys** (prod-verifiziert: nur PK + CHECKs; `partner_id` ist polymorph, absichtlich kein FK). Ein Embed `partner_provisionen … .select('makler(ist_kleinunternehmer)')` findet keine Relation → PostgREST-Fehler `PGRST200` (could not find a relationship). **Die kollabierte META kann daher NICHT einfach `partner:'makler'` + `fk:'makler_id'` „per Zeile branchen" — der gesamte Steuerdaten-Read muss von einem Embed auf einen SEPARATEN, per `partner_typ` verzweigten Lookup umgebaut werden.** Ausarbeitung: **P2-3**.

### Contradiction B (Task P2-4, MONEY-adjazent) — makler-`queries.ts` nutzt **benannte-FK-Embeds** die auf `partner_provisionen` nicht existieren
Drei Reads in `src/lib/makler/queries.ts` (Zeilen **801, 990, 1504**) embedden `` fall:faelle_claim_bridge!makler_provisionen_fall_id_fkey(...) `` — ein **explizit benannter** FK-Hint (`makler_provisionen_fall_id_fkey`). Diese Constraint existiert auf `makler_provisionen` (prod-verifiziert), aber **nicht** auf `partner_provisionen`. Ein `.from('partner_provisionen').select("fall:faelle_claim_bridge!makler_provisionen_fall_id_fkey(...)")` schlägt fehl (der benannte Constraint gehört zur falschen Tabelle). **Der naive `.from()`-Swap der Task-Regel bricht diese drei Reads.** Lösung: eine Phase-2-Migration legt die FK `partner_provisionen_fall_id_fkey` (fall_id → `faelle_claim_bridge.fall_id`, PK/unique → FK-fähig) **plus** `partner_provisionen_claim_id_fkey` + `partner_provisionen_lead_id_fkey` an; die Embeds werden auf den neuen Constraint-Namen umbenannt. Ausarbeitung + genaue DDL: **P2-4**.

### Was NICHT bricht (verifiziert — die 4→2-`quelle_tabelle`-Kollaps-Annahme HÄLT)
Der Task fragt explizit, ob irgendetwas auf dem Tabellen-Namen so keyt, dass die makler≠werkstatt-Trennung gebraucht wird und der 4→2-Kollaps bräche. **Antwort: NEIN — verifiziert durch Lesen aller Consumer.** `erstellePartnerGutschrift` (`partner-gutschrift.ts:298`), `erstelleStornoGutschrift` (`:168`, kopiert `ledger_tabelle` vom Original), `getPartnerGutschriftDownloadUrl` (`partner-billing-actions.ts:252`), `buildGutschriftDocsByLedger` (`partner-billing.ts:137`, Key `${ledger_tabelle}:${ledger_id}`) und `belegeFuerZeile` (`:163`, Key `${quelle_tabelle}:${quelle_id}`) reichen `ledger_tabelle`/`quelle_tabelle` **als opaken String** durch. Der eigentliche Disambiguator ist immer `ledger_id`/`quelle_id` = die Row-`id` (uuid, **global eindeutig** über makler+werkstatt hinweg). Kein Consumer trennt makler von werkstatt über den Tabellen-Namen. Nach P2-2 nimmt `quelle_tabelle` für Provisionen/Boni nur noch 2 Werte an (`'partner_provisionen'`, `'partner_staffel_bonus'`) statt 4, und `.from(tabelle).eq('id', id)` bzw. `.eq('ledger_tabelle', tabelle).eq('ledger_id', id)` bleiben eindeutig. **Der Kollaps ist money-safe.**

### Was `erstellePartnerGutschrift` NICHT tut (wichtige Präzisierung für P2-3)
Der Task fragt, ob `erstellePartnerGutschrift` bereits auf `partner_typ` aus der Row branched (was P2-3 vereinfachen würde). **Antwort: NEIN.** `erstellePartnerGutschrift` bekommt `partnerTyp` als **Argument** (`p.partnerTyp`, `partner-gutschrift.ts:213`), das `auszahlenProvision` aus `META[tabelle].partnerTyp` liefert (`provision-status.ts:294`). Es liest den Partner NICHT aus der Ledger-Row, sondern aus `PARTNER_TABLE[p.partnerTyp]` (`partner-gutschrift.ts:227`). Also: der **Caller (`auszahlenProvision`) muss `partnerTyp` korrekt bestimmen** — und nach P2-2 kommt dieser nicht mehr aus `META[tabelle]` (das ist jetzt `'partner_provisionen'` für BEIDE Typen), sondern muss aus der **Ledger-Row-Spalte `partner_typ`** gelesen werden. Genau das ist der Kern von P2-3.

---

## 3 · Task-Übersicht (Reihenfolge = Abhängigkeit)

| # | Titel | Art | Money-kritisch | Datei(en) |
|---|---|---|---|---|
| P2-0 | Baseline: `v_partner_billing`-Signatur-Snapshot (READ) | READ | — | (prod-Query) |
| P2-1 | `LEDGER_TABELLEN`-Konstante (neue Lib) | TS+Test | nein | neu `src/lib/finance/ledger-tabellen.ts` |
| P2-2 | View-Rewrite: 4 Provisions-/Bonus-Branches → Union | DDL | **JA** | apply_migration |
| P2-3 | `provision-status.ts` META 5→3 (partner_typ-Runtime-Branch) | TS+Test | **JA** | `provision-status.ts` (+`.test.ts`) |
| P2-4 | makler-Reader → `partner_provisionen` (+ FK-Migration für Embeds) | TS+DDL | nein* | `makler/queries.ts` + apply_migration |
| P2-5 | werkstatt-Reader → `partner_provisionen` | TS | nein | `werkstatt/queries.ts` |
| P2-6 | wochenreport + pipeline + Pages (Kommentare) | TS | nein | `makler/wochenreport.ts`, `makler/pipeline.ts`, 2 pages |
| P2-7 | Gutschrift/Actions: rohe `ledger_tabelle`-Strings → `LEDGER_TABELLEN` | TS+Test | **JA** | `partner-gutschrift.ts`, `partner-billing-actions.ts`, `provision-status.ts` |
| P2-8 | Gate + kombinierter Phase-1+2-PR | Verify | — | — |

\* P2-4 ist nicht *money*-kritisch (Partner-Portal-Ansicht, kein Payout), aber enthält eine **DDL** (FK-Migration) + einen leisen Regressions-Risikopunkt (leere Alt-Tabelle → 0 Zeilen). Behandelt mit voller Sorgfalt.

**Reihenfolge-Begründung:** P2-0 friert die Signatur ein. P2-1 legt die Konstante an (kein Consumer bricht). P2-2 stellt den View um (danach emittiert er die Union-Labels). P2-3 folgt SOFORT auf P2-2, weil der View-Wechsel `quelle_tabelle='partner_provisionen'` liefert und die Action-Layer-META das auflösen können muss (sonst blockt der `PROVISION_TABELLEN.includes(quelle)`-Guard jede Auszahlung). P2-4/5/6 sind unabhängige Reader-Repoints. P2-7 härtet die `ledger_tabelle`-Strings (nach P2-3, weil P2-3 die META-Keys anfasst). P2-8 verifiziert + PR.

---

## Task P2-0 — Baseline: `v_partner_billing`-Signatur-Snapshot (READ)

**Zweck:** Beweisbar machen, dass P2-2 die Output-Signatur nicht verändert.

**Schritte (via `execute_sql`, project_id `paizkjajbuxxksdoycev`):**

1. **Volle View-Definition sichern** (dient als „BEFORE" in P2-2; ist unten in P2-2 verbatim eingebettet):
   ```sql
   SELECT pg_get_viewdef('public.v_partner_billing'::regclass, true);
   ```
2. **Spalten-Signatur snapshotten** (der Assert-Anker für P2-2):
   ```sql
   SELECT column_name, data_type, ordinal_position
   FROM information_schema.columns
   WHERE table_name='v_partner_billing' AND table_schema='public'
   ORDER BY ordinal_position;
   ```
   **Erwartetes Ergebnis (2026-07-08 verifiziert — 20 Spalten):**
   | pos | column_name | data_type |
   |----|----|----|
   | 1 | quelle_tabelle | text |
   | 2 | quelle_id | uuid |
   | 3 | partner_typ | text |
   | 4 | partner_id | uuid |
   | 5 | partner_name | text |
   | 6 | richtung | text |
   | 7 | dokument_typ | text |
   | 8 | referenz_nr | text |
   | 9 | betrag_netto | numeric |
   | 10 | ust_satz | numeric |
   | 11 | ust_betrag | numeric |
   | 12 | betrag_brutto | numeric |
   | 13 | ust_status_bekannt | boolean |
   | 14 | status_norm | text |
   | 15 | status_roh | text |
   | 16 | datum | timestamp with time zone |
   | 17 | faellig_am | date |
   | 18 | erledigt_am | timestamp with time zone |
   | 19 | claim_id | uuid |
   | 20 | fall_id | uuid |
3. **Zeilenzahl-Baseline** (nach P2-2 muss die Gesamtzahl gleich bleiben, weil die 9 Alt-Zeilen bis Phase 3 in den Alt-Tabellen liegen und `partner_provisionen`=0 — also liest der neue View nach P2-2 **0 Provisions-/Bonus-Zeilen** statt der bisher 9; die SV-/Kanzlei-/Onboarding-/Maik-Branches bleiben):
   ```sql
   SELECT quelle_tabelle, count(*) FROM v_partner_billing GROUP BY quelle_tabelle ORDER BY quelle_tabelle;
   ```
   > **⚠ Bewusster Effekt, KEIN Bug:** Nach P2-2 (aber vor Phase-3-Backfill) verschwinden die 9 Test-Bestands-Zeilen aus dem View, weil sie physisch in `makler_provisionen`/`werkstatt_provisionen` liegen und der View jetzt `partner_provisionen` (=0 Zeilen) liest. Das ist die read-half-Konsequenz von „Bestand bleibt bis Phase 3 in den Alt-Tabellen". Im kombinierten Phase-1+2-Deploy ist das akzeptabel (Test-Daten, 0 Gutschriften). Phase-3-Backfill kopiert die 9 Zeilen in `partner_provisionen` → dann erscheinen sie wieder. **Im PR-Body nennen.**

**Kein Commit** (READ-only). Output: die Signatur-Tabelle + die BEFORE-Viewdef liegen für P2-2 bereit.

---

## Task P2-1 — `LEDGER_TABELLEN`-Konstante (neue Lib)

**Datei (neu):** `src/lib/finance/ledger-tabellen.ts` — **kein `'use server'`** (reine Konstante; AGENTS §Server-Actions: keine Konst/Typen aus 'use server'-Files, sonst macht das Client-Bundle `undefined` daraus — AAR-664).

**Warum:** Schließt die T6b-Bug-Klasse (ein falscher Tabellen-String, der durchrutscht). Nach P2-7 sind alle `ledger_tabelle`-Literale in `partner-gutschrift.ts` / `partner-billing-actions.ts` / `provision-status.ts` durch diese getippte Konstante ersetzt.

**Vollständiger Datei-Inhalt:**
```typescript
// Typsichere Ledger-Tabellen-Namen für partner_gutschriften.ledger_tabelle.
// Nach der Provisions-Ledger-Unifikation (Phase 2) tragen Provisionen + Boni die
// Union-Labels; provisionen_maik bleibt separat (SV-'gutschriften' sind ein eigenes
// System, NICHT hier). Kein 'use server' — reine Konstante (AAR-664).
export const LEDGER_TABELLEN = {
  PARTNER_PROVISIONEN: 'partner_provisionen',
  PARTNER_STAFFEL_BONUS: 'partner_staffel_bonus',
  PROVISIONEN_MAIK: 'provisionen_maik',
} as const

export type LedgerTabelle = (typeof LEDGER_TABELLEN)[keyof typeof LEDGER_TABELLEN]
```

**TDD:**
1. **RED** — `src/lib/finance/ledger-tabellen.test.ts`:
   ```typescript
   import { describe, it, expect } from 'vitest'
   import { LEDGER_TABELLEN, type LedgerTabelle } from './ledger-tabellen'

   describe('LEDGER_TABELLEN', () => {
     it('mappt die drei Ledger-Ziele auf ihre DB-Tabellen-Namen', () => {
       expect(LEDGER_TABELLEN.PARTNER_PROVISIONEN).toBe('partner_provisionen')
       expect(LEDGER_TABELLEN.PARTNER_STAFFEL_BONUS).toBe('partner_staffel_bonus')
       expect(LEDGER_TABELLEN.PROVISIONEN_MAIK).toBe('provisionen_maik')
     })
     it('enthält genau 3 Einträge (kein makler_/werkstatt_-Leak)', () => {
       expect(Object.keys(LEDGER_TABELLEN)).toHaveLength(3)
       expect(Object.values(LEDGER_TABELLEN)).not.toContain('makler_provisionen')
       expect(Object.values(LEDGER_TABELLEN)).not.toContain('werkstatt_provisionen')
     })
     it('LedgerTabelle-Typ akzeptiert nur Union-Werte (compile-time sanity)', () => {
       const t: LedgerTabelle = 'partner_provisionen'
       expect(t).toBe('partner_provisionen')
     })
   })
   ```
2. **Command:** `NODE_OPTIONS=--max-old-space-size=8192 npx vitest run src/lib/finance/ledger-tabellen.test.ts` → schlägt fehl (Modul fehlt).
3. **GREEN:** die Lib anlegen. Rerun → grün.
4. **Commit:** `feat(provision-unifikation): LEDGER_TABELLEN typsichere Ledger-Konstante`.

**Audit-Notiz:** Redundanz — es gibt keine bestehende Ledger-Namens-Konstante (`PROVISION_TABELLEN` in `provision-status.ts` ist die *Reader-Contract*-Menge mit 5 Alt-Keys, ein anderes Konzept; nicht wiederverwendbar). UI — n/a. Regression — additiv, kein Consumer in diesem Task.

---

## Task P2-2 — View-Rewrite: 4 Provisions-/Bonus-Branches → Union (MONEY-KRITISCH)

**Was:** `CREATE OR REPLACE VIEW public.v_partner_billing` mit identischem Output, aber die 4 Branches `makler_provisionen` / `werkstatt_provisionen` / `makler_staffel_bonus` / `werkstatt_staffel_bonus` lesen jetzt `partner_provisionen` / `partner_staffel_bonus` (typ-gefiltert). Die 4 anderen Branches (`abrechnungen`-sv, `kanzlei_abrechnungen`, `sv_onboarding_rechnungen`, `provisionen_maik`) bleiben **UNVERÄNDERT**.

**Transformations-Regeln (exakt angewandt — verifiziert gegen die prod-Viewdef aus P2-0):**
- **makler_provisionen-Branch** → `FROM partner_provisionen pp LEFT JOIN makler m ON m.id = pp.partner_id WHERE pp.partner_typ = 'makler'`. `quelle_tabelle`-Literal `'makler_provisionen'` → `'partner_provisionen'`. `mp.makler_id` → `pp.partner_id`. Alle übrigen `mp.`-Spalten → `pp.` verbatim (betrag_netto, die ust_satz/ust_betrag/betrag_brutto-COALESCE-mit-Kleinunternehmer-Logik, `ust_status_bekannt`, die `status_norm`-CASE die `mp.abrechnung_id IS NOT NULL` für 'erledigt' nutzt, `status_roh`, `datum`, `erledigt_am`, `claim_id`, `fall_id`).
- **werkstatt_provisionen-Branch** → `FROM partner_provisionen pp LEFT JOIN werkstaetten w ON w.id = pp.partner_id WHERE pp.partner_typ = 'werkstatt'`. `quelle_tabelle` → `'partner_provisionen'`. `wp.werkstatt_id` → `pp.partner_id`. Die `status_norm`-CASE nutzt `wp.ausgezahlt_am IS NOT NULL` → `pp.ausgezahlt_am` (Spalte existiert auf `partner_provisionen`, prod-verifiziert). Rest `wp.` → `pp.` verbatim.
- **makler_staffel_bonus-Branch** → `FROM partner_staffel_bonus pp LEFT JOIN makler m ON m.id = pp.partner_id WHERE pp.partner_typ = 'makler'`. `quelle_tabelle` → `'partner_staffel_bonus'`. `mb.makler_id` → `pp.partner_id`. Rest `mb.` → `pp.` verbatim.
- **werkstatt_staffel_bonus-Branch** → `FROM partner_staffel_bonus pp LEFT JOIN werkstaetten w ON w.id = pp.partner_id WHERE pp.partner_typ = 'werkstatt'`. `quelle_tabelle` → `'partner_staffel_bonus'`. `wb.werkstatt_id` → `pp.partner_id`. Rest `wb.` → `pp.` verbatim.
- **KEY CONSEQUENCE (state + verify):** danach nimmt `quelle_tabelle` für Provisionen/Boni nur noch 2 Werte an (`'partner_provisionen'`, `'partner_staffel_bonus'`) statt 4. Weil `quelle_id` (= Row-`id`) global eindeutig ist, bleiben `.from(tabelle).eq('id', id)` (Action) und `.eq('ledger_tabelle', tabelle).eq('ledger_id', id)` (Gutschrift) eindeutig. **VERIFIZIERT** durch Lesen von `partner-billing-actions.ts` + `partner-gutschrift.ts` + `partner-billing.ts`: nichts keyt so auf den Tabellen-Namen, dass makler≠werkstatt-Trennung nötig wäre (s. §2 „Was NICHT bricht"). Kein Flag nötig — der Kollaps ist safe.

> **Alias-Wahl:** Ich alias'e die Union-Tabelle in beiden Provisions-Branches als `pp` (statt bisher `mp`/`wp`) und in beiden Bonus-Branches ebenfalls `pp` (statt `mb`/`wb`). Das JOIN-Alias bleibt `m` (makler) bzw. `w` (werkstaetten) — unverändert, damit die USt-CASE-Ausdrücke (`m.ist_kleinunternehmer` / `w.ist_kleinunternehmer`) verbatim bleiben. **Kein `partner_name`-Bruch:** makler → `m.firma`, werkstatt → `w.name` bleiben identisch, weil der JOIN-Partner (`makler` bzw. `werkstaetten`) pro Branch fix ist (der `WHERE partner_typ`-Filter garantiert, dass nur der passende JOIN Zeilen liefert).

**apply_migration payload (name `v_partner_billing_union`):**

Der Payload ist `CREATE OR REPLACE VIEW public.v_partner_billing AS <full text>`. Die 4 unveränderten Branches sind aus der P2-0-BEFORE-Viewdef **verbatim** übernommen; nur die 4 Provisions-/Bonus-Branches sind transformiert. **Vollständiger Payload:**

```sql
CREATE OR REPLACE VIEW public.v_partner_billing AS
 SELECT 'abrechnungen'::text AS quelle_tabelle,
    a.id AS quelle_id,
    'sv'::text AS partner_typ,
    a.empfaenger_id AS partner_id,
    a.empfaenger_name AS partner_name,
    'forderung'::text AS richtung,
    'rechnung'::text AS dokument_typ,
    a.abrechnungs_nr AS referenz_nr,
    a.summe_netto AS betrag_netto,
    a.ust_satz,
    a.ust_betrag,
    a.summe_brutto AS betrag_brutto,
    true AS ust_status_bekannt,
        CASE
            WHEN a.status = 'storniert'::text THEN 'storniert'::text
            WHEN a.status = 'fehlgeschlagen'::text THEN 'fehlgeschlagen'::text
            WHEN a.status = 'bezahlt'::text THEN 'erledigt'::text
            WHEN a.status = 'entwurf'::text THEN 'entwurf'::text
            WHEN a.faellig_am IS NOT NULL AND a.faellig_am < CURRENT_DATE AND a.bezahlt_am IS NULL THEN 'faellig'::text
            ELSE 'offen'::text
        END AS status_norm,
    a.status AS status_roh,
    a.versand_datum AS datum,
    a.faellig_am,
    a.bezahlt_am AS erledigt_am,
    NULL::uuid AS claim_id,
    NULL::uuid AS fall_id
   FROM abrechnungen a
  WHERE a.empfaenger_typ = 'sv'::text AND (a.abrechnungs_nr IS NULL OR a.abrechnungs_nr !~~ '%-S'::text)
UNION ALL
 SELECT 'kanzlei_abrechnungen'::text AS quelle_tabelle,
    k.id AS quelle_id,
    'kanzlei'::text AS partner_typ,
    k.kanzlei_id AS partner_id,
    kz.name AS partner_name,
    'forderung'::text AS richtung,
    'rechnung'::text AS dokument_typ,
    k.rechnungsnummer AS referenz_nr,
    k.endbetrag_netto AS betrag_netto,
    NULL::numeric AS ust_satz,
    k.mwst_betrag AS ust_betrag,
    k.endbetrag_brutto AS betrag_brutto,
    true AS ust_status_bekannt,
        CASE
            WHEN k.status = 'bezahlt'::text THEN 'erledigt'::text
            WHEN k.fehlgeschlagen_am IS NOT NULL THEN 'fehlgeschlagen'::text
            WHEN k.faelligkeitsdatum IS NOT NULL AND k.faelligkeitsdatum < CURRENT_DATE AND k.bezahlt_am IS NULL THEN 'faellig'::text
            ELSE 'offen'::text
        END AS status_norm,
    k.status AS status_roh,
    k.versendet_am AS datum,
    k.faelligkeitsdatum AS faellig_am,
    k.bezahlt_am AS erledigt_am,
    NULL::uuid AS claim_id,
    NULL::uuid AS fall_id
   FROM kanzlei_abrechnungen k
     LEFT JOIN kanzleien kz ON kz.id = k.kanzlei_id
UNION ALL
 SELECT 'sv_onboarding_rechnungen'::text AS quelle_tabelle,
    o.id AS quelle_id,
    'sv'::text AS partner_typ,
    o.sv_id AS partner_id,
    NULL::text AS partner_name,
    'forderung'::text AS richtung,
    'onboarding'::text AS dokument_typ,
    o.rechnungs_nr AS referenz_nr,
    o.netto_cent::numeric / 100.0 AS betrag_netto,
    o.ust_satz_pct AS ust_satz,
    o.ust_cent::numeric / 100.0 AS ust_betrag,
    o.brutto_cent::numeric / 100.0 AS betrag_brutto,
    true AS ust_status_bekannt,
        CASE
            WHEN o.stripe_payment_intent_id IS NOT NULL THEN 'erledigt'::text
            WHEN o.versendet_am IS NOT NULL THEN 'offen'::text
            ELSE 'entwurf'::text
        END AS status_norm,
    NULL::text AS status_roh,
    o.rechnungs_datum::timestamp with time zone AS datum,
    NULL::date AS faellig_am,
    o.versendet_am AS erledigt_am,
    NULL::uuid AS claim_id,
    NULL::uuid AS fall_id
   FROM sv_onboarding_rechnungen o
UNION ALL
 SELECT 'partner_provisionen'::text AS quelle_tabelle,
    pp.id AS quelle_id,
    'makler'::text AS partner_typ,
    pp.partner_id AS partner_id,
    m.firma AS partner_name,
    'auszahlung'::text AS richtung,
    'provision'::text AS dokument_typ,
    NULL::text AS referenz_nr,
    pp.betrag_netto_eur AS betrag_netto,
    COALESCE(pp.ust_satz,
        CASE
            WHEN m.ist_kleinunternehmer THEN 0
            WHEN m.ist_kleinunternehmer IS FALSE THEN 19
            ELSE NULL::integer
        END::numeric) AS ust_satz,
    COALESCE(pp.ust_betrag, round(pp.betrag_netto_eur *
        CASE
            WHEN m.ist_kleinunternehmer THEN 0::numeric
            WHEN m.ist_kleinunternehmer IS FALSE THEN 0.19
            ELSE NULL::numeric
        END, 2)) AS ust_betrag,
    COALESCE(pp.betrag_brutto, round(pp.betrag_netto_eur *
        CASE
            WHEN m.ist_kleinunternehmer THEN 1::numeric
            WHEN m.ist_kleinunternehmer IS FALSE THEN 1.19
            ELSE NULL::numeric
        END, 2)) AS betrag_brutto,
    pp.ust_satz IS NOT NULL OR m.ist_kleinunternehmer IS NOT NULL AS ust_status_bekannt,
        CASE
            WHEN pp.status = 'storniert'::text THEN 'storniert'::text
            WHEN pp.status = 'freigegeben'::text AND pp.abrechnung_id IS NOT NULL THEN 'erledigt'::text
            WHEN pp.status = 'freigegeben'::text THEN 'freigegeben'::text
            WHEN pp.status = 'pending'::text THEN 'gehalten'::text
            ELSE pp.status
        END AS status_norm,
    pp.status AS status_roh,
    pp.erstellt_am AS datum,
    NULL::date AS faellig_am,
        CASE
            WHEN pp.abrechnung_id IS NOT NULL THEN pp.erstellt_am
            ELSE pp.storniert_am
        END AS erledigt_am,
    pp.claim_id,
    pp.fall_id
   FROM partner_provisionen pp
     LEFT JOIN makler m ON m.id = pp.partner_id
  WHERE pp.partner_typ = 'makler'::text
UNION ALL
 SELECT 'partner_provisionen'::text AS quelle_tabelle,
    pp.id AS quelle_id,
    'werkstatt'::text AS partner_typ,
    pp.partner_id AS partner_id,
    w.name AS partner_name,
    'auszahlung'::text AS richtung,
    'provision'::text AS dokument_typ,
    NULL::text AS referenz_nr,
    pp.betrag_netto_eur AS betrag_netto,
    COALESCE(pp.ust_satz,
        CASE
            WHEN w.ist_kleinunternehmer THEN 0
            WHEN w.ist_kleinunternehmer IS FALSE THEN 19
            ELSE NULL::integer
        END::numeric) AS ust_satz,
    COALESCE(pp.ust_betrag, round(pp.betrag_netto_eur *
        CASE
            WHEN w.ist_kleinunternehmer THEN 0::numeric
            WHEN w.ist_kleinunternehmer IS FALSE THEN 0.19
            ELSE NULL::numeric
        END, 2)) AS ust_betrag,
    COALESCE(pp.betrag_brutto, round(pp.betrag_netto_eur *
        CASE
            WHEN w.ist_kleinunternehmer THEN 1::numeric
            WHEN w.ist_kleinunternehmer IS FALSE THEN 1.19
            ELSE NULL::numeric
        END, 2)) AS betrag_brutto,
    pp.ust_satz IS NOT NULL OR w.ist_kleinunternehmer IS NOT NULL AS ust_status_bekannt,
        CASE
            WHEN pp.status = 'storniert'::text THEN 'storniert'::text
            WHEN pp.ausgezahlt_am IS NOT NULL THEN 'erledigt'::text
            WHEN pp.status = 'freigegeben'::text THEN 'freigegeben'::text
            WHEN pp.status = 'pending'::text THEN 'gehalten'::text
            ELSE pp.status
        END AS status_norm,
    pp.status AS status_roh,
    pp.erstellt_am AS datum,
    NULL::date AS faellig_am,
    COALESCE(pp.ausgezahlt_am, pp.storniert_am) AS erledigt_am,
    pp.claim_id,
    pp.fall_id
   FROM partner_provisionen pp
     LEFT JOIN werkstaetten w ON w.id = pp.partner_id
  WHERE pp.partner_typ = 'werkstatt'::text
UNION ALL
 SELECT 'provisionen_maik'::text AS quelle_tabelle,
    pm.id AS quelle_id,
    'marketing'::text AS partner_typ,
    COALESCE(pm.marketing_partner_id, ( SELECT marketing_partner.id
           FROM marketing_partner
          ORDER BY marketing_partner.erstellt_am
         LIMIT 1)) AS partner_id,
    mkp.name AS partner_name,
    'auszahlung'::text AS richtung,
    'provision'::text AS dokument_typ,
    NULL::text AS referenz_nr,
    pm.netto_provision AS betrag_netto,
    COALESCE(pm.ust_satz,
        CASE
            WHEN mkp.ist_kleinunternehmer THEN 0
            WHEN mkp.ist_kleinunternehmer IS FALSE THEN 19
            ELSE NULL::integer
        END::numeric) AS ust_satz,
    COALESCE(pm.ust_betrag, round(pm.netto_provision *
        CASE
            WHEN mkp.ist_kleinunternehmer THEN 0::numeric
            WHEN mkp.ist_kleinunternehmer IS FALSE THEN 0.19
            ELSE NULL::numeric
        END, 2)) AS ust_betrag,
    COALESCE(pm.betrag_brutto, round(pm.netto_provision *
        CASE
            WHEN mkp.ist_kleinunternehmer THEN 1::numeric
            WHEN mkp.ist_kleinunternehmer IS FALSE THEN 1.19
            ELSE NULL::numeric
        END, 2)) AS betrag_brutto,
    pm.ust_satz IS NOT NULL OR mkp.ist_kleinunternehmer IS NOT NULL AS ust_status_bekannt,
        CASE
            WHEN pm.status = 'reversed'::text THEN 'storniert'::text
            WHEN pm.status = 'paid'::text THEN 'erledigt'::text
            WHEN pm.status = 'confirmed'::text THEN 'freigegeben'::text
            WHEN pm.status = 'pending'::text THEN 'gehalten'::text
            ELSE pm.status
        END AS status_norm,
    pm.status AS status_roh,
    COALESCE(pm.paid_at, (pm.monat || '-01'::text)::timestamp with time zone) AS datum,
    NULL::date AS faellig_am,
    pm.paid_at AS erledigt_am,
    NULL::uuid AS claim_id,
    NULL::uuid AS fall_id
   FROM provisionen_maik pm
     LEFT JOIN marketing_partner mkp ON mkp.id = COALESCE(pm.marketing_partner_id, ( SELECT marketing_partner.id
           FROM marketing_partner
          ORDER BY marketing_partner.erstellt_am
         LIMIT 1))
UNION ALL
 SELECT 'partner_staffel_bonus'::text AS quelle_tabelle,
    pp.id AS quelle_id,
    'makler'::text AS partner_typ,
    pp.partner_id AS partner_id,
    m.firma AS partner_name,
    'auszahlung'::text AS richtung,
    'bonus'::text AS dokument_typ,
    NULL::text AS referenz_nr,
    pp.bonus_betrag_netto AS betrag_netto,
    COALESCE(pp.ust_satz,
        CASE
            WHEN m.ist_kleinunternehmer THEN 0
            WHEN m.ist_kleinunternehmer IS FALSE THEN 19
            ELSE NULL::integer
        END::numeric) AS ust_satz,
    COALESCE(pp.ust_betrag, round(pp.bonus_betrag_netto *
        CASE
            WHEN m.ist_kleinunternehmer THEN 0::numeric
            WHEN m.ist_kleinunternehmer IS FALSE THEN 0.19
            ELSE NULL::numeric
        END, 2)) AS ust_betrag,
    COALESCE(pp.betrag_brutto, round(pp.bonus_betrag_netto *
        CASE
            WHEN m.ist_kleinunternehmer THEN 1::numeric
            WHEN m.ist_kleinunternehmer IS FALSE THEN 1.19
            ELSE NULL::numeric
        END, 2)) AS betrag_brutto,
    pp.ust_satz IS NOT NULL OR m.ist_kleinunternehmer IS NOT NULL AS ust_status_bekannt,
        CASE
            WHEN pp.status = 'ausgezahlt'::text THEN 'erledigt'::text
            WHEN pp.status = 'freigegeben'::text THEN 'freigegeben'::text
            ELSE pp.status
        END AS status_norm,
    pp.status AS status_roh,
    pp.erstellt_am AS datum,
    NULL::date AS faellig_am,
    NULL::timestamp with time zone AS erledigt_am,
    NULL::uuid AS claim_id,
    NULL::uuid AS fall_id
   FROM partner_staffel_bonus pp
     LEFT JOIN makler m ON m.id = pp.partner_id
  WHERE pp.partner_typ = 'makler'::text
UNION ALL
 SELECT 'partner_staffel_bonus'::text AS quelle_tabelle,
    pp.id AS quelle_id,
    'werkstatt'::text AS partner_typ,
    pp.partner_id AS partner_id,
    w.name AS partner_name,
    'auszahlung'::text AS richtung,
    'bonus'::text AS dokument_typ,
    NULL::text AS referenz_nr,
    pp.bonus_betrag_netto AS betrag_netto,
    COALESCE(pp.ust_satz,
        CASE
            WHEN w.ist_kleinunternehmer THEN 0
            WHEN w.ist_kleinunternehmer IS FALSE THEN 19
            ELSE NULL::integer
        END::numeric) AS ust_satz,
    COALESCE(pp.ust_betrag, round(pp.bonus_betrag_netto *
        CASE
            WHEN w.ist_kleinunternehmer THEN 0::numeric
            WHEN w.ist_kleinunternehmer IS FALSE THEN 0.19
            ELSE NULL::numeric
        END, 2)) AS ust_betrag,
    COALESCE(pp.betrag_brutto, round(pp.bonus_betrag_netto *
        CASE
            WHEN w.ist_kleinunternehmer THEN 1::numeric
            WHEN w.ist_kleinunternehmer IS FALSE THEN 1.19
            ELSE NULL::numeric
        END, 2)) AS betrag_brutto,
    pp.ust_satz IS NOT NULL OR w.ist_kleinunternehmer IS NOT NULL AS ust_status_bekannt,
        CASE
            WHEN pp.status = 'ausgezahlt'::text THEN 'erledigt'::text
            WHEN pp.status = 'freigegeben'::text THEN 'freigegeben'::text
            ELSE pp.status
        END AS status_norm,
    pp.status AS status_roh,
    pp.erstellt_am AS datum,
    NULL::date AS faellig_am,
    NULL::timestamp with time zone AS erledigt_am,
    NULL::uuid AS claim_id,
    NULL::uuid AS fall_id
   FROM partner_staffel_bonus pp
     LEFT JOIN werkstaetten w ON w.id = pp.partner_id
  WHERE pp.partner_typ = 'werkstatt'::text;
```

> **Branch-Reihenfolge:** identisch zur BEFORE (sv → kanzlei → onboarding → makler-prov → werkstatt-prov → maik → makler-bonus → werkstatt-bonus). `UNION ALL` ist ungeordnet für die Signatur, aber ich behalte die Reihenfolge, damit ein Diff der Viewdef minimal ist. `CREATE OR REPLACE VIEW` erlaubt Spalten-Ergänzung am Ende, NICHT Umordnung/Umbenennung — hier ändert sich weder Spaltenname noch -reihenfolge noch -typ, also ist `OR REPLACE` zulässig (kein `DROP … CASCADE` nötig; alle Consumer bleiben verbunden).

**Verify (execute_sql, READ) — die Before==After-Signatur-Assertion:**
1. Signatur erneut ziehen (die Query aus P2-0 Schritt 2) → muss **Byte-für-Byte identisch** zur P2-0-Tabelle sein (20 Spalten, gleiche Namen/Typen/Positionen). Falls eine Spalte fehlt/wandert → Payload falsch, NICHT committen.
2. `quelle_tabelle`-Werteraum prüfen:
   ```sql
   SELECT DISTINCT quelle_tabelle FROM v_partner_billing ORDER BY 1;
   ```
   Erwartung: `abrechnungen`, `kanzlei_abrechnungen`, `partner_provisionen`, `partner_staffel_bonus`, `provisionen_maik`, `sv_onboarding_rechnungen` — **KEIN** `makler_provisionen`/`werkstatt_provisionen`/`*_staffel_bonus` mehr. (Provisions-/Bonus-Zeilen sind 0, bis Phase-3-Backfill — die DISTINCT-Werte erscheinen erst, wenn `partner_provisionen` Zeilen hat; im kombinierten Deploy nach dem ersten echten Claim. Für den Signatur-Beweis reicht Schritt 1.)
3. Ein Smoke-Select mit `LIMIT 0` gegen den View, um Parse-/Typ-Fehler früh zu fangen: `SELECT * FROM v_partner_billing LIMIT 0;` → 20 Spalten, kein Fehler.

**Regel-2-Abschluss:** `list_migrations` → recorded Version `<V>` → File `supabase/migrations/<V>_v_partner_billing_union.sql` (Inhalt == payload) committen.

**Commit:** `feat(provision-unifikation): v_partner_billing liest partner_provisionen/partner_staffel_bonus (Union)`.
**Audit:** Build — n/a (DDL); tsc unberührt (der View ist ungetypt gelesen, `partner-billing.ts:1` castet auf `PartnerBillingRow`). Spec — 4 Branches transformiert, 4 verbatim; Signatur Before==After asserted. Inkonsistenz — Spaltennamen/Typen 1:1; nur Quell-Tabellen + 2 String-Literale geändert. Regression — Consumer (`getPartnerBilling`) liest per `select('*')` → keine Spalten-Abhängigkeit gebrochen; `partner_name`/USt-CASE identisch.

---

## Task P2-3 — `provision-status.ts` META 5→3 (MONEY-KRITISCH, härtester Task)

**Ziel:** Die 5 META-Einträge (`makler_provisionen`, `werkstatt_provisionen`, `provisionen_maik`, `makler_staffel_bonus`, `werkstatt_staffel_bonus`) auf 3 kollabieren (`partner_provisionen`, `partner_staffel_bonus`, `provisionen_maik`). Nach P2-2 liefert `v_partner_billing.quelle_tabelle` nur noch diese 3 Werte → die Caller (`gebeProvisionFrei`/`zahleProvisionAus`/`storniere` in `partner-billing-actions.ts`) rufen `freigebenProvision`/`auszahlenProvision`/`storniereProvision` **nur** noch mit diesen 3 Keys. Ein einzelner `'partner_provisionen'`-Key trägt jetzt BEIDE Partner-Typen — unterschieden nur durch die Row-Spalte `partner_typ`.

### Der Kern — was pro Feld passiert (mit Contradiction A)

Die aktuelle `LedgerMeta` hat u.a. `partner` (Embed-Tabellenname), `fk` (Partner-FK-Spalte), `partnerTyp`, `leistungText`, `stornoCol`, `paidCol`. Für `partner_provisionen` unterscheiden sich davon **je nach `partner_typ`**: `partner` (makler vs werkstaetten), `fk` (im ALT-Schema makler_id vs werkstatt_id — aber im Union-Schema ist es für BEIDE `partner_id`), `partnerTyp`, `paidCol` (makler hatte KEIN `paidCol`, werkstatt hatte `ausgezahlt_am`). `leistungText` ist für beide `'Vermittlungsprovision'` (identisch), `stornoCol`/`grundCol` für beide `storniert_am`/`storno_grund` (identisch), `leistungDatumCol` für beide `trigger_at` (identisch).

**Mapping-Tabelle (ALT-META → kollabierte Union-Auflösung):**

| Feld | makler_provisionen (alt) | werkstatt_provisionen (alt) | `partner_provisionen` (kollabiert) |
|---|---|---|---|
| `betrag` | `betrag_netto_eur` | `betrag_netto_eur` | **statisch** `'betrag_netto_eur'` (identisch) |
| `fk` | `makler_id` | `werkstatt_id` | **statisch** `'partner_id'` (Union-Spalte, für BEIDE) |
| `partner` (Embed) | `makler` | `werkstaetten` | **entfällt** — kein Embed mehr (Contradiction A); Steuerdaten via separatem `partner_typ`-Branch-Lookup |
| `partnerFlag` | `ist_kleinunternehmer` | `ist_kleinunternehmer` | **statisch** `'ist_kleinunternehmer'` (identisch) |
| `paidStatus` | `ausgezahlt` | `ausgezahlt` | **statisch** `'ausgezahlt'` |
| `paidCol` | — (keine) | `ausgezahlt_am` | **statisch** `'ausgezahlt_am'` (s. Hinweis ↓) |
| `releaseStatus` | `freigegeben` | `freigegeben` | **statisch** `'freigegeben'` |
| `stornoStatus` | `storniert` | `storniert` | **statisch** `'storniert'` |
| `stornoCol` | `storniert_am` | `storniert_am` | **statisch** `'storniert_am'` |
| `grundCol` | `storno_grund` | `storno_grund` | **statisch** `'storno_grund'` |
| `partnerTyp` | `makler` | `werkstatt` | **runtime aus Row** `row.partner_typ` |
| `leistungText` | `Vermittlungsprovision` | `Vermittlungsprovision` | **statisch** `'Vermittlungsprovision'` |
| `leistungDatumCol` | `trigger_at` | `trigger_at` | **statisch** `'trigger_at'` |

> **Hinweis `paidCol='ausgezahlt_am'` für makler:** Die alte makler-META hatte KEIN `paidCol` (die Auszahlung setzte nur `status='ausgezahlt'`). `partner_provisionen` HAT die Spalte `ausgezahlt_am` (aus der werkstatt-Herkunft) — sie auf makler-Rows mitzuschreiben ist **verhaltensneutral-plus**: der View liest für makler den `erledigt_am` aus `abrechnung_id IS NOT NULL ? erstellt_am : storniert_am` (NICHT aus `ausgezahlt_am`), also ändert das Setzen von `ausgezahlt_am` die makler-View-Ausgabe NICHT. Für werkstatt liest der View `ausgezahlt_am` → Status 'erledigt', wie bisher. **Also: `paidCol='ausgezahlt_am'` einheitlich setzen ist safe und macht den Kollaps möglich.** (Die Alternative — `paidCol` per `partner_typ` branchen — ist unnötig, weil das Extra-Schreiben auf makler folgenlos ist. Ich wähle die statische Variante = weniger Runtime-Branch = weniger Bug-Fläche.)

**→ Von den 13 Feldern sind nur ZWEI nicht-statisch:** `partner` (Embed — muss ganz weg, Contradiction A) und `partnerTyp` (runtime aus `row.partner_typ`). Alles andere kollabiert zu identischen statischen Werten. Das macht den Kollaps beherrschbar.

### Die konkrete Umsetzung — `partnerTyp` + Steuerdaten aus der Row statt aus META/Embed

**Neue `LedgerMeta` + `META` (vollständig, before/after):**

**VORHER** (`provision-status.ts:10-113`) — 5 `PROVISION_TABELLEN`, 5 META-Einträge, `LedgerMeta` mit `partner`+`fk` (Embed-basiert). (Siehe die gelesene Datei; nicht wiederholt.)

**NACHHER:**
```typescript
export const PROVISION_TABELLEN = [
  'partner_provisionen',
  'partner_staffel_bonus',
  'provisionen_maik',
] as const

export type ProvisionTabelle = (typeof PROVISION_TABELLEN)[number]

// Partner-Steuerdaten-Tabelle je partner_typ (ersetzt den früheren PostgREST-Embed:
// partner_provisionen hat KEINE FK auf makler/werkstaetten -> Embed nicht möglich,
// separater Lookup nötig). marketing = provisionen_maik.
const PARTNER_STEUER_TABELLE: Record<string, string> = {
  makler: 'makler',
  werkstatt: 'werkstaetten',
  marketing: 'marketing_partner',
}

type LedgerMeta = {
  betrag: string
  /** Partner-FK-Spalte AUF der Ledger-Tabelle (Union: 'partner_id'; maik: 'marketing_partner_id'). */
  fk: string
  partnerFlag: string
  paidStatus: string
  paidCol?: string
  releaseStatus: string
  stornoStatus: string
  stornoCol?: string
  grundCol?: string
  /**
   * partner_typ: statisch für provisionen_maik ('marketing'); für die Union-Tabellen
   * NULL = "aus der Row-Spalte partner_typ lesen" (ein partner_provisionen-Eintrag trägt
   * makler UND werkstatt).
   */
  partnerTyp: 'makler' | 'werkstatt' | 'marketing' | null
  leistungText: string
  leistungDatumCol: string
}

const META: Record<ProvisionTabelle, LedgerMeta> = {
  partner_provisionen: {
    betrag: 'betrag_netto_eur',
    fk: 'partner_id',
    partnerFlag: 'ist_kleinunternehmer',
    paidStatus: 'ausgezahlt',
    paidCol: 'ausgezahlt_am',
    releaseStatus: 'freigegeben',
    stornoStatus: 'storniert',
    stornoCol: 'storniert_am',
    grundCol: 'storno_grund',
    partnerTyp: null, // runtime aus row.partner_typ
    leistungText: 'Vermittlungsprovision',
    leistungDatumCol: 'trigger_at',
  },
  partner_staffel_bonus: {
    betrag: 'bonus_betrag_netto',
    fk: 'partner_id',
    partnerFlag: 'ist_kleinunternehmer',
    paidStatus: 'ausgezahlt',
    // kein paidCol — partner_staffel_bonus hat keine ausgezahlt_am-Spalte
    releaseStatus: 'freigegeben',
    stornoStatus: 'storniert',
    // kein stornoCol/grundCol — partner_staffel_bonus hat keine storno-Timestamp/Grund-Spalten
    partnerTyp: null, // runtime aus row.partner_typ
    leistungText: 'Staffel-Bonus',
    leistungDatumCol: 'erstellt_am',
  },
  provisionen_maik: {
    betrag: 'netto_provision',
    fk: 'marketing_partner_id',
    partnerFlag: 'ist_kleinunternehmer',
    paidStatus: 'paid',
    paidCol: 'paid_at',
    releaseStatus: 'confirmed',
    stornoStatus: 'reversed',
    // kein stornoCol — provisionen_maik hat kein storniert_am-Äquivalent
    grundCol: 'reversed_grund',
    partnerTyp: 'marketing',
    leistungText: 'Vermittlungsprovision',
    leistungDatumCol: 'created_at',
  },
} as const
```

> **`freigebenProvision` + `storniereProvision`** ändern sich **fast nicht** — sie nutzen `meta.releaseStatus`/`meta.stornoStatus`/`meta.stornoCol`/`meta.grundCol`, alle statisch. Der einzige Punkt: `storniereProvision`'s Gutschrift-Storno-Lookup nutzt `.eq('ledger_tabelle', tabelle)` — `tabelle` ist jetzt `'partner_provisionen'`, was zum in P2-7 auf `LEDGER_TABELLEN.PARTNER_PROVISIONEN` gesetzten Wert passt (dieselbe Konstante end-to-end). **Kein Row-`partner_typ` nötig in Storno/Freigabe** — sie schreiben nur Status/Timestamps auf die Ledger-Row selbst; die Gutschrift-Erstellung (die den Partner braucht) passiert nur in `auszahlenProvision`.

**`auszahlenProvision` — der eigentliche Umbau (Contradiction A):** Der Steuerdaten-Read wechselt vom Embed auf einen separaten `partner_typ`-Lookup.

**VORHER** (`provision-status.ts:214-244`, der Read-Block):
```typescript
export async function auszahlenProvision(
  db: SupabaseClient<any>,
  tabelle: ProvisionTabelle,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const meta = META[tabelle]

  // Step 1 — Lesen: netto + partner_id + ist_kleinunternehmer + leistungDatumCol
  const selectStr = `${meta.betrag}, ${meta.fk}, ${meta.partner}(${meta.partnerFlag}), ${meta.leistungDatumCol}`
  const { data, error: readError } = await db
    .from(tabelle)
    .select(selectStr)
    .eq('id', id)
    .single()

  if (readError) return { ok: false, error: readError.message }

  const nettoEur: number = (data as any)[meta.betrag]
  const partnerId: string | null | undefined = (data as any)[meta.fk]
  if (!partnerId) return { ok: false, error: 'Partner-Zuordnung fehlt' }

  // Supabase select('a(b)') liefert je nach Cardinality Array oder Objekt -- immer normalisieren.
  const partnerRaw = (data as any)[meta.partner]
  const partner = Array.isArray(partnerRaw) ? partnerRaw[0] : partnerRaw
  const istKleinunternehmer: boolean | null = partner?.[meta.partnerFlag] ?? null

  // Leistungsdatum je Ledger: trigger_at / created_at / erstellt_am
  const leistungsDatum: string | null = (data as any)[meta.leistungDatumCol] ?? null

  const ust = computeProvisionUst(nettoEur, istKleinunternehmer)
  ...
```

**NACHHER:**
```typescript
export async function auszahlenProvision(
  db: SupabaseClient<any>,
  tabelle: ProvisionTabelle,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const meta = META[tabelle]

  // Step 1a — Ledger-Row lesen: netto + partner_id + leistungDatumCol + (bei Union) partner_typ.
  // KEIN PostgREST-Embed mehr: partner_provisionen/partner_staffel_bonus haben KEINE FK auf
  // makler/werkstaetten (partner_id ist polymorph) -> Steuerdaten via separatem Lookup (Step 1b).
  const partnerTypCol = meta.partnerTyp === null ? ', partner_typ' : ''
  const selectStr = `${meta.betrag}, ${meta.fk}, ${meta.leistungDatumCol}${partnerTypCol}`
  const { data, error: readError } = await db
    .from(tabelle)
    .select(selectStr)
    .eq('id', id)
    .single()

  if (readError) return { ok: false, error: readError.message }

  const nettoEur: number = (data as any)[meta.betrag]
  const partnerId: string | null | undefined = (data as any)[meta.fk]
  if (!partnerId) return { ok: false, error: 'Partner-Zuordnung fehlt' }

  // partner_typ: statisch aus META (maik) ODER aus der Row-Spalte (Union-Tabellen).
  const partnerTyp = (meta.partnerTyp ?? (data as any).partner_typ) as
    | 'makler'
    | 'werkstatt'
    | 'marketing'
  if (!partnerTyp) return { ok: false, error: 'Partner-Typ fehlt' }

  // Step 1b — Steuerdaten (ist_kleinunternehmer) via separatem, partner_typ-verzweigtem Lookup.
  const steuerTabelle = PARTNER_STEUER_TABELLE[partnerTyp]
  const { data: partner } = await db
    .from(steuerTabelle)
    .select(meta.partnerFlag)
    .eq('id', partnerId)
    .single()
  const istKleinunternehmer: boolean | null = (partner as any)?.[meta.partnerFlag] ?? null

  // Leistungsdatum je Ledger: trigger_at / created_at / erstellt_am
  const leistungsDatum: string | null = (data as any)[meta.leistungDatumCol] ?? null

  const ust = computeProvisionUst(nettoEur, istKleinunternehmer)
  ...
```

Und der `erstellePartnerGutschrift`-Aufruf (`:291-304`) nutzt jetzt `partnerTyp` (statt `meta.partnerTyp`):
```typescript
    // VORHER: partnerTyp: meta.partnerTyp,
    // NACHHER:
    const g = await erstellePartnerGutschrift(db, {
      tabelle,
      ledgerId: id,
      partnerTyp,          // <-- runtime-aufgelöst (Row bei Union, META bei maik)
      partnerId,
      betraege: { ... },   // unverändert
      leistungText: meta.leistungText,
      leistungsDatum,
    })
```

> **Money-Path-Erhalt (kritisch):** Der USt-Pfad (`computeProvisionUst(nettoEur, istKleinunternehmer)`), der Freeze (`ust_satz`/`ust_betrag`/`betrag_brutto`), der Idempotenz-Precheck (`.eq('ledger_tabelle', tabelle).eq('ledger_id', id).eq('typ','gutschrift')`), der storniert-Block, die PDF-Generierung, das finale Status-Update — **alles unverändert**. Der EINZIGE Change ist WIE `istKleinunternehmer` + `partnerTyp` gelesen werden (separater Lookup + Row-Spalte statt Embed + META). Betrag/USt-Codepfade bleiben Byte-für-Byte. **`istKleinunternehmer` kommt aus DERSELBEN Partner-Tabelle wie vorher** (`makler`/`werkstaetten`/`marketing_partner`) — nur nicht mehr per Embed, sondern per Direkt-Select. Steuerdaten sind also identisch.

### Warum die alten Keys entfernt werden (Entscheidung + Begründung)

**`makler_provisionen`/`werkstatt_provisionen`/`makler_staffel_bonus`/`werkstatt_staffel_bonus` werden aus `PROVISION_TABELLEN` + META ENTFERNT.** Begründung:
- Nach P2-2 emittiert `v_partner_billing.quelle_tabelle` diese 4 Werte NICHT mehr → kein Caller reicht sie an `gebeProvisionFrei`/`zahleProvisionAus`/`storniere` (die einzigen Einstiegspunkte, `partner-billing-actions.ts:85/106/135` guarden via `PROVISION_TABELLEN.includes(quelle)`).
- **In-Flight-Caller-Check:** Grep bestätigt, dass die einzige Quelle des `quelle`-Arguments `row.quelle_tabelle` aus dem View ist (Admin-Drawer). Es gibt keinen Code-Pfad, der `zahleProvisionAus('makler_provisionen', …)` hardcoded ruft. (Verifiziert: die 3 Actions werden nur aus `partner-billing-actions.ts` selbst + dem Admin-Drawer-Client gerufen, immer mit `row.quelle_tabelle`.)
- **Sauberer Schnitt:** 9 Test-Bestands-Zeilen (die nach Phase-3-Backfill in `partner_provisionen` liegen) + 0 Gutschriften → es existiert kein persistenter `ledger_tabelle='makler_provisionen'`-Gutschrift-Wert, der einen Alt-Key im Storno-Lookup bräuchte. (Der eine Test-Fixture-Wert in `partner-gutschrift.test.ts:762` ist ein reiner Mock, kein prod-Zustand — s. P2-7.)
- **Bestands-Payout im Phase-1→3-Fenster:** Die 9 Alt-Zeilen sind nach P2-2 im View unsichtbar (s. P2-0-Hinweis) → sie werden im Fenster ohnehin nicht ausgezahlt (Admin sieht sie nicht). Nach Phase-3-Backfill liegen sie als `partner_provisionen`-Rows vor und werden über den `'partner_provisionen'`-Key ausgezahlt. **Kein Bestands-Payout-Bruch**, weil kein Bestands-Payout im Fenster passiert.

### TDD (die Money-Beweise)

Erweitere `src/lib/finance/provision-status.test.ts`. Die bestehenden `richFakeDb`-Tests nutzen `'makler_provisionen'` als `tabelle` + einen Embed-Row (`makler: {ist_kleinunternehmer}`) — **die müssen auf `'partner_provisionen'` + separaten Steuer-Lookup umgestellt werden.** Der `richFakeDb` braucht eine Erweiterung: er muss jetzt AUCH `from('makler')`/`from('werkstaetten')` (Steuer-Lookup) bedienen.

1. **RED/GREEN — `richFakeDb` erweitern** (die Steuer-Tabelle als dritten Dispatch-Zweig):
   ```typescript
   // im richFakeDb from()-Dispatcher, VOR dem "Ledger table"-else:
   if (table === 'makler' || table === 'werkstaetten' || table === 'marketing_partner') {
     return {
       select: (_str?: string) => ({
         eq: (_c: string, _v: string) => ({
           single: () => Promise.resolve({ data: opts.steuerRow ?? null, error: null }),
         }),
       }),
     }
   }
   ```
   und `RichFakeDbOptions` um `steuerRow?: Record<string, unknown> | null` erweitern. Die Ledger-Row trägt jetzt `partner_id` + `partner_typ` statt `makler_id` + Embed.

2. **RED — neue Money-Beweis-Tests** (makler UND werkstatt über denselben `'partner_provisionen'`-Key):
   ```typescript
   it('(P2-3-makler) partner_provisionen + partner_typ=makler → Steuer-Lookup makler, betrag+storno korrekt', async () => {
     vi.mocked(erstellePartnerGutschrift).mockResolvedValue({ ok: true, gutschriftId: 'gs-1', nummer: 'CMNDO-GS-2026-00001' })
     vi.mocked(generateAndUploadPartnerGutschriftPdf).mockResolvedValue({ ok: true, pdfPath: 'p.pdf' })
     const db = richFakeDb({
       ledgerRow: { betrag_netto_eur: 100, partner_id: 'makler-1', partner_typ: 'makler', trigger_at: '2026-07-15T10:00:00.000Z' },
       steuerRow: { ist_kleinunternehmer: false },
       gutschriftenRefetchData: CANNED_GUTSCHRIFT_ROW,
     })
     const r = await auszahlenProvision(db, 'partner_provisionen', 'prov-1')
     expect(r.ok).toBe(true)
     // erstellePartnerGutschrift bekam partnerTyp='makler' (aus der Row) + korrekten Betrag
     const arg = vi.mocked(erstellePartnerGutschrift).mock.calls[0][1] as Record<string, unknown>
     expect(arg.partnerTyp).toBe('makler')
     expect(arg.partnerId).toBe('makler-1')
     expect((arg.betraege as any).nettoCent).toBe(10000)
     // USt regelbesteuert (19%): Freeze-Patch
     expect((db._ledgerUpdates[0] as any).ust_satz).toBe(19)
     // Status→ausgezahlt via zweitem Patch
     expect(db._ledgerUpdates.some((p: any) => p.status === 'ausgezahlt')).toBe(true)
   })

   it('(P2-3-werkstatt) partner_provisionen + partner_typ=werkstatt → Steuer-Lookup werkstaetten, Kleinunternehmer 0% USt', async () => {
     vi.mocked(erstellePartnerGutschrift).mockResolvedValue({ ok: true, gutschriftId: 'gs-2', nummer: 'CMNDO-GS-2026-00002' })
     vi.mocked(generateAndUploadPartnerGutschriftPdf).mockResolvedValue({ ok: true, pdfPath: 'p2.pdf' })
     const db = richFakeDb({
       ledgerRow: { betrag_netto_eur: 150, partner_id: 'ws-1', partner_typ: 'werkstatt', trigger_at: '2026-07-16T10:00:00.000Z' },
       steuerRow: { ist_kleinunternehmer: true },  // Kleinunternehmer → 0% USt
       gutschriftenRefetchData: CANNED_GUTSCHRIFT_ROW,
     })
     const r = await auszahlenProvision(db, 'partner_provisionen', 'prov-2')
     expect(r.ok).toBe(true)
     const arg = vi.mocked(erstellePartnerGutschrift).mock.calls[0][1] as Record<string, unknown>
     expect(arg.partnerTyp).toBe('werkstatt')
     expect(arg.partnerId).toBe('ws-1')
     // Kleinunternehmer: ust_satz 0, brutto == netto
     expect((db._ledgerUpdates[0] as any).ust_satz).toBe(0)
     expect((db._ledgerUpdates[0] as any).betrag_brutto).toBe(150)
   })

   it('(P2-3-storno-makler) storniereProvision partner_provisionen schreibt storniert_am + storno_grund', async () => {
     const db = stornoFakeDb({ origData: null })  // keine Gutschrift → nur Ledger-Storno
     const r = await storniereProvision(db, 'partner_provisionen', 'led-1', 'Testgrund')
     expect(r.ok).toBe(true)
     const patch = db._ledgerUpdates[0] as Record<string, unknown>
     expect(patch.status).toBe('storniert')
     expect(patch.storniert_am).toBeDefined()
     expect(patch.storno_grund).toBe('Testgrund')
   })

   it('(P2-3-bonus-storno) partner_staffel_bonus storniert schreibt NUR status (kein storniert_am)', async () => {
     const db = stornoFakeDb({ origData: null })
     const r = await storniereProvision(db, 'partner_staffel_bonus', 'b-1', 'Grund')
     expect(r.ok).toBe(true)
     const patch = db._ledgerUpdates[0] as Record<string, unknown>
     expect(patch.status).toBe('storniert')
     expect(patch.storniert_am).toBeUndefined()  // partner_staffel_bonus hat keine storniert_am-Spalte
   })
   ```
   > **Bestehende Tests migrieren:** die vorhandenen `auszahlenProvision`-Tests (`:172-461`) nutzen `'makler_provisionen'` + Embed-Row (`makler: {…}`). Sie werden auf `'partner_provisionen'` + `partner_typ:'makler'` + `steuerRow` umgestellt (der Embed-Key `makler:{…}` entfällt aus `ledgerRow`, dafür `partner_id`+`partner_typ` in `ledgerRow` und `ist_kleinunternehmer` in `steuerRow`). Die `provisionen_maik`-Tests (`:381-404`) bleiben, aber Row-Key `marketing_partner_id` + `steuerRow:{ist_kleinunternehmer:true}` statt Embed `marketing_partner:{…}`. Die `storniereProvision`-Tests `(a)/(c)` (`:465-490`) migrieren `makler_staffel_bonus`→`partner_staffel_bonus`, `provisionen_maik` bleibt. Der Storno-Wiring-Block `:495-546` migriert `makler_provisionen`→`partner_provisionen`.
3. **Command:** `NODE_OPTIONS=--max-old-space-size=8192 npx vitest run src/lib/finance/provision-status.test.ts` → nach Migration + GREEN alle grün. Dann `NODE_OPTIONS=--max-old-space-size=8192 npx vitest run src/lib/finance` (die anderen Finance-Tests dürfen nicht brechen).
4. **Commit:** `feat(provision-unifikation): provision-status META 5→3 (partner_typ-Runtime-Branch, Steuer-Lookup statt Embed)`.

**Audit:** Build — tsc(8GB) grün. Spec — alle 13 META-Felder gemappt (11 statisch identisch, `partner`→separater Lookup, `partnerTyp`→Row); USt/Freeze/Idempotenz/Storno/PDF-Codepfade unverändert. Inkonsistenz — `PROVISION_TABELLEN` von 5 auf 3, Contract mit dem P2-2-View (der nur diese 3 emittiert); alte Keys entfernt (in-flight-Caller-Grep = keiner). Regression — `partner-billing-actions.ts`-Guard nutzt `PROVISION_TABELLEN` → passt zum neuen View; `erstellePartnerGutschrift`-Signatur unverändert (bekommt `partnerTyp` wie bisher, nur andere Quelle).

---

## Task P2-4 — makler-Reader → `partner_provisionen` (+ FK-Migration für Embeds) (Contradiction B)

**Datei(en):** `src/lib/makler/queries.ts` + eine apply_migration (FK-Anlage).

### Teil 1 — DDL: EINE FK für die Embeds — `claim_id → bridge(claim_id)`, NICHT `fall_id` (Contradiction B, KORRIGIERT)

> **🔴 KORREKTUR gegen den ersten Draft (prod-verifiziert 2026-07-08 — der Draft war ein Claim-Insert-Prod-Breaker):** Der Draft legte `partner_provisionen_fall_id_fkey → faelle_claim_bridge(fall_id)` an. **Das bricht werkstatt-Claim-Inserts.** Grund: der werkstatt-Provisions-Trigger schreibt `fall_id = NEW.id` (die **claim**-id, keine echte fall-id), und nur **21 von 30** prod-Claims haben ihre `claims.id` in `faelle_claim_bridge.fall_id` (die makler/lead-originierten 9 tragen eine echte fall-id ≠ claim-id — `sync_claims_to_bridge` setzt fall_id=claim_id nur wenn noch kein Bridge-Row existiert). Eine tabellenweite `fall_id`-FK (`NOT VALID` erzwingt auf NEUE Rows) würde bei jeder werkstatt-Provision auf einem makler/lead-Claim werfen → AFTER-Trigger-Exception → **Claim-Insert rollt zurück = keine neuen Claims.** Die 7 werkstatt-Test-Rows halten heute nur zufällig (alle auf sync-Path-Claims).

> **Der sichere Ersatz — Embed über `claim_id → bridge(claim_id)`:** Die 3 makler-Embeds hoppen `fall_id → bridge → bridge.claim_id → claims` nur, um an den **Claim** (Kunden-/Lead-Namen, claim_nummer) zu kommen. Die Provision hat aber `claim_id` direkt, und **`faelle_claim_bridge.claim_id` ist UNIQUE** (FK-fähig) und für JEDEN Claim gesetzt (`sync_claims_to_bridge` schreibt claim_id=NEW.id, wird nie geändert). Prod-verifiziert: `claims.id ∈ bridge.claim_id` = **30/30**, 0 orphan werkstatt/makler-Provisions-claim_ids. Also FK `partner_provisionen.claim_id → faelle_claim_bridge(claim_id)` — **sicher für BEIDE Typen** (werkstatt claim_id=claims.id=bridge.claim_id ✓, makler claim_id=bridge.claim_id ✓). Und weil für makler-Rows `provision.claim_id=bridge.claim_id` UND `provision.fall_id=bridge.fall_id` denselben Bridge-Row treffen, liefert der Embed **byte-identische** Daten (inkl. `id:fall_id`) — **die Mapping-Code-Zeilen ändern sich NICHT, nur der FK-Hint-Name.**

**apply_migration (name `partner_provisionen_claim_bridge_fk`) — EINE FK:**
```sql
-- partner_provisionen hatte aus Phase 0 keine FKs (partner_id ist polymorph -> bewusst keiner).
-- Die 3 makler-Portal-Embeds brauchen eine FK auf faelle_claim_bridge, der PostgREST folgen kann.
-- claim_id (NICHT fall_id): werkstatt-Provisionen haben fall_id = claim-id (nicht bridge.fall_id),
-- eine fall_id->bridge-FK braeche werkstatt-Inserts (nur 21/30 Claims haben claims.id in
-- bridge.fall_id). bridge.claim_id ist UNIQUE + fuer jeden Claim gesetzt -> sicher fuer beide Typen.
-- NOT VALID: 0 Bestandszeilen -> nichts zu validieren; neue Rows validieren beim Insert.
ALTER TABLE public.partner_provisionen
  ADD CONSTRAINT partner_provisionen_claim_bridge_fkey
  FOREIGN KEY (claim_id) REFERENCES public.faelle_claim_bridge (claim_id) NOT VALID;
```
> **Ziel-Spalten-Uniqueness:** `faelle_claim_bridge.claim_id` = UNIQUE (`faelle_claim_bridge_claim_id_key`) ✓ → FK-fähig. **Sicherheit gg Prod-Breaker prod-verifiziert:** `claims_in_bridge_claim`=30/30, `wp_claim_orphan`=0, `mp_claim_orphan`=0.
> **KEIN `fall_id`-FK, KEIN `claim_id→claims`-FK, KEIN `lead_id`-FK** angelegt: die 3 Embeds erreichen `claims` + `leads` + `kunde` allesamt ÜBER die Bridge (`bridge.claim_id → claims`, dann `claims.lead_id → leads` / `claims.geschaedigter_user_id → users` — bestehende Claims-FKs, unberührt). Nur die eine Provision→Bridge-Relation fehlt → nur die eine FK. (YAGNI — kein Read embeddet `claims`/`leads` direkt von der Provision.)
> **Warum `NOT VALID`:** 0 Zeilen → nichts zu validieren; für neue Inserts trotzdem erzwungen. **PostgREST erkennt auch `NOT VALID`-FKs für Embeds** (Relation steht im Katalog).

**Verify (READ):**
```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.partner_provisionen'::regclass AND contype='f' ORDER BY conname;
```
Erwartung: GENAU EINE FK — `partner_provisionen_claim_bridge_fkey FOREIGN KEY (claim_id) REFERENCES faelle_claim_bridge(claim_id)` (KEIN fall_id-FK!).
> **⚠ PostgREST-Schema-Cache:** Nach FK-Anlage muss der PostgREST-Schema-Cache neu geladen sein, damit der Embed die Relation findet. `apply_migration` triggert i.d.R. ein `NOTIFY pgrst, 'reload schema'`; falls ein Embed im Smoke `PGRST200` wirft, `NOTIFY pgrst, 'reload schema';` als READ-Query nachschieben (kein DDL). Im kombinierten Deploy ist der Cache bis Phase-4-Smoke längst warm.

**Regel-2:** `list_migrations` → File `supabase/migrations/<V>_partner_provisionen_claim_bridge_fk.sql`.

### Teil 2 — TS: die Reader-Repoints

**Regel je Query:** `.from('makler_provisionen')` → `.from('partner_provisionen')` + **`.eq('partner_typ', 'makler')` ist PFLICHT auf JEDER Query** (auch `count`/`head:true` — service_role/SSR-Client umgeht RLS bei createAdminClient nicht, ABER: makler-`queries.ts` nutzt den auth-aware SSR-Client, und die RLS `pp_partner_read` gated schon auf `partner_typ='makler' AND makler.user_id=auth.uid()`. **Trotzdem `.eq('partner_typ','makler')` explizit setzen** — defense-in-depth + Selbst-Dokumentation + Schutz falls ein Aufruf je über einen Admin-Client läuft). `makler_id` → `partner_id` in Selects/Filtern/zurückgegebenen Shapes. `.from('makler_staffel_bonus')` → `.from('partner_staffel_bonus')` + `.eq('partner_typ','makler')`. Die drei Embed-Hints `!makler_provisionen_fall_id_fkey` → `!partner_provisionen_fall_id_fkey`.

**Die exakten Stellen (Zeilen 2026-07-08 verifiziert):**

| Zeile | Vorher | Nachher |
|---|---|---|
| 395 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 397 | `.eq('makler_id', maklerId)` | `.eq('partner_id', maklerId)` **+ neue Zeile** `.eq('partner_typ', 'makler')` |
| 779 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 781 | `.eq('makler_id', maklerId)` | `.eq('partner_id', maklerId)` **+** `.eq('partner_typ', 'makler')` |
| 784 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 786 | `.eq('makler_id', maklerId)` | `.eq('partner_id', maklerId)` **+** `.eq('partner_typ', 'makler')` |
| 798 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 801 | `fall:faelle_claim_bridge!makler_provisionen_fall_id_fkey(` | `fall:faelle_claim_bridge!partner_provisionen_claim_bridge_fkey(` (nur Hint-Name; Mapping unverändert) |
| 808 | `.eq('makler_id', maklerId)` | `.eq('partner_id', maklerId)` **+** `.eq('partner_typ', 'makler')` |
| 814 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 816 | `.eq('makler_id', maklerId)` | `.eq('partner_id', maklerId)` **+** `.eq('partner_typ', 'makler')` |
| 968 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 970 | `.eq('makler_id', maklerId)` | `.eq('partner_id', maklerId)` **+** `.eq('partner_typ', 'makler')` |
| 973 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 975 | `.eq('makler_id', maklerId)` | `.eq('partner_id', maklerId)` **+** `.eq('partner_typ', 'makler')` |
| 980 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 982 | `.eq('makler_id', maklerId)` | `.eq('partner_id', maklerId)` **+** `.eq('partner_typ', 'makler')` |
| 985 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 990 | `fall:faelle_claim_bridge!makler_provisionen_fall_id_fkey(` | `fall:faelle_claim_bridge!partner_provisionen_claim_bridge_fkey(` (nur Hint-Name; Mapping unverändert) |
| 1000 | `.eq('makler_id', maklerId)` | `.eq('partner_id', maklerId)` **+** `.eq('partner_typ', 'makler')` |
| 1443 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 1444 | `.eq('makler_id', maklerId)...` | `.eq('partner_id', maklerId)...` **+** `.eq('partner_typ', 'makler')` |
| 1445 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 1446 | `.eq('makler_id', maklerId)...` | `.eq('partner_id', maklerId)...` **+** `.eq('partner_typ', 'makler')` |
| 1468 | `.from('makler_staffel_bonus')` | `.from('partner_staffel_bonus')` |
| 1469 | `.eq('makler_id', maklerId)` | `.eq('partner_id', maklerId)` **+** `.eq('partner_typ', 'makler')` |
| 1501 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 1504 | `fall:faelle_claim_bridge!makler_provisionen_fall_id_fkey(` | `fall:faelle_claim_bridge!partner_provisionen_claim_bridge_fkey(` (nur Hint-Name; Mapping unverändert) |
| 1512 | `.eq('makler_id', maklerId)` | `.eq('partner_id', maklerId)` **+** `.eq('partner_typ', 'makler')` |

> **Selects, die `makler_id` als *Spalte* selektieren:** keine der obigen Selects listet `makler_id` in der Spaltenliste (sie selektieren `id, betrag_netto_eur, status, …`), nur in `.eq()`-Filtern → nur die Filter ändern sich. Der zurückgegebene Shape (`MaklerProvisionRow` etc.) enthält kein `makler_id`-Feld → keine Shape-Änderung nötig.
> **Das `getMaklerStaffelStufen` (1455) bleibt** — `makler_staffel_stufen` ist die Config-Tabelle (Schwellen), NICHT Teil der Unifikation. Nur `getMaklerStaffelBoni` (1468, `makler_staffel_bonus`) zieht um.
> **`makler_fall_consent` (774) bleibt** — eigene Tabelle, unberührt.

**Beispiel-Diff (die Zeile-395-Query, vollständig before/after):**
```typescript
// VORHER (:394-400)
  const { data: provisionRows } = await supabase
    .from('makler_provisionen')
    .select('id, betrag_netto_eur, status, service_typ, trigger_at, hold_until')
    .eq('makler_id', maklerId)
    .eq('fall_id', fallId)
    .order('trigger_at', { ascending: false })
    .limit(1)
// NACHHER
  const { data: provisionRows } = await supabase
    .from('partner_provisionen')
    .select('id, betrag_netto_eur, status, service_typ, trigger_at, hold_until')
    .eq('partner_typ', 'makler')
    .eq('partner_id', maklerId)
    .eq('fall_id', fallId)
    .order('trigger_at', { ascending: false })
    .limit(1)
```

**TDD:** `src/lib/makler/queries.ts` hat **KEINEN Unit-Test** (`Glob src/lib/makler/*.test.ts` → nur `resolve-promo-code.test.ts`, unrelated). Es gibt keinen isolierten Seam zum Mocken (die Funktionen bauen den Query-Chain inline auf dem SSR-Client). **Verifikationsart:** `tsc(8GB)` grün (die neuen Table-Namen typen dank Phase-1-Task-7-`database.types.ts`-Ergänzung — s. Abhängigkeit unten) + **Phase-4-Prod-Smoke** (makler-Portal-Reader zeigt Provisionen aus `partner_provisionen`, inkl. die drei Embed-Reads für die Fall-/Kunden-Namen). **Kein neuer Test-Zwang** — begründet: reine Table-Repoints ohne Logik-Change, kein testbarer Seam, prod-Smoke deckt das End-to-End; einen Query-Builder-Mock-Test für 13 Sites zu bauen wäre Aufwand über dem Wert (die Query-Semantik ist durch die DB + RLS abgesichert, nicht durch TS-Logik).

> **⚠ Abhängigkeit `database.types.ts`:** Diese Repoints referenzieren `.from('partner_provisionen')`/`.from('partner_staffel_bonus')`. Die generierten Types kennen diese Tabellen — **Phase-1-Task-7** hat sie chirurgisch ergänzt (im kombinierten PR liegt Phase 1 vor Phase 2). Falls Phase 2 isoliert auf einem Branch OHNE Phase-1-Task-7 läuft, würde tsc `never` für den Table-Namen liefern → die Types-Ergänzung ist Voraussetzung. Im kombinierten PR ist das erfüllt.

**Commit:** `feat(provision-unifikation): makler-Reader lesen partner_provisionen (+ claim_id->bridge FK für Embeds)`.
**Audit:** Build — tsc(8GB) grün. Spec — 13 `.from`-Sites + 3 Embed-Hints (nur Hint-Name, Mapping unverändert) + 1 FK-Migration (`claim_id→bridge`, NICHT `fall_id` — werkstatt-Breaker vermieden); `makler_staffel_stufen`/`makler_fall_consent` bewusst NICHT angefasst (Config bzw. eigene Tabelle). Inkonsistenz — `.eq('partner_typ','makler')` auf ALLEN Queries (auch count/head). Regression — Shape unverändert (kein `makler_id`-Feld im Output); Embeds über die neue `claim_id→bridge`-FK (byte-identische Fall-/Claim-Daten); RLS `pp_partner_read` deckt makler-self-read.

---

## Task P2-5 — werkstatt-Reader → `partner_provisionen`

**Datei:** `src/lib/werkstatt/queries.ts`. **Keine Embeds** (die werkstatt-Reads lesen `claim_nummer` denormalisiert, KEIN `faelle_claim_bridge`-Embed) → **keine FK-Migration nötig** in P2-5 (die FKs aus P2-4 existieren ohnehin, werden hier aber nicht gebraucht).

**Regel je Query:** `.from('werkstatt_provisionen')` → `.from('partner_provisionen')` + **`.eq('partner_typ','werkstatt')` PFLICHT**. `werkstatt_id` → `partner_id`. `.from('werkstatt_staffel_bonus')` → `.from('partner_staffel_bonus')` + `.eq('partner_typ','werkstatt')`.

**Die exakten Stellen (Zeilen 2026-07-08 verifiziert):**

| Zeile | Vorher | Nachher |
|---|---|---|
| 67 | `.from('werkstatt_provisionen')` | `.from('partner_provisionen')` |
| 69 | `.eq('werkstatt_id', werkstattId)` | `.eq('partner_id', werkstattId)` **+** `.eq('partner_typ', 'werkstatt')` |
| 71 | `.from('werkstatt_provisionen')` | `.from('partner_provisionen')` |
| 73 | `.eq('werkstatt_id', werkstattId)` | `.eq('partner_id', werkstattId)` **+** `.eq('partner_typ', 'werkstatt')` |
| 76 | `.from('werkstatt_provisionen')` | `.from('partner_provisionen')` |
| 78 | `.eq('werkstatt_id', werkstattId)` | `.eq('partner_id', werkstattId)` **+** `.eq('partner_typ', 'werkstatt')` |
| 81 | `.from('werkstatt_provisionen')` | `.from('partner_provisionen')` |
| 83 | `.eq('werkstatt_id', werkstattId)` | `.eq('partner_id', werkstattId)` **+** `.eq('partner_typ', 'werkstatt')` |
| 130 | `.from('werkstatt_provisionen')` | `.from('partner_provisionen')` |
| 136 | `.eq('werkstatt_id', werkstattId)` | `.eq('partner_id', werkstattId)` **+** `.eq('partner_typ', 'werkstatt')` |
| 166 | `.from('werkstatt_provisionen')` | `.from('partner_provisionen')` |
| 167 | `.eq('werkstatt_id', werkstattId)...` | `.eq('partner_id', werkstattId)...` **+** `.eq('partner_typ', 'werkstatt')` |
| 168 | `.from('werkstatt_provisionen')` | `.from('partner_provisionen')` |
| 169 | `.eq('werkstatt_id', werkstattId)...` | `.eq('partner_id', werkstattId)...` **+** `.eq('partner_typ', 'werkstatt')` |
| 191 | `.from('werkstatt_staffel_bonus')` | `.from('partner_staffel_bonus')` |
| 192 | `.eq('werkstatt_id', werkstattId)` | `.eq('partner_id', werkstattId)` **+** `.eq('partner_typ', 'werkstatt')` |

> **`getWerkstattStaffelStufen` (178-179, `werkstatt_staffel_stufen`) bleibt** — Config-Tabelle. Die `v_werkstatt_auftrag`-Reads (253-271, `vermittler_werkstatt_id`/`reparatur_werkstatt_id`) sind ein anderer View, unberührt.
> **`claim_nummer`-Denormalisierung (Zeile 130-135):** Der Read `select('… claim_nummer')` funktioniert auf `partner_provisionen` unverändert — die Spalte `claim_nummer` existiert dort (werkstatt-spezifisch, Phase-0-Schema). Der werkstatt-Provisions-Trigger (Phase-1-Task-3) füllt `claim_nummer` aus `NEW.claim_nummer`. Kein Embed nötig.

**Beispiel-Diff (die Overview-count-Query, 67-69):**
```typescript
// VORHER
    supabase
      .from('werkstatt_provisionen')
      .select('id', { count: 'exact', head: true })
      .eq('werkstatt_id', werkstattId),
// NACHHER
    supabase
      .from('partner_provisionen')
      .select('id', { count: 'exact', head: true })
      .eq('partner_typ', 'werkstatt')
      .eq('partner_id', werkstattId),
```

**TDD:** kein Unit-Test für `werkstatt/queries.ts` (die vorhandenen `embed-finder-core.test.ts`/`finder.test.ts` sind unrelated). Verifikation: `tsc(8GB)` + Phase-4-Smoke (werkstatt-Portal zeigt Provisionen + Boni aus `partner_*`). Begründung wie P2-4 (reine Repoints, kein Seam).

**Commit:** `feat(provision-unifikation): werkstatt-Reader lesen partner_provisionen (partner_typ=werkstatt)`.
**Audit:** wie P2-4, ohne Embeds/FK; `werkstatt_staffel_stufen` + `v_werkstatt_auftrag` bewusst unberührt.

---

## Task P2-6 — wochenreport + pipeline + Abrechnungs-Pages

**Dateien:** `src/lib/makler/wochenreport.ts`, `src/lib/makler/pipeline.ts`, `src/app/makler/(shell)/abrechnungen/page.tsx`, `src/app/werkstatt/(shell)/abrechnungen/page.tsx`.

### `src/lib/makler/wochenreport.ts` (Reads, keine Embeds)

| Zeile | Vorher | Nachher |
|---|---|---|
| 139 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 141 | `.eq('makler_id', makler.id)` | `.eq('partner_id', makler.id)` **+** `.eq('partner_typ', 'makler')` |
| 146 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 148 | `.eq('makler_id', makler.id)` | `.eq('partner_id', makler.id)` **+** `.eq('partner_typ', 'makler')` |
| 151 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 153 | `.eq('makler_id', makler.id)` | `.eq('partner_id', makler.id)` **+** `.eq('partner_typ', 'makler')` |

> `makler_staffel_stufen` (156) bleibt (Config). `promotion_codes`/`leads`/`makler` (111/125/189) unberührt.
> **Client-Typ:** `buildMaklerWochenReport` bekommt einen Admin-Client (`SupabaseClient`, Cron ohne Session, `:99`). Also greift RLS NICHT → `.eq('partner_typ','makler')` ist hier **echt notwendig** (nicht nur defensiv), sonst zählte der Report werkstatt-Provisionen mit. **Money-adjazent** (Report-Zahl, kein Payout, aber sichtbar).

### `src/lib/makler/pipeline.ts` (Read — verifiziert)

**Verifikation der Task-Frage („ist Zeile 64 ein Read?"):** JA — `pipeline.ts:63-66` ist ein reiner SELECT (`.from('makler_provisionen').select('status, betrag_netto_eur').eq('makler_id', maklerId)`), gefolgt von `aggregierePipeline(...)`. Kein `.insert`. (Deckt sich mit dem Phase-1-Befund „0 `.insert` auf diesen Tabellen".)

| Zeile | Vorher | Nachher |
|---|---|---|
| 64 | `.from('makler_provisionen')` | `.from('partner_provisionen')` |
| 66 | `.eq('makler_id', maklerId)` | `.eq('partner_id', maklerId)` **+** `.eq('partner_typ', 'makler')` |

> **Client-Typ:** `getMaklerPipeline(db, maklerId)` bekommt `db` vom Caller. Der Abrechnungs-Page-Caller (`makler/(shell)/abrechnungen/page.tsx:32`) übergibt den **SSR-Client** (`createClient()`, `:28`) → RLS greift, aber `.eq('partner_typ','makler')` bleibt Pflicht (defense-in-depth + der Helper könnte künftig mit Admin-Client gerufen werden).

**Vollständiger Diff pipeline.ts:**
```typescript
// VORHER (:63-66)
  const { data } = await db
    .from('makler_provisionen')
    .select('status, betrag_netto_eur')
    .eq('makler_id', maklerId)
// NACHHER
  const { data } = await db
    .from('partner_provisionen')
    .select('status, betrag_netto_eur')
    .eq('partner_typ', 'makler')
    .eq('partner_id', maklerId)
```

### Die zwei Abrechnungs-Pages (KEIN Repoint — verifiziert)

**Verifikation der Task-Frage („lesen die Pages direkt oder über queries.ts?"):** über `queries.ts`. `makler/(shell)/abrechnungen/page.tsx` ruft `getMaklerAbrechnungsData`/`getMaklerPipeline`/`getMaklerOffeneLeadsCount` (keine eigenen `.from()`). `werkstatt/(shell)/abrechnungen/page.tsx` ruft `getWerkstattProvisionen`/`getWerkstattStaffelBoni` (keine eigenen `.from()`). **→ kein `.from`-Change in den Pages.** Optional: die Datei-Kopf-Kommentare (`makler/…/page.tsx:4` „aus makler_provisionen", `werkstatt/…/page.tsx:2` „Zeigt werkstatt_provisionen") auf `partner_provisionen` aktualisieren (Kommentar-Ehrlichkeit; ASCII ok da Backend-Kommentar — aber diese liegen in `.tsx`, der Kommentar ist kein UI-Text, also Umlaut-Regel n/a).

### `partner-billing.ts` (KEIN Repoint — verifiziert)

**Verifikation der Task-Frage:** `partner-billing.ts:66` liest `.from('v_partner_billing')` (den View), NICHT die Basis-Tabellen. Nach P2-2 liefert der View die Union-Daten automatisch → **kein `.from`-Change** in `partner-billing.ts`. Die einzige mögliche Berührung ist der `ledger_tabelle`-Konstanten-Umstieg — aber `partner-billing.ts` **schreibt/vergleicht keine `ledger_tabelle`-Literale** (es baut nur den Key `${r.ledger_tabelle}:${r.ledger_id}` aus gelesenen Row-Werten, kein Literal). → `partner-billing.ts` bleibt in Phase 2 komplett unverändert.

**TDD:** `wochenreport.ts` hat das pure `verdichteWochenReport` getestet, aber `buildMaklerWochenReport` (der DB-Teil) ist nicht isoliert getestet. Repoints sind read-only Table-Swaps → `tsc(8GB)` + Phase-4-Smoke (Wochenreport-Cron zieht Zahlen aus `partner_provisionen`). Kein neuer Test-Zwang (kein Seam; die pure Verdichtung ist unberührt).

**Commit:** `refactor(provision-unifikation): wochenreport+pipeline lesen partner_provisionen; Page-Kommentare`.
**Audit:** Build — tsc(8GB) grün. Spec — 3 wochenreport-Sites + 1 pipeline-Site repointet, Pages/partner-billing.ts verifiziert unberührt (delegieren/lesen View). Inkonsistenz — `.eq('partner_typ','makler')` überall; bei Admin-Client (wochenreport) echt nötig. Regression — pure Verdichtung + View-Reader unberührt.

---

## Task P2-7 — Gutschrift/Actions: rohe `ledger_tabelle`-Strings → `LEDGER_TABELLEN` (MONEY-KRITISCH)

**Ziel:** Alle rohen `ledger_tabelle`-String-Literale durch `LEDGER_TABELLEN` (aus P2-1) ersetzen — schließt die T6b-Bug-Klasse (ein falscher Tabellen-String, der durchrutscht). **Wichtig:** `ledger_tabelle` wird im Code fast überall als **durchgereichte Variable** gehandhabt (nicht als Literal) — es gibt nur wenige echte Literal-Stellen. Ich ersetze die Literale + tippe die Variablen-Signaturen, wo es sauberer wird.

**Wo `ledger_tabelle` als Literal vs. Variable auftritt (verifiziert durch Lesen):**
- `partner-gutschrift.ts` — `erstellePartnerGutschrift` schreibt `ledger_tabelle: p.tabelle` (`:298`, Variable, kein Literal); `erstelleStornoGutschrift` schreibt `ledger_tabelle: origRow.ledger_tabelle` (`:168`, kopiert vom Original, kein Literal). **→ keine Literale zu ersetzen; aber der Typ von `p.tabelle` kann von `string` auf `LedgerTabelle` verschärft werden.**
- `partner-billing-actions.ts` — `getPartnerGutschriftDownloadUrl(ledgerTabelle: string, …)` (`:238`, Parameter kommt vom View-Row, kein Literal); die 3 Actions `gebeProvisionFrei`/`zahleProvisionAus`/`storniere` casten `quelle as (typeof PROVISION_TABELLEN)[number]` — nach P2-3 ist das die 3-Werte-Union. **→ keine Literale.**
- `provision-status.ts` — `.eq('ledger_tabelle', tabelle)` (`:152`, `:271`) reicht `tabelle` (die `ProvisionTabelle`) durch, kein Literal. **→ keine Literale.**

**Erkenntnis:** Es gibt **keine harten `'makler_provisionen'`/`'partner_provisionen'`-Literale im Gutschrift-Schreib-/Lookup-Pfad** — alles ist variabel. Der T6b-Hebel von P2-7 ist daher **primär die Typ-Verschärfung** (die verhindert, dass ein falscher String je in `p.tabelle` landet), plus die eine sinnvolle Literal-Nutzung: die `erstellePartnerGutschrift`-Signatur `tabelle: string` → `tabelle: LedgerTabelle`.

**Konkrete Changes:**

**(a) `partner-gutschrift.ts` — `erstellePartnerGutschrift`-Signatur tippen:**
```typescript
// VORHER (:208-213)
export async function erstellePartnerGutschrift(
  db: SupabaseClient<any>,
  p: {
    tabelle: string
    ledgerId: string
    partnerTyp: 'makler' | 'werkstatt' | 'marketing'
// NACHHER
import { type LedgerTabelle } from './ledger-tabellen'
// ...
export async function erstellePartnerGutschrift(
  db: SupabaseClient<any>,
  p: {
    tabelle: LedgerTabelle
    ledgerId: string
    partnerTyp: 'makler' | 'werkstatt' | 'marketing'
```
> `erstelleStornoGutschrift` (`:130`) kopiert `origRow.ledger_tabelle` (ein aus der DB gelesener `string`) → bleibt `string` (die DB kann historisch andere Werte tragen; kein Cast erzwingen). Der Insert `ledger_tabelle: origRow.ledger_tabelle` bleibt.

**(b) `provision-status.ts` — der Aufruf `erstellePartnerGutschrift({ tabelle, … })`:** `tabelle` ist bereits `ProvisionTabelle` = `'partner_provisionen' | 'partner_staffel_bonus' | 'provisionen_maik'`. Das ist zuweisungskompatibel zu `LedgerTabelle` (identische String-Union). **Kein Change nötig** — aber ich prüfe, dass `ProvisionTabelle` ⊆ `LedgerTabelle` (beide = die 3 Union-Strings). ✓ Identisch. Optional: `provision-status.ts` importiert `LedgerTabelle` und definiert `ProvisionTabelle` als Alias — **nicht nötig**, lasse die zwei getrennt (ProvisionTabelle = Reader-Contract mit dem View; LedgerTabelle = Gutschrift-Ledger-Namen; sie überlappen zufällig 1:1, sind aber semantisch verschieden). Kommentar ergänzen, dass sie deckungsgleich sind.

**(c) `partner-billing-actions.ts` — `getPartnerGutschriftDownloadUrl`:** Parameter `ledgerTabelle: string` bleibt `string` (kommt aus dem View-Row via Client, wo TS ihn als `string` sieht). **Kein Change** — der Lookup `.eq('ledger_tabelle', ledgerTabelle)` ist value-agnostisch. (Eine Typ-Verschärfung hier bringt nichts, weil der Aufrufer den Wert aus einem `PartnerBillingRow.quelle_tabelle: string` zieht.)

**→ P2-7 ist ein schlanker, aber echter Task:** die eine Signatur-Verschärfung (a) macht `erstellePartnerGutschrift` typsicher gegen falsche Tabellen-Strings (der T6b-Schutz), (b) ist der Kompatibilitäts-Nachweis. **Kein Literal-Ersatz nötig, weil der Code bereits variabel ist** — das ist ein bewusster, dokumentierter Befund gegen die Task-Annahme „replace raw ledger_tabelle string literals" (es gibt praktisch keine im Schreib-Pfad).

> **Ehrliche Abweichung von der Task-Vorgabe:** Der Task sagt „P2-7 replaces raw ledger_tabelle string literals in partner-gutschrift.ts / partner-billing-actions.ts / provision-status.ts with the constant". **Befund: diese Files enthalten im Ledger-Schreib-/Lookup-Pfad KEINE rohen `ledger_tabelle`-Literale — der Wert wird durchgereicht.** Der einzige „harte" Ort, an dem ein Literal die Konstante bräuchte, wäre ein Insert `ledger_tabelle: 'partner_provisionen'` — der existiert nicht (der Insert nutzt `p.tabelle`). Also ist der reale P2-7-Wert die **Typ-Verschärfung** (Signatur `LedgerTabelle`), die dieselbe Bug-Klasse schließt (falscher String kann nicht mehr in `p.tabelle` gelangen). Das ist stärker als ein Literal-Ersatz, weil es compile-time greift.

**TDD:**
1. **Bestehende Tests dürfen nicht brechen:** `partner-gutschrift.test.ts:762` nutzt `ledger_tabelle: 'makler_provisionen'` in einer **Storno-Fixture** (Input für `erstelleStornoGutschrift`, das den Wert nur kopiert). Da `erstelleStornoGutschrift.tabelle` NICHT auf `LedgerTabelle` verschärft wird (es liest `origRow.ledger_tabelle: string`), bleibt dieser Test grün. **Verifizieren, nicht ändern.**
2. **RED (Typ-Beweis, optional aber empfohlen)** — ein `expectTypeOf`/`ts-expect-error`-Test in `provision-status.test.ts` oder ein neuer `partner-gutschrift.types.test.ts`, der beweist, dass `erstellePartnerGutschrift` einen Nicht-Ledger-String ablehnt:
   ```typescript
   // Compile-time-Guard: falsche tabelle wird vom Typ abgelehnt.
   // @ts-expect-error 'makler_provisionen' ist kein LedgerTabelle mehr
   const _bad: Parameters<typeof erstellePartnerGutschrift>[1] = {
     tabelle: 'makler_provisionen', ledgerId: 'x', partnerTyp: 'makler', partnerId: 'y',
     betraege: { nettoCent: 0, ustSatz: null, ustBetrag: null, bruttoCent: 0 }, leistungText: 'x',
   }
   ```
   > Wenn `@ts-expect-error` NICHT feuert (weil der Typ zu lax ist), schlägt tsc fehl → RED. Nach der Signatur-Verschärfung feuert es → GREEN.
3. **Command:** `NODE_OPTIONS=--max-old-space-size=8192 npx vitest run src/lib/finance` grün + `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` grün.
4. **Commit:** `refactor(provision-unifikation): erstellePartnerGutschrift.tabelle typsicher (LedgerTabelle, T6b-Schutz)`.

**Audit:** Build — tsc(8GB) grün. Spec — Signatur `LedgerTabelle` verschärft; Befund dokumentiert (keine rohen Literale im Schreib-Pfad); `erstelleStornoGutschrift`/Download bleiben value-agnostisch. Inkonsistenz — `LEDGER_TABELLEN` ist die einzige Namens-Quelle; `ProvisionTabelle` ⊆ `LedgerTabelle` nachgewiesen. Regression — `partner-gutschrift.test.ts:762`-Fixture bleibt gültig (Storno kopiert, verschärft nicht).

---

## Task P2-8 — Gate + kombinierter Phase-1+2-PR

**Kein Code** — Abschluss-Verifikation vor PR:

1. `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → grün (KEIN Default-Heap; sonst false-clean).
2. `NODE_OPTIONS=--max-old-space-size=8192 npx vitest run src/lib/finance` → grün (Money-Path: `provision-status`, `partner-gutschrift`, `partner-billing`, `partner-billing-actions`, `ledger-tabellen`).
3. Ratchets: `npm run check:token-audit`, `check:component-set`, `check:knip`, `check:status-registry`, `check:redirect-stubs` → 0 neu (rein Backend/DDL/Lib — sollte 0 sein; die neue `ledger-tabellen.ts` ist eine Lib, kein Component/Status).
4. `git status` clean, `git stash list` leer (Regel 3), `git log --branches --not --remotes` alle gepusht.
5. **DB-Konsistenz-Recheck (execute_sql, READ):**
   - `v_partner_billing`-Signatur == P2-0-Snapshot (20 Spalten).
   - `SELECT DISTINCT quelle_tabelle FROM v_partner_billing` enthält KEINE Alt-Table-Namen (sobald `partner_provisionen` Zeilen hat).
   - Die 3 FKs auf `partner_provisionen` existieren (P2-4).
   - `SELECT * FROM v_partner_billing LIMIT 0` → 20 Spalten, kein Fehler.
6. **PR gegen `staging`** — **kombiniert Phase 1 + Phase 2** (Empfehlung, s. §KOPPLUNG). PR-Body MUSS enthalten:
   - „Write-Half (Phase 1): Trigger schreiben partner_provisionen/partner_staffel_bonus. Read-Half (Phase 2): v_partner_billing + alle TS-Reader + META 5→3 lesen die Union. **Die Hälften sind gekoppelt — NICHT einzeln nach main deployen** (Phase 1 allein → Rows unsichtbar/unauszahlbar; Phase 2 allein → View liest leere Tabelle → Cockpit leer)."
   - „Bestand (2 makler + 7 werkstatt Test-Zeilen) bleibt bis Phase 3 in den Alt-Tabellen → im View bis zum Phase-3-Backfill unsichtbar (fail-safe, 0 Gutschriften, nur Test-Traffic)."
   - „Migrations-Reihenfolge: Phase-1-DDL (Trigger + 2 Unique-Indizes) VOR Phase-2-DDL (View + 3 FKs)."

**Phase-3/4 bleiben separat** (Backfill + Drop; Prod-Smoke) — Phase 4 verifiziert dann end-to-end, dass eine echte Provision durch beide Hälften läuft (Trigger→partner_provisionen→View→Cockpit→Auszahlung→Gutschrift mit `ledger_tabelle='partner_provisionen'`→makler+werkstatt-Portal-Reader).

---

## 4 · Risiken (priorisiert)

1. **[MONEY, HÖCHSTES] META-`partner_typ`-Mis-Branch → falsche Steuerdaten / falscher Partner auf einer echten Gutschrift (P2-3).** Wenn `auszahlenProvision` `partner_typ` falsch aus der Row liest (oder der Steuer-Lookup die falsche Tabelle trifft), bekäme ein makler-Payout werkstatt-Steuerdaten (oder umgekehrt) → falscher USt-Satz auf einem echten Korrekturbeleg (§14 UStG-Risiko). **Mitigation:** die zwei P2-3-Money-Tests (makler→makler-Tabelle+19%, werkstatt→werkstaetten-Tabelle+Kleinunternehmer-0%) beweisen die Verzweigung; Phase-4-Smoke zahlt je einen makler- UND werkstatt-`partner_provisionen`-Row aus und prüft `empfaenger_snapshot`. Der Steuer-Lookup nutzt DIESELBE Tabelle wie vor dem Umbau (nur Direkt-Select statt Embed) → Steuerdaten sind identisch, nur der Zugriffsweg ändert sich.

2. **[MONEY] View-Signatur-Drift (P2-2).** Wenn der Rewrite eine Spalte umbenennt/umordnet/andere Typen liefert, brechen die ungetypten Reader (`getPartnerBilling` castet blind auf `PartnerBillingRow` → Laufzeit-`undefined` in Betrags-Feldern → falsche Aggregate im Cockpit). **Mitigation:** P2-0 snapshottet die 20-Spalten-Signatur; P2-2-Verify assertet Byte-Gleichheit VOR dem Commit; `CREATE OR REPLACE VIEW` erzwingt ohnehin gleiche führende Spalten.

3. **[REGRESSION, STILL] Ein übersehener Reader zeigt auf die jetzt-leere Alt-Tabelle → 0 Zeilen (P2-4/5/6).** Nach dem Trigger-Umzug (Phase 1) ist `makler_provisionen`/`werkstatt_provisionen` für neue Claims leer; ein vergessener `.from('makler_provisionen')` liefert stumm 0 → Partner sieht plötzlich keine Provisionen. **Mitigation:** die Blast-Radius-Grep (`makler_provisionen|werkstatt_provisionen|makler_staffel_bonus|werkstatt_staffel_bonus` in `src/`) muss nach P2-4/5/6 nur noch Kommentare + `database.types.ts` + Test-Fixtures + Phase-1-Cron-Files treffen (die Crons sind Phase-1-Task-8). **Verifikations-Grep in P2-8** (`git grep -n "from('makler_provisionen'\|from('werkstatt_provisionen'\|from('makler_staffel_bonus'\|from('werkstatt_staffel_bonus'" src/` → 0 App-Reads).

4. **[BLOCKER, CONTRADICTION B] Embed-FK fehlt → makler-Portal-Reads werfen PGRST200 (P2-4).** Ohne die drei FKs auf `partner_provisionen` findet PostgREST die benannten Embeds (`!partner_provisionen_fall_id_fkey`) nicht → die 3 makler-Reads (Dashboard-Activity, Abrechnungs-Liste, Rechnung) werfen → Portal-Fehler. **Mitigation:** P2-4-Teil-1-Migration legt die FKs an; Verify-Query bestätigt Existenz; Schema-Cache-Reload beachten. **Falls Review die FK-Anlage auf `partner_provisionen` ablehnt** (Argument: polymorphe Union soll FK-frei bleiben) → Alternative: die drei Embeds auf **unbenannte** Embeds umschreiben (`fall:faelle_claim_bridge(...)` ohne `!fkey` — PostgREST rät die Relation), ABER das braucht GENAU EINE FK-Beziehung zwischen `partner_provisionen` und `faelle_claim_bridge`, sonst ist es ambig → die FK ist ohnehin nötig. **Empfehlung: FKs anlegen** (fall_id/claim_id/lead_id sind nicht-polymorph, nur `partner_id` bleibt FK-frei).

5. **[MONEY, ANNAHME] Der `quelle_tabelle` 4→2-Kollaps (id-Global-Uniqueness-Disambiguierung).** Falls doch ein Lookup Tabellen-Namen-Trennung bräuchte, wäre das ein Falsch-Tabellen-Payout-Risiko. **Verifikationsergebnis (durchgeführt, §2):** KEIN Consumer trennt makler/werkstatt über `quelle_tabelle`/`ledger_tabelle`; alle nutzen `quelle_id`/`ledger_id` (global-eindeutige uuid) als Disambiguator. `.from(tabelle).eq('id', id)` und `.eq('ledger_tabelle', tabelle).eq('ledger_id', id)` bleiben eindeutig. **Der Kollaps ist safe — verifiziert, kein Flag nötig.**

**Weitere (nachrangig):**
- **`database.types.ts`-Abhängigkeit:** Alle P2-4/5/6-Repoints brauchen die Phase-1-Task-7-Types-Ergänzung (`partner_provisionen`/`partner_staffel_bonus` in `Tables`), sonst tsc `never`. Im kombinierten PR erfüllt; bei isoliertem Phase-2-Branch zuerst die Types ergänzen.
- **PostgREST-Schema-Cache-Latenz nach FK-Anlage (P2-4):** kurz `NOTIFY pgrst, 'reload schema'` falls ein Embed-Smoke PGRST200 wirft.
- **Test-Fixture `partner-gutschrift.test.ts:762`** (`ledger_tabelle:'makler_provisionen'`): bleibt gültig (Storno-Kopie, kein Typ-Zwang) — nicht anfassen, sonst sinnloser Diff.
- **Kommentar-Drift:** viele Files nennen `makler_provisionen`/`werkstatt_provisionen` in Kommentaren; nur die Page-Kommentare (P2-6) + optional wochenreport/pipeline anfassen, Rest ist harmlos + Phase-3-Cleanup.

---

## 5 · Zusammenfassung der verifizierten Contradictions gegen die Task-Vorgaben (für die Reconciliation)

| # | Task-Annahme | Realität (verifiziert) | Konsequenz im Plan |
|---|---|---|---|
| A | P2-3: die makler/werkstatt-Provisions-status_norm-CASE + META „port cleanly" mit `mp/wp→pp` | `auszahlenProvision` liest Steuerdaten per **PostgREST-Embed** `makler(ist_kleinunternehmer)`; `partner_provisionen` hat **KEINE FK** → Embed unmöglich | P2-3 baut den Steuer-Read auf einen **separaten `partner_typ`-verzweigten Lookup** um (nicht nur META-Felder mappen) |
| B | P2-4: `.from()`-Swap genügt; FK-Migration `fall_id/claim_id/lead_id` legt die Embed-FKs an | (1) 3 makler-Reads nutzen **benannte-FK-Embeds** `!makler_provisionen_fall_id_fkey`, die auf `partner_provisionen` fehlen. (2) 🔴 **Die vorgeschlagene `fall_id→bridge`-FK ist ein Claim-Insert-Prod-Breaker** — werkstatt-Provisionen schreiben `fall_id=claim-id`, nur 21/30 Claims haben claims.id in bridge.fall_id → FK wirft auf werkstatt-Insert → Claim-Rollback | **KORRIGIERT:** EINE FK `claim_id → faelle_claim_bridge(claim_id)` (prod-sicher 30/30, UNIQUE-Ziel) statt fall_id; Embed-Hint → `!partner_provisionen_claim_bridge_fkey`; **Mapping-Code unverändert** (byte-identische Fall-Daten, da makler `provision.claim_id=bridge.claim_id` denselben Row trifft). Kein fall_id/lead_id/claim_id→claims-FK nötig |
| C | P2-3: `erstellePartnerGutschrift` branched evtl. schon auf `partner_typ` (würde es vereinfachen) | **NEIN** — es bekommt `partnerTyp` als **Arg** aus `META[tabelle].partnerTyp`; Caller muss es aus der **Row** auflösen | P2-3-Caller liest `row.partner_typ` und reicht es durch |
| D | P2-7: rohe `ledger_tabelle`-String-Literale ersetzen | Im Gutschrift-Schreib-/Lookup-Pfad gibt es **keine rohen Literale** — `ledger_tabelle` wird durchgereicht | P2-7 = **Typ-Verschärfung** (`tabelle: LedgerTabelle`) statt Literal-Ersatz (stärker: compile-time-Schutz) |
| E | (implizit) Crons sind Teil des Reader-Repoints | Die 2 Release-Crons sind **Phase-1-Task-8**, nicht Phase 2 | Phase 2 fasst die Crons NICHT an (sonst Doppel-Repoint) |
| — | P2-2: 4→2-`quelle_tabelle`-Kollaps könnte Tabellen-Namen-Trennung brechen | **Safe** — kein Consumer keyt auf Tabellen-Namen für makler≠werkstatt; `quelle_id`/`ledger_id` (uuid) disambiguiert | Kein Flag; Kollaps bestätigt |
