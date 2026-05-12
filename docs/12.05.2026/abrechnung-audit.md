# Abrechnungs-Audit — SV-Pakete & Admin-Finance

**Datum:** 2026-05-12
**Aaron-Frage:** Funktioniert die Abrechnung sauber? Werden Fälle die ein SV bekommt im Paket berücksichtigt + in den Finanzen für Admins sichtbar? Wo fehlen noch Reports/Views?

---

## TL;DR

**Nein, sauber funktioniert sie nicht.** Es existieren **zwei parallele Cron-Jobs** mit unterschiedlichen Daten-Flows, die in **zwei verschiedene Tabellen-Sets** schreiben. Beide laufen vermutlich heute beide live — das erklärt die DB-Spuren:

| System | Cron | Tabellen | Rows in Prod |
|---|---|---|---|
| **Alt (KFZ-141)** | `cron/monatsabrechnung` | `gutachter_monatsabrechnungen` + `gutachter_abrechnungspositionen` | 1 + 0 |
| **Neu (KFZ-149 Block E)** | `cron/abrechnung-erstellen` | `abrechnungen` + `abrechnung_positionen` | 3 + 0 |

Beide Crons sind aktiv (laufen am Monatsende), beide schreiben unabhängig — **Doppel-Abrechnungs-Risiko** + UI-Drift (Admin-Hub liest aus altem `gutachter_abrechnungen`, das ist leer; SV-Portal-Sicht inkonsistent).

**Plus 3 weitere kritische Lücken:**
- `processCaseBilling()` (Per-Case-Berechnung mit Guthaben-Abzug) wird **nicht aufgerufen** → der neue Cron findet leere `lead_preis_netto`-Felder und überspringt sie
- `revertCaseBilling()` und `reissueAbrechnung()` existieren, aber kein Trigger bei Disqualifikation/Ablehnung
- `sv_payment_reminders` ist nie befüllt (0 Rows trotz fälliger Abrechnungen)

---

## 1. Drift zwischen den zwei Abrechnungs-Systemen

### System A — `cron/monatsabrechnung` (alt, KFZ-141)
Datei: `src/app/api/cron/monatsabrechnung/route.ts`

- Berechnet Lead-Preis **inline** mit `berechneLeadpreis(schaden, istImPaket)` aus `src/lib/leadpreis.ts`
- Pakets-Logik: zählt `paket_faelle_genutzt` vs. `paket_faelle_gesamt`
- Filter: Alle Fälle des Monats mit Termin (`v_faelle_mit_aktuellem_termin`), `status != 'storniert'`
- **Schreibt:**
  - `gutachter_monatsabrechnungen` (Header)
  - `gutachter_abrechnungspositionen` (Positionen)
  - `faelle.lead_preis_netto`, `lead_preis_typ`, `lead_preis_berechnet_am`
- **Schreibt NICHT:** `guthaben_verrechnet_netto`, `sv_nachzahlung_netto`, `abrechnung_id`
- **Risk:** Idempotenz nur über `(sv_id, monat)`-Unique-Check; kein Filter auf bereits abgerechnete Fälle → bei mehrfach-Lauf im Monat ist es OK, aber wenn man manuell nachträgliche Fälle hinzufügt, werden sie nicht erkannt

### System B — `cron/abrechnung-erstellen` (neu, KFZ-149)
Datei: `src/app/api/cron/abrechnung-erstellen/route.ts`

- Berechnung-Logik nicht inline — **erwartet vorgesetzte `lead_preis_netto`, `guthaben_verrechnet_netto`, `sv_nachzahlung_netto`** auf den Fällen
- Filter: `lead_preis_netto IS NOT NULL AND abrechnung_id IS NULL`
- **Schreibt:**
  - `abrechnungen` (KFZ-141-Schema: `empfaenger_typ='sv'`, `positionen` JSONB, Brutto/Netto/USt)
  - `abrechnung_positionen` (Audit-Trail mit FK)
  - `faelle.abrechnung_id` (Mark als abgerechnet)
- Org-Sammelrechnungen für Büro/Akademie (KFZ-152 Phase 2+3)
- **Brauch-Vorbedingung:** `processCaseBilling()` muss vorher pro Fall laufen — passiert aber nirgendwo automatisch

### Wer ruft `processCaseBilling()` auf?
Grep-Befund — **niemand**. Die Funktion ist in `src/lib/abrechnung/process-case-billing.ts` definiert, wird in keiner Cron-Route, in keinem Webhook und in keiner Server-Action aufgerufen. Die 3 Rows in `abrechnungen` und der eine Eintrag in `gutachter_monatsabrechnungen` stammen vermutlich aus manueller Test-Setzung.

### Folgen des Drifts
1. **Doppel-Abrechnung-Risiko:** Beide Crons laufen Ende Monat parallel. System A schreibt in `gutachter_monatsabrechnungen` mit eigener Preis-Berechnung, System B würde in `abrechnungen` schreiben, findet aber Fälle mit `lead_preis_netto = NULL` und macht nichts.
2. **UI-Inkonsistenz:**
   - `/admin/finance` Hub-Section liest aus `gutachter_abrechnungen` (alte Tabelle, leer) für die "Leadkosten Monat"-Spalte → immer 0 €
   - `/admin/abrechnungen` liest aus `abrechnungen` (3 Rows) → zeigt Manual-Test-Daten
   - SV unter `/gutachter/abrechnung` sieht je nach Implementation entweder gar nichts oder veraltete Daten
3. **Guthaben-Abzug findet nicht statt:** `werbebudget_guthaben_netto` wird nirgendwo dekrementiert, weil `processCaseBilling()` die einzige Stelle wäre die das macht.

---

## 2. Edge-Cases — Code vorhanden, Trigger fehlen

### Disqualifikation
- `revertCaseBilling()` (in `revert-case-billing.ts`) ist atomar implementiert: Guthaben zurückbuchen, `lead_preis_netto` zurücksetzen, `abrechnung_id` clearen
- **Aber:** Kein Aufruf bei `status='disqualifiziert'` oder Admin-Action "Aus Abrechnung entfernen"
- → **Hängt in Limbo:** disqualifizierter Fall bleibt in `abrechnungen.positionen` JSONB

### Reklamation / Korrektur
- `reissueAbrechnung()` (in `reissue-abrechnung.ts`): alte Abrechnung stornieren, neue mit verbleibenden Fällen erstellen, Rechnungsnummer mit `-K`-Suffix
- **Status:** Manuelle Admin-Action, funktioniert wenn aufgerufen (Stripe-PI-Cancel + Email)

### SV lehnt Lead ab
- **Komplett fehlt:** Kein Code-Pfad für "SV lehnt zugewiesenen Lead ab" → Position wird nicht zurückgenommen, Werbebudget nicht erstattet
- Es gibt `meldeNoShow()` und `stornoFall()` in `src/lib/actions/storno-actions.ts` — aber kein Hook auf Lead-Ablehnung
- → **SV bezahlt für Leads, die er nicht annehmen will**

### Storno einer Abrechnung
- `stornoAbrechnung()` in `src/app/admin/abrechnungen/actions.ts` ist solide:
  - Stripe-Refund bei `bezahlt`, Stripe-PI-Cancel bei `offen`
  - Storno-Rechnung (neg. Betrag) erstellt
  - Timeline-Einträge pro betroffenem Fall
- **OK, manuell aufrufbar.**

---

## 3. Stripe-Webhook & Einzahlungen

- `cron/abrechnung-einzug` läuft separat, ruft Stripe an, setzt `bezahlt_am`
- `api/stripe/webhook/route.ts` empfängt Events (20 Rows in `stripe_events`)
- **Vermutung (zu verifizieren):** Stripe-Events landen in `stripe_events` Tabelle, aber `gutachter_einzahlungen` ist leer (0 Rows). Drift zwischen Webhook-Verarbeitung und Einzahlungs-Buchung möglich
- `claim_payments` (für VS-Zahlungen) ebenfalls leer — separater Topf

---

## 4. Admin-Finance-Sichtbarkeit

### Was Admin heute sieht (`/admin/finance/(hub)/`)

| Section | Daten-Quelle | Status |
|---|---|---|
| **Abrechnungen-Liste** | `abrechnungen` (3 Rows) | OK, aber zeigt nur Test-Daten |
| **Gutachter-Zahlungsübersicht** | `gutachter_abrechnungen` (Legacy, NICHT EXISTIEREND) | 🔴 **kaputt** — "Leadkosten Monat"-Spalte ist immer leer |
| **Maik-Provision** | `finance_monatsberichte` (2 Rows, manuell gepflegt?) | OK |
| **Kanzlei-Provision** | `provisionen_maik` Filter `mandatstyp='kanzlei-claimondo'` | OK |
| **Gewinnverteilung 75/25** | `regulierung_betrag × 0.1` | OK |

### Was fehlt — Empfehlung pro Persona

#### Für Admin (Operations)
| Report | Zweck | Akut |
|---|---|---|
| **Per-SV-Forderungsstand** | "SV X hat 1 240 € offen aus Mai-Abrechnung, fällig 14.06." | 🔴 |
| **Säumige SVs** | Filter: `abrechnungen.status='offen' AND faellig_am < now() - 14d` | 🔴 |
| **Fälle ohne Abrechnungs-Berechnung** | Filter: `sv_id IS NOT NULL AND lead_preis_netto IS NULL` — der größte Bug-Sammler | 🔴 |
| **Werbebudget-Verbleib pro SV** | Summe ein- / ausgezahltes Guthaben + offener Saldo | 🟡 |
| **Drift-Report Cron A vs Cron B** | Welche Fälle stehen in beiden Systemen, welche nur in einem? | 🔴 |

#### Für SV (Self-Service)
| Report | Zweck | Akut |
|---|---|---|
| **Offene Abrechnung Live-Sicht** | "Du hast 12 Fälle dieses Monat = 1 800 € erwartet" — vor Monatsende sichtbar | 🟡 |
| **Forderungs-Historie** | Abrechnung pro Monat + Status (versendet, bezahlt, fehlgeschlagen, storniert) | 🟢 — vermutlich da |
| **Guthaben-Verlauf** | Wann wurde wieviel verrechnet? Aktueller Stand? | 🟡 |
| **Kontingent-Tracker** | "Du hast 18 von 25 Paket-Fällen genutzt" — auf Dashboard | 🟢 — paket_faelle_genutzt-Spalte da |

#### Für Maik (Partner)
- Maik-CPL-Edit funktioniert via Inline-Edit in `/admin/finance/(hub)/provisionen` — OK
- Monatsabrechnung-Cron `cron/maik-monatsabrechnung` existiert laut Memory

#### Für Kanzlei (Partner)
- Kanzlei-Sicht-Provisionen existiert
- `cron/abrechnung-kanzlei-erstellen` + `cron/abrechnung-kanzlei-reminder` separat

---

## 5. Verdict

🔴 **Broken.** Drei kritische Befunde:

1. **Zwei parallele Cron-Jobs** schreiben in zwei unterschiedliche Tabellen-Sets — der Hub liest mal aus dem alten, mal aus dem neuen. Konsolidierung nötig: **einer der beiden muss gewinnen**, der andere abgeschaltet werden.
2. **`processCaseBilling()` ist toter Code**, weil kein Trigger. Wenn der neue Cron (System B) der "echte" sein soll, dann muss `processCaseBilling()` vor ihm laufen — entweder via Trigger beim Fall-Abschluss (z. B. `state-machine.transitionFallStatus` → `processCaseBilling`) oder als separater Cron 1 Stunde vor `cron/abrechnung-erstellen`.
3. **Sichtbarkeits-Lücken im Admin-Hub:** "Leadkosten Monat" zeigt immer 0 €, säumige SVs sind unsichtbar, "Fälle ohne Berechnung" gibt es nicht.

---

## Top-5 Sofort-Fixes

### Fix 1 — Entscheiden welcher Cron gewinnt (4 h)
- **Empfehlung:** System B (`cron/abrechnung-erstellen` + `processCaseBilling`) gewinnt, weil:
  - Saubere Trennung Berechnung ↔ Rechnungs-Erstellung
  - Org-Sammelrechnungen (KFZ-152) sind drin
  - Brutto/Netto/USt im KFZ-141-Schema sauber
  - Audit-Trail über `abrechnung_positionen` mit FK
- **System A abschalten:** `cron/monatsabrechnung` aus VPS-Crontab entfernen, Route deprecaten (Comment + `return NextResponse.json({deprecated:true})`)
- Migration: existierende `gutachter_monatsabrechnungen`-Daten via Skript nach `abrechnungen` portieren (1 Row aktuell)

### Fix 2 — `processCaseBilling()` triggern (3-4 h)
Zwei Wege:
- (a) **Beim Fall-Abschluss** (State-Machine `gutachten_erstellt` oder `abgeschlossen`) inline `processCaseBilling(fallId)` aufrufen — atomar, sofortige Sichtbarkeit für SV
- (b) **Separater Cron** `cron/case-billing-batch` täglich um 17:00 (1h vor `abrechnung-erstellen`) — Batch über alle `faelle WHERE sv_id IS NOT NULL AND lead_preis_netto IS NULL AND status >= 'gutachten_erstellt'`
- **Empfehlung: (b) zuerst** (geringere Test-Surface, kein State-Machine-Refactor), dann (a) für Live-Sichtbarkeit

### Fix 3 — `revertCaseBilling()` triggern (2 h)
- In State-Machine: bei Übergang nach `disqualifiziert` / `storniert` → `revertCaseBilling(fallId)` aufrufen
- Bei `meldeNoShow()` und `stornoFall()` einbauen

### Fix 4 — `sv_payment_reminders` befüllen (2 h)
- Neuer Cron `cron/sv-payment-reminders` täglich 08:00
- Filter: `abrechnungen WHERE empfaenger_typ='sv' AND status IN ('offen','fehlgeschlagen') AND faellig_am < now() - 14d`
- Insert `sv_payment_reminders` + Email-Template + revalidatePath('/admin/finance')

### Fix 5 — Admin-Hub-Fixes + neue Reports (4-6 h)
- **Sofort:** "Leadkosten Monat"-Spalte umstellen von `gutachter_abrechnungen` (leer) auf `abrechnungen` Filter `empfaenger_id=sv.id AND monat`
- **Neu:** `/admin/finance/saeumige-svs` Page mit Liste säumiger SVs + Reminder-Trigger-Button
- **Neu:** `/admin/finance/offene-faelle` Page mit Filter `sv_id IS NOT NULL AND lead_preis_netto IS NULL` + Manual-Button "Jetzt berechnen"
- **Neu:** `/admin/finance/per-sv-balance` Page mit Pivot: SV → offene Forderung, gezahltes, Guthaben

---

## Wo könnten die Reports noch hin?

Aaron-Frage: "wo könnten sie noch hin?"

- **`/admin/finance/(hub)/saeumige`** — Tab neben Abrechnungen, mit Email-Trigger
- **`/admin/finance/(hub)/offene-berechnung`** — Tab "Unverarbeitete Fälle" für manuelle Re-Triggerung
- **`/admin/finance/(hub)/per-sv`** — Pivot pro SV mit Balance + Trend
- **Dashboard-KPI-Karte** auf `/admin/dashboard`: "X SVs säumig, Y € offen"
- **Mitarbeiter-Portal** `/mitarbeiter/finance` — KB-Sicht auf säumige SVs (falls KB mit SVs in Kontakt steht)
- **Notification-Channel** an Aaron persönlich bei jeder fehlgeschlagenen Einzug-Aktion (Email + WhatsApp via Twilio)
- **SV-Portal** `/gutachter/abrechnung/offen` — Live-Liste der nicht-abgerechneten Fälle des aktuellen Monats (gibt SV Transparenz vor Monatsende)
- **Stripe-Drift-Reconciler** Cron `cron/stripe-events-reconcile` — vergleicht `stripe_events` mit `abrechnungen.bezahlt_am`, findet verlorene Webhook-Payments

---

## Nicht in diesem Audit

- **Maik-Provision-Flow** — nicht im Fokus (läuft laut Memory)
- **Kanzlei-Abrechnung** — eigener separater Pfad, eigene Crons, eigene Tabellen-Familie (kanzlei_abrechnungen+positionen+reminders)
- **Stripe-Webhook-Robustheit** — separates Audit (200+ stripe_events mit nur 0-3 abrechnungen-Updates klingt nach Drift)
- **VS-Auszahlungen** (`claim_payments`) — eigene Welt, AAR-823

---

## Anhang

- 1 Subagent-Audit (überschätzte Lücke initial, in diesem Doc korrigiert)
- DB-Inventur via Supabase MCP: 22 Finance-Tabellen + 6 Reminder-Tabellen
- AAR-Quellen: KFZ-141 (abrechnungen-Schema), KFZ-149 (Per-Case-Billing), KFZ-152 (Org-Sammelrechnungen)
