# Storno-Gutschrift (Korrektur bei Reversal) — Design

**Datum:** 2026-07-07
**Status:** Design / Spec (Aaron-approved 2026-07-07)
**Branch:** `kitta/storno-gutschrift` (off staging — enthält P3 #3692 + §14-Beleg #3762)
**Vorgänger:** P3 Partner-Payout-Gutschrift (#3692) + Beleg-§14-Vollständigkeit (#3762).

## 1. Kontext & Ziel

Beim Auszahlen entsteht eine Gutschrift (Self-Billing §14 Abs. 2 UStG). Wird eine **bereits ausgezahlte**
Provision später storniert (`storniereProvision`), bleibt die ausgestellte Gutschrift aktuell verwaist —
sie referenziert einen zurückgebuchten Payout, wird aber nicht korrigiert. Rechtlich darf ein
Rechnungsbeleg nicht gelöscht werden; die Korrektur erfolgt über einen **Storno-Beleg**.

**Ziel:** Bei Storno einer ausgezahlten Provision automatisch eine **negative Storno-Gutschrift** ausstellen
(Datensatz + PDF + Zustellung), die die Original-Gutschrift korrigiert und den Audit-Trail vollständig hält.

## 2. Scope

**In-Scope:** `typ`/`bezug_gutschrift_id`/`storno_grund` auf `partner_gutschriften`; partielle UNIQUE;
`erstelleStornoGutschrift`-Baustein; Storno-Variante im PDF; Trigger in `storniereProvision`; non-fatale Zustellung.
**Out-of-Scope:** Teil-Storno/-Korrektur einzelner Positionen; Sammel-Storno; UI-seitige Storno-Liste (Cockpit
zeigt Storno-Rows über die bestehende Billing-Sicht).

## 3. Datenmodell (additiv, Migration via Supabase-Plugin)

`partner_gutschriften`:
- `typ text NOT NULL DEFAULT 'gutschrift'` — `'gutschrift'` | `'storno'`.
- `bezug_gutschrift_id uuid REFERENCES public.partner_gutschriften(id)` — bei Storno → Original.
- `storno_grund text` — der Grund (nur bei Storno gesetzt).
- **UNIQUE ersetzen:** bestehende `UNIQUE(ledger_tabelle, ledger_id)` droppen → **partielles** Unique-Index
  `ON (ledger_tabelle, ledger_id) WHERE typ='gutschrift'`. So bleibt „ein Original je Payout" erhalten, ein
  Storno-Row (gleicher Ledger) ist erlaubt.

## 4. `erstelleStornoGutschrift` Baustein

`erstelleStornoGutschrift(db, originalGutschriftId: string, grund: string): Promise<{ ok:true; stornoId; nummer } | { ok:false; error }>`:
1. Original laden. Wenn nicht gefunden → `{ ok:false }`. Wenn Original bereits `status='storniert'` → **idempotent**
   `{ ok:true, …existing }` (kein Doppel-Storno).
2. Neue Nummer `CMNDO-GS-{jahr}-{pad5}` (`nextRechnungsNrRaw` — dieselbe fortlaufende Serie).
3. Storno-Row inserten: `typ='storno'`, `bezug_gutschrift_id=original.id`, `storno_grund=grund`,
   **negative Beträge** (gespiegelt: `betrag_netto = -original.betrag_netto`, ust/brutto analog),
   `ust_satz` unverändert, `empfaenger_snapshot`/`aussteller_snapshot`/`leistung_text`/`leistung_datum`
   **vom Original übernommen** (Korrektur bezieht sich auf dieselben Parteien/Leistung), `status='erstellt'`.
4. Original `status='storniert'` setzen.
5. Rückgabe `{ ok:true, stornoId, nummer }`. (PDF/Email macht der Caller — non-fatal.)

## 5. PDF — Storno-Variante (reuse `PartnerGutschriftPdf`)

`PartnerGutschriftPdfInput` bekommt optional `storno?: { bezugNummer: string; bezugDatum: string; grund: string }`.
View model + Render: wenn `storno` gesetzt → Titel **„Storno-Gutschrift"** (statt „Gutschrift"), eine Zeile
**„Storno zu {bezugNummer} vom {bezugDatum}"** + **„Grund: {grund}"**, sonst unverändert. Die Beträge sind
bereits negativ (aus der Storno-Row) → `formatEur(-119)` → „-119,00 €". §14-Hinweis + Leistungszeitraum + IBAN
bleiben. Umlaute Pflicht.

## 6. Trigger — `storniereProvision`

Nach dem bestehenden Ledger-Storno (status→stornoStatus): prüfe, ob eine Original-Gutschrift für
(`ledger_tabelle`, `ledger_id`) mit `typ='gutschrift'` **und** `status != 'storniert'` existiert.
- **Ja** (Provision war ausgezahlt): `erstelleStornoGutschrift(db, original.id, grund)` → bei ok:
  `generateAndUploadPartnerGutschriftPdf`(Storno-Input) → `pdf_storage_path` patchen → `versendePartnerGutschrift`
  (non-fatal). **Alles NON-FATAL** (try/catch): der Ledger-Storno (die Reversal-Primäraktion) darf NIE an einer
  Beleg-/PDF-/Mail-Panne scheitern — ein ausgezahlter Payout muss immer reversibel bleiben. Fehler werden
  geloggt; der Storno-Beleg ist bei Bedarf nachziehbar.
- **Nein** (Storno vor Payout, keine Gutschrift): nur der bestehende Ledger-Storno, kein Beleg.

## 7. Zustellung

`versendePartnerGutschrift` (bestehend) wird für die Storno-Row wiederverwendet (lädt Row, hängt PDF an, non-fatal).
Optional minimal: Betreff „Ihre Storno-Gutschrift {Nr.}" via `istStorno`-Flag im Email-Template (nice-to-have).

## 8. USt / Beträge

Kein neuer USt-Pfad — die Storno-Row spiegelt die **Original-**Werte negiert (SSoT bleibt das Original).
`betrag_netto/ust_betrag/betrag_brutto = -1 × Original`. `ust_satz` unverändert.

## 9. Risiken / Konsistenz

- **Rechtsnah:** finaler opus-Whole-Branch-Review vor Merge.
- **Non-fatal:** Reversal ist die Primäraktion; Storno-Beleg best-effort (nie den Storno blocken).
- **Idempotenz:** Original bereits `storniert` → kein Doppel-Storno (Schritt 1); partielles Unique schützt das Original.
- **Additiv:** neue Spalten nullable/default; partielles Unique erhält „ein Original je Payout".
- **Coordination:** Branch off staging nach #3762-Merge → kein Konflikt mit den §14-Files.

## 10. Tests (TDD)
- **erstelleStornoGutschrift:** negative Beträge gespiegelt; typ/bezug/grund gesetzt; Snapshots+leistung_datum vom
  Original; Original→storniert; idempotent (Original schon storniert → kein neuer Insert).
- **PDF view model:** storno gesetzt → Titel „Storno-Gutschrift" + Bezug-Zeile + Grund; negative Beträge.
- **storniereProvision:** mit Original-Gutschrift → Storno-Row + Original→storniert; ohne Gutschrift → nur
  Ledger-Storno, kein Beleg; PDF-/Mail-Fehler → Ledger-Storno trotzdem erfolgreich (non-fatal).

## 11. Terminaler Schritt
Nach Spec-Review → `writing-plans` → subagent-driven-development. Rechtsnah: Golden/Unit je Slice + opus-Review.
