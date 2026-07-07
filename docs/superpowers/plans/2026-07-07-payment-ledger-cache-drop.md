# Payment-Ledger Cache-Column DROP — Turnkey-Runbook (finaler Schritt)

> **Status: GATED — NICHT vor den Gate-Bedingungen ausfuehren.** Recipe gesichert 2026-07-07
> (Session `6f60c510`) waehrend Phase-3-Collapse (PR #3845), damit der letzte Schritt sauber
> koordiniert laeuft, sobald die Gates offen sind. Regel 2 (DDL nur via `apply_migration`,
> File==recorded-version) + Regel 3 (kein Cache-Drop solange ein Writer schreibt) gelten.

Dies ist der **abschliessende Schritt** der Payment-Ledger-Normalisierung. Nach den Phasen 0–2b
(live), Schritt C (Reader-VS-aware, live), Phase 3 Collapse (#3845 — Writer ledger-only, Reader
ledger/view) und Phase 4 A3-Deadcode (#3831) sind die 3 claim-nativen Geld-Cache-Spalten nur noch
**totes Gewicht** (COALESCE-Fallback in den Views, wird von keinem Writer mehr gefuellt). Dieser
Runbook droppt sie sauber.

## Betroffene Cache-Spalten (`public.claims`) → Ledger-Quelle

| Cache-Spalte | Ledger-Quelle (nach Drop) |
|---|---|
| `regulierungs_betrag` | `(claim,'vs')` → `COALESCE(erhaltener_betrag, forderungsbetrag)` (Ist-first) |
| `auszahlung_gutachter_betrag` | `(claim,'sv')` → `erhaltener_betrag` (sv_ist) |
| `auszahlung_gutachter_eingegangen_am` | `(claim,'sv')` → `zahlungseingang_am` (sv_am) |

## GATE-Bedingungen (ALLE muessen erfuellt sein — sonst NICHT starten)

1. **#3845 (Phase-3-Collapse) gemergt + auf PROD deployt** → Writer schreiben ledger-only (kein Cache-Write mehr). Verifizieren: prod-Smoke der Money-Reader zeigt korrekte Werte.
2. **#3831 (Phase-4-Deadcode) gemergt.**
3. **470d55c9's `v_claim_base`/View-Rebuild live auf PROD** in seiner FINALEN Form. Die 5 Haupt-Views muessen VOR dem Column-Drop pure-ledger sein (Schritt 2), sonst bricht der Drop die COALESCE-Referenz. **Die exakte View-Repoint-SQL kann erst gegen die dann-finalen View-Defs geschrieben werden — jede heute geschriebene Migration waere stale.**
4. **Backfill-Recheck = 0** (Schritt 1).

## Schritt 1 — Backfill-Recheck (READ, `execute_sql`, project `paizkjajbuxxksdoycev`)

```sql
SELECT 'regulierungs_betrag' AS feld, count(*) AS cache_only
FROM claims c LEFT JOIN claim_payments p ON p.claim_id = c.id AND p.partei = 'vs'
WHERE c.regulierungs_betrag IS NOT NULL AND p.erhaltener_betrag IS NULL AND p.forderungsbetrag IS NULL
UNION ALL
SELECT 'auszahlung_gutachter_betrag', count(*)
FROM claims c LEFT JOIN claim_payments p ON p.claim_id = c.id AND p.partei = 'sv'
WHERE c.auszahlung_gutachter_betrag IS NOT NULL AND p.erhaltener_betrag IS NULL
UNION ALL
SELECT 'auszahlung_gutachter_eingegangen_am', count(*)
FROM claims c LEFT JOIN claim_payments p ON p.claim_id = c.id AND p.partei = 'sv'
WHERE c.auszahlung_gutachter_eingegangen_am IS NOT NULL AND p.zahlungseingang_am IS NULL;
```

- **Stand 2026-07-07: alle 0** (`regulierungs_betrag` = 1 Row, bereits ledgered als vs_ist; `auszahlung_gutachter_*` = 0 prod-Daten).
- Wenn zum Drop-Zeitpunkt **> 0**: erst backfillen (INSERT/UPDATE `claim_payments` aus dem Cache) via `apply_migration`, dann Recheck = 0.

## Schritt 2 — Views pure-ledger repointen (`apply_migration`, guarded DO-block)

Die Cache-Spalten stehen im `COALESCE(ledger, cache)` der Views. Vor dem Column-Drop den **cache-Arm entfernen**:

```
regulierung_betrag:                    COALESCE(p.vs_ist, p.vs_soll, c.regulierungs_betrag)          → COALESCE(p.vs_ist, p.vs_soll)
auszahlung_gutachter_betrag:           COALESCE(p.sv_ist, c.auszahlung_gutachter_betrag)             → p.sv_ist
auszahlung_gutachter_eingegangen_am:   COALESCE(p.sv_am,  c.auszahlung_gutachter_eingegangen_am)     → p.sv_am
```

- **Betroffene Views** (Stand 07.07. — nach 470d55c9-Rebuild neu pruefen): `v_claim_base` (Wurzel), `v_claim_full`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`. Die Nicht-Wurzel-Views erben die Geld-Felder ueber bare `base`-Refs → i.d.R. reicht der Repoint in `v_claim_base`; **verifizieren** ob nach dem Rebuild noch so (sonst jede betroffene View einzeln).
- **Technik:** `pg_get_viewdef` → chirurgische `replace()` mit `count==1`-Guards + `RAISE EXCEPTION`/Skip → `CREATE OR REPLACE VIEW … AS … || d`. Vorlage: Migration `20260707134532_v_claim_base_ledger_central` (#3795, exakte Anchors). Views bleiben **DEFINER** + `REVOKE anon`; Signatur-md5 (nur die 3 geaenderten Ausdruecke, Rest byte-identisch).
- **Koordination:** `470d55c9` besitzt die `v_claim_base`-Def → Repoint auf IHRER finalen Form (oder sie bauen direkt pure-ledger, dann entfaellt der Repoint dort). `6c630247` falls sie `v_faelle` umbauen.

## Schritt 3 — Cache-Spalten droppen (`apply_migration`)

```sql
ALTER TABLE public.claims
  DROP COLUMN regulierungs_betrag,
  DROP COLUMN auszahlung_gutachter_betrag,
  DROP COLUMN auszahlung_gutachter_eingegangen_am;
```

- ⚠ **Erst NACH Schritt 2** (sonst „column … does not exist" in den Views).
- ⚠ **`src/lib/faelle/claim-duplicate-columns.ts`**: die 3 Spalten aus `CLAIM_OWNED_DUPLICATE_COLUMNS` (Zeile ~120 `auszahlung_gutachter_betrag`) + der `regulierung_betrag: 'regulierungs_betrag'`-Rename-Map (~272) entfernen — sonst routet `splitOrKeepFaelleUpdate` auf gedroppte Spalten → Runtime-Fehler. Test `claim-duplicate-columns.test.ts` (Zeilen ~153/167/172 `auszahlung_gutachter_betrag`) anpassen.
- File==recorded-version (Regel 2, Schritt 3+4 des DDL-Ablaufs).

## Schritt 4 — Code-Cleanup

- **`ClaimPaymentRerouteFields`** aus `src/lib/faelle/claim-payments.ts` loeschen — nach #3845 (process-event → `ClaimPaymentFields`) + #3831 ist der Typ 0-Consumer. (Kann auch schon vorher als eigener Mini-PR laufen, sobald #3845+#3831 gemergt sind.)
- `database.types.ts` regenerieren (`generate_typescript_types`) — die 3 Spalten sind weg.

## Schritt 5 — Prod-Smoke (nach Deploy)

- Money-Reader zeigen korrekte Werte: `analytics/finance` (Cashflow-Erwartet), `admin/finance` (Durchschnitt), `send-fall`/`whatsapp` (Betrag im Text), `gutachter/fall` + Kunde-`AuszahlungCard` (SV-Auszahlung).
- Golden-Abrechnungstests gruen (`src/lib/abrechnung`).
- `v_claim_base`/`v_faelle`: `regulierung_betrag` + `auszahlung_gutachter_*` kommen korrekt aus dem Ledger.

## Ownership / Reihenfolge

1. `6f60c510` (payment-ledger) faehrt Schritt 1, 3, 4, 5 + Schritt 2 wo es die Ledger-Invarianten betrifft.
2. `470d55c9` besitzt die `v_claim_base`-Def → Schritt 2 auf ihrer finalen View (oder sie bauen direkt pure-ledger).
3. `6c630247` (v_faelle Termin-Lifecycle) → Schritt 2 falls sie `v_faelle` umbauen.

**Koordinations-Marker:** `memory/COORDINATION-payment-ledger-normalisierung.md` +
`memory/BROADCAST-vclaimbase-vfaelle-ledger-central-live.md` (Invarianten + „Cache-DROP = finaler Joint-Step").
