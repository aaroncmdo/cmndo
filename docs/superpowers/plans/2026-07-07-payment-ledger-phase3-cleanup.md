# Payment-Ledger Phase 3 + 4 — Vollständige Cache-Bereinigung (Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development oder executing-plans. Money-Code — NICHT rushen. Golden-Abrechnungstests in JEDEM Schritt grün.

**Goal:** Die transitionalen Cache-Spalten (`claims.regulierungs_betrag`, `claims.auszahlung_gutachter_betrag`, `claims.auszahlung_gutachter_eingegangen_am`) + das tote `claim_payments.empfaenger`-Schema vollständig entfernen; die Views auf reinen Ledger; den Dead-Code (`getCurrentClaimPayment`/`upsertCurrentClaimPayment`/`CurrentClaimPayment`) löschen.

**Kontext / De-Risking (Audit 2026-07-07):** Prod hat **28 Claims** (alt/test), davon **1** mit `regulierungs_betrag` (bereits im Ledger als vs-Zeile), **0** mit `auszahlung_gutachter`. ⇒ **vs-Backfill-Ziele=0, sv-Backfill-Ziele=0, Auto-Billing-Blast=0.** Der Backfill (Design-Phase-3-Schritt 1) ist ein **No-Op** und entfällt. Jeder Schritt unten ist damit **verhaltensneutral** (keine echten Daten hängen an den Caches außer der 1 Zeile, die schon im Ledger ist).

**⚠️ HARTER GATE (Regel 3, AAR-599):** Die Spalten-DROPs (Schritt B) dürfen erst appliziert werden, **nachdem** der no-write/no-read-Code (Schritt A) auf Prod deployt ist. Sonst crasht ein noch-deployter Writer/Reader auf einer gedroppten Spalte. A = Code-PR (merge→deploy), B = DDL-PR (danach).

---

## Scope — exakte Touch-Points (Grep-verifiziert 2026-07-07)

### A1 · Writer der Cache-Spalten → Collapse (Cache-Write raus, Ledger-Write via `upsertClaimPayment` BLEIBT)
- `src/lib/claims/endzustand-actions.ts:216` — `update({ status, regulierungs_betrag })` → `update({ status })`; das `upsertClaimPayment('vs', { forderungsbetrag })` bei :226 bleibt. Kommentar :224 aktualisieren.
- `src/app/faelle/[id]/_actions/kanzlei-paket.ts` (`recordZahlung`/`erfasseZahlungseingang`, ~:220/:329/:369) — Cache-Write `claims.regulierungs_betrag` raus, Ledger-Write bleibt. (`kanzlei_faelle.regulierung_am` = KB-Kontext, BLEIBT — kein Cache.)
- `src/lib/lexdrive/process-event.ts:~850` (`fuClaims.regulierungs_betrag=…`) + `auszahlung_gutachter_*`-Writes — Cache-Keys aus dem claims-Update-Objekt entfernen; `upsertClaimPayment` bleibt.
- `src/app/faelle/[id]/_actions/stammdaten.ts` (`updateFallField` auszahlung_gutachter → claims-Cache, Phase 1) — Cache-Write raus, `upsertClaimPayment('sv')` bleibt. **Verifizieren, wie updateFallField die Cache-Spalte schreibt.**

### A2 · Tabellen-Reader (`from('claims').select(...cache...)`) → auf View/Ledger umstellen (brechen sonst beim DROP)
- `src/app/admin/finance/(hub)/page.tsx:546-548` — `.select('regulierungs_betrag').not('regulierungs_betrag','is',null)` → über `v_claim_base`/`v_claim_full` (`regulierung_betrag`) ODER Ledger.
- `src/lib/analytics/finance.ts:158` — `db.from('claims').select('id, regulierungs_betrag, …')` → View oder Ledger (die `claim_payments`-Embeds sind seit Schritt C schon vs-gefiltert).
- `src/lib/whatsapp.ts:249` — `.select('…, regulierungs_betrag')` von claims → View.
- `src/lib/communications/send-fall.ts:34` — `.select('…, regulierungs_betrag')` von claims → View.
- `src/app/api/sv-zuweisung/route.ts:331` — `claims:claim_id(…, regulierungs_betrag, …)`-Embed → View oder Ledger.
- `src/app/gutachter/fall/[id]/page.tsx:193` — `.select('auszahlung_gutachter_betrag, auszahlung_gutachter_eingegangen_am, …')` — **Quelle prüfen**: liest es claims-Tabelle oder `faelle_sv_view`? Wenn Tabelle → auf `faelle_sv_view` (hat beide Felder, ledger-backed). :347-350 lesen bereits `svView` (View, safe).
- `src/lib/fall/subphase-resolver-input.ts:23` — Select-String `'…, auszahlung_gutachter_eingegangen_am'` — **Quelle prüfen** (claims vs View). subphase-resolver.ts:232/234 liest den Wert; Wert muss künftig aus dem View/Ledger kommen.
- **Grep-Gate vor DROP:** `grep -rn "from('claims')" src | grep -E "regulierungs_betrag|auszahlung_gutachter"` → 0 Treffer; ebenso keine `update/insert`-Objekte mit diesen Keys außer historischen Kommentaren.

### A3 · Dead-Code (0-Consumer nach Schritt C, PR #3806) löschen
- `src/lib/faelle/claim-payments.ts` — `getCurrentClaimPayment` (:165), `CurrentClaimPayment` (:153), `upsertCurrentClaimPayment` (:36), `ClaimPaymentRerouteFields` (falls 0-Consumer). Grep bestätigen (0 Importe außerhalb der Datei).
- `src/lib/faelle/claim-duplicate-columns.ts` — die Cache-Spalten aus der Duplicate-Map (:120-121, :272) entfernen (sie existieren nicht mehr nach dem Drop).

### A4 · Config/UI, die die Cache-Feldnamen für Writes nutzt (prüfen, ggf. auf Ledger-Feld)
- `src/lib/fall/kanzlei-paket-config.ts:271` (`auszahlung_gutachter_eingegangen_am` Form-Feld) + `LexDriveTriggerPanel.tsx` (auszahlung_split-Felder) — diese treiben `updateFallField`/process-event-Writes; nach A1 schreiben die den Ledger, nicht den Cache. Feldnamen können bleiben (semantisch), aber sicherstellen, dass der Write-Pfad (A1) den Ledger trifft.

---

## Schritt A — Code-PR (jetzt baubar, gestapelt auf Schritt C #3806)
1. A1 Collapse (4-5 Writer) — TDD/Golden grün halten (`process-case-billing`, descriptors, eligibility).
2. A2 Tabellen-Reader → View/Ledger (7 Stellen) — je Quelle verifizieren (claims-Tabelle vs View).
3. A3 Dead-Code löschen.
4. `npx vitest run src/lib/abrechnung src/lib/analytics src/lib/finance src/lib/fall src/lib/faelle` grün; tsc (8GB-Heap lokal ODER CI).
5. Grep-Gate A2 = 0. Commit + PR gegen `payment-ledger-phase2`/staging. **Merge + Deploy abwarten.**

## Schritt B — DDL-PR (NACH A-Deploy, Regel 3)
1. Pure-Ledger-Views: `v_claim_base` DO-Block — `COALESCE(p.vs_ist,p.vs_soll,regulierung_betrag)` → `COALESCE(p.vs_ist,p.vs_soll)`; `COALESCE(p.sv_ist,auszahlung_gutachter_betrag)` → `p.sv_ist`; `COALESCE(p.sv_am,auszahlung_gutachter_eingegangen_am)` → `p.sv_am`. (Signatur-erhaltend; die 1 populierte Claim hat vs_ist=5000 → identisch; alle anderen NULL wie zuvor.) Signatur-md5-Check.
2. `apply_migration` DROP: `claims.regulierungs_betrag`, `claims.auszahlung_gutachter_betrag`, `claims.auszahlung_gutachter_eingegangen_am`. Pre-Check: `pg_get_viewdef` aller v_claim_*-Views referenziert die Spalten NICHT mehr (nach B1); kein anderer DB-Dependent.
3. `apply_migration` DROP: `claim_payments.empfaenger` + `claim_payments_empfaenger_check`.
4. `generate_typescript_types` → database.types.ts (chirurgisch, geteilte Datei).
5. Verify: Golden byte-identisch; `select` auf die Views ok; Migration-Files == getrackte Versionen (Regel 2).

## Verifikation (durchgehend)
- Golden-Abrechnungstests grün in A **und** B.
- Grep-Gate: 0 `from('claims')`-Reads + 0 Writes der 3 Cache-Spalten (nur Views/Ledger + historische Kommentare).
- Signatur-md5 der Views vor==nach (B1).
- `empfaenger`/`getCurrentClaimPayment` 0-Referenz vor Drop/Delete.

## Nicht-Ziele
- Kein Backfill (Audit: 0 Ziele).
- `kanzlei_faelle.regulierung_am` bleibt (KB-Verhandlungskontext, kein Cache).
- `gutachten.gutachten_sv_honorar_netto` bleibt (SV-Honorar-Quelle).

---

## Execution Deep-Dive (2026-07-07, verifiziert — macht die Ausführung turnkey)

**🔑 A1↔A2 sind GEKOPPELT — müssen zusammen shippen.** Collapse (Writer schreiben Cache nicht mehr) OHNE Reader-Migration ⇒ die Direkt-Tabellen-Reader (`analytics/finance:158`, `admin/finance:546`) sehen bei jeder NEUEN Regulierung veralteten Cache. Also EIN Code-PR für A1+A2+A3 (+ claim-duplicate-columns). Auf den heutigen statischen 28 Test-Claims wäre eine Teil-Lieferung zwar verhaltensneutral, aber inkohärent — daher zusammen.

**Writer-Details (verifiziert):**
- `endzustand-actions.ts:216` — `setEndzustandFields(claim_id, { status, regulierungs_betrag })` → `{ status }`. Ledger-Soll via `upsertClaimPayment('vs',{forderungsbetrag})` (:225) bleibt. **Clean.**
- `kanzlei-paket.ts` **betrag-Fn (~:234)** — `.update({ regulierungs_betrag: betrag })` löschen. Der Betrag landet SCHON im Ledger: `transitionFallStatus('zahlung-eingegangen',{betrag})` → state-machine.ts:247 `cpFields.erhaltener_betrag = metadata.betrag`. `betragClaimId`-Guard bleibt (noch in der `if`-Bedingung genutzt). **Clean.**
- `kanzlei-paket.ts` **erfasseZahlungseingang (~:378)** — `.update({ regulierungs_betrag: data.gesamtbetrag })` löschen UND `erhaltener_betrag: data.gesamtbetrag` in den `upsertClaimPayment('vs',{…})`-Call (:386) aufnehmen (sonst verliert die Ledger-Zeile den Summen-Betrag → View NULL). `upsertKanzleiFall(regulierung_am)` bleibt. **Betrag-Move — sorgfältig.**
- `stammdaten.ts:577` — Descriptor `auszahlung_gutachter_eingegangen_am: { …, cacheAufClaims: true }` → `false`. Der `if(cacheAufClaims)`-Zweig (:587) schreibt dann keinen Cache mehr; `upsertClaimPayment('sv',{zahlungseingang_am})` (:585) bleibt. **Clean (1 Flag).**
- `process-event.ts` **(die intrikate):** `regulierung_betrag` (:849) wird aktuell nach `fuClaims.regulierungs_betrag` (Cache) geroutet; `auszahlung_gutachter_eingegangen_am` liegt in `fuClaims` (Cache-Write :927) UND wird für den sv-Ledger gelesen (:953). **Drop-safe Restructure:** BEIDE aus `fuRest` peelen **VOR** `splitOrKeepFaelleUpdate` (:839) → direkt in die Ledger-Zeile (`cpFields.erhaltener_betrag` bzw. `upsertClaimPayment('sv',{zahlungseingang_am})`), damit sie NIE in fuClaims/fuFaelle landen → entkoppelt von claim-duplicate-columns.

**⚠️ claim-duplicate-columns.ts ist SHARED** (importiert von `state-machine.ts`, `stammdaten.ts`, `process-event.ts`): `auszahlung_gutachter_betrag`/`_eingegangen_am` (~:120-121, `CLAIM_OWNED_DUPLICATE_COLUMNS`) + `regulierung_betrag→regulierungs_betrag` (~:272 rename-map) müssen VOR dem Spalten-DROP raus, sonst routet `splitOrKeepFaelleUpdate` weiter auf die gedroppte claims-Spalte. Alle Consumer prüfen, dass sie diese Felder nicht mehr über den Split erwarten (process-event peelt sie vorher).

**Kein Unit-Test-Netz für die Writer.** Empfehlung: einen Writer-Integrations-/Golden-Test ergänzen (markClaimAsReguliert / erfasseZahlungseingang / process-event → Ledger-Zeile assert) BEVOR die Betrag-Moves live gehen. Die Golden-Abrechnungstests decken die Writer NICHT ab (nur die Billing-Rechnung).

**A3 Dead-Code-Präzision:** `ClaimPaymentRerouteFields` NICHT löschen — `process-event.ts:913` nutzt es noch. `getCurrentClaimPayment`+`CurrentClaimPayment` sind 0-Consumer (nach Schritt C) → löschbar. `upsertCurrentClaimPayment` 0-Consumer prüfen. claim-payments.ts ist shared-hot → mit anderen Finanz-Sessions koordinieren.

**Warum nicht im Session-Tail gerusht (2026-07-07):** Coupled ~12-File Money-Change + shared Routing (claim-duplicate-columns) + kein Test-Netz + Betrag-Moves. Sauber als fokussierter Chunk mit Test.
