# Partner-Payout-Gutschrift (P3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Beim Auszahlen einer Partner-Provision entsteht automatisch eine rechtssaubere Self-Billing-Gutschrift (Datensatz + PDF), die Claimondo im Namen des Partners ausstellt.

**Architecture:** Neue `partner_gutschriften`-Tabelle; `erstellePartnerGutschrift`-Baustein (Nummer + Steuer-Snapshot + Insert + PDF), gerufen von P1s `auszahlenProvision` NACH dem USt-Freeze; USt aus den bereits eingefrorenen Provisions-Werten (SSoT); Zustellung per Email + Cockpit-Download. Reiner Code + additive Migrationen.

**Tech Stack:** TypeScript, Supabase (Postgres + Storage + RLS), react-pdf, vitest. Reuse: `nextRechnungsNrRaw`, `calculate-ust.ts`, das onboarding/kanzlei react-pdf-Muster, `getAktuelleRechnungsKonfig`, P1 `provision-status.ts` + `PartnerBillingPanel`.

**Spec:** `docs/superpowers/specs/2026-07-05-partner-payout-gutschrift-design.md`

## Global Constraints
- **Branch:** `kitta/partner-payout-gutschrift` (off staging). Nie main; PR gegen staging. Jede Task: `git branch --show-current` prüfen (Multi-Session), nie checkout/switch.
- **DDL nur via Supabase-Plugin** `apply_migration` (Regel 2): apply → `list_migrations` → File `supabase/migrations/<V>_<name>.sql` == getrackte Version → `execute_sql`-READ verify. Additiv only.
- **Neue Tabelle:** IMMER `REVOKE ALL ON public.partner_gutschriften FROM anon;` (Lehre v_partner_billing-Leak: Supabase-Default-Privs granten anon sonst → Leak).
- **USt** kommt aus den von P1 eingefrorenen `ust_satz`/`ust_betrag`/`betrag_brutto` der Provisions-Zeile (SSoT); `calculateUst` nur Fallback wenn ein Wert NULL.
- **PDF:** Kompensations-Delete der gerade erzeugten Row bei PDF-Fehler (Lehre P2-Onboarding-I1: keine Orphan-Row).
- **Vollständigkeits-Block:** Gutschrift + Payout NICHT erstellen wenn Empfänger-Steuerdaten unvollständig (§14c-Haftungs-Schutz).
- Server-Actions/Bausteine liefern `{ ok, error? }`. Frontend-Umlaute Pflicht. PDF darf raw-hex mit `// Token-Audit-Skip`-Header.
- **Gates vor Commit:** `tsc --noEmit`; bei Routen/Actions `npm run build @8GB`; `vitest`; am Ende knip/token-audit/component-set `--ratchet`.

---

## File Structure
- **Migrationen:** `<V1>_partner_steuerdaten.sql`, `<V2>_partner_gutschriften.sql`.
- **Neu:** `src/lib/finance/partner-gutschrift.ts` (`erstellePartnerGutschrift` + Typen) + `.test.ts`; `src/lib/finance/partner-gutschrift-pdf.tsx` (react-pdf) + Storage-Upload.
- **Modifiziert:** `src/lib/finance/provision-status.ts` (`auszahlenProvision` ruft die Gutschrift); die Partner-Admin-Surfaces (Steuerdaten-Erfassung) + `PartnerBillingPanel` (Download-Link) + Makler/Werkstatt-Portal-Abrechnungen.
- **Reuse:** `generate-rechnungs-nr.ts`, `calculate-ust.ts`, `create-onboarding-rechnung`/kanzlei-PDF-Muster, `getAktuelleRechnungsKonfig`.

---

## Task 1: Daten-Prereq — Partner-Steuerdaten
**Files:** Migration `<V1>_partner_steuerdaten.sql`; modify die Partner-Admin-Surfaces (`MaklerAdminClient`/`WerkstaettenClient`-Drawer + Maik-Section aus P1) + deren Actions.
- [ ] **Step 1: Migration** `apply_migration({ name:'partner_steuerdaten', query: })`:
```sql
ALTER TABLE public.werkstaetten ADD COLUMN IF NOT EXISTS ust_id text;
ALTER TABLE public.marketing_partner ADD COLUMN IF NOT EXISTS ust_id text, ADD COLUMN IF NOT EXISTS adresse_strasse text, ADD COLUMN IF NOT EXISTS adresse_plz text, ADD COLUMN IF NOT EXISTS adresse_ort text;
```
- [ ] **Step 2:** `list_migrations` → Version; File committen. `execute_sql` verify.
- [ ] **Step 3:** In den P1-Partner-Surfaces (wo der `ist_kleinunternehmer`-Toggle sitzt) editierbare Felder + Server-Action `setzePartnerSteuerdaten(partnerTyp, partnerId, { ust_id?, adresse_* })` (`{ ok, error? }`, admin-guard, revalidatePath). makler ist bereits vollständig (nur anzeigen). Umlaute.
- [ ] **Step 4:** `tsc` + betroffene Ratchets grün. Commit `feat(finance): partner tax-data fields + admin capture (P3 prereq)`.

## Task 2: Tabelle `partner_gutschriften`
**Files:** Migration `<V2>_partner_gutschriften.sql`.
**Produces:** Tabelle mit den Spalten aus Spec §3.
- [ ] **Step 1: Migration**:
```sql
CREATE TABLE IF NOT EXISTS public.partner_gutschriften (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_typ text NOT NULL,
  partner_id uuid NOT NULL,
  gutschrift_nr text NOT NULL,
  ledger_tabelle text NOT NULL,
  ledger_id uuid NOT NULL,
  betrag_netto numeric NOT NULL,
  ust_satz numeric,
  ust_betrag numeric,
  betrag_brutto numeric NOT NULL,
  empfaenger_snapshot jsonb NOT NULL,
  aussteller_snapshot jsonb NOT NULL,
  leistung_text text NOT NULL,
  status text NOT NULL DEFAULT 'erstellt',
  pdf_storage_path text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  versendet_am timestamptz,
  UNIQUE (ledger_tabelle, ledger_id)
);
ALTER TABLE public.partner_gutschriften ENABLE ROW LEVEL SECURITY;
CREATE POLICY pg_admin_all ON public.partner_gutschriften FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- Partner-eigene Lesesicht: makler/werkstatt sehen die eigene Gutschrift (partner_id == eigene Entität).
--   (Genaue USING-Klausel im Task gegen die bestehenden makler/werkstatt-RLS-Muster modellieren.)
REVOKE ALL ON public.partner_gutschriften FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.partner_gutschriften TO authenticated;
```
- [ ] **Step 2:** Version ablesen + File committen + `execute_sql` verify (`REVOKE anon` griff: `role_table_grants` zeigt kein anon). Commit `feat(finance): partner_gutschriften table + RLS (P3)`.

## Task 3: `erstellePartnerGutschrift` (TDD)
**Files:** Create `src/lib/finance/partner-gutschrift.ts` + `.test.ts`.
**Consumes:** `nextRechnungsNrRaw` (`@/lib/billing/generate-rechnungs-nr`), `getAktuelleRechnungsKonfig` (Aussteller-Snapshot — Signatur beim Bau aus `create-onboarding-rechnung.ts` ablesen).
**Produces:** `erstellePartnerGutschrift(db: SupabaseClient<any>, p: { tabelle: string; ledgerId: string; partnerTyp: 'makler'|'werkstatt'|'marketing'; partnerId: string; betraege: { nettoCent: number; ustSatz: number|null; ustBetrag: number|null; bruttoCent: number }; leistungText: string }): Promise<{ ok: true; gutschriftId: string; nummer: string } | { ok: false; error: string }>` (PDF-Upload macht Task 4/5; dieser Baustein: Steuerdaten-Load + Vollständigkeits-Block + Nummer + Insert).
- [ ] **Step 1: Failing test** (Fake-DB): (a) unvollständige Steuerdaten (regelbesteuert ohne ust_id ODER fehlende Adresse) → `{ ok:false, error:/Steuerdaten unvollständig/ }`, kein Insert; (b) vollständig → `{ ok:true }`, Insert mit `gutschrift_nr` Format `CMNDO-GS-{jahr}-{5-stellig}`, empfaenger_snapshot enthält name/adresse/ust_id/ist_kleinunternehmer; (c) Kleinunternehmer ohne ust_id ist VOLLSTÄNDIG (kein ust_id nötig).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementieren** — Partner-Tabelle je `partnerTyp` laden (makler/werkstaetten/marketing_partner) → Snapshot `{ name, adresse_strasse, adresse_plz, adresse_ort, ust_id, ist_kleinunternehmer }`; Vollständigkeit = Adresse vorhanden UND (`ist_kleinunternehmer===true` ODER `ust_id` vorhanden); sonst block. Nummer via `nextRechnungsNrRaw('CMNDO-GS', jahr)` → `CMNDO-GS-${jahr}-${String(n).padStart(5,'0')}`. `betrag_netto = nettoCent/100` etc. (Euro-Spalten). aussteller_snapshot via getAktuelleRechnungsKonfig. Insert (UNIQUE ledger → bei Konflikt `{ ok:false, error:'Gutschrift existiert bereits' }`). Return `{ ok, gutschriftId, nummer }`.
- [ ] **Step 4: PASS.** Step 5: `tsc`. Commit `feat(finance): erstellePartnerGutschrift (nummer + tax snapshot + completeness block)`.

## Task 4: `PartnerGutschriftPdf` + Storage-Upload
**Files:** Create `src/lib/finance/partner-gutschrift-pdf.tsx`.
**Consumes:** react-pdf (aus dem onboarding/kanzlei-PDF-File ablesen: exakte Imports + Storage-Upload-Helper). **Produces:** `generateAndUploadPartnerGutschriftPdf(gutschriftRow): Promise<{ ok: true; pdfPath: string } | { ok: false; error: string }>`.
- [ ] **Step 1:** `// Token-Audit-Skip: react-pdf braucht raw hex` Header. PDF-Komponente: Aussteller-Kopf (aussteller_snapshot), Empfänger-Block (empfaenger_snapshot), **Titel „Gutschrift"** + Zeile „Gutschrift im Sinne des §14 Abs. 2 UStG", Positions-Zeile (`leistung_text` + netto), USt-Zeile (`ust_satz`% + `ust_betrag`) ODER bei Kleinunternehmer **kein USt-Ausweis + Zeile „Kleinunternehmer gemäß §19 UStG — keine Umsatzsteuer"**, Brutto, `gutschrift_nr` + Datum, IBAN-Hinweis. Umlaute.
- [ ] **Step 2:** Upload in den Storage-Bucket (denselben wie onboarding — beim Bau ablesen), Pfad zurück. Snapshot-/Smoke-Test (rendert ohne Fehler, enthält „Gutschrift" + Nummer + bei Kleinunternehmer den §19-Hinweis).
- [ ] **Step 3:** `tsc` + token-audit (Skip-Header greift). Commit `feat(finance): PartnerGutschriftPdf react-pdf + storage upload`.

## Task 5: Wire in `auszahlenProvision`
**Files:** Modify `src/lib/finance/provision-status.ts` (`auszahlenProvision`).
- [ ] **Step 1: Test** erweitern (`provision-status.test.ts`): nach dem USt-Freeze wird `erstellePartnerGutschrift` gerufen; schlägt sie fehl (Steuerdaten unvollständig) → `auszahlenProvision` gibt `{ ok:false }` und der Status wird NICHT auf ausgezahlt gesetzt (Payout blockiert).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3:** In `auszahlenProvision` nach dem Freeze-Update: `erstellePartnerGutschrift(db, { tabelle, ledgerId:id, partnerTyp, partnerId, betraege:{ eingefrorene Werte }, leistungText })` → bei `!ok` return `{ ok:false, error }` VOR dem finalen Status→ausgezahlt (kein Payout ohne Gutschrift). Dann `generateAndUploadPartnerGutschriftPdf` (Task 4) → bei PDF-Fehler Kompensations-Delete der Gutschrift-Row + `{ ok:false }`. Erst danach Status→ausgezahlt.
- [ ] **Step 4: PASS.** Step 5: `tsc` + `vitest src/lib/finance`. Commit `feat(finance): generate partner Gutschrift on payout (block if incomplete)`.

## Task 6: Zustellung — Email + Cockpit-Download
**Files:** Modify `partner-gutschrift.ts` (Send-Fn), `PartnerBillingPanel` + die Makler/Werkstatt-Portal-Abrechnungen.
- [ ] **Step 1:** `versendePartnerGutschrift(db, gutschriftId)`: PDF-Signed-URL/Attachment an die Partner-Email (`sendEmail`-Muster), **non-fatal** (try/catch — Mail-Fail bricht die Auszahlung nicht), status→'versendet' + versendet_am. Aus `auszahlenProvision` nach erfolgreichem Payout non-fatal aufrufen.
- [ ] **Step 2:** `PartnerBillingPanel` (P1): je Auszahlungs-Zeile mit `status_norm='erledigt'` einen „Gutschrift ↓"-Link (Server-Action liefert Signed-URL des `pdf_storage_path`). Partner-Portal (`/makler/abrechnungen`, `/werkstatt/abrechnungen`): eigene Gutschriften-Downloads (RLS-gegated).
- [ ] **Step 3:** `tsc` + `npm run build` (Routen) + Ratchets. Commit `feat(finance): deliver partner Gutschrift (email + cockpit/portal download)`.

## Task 7: Volle Gates + PR
- [ ] tsc · build @8GB · knip · token-audit · component-set · vitest src/lib/finance — alle grün.
- [ ] 7-Punkte-Audit. Prod-verify (READ) der Tabelle + ein Test-Payout-Dry-Run (falls sicher simulierbar; sonst golden/unit-verifiziert).
- [ ] PR `--base staging --body-file` (Self-Billing §14 Abs.2, Vollständigkeits-Block, USt aus P1-frozen, kein SV-gutschriften-Touch).
- [ ] **Finaler opus Whole-Branch-Review** (geld-/rechtsnah!) vor Merge.

---

## Self-Review
**Spec-Coverage:** §3 Tabelle→Task 2; §4 Daten-Prereq→Task 1; §5 Flow→Task 3+5; §6 PDF→Task 4; §7 Zustellung→Task 6; §8 USt-SSoT→Task 3/5 (eingefrorene Werte); §10 Risiken→Vollständigkeits-Block (T3/5) + REVOKE anon (T2) + Kompensations-Delete (T4/5). Alle abgedeckt.
**Placeholder:** Migrationen + Signaturen konkret; die 2 „beim Bau ablesen"-Verweise (getAktuelleRechnungsKonfig-Signatur, react-pdf-Imports/Storage-Bucket) sind präzise Lese-Anweisungen auf existierende Files, kein Platzhalter (der Executor liest den konkreten onboarding-PDF-Code).
**Type-Consistency:** `erstellePartnerGutschrift` (T3) → konsumiert von `auszahlenProvision` (T5); `generateAndUploadPartnerGutschriftPdf` (T4) → T5; `versendePartnerGutschrift` (T6). `betraege.{nettoCent,ustSatz,ustBetrag,bruttoCent}` durchgängig.

## Execution Handoff
`superpowers:subagent-driven-development` (empfohlen), frische Session mit vollem Kontext — geld-/rechtsnah, Golden/Unit je Slice + finaler opus-Review.
