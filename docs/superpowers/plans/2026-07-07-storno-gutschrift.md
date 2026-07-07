# Storno-Gutschrift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (empfohlen). Steps nutzen `- [ ]`.

**Goal:** Bei Storno einer ausgezahlten Provision automatisch eine negative Storno-Gutschrift (Korrekturbeleg + PDF + Zustellung) ausstellen.

**Architecture:** Additive Spalten (`typ`/`bezug_gutschrift_id`/`storno_grund`) + partielles UNIQUE; `erstelleStornoGutschrift`-Baustein (negativ, Snapshots vom Original); Storno-Variante im bestehenden PDF; non-fataler Trigger in `storniereProvision`.

**Tech Stack:** TypeScript, Supabase (Postgres + Migration), react-pdf, vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-storno-gutschrift-design.md`

## Global Constraints
- **Branch:** `kitta/storno-gutschrift` (off staging, enthält #3692+#3762). Nie main; PR gegen staging. `git branch --show-current` je Task.
- **DDL nur via Supabase-Plugin** `apply_migration` (Regel 2): apply → `list_migrations` → File `<V>_<name>.sql` == getrackte Version → verify.
- **Non-fatal:** der Ledger-Storno (Reversal) darf NIE an Beleg-/PDF-/Mail-Panne scheitern.
- **Idempotenz:** Storno nur wenn Original existiert UND `status != 'storniert'` (Caller-Check).
- **Additiv:** neue Spalten nullable/default; partielles UNIQUE erhält „ein Original je Payout". Umlaute in PDF-Strings. Token-Audit-Skip-Header bleibt.
- **Gates:** `tsc --noEmit`; `vitest src/lib/finance`; am Ende knip/token-audit/component-set `--ratchet`; voller Build in Task 5 (CI-autoritativ).

---

## Task 1: Migration — typ + bezug + partielles UNIQUE
**Files:** Migration `<V>_partner_gutschriften_storno.sql`.
- [ ] **Step 1:** `apply_migration({ name:'partner_gutschriften_storno', query: })`:
```sql
ALTER TABLE public.partner_gutschriften
  ADD COLUMN IF NOT EXISTS typ text NOT NULL DEFAULT 'gutschrift',
  ADD COLUMN IF NOT EXISTS bezug_gutschrift_id uuid REFERENCES public.partner_gutschriften(id),
  ADD COLUMN IF NOT EXISTS storno_grund text;
ALTER TABLE public.partner_gutschriften DROP CONSTRAINT IF EXISTS partner_gutschriften_ledger_tabelle_ledger_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS partner_gutschriften_ledger_original_uniq
  ON public.partner_gutschriften (ledger_tabelle, ledger_id) WHERE typ = 'gutschrift';
```
- [ ] **Step 2:** `list_migrations` → Version <V>; File committen `supabase/migrations/<V>_partner_gutschriften_storno.sql`. `execute_sql` verify (Spalten + Index existieren, alte Constraint weg). Commit `feat(finance): partner_gutschriften storno columns + partial unique`.

## Task 2: `erstelleStornoGutschrift` (TDD)
**Files:** Modify `src/lib/finance/partner-gutschrift.ts` + `.test.ts`.
**Interfaces — Produces:** `erstelleStornoGutschrift(db: SupabaseClient<any>, originalGutschriftId: string, grund: string): Promise<{ ok:true; stornoId:string; nummer:string } | { ok:false; error:string }>`.
- [ ] **Step 1 (failing tests):** (a) Original (betrag_netto:100, ust_satz:19, ust_betrag:19, betrag_brutto:119, snapshots) → Storno-Insert-Row: `betrag_netto:-100, ust_betrag:-19, betrag_brutto:-119, ust_satz:19, typ:'storno', bezug_gutschrift_id:original.id, storno_grund:grund`, empfaenger_snapshot/aussteller_snapshot/leistung_text/leistung_datum == Original; UND Original wird `status:'storniert'` geupdated; Rückgabe nummer `/^CMNDO-GS-\d{4}-\d{5}$/`. (b) Original nicht gefunden → `{ok:false}`. (c) Original bereits `status:'storniert'` → `{ok:false, error:/bereits storniert/}` (kein Insert).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementieren** — Original laden (`select('*').eq('id',originalGutschriftId).single()`); wenn keins → `{ok:false,'Original-Gutschrift nicht gefunden'}`; wenn `status==='storniert'` → `{ok:false,'Gutschrift bereits storniert'}`. Nummer via `nextRechnungsNrRaw('CMNDO-GS', jahr)` (try/catch). Insert (negierte Beträge, `ust_betrag: orig.ust_betrag===null?null:-orig.ust_betrag`, Snapshots+leistung_datum vom Original, typ/bezug/storno_grund, status 'erstellt') `.select('id').single()`; bei error → `{ok:false,error.message}`. Original `.update({status:'storniert'}).eq('id',orig.id)`. Return `{ok:true, stornoId, nummer}`.
- [ ] **Step 4: PASS.** Step 5: `tsc`. Commit `feat(finance): erstelleStornoGutschrift (negative correction note)`.

## Task 3: PDF — Storno-Variante (TDD)
**Files:** Modify `src/lib/finance/partner-gutschrift-pdf.tsx` + `.test.tsx`.
**Interfaces — Produces:** `PartnerGutschriftPdfInput.storno?: { bezugNummer:string; bezugDatum:string; grund:string }`; view model `titel`/`bezugZeile?`/`grundZeile?`.
- [ ] **Step 1 (failing tests):** view model — (a) `storno` gesetzt → `vm.titel === 'Storno-Gutschrift'`, `vm.bezugZeile === 'Storno zu {bezugNummer} vom {bezugDatum}'`, `vm.grundZeile === 'Grund: {grund}'`. (b) ohne `storno` → `vm.titel === 'Gutschrift'`, `vm.bezugZeile`/`grundZeile` undefined. (c) negative Beträge → `vm.summe.brutto === '-119,00 €'` (formatEur(-119)).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementieren** — Input `storno?`; view model: `titel = input.storno ? 'Storno-Gutschrift' : 'Gutschrift'`; `bezugZeile = input.storno ? \`Storno zu ${input.storno.bezugNummer} vom ${input.storno.bezugDatum}\` : undefined`; `grundZeile = input.storno ? \`Grund: ${input.storno.grund}\` : undefined`. Render: Titel nutzt `vm.titel`; unter dem Empfänger-Block (oder Meta) `bezugZeile` + `grundZeile` rendern wenn gesetzt. formatEur bleibt (negative Zahlen → „-119,00 €"). Umlaute.
- [ ] **Step 4: PASS + Smoke-Render Storno-Zweig.** Step 5: `tsc` + `token-audit --ratchet`. Commit `feat(finance): Storno-Gutschrift PDF variant (title + bezug + grund + negative amounts)`.

## Task 4: Wire in `storniereProvision` (non-fatal, TDD)
**Files:** Modify `src/lib/finance/provision-status.ts` + `.test.ts`.
**Interfaces — Consumes:** `erstelleStornoGutschrift` (Task 2), `generateAndUploadPartnerGutschriftPdf` (Storno-Input, Task 3), `versendePartnerGutschrift`.
- [ ] **Step 1 (failing tests):** (a) Original-Gutschrift (typ:'gutschrift', status:'erstellt') existiert für (tabelle,id) → nach dem Ledger-Storno wird `erstelleStornoGutschrift(db, original.id, grund)` gerufen (mock → assert); Ledger-Status wird trotzdem auf stornoStatus gesetzt. (b) keine Gutschrift → `erstelleStornoGutschrift` NICHT gerufen; nur Ledger-Storno. (c) `erstelleStornoGutschrift` wirft/`{ok:false}` → `storniereProvision` gibt trotzdem `{ok:true}` (non-fatal, Ledger-Storno steht).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementieren** — in `storniereProvision`, nach dem bestehenden Ledger-Update: `try { const { data: orig } = await db.from('partner_gutschriften').select('id,pdf_storage_path').eq('ledger_tabelle', tabelle).eq('ledger_id', id).eq('typ','gutschrift').neq('status','storniert').maybeSingle(); if (orig) { const s = await erstelleStornoGutschrift(db, orig.id, grund); if (s.ok) { /* refetch storno-row -> PDF-Input mit storno:{bezugNummer:orig.gutschrift_nr, bezugDatum, grund}; generateAndUpload -> patch pdf_storage_path; versendePartnerGutschrift(db, s.stornoId) */ } } } catch (e) { console.error('[storno-gutschrift] non-fatal', e) }`. Der `storniereProvision`-Rückgabewert bleibt vom bestehenden Ledger-Storno bestimmt (nie durch den Beleg gebrochen). (Für den Bezug: das Original erneut mit `gutschrift_nr, erstellt_am` selektieren.)
- [ ] **Step 4: PASS.** Step 5: `tsc` + `vitest src/lib/finance`. Commit `feat(finance): issue Storno-Gutschrift on provision reversal (non-fatal)`.

## Task 5: Volle Gates + PR
- [ ] tsc · `npm run build @8GB` · vitest src/lib/finance · knip/token-audit/component-set `--ratchet`.
- [ ] 7-Punkte-Audit. Prod-verify (READ): Spalten + partieller Index existieren, altes UNIQUE weg.
- [ ] PR `--base staging --body-file`. **Finaler opus Whole-Branch-Review** (rechtsnah — Storno-Beleg/§14).

---

## Self-Review
**Spec-Coverage:** §3 Datenmodell→Task 1; §4 Baustein→Task 2; §5 PDF→Task 3; §6 Trigger→Task 4; §7 Zustellung→Task 4; §9 Idempotenz/non-fatal→Task 2+4. Alle abgedeckt.
**Placeholder:** keine — DDL/Signaturen/Beträge konkret.
**Type-Consistency:** `erstelleStornoGutschrift` (T2) → Caller T4; `PartnerGutschriftPdfInput.storno` (T3) → T4 PDF-Input; `bezug_gutschrift_id`/`typ`/`storno_grund` (T1) → T2 Insert. Durchgängig.

## Execution Handoff
subagent-driven-development (empfohlen), rechtsnah: Golden/Unit je Slice + finaler opus-Review.
