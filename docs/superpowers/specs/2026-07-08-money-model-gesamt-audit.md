# Money-Model-Gesamt-Audit (pre-launch Health-Check)

> 2026-07-08 (Session `6f60c510`, nach `claim_payments`-Normalisierung + Provisions-Ledger-Assessment).
> Aaron: „Money-Model-Gesamt-Audit". Read-only Assessment über die Geld-Tabellen; Findings an die
> Owner geroutet, keine Solo-Fixes in fremden Lanes.

## TL;DR
Das Money-Model ist **weitgehend gesund**: **kein aktiver anon-Leak** (RLS gatet überall), **ein
write-dead Loch** (bereits im Fixen), Provisions-Struktur verstreut aber funktional. Wichtigster
neuer Fund: **anon-Grant-Hygiene-Inkonsistenz** auf ~7 Money-Tabellen (Defense-in-Depth-Lücke, kein
aktiver Leak). Geprüfte Dimensionen: Security/RLS, Holes (write-dead), Struktur/Duplizierung. Nicht
abgedeckt (Follow-up/Workflow): Reconciliation-Invarianten (earned↔paid↔invoiced) + USt/Rundungs-Konsistenz.

## Pass 1 — Security (RLS + anon-Exposure) · Fund: HYGIENE (LOW-MED, kein aktiver Leak)
Empirisch (pg_policy + grants, prod): **kein Money-Table leakt an anon.** Aber ~7 Money-Tabellen
tragen **unnötige `anon`-SELECT-Grants** entgegen der „REVOKE anon"-Konvention (die `claim_payments`/
`partner_gutschriften`/`makler_provisionen`/`abrechnungen` befolgen):

| Tabelle | anon-Grant | RLS schützt? | warum kein Leak |
|---|---|---|---|
| `werkstatt_provisionen` | ✅ (untidy) | ✅ | Policy PUBLIC mit `w.user_id=auth.uid()` → anon NULL → 0 Zeilen |
| `makler_staffel_bonus` / `werkstatt_staffel_bonus` | ✅ | ✅ | dito (`m/w.user_id=auth.uid()`) |
| `makler_staffel_stufen` / `werkstatt_staffel_stufen` | ✅ | ✅ | dito |
| `gutschriften` (SV) | ✅ | ✅ | Policies `{authenticated}`-only → anon default-deny |
| `zahlungseingaenge` / `zahlungspositionen` | ✅ | ✅ | Policy `{authenticated}` + `can_access_claim()` |
| `promotion_codes` | ✅ | ✅ | Policies `{authenticated}`-only |

**🔑 Rote Inkonsistenz:** `makler_provisionen` = anon **revoked**, aber sein Struktur-Zwilling
`werkstatt_provisionen` = anon **granted**. Gleiche Tabelle, divergente Grants → riecht nach Oversight.
Defense-in-Depth: eine künftige Policy-Änderung (z.B. versehentlich PUBLIC-permissiv) würde bei den
anon-granted Tabellen sofort exponieren; bei den revoked nicht. **Empfehlung: `REVOKE SELECT ON <tabelle> FROM anon`**
für die 7 Money-Tabellen (die staffel/gutschriften/zahlungs-Tabellen; promotion_codes prüfen ob ein
public-Validierungs-Flow den Grant braucht). → **Lane `eaf5be72` (systematischer anon-Exposure-Guard, #3800).**

## Pass 2 — Holes (write-dead Money-Felder) · Fund: 1 (im Fixen)
Methode: Money-Felder, die UI-seitig gelesen/angezeigt werden, aber die kein Code schreibt (silent NULL).
- **`auszahlung_gutachter_betrag`** = write-dead (0 Writer, 0 prod-Daten, 3 Reader über Views). **Gefunden +
  geschlossen** in #3845 (stammdaten-`auszahlungLedger` sv/betrag ergänzt). → **erledigt (me)**.
- Gegenprobe gesund: `sv_nachzahlung_netto`/`guthaben_verrechnet_netto`/`marketing_provision`/
  `kanzlei_honorar`/`lead_preis_netto` haben echte Writer (abrechnung/process-case-billing, 12 Files). **Keine weiteren Löcher.**

## Pass 3 — Struktur / Duplizierung · Fund: 2 (assessed, geroutet)
- **Provisions-Ledger verstreut:** `makler_provisionen`≈`werkstatt_provisionen` + `makler/werkstatt_staffel_bonus`
  identisch = table-per-Partner-Typ-Duplizierung → unifizierbar zu `partner_provisionen(partner_typ)`. 0-rows=billig.
  **Assessment #3856**, an `457ab612` geflaggt. DRY, kein Korrektheits-Bug.
- **Polymorphe FK-Fragilität:** `partner_gutschriften.ledger_tabelle` (String-FK auf die Provisions-Tabellen)
  = T6b-CRITICAL-Bug-Quelle → typsichere Konstante. → `457ab612`.
- **`gutschriften` (SV):** eigener lebender Refund-Ledger (revert-case-billing, sv_id/stripe_refund) — **gesund,
  separat, kein Legacy.**

## Nicht abgedeckt (ehrlich) — Follow-up-Dimensionen
- **Reconciliation-Invarianten:** verhindert der Code, dass earned (Provisionen) ↔ paid (ausgezahlt/Gutschrift)
  ↔ invoiced (abrechnungen) still divergieren? (0-rows → nur Code-Invarianten prüfbar, nicht Daten.)
- **USt/Rundungs-Konsistenz:** netto/ust_betrag/betrag_brutto-Tripel über alle Tabellen konsistent gerechnet?
  (Golden-Abrechnungstests decken Teile.)
- Ein vollständiger Sweep über ALLE ~15 Money-Tabellen × Dimensionen wäre ein natürlicher Multi-Agent-Workflow
  (1 Agent je Ledger/Flow) — auf Opt-in.

## Routing
| Fund | Severity | Owner | Status |
|---|---|---|---|
| anon-Grant-Hygiene (7 Tabellen + makler/werkstatt-Inkonsistenz) | LOW-MED | `eaf5be72` anon-guard | offen (geflaggt) |
| Provisions-Duplizierung + polymorphe FK | LOW (DRY) | `457ab612` | #3856 geflaggt |
| `auszahlung_gutachter_betrag` write-dead | — | `6f60c510` (me) | #3845 gefixt |
| Reconciliation + USt-Konsistenz | ? | offen | Follow-up/Workflow |
