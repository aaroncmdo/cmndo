# Partner-Gutschrift — Beleg §14-vollständig + IBAN (Design)

**Datum:** 2026-07-07
**Status:** Design / Spec (Aaron-approved 2026-07-07)
**Branch:** `kitta/gutschrift-leistungszeitpunkt-iban` (off staging)
**Vorgänger:** P3 Partner-Payout-Gutschrift (#3692, merged + prod-gesmoked).

## 1. Kontext & Ziel

Die P3-Gutschrift (Self-Billing §14 Abs. 2 UStG) ist live. Das PDF ist inhaltlich gut, hat aber zwei
Lücken für einen voll rechtssicheren + professionellen Beleg:

1. **Leistungszeitpunkt fehlt (§14 Abs. 4 Nr. 6 UStG Pflichtangabe).** Das PDF zeigt nur das
   Ausstellungsdatum („Datum") — nicht *wann die Leistung (Vermittlung) erbracht wurde*. Formal ist der
   Beleg damit unvollständig (Vorsteuerabzugs-Risiko beim Empfänger).
2. **Empfänger-IBAN fehlt.** Der Auszahlungs-Hinweis ist generisch („das bei Claimondo hinterlegte
   Bankkonto"). makler/werkstatt haben `bank_iban` — der Beleg sollte zeigen, wohin ausgezahlt wird.

**Ziel:** Beide Angaben ergänzen → voll §14-konformer, professioneller Beleg.

## 2. Scope

**In-Scope:** `leistung_datum` (Leistungszeitpunkt) auf der Gutschrift + PDF-Zeile „Leistungszeitraum";
`bank_iban` im eingefrorenen `empfaenger_snapshot` + PDF-IBAN im Auszahlungs-Hinweis.
**Out-of-Scope:** Storno-Gutschrift, Sammel-Gutschrift, Layout-Redesign des PDFs.

## 3. Datenmodell

- **Neue Spalte (additiv, Migration via Supabase-Plugin):** `partner_gutschriften.leistung_datum date`
  (nullable). Eingefroren zum Ausstellungszeitpunkt = der Leistungszeitpunkt der zugrundeliegenden Provision.
- **`empfaenger_snapshot` (jsonb, KEINE Migration):** zusätzliches Feld `bank_iban` (aus der Partner-Zeile
  gelesen; `marketing_partner` hat keine → `null`).

## 4. Leistungszeitpunkt — Quelle je Ledger

`auszahlenProvision` liest bereits die Provisions-Zeile. Neue `META.leistungDatumCol` je Ledger (alle
Timestamp-Spalten → `::date`), wird mitgelesen und an `erstellePartnerGutschrift` durchgereicht:

| Ledger | leistungDatumCol | Begründung |
|---|---|---|
| makler_provisionen | `trigger_at` | Zeitpunkt des vermittelten Events = Leistung (2/2 populated) |
| werkstatt_provisionen | `trigger_at` | dito (6/6 populated) |
| provisionen_maik | `created_at` | Buchungszeitpunkt (monat ist unzuverlässiges text-Feld) |
| makler_staffel_bonus | `erstellt_am` | Buchung des Meilenstein-Bonus |
| werkstatt_staffel_bonus | `erstellt_am` | dito |

## 5. Flow

1. `auszahlenProvision`: Select um `${meta.leistungDatumCol}` erweitern → Wert lesen → als `leistungsDatum`
   an `erstellePartnerGutschrift` übergeben.
2. `erstellePartnerGutschrift(db, p)`: neuer optionaler Param `leistungsDatum?: string`. (a) Partner-Select um
   `bank_iban` erweitern → in `empfaenger_snapshot` aufnehmen. (b) `leistung_datum` (aus `leistungsDatum`,
   truncated `::date`) in die Insert-Row schreiben. Vollständigkeits-Block + Nummer + Snapshots wie gehabt.

## 6. PDF (`partner-gutschrift-pdf.tsx`)

- **`PartnerGutschriftPdfInput`** um `leistung_datum: string | null` + `empfaenger_snapshot.bank_iban: string | null` erweitern.
- **View model:** `leistungszeitraum: string` — aus `leistung_datum` als „{Monat Jahr}" (de-DE, z.B.
  „Juli 2026", §31 Abs. 4 UStDV = Kalendermonat genügt); wenn `null` → „Leistungsdatum entspricht dem
  Ausstellungsdatum". `auszahlungHinweis` — wenn `bank_iban` vorhanden: „Die Auszahlung erfolgt auf IBAN
  {formatiert (4er-Gruppen)}.", sonst der bestehende generische Text.
- **Render:** Meta-Zeile bekommt zusätzlich „Leistungszeitraum" (neben Gutschrift-Nr. + Datum). Der
  Auszahlungs-Hinweis nutzt den erweiterten Text. Umlaute Pflicht, Token-Audit-Skip-Header bleibt.

## 7. Tests (TDD, je Slice)

- **erstellePartnerGutschrift.test:** `bank_iban` landet im `empfaenger_snapshot`; `leistung_datum` in der
  Insert-Row (aus `leistungsDatum`); Null-Fall (kein leistungsDatum → `leistung_datum` null).
- **provision-status.test:** je Ledger wird die richtige `leistungDatumCol` gelesen + als `leistungsDatum`
  durchgereicht (mock erstellePartnerGutschrift → assert das Argument).
- **partner-gutschrift-pdf.test:** view model — `leistungszeitraum` „Juli 2026" bei gesetztem Datum, Fallback-
  Note bei null; `auszahlungHinweis` mit IBAN bei gesetzter bank_iban, generisch sonst. Smoke-Render beide Zweige.

## 8. Risiken / Konsistenz

- **Geld-/rechtsnah:** finaler opus-Whole-Branch-Review vor Merge.
- **Additiv:** neue Spalte + neuer optionaler Param → bestehende Gutschriften (0 auf prod) unberührt; alte
  Rows hätten `leistung_datum=null` → Fallback-Note greift.
- **USt-SSoT unberührt** — diese Änderung betrifft nur Beleg-Darstellung, nicht die Beträge.
- **Migration:** Regel 2 (Plugin, File==getrackte Version, REVOKE-anon bleibt via Tabellen-Grants bestehen —
  neue Spalte erbt keine neuen Grants).

## 9. Terminaler Schritt
Nach Spec-Review → `writing-plans` → subagent-driven-development. Klein + rechtsnah: Golden/Unit je Slice + opus-Review.
