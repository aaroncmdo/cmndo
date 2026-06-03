# AAR-947 / W1.3 — Paket-/Preis-Taxonomie: Inventar + Entscheidungsvorlage

**Stand:** 2026-06-02 · Branch `kitta/aar-947-pricing-inventar` (off `origin/staging` @ 9b6976c29)
**Zweck:** Read-only-Bestandsaufnahme aller Stellen, an denen Paketnamen + Beträge leben, damit Aaron **eine** SSoT + die korrekten Beträge festlegen kann. Danach wird konsistent durchgezogen (= eigentliche AAR-947-Umsetzung, gated auf diese Entscheidung).

> ⚠️ **Wichtigster Kontext:** Alle gefundenen DB-Divergenzen sind **Test-/Seed-Daten** (pre-launch, Stripe-Testmodus, ~10 Test-SVs). Das hier ist **Code-Config-Aufräumen vor Launch**, KEINE Geld-Rekonziliation echter Kundenrechnungen.

---

## ✅ ENTSCHEIDUNG (Aaron, 2026-06-02)

- **B — Beträge:** **Onboarding-Anzahlung = voller Paketpreis.** standard **1500** · pro **3750** · premium **7500** €. → `pro` = **3750** (nicht 3000); die separate „halbe Anzahlung" (750/1875/3750) **entfällt** — es gibt nur EINE Zahl pro Paket.
- **A — Naming:** `standard`/`pro`/`premium` kanonisch; Aliase `starter-10`/`standard-25`/`premium-50` retiren.
- **C — Modul:** `pakete.ts` = einzige SSoT; die anderen Quellen importieren daraus.

**Konsequenzen für die Umsetzung:**
- `anlegen/PAKET_KONFIG` ist bereits korrekt (1500/3750/7500) → nur Dedup via Import.
- **Finance-Hub `PAKET_PREIS` (750/1875/3750) ist unter dieser Entscheidung halbiert → echter Rechen-Bug:** die 75/25-Gewinn-/Umsatzverteilung rechnet mit halben Werten. Fix Pflicht (→ 1500/3750/7500).
- `pakete.ts.anzahlung`-Feld wird obsolet (Anzahlung == preis) → entfernen oder == preis setzen.
- **Backfill:** 3 `pro`-Test-SVs mit `onboarding_anzahlung_betrag=3000` → 3750; gedriftete `paket_faelle_gesamt` angleichen. **Koordiniert mit W3.2** (Daten-Cleanup zuletzt).

---

## 1 · Es gibt VIER Code-Pricing-Quellen (nicht zwei)

| # | Datei | standard | pro | premium | Bedeutung |
|---|---|---|---|---|---|
| 1 | `src/lib/pakete.ts` (`PAKETE`) — labelt sich „EINZIGE Quelle der Wahrheit" | preis **1500**, anz. **750**, 10 Fälle, 15 km | preis **3750**, anz. **1875**, 25 Fälle, 40 km | preis **7500**, anz. **3750**, 50 Fälle, 70 km | `anzahlung` = ~50 % Deposit |
| 2 | `src/app/admin/sachverstaendige/anlegen/constants.ts` (`PAKET_KONFIG`) — **schreibt real** `onboarding_anzahlung_betrag` | `preis_anzahlung_eur` **1500**, 10 Fälle, 15 km | **3750**, 25 Fälle, 40 km | **7500**, 50 Fälle, 70 km | `preis_anzahlung_eur` = **voller Paketpreis** als Deposit |
| 3 | `src/app/admin/finance/(hub)/page.tsx` (`PAKET_PREIS`) | **750** | **1875** | **3750** | als „Preis" gekeyt, = Quelle-1-`anzahlung` |
| 4 | `src/lib/leadpreis.ts` (`PREIS_TABELLE`) | — | — | — | **separate Domäne**: per-Lead-Preis nach Schadenhöhe (25 %/30 %, min 200 €). In sich konsistent → **nicht** Teil des Konflikts, unangetastet lassen. |

**Der Kern-Widerspruch:** Quelle 1 und Quelle 2 nennen dasselbe „Anzahlung", meinen aber Verschiedenes:
- **Quelle 1** (`pakete.ts`): Anzahlung = halbe Miete → pro = **1875**
- **Quelle 2** (`anlegen`): Anzahlung = **voller** Paketpreis → pro = **3750** ← *das wird tatsächlich auf `sachverstaendige` geschrieben*
- **Quelle 3** (`finance hub`): „Preis" = 1875 (= Quelle-1-Anzahlung), wieder anders gemeint

`pakete.ts` wird also von keinem der Schreib-Pfade als Autorität benutzt — der Selbst-Anspruch „EINZIGE Quelle der Wahrheit" stimmt **nicht**.

### Naming
- **DB-Spalte `sachverstaendige.paket`** speichert sauber `standard`/`pro`/`premium`.
- Die Legacy-Aliase `starter-10`/`standard-25`/`premium-50` leben nur in: `getPaket()`-Normalizer (`pakete.ts`), den Keys von `PAKET_PREIS` (finance hub) **und im Seed** (`seed-testdata/route.ts` schreibt sogar `paket: 'standard-25'` direkt in die Spalte → würde bei Seed-Lauf die Spalte verschmutzen).

---

## 2 · DB-Realität (live, Prod `paizkjajbuxxksdoycev`)

**`sachverstaendige`** (n=10 Test-SVs):
| paket | onboarding_anzahlung_betrag | paket_faelle_gesamt | n |
|---|---|---|---|
| pro | **3000** | 20 | 3 |
| pro | **3750** | 10 | 1 |
| pro | null | 10 | 1 |
| standard | **1500** | 10 | 3 |
| standard | null | 10/20 | 2 |
- `paket_preis` = **NULL bei allen** → tote Spalte.
- `paket_faelle_gesamt` driftet (10 / 20 / 25) — passt zu keinem Konstanten-Satz sauber.

**`sv_onboarding_rechnungen`** (n=4 echt ausgestellte Rechnungen):
| paket | netto | brutto |
|---|---|---|
| standard | **1500,00 €** | 1785,00 € |
| pro | **3000,00 €** | **3570,00 €** |

**`finance_eintraege`** (n=5): `typ='gutachter-anzahlung'`, `betrag` = **3750 flach** für alle (unabhängig vom Paket).

### Woher kommen die „krummen" 3000/3570?
Die `pro`-Rechnungen echoen `sachverstaendige.onboarding_anzahlung_betrag = 3000`. Dieser 3000-Wert stammt **nicht** aus dem aktuellen `PAKET_KONFIG` (das schreibt 3750) — also aus einem älteren Pfad/Seed oder dem Self-Service-Onboarding (SV-Basic/AAR-940). Die Rechnung gibt nur treu die gespeicherte Spalte wieder. → Die gespeicherte Spalte ist faktisch die SSoT pro Rechnung, und sie ist von **jeder** Code-Konstante abgewichen.

---

## 3 · Konsolidierte Widerspruchsliste

1. **„Anzahlung"-Semantik doppeldeutig** (halbe Miete vs. voller Preis) — Quelle 1 ≠ Quelle 2.
2. **Finance-Hub `PAKET_PREIS`** keyt Anzahlungs-Werte als „Preis" — dritte Lesart.
3. **pro-Deposit existiert in 3 Werten:** 1875 (Code Q1/Q3) · 3000 (DB-Rechnungen) · 3750 (DB-Spalte Q2/finance_eintraege).
4. **`paket_preis`-Spalte tot** (immer null).
5. **Kontingent/Fälle driften** (Q1 pro=25 vs. DB 10/20).
6. **Doppel-Aliase** `starter-10/standard-25/premium-50` neben `standard/pro/premium`; Seed schreibt Legacy-Namen in die Spalte.
7. **Zwei Anzahlungs-Spalten** auf `sachverstaendige`: `anzahlung_betrag` UND `onboarding_anzahlung_betrag` (meist redundant/0).

---

## 4 · Entscheidungen, die Aaron treffen muss

### A — Naming-SSoT
**Empfehlung:** `standard` / `pro` / `premium` (DB nutzt das bereits sauber). Aliase `starter-10/standard-25/premium-50` retiren: `getPaket()` als reinen Eingangs-Normalizer behalten ODER ganz raus, Finance-Hub-Keys + Seed angleichen. *Risiko niedrig.*

### B — Beträge-SSoT (der eigentliche Knoten)
Pro Paket je **drei** Zahlen festlegen: **(a) Voller Paketpreis · (b) Onboarding-Anzahlung · (c) Kontingent/Fälle + Radius**. Strittig ist nur die **Anzahlung**:

| Paket | „voller Preis" (Q1) | Anzahlung-Lager 1 (Q1/Q3 = halbe Miete) | Anzahlung-Lager 2 (Q2/`anlegen`, real geschrieben) | tatsächlich fakturiert (DB) |
|---|---|---|---|---|
| standard | 1500 | **750** | **1500** | 1500 |
| pro | 3750 | **1875** | **3750** | **3000** |
| premium | 7500 | **3750** | **7500** | — |

→ **Aaron muss sagen:** Ist die Onboarding-Anzahlung der **volle Paketpreis** (Lager 2, deckt sich mit den standard-Rechnungen über 1500) oder eine **Teil-Anzahlung** (Lager 1)? Und ist `pro` = **3000** (wie real fakturiert) oder **3750** (wie `pakete.ts`/`PAKET_KONFIG`)? Das ist die „3.000/3.570 vs 3.750"-Frage des Handoffs.

### C — Eine Quelle, ein Modul
**Empfehlung:** `pakete.ts` zur einzigen SSoT machen (hat alle Dimensionen: preis/anzahlung/fälle/radius). `PAKET_KONFIG`, finance-`PAKET_PREIS` und Seed **importieren** daraus statt eigener Literale. Zusätzlich entscheiden: tote `paket_preis`-Spalte droppen (gehört nach W3.2) und ob der Self-Service-Pfad (3000) auf dieselbe Konstante gezogen wird.

---

## 5 · Sobald entschieden — Umsetzungs-Skizze (gated)
1. `pakete.ts` als SSoT mit den von Aaron bestätigten Zahlen.
2. `PAKET_KONFIG` (anlegen) + `PAKET_PREIS` (finance) + Seed daraus ableiten (Re-Export/Import).
3. Alias-Normalisierung an einer Stelle bündeln; Seed auf `standard/pro/premium`.
4. Backfill-Migration für die ~10 Test-SVs (Anzahlung/Fälle angleichen) — koordiniert mit W3.2.
5. `paket_preis`-Spalte-Schicksal mit W3.2/CMM-Drop-Strecke.
6. Build + Smoke (Willkommen-/OrderSummary-/Finance-Hub-Anzeige).

**Kein DDL, kein Code-Cutover in diesem Branch** — nur dieses Inventar. Umsetzung folgt nach Aarons A/B/C-Entscheidung.
