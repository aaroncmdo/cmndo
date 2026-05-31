# Claimondo Datenmodell — North-Star (claims-zentrisch, post-`faelle`)

**Datum:** 31.05.2026 · **Status:** verbindliches Zielbild für CMM-49 (faelle-Removal). **Quelle der Wahrheit fürs Datenmodell.**
**Konsistent mit:** Master-Plan `docs/superpowers/plans/2026-05-31-cmm49-faelle-komplett-removal-master-plan.md` **§1 (gelockte Heimat-Entscheidungen)** — bei Konflikt gewinnt §1, hier nachziehen.

> **Warum dieses Doc:** Ohne ein committetes Zielbild plant jede Session gegen ein anderes Modell. Dies ist das EINE Bild, gegen das alle CMM-49-Phasen (A–G) bauen. **D1 (Aaron LOCKED):** `faelle` komplett weg, kein Bridge, `fall_id` stirbt mit (claim_id überall, Route-Switch).

---

## 1 · Das Prinzip

**Ein Schaden = ein `claims`-Aggregat.** Alles hängt an `claims.id` (= `claim_id`). `faelle` (die alte god-table, ~173 Spalten, ID = `fall_id`) wird **vollständig** abgelöst: ihre Spalten ziehen in `claims` (Kern) oder in typisierte Sub-Entitäten; die Tabelle + `fall_id` + der `fall_status`-Enum sterben.

Leitlinien:
- **`claims` = schlanker Aggregate-Root** (~80 Kern-Spalten, nicht 173). Domänen-Cluster wandern in Sub-Entitäten.
- **Typisierte Sub-Entitäten statt breiter Spalten-Cluster** (Parteien, Fahrzeug, Zahlung, VS-Korrespondenz, Gutachten, Kanzlei, Termine).
- **`text` + `CHECK` statt neuer Enums** — CHECK ist migrierbar (ADD/DROP value = einfacher ALTER), Enums sind starr (das `fall_status`-Enum ist genau deshalb ein Drop-Schmerz; `vs-kuerzt`/`klage` fehlten sogar drin).
- **Abgeleitete Phase statt gespeichertem Status-String** — `v_claim_phase` leitet die Phase aus den echten Zuständen ab; kein dupliziertes Phasen-Feld.
- **RLS claim-zentrisch** (`can_access_claim`), nicht fall-zentrisch.
- **en-Timestamps** (`created_at`/`updated_at`); etablierte de-Domänen-Timestamps (z.B. `abgeschlossen_am`) bleiben wo schon vorhanden.

---

## 2 · Aggregate-Root: `claims` (~80 Kern-Spalten)

Trägt nur, was wirklich claim-global + skalar ist:
- **Identität/Verknüpfung:** `id` (claim_id, SSoT), `claim_nummer`, `lead_id` (→ leads, Attribution), `vehicle_id` (→ vehicles).
- **Schaden (claim-global):** `schadentag`, `schadenzeit`, `schadenort_*` (adresse/plz/ort/lat/lng/kategorie), `schadenart`, `fall_typ`, `unfall_konstellation`, `hergang_kunde_text`, `hergang_sv_text`, `hat_personenschaden`/`hat_mietwagen`/`hat_nutzungsausfall`/`hat_sachschaden`, Polizei-/Skizze-Felder.
- **Lifecycle (2 Achsen — siehe §3):** `status`, `work_state`.
- **Assignment/Ownership:** `sv_id`, `kundenbetreuer_id`, `organisation_id`, `dispatch_id`.
- **Gegner-/Halter-Skalare** die KEINE eigene Partei-Zeile rechtfertigen: `gegner_anzahl_beteiligte`, `gegner_fahrzeugtyp`, `gegner_versicherung_anfrage_datum`, `ist_fahrzeughalter`, `kunde_lat/_lng` (Master-Plan §1).
- **Finanz-Skalare (claim-nativ):** `regulierungs_betrag`, `vs_ablehnungs_grund`, `lead_preis_*`, `guthaben_verrechnet_netto`, `sv_nachzahlung_netto`, `zahlungsweg` (Auszahlungs-Ziel), Business-Rest (ust_id/bank_name/firma_name/… additiv per §1, Tote vorher droppen).

**NICHT auf claims:** Partei-Identitäten (→ claim_parties), Fahrzeug-Detail (→ vehicles), Zahlungseingänge (→ claim_payments), VS-Brief-Verlauf (→ vs_korrespondenz), Kanzlei-/Regulierungs-Detail (→ kanzlei_faelle).

---

## 3 · Lifecycle — zwei orthogonale Achsen + EINE abgeleitete Phase

Das war historisch EIN überladenes `faelle.status` (19-Enum, mischte Dispatch + Bearbeitung + VS + Terminal). Aufgelöst in:

1. **`claims.status`** (text + CHECK, 12 Werte) = **Lifecycle/Terminal-Achse.** `NULL` bis ein Terminal-/VS-Event es setzt. Werte: `dispatch_done, in_bearbeitung` (Übergang, sterben am Ende) · `in_kommunikation_vs, reguliert, abgelehnt, an_externe_kanzlei_uebergeben, reguliert_vollstaendig, klage_rechtsstreit, verjaehrt, abgelehnt_final, termin_durchgefuehrt, storniert`.
2. **`claims.work_state`** (text + CHECK) = **Dispatch/Processing-Achse** (`dispatch_done`/`in_bearbeitung`). KB trägt sie; orthogonal zur Lifecycle-Achse.
3. **Sub-Entity-Status** = operative Granularität: `kanzlei_faelle.status` (versicherungskontakt/…) + `vs_reaktion_typ`/`anschlussschreiben_am`, `gutachten.status`, `auftraege.status`/`typ` (erstgutachten/nachbesichtigung/stellungnahme), `claim_payments.status` (erhalten).
4. **`v_claim_phase`** (faelle-frei: claims + kanzlei_faelle + leads + auftraege) leitet daraus **`main_phase`** {erfassung, begutachtung, regulierung, abschluss} + **`sub_phase`** (feingranular, mit rollen-Labels via `substateLabelForRolle`) ab. **Die EINE Phasen-Quelle** für alle Reader/UI.

**Invariante:** jeder gesetzte `claims.status`-Wert MUSS ein `v_claim_phase`-CASE-Zweig sein (sonst orphan → falsche Phase). Mapping faelle→claims: `src/lib/faelle/fall-status-claim-mapping.ts`.

**Stirbt mit faelle:** `fall_status` (19-Enum), `FALL_STATUS_TRANSITIONS`-Graph, `transitionFallStatus`' faelle.status-Write. (Details: T1.2-Handoff.)

---

## 4 · Parteien: `claim_parties` (rolle-typisiert)

Eine Zeile pro beteiligter Person/Rolle an `claim_id` — **absorbiert** die ~40 breiten faelle-Partei-Spalten (`gegner_*`, `halter_*`, `kunde_*`, Zeugen, Personenschaden-Personen).

- `rolle` (text + CHECK): `geschaedigter` (= Kunde/Mandant), `unfallgegner`, `halter`, `zeuge`, … (erweiterbar ohne Enum-Schmerz).
- Felder: name/vorname/nachname, anschrift, telefon, email, versicherung(_id)/versicherungsnummer, kennzeichen-Teile, geburtsdatum, anrede, …
- **Heimat-Mapping (§1):** Kunde-Identität → `geschaedigter` (CMM-63 SP-C1 ✅) · Gegner → `unfallgegner` (SP-C2 🔴 offen) · Halter → `halter` (SP-C3 🔴 Backlog).
- RLS-Anker: `claims`-Zugriff via Partei-Zugehörigkeit (`is_claim_user_party`).

---

## 5 · Fahrzeug: `vehicles` (SSoT) + Involvements + Vorschäden

- **`vehicles`** = Fahrzeug-SSoT (FIN-keyed), via `claims.vehicle_id`. Trägt kennzeichen_aktuell, hersteller, modell, baujahr, hsn/tsn, erstzulassung, lackfarbe, kilometerstand (Master-Plan §1, CMM-50/68 ✅).
- **`claim_vehicle_involvements`** = N:M claim↔vehicle (welches Fahrzeug in welchem Claim, Rolle).
- **`vehicle_vorschaeden`** + `vehicles`-Felder + `claims`-Flags = Vorschäden/Cardentity (CMM-64).
- Views COALESCEn `vehicles.*` über die alten `faelle.fahrzeug_*` (Cutover-Phase), bis faelle stirbt.

---

## 6 · Sub-Entitäten (alle an `claim_id`)

| Tabelle | Zweck | Kardinalität |
|---|---|---|
| `claim_parties` | Parteien (§4) | 1:N |
| `claim_vehicle_involvements` | Fahrzeug-Beteiligung | 1:N |
| `vehicle_vorschaeden` | Vorschäden/Cardentity | 1:N (pro vehicle) |
| `claim_payments` | Zahlungseingänge/Auszahlungen (status=erhalten, betrag, weg) | 1:N (aktuelle Row) |
| `claim_mietwagen` | Mietwagen-Tracking | 1:1/1:N |
| `vs_korrespondenz` | VS-Brief-Verlauf (datum, naechste_frist, reaktion) | 1:N |
| `repairs` / `werkstaetten` | Reparatur/Werkstatt | 1:N |
| `gutachten` (+ positionen/fotos) | Gutachten + OCR + QC-Status | 1:1/1:N |
| `kanzlei_faelle` | Kanzlei-/VS-Regulierung (status, vs_reaktion_typ, anschlussschreiben_am, eskalation_*, lexdrive_case_id, mandatsnummer) | 1:1 |
| `gutachter_termine` + `auftraege` | Begutachtung/Termine/Nachbesichtigung (typ, status, besichtigungsort) | 1:N |

---

## 7 · Views (claims-nativ, `FROM claims`)

Nach Master-Plan-Phase B joinen die Views **kein** `faelle` mehr:
- **`v_claim_full`** — Detail-Aggregat (claims + Sub-Entitäten als jsonb_agg + main/sub_phase). Einziger Read-Einstieg via `getClaimForRole` (rollen-Whitelist).
- **`v_claim_listing`** — schlanke Liste/Kanban (main_phase/sub_phase, NICHT der alte `phase`-10-Code).
- **`v_claim_phase`** — die Phasen-Ableitung (§3).
- **`v_claim_sv`** — SV-Sicht (claims.sv_id-nativ, CMM-60).
- **`v_claim_timeline`** — Timeline (faelle-frei, Phase 4.1 ✅).
- Sterben: `faelle_kunde_view`, `faelle_sv_view`, `v_faelle_mit_aktuellem_termin` (→ claims-nativ migriert, dann umbenannt/abgelöst).

---

## 8 · Was stirbt (D1)

`faelle` (Tabelle) · `fall_id` (→ `claim_id` überall + `/faelle/[id]`→claim-id-Route, 308) · `fall_status` (Enum) + `FALL_STATUS_TRANSITIONS` · `can_access_fall` (→ `can_access_claim`) · alle faelle-joinenden Views/Funktionen/Crons/Policies · der `faelle`-Block in `database.types.ts`. **DoD:** `0× .from('faelle')` in `src/`, `0× faelle` in DB-Objekten.

---

## 9 · Verhältnis zu den Plänen

- **Master-Plan** (`…cmm49-faelle-komplett-removal-master-plan.md`) = die Reihenfolge (Phasen A–G) + Ticket-Mapping. §1 = die gelockten Heimaten (deckungsgleich mit diesem Modell).
- **§A7-Spec** (`…AAR-939-A7-fall_status-claims-quelle-spec.md`) = das Lifecycle/fall_status-Detail (§3 hier).
- **T1.2-Handoff** (`docs/31.05.2026/T1.2-claims-status-cutover-handoff.md`) = der laufende Lifecycle-Cutover (b′/c/d/b″).
