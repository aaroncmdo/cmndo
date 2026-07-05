# Partner-Payout-Gutschrift (P3) — Design

**Datum:** 2026-07-05
**Status:** Design / Spec (brainstorming — wartet auf Aaron-Review vor writing-plans)
**Branch:** `kitta/partner-payout-gutschrift`
**Vorgänger:** P1 (#3625 Cockpit + `auszahlenProvision` friert USt beim Auszahlen ein) + P2 (#3639 `createAbrechnung` für die Forderungs-Generatoren).

## 1. Kontext & Ziel

Das P1-Cockpit zeigt Makler/Werkstatt/Maik-Auszahlungen und `auszahlenProvision` (in `src/lib/finance/provision-status.ts`) friert beim Auszahlen die USt ein (`ust_satz`/`ust_betrag`/`betrag_brutto` je `ist_kleinunternehmer`). Aber es entsteht **kein Beleg**. Für eine Provisions-Auszahlung ist Claimondo der Leistungsempfänger, der Partner der Leistungserbringer → der korrekte Beleg ist eine **Gutschrift (Self-Billing, §14 Abs. 2 UStG)**, die Claimondo im Namen des Partners ausstellt.

**Ziel:** Beim Auszahlen einer Provision/eines Bonus entsteht automatisch eine rechtssaubere **Partner-Gutschrift** (Datensatz + PDF): Partner-Steuerdaten, Claimondo-Aussteller-Daten, Provision netto + USt (0/19% je `ist_kleinunternehmer`) + brutto, mit dem Pflicht-Hinweis „Gutschrift". Zustellung per Email + Sichtbarkeit im Cockpit/Partner-Portal.

## 2. Scope

**In-Scope:** neue Tabelle `partner_gutschriften`; Daten-Prereq (Partner-Steuerdaten vervollständigen); Gutschrift-Erzeugung (Nummer + Snapshot + Row + PDF) beim `auszahlenProvision`-Payout; USt aus den bereits eingefrorenen Provisions-Werten; Zustellung (Email + Cockpit-Download).

**Out-of-Scope:** SV-Honorar-Gutschriften (das ist die bestehende `gutschriften`-Tabelle, unberührt); Storno/Korrektur einer Gutschrift (Follow-up); Multi-Provisions-Sammel-Gutschrift (P3 = eine Gutschrift je Auszahlung; Bündelung später).

## 3. Datenmodell (Aaron-Entscheidung: neue Tabelle)

`partner_gutschriften` (additiv, KEIN Touch an der SV-`gutschriften`-Tabelle):

| Spalte | Typ | Zweck |
|---|---|---|
| `id` | uuid pk | |
| `partner_typ` | text | 'makler' \| 'werkstatt' \| 'marketing' |
| `partner_id` | uuid | FK auf makler/werkstaetten/marketing_partner |
| `gutschrift_nr` | text | `CMNDO-GS-{jahr}-{NNNNN}` (via `nextRechnungsNrRaw`, Serie `CMNDO-GS`) |
| `ledger_tabelle` | text | welche Auszahlungs-Zeile: makler_provisionen/werkstatt_provisionen/provisionen_maik/makler_staffel_bonus/werkstatt_staffel_bonus |
| `ledger_id` | uuid | die konkrete Provisions-/Bonus-Zeile |
| `betrag_netto` / `ust_satz` / `ust_betrag` / `betrag_brutto` | numeric | aus den von P1 eingefrorenen Provisions-Werten übernommen |
| `empfaenger_snapshot` | jsonb | eingefroren zum Ausstellungszeitpunkt: `{ name, adresse_strasse, adresse_plz, adresse_ort, ust_id, ist_kleinunternehmer }` |
| `aussteller_snapshot` | jsonb | Claimondo-Aussteller (aus `rechnungs_konfiguration` bzw. Konstante), eingefroren |
| `leistung_text` | text | z.B. „Vermittlungsprovision" / „Staffel-Bonus" |
| `status` | text | 'erstellt' \| 'versendet' |
| `pdf_storage_path` | text | Supabase-Storage-Pfad |
| `erstellt_am` / `versendet_am` | timestamptz | |

RLS: admin-only + der jeweilige Partner darf die eigene Gutschrift lesen (partner_id-Gate), analog der Provisions-Sichtbarkeit. `REVOKE ALL FROM anon` (Lehre aus dem v_partner_billing-Leak).

## 4. Daten-Prereq (Task 1 — kleiner, additiver Vorlauf)

Rechtsgültige Gutschrift braucht Empfänger-Steuernr/USt-IdNr + Adresse. Ist-Stand (verifiziert):
- `makler`: **ready** (firma, adresse_*, `ust_id`, `ist_kleinunternehmer`).
- `werkstaetten`: hat Name+Adresse+`ist_kleinunternehmer`, **fehlt `ust_id`** → additiv ergänzen.
- `marketing_partner`: nur name+`ist_kleinunternehmer`, **fehlt Adresse + `ust_id`** → additiv ergänzen (`adresse_strasse/plz/ort`, `ust_id`).
Plus Admin-Erfassung: die Felder in der jeweiligen Rollen-Verwaltung editierbar (dort wo P1 schon den `ist_kleinunternehmer`-Toggle zeigt — Makler/Werkstatt-Drawer, Maik-Section).

## 5. Erzeugungs-Flow (Trigger: `auszahlenProvision`)

Erweitere `auszahlenProvision(db, tabelle, id)` (P1, `provision-status.ts`): nach dem USt-Freeze zusätzlich die Gutschrift erzeugen. Neuer Baustein `erstellePartnerGutschrift(db, { tabelle, ledgerId, partnerTyp, partnerId, betraege })`:
1. Empfänger-Steuerdaten laden (partner-Tabelle). **Vollständigkeits-Check** (Adresse + bei regelbesteuert `ust_id`) → unvollständig ⇒ `{ ok:false, error:'Empfänger-Steuerdaten unvollständig — Gutschrift nicht erstellbar' }` → **Auszahlung blockiert** (analog USt-Status-Block; kein halber Payout).
2. `gutschrift_nr` allokieren (`nextRechnungsNrRaw('CMNDO-GS', jahr)` → `CMNDO-GS-{jahr}-{pad5}`).
3. Aussteller-Snapshot laden (`getAktuelleRechnungsKonfig` — dasselbe Muster wie onboarding).
4. `partner_gutschriften`-Row inserten (betraege aus den eingefrorenen Provisions-Werten, Snapshots eingefroren, status 'erstellt').
5. PDF erzeugen + in Storage hochladen → `pdf_storage_path` patchen. **Kompensations-Delete bei PDF-Fehler** (Lehre aus P2-Onboarding-I1: keine Orphan-Row).
6. Rückgabe `{ ok:true, gutschriftId, nummer, pdfPath }`.

`auszahlenProvision` ruft das nach dem Freeze; schlägt die Gutschrift fehl (Steuerdaten/PDF), wird der Payout **nicht** abgeschlossen (Status bleibt freigegeben, Admin sieht den Block im Cockpit).

## 6. PDF

`PartnerGutschriftPdf` (react-pdf, Muster aus `create-onboarding-rechnung`/kanzlei-PDF): Kopf Claimondo-Aussteller, Empfänger-Block (Partner-Snapshot), **Titel „Gutschrift"** + Hinweis „Gutschrift im Sinne des §14 Abs. 2 UStG", Positions-Zeile (`leistung_text`, netto), USt-Zeile (Satz+Betrag) bzw. bei Kleinunternehmer **kein USt-Ausweis + §19-Hinweis**, Brutto, `gutschrift_nr` + Datum + IBAN-Hinweis (Auszahlung erfolgt auf `bank_iban`). Umlaute Pflicht. `// Token-Audit-Skip` falls raw-hex nötig (PDF).

## 7. Zustellung / Sichtbarkeit

- Email mit PDF-Anhang an den Partner (bestehendes `sendEmail`/`sendCommunication`-Muster), status→'versendet'. Non-fatal (try/catch — ein Mail-Fail bricht die Auszahlung nicht; die Gutschrift-Row existiert).
- Cockpit (P1 `PartnerBillingPanel`): bei erledigten Auszahlungen einen „Gutschrift ↓"-Download-Link (signed URL) je Zeile.
- Partner-Portal (Makler/Werkstatt-Abrechnungen): eigene Gutschriften herunterladbar.

## 8. USt
Kein neuer USt-Pfad — die Gutschrift übernimmt die **von P1 eingefrorenen** `ust_satz`/`ust_betrag`/`betrag_brutto` der Provisions-Zeile (Single Source of Truth, konsistent mit dem Cockpit). `calculate-ust.ts` nur falls ein Wert fehlt (Fallback).

## 9. Tasks (eine Spec, abhängige Slices → ein Plan)
1. **Daten-Prereq** — Migration `ust_id`/Adresse auf werkstaetten+marketing_partner + Admin-Erfassung.
2. **Migration `partner_gutschriften`** (Tabelle + RLS + REVOKE anon).
3. **`erstellePartnerGutschrift`** Baustein (Nummer + Snapshot + Insert + Vollständigkeits-Block) — vitest.
4. **`PartnerGutschriftPdf`** + Storage-Upload (Kleinunternehmer-Zweig) — Snapshot-Test.
5. **Wire in `auszahlenProvision`** (Gutschrift beim Payout, Block bei unvollständigen Daten, Kompensations-Delete) — vitest.
6. **Zustellung** (Email + Cockpit-Download-Link + Partner-Portal).
7. **Volle Gates + PR.**

## 10. Risiken
- **Geld-/rechtsnah:** jede Slice getestet; die Gutschrift-Erzeugung ist an den Payout gekoppelt (kein Payout ohne gültige Gutschrift bei regelbesteuerten Partnern).
- **Multi-Session:** `provision-status.ts` (P1) + die Partner-Admin-Files sind evtl. heiß → additive Änderungen, Branch-Guard je Task.
- **Steuerdaten-Qualität:** der Vollständigkeits-Block verhindert fehlerhafte Gutschriften (§14c-Haftung); Admin muss die Daten vorher erfassen (Task 1 macht das erfassbar).
- **Nummernkreis:** `CMNDO-GS` neue Serie im bestehenden atomaren Counter — lückenlos, kein Konflikt mit anderen Serien.

## 11. Terminaler Schritt
Nach Aaron-Review → `writing-plans`. (Hinweis: P3 ist ein mehrstufiges rechtsnahes Feature — der Bau der Slices kann bei knappem Kontext in einer frischen Session laufen, spec+plan sind die Deliverables.)
