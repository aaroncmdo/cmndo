# Kanonische Partner-Abrechnungs-Übersicht (P1) — Design

**Datum:** 2026-07-04
**Status:** Design / Spec (brainstorming abgeschlossen, wartet auf Aaron-Review vor writing-plans)
**Branch:** `kitta/kanonische-partner-abrechnung`

## 1. Kontext & Ziel

Die Billing-Domäne ist über ~8 Tabellen und ~10 Cron-Generatoren verstreut. Es gibt **keinen einzigen Ort**, an dem man die Abrechnungen/Provisionen aller Partner-Rollen sieht. Konkrete Lücken (Ist-Aufnahme via 3 Explore-Agenten am 2026-07-04):

- **Makler & Werkstatt: 0 Admin-Sicht** auf Provisionen (nur Raten-Config unter `/admin/makler`, `/admin/werkstaetten`).
- **Kanzlei:** keine Rechnungs-Historie (weder Admin-Aggregat sauber noch Partner-Self-Serve).
- **SV:** Admin-Sicht (`/admin/finance/*`) und Partner-Selbstsicht entkoppelt.
- **Aggregat („insgesamt"):** existiert für SV/Kanzlei/Maik teilweise, **fehlt komplett für Makler/Werkstatt**.

**Ziel P1:** Ein kanonisches, admin-internes **Abrechnungs-Cockpit** über **alle** Partner-Rollen — pro Partner **und** insgesamt — eingebettet in die jeweilige Rollen-Verwaltung **und** als zentraler Aggregat-Blick. Inklusive Geld-Aktionen (mark-paid, Einzug-Retry, Provision freigeben/auszahlen/stornieren) und **korrekter USt-Behandlung** je Partner-Steuerstatus.

## 2. Scope

**In-Scope (P1):**
- Admin-only (keine Partner-Self-Serve-Views in P1).
- Alle Rollen: SV, Kanzlei, Makler, Werkstatt, Maik (Marketing).
- Kanonische Read-View `v_partner_billing` über alle Quellen.
- Cockpit-UI: zentral (`/admin/finance/partner-abrechnungen`) + eingebettet pro Rolle.
- Geld-Aktionen über ein kanonisches Action-Modul (wiederverwendet bestehende Logik).
- Partner-USt-Status (`ist_kleinunternehmer`) erfassen + USt konditional rechnen + **beim Auszahlen einfrieren**.

**Out-of-Scope (→ eigene Projekte):**
- **P2 — Kanonische Abrechnungs-*Funktion* (WRITE):** die 8 Generierungs-Sites auf ein `createAbrechnung()` vereinheitlichen. P1 definiert das Read-Modell, das P2 später produzieren soll.
- Partner-Self-Serve-Views (v.a. Kanzlei-Portal-Rechnungshistorie) — spätere Phase.
- Onboarding-Abfrage des USt-Status (P1 erfasst nur im Admin; Onboarding-Capture = Follow-up).
- Formale Gutschrift-PDF-Ausstellung (P2 — P1 friert nur die USt-Werte ein).

## 3. Kanonisches Read-Modell: `v_partner_billing`

Eine **additive** SQL-View, **1 Zeile pro Abrechnungs-/Provisions-/Bonus-Dokument**. Admin-gegated (siehe §9).

### 3.1 Spalten

| Kanon-Spalte | Typ | Bedeutung |
|---|---|---|
| `quelle_tabelle` | text | 'abrechnungen' \| 'kanzlei_abrechnungen' \| 'sv_onboarding_rechnungen' \| 'makler_provisionen' \| 'makler_staffel_bonus' \| 'werkstatt_provisionen' \| 'werkstatt_staffel_bonus' \| 'provisionen_maik' |
| `quelle_id` | uuid | PK in der Quelltabelle (Dispatch-Key für Aktionen + Drill-down) |
| `partner_typ` | text | 'sv' \| 'kanzlei' \| 'makler' \| 'werkstatt' \| 'marketing' |
| `partner_id` | uuid | Partner-Entität (empfaenger_id / kanzlei_id / makler_id / werkstatt_id / marketing_partner_id); NULL nur falls unauflösbar |
| `partner_name` | text | Anzeigename (join bzw. denormalisiert) |
| `richtung` | text | 'forderung' (Geld rein) \| 'auszahlung' (Geld raus) |
| `dokument_typ` | text | 'rechnung' \| 'provision' \| 'bonus' \| 'onboarding' |
| `referenz_nr` | text | Rechnungsnr. wo vorhanden, sonst NULL |
| `betrag_netto` | numeric | normalisiert (siehe Mapping) |
| `ust_satz` | numeric | 19 / 0 / NULL (unbekannt) |
| `ust_betrag` | numeric | betrag_brutto − betrag_netto |
| `betrag_brutto` | numeric | siehe §4 |
| `ust_status_bekannt` | boolean | true außer bei Auszahlung mit `ist_kleinunternehmer IS NULL` |
| `status_norm` | text | siehe §3.3 |
| `status_roh` | text | Original-Status der Quelle (Detail/Debug) |
| `datum` | timestamptz | primäres Belegdatum (COALESCE, siehe Mapping) |
| `faellig_am` | date | Fälligkeit (nur Forderungen) |
| `erledigt_am` | timestamptz | bezahlt/ausgezahlt/paid |
| `claim_id` / `fall_id` | uuid | Bezug für Drill-down, wo vorhanden |

### 3.2 Quellen-Mapping (verifiziert gegen Prod-Schema 2026-07-04)

**Entkopplungs-Entscheidung (gegen Doppelzählung der Parallel-Generatoren):**
`abrechnungen` trägt **nur `empfaenger_typ='sv'`** zur View bei. Kanzlei kommt ausschließlich aus `kanzlei_abrechnungen` (System B, live), Marketing/Maik ausschließlich aus `provisionen_maik`. Damit werden die Legacy-/Parallel-Pfade `abrechnungen[empfaenger_typ='kanzlei']` (System A) und `abrechnungen[empfaenger_typ='marketing']` **ausgeschlossen**.

| Quelle | richtung | partner | betrag_netto | betrag_brutto | referenz_nr | datum | faellig_am | erledigt_am |
|---|---|---|---|---|---|---|---|---|
| `abrechnungen` (nur sv) | forderung | empfaenger_id/name | `summe_netto` | `summe_brutto` (frozen) | `abrechnungs_nr` | `versand_datum`↘`erstellt` | `faellig_am` | `bezahlt_am` |
| `kanzlei_abrechnungen` | forderung | `kanzlei_id`→`kanzleien.name` | `endbetrag_netto` | `endbetrag_brutto` (frozen) | `rechnungsnummer` | `versendet_am` | `faelligkeitsdatum` | `bezahlt_am` |
| `sv_onboarding_rechnungen` | forderung | `sv_id`→SV-Name | `netto_cent/100` | `brutto_cent/100` (frozen) | `rechnungs_nr` | `rechnungs_datum` | – | via stripe/`versendet_am` |
| `makler_provisionen` | auszahlung | `makler_id`→`makler.name` | `betrag_netto_eur` | §4 (frozen∨live) | – | `erstellt_am` | – | roll-up `abrechnung_id`∨`storniert_am` |
| `makler_staffel_bonus` | auszahlung | `makler_id` | `bonus_betrag_netto` | §4 | – | erstellt | – | `ausgezahlt_am` |
| `werkstatt_provisionen` | auszahlung | `werkstatt_id`→`werkstaetten.name` | `betrag_netto_eur` | §4 | – | `erstellt_am` | – | `ausgezahlt_am`∨`storniert_am` |
| `werkstatt_staffel_bonus` | auszahlung | `werkstatt_id` | `bonus_betrag_netto` | §4 | – | erstellt | – | `ausgezahlt_am` |
| `provisionen_maik` | auszahlung | `marketing_partner` (Maik) | `netto_provision` | §4 | – | `monat`/`erstellt` | – | `paid_at` |

> Exakte Spalten der `*_staffel_bonus`- und `sv_onboarding_rechnungen`-Tabellen sind beim Plan-Schritt final gegen `information_schema` zu verifizieren (Betrag-/Datum-/Status-Feldnamen).

### 3.3 `status_norm`-Vokabular (aus Code-Vokabular, Prod-Tabellen teils leer)

Gemeinsames kleines Vokabular für saubere Aggregation:

- `entwurf` — Draft (abrechnungen.entwurf).
- `offen` — ausgestellt/versendet, noch nicht beglichen, nicht überfällig.
- `faellig` — `faellig_am < heute` und unbezahlt (nur Forderungen).
- `gehalten` — Provision im Hold-Fenster (makler/werkstatt `pending`, maik `pending`).
- `freigegeben` — Provision freigegeben, noch nicht ausgezahlt (maik `confirmed`).
- `erledigt` — bezahlt/ausgezahlt/paid.
- `storniert` — storniert/reversed.
- `fehlgeschlagen` — Einzug fehlgeschlagen (abrechnungen `fehlgeschlagen`, kanzlei `fehlgeschlagen_am`).

`status_roh` behält den Originalwert für Detailanzeige.

## 4. USt-Behandlung (Kern-Nuance)

**Forderungs-Seite (SV/Kanzlei/Onboarding zahlen Claimondo):** Claimondo ist regelbesteuert und stellt immer 19% aus. `ust_satz`/`ust_betrag`/`betrag_brutto` sind bei Ausstellung **eingefroren gespeichert** → View reicht sie durch. Der USt-Status des Empfängers ist irrelevant.

**Auszahlungs-Seite (Claimondo zahlt Provision an Partner):** Der **Partner** ist Leistungserbringer → sein USt-Status bestimmt, ob 19% draufkommen. Provisionen laufen typ. per **Gutschrift** (Self-Billing) → Claimondo MUSS den korrekten Status anwenden (falscher Ausweis = §14c-UStG-Haftung).

**Neues Partner-Feld:** `ist_kleinunternehmer boolean` (§19 UStG), **nullable**, auf `makler` + `werkstaetten` + `marketing_partner`:
- `false` = regelbesteuert → `ust_satz=19`, `brutto = netto × 1,19` (Claimondo zieht Vorsteuer).
- `true` = Kleinunternehmer → `ust_satz=0`, `brutto = netto`.
- `NULL` = **noch nicht erfragt** → `ust_status_bekannt=false`; Cockpit zeigt „USt-Status offen" und **blockt Auszahlung/Freigabe bis gesetzt**.

**Einfrieren beim Auszahlen (Aaron-Entscheidung):** Die 5 Auszahlungs-Ledger bekommen nullable `ust_satz`/`ust_betrag`/`betrag_brutto`. Die Auszahl-/Freigabe-Aktion berechnet die USt aus dem Partner-Status **zum Auszahlzeitpunkt** und schreibt sie fest (Gutschrift-Audit-Trail).

**View-Brutto (Auszahlung):** `COALESCE(eingefroren, live-berechnet)`. Live: `ust_satz = CASE WHEN ist_kleinunternehmer THEN 0 WHEN ist_kleinunternehmer IS FALSE THEN 19 ELSE NULL END`.

**Reine Helper (vitest-getestet):**
- `computeProvisionUst(nettoEur, istKleinunternehmer: boolean|null) → { ustSatz, ustBetrag, brutto, bekannt }`.
- `normalizeStatus(quelle, statusRoh, { faelligAm, erledigtAm }) → status_norm`.

## 5. Action-Modul — `src/lib/finance/partner-billing-actions.ts`

Kanonischer Dispatch nach `quelle_tabelle`. **Wiederverwendung** bestehender Logik (Redundanz-Regel), nicht Neubau. Alle Server-Actions liefern `{ ok: boolean; error?: string }` (AGENTS-Konvention) + `revalidatePath` auf Cockpit + betroffene Rollen-Route.

| Aktion | Gültig für | Delegiert an |
|---|---|---|
| `markiereAlsBezahlt(quelle, id)` | Forderungen | bestehende mark-paid-Logik (`/admin/finance/abrechnungen`) |
| `loeseEinzugErneutAus(quelle, id)` | abrechnungen[sv] | bestehende Einzug-Retry (`abrechnung-einzug` / `einzug-retry.ts`) |
| `gebeProvisionFrei(quelle, id)` | Auszahlungen | release-Logik (`release-makler/werkstatt-provisionen`) |
| `zahleProvisionAus(quelle, id)` | Auszahlungen | **friert USt ein** (§4); **blockt wenn `ust_status_bekannt=false`** |
| `storniere(quelle, id, grund)` | alle | `storniert_am` + `storno_grund` je Tabelle |
| `setzePartnerUstStatus(partnerTyp, partnerId, istKleinunternehmer)` | makler/werkstatt/marketing | Schreibt das neue Feld (der „abfragen"-Punkt) |

## 6. UI / Placement

**Shared-Component `PartnerBillingPanel`** (`src/components/shared/finance/`), gebaut auf `shared/DataTable` + `primitives/*` + `StatusBadge` + Design-Tokens:
- Props: `{ partnerTyp?, partnerId? }` (kein Filter = alles).
- Summary-Cards getrennt nach Richtung (Forderungen: offen/fällig/erledigt-Summen; Auszahlungen: gehalten/freigegeben/erledigt-Summen).
- DataTable: referenz_nr, datum, partner (nur im Aggregat), netto, USt, brutto, `status_norm`-Badge, Aktionen.
- Filter (Monat/Status/Richtung), USt-offen-Warnbanner.

**Zentral — neuer Tab `/admin/finance/partner-abrechnungen`:** `PartnerBillingPanel` ohne Partner-Filter + Aggregat-Breakdown `GROUP BY partner_typ` (Summen je Rolle) + pro-Partner-Drill = „insgesamt **und** pro Partner". Tab in `FinanceHubTabs.tsx` ergänzen.

**Eingebettet pro Rolle (Aarons „direkt in der Verwaltung"):**
- `/admin/makler` → per-Makler-Panel (Makler hat aktuell keine `[id]`-Seite → entweder Detail-Seite anlegen oder Inline-Drawer). USt-Schalter hier.
- `/admin/werkstaetten` → analog Werkstatt. USt-Schalter hier.
- `/admin/sachverstaendige/[id]` → neuer **Abrechnungs-Tab** (heute nur Stammdaten + Verifizierung).
- Kanzlei → Admin-Kanzlei-Detail bzw. `/admin/finance/kanzlei` erweitern.
- Maik → Marketing-Section + USt-Schalter auf `marketing_partner`.

## 7. Migrationen (additiv — Supabase-Plugin `apply_migration`, Regel 2)

Alle additiv, keine Drops (Regel 3):
1. `ALTER TABLE makler ADD COLUMN ist_kleinunternehmer boolean;` + analog `werkstaetten`.
2. `CREATE TABLE marketing_partner (id uuid pk, name text, email text, ist_kleinunternehmer boolean, …)` + 1 Seed-Zeile „Maik" + `ALTER TABLE provisionen_maik ADD COLUMN marketing_partner_id uuid` (nullable FK, Default = Maik-Zeile).
3. Freeze-Spalten `ust_satz numeric, ust_betrag numeric, betrag_brutto numeric` (nullable) auf `makler_provisionen`, `makler_staffel_bonus`, `werkstatt_provisionen`, `werkstatt_staffel_bonus`, `provisionen_maik`.
4. `CREATE VIEW v_partner_billing …` (nach §3, `is_staff()`-gegated).

Ablauf je Migration: `apply_migration` → `list_migrations` (getrackte Version ablesen) → File `supabase/migrations/<V>_<name>.sql` exakt so benennen → `execute_sql`-READ verifizieren. Typen via `generate_typescript_types` nachziehen sobald Consumer die Spalten referenzieren.

## 8. Typen
`generate_typescript_types` nach den Migrationen; `database.types.ts` aktualisieren (View + neue Spalten + neue Tabelle).

## 9. RLS / Sicherheit
- `v_partner_billing` ist **admin-only** (Aaron-Entscheidung) — Gate auf Admin, **kein** Client-Grant an Partner- oder sonstige Rollen (dispatch/kb/kanzlei sehen es nicht). Exakte Gate-Funktion im Plan gegen die vorhandenen Admin-Helper wählen (analog zum bestehenden `/admin/finance`-Guard `profile.rolle === 'admin'`); Muster wie `v_claim_base` (DEFINER + `search_path`-Pin).
- Action-Modul nutzt Admin-Client server-seitig hinter Admin-Route-Guard (`profile.rolle === 'admin'`).
- Neue Migrationen dürfen den `audit_ungated_definer_views`-Check nicht verletzen (View ist gegated).

## 10. Tests
- **vitest:** `computeProvisionUst` (regelbesteuert/Kleinunternehmer/unbekannt; Cent-Rundung), `normalizeStatus` (alle Quellen × Status × fällig/erledigt).
- **View-SQL-Smoke:** Seed je Quelle/Richtung → assert normalisierter Output (Betrag/USt/Status/richtung), inkl. Ausschluss von `abrechnungen[kanzlei|marketing]`.
- **Action-Tests:** mark-paid / release / payout-**Freeze** (USt korrekt eingefroren) / **Block-bei-unbekanntem-USt-Status** / storno.
- **Gates:** `tsc --noEmit`, `npm run build` (Routen!), `check:knip`, `check:token-audit`, `check:component-set`, `vitest`.

## 11. Offene Punkte / Risiken / Koordination
- **Kanzlei-Doppelpfad:** System A (`abrechnungen[kanzlei]`) vs System B (`kanzlei_abrechnungen`). View nimmt B; falls A noch echte Zeilen produziert (crontab: `monats-abrechnungen` läuft), im Plan-Schritt prüfen ob A stillzulegen ist (Overlap mit P2).
- **Prod-Daten dünn:** `abrechnungen`/`kanzlei_abrechnungen`/`provisionen_maik` aktuell leer, nur makler(2)/werkstatt(6) Provisionen → Tests brauchen Seed-Daten.
- **`sv_onboarding_rechnungen` in Cent** — Umrechnung /100 in der View nicht vergessen.
- **Multi-Session-Koordination (12 aktive Sessions):** `kitta/werkstatt-unified-view` (Session 1069c2a2) fasst Werkstatt-Sichten an — meine Änderungen sind **admin-seitig** (`/admin/werkstaetten`, `werkstaetten.ist_kleinunternehmer`, Provisions-Freeze-Spalten). Additive Spalten kollidieren nicht mit deren Partner-Views, aber Migrationen auf `werkstaetten`/`werkstatt_provisionen` abstimmen. Koordinations-Memo unter `memory/`.
- **DB-Trigger:** Makler/Werkstatt-Provisionen entstehen per DB-Trigger. Die Freeze-Spalten sind nullable und werden erst beim Auszahlen gefüllt → Trigger bleiben unberührt.

## 12. Terminaler Schritt
Nach Aaron-Review dieser Spec → `writing-plans`-Skill für den Implementierungs-Plan (keine andere Skill dazwischen).
