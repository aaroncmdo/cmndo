# CMM-44 SP-J — Abschluss-Handoff (Zahlungs-/Abrechnungs-Spalten)

**Datum:** 2026-05-22 · **Status:** Code + Migration fertig + auf staging/main; eine Design-Entscheidung offen (`claims.zahlungsweg`).

## Was SP-J war
Die 12 zahlungs-/abrechnungsbezogenen `faelle`-Spalten gemäß einem korrigierten Split migriert (das Phase-1-Original „alle → `abrechnungen` MOVE" war falsch — `abrechnungen` ist die Empfänger-Rechnung ohne `claim_id`).

## Endgültiger Split (4 Buckets)
| Bucket | Spalten | Heimat | Mechanismus |
|---|---|---|---|
| **A (2)** | `zahlung_eingegangen_am`→`zahlungseingang_am`, `zahlung_betrag`→`erhaltener_betrag` | `claim_payments` (1:N) | Reroute+Rename, create-or-update aktuelle Row, Shared-Helper `src/lib/faelle/claim-payments.ts` |
| **B (8)** | `guthaben_verrechnet_netto`, `schlussabrechnung_am`, `auszahlung_gutachter_betrag`/`_eingegangen_am`/`_zahlungsweg`, `sv_nachzahlung_netto`, `abrechnung_id`, `kanzlei_abrechnung_id` | `claims` (1:1) | ADD (PR1) + `CLAIM_OWNED_DUPLICATE_COLUMNS`/`splitOrKeepFaelleUpdate` + View-Repoints |
| **C (1)** | `zahlung_erwartet_am` | — (Phase-6-DROP) | nicht migriert, Reader degradiert |
| **bleibt faelle (1)** | `zahlungsweg` | `faelle` (vorerst) | Fehl-Mapping korrigiert — s.u. |

## PRs
- **PR1** (Bucket-B ADD + Backfill + 3 View-Repoints): #1547-Vorgänger (Migration `20260522133422`).
- **PR2** (Code-Sweep A+B+C): **#1547** (squash `ebe350c2`), auf staging + main (#1548).
- **Korrektur** (zahlungsweg + Portal-Smoke): **#1551** (OFFEN gegen staging — bitte mergen; behebt einen Laufzeit-Bug, s.u.).
- **PR3** (Catch-up COALESCE Bucket-B): Migration `20260522185517` appliziert + repaired (0-Divergenz No-Op, Safety-Net) — diese PR.

## Lessons
1. **Namensgleichheit ≠ Semantik-Gleichheit.** `faelle.zahlungsweg` `{kundenkonto,werkstatt_direkt}` (Auszahlungs-ZIEL) und `claim_payments.zahlungsweg` `{ueberweisung,scheck,bar,verrechnung}` (Zahlungs-METHODE) teilen nur den Namen. Der Spec-Entwurf mappte sie „gleich" → PR2 hätte beim Kunde-`updateZahlungsweg` einen CHECK-Verstoß zur Laufzeit produziert. **Vor jedem Rename-Mapping die CHECK-Domains BEIDER Spalten live vergleichen.**
2. **Write-Round-Trip-Probe fängt, was Build/vitest/Review nicht sehen.** `scripts/probe-spj-roundtrip.mjs` (INSERT→read→delete gegen Live-DB) deckte den CHECK-Mismatch auf — Build, tsc, vitest und 2-Stufen-Review waren alle grün. Für heikle Reroutes mit Constraints: immer eine echte Schreib-Probe.
3. **Voller `npm run build` ist Pflicht** (nicht nur `tsc --noEmit`): Der Next-Build-TypeChecker fing einen `never`-Narrowing-Fehler in `fall-finanzen` (`const x: Date|null = null` → `x && x<Date`), den `tsc --noEmit` durchließ.
4. **View-/Prop-gespeiste Reader fängt der `from('faelle')`-Grep NICHT** (z.B. `autoPhase` las `zahlung_eingegangen_am` aus `v_faelle_mit_aktuellem_termin` = PR1-NULL-Platzhalter → Auto-Abschluss tot). Separater Property-Read-Grep `\.(col)\b` + Bewusstsein, dass View-Bucket-A-Reads den NULL-Platzhalter lesen → auf `claim_payments` umbiegen.
5. **`db query --linked` 544-Timeout bei 3+ Parallel-Sessions** → read-only Checks via Supabase-MCP `execute_sql` (Management-API, kein Pooler).
6. **Inventur via 3 Quellen:** `from()`-Window-Grep + Assignment-Grep (`<col>[:=]`, fängt Object-Build-Writes wie lexdrive `updates.zahlung_*`) + Live-View-Spalten-Check (Pattern-E von echten Reads trennen).
7. **claim_payments 1:N + Bulk-Reads:** Single-Claim via Helper (`getCurrentClaimPayment`), Bulk via Nested-Embed `claims:claim_id(claim_payments(...))` + JS-Normalisierung; Filter (`.is(null)`) lässt sich nicht auf Embeds ausdrücken → JS-Filter bzw. repointete View.

## Offen
- **`claims.zahlungsweg`-Spalte** (Auszahlungs-Ziel, 1:1) als Phase-6/Folge-Migration — **Aaron-Entscheidung**. Bis dahin bleibt `zahlungsweg` auf `faelle` (funktioniert, richtige CHECK-Domain).
- **#1551 mergen** (Korrektur — prod hat aktuell den zahlungsweg-Bug, pre-launch low-impact).
- **Phase-6-Owner:** `matelso_calls.fall_id→faelle(id) ON DELETE SET NULL` vor faelle-Drop auf `claims(id)` umhängen.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
