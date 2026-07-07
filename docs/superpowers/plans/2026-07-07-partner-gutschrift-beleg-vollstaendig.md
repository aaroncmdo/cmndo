# Gutschrift Beleg §14-vollständig (Leistungszeitpunkt + IBAN) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) oder executing-plans. Steps nutzen `- [ ]`.

**Goal:** Das Partner-Gutschrift-PDF um den Leistungszeitpunkt (§14 Abs. 4 Nr. 6 Pflichtangabe) + die Empfänger-IBAN ergänzen.

**Architecture:** Additive Spalte `leistung_datum` + `bank_iban` im jsonb-`empfaenger_snapshot`; `auszahlenProvision` liest das Leistungsdatum je Ledger und reicht es an `erstellePartnerGutschrift` durch; das PDF rendert beide neuen Angaben. Reine Beleg-Darstellung — Beträge/USt unberührt.

**Tech Stack:** TypeScript, Supabase (Postgres + Migration), react-pdf, vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-partner-gutschrift-beleg-vollstaendig-design.md`

## Global Constraints
- **Branch:** `kitta/gutschrift-leistungszeitpunkt-iban` (off staging). Nie main; PR gegen staging. `git branch --show-current` je Task prüfen.
- **DDL nur via Supabase-Plugin** `apply_migration` (Regel 2): apply → `list_migrations` → File `supabase/migrations/<V>_<name>.sql` == getrackte Version → verify. Additiv only.
- **Additiv:** neue Spalte nullable, neuer Param optional → 0 bestehende Gutschriften betroffen; alte Rows `leistung_datum=null` → Fallback-Note.
- **USt-SSoT unberührt.** Umlaute in PDF-Strings Pflicht. Token-Audit-Skip-Header im PDF bleibt.
- **Gates vor Commit:** `tsc --noEmit`; `vitest src/lib/finance`; am Ende knip/token-audit/component-set `--ratchet`. Voller `npm run build` in Task 7 (autoritativ = CI).

---

## Task 1: Migration — `leistung_datum`
**Files:** Migration `<V>_partner_gutschriften_leistung_datum.sql`.
- [ ] **Step 1:** `apply_migration({ name:'partner_gutschriften_leistung_datum', query: 'ALTER TABLE public.partner_gutschriften ADD COLUMN IF NOT EXISTS leistung_datum date;' })`.
- [ ] **Step 2:** `list_migrations` → Version <V>; File committen als `supabase/migrations/<V>_partner_gutschriften_leistung_datum.sql`. `execute_sql` verify (Spalte existiert). Commit `feat(finance): partner_gutschriften.leistung_datum column (§14 Leistungszeitpunkt)`.

## Task 2: `erstellePartnerGutschrift` — bank_iban + leistung_datum (TDD)
**Files:** Modify `src/lib/finance/partner-gutschrift.ts` + `.test.ts`.
**Interfaces — Produces:** Signatur `erstellePartnerGutschrift(db, p)` bekommt optionalen `p.leistungsDatum?: string | null` (ISO-Timestamp der Leistung). `empfaenger_snapshot` bekommt `bank_iban: string | null`. Insert-Row bekommt `leistung_datum`.
- [ ] **Step 1 (failing tests):** (a) mit `bank_iban:'DE12...'` auf der Fake-Partner-Zeile → `empfaenger_snapshot.bank_iban === 'DE12...'`. (b) `p.leistungsDatum='2026-07-15T10:00:00.000Z'` → Insert-Row `leistung_datum === '2026-07-15'`. (c) ohne `leistungsDatum` → `leistung_datum === null`. (d) Partner ohne bank_iban (marketing) → `empfaenger_snapshot.bank_iban === null`.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementieren** — in `p` `leistungsDatum?: string | null` ergänzen. `empfaenger_snapshot` (partner-gutschrift.ts:161) um `bank_iban: (partner as any).bank_iban ?? null` erweitern (select ist bereits `*` → marketing→undefined→null). In der Insert-Row `leistung_datum: p.leistungsDatum ? new Date(p.leistungsDatum).toISOString().slice(0, 10) : null` ergänzen.
- [ ] **Step 4: PASS.** Step 5: `tsc`. Commit `feat(finance): erstellePartnerGutschrift stores bank_iban snapshot + leistung_datum`.

## Task 3: PDF — Leistungszeitraum + IBAN (TDD)
**Files:** Modify `src/lib/finance/partner-gutschrift-pdf.tsx` + `.test.tsx`.
**Interfaces — Consumes:** die neuen Row-Felder. **Produces:** `PartnerGutschriftPdfInput` bekommt `leistung_datum: string | null` + `empfaenger_snapshot.bank_iban: string | null`; view model bekommt `leistungszeitraum: string`; `auszahlungHinweis` wird IBAN-aware.
- [ ] **Step 1 (failing tests):** view model — (a) `leistung_datum='2026-07-15'` → `vm.leistungszeitraum === 'Juli 2026'`. (b) `leistung_datum=null` → `vm.leistungszeitraum === 'Leistungsdatum entspricht dem Ausstellungsdatum'`. (c) `empfaenger_snapshot.bank_iban='DE45100110012844464931'` → `vm.auszahlungHinweis` enthält `'IBAN'` + `'DE45 1001 1001 2844 4649 31'` (4er-Gruppen). (d) `bank_iban=null` → `vm.auszahlungHinweis === 'Die Auszahlung erfolgt auf das bei Claimondo hinterlegte Bankkonto.'`.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementieren** — `PartnerGutschriftPdfInput`: `leistung_datum: string | null` (top-level) + `empfaenger_snapshot.bank_iban: string | null`. Neuer `GutschriftViewModel.leistungszeitraum: string`. In `buildGutschriftViewModel`: `leistungszeitraum = input.leistung_datum ? new Date(input.leistung_datum).toLocaleDateString('de-DE',{ month:'long', year:'numeric' }) : 'Leistungsdatum entspricht dem Ausstellungsdatum'`. `auszahlungHinweis = snap.bank_iban ? \`Die Auszahlung erfolgt auf IBAN ${formatIban(snap.bank_iban)}.\` : 'Die Auszahlung erfolgt auf das bei Claimondo hinterlegte Bankkonto.'` — lokale `formatIban(raw)` (Whitespace raus, in 4er-Gruppen). Render: eine dritte Meta-Block-Zelle „Leistungszeitraum" (neben Gutschrift-Nr./Datum). Umlaute.
- [ ] **Step 4: PASS + Smoke-Render beide Zweige.** Step 5: `tsc` + `token-audit --ratchet`. Commit `feat(finance): Gutschrift PDF shows Leistungszeitraum + Empfänger-IBAN`.

## Task 4: `auszahlenProvision` — Leistungsdatum je Ledger durchreichen (TDD)
**Files:** Modify `src/lib/finance/provision-status.ts` + `.test.ts`.
**Interfaces — Consumes:** `erstellePartnerGutschrift(…, { leistungsDatum })` (Task 2) + `PartnerGutschriftPdfInput.leistung_datum` (Task 3).
- [ ] **Step 1 (failing tests):** je Ledger wird `leistungDatumCol` gelesen + als `leistungsDatum` an `erstellePartnerGutschrift` übergeben (mock → assert Argument). z.B. makler_provisionen mit `trigger_at:'2026-07-15T…'` in der Fake-Row → `erstellePartnerGutschrift` mit `leistungsDatum:'2026-07-15T…'` gerufen. Happy-Pfad: die PDF-Input-Map enthält `leistung_datum` aus der re-fetchten Row.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementieren** — `LedgerMeta` um `leistungDatumCol: string` erweitern; je Eintrag setzen: makler_provisionen/werkstatt_provisionen → `'trigger_at'`, provisionen_maik → `'created_at'`, makler_staffel_bonus/werkstatt_staffel_bonus → `'erstellt_am'`. Den Provisions-Select um `${meta.leistungDatumCol}` erweitern; Wert lesen (`const leistungsDatum = (data as any)[meta.leistungDatumCol] ?? null`). An `erstellePartnerGutschrift(db, { …, leistungsDatum })` übergeben. In der PDF-Input-Konstruktion (nach re-fetch) `leistung_datum: row.leistung_datum` ergänzen.
- [ ] **Step 4: PASS.** Step 5: `tsc` + `vitest src/lib/finance`. Commit `feat(finance): pass provision Leistungsdatum into Gutschrift`.

## Task 5: Volle Gates + PR
- [ ] tsc · `npm run build @8GB` · vitest src/lib/finance · knip/token-audit/component-set `--ratchet` — grün.
- [ ] 7-Punkte-Audit. Prod-verify (READ): Spalte existiert. Optional: Snapshot eines gerenderten PDFs prüfen (beide Zweige) via direktem buildGutschriftViewModel-Aufruf.
- [ ] PR `--base staging --body-file`. **Finaler opus Whole-Branch-Review** (rechtsnah — §14-Pflichtangabe).

---

## Self-Review
**Spec-Coverage:** §3 Datenmodell→Task 1+2; §4 Leistungsdatum-Quelle→Task 4; §5 Flow→Task 2+4; §6 PDF→Task 3; §7 Tests→je Task. Alle abgedeckt.
**Placeholder:** keine — Spalten/Signaturen/Formatierung konkret.
**Type-Consistency:** `leistungsDatum` (Task 2 Param) ← Task 4 Caller; `leistung_datum` (Row/Insert Task 2) → PDF-Input Task 3 ← PDF-Map Task 4; `bank_iban` snapshot Task 2 → PDF Task 3. Durchgängig.

## Execution Handoff
Klein + rechtsnah. subagent-driven-development (empfohlen) oder inline; final opus-Review.
