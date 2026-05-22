# CMM-44 SP-J PR2 — Portal-Smoke + Round-Trip-Probe (gegen staging)

**Datum:** 2026-05-22 · **Gegen:** `app.staging.claimondo.de` (nach PR2-Merge #1547 squash `ebe350c2`)
**Scripts:** `scripts/smoke-cmm44-spj.mjs` (Navigation + DB-Sanity), `scripts/probe-spj-roundtrip.mjs` (Bucket-A write→read→delete)

## TL;DR
SP-J-Reads/Writes auf deployed staging **verifiziert** — bulk + single Bucket-A-Reads liefern echte Zahlen, alle 5 Portale rendern. **1 Spec-Fehl-Mapping gefunden + korrigiert** (`zahlungsweg`, s.u.). 1 HARD = pre-existing React #418 (Hydration, kein SP-J-Regress, Seite rendert vollständig).

## DB-Sanity (Service-Role)
| Check | Ergebnis |
|---|---|
| claims trägt die 8 Bucket-B | ✅ OK (alle 8 lesbar) |
| claim_payments lesbar | ✅ OK (0 Rows, pre-launch erwartet) |
| Nested-Embed `faelle→claims→claim_payments` resolvt (PostgREST-Live-Schema) | ✅ OK (analytics/conversion/getUmsatz-Pfad valide) |

## 🔴 Befund (Round-Trip-Probe): `zahlungsweg` war Bucket-A-fehl-gemappt → korrigiert
Der erste Round-Trip-INSERT in `claim_payments` mit `zahlungsweg='kundenkonto'` schlug am CHECK fehl:
```
new row for relation "claim_payments" violates check constraint "claim_payments_zahlungsweg_check"
```
Live-Constraints (via MCP):
- `faelle.zahlungsweg` CHECK = `{kundenkonto, werkstatt_direkt}` — Auszahlungs-**ZIEL** des Kunden.
- `claim_payments.zahlungsweg` CHECK = `{überweisung, scheck, bar, verrechnung}` — Zahlungs-**METHODE**.

⇒ Gleicher Spaltenname, **verschiedene Semantik + disjunkte Domain**. Der Spec-Entwurf (`zahlungsweg→zahlungsweg "gleich"`) war falsch; PR2 hätte beim Kunde-`updateZahlungsweg` einen CHECK-Verstoß zur Laufzeit produziert (Zahlungsweg-Wahl wäre still fehlgeschlagen).

**Korrektur (in dieser Follow-up-PR):** `zahlungsweg` aus dem claim_payments-Reroute entfernt — bleibt auf `faelle` (3 Sites zurückgesetzt: `kunde/updateZahlungsweg`, `get-kunde-faelle`, `lexdrive`). Echte Bucket-A = **nur 2 Spalten** (`zahlung_eingegangen_am`, `zahlung_betrag`). Proper Heimat für `faelle.zahlungsweg`: eine eigene `claims.zahlungsweg`-Spalte (Auszahlungs-Ziel, 1:1) — **Phase-6/Folge-Entscheidung für Aaron.**

## Round-Trip (korrigiert) — Bucket-A end-to-end ✅
Mit gültigen Werten (`zahlungseingang_am`, `erhaltener_betrag=123.45`, `zahlungsweg='überweisung'`) auf einem echten Claim:
- `getCurrentClaimPayment`-Query (Single-Claim, fall-finanzen/get-kunde-faelle) liest korrekt zurück. ✅
- Nested-Embed `faelle→claims→claim_payments` (analytics/conversion) trifft die Row. ✅
- INSERT→Read→DELETE sauber (try/finally + Sweep-Net `zahlungsreferenz='SMOKE-SPJ-TESTDELETE'`). ✅

## Navigation (5 Portale, Screenshots in `docs/22.05.2026/cmm44-spj-smoke/`)
| Portal/Route | Status | Screenshot-Analyse |
|---|---|---|
| public `/` | ✅ OK | Landing rendert |
| admin `/admin/finance` | ✅ OK | **getCashFlow/getUmsatz (Bucket-A bulk) liefern echte Zahlen:** „Ausstehende Zahlungen 1.500 €" (= erwartet via JS-`!hatZahlung`-Filter), „Monats-Umsatz 1.250 €" (= getUmsatz Nested-Embed). 002 |
| admin `/admin/finance/abrechnungen` | ✅ OK | rendert |
| admin `/faelle` | ✅ OK | Liste rendert |
| admin `/faelle/[id]` | ⚠️ HARD→pre-existing | **Seite rendert vollständig** (VS-Korrespondenz, Phasen, SV-Briefing, Quick-Actions — Screenshot 005). pageerror = React #418 (Hydration-Mismatch), bekannt/pre-existing (Plan + `feedback_rsc_redirect_stubs`); ein Daten-Read-Quellen-Wechsel kann KEINEN HTML-Hydration-Mismatch verursachen → **kein SP-J-Regress**. getFallFinanzen (Bucket-A single) lief (Seite rendert). |
| sv `/gutachter/abrechnung` | ✅ OK | rendert (Bucket-B via View) |
| sv `/gutachter/fall/[id]` | ✅ OK | rendert (CLM-2026-00186, Phasen/Checkliste — 007); KanzleiStatusCard view-gespeist (Bucket-A null = Non-Goal, bricht nicht) |
| kb `/faelle/[id]` | ✅ OK | rendert |
| kunde `/kunde` | ✅ OK | Dashboard rendert |

**HARD=1 (pre-existing #418), SOFT=1 (Round-Trip-Skip s.u.), OK=11.**

## Coverage-Lücke (Test-Daten, kein SP-J-Issue)
- `kunde /kunde/faelle/[id]` + der UI-Round-Trip wurden **übersprungen**: kein loginbarer `test-*`-Kunde besitzt einen claim-verknüpften Fall (via faelle.kunde_id oder claim_parties geschaedigter — live geprüft, 0 Treffer). Der Kunde-Bucket-A-Read (`getKundeFallDetailRecord`) nutzt **denselben** `getCurrentClaimPayment`-Helper wie `getFallFinanzen` (Admin-Fallakte gerendert) + ist durch die Round-Trip-Probe (DB-Ebene) abgedeckt. Restrisiko: niedrig (pre-launch).

## Verdikt
SP-J Bucket-A (2 Spalten) + Bucket-B (8, via View/Embed) + Bucket-C auf deployed staging verifiziert; `zahlungsweg`-Fehl-Mapping gefunden + korrigiert; #418 pre-existing. **Empfehlung an Aaron:** `claims.zahlungsweg`-Spalte (Auszahlungs-Ziel) als Phase-6/Folge-Migration entscheiden.
