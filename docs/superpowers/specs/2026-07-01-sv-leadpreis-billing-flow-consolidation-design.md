# SV-Leadpreis Billing-Flow — Konsolidierungs-Design

**Datum:** 2026-07-01
**Status:** DRAFT — wartet auf Aaron-Entscheidung (4 Punkte, s. u. §5)
**Kontext-Auslöser:** Aaron-Challenge "schadenhöhe gegen gutachter-abrechnung bzgl leadpreistabelle" (30.06.). Die Algorithmus-Divergenz wurde in PR #3357 behoben; diese Spec adressiert den dabei aufgedeckten **größeren** Befund: mehrere parallel verdrahtete SV-Guthaben-Abzüge.
**Verwandt:** PR #3357 (Algorithmus-Konsolidierung `leadpreis.ts` → `getLeadPriceFromTable`), PR #3337 (`LeadPreiseVerteilungWidget` → `claims.lead_preis_netto`), AAR-924 (`processCaseBilling` + `case-billing-batch`), AAR-925 (`monatsabrechnung` deprecated), KFZ-149, CMM-44/49.

---

## 1. Zweck & Umfang

**Zweck:** Den SV-Leadpreis (was ein Sachverständiger pro vermitteltem Lead zahlt) auf **einen** kanonischen Billing-Flow konsolidieren — ein Zeitpunkt, eine Schadenhöhe-Quelle, ein Guthaben-Modell, ein Ledger. Aktuell existieren drei live-verdrahtete Abzugs-Mechanismen (plus ein deprecated vierter), die sich in allen vier Dimensionen widersprechen.

**In Scope:** SV-seitiges Leadpreis-Billing (Guthaben-Abzug + Ledger-Eintrag) für die SV-Vermittlung. Refund/Storno-Gegenbuchung. Reader der betroffenen Ledger-Tabellen (SV-Portal, Admin-Analytics).

**Out of Scope (bewusst):** Kanzlei-Honorar, Marketing-Provision, Werkstatt-Vermittlungs-Gebühr (eigene Billing-Pfade). Die Leadpreis-**Tabelle** selbst (`leadpreise_tabelle`, 33 Stufen) — bleibt unverändert, ist bereits SSoT nach #3357. Stripe/Zahlungs-Einzug.

---

## 2. Ist-Zustand (kartiert 30.06.–01.07., gegen origin/staging + Prod-DB)

Es gibt **vier** Code-Pfade, die einen Leadpreis berechnen und (drei davon) das SV-Guthaben belasten:

| # | Trigger | Funktion | Schadenhöhe-Quelle | Algorithmus | Guthaben-Modell | Ledger |
|---|---|---|---|---|---|---|
| **1** | SV-**Zuweisung** (`api/sv-zuweisung/route.ts:476`) | `gutachterTasking.deductLeadpreis` | `claims.regulierungs_betrag` | `calculateLeadpreis`: ≤5000→200, ≤10000→250, sonst 300 (**hardcoded 3-Stufen**) | **voller** Abzug (`decrement_guthaben` RPC) | `gutachter_abrechnungen` (Ledger-Shape: `typ='leadpreis', betrag=-X, beschreibung`) |
| **2** | **Gutachten-Upload** (`gutachter/fall/[id]/actions.ts` `uploadGutachten`) | inline-Block | `betrag` (= übergebener Gutachten-Betrag, auch nach `gutachten.gesamt_schadensbetrag` geschrieben) | `getLeadPriceFromTable` (DB next-tier, seit #3357) | **voller** Abzug | `gutachter_abrechnungen` (Snapshot-Shape: `schadenhoehe, leadpreis, preistyp, guthaben_vorher/nachher, monat`) |
| **3** | **Cron** `case-billing-batch` (AAR-924, **als kanonisch bezeichnet**) | `processCaseBilling` | `claims.schadens_hoehe_netto ?? gutachten.gesamt_schadensbetrag` | `getLeadPriceFromTable` (DB next-tier) | **MIN(150)** Abzug + `sv_nachzahlung`, Kontingent-gated | `claims.lead_preis_netto/-typ/-berechnet_am` + `guthaben_verrechnet_netto` + `sv_nachzahlung_netto` |
| **4** | Cron `monatsabrechnung` (**deprecated** AAR-925) | inline | `claims.schadens_hoehe_netto` (via View) | `getLeadPriceFromTable` (DB next-tier, seit #3357) | keiner (nur Aggregat) | `gutachter_monatsabrechnungen` + `-positionen` + update `claims.lead_preis_*` |

### 2.1 Kernprobleme

1. **Latenter Dreifach-Abzug.** Mechanismen 1, 2, 3 belasten alle das SV-Guthaben, zu unterschiedlichen Lifecycle-Zeitpunkten. Nur #3 hat einen Idempotenz-Guard (`if lead_preis_netto != null → no-op`). #1 (Zuweisung) und #2 (Upload) haben keinen — ein Fall, der zugewiesen wird, ein Gutachten erhält und vom Cron erfasst wird, würde **dreimal** Guthaben abgezogen, mit **drei verschiedenen Beträgen**.

2. **Vier Algorithmen / drei Schadenhöhe-Quellen.** Selbst nach #3357 (das #2/#3/#4 auf `getLeadPriceFromTable` vereinheitlicht hat) nutzt #1 noch die crude Hardcoded-Stufe `200/250/300`. Und die Schadenhöhe-Basis ist dreifach uneinheitlich: `regulierungs_betrag` (#1) vs. `gutachten.gesamt_schadensbetrag` (#2) vs. `schadens_hoehe_netto` (#3/#4).

3. **`gutachter_abrechnungen` in zwei inkompatiblen Shapes.** #1 schreibt einen **Ledger** (`typ/betrag/beschreibung`, +Refund-Gegenbuchungen), #2 schreibt einen **Snapshot** (`schadenhoehe/leadpreis/preistyp/monat`). Reader (s. §3) selektieren die Spalte `leadpreis` — die bei #1-Zeilen NULL ist → Analytics würde #1-Kosten nicht zählen.

4. **Zwei Guthaben-Modelle.** #1/#2 ziehen den **vollen** Leadpreis ab; #3 zieht **MIN(150)** ab und bucht den Rest als `sv_nachzahlung`. Semantisch unvereinbar (ist das Guthaben ein Werbebudget-Puffer, gegen den nur teil-verrechnet wird — oder die volle Rechnung?).

### 2.2 Prod-Datenlage (Beweis: barely-exercised, latent, nicht akut)

Query gegen Prod (`paizkjajbuxxksdoycev`, 01.07.):
- `gutachten` fertiggestellt: **2** — davon mit `gesamt_schadensbetrag`: **0**
- `gutachter_abrechnungen`: **0 Zeilen** (weder #1 noch #2 hat je geschrieben)
- `claims` mit `lead_preis_netto`: **1** (= 200 €, Floor; #3 lief einmal)
- `claims` mit `schadens_hoehe_netto`: **2**; Fälle wo `schadens_hoehe_netto` UND `gutachten.gesamt_schadensbetrag` beide gesetzt + verschieden: **0**

→ Der Dreifach-Abzug ist **strukturell real, aber in Prod noch nie eingetreten** (Vermittlung läuft erst an). Das ist das **ideale Zeitfenster**, den Flow zu definieren, bevor echtes Geld fließt.

---

## 3. Consumer der betroffenen Ledger (Impact-Analyse)

**`gutachter_abrechnungen`** wird gelesen von:
- `app/gutachter/abrechnung/page.tsx` — SV-Portal Abrechnungsübersicht (nutzer-sichtbar)
- `app/gutachter/fall/[id]/page.tsx` — SV-Fall-Detail (nutzer-sichtbar)
- `lib/analytics/sv-performance.ts` — `.select('leadpreis')`
- `lib/analytics/finance.ts` — `.select('leadpreis, monat')` (Admin-Finance SV-Kosten)
- `lib/finance/fall-finanzen.ts` — Fall-Finanz-Aggregat
- `app/faelle/[id]/_actions/core.ts` — Cascade-Delete bei Fall-Löschung
- `lib/gutachter/abrechnung.ts` — Typ-/Reader-Helper

**`claims.lead_preis_*`** wird gelesen von: Admin-Finance-Hub (`admin/finance/(hub)/page.tsx`, `offene-faelle/page.tsx`), `LeadPreiseVerteilungWidget` (nach #3337), `process-case-billing`/`revert-case-billing`.

**Refund-Pfad:** `gutachterTasking.refundLeadpreis` (Gegenbuchung in `gutachter_abrechnungen`) wird bei Storno gerufen (`dispatch-fall-actions.ts:230`). Parallel existiert `lib/abrechnung/revert-case-billing.ts` — die kanonische Gegenbuchung zu `processCaseBilling` (claims-basiert). Auch der Refund ist also doppelt.

---

## 4. Ziel-Architektur (Empfehlung)

**Ein Charger: `processCaseBilling` (Mechanismus #3) wird der einzige SV-Guthaben-Abzug.**

Begründung:
- Bereits als kanonisch designiert (AAR-924); die Admin-Finance-UI referenziert es explizit als DIE Billing-Quelle.
- Einziger mit **Idempotenz-Guard** (kein Doppel-Abzug bei Retry/Cron).
- Schreibt in `claims` (CMM-44/49 SSoT) mit vollständiger Invariante (`lead_preis = guthaben_verrechnet + sv_nachzahlung`).
- Nutzt bereits die DB-Tabelle (next-tier, #3357-konform) + Kontingent-Logik.
- Hat eine kanonische Gegenbuchung (`revert-case-billing.ts`).

**Konsequenzen:**
1. Mechanismus **#1 (`deductLeadpreis`@Zuweisung)** → neutralisieren (Aufruf in `sv-zuweisung` entfernen); `calculateLeadpreis` (200/250/300) löschen.
2. Mechanismus **#2 (uploadGutachten-inline)** → Guthaben-Abzug + `gutachter_abrechnungen`-Write entfernen (Gutachten-Upload triggert stattdessen nur den Status-/Phase-Übergang; die Bepreisung übernimmt `processCaseBilling`, ggf. direkt getriggert statt nur per Cron).
3. Mechanismus **#4 (`monatsabrechnung`-Cron)** → deprecated, VPS-Crontab-Eintrag entfernen + Route löschen (AAR-925-Migrationspfad zu Ende führen).
4. **Refund** → einheitlich über `revert-case-billing.ts`; `refundLeadpreis` + `gutachterTasking`-Ledger-Logik entfernen.
5. **Reader** von `gutachter_abrechnungen` → auf `claims.lead_preis_*` umstellen (analog #3337). `gutachter_abrechnungen` danach entweder retiren oder als reiner Anzeige-View auf claims neu aufbauen (Unterfrage in D4).

Diese Ziel-Architektur ist die **Empfehlung**; die vier Punkte unten sind die Stellen, an denen die Empfehlung eine explizite Aaron-Entscheidung braucht, weil sie Geld/Timing/Nutzer-Sicht betreffen.

---

## 5. Offene Entscheidungen (Aaron entscheidet beim Review)

### D1 — Zeitpunkt: Wann wird der SV belastet?
- **(a) Bei Zuweisung** (heute #1) — früh; Risiko: SV lehnt ab / Fall storniert → Refund-Dance.
- **(b) Bei Gutachten-Upload** (heute #2) — mittel; SV hat Arbeit geleistet.
- **(c) Bei Fall-Fortschritt/Abschluss via `case-billing-batch`** (heute #3) — spät, idempotent, fair. **← Empfehlung.**

### D2 — Schadenhöhe-Quelle für die Bepreisung
- **(a)** `claims.regulierungs_betrag`
- **(b)** `gutachten.gesamt_schadensbetrag`
- **(c)** `claims.schadens_hoehe_netto ?? gutachten.gesamt_schadensbetrag` (Netto-RK, was #3 nutzt). **← Empfehlung** (das Pricing-Modell ist als f(Netto-Reparaturkosten) definiert).

### D3 — Guthaben-Modell
- **(a) Voller Leadpreis-Abzug** vom Guthaben (heute #1/#2).
- **(b) MIN(150)-Abzug + `sv_nachzahlung`** (heute #3) — Guthaben = Werbebudget-Puffer, Rest wird nachberechnet. **← Empfehlung** (aktuelles kanonisches Modell). *Bestätigen: ist die 150-€-Deckel-Regel gewollt/aktuell?*

### D4 — Ledger / SV-Portal-Sicht
- **(a)** `gutachter_abrechnungen` als SSoT behalten (Reader bleiben).
- **(b)** `claims.lead_preis_*` als SSoT; `gutachter_abrechnungen` retiren, Reader umstellen. **← Empfehlung.**
- **(c)** `claims` als SSoT **+** `gutachter_abrechnungen` als abgeleiteter Anzeige-View (SV-Portal braucht evtl. eine Pro-Fall-Ledger-Darstellung inkl. Refunds, die claims allein nicht 1:1 liefert). *Unterfrage: braucht das SV-Portal eine eigene Ledger-/Refund-Historie, oder reicht `claims.lead_preis_netto` + `sv_nachzahlung_netto`?*

---

## 6. Implementierungs-Skizze (nach Entscheidung — noch KEIN Code)

Abhängig von D1–D4, für die empfohlene Variante (c/c/b/b):
1. `sv-zuweisung/route.ts`: `deductLeadpreis`-Aufruf entfernen.
2. `gutachterTasking.ts`: `deductLeadpreis` + `refundLeadpreis` + `calculateLeadpreis` entfernen (grep: nur Zuweisung + Storno als Caller).
3. `gutachter/fall/[id]/actions.ts`: "Automatische Abrechnung"-Block entfernen; stattdessen `processCaseBilling(fallId)` triggern (oder dem Cron überlassen).
4. `dispatch-fall-actions.ts`: Storno-Refund auf `revert-case-billing.ts` umstellen.
5. `monatsabrechnung/route.ts`: löschen + VPS-Crontab-Eintrag (Aaron/Infra).
6. Reader (`sv-performance.ts`, `finance.ts`, `fall-finanzen.ts`, `gutachter/abrechnung/page.tsx`, `gutachter/fall/[id]/page.tsx`, `gutachter/abrechnung.ts`): auf `claims.lead_preis_*` umstellen.
7. Ggf. `gutachter_abrechnungen`-Tabelle retiren (DDL via Plugin, separate Migration) — nur wenn D4=(b).

Jeder Schritt einzeln testbar; Reihenfolge so, dass nie ein Charger doppelt läuft (erst #1/#2/#4 abschalten, dann Reader umstellen, dann Tabelle retiren).

---

## 7. Risiken & Rollout

- **Geld.** Jede Änderung betrifft SV-Belastung. Mitigant: Prod ist barely-exercised (0 Ledger-Zeilen) → jetzt ist das risikoärmste Fenster.
- **Refund-Kontinuität.** Der Storno-Pfad darf nicht brechen — `revert-case-billing` muss die Fälle abdecken, die heute `refundLeadpreis` bediente. Vor Abschaltung von #1 verifizieren.
- **SV-Portal-Regression.** Reader-Umstellung muss die SV-sichtbare Abrechnungsübersicht erhalten (D4-Unterfrage). E2E als SV.
- **Backfill.** 0 bestehende `gutachter_abrechnungen`-Zeilen → kein Datenbackfill nötig (Glücksfall des frühen Zeitfensters).

---

## 8. Erfolgskriterien

- Genau **ein** Code-Pfad zieht SV-Guthaben ab, mit **einer** Schadenhöhe-Quelle, **einem** Algorithmus (DB-Tabelle), **einem** Guthaben-Modell, **einem** SSoT-Ledger.
- Kein Pfad kann denselben Fall doppelt belasten (Idempotenz).
- SV-Portal + Admin-Analytics zeigen konsistente, aus dem SSoT abgeleitete Zahlen.
- Storno-Refund funktioniert über den einen kanonischen Gegenbuchungs-Pfad.
- `build`/`tsc`/Ratchets grün; per-SV E2E (Zuweisung → Gutachten → Billing → Storno) grün.
