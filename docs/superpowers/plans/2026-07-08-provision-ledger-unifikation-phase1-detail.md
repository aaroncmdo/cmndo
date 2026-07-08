# Provisions-Ledger-Unifikation — Phase 1 (Detail-Plan, TDD-ready)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development (RED→GREEN je Task) + superpowers:subagent-driven-development. Jeder Task = eigener Commit. DDL AUSSCHLIESSLICH via `mcp__plugin_supabase_supabase__apply_migration` (Regel 2), READ via `execute_sql`.

**Parent-Plan:** `docs/superpowers/plans/2026-07-08-provision-ledger-unifikation.md` (Phase 1 dort ist ein Struktur-Stub — DIESER File ist die Line-by-Line-Ausarbeitung).
**Design-Quelle:** `docs/superpowers/specs/2026-07-08-provision-gutschrift-ledger-assessment.md`.
**Projekt-Ref (prod):** `paizkjajbuxxksdoycev`.
**🔀 PIVOT zu DUAL-WRITE (6f60c510-Verbesserung, Aaron-bestätigt 08.07. — ersetzt den „switch"-Ansatz unten):** Phase 1 SWITCHt die Trigger NICHT auf partner_provisionen — sie macht **DUAL-WRITE**: die Trigger behalten den Alt-Insert (`makler_provisionen`/`werkstatt_provisionen`) UND spiegeln zusätzlich in `partner_provisionen`. Dadurch bleiben Reader + Staffel-Trigger + Cron unberührt → **Phase 1 ist verhaltensneutral und von Phase 2 ENTKOPPELT** (nicht mehr „zusammen deployen"; Phase 1 allein ist safe/deploybar). Der Staffel-Reanchor + der Reader-/Mutations-Flip wandern nach **Phase 2**, das Stop-Dual-Write + Drop nach **Phase 3**. **✅ Applied:** `supabase/migrations/20260708013331_provision_unifikation_phase1_dual_write.sql` (prod-live, struktur-verifiziert). Die switch-basierten Trigger-Payloads unten bleiben als **Grounding-Referenz** gültig (Funktions-Bodies verbatim, Spalten, Idempotenz-Keys, makler_fall_consent-Erhalt) — nur ist der Effekt dual-write (Alt-Insert BEHALTEN + Spiegel-Insert), nicht switch (Alt-Insert ERSETZEN). **Gekoppelte Lese-Hälfte:** `docs/superpowers/plans/2026-07-08-provision-ledger-unifikation-phase2-detail.md`.
**Grounding-Status:** alle „bei Umsetzung verifizieren"-Punkte sind gegen prod aufgelöst (2026-07-08): Trigger-Bodies via `pg_get_functiondef`, Unique-Indizes via `pg_indexes`, `claim_nummer`-Timing via `pg_trigger`, `award_*`-App-Caller via grep. Payloads unten sind final.

---

## 0 · Was Phase 1 IST — und was die Discovery am Parent-Plan korrigiert

**Ziel (unverändert):** Neue Provisionen + Staffel-Boni landen ab jetzt in `partner_provisionen` / `partner_staffel_bonus` mit `partner_typ`-Diskriminator; EIN Schreib-Pfad statt zwei. Verhaltensneutral: die **Reader** (`v_partner_billing`, makler/werkstatt `queries.ts`, Cockpit) lesen bis Phase 2 die ALTEN Tabellen; Bestand bleibt bis Phase 3.

**KRITISCHE KORREKTUR am Parent-Plan (durch Code-Discovery belegt):**
Der Parent-Plan beschreibt einen TS-Schreib-Seam `insertPartnerProvision(db, {...})`, durch den „alle Writer routen statt roher `.from('makler_provisionen').insert`". **Diesen Writer gibt es im App-Code nicht.** Verifiziert:

- `grep -rn "from\('(makler|werkstatt)_provisionen'\)\s*\.(insert|upsert)" src/` → **0 Treffer**. Ebenso 0 für die staffel_bonus-Tabellen. (Grep-Beleg in dieser Session.)
- **Alle Provisions-INSERTs sind DB-Trigger** (prod-verifiziert via `pg_trigger`-Query):
  - `trg_werkstatt_provision_on_claim` ON `claims` AFTER INSERT → `create_werkstatt_provision()` → INSERT `werkstatt_provisionen` (`supabase/migrations/20260622130635_werkstatt_provision_trigger.sql:13`).
  - `trg_makler_provision_on_bridge` ON `faelle_claim_bridge` AFTER INSERT → `create_makler_provision()` → INSERT `makler_provisionen` (`supabase/migrations/20260625162524_makler_provision_trigger_bridge_anchor.sql:24`). (Der ältere `…20260625161838…:27`-Anker auf `claims` ist ersetzt.)
- **Alle Staffel-Bonus-INSERTs sind DB-Funktionen**, gefeuert von Triggern AUF der jeweiligen Provisions-Tabelle:
  - `award_makler_staffel_boni(uuid)` INSERT `makler_staffel_bonus`, gefeuert von `trg_award_makler_staffel` ON `makler_provisionen` AFTER INSERT OR UPDATE OF status (`supabase/migrations/20260704085120_makler_staffelung.sql:48,71`).
  - `award_werkstatt_staffel_boni(uuid)` INSERT `werkstatt_staffel_bonus`, gefeuert von `trg_award_staffel` ON `werkstatt_provisionen` (`supabase/migrations/20260626135720_werkstatt_staffelung.sql:45,68`).
- Die App-Files `pipeline.ts` / `erstelle-anfrage.ts` / `convert-lead-to-claim.ts` schreiben **Leads/Claims**, NICHT Provisionen. Der einzige Provisions-Bezug in `convert-lead-to-claim.ts:880` ist ein **READ** (`makler_provisionen.betrag_netto_eur` für die Value-Loop-Notification). `erstelle-anfrage.ts` berührt Provisionen gar nicht (nur der Kommentar `:6` nennt sie).

**Konsequenz für die Task-Struktur:** Der „Write-Seam" von Phase 1 ist **DDL** (Trigger-Rewrite), nicht TS. Der TS-Teil von Phase 1 ist:
1. `provision-status.ts` META 5→3 (kollabiert makler/werkstatt-Provisionen zu `partner_provisionen`, makler/werkstatt-Bonus zu `partner_staffel_bonus`, `provisionen_maik` bleibt) — damit `auszahlen`/`freigeben`/`storniere` auf die Union-Tabelle wirken **wenn** sie mit einem Union-`tabelle`-Argument gerufen werden.
2. Der **eine READ** in `convert-lead-to-claim.ts:880` (sonst liest die Value-Loop nach dem Trigger-Umzug 0 Zeilen aus der leeren Alt-Tabelle → `betragEur=undefined`).
3. `database.types.ts` chirurgische Ergänzung.

**Der Parent-Plan-Seam `insertPartnerProvision(db,{...})` wird als optionaler TS-Helper trotzdem angelegt (Task 1)** — nicht weil ein App-Writer ihn braucht, sondern als **getestete Referenz-Signatur** + für Phase-4-Smoke (tsx-Direktcall statt DB-Trigger-Trigger). Er ist NICHT im kritischen Pfad; wenn Review ihn als YAGNI ablehnt, ersatzlos streichbar ohne den Rest zu brechen. Ich baue ihn, weil der Phase-4-Smoke im Parent-Plan („tsx-Direktcall des Seams") genau ihn voraussetzt.

**Die zwei money-kritischen Trigger-Umzüge (Task 2 + 3) sind das eigentliche Herz von Phase 1.**

---

## 1 · Money-Path-Sequencing-Entscheidung: `ledger_tabelle`

### Wie der Wert heute durch das System fließt (verifiziert)
`ledger_tabelle` ist **kein** unabhängig gespeicherter Wert — es ist ein String, der end-to-end durchgereicht wird und an DREI Stellen identisch sein muss:

1. **Reader → Action:** `v_partner_billing.quelle_tabelle` (heute `'makler_provisionen'` etc.) → der Admin-Drawer reicht `row.quelle_tabelle` als `quelle` an `zahleProvisionAus(quelle,id)` / `storniere(quelle,id,grund)` (`partner-billing-actions.ts:99,111,121,137`).
2. **Action → Gutschrift-Insert:** `auszahlenProvision(db, tabelle, id)` liest `.from(tabelle)` und reicht `tabelle` an `erstellePartnerGutschrift({tabelle,…})`, das `partner_gutschriften.ledger_tabelle = p.tabelle` schreibt (`partner-gutschrift.ts:298`). Der Storno kopiert `ledger_tabelle` vom Original (`partner-gutschrift.ts:168`).
3. **Gutschrift-Lookup:** `storniereProvision` findet das Original via `.eq('ledger_tabelle', tabelle).eq('ledger_id', id)` (`provision-status.ts:151-155`); der PDF-Download via `.eq('ledger_tabelle', ledgerTabelle)` (`partner-billing-actions.ts:252`); `buildGutschriftDocsByLedger` keyt auf `${ledger_tabelle}:${ledger_id}` und `belegeFuerZeile` matcht `${quelle_tabelle}:${quelle_id}` (`partner-billing.ts:137,163`).

**Invariante:** `quelle_tabelle` (Reader) == `tabelle`-Argument (Action) == `ledger_tabelle` (Gutschrift) == Lookup-Key. Die vier sind DERSELBE String — sie bleiben nur konsistent, wenn sie **gemeinsam** umgestellt werden.

### Die Entscheidung
**`ledger_tabelle` bleibt in Phase 1 UNVERÄNDERT auf den Alt-Werten (`'makler_provisionen'`/`'werkstatt_provisionen'`/…). Die Umstellung auf `'partner_provisionen'` ist STRIKT Phase 2, zusammen mit dem `v_partner_billing`-Umbau und der `LEDGER_TABELLEN`-Konstante.**

**Begründung (die Sequencing-Logik):**
- Der `tabelle`-Wert, mit dem `auszahlenProvision` gerufen wird, kommt AUSSCHLIESSLICH aus `v_partner_billing.quelle_tabelle` (via Admin-Drawer). In Phase 1 bleibt `v_partner_billing` unverändert und UNIONt weiter die Alt-Tabellen → es kann nur `quelle_tabelle ∈ {makler_provisionen, werkstatt_provisionen, …}` liefern. Es gibt in Phase 1 **keinen Aufrufer**, der `auszahlen`/`storniere` mit `'partner_provisionen'` ruft. Also entsteht KEIN `partner_provisionen`-`ledger_tabelle`-Wert, und die Invariante bleibt trivial gewahrt.
- **Wollte** man in Phase 1 die META-Keys auf `partner_provisionen` umbenennen (statt nur die Tabellen-Ziele), bräche man `PROVISION_TABELLEN` als Contract mit `v_partner_billing.quelle_tabelle`: der Guard `if (!PROVISION_TABELLEN.includes(quelle))` (`partner-billing-actions.ts:85,106,135`) würde die Alt-Werte aus dem noch-alten View ablehnen → **jede Auszahlung/Storno am Bestand (2+7 prod-Zeilen) bräche sofort**. Das ist der Grund, `ledger_tabelle`/META-Keys NICHT vorzuziehen.
- Daraus folgt die **Kern-Design-Regel von Phase 1:** die META behält **beide** alten Schlüssel `makler_provisionen` und `werkstatt_provisionen` als `ProvisionTabelle`-Werte (Contract mit dem alten View + `ledger_tabelle`-Bestand), aber **beide zeigen als DB-Ziel (`from`) NICHT mehr auf die Alt-Tabelle** — sie bleiben auf ihr, DENN Phase 1 fasst weder View noch Caller an. Anders gesagt: **die TS-META-Ziele ändern sich in Phase 1 GAR NICHT.** Was sich ändert, ist NUR die DB (wo neue Rows entstehen). Siehe Task-2/3-Diskussion unten.

### Der eigentliche Phase-1-Money-Path-Effekt (und sein bewusster Trade-off)
Nach Task 2+3 entstehen **neue** Provisionen in `partner_provisionen`. `v_partner_billing` (unverändert) liest sie NICHT → **neue Provisionen sind im Admin-Cockpit + Partner-Portal unsichtbar, bis Phase 2 den View umstellt.** Das ist die wörtliche Bedeutung von „Reader lesen bis Phase 2 die Alt-Tabellen".

Das ist akzeptabel WENN Phase 2 zeitnah folgt (gleiche Session/PR-Kette), und es ist **fail-safe** (kein falscher Payout, keine Doppel-Gutschrift — nur temporär unsichtbare pending-Rows, deren `hold_until` ohnehin 7 Tage in der Zukunft liegt). **Money-kritische Auflage:** Phase 1 und Phase 2 dürfen nicht über einen Release-/Deploy-Zyklus getrennt werden, in dem echte (Nicht-Test-)Provisionen anfallen könnten. Da prod-Provisionen aktuell rein Test-Account-getrieben sind (2+7 Zeilen, sonst 0), ist das Fenster unkritisch — aber der PR-Body MUSS diese Kopplung dokumentieren, und der Idle-Merge-Scan darf Phase 1 nicht ohne Phase 2 nach `main` ziehen. **Empfehlung: Phase 1 + Phase 2 als EIN PR** (die Trennung im Parent-Plan ist eine Planungs-, keine Deploy-Grenze). Falls getrennt: Phase-1-PR-Titel `[DO NOT DEPLOY ALONE]`.

**Zusammengefasst:** Phase 1 ändert `ledger_tabelle` NICHT. Es verschiebt nur, WO neue Provisions-/Bonus-Rows physisch entstehen (Alt-Tabelle → `partner_provisionen`). Die gesamte `ledger_tabelle`-Konsistenz-Arbeit (View emittiert `partner_provisionen`, META-Keys → `partner_provisionen`, `LEDGER_TABELLEN`-Konstante, Bestandsdaten-`ledger_tabelle`-Migration falls je Gutschriften existieren) ist Phase 2. Heute existieren 0 Gutschriften auf prod (`gs_on_old_tables=0`), also gibt es in Phase 2 nichts zu backfillen — sauberer Schnitt.

---

## 2 · Global Constraints
- **DDL nur via `apply_migration`**; danach `list_migrations` → File `supabase/migrations/<recordedV>_<name>.sql` == recorded version committen (Regel 2, Schritt 3+4). Twin-Drift-Falle.
- **Money-kritisch:** `npx vitest run src/lib/finance` nach JEDEM TS-Task grün. Keine Beträge/USt-Logik ändern.
- **tsc lokal mit** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (Default-Heap OOM't → false „clean"). CI autoritativ.
- **Prod-Fakten (verifiziert 2026-07-08):** `makler_provisionen`=2, `werkstatt_provisionen`=7, beide staffel_bonus=0, `partner_provisionen`=0, `partner_staffel_bonus`=0, `partner_gutschriften`=0. Phase-0-Tabellen existieren (recorded `20260707225349` / `20260707225415`).
- **Koordination:** Provisions-Tabellen sind Hot-Files (makler/werkstatt/leads/cron-Sessions). Vor Phase-Start `git fetch` + Marker prüfen. Lane = `kitta/provision-ledger-unifikation`.
- **RLS:** `partner_provisionen`/`partner_staffel_bonus` sind bereits gegatet (Phase 0). Keine neuen Grants in Phase 1.

---

## 3 · Task-Übersicht (Reihenfolge = Abhängigkeit)

| # | Titel | Art | Money-kritisch | Datei(en) |
|---|---|---|---|---|
| 0 | Baseline-Verifikation + Regressions-Snapshot | READ | — | (prod-Query) |
| 1 | `insertPartnerProvision`-Seam (TS-Referenz + Phase-4-Smoke-Hook) | TS+Test | nein | neu `src/lib/finance/insert-partner-provision.ts` |
| 2 | DB: makler-Provisions-Trigger → `partner_provisionen` (partner_typ='makler') | DDL | **JA** | apply_migration |
| 3 | DB: werkstatt-Provisions-Trigger → `partner_provisionen` (partner_typ='werkstatt') | DDL | **JA** | apply_migration |
| 4 | DB: beide Staffel-Bonus-Pfade → auf `partner_provisionen` re-ankern + `partner_staffel_bonus` schreiben | DDL | **JA** | apply_migration |
| 5 | `convert-lead-to-claim.ts` Value-Loop-READ → `partner_provisionen` | TS+Test | nein (Notification-Betrag) | `src/lib/leads/convert-lead-to-claim.ts` |
| 6 | `provision-status.ts` META 5→3 (partner_typ-abgeleitet) | TS+Test | **JA** | `src/lib/finance/provision-status.ts` (+ `.test.ts`) |
| 7 | `database.types.ts` chirurgische Ergänzung (2 Tabellen) | TS | nein | `src/lib/supabase/database.types.ts` |
| 8 | Cron-Routes: Resolution (bleiben 2, filtern partner_typ) | TS+Test | **JA** | beide `route.ts` |
| 9 | Phase-1-Gate: full tsc + vitest finance + Ratchets, Commit-Audit | Verify | — | — |

**Money-kritisch: Tasks 2, 3, 4, 6, 8.** Task 6+8 fassen die Auszahl-/Freigabe-/Storno-/Cron-Logik an; 2/3/4 die Entstehung der Geld-Rows.

---

## Task 0 — Baseline-Verifikation + Regressions-Snapshot (READ)

**Zweck:** Vor DDL den Ist-Zustand einfrieren, damit „verhaltensneutral" beweisbar ist.

**Schritte (via `execute_sql`, project_id `paizkjajbuxxksdoycev`):**
1. Row-Counts (siehe Global Constraints) erneut ziehen — falls andere Sessions Test-Rows angelegt haben, Zahlen notieren.
2. Trigger-Inventar snapshotten:
   ```sql
   select p.tgname, c.relname, pr.proname
   from pg_trigger p join pg_class c on c.oid=p.tgrelid join pg_proc pr on pr.oid=p.tgfoid
   where not p.tgisinternal and pr.proname in
     ('create_makler_provision','create_werkstatt_provision',
      'trg_award_makler_staffel','trg_award_werkstatt_staffel','derive_claim_id_from_fall')
   order by c.relname, p.tgname;
   ```
   Erwartung: `trg_makler_provision_on_bridge` ON `faelle_claim_bridge`; `trg_werkstatt_provision_on_claim` ON `claims`; `trg_award_makler_staffel` + `trg_derive_claim_id` ON `makler_provisionen`; `trg_award_staffel` ON `werkstatt_provisionen`.
3. Funktions-Bodies der 4 Insert-/Award-Funktionen via `pg_get_functiondef` sichern (in den Migration-Kommentar der Tasks 2-4 als „vorher"-Referenz — die Rewrites müssen jede WHEN-/COALESCE-/CONFLICT-Klausel erhalten).

**Kein Commit** (READ-only). **Output:** die „vorher"-Bodies liegen bereit für die apply_migration-Payloads.

---

## Task 1 — `insertPartnerProvision`-Seam (TS-Referenz, nicht im kritischen Pfad)

**Datei (neu):** `src/lib/finance/insert-partner-provision.ts` — **kein `'use server'`** (reiner Lib-Helper; AGENTS §Server-Actions: keine Konst/Typen aus 'use server'). db wird injiziert → im vitest testbar.

**Warum überhaupt:** Der Parent-Plan-Phase-4-Smoke ruft „tsx-Direktcall des Seams" gegen prod, um einen Provisions-Insert OHNE den vollen Claim-Trigger-Pfad zu testen. Dieser Helper IST dieser Seam. Er ist NICHT der Produktions-Schreibweg (das bleiben die DB-Trigger). Kein App-Code ruft ihn in Phase 1.

**Signatur (exakt):**
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export type PartnerProvisionInput = {
  partnerTyp: 'makler' | 'werkstatt'
  partnerId: string
  claimId?: string | null
  fallId?: string | null
  betragNettoEur: number
  triggerEvent?: string
  triggerAt?: string          // ISO; default now()
  holdUntil?: string          // ISO; default now()+7d
  status?: string             // default 'pending'
  // makler-spezifisch (bei werkstatt weglassen → null):
  leadId?: string | null
  promotionCodeId?: string | null
  serviceTyp?: string | null
  // werkstatt-spezifisch:
  claimNummer?: string | null
}

export async function insertPartnerProvision(
  db: SupabaseClient<any>,
  input: PartnerProvisionInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }>
```

**Implementierung:** baut das Insert-Objekt (nur gesetzte Felder + Defaults), `.from('partner_provisionen').insert({partner_typ: input.partnerTyp, partner_id: input.partnerId, …}).select('id').single()`. Bei `error` → `{ok:false,error:error.message}`. Spaltenmapping exakt gegen `20260707225349_partner_provisionen_union_table.sql` (partner_typ, partner_id, claim_id, fall_id, lead_id, promotion_code_id, service_typ, claim_nummer, betrag_netto_eur, trigger_event, trigger_at, hold_until, status). USt-Spalten (`ust_satz`/`ust_betrag`/`betrag_brutto`) NICHT setzen (die friert `auszahlenProvision` ein).

**TDD:**
1. **RED** — `src/lib/finance/insert-partner-provision.test.ts`:
   - `it('setzt partner_typ + partner_id + makler-Felder, kein werkstatt-Feld')` — fake db, prüft das an `.insert()` übergebene Objekt: `partner_typ:'makler'`, `service_typ` gesetzt, `claim_nummer` NICHT im Objekt (bzw. null).
   - `it('setzt partner_typ=werkstatt + claim_nummer, kein lead/promotion')`.
   - `it('default status=pending, hold_until ~ now+7d, trigger_at gesetzt')`.
   - `it('gibt {ok:false} bei db-error zurück')`.
   - fake-db-Muster wie `provision-status.test.ts:18` (`fakeDb`) adaptiert: `from().insert(obj) → capture obj → return {select:()=>({single:()=>({data:{id:'x'},error:null})})}`.
2. **Command:** `npx vitest run src/lib/finance/insert-partner-provision.test.ts` → schlägt fehl (Modul fehlt).
3. **GREEN:** Helper implementieren. Rerun → grün.
4. **Commit:** `feat(provision-unifikation): insertPartnerProvision write-seam (Referenz + Phase-4-Smoke-Hook)`.

**Audit-Notiz für Commit:** Redundanz — kein bestehender Provisions-Insert-Helper existiert (grep 0). UI — n/a. Regression — kein Consumer, additiv.

---

## Task 2 — DB: makler-Provisions-Trigger → `partner_provisionen` (MONEY-KRITISCH)

**Was:** `create_makler_provision()` so umschreiben, dass es statt `makler_provisionen` in `partner_provisionen (partner_typ='makler', partner_id=<makler>, …)` inserted. Trigger-Anker (`trg_makler_provision_on_bridge` ON `faelle_claim_bridge`) UNVERÄNDERT.

**Kritische Erhaltungspunkte (prod-verifiziert 2026-07-08 via `pg_get_functiondef`):**
- `NEW` = `faelle_claim_bridge`-Row (`.claim_id`, `.fall_id`).
- Liest makler/service/lead aus `claims WHERE id=NEW.claim_id`; früh-`RETURN NEW` bei `v_makler IS NULL`.
- **🔴 KRITISCH — NICHT VERGESSEN: die Funktion INSERTet VOR dem `provision_aktiv`-Gate eine `makler_fall_consent`-Zeile** (`(fall_id, claim_id, makler_id, 'vollzugriff', now())` `ON CONFLICT (fall_id, makler_id) DO NOTHING`). Grund im Original-Kommentar: „Sichtbarkeit != Provisions-Eligibility — auch ein Makler ohne aktive Provision soll seinen vermittelten Fall sehen." **Dieser INSERT-Ziel-Tabelle (`makler_fall_consent`) ändert sich NICHT — nur der Provisions-INSERT zieht um.** Ein früher Plan-Entwurf ließ diesen Block weg → hätte Makler-Fall-Sichtbarkeit gebrochen. Verbatim erhalten.
- Liest `provision_betrag_komplett_netto`/`_nur_gutachter_netto`/`provision_aktiv` aus `makler`; früh-`RETURN NEW` bei `NOT provision_aktiv`.
- dual-rate: `lower(service) LIKE '%komplett%' → COALESCE(komplett,100) ELSE COALESCE(gutachter,50)`.
- Liest `promotion_code_id` aus `leads WHERE id=v_lead`.
- **`SET search_path TO 'public'`** in der Funktions-Signatur erhalten (SECURITY-DEFINER-Härtung — Original hat es).
- Idempotenz: **`ON CONFLICT (claim_id) WHERE claim_id IS NOT NULL DO NOTHING`** (Original: partieller Unique `makler_provisionen_claim_id_uniq`) — auf `partner_provisionen` als `(partner_typ, claim_id) WHERE claim_id IS NOT NULL` nachgebildet.

**⚠ Blocker-Vorarbeit in DERSELBEN Migration:** `partner_provisionen` hat aus Phase 0 KEINEN Unique-Index auf `claim_id` (der Alt-Table hatte `makler_provisionen_claim_id_uniq WHERE claim_id IS NOT NULL`). Ohne ihn schlägt `ON CONFLICT (claim_id)` fehl (kein Constraint) UND es entstünden Doppel-Provisionen bei Retry. Aber: `partner_provisionen` hält makler UND werkstatt — ein globaler Unique auf `claim_id` würde makler+werkstatt-Provision desselben Claims kollidieren lassen (ein Claim kann BEIDE haben, s. MEMORY werkstatt-auftrag: „ein Claim kann WS in beiden Rollen haben"; makler+werkstatt erst recht). **Lösung: partieller Unique-Index pro (partner_typ, claim_id):**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS partner_provisionen_typ_claim_uniq
  ON public.partner_provisionen (partner_typ, claim_id) WHERE claim_id IS NOT NULL;
```
Dann `ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING`.

**apply_migration payload (name `partner_provisionen_makler_trigger_switch`):**
```sql
-- Phase 1: makler-Provision entsteht ab jetzt in partner_provisionen (partner_typ='makler').
-- Alt-Tabelle makler_provisionen bleibt (Reader bis Phase 2, Bestand bis Phase 3).
CREATE UNIQUE INDEX IF NOT EXISTS partner_provisionen_typ_claim_uniq
  ON public.partner_provisionen (partner_typ, claim_id) WHERE claim_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_makler_provision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_makler uuid; v_service text; v_lead uuid;
  v_komplett numeric(10,2); v_gutachter numeric(10,2); v_aktiv boolean;
  v_betrag numeric(10,2); v_promo uuid;
BEGIN
  SELECT makler_id, service_typ, lead_id INTO v_makler, v_service, v_lead
    FROM public.claims WHERE id = NEW.claim_id;
  IF v_makler IS NULL THEN RETURN NEW; END IF;

  -- UNVERAENDERT erhalten (Ziel-Tabelle makler_fall_consent zieht NICHT um): Sichtbarkeit VOR
  -- dem provision_aktiv-Gate — auch ein Makler ohne aktive Provision sieht seinen Fall.
  INSERT INTO public.makler_fall_consent (fall_id, claim_id, makler_id, consent_scope, consent_gegeben_am)
  VALUES (NEW.fall_id, NEW.claim_id, v_makler, 'vollzugriff', now())
  ON CONFLICT (fall_id, makler_id) DO NOTHING;

  SELECT provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto, provision_aktiv
    INTO v_komplett, v_gutachter, v_aktiv FROM public.makler WHERE id = v_makler;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;
  v_betrag := CASE WHEN lower(COALESCE(v_service, '')) LIKE '%komplett%'
                   THEN COALESCE(v_komplett, 100) ELSE COALESCE(v_gutachter, 50) END;
  SELECT promotion_code_id INTO v_promo FROM public.leads WHERE id = v_lead;
  -- NUR dieser INSERT zieht um: makler_provisionen -> partner_provisionen (partner_typ='makler').
  INSERT INTO public.partner_provisionen
    (partner_typ, partner_id, claim_id, fall_id, lead_id, promotion_code_id,
     betrag_netto_eur, service_typ, trigger_event, trigger_at, hold_until, status)
  VALUES
    ('makler', v_makler, NEW.claim_id, NEW.fall_id, v_lead, v_promo,
     v_betrag, v_service, 'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $$;
```
(Trigger `trg_makler_provision_on_bridge` NICHT neu erstellen — bleibt auf der Funktion. `trg_derive_claim_id`/`derive_claim_id_from_fall` ist ein BEFORE-Trigger auf der ALTEN `makler_provisionen` — er wird durch den Umzug bedeutungslos für neue Rows und in Phase 3 mit der Tabelle gedroppt; `partner_provisionen` braucht ihn nicht, weil der Trigger `claim_id` bereits direkt aus `NEW.claim_id` setzt.)

**Verify (execute_sql, READ):**
- `pg_get_functiondef` zeigt `INSERT INTO public.partner_provisionen`.
- Test-Insert-Simulation (NUR falls ein sicherer Test-Claim-Pfad existiert — sonst Phase 4): ODER minimal: `select count(*) from partner_provisionen where partner_typ='makler'` bleibt 0 (kein neuer Claim in der Migration).

**Regel-2-Abschluss:** `list_migrations` → recorded Version <V> ablesen → File `supabase/migrations/<V>_partner_provisionen_makler_trigger_switch.sql` (Inhalt == payload) committen.

**Commit:** `feat(provision-unifikation): makler-Provisions-Trigger schreibt partner_provisionen (partner_typ=makler)`. Audit: Spec — dual-rate/aktiv-Gate/promo/Idempotenz 1:1 erhalten, nur INSERT-Ziel + CONFLICT-Key geändert; Regression — Anker + WHEN unverändert.

---

## Task 3 — DB: werkstatt-Provisions-Trigger → `partner_provisionen` (MONEY-KRITISCH)

**Was:** `create_werkstatt_provision()` → INSERT `partner_provisionen (partner_typ='werkstatt', …)`. Anker `trg_werkstatt_provision_on_claim` ON `claims` UNVERÄNDERT.

**Kritische Erhaltungspunkte (aus `20260622130635…:5-19`):**
- `NEW` = `claims`-Row. `NEW.werkstatt_id IS NULL → RETURN`. `provision_betrag_netto`/`provision_aktiv` aus `werkstaetten`; `NOT aktiv → RETURN`. `COALESCE(v_betrag,150)`. `fall_id := NEW.id`. `ON CONFLICT (claim_id) DO NOTHING`.
- **claim_nummer — RESOLVED (prod-verifiziert 2026-07-08):** Der reale `create_werkstatt_provision()` setzt `claim_nummer` **bereits direkt im Insert** aus `NEW.claim_nummer` (letzte VALUES-Spalte). Und `set_claim_nummer` ist bestätigt ein **BEFORE INSERT**-Trigger auf `claims` (`trg_claims_claim_nummer`, `pg_trigger`-Timing verifiziert) → zur AFTER-INSERT-Zeit von `create_werkstatt_provision` ist `NEW.claim_nummer` schon gefüllt (`CLM-YYYY-NNNNN`). **Also: keine separate Denormalisierungs-Migration, kein Trigger ON `werkstatt_provisionen` für claim_nummer.** Der neue Insert übernimmt `NEW.claim_nummer` unverändert — der werkstatt-Reader (`werkstatt/queries.ts:131`) bekommt sie weiter. Keine Recherche mehr offen.
- **`SET search_path TO 'public'`** in der Signatur erhalten (Original hat es).
- Idempotenz-Original: `ON CONFLICT (claim_id) DO NOTHING` auf dem **vollen** Unique `idx_werkstatt_provisionen_claim` (NICHT partiell). Auf `partner_provisionen` vereinheitlicht zu `(partner_typ, claim_id) WHERE claim_id IS NOT NULL` (deckt makler+werkstatt getrennt).

**apply_migration payload (name `partner_provisionen_werkstatt_trigger_switch`):**
```sql
CREATE OR REPLACE FUNCTION public.create_werkstatt_provision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_betrag numeric(10,2); v_aktiv boolean;
BEGIN
  IF NEW.werkstatt_id IS NULL THEN RETURN NEW; END IF;
  SELECT provision_betrag_netto, provision_aktiv INTO v_betrag, v_aktiv
    FROM public.werkstaetten WHERE id = NEW.werkstatt_id;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;
  INSERT INTO public.partner_provisionen
    (partner_typ, partner_id, claim_id, fall_id, claim_nummer,
     betrag_netto_eur, trigger_event, trigger_at, hold_until, status)
  VALUES
    ('werkstatt', NEW.werkstatt_id, NEW.id, NEW.id, NEW.claim_nummer,
     COALESCE(v_betrag, 150), 'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $$;
```
> Der partielle Unique-Index aus Task 2 deckt (partner_typ,claim_id) → werkstatt+makler kollidieren nicht. **Timing-Check bei Umsetzung:** ist `NEW.claim_nummer` in diesem AFTER-INSERT-Trigger bereits gefüllt? `set_claim_nummer` ist BEFORE INSERT (`trg_claims_claim_nummer`) → JA, `NEW.claim_nummer` ist gesetzt. Verifizieren via `pg_get_functiondef('set_claim_nummer')` + Trigger-Timing.

**Verify + Regel-2 + Commit:** analog Task 2.

---

## Task 4 — DB: Staffel-Bonus-Pfad re-ankern (MONEY-KRITISCH, subtilster Task)

**Das Problem (cross-table Trigger-Kette):**
Die Staffel-Boni werden von Triggern AUF den Provisions-Tabellen gefeuert:
- `trg_award_makler_staffel` ON `makler_provisionen` AFTER INSERT OR UPDATE OF status → `award_makler_staffel_boni(NEW.makler_id)`.
- `trg_award_staffel` ON `werkstatt_provisionen` AFTER INSERT OR UPDATE OF status → `award_werkstatt_staffel_boni(NEW.werkstatt_id)`.

Nach Task 2+3 entstehen neue Provisionen in `partner_provisionen`, und der **Release-Cron** (Task 8) UPDATE't dort den Status. Die Trigger auf den Alt-Tabellen feuern dann NIE mehr für neue Rows → **Staffel-Boni werden nie vergeben**. Zusätzlich lesen die Award-Funktionen den settled-count aus der Alt-Tabelle (`FROM makler_provisionen WHERE …`), die für neue Rows leer ist → count wäre falsch.

**Dreiteilige Lösung in EINER Migration (`name partner_staffel_bonus_reanchor`):**

**(a) Award-Funktionen: count aus `partner_provisionen` (typ-gefiltert) + INSERT in `partner_staffel_bonus`:**
```sql
CREATE OR REPLACE FUNCTION public.award_makler_staffel_boni(p_makler_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF p_makler_id IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO v_count FROM public.partner_provisionen
   WHERE partner_typ='makler' AND partner_id = p_makler_id AND status IN ('freigegeben','ausgezahlt');
  INSERT INTO public.partner_staffel_bonus
    (partner_typ, partner_id, stufe_id, schwelle, bonus_betrag_netto, status)
  SELECT 'makler', s.makler_id, s.id, s.schwelle, s.bonus_betrag_netto, 'freigegeben'
    FROM public.makler_staffel_stufen s
   WHERE s.makler_id = p_makler_id AND s.schwelle <= v_count
  ON CONFLICT (partner_typ, partner_id, schwelle) DO NOTHING;
END; $$;
```
(analog `award_werkstatt_staffel_boni` mit `partner_typ='werkstatt'`, `werkstatt_staffel_stufen`, `werkstatt_id`.)
> **⚠ Config-Tabellen bleiben:** `makler_staffel_stufen` / `werkstatt_staffel_stufen` (die Schwellen-Konfig) sind NICHT Teil der Unifikation (nur die *_bonus-Vergabe-Tabellen) → weiter aus den Alt-Config-Tabellen lesen. Das ist korrekt.
> **⚠ Unique-Index nötig:** `partner_staffel_bonus` braucht `UNIQUE (partner_typ, partner_id, schwelle)` (Phase 0 hat ihn NICHT — die Alt-Tabellen hatten `UNIQUE(makler_id, schwelle)`). In dieser Migration voranstellen:
> ```sql
> CREATE UNIQUE INDEX IF NOT EXISTS partner_staffel_bonus_typ_partner_schwelle_uniq
>   ON public.partner_staffel_bonus (partner_typ, partner_id, schwelle);
> ```

**(b) Award-Trigger auf `partner_provisionen` neu erstellen (typ-verzweigt in EINER Trigger-Funktion):**
```sql
CREATE OR REPLACE FUNCTION public.trg_award_partner_staffel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.partner_typ = 'makler' THEN
    PERFORM public.award_makler_staffel_boni(NEW.partner_id);
  ELSIF NEW.partner_typ = 'werkstatt' THEN
    PERFORM public.award_werkstatt_staffel_boni(NEW.partner_id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_award_partner_staffel ON public.partner_provisionen;
CREATE TRIGGER trg_award_partner_staffel
  AFTER INSERT OR UPDATE OF status ON public.partner_provisionen
  FOR EACH ROW EXECUTE FUNCTION public.trg_award_partner_staffel();
```

**(c) Alt-Trigger auf den Alt-Provisions-Tabellen abschalten (damit Bestand nicht doppelt feuert):**
Der Bestand (2 makler + 7 werkstatt) bleibt in den Alt-Tabellen bis Phase 3. Deren Status wird in Phase 1+ NICHT mehr vom Cron angefasst (Cron liest ab Task 8 `partner_provisionen`). Also feuern die Alt-Trigger `trg_award_makler_staffel`/`trg_award_staffel` faktisch nie mehr. **Trotzdem sauber droppen** (Dead-Trigger + sie zeigen auf die alten Award-Funktions-Bodies, die wir gerade umgeschrieben haben → würden bei einem manuellen Alt-Table-UPDATE jetzt aus `partner_provisionen` zählen = inkonsistent):
```sql
DROP TRIGGER IF EXISTS trg_award_makler_staffel ON public.makler_provisionen;
DROP TRIGGER IF EXISTS trg_award_staffel ON public.werkstatt_provisionen;
```
> **Award-*Funktionen* NICHT droppen — RESOLVED (grep-verifiziert 2026-07-08):** sie werden ZUSÄTZLICH zur Trigger-Kette **direkt aus dem App-Code** gerufen: `admin/makler/staffel-actions.ts:72` (`admin.rpc('award_makler_staffel_boni', {p_makler_id})`) + `admin/werkstaetten/staffel-actions.ts:71` (`award_werkstatt_staffel_boni`). Das sind manuelle Admin-„Bonus jetzt prüfen/vergeben"-Actions. Nach dem Rewrite zählen sie aus `partner_provisionen` (typ-gefiltert) — korrekt für neue Rows. **⚠ Bewusster Trade-off im Phase-1→3-Fenster:** die 9 Bestands-Provisionen (2 makler/7 werkstatt) liegen bis Phase 3 in den ALT-Tabellen → ein manueller Admin-Award für einen dieser Bestands-Partner würde `count=0` aus `partner_provisionen` sehen (unterzählt) und keinen Bonus vergeben. Da (a) Bestand = Test-Account-Daten, (b) beide staffel_bonus-Tabellen ohnehin 0 Zeilen haben, (c) der Award idempotent (`ON CONFLICT DO NOTHING`) + nach Phase-3-Backfill selbstheilend ist, ist das akzeptabel — aber im PR-Body als bekanntes Fenster nennen. Die Signatur (`p_makler_id`/`p_werkstatt_id`) bleibt unverändert → die Admin-Actions brechen nicht.

**Verify (READ):** `pg_get_functiondef` beider award-Fns zeigt `FROM public.partner_provisionen`; `trg_award_partner_staffel` existiert ON `partner_provisionen`; Alt-Award-Trigger weg (`pg_trigger`-Recount).

**Regel-2 + Commit:** `feat(provision-unifikation): Staffel-Bonus-Vergabe re-ankern auf partner_provisionen + partner_staffel_bonus`. Audit: Spec — settled-count-Semantik (freigegeben+ausgezahlt) + Idempotenz-CONFLICT erhalten; Regression — Config-Stufen-Tabellen unverändert, Bestand kann keine Doppel-Boni mehr triggern.

---

## Task 5 — `convert-lead-to-claim.ts` Value-Loop-READ auf `partner_provisionen`

**Datei:** `src/lib/leads/convert-lead-to-claim.ts:880-889`.

**Warum (verhaltensneutral-Erhalt):** Nach Task 2 entsteht die makler-Provision in `partner_provisionen`. Die Value-Loop-Notification liest sie aber aus `makler_provisionen` (leer für neue Claims) → `betragEur=undefined` → die Email/Notification zeigt keinen Betrag mehr. Rein kosmetisch (Notification, nicht Geld), aber es ist eine sichtbare Regression → mitziehen.

**Change (exakt):**
```typescript
// vorher (:880)
const { data: prov } = await admin
  .from('makler_provisionen')
  .select('betrag_netto_eur')
  .eq('fall_id', fallId)
  .eq('makler_id', maklerId)
  .order('trigger_at', { ascending: false })
  .limit(1)
  .maybeSingle()
// nachher
const { data: prov } = await admin
  .from('partner_provisionen')
  .select('betrag_netto_eur')
  .eq('partner_typ', 'makler')
  .eq('fall_id', fallId)
  .eq('partner_id', maklerId)
  .order('trigger_at', { ascending: false })
  .limit(1)
  .maybeSingle()
```
> `makler_id` → `partner_id`, plus `.eq('partner_typ','makler')`. Kommentar `:449` + `:873` (nennen `makler_provisionen`/`trg_makler_provision_on_bridge`) auf `partner_provisionen` aktualisieren (Kommentar-Ehrlichkeit; ASCII ok da Backend).

**TDD:** Dieses File hat vermutlich keinen isolierten Unit-Test für die Value-Loop (der Insert-Pfad ist DB-Trigger-getrieben). **Verifikationsart:** tsc-grün (Task 9) + Phase-4-Prod-Smoke (Provision-Trigger makler → Notification-Betrag lesbar). Falls ein `convert-lead-to-claim.test.ts` existiert (`grep`): den `.from('makler_provisionen')`-Mock auf `partner_provisionen` anpassen. Kein neuer Test-Zwang (Read-Change, kein Verhalten).

**Commit:** `refactor(provision-unifikation): convert-lead Value-Loop liest partner_provisionen (partner_typ=makler)`.

---

## Task 6 — `provision-status.ts` META 5→3 (MONEY-KRITISCH)

**Ziel:** Die 5 META-Einträge auf 3 kollabieren, wobei der **`tabelle`-Argument-Contract erhalten bleibt** (s. Money-Path-Entscheidung §1). Kern-Einsicht: In Phase 1 rufen die Caller `auszahlen`/`freigeben`/`storniere` weiterhin mit `'makler_provisionen'`/`'werkstatt_provisionen'` (aus dem unveränderten View). **Diese Keys müssen also als `ProvisionTabelle` gültig bleiben UND auf die richtige DB-Tabelle zeigen.**

**Die Design-Frage:** Zeigen `makler_provisionen`/`werkstatt_provisionen` in der META auf die Alt- oder die Union-Tabelle?
- Der Bestand (2+7 Zeilen) liegt in den ALT-Tabellen. `v_partner_billing` (Phase 1 unverändert) zeigt NUR Bestand → Caller rufen `auszahlen('makler_provisionen', <bestand-id>)`. `auszahlenProvision` liest `.from(tabelle)` und schreibt Status dorthin. **Für den Bestand MUSS `tabelle` die Alt-Tabelle treffen.**
- Neue Rows (in `partner_provisionen`) sind in Phase 1 für Caller unsichtbar (View liest sie nicht) → `auszahlen('partner_provisionen', …)` wird nie gerufen.

**Fazit:** In Phase 1 ist **keine META-Ziel-Änderung nötig oder korrekt.** Die 5→3-Kollaps ist ein **Phase-2**-Schritt (zusammen mit dem View-Umbau, wenn `quelle_tabelle='partner_provisionen'` wird). **In Phase 1 wird `provision-status.ts` NICHT verändert** — außer optional der Zeilen-Kommentar `:20-25` (Doku), der aber inhaltlich noch stimmt.

> **Das ist eine bewusste Scope-Korrektur gegenüber dem Parent-Plan-Stub**, der die META-Kollaps in Phase 1 verortet. Sie gehört in Phase 2, weil sie mit dem View + `ledger_tabelle` gekoppelt ist (dieselbe Invariante, §1). Sie in Phase 1 zu machen bräche den Bestands-Payout (der Guard `PROVISION_TABELLEN.includes(quelle)` + das `.from(tabelle)`-Ziel).

**→ Task 6 ist in Phase 1 ein NO-OP am Code.** Er bleibt als expliziter Eintrag stehen, damit der Umsetzer die Analyse nachvollzieht und NICHT „hilfsbereit" die META anfasst. **Falls** Review dennoch will, dass Phase 1 die Union-Ziele vorbereitet, ist der einzige verhaltensneutrale Weg: eine NEUE, additive `ProvisionTabelle`-Variante `'partner_provisionen'`/`'partner_staffel_bonus'` in META HINZUFÜGEN (ohne die alten zu entfernen), mit `partner`-FK typ-abgeleitet — aber ohne Caller bringt das nichts und bläht die Union auf. **Empfehlung: echtes No-Op, dokumentiert.**

**Verifikation:** `npx vitest run src/lib/finance/provision-status.test.ts` bleibt grün (unverändert). **Kein Commit** (kein Change) — oder ein Doku-Only-Commit am Kommentar, falls gewünscht.

---

## Task 7 — `database.types.ts` chirurgische Ergänzung

**Warum:** Task 1 (`insertPartnerProvision`) + Task 5 (Read auf `partner_provisionen`) + Task 8 (Cron auf `partner_provisionen`) referenzieren `.from('partner_provisionen')` / `.from('partner_staffel_bonus')`. Die generierten Types kennen diese Tabellen noch NICHT (Phase 0 hat Types nicht regeneriert — Regel-2-Schritt 6 aufgeschoben). Ohne Typ-Eintrag ist der Table-Name für `supabase-js` `never` → tsc-Fehler an jedem `.from(...)`.

**Ansatz (KEIN Full-Regen — Merge-Kollision mit anderen Sessions):** Die zwei `Tables`-Einträge chirurgisch von Hand einfügen, spiegelbildlich zum bestehenden `makler_provisionen`-Block (`database.types.ts:10716`) + `makler_staffel_bonus` (`:10928`), aber mit den Union-Spalten aus `20260707225349`/`225415`.

**Exakt einzufügen** (im `public.Tables`-Objekt, alphabetisch bei `partner_*` — neben `partner_gutschriften`):
```typescript
partner_provisionen: {
  Row: {
    id: string
    partner_typ: string
    partner_id: string
    claim_id: string | null
    fall_id: string | null
    lead_id: string | null
    promotion_code_id: string | null
    service_typ: string | null
    abrechnung_id: string | null
    claim_nummer: string | null
    ausgezahlt_am: string | null
    betrag_netto_eur: number | null
    ust_satz: number | null
    ust_betrag: number | null
    betrag_brutto: number | null
    trigger_event: string | null
    trigger_at: string | null
    hold_until: string | null
    status: string | null
    storniert_am: string | null
    storno_grund: string | null
    erstellt_am: string
  }
  Insert: {
    id?: string
    partner_typ: string
    partner_id: string
    claim_id?: string | null
    fall_id?: string | null
    lead_id?: string | null
    promotion_code_id?: string | null
    service_typ?: string | null
    abrechnung_id?: string | null
    claim_nummer?: string | null
    ausgezahlt_am?: string | null
    betrag_netto_eur?: number | null
    ust_satz?: number | null
    ust_betrag?: number | null
    betrag_brutto?: number | null
    trigger_event?: string | null
    trigger_at?: string | null
    hold_until?: string | null
    status?: string | null
    storniert_am?: string | null
    storno_grund?: string | null
    erstellt_am?: string
  }
  Update: { /* alle Felder optional, gleiche Typen */ }
  Relationships: []
}
partner_staffel_bonus: {
  Row: {
    id: string
    partner_typ: string
    partner_id: string
    stufe_id: string | null
    schwelle: number | null
    bonus_betrag_netto: number | null
    ust_satz: number | null
    ust_betrag: number | null
    betrag_brutto: number | null
    status: string | null
    erstellt_am: string
  }
  Insert: { id?: string; partner_typ: string; partner_id: string; stufe_id?: string | null; schwelle?: number | null; bonus_betrag_netto?: number | null; ust_satz?: number | null; ust_betrag?: number | null; betrag_brutto?: number | null; status?: string | null; erstellt_am?: string }
  Update: { /* alle optional */ }
  Relationships: []
}
```
> Spalten-Nullability EXAKT aus den Phase-0-Migrations: nur `id`/`partner_typ`/`partner_id`/`erstellt_am` sind NOT NULL; alle anderen nullable (die Migration setzt keine NOT-NULL auf `betrag_*`/`status`/etc.). `Relationships: []` — die Union-Table hat KEINE FKs (Phase 0 legte keine an; `partner_id` ist polymorph, absichtlich kein FK). Das matcht den PostgREST-Embed-Verzicht.

**Verifikation:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` grün (die `.from('partner_provisionen')`-Sites aus Tasks 1/5/8 typen jetzt). **Commit** (kann mit Task 8 gebündelt werden, da erst dann alle Consumer da sind): `chore(provision-unifikation): database.types partner_provisionen/partner_staffel_bonus (surgical, no full regen)`.

---

## Task 8 — Cron-Routes: hold_until→freigegeben auf `partner_provisionen` (MONEY-KRITISCH)

**Resolution-Entscheidung: die zwei Crons BLEIBEN zwei getrennte Routes, beide lesen/schreiben `partner_provisionen` mit `.eq('partner_typ', <typ>)`.** Begründung:
- Sie sind funktional NICHT identisch: der makler-Cron feuert `emitEvent('makler.provision_status')`-Notifications (`route.ts:97`), der werkstatt-Cron NICHT (Kommentar `:11` „Werkstätten sehen Provisionen im Portal"). Ein Merge zu einem Cron würde die Notification-Asymmetrie in Verzweigungslogik gießen — mehr Risiko, kein Gewinn.
- Getrennte Crons = getrennte Cron-Schedule-Einträge (VPS crontab), getrennte Fehler-Isolation, getrennte Metriken. Kein Grund zu mergen.
- **Partner_typ-Filter ist Pflicht**, sonst würde der makler-Cron werkstatt-Rows freigeben (und umgekehrt) — RLS greift bei `createAdminClient` (service_role) NICHT.

**makler-Cron (`src/app/api/cron/release-makler-provisionen/route.ts`):**
- `:47` `.from('makler_provisionen')` → `.from('partner_provisionen')`, `.select('id, fall_id, claim_id, betrag_netto_eur, service_typ, hold_until, makler_id')` → `makler_id` durch `partner_id` ersetzen: `.select('id, fall_id, claim_id, betrag_netto_eur, service_typ, hold_until, partner_id')`, **neu `.eq('partner_typ','makler')`** vor `.eq('status','pending')`.
- `PendingRow.makler_id` → `partner_id` (Typ `:26` + Nutzung `:99` `maklerId: p.makler_id` → `p.partner_id`).
- Storno-UPDATE `:120` `.from('makler_provisionen')` → `.from('partner_provisionen')` + `.eq('partner_typ','makler')` zusätzlich zu `.in('id', stornoIds)` (defense-in-depth; IDs sind schon typ-gefiltert, aber der Filter macht die Query selbstdokumentierend + schützt vor ID-Kollision über Typen — IDs sind uuid-unique, also strikt redundant, aber billig).
- Release-UPDATE `:145` analog.
- `notifyMakler` `:99` nutzt `p.makler_id` → `p.partner_id`.

**werkstatt-Cron (`src/app/api/cron/release-werkstatt-provisionen/route.ts`):**
- `:40` `.from('werkstatt_provisionen').select('id, claim_id, hold_until')` → `.from('partner_provisionen')` + **`.eq('partner_typ','werkstatt')`**.
- Storno-UPDATE `:84` + Release-UPDATE `:111` → `.from('partner_provisionen')` (+ optional `.eq('partner_typ','werkstatt')`).
- Keine `makler_id`/`partner_id`-Umbenennung nötig (werkstatt-Cron liest nur `id, claim_id, hold_until`).

**⚠ Wichtig — die Staffel-Trigger-Kopplung:** Der Release-UPDATE `status → 'freigegeben'` feuert jetzt `trg_award_partner_staffel` ON `partner_provisionen` (Task 4b) → settled-count wächst → Boni werden vergeben. Das ist der GEWOLLTE Ersatz für die alten `trg_award_*`-Trigger. **Verifikationspunkt:** nach Task 4+8 muss ein Release eines makler-`partner_provisionen`-Rows (settled-count überschreitet Schwelle) einen `partner_staffel_bonus`-Eintrag erzeugen (Phase-4-Smoke).

**TDD:** Die Crons haben aktuell KEINEN Test (`Glob src/app/api/cron/release-*-provisionen/*.test.ts` → 0). Empfehlung: **pure Filter-Logik extrahieren ist zu invasiv** für Phase 1. Stattdessen minimaler Route-Level-Test mit fake-`createAdminClient`:
1. **RED** — `route.test.ts` je Cron: mockt `@/lib/supabase/admin` `createAdminClient` mit einem fake-db, der `from('partner_provisionen')`-Queries erwartet und einen pending-Row mit `hold_until` in der Vergangenheit liefert; assertet, dass der Release-UPDATE mit `partner_typ`-Filter + `status:'freigegeben'` gegen `partner_provisionen` läuft. (makler-Cron zusätzlich: `emitEvent` gemockt, wird gerufen.)
2. **Command:** `npx vitest run src/app/api/cron/release-makler-provisionen` (+ werkstatt).
3. **GREEN:** Route-Änderungen. Rerun grün.
> Falls Route-Tests wegen `NextResponse`/`next/server`-Import im vitest-Setup zu schwer sind (bekanntes Reibung), Fallback: reiner tsc-Grün + Phase-4-Prod-Smoke als Verifikation, und die Filter-Korrektheit per Code-Review sichern. Test-Aufwand nicht über den Wert treiben — die Crons sind schmale Filter über einem getesteten DB-Verhalten.

**Commit:** `feat(provision-unifikation): Release-Crons lesen/schreiben partner_provisionen (partner_typ-gefiltert)`. Audit: Spec — Storno/Release/Notification-Semantik 1:1; Regression — beide Crons getrennt, Notification-Asymmetrie erhalten.

---

## Task 9 — Phase-1-Gate (Verify + Commit-Audit)

**Kein Code** — Abschluss-Verifikation vor PR:
1. `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → grün (KEIN Default-Heap; sonst false-clean).
2. `npx vitest run src/lib/finance` → grün (Money-Path-Tests: `provision-status`, `partner-gutschrift`, `partner-billing`, `partner-billing-actions`, `insert-partner-provision`).
3. `npx vitest run src/app/api/cron/release-makler-provisionen src/app/api/cron/release-werkstatt-provisionen` (falls Route-Tests gebaut).
4. Ratchets: `npm run check:token-audit`, `check:component-set`, `check:knip`, `check:status-registry` → 0 neu (rein Backend/DDL, sollte 0 sein).
5. `git status` clean, `git stash list` leer (Regel 3), `git log --branches --not --remotes` alle gepusht.
6. **DB-Konsistenz-Recheck (execute_sql):** Trigger-Inventar erneut ziehen → `create_makler_provision`/`create_werkstatt_provision` INSERTen `partner_provisionen`; `trg_award_partner_staffel` ON `partner_provisionen` existiert; Alt-Award-Trigger weg; `partner_provisionen`-Count noch 0 (kein echter Claim in Phase 1 durchgelaufen).

**PR gegen `staging`.** PR-Body MUSS enthalten: „Phase 1 verschiebt neue Provisions-/Bonus-Entstehung nach partner_provisionen; **Reader (v_partner_billing) folgt erst in Phase 2 → neue Rows sind bis Phase 2 im Cockpit unsichtbar (fail-safe, nur Test-Traffic auf prod).** NICHT allein nach main deployen ohne Phase 2." (Money-Path-Kopplung aus §1.)

---

## 4 · Risiken (priorisiert)

1. **[MONEY, HÖCHSTES] Staffel-Bonus-Trigger-Kette bricht still (Task 4).** Wenn die Award-Trigger nicht sauber von den Alt-Tabellen auf `partner_provisionen` re-ankern (oder der partielle Unique fehlt), werden Boni entweder nie vergeben (Trigger feuert nie) oder doppelt (kein CONFLICT-Guard) — beides Geld. Mitigation: Task 4 als eigener Review-Gate, Phase-4-Smoke MUSS einen Bonus-Vergabe-Pfad testen (Provision releasen bis Schwelle → `partner_staffel_bonus`-Row erscheint).

2. **[MONEY] `ON CONFLICT`-Key ohne passenden Unique-Index (Task 2/3/4).** `partner_provisionen`/`partner_staffel_bonus` erbten die Unique-Constraints der Alt-Tabellen NICHT (Phase 0). Ohne den partiellen `(partner_typ, claim_id)`- bzw. `(partner_typ, partner_id, schwelle)`-Index schlägt `ON CONFLICT` mit „no unique constraint matching" fehl → Trigger-Exception → **Claim-Insert bricht** (der Provisions-Trigger ist AFTER INSERT, eine Exception rollt die Claim-Transaktion zurück). Das wäre ein harter Prod-Breaker (kein neuer Claim anlegbar). Mitigation: die Index-DDL steht ZUERST in Task 2/4-Payload; Verify-Query bestätigt Index-Existenz vor dem ersten echten Claim.

3. **[MONEY, SEQUENZ] Phase 1 ohne Phase 2 deployt → neue Provisionen unsichtbar + nicht auszahlbar.** `v_partner_billing` liest bis Phase 2 die Alt-Tabellen; neue Rows in `partner_provisionen` erscheinen nicht im Cockpit → Admin kann sie nicht freigeben/auszahlen, Partner sieht sie nicht im Portal. Fail-safe (kein Fehlbetrag), aber Business-sichtbar. Mitigation: Phase 1+2 als ein PR ODER Phase-1-PR als `[DO NOT DEPLOY ALONE]` markiert + Idle-Merge-Scan-Ausschluss; da prod-Provisionen rein Test-getrieben sind, ist das Fenster real unkritisch — aber dokumentieren.

**Weitere (nachrangig):**
- `claim_nummer`-Timing im werkstatt-Trigger (Task 3): `NEW.claim_nummer` muss zur AFTER-INSERT-Zeit gefüllt sein (via BEFORE-Trigger `set_claim_nummer`) — verifizieren, sonst liest der werkstatt-Portal-Reader null.
- `database.types.ts`-Handeditierung (Task 7) kann bei einem späteren Full-Regen (Phase 3) überschrieben werden — akzeptabel, der Regen produziert dann die echten Typen.
- Kommentar-Drift: viele Files nennen `makler_provisionen`/`trg_makler_provision_on_bridge` in Kommentaren; nur die verhaltensrelevanten (convert-lead `:449/:873`) anfassen, Rest ist harmlos + Phase-2/3-Cleanup.
- `insertPartnerProvision` (Task 1) ist YAGNI-anfällig — nur als Phase-4-Smoke-Hook gerechtfertigt; falls Review ablehnt, streichbar.
